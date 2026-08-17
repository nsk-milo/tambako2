import { mkdir, writeFile, unlink, readdir, rm, stat } from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import path from "path";

// Root directory (under Next.js `public/`) that all uploads are written to.
// Files written here are served publicly at `/uploads/...`.
const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOADS_ROOT = path.join(PUBLIC_DIR, "uploads");

// Chunked uploads land here first — one file per chunk — and are concatenated
// into `public/uploads` only once every chunk has arrived. Deliberately outside
// `public/` so a half-finished upload is never publicly reachable.
const CHUNK_TMP_ROOT = path.join(process.cwd(), ".uploads-tmp");

// Upload ids come from the client and are used as a directory name, so they are
// held to this shape: no separators, no dots, nothing that can traverse.
const UPLOAD_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// Abandoned uploads (tab closed mid-transfer) would otherwise sit on disk
// forever. Anything older than this is fair game to delete.
const STALE_CHUNK_AGE_MS = 24 * 60 * 60 * 1000;

function chunkDir(uploadId: string) {
  if (!UPLOAD_ID_PATTERN.test(uploadId)) {
    throw new Error("Invalid upload id");
  }
  return path.join(CHUNK_TMP_ROOT, uploadId);
}

function sanitizeSegment(segment: string) {
  // Strip leading/trailing slashes and collapse any `..` traversal attempts.
  return segment
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
}

function toPublicUrl(relativePath: string) {
  return `/${["uploads", relativePath].filter(Boolean).join("/")}`.replace(/\\/g, "/");
}

export class LocalStorageService {
  async uploadFile(
    file: File,
    fileName: string,
    _mimeType: string,
    folderPath?: string,
  ): Promise<string> {
    try {
      const folder = folderPath ? sanitizeSegment(folderPath) : "";
      const safeFileName = sanitizeSegment(fileName);
      const relativePath = [folder, safeFileName].filter(Boolean).join("/");

      const destination = path.join(UPLOADS_ROOT, relativePath);
      const buffer = Buffer.from(await file.arrayBuffer());

      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, buffer);

      // Return the public URL Next.js serves the file from.
      return toPublicUrl(relativePath);
    } catch (error) {
      console.error("Error writing upload to public/uploads:", error);
      throw new Error("Failed to save uploaded file");
    }
  }

  /**
   * Persist one slice of a chunked upload.
   *
   * Each chunk is written to its own file named after its index, so a chunk
   * that gets retried overwrites its previous attempt instead of appending a
   * duplicate into the middle of the media file.
   */
  async saveChunk(uploadId: string, chunkIndex: number, chunk: Blob): Promise<void> {
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      throw new Error("Invalid chunk index");
    }

    const directory = chunkDir(uploadId);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, `${chunkIndex}.part`),
      Buffer.from(await chunk.arrayBuffer()),
    );
  }

  /**
   * Concatenate a completed chunked upload into `public/uploads` and return the
   * public URL, exactly as `uploadFile` would have.
   *
   * The chunks are streamed one after another rather than buffered, so peak
   * memory stays at one chunk regardless of how large the video is.
   */
  async assembleChunks(
    uploadId: string,
    totalChunks: number,
    fileName: string,
    folderPath?: string,
  ): Promise<string> {
    const directory = chunkDir(uploadId);

    if (!Number.isInteger(totalChunks) || totalChunks < 0) {
      throw new Error("Invalid chunk count");
    }

    const folder = folderPath ? sanitizeSegment(folderPath) : "";
    const safeFileName = sanitizeSegment(fileName);
    const relativePath = [folder, safeFileName].filter(Boolean).join("/");
    const destination = path.join(UPLOADS_ROOT, relativePath);

    await mkdir(path.dirname(destination), { recursive: true });

    const output = createWriteStream(destination);
    try {
      for (let index = 0; index < totalChunks; index += 1) {
        const part = path.join(directory, `${index}.part`);
        try {
          await stat(part);
        } catch {
          throw new Error(`Upload is incomplete — chunk ${index} is missing`);
        }
        // `end: false` keeps the destination open across chunks; it is closed
        // once, below, after the last one.
        await pipeline(createReadStream(part), output, { end: false });
      }

      await new Promise<void>((resolve, reject) => {
        output.on("finish", () => resolve());
        output.on("error", reject);
        output.end();
      });
    } catch (error) {
      output.destroy();
      // Never leave a truncated video behind for the player to choke on.
      await unlink(destination).catch(() => {});
      throw error;
    } finally {
      await this.discardChunks(uploadId);
    }

    return toPublicUrl(relativePath);
  }

  /** Drop every chunk of an upload, finished or abandoned. */
  async discardChunks(uploadId: string): Promise<void> {
    await rm(chunkDir(uploadId), { recursive: true, force: true }).catch(() => {});
  }

  /** Sweep chunk directories left behind by uploads that never finished. */
  async purgeStaleChunks(): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(CHUNK_TMP_ROOT);
    } catch {
      return; // Nothing has been chunk-uploaded yet.
    }

    const cutoff = Date.now() - STALE_CHUNK_AGE_MS;
    await Promise.all(
      entries.map(async (entry) => {
        const directory = path.join(CHUNK_TMP_ROOT, entry);
        try {
          const info = await stat(directory);
          if (info.mtimeMs < cutoff) {
            await rm(directory, { recursive: true, force: true });
          }
        } catch {
          // Concurrent finalize already removed it — nothing to do.
        }
      }),
    );
  }

  async deleteFile(fileUrlOrPath: string): Promise<void> {
    if (!fileUrlOrPath) return;

    // Only local uploads paths can be deleted. Anything else (e.g. legacy
    // remote URLs on old records) is ignored rather than treated as an error.
    let relativePath: string | null = null;

    try {
      const pathname = fileUrlOrPath.startsWith("http")
        ? new URL(fileUrlOrPath).pathname
        : fileUrlOrPath;

      const match = pathname.match(/\/?uploads\/(.+)$/);
      relativePath = match ? sanitizeSegment(match[1]) : null;
    } catch {
      relativePath = null;
    }

    if (!relativePath) return;

    try {
      await unlink(path.join(UPLOADS_ROOT, relativePath));
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return;
      console.error("Error deleting file from public/uploads:", error);
      throw new Error("Failed to delete uploaded file");
    }
  }
}

export const localStorageService = new LocalStorageService();

// Backwards-compatible alias so existing imports keep working.
export const firebaseStorageService = localStorageService;

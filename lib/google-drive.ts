import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";

// Root directory (under Next.js `public/`) that all uploads are written to.
// Files written here are served publicly at `/uploads/...`.
const PUBLIC_DIR = path.join(process.cwd(), "public");
const UPLOADS_ROOT = path.join(PUBLIC_DIR, "uploads");

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

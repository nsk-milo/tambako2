import axios from "axios";
import { installAuthInterceptor } from "@/lib/http";

// The uploads run outside the components that already trigger this on mount, so
// make sure the Bearer token is attached even if this module is used first.
installAuthInterceptor();

export type UploadKind = "media" | "thumbnail" | "hls-playlist" | "hls-segment";

export type UploadEntry<K extends string = string> = {
  key: K;
  file: File;
  kind: UploadKind;
};

// Posting a whole video in one request gets a 413 from whatever proxy or CDN
// fronts the app, long before Next.js sees it. Sending it a few megabytes at a
// time stays under every such limit and keeps server memory flat.
const DEFAULT_CHUNK_BYTES =
  Math.max(1, Number(process.env.NEXT_PUBLIC_UPLOAD_CHUNK_MB) || 4) * 1024 * 1024;

// If even this is rejected, the limit in front of the app is too low to be
// worked around from the client and has to be raised.
const MIN_CHUNK_BYTES = 256 * 1024;

const MAX_ATTEMPTS_PER_CHUNK = 3;

function newUploadId() {
  const raw = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a single file in chunks and return the public URL it was stored at.
 *
 * `onChunk` is called with the number of bytes newly confirmed by the server,
 * which lets callers aggregate progress across several files.
 */
export async function uploadInChunks(
  file: File,
  kind: UploadKind,
  onChunk?: (bytesUploaded: number) => void,
): Promise<string> {
  const uploadId = newUploadId();
  let chunkBytes = DEFAULT_CHUNK_BYTES;
  let offset = 0;
  let index = 0;

  while (offset < file.size) {
    const end = Math.min(offset + chunkBytes, file.size);
    const slice = file.slice(offset, end);

    const body = new FormData();
    body.append("uploadId", uploadId);
    body.append("chunkIndex", String(index));
    body.append("chunk", slice);

    let sent = false;
    let attempt = 0;
    while (!sent) {
      try {
        await axios.post("/api/uploads/chunk", body);
        sent = true;
      } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;

        // A 413 never comes from the route handler — it is the proxy in front
        // of the app refusing the body size. Sending the same bytes in a
        // smaller slice is the only thing that can help.
        if (status === 413) {
          if (chunkBytes <= MIN_CHUNK_BYTES) {
            throw new Error(
              "The server rejected even a 256KB upload chunk. The request size " +
                "limit on the proxy in front of the site needs to be raised.",
            );
          }
          chunkBytes = Math.max(MIN_CHUNK_BYTES, Math.floor(chunkBytes / 2));
          break;
        }

        // A dropped connection part-way through a long upload is normal; the
        // chunk is addressed by index, so re-sending it is safe. Anything the
        // server answered deliberately is not worth retrying.
        attempt += 1;
        if (status !== undefined || attempt >= MAX_ATTEMPTS_PER_CHUNK) throw error;
        await delay(attempt * 1000);
      }
    }

    // Left the retry loop after shrinking: rebuild the slice at the new size
    // from the same offset rather than advancing past bytes never accepted.
    if (!sent) continue;

    offset = end;
    index += 1;
    onChunk?.(slice.size);
  }

  const { data } = await axios.post<{ url: string }>("/api/uploads/complete", {
    uploadId,
    totalChunks: index,
    fileName: file.name,
    kind,
  });

  return data.url;
}

/**
 * Upload several files in sequence, reporting overall progress as a 0–1
 * fraction of the total bytes plus the name of the file in flight.
 */
export async function uploadAll<K extends string>(
  entries: UploadEntry<K>[],
  onProgress?: (fraction: number, currentFileName: string) => void,
): Promise<Record<K, string>> {
  const totalBytes = entries.reduce((sum, entry) => sum + entry.file.size, 0) || 1;
  const urls = {} as Record<K, string>;
  let uploadedBytes = 0;

  for (const entry of entries) {
    onProgress?.(uploadedBytes / totalBytes, entry.file.name);

    urls[entry.key] = await uploadInChunks(entry.file, entry.kind, (bytes) => {
      uploadedBytes += bytes;
      onProgress?.(Math.min(uploadedBytes / totalBytes, 1), entry.file.name);
    });
  }

  onProgress?.(1, "");
  return urls;
}

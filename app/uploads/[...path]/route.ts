import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

/**
 * Serves files out of `public/uploads`.
 *
 * Next.js reads the contents of `public/` once, when the server boots, and only
 * serves the files it saw then. Uploads are written at runtime, so without this
 * route a freshly uploaded file 404s until the server is restarted — the upload
 * itself succeeds, but the media and its thumbnail are dead links.
 *
 * Files that already existed at boot are still served by the static handler,
 * which runs before app routes; this only picks up what it misses.
 */

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".ts": "video/MP2T",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

type UploadsRouteContext = { params: Promise<{ path: string[] }> };

// Resolve the request path inside the uploads root, refusing anything that
// tries to climb out of it.
function resolveUploadPath(segments: string[]): string | null {
  const relativePath = segments
    .map((segment) => decodeURIComponent(segment))
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");

  if (!relativePath) return null;

  const absolutePath = path.resolve(UPLOADS_ROOT, relativePath);
  if (absolutePath !== UPLOADS_ROOT && !absolutePath.startsWith(UPLOADS_ROOT + path.sep)) {
    return null;
  }

  return absolutePath;
}

// `bytes=start-end`, with either end open. Returns null when the header is
// absent or unusable, in which case the whole file is sent.
function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;

  if (rawStart) {
    start = parseInt(rawStart, 10);
    end = rawEnd ? parseInt(rawEnd, 10) : size - 1;
  } else {
    // Suffix range: the last N bytes.
    const suffixLength = parseInt(rawEnd, 10);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  end = Math.min(end, size - 1);

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
    return { unsatisfiable: true as const };
  }

  return { start, end, unsatisfiable: false as const };
}

async function statFile(segments: string[]) {
  const absolutePath = resolveUploadPath(segments);
  if (!absolutePath) return null;

  try {
    const stats = await stat(absolutePath);
    if (!stats.isFile()) return null;
    return { absolutePath, size: stats.size };
  } catch {
    return null;
  }
}

function baseHeaders(absolutePath: string) {
  const contentType =
    CONTENT_TYPES[path.extname(absolutePath).toLowerCase()] || "application/octet-stream";

  return {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    // Upload names carry a unique timestamp suffix, so a file never changes.
    "Cache-Control": "public, max-age=31536000, immutable",
  };
}

export async function GET(request: NextRequest, context: UploadsRouteContext) {
  const { path: segments } = await context.params;
  const file = await statFile(segments);

  if (!file) {
    return new NextResponse("Not found", { status: 404 });
  }

  const headers = baseHeaders(file.absolutePath);
  const range = parseRange(request.headers.get("range"), file.size);

  if (range?.unsatisfiable) {
    return new NextResponse("Range not satisfiable", {
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${file.size}` },
    });
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : file.size - 1;
  const stream = Readable.toWeb(
    createReadStream(file.absolutePath, { start, end }),
  ) as unknown as ReadableStream<Uint8Array>;

  return new NextResponse(stream, {
    status: range ? 206 : 200,
    headers: {
      ...headers,
      "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${file.size}` } : {}),
    },
  });
}

// Players probe with HEAD before streaming; answer with the same metadata.
export async function HEAD(request: NextRequest, context: UploadsRouteContext) {
  const { path: segments } = await context.params;
  const file = await statFile(segments);

  if (!file) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(null, {
    status: 200,
    headers: { ...baseHeaders(file.absolutePath), "Content-Length": String(file.size) },
  });
}

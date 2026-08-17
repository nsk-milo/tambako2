import { NextResponse } from "next/server";
import path from "path";
import { getUserDataFromToken } from "@/lib/auth";
import { firebaseStorageService } from "@/lib/google-drive";

/**
 * Finalises a chunked upload: concatenates the chunks posted to
 * `/api/uploads/chunk` into `public/uploads` and hands back the public URL,
 * which the client then submits to `/api/media/all` in place of the file.
 */

type UploadKind = "media" | "thumbnail" | "hls-playlist" | "hls-segment";

const UPLOAD_KINDS: UploadKind[] = ["media", "thumbnail", "hls-playlist", "hls-segment"];

/**
 * The destination folder is derived from a fixed set of kinds rather than taken
 * from the request, so a caller can never steer a write outside `public/uploads`.
 */
function folderForKind(kind: UploadKind) {
  const prefix = process.env.UPLOADS_PREFIX || "media";
  if (kind === "thumbnail") return `${prefix}/thumbnails`;
  if (kind === "hls-playlist" || kind === "hls-segment") return `${prefix}/hls`;
  return prefix;
}

function storedNameFor(kind: UploadKind, originalName: string) {
  const baseName = path.basename(originalName || "upload");
  const extension = path.extname(baseName);

  // HLS playlists reference their segments by filename, so segments have to
  // keep the name ffmpeg gave them. Everything else gets a unique name to avoid
  // one upload overwriting another.
  if (kind === "hls-segment") {
    return baseName.replace(/[^A-Za-z0-9._-]/g, "_");
  }

  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
}

export async function POST(request: Request) {
  const user = await getUserDataFromToken();
  if (user?.role !== "ContentCreator" && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorised to upload" }, { status: 401 });
  }

  try {
    const { uploadId, totalChunks, fileName, kind } = await request.json();

    if (typeof uploadId !== "string" || typeof fileName !== "string") {
      return NextResponse.json({ error: "Missing upload id or file name" }, { status: 400 });
    }
    if (!UPLOAD_KINDS.includes(kind)) {
      return NextResponse.json({ error: `Unknown upload kind '${kind}'` }, { status: 400 });
    }

    const url = await firebaseStorageService.assembleChunks(
      uploadId,
      Number(totalChunks),
      storedNameFor(kind, fileName),
      folderForKind(kind),
    );

    // Cheap to run here (finalising happens once per file) and it keeps the
    // disk clear of uploads that were abandoned part-way through.
    await firebaseStorageService.purgeStaleChunks();

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Upload finalise error:", error);
    const message = error instanceof Error ? error.message : "Failed to finalise upload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

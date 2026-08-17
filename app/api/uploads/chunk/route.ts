import { NextResponse } from "next/server";
import { getUserDataFromToken } from "@/lib/auth";
import { firebaseStorageService } from "@/lib/google-drive";

/**
 * Receives one slice of a chunked upload.
 *
 * Video files are far larger than the body limit of any proxy or CDN sitting in
 * front of this app (which answers with a bare 413 before the request ever
 * reaches Next.js). Rather than trying to raise every such limit, the client
 * splits the file and posts it a few megabytes at a time through here; the
 * pieces are stitched back together by `/api/uploads/complete`.
 */
export async function POST(request: Request) {
  const user = await getUserDataFromToken();
  if (user?.role !== "ContentCreator" && user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Not authorised to upload" }, { status: 401 });
  }

  try {
    const data = await request.formData();
    const uploadId = data.get("uploadId");
    const chunkIndex = Number(data.get("chunkIndex"));
    const chunk = data.get("chunk");

    if (typeof uploadId !== "string" || !(chunk instanceof Blob)) {
      return NextResponse.json({ error: "Missing upload id or chunk" }, { status: 400 });
    }

    await firebaseStorageService.saveChunk(uploadId, chunkIndex, chunk);

    return NextResponse.json({ received: chunkIndex });
  } catch (error) {
    console.error("Chunk upload error:", error);
    const message = error instanceof Error ? error.message : "Failed to store chunk";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

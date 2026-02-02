import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import { getUserDataFromToken } from "@/lib/auth";

const prisma = new PrismaClient();

type TrackPayload = {
  mediaId: string;
  progressSeconds?: number;
  completed?: boolean;
};

export async function POST(request: Request) {
  try {
    const user = await getUserDataFromToken();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const payload = (await request.json()) as TrackPayload;
    const mediaId = Number(payload.mediaId);

    if (!payload.mediaId || Number.isNaN(mediaId)) {
      return NextResponse.json({ error: "mediaId is required." }, { status: 400 });
    }

    const progressSeconds = Number(payload.progressSeconds ?? 0);
    const completed = Boolean(payload.completed ?? false);

    const existing = await prisma.watch_history.findFirst({
      where: {
        user_id: BigInt(user.userId),
        media_id: BigInt(mediaId),
      },
      orderBy: { watched_at: "desc" },
    });

    if (!existing || progressSeconds >= Number(existing.progress ?? 0)) {
      await prisma.watch_history.create({
        data: {
          user_id: BigInt(user.userId),
          media_id: BigInt(mediaId),
          progress: Math.max(progressSeconds, 0),
          completed,
        },
      });
    }

    return NextResponse.json({ status: "tracked" });
  } catch (error) {
    console.error("Track analytics error:", error);
    return NextResponse.json({ error: "Failed to track view." }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
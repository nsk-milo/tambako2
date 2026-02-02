import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";
import { getUserDataFromToken } from "@/lib/auth";

const prisma = new PrismaClient();

export async function GET(request: Request, context: any) {
  try {
        const mediaId = await context?.params?.mediaId;


    console.log("Checking favorite status for media ID:", mediaId);

    const user = await getUserDataFromToken();
    if (!user?.userId) {
      return NextResponse.json({ isFavorite: false });
    }

    if (!mediaId) {
      return NextResponse.json(
        { error: "mediaId is required." },
        { status: 400 }
      );
    }

    const existingFavorite = await prisma.favorites.findUnique({
      where: {
        user_id_media_id: {
          user_id: BigInt(user.userId),
          media_id: BigInt(mediaId),
        },
      },
    });

    return NextResponse.json({ isFavorite: !!existingFavorite });
  } catch (error) {
    console.error("Error checking favorite status:", error);
    return NextResponse.json(
      { error: "Failed to check favorite status." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

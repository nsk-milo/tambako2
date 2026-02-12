import { getUserDataFromToken } from "@/lib/auth"
import { Prisma, PrismaClient } from "@/lib/generated/prisma"
import { NextRequest, NextResponse } from "next/server"
import { unlink } from "fs/promises";
import path from "path";

const prisma = new PrismaClient()

type MediaRouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: MediaRouteContext) {

  try {
   
    const { id: awaitedParams } = await context.params;
    console.log("Fetching media details for ID:", awaitedParams);
    const user = await getUserDataFromToken()

    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 })
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeSubscription = await prisma.user_subscriptions.findFirst({
      where: {
        user_id: BigInt(user.userId),
        is_active: true,
        end_date: {
          gte: today,
        },
      },
      orderBy: {
        end_date: "desc",
      },
    })

    if (!activeSubscription) {
      return NextResponse.json({ error: "Active subscription required." }, { status: 403 })
    }

    const media = await prisma.media.findFirst({
      where: { media_id: BigInt(awaitedParams) },
      include: {
        categories: true,
        media_genres: {
          include: {
            genres: true,
          },
        },
      },
    })

    if (!media) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 })
    }

    const videoSources = media.media_location
      ? [
          { quality: "auto", url: media.media_location },
          { quality: "1080p", url: media.media_location.replace(/\.mp4$/i, "-1080p.mp4") },
          { quality: "720p", url: media.media_location.replace(/\.mp4$/i, "-720p.mp4") },
          { quality: "480p", url: media.media_location.replace(/\.mp4$/i, "-480p.mp4") },
          { quality: "360p", url: media.media_location.replace(/\.mp4$/i, "-360p.mp4") },
        ]
      : [];

    const formattedMedia = {
      id: media.media_id.toString(),
      title: media.title,
      type: media.categories.name,
      year: media.release_date ? new Date(media.release_date).getFullYear().toString() : "N/A",
      rating: media.rating ? new Prisma.Decimal(media.rating).toFixed(1) : "N/A",
      image: media.thumbnail_location || "/placeholder.svg",
      genre: media.media_genres.map((mg) => mg.genres.name).join(", "),
      description: media.description,
      duration: `${media.duration} min`,
      videoUrl: media.media_location,
      videoSources,
      hlsUrl: media.media_location?.replace(/\.mp4$/i, ".m3u8"),
    }

    return NextResponse.json(formattedMedia)
  } catch (error) {
    console.error("Error fetching media details:", error)
    return NextResponse.json({ error: "Failed to fetch media details." }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function DELETE(req: NextRequest, context: MediaRouteContext) {
  try {
    const user = await getUserDataFromToken();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id } = await context.params;
    const mediaId = parseInt(id, 10);
    if (isNaN(mediaId)) {
      return NextResponse.json({ error: "Invalid media ID" }, { status: 400 });
    }

    // 1. Find the media record to get file paths
    const mediaItem = await prisma.media.findFirst({
      where: { media_id: mediaId },
      select: {
        media_id: true,
        provider_id: true,
        media_location: true,
        thumbnail_location: true,
      },
    });

    if (!mediaItem) {
      // If it's already deleted, we can consider this a success.
      return NextResponse.json({ message: "Media already deleted" }, { status: 200 });
    }

    const isAdmin = user.role === "ADMIN";
    const isOwner =
      user.role === "ContentCreator" &&
      mediaItem.provider_id !== null &&
      mediaItem.provider_id.toString() === user.userId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: "You do not have permission to withdraw this content." },
        { status: 403 }
      );
    }

    // 2. Delete physical files from the server
    const { media_location, thumbnail_location } = mediaItem;

    if (media_location) {
      const safeMediaLocation = media_location.replace(/^\/+/, "");
      const mediaPath = path.join(process.cwd(), "public", safeMediaLocation);
      try {
        await unlink(mediaPath);
      } catch (fileError) {
        // Log error but don't block DB deletion if file is already gone
        if ((fileError as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`Failed to delete media file: ${mediaPath}`, fileError);
        }
      }
    }

    if (thumbnail_location) {
      const safeThumbnailLocation = thumbnail_location.replace(/^\/+/, "");
      const thumbnailPath = path.join(process.cwd(), "public", safeThumbnailLocation);
      try {
        await unlink(thumbnailPath);
      } catch (fileError) {
        if ((fileError as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`Failed to delete thumbnail file: ${thumbnailPath}`, fileError);
        }
      }
    }

    // 3. Delete the media record from the database
    // Prisma's cascading delete will handle related entries in media_genres, episodes, etc.
    await prisma.media.delete({
      where: { media_id: mediaId },
    });

    return NextResponse.json({ message: "Media deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error("Error deleting media item:", error);
    return NextResponse.json({ error: "Failed to delete media item" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}



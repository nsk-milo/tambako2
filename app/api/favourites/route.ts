import { NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@/lib/generated/prisma";
import { getUserDataFromToken } from "@/lib/auth";

const prisma = new PrismaClient();

/**
 * POST /api/favorites
 * Toggles a media item as a favorite for the logged-in user.
 * Expects a `mediaId` in the JSON body.
 */
export async function POST(request: Request) {
  try {
    const user = await getUserDataFromToken();
    if (!user || !user.userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const { mediaId } = await request.json();
    if (!mediaId) {
      return NextResponse.json(
        { error: "mediaId is required." },
        { status: 400 }
      );
    }

    const mediaIdBigInt = BigInt(mediaId);
    const userIdBigInt = BigInt(user.userId);

    const favoriteWhere = {
      user_id_media_id: {
        user_id: userIdBigInt,
        media_id: mediaIdBigInt,
      },
    };

    const existingFavorite = await prisma.favorites.findUnique({
      where: favoriteWhere,
    });

    if (existingFavorite) {
      // It's already a favorite, so remove it
      await prisma.favorites.delete({ where: favoriteWhere });
      return NextResponse.json({
        message: "Removed from favorites.",
        isFavorite: false,
      });
    } else {
      // It's not a favorite, so add it
      await prisma.favorites.create({
        data: {
          user_id: userIdBigInt,
          media_id: mediaIdBigInt,
        },
      });
      return NextResponse.json(
        { message: "Added to favorites.", isFavorite: true },
        { status: 201 }
      );
    }
  } catch (error) {
    console.error("Error toggling favorite:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return NextResponse.json({ error: "Invalid mediaId." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to toggle favorite status." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * GET /api/favorites
 * Retrieves all favorite media items for the logged-in user.
 */
export async function GET(request: Request) {
  try {
    const user = await getUserDataFromToken();
    if (!user || !user.userId) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const userIdBigInt = BigInt(user.userId);

    const favorites = await prisma.favorites.findMany({
      where: { user_id: userIdBigInt },
      include: {
        media: {
          include: {
            categories: true,
            media_genres: { include: { genres: true } },
          },
        },
      },
      orderBy: { added_at: "desc" },
    });

    const formattedFavorites = favorites
      .map(({ media }) =>
        media
          ? {
              id: media.media_id.toString(),
              title: media.title,
              type: media.categories.name as "movie" | "series" | "music",
              year: media.release_date
                ? new Date(media.release_date).getFullYear().toString()
                : "N/A",
              rating: media.rating
                ? new Prisma.Decimal(media.rating).toFixed(1)
                : "N/A",
              image: media.thumbnail_location || "/placeholder.svg",
              genre: media.media_genres.map((mg) => mg.genres.name).join(", "),
            }
          : null
      )
      .filter(Boolean);

    return NextResponse.json(formattedFavorites);
  } catch (error) {
    console.error("Error fetching favorites:", error);
    return NextResponse.json(
      { error: "Failed to fetch favorites." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

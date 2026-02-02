import { NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

const mediaWithRelations = Prisma.validator<Prisma.mediaDefaultArgs>()({
  include: {
    categories: true,
    media_genres: {
      include: {
        genres: true,
      },
    },
  },
});

type MediaWithRelations = Prisma.mediaGetPayload<typeof mediaWithRelations>;

export async function GET() {
  try {
    const allMedia = await prisma.media.findMany({
      include: {
        categories: true, // to get category name
        media_genres: {
          include: {
            genres: true, // to get genre name
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
      where: {
        categories: {
          name: {
            in: ["series"],
          },
        },
      },
    });

    console.log("Fetched media count:", allMedia.length);
    // Helper to format data for the MediaCard component
    const formatMedia = (media: MediaWithRelations) => ({
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
    });

    const series = allMedia
      .filter((m) => m.categories.name === "series")
      .map(formatMedia);

    console.log(` series fetched ${series}`);

    return NextResponse.json({ series });
  } catch (error) {
    console.error("Error fetching all media:", error);
    return NextResponse.json(
      { error: "Failed to fetch media" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

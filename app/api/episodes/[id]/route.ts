import { NextResponse } from "next/server";

import { PrismaClient } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

interface Episode {
  id: string;
  title: string;
  episode: number;
  season: number;
  duration: string;
  description: string;
  thumbnail: string;
}

export async function GET(request: Request, context: any) {
  const awaitedParams = await context!.params!.id;
  console.log("Fetching episode details for ID:", awaitedParams);

  try {
    const episode = await prisma.episodes.findFirst({
      where: {
        media_id: BigInt(awaitedParams),
      },
      select: {
        series_id: true,
      },
    });

    if (!episode) {
      return NextResponse.json([]);
    }

    const series = await prisma.series.findFirst({
      where: { series_id: episode.series_id! },
      include: {
        episodes: {
          select: {
            episode_id: true,
            title: true,
            episode_number: true,
            duration: true,
            description: true,
            seasons: {
              select: {
                season_number: true,
              },
            },
            media: {
              select: {
                media_id: true,
                title: true,
                thumbnail_location: true,
              },
            },
          },
          orderBy: {
            episode_number: "asc",
          },
        },
      },
    });

    console.log("Fetched series:", series);

    if (!series) {
      return NextResponse.json([]);
    }

    const eps: Episode[] = series.episodes.map((ep) => {
      return {
        id: ep.episode_id!.toString(),
        title: ep.title!,
        episode: ep.episode_number!,
        season: ep.seasons ? ep.seasons.season_number : 0,
        duration: `${ep.duration} min`,
        description: ep.description!,
        mediaId: ep.media.media_id!.toString(),
        thumbnail: ep.media
          ? ep.media.thumbnail_location || "/placeholder.svg"
          : "/placeholder.svg",
      };
    });

    console.log("Fetched episode count:", eps);

    return NextResponse.json(eps);
  } catch (error) {
    console.error("Error fetching episode details:", error);
    return NextResponse.json(
      { error: "Failed to fetch episode details." },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

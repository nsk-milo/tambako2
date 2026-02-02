import { NextRequest, NextResponse } from "next/server";

import { PrismaClient } from "@/lib/generated/prisma";
import { MediaItem } from "@/lib/mytypes";

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.toLowerCase().trim();

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter is required" },
      { status: 400 }
    );
  }
  
 
  try {
    // Query the Media table using Prisma
    const media = await prisma.media.findFirst({
      where: {
        title: {
          contains: query,
          mode: "insensitive", // Perform case-insensitive search
        },
      },
      // Add more fields to select based on your Media model
      select: { 
        media_id: true, 
        title: true, 
        thumbnail_location: true, 
        rating: true, 
        release_date: true, 
        media_genres: { select: { genres: true } }, 
        categories: { 
          select: { 
            name: true, 
          }, 
        }, 
      }, 
    }); 
 
    if (!media) throw new Error("No media found");

    const results: MediaItem[] = [media].map((item: any) => ({
      id: item.media_id.toString(),
      title: item.title,
      poster_path: item.thumbnail_location || "",
      type: item.categories?.name as "movie" | "series" | "music",
      image: item.thumbnail_location || "",
      rating: item.rating,
      year:item.release_date
        ? new Date(item.release_date).getFullYear().toString()
        : "",
        genre: item.media_genres && item.media_genres.length > 0
        ? item.media_genres[0].genres.name
        : undefined,


    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { message: "An internal server error occurred" },
      { status: 500 }
    );
  }
}

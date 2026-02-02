import { NextResponse } from "next/server";
import { PrismaClient } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const ss = await prisma.seasons.findMany({
      select: {
        season_id: true,
        season_number: true,
      },
      orderBy: {
        season_number: "asc",
      },
    });
    // Convert BigInt to string for JSON serialization
    const seasons = ss.map((season) => ({
      ...season,
      season_id: season.season_id.toString(),
    }));

    console.log("Fetched seasons count:", seasons);
    return NextResponse.json({seasons});
  } catch (error) {
    console.error("Error fetching seasons:", error);
    return NextResponse.json([]);
  } finally {
    await prisma.$disconnect();
  }
}
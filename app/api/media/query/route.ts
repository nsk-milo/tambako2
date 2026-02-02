import { NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@/lib/generated/prisma";

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type");
    const excludeId = searchParams.get("excludeId");
    const limit = parseInt(searchParams.get("limit") || "8", 10);

    if (!type) {
      return NextResponse.json({ error: "Missing 'type' parameter" }, { status: 400 });
    }

    // Find category by name (case-insensitive)
    const category = await prisma.categories.findFirst({
      where: { name: { equals: type, mode: "insensitive" } },
    });

    if (!category) {
      return NextResponse.json({ error: `Category '${type}' not found.` }, { status: 404 });
    }

    const where: Prisma.mediaWhereInput = {
      category_id: category.category_id,
      ...(excludeId && { NOT: { media_id: parseInt(excludeId) } }),
    };

    const mediaList = await prisma.media.findMany({
      where,
      include: {
        categories: true,
        media_genres: {
          include: { genres: true },
        },
      },
      orderBy: { created_at: "desc" },
      take: limit,
    });

    const formatMedia = (media: MediaWithRelations) => ({
      id: media.media_id.toString(),
      title: media.title,
      type: media.categories.name,
      year: media.release_date ? new Date(media.release_date).getFullYear().toString() : "N/A",
      rating: media.rating ? new Prisma.Decimal(media.rating).toFixed(1) : "N/A",
      image: media.thumbnail_location || "/placeholder.svg",
      genre: media.media_genres.map((mg) => mg.genres.name).join(", "),
    });

    return NextResponse.json(mediaList.map(formatMedia));
  } catch (error) {
    console.error("Error in /api/media/query:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
import { PrismaClient, Prisma } from "@/lib/generated/prisma";

const prisma = new PrismaClient();

type MediaWithRelations = Prisma.mediaGetPayload<{
  include: {
    categories: true;
    media_genres: {
      include: {
        genres: true;
      };
    };
  };
}>;

export type MediaCardItem = {
  id: string;
  title: string;
  type: "movie" | "series" | "music";
  year: string;
  rating: string;
  image: string;
  genre: string;
};

// Format a media row into the shape the MediaCard/MediaSection components expect.
function formatMedia(media: MediaWithRelations): MediaCardItem {
  return {
    id: media.media_id.toString(),
    title: media.title,
    type: media.categories.name as "movie" | "series" | "music",
    year: media.release_date
      ? new Date(media.release_date).getFullYear().toString()
      : "N/A",
    rating: media.rating ? new Prisma.Decimal(media.rating).toFixed(1) : "N/A",
    image: media.thumbnail_location || "/placeholder.svg",
    genre: media.media_genres.map((mg) => mg.genres.name).join(", "),
  };
}

// Fetch all media grouped by category. Shared by the /api/media/all route and
// server components so nothing has to call the app's own API over HTTP.
export async function getAllMediaGrouped() {
  const allMedia = await prisma.media.findMany({
    include: {
      categories: true,
      media_genres: {
        include: {
          genres: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return {
    movies: allMedia.filter((m) => m.categories.name === "movies").map(formatMedia),
    series: allMedia.filter((m) => m.categories.name === "series").map(formatMedia),
    music: allMedia.filter((m) => m.categories.name === "music").map(formatMedia),
  };
}

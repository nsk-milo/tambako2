import { NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@/lib/generated/prisma";
import { getUserDataFromToken } from "@/lib/auth";
import { mkdir } from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import { pipeline } from "stream/promises";

const prisma = new PrismaClient();

const UPLOAD_DIR = path.join(process.cwd(), "public/uploads");

// Helper function to create the necessary upload directories if they don't exist.
async function ensureUploadsDirExists() {
  try {
    await mkdir(path.join(UPLOAD_DIR, "media"), { recursive: true });
    await mkdir(path.join(UPLOAD_DIR, "thumbnails"), { recursive: true });
  } catch (error) {
    console.error("Error creating upload directories:", error);
    // It's better to throw an error to stop the execution if we can't save files.
    throw new Error("Could not create upload directories.");
  }
}

/**
 * IMPORTANT: Disable the default Next.js body parser.
 * By default, Next.js tries to parse the entire request body, which fails for large files
 * and hits a size limit. Setting bodyParser to `false` allows us to handle the body
 * as a stream directly.
 */
// Note: `export const config` with `api.bodyParser` is deprecated in newer Next.js
// versions. App Route handlers can work with `request.formData()` and streams.
// We intentionally omit the deprecated `config` export so the route builds cleanly.

export async function POST(request: Request) {
  try {
    const user = await getUserDataFromToken();
    const providerId = user?.role === "ContentCreator" ? BigInt(user.userId) : null;
    const data = await request.formData();

    // --- Form Data Extraction ---
    const file: File | null = data.get("file") as unknown as File;
    const thumbnail: File | null = data.get("thumbnail") as unknown as File;
    const file1080 = data.get("file_1080p") as File | null;
    const file720 = data.get("file_720p") as File | null;
    const file480 = data.get("file_480p") as File | null;
    const file360 = data.get("file_360p") as File | null;
    const hlsPlaylist = data.get("hls_playlist") as File | null;
    const hlsSegments = data.getAll("hls_segments") as File[];
    const title = data.get("title") as string;
    const description = data.get("description") as string;
    const year = data.get("year") as string;
    const genreName = data.get("genre") as string;
    const rating = data.get("rating") as string;
    const duration = data.get("duration") as string;
    const categoryName = data.get("category") as "movies" | "series" | "music";

    // --- Basic Validation ---
    if (!file || !thumbnail || !title || !description || !year || !genreName || !duration || !categoryName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await ensureUploadsDirExists();

    // --- File Handling using Streams (Memory Efficient) ---
    // Instead of loading the entire file into memory with arrayBuffer(),
    // we stream it directly to the disk. This is crucial for large files.

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    
    // Process main media file
    const fileExtension = path.extname(file.name);
    const fileName = `${uniqueSuffix}${fileExtension}`;
    const fileSystemPath = path.join("media", fileName);
    const fileDiskPath = path.join(UPLOAD_DIR, fileSystemPath);
    // @ts-expect-error - file.stream() is valid in Node.js environments
    await pipeline(file.stream(), createWriteStream(fileDiskPath));

    const saveOptionalRendition = async (rendition: File | null, suffix: string) => {
      if (!rendition) return;
      const renditionExtension = path.extname(rendition.name) || fileExtension;
      const renditionName = `${uniqueSuffix}-${suffix}${renditionExtension}`;
      const renditionSystemPath = path.join("media", renditionName);
      const renditionDiskPath = path.join(UPLOAD_DIR, renditionSystemPath);
      // @ts-expect-error - file.stream() is valid in Node.js environments
      await pipeline(rendition.stream(), createWriteStream(renditionDiskPath));
    };

    await saveOptionalRendition(file1080, "1080p");
    await saveOptionalRendition(file720, "720p");
    await saveOptionalRendition(file480, "480p");
    await saveOptionalRendition(file360, "360p");

    if (hlsPlaylist) {
      const playlistExtension = path.extname(hlsPlaylist.name) || ".m3u8";
      const playlistName = `${uniqueSuffix}${playlistExtension}`;
      const playlistSystemPath = path.join("media", playlistName);
      const playlistDiskPath = path.join(UPLOAD_DIR, playlistSystemPath);
      // @ts-expect-error - file.stream() is valid in Node.js environments
      await pipeline(hlsPlaylist.stream(), createWriteStream(playlistDiskPath));
    }

    if (hlsSegments.length) {
      for (const segment of hlsSegments) {
        const segmentName = segment.name || `${uniqueSuffix}-${Math.random().toString(36).slice(2)}.ts`;
        const segmentSystemPath = path.join("media", segmentName);
        const segmentDiskPath = path.join(UPLOAD_DIR, segmentSystemPath);
        // @ts-expect-error - file.stream() is valid in Node.js environments
        await pipeline(segment.stream(), createWriteStream(segmentDiskPath));
      }
    }

    // Process thumbnail file
    const thumbnailExtension = path.extname(thumbnail.name);
    const thumbnailName = `${uniqueSuffix}${thumbnailExtension}`;
    const thumbnailSystemPath = path.join("thumbnails", thumbnailName);
    const thumbnailDiskPath = path.join(UPLOAD_DIR, thumbnailSystemPath);
    // @ts-expect-error - thumbnail.stream() is valid in Node.js environments
    await pipeline(thumbnail.stream(), createWriteStream(thumbnailDiskPath));

    // --- Database Operations ---
    const categoryRecord = await prisma.categories.findFirst({
      where: { name: { equals: categoryName, mode: "insensitive" } },
    });

    if (!categoryRecord) {
      return NextResponse.json({ error: `Category '${categoryName}' not found.` }, { status: 400 });
    }

    let genreRecord = await prisma.genres.findFirst({
      where: { name: { equals: genreName, mode: "insensitive" } },
    });

    if (!genreRecord) {
      genreRecord = await prisma.genres.create({ data: { name: genreName } });
    }

    const newMedia = await prisma.media.create({
      data: {
        title,
        description,
        release_date: new Date(`${year}-01-01`),
        category_id: categoryRecord.category_id,
        duration: parseInt(duration.split(" ")[0]) || 0,
        rating: rating ? parseFloat(rating) : null,
        media_location: `/uploads/${fileSystemPath}`,
        thumbnail_location: `/uploads/${thumbnailSystemPath}`,
        provider_id: providerId ?? undefined,
      },
    });

    await prisma.media_genres.create({
      data: {
        media_id: newMedia.media_id,
        genre_id: genreRecord.genre_id,
      },
    });

    // --- Handle Series-Specific Logic ---
    if (categoryName === "series") {
      const seriesId = data.get("seriesId") as string | null;
      const newSeriesName = data.get("newSeriesName") as string | null;
      const season = data.get("season") as string;
      const episodeNumber = data.get("episodeNumber") as string;

      if ((!seriesId && !newSeriesName) || !season || !episodeNumber) {
        return NextResponse.json({ error: "Missing series-specific fields." }, { status: 400 });
      }

      let seriesRecord;
      if (newSeriesName) {
        seriesRecord = await prisma.series.create({ data: { name: newSeriesName } });
      } else if (seriesId) {
        seriesRecord = await prisma.series.findUnique({ where: { series_id: parseInt(seriesId) } });
        if (!seriesRecord) {
          return NextResponse.json({ error: `Series with ID ${seriesId} not found.` }, { status: 404 });
        }
      } else {
        return NextResponse.json({ error: "Series information is missing." }, { status: 400 });
      }
      
      const seasonNumber = parseInt(season);
      if (isNaN(seasonNumber)) {
        return NextResponse.json({ error: "Invalid season number provided." }, { status: 400 });
      }

      let seasonRecord = await prisma.seasons.findUnique({ where: { season_number: seasonNumber } });
      if (!seasonRecord) {
        seasonRecord = await prisma.seasons.create({ data: { season_number: seasonNumber } });
      }

      await prisma.episodes.create({
        data: {
          title,
          description,
          episode_number: parseInt(episodeNumber),
          release_date: newMedia.release_date,
          duration: newMedia.duration,
          season_id: seasonRecord.season_id,
          series_id: seriesRecord.series_id,
          media_id: newMedia.media_id,
        },
      });

      return NextResponse.json({ message: "Episode uploaded successfully", mediaId: newMedia.media_id.toString() }, { status: 201 });
    }

    return NextResponse.json({ message: "Media uploaded successfully", mediaId: newMedia.media_id.toString() }, { status: 201 });

  } catch (error) {
    console.error("Upload error:", error);
    // Check for specific error types if needed, e.g., Prisma errors.
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    // Ensure the Prisma client is always disconnected.
    await prisma.$disconnect();
  }
}

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
    });

    // Helper to format data for the MediaCard component
    const formatMedia = (media: MediaWithRelations) => ({
      id: media.media_id.toString(),
      title: media.title,
      type: media.categories.name as "movie" | "series" | "music",
      year: media.release_date ? new Date(media.release_date).getFullYear().toString() : "N/A",
      rating: media.rating ? new Prisma.Decimal(media.rating).toFixed(1) : "N/A",
      image: media.thumbnail_location || "/placeholder.svg",
      genre: media.media_genres.map((mg) => mg.genres.name).join(", "),
    });

    const movies = allMedia.filter((m) => m.categories.name === "movies").map(formatMedia);
    const series = allMedia.filter((m) => m.categories.name === "series").map(formatMedia);
    const music = allMedia.filter((m) => m.categories.name === "music").map(formatMedia);

    return NextResponse.json({ movies, series, music });
  } catch (error) {
    console.error("Error fetching all media:", error);
    return NextResponse.json({ error: "Failed to fetch media" }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

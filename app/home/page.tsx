import { MediaSection } from "@/components/media-section"
import { Header } from "@/components/header"
import { WelcomeGreeting } from "@/components/welcome-greeting"
import { getAllMediaGrouped } from "@/lib/media"
import Link from "next/link"

// This page reads the auth cookie and always needs fresh media, so render it
// per-request rather than attempting static generation.
export const dynamic = "force-dynamic"

async function getMedia() {
  try {
    // Query the database directly instead of fetching the app's own API route
    // over HTTP (which is fragile and triggers Next's dynamic-server error).
    return await getAllMediaGrouped();
  } catch (error) {
    console.error("Failed to fetch media:", error);
    return { movies: [], series: [], music: [] };
  }
}

export default async function HomePage() {
  const { movies, series, music } = await getMedia()

  return (
    <>
      <Header />
      <main className="pt-24 pb-8">
        {/* Hero Banner */}
        <section className="relative h-[400px] flex items-center justify-center mb-12 -mt-24">
          <img
            src="/banner.jpg"
            alt="Featured"
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black opacity-80"></div>
          <div className="relative z-10 text-center">
            <WelcomeGreeting />
            <p className="text-xl md:text-2xl mb-6 text-gray-300 max-w-2xl mx-auto">
              Discover and stream your favorite movies, series, and music all in one place.
            </p>
            <Link href="/my-list" className="px-8 py-3 bg-red-600 hover:bg-red-700 rounded-full font-semibold text-lg shadow-lg transition">
              Start Watching
            </Link>
          </div>
        </section>

        <div className="container mx-auto px-4">
          <MediaSection title="Popular Movies" items={movies} variant="carousel" />
          <MediaSection title="Trending Series" items={series} variant="carousel" />
          <MediaSection title="Top Music" items={music} variant="carousel" />
        </div>
      </main>
    </>
  )
}
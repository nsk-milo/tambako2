"use client";

import { Header } from "@/components/header";
import { MediaSection } from "@/components/media-section";
import { ScrollAnimation } from "@/components/scroll-animation";
import { usePageData } from "@/hooks/custom-hook";

export default function MusicPage() {
  const { user, data: music, loading, error } =
    usePageData("/api/music", "music");

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <ScrollAnimation className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
              Music
            </h1>
            <p className="text-lg text-muted-foreground">
              Listen to the greatest albums and tracks of all time.
            </p>
          </ScrollAnimation>

          {loading && <div className="text-center py-12">Loading...</div>}
          {error && (
            <div className="text-center py-12 text-destructive">
              Failed to load music. Please try again later.
            </div>
          )}
          {!loading && !error && (
            <MediaSection title="All Music" items={music} />
          )}
        </div>
      </main>
    </div>
  );
}

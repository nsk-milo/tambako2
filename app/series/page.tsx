"use client"

import { Header } from "@/components/header"
import { MediaSection } from "@/components/media-section"
import { ScrollAnimation } from "@/components/scroll-animation"
import { usePageData } from "@/hooks/custom-hook"

export default function SeriesPage() {
  const { user, data: series, loading, error } =
    usePageData("/api/series/all", "series");

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <ScrollAnimation className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-primary">Series</h1>
            <p className="text-lg text-muted-foreground">Binge-watch the best TV series and shows.</p>
          </ScrollAnimation>
          {loading && <div className="text-center py-12">Loading...</div>}
          {error && (
            <div className="text-center py-12 text-destructive">
              Failed to load series. Please try again later.
            </div>
          )}
          {!loading && !error && (
            <MediaSection title="All Series" items={series} />
          )}
        </div>
      </main>
    </div>
  )
}

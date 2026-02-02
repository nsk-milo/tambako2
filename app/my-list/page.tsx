"use client";

import { Header } from "@/components/header";
import { MediaSection } from "@/components/media-section";
import { usePageData } from "@/hooks/custom-hook";

export default function MyListPage() {
  const { user, data: myList, loading } = usePageData("/api/favourites");

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-primary">My List</h1>
            <p className="text-lg text-muted-foreground">
              Your personal collection of favorite movies, series, and music.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">Loading...</div>
          ) : myList.length > 0 ? (
            <MediaSection title="Your Favorites" items={myList} />
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">Your list is empty. Start adding your favorite content!</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

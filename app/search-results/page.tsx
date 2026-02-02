"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense, useCallback } from "react";
import { Header } from "@/components/header";
import { MediaSection } from "@/components/media-section";
import { UserPayload } from "@/lib/auth";
import { MediaItem } from "@/lib/mytypes";

// A generic media item type for search results

import axios from "axios";

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q");

  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const performSearch = async () => {
      if (query) {
        setLoading(true);
        try {
          const response = await axios.get("/api/search", { params: { q: query } });
          setResults(response.data.results || []);
        } catch (err) {
          console.error("Search failed:", err);
          setResults([]);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
        setLoading(false);
      }
    };
    performSearch();
  }, [query, setResults, setLoading]);

  if (loading) {
    return <div className="text-center py-12">Searching...</div>;
  }

  return (
    <>
      <h1 className="text-3xl md:text-4xl font-bold mb-6">
        {query ? `Results for "${query}"` : "Please enter a search term"}
      </h1>
      {results.length > 0 ? (
        <MediaSection title="Search Results" items={results} />
      ) : (
        <p className="text-muted-foreground text-lg">No results found for your search.</p>
      )}
    </>
  );
}

export default function SearchPage() {
  const [user, setUser] = useState<UserPayload | null>(null);
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await axios.get("/api/auth/me");
        setUser(response.data?.user);
      } catch (error) {
        // User is likely not authenticated, which is fine.
        // We can log for debugging but otherwise ignore.
        console.log("Not logged in or failed to fetch user");
        setUser(null);
      }
    };
    fetchUser();
  }, []);

  return (
    <div className="min-h-screen">
      {/* <Header user={user} /> */}
      <main className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <Suspense fallback={<div className="text-center py-12">Loading...</div>}>
            <SearchResults />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

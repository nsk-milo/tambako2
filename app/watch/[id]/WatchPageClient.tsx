"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Hls from "hls.js";
import { useRouter } from "next/navigation";
import axios from "axios";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import FavoriteButton from "@/components/ui/FavoriteButton";
import { Badge } from "@/components/ui/badge";
import { EpisodesSidebar } from "@/components/episodes-sidebar";
import {
  ArrowLeft,
  Crown,
  Loader2,
  Settings,
  SkipBack,
  SkipForward,
} from "lucide-react";

interface VideoSource {
  quality: string;
  url: string;
}

interface MediaDetails {
  id: string;
  title: string;
  type: "movies" | "series" | "music";
  year: string;
  rating: string;
  image: string;
  genre: string;
  description: string;
  duration: string;
  videoUrl: string;
  videoSources?: VideoSource[];
  hlsUrl?: string;
}

interface Episode {
  id: string;
  title: string;
  episode: number;
  season: number;
  duration: string;
  description: string;
  mediaId: string;
  thumbnail: string;
}

interface OtherMedia {
  id: string;
  title: string;
  image: string;
  year: string;
  rating: string;
}

export default function WatchPageClient({ id }: { id: string }) {
  const router = useRouter();
  const [media, setMedia] = useState<MediaDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubscriptionError, setIsSubscriptionError] = useState(false);
  const [currentEpisodeId] = useState<string | undefined>(id);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [otherMedia, setOtherMedia] = useState<OtherMedia[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const qualityMenuRef = useRef<HTMLDivElement>(null);
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>("");
  const [isHlsActive, setIsHlsActive] = useState(false);
  const hlsRef = useRef<Hls | null>(null);
  const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTrackedProgressRef = useRef<number>(0);

  useEffect(() => {
    const fetchMedia = async () => {
      setLoading(true);
      setError(null);
      setIsSubscriptionError(false);
      try {
        const response = await axios.get(`/api/media/${id}`);
        setMedia(response.data);
        const sources = response.data.videoSources ?? [];
        const recommendedSource = pickAdaptiveSource(sources);
        setCurrentVideoUrl(recommendedSource?.url || response.data.videoUrl);
        if (response.data.type === "series") {
          console.log("Fetching episodes for series ID:", response.data);
          const episodesResponse = await axios.get(
            `/api/episodes/${response.data.id}`
          );
          setEpisodes(episodesResponse.data);
        }
      } catch (err) {
        if (axios.isAxiosError(err) && err.response) {
          if (err.response.status === 401 || err.response.status === 403) {
            setIsSubscriptionError(true);
            setError(
              err.response.data.error ||
                "An active subscription is required to watch this content."
            );
          } else {
            setError(
              err.response.data.error || "Failed to fetch media details."
            );
          }
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred.");
        }
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchMedia();
    }
  }, [id]);

  const pickAdaptiveSource = useCallback((sources: VideoSource[]) => {
    if (!sources.length) return undefined;
    const sortedSources = [...sources].filter((source) => source.quality !== "auto");
    if (!sortedSources.length) return sources[0];

    const downlink = navigator.connection?.downlink ?? 5;
    if (downlink >= 8) {
      return sortedSources.find((source) => source.quality === "1080p") || sortedSources[0];
    }
    if (downlink >= 4) {
      return sortedSources.find((source) => source.quality === "720p") || sortedSources[0];
    }
    if (downlink >= 2) {
      return sortedSources.find((source) => source.quality === "480p") || sortedSources[0];
    }
    return sortedSources.find((source) => source.quality === "360p") || sortedSources[0];
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !media) return;

    const hlsUrl = media.hlsUrl;
    if (!hlsUrl || hlsUrl.includes("undefined")) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setIsHlsActive(false);
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data?.fatal) {
          hls.destroy();
          hlsRef.current = null;
          setIsHlsActive(false);
          if (media.videoUrl && video.src !== media.videoUrl) {
            video.src = media.videoUrl;
          }
        }
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      setIsHlsActive(true);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      setIsHlsActive(true);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setIsHlsActive(false);
    };
  }, [media]);

  const sendTrackingEvent = useCallback(
    async (progressSeconds: number, completed = false) => {
      if (!id) return;
      try {
        await axios.post("/api/analytics/track", {
          mediaId: id,
          progressSeconds,
          completed,
        });
      } catch (err) {
        // Avoid blocking playback on analytics errors
        console.warn("Failed to track view progress", err);
      }
    },
    [id]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleError = () => {
      if (!media?.videoUrl) return;
      if (currentVideoUrl && currentVideoUrl !== media.videoUrl) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
        setIsHlsActive(false);
        setCurrentVideoUrl(media.videoUrl);
      }
    };

    const handlePlay = () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
      }

      trackingIntervalRef.current = setInterval(() => {
        const progress = Math.floor(video.currentTime);
        if (progress - lastTrackedProgressRef.current >= 10) {
          lastTrackedProgressRef.current = progress;
          sendTrackingEvent(progress, false);
        }
      }, 10000);
    };

    const handlePause = () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      const progress = Math.floor(video.currentTime);
      if (progress > lastTrackedProgressRef.current) {
        lastTrackedProgressRef.current = progress;
        sendTrackingEvent(progress, false);
      }
    };

    const handleEnded = () => {
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
      const progress = Math.floor(video.currentTime);
      lastTrackedProgressRef.current = progress;
      sendTrackingEvent(progress, true);
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
      if (trackingIntervalRef.current) {
        clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = null;
      }
    };
  }, [sendTrackingEvent, media, currentVideoUrl]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        qualityMenuRef.current &&
        !qualityMenuRef.current.contains(event.target as Node)
      ) {
        setIsQualityMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleEpisodeSelect = (episodeId: string) => {
    router.push(`/watch/${episodeId}`);
  };

  const currentEpisodeIndex = episodes.findIndex(
    (ep) => ep.id === currentEpisodeId
  );

  const handlePrevious = () => {
    if (currentEpisodeIndex > 0) {
      router.push(`/watch/${episodes[currentEpisodeIndex - 1].mediaId}`);
    }
  };

  const handleNext = () => {
    if (currentEpisodeIndex < episodes.length - 1) {
      router.push(`/watch/${episodes[currentEpisodeIndex + 1].mediaId}`);
    }
  };

  const handleQualityChange = (newUrl: string) => {
    if (!videoRef.current || currentVideoUrl === newUrl) {
      setIsQualityMenuOpen(false);
      return;
    }

    const video = videoRef.current;
    const currentTime = video.currentTime;
    const isPaused = video.paused;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      setIsHlsActive(false);
    }

    video.src = newUrl;
    video.load();

    const onLoadedData = () => {
      video.currentTime = currentTime;
      if (!isPaused) {
        video.play().catch(console.error);
      }
      video.removeEventListener("loadeddata", onLoadedData);
    };
    video.addEventListener("loadeddata", onLoadedData);

    setCurrentVideoUrl(newUrl);
    setIsQualityMenuOpen(false);
  };

  // Fetch other media of the same type
  useEffect(() => {
    const fetchOtherMedia = async () => {
      if (!media) return;
      try {
        const response = await axios.get(
          `/api/media/query?type=${media.type}&excludeId=${media.id}&limit=8`
        );
        setOtherMedia(response.data || []);
      } catch {
        // Ignore errors for this section
        setOtherMedia([]);
      }
    };
    fetchOtherMedia();
  }, [media]);

  // Sidebar media for movies/music
  const [sidebarMedia, setSidebarMedia] = useState<OtherMedia[]>([]);

  useEffect(() => {
    const fetchSidebarMedia = async () => {
      if (!media) return;
      let sidebarType = "";
      if (media.type === "music") sidebarType = "music";
      if (media.type === "movies") sidebarType = "movies";
      if (!sidebarType) return;
      try {
        const response = await axios.get(
          `/api/media/query?type=${sidebarType}&excludeId=${media.id}&limit=12`
        );
        setSidebarMedia(response.data || []);
      } catch {
        setSidebarMedia([]);
      }
    };
    fetchSidebarMedia();
  }, [media]);

  // 🔄 Loading state
  if (loading) {
    return (
      <div className="min-h-screen">
        <main className="pt-20 pb-8">
          <div className="container mx-auto px-4 flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    );
  }

  // 🚫 Subscription required
  if (isSubscriptionError) {
    return (
      <div className="min-h-screen">
        <main className="pt-20 pb-8">
          <div className="container mx-auto px-4 text-center flex flex-col items-center justify-center h-[60vh]">
            <Crown className="w-16 h-16 text-primary mb-4" />
            <h1 className="text-3xl font-bold mb-2">Subscription Required</h1>
            <p className="text-muted-foreground mb-6 max-w-md">
              {error ||
                "You need an active subscription to watch this content."}
            </p>
            <Link href="/subscribe">
              <Button size="lg">Subscribe Now</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ❌ Error or Not Found
  if (error || !media) {
    return (
      <div className="min-h-screen">
        <main className="pt-20 pb-8">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-2xl font-bold mb-4">
              {error ? "An Error Occurred" : "Media Not Found"}
            </h1>
            <p className="text-destructive mb-6">{error}</p>
            <Link href="/">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // ✅ Normal render
  return (
    <div className="min-h-screen">
      <main className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          {/* Back button */}
          <div className="mb-6">
            <Link href="/" className="flex items-center">
              <img src="/logo.svg" alt="Logo" className="w-8 h-8 mr-2" />
            </Link>
          </div>
          <div className="mb-6">
            <Link href="/home">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>

          <div
            className={`grid gap-8 ${
              media.type === "series"
                ? "grid-cols-1 lg:grid-cols-4"
                : "grid-cols-1 lg:grid-cols-4"
            }`}
          >
            {/* Main Content (Video + Info) */}
            <div className={media.type === "series" ? "lg:col-span-3" : "lg:col-span-3"}>
              <div className="mb-8">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden group">
                  <video
                    ref={videoRef}
                    src={currentVideoUrl}
                    className="w-full h-full"
                    poster={media.image}
                    controlsList="nodownload"
                    controls
                    preload="metadata"
                    autoPlay
                  >
                    Your browser does not support the video tag.
                  </video>
                  {/* Quality Selector */}
                  {media.videoSources && media.videoSources.length > 0 && !isHlsActive && (
                    <div
                      ref={qualityMenuRef}
                      className="absolute bottom-12 right-4"
                    >
                      <div className="relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setIsQualityMenuOpen(!isQualityMenuOpen)
                          }
                          className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/75"
                          aria-label="Video settings"
                        >
                          <Settings className="w-5 h-5" />
                        </Button>
                        {isQualityMenuOpen && (
                          <div className="absolute bottom-full right-0 mb-2 bg-background/80 backdrop-blur-sm rounded-md p-1 shadow-lg w-28">
                            <div className="text-sm font-semibold mb-1 px-2 pt-1 text-muted-foreground">
                              Quality
                            </div>
                            <ul>
                              {media.videoSources.map((source) => (
                                <li key={source.quality}>
                                  <button
                                    onClick={() =>
                                      handleQualityChange(source.url)
                                    }
                                    className={`w-full text-left px-3 py-1.5 rounded-md text-sm hover:bg-accent ${
                                      currentVideoUrl === source.url
                                        ? "font-bold text-primary"
                                        : ""
                                    }`}
                                  >
                                    {source.quality}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Next/Prev buttons for series */}
              {media.type === "series" && episodes.length > 0 && (
                <div className="flex justify-between items-center mb-8">
                  <Button
                    variant="outline"
                    onClick={handlePrevious}
                    disabled={currentEpisodeIndex <= 0}
                  >
                    <SkipBack className="w-4 h-4 mr-2" />
                    Previous Episode
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Episode {currentEpisodeIndex + 1} of {episodes.length}
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleNext}
                    disabled={currentEpisodeIndex >= episodes.length - 1}
                  >
                    Next Episode
                    <SkipForward className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              )}

              {/* Media Info */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <h1 className="text-3xl font-bold">
                            {media.title}
                          </h1>
                          <Badge
                            variant="secondary"
                            className="bg-primary text-primary-foreground mt-2"
                          >
                            {media.type}
                          </Badge>
                        </div>
                        <FavoriteButton mediaId={media.id} />
                      </div>
                      <div className="flex items-center gap-4 text-muted-foreground mb-4">
                        <span>{media.year}</span>
                        <span>★ {media.rating}</span>
                        <span>{media.duration}</span>
                        <span>{media.genre}</span>
                      </div>
                      <p className="text-muted-foreground leading-relaxed">
                        {media.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Media Details Sidebar */}
                <div className="lg:col-span-1">
                  <div className="rounded-lg border border-white/10 bg-background/30 p-6 backdrop-blur-lg">
                    <h3 className="mb-4 font-semibold text-foreground/90">
                      Media Details
                    </h3>
                    <div className="space-y-3 text-sm text-foreground/90">
                      <div className="flex justify-between">
                        <span className="text-foreground/70">Type:</span>
                        <span className="capitalize">{media.type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground/70">Year:</span>
                        <span>{media.year}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground/70">Rating:</span>
                        <span>★ {media.rating}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground/70">Duration:</span>
                        <span>{media.duration}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-foreground/70">Genre:</span>
                        <span>{media.genre}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Responsive: Show sidebar above "More" section on small screens */}
              <div className="block lg:hidden mb-8">
                {(media.type === "movies" || media.type === "music") && (
                  <div className="rounded-lg border border-white/10 bg-background/30 p-6 backdrop-blur-lg mb-4">
                    <h3 className="mb-4 font-semibold text-foreground/90">
                      {media.type === "movies" ? "Movies" : "Music"} List
                    </h3>
                    <div className="space-y-4">
                      {sidebarMedia.length === 0 && (
                        <div className="text-muted-foreground text-sm">
                          No {media.type === "movies" ? "movies" : "music"} found.
                        </div>
                      )}
                      {sidebarMedia.map((item) => (
                        <Link
                          key={item.id}
                          href={`/watch/${item.id}`}
                          className="flex items-center gap-3 rounded-md hover:bg-background/60 transition p-2"
                        >
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-14 h-10 object-cover rounded"
                          />
                          <div>
                            <div className="font-medium truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground flex gap-2">
                              <span>{item.year}</span>
                              <span>★ {item.rating}</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {media.type === "series" && (
                  <div className="mb-4">
                    <EpisodesSidebar
                      seriesId={media.id}
                      currentEpisodeId={currentEpisodeId}
                      onEpisodeSelect={handleEpisodeSelect}
                    />
                  </div>
                )}
              </div>

              {/* Other Media of Same Type */}
              <div className="mt-10">
                <h2 className="text-xl font-semibold mb-4">
                  More {media.type === "series" ? "Series" : media.type.charAt(0).toUpperCase() + media.type.slice(1)}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {otherMedia.length === 0 && (
                    <div className="col-span-full text-muted-foreground text-sm">
                      No other {media.type} found.
                    </div>
                  )}
                  {otherMedia.map((item) => (
                    <Link
                      key={item.id}
                      href={`/watch/${item.id}`}
                      className="block rounded-lg overflow-hidden bg-background/40 hover:bg-background/70 transition"
                    >
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full aspect-video object-cover"
                      />
                      <div className="p-2">
                        <div className="font-medium truncate">{item.title}</div>
                        <div className="text-xs text-muted-foreground flex gap-2">
                          <span>{item.year}</span>
                          <span>★ {item.rating}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
              {/* End Other Media */}
            </div>

            {/* Sidebar for movies/music (desktop only) */}
            {(media.type === "movies" || media.type === "music") && (
              <div className="hidden lg:block lg:col-span-1">
                <div className="rounded-lg border border-white/10 bg-background/30 p-6 backdrop-blur-lg">
                  <h3 className="mb-4 font-semibold text-foreground/90">
                    {media.type === "movies" ? "Movies" : "Music"} List
                  </h3>
                  <div className="space-y-4">
                    {sidebarMedia.length === 0 && (
                      <div className="text-muted-foreground text-sm">
                        No {media.type === "movies" ? "movies" : "music"} found.
                      </div>
                    )}
                    {sidebarMedia.map((item) => (
                      <Link
                        key={item.id}
                        href={`/watch/${item.id}`}
                        className="flex items-center gap-3 rounded-md hover:bg-background/60 transition p-2"
                      >
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-14 h-10 object-cover rounded"
                        />
                        <div>
                          <div className="font-medium truncate">{item.title}</div>
                          <div className="text-xs text-muted-foreground flex gap-2">
                            <span>{item.year}</span>
                            <span>★ {item.rating}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Episodes Sidebar (desktop only, only for series) */}
            {media.type === "series" && (
              <div className="hidden lg:block lg:col-span-1">
                <EpisodesSidebar
                  seriesId={media.id}
                  currentEpisodeId={currentEpisodeId}
                  onEpisodeSelect={handleEpisodeSelect}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

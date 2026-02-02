"use client"
import { Badge } from "@/components/ui/badge"
import axios from "axios"
import { Play } from "lucide-react"
import { useEffect, useState } from "react"

interface Episode {
  id: string
  title: string
  episode: number
  season: number
  duration: string
  description: string
  mediaId: string
  thumbnail: string
}

interface EpisodesSidebarProps {
  seriesId: string
  currentEpisodeId?: string
  onEpisodeSelect: (episodeId: string) => void
}

export function EpisodesSidebar({ seriesId, currentEpisodeId, onEpisodeSelect }: EpisodesSidebarProps) {
  const [episodes, setEpisodes] = useState<Episode[]>([])

  useEffect(() => {
    const fetchEpisodes = async () => {
      try {
        if (!seriesId) {
          setEpisodes([])
          return
        }

        const response = await axios.get(`/api/episodes/${seriesId}`)

        // Handle both shapes: { eps: [...] } or just [...]
        const eps = response.data?.eps ?? response.data ?? []
        setEpisodes(Array.isArray(eps) ? eps : [])
      } catch (err) {
        console.error("Failed to fetch episodes:", err)
        setEpisodes([])
      }
    }

    fetchEpisodes()
  }, [seriesId])

  return (
    <div className="rounded-lg border border-white/10 bg-background/30 p-4 backdrop-blur-lg">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Play className="w-4 h-4" />
        Episodes
      </h3>
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {episodes.map((episode) => (
          <div
            key={episode.id}
            className={`group cursor-pointer rounded-lg border border-white/5 p-3 transition-colors hover:bg-white/10 ${
              currentEpisodeId === episode.id ? "bg-primary/20 border-primary/50" : ""
            }`}
            onClick={() => onEpisodeSelect(episode.mediaId)}
          >
            <div className="flex gap-3">
              <div className="relative flex-shrink-0">
                <img
                  src={episode.thumbnail || "/placeholder.svg"}
                  alt={episode.title}
                  className="w-16 h-10 object-cover rounded"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors rounded flex items-center justify-center">
                  <Play className="w-4 h-4 text-white opacity-80" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    S{episode.season}E{episode.episode}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{episode.duration}</span>
                </div>
                <h4 className="font-medium text-sm line-clamp-1 mb-1">{episode.title}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2">{episode.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

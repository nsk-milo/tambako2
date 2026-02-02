import Link from "next/link"
import { PlayCircle } from "lucide-react"

interface MediaCardProps {
  id: string
  title: string
  image: string
  year: string
  rating: string
}

export function MediaCard({ id, title, image, year, rating }: MediaCardProps) {
  return (
    <Link
      href={`/watch/${id}`}
      className="group block rounded-lg relative aspect-[2/3] border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all duration-300 hover:border-blue-500/40 hover:shadow-[0_0_25px_rgba(59,130,246,0.3)]"
    >
      <div className="w-full h-full rounded-lg overflow-hidden">
        <img
          src={image || "/placeholder.png"}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-105"
        />
      </div>

      {/* Play icon overlay on hover */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center rounded-lg">
        <PlayCircle className="w-12 h-12 text-white" />
      </div>

      {/* Glassy info panel */}
      <div className="absolute bottom-0 left-0 right-0 m-2 p-2 rounded-lg border border-white/10 bg-black/20 backdrop-blur-md transition-all duration-300 group-hover:bg-black/40">
        <h3 className="font-bold text-white truncate text-sm">{title}</h3>
        <div className="text-xs text-gray-200 flex items-center justify-between mt-1">
          <span>{year}</span>
          <span>★ {rating}</span>
        </div>
      </div>
    </Link>
  )
}
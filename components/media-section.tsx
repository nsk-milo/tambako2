import { MediaCard } from "./media-card";
import { ScrollAnimation } from "./scroll-animation";

interface MediaItem {
  id: string;
  title: string;
  type: "movie" | "series" | "music";
  year: string;
  rating: string;
  image: string;
  genre?: string;
}

interface MediaSectionProps {
  title: string;
  items: MediaItem[];
  variant?: "carousel" | "grid";
}

export function MediaSection({ title, items, variant }: MediaSectionProps) {
  const hasItems = Array.isArray(items) && items.length > 0;

  return (
    <section className="mb-12 rounded-xl   p-4 transition-all duration-300 hover:border-white/20  md:p-6">
      <ScrollAnimation animation="fade-left">
        <h2 className="text-2xl font-bold mb-6 text-foreground/90">{title}</h2>
      </ScrollAnimation>

      {hasItems ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item, index) => (
            <ScrollAnimation
              key={item.id}
              delay={index * 100}
              animation="scale-in"
            >
              <MediaCard {...item} />
            </ScrollAnimation>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          No content available in this category yet.
        </p>
      )}
    </section>
  );
}

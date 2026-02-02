export interface MediaItem {
  id: string;
  title: string;
  type: "movie" | "series" | "music";
  year: string;
  rating: string;
  image: string;
  genre?: string;
}
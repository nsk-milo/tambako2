"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MediaUploadForm {
  title: string;
  description: string;
  year: string;
  genre: string;
  rating: string;
  duration: string;
  category: "movies" | "series" | "music" | "";
  episodeNumber: string;
  season: string;
  seriesId: string;
  newSeriesName: string;
  file: File | null;
  thumbnail: File | null;
  file1080: File | null;
  file720: File | null;
  file480: File | null;
  file360: File | null;
  hlsPlaylist: File | null;
  hlsSegments: File[];
}

type SeriesItem = { name: string; series_id: string };
type SeasonItem = { season_id: string; season_number: number };

export default function ContentProviderUploadClient() {
  const [formData, setFormData] = useState<MediaUploadForm>({
    title: "",
    description: "",
    year: "",
    genre: "",
    rating: "",
    duration: "",
    category: "",
    episodeNumber: "",
    season: "",
    seriesId: "",
    newSeriesName: "",
    file: null,
    thumbnail: null,
    file1080: null,
    file720: null,
    file480: null,
    file360: null,
    hlsPlaylist: null,
    hlsSegments: [],
  });
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [seriesList, setSeriesList] = useState<SeriesItem[]>([]);
  const [seasonList, setSeasonList] = useState<SeasonItem[]>([]);
  const [isCreatingNewSeries, setIsCreatingNewSeries] = useState(false);
  const [isCreatingNewSeason, setIsCreatingNewSeason] = useState(false);

  const updateFormData = (
    field: keyof MediaUploadForm,
    value: string | File | File[] | null
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: keyof Pick<
      MediaUploadForm,
      "file" | "thumbnail" | "file1080" | "file720" | "file480" | "file360" | "hlsPlaylist"
    > | "hlsSegments"
  ) => {
    if (type === "hlsSegments") {
      const files = e.target.files ? Array.from(e.target.files) : [];
      updateFormData("hlsSegments", files);
      return;
    }
    const file = e.target.files?.[0] || null;
    updateFormData(type, file);
  };

  const isFormValid = () => {
    const baseValid =
      formData.title &&
      formData.description &&
      formData.year &&
      formData.genre &&
      formData.rating &&
      formData.duration &&
      formData.category &&
      formData.file &&
      formData.thumbnail;

    if (formData.category === "series") {
      const seriesInfoValid = formData.seriesId || formData.newSeriesName;
      return (
        baseValid &&
        formData.episodeNumber &&
        formData.season &&
        seriesInfoValid
      );
    }

    return baseValid;
  };

  useEffect(() => {
    if (formData.category !== "series") {
      setIsCreatingNewSeries(false);
      setIsCreatingNewSeason(false);
      return;
    }

    const fetchSeriesAndSeasons = async () => {
      try {
        const [seriesResponse, seasonsResponse] = await Promise.all([
          axios.get<{ series: SeriesItem[] }>("/api/series"),
          axios.get<{ seasons: SeasonItem[] }>("/api/seasons"),
        ]);
        setSeriesList(seriesResponse.data.series || []);
        setSeasonList(seasonsResponse.data.seasons || []);
        if (!seriesResponse.data.series?.length) {
          setIsCreatingNewSeries(true);
        }
        if (!seasonsResponse.data.seasons?.length) {
          setIsCreatingNewSeason(true);
        }
      } catch (error) {
        setUploadError(
          error instanceof Error
            ? error.message
            : "Could not load series or seasons."
        );
      }
    };

    fetchSeriesAndSeasons();
  }, [formData.category]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isFormValid()) {
      setUploadError("Please fill all required fields.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    const data = new FormData();
    data.append("title", formData.title);
    data.append("description", formData.description);
    data.append("year", formData.year);
    data.append("genre", formData.genre);
    data.append("rating", formData.rating);
    data.append("duration", formData.duration);
    data.append("category", formData.category);
    if (formData.file) data.append("file", formData.file);
    if (formData.thumbnail) data.append("thumbnail", formData.thumbnail);
    if (formData.file1080) data.append("file_1080p", formData.file1080);
    if (formData.file720) data.append("file_720p", formData.file720);
    if (formData.file480) data.append("file_480p", formData.file480);
    if (formData.file360) data.append("file_360p", formData.file360);
    if (formData.hlsPlaylist) data.append("hls_playlist", formData.hlsPlaylist);
    formData.hlsSegments.forEach((segment) =>
      data.append("hls_segments", segment)
    );

    if (formData.category === "series") {
      data.append("episodeNumber", formData.episodeNumber);
      data.append("season", formData.season);
      if (formData.newSeriesName) {
        data.append("newSeriesName", formData.newSeriesName);
      } else {
        data.append("seriesId", formData.seriesId);
      }
    }

    try {
      await axios.post("/api/media/all", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
      setFormData({
        title: "",
        description: "",
        year: "",
        genre: "",
        rating: "",
        duration: "",
        category: "",
        episodeNumber: "",
        season: "",
        seriesId: "",
        newSeriesName: "",
        file: null,
        thumbnail: null,
        file1080: null,
        file720: null,
        file480: null,
        file360: null,
        hlsPlaylist: null,
        hlsSegments: [],
      });
      setIsCreatingNewSeries(false);
      setIsCreatingNewSeason(false);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        setUploadError(error.response.data.error || "Upload failed");
      } else {
        setUploadError(
          error instanceof Error ? error.message : "An unknown error occurred."
        );
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-background/30 p-6 backdrop-blur-lg">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Upload New Content</h2>
        <p className="text-sm text-muted-foreground">
          Share new movies, series, or music with your audience.
        </p>
      </div>

      {uploadError && (
        <div className="mb-4 rounded-lg border border-red-400 bg-red-100 p-3 text-red-700">
          <strong>Upload Failed:</strong> {uploadError}
        </div>
      )}
      {uploadSuccess && (
        <div className="mb-4 rounded-lg border border-green-300 bg-green-100 p-3 text-green-700">
          Upload successful! Your content will be available shortly.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="category">Category *</Label>
          <Select
            value={formData.category}
            onValueChange={(value) =>
              updateFormData("category", value as MediaUploadForm["category"])
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select media category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="movies">Movies</SelectItem>
              <SelectItem value="series">Series</SelectItem>
              <SelectItem value="music">Music</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {formData.category === "series" && (
          <div className="grid gap-4 rounded-lg border border-border/50 bg-muted/20 p-4 md:grid-cols-2">
            <div className="md:col-span-2">
              {isCreatingNewSeries ? (
                <div className="space-y-2">
                  <Label htmlFor="newSeriesName">New Series Name *</Label>
                  <Input
                    id="newSeriesName"
                    value={formData.newSeriesName}
                    onChange={(e) => {
                      updateFormData("newSeriesName", e.target.value);
                      updateFormData("seriesId", "");
                    }}
                  />
                  {seriesList.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsCreatingNewSeries(false);
                        updateFormData("newSeriesName", "");
                      }}
                    >
                      Select Existing
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="series">Series *</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.seriesId}
                      onValueChange={(value) => {
                        updateFormData("seriesId", value);
                        updateFormData("newSeriesName", "");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select series" />
                      </SelectTrigger>
                      <SelectContent>
                        {seriesList.map((series) => (
                          <SelectItem key={series.series_id} value={String(series.series_id)}>
                            {series.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsCreatingNewSeries(true);
                        updateFormData("seriesId", "");
                      }}
                    >
                      Create New
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="episodeNumber">Episode Number *</Label>
              <Input
                id="episodeNumber"
                type="number"
                value={formData.episodeNumber}
                onChange={(e) => updateFormData("episodeNumber", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="season">Season *</Label>
              {isCreatingNewSeason ? (
                <div className="flex gap-2">
                  <Input
                    id="season"
                    type="number"
                    value={formData.season}
                    onChange={(e) => updateFormData("season", e.target.value)}
                  />
                  {seasonList.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsCreatingNewSeason(false);
                        updateFormData("season", "");
                      }}
                    >
                      Select Existing
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select
                    value={formData.season}
                    onValueChange={(value) => updateFormData("season", value)}
                    disabled={seasonList.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select season" />
                    </SelectTrigger>
                    <SelectContent>
                      {seasonList.map((season) => (
                        <SelectItem key={season.season_id} value={String(season.season_number)}>
                          Season {season.season_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreatingNewSeason(true);
                      updateFormData("season", "");
                    }}
                  >
                    Create New
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => updateFormData("title", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">Year *</Label>
            <Input
              id="year"
              value={formData.year}
              onChange={(e) => updateFormData("year", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            rows={4}
            value={formData.description}
            onChange={(e) => updateFormData("description", e.target.value)}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="genre">Genre *</Label>
            <Select
              value={formData.genre}
              onValueChange={(value) => updateFormData("genre", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select genre" />
              </SelectTrigger>
              <SelectContent>
                {formData.category === "music" ? (
                  <>
                    <SelectItem key="Pop" value="Pop">Pop</SelectItem>
                    <SelectItem key="Rock" value="Rock">Rock</SelectItem>
                    <SelectItem key="Hip Hop" value="Hip Hop">Hip Hop</SelectItem>
                    <SelectItem key="Rap" value="Rap">Rap</SelectItem>
                    <SelectItem key="R&B" value="R&B">R&B</SelectItem>
                    <SelectItem key="Jazz" value="Jazz">Jazz</SelectItem>
                    <SelectItem key="Blues" value="Blues">Blues</SelectItem>
                    <SelectItem key="Country" value="Country">Country</SelectItem>
                    <SelectItem key="Classical" value="Classical">Classical</SelectItem>
                    <SelectItem key="Reggae" value="Reggae">Reggae</SelectItem>
                    <SelectItem key="Soul" value="Soul">Soul</SelectItem>
                    <SelectItem key="Funk" value="Funk">Funk</SelectItem>
                    <SelectItem key="Electronic" value="Electronic">Electronic</SelectItem>
                    <SelectItem key="Dance" value="Dance">Dance</SelectItem>
                    <SelectItem key="House" value="House">House</SelectItem>
                    <SelectItem key="Techno" value="Techno">Techno</SelectItem>
                    <SelectItem key="Trance" value="Trance">Trance</SelectItem>
                    <SelectItem key="Dubstep" value="Dubstep">Dubstep</SelectItem>
                    <SelectItem key="Drum and Bass" value="Drum and Bass">Drum and Bass</SelectItem>
                    <SelectItem key="Metal" value="Metal">Metal</SelectItem>
                    <SelectItem key="Punk" value="Punk">Punk</SelectItem>
                    <SelectItem key="Indie" value="Indie">Indie</SelectItem>
                    <SelectItem key="Alternative" value="Alternative">Alternative</SelectItem>
                    <SelectItem key="Gospel" value="Gospel">Gospel</SelectItem>
                    <SelectItem key="Opera" value="Opera">Opera</SelectItem>
                    <SelectItem key="K-Pop" value="K-Pop">K-Pop</SelectItem>
                    <SelectItem key="Afrobeat" value="Afrobeat">Afrobeat</SelectItem>
                    <SelectItem key="Latin" value="Latin">Latin</SelectItem>
                    <SelectItem key="Salsa" value="Salsa">Salsa</SelectItem>
                    <SelectItem key="Reggaeton" value="Reggaeton">Reggaeton</SelectItem>
                    <SelectItem key="Folk" value="Folk">Folk</SelectItem>
                  </>
                ) : (
                  <>
                    <SelectItem key="Action" value="Action">Action</SelectItem>
                    <SelectItem key="Adventure" value="Adventure">Adventure</SelectItem>
                    <SelectItem key="Comedy" value="Comedy">Comedy</SelectItem>
                    <SelectItem key="Drama" value="Drama">Drama</SelectItem>
                    <SelectItem key="Horror" value="Horror">Horror</SelectItem>
                    <SelectItem key="Romance" value="Romance">Romance</SelectItem>
                    <SelectItem key="Sci-Fi" value="Sci-Fi">Sci-Fi</SelectItem>
                    <SelectItem key="Thriller" value="Thriller">Thriller</SelectItem>
                    <SelectItem key="Documentary" value="Documentary">Documentary</SelectItem>
                    <SelectItem key="Animation" value="Animation">Animation</SelectItem>
                    <SelectItem key="Fantasy" value="Fantasy">Fantasy</SelectItem>
                    <SelectItem key="Crime" value="Crime">Crime</SelectItem>
                    <SelectItem key="Mystery" value="Mystery">Mystery</SelectItem>
                    <SelectItem key="War" value="War">War</SelectItem>
                    <SelectItem key="Western" value="Western">Western</SelectItem>
                    <SelectItem key="Musical" value="Musical">Musical</SelectItem>
                    <SelectItem key="Biography" value="Biography">Biography</SelectItem>
                    <SelectItem key="History" value="History">History</SelectItem>
                    <SelectItem key="Sport" value="Sport">Sport</SelectItem>
                    <SelectItem key="Family" value="Family">Family</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rating">Rating *</Label>
            <Input
              id="rating"
              value={formData.rating}
              onChange={(e) => updateFormData("rating", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="duration">Duration *</Label>
            <Input
              id="duration"
              placeholder="e.g., 120 min"
              value={formData.duration}
              onChange={(e) => updateFormData("duration", e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="mediaFile">Media File *</Label>
            <Input
              id="mediaFile"
              type="file"
              accept="video/*,audio/*"
              onChange={(e) => handleFileChange(e, "file")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="thumbnail">Thumbnail *</Label>
            <Input
              id="thumbnail"
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e, "thumbnail")}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="file1080">1080p Rendition (optional)</Label>
            <Input id="file1080" type="file" accept="video/*" onChange={(e) => handleFileChange(e, "file1080")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file720">720p Rendition (optional)</Label>
            <Input id="file720" type="file" accept="video/*" onChange={(e) => handleFileChange(e, "file720")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file480">480p Rendition (optional)</Label>
            <Input id="file480" type="file" accept="video/*" onChange={(e) => handleFileChange(e, "file480")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file360">360p Rendition (optional)</Label>
            <Input id="file360" type="file" accept="video/*" onChange={(e) => handleFileChange(e, "file360")} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="hlsPlaylist">HLS Playlist (.m3u8 optional)</Label>
            <Input id="hlsPlaylist" type="file" accept="application/vnd.apple.mpegurl,.m3u8" onChange={(e) => handleFileChange(e, "hlsPlaylist")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hlsSegments">HLS Segments (.ts optional)</Label>
            <Input id="hlsSegments" type="file" accept="video/MP2T,.ts" multiple onChange={(e) => handleFileChange(e, "hlsSegments")} />
          </div>
        </div>

        <Button type="submit" disabled={!isFormValid() || isUploading}>
          {isUploading ? "Uploading..." : "Upload Media"}
        </Button>
      </form>
    </div>
  );
}
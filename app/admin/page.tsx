"use client";

import { useRouter } from "next/navigation";
import React, { useState, useEffect } from "react";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollAnimation } from "@/components/scroll-animation";
import {
  Upload,
  Film,
  Tv,
  Music,
  Check,
  Users,
  Settings,
  BarChart3,
  Calendar,
  Trash2,
  List,
  LogOut,
} from "lucide-react";

interface MediaUpload {
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

interface MediaListItem {
  id: string;
  title: string;
  type: "movies" | "series" | "music";
  image: string;
}

interface Subscription {
  user_subscription_id: string;
  users: { name: string | null,email: string | null,phone_number: string | null };
  user_id: string;
  is_active: boolean;
  start_date: string;
  end_date: string;
  subscriptions: {
    cost: string;
    type: string;
  };
}

interface SupportUser {
  user_id: string;
  name: string | null;
  email: string | null;
  phone_number: string | null;
  activeSubscription?: {
    user_subscription_id: string;
    subscription_id: number;
    is_active: boolean | null;
    start_date: string;
    end_date: string;
    subscriptions: { type: string; cost: string };
  } | null;
}

interface SupportSearchResponse {
  user: SupportUser | null;
  subscription: Subscription | null;
}

interface ActivityLogItem {
  id: string;
  userId: string;
  userName: string | null;
  phoneNumber: string | null;
  action: string;
  details: string | null;
  createdAt: string;
}

interface Plan {
  subscription_id: number;
  type: string;
  cost: string;
}

interface AdminAnalyticsResponse {
  revenue: {
    totalRevenue: number;
    monthlyRevenue: number;
    adminShareTotal: number;
    adminShareMonthly: number;
    providerShareTotal: number;
    providerShareMonthly: number;
  };
  userActivity: {
    active: number;
    inactive: number;
    subscriptionBreakdown: Array<{
      subscription_id: number;
      type: string;
      count: number;
    }>;
  };
  providerPerformance: Array<{
    providerId: string;
    providerName: string | null;
    providerEmail: string | null;
    totalViews: number;
    uniqueViews: number;
    minutesConsumed: number;
    revenueEarned: number;
    items: Array<{
      id: string;
      title: string;
      duration: number | null;
      totalViews: number;
      uniqueViews: number;
      minutesConsumed: number;
    }>;
  }>;
}

// Mock Data - Remove this once connected to Prisma

type AdminSection = "upload" | "subscriptions" | "analytics" | "delete" | "plans" | "support";

export default function AdminPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AdminSection>("upload");

  const [formData, setFormData] = useState<MediaUpload>({
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
  const [seriesList, setSeriesList] = useState<
    { name: string; series_id: string }[]
  >([]);
  const [isCreatingNewSeries, setIsCreatingNewSeries] = useState(false);
  const [seasonList, setSeasonList] = useState<
    { season_id: string; season_number: number }[]
  >([]);
  const [isCreatingNewSeason, setIsCreatingNewSeason] = useState(false);
  const [mediaList, setMediaList] = useState<MediaListItem[]>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [isLoadingRevenue, setIsLoadingRevenue] = useState(false);
  const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalyticsResponse | null>(null);
  const [isLoadingAdminAnalytics, setIsLoadingAdminAnalytics] = useState(false);
  const [adminAnalyticsError, setAdminAnalyticsError] = useState<string | null>(null);
  const [supportPhoneNumber, setSupportPhoneNumber] = useState("");
  const [supportSubscriptionId, setSupportSubscriptionId] = useState("");
  const [supportResult, setSupportResult] = useState<SupportSearchResponse | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [supportLoading, setSupportLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // State for adding new plan
  const [showAddPlanDialog, setShowAddPlanDialog] = useState(false);
  const [newPlanType, setNewPlanType] = useState("");
  const [newPlanCostInput, setNewPlanCostInput] = useState("");
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [newPlanCost, setNewPlanCost] = useState<string>("");

  const fetchPlans = async () => {
    try {
      const response = await axios.get<Plan[]>("/api/subscriptions");
      setPlans(response.data);
    } catch (error) {
      console.error("Failed to fetch plans:", error);
      // You could set an error state here to show a message to the user
    }
  };

  const handleLogout = async () => {
    try {
      // This API route clears the httpOnly cookie on the server.
      await axios.post("/api/logout");
      // Redirect to the admin login page after successful logout.
      router.push("/admin-login");
    } catch (error) {
      console.error("An error occurred during logout:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("Logout failed:", error.response.data.message || error.response.statusText);
      }
    }
  };

  useEffect(() => {
    const fetchSubscriptionsAndUsers = async () => {
      try {
        const [subsResponse, usersResponse] = await Promise.all([
          axios.get<Subscription[]>("/api/user_subscriptions"),
          axios.get<{ count: number }>("/api/users"),
        ]);
        setSubscriptions(subsResponse.data);
        setUserCount(usersResponse.data.count);
      } catch (error) {
        console.error("Failed to fetch subscriptions or users:", error);
        // Handle error appropriately, e.g., set an error state
      }
    };

    const fetchRevenue = async () => {
      setIsLoadingRevenue(true);
      try {
        const response = await axios.get<{ totalRevenue: number }>("/api/revenue");
        setTotalRevenue(response.data.totalRevenue || 0);
      } catch (error) {
        console.error("Failed to fetch revenue:", error);
      } finally {
        setIsLoadingRevenue(false);
      }
    };

    const fetchAdminAnalytics = async () => {
      setIsLoadingAdminAnalytics(true);
      setAdminAnalyticsError(null);
      try {
        const response = await axios.get<AdminAnalyticsResponse>("/api/admin/analytics");
        setAdminAnalytics(response.data);
      } catch (error) {
        console.error("Failed to fetch admin analytics:", error);
        setAdminAnalyticsError(
          error instanceof Error ? error.message : "Failed to fetch admin analytics."
        );
      } finally {
        setIsLoadingAdminAnalytics(false);
      }
    };

    if (activeSection === "subscriptions") {
      fetchSubscriptionsAndUsers();
      fetchRevenue();
    }
    if (activeSection === "plans") {
      fetchPlans();
    }
    if (activeSection === "analytics") {
      fetchRevenue();
      fetchAdminAnalytics();
    }
    if (activeSection === "support") {
      setTempPassword(null);
      setSupportError(null);
    }
  }, [activeSection]);

  const revenueStats = adminAnalytics?.revenue;
  const userActivity = adminAnalytics?.userActivity;
  const providerPerformance = adminAnalytics?.providerPerformance ?? [];

  const fetchActivityLogs = async (userId?: string) => {
    setIsLoadingLogs(true);
    try {
      const response = await axios.get<ActivityLogItem[]>("/api/admin/support/logs", {
        params: userId ? { userId } : undefined,
      });
      setActivityLogs(response.data);
    } catch (error) {
      console.error("Failed to fetch activity logs:", error);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleUpdatePlan = async (planId: number) => {
    try {
      await axios.put("/api/subscriptions", {
        subscription_id: planId,
        cost: newPlanCost,
      });

      setEditingPlanId(null);
      fetchPlans();
    } catch (error) {
      console.error("Error updating plan:", error);
      // You could set an error state here to show a message to the user
    }
  };

  const handleAddPlanSubmit = async () => {
    try {
      await axios.post("/api/subscriptions", {
        type: newPlanType,
        cost: parseFloat(newPlanCostInput), // Ensure cost is sent as a number
      });

      setShowAddPlanDialog(false);
      setNewPlanType("");
      setNewPlanCostInput("");
      fetchPlans(); // Refresh the list of plans
    } catch (error) {
      console.error("Error adding new plan:", error);
    }
  };

  const updateFormData = (
    field: keyof MediaUpload,
    value: string | File | File[] | null
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: keyof Pick<MediaUpload, "file" | "thumbnail" | "file1080" | "file720" | "file480" | "file360" | "hlsPlaylist"> | "hlsSegments"
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setTimeout(() => {
        setUploadSuccess(false);
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
      }, 3000);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        setUploadError(error.response.data.error || "Upload failed");
      } else {
        setUploadError(error instanceof Error ? error.message : "An unknown error occurred.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    setDeleteError(null);

    try {
      await axios.delete(`/api/media/${mediaId}`);

      // Remove deleted item from state to update UI
      setMediaList((prevList) =>
        prevList.filter((item) => item.id !== mediaId)
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        setDeleteError(error.response.data.error || "Failed to delete media.");
      } else {
        setDeleteError(error instanceof Error ? error.message : "An unknown error occurred.");
      }
    }
  };

  const handleSupportSearch = async () => {
    setSupportLoading(true);
    setSupportError(null);
    setSupportResult(null);
    setTempPassword(null);

    try {
      const response = await axios.get<SupportSearchResponse>("/api/admin/support/search", {
        params: {
          phoneNumber: supportPhoneNumber || undefined,
          subscriptionId: supportSubscriptionId || undefined,
        },
      });
      setSupportResult(response.data);
      if (response.data.user?.user_id) {
        fetchActivityLogs(response.data.user.user_id);
      }
    } catch (error) {
      console.error("Support search failed:", error);
      setSupportError(
        axios.isAxiosError(error) && error.response?.data?.error
          ? error.response.data.error
          : "Failed to find user."
      );
    } finally {
      setSupportLoading(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    setIsResettingPassword(true);
    setTempPassword(null);
    try {
      const response = await axios.post<{ temporaryPassword: string }>(
        "/api/admin/support/reset-password",
        { userId }
      );
      setTempPassword(response.data.temporaryPassword);
      fetchActivityLogs(userId);
    } catch (error) {
      console.error("Reset password failed:", error);
      setSupportError("Failed to reset password.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleReactivate = async (userId?: string, subscriptionId?: string) => {
    setIsReactivating(true);
    try {
      await axios.post("/api/admin/support/reactivate", {
        userId,
        subscriptionId,
      });
      if (userId) {
        fetchActivityLogs(userId);
      }
    } catch (error) {
      console.error("Reactivate failed:", error);
      setSupportError("Failed to reactivate account.");
    } finally {
      setIsReactivating(false);
    }
  };

  useEffect(() => {
    if (activeSection === "upload" && formData.category === "series") {
      const fetchSeriesAndSeasons = async () => {
        try {
          const [seriesResponse, seasonsResponse] = await Promise.all([
            axios.get<{ series: { name: string; series_id: string }[] }>("/api/series"),
            axios.get<{ seasons: { season_id: string; season_number: number }[] }>("/api/seasons"),
          ]);

          setSeriesList(seriesResponse.data.series || []);
          if (seriesResponse.data.series?.length === 0) {
            setIsCreatingNewSeries(true);
          }

          setSeasonList(seasonsResponse.data.seasons || []);
          if (seasonsResponse.data.seasons?.length === 0) {
            setIsCreatingNewSeason(true);
          }
        } catch (error) {
          console.error(error);
          setUploadError(error instanceof Error ? error.message : "Could not load series or seasons.");
        }
      };
      fetchSeriesAndSeasons();
    } else {
      setIsCreatingNewSeries(false);
      setIsCreatingNewSeason(false);
    }

    if (activeSection === "delete") {
      const fetchAllMedia = async () => {
        setIsLoadingMedia(true);
        setDeleteError(null);
        try {
          const response = await axios.get<{ movies: MediaListItem[], series: MediaListItem[], music: MediaListItem[] }>("/api/media/all");
          // Combine movies, series, and music into one list
          const allMedia: MediaListItem[] = [
            ...response.data.movies,
            ...response.data.series,
            ...response.data.music,
          ];
          setMediaList(allMedia);
        } catch (error) {
          console.error(error);
          setDeleteError(error instanceof Error ? error.message : "Could not load media list.");
        } finally {
          setIsLoadingMedia(false);
        }
      };
      fetchAllMedia();
    }
  }, [formData.category, activeSection]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "movies":
        return <Film className="h-5 w-5" />;
      case "series":
        return <Tv className="h-5 w-5" />;
      case "music":
        return <Music className="h-5 w-5" />;
      default:
        return <Upload className="h-5 w-5" />;
    }
  };

  const sidebarItems = [
    { id: "upload", label: "Media Upload", icon: Upload },
    { id: "subscriptions", label: "User Subscriptions", icon: Users },
    { id: "plans", label: "Available Plans", icon: List },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "support", label: "Support Tools", icon: Users },
    { id: "delete", label: "Delete Media", icon: Trash2 },
  ];

  if (uploadSuccess) {
    return (
      <div className="min-h-screen">
        {/* <Header /> */}
        <main className="pt-20 pb-8">
          <div className="container mx-auto px-4">
            <div className="max-w-md mx-auto text-center">
              <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
                <CardContent className="pt-6">
                  <div className="flex justify-center mb-4">
                    <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
                      <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-green-800 dark:text-green-200 mb-2">
                    Upload Successful!
                  </h2>
                  <p className="text-green-700 dark:text-green-300">
                    Your media has been uploaded and will be available shortly.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* <Header /> */}
      <main className="pt-20 pb-8">
        <div className="container mx-auto px-4">
          <ScrollAnimation className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 text-primary">
              Admin Panel
            </h1>
            <p className="text-lg text-muted-foreground">
              Manage your Tamboko streaming platform content and users.
            </p>
          </ScrollAnimation>

          <div className="flex gap-6">
            {/* Sidebar */}
            <div className="w-64 flex-shrink-0 h-fit">
              <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Admin Menu
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <nav className="space-y-1">
                    {sidebarItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveSection(item.id as AdminSection)}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors ${
                            activeSection === item.id
                              ? "bg-primary/10 text-primary border-r-2 border-primary"
                              : "text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </nav>
                  <div className="mt-2 pt-2 border-t border-border">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content */}
            <div className="flex-1">
              {activeSection === "upload" && (
                <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Upload Media Content
                    </CardTitle>
                    <CardDescription>
                      Fill in the details below to add new movies, series, or
                      music to the platform.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {uploadError && (
                      <div className="mb-4 rounded-lg border border-red-400 bg-red-100 p-3 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
                        <p>
                          <strong>Upload Failed:</strong> {uploadError}
                        </p>
                      </div>
                    )}
                    {/* ... existing form code ... */}
                    <form onSubmit={handleSubmit} className="space-y-6">
                      {/* Category Selection */}
                      <div className="space-y-2">
                        <Label htmlFor="category">Category *</Label>
                        <Select
                          value={formData.category}
                          onValueChange={(value) =>
                            updateFormData(
                              "category",
                              value as MediaUpload["category"]
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select media category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="movies">
                              <div className="flex items-center gap-2">
                                <Film className="h-4 w-4" />
                                Movies
                              </div>
                            </SelectItem>
                            <SelectItem value="series">
                              <div className="flex items-center gap-2">
                                <Tv className="h-4 w-4" />
                                Series
                              </div>
                            </SelectItem>
                            <SelectItem value="music">
                              <div className="flex items-center gap-2">
                                <Music className="h-4 w-4" />
                                Music
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {formData.category === "series" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg border">
                          <div className="space-y-2 md:col-span-2">
                            {isCreatingNewSeries ? (
                              <div>
                                <Label htmlFor="newSeriesName">
                                  New Series Name *
                                </Label>
                                <div className="flex items-center gap-2 mt-2">
                                  <Input
                                    id="newSeriesName"
                                    placeholder="e.g., The Adventures of Tambako"
                                    value={formData.newSeriesName}
                                    onChange={(e) => {
                                      updateFormData(
                                        "newSeriesName",
                                        e.target.value
                                      );
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
                              </div>
                            ) : (
                              <div>
                                <Label htmlFor="series">Series *</Label>
                                <div className="flex items-center gap-2 mt-2">
                                  <Select
                                    value={formData.seriesId}
                                    onValueChange={(value) => {
                                      updateFormData("seriesId", value);
                                      updateFormData("newSeriesName", "");
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select an existing series" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {seriesList.map((series) => (
                                        <SelectItem
                                          key={series.series_id}
                                        value={String(series.series_id)}
                                        >
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
                            <Label htmlFor="episodeNumber">
                              Episode Number *
                            </Label>
                            <Input
                              id="episodeNumber"
                              type="number"
                              placeholder="e.g., 1"
                              value={formData.episodeNumber}
                              onChange={(e) =>
                                updateFormData("episodeNumber", e.target.value)
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="season">Season *</Label>
                            {isCreatingNewSeason ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  id="season"
                                  type="number"
                                  placeholder="e.g., 1"
                                  value={formData.season}
                                  onChange={(e) =>
                                    updateFormData("season", e.target.value)
                                  }
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
                              <div className="flex items-center gap-2">
                                <Select
                                  value={formData.season}
                                  onValueChange={(value) =>
                                    updateFormData("season", value)
                                  }
                                  disabled={seasonList.length === 0}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a season" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {seasonList.map((season) => (
                                      <SelectItem
                                        key={season.season_id}
                                        value={String(season.season_number)}
                                      >
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

                      {/* Basic Information */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="title">Title *</Label>
                          <Input
                            id="title"
                            placeholder="Enter media title"
                            value={formData.title}
                            onChange={(e) =>
                              updateFormData("title", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="year">Year *</Label>
                          <Input
                            id="year"
                            placeholder="e.g., 2024"
                            value={formData.year}
                            onChange={(e) =>
                              updateFormData("year", e.target.value)
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="description">Description *</Label>
                        <Textarea
                          id="description"
                          placeholder="Enter a detailed description of the content"
                          rows={4}
                          value={formData.description}
                          onChange={(e) =>
                            updateFormData("description", e.target.value)
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="genre">Genre *</Label>
                          <Select
                            value={formData.genre}
                            onValueChange={(value) =>
                              updateFormData("genre", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select genre" />
                            </SelectTrigger>
                            <SelectContent>
                              {formData.category === "music" ? (
                                <>
                                  <SelectItem key="Pop" value="Pop">Pop</SelectItem>
                                  <SelectItem key="Rock" value="Rock">Rock</SelectItem>
                                  <SelectItem key="Hip Hop" value="Hip Hop">
                                    Hip Hop
                                  </SelectItem>
                                  <SelectItem key="Rap" value="Rap">Rap</SelectItem>
                                  <SelectItem key="R&B" value="R&B">R&B</SelectItem>
                                  <SelectItem key="Jazz" value="Jazz">Jazz</SelectItem>
                                  <SelectItem key="Blues" value="Blues">Blues</SelectItem>
                                  <SelectItem key="Country" value="Country">
                                    Country
                                  </SelectItem>
                                  <SelectItem key="Classical" value="Classical">
                                    Classical
                                  </SelectItem>
                                  <SelectItem key="Reggae" value="Reggae">Reggae</SelectItem>
                                  <SelectItem key="Soul" value="Soul">Soul</SelectItem>
                                  <SelectItem key="Funk" value="Funk">Funk</SelectItem>
                                  <SelectItem key="Electronic" value="Electronic">
                                    Electronic
                                  </SelectItem>
                                  <SelectItem key="Dance" value="Dance">Dance</SelectItem>
                                  <SelectItem key="House" value="House">House</SelectItem>
                                  <SelectItem key="Techno" value="Techno">Techno</SelectItem>
                                  <SelectItem key="Trance" value="Trance">Trance</SelectItem>
                                  <SelectItem key="Dubstep" value="Dubstep">
                                    Dubstep
                                  </SelectItem>
                                  <SelectItem key="Drum and Bass" value="Drum and Bass">
                                    Drum and Bass
                                  </SelectItem>
                                  <SelectItem key="Metal" value="Metal">Metal</SelectItem>
                                  <SelectItem key="Punk" value="Punk">Punk</SelectItem>
                                  <SelectItem key="Indie" value="Indie">Indie</SelectItem>
                                  <SelectItem key="Alternative" value="Alternative">
                                    Alternative
                                  </SelectItem>
                                  <SelectItem key="Gospel" value="Gospel">Gospel</SelectItem>
                                  <SelectItem key="Opera" value="Opera">Opera</SelectItem>
                                  <SelectItem key="K-Pop" value="K-Pop">K-Pop</SelectItem>
                                  <SelectItem key="Afrobeat" value="Afrobeat">
                                    Afrobeat
                                  </SelectItem>
                                  <SelectItem key="Latin" value="Latin">Latin</SelectItem>
                                  <SelectItem key="Salsa" value="Salsa">Salsa</SelectItem>
                                  <SelectItem key="Reggaeton" value="Reggaeton">
                                    Reggaeton
                                  </SelectItem>
                                  <SelectItem key="Folk" value="Folk">Folk</SelectItem>
                                </>
                              ) : (
                                <>
                                  {" "}
                                  <SelectItem key="Action" value="Action">Action</SelectItem>
                                  <SelectItem key="Adventure" value="Adventure">
                                    Adventure
                                  </SelectItem>
                                  <SelectItem key="Comedy" value="Comedy">Comedy</SelectItem>
                                  <SelectItem key="Drama" value="Drama">Drama</SelectItem>
                                  <SelectItem key="Horror" value="Horror">Horror</SelectItem>
                                  <SelectItem key="Romance" value="Romance">
                                    Romance
                                  </SelectItem>
                                  <SelectItem key="Sci-Fi" value="Sci-Fi">Sci-Fi</SelectItem>
                                  <SelectItem key="Thriller" value="Thriller">
                                    Thriller
                                  </SelectItem>
                                  <SelectItem key="Documentary" value="Documentary">
                                    Documentary
                                  </SelectItem>
                                  <SelectItem key="Animation" value="Animation">
                                    Animation
                                  </SelectItem>
                                  <SelectItem key="Fantasy" value="Fantasy">
                                    Fantasy
                                  </SelectItem>
                                  <SelectItem key="Crime" value="Crime">Crime</SelectItem>
                                  <SelectItem key="Mystery" value="Mystery">
                                    Mystery
                                  </SelectItem>
                                  <SelectItem key="War" value="War">War</SelectItem>
                                  <SelectItem key="Western" value="Western">
                                    Western
                                  </SelectItem>
                                  <SelectItem key="Musical" value="Musical">
                                    Musical
                                  </SelectItem>
                                  <SelectItem key="Biography" value="Biography">
                                    Biography
                                  </SelectItem>
                                  <SelectItem key="History" value="History">
                                    History
                                  </SelectItem>
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
                            placeholder="e.g., 8.5"
                            value={formData.rating}
                            onChange={(e) =>
                              updateFormData("rating", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="duration">Duration *</Label>
                          <Input
                            id="duration"
                            placeholder="e.g., 120 min"
                            value={formData.duration}
                            onChange={(e) =>
                              updateFormData("duration", e.target.value)
                            }
                          />
                        </div>
                      </div>

                      {/* File Uploads */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="mediaFile">Media File *</Label>
                          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                            <input
                              id="mediaFile"
                              type="file"
                              accept="video/*,audio/*"
                              onChange={(e) => handleFileChange(e, "file")}
                              className="hidden"
                            />
                            <label
                              htmlFor="mediaFile"
                              className="cursor-pointer"
                            >
                              <div className="flex flex-col items-center gap-2">
                                {getCategoryIcon(formData.category)}
                                <span className="text-sm font-medium">
                                  {formData.file
                                    ? formData.file.name
                                    : "Click to upload media file"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Supports video and audio files
                                </span>
                              </div>
                            </label>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="file1080">1080p Rendition (optional)</Label>
                            <Input
                              id="file1080"
                              type="file"
                              accept="video/*"
                              onChange={(e) => handleFileChange(e, "file1080")}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="file720">720p Rendition (optional)</Label>
                            <Input
                              id="file720"
                              type="file"
                              accept="video/*"
                              onChange={(e) => handleFileChange(e, "file720")}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="file480">480p Rendition (optional)</Label>
                            <Input
                              id="file480"
                              type="file"
                              accept="video/*"
                              onChange={(e) => handleFileChange(e, "file480")}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="file360">360p Rendition (optional)</Label>
                            <Input
                              id="file360"
                              type="file"
                              accept="video/*"
                              onChange={(e) => handleFileChange(e, "file360")}
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="hlsPlaylist">HLS Playlist (.m3u8 optional)</Label>
                            <Input
                              id="hlsPlaylist"
                              type="file"
                              accept="application/vnd.apple.mpegurl,.m3u8"
                              onChange={(e) => handleFileChange(e, "hlsPlaylist")}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="hlsSegments">HLS Segments (.ts optional)</Label>
                            <Input
                              id="hlsSegments"
                              type="file"
                              accept="video/MP2T,.ts"
                              multiple
                              onChange={(e) => handleFileChange(e, "hlsSegments")}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="thumbnail">Thumbnail Image *</Label>
                          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                            <input
                              id="thumbnail"
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleFileChange(e, "thumbnail")}
                              className="hidden"
                            />
                            <label
                              htmlFor="thumbnail"
                              className="cursor-pointer"
                            >
                              <div className="flex flex-col items-center gap-2">
                                <Upload className="h-5 w-5" />
                                <span className="text-sm font-medium">
                                  {formData.thumbnail
                                    ? formData.thumbnail.name
                                    : "Click to upload thumbnail"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  PNG, JPG up to 10MB
                                </span>
                              </div>
                            </label>
                          </div>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-primary hover:bg-primary/90"
                        disabled={!isFormValid() || isUploading}
                      >
                        {isUploading ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Uploading...
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Upload className="h-4 w-4" />
                            Upload Media
                          </div>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}

              {activeSection === "subscriptions" && (
                <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      User Subscriptions
                    </CardTitle>
                    <CardDescription>
                      Manage and monitor user subscription plans and billing
                      status.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Subscription Stats */}
                      <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-4">
                        <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">
                                Total Users
                              </span>
                            </div>
                            <p className="text-2xl font-bold mt-2">{userCount}</p>
                          </CardContent>
                        </Card>
                        <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              <Check className="h-4 w-4 text-green-500" />
                              <span className="text-sm font-medium">
                                Active
                              </span>
                            </div>
                            <p className="text-2xl font-bold mt-2 text-green-600 text-right">
                              {
                                subscriptions.filter(
                                  (s) => s.is_active === true
                                ).length
                              }
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-red-500" />
                              <span className="text-sm font-medium">
                                Expired
                              </span>
                            </div>
                            <p className="text-2xl font-bold mt-2 text-red-600 text-right">
                              {
                                subscriptions.filter(
                                  (s) => !s.is_active
                                ).length
                              }
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">
                                Revenue
                              </span>
                            </div>
                            <p className="text-2xl font-bold mt-2 text-right h-8 flex justify-end items-center">
                              {isLoadingRevenue ? (
                                <span className="h-full w-24 animate-pulse rounded-md bg-muted/50" />
                              ) : (
                                `K${totalRevenue.toFixed(2)}`
                              )}
                            </p>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Subscriptions Table */}
                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 px-4 py-3 border-b">
                          <h3 className="font-semibold">All Subscriptions</h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-muted/30">
                              <tr>
                                <th className="text-left p-3 font-medium">
                                  User
                                </th>
                                <th className="text-left p-3 font-medium">
                                  Contact
                                </th>
                                <th className="text-left p-3 font-medium">
                                  Plan
                                </th>
                                <th className="text-left p-3 font-medium">
                                  Status
                                </th>
                                <th className="text-left p-3 font-medium">
                                  Next Billing
                                </th>
                                <th className="text-left p-3 font-medium">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {subscriptions.map((subscription) => (
                                <tr
                                  key={subscription.user_subscription_id}
                                  className="border-b hover:bg-muted/20"
                                >
                                  <td className="p-3">
                                    <div>
                                      <p className="font-medium">
                                        {subscription.users.name}
                                      </p>
                                      <p className="text-sm text-muted-foreground" hidden>
                                        ID: {subscription.user_subscription_id}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <div>
                                      <p className="text-sm">
                                        {subscription.users.email}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {subscription.users.phone_number}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <div>
                                      <p className="font-medium">
                                        {subscription.subscriptions.type}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {subscription.subscriptions.cost}
                                      </p>
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <span
                                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                        subscription.is_active === true
                                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                      }`}
                                    >
                                      {subscription.is_active}
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    <p className="text-sm">
                                      {subscription.end_date}
                                    </p>
                                  </td>
                                  <td className="p-3">
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline">
                                        View
                                      </Button>
                                      <Button size="sm" variant="outline">
                                        Edit
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeSection === "plans" && (
                <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <List className="h-5 w-5" />
                        Available Subscription Plans
                      </CardTitle>
                      <CardDescription>
                        View and manage subscription plans.
                      </CardDescription>
                    </div>
                    <AlertDialog
                      open={showAddPlanDialog}
                      onOpenChange={setShowAddPlanDialog}
                    >
                      <AlertDialogTrigger asChild>
                        <Button>Add New Plan</Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Add New Subscription Plan</AlertDialogTitle>
                          <AlertDialogDescription>
                            Enter the details for the new subscription plan.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="planType">Plan Type</Label>
                            <Input
                              id="planType"
                              placeholder="e.g., Premium, Basic"
                              value={newPlanType}
                              onChange={(e) => setNewPlanType(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="planCost">Cost (K)</Label>
                            <Input
                              id="planCost"
                              type="number"
                              step="0.01"
                              placeholder="e.g., 25.00"
                              value={newPlanCostInput}
                              onChange={(e) => setNewPlanCostInput(e.target.value)}
                            />
                          </div>
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleAddPlanSubmit}>
                            Add Plan
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-left p-3 font-medium">
                              Plan Type
                            </th>
                            <th className="text-left p-3 font-medium">Cost</th>
                            <th className="text-right p-3 font-medium">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {plans.map((plan) => (
                            <tr
                              key={plan.subscription_id}
                              className="border-b hover:bg-muted/20"
                            >
                              <td className="p-3 font-medium align-middle">
                                {plan.type}
                              </td>
                              <td className="p-3 align-middle">
                                {editingPlanId === plan.subscription_id ? (
                                  <Input
                                    type="number"
                                    value={newPlanCost}
                                    onChange={(e) =>
                                      setNewPlanCost(e.target.value)
                                    }
                                    className="w-28"
                                    autoFocus
                                  />
                                ) : (
                                  `K${plan.cost}`
                                )}
                              </td>
                              <td className="p-3">
                                <div className="flex gap-2 justify-end">
                                  {editingPlanId === plan.subscription_id ? (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() =>
                                          handleUpdatePlan(plan.subscription_id)
                                        }
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setEditingPlanId(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => { setEditingPlanId(plan.subscription_id); setNewPlanCost(plan.cost.toString()); }}>Edit</Button>
                                      <Button size="sm" variant="destructive" disabled>
                                        Delete
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeSection === "analytics" && (
                <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Analytics Dashboard
                    </CardTitle>
                    <CardDescription>
                      View platform performance metrics and user engagement
                      data.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    {adminAnalyticsError && (
                      <div className="rounded-lg border border-red-400 bg-red-100 p-3 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
                        <p>
                          <strong>Error:</strong> {adminAnalyticsError}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">
                              Total Revenue
                            </span>
                          </div>
                          <p className="text-3xl font-bold mt-2 text-right h-9 flex justify-end items-center">
                            {isLoadingRevenue ? (
                              <span className="h-full w-32 animate-pulse rounded-md bg-muted/50" />
                            ) : (
                              `K${totalRevenue.toFixed(2)}`
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground text-right mt-1">
                            Platform lifetime revenue
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">
                              Active Users
                            </span>
                          </div>
                          <p className="text-3xl font-bold mt-2 text-right h-9 flex justify-end items-center">
                            {isLoadingAdminAnalytics ? (
                              <span className="h-full w-20 animate-pulse rounded-md bg-muted/50" />
                            ) : (
                              userActivity?.active ?? 0
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground text-right mt-1">
                            {userActivity ? `${userActivity.inactive} inactive` : "Loading activity"}
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">
                              Revenue Split
                            </span>
                          </div>
                          <p className="text-3xl font-bold mt-2 text-right h-9 flex justify-end items-center">
                            {isLoadingAdminAnalytics ? (
                              <span className="h-full w-24 animate-pulse rounded-md bg-muted/50" />
                            ) : (
                              `K${(revenueStats?.adminShareTotal ?? 0).toFixed(2)}`
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground text-right mt-1">
                            Admin share (50%)
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">
                              Provider Share
                            </span>
                          </div>
                          <p className="text-3xl font-bold mt-2 text-right h-9 flex justify-end items-center">
                            {isLoadingAdminAnalytics ? (
                              <span className="h-full w-24 animate-pulse rounded-md bg-muted/50" />
                            ) : (
                              `K${(revenueStats?.providerShareTotal ?? 0).toFixed(2)}`
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground text-right mt-1">
                            50% allocated to creators
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">
                              Monthly Revenue
                            </span>
                          </div>
                          <p className="text-3xl font-bold mt-2 text-right h-9 flex justify-end items-center">
                            {isLoadingAdminAnalytics ? (
                              <span className="h-full w-24 animate-pulse rounded-md bg-muted/50" />
                            ) : (
                              `K${(revenueStats?.monthlyRevenue ?? 0).toFixed(2)}`
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground text-right mt-1">
                            Current month
                          </p>
                        </CardContent>
                      </Card>
                      <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">
                              Admin Monthly Share
                            </span>
                          </div>
                          <p className="text-3xl font-bold mt-2 text-right h-9 flex justify-end items-center">
                            {isLoadingAdminAnalytics ? (
                              <span className="h-full w-24 animate-pulse rounded-md bg-muted/50" />
                            ) : (
                              `K${(revenueStats?.adminShareMonthly ?? 0).toFixed(2)}`
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground text-right mt-1">
                            50% of monthly revenue
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,3fr]">
                      <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                        <CardHeader>
                          <CardTitle>User Activity Metrics</CardTitle>
                          <CardDescription>
                            Active vs inactive subscriptions and package mix.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Active Subscriptions</span>
                            <span className="text-lg font-semibold">
                              {isLoadingAdminAnalytics ? "..." : userActivity?.active ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Inactive Subscriptions</span>
                            <span className="text-lg font-semibold">
                              {isLoadingAdminAnalytics ? "..." : userActivity?.inactive ?? 0}
                            </span>
                          </div>
                          <div className="border-t border-border pt-3">
                            <h4 className="text-sm font-semibold mb-3">Package Breakdown</h4>
                            <div className="space-y-2">
                              {isLoadingAdminAnalytics ? (
                                <div className="space-y-2">
                                  <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
                                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted/50" />
                                </div>
                              ) : userActivity?.subscriptionBreakdown.length ? (
                                userActivity.subscriptionBreakdown.map((plan) => (
                                  <div key={plan.subscription_id} className="flex items-center justify-between text-sm">
                                    <span>{plan.type}</span>
                                    <span className="font-semibold">{plan.count}</span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-sm text-muted-foreground">No active subscriptions found.</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                        <CardHeader>
                          <CardTitle>Content Performance Overview</CardTitle>
                          <CardDescription>
                            Provider-level revenue and engagement contribution.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {isLoadingAdminAnalytics ? (
                            <div className="space-y-3">
                              <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
                              <div className="h-4 w-5/6 animate-pulse rounded bg-muted/50" />
                              <div className="h-4 w-4/6 animate-pulse rounded bg-muted/50" />
                            </div>
                          ) : providerPerformance.length ? (
                            providerPerformance.map((provider) => (
                              <div key={provider.providerId} className="rounded-lg border border-border/60 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div>
                                    <p className="text-base font-semibold">
                                      {provider.providerName || "Unnamed Provider"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {provider.providerEmail || "No email provided"}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm text-muted-foreground">Revenue Share</p>
                                    <p className="text-xl font-semibold text-primary">K{provider.revenueEarned.toFixed(2)}</p>
                                  </div>
                                </div>
                                <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                                  <div>
                                    <p className="text-muted-foreground">Total Views</p>
                                    <p className="font-semibold">{provider.totalViews.toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Unique Views</p>
                                    <p className="font-semibold">{provider.uniqueViews.toLocaleString()}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Minutes Consumed</p>
                                    <p className="font-semibold">{provider.minutesConsumed.toLocaleString()}</p>
                                  </div>
                                </div>
                                {provider.items.length > 0 && (
                                  <div className="mt-4">
                                    <h4 className="text-sm font-semibold mb-2">Content Breakdown</h4>
                                    <div className="space-y-2">
                                      {provider.items.map((item) => (
                                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border border-border/40 rounded-md px-3 py-2">
                                          <div>
                                            <p className="font-medium">{item.title}</p>
                                            <p className="text-xs text-muted-foreground">Duration: {item.duration ?? 0} mins</p>
                                          </div>
                                          <div className="flex gap-4 text-xs text-muted-foreground">
                                            <span>Views: {item.totalViews}</span>
                                            <span>Unique: {item.uniqueViews}</span>
                                            <span>Minutes: {item.minutesConsumed.toFixed(2)}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No provider analytics available yet.</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              )}

              {activeSection === "support" && (
                <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Customer Support Tools
                    </CardTitle>
                    <CardDescription>
                      Search users, reset passwords, and reactivate accounts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="supportPhone">MSISDN</Label>
                        <Input
                          id="supportPhone"
                          placeholder="e.g., 260xxxxxxxxx"
                          value={supportPhoneNumber}
                          onChange={(e) => setSupportPhoneNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="supportSubscription">Subscription ID</Label>
                        <Input
                          id="supportSubscription"
                          placeholder="e.g., 12345"
                          value={supportSubscriptionId}
                          onChange={(e) => setSupportSubscriptionId(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={handleSupportSearch} disabled={supportLoading}>
                        {supportLoading ? "Searching..." : "Search User"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSupportPhoneNumber("");
                          setSupportSubscriptionId("");
                          setSupportResult(null);
                          setSupportError(null);
                          setTempPassword(null);
                          setActivityLogs([]);
                        }}
                      >
                        Clear
                      </Button>
                    </div>
                    {supportError && (
                      <div className="rounded-lg border border-red-400 bg-red-100 p-3 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
                        <p>
                          <strong>Error:</strong> {supportError}
                        </p>
                      </div>
                    )}
                    {supportResult?.user && (
                      <Card className="border border-white/10 bg-background/30">
                        <CardHeader>
                          <CardTitle>User Account</CardTitle>
                          <CardDescription>Account integrity controls</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Name</p>
                            <p className="text-lg font-semibold">{supportResult.user.name}</p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <p className="text-sm text-muted-foreground">Email</p>
                              <p className="font-medium">{supportResult.user.email}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">MSISDN</p>
                              <p className="font-medium">{supportResult.user.phone_number}</p>
                            </div>
                          </div>
                          <div className="rounded-md border border-border/60 p-3">
                            <p className="text-sm text-muted-foreground">Active Subscription</p>
                            {supportResult.user.activeSubscription ? (
                              <div className="mt-2 text-sm">
                                <p className="font-semibold">
                                  {supportResult.user.activeSubscription.subscriptions.type}
                                </p>
                                <p className="text-muted-foreground">
                                  Ends: {supportResult.user.activeSubscription.end_date}
                                </p>
                              </div>
                            ) : (
                              <p className="mt-2 text-sm text-muted-foreground">No active subscription</p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button
                              variant="outline"
                              onClick={() => supportResult.user && handleResetPassword(supportResult.user.user_id)}
                              disabled={isResettingPassword}
                            >
                              {isResettingPassword ? "Resetting..." : "Reset Password"}
                            </Button>
                            <Button
                              variant="default"
                              onClick={() => supportResult.user && handleReactivate(supportResult.user.user_id)}
                              disabled={isReactivating}
                            >
                              {isReactivating ? "Reactivating..." : "Reactivate Account"}
                            </Button>
                          </div>
                          {tempPassword && (
                            <div className="rounded-md border border-green-500/40 bg-green-50 p-3 text-green-700">
                              <p className="text-sm font-semibold">Temporary Password</p>
                              <p className="text-lg font-bold tracking-wide">{tempPassword}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    <Card className="border border-white/10 bg-background/30">
                      <CardHeader>
                        <CardTitle>Activity Log</CardTitle>
                        <CardDescription>Recent account actions</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isLoadingLogs ? (
                          <div className="space-y-2">
                            <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
                            <div className="h-4 w-4/6 animate-pulse rounded bg-muted/50" />
                          </div>
                        ) : activityLogs.length > 0 ? (
                          <div className="space-y-3">
                            {activityLogs.map((log) => (
                              <div key={log.id} className="rounded-md border border-border/50 p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="font-semibold">{log.action}</p>
                                    <p className="text-muted-foreground">
                                      {log.userName} • {log.phoneNumber}
                                    </p>
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(log.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                {log.details && (
                                  <p className="mt-2 text-muted-foreground">{log.details}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No activity logs yet.</p>
                        )}
                      </CardContent>
                    </Card>
                  </CardContent>
                </Card>
              )}

              {activeSection === "delete" && (
                <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trash2 className="h-5 w-5" />
                      Delete Media
                    </CardTitle>
                    <CardDescription>
                      Permanently delete media content from the platform. This
                      action cannot be undone.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {deleteError && (
                      <div className="mb-4 rounded-lg border border-red-400 bg-red-100 p-3 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">
                        <p>
                          <strong>Error:</strong> {deleteError}
                        </p>
                      </div>
                    )}
                    {isLoadingMedia ? (
                      <div className="flex justify-center items-center h-40">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                      </div>
                    ) : mediaList.length > 0 ? (
                      <div className="space-y-3">
                        {mediaList.map((media) => (
                          <div
                            key={media.id}
                            className="flex items-center justify-between p-3 border rounded-lg bg-muted/20"
                          >
                            <div className="flex items-center gap-4">
                              <img
                                src={media.image}
                                alt={media.title}
                                className="w-12 h-16 object-cover rounded-md"
                              />
                              <div>
                                <p className="font-semibold">{media.title}</p>
                                <p className="text-sm text-muted-foreground capitalize">
                                  {media.type}
                                </p>
                              </div>
                            </div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Are you absolutely sure?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone. This will
                                    permanently delete the media file{" "}
                                    <span className="font-semibold text-foreground">
                                      {media.title}
                                    </span>{" "}
                                    and its associated data from our servers.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteMedia(media.id)}
                                  >
                                    Continue
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-8">
                        No media found.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

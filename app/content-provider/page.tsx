import { Header } from "@/components/header";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getUserDataFromToken } from "@/lib/auth";
import ContentProviderUploadClient from "@/app/content-provider/ContentProviderUploadClient";
import ContentProviderContentListClient from "@/app/content-provider/ContentProviderContentListClient";

type ContentItem = {
  id: string;
  title: string;
  duration: number | null;
  totalViews: number;
  uniqueViews: number;
  minutesConsumed: number;
  revenueEarned: number;
  monthlyEarnings?: number;
};

type ProviderAnalyticsResponse = {
  analytics: ContentItem[];
  providerTotals?: {
    providerTotalMinutes: number;
    providerMonthlyMinutes: number;
    providerShareTotal: number;
    providerShareMonthly: number;
  };
  message?: string;
  error?: string;
};

export default async function ContentProvider() {
  const user = await getUserDataFromToken()

  // Check if user is logged in and has ContentCreator role
  if (!user || user.role !== "ContentCreator") {
    return (
      <>
        <Header user={user} />
        <main className="pt-24 pb-8">
          <div className="container mx-auto px-4">
            <Card className="border-red-200 dark:border-red-900">
              <CardHeader>
                <CardTitle>Access Denied</CardTitle>
                <CardDescription>Content Provider Dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-red-600 dark:text-red-400">You do not have permission to access the Content Provider Dashboard. Only content creators can view this page.</p>
              </CardContent>
            </Card>
          </div>
        </main>
      </>
    );
  }

  let contentItems: ContentItem[] = [];
  let analyticsError: string | null = null;
  let noContentMessage: string | null = null;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
    const url = baseUrl
      ? `${baseUrl}/api/analytics/provider/${user.userId}`
      : `http://localhost:3000/api/analytics/provider/${user.userId}`;
    const response = await fetch(url, {
      cache: "no-store",
    });
    const data: ProviderAnalyticsResponse = await response.json();

    if (!response.ok || data.error) {
      analyticsError = data.error || "Failed to load analytics.";
    } else {
      contentItems = data.analytics ?? [];
      if (data.message && contentItems.length === 0) {
        noContentMessage = data.message;
      }
    }
  } catch (error) {
    analyticsError = error instanceof Error ? error.message : "Failed to load analytics.";
  }

  // Calculate monthly earnings summary
  const totalMonthlyRevenue = contentItems.reduce(
    (sum, item) => sum + (item.monthlyEarnings ?? item.revenueEarned),
    0
  );
  const totalViews = contentItems.reduce((sum, item) => sum + item.totalViews, 0);
  const totalUniqueViews = contentItems.reduce((sum, item) => sum + item.uniqueViews, 0);
  const totalMinutesConsumed = contentItems.reduce((sum, item) => sum + item.minutesConsumed, 0);

  return (
    <>
      <Header user={user} />
      <main className="pt-24 pb-12">
        <div className="container mx-auto px-4">
          {/* Header Section */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Content Provider Dashboard</h1>
            <p className="text-muted-foreground">Monitor your content performance and earnings</p>
          </div>

          {/* Monthly Earnings Summary */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 mb-8">
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">Monthly Earnings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">K{totalMonthlyRevenue.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">Your 50% share this month</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">Total Views</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalViews.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Across all content</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">Unique Viewers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalUniqueViews.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Individual viewers</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">Total Minutes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalMinutesConsumed.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">Minutes watched</p>
              </CardContent>
            </Card>
          </div>

          {analyticsError && (
            <Card className="border-red-200 dark:border-red-900 mb-6">
              <CardHeader>
                <CardTitle>Analytics Error</CardTitle>
                <CardDescription>Unable to load your analytics right now.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-red-600 dark:text-red-400">{analyticsError}</p>
              </CardContent>
            </Card>
          )}

          <div className="mb-10">
            <ContentProviderUploadClient />
          </div>

          {/* Content Performance Section */}
          <div>
            <h2 className="text-2xl font-bold mb-4">Content Performance</h2>
            <ContentProviderContentListClient
              initialItems={contentItems}
              noContentMessage={noContentMessage}
            />
          </div>
        </div>
      </main>
    </>
  );
}


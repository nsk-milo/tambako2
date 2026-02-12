"use client";

import React, { useMemo, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

type Props = {
  initialItems: ContentItem[];
  noContentMessage: string | null;
};

export default function ContentProviderContentListClient({ initialItems, noContentMessage }: Props) {
  const [items, setItems] = useState<ContentItem[]>(initialItems);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const hasItems = useMemo(() => items.length > 0, [items.length]);

  const handleWithdraw = async (contentId: string) => {
    setWithdrawError(null);
    setWithdrawingId(contentId);

    try {
      await axios.delete(`/api/media/${contentId}`);
      setItems((prev) => prev.filter((item) => item.id !== contentId));
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        setWithdrawError(error.response.data.error);
      } else {
        setWithdrawError(error instanceof Error ? error.message : "Failed to withdraw content.");
      }
    } finally {
      setWithdrawingId(null);
    }
  };

  return (
    <>
      {withdrawError && (
        <Card className="border-red-200 dark:border-red-900 mb-6">
          <CardHeader>
            <CardTitle>Withdraw Error</CardTitle>
            <CardDescription>We could not withdraw your content right now.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-red-600 dark:text-red-400">{withdrawError}</p>
          </CardContent>
        </Card>
      )}

      {!hasItems ? (
        <Card>
          <CardHeader>
            <CardTitle>No Content Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {noContentMessage || "You haven't uploaded any content yet. Start uploading to see analytics here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="truncate">{item.title}</CardTitle>
                    <CardDescription>
                      {item.duration ? `${item.duration} minutes` : "Live content"}
                    </CardDescription>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={withdrawingId === item.id}>
                        {withdrawingId === item.id ? "Withdrawing..." : "Withdraw"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Withdraw this content?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove <span className="font-semibold text-foreground">{item.title}</span> from the platform.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleWithdraw(item.id)}>
                          Confirm Withdraw
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="border-t pt-3">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Views</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total Views</p>
                        <p className="text-lg font-semibold">{item.totalViews.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Unique Views</p>
                        <p className="text-lg font-semibold">{item.uniqueViews.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <h4 className="text-sm font-semibold text-foreground mb-2">Engagement</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <p className="text-muted-foreground">Minutes Consumed</p>
                        <p className="font-semibold">{item.minutesConsumed.toLocaleString()} mins</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-3 bg-accent/30 dark:bg-accent/10 -mx-6 -mb-6 px-6 py-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Revenue (50% Share)</p>
                        <p className="text-2xl font-bold text-primary">K{item.revenueEarned.toFixed(2)}</p>
                        {item.monthlyEarnings !== undefined && (
                          <p className="text-xs text-muted-foreground">Monthly: K{item.monthlyEarnings.toFixed(2)}</p>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>Your earnings</p>
                        <p>this month</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

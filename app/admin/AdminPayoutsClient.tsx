"use client";

import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wallet } from "lucide-react";

// The admin side of creator payouts: the queue of requests, and the approve /
// reject decision on each.
//
// Approving moves no money — it only unlocks the creator's own "send to my
// wallet" button, so the transfer still goes out at their hand, to the wallet
// they named when they asked.

type PayoutStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "processing"
  | "paid"
  | "failed";

type AdminPayout = {
  id: string;
  reference: string;
  providerId: string;
  providerName: string | null;
  providerEmail: string | null;
  amount: number;
  currency: string;
  status: PayoutStatus;
  network: string;
  phoneNumber: string;
  accountName: string;
  transferId: string | null;
  transferStatus: string | null;
  failureReason: string | null;
  adminNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
};

type PayoutListResponse = {
  payouts: AdminPayout[];
  byStatus: Record<PayoutStatus, { count: number; amount: number }>;
  outstandingTotal: number;
};

const FILTERS: { id: PayoutStatus | "all"; label: string }[] = [
  { id: "requested", label: "Awaiting review" },
  { id: "approved", label: "Approved" },
  { id: "processing", label: "Sending" },
  { id: "paid", label: "Paid" },
  { id: "rejected", label: "Rejected" },
  { id: "failed", label: "Failed" },
  { id: "all", label: "All" },
];

const STATUS_STYLES: Record<PayoutStatus, string> = {
  requested: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  processing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paid: "bg-green-500/10 text-green-600 dark:text-green-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const kwacha = (value: number) => `K${value.toFixed(2)}`;

const errorFrom = (error: unknown, fallback: string) =>
  axios.isAxiosError(error) && error.response?.data?.error
    ? (error.response.data.error as string)
    : fallback;

export default function AdminPayoutsClient() {
  const [filter, setFilter] = useState<PayoutStatus | "all">("requested");
  const [data, setData] = useState<PayoutListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Rejection reasons, keyed by payout — a rejection has to carry one. */
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: payload } = await axios.get<PayoutListResponse>("/api/admin/payouts", {
        params: filter === "all" ? {} : { status: filter },
      });
      setData(payload);
    } catch (err) {
      setError(errorFrom(err, "Failed to load payouts."));
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (payout: AdminPayout, action: "approve" | "reject") => {
    const note = notes[payout.id]?.trim() || "";

    if (action === "reject" && !note) {
      setError("Give a reason so the creator knows why it was rejected.");
      return;
    }

    setError(null);
    setNotice(null);
    setBusyId(payout.id);
    try {
      const { data: payload } = await axios.patch<{ message: string }>(
        `/api/admin/payouts/${payout.id}`,
        { action, note }
      );
      setNotice(payload.message);
      setNotes((current) => ({ ...current, [payout.id]: "" }));
      await load();
    } catch (err) {
      setError(errorFrom(err, "Failed to review that payout."));
    } finally {
      setBusyId(null);
    }
  };

  const pending = data?.byStatus.requested;
  const approved = data?.byStatus.approved;
  const paid = data?.byStatus.paid;

  return (
    <Card className="border border-white/10 bg-background/30 backdrop-blur-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Creator Payouts
        </CardTitle>
        <CardDescription>
          Review what creators have asked to cash out. Approving lets them send the payout to
          their own mobile money wallet — no money moves until they do.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Awaiting review</p>
            <p className="text-lg font-semibold">{pending?.count ?? 0}</p>
            <p className="text-xs text-muted-foreground">{kwacha(pending?.amount ?? 0)}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Approved, not sent</p>
            <p className="text-lg font-semibold">{approved?.count ?? 0}</p>
            <p className="text-xs text-muted-foreground">{kwacha(approved?.amount ?? 0)}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Paid out</p>
            <p className="text-lg font-semibold">{paid?.count ?? 0}</p>
            <p className="text-xs text-muted-foreground">{kwacha(paid?.amount ?? 0)}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Still owed</p>
            <p className="text-lg font-semibold text-primary">
              {kwacha(data?.outstandingTotal ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">Requested, approved or sending</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                filter === item.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading payouts...</p>
        ) : !data || data.payouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here right now.</p>
        ) : (
          <ul className="space-y-3">
            {data.payouts.map((payout) => (
              <li key={payout.id} className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold">{kwacha(payout.amount)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[payout.status]
                        }`}
                      >
                        {payout.status}
                      </span>
                    </div>
                    <p className="text-sm">
                      {payout.providerName ?? "Unknown creator"}{" "}
                      <span className="text-muted-foreground">({payout.providerEmail})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pays {payout.accountName} · {payout.network} · {payout.phoneNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested {new Date(payout.requestedAt).toLocaleString()} · ref{" "}
                      {payout.reference}
                    </p>
                    {payout.transferId && (
                      <p className="text-xs text-muted-foreground">
                        Transfer {payout.transferId} · {payout.transferStatus}
                      </p>
                    )}
                    {payout.failureReason && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {payout.failureReason}
                      </p>
                    )}
                    {payout.adminNote && (
                      <p className="text-xs text-muted-foreground">Note: {payout.adminNote}</p>
                    )}
                  </div>

                  {payout.status === "requested" && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === payout.id}
                        onClick={() => review(payout, "approve")}
                      >
                        {busyId === payout.id ? "Working..." : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === payout.id}
                        onClick={() => review(payout, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>

                {payout.status === "requested" && (
                  <Input
                    placeholder="Reason — required to reject, optional on approval"
                    value={notes[payout.id] ?? ""}
                    onChange={(e) =>
                      setNotes((current) => ({ ...current, [payout.id]: e.target.value }))
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

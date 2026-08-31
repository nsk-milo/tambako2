"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Cashing out, from the creator's side.
//
// The three hands a payout passes through are the whole shape of this panel:
// they request, an admin approves, and only then does the "Send to my wallet"
// button appear. Nothing here moves money on its own.

type PayoutStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "processing"
  | "paid"
  | "failed";

type Payout = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  network: string;
  phoneNumber: string;
  accountName: string;
  failureReason: string | null;
  adminNote: string | null;
  statusMessage: string;
  requestedAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
};

type PayoutSummary = {
  totalEarned: number;
  pendingTotal: number;
  paidTotal: number;
  availableBalance: number;
  minimumPayout: number;
  isEligible: boolean;
  hasOpenPayout: boolean;
  currency: string;
  networks: string[];
  defaults: { accountName: string; phoneNumber: string };
  payouts: Payout[];
};

const STATUS_STYLES: Record<PayoutStatus, string> = {
  requested: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  approved: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  processing: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paid: "bg-green-500/10 text-green-600 dark:text-green-400",
  rejected: "bg-red-500/10 text-red-600 dark:text-red-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

const STATUS_LABELS: Record<PayoutStatus, string> = {
  requested: "Awaiting approval",
  approved: "Approved",
  processing: "Sending",
  paid: "Paid",
  rejected: "Rejected",
  failed: "Failed",
};

const kwacha = (value: number) => `K${value.toFixed(2)}`;

const errorFrom = (error: unknown, fallback: string) =>
  axios.isAxiosError(error) && error.response?.data?.error
    ? (error.response.data.error as string)
    : fallback;

export default function ContentProviderPayoutClient() {
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [amount, setAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [network, setNetwork] = useState("");
  const [accountName, setAccountName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // The form is prefilled from the account once, then left alone — refetching
  // must not overwrite what the creator is halfway through typing.
  const prefilled = useRef(false);

  const applySummary = useCallback((data: PayoutSummary) => {
    setSummary(data);
    if (!prefilled.current) {
      prefilled.current = true;
      setPhoneNumber(data.defaults.phoneNumber || "");
      setAccountName(data.defaults.accountName || "");
    }
  }, []);

  const loadSummary = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setIsLoading(true);
      try {
        const { data } = await axios.get<PayoutSummary>("/api/provider/payouts");
        applySummary(data);
        if (!quiet) setError(null);
      } catch (err) {
        if (!quiet) setError(errorFrom(err, "Failed to load your payout balance."));
      } finally {
        if (!quiet) setIsLoading(false);
      }
    },
    [applySummary]
  );

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // A transfer clears at the network's pace, not ours. Poll while one is in
  // flight so the creator sees it land without reloading the page.
  const inFlight = summary?.payouts.find((payout) => payout.status === "processing");

  useEffect(() => {
    if (!inFlight) return;

    const timer = setInterval(async () => {
      try {
        await axios.get(`/api/provider/payouts/${inFlight.id}`);
      } catch {
        // A failed check is not worth surfacing — the next tick tries again.
      }
      loadSummary({ quiet: true });
    }, 10_000);

    return () => clearInterval(timer);
  }, [inFlight, loadSummary]);

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data } = await axios.post<PayoutSummary & { message: string }>(
        "/api/provider/payouts",
        { amount: parsedAmount, phoneNumber, network, accountName }
      );
      setSuccess(data.message);
      setAmount("");
      await loadSummary({ quiet: true });
    } catch (err) {
      setError(errorFrom(err, "Failed to submit your payout request."));
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Sends an approved payout to the wallet, or re-checks one already on its way. */
  const handleSend = async (payout: Payout) => {
    setError(null);
    setSuccess(null);
    setSendingId(payout.id);
    try {
      const { data } =
        payout.status === "approved"
          ? await axios.post<{ message: string }>(`/api/provider/payouts/${payout.id}`)
          : await axios.get<{ message: string }>(`/api/provider/payouts/${payout.id}`);
      setSuccess(data.message);
    } catch (err) {
      setError(errorFrom(err, "Could not send that payout right now."));
    } finally {
      setSendingId(null);
      await loadSummary({ quiet: true });
    }
  };

  const networks = summary?.networks ?? [];
  const canRequest = Boolean(summary?.isEligible) && !summary?.hasOpenPayout;

  return (
    <Card className="mb-8 border-primary/30">
      <CardHeader>
        <CardTitle>Cash Out Your Earnings</CardTitle>
        <CardDescription>
          Request a payout, and once an admin approves it you can send it straight to your
          mobile money wallet.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}

        {isLoading || !summary ? (
          <p className="text-sm text-muted-foreground">Loading balance...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Total Earned</p>
                <p className="text-lg font-semibold">{kwacha(summary.totalEarned)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Awaiting Payout</p>
                <p className="text-lg font-semibold">{kwacha(summary.pendingTotal)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Already Paid</p>
                <p className="text-lg font-semibold">{kwacha(summary.paidTotal)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="text-lg font-semibold text-primary">
                  {kwacha(summary.availableBalance)}
                </p>
              </div>
            </div>

            {!summary.isEligible && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                You need at least{" "}
                <span className="font-semibold text-foreground">
                  {kwacha(summary.minimumPayout)}
                </span>{" "}
                available before you can request a payout. Keep uploading — you have{" "}
                {kwacha(summary.availableBalance)} so far.
              </p>
            )}

            {summary.isEligible && summary.hasOpenPayout && (
              <p className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-sm text-muted-foreground">
                You have a payout in progress. It has to finish before you can request
                another.
              </p>
            )}

            <form onSubmit={handleRequest} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payoutAmount">Amount to cash out</Label>
                  <Input
                    id="payoutAmount"
                    type="number"
                    min={summary.minimumPayout}
                    max={summary.availableBalance}
                    step="0.01"
                    placeholder={`e.g. ${summary.minimumPayout.toFixed(2)}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={!canRequest}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum {kwacha(summary.minimumPayout)}, up to{" "}
                    {kwacha(summary.availableBalance)}.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payoutPhone">Mobile money number</Label>
                  <Input
                    id="payoutPhone"
                    type="tel"
                    placeholder="e.g. 0966123456"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    disabled={!canRequest}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payoutNetwork">Network</Label>
                  <Select value={network} onValueChange={setNetwork} disabled={!canRequest}>
                    <SelectTrigger id="payoutNetwork">
                      <SelectValue placeholder="Choose your network" />
                    </SelectTrigger>
                    <SelectContent>
                      {networks.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payoutName">Name on the wallet</Label>
                  <Input
                    id="payoutName"
                    placeholder="e.g. Chanda Mwansa"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    disabled={!canRequest}
                  />
                </div>
              </div>

              <Button type="submit" disabled={isSubmitting || !canRequest}>
                {isSubmitting ? "Requesting..." : "Request Payout"}
              </Button>
            </form>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Your payout requests</h3>
              {summary.payouts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You have not requested a payout yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {summary.payouts.map((payout) => (
                    <li
                      key={payout.id}
                      className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{kwacha(payout.amount)}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              STATUS_STYLES[payout.status]
                            }`}
                          >
                            {STATUS_LABELS[payout.status]}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {payout.network} · {payout.phoneNumber} ·{" "}
                          {new Date(payout.requestedAt).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">{payout.statusMessage}</p>
                      </div>

                      {(payout.status === "approved" || payout.status === "processing") && (
                        <Button
                          size="sm"
                          variant={payout.status === "approved" ? "default" : "outline"}
                          disabled={sendingId === payout.id}
                          onClick={() => handleSend(payout)}
                        >
                          {sendingId === payout.id
                            ? "Working..."
                            : payout.status === "approved"
                            ? "Send to my wallet"
                            : "Check status"}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

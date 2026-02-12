"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WithdrawalSummary = {
  totalEarned: number;
  withdrawnTotal: number;
  availableBalance: number;
};

export default function ContentProviderWithdrawalClient() {
  const [summary, setSummary] = useState<WithdrawalSummary | null>(null);
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSummary = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get<WithdrawalSummary>("/api/provider/withdraw");
      setSummary(response.data);
    } catch (err) {
      setError(
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : "Failed to load withdrawal balance"
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
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
      const response = await axios.post<WithdrawalSummary & { message: string }>(
        "/api/provider/withdraw",
        { amount: parsedAmount }
      );
      setSummary({
        totalEarned: response.data.totalEarned,
        withdrawnTotal: response.data.withdrawnTotal,
        availableBalance: response.data.availableBalance,
      });
      setSuccess(response.data.message || "Withdrawal request submitted.");
      setAmount("");
    } catch (err) {
      setError(
        axios.isAxiosError(err) && err.response?.data?.error
          ? err.response.data.error
          : "Failed to submit withdrawal request"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="mb-8 border-primary/30">
      <CardHeader>
        <CardTitle>Cash Out Revenue</CardTitle>
        <CardDescription>Withdraw from your generated provider earnings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-600 dark:text-green-400">{success}</p>}

        {isLoading || !summary ? (
          <p className="text-sm text-muted-foreground">Loading balance...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total Earned</p>
              <p className="text-lg font-semibold">K{summary.totalEarned.toFixed(2)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Already Withdrawn</p>
              <p className="text-lg font-semibold">K{summary.withdrawnTotal.toFixed(2)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="text-lg font-semibold text-primary">K{summary.availableBalance.toFixed(2)}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="withdrawAmount">Amount to withdraw</Label>
            <Input
              id="withdrawAmount"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 150.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={isSubmitting || isLoading}>
            {isSubmitting ? "Submitting..." : "Request Cash Out"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

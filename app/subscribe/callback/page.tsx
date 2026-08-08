"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import axios from "axios"
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// Where Flutterwave returns the customer after a hosted authorisation page.
// The redirect proves the customer finished on their side, never that the money
// arrived — so this page asks our own /api/payment verify endpoint, which
// re-queries the charge. If the customer never lands back here, the server's
// reconciliation sweep verifies the same charge and activates the subscription.
// https://developer.flutterwave.com/docs/payment-orchestrator-flow

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 3 * 60 * 1000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Outcome = "checking" | "successful" | "failed" | "timeout"

function CallbackStatus() {
  const searchParams = useSearchParams()
  const reference = searchParams.get("reference")

  const [outcome, setOutcome] = useState<Outcome>("checking")
  const [message, setMessage] = useState("Confirming your payment with your provider…")
  // Survives the re-render that React's dev-mode double effect causes.
  const started = useRef(false)

  const verify = useCallback(async (paymentReference: string) => {
    const deadline = Date.now() + POLL_TIMEOUT_MS

    while (Date.now() < deadline) {
      try {
        const response = await axios.post(
          "/api/payment",
          { action: "verify", reference: paymentReference },
          { validateStatus: (status) => status === 200 || status === 202 }
        )

        if (response.status === 200) {
          setOutcome("successful")
          setMessage(response.data.message || "Your subscription has been activated.")
          return
        }
      } catch (err) {
        // A dropped request says nothing about the charge — keep polling. Only
        // a real answer from our server is terminal.
        if (axios.isAxiosError(err) && !err.response) {
          await sleep(POLL_INTERVAL_MS)
          continue
        }

        setOutcome("failed")
        setMessage(
          axios.isAxiosError(err) && err.response
            ? err.response.data?.message || "Payment could not be verified."
            : "We could not reach the payment service. Please try again."
        )
        return
      }

      await sleep(POLL_INTERVAL_MS)
    }

    setOutcome("timeout")
    setMessage(
      "We haven't had confirmation from your provider yet. If the payment went through, your subscription will activate automatically."
    )
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true

    if (!reference) {
      setOutcome("failed")
      setMessage("This link is missing a payment reference.")
      return
    }

    void verify(reference)
  }, [reference, verify])

  const title =
    outcome === "successful"
      ? "Payment Successful"
      : outcome === "failed"
      ? "Payment Not Completed"
      : outcome === "timeout"
      ? "Still Confirming"
      : "Confirming Payment"

  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md border border-white/10 bg-background/30 backdrop-blur-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {outcome === "checking" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {outcome === "successful" && <CheckCircle className="h-5 w-5 text-green-600" />}
            {outcome === "failed" && <AlertCircle className="h-5 w-5 text-destructive" />}
            {title}
          </CardTitle>
          <CardDescription className="text-foreground/80">{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reference && (
            <p className="text-xs text-muted-foreground">
              Reference: <span className="font-mono">{reference}</span>
            </p>
          )}
          {outcome !== "checking" && (
            <div className="flex gap-3">
              <Button asChild className="flex-1">
                <Link href={outcome === "successful" ? "/" : "/subscribe"}>
                  {outcome === "successful" ? "Start Watching" : "Back to Plans"}
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function SubscribeCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <CallbackStatus />
    </Suspense>
  )
}

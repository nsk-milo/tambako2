"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Phone, Mail, Lock, ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react"
import axios from "axios"

// There is no SMS or email gateway to send a reset link through, so the reset
// happens in-app: the customer confirms the phone number they sign in with
// against the email they registered, and the server hands back a short-lived
// token that authorises setting a new password and nothing else.
type Step = "identify" | "choose-password" | "done"

const MIN_PASSWORD_LENGTH = 6

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("identify")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resetToken, setResetToken] = useState("")
  const [name, setName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const readError = (err: unknown, fallback: string) => {
    if (axios.isAxiosError(err) && err.response) {
      return (err.response.data?.message as string) || fallback
    }
    if (err instanceof Error) return err.message
    return "Failed to connect to the server. Please try again."
  }

  const startOver = () => {
    setStep("identify")
    setResetToken("")
    setNewPassword("")
    setConfirmPassword("")
    setError(null)
  }

  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const { data } = await axios.post<{ resetToken: string; name: string | null }>(
        "/api/forgot-password",
        { phone, email },
      )
      setResetToken(data.resetToken)
      setName(data.name)
      setStep("choose-password")
    } catch (err) {
      setError(readError(err, "We couldn't verify those details."))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword !== confirmPassword) {
      setError("The two passwords don't match.")
      return
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Your password must be at least ${MIN_PASSWORD_LENGTH} characters long.`)
      return
    }

    setIsLoading(true)
    try {
      await axios.post("/api/reset-password", { resetToken, newPassword })
      setStep("done")
    } catch (err) {
      setError(readError(err, "We couldn't update your password."))
    } finally {
      setIsLoading(false)
    }
  }

  const errorBanner = error && (
    <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">Error:</span> {error}
      </p>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 dark:from-slate-900 dark:via-purple-900 dark:to-slate-900 light:from-white light:via-blue-50 light:to-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              tamboko
            </h1>
          </Link>
          {step !== "done" && <p className="text-muted-foreground mt-2">Reset your password</p>}
        </div>

        <Card className="backdrop-blur-sm bg-background/80 border-border/50">
          {step === "identify" && (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-semibold">Forgot password?</CardTitle>
                <CardDescription>
                  Confirm the phone number you sign in with and the email you registered, and you
                  can set a new password right here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {errorBanner}
                <form onSubmit={handleIdentify} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="260970000000"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Registered Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? "Checking..." : "Continue"}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <Link
                    href="/login"
                    className="text-sm text-blue-500 hover:text-blue-400 transition-colors inline-flex items-center"
                  >
                    <ArrowLeft className="mr-1 h-3 w-3" />
                    Back to sign in
                  </Link>
                </div>
              </CardContent>
            </>
          )}

          {step === "choose-password" && (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-semibold">Set a new password</CardTitle>
                <CardDescription>
                  {name ? `Welcome back, ${name}. ` : ""}Choose a new password for {phone}. This
                  step expires in 10 minutes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {errorBanner}
                <form onSubmit={handleSetPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="newPassword"
                        type="password"
                        placeholder="At least 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Repeat your new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? "Saving..." : "Update password"}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={startOver}
                    className="text-sm text-blue-500 hover:text-blue-400 transition-colors inline-flex items-center"
                  >
                    <ArrowLeft className="mr-1 h-3 w-3" />
                    Use a different number
                  </button>
                </div>
              </CardContent>
            </>
          )}

          {step === "done" && (
            <>
              <CardHeader className="text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
                <CardTitle className="text-2xl font-semibold">Password updated</CardTitle>
                <CardDescription>You can now sign in with your new password.</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/login">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    Go to sign in
                  </Button>
                </Link>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

"use client"

import type React from "react"

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Eye, EyeOff, Phone, Lock } from "lucide-react";
import axios from "axios";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("+260 ")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("");

    const cleaned = phone.replace(/[+\s]/g, "");

    try {
      await axios.post("/api/login", {
        phoneNumber: cleaned,
        password: password,
      });

      // Login successful
      router.push("/home"); // Redirect to home page on success
    } catch (err) {
      if (axios.isAxiosError(err) && err.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        setError(err.response.data.message || "Login failed");
      } else if (err instanceof Error) {
        // Something happened in setting up the request that triggered an Error
        setError(err.message);
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-white via-blue-50 to-white dark:from-slate-900 dark:via-blue-900/20 dark:to-slate-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              Tambako
            </h1>
          </Link>
          <p className="text-muted-foreground mt-2">Welcome back to your streaming experience</p>
        </div>

        <Card className="backdrop-blur-sm bg-background/80 border-border/50">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold">Sign in</CardTitle>
            <CardDescription>Enter your phone number and password to access your account</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <p>
                  <span className="font-semibold">Login failed:</span> {error}
                </p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+260 97 123 4567"
                    value={phone}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      const prefix = "+260 ";

                      // Ensure the input always starts with the prefix
                      if (!inputValue.startsWith(prefix)) {
                        return;
                      }

                      // Extract the part after the prefix
                      const numberPart = inputValue.substring(prefix.length);

                      // Allow only digits and limit to 9 digits
                      if (/^\d*$/.test(numberPart) && numberPart.length <= 9) {
                        setPhone(inputValue);
                      }
                    }}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input id="remember" type="checkbox" className="rounded border-border" />
                  <Label htmlFor="remember" className="text-sm text-muted-foreground">
                    Remember me
                  </Label>
                </div>
                <Link href="/forgot-password" className="text-sm text-blue-500 hover:text-blue-400 transition-colors">
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isLoading}>
                {isLoading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Button asChild variant="link" className="font-medium text-blue-500 hover:text-blue-400 hover:no-underline">
                  <Link href="/register">
                    Sign up
                  </Link>
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

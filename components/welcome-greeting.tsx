"use client"

import { useCurrentUser } from "@/hooks/use-current-user"

export function WelcomeGreeting() {
  const user = useCurrentUser()
  return (
    <h1 className="text-5xl md:text-6xl font-extrabold mb-4 drop-shadow-lg">
      Welcome back, {user?.username || "Guest"}
    </h1>
  )
}

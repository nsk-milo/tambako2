"use client"

import { usePathname } from "next/navigation"
import { Header } from "@/components/header"
import type { UserPayload } from "@/lib/auth"

interface MainLayoutProps {
  user: UserPayload | null
  children: React.ReactNode
}

export function MainLayout({ user, children }: MainLayoutProps) {
  const pathname = usePathname()
  const noHeaderPages = ["/login", "/register", "/forgot-password", "/landing"]

  if (noHeaderPages.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <>
      <Header user={user} />
      <main className="pt-24 pb-8">{children}</main>
    </>
  )
}
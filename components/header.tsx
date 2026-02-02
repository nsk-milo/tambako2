"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Logo } from "@/components/logo"
import type { UserPayload } from "@/lib/auth"
import { motion, AnimatePresence } from "framer-motion"
import { SearchBar } from "./search-bar";

const baseNavigation = [
  { name: "Movies", href: "/movies" },
  { name: "Series", href: "/series" },
  { name: "Music", href: "/music" },
  { name: "My List", href: "/my-list" },
  { name: "Profile", href: "/profile" },
]

interface HeaderProps {
  user: UserPayload | null
}

export function Header({ user }: HeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Build navigation based on user role
  const navigation = [
    ...baseNavigation,
    ...(user?.role === "ContentCreator" ? [{ name: "Content Provider", href: "/content-provider" }] : [])
  ]

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.classList.add("overflow-hidden")
    } else {
      document.body.classList.remove("overflow-hidden")
    }
    // Cleanup on component unmount
    return () => {
      document.body.classList.remove("overflow-hidden")
    }
  }, [isMenuOpen])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await fetch("/api/logout", {
        method: "POST",
      })
      router.push("/login")
      // Refresh the page to ensure the user's session is fully cleared from the client.
      router.refresh()
    } catch (error) {
      console.error("Logout failed", error)
      // Optionally, show an error message to the user
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/search-results?q=${encodeURIComponent(searchQuery.trim())}`)
    }
    console.log("Search submitted:", searchQuery)
  }

  // Define which pages should have a transparent header at the top
  const pagesWithTransparentHeader = [
    "/",
    "/home",
    "/movies",
    "/series",
    "/music",
    "/my-list",
    "/admin",
    "/subscribe",
    "/profile",
    "/content-provider"
  ]
  const isTransparentHeaderPage =
    pagesWithTransparentHeader.includes(pathname) || pathname.startsWith("/watch/")
  const showTransparentHeader = isTransparentHeaderPage && !scrolled

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          showTransparentHeader
            ? "bg-transparent border-b border-transparent"
            : "bg-gradient-to-br from-white via-gray-100 to-white dark:from-black dark:via-gray-900 dark:to-black backdrop-blur-md"
            // : "bg-gradient-to-br from-white via-gray-100 to-white dark:from-black dark:via-gray-900 dark:to-black backdrop-blur-md border-b border-border"
        )}
      >
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center text-2xl font-bold text-primary hover:text-primary/80 transition-colors"
            >
              <Logo />
              Tambako 
            </Link>

            <nav
              className="hidden md:flex items-center space-x-1"
              onMouseLeave={() => setHoveredPath(null)}
            >
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "relative rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-primary",
                    pathname === item.href ? "text-primary" : "text-foreground/80"
                  )}
                  onMouseEnter={() => setHoveredPath(item.href)}
                >
                  {item.name}
                  {((hoveredPath && hoveredPath === item.href) ||
                    (!hoveredPath && pathname === item.href)) && (
                    <motion.span
                      className="absolute inset-0 -z-10 bg-accent/50 rounded-md"
                      layoutId="nav-highlight"
                      transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 30,
                      }}
                    />
                  )}
                </Link>
              ))}
            </nav>

            <div className="flex items-center space-x-2 md:space-x-4">
              {/* <form className="hidden md:block" onSubmit={handleSearchSubmit}>
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search..."
                    className="h-9 w-full rounded-md bg-accent/50 pl-9 md:w-[150px] lg:w-[250px] focus-visible:ring-primary transition-all duration-300 ease-in-out focus:w-[200px] lg:focus:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </form> */}

              <SearchBar /> 

              <div className="hidden md:flex items-center space-x-4">
                {user ? (
                  <>
                    <span className="text-sm font-medium text-foreground/80 hidden sm:inline">
                      {user.username}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="hover:bg-primary hover:text-primary-foreground bg-transparent"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                    >
                      {isLoggingOut ? "Logging out..." : "Logout"}
                    </Button>
                  </>
                ) : (
                  <Button asChild variant="outline" size="sm" className="hover:bg-primary hover:text-primary-foreground bg-transparent">
                    <Link href="/login">Login</Link>
                  </Button>
                )}
              </div>

              {/* Hamburger Menu Button */}
              <div className="md:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  aria-label="Toggle menu"
                >
                  <MenuIcon className="h-6 w-6" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-0 z-40 bg-background/95 backdrop-blur-lg md:hidden"
          >
            <div className="container mx-auto px-4 h-full">
              <div className="flex justify-end pt-5 pb-8">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <XIcon className="h-6 w-6" />
                </Button>
              </div>
              <div className="flex flex-col items-center justify-start h-full pt-8 space-y-8 text-center">
                {/* Mobile Search */}
                <form className="w-full max-w-sm" onSubmit={handleSearchSubmit}>
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search..."
                      className="h-10 w-full rounded-md bg-accent/50 pl-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </form>

                {/* Mobile Navigation */}
                <nav className="flex flex-col space-y-6">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="text-2xl font-semibold text-foreground/80 hover:text-primary transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.name}
                    </Link>
                  ))}
                </nav>

                {/* Mobile Auth Buttons */}
                <div className="pt-8">
                  {user ? (
                    <div className="flex flex-col items-center space-y-4">
                      <span className="text-lg font-medium text-foreground/80">
                        {user.username}
                      </span>
                      <Button
                        variant="outline"
                        size="lg"
                        className="hover:bg-primary hover:text-primary-foreground bg-transparent w-48"
                        onClick={() => {
                          handleLogout();
                          setIsMenuOpen(false);
                        }}
                        disabled={isLoggingOut}
                      >
                        {isLoggingOut ? "Logging out..." : "Logout"}
                      </Button>
                    </div>
                  ) : (
                    <Button asChild variant="outline" size="lg" className="hover:bg-primary hover:text-primary-foreground bg-transparent w-48">
                      <Link href="/login" onClick={() => setIsMenuOpen(false)}>Login</Link>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function MenuIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  )
}

function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

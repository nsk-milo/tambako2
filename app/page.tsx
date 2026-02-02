"use client"

import { ScrollAnimation } from "@/components/scroll-animation"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import Link from "next/link";
import { Play, Smartphone, Tv, Monitor, Star } from "lucide-react"
import AnimatedNumber from "@/components/ui/animated-number"





const devices = [
  { icon: Smartphone, name: "Mobile" },
  { icon: Tv, name: "Smart TV" },
  { icon: Monitor, name: "Desktop" },
]

const stats = [
  { value: 10, label: "Active Users", suffix: "M+" },
  { value: 50, label: "Movies & Shows", suffix: "K+" },
  { value: 100, label: "Countries", suffix: "+" },
  { value: 99.9, label: "Uptime", suffix: "%", formatter: (v: number) => v.toFixed(1) },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-100 to-white dark:from-black dark:via-gray-900 dark:to-black">
      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4">
        <div className="container mx-auto text-center">
          <ScrollAnimation className="mb-8">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-hero-float">
              Stream Your Zed Content
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed">
              Discover unlimited entertainment with movies, series, and music all in one place. Your favorite content,
              anywhere, anytime.
            </p>
          </ScrollAnimation>

          <ScrollAnimation delay={200} className="mb-12">
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button asChild size="lg" className="text-lg px-8 py-6 rounded-lg">
                <Link href="/login">
                  <Play className="mr-2 h-5 w-5" />
                  Get Started
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="text-lg px-8 py-6 rounded-lg bg-transparent">
                Learn More
              </Button>
            </div>
          </ScrollAnimation>

          <ScrollAnimation delay={400} className="relative">
            <div className="relative mx-auto max-w-4xl">
              <Image
                src="/banner.jpg"
                alt="Tambako Streaming Platform"
                className="rounded-xl shadow-2xl border border-border"
                width={800}
                height={450}
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-black/30 rounded-xl" />
            </div>
          </ScrollAnimation>
        </div>
      </section>

      {/* Features Section */}
     

      {/* Stats Section */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto">
          <ScrollAnimation className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">Join Millions of Happy Streamers</h2>
          </ScrollAnimation>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <ScrollAnimation key={index} delay={index * 100} animation="fade-up">
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-primary mb-2">
                    <AnimatedNumber value={stat.value} formatter={stat.formatter} />
                    {stat.suffix}
                  </div>
                  <div className="text-muted-foreground">{stat.label}</div>
                </div>
              </ScrollAnimation>
            ))}
          </div>
        </div>
      </section>

      {/* Devices Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto text-center">
          <ScrollAnimation className="mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-foreground">Watch Anywhere, Anytime</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Stream on all your favorite devices with seamless synchronization
            </p>
          </ScrollAnimation>

          <div className="flex justify-center items-center gap-8 md:gap-16">
            {devices.map((device, index) => {
              const Icon = device.icon
              return (
                <ScrollAnimation key={index} delay={index * 150} animation="scale-in">
                  <div className="flex flex-col items-center group">
                    <div className="w-16 h-16 md:w-20 md:h-20 bg-primary/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-8 h-8 md:w-10 md:h-10 text-primary" />
                    </div>
                    <span className="text-sm md:text-base font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                      {device.name}
                    </span>
                  </div>
                </ScrollAnimation>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10">
        <div className="container mx-auto text-center">
          <ScrollAnimation>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">Ready to Start Streaming?</h2>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join millions of users who trust Tambako for their entertainment needs. Start your journey today with our
              flexible plans.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                asChild
                size="lg"
                className="text-lg px-10 py-6 rounded-lg shadow-lg hover:shadow-xl transition-all"
              >
                <Link href="/register">
                  <Play className="mr-2 h-5 w-5" />
                  Register Now
                </Link>
              </Button>
              <div className="flex items-center text-sm text-muted-foreground">
                <Star className="w-4 h-4 text-yellow-500 mr-1" />
                <span>4.9/5 from 50,000+ reviews</span>
              </div>
            </div>
          </ScrollAnimation>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-border">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="w-8 h-8 bg-primary rounded-lg mr-3 flex items-center justify-center">
              <Play className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-primary">Tambako</span>
          </div>
          <p className="text-muted-foreground mb-4">
            Your ultimate streaming destination for movies, series, and music.
          </p>
          <div className="flex justify-center space-x-6 text-sm text-muted-foreground">
            <Button asChild variant="link" className="text-muted-foreground hover:text-primary h-auto p-0 font-normal">
              <Link href="/privacy">Privacy Policy</Link>
            </Button>
            <Button asChild variant="link" className="text-muted-foreground hover:text-primary h-auto p-0 font-normal">
              <Link href="/terms">Terms of Service</Link>
            </Button>
            <Button asChild variant="link" className="text-muted-foreground hover:text-primary h-auto p-0 font-normal">
              <Link href="/contact">Contact Us</Link>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}

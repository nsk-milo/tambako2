"use client"

import type React from "react"
import { useEffect, useRef } from "react"

interface ScrollAnimationProps {
  children: React.ReactNode
  className?: string
  delay?: number
  animation?: "fade-up" | "fade-left" | "scale-in"
}

export function ScrollAnimation({ children, className = "", delay = 0, animation = "fade-up" }: ScrollAnimationProps) {
  const elementRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              const animationClass = `animate-${animation.replace("-", "-")}`
              entry.target.classList.add(animationClass)
            }, delay)
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      },
    )

    if (elementRef.current) {
      observer.observe(elementRef.current)
    }

    return () => observer.disconnect()
  }, [delay, animation])

  return (
    <div ref={elementRef} className={`opacity-0 ${className}`}>
      {children}
    </div>
  )
}

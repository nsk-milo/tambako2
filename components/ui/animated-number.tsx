"use client"

import { useEffect, useRef } from "react"

function useAnimatedCounter(
  ref: React.RefObject<HTMLElement | null>, // 👈 allow null
  endValue: number,
  duration: number = 2000,
  formatter: (value: number) => string
) {
  useEffect(() => {
    const element = ref.current
    if (!element) return

    let startTime: number | null = null
    const startValue = 0

    const animate = (currentTime: number) => {
      if (startTime === null) {
        startTime = currentTime
      }

      const elapsedTime = currentTime - startTime
      const progress = Math.min(elapsedTime / duration, 1)
      const easedProgress = 1 - Math.pow(1 - progress, 3) // easeOutCubic

      const currentValue = easedProgress * (endValue - startValue) + startValue

      element.textContent = formatter(currentValue)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        element.textContent = formatter(endValue)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          requestAnimationFrame(animate)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [ref, endValue, duration, formatter])
}


interface AnimatedNumberProps {
  value: number
  className?: string
  formatter?: (value: number) => string
}

export default function AnimatedNumber({ value, className, formatter = (v) => Math.floor(v).toLocaleString() }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  useAnimatedCounter(ref, value, 2000, formatter)

  return <span ref={ref} className={className}>{formatter(0)}</span>
}
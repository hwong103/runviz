"use client"

import { useEffect, useRef, type RefObject } from "react"

interface UseSwipeToOpenOptions {
  edgeZone?: number
  threshold?: number
  maxVerticalDrift?: number
  onOpen: () => void
  enabled?: boolean
}

export function useSwipeToOpen<T extends HTMLElement>(
  ref: RefObject<T | null>,
  {
    edgeZone = 28,
    threshold = 60,
    maxVerticalDrift = 40,
    onOpen,
    enabled = true,
  }: UseSwipeToOpenOptions
) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const tracking = useRef(false)

  useEffect(() => {
    const el = ref.current

    if (!el || !enabled) {
      return
    }

    function resetGesture() {
      tracking.current = false
      startX.current = null
      startY.current = null
    }

    function onTouchStart(event: TouchEvent) {
      const touch = event.touches[0]

      if (!touch || touch.clientX > edgeZone) {
        return
      }

      startX.current = touch.clientX
      startY.current = touch.clientY
      tracking.current = true
    }

    function onTouchMove(event: TouchEvent) {
      if (!tracking.current || startX.current === null || startY.current === null) {
        return
      }

      const touch = event.touches[0]

      if (!touch) {
        return
      }

      const dx = touch.clientX - startX.current
      const dy = Math.abs(touch.clientY - startY.current)

      if (dy > maxVerticalDrift) {
        resetGesture()
        return
      }

      if (dx >= threshold) {
        resetGesture()
        onOpen()
      }
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: true })
    el.addEventListener("touchend", resetGesture, { passive: true })
    el.addEventListener("touchcancel", resetGesture, { passive: true })

    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", resetGesture)
      el.removeEventListener("touchcancel", resetGesture)
    }
  }, [ref, edgeZone, threshold, maxVerticalDrift, onOpen, enabled])
}

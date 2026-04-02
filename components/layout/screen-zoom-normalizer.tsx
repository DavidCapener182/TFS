'use client'

import { useEffect } from 'react'

/**
 * Normalizes CSS zoom on desktop devices that have fractional devicePixelRatio
 * (typically Windows machines with 125%/150%/175% display scaling).
 *
 * Mac Retina displays report DPR = 2 (integer) and are unaffected.
 * Standard 1× displays report DPR = 1 and are unaffected.
 *
 * When active, sets:
 *   html { zoom: <value>; --app-zoom: <value> }
 *
 * Other components can use var(--app-zoom, 1) to compensate viewport-unit
 * heights (e.g. 100vh / var(--app-zoom, 1)).
 */
export function ScreenZoomNormalizer() {
  useEffect(() => {
    let dprMediaQuery: MediaQueryList | null = null

    function apply() {
      const dpr = window.devicePixelRatio
      const viewportWidth = window.innerWidth
      const isDesktop =
        viewportWidth >= 1024 &&
        window.screen.width >= 1280 &&
        !window.matchMedia('(pointer: coarse)').matches

      const isFractionalDpr = dpr > 1.05 && dpr < 1.95

      if (!isDesktop || !isFractionalDpr) {
        document.documentElement.style.removeProperty('zoom')
        document.documentElement.style.setProperty('--app-zoom', '1')
        listen()
        return
      }

      const zoom = Math.max(0.8, 1 / dpr)

      document.documentElement.style.zoom = String(zoom)
      document.documentElement.style.setProperty('--app-zoom', String(zoom))
      listen()
    }

    function listen() {
      if (dprMediaQuery) {
        dprMediaQuery.removeEventListener('change', apply)
      }
      dprMediaQuery = window.matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`
      )
      dprMediaQuery.addEventListener('change', apply, { once: true })
    }

    apply()

    window.addEventListener('resize', apply)

    return () => {
      window.removeEventListener('resize', apply)
      if (dprMediaQuery) {
        dprMediaQuery.removeEventListener('change', apply)
      }
      document.documentElement.style.removeProperty('zoom')
      document.documentElement.style.setProperty('--app-zoom', '1')
    }
  }, [])

  return null
}

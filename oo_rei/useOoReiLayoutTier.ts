/**
 * useOoReiLayoutTier — single ResizeObserver that maps container width to one
 * of four layout tiers (xs / sm / md / lg) per the responsive-interface plan.
 *
 * REPLACES the three separate ResizeObserver callbacks in OoReiExperience.tsx:
 *   - isMobile (line ~456)
 *   - gaugeOrientation (line ~563)
 *   - hudBandHeight (line ~957)
 *
 * All layout decisions in OoReiExperience.tsx derive from the returned
 * `layoutTier` string. The old booleans are computed from it:
 *   isMobile  → tier === 'xs'
 *   isTablet  → tier === 'sm' || tier === 'md'
 *   gaugeOrientation → tier === 'xs' ? 'horizontal' : 'vertical'
 *   hudBandHeight    → ZONE_HEIGHTS[tier].railH
 *
 * Domain C: no financial logic. Pure UI state.
 *
 * Responsive-interface-plan 2026-05-31 Move 2.
 */

import { type RefObject, useEffect, useState } from 'react'
import { classifyTier, type LayoutTier, ZONE_HEIGHTS } from './ooReiLayout'

/**
 * Attaches a ResizeObserver to `containerRef`. Returns the current layout tier
 * and derived convenience values.
 *
 * @param containerRef - ref to the shell <div> (must be the same element used
 *   for all geometry decisions so there is a single source-of-truth width).
 */
export function useOoReiLayoutTier(containerRef: RefObject<HTMLDivElement | null>): {
  /** The 4-tier layout classification for the current container width. */
  layoutTier: LayoutTier
  /** Convenience: true when layoutTier === 'xs' (phone portrait). */
  isMobile: boolean
  /** Convenience: true when layoutTier === 'sm' or 'md' (phone landscape / tablet). */
  isTablet: boolean
  /** Current rail height in px derived from the tier. */
  hudBandHeight: number
  /** Gauge orientation: vertical on sm/md/lg, horizontal on xs. */
  gaugeOrientation: 'vertical' | 'horizontal'
} {
  const [layoutTier, setLayoutTier] = useState<LayoutTier>('lg')

  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    // Set initial tier synchronously before first paint when possible.
    const initialWidth = el.getBoundingClientRect().width || el.clientWidth
    if (initialWidth > 0) {
      setLayoutTier(classifyTier(initialWidth))
    }

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth
      setLayoutTier(classifyTier(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef])

  const isMobile = layoutTier === 'xs'
  const isTablet = layoutTier === 'sm' || layoutTier === 'md'
  const hudBandHeight = ZONE_HEIGHTS[layoutTier].railH
  const gaugeOrientation: 'vertical' | 'horizontal' =
    layoutTier === 'xs' ? 'horizontal' : 'vertical'

  return { layoutTier, isMobile, isTablet, hudBandHeight, gaugeOrientation }
}

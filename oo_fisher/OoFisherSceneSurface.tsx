'use client'

/**
 * OoFisherSceneSurface — chooses between the 3D scene and the 2D fallback.
 *
 * Strategy:
 *   1. SSR: render neither (the wrapper page is client-only).
 *   2. Client mount: detect WebGL. If available, dynamically load the
 *      OoFisher3DScene (saves ~400KB of three.js from the initial bundle
 *      when WebGL is unavailable). If not available, render the existing
 *      OoFisherWaterCanvas as a graceful fallback.
 *
 * The 3D scene exposes data-testid="oo-fisher-3d-canvas". The legacy 2D
 * canvas exposes data-testid="oo-fisher-canvas". Playwright tests assert
 * on whichever one is mounted. The wrapper sets both on its outer div so
 * tests that probe for the legacy testid still find a hit region.
 */

import { type ReactElement, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'

import { OoFisherWaterCanvas } from './OoFisherWaterCanvas'
import type { CanvasPhase } from './OoFisher3DScene'
import type { DepthTier, FishRarity, GearTier } from './ooFisherMath'

// Dynamic-import the 3D scene so three.js is only fetched when needed and
// SSR doesn't try to render any WebGL code.
const OoFisher3DScene = dynamic(
  async () => {
    const mod = await import('./OoFisher3DScene')
    return { default: mod.OoFisher3DScene }
  },
  { ssr: false },
)

export interface OoFisherSceneSurfaceProps {
  readonly phase: CanvasPhase
  readonly castPower: number
  readonly currentDepth: DepthTier | null
  readonly recentCatchRarity: FishRarity | null
  readonly loadout: {
    readonly rod: GearTier
    readonly boat: GearTier
    readonly bait: GearTier
  }
  readonly reducedMotion: boolean
  readonly tripCatchCount: number
  readonly castsRemaining: number
  readonly targetTileIndex: number | null
  readonly onTileClick: (index: number) => void
  /**
   * Tim 2026-05-24 OO-FISHER L3 — direct-manipulation cast on the hex.
   * Optional; passed through to the 3D scene only (2D fallback ignores).
   */
  readonly onHexPointerDown?: (index: number) => void
  readonly onHexPointerUp?: (index: number) => void
}

/** Detect WebGL availability on the client. Returns false during SSR. */
function detectWebGL(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    return gl !== null
  } catch {
    return false
  }
}

export function OoFisherSceneSurface(props: OoFisherSceneSurfaceProps): ReactElement {
  // `null` = not yet probed (still SSR / first client tick).
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    setWebglAvailable(detectWebGL())
  }, [])

  // Memoize the 2D-only props (the 2D canvas doesn't know about hex tiles).
  const fallback2DProps = useMemo(
    () => ({
      phase: props.phase,
      castPower: props.castPower,
      currentDepth: props.currentDepth,
      recentCatchRarity: props.recentCatchRarity,
      loadout: props.loadout,
      reducedMotion: props.reducedMotion,
      tripCatchCount: props.tripCatchCount,
      castsRemaining: props.castsRemaining,
    }),
    [
      props.phase,
      props.castPower,
      props.currentDepth,
      props.recentCatchRarity,
      props.loadout,
      props.reducedMotion,
      props.tripCatchCount,
      props.castsRemaining,
    ],
  )

  // During SSR or while WebGL is still being probed, render the 2D fallback
  // (it's pure DOM canvas and renders fine in both environments).
  if (webglAvailable === null) {
    return <OoFisherWaterCanvas {...fallback2DProps} />
  }

  if (!webglAvailable) {
    return <OoFisherWaterCanvas {...fallback2DProps} />
  }

  // Pass everything to the 3D scene, including the L3 pointer handlers.
  return <OoFisher3DScene {...props} />
}

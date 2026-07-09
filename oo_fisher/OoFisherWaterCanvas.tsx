'use client'

/**
 * OoFisherWaterCanvas — the hero water-and-boat live-surface.
 *
 * The canvas renders, top → bottom:
 *   1. Sky gradient (top ~10%)
 *   2. Water column (cyan-glass gradient — top 60% of the canvas)
 *   3. SWOOBZ watermark embedded on the water surface (subtle, brand register)
 *   4. Fish swimming horizontally at their depth tier
 *   5. Cast line + lure (rod tip → lure)
 *   6. Boat sprite + rod sprite on the water surface
 *   7. Deck rail (bottom 40%)
 *   8. Power meter (vertical bar on the deck rail, when casting)
 *
 * RG-C5 STRUCTURAL: the catch celebration is a sprite arc + audio chord
 * that is IDENTICAL across rarities. Only the sprite color (read from
 * `RARITY_VISUALS[rarity].rgb`) differs.
 *
 * Performance: rAF discipline.
 *   - State for cast power + reel tension + fish positions held in refs (no
 *     React re-render per frame).
 *   - Fish positions stored in a single typed array (`Float32Array`) of size
 *     `FISH_COUNT * 4` (x, y, vx, depthTier) to avoid per-frame allocation.
 *   - SWOOBZ wordmark drawn from cached Path2D instances.
 *   - DevicePixelRatio capped at 2 for retina sanity.
 *
 * Domain C: presentation only. State + math live in ooFisherProvider +
 * ooFisherMath.
 */
import { type ReactElement, useEffect, useRef } from 'react'

import { type DepthTier, type FishRarity, type GearTier, RARITY_VISUALS } from './ooFisherMath'

// ─── Color tokens ──────────────────────────────────────────────────────────
const T = {
  fontMono: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
  fontBody: 'var(--font-family-body, "Geist", system-ui, sans-serif)',
  // Sky band — dawn cyan-to-dark gradient at top edge (scenic depth fix).
  skyHigh: '#04101a',
  skyTop: '#0a141e',
  skyHorizon: '#0e283a',
  // Horizon line color (faint cyan at D-0).
  horizonLine: 'rgba(0, 240, 255, 0.22)',
  // Sun glow color (low alpha amber radial in the sky).
  sunCore: 'rgba(245, 194, 91, 0.45)',
  sunHalo: 'rgba(245, 194, 91, 0.12)',
  // Water column gradient stops.
  waterShallow: '#0a2d3a',
  waterDeep: '#01121b',
  // Sun reflection scanlines on water (every 4-6th line brighter).
  scanlineBright: 'rgba(245, 194, 91, 0.10)',
  scanlineDim: 'rgba(245, 194, 91, 0.04)',
  // Underwater rocks at D-5 (deepest band).
  rockDark: '#031018',
  rockEdge: 'rgba(255, 255, 255, 0.06)',
  // Rising bubble color (rises from rocks).
  bubble: 'rgba(122, 239, 196, 0.42)',
  bubbleHalo: 'rgba(122, 239, 196, 0.16)',
  // Depth-line dot texture (subtle cyan dots along each D-line).
  depthDot: 'rgba(0, 240, 255, 0.16)',
  // Boat / rod / line.
  boatHull: '#3a4956',
  boatHullDark: '#1d2935',
  boatHullLight: '#5a6a78',
  boatGunwale: 'rgba(255, 255, 255, 0.18)',
  rodWood: '#a07556',
  rodMetal: '#c9d4dd',
  lineColor: 'rgba(255, 255, 255, 0.55)',
  lureColor: '#f5c25b',
  // Accents.
  accent: '#00F0FF',
  accentDim: 'rgba(0, 240, 255, 0.32)',
  accentSubtle: 'rgba(0, 240, 255, 0.18)',
  text: '#f4f6fa',
  textDim: 'rgba(255, 255, 255, 0.40)',
}

// ─── SWOOBZ wordmark watermark (same paths as Pulse / Vault) ──────────────
// The full SW**OO**BZ wordmark embedded in the canvas as a wide watermark.
// Letters static white, low alpha — quiet brand body. OO chains in cyan,
// slightly stronger because OO is the iconic feature.
const LOGO_PATH_S =
  'M211.83,444.31c-27.99,0-55.01-2.8-81.05-8.39-26.05-5.59-50.27-13.99-72.66-25.19-22.39-11.19-41.76-25.4-58.12-42.62l72.33-93.64c12.05,14.65,26.26,26.92,42.62,36.81,16.36,9.9,33.47,17.33,51.34,22.28,17.86,4.95,35.2,7.43,51.99,7.43,9.9,0,18.51-.86,25.83-2.59,7.32-1.72,12.91-4.41,16.79-8.07,3.88-3.65,5.81-8.5,5.81-14.53,0-7.32-2.59-13.56-7.75-18.73-5.17-5.17-13.56-9.79-25.19-13.89-11.63-4.09-27.13-7.85-46.5-11.3l-43.27-8.4c-18.51-3.44-35.95-8.28-52.31-14.53-16.37-6.24-30.9-14.42-43.59-24.54-12.7-10.11-22.6-22.49-29.7-37.13-7.11-14.63-10.66-32.29-10.66-52.96,0-29.27,7.64-53.92,22.93-73.94,15.28-20.02,35.94-35.08,62-45.21C118.72,5.06,147.67,0,179.54,0c42.19,0,79.76,6.68,112.69,20.01,32.94,13.35,60.16,30.79,81.69,52.32l-71.68,92.35c-17.22-18.08-38.43-32.82-63.61-44.24-25.19-11.4-49.4-17.11-72.66-17.11-7.33,0-14,.87-20.02,2.59-6.03,1.72-10.66,4.31-13.89,7.75-3.23,3.45-4.84,7.75-4.84,12.91,0,12.06,6.02,20.89,18.08,26.48,12.05,5.6,28.63,10.77,49.73,15.5l51.02,11.62c23.67,5.17,44.24,11.63,61.68,19.38,17.44,7.75,31.97,17.01,43.59,27.77,11.63,10.77,20.34,23.15,26.16,37.14,5.81,14,8.72,30.03,8.72,48.12,0,29.28-7.65,53.71-22.93,73.29-15.28,19.6-36.06,34.23-62.32,43.92-26.27,9.69-55.97,14.53-89.12,14.53Z'
const LOGO_PATH_W =
  'M641.29,437.85h-164.04L383.61,5.16h134.33l33.58,218.28,11.63,141.43,18.73-125.29L625.15,5.16h154.99l43.27,234.43,18.08,125.29,12.27-141.43L887.34,5.16h134.33l-93.64,432.69h-164.04l-40.04-191.15-21.31-163.39-20.66,163.39-40.69,191.15Z'
const LOGO_PATH_B =
  'M2330.98,270.61c-10.58-16.39-28.02-29.07-52.32-38.11-24.31-9.04-57.16-13.59-98.48-13.59,15.97,0,32.85-1.05,50.71-3.22,17.86-2.17,34.53-6.65,50.08-13.59,15.48-6.86,28.16-17.16,38.03-30.96,9.95-13.8,14.92-32.29,14.92-55.55,0-19.4-4.34-37.47-12.96-54.29-8.62-16.74-22.9-30.19-42.94-40.35-20.03-10.09-47.7-15.13-83-15.13h-231.15v432.67h229.26c30.54,0,57.37-3.36,80.34-10.02,23.05-6.65,41.05-18,53.94-33.9,12.96-15.9,19.4-38.11,19.4-66.54,0-21.92-5.25-41.12-15.83-57.44ZM2167.28,109.15c9.46,0,17.44,1.05,23.89,3.22,6.44,2.17,11.42,5.67,14.85,10.65,3.43,4.97,5.18,11.28,5.18,19.05,0,7.36-1.75,13.38-5.18,18.07-3.43,4.76-8.41,8.19-14.85,10.37-6.44,2.10-14.43,3.22-23.89,3.22h-87.21v-64.58h87.21ZM2216.03,326.15c-7.98,6.02-21.01,9.04-39.09,9.04h-96.87v-71.1h96.87c12.05,0,21.85,1.33,29.42,3.92,7.49,2.59,12.96,6.44,16.46,11.63,3.43,5.11,5.11,11.84,5.11,20.03,0,11.56-3.92,20.45-11.91,26.48Z'
const LOGO_PATH_Z =
  'M2745.91,438.49h-378.44v-90.41l156.29-182.77,61.35-59.41-61.35,3.23h-143.37V5.8h352.61v90.41l-155,177.6-66.52,64.59,66.52-3.24h167.91v103.33Z'
const OO_PATH_1 =
  'M1906.26,5.8v216.35c0,57.8-22.51,112.12-63.37,152.99-40.87,40.86-95.2,63.37-152.99,63.37h-173.18c-16.2,0-32.13-1.77-47.56-5.22,39.62-8.84,76.01-28.74,105.42-58.15,18.23-18.23,32.81-39.15,43.36-61.85h71.96c50.25,0,91.14-40.89,91.14-91.14v-91.13h-264.32c-17.42,0-33.71,4.91-47.56,13.43-26.12,16.03-43.57,44.86-43.57,77.7s17.45,61.67,43.57,77.71c-13.86,8.52-30.15,13.43-47.56,13.43h-101.22c-13.11-28.18-20.02-59.13-20.02-91.14s6.91-62.95,20.02-91.13c10.55-22.71,25.13-43.62,43.36-61.85,29.41-29.41,65.79-49.31,105.42-58.15,15.44-3.45,31.36-5.22,47.56-5.22h389.54Z'
const OO_PATH_2 =
  'M1637.94,222.15c0,32.01-6.9,62.95-20.01,91.14-10.55,22.7-25.13,43.62-43.36,61.85-29.41,29.41-65.79,49.31-105.42,58.15-15.44,3.45-31.36,5.22-47.56,5.22h-389.54v-216.36c0-57.79,22.51-112.12,63.37-152.98,40.87-40.87,95.2-63.37,152.99-63.37h173.18c16.2,0,32.12,1.77,47.56,5.22-39.63,8.84-76.01,28.74-105.42,58.15-18.23,18.23-32.81,39.14-43.36,61.85h-71.96c-50.25,0-91.14,40.88-91.14,91.13v91.14h264.32c17.42,0,33.71-4.91,47.56-13.43,26.11-16.04,43.56-44.87,43.56-77.71,0-25.13-10.22-47.91-26.72-64.41-5.06-5.06-10.71-9.54-16.84-13.29,13.85-8.52,30.15-13.43,47.56-13.43h101.22c13.11,28.18,20.01,59.13,20.01,91.13Z'
const LOGO_BBOX_W = 2745.91
const LOGO_BBOX_H = 444.31

interface CachedLogoPaths {
  letters: Path2D[]
  oo: Path2D[]
}
let cachedLogoPaths: CachedLogoPaths | null = null
function logoPaths(): CachedLogoPaths {
  if (!cachedLogoPaths) {
    cachedLogoPaths = {
      letters: [
        new Path2D(LOGO_PATH_S),
        new Path2D(LOGO_PATH_W),
        new Path2D(LOGO_PATH_B),
        new Path2D(LOGO_PATH_Z),
      ],
      oo: [new Path2D(OO_PATH_1), new Path2D(OO_PATH_2)],
    }
  }
  return cachedLogoPaths
}

// ─── Module-level animation constants (RG-C5 structural pins) ─────────────
const CATCH_ARC_DURATION_MS = 620
const CATCH_FLASH_DECAY_MS = 600
const OO_PULSE_MAX_ALPHA = 0.2

// Cast power meter constants.
const POWER_METER_HEIGHT_FRAC = 0.55

// Fish swimming state — held in a single typed array to avoid GC pressure.
// 6 floats per fish: [x, y, vx, depthTierFloat, rarityIdx, blinkPhase]
const FISH_COUNT = 18
const FISH_STRIDE = 6

// Fish-bob amplitude (Tim immersion brief 2026-05-23 — fish swim with a
// gentle vertical bob, identical amplitude per RG-C5 regardless of rarity).
const FISH_BOB_AMPLITUDE_FRAC = 0.006

// Scenic bubble columns — rise from rocks at D-5. Held in a single typed
// array (5 columns × 4 bubbles each). 4 floats per bubble:
// [xFrac, yFrac, ySpeed, scale].
// Expanded from 3→5 columns per Tim immersion brief 2026-05-23 (deeper
// underwater life — bubbles at D-2..D-5).
const BUBBLE_COLUMNS = 5
const BUBBLES_PER_COLUMN = 4
const BUBBLE_COUNT = BUBBLE_COLUMNS * BUBBLES_PER_COLUMN
const BUBBLE_STRIDE = 4
// Bubble column anchor x-fractions — five columns staggered across the
// canvas (left, mid-left, mid-right, right-of-center, far-right). None
// overlap the boat at x=0.5.
const BUBBLE_COLUMN_X: ReadonlyArray<number> = [0.08, 0.28, 0.66, 0.82, 0.94]
// Sun position (top-right corner area, in canvas-relative coords).
const SUN_X_FRAC = 0.82
const SUN_Y_FRAC = 0.06
const SUN_RADIUS = 32

// ─── Immersion layers (Tim 2026-05-23 brief — RG-C5 structural) ──────────
// All periods, amplitudes, and seeded positions are module-level
// constants. No parameter modulates any of them. Every animation derives
// solely from `now` (the wall clock passed into the draw call).

// Deterministic seed — every random-looking position is pseudo-random via
// this LCG seeded from a fixed value. Same seed every reload → same
// positions every reload. No per-frame randomness.
const IMMERSION_SEED = 0x5b8007a3 // arbitrary fixed seed
// LCG params (numerical recipes — small, fast, good enough for visuals).
function lcg(prev: number): number {
  return (Math.imul(prev, 1103515245) + 12345) | 0
}
function seededFrac(seed: number, idx: number): number {
  let s = seed ^ idx
  for (let i = 0; i < 3; i++) s = lcg(s)
  return ((s >>> 0) % 10000) / 10000
}

// Clouds — 3 distant cloud silhouettes drifting across the sky band.
// Each cloud has [xFracBase, yFracBase, scale, periodMs]. Cloud drifts
// from left to right and wraps; period is the time to cross the canvas
// once. RG-C5: periods are module-const.
const CLOUD_COUNT = 3
const CLOUD_DRIFT_PERIOD_MS_BASE = 60_000 // 60s to cross
const CLOUD_DEFS: ReadonlyArray<{
  readonly yFrac: number
  readonly scale: number
  readonly periodMs: number
  readonly phaseFrac: number
}> = [
  { yFrac: 0.04, scale: 1.0, periodMs: CLOUD_DRIFT_PERIOD_MS_BASE, phaseFrac: 0.12 },
  { yFrac: 0.08, scale: 0.7, periodMs: CLOUD_DRIFT_PERIOD_MS_BASE * 1.3, phaseFrac: 0.58 },
  { yFrac: 0.11, scale: 0.85, periodMs: CLOUD_DRIFT_PERIOD_MS_BASE * 1.7, phaseFrac: 0.84 },
]

// Birds — 3 V-shape silhouettes flying in formation across the sky.
// Each bird has its own y-band + period + phase. RG-C5: periods are
// module-const.
const BIRD_COUNT = 3
const BIRD_DEFS: ReadonlyArray<{
  readonly yFrac: number
  readonly periodMs: number
  readonly phaseFrac: number
  readonly flapPeriodMs: number
  readonly scale: number
}> = [
  { yFrac: 0.05, periodMs: 28_000, phaseFrac: 0.0, flapPeriodMs: 480, scale: 1.0 },
  { yFrac: 0.09, periodMs: 32_000, phaseFrac: 0.35, flapPeriodMs: 520, scale: 0.82 },
  { yFrac: 0.13, periodMs: 36_000, phaseFrac: 0.7, flapPeriodMs: 560, scale: 0.7 },
]

// Wind ripples — gentle horizontal scribble drifting along the waterline.
// 4 ripple "patches" at different x-fractions. Each drifts left-to-right
// over WIND_RIPPLE_PERIOD_MS and wraps.
const WIND_RIPPLE_PATCH_COUNT = 4
const WIND_RIPPLE_PERIOD_MS = 18_000

// Sun glare column — vertical light column under the sun, brightening the
// water surface. The column intensity oscillates with SUN_GLARE_PULSE_MS,
// the horizontal centre drifts subtly with SUN_GLARE_DRIFT_MS.
const SUN_GLARE_PULSE_MS = 5200
const SUN_GLARE_DRIFT_MS = 11_000
const SUN_GLARE_DRIFT_AMPLITUDE_FRAC = 0.02

// God-rays — angled cyan-amber light beams descending diagonally from the
// sun into the water. 4 rays at fixed angles; intensity pulses with
// GOD_RAY_PULSE_MS.
const GOD_RAY_COUNT = 4
const GOD_RAY_PULSE_MS = 7600

// Dust motes — atmospheric specks in the sky band. 14 motes drifting
// slowly. Each has a deterministic origin + period.
const DUST_MOTE_COUNT = 14
const DUST_MOTE_PERIOD_MS = 24_000

// Boat rocking — gentle ±2° oscillation on a slow sine wave. RG-C5: the
// period + amplitude are module-const, independent of game state.
const BOAT_ROCK_PERIOD_MS = 5200
const BOAT_ROCK_AMPLITUDE_RAD = 0.035 // ≈ 2°

// Captain breathing — 1-frame breathing animation. Subtle vertical bob.
const CAPTAIN_BREATH_PERIOD_MS = 3400

const RARITY_ORDER: ReadonlyArray<FishRarity> = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
]

function depthYFraction(depth: number): number {
  // Depth 1 (shallow) → 0.18 of the canvas height
  // Depth 5 (deepest) → 0.55 of the canvas height
  // (the water column ends at ~0.60; depth 5 is just above the bottom).
  const clamped = Math.min(5, Math.max(1, depth))
  return 0.18 + ((clamped - 1) / 4) * 0.37
}

// Rod tier visuals — sprite morphs with rod tier.
const ROD_LENGTHS_BY_TIER: Record<GearTier, number> = {
  bronze: 90,
  silver: 110,
  gold: 130,
  platinum: 150,
  mythic: 170,
}

const ROD_GRIP_COLORS: Record<GearTier, string> = {
  bronze: '#a07556',
  silver: '#c0c0c0',
  gold: '#f5c25b',
  platinum: '#e5e4e2',
  mythic: '#FF8B5A',
}

// Boat tier visuals — hull color shifts with boat tier.
const BOAT_HULL_COLORS: Record<GearTier, string> = {
  bronze: '#2a3540',
  silver: '#3b4756',
  gold: '#4d5664',
  platinum: '#5b6675',
  mythic: '#6d4a36', // mahogany — fancy boat
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface OoFisherWaterCanvasProps {
  /** Trip phase from the controller. */
  readonly phase:
    | 'lobby'
    | 'bet-entry'
    | 'casting'
    | 'line-out'
    | 'fish-on'
    | 'reeling'
    | 'caught'
    | 'missed'
    | 'between-casts'
    | 'trip-settled'
    | 'upgrade-modal'
  /** Live cast power (0-100) — read every frame for the power meter. */
  readonly castPower: number
  /** Current cast's depth tier (1-5) — drives the lure descent. */
  readonly currentDepth: DepthTier | null
  /** Rarity of the most recent catch (null if no catch in progress). */
  readonly recentCatchRarity: FishRarity | null
  /** Gear loadout — drives sprite tier visuals. */
  readonly loadout: { rod: GearTier; boat: GearTier; bait: GearTier }
  /** True when the user prefers reduced motion. */
  readonly reducedMotion: boolean
  /** Trip catches count (visible badge on deck). */
  readonly tripCatchCount: number
  /** Trip casts remaining count (visible badge). */
  readonly castsRemaining: number
}

// ─── Imperative refs the rAF loop reads from ──────────────────────────────

interface FishState {
  readonly data: Float32Array
}

interface BubbleState {
  readonly data: Float32Array
}

interface CanvasRuntimeRefs {
  fish: FishState
  bubbles: BubbleState
  /** Wall time the latest catch fanfare started. 0 if not animating. */
  catchStartedAt: number
  /** Wall time the latest missed event started. 0 if not animating. */
  missStartedAt: number
  /** Cached current props for the rAF reads (single ref → no churn). */
  props: OoFisherWaterCanvasProps
  /** OO-watermark pulse amplitude decay (0-1). */
  brandPulseUntil: number
}

function makeBubbleState(): BubbleState {
  const data = new Float32Array(BUBBLE_COUNT * BUBBLE_STRIDE)
  for (let col = 0; col < BUBBLE_COLUMNS; col++) {
    // Per-column starting depth band — middle columns start deeper
    // (closer to D-5 rocks), edge columns rise from a shallower D-2/D-3
    // band so the underwater scene shows life at multiple depths.
    const colStartDepth = 0.32 + (col % 3) * 0.10 // 0.32 (D-2) → 0.52 (D-5)
    const colDensity = (col % 2 === 0 ? 1.0 : 0.85) // every other column denser
    for (let i = 0; i < BUBBLES_PER_COLUMN; i++) {
      const idx = col * BUBBLES_PER_COLUMN + i
      const base = idx * BUBBLE_STRIDE
      const colX = BUBBLE_COLUMN_X[col] ?? 0.5
      // x jitter ± 0.012 around the column anchor (deterministic via seed)
      data[base + 0] = colX + (seededFrac(IMMERSION_SEED, idx * 7 + 1) - 0.5) * 0.024
      // y starts staggered across the column's depth band.
      data[base + 1] = colStartDepth + 0.30 - (i / BUBBLES_PER_COLUMN) * 0.30
      // speed: yFrac/sec — slow rise (0.03 - 0.06 frac/s), seeded
      data[base + 2] = (0.03 + seededFrac(IMMERSION_SEED, idx * 7 + 3) * 0.03) * colDensity
      // scale: 0.55 - 1.05 (slightly varied per bubble), seeded
      data[base + 3] = 0.55 + seededFrac(IMMERSION_SEED, idx * 7 + 5) * 0.5
    }
  }
  return { data }
}

function makeFishState(): FishState {
  const data = new Float32Array(FISH_COUNT * FISH_STRIDE)
  for (let i = 0; i < FISH_COUNT; i++) {
    const base = i * FISH_STRIDE
    // x in [0, 1] (canvas-relative) — seeded for deterministic startup
    data[base + 0] = seededFrac(IMMERSION_SEED, i * 11 + 1)
    // depth tier 1..5 — distribute fish across depths so the player sees a
    // pool of life at all depths
    const depthTier = 1 + Math.floor(i / (FISH_COUNT / 5))
    data[base + 3] = depthTier
    // y in [0, 1] (canvas-relative) — derived from depth tier + a small
    // per-fish jitter so they don't line up like a ruler
    data[base + 1] = depthYFraction(depthTier) + (seededFrac(IMMERSION_SEED, i * 11 + 3) - 0.5) * 0.03
    // velocity in canvas-units per second (signed). Some swim L→R, some R→L.
    const dirSeed = seededFrac(IMMERSION_SEED, i * 11 + 5)
    const speedSeed = seededFrac(IMMERSION_SEED, i * 11 + 7)
    data[base + 2] = (dirSeed < 0.5 ? -1 : 1) * (0.04 + speedSeed * 0.05)
    // rarity index — deeper fish hint at rarer species (the player learns
    // to associate depth with rarity color)
    const raritySeed = seededFrac(IMMERSION_SEED, i * 11 + 9)
    const rarityHint = Math.min(5, Math.max(0, depthTier - 1 + Math.floor(raritySeed * 2)))
    data[base + 4] = rarityHint
    // blink phase — per-fish offset so the bob doesn't synchronize across
    // the school. RG-C5: amplitude itself is module-const FISH_BOB_AMPLITUDE_FRAC
    data[base + 5] = seededFrac(IMMERSION_SEED, i * 11 + 11) * Math.PI * 2
  }
  return { data }
}

export function OoFisherWaterCanvas(props: OoFisherWaterCanvasProps): ReactElement {
  const { reducedMotion } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const runtimeRef = useRef<CanvasRuntimeRefs>({
    fish: makeFishState(),
    bubbles: makeBubbleState(),
    catchStartedAt: 0,
    missStartedAt: 0,
    props,
    brandPulseUntil: 0,
  })
  const rafRef = useRef<number | null>(null)

  // Sync prop changes into the ref without restarting the rAF.
  useEffect(() => {
    const prev = runtimeRef.current.props
    runtimeRef.current.props = props
    // Trigger animations on phase transitions.
    if (prev.phase !== 'caught' && props.phase === 'caught') {
      runtimeRef.current.catchStartedAt = performance.now()
      runtimeRef.current.brandPulseUntil = performance.now() + 600
    }
    if (prev.phase !== 'missed' && props.phase === 'missed') {
      runtimeRef.current.missStartedAt = performance.now()
    }
    if (prev.phase !== 'line-out' && props.phase === 'line-out') {
      // Reset stale animations when a new cast starts.
      runtimeRef.current.catchStartedAt = 0
      runtimeRef.current.missStartedAt = 0
    }
  }, [props])

  // rAF loop.
  useEffect(() => {
    if (reducedMotion) {
      // Reduced-motion path — draw a single static frame, no rAF loop.
      drawStatic(canvasRef.current, runtimeRef.current)
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    function resize(): void {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let lastFrameMs = performance.now()

    function frame(): void {
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      const W = rect.width
      const H = rect.height
      const now = performance.now()
      const dt = Math.min(64, now - lastFrameMs) / 1000 // seconds, clamped
      lastFrameMs = now

      const rt = runtimeRef.current

      // Tick fish positions.
      tickFish(rt.fish.data, dt)
      // Tick bubble positions (rise + wrap).
      tickBubbles(rt.bubbles.data, dt)

      // Clear.
      ctx.clearRect(0, 0, W, H)

      // Draw scene layers — sky → sun → clouds → birds → dust motes → sun-
      // glare column → water → rocks → bubbles → god-rays → wind ripples →
      // brand → fish → boat/rod/line → deck → UI.
      drawSky(ctx, W, H)
      drawSunGlow(ctx, W, H)
      drawClouds(ctx, W, H, now)
      drawBirds(ctx, W, H, now)
      drawDustMotes(ctx, W, H, now)
      drawSunGlareColumn(ctx, W, H, now)
      drawWaterColumn(ctx, W, H, now)
      drawUnderwaterRocks(ctx, W, H)
      drawBubbleColumns(ctx, W, H, rt.bubbles.data, now)
      drawGodRays(ctx, W, H, now)
      drawWindRipples(ctx, W, H, now)
      drawBrandWatermark(ctx, W, H, now, rt.brandPulseUntil)
      drawFish(ctx, W, H, rt.fish.data, now, rt.props.phase)
      drawCastingScene(ctx, W, H, rt, now)
      drawDeckRail(ctx, W, H, rt.props.loadout)
      drawDeckBadges(ctx, W, H, rt.props.tripCatchCount, rt.props.castsRemaining)
      // Power meter (visible while casting / between-casts).
      if (rt.props.phase === 'casting' || rt.props.phase === 'between-casts') {
        drawPowerMeter(ctx, W, H, rt.props.castPower)
      }
      // Catch celebration (sprite arc + flash + rarity-colored ring).
      if (rt.props.phase === 'caught' && rt.props.recentCatchRarity) {
        drawCatchCelebration(ctx, W, H, now, rt.catchStartedAt, rt.props.recentCatchRarity)
      }
      // Miss feedback (brief water ripple).
      if (rt.props.phase === 'missed') {
        drawMissRipple(ctx, W, H, now, rt.missStartedAt)
      }

      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [reducedMotion])

  return (
    <canvas
      ref={canvasRef}
      data-testid="oo-fisher-canvas"
      style={{
        // Tim 2026-05-26 (image 116) root-cause fix: previously hardcoded
        // `height: 480` shrank the canvasShell parent (which uses `flex: 1`)
        // because intrinsic-sized children win over flex-grow in many flex
        // configurations. The 2D fallback renders during initial client
        // tick BEFORE WebGL detection completes — so canvasShell locked to
        // 480px even on desktop where the 3D scene would later mount full
        // viewport. Result: bet-entry overlay (absolute inset:0) centered
        // in 480px shell, content overflowed into page chrome.
        // Fix: `height: 100%` fills the flex-sized canvasShell parent.
        display: 'block',
        width: '100%',
        height: '100%',
        minHeight: 320,
        background: T.skyTop,
        borderRadius: 18,
        border: `1px solid rgba(255, 255, 255, 0.08)`,
      }}
      aria-hidden="true"
    />
  )
}

// ─── Tick fish positions ─────────────────────────────────────────────────

function tickFish(data: Float32Array, dt: number): void {
  for (let i = 0; i < FISH_COUNT; i++) {
    const base = i * FISH_STRIDE
    let x = data[base + 0] as number
    const vx = data[base + 2] as number
    x += vx * dt
    if (x < -0.05) x = 1.05
    if (x > 1.05) x = -0.05
    data[base + 0] = x
    // Tiny vertical wobble — sine on blinkPhase
    const phase = (data[base + 5] as number) + dt * 1.4
    data[base + 5] = phase
  }
}

// ─── Drawing functions ───────────────────────────────────────────────────

function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  // Sky band — top 18% of the canvas. Vertical gradient:
  //   top:    deep navy (pre-dawn)
  //   middle: lifted cyan-blue
  //   bottom: warmer toward the horizon (sun glow blends in here).
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.18)
  grad.addColorStop(0, T.skyHigh)
  grad.addColorStop(0.55, T.skyTop)
  grad.addColorStop(1, T.skyHorizon)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, H * 0.18)
}

/**
 * Scenic-depth fix: amber sun glow in the upper-right of the sky. Two
 * concentric radial gradients — a tight inner core + a wide halo — sit at
 * a fixed position so the player gets a consistent dawn-light anchor.
 */
function drawSunGlow(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const cx = W * SUN_X_FRAC
  const cy = H * SUN_Y_FRAC
  // Outer halo — wide, very low alpha. Reaches almost to the water line.
  const halo = ctx.createRadialGradient(cx, cy, 4, cx, cy, SUN_RADIUS * 4)
  halo.addColorStop(0, T.sunCore)
  halo.addColorStop(0.4, T.sunHalo)
  halo.addColorStop(1, 'rgba(245, 194, 91, 0.00)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, W, H * 0.25)
  // Inner core — small, brighter.
  const core = ctx.createRadialGradient(cx, cy, 1, cx, cy, SUN_RADIUS)
  core.addColorStop(0, 'rgba(255, 224, 168, 0.80)')
  core.addColorStop(0.6, T.sunCore)
  core.addColorStop(1, 'rgba(245, 194, 91, 0.00)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(cx, cy, SUN_RADIUS, 0, Math.PI * 2)
  ctx.fill()
}

// ─── Immersion layer draws (Tim 2026-05-23) ───────────────────────────────
// All of these functions are pure visual layers. They take only the canvas
// + dimensions + `now` (a wall-clock timestamp). No game-state parameter
// reaches any of them. RG-C5 structural: the periods, amplitudes, and
// positions are module-level constants; nothing in the game (wager, gear,
// streak, rarity) can modulate them. This is enforced by the function
// signatures.

/**
 * Distant cloud silhouettes drifting across the sky band. CLOUD_COUNT
 * clouds, each with a fixed yFrac, scale, and drift period from CLOUD_DEFS.
 * The horizontal position is a wrap-around derived from `now`. Drawn in
 * very low alpha (cloud color matches the dawn-cyan sky so they read as
 * mist).
 */
function drawClouds(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  ctx.save()
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const def = CLOUD_DEFS[i]
    if (def === undefined) continue
    const phase = ((now / def.periodMs) + def.phaseFrac) % 1
    // Clouds start off-canvas-left (x = -0.25) and drift to off-canvas-right
    // (x = 1.25) over their period, then wrap.
    const xFrac = -0.25 + phase * 1.5
    const cx = xFrac * W
    const cy = H * def.yFrac
    const baseRadius = 22 * def.scale
    // Soft cloud body: 4 overlapping ellipses with low alpha — reads as a
    // wispy distant cloud rather than a heavy cumulus.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'
    ctx.beginPath()
    ctx.ellipse(cx, cy, baseRadius * 1.4, baseRadius * 0.55, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx - baseRadius * 0.6, cy + baseRadius * 0.1, baseRadius * 0.8, baseRadius * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx + baseRadius * 0.7, cy + baseRadius * 0.05, baseRadius * 0.9, baseRadius * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
    // Subtle warm sun-side highlight (clouds catching the dawn light).
    ctx.fillStyle = 'rgba(245, 220, 168, 0.06)'
    ctx.beginPath()
    ctx.ellipse(cx + baseRadius * 0.4, cy - baseRadius * 0.15, baseRadius * 0.7, baseRadius * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * V-shape silhouette birds flying slowly across the sky. Each bird has its
 * own period + phase + y-band from BIRD_DEFS. Wing-flap is a fast sine on
 * flapPeriodMs. RG-C5: all periods are module-const.
 */
function drawBirds(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(20, 30, 42, 0.55)'
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  for (let i = 0; i < BIRD_COUNT; i++) {
    const def = BIRD_DEFS[i]
    if (def === undefined) continue
    const phase = ((now / def.periodMs) + def.phaseFrac) % 1
    const xFrac = -0.1 + phase * 1.2
    const cx = xFrac * W
    const cy = H * def.yFrac
    // Wing-flap angle — open/closed cycle. Range: 0.18 to 0.55 rad.
    const flap = 0.18 + (Math.sin((now / def.flapPeriodMs) * Math.PI * 2) * 0.5 + 0.5) * 0.37
    const span = 9 * def.scale
    // Left wing
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx - span, cy + span * Math.sin(flap))
    ctx.stroke()
    // Right wing
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + span, cy + span * Math.sin(flap))
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Atmospheric dust motes drifting slowly through the sky band. Each mote
 * is a tiny cyan speck with a low-alpha glow. Positions derive from
 * deterministic seed × `now` so the motes drift but never use random()
 * per frame.
 */
function drawDustMotes(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  ctx.save()
  for (let i = 0; i < DUST_MOTE_COUNT; i++) {
    // Each mote has its own drift period derived from its index so they
    // don't all move in lock-step.
    const period = DUST_MOTE_PERIOD_MS * (0.6 + seededFrac(IMMERSION_SEED, i * 19 + 1) * 1.0)
    const phaseOffset = seededFrac(IMMERSION_SEED, i * 19 + 3)
    const phase = ((now / period) + phaseOffset) % 1
    // Drift diagonally — x scrolls slowly, y oscillates gently.
    const xFrac = (phase + seededFrac(IMMERSION_SEED, i * 19 + 5) * 0.3) % 1
    const yFracBase = 0.02 + seededFrac(IMMERSION_SEED, i * 19 + 7) * 0.14
    const yWobble = Math.sin(now / 3200 + i * 0.7) * 0.006
    const cx = xFrac * W
    const cy = (yFracBase + yWobble) * H
    const alpha = 0.10 + Math.sin(now / 2400 + i) * 0.04
    ctx.fillStyle = `rgba(0, 240, 255, ${alpha.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(cx, cy, 0.9, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Vertical sun-glare column under the sun, brightening the water surface
 * directly below the sun position. Intensity pulses with SUN_GLARE_PULSE_MS;
 * the column's horizontal centre drifts slightly with SUN_GLARE_DRIFT_MS.
 * This sits above the water reflection scanlines and below the fish.
 */
function drawSunGlareColumn(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  const baseCx = W * SUN_X_FRAC
  const drift =
    Math.sin((now / SUN_GLARE_DRIFT_MS) * Math.PI * 2) * SUN_GLARE_DRIFT_AMPLITUDE_FRAC
  const cx = baseCx + drift * W
  const top = H * 0.18 // water surface
  const bottom = H * 0.58 // just above the deck rail
  const halfWidth = W * 0.11
  // Intensity pulse: 0.6..1.0 range
  const pulse = 0.6 + (Math.sin((now / SUN_GLARE_PULSE_MS) * Math.PI * 2) * 0.5 + 0.5) * 0.4
  ctx.save()
  // Gradient: bright amber at top (where sun reflects), fading to nothing
  // at the bottom.
  const grad = ctx.createLinearGradient(0, top, 0, bottom)
  grad.addColorStop(0, `rgba(255, 224, 168, ${(0.18 * pulse).toFixed(3)})`)
  grad.addColorStop(0.5, `rgba(245, 194, 91, ${(0.08 * pulse).toFixed(3)})`)
  grad.addColorStop(1, 'rgba(245, 194, 91, 0)')
  ctx.fillStyle = grad
  // Slight diagonal taper — the column widens slightly as it descends.
  ctx.beginPath()
  ctx.moveTo(cx - halfWidth * 0.6, top)
  ctx.lineTo(cx + halfWidth * 0.6, top)
  ctx.lineTo(cx + halfWidth, bottom)
  ctx.lineTo(cx - halfWidth, bottom)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * Angled god-rays descending diagonally from the sun into the water.
 * GOD_RAY_COUNT beams at fixed angles. Each beam is a low-alpha cyan-amber
 * gradient that fades into the deep water. Intensity pulses with
 * GOD_RAY_PULSE_MS. Drawn over the water column.
 */
function drawGodRays(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  const sunX = W * SUN_X_FRAC
  const sunY = H * SUN_Y_FRAC
  const waterTop = H * 0.18
  const waterBottom = H * 0.58
  // Pulse 0.55..1.0
  const pulse = 0.55 + (Math.sin((now / GOD_RAY_PULSE_MS) * Math.PI * 2) * 0.5 + 0.5) * 0.45
  ctx.save()
  // Composite mode "screen" so the rays add light rather than overpaint.
  ctx.globalCompositeOperation = 'screen'
  for (let i = 0; i < GOD_RAY_COUNT; i++) {
    // Each ray descends at a slightly different angle. The leftmost ray
    // descends almost vertically; the rightmost ray descends at ~30°.
    const angleFrac = (i + 0.5) / GOD_RAY_COUNT
    // Angle from vertical (radians): 0 = straight down, +0.5 = leaning right
    const angle = -0.7 + angleFrac * 0.9
    // Ray hits the water at this x:
    const waterHitX = sunX + Math.tan(angle) * (waterTop - sunY)
    // Ray exits at this x (lower in the water — angled outward):
    const exitX = sunX + Math.tan(angle) * (waterBottom - sunY)
    const rayWidth = 36 + i * 6
    // Gradient along the ray from waterTop → waterBottom
    const grad = ctx.createLinearGradient(waterHitX, waterTop, exitX, waterBottom)
    grad.addColorStop(0, `rgba(245, 220, 168, ${(0.14 * pulse).toFixed(3)})`)
    grad.addColorStop(0.5, `rgba(0, 240, 255, ${(0.06 * pulse).toFixed(3)})`)
    grad.addColorStop(1, 'rgba(0, 240, 255, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(waterHitX - rayWidth * 0.35, waterTop)
    ctx.lineTo(waterHitX + rayWidth * 0.35, waterTop)
    ctx.lineTo(exitX + rayWidth * 0.65, waterBottom)
    ctx.lineTo(exitX - rayWidth * 0.65, waterBottom)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Wind ripples — gentle horizontal scribble lines drifting along the
 * waterline. WIND_RIPPLE_PATCH_COUNT patches at fixed y-bands just below
 * the surface. Each patch drifts L→R over WIND_RIPPLE_PERIOD_MS and wraps.
 * Drawn in low-alpha white so they read as wind-driven surface texture.
 */
function drawWindRipples(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  const waterTop = H * 0.18
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
  ctx.lineWidth = 0.8
  ctx.lineCap = 'round'
  for (let patch = 0; patch < WIND_RIPPLE_PATCH_COUNT; patch++) {
    // y-band: 0..3 px below the surface, staggered per patch.
    const yOff = (patch % 3) * 2 + 1
    const y = waterTop + yOff
    // Period offset per patch so they don't drift in unison.
    const phase = ((now / WIND_RIPPLE_PERIOD_MS) + patch * 0.27) % 1
    const xStart = -0.15 + phase * 1.3
    const patchWidth = 0.18
    // Patch x-range in canvas coords
    const x0 = xStart * W
    const x1 = (xStart + patchWidth) * W
    if (x1 < 0 || x0 > W) continue
    // Draw a sequence of short horizontal dashes — each one a slight wave.
    const dashCount = 6
    for (let d = 0; d < dashCount; d++) {
      const dashT = d / dashCount
      const dashX = x0 + (x1 - x0) * dashT
      const dashLen = 14
      if (dashX < -dashLen || dashX > W) continue
      // Wave the dash with a sine to give it texture.
      const wave = Math.sin(now / 500 + patch + d) * 0.6
      ctx.beginPath()
      ctx.moveTo(dashX, y + wave)
      ctx.lineTo(dashX + dashLen, y + wave * -0.5)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawWaterColumn(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  const top = H * 0.18
  const bottom = H * 0.6
  const grad = ctx.createLinearGradient(0, top, 0, bottom)
  grad.addColorStop(0, T.waterShallow)
  grad.addColorStop(1, T.waterDeep)
  ctx.fillStyle = grad
  ctx.fillRect(0, top, W, bottom - top)

  // Horizon line (D-0) — faint cyan line at the water surface. This is the
  // visual anchor between sky + water Tim asked for.
  ctx.save()
  ctx.strokeStyle = T.horizonLine
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, top)
  ctx.lineTo(W, top)
  ctx.stroke()
  ctx.restore()

  // Sun reflection scanlines on the water surface. Every 4th scanline is
  // brighter (the sun column), the rest are dim ambient ripple lines.
  // The sun-column x-range is computed from SUN_X_FRAC so the reflection
  // visually descends from the sun.
  ctx.save()
  const sunX = W * SUN_X_FRAC
  const sunReflectHalfWidth = W * 0.18
  for (let row = 0; row < 40; row++) {
    const y = top + 4 + row * 6
    if (y > bottom - 4) break
    const xL = Math.max(0, sunX - sunReflectHalfWidth + Math.sin(now / 1100 + row) * 4)
    const xR = Math.min(W, sunX + sunReflectHalfWidth + Math.cos(now / 1300 + row) * 4)
    ctx.strokeStyle = row % 4 === 0 ? T.scanlineBright : T.scanlineDim
    ctx.lineWidth = row % 4 === 0 ? 1.2 : 0.8
    ctx.beginPath()
    ctx.moveTo(xL, y)
    ctx.lineTo(xR, y)
    ctx.stroke()
  }
  ctx.restore()

  // Depth lines (D-1..D-5 dividers) with cyan-dot texture.
  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
  ctx.lineWidth = 1
  for (let tier = 1; tier <= 5; tier++) {
    const y = H * depthYFraction(tier)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  // Textured cyan dots along each depth line — gives the lines a stippled
  // feel and reinforces the "this is a measured depth" reading.
  ctx.fillStyle = T.depthDot
  for (let tier = 1; tier <= 5; tier++) {
    const y = H * depthYFraction(tier)
    // 20 dots evenly spread, each 2px wide. Slight stagger per tier.
    const stagger = (tier % 2) * 6
    for (let x = 16 + stagger; x < W - 16; x += 36) {
      ctx.beginPath()
      ctx.arc(x, y, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Depth labels on the left edge.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.30)'
  ctx.font = `9px ${T.fontMono.replace(/var\([^)]+\),\s*/, '')}`
  for (let tier = 1; tier <= 5; tier++) {
    const y = H * depthYFraction(tier)
    ctx.fillText(`D-${tier}`, 8, y - 3)
  }
  ctx.restore()
}

/**
 * Underwater rock silhouettes at the deepest depth band (D-5). Three rocks
 * of varying width sit along the bottom of the water column. Pure dark
 * silhouettes — give depth context without distracting from the fish.
 */
function drawUnderwaterRocks(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  const rockBaseY = H * 0.595 // just above the deck waterline
  // Three rocks: left-narrow, center-wide, right-medium.
  const rocks: ReadonlyArray<{ readonly cx: number; readonly w: number; readonly h: number }> = [
    { cx: W * 0.14, w: W * 0.18, h: 26 },
    { cx: W * 0.5, w: W * 0.26, h: 36 },
    { cx: W * 0.84, w: W * 0.22, h: 30 },
  ]
  ctx.save()
  for (const r of rocks) {
    const x0 = r.cx - r.w / 2
    const x1 = r.cx + r.w / 2
    const y0 = rockBaseY - r.h
    ctx.fillStyle = T.rockDark
    ctx.beginPath()
    ctx.moveTo(x0, rockBaseY)
    // Bumpy rock silhouette — three control points across the top.
    ctx.quadraticCurveTo(r.cx - r.w * 0.3, y0 + r.h * 0.2, r.cx - r.w * 0.15, y0)
    ctx.quadraticCurveTo(r.cx, y0 - r.h * 0.15, r.cx + r.w * 0.15, y0)
    ctx.quadraticCurveTo(r.cx + r.w * 0.3, y0 + r.h * 0.2, x1, rockBaseY)
    ctx.lineTo(x0, rockBaseY)
    ctx.closePath()
    ctx.fill()
    // Top highlight — thin edge ridge.
    ctx.strokeStyle = T.rockEdge
    ctx.lineWidth = 0.8
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Slow-rising bubble columns. Each bubble drifts upward, wraps to the
 * bottom on reaching the surface. The columns are anchored at fixed x
 * fractions (left, mid-right, far-right) — chosen so they don't overlap
 * the boat or the lure path.
 */
function drawBubbleColumns(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  data: Float32Array,
  now: number,
): void {
  ctx.save()
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const base = i * BUBBLE_STRIDE
    const xFrac = data[base + 0] as number
    const yFrac = data[base + 1] as number
    const scale = data[base + 3] as number
    // Wobble: sine on time + index → bubbles drift left/right slightly.
    const wobble = Math.sin(now / 600 + i) * 0.004
    const cx = (xFrac + wobble) * W
    const cy = yFrac * H
    // Alpha fades as bubble approaches the surface (yFrac → 0.18) so they
    // don't pop out of the water visually.
    const t = Math.max(0, Math.min(1, (yFrac - 0.18) / 0.4))
    const halo = T.bubbleHalo.replace(/0\.16\)/, `${(0.16 * t).toFixed(3)})`)
    const body = T.bubble.replace(/0\.42\)/, `${(0.42 * t).toFixed(3)})`)
    // Halo
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(cx, cy, 5 * scale, 0, Math.PI * 2)
    ctx.fill()
    // Body
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.arc(cx, cy, 2.6 * scale, 0, Math.PI * 2)
    ctx.fill()
    // Hi-light
    ctx.fillStyle = `rgba(255, 255, 255, ${0.28 * t})`
    ctx.beginPath()
    ctx.arc(cx - 0.8 * scale, cy - 0.8 * scale, 0.9 * scale, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function tickBubbles(data: Float32Array, dt: number): void {
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const base = i * BUBBLE_STRIDE
    const speed = data[base + 2] as number
    let y = (data[base + 1] as number) - speed * dt
    if (y < 0.16) {
      // Wrap to the bottom of this column's depth band. The x-jitter is
      // derived deterministically from the bubble index so the column
      // pattern is consistent across reloads (RG-C5 — no per-frame
      // randomness, no Math.random in the rAF tick).
      const col = Math.floor(i / BUBBLES_PER_COLUMN)
      const colX = BUBBLE_COLUMN_X[col] ?? 0.5
      // Re-seed using the bubble index AND a coarse time-bucket so the
      // x jitter shifts over very long timescales (5+ minutes per
      // bucket), preserving variety without per-frame randomness.
      const bucket = Math.floor(performance.now() / 300_000) | 0
      data[base + 0] = colX + (seededFrac(IMMERSION_SEED ^ bucket, i * 13 + 1) - 0.5) * 0.024
      y = 0.58
    }
    data[base + 1] = y
  }
}

function drawBrandWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  now: number,
  brandPulseUntil: number,
): void {
  const paths = logoPaths()
  // Embed the wordmark across the water column — centered horizontally,
  // vertically sitting at ~30% from the top (in the shallow-water band).
  const targetW = W * 0.92
  const scale = targetW / LOGO_BBOX_W
  const targetH = LOGO_BBOX_H * scale
  const x = (W - targetW) / 2
  const y = H * 0.28 - targetH / 2

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)

  // Static white letters (low alpha).
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
  for (const path of paths.letters) {
    ctx.fill(path)
  }

  // OO chains — cyan, with a pulse on catch.
  const pulseRemain = brandPulseUntil - now
  const pulseFrac = pulseRemain > 0 ? pulseRemain / 600 : 0
  const ooAlpha = 0.07 + pulseFrac * OO_PULSE_MAX_ALPHA
  ctx.fillStyle = `rgba(0, 240, 255, ${ooAlpha})`
  for (const path of paths.oo) {
    ctx.fill(path)
  }
  ctx.restore()
}

function drawFish(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  data: Float32Array,
  now: number,
  phase: OoFisherWaterCanvasProps['phase'],
): void {
  // Fish hide during the casting/reel phase to reduce visual clutter — the
  // player's focus should be on the line / bobber / reeling overlay.
  const muted = phase === 'reeling' || phase === 'fish-on'
  for (let i = 0; i < FISH_COUNT; i++) {
    const base = i * FISH_STRIDE
    const xFrac = data[base + 0] as number
    const yFrac = data[base + 1] as number
    const phaseOffset = data[base + 5] as number
    // Vertical bob — sine wave at a per-fish phase offset, identical
    // amplitude (FISH_BOB_AMPLITUDE_FRAC) for every fish regardless of
    // rarity (RG-C5: amplitude is module-const). The phase offset is
    // derived from a deterministic seed, so the school doesn't pulse in
    // unison but the per-fish behavior is reproducible.
    const bob = Math.sin(now / 1400 + phaseOffset) * FISH_BOB_AMPLITUDE_FRAC
    const cx = xFrac * W
    const cy = (yFrac + bob) * H
    const rarityIdx = Math.min(5, Math.max(0, Math.round(data[base + 4] as number)))
    const rarity = RARITY_ORDER[rarityIdx] ?? 'common'
    const v = RARITY_VISUALS[rarity]
    drawFishSprite(ctx, cx, cy, v.rgb, muted, (data[base + 2] as number) > 0)
  }
}

function drawFishSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rgb: string,
  muted: boolean,
  facingRight: boolean,
): void {
  const alpha = muted ? 0.16 : 0.74
  const bodyW = 16
  const bodyH = 8
  ctx.save()
  ctx.translate(cx, cy)
  if (!facingRight) ctx.scale(-1, 1)

  // Body (filled ellipse)
  ctx.fillStyle = `rgba(${rgb}, ${alpha})`
  ctx.beginPath()
  ctx.ellipse(0, 0, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2)
  ctx.fill()

  // Tail (triangle)
  ctx.beginPath()
  ctx.moveTo(-bodyW / 2, 0)
  ctx.lineTo(-bodyW / 2 - 6, -4)
  ctx.lineTo(-bodyW / 2 - 6, 4)
  ctx.closePath()
  ctx.fill()

  // Eye dot
  ctx.fillStyle = `rgba(0, 20, 30, ${alpha + 0.1})`
  ctx.beginPath()
  ctx.arc(bodyW / 2 - 3, -1.5, 1.2, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

function drawCastingScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  rt: CanvasRuntimeRefs,
  now: number,
): void {
  // Boat sprite is centered horizontally on the water surface (~y = 0.18H).
  // The boat sits proudly above the surface so it reads as the foreground.
  const surfaceY = H * 0.18
  const boatCenterX = W * 0.5

  // Boat rocking — gentle ±BOAT_ROCK_AMPLITUDE_RAD oscillation on a slow
  // sine. RG-C5: period + amplitude are module-const, independent of game
  // state (rarity, streak, payout). We rotate around the boat's centre on
  // the waterline so the bow lifts and the stern dips as a real boat
  // would.
  const rockAngle = Math.sin((now / BOAT_ROCK_PERIOD_MS) * Math.PI * 2) * BOAT_ROCK_AMPLITUDE_RAD
  ctx.save()
  ctx.translate(boatCenterX, surfaceY)
  ctx.rotate(rockAngle)
  ctx.translate(-boatCenterX, -surfaceY)
  drawBoatSprite(ctx, boatCenterX, surfaceY, rt.props.loadout.boat, now)
  ctx.restore()

  // Rod sprite extends from the stern (right) side of the boat. We compute
  // the rod base in the ROCKED frame: the boat rocks, so the rod base
  // moves with it. Translate the stern anchor through the same rotation.
  const sternOffsetX = 60
  const sternOffsetY = -22
  const cosR = Math.cos(rockAngle)
  const sinR = Math.sin(rockAngle)
  const rodBaseX = boatCenterX + sternOffsetX * cosR - sternOffsetY * sinR
  const rodBaseY = surfaceY + sternOffsetX * sinR + sternOffsetY * cosR
  const rodLen = ROD_LENGTHS_BY_TIER[rt.props.loadout.rod]
  // Rod angle: rises while casting (lift toward sky), drops while line-out.
  const isCasting = rt.props.phase === 'casting'
  const isLineOut =
    rt.props.phase === 'line-out' || rt.props.phase === 'fish-on' || rt.props.phase === 'reeling'
  let rodAngle = -0.7 // default raised angle
  if (isLineOut) rodAngle = 0.25 // tip pointing into the water
  if (isCasting) {
    // Pull-back angle proportional to cast power — at full power the rod
    // is pulled almost vertical (player's last frame before launching).
    const pull = Math.min(100, Math.max(0, rt.props.castPower)) / 100
    rodAngle = -1.1 + pull * 0.55
  }
  // Add the boat's rock angle so the rod inherits the boat's tilt.
  const effectiveRodAngle = rodAngle + rockAngle
  const tipX = rodBaseX + Math.cos(effectiveRodAngle) * rodLen
  const tipY = rodBaseY + Math.sin(effectiveRodAngle) * rodLen
  drawRodSprite(ctx, rodBaseX, rodBaseY, tipX, tipY, rt.props.loadout.rod)

  // Line + lure (if in-water).
  if (isLineOut && rt.props.currentDepth !== null) {
    const depth = rt.props.currentDepth
    const lureY = H * depthYFraction(depth)
    const lureX = tipX + 8
    // Subtle wave on the line.
    ctx.save()
    ctx.strokeStyle = T.lineColor
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    const segments = 8
    for (let s = 1; s <= segments; s++) {
      const t = s / segments
      const lx = tipX + (lureX - tipX) * t
      const ly = tipY + (lureY - tipY) * t + Math.sin(now / 250 + t * 4) * 1.5
      ctx.lineTo(lx, ly)
    }
    ctx.stroke()
    ctx.restore()

    // Lure / bobber sprite at the lure end.
    drawLureSprite(ctx, lureX, lureY, rt.props.phase === 'fish-on', now)
  }
}

function drawBoatSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  surfaceY: number,
  boat: GearTier,
  now: number,
): void {
  const hullColor = BOAT_HULL_COLORS[boat]
  // Larger boat — Tim's complaint was "no fisher boat visible". We bump
  // the hull width from 110 → 160, height from 28 → 42, and lift the
  // sprite slightly above the surface so the boat sits proudly on the
  // water rather than blending into the gradient.
  const hullWidth = 160
  const hullHeight = 42
  const hullX = cx - hullWidth / 2
  const hullY = surfaceY - 14 // bow raised above the horizon line

  ctx.save()

  // ── Reflection ducked underneath the hull (drawn first so the hull sits
  // on top with a clean silhouette).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)'
  ctx.beginPath()
  ctx.ellipse(cx, surfaceY + hullHeight - 4, hullWidth / 2 - 4, 6, 0, 0, Math.PI * 2)
  ctx.fill()

  // ── Hull (trapezoid with sharper bow at right — fisher boats have a
  // distinct asymmetric profile in side view; the rod extends from the
  // stern side so we orient the bow toward the left and the stern wide).
  ctx.fillStyle = hullColor
  ctx.beginPath()
  ctx.moveTo(hullX + 12, hullY)
  ctx.lineTo(hullX + hullWidth - 8, hullY)
  // stern (right side) slight downward slope
  ctx.lineTo(hullX + hullWidth - 24, hullY + hullHeight)
  // bow (left side) more dramatic taper into a pointed forefoot
  ctx.lineTo(hullX + 22, hullY + hullHeight)
  ctx.closePath()
  ctx.fill()

  // Hull lower shadow band (gives the hull volume / a curved bottom feel).
  const hullGrad = ctx.createLinearGradient(0, hullY, 0, hullY + hullHeight)
  hullGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)')
  hullGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.00)')
  hullGrad.addColorStop(1, 'rgba(0, 0, 0, 0.34)')
  ctx.fillStyle = hullGrad
  ctx.beginPath()
  ctx.moveTo(hullX + 12, hullY)
  ctx.lineTo(hullX + hullWidth - 8, hullY)
  ctx.lineTo(hullX + hullWidth - 24, hullY + hullHeight)
  ctx.lineTo(hullX + 22, hullY + hullHeight)
  ctx.closePath()
  ctx.fill()

  // Gunwale highlight (top edge of hull — bright thin line so the boat
  // pops against the water).
  ctx.strokeStyle = T.boatGunwale
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(hullX + 12, hullY)
  ctx.lineTo(hullX + hullWidth - 8, hullY)
  ctx.stroke()

  // Hull cyan accent stripe (visible at Gold+; subtle outline at Bronze).
  if (boat === 'gold' || boat === 'platinum' || boat === 'mythic') {
    ctx.fillStyle = T.accent
    ctx.fillRect(hullX + 28, hullY + hullHeight / 2 - 1.2, hullWidth - 56, 2.4)
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.10)'
    ctx.fillRect(hullX + 28, hullY + hullHeight / 2 - 0.8, hullWidth - 56, 1.6)
  }

  // ── Cabin / wheelhouse — small block on the deck of the hull (left of
  // center so the rod has room to extend from the stern on the right).
  const cabinW = 38
  const cabinH = 18
  const cabinX = cx - cabinW / 2 - 14
  const cabinY = hullY - cabinH + 2
  ctx.fillStyle = T.boatHullLight
  ctx.fillRect(cabinX, cabinY, cabinW, cabinH)
  // Cabin window — small bright rectangle (the player's vantage).
  ctx.fillStyle = 'rgba(245, 220, 130, 0.85)'
  ctx.fillRect(cabinX + 6, cabinY + 4, 10, 7)
  // Door
  ctx.fillStyle = T.boatHullDark
  ctx.fillRect(cabinX + cabinW - 10, cabinY + 4, 6, cabinH - 6)
  // Cabin roof line.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cabinX, cabinY)
  ctx.lineTo(cabinX + cabinW, cabinY)
  ctx.stroke()

  // ── Captain silhouette on the open deck behind the cabin. Includes a
  // gentle 1-frame breathing animation: head + cap lift on a slow sine
  // (CAPTAIN_BREATH_PERIOD_MS), and the body scales vertically by ±2px so
  // the silhouette reads as alive. RG-C5: amplitude + period are
  // module-const, independent of game state.
  const capX = cx + 6
  const capY = hullY - 4
  const breath = Math.sin((now / CAPTAIN_BREATH_PERIOD_MS) * Math.PI * 2)
  const headLift = breath * 0.6 // head rises ±0.6 px
  const bodyStretch = breath * 0.4 // body height pulses ±0.4 px

  ctx.fillStyle = '#0e1820'
  // Legs (just the lower half of what used to be one rectangle — the legs
  // stay still while the upper body breathes).
  ctx.fillRect(capX - 2, capY - 4, 4, 4)
  // Torso (taller silhouette than before — feels like a person rather
  // than a tick mark). Stretches subtly with the breath.
  ctx.fillStyle = '#1a2330'
  ctx.fillRect(capX - 2.5, capY - 9 + headLift - bodyStretch, 5, 5 + bodyStretch)
  // Arms (two short fins at the side) — visible silhouette detail.
  ctx.fillRect(capX - 4, capY - 8 + headLift, 1.6, 4)
  ctx.fillRect(capX + 2.4, capY - 8 + headLift, 1.6, 4)
  // Head
  ctx.beginPath()
  ctx.arc(capX, capY - 12 + headLift, 2.6, 0, Math.PI * 2)
  ctx.fill()
  // Cap (wider, more visible)
  ctx.fillStyle = '#0e1820'
  ctx.fillRect(capX - 3.2, capY - 14 + headLift, 6.4, 1.5)
  // Cap top dome
  ctx.beginPath()
  ctx.arc(capX, capY - 14.5 + headLift, 2.3, Math.PI, Math.PI * 2)
  ctx.fill()

  // ── Tier-specific embellishment (mast/antenna).
  if (boat === 'mythic') {
    // Sail mast — mahogany flag.
    ctx.fillStyle = '#3a2418'
    ctx.fillRect(cx - 22, cabinY - 28, 2, 28)
    ctx.fillStyle = '#FF8B5A'
    ctx.beginPath()
    ctx.moveTo(cx - 20, cabinY - 28)
    ctx.lineTo(cx - 4, cabinY - 22)
    ctx.lineTo(cx - 20, cabinY - 16)
    ctx.closePath()
    ctx.fill()
  } else if (boat === 'platinum') {
    // Antenna spike on the cabin roof.
    ctx.strokeStyle = '#e5e4e2'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(cabinX + cabinW * 0.5, cabinY)
    ctx.lineTo(cabinX + cabinW * 0.5, cabinY - 18)
    ctx.stroke()
    ctx.fillStyle = '#e5e4e2'
    ctx.beginPath()
    ctx.arc(cabinX + cabinW * 0.5, cabinY - 18, 1.6, 0, Math.PI * 2)
    ctx.fill()
  } else if (boat === 'gold') {
    // Antenna with small flag.
    ctx.strokeStyle = '#f5c25b'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cabinX + cabinW * 0.5, cabinY)
    ctx.lineTo(cabinX + cabinW * 0.5, cabinY - 14)
    ctx.stroke()
  }

  // ── Water-line splash — small white tick where the hull meets the
  // water at bow + stern to anchor the boat to the surface.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(hullX + 16, hullY + hullHeight + 1)
  ctx.lineTo(hullX + 28, hullY + hullHeight + 1)
  ctx.moveTo(hullX + hullWidth - 30, hullY + hullHeight + 1)
  ctx.lineTo(hullX + hullWidth - 14, hullY + hullHeight + 1)
  ctx.stroke()

  ctx.restore()
}

function drawRodSprite(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  tipX: number,
  tipY: number,
  rod: GearTier,
): void {
  ctx.save()
  // Rod stem.
  const gripColor = ROD_GRIP_COLORS[rod]
  ctx.strokeStyle = gripColor
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(baseX, baseY)
  ctx.lineTo(tipX, tipY)
  ctx.stroke()
  // Rod metallic tip (top quarter brighter).
  ctx.strokeStyle = T.rodMetal
  ctx.lineWidth = 2
  const midX = baseX + (tipX - baseX) * 0.75
  const midY = baseY + (tipY - baseY) * 0.75
  ctx.beginPath()
  ctx.moveTo(midX, midY)
  ctx.lineTo(tipX, tipY)
  ctx.stroke()
  // Tip dot — color hints at tier.
  ctx.fillStyle = gripColor
  ctx.beginPath()
  ctx.arc(tipX, tipY, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawLureSprite(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bobberDip: boolean,
  now: number,
): void {
  // Bobber dips on bite.
  const dipOffset = bobberDip ? Math.sin(now / 80) * 4 + 4 : 0
  ctx.save()
  ctx.translate(cx, cy + dipOffset)
  // Outer halo.
  ctx.fillStyle = 'rgba(245, 194, 91, 0.32)'
  ctx.beginPath()
  ctx.arc(0, 0, 6, 0, Math.PI * 2)
  ctx.fill()
  // Lure body.
  ctx.fillStyle = T.lureColor
  ctx.beginPath()
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2)
  ctx.fill()
  // Lure center dot.
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawDeckRail(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  loadout: { rod: GearTier; boat: GearTier; bait: GearTier },
): void {
  const deckTop = H * 0.6
  // Deck base (very dark, almost black, defines the lower 40% of canvas).
  const grad = ctx.createLinearGradient(0, deckTop, 0, H)
  grad.addColorStop(0, '#0a141e')
  grad.addColorStop(1, '#03070d')
  ctx.fillStyle = grad
  ctx.fillRect(0, deckTop, W, H - deckTop)
  // Top wave line — water-deck interface.
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= W; x += 2) {
    const y = deckTop + Math.sin((x + performance.now() / 80) / 30) * 1.4
    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  void loadout
}

function drawDeckBadges(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  catchCount: number,
  castsRemaining: number,
): void {
  // Two badges on the deck rail: catches landed + casts remaining.
  const deckTop = H * 0.6
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)'
  ctx.lineWidth = 1
  // Catches badge (left).
  const catchX = 24
  const catchY = deckTop + 24
  ctx.beginPath()
  ctx.roundRect(catchX, catchY, 130, 52, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.40)'
  ctx.font = `9px ${T.fontMono.replace(/var\([^)]+\),\s*/, '')}`
  ctx.fillText('CATCHES', catchX + 12, catchY + 18)
  ctx.fillStyle = T.text
  ctx.font = `bold 22px ${T.fontMono.replace(/var\([^)]+\),\s*/, '')}`
  ctx.fillText(catchCount.toString().padStart(2, '0'), catchX + 12, catchY + 42)

  // Casts remaining badge (right).
  const castX = W - 24 - 130
  const castY = deckTop + 24
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'
  ctx.beginPath()
  ctx.roundRect(castX, castY, 130, 52, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.40)'
  ctx.font = `9px ${T.fontMono.replace(/var\([^)]+\),\s*/, '')}`
  ctx.fillText('CASTS LEFT', castX + 12, castY + 18)
  ctx.fillStyle = T.accent
  ctx.font = `bold 22px ${T.fontMono.replace(/var\([^)]+\),\s*/, '')}`
  ctx.fillText(castsRemaining.toString().padStart(2, '0'), castX + 12, castY + 42)
  ctx.restore()
}

function drawPowerMeter(ctx: CanvasRenderingContext2D, W: number, H: number, power: number): void {
  // Vertical meter on the deck, right of center.
  const meterX = W * 0.5 + 130
  const meterY = H * 0.65
  const meterW = 22
  const meterH = H * POWER_METER_HEIGHT_FRAC * 0.4 // ~22% of total H
  const fillH = (Math.min(100, Math.max(0, power)) / 100) * meterH

  ctx.save()
  // Frame
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.lineWidth = 1
  ctx.strokeRect(meterX, meterY, meterW, meterH)
  // Fill (cyan gradient bottom-to-top)
  const grad = ctx.createLinearGradient(0, meterY + meterH, 0, meterY)
  grad.addColorStop(0, T.accent)
  grad.addColorStop(1, T.accentSubtle)
  ctx.fillStyle = grad
  ctx.fillRect(meterX, meterY + meterH - fillH, meterW, fillH)
  // Tick marks (every 20% — these correspond to depth tiers).
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
  ctx.lineWidth = 0.5
  for (let t = 1; t <= 4; t++) {
    const ty = meterY + meterH - (meterH * t) / 5
    ctx.beginPath()
    ctx.moveTo(meterX - 2, ty)
    ctx.lineTo(meterX + meterW + 2, ty)
    ctx.stroke()
  }
  // Label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.font = `9px ${T.fontMono.replace(/var\([^)]+\),\s*/, '')}`
  ctx.fillText('POWER', meterX, meterY - 8)
  ctx.fillStyle = T.text
  ctx.font = `bold 12px ${T.fontMono.replace(/var\([^)]+\),\s*/, '')}`
  ctx.fillText(`${Math.round(power).toString().padStart(2, '0')}`, meterX, meterY + meterH + 16)
  ctx.restore()
}

function drawCatchCelebration(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  now: number,
  startedAt: number,
  rarity: FishRarity,
): void {
  const elapsed = now - startedAt
  if (elapsed > CATCH_ARC_DURATION_MS) return
  const t = elapsed / CATCH_ARC_DURATION_MS
  // Fish arcs up out of the water onto the deck.
  // Start position: roughly where the lure was (mid-canvas water).
  const surfaceY = H * 0.18
  const x0 = W * 0.55
  const y0 = H * 0.45
  const deckCenterX = W * 0.5
  const deckTopY = H * 0.6 + 14
  // Bezier-ish ease-out arc.
  const eased = 1 - (1 - t) ** 3
  const cx = x0 + (deckCenterX - x0) * eased
  const arcPeak = -60 // negative = up
  const cy = y0 + (deckTopY - y0) * eased + arcPeak * Math.sin(Math.PI * eased)

  const v = RARITY_VISUALS[rarity]
  // Halo ring.
  ctx.save()
  ctx.translate(cx, cy)
  const ringAlpha = Math.max(0, 1 - t)
  ctx.strokeStyle = `rgba(${v.rgb}, ${ringAlpha * 0.7})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 0, 18 + t * 24, 0, Math.PI * 2)
  ctx.stroke()
  // Fish sprite (larger than swimming fish).
  ctx.fillStyle = `rgba(${v.rgb}, ${Math.max(0.6, ringAlpha + 0.4)})`
  ctx.beginPath()
  ctx.ellipse(0, 0, 14, 7, -t * 0.6, 0, Math.PI * 2)
  ctx.fill()
  // Tail.
  ctx.beginPath()
  ctx.moveTo(-14, 0)
  ctx.lineTo(-22, -5)
  ctx.lineTo(-22, 5)
  ctx.closePath()
  ctx.fill()
  // Rarity label (only for rare+).
  if (rarity !== 'common') {
    ctx.fillStyle = `rgba(${v.rgb}, ${ringAlpha})`
    ctx.font = `bold 14px ${T.fontMono.replace(/var\([^)]+\),\s*/, '')}`
    ctx.textAlign = 'center'
    ctx.fillText(v.label, 0, -28)
  }
  ctx.restore()
  void surfaceY
}

function drawMissRipple(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  now: number,
  startedAt: number,
): void {
  const elapsed = now - startedAt
  if (elapsed > 400) return
  const t = elapsed / 400
  const alpha = 1 - t
  const radius = 8 + t * 30
  ctx.save()
  ctx.strokeStyle = `rgba(248, 113, 113, ${alpha * 0.6})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(W * 0.55, H * 0.35, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

// ─── Reduced motion path ─────────────────────────────────────────────────

function drawStatic(canvas: HTMLCanvasElement | null, rt: CanvasRuntimeRefs): void {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.floor(rect.width * dpr)
  canvas.height = Math.floor(rect.height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const W = rect.width
  const H = rect.height
  const now = performance.now()
  drawSky(ctx, W, H)
  drawSunGlow(ctx, W, H)
  drawClouds(ctx, W, H, now)
  drawBirds(ctx, W, H, now)
  drawDustMotes(ctx, W, H, now)
  drawSunGlareColumn(ctx, W, H, now)
  drawWaterColumn(ctx, W, H, now)
  drawUnderwaterRocks(ctx, W, H)
  drawBubbleColumns(ctx, W, H, rt.bubbles.data, now)
  drawGodRays(ctx, W, H, now)
  drawWindRipples(ctx, W, H, now)
  drawBrandWatermark(ctx, W, H, now, 0)
  drawFish(ctx, W, H, rt.fish.data, now, 'lobby')
  // Boat / rod in the lobby preview — Tim wanted the boat visible even
  // before a trip starts, so render the lobby boat sprite (no rod line).
  drawCastingScene(ctx, W, H, rt, now)
  drawDeckRail(ctx, W, H, rt.props.loadout)
  drawDeckBadges(ctx, W, H, rt.props.tripCatchCount, rt.props.castsRemaining)
}

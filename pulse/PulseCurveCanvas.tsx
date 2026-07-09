'use client'

/**
 * `PulseCurveCanvas` — the heartbeat-amplitude live curve, DLv2-aligned.
 *
 * Brand register: canonical color = SWOOBZ-DESIGN-SYSTEM.md (accent-API).
 * Primary accent is volt `--color-volt` (#00F0FF); the calmer readout/glow
 * accent is cyan `--color-cyan` (#29E6FF, replaces the deleted #00D0DE). Motion
 * is reserved for genuine state change (curve climb, crash, cash-out) — no
 * perpetual ambient pulse on chrome.
 *
 * Pacing: variable-growth smoothstep ramp in `pulseMath.ts`. The first 1–2 s
 * are slow (the "bezier delay" the player asked for) so the multiplier reads
 * as anticipation rather than a sprint, then growth accelerates Aviator-style.
 *
 * Crash moment: when the round transitions to crashed, the canvas plays a
 * single dramatic sequence — debris burst from the curve head, frozen curve
 * stays as a "scar", and a CRASHED stamp + bust multiplier line slide in.
 * No looping pulse, no celebratory amplification. Per `BEST-PRACTICES.md`
 * §6, RG-C1 / RG-C3: the crash is informational, the visual is final, no
 * near-miss exaggeration.
 */
import { type ReactElement, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  playCashOutWin,
  playCrash,
  playTierTick,
  resetMilestoneTicks,
  TIER_TICKS_BPS,
} from './pulseAudio'
import {
  isPulseClimbVoicePlaying,
  startPulseClimbVoice,
  stopPulseClimbVoice,
  updatePulseClimbVoice,
} from './pulseClimbVoice'
import { drawCrashDebris } from './pulseCrashDebris'
import { drawMilestonePips } from './pulseCurveCanvas.milestonePips'
import {
  HAPTIC_CASHOUT_PATTERN,
  HAPTIC_CRASH_PATTERN,
  HAPTIC_TIER_MS,
  safeVibrate,
} from './pulseHaptics'
import {
  formatMultiplier,
  MOCK_MAX_CRASH_BPS,
  multiplierMulForVisual,
  ONE_X_BPS,
  SLOT_DURATION_MS,
} from './pulseMath'
import { projectY, Y_MIN_CEIL } from './pulseProjection'
import { drawWinDebris, WIN_DEBRIS_LIFETIME_MS } from './pulseWinDebris'

export interface PulseCurveCanvasProps {
  /** The slot the round became active. `null` outside an active round. */
  roundActiveSlot: bigint | null
  /** The most recently observed authoritative slot from the provider. */
  authoritativeSlot: bigint
  /** True when the round has crashed (loss). The curve freezes; CRASHED stamp. */
  crashed: boolean
  /** True when the round was cashed out (win). Freezes at the cash-out point. */
  cashedOut: boolean
  /** The multiplier the cash-out fired at, in bps. */
  cashedOutAtBps: bigint | null
  /** Absolute slot the cash-out fired at. */
  cashedOutAtSlot: bigint | null
  /** The on-chain crash multiplier in bps (used for the ghost what-if). */
  crashBps: bigint | null
  /** Absolute slot the curve would have crashed at (used for the ghost what-if). */
  crashSlot: bigint | null
  /** Reduced-motion preference (from CSS media query or in-app toggle). */
  reducedMotion?: boolean
  /**
   * Equipped trace skin override: an RGB triplet string (e.g. "0,136,204")
   * derived from the equipped cosmetic's `swatch` hex. When provided it
   * replaces ACCENT_SOLID_RGB for the curve stroke and head. null = default cyan.
   * This is the HUD wiring for Tim's correction #2: equipping a trace skin
   * ACTUALLY changes the curve color.
   */
  traceSkinRgb?: string | null
}

// ── Accent tokens (SWOOBZ-DESIGN-SYSTEM.md accent-API) ─────────────────────
// Mirrors DS cyan `--color-cyan` (#29E6FF) and volt `--color-volt` (#00F0FF).
const ACCENT_TEXT_RGB = '41,230,255' // DS cyan #29E6FF — softer-than-volt text + glow halo (#00D0DE deleted)
const ACCENT_SOLID_RGB = '0,240,255' // DS volt #00F0FF — electric stroke + head
const CRASH_RGB = '255,65,53' // DS blood #FF4135 — danger/bust, never celebratory

// ── Swoobz wordmark watermark ─────────────────────────────────────────────
// The full SW**OO**BZ wordmark from `branding/logo/swoobz-logo-{white,dark}.svg`
// embedded in the canvas as a wide, low-opacity brand watermark. Two
// layers, two registers:
//   • Letters S / W / B / Z: static white, low alpha — quiet brand body.
//   • OO chains (the iconic interlocking rings): reactive cyan with a
//     pulse-on-tier-cross that brightens + glows for ~600 ms after each
//     audio-tier crossing. The chains light up with the climb — same
//     hierarchy as the original logo where the OO is the featured element.
// Source SVG viewBox: 2745.91 × 444.31 (≈ 6.18:1 aspect).
const LOGO_PATH_S =
  'M211.83,444.31c-27.99,0-55.01-2.8-81.05-8.39-26.05-5.59-50.27-13.99-72.66-25.19-22.39-11.19-41.76-25.4-58.12-42.62l72.33-93.64c12.05,14.65,26.26,26.92,42.62,36.81,16.36,9.9,33.47,17.33,51.34,22.28,17.86,4.95,35.2,7.43,51.99,7.43,9.9,0,18.51-.86,25.83-2.59,7.32-1.72,12.91-4.41,16.79-8.07,3.88-3.65,5.81-8.5,5.81-14.53,0-7.32-2.59-13.56-7.75-18.73-5.17-5.17-13.56-9.79-25.19-13.89-11.63-4.09-27.13-7.85-46.5-11.3l-43.27-8.4c-18.51-3.44-35.95-8.28-52.31-14.53-16.37-6.24-30.9-14.42-43.59-24.54-12.7-10.11-22.6-22.49-29.7-37.13-7.11-14.63-10.66-32.29-10.66-52.96,0-29.27,7.64-53.92,22.93-73.94,15.28-20.02,35.94-35.08,62-45.21C118.72,5.06,147.67,0,179.54,0c42.19,0,79.76,6.68,112.69,20.01,32.94,13.35,60.16,30.79,81.69,52.32l-71.68,92.35c-17.22-18.08-38.43-32.82-63.61-44.24-25.19-11.4-49.4-17.11-72.66-17.11-7.33,0-14,.87-20.02,2.59-6.03,1.72-10.66,4.31-13.89,7.75-3.23,3.45-4.84,7.75-4.84,12.91,0,12.06,6.02,20.89,18.08,26.48,12.05,5.6,28.63,10.77,49.73,15.5l51.02,11.62c23.67,5.17,44.24,11.63,61.68,19.38,17.44,7.75,31.97,17.01,43.59,27.77,11.63,10.77,20.34,23.15,26.16,37.14,5.81,14,8.72,30.03,8.72,48.12,0,29.28-7.65,53.71-22.93,73.29-15.28,19.6-36.06,34.23-62.32,43.92-26.27,9.69-55.97,14.53-89.12,14.53Z'
const LOGO_PATH_W =
  'M641.29,437.85h-164.04L383.61,5.16h134.33l33.58,218.28,11.63,141.43,18.73-125.29L625.15,5.16h154.99l43.27,234.43,18.08,125.29,12.27-141.43L887.34,5.16h134.33l-93.64,432.69h-164.04l-40.04-191.15-21.31-163.39-20.66,163.39-40.69,191.15Z'
const LOGO_PATH_B =
  'M2330.98,270.61c-10.58-16.39-28.02-29.07-52.32-38.11-24.31-9.04-57.16-13.59-98.48-13.59,15.97,0,32.85-1.05,50.71-3.22,17.86-2.17,34.53-6.65,50.08-13.59,15.48-6.86,28.16-17.16,38.03-30.96,9.95-13.8,14.92-32.29,14.92-55.55,0-19.4-4.34-37.47-12.96-54.29-8.62-16.74-22.9-30.19-42.94-40.35-20.03-10.09-47.7-15.13-83-15.13h-231.15v432.67h229.26c30.54,0,57.37-3.36,80.34-10.02,23.05-6.65,41.05-18,53.94-33.9,12.96-15.9,19.4-38.11,19.4-66.54,0-21.92-5.25-41.12-15.83-57.44ZM2167.28,109.15c9.46,0,17.44,1.05,23.89,3.22,6.44,2.17,11.42,5.67,14.85,10.65,3.43,4.97,5.18,11.28,5.18,19.05,0,7.36-1.75,13.38-5.18,18.07-3.43,4.76-8.41,8.19-14.85,10.37-6.44,2.1-14.43,3.22-23.89,3.22h-87.21v-64.58h87.21ZM2216.03,326.15c-7.98,6.02-21.01,9.04-39.09,9.04h-96.87v-71.1h96.87c12.05,0,21.85,1.33,29.42,3.92,7.49,2.59,12.96,6.44,16.46,11.63,3.43,5.11,5.11,11.84,5.11,20.03,0,11.56-3.92,20.45-11.91,26.48Z'
const LOGO_PATH_Z =
  'M2745.91,438.49h-378.44v-90.41l156.29-182.77,61.35-59.41-61.35,3.23h-143.37V5.8h352.61v90.41l-155,177.6-66.52,64.59,66.52-3.24h167.91v103.33Z'
const OO_PATH_1 =
  'M1906.26,5.8v216.35c0,57.8-22.51,112.12-63.37,152.99-40.87,40.86-95.2,63.37-152.99,63.37h-173.18c-16.2,0-32.13-1.77-47.56-5.22,39.62-8.84,76.01-28.74,105.42-58.15,18.23-18.23,32.81-39.15,43.36-61.85h71.96c50.25,0,91.14-40.89,91.14-91.14v-91.13h-264.32c-17.42,0-33.71,4.91-47.56,13.43-26.12,16.03-43.57,44.86-43.57,77.7s17.45,61.67,43.57,77.71c-13.86,8.52-30.15,13.43-47.56,13.43h-101.22c-13.11-28.18-20.02-59.13-20.02-91.14s6.91-62.95,20.02-91.13c10.55-22.71,25.13-43.62,43.36-61.85,29.41-29.41,65.79-49.31,105.42-58.15,15.44-3.45,31.36-5.22,47.56-5.22h389.54Z'
const OO_PATH_2 =
  'M1637.94,222.15c0,32.01-6.9,62.95-20.01,91.14-10.55,22.7-25.13,43.62-43.36,61.85-29.41,29.41-65.79,49.31-105.42,58.15-15.44,3.45-31.36,5.22-47.56,5.22h-389.54v-216.36c0-57.79,22.51-112.12,63.37-152.98,40.87-40.87,95.2-63.37,152.99-63.37h173.18c16.2,0,32.12,1.77,47.56,5.22-39.63,8.84-76.01,28.74-105.42,58.15-18.23,18.23-32.81,39.14-43.36,61.85h-71.96c-50.25,0-91.14,40.88-91.14,91.13v91.14h264.32c17.42,0,33.71-4.91,47.56-13.43,26.11-16.04,43.56-44.87,43.56-77.71,0-25.13-10.22-47.91-26.72-64.41-5.06-5.06-10.71-9.54-16.84-13.29,13.85-8.52,30.15-13.43,47.56-13.43h101.22c13.11,28.18,20.01,59.13,20.01,91.13Z'
// Full wordmark bounding box from the source SVG viewBox.
const LOGO_BBOX_W = 2745.91
const LOGO_BBOX_H = 444.31
// Cache Path2D instances so we don't reconstruct them every frame.
interface CachedLogoPaths {
  letters: Path2D[] // S, W, B, Z — static body
  oo: Path2D[] // OO chain rings — reactive
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

const BRAND_PULSE_DECAY_MS = 600 // pulse fades over this window after a tier-pop

// Crash debris implementation lives in `pulseCrashDebris.ts` so it can
// be unit-tested in isolation (PULSE-FX-RESTORE-2026-05-27 fix 2).

// Haptic patterns + safeVibrate now live in `pulseHaptics.ts` (shared with the
// React shell's cash-out press-ack). RG-C5: module-const patterns, identical
// for every milestone / crash / cash-out regardless of streak.

// drawCrashDebris + seededRandom moved to `pulseCrashDebris.ts`
// (PULSE-FX-RESTORE-2026-05-27 fix 2) so they can be unit-tested in
// isolation. The frame loop calls `drawCrashDebris(...)` via the import.

const VIEW_WINDOW_SLOTS = 240 // ~24 s @ 100 ms ticks
/**
 * Warm-up window after a round activates. Matches `ROUND_START_DELAY_MS` in
 * `pulseProvider.ts` — the provider's slot interval is gated on the same
 * wall time, so the on-chain slot clock and the canvas's visual head both
 * stay at 1.00x for this window. Anticipation beat — Material Motion's
 * standard "expressive" duration band (NN/g, IBM Carbon).
 */
const INTRO_DELAY_MS = 750

export function PulseCurveCanvas(props: PulseCurveCanvasProps): ReactElement {
  const {
    roundActiveSlot,
    authoritativeSlot,
    crashed,
    cashedOut,
    cashedOutAtBps,
    cashedOutAtSlot,
    crashBps,
    crashSlot,
    reducedMotion = false,
    traceSkinRgb = null,
  } = props
  // When a trace skin is equipped, override the default ACCENT_SOLID_RGB with
  // the skin's swatch RGB. This is the concrete HUD wiring: equipping a skin
  // ACTUALLY changes the curve stroke color in the canvas.
  const effectiveAccentSolidRgb = traceSkinRgb ?? ACCENT_SOLID_RGB
  const effectiveAccentTextRgb = traceSkinRgb ?? ACCENT_TEXT_RGB
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef({
    roundActiveSlot,
    authoritativeSlot,
    crashed,
    cashedOut,
    cashedOutAtBps,
    cashedOutAtSlot,
    crashBps,
    crashSlot,
    observedAtMs: performance.now(),
    crashedAtMs: 0,
    cashedOutAtMs: 0,
    /** Elapsed slots at freeze (crash for losses, cash-out for wins). */
    frozenHeadElapsed: 0,
    /** Elapsed slots out to the would-have-crashed point (wins only). */
    ghostEndElapsed: 0,
    /** Wall time the round became active — used to gate the intro warm-up. */
    roundActivatedAtMs: 0,
  })
  // Skin color ref — updated every render so the rAF loop always reads the
  // currently equipped skin without requiring a full canvas remount.
  const accentSolidRgbRef = useRef<string>(effectiveAccentSolidRgb)
  const accentTextRgbRef = useRef<string>(effectiveAccentTextRgb)
  useLayoutEffect(() => {
    accentSolidRgbRef.current = effectiveAccentSolidRgb
    accentTextRgbRef.current = effectiveAccentTextRgb
  })

  const lastTierTickRef = useRef<number>(-1)
  const lastTierPopMsRef = useRef<number>(0)
  // Crash debris seed + origin (PULSE-FX-RESTORE-2026-05-27 fix 2).
  // Seed derives from the crash slot so a replay of the same round paints
  // an identical burst (RG-C1 deterministic). Origin is the (x, y) of the
  // curve head at the crash moment.
  const crashDebrisSeedRef = useRef<number>(0)
  const crashDebrisOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  // Win debris seed + origin + start time (cash-out celebration burst).
  // Same RG-C1 determinism: seed from cashedOutAtSlot so the same slot
  // replays the same upward burst. Origin captured on first frame after
  // cash-out (same pattern as crash debris).
  const winDebrisSeedRef = useRef<number>(0)
  const winDebrisOriginRef = useRef<{ x: number; y: number } | null>(null)
  const winDebrisStartedAtMs = useRef<number>(0)

  // useLayoutEffect (not useEffect) so stateRef is updated synchronously
  // after React commits the prop change and BEFORE the browser paints.
  // This closes the 1-frame race where the rAF loop fires between the
  // React commit and the effect, reading stale state from the previous
  // round (e.g. frozen crash scene bleeds into the new round's frame 0).
  // Matches the pattern used in the Drop chassis (Drop port note 2026-05-xx).
  useLayoutEffect(() => {
    const prev = stateRef.current
    const justCrashed = !prev.crashed && crashed
    const justCashedOut = !prev.cashedOut && cashedOut
    const wasFrozen = prev.crashed || prev.cashedOut
    const isFrozen = crashed || cashedOut
    // Fresh round start covers BOTH "cold idle → active" AND the BET AGAIN
    // replay path "settled (frozen) → active" — the second path used to
    // leave stale crash state (crashedAtMs / frozenHeadElapsed) bleeding
    // into the next round, freezing the canvas on the old scene.
    const freshRoundStart =
      roundActiveSlot !== null && !isFrozen && (!prev.roundActiveSlot || wasFrozen)
    const anchor = roundActiveSlot ?? authoritativeSlot
    let frozenHeadElapsed = prev.frozenHeadElapsed
    let ghostEndElapsed = prev.ghostEndElapsed
    if (justCrashed) {
      frozenHeadElapsed = Number(authoritativeSlot - anchor)
      ghostEndElapsed = frozenHeadElapsed
    } else if (justCashedOut) {
      frozenHeadElapsed = cashedOutAtSlot
        ? Number(cashedOutAtSlot - anchor)
        : Number(authoritativeSlot - anchor)
      ghostEndElapsed = crashSlot ? Number(crashSlot - anchor) : frozenHeadElapsed
    } else if (freshRoundStart) {
      frozenHeadElapsed = 0
      ghostEndElapsed = 0
    }
    stateRef.current = {
      roundActiveSlot,
      authoritativeSlot,
      crashed,
      cashedOut,
      cashedOutAtBps,
      cashedOutAtSlot,
      crashBps,
      crashSlot,
      observedAtMs: performance.now(),
      // Clear stale crash/cashout timestamps on a fresh round so the hero
      // fade + stamp slide-in don't replay from the previous round's clock.
      crashedAtMs: justCrashed ? performance.now() : freshRoundStart ? 0 : prev.crashedAtMs,
      cashedOutAtMs: justCashedOut ? performance.now() : freshRoundStart ? 0 : prev.cashedOutAtMs,
      frozenHeadElapsed,
      ghostEndElapsed,
      roundActivatedAtMs: freshRoundStart
        ? performance.now()
        : !roundActiveSlot
          ? 0
          : prev.roundActivatedAtMs,
    }
    // Crash debris seed init (PULSE-FX-RESTORE-2026-05-27 fix 2). The
    // seed derives from the crash slot so the burst is deterministic per
    // round. We CANNOT compute the origin here — the canvas hasn't drawn
    // the head yet for this crashed frame — so the frame loop captures
    // (headX, headY) the first time it sees `s.crashed` and stores it in
    // `crashDebrisOriginRef` for subsequent frames to read back.
    if (justCrashed) {
      const slotSeed = crashSlot !== null ? Number(crashSlot & 0x7fffffffn) : 0
      crashDebrisSeedRef.current = slotSeed | 0
      // Origin will be filled in by the frame loop when it next sees a
      // crashed state with origin still at (0,0).
      crashDebrisOriginRef.current = { x: 0, y: 0 }
      // Crash SFX (PULSE-CRASH-FX-2026-05-27 fix 2). Fired from the
      // transition-only `justCrashed` branch so the thud plays exactly
      // once per crash — not on every frame the canvas is in the frozen
      // crashed state. Zero-param per RG-C5: identical waveform for every
      // crash, no streak/wager amplification.
      playCrash()
      // Haptic — short "thud" pattern (PULSE-FX-RESTORE-2026-05-27 fix 3).
      // Gated on !reducedMotion: haptic is motion-equivalent and should
      // honor the reduced-motion preference.
      if (!reducedMotion) {
        safeVibrate([...HAPTIC_CRASH_PATTERN])
      }
    }
    // Cash-out celebration: audio + haptic + win debris burst.
    // Mirrors the `justCrashed` branch above. Zero-param per RG-C5:
    // identical pattern every cash-out regardless of multiplier/streak/wager.
    if (justCashedOut) {
      playCashOutWin()
      if (!reducedMotion) {
        safeVibrate([...HAPTIC_CASHOUT_PATTERN])
      }
      // Seed from cashedOutAtSlot for RG-C1 determinism — same slot → same
      // burst across replays. Origin is captured on the first drawn frame
      // after cash-out (winDebrisOriginRef starts null; frame loop fills it).
      const slotN = cashedOutAtSlot !== null ? Number(cashedOutAtSlot & 0x7fffffffn) : 0
      winDebrisSeedRef.current = slotN | 0
      winDebrisOriginRef.current = null // frame loop captures head (x, y)
      winDebrisStartedAtMs.current = performance.now()
    }
    if (freshRoundStart || (!roundActiveSlot && !isFrozen)) {
      lastTierTickRef.current = -1
      resetMilestoneTicks() // RG-C5: zero the milestone-tick pitch sequence per round
      lastTierPopMsRef.current = 0
      crashDebrisOriginRef.current = { x: 0, y: 0 }
      // Clear win debris state so the next round starts clean.
      winDebrisOriginRef.current = null
      winDebrisStartedAtMs.current = 0
    }
  }, [
    roundActiveSlot,
    authoritativeSlot,
    crashed,
    cashedOut,
    cashedOutAtBps,
    cashedOutAtSlot,
    crashBps,
    crashSlot,
    reducedMotion,
  ])

  useEffect(() => {
    if (reducedMotion) return
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

    let rafId = 0
    let lastFrameMs = performance.now()

    function frame(): void {
      if (!canvas || !ctx) return
      const rect = canvas.getBoundingClientRect()
      const W = rect.width
      const H = rect.height
      const now = performance.now()
      const dt = Math.min(64, now - lastFrameMs)
      lastFrameMs = now

      // Matte obsidian chamber floor of the 2087 holo-cardiac rig — no sky
      // gradient, no atmosphere (the "add atmosphere" lazy-slop pattern).
      // Unified with PulseSceneBackdrop's LAB_BLACK (DS ink #07080C) so there
      // is no seam at the titanium chassis border on OLED. Both surfaces are
      // the same obsidian; the matte fill is what makes the cyan trace SING.
      ctx.fillStyle = '#07080C' // DS ink — matte canvas floor
      ctx.fillRect(0, 0, W, H)
      void dt

      const s = stateRef.current
      const frozen = s.crashed || s.cashedOut

      // Mobile reanchors the action bar to a full-width bottom strip (taller
      // than desktop's compact corner panel), so the curve needs more bottom
      // clearance on narrow canvases — otherwise the terminus draws behind the
      // bar. Scale the bar reserve from the live canvas width (no extra state;
      // the rAF loop already reads `W`). Idle reserve is unchanged (no bar).
      const barReservePx = W < 640 ? 80 : BOTTOM_RESERVED_BAR_PX

      // Brand-pulse decay derived from the existing tier-pop timestamp ref —
      // no extra state needed. Pulse value spikes to 1 at a tier crossing
      // and decays linearly to 0 over BRAND_PULSE_DECAY_MS.
      const tSincePop = lastTierPopMsRef.current > 0 ? now - lastTierPopMsRef.current : Infinity
      const brandPulse01 =
        tSincePop < BRAND_PULSE_DECAY_MS ? Math.max(0, 1 - tSincePop / BRAND_PULSE_DECAY_MS) : 0

      // Swoobz OO watermark — branded background element. Drawn AFTER the sky
      // so it sits on the deep stadium-night gradient, BEFORE the grid +
      // curve so gameplay never reads behind brand chrome. The pulse-on-
      // tier-pop is the only motion this element has.
      drawSwoobzWatermark(
        ctx,
        W,
        H,
        brandPulse01,
        s.crashed,
        s.cashedOut,
        s.roundActiveSlot || s.crashed || s.cashedOut ? barReservePx : BOTTOM_RESERVED_IDLE_PX,
      )

      if (!s.roundActiveSlot && !frozen) {
        // No active round → the continuous climb voice is silenced (idempotent).
        stopPulseClimbVoice()
        drawIdleHeartbeat(ctx, W, H, now)
        rafId = requestAnimationFrame(frame)
        return
      }

      // ── Slot clock ─────────────────────────────────────────────────────
      const slotMs = Number(SLOT_DURATION_MS)
      const anchor = s.roundActiveSlot ?? s.authoritativeSlot
      // Warm-up beat — the first 750ms after the round activates hold the
      // head at 1.00x so the eye locks on cleanly. Mirrors the provider's
      // ROUND_START_DELAY_MS slot-tick gate so they stay in sync.
      //
      // Belt-and-suspenders anchor guard: if `roundActivatedAtMs` is still
      // zero while `roundActiveSlot` is non-null, the useLayoutEffect has not
      // yet written the activation timestamp (can happen on the very first
      // mount frame or after a fast hot-reload). Treat the round as in-intro
      // until the ref is properly initialised — this guarantees the first
      // drawn frame always starts at 1.00x with zero elapsed, never at a
      // phantom large elapsed derived from stale `observedAtMs`.
      const anchorReady = s.roundActivatedAtMs > 0
      const introMs = anchorReady ? now - s.roundActivatedAtMs : Infinity
      const inIntro = !frozen && s.roundActiveSlot !== null && introMs < INTRO_DELAY_MS
      const sinceObservedMs = frozen || inIntro ? 0 : now - s.observedAtMs
      const fractionalAdvance = sinceObservedMs / slotMs
      const liveElapsed = Math.max(0, Number(s.authoritativeSlot - anchor) + fractionalAdvance)
      const headElapsed = frozen ? s.frozenHeadElapsed : inIntro ? 0 : liveElapsed
      // The view window stretches out to the ghost-end on a win, so the
      // would-have-crashed point stays on-canvas next to the cash-out.
      const viewElapsed = s.cashedOut ? Math.max(headElapsed, s.ghostEndElapsed) : headElapsed

      const capF = Number(MOCK_MAX_CRASH_BPS) / Number(ONE_X_BPS)
      // Clip the visual head to the on-chain crash point the instant `crashed`
      // flips. Otherwise the wall-clock interpolator (+ the heartbeat 4 %
      // amplitude) can carry the head past `crashBps` — a Glass-Box trust
      // hazard: the canvas would show a different number than the chain.
      // GC3 Truth over spectacle, GC5 Honest pending.
      const crashClipMul =
        s.crashed && s.crashBps !== null ? Number(s.crashBps) / Number(ONE_X_BPS) : null
      const rawHeadMul = Math.min(multiplierMulForVisual(headElapsed), capF)
      const headBaselineMul =
        crashClipMul !== null ? Math.min(rawHeadMul, crashClipMul) : rawHeadMul

      // ── Continuous live-value climb voice (CRASH Dimension-5 floor) ─────
      // The voice plays for the duration of the live climb and its lowpass
      // cutoff tracks the multiplier, so the ear follows the climb without
      // reading the number. Frozen (crash/cash-out) cuts it. RG-C5: the only
      // input is the live round multiplier; amplitude + range are module-const.
      // Driven from the rAF loop, which is itself reduced-motion-gated, so
      // reduced-motion users get the calm static ticker with no climb voice.
      if (!frozen) {
        if (!isPulseClimbVoicePlaying()) startPulseClimbVoice()
        updatePulseClimbVoice(headBaselineMul)
      } else {
        stopPulseClimbVoice()
      }

      const leadBps =
        s.crashed && s.crashBps !== null
          ? s.crashBps
          : BigInt(Math.floor(headBaselineMul * Number(ONE_X_BPS)))
      // The Y-axis ceiling tracks whichever of head / ghost-end is higher.
      const ceilingMul = s.cashedOut
        ? Math.min(multiplierMulForVisual(viewElapsed), capF)
        : headBaselineMul
      // Piecewise ceiling: pin to Y_MIN_CEIL through the common 1–5× range
      // so the curve shows real curvature there, then track the head with
      // 18 % headroom for outliers. Without the floor, auto-scaling makes
      // every round look the same shape (head sat at a fixed fraction).
      const yCeilMul = Math.max(Y_MIN_CEIL, ceilingMul * 1.18)

      // The bar is mounted in the React layer above the canvas; when a
      // round is active OR settled the curve must vacate the bottom zone
      // so it doesn't climb behind the bar's chrome.
      const barVisible = s.roundActiveSlot !== null || s.crashed || s.cashedOut
      const bottomReserve = barVisible ? barReservePx : BOTTOM_RESERVED_IDLE_PX
      drawGraticule(ctx, W, H, yCeilMul, s.crashed, bottomReserve)

      // ── Milestone pips (PULSE-FX-RESTORE-ALIGN-2026-05-27) ────────────
      // Drawn HERE — inside the canvas, AFTER graticule but BEFORE the
      // curve trace — so the pip hairline + pip dot use the SAME projectY
      // mapping as the curve head. The curve line will occlude the pip
      // dot at the exact frame it crosses the threshold. Static-color
      // version under reducedMotion (no next-tier proximity brightening).
      drawMilestonePips(
        ctx,
        W,
        H,
        yCeilMul,
        bottomReserve,
        !frozen ? leadBps : undefined,
        reducedMotion,
      )

      // MILESTONE TICK AUDIO + HAPTIC + PIP — FOUR-way alignment
      // (PULSE-AUDIO-ALIGN-2026-05-27 — score-based triggers, Tim ruling):
      //   - drawMilestonePips draws each pip at projectY(MILESTONE_BPS[i])
      //   - curve head is at projectY(leadBps)
      //   - drawHeroMultiplier(..., leadBps, ...) renders the hero TEXT
      //     by calling formatMultiplier(leadBps) — so the displayed
      //     numeric value IS leadBps formatted
      //   - audio + haptic fire when leadBps crosses TIER_TICKS_BPS[i]
      // All four reference the SAME `leadBps` value computed on this frame
      // → the tick lands on the same frame the hero text rolls to the new
      // label (e.g. "1.25x", "1.50x", …). Drift impossible by construction.
      // ── Tier audio ticks + tier-pop (live state only) ─────────────────
      // Milestone ticks fire ONLY during the live climb. The instant the
      // round freezes (crash or cash-out), the tier-tick loop is muted so
      // the player doesn't hear a 5x tick play AFTER the 1.5x crash —
      // PULSE-CRASH-FX-2026-05-27 fix 1. Explicit (!s.crashed && !s.cashedOut)
      // form (not the looser `!frozen` shortcut) so a future refactor that
      // narrows `frozen` cannot silently re-enable post-freeze ticks.
      if (!s.crashed && !s.cashedOut) {
        let newTierIdx = lastTierTickRef.current
        for (let i = TIER_TICKS_BPS.length - 1; i > lastTierTickRef.current; i--) {
          if (leadBps >= TIER_TICKS_BPS[i]!) {
            newTierIdx = i
            break
          }
        }
        if (newTierIdx > lastTierTickRef.current) {
          for (let i = lastTierTickRef.current + 1; i <= newTierIdx; i++) {
            playTierTick()
            // Haptic tap on milestone crossing (PULSE-FX-RESTORE-2026-05-27
            // fix 3). Identical 8ms duration for every tier — RG-C5: no
            // escalation per streak / per tier. Suppressed under
            // reduced-motion (haptic is motion-equivalent).
            if (!reducedMotion) {
              safeVibrate(HAPTIC_TIER_MS)
            }
          }
          lastTierTickRef.current = newTierIdx
          lastTierPopMsRef.current = now
        }
      }

      // ── Head position (computed FIRST so the curve can pin its terminus
      // to exactly this coordinate). The head sits at `headBaselineMul`
      // with NO bobble — the bobble lives in the trail's middle samples
      // and tapers to zero at the head, so a stable head reads as the
      // anchor and the trail breathes around it.
      // x is now mul-parametric (Aviator arc): sqrt of normalised mul ⇒
      // head's x advances slowly at low mul, rushes rightward as the
      // mul climbs the ceiling.
      const headX = projectX(headBaselineMul, yCeilMul, W)
      const headY = projectY(headBaselineMul, H, yCeilMul, bottomReserve)

      // ── Heartbeat-amplitude curve ─────────────────────────────────────
      // Solid section: start → headElapsed. The drawer pins its last
      // vertex to (headX, headY) so the curve terminus and the dot are
      // pixel-identical regardless of floating-point drift. The
      // `headBaselineMul` cap is passed down so EVERY sample in the trail
      // respects the on-chain crash clip — not just the terminal vertex.
      // Without the per-sample cap, the second-to-last sample can sit at
      // a multiplier ABOVE crashBps (the wall-clock interpolator overshoots
      // when crashed but `multiplierMulForVisual(headElapsed)` hasn't been
      // clipped yet), producing a visible curve overshoot past the dot —
      // PULSE-CRASH-FX-2026-05-27 fix 3.
      drawHeartbeatCurve(
        ctx,
        W,
        H,
        headElapsed,
        viewElapsed,
        capF,
        yCeilMul,
        s.crashed,
        bottomReserve,
        headX,
        headY,
        headBaselineMul,
        accentSolidRgbRef.current,
      )
      // Ghost section: headElapsed → ghostEndElapsed (where it WOULD have
      // crashed if the player had let it ride). Wins only — informational,
      // not a near-miss tease.
      if (s.cashedOut && s.ghostEndElapsed > headElapsed) {
        drawGhostContinuation(
          ctx,
          W,
          H,
          headElapsed,
          s.ghostEndElapsed,
          viewElapsed,
          capF,
          yCeilMul,
          bottomReserve,
        )
      }

      // ── Head marker ─────────────────────────────────────────────────────
      // Particle trail / debris / celebration emitters DELETED per
      // PULSE-ART-DIRECTION-2026-05-25 §6.2. Tim 2026-05-25: "please stop
      // with the particle effects — that is like AI slop for igaming."
      // The trace IS the trail; the head dot IS the terminus. The crash
      // gets the stamp slam + shake (no debris). The cash-out gets the
      // hit-stop + figure tween on the WIN stamp (no radial spark fan).
      drawHead(ctx, headX, headY, s.crashed, accentSolidRgbRef.current)

      // Ghost-end marker (would-have-crashed) on a win.
      if (s.cashedOut && s.crashBps && s.ghostEndElapsed > headElapsed) {
        const ghostBpsMul = Math.min(multiplierMulForVisual(s.ghostEndElapsed), capF)
        const ghostX = projectX(ghostBpsMul, yCeilMul, W)
        const ghostY = projectY(ghostBpsMul, H, yCeilMul, bottomReserve)
        drawGhostEndMarker(ctx, ghostX, ghostY, s.crashBps, W)
      }

      // ── Hero in-canvas multiplier ─────────────────────────────────────
      const popElapsed = now - lastTierPopMsRef.current
      const popScale =
        lastTierPopMsRef.current > 0 && popElapsed < 280 ? 1 + (1 - popElapsed / 280) * 0.16 : 1
      // Anticipation → Action → Recovery: the hero multiplier belongs to the
      // climbing phase. On crash it disappears immediately — the CRASHED
      // stamp owns the action beat alone, and the settlement bar below owns
      // the final receipt. No dual-anchor coral. The head label likewise
      // recedes on crash so the stamp isn't competing with a duplicate
      // multiplier badge floating beside the head dot.
      if (!s.crashed) {
        drawHeroMultiplier(
          ctx,
          W,
          H,
          leadBps,
          s.crashed,
          popScale,
          bottomReserve,
          accentSolidRgbRef.current,
        )
        drawHeadLabel(ctx, headX, headY, leadBps, s.crashed, W)
      }

      // ── Outcome stamps + intro overlay ─────────────────────────────────
      if (inIntro) {
        drawIntroOverlay(ctx, W, H, introMs, INTRO_DELAY_MS)
      } else if (s.crashed) {
        const tSince = now - s.crashedAtMs
        drawCrashFlash(ctx, W, H, tSince)
        drawCrashStamp(ctx, W, H, tSince)
        // Crash debris burst (PULSE-FX-RESTORE-2026-05-27 fix 2). On the
        // first frame after crash, capture (headX, headY) as the origin so
        // the burst seeds from the same point the curve ended. Subsequent
        // frames read the origin back and animate the debris outward.
        // Suppressed under reduced-motion.
        if (!reducedMotion) {
          const origin = crashDebrisOriginRef.current
          if (origin.x === 0 && origin.y === 0) {
            crashDebrisOriginRef.current = { x: headX, y: headY }
          }
          drawCrashDebris(
            ctx,
            W,
            H,
            tSince,
            crashDebrisSeedRef.current,
            crashDebrisOriginRef.current,
          )
        }
      } else if (s.cashedOut) {
        const tSince = now - s.cashedOutAtMs
        drawWinStamp(ctx, W, H, tSince, s.cashedOutAtBps ?? leadBps)
        // Win debris burst — upward cool palette (cyan/mint/white).
        // Suppressed under reduced-motion. Origin captured on first frame
        // so the burst seeds from the curve head at cash-out.
        if (!reducedMotion && winDebrisStartedAtMs.current > 0) {
          const elapsed = now - winDebrisStartedAtMs.current
          if (elapsed <= WIN_DEBRIS_LIFETIME_MS + 100) {
            if (winDebrisOriginRef.current === null) {
              winDebrisOriginRef.current = { x: headX, y: headY }
            }
            drawWinDebris(ctx, W, H, elapsed, winDebrisSeedRef.current, winDebrisOriginRef.current)
          }
        }
      }

      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      // Tear the climb voice down if the canvas unmounts mid-round.
      stopPulseClimbVoice()
    }
  }, [reducedMotion])

  const ariaLabel = useMemo(() => {
    if (!roundActiveSlot) return 'Pulse round not active'
    if (crashed) return 'Pulse round crashed'
    return 'Pulse curve climbing'
  }, [roundActiveSlot, crashed])

  if (reducedMotion) {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        className="flex h-full w-full items-center justify-center rounded-xl bg-bg-secondary text-xs text-text-muted"
      >
        animation reduced. the multiplier is shown above.
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      data-testid="pulse-curve-canvas"
      aria-label={ariaLabel}
      role="img"
      className="block h-full w-full rounded-xl"
    />
  )
}

// ─── heartbeat pulse generator ────────────────────────────────────────────

function pulseAt(t: number, baselineMul: number): number {
  const phase = t / 8 // one heartbeat per 8 slots = 0.8 s
  const lub = Math.exp(-(((phase % 1) - 0.18) ** 2) * 70) * 0.85
  const dub = Math.exp(-(((phase % 1) - 0.42) ** 2) * 90) * 0.55
  const dip = -Math.exp(-(((phase % 1) - 0.05) ** 2) * 200) * 0.25
  const settle = Math.sin((phase % 1) * Math.PI * 2) * 0.08 * Math.exp(-(phase % 1) * 1.5)
  const amplitude = lub + dub + dip + settle
  const energyScale = Math.min(1, Math.max(0.15, Math.log(baselineMul + 0.5) / 1.4))
  return amplitude * energyScale
}

function drawHeartbeatCurve(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  endElapsed: number,
  viewElapsed: number,
  capF: number,
  yCeilMul: number,
  crashed: boolean,
  bottomReservedPx: number,
  headX: number,
  headY: number,
  headBaselineMul: number,
  accentSolidRgb: string = ACCENT_SOLID_RGB,
): void {
  const accent = crashed ? CRASH_RGB : accentSolidRgb
  const samples = Math.min(220, Math.floor(W / 3))
  // Sample from slot 0 to endElapsed (full arc visible). With x now
  // multiplier-parametric, the full arc-from-1× is always meaningful;
  // there is no "off-canvas left" to truncate against because low-mul
  // samples sit at low xNorm naturally.
  const firstSlot = 0
  const span = endElapsed - firstSlot
  if (span <= 0) return
  // viewElapsed is no longer used for x projection — kept in the signature
  // for now to avoid touching every call site; suppress lint warning.
  void viewElapsed

  // Per-sample cap matches the head's on-chain clip — see PULSE-CRASH-FX
  // -2026-05-27 fix 3 comment at the call site. On a live (uncrashed)
  // round `headBaselineMul === rawHeadMul` so this is a no-op; on crashed
  // rounds it pins every sample's baseline at or below the on-chain
  // crash multiplier so the trail can never overshoot the dot.
  const sampleCap = Math.min(capF, headBaselineMul)

  type P = { x: number; y: number }
  const points: P[] = []
  for (let i = 0; i <= samples; i++) {
    const t = firstSlot + (span * i) / samples
    const baseline = Math.min(multiplierMulForVisual(t), sampleCap)
    const beatNoise = pulseAt(t, baseline)
    // The heartbeat bobble fades out as the sample approaches the head, so
    // the curve's terminal point lands exactly on the head dot.
    const tailingProximity = i / samples
    const beatTaper = 1 - tailingProximity * tailingProximity
    const visualMul = Math.min(
      Math.max(1.0, baseline * (1 + beatNoise * 0.045 * beatTaper)),
      sampleCap,
    )
    // Both x and y are now derived from the SAMPLE's multiplier, not
    // its slot. The curve traces a fixed parabola arc (y = x²) in
    // (xNorm, yNorm) space — Aviator-style.
    points.push({
      x: projectX(visualMul, yCeilMul, W),
      y: projectY(visualMul, H, yCeilMul, bottomReservedPx),
    })
  }
  // FORCE the last sample to land exactly at the head dot. Relying on
  // `multiplierMulForVisual(headElapsed) === crashBps/10000` to converge
  // through the projection math is brittle — JavaScript floating-point
  // drift through (smoothstep ramp + product accumulation + log/log y
  // mapping) can leave a few pixels between the curve's last sample and
  // the dot. Pinning the terminal vertex to (headX, headY) is the only
  // way to guarantee they coincide regardless of round, slot count, or
  // crash multiplier.
  if (points.length > 0) {
    points[points.length - 1] = { x: headX, y: headY }
  }

  // Area fill — bounded by the curve on top and the mul=1.0 baseline on
  // the bottom (not the canvas floor). With the baseline offset lifting
  // mul=1.0 well above the canvas bottom, anchoring the fill to the
  // floor created a vertical "wall" at the curve's left edge that read
  // as a step/cliff. Anchoring to the baseline makes the fill a clean
  // wedge between the curve and where the round started.
  const baselineY = projectY(1.0, H, yCeilMul, bottomReservedPx)
  const fillPath = new Path2D()
  fillPath.moveTo(points[0]!.x, baselineY)
  for (const p of points) fillPath.lineTo(p.x, p.y)
  fillPath.lineTo(points[points.length - 1]!.x, baselineY)
  fillPath.closePath()
  const fillGrad = ctx.createLinearGradient(0, 0, 0, H)
  fillGrad.addColorStop(0, `rgba(${accent},0.30)`)
  fillGrad.addColorStop(0.6, `rgba(${accent},0.08)`)
  fillGrad.addColorStop(1, `rgba(${accent},0.0)`)
  ctx.fillStyle = fillGrad
  ctx.fill(fillPath)

  // Three-layer stroke: outer glow, inner line, hot highlight.
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(${accent},0.22)`
  ctx.lineWidth = 6
  ctx.shadowColor = `rgba(${accent},0.65)`
  ctx.shadowBlur = 18
  strokeSmoothed(ctx, points)
  ctx.shadowBlur = 8
  ctx.strokeStyle = `rgba(${accent},1)`
  ctx.lineWidth = 2.4
  strokeSmoothed(ctx, points)
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1
  strokeSmoothed(ctx, points)
}

/**
 * The "would-have-crashed" continuation drawn after a winning cash-out.
 * Single thin dashed pass in muted cyan — informational and unmistakably
 * "what-if". Never glow-amped; the player's actual choice owns the visual
 * weight per `BEST-PRACTICES.md` §6 RG-C3 (no near-miss amplification).
 */
function drawGhostContinuation(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fromElapsed: number,
  toElapsed: number,
  viewElapsed: number,
  capF: number,
  yCeilMul: number,
  bottomReservedPx: number,
): void {
  if (toElapsed <= fromElapsed) return
  const samples = 90
  const span = toElapsed - fromElapsed
  void viewElapsed // x is mul-parametric now; viewElapsed kept for signature parity
  type P = { x: number; y: number }
  const pts: P[] = []
  for (let i = 0; i <= samples; i++) {
    const t = fromElapsed + (span * i) / samples
    const baseline = Math.min(multiplierMulForVisual(t), capF)
    const beat = pulseAt(t, baseline)
    const visualMul = Math.min(Math.max(1.0, baseline * (1 + beat * 0.04)), capF)
    pts.push({
      x: projectX(visualMul, yCeilMul, W),
      y: projectY(visualMul, H, yCeilMul, bottomReservedPx),
    })
  }
  ctx.save()
  ctx.setLineDash([5, 5])
  ctx.lineDashOffset = 0
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(${ACCENT_TEXT_RGB},0.32)`
  ctx.lineWidth = 1.4
  ctx.shadowBlur = 0
  strokeSmoothed(ctx, pts)
  ctx.restore()
}

/** Small marker + label at the would-have-crashed point. */
function drawGhostEndMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  crashBps: bigint,
  W: number,
): void {
  // Open ring + faint cross — distinct from the solid head.
  ctx.save()
  ctx.strokeStyle = `rgba(${ACCENT_TEXT_RGB},0.65)`
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(x, y, 6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x - 3, y)
  ctx.lineTo(x + 3, y)
  ctx.moveTo(x, y - 3)
  ctx.lineTo(x, y + 3)
  ctx.stroke()
  // Caption.
  const label = `WOULD HAVE CRASHED · ${formatMultiplier(crashBps)}`
  ctx.font = '500 10px "Geist Mono", ui-monospace, SFMono-Regular'
  ctx.textBaseline = 'bottom'
  const metrics = ctx.measureText(label)
  // Pin the caption so it stays on-canvas.
  let px = x + 10
  let textAlign: 'left' | 'right' = 'left'
  if (px + metrics.width + 8 > W) {
    px = x - 10
    textAlign = 'right'
  }
  ctx.textAlign = textAlign
  ctx.fillStyle = `rgba(${ACCENT_TEXT_RGB},0.85)`
  ctx.fillText(label, px, y - 8)
  ctx.restore()
}

function strokeSmoothed(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]): void {
  if (points.length < 2) return
  const path = new Path2D()
  path.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const cx = (a.x + b.x) / 2
    const cy = (a.y + b.y) / 2
    path.quadraticCurveTo(a.x, a.y, cx, cy)
  }
  const last = points[points.length - 1]!
  path.lineTo(last.x, last.y)
  ctx.stroke(path)
}

// ─── chrome ───────────────────────────────────────────────────────────────

/**
 * Swoobz "OO" chain watermark — the iconic interlocking-rings element from
 * the SW**OO**BZ wordmark, rendered in low-opacity brand cyan behind the
 * curve. Subtle by default; pulses brighter on tier-pop events so the brand
 * mark has a heartbeat tied to the climb's milestones rather than sitting
 * inert. Visible on every screenshot — that's the share-moment brand cue.
 */
function drawSwoobzWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  brandPulse01: number, // 0..1, spikes on tier pops, decays over BRAND_PULSE_DECAY_MS
  crashed: boolean,
  cashedOut: boolean,
  bottomReservedPx: number,
): void {
  const paths = logoPaths()
  // Full SWOOBZ wordmark — wide and short (6.18:1 source aspect). Sized to
  // ~68 % of canvas width so the brand reads end-to-end without competing
  // with the curve. Vertically centred in the playable area.
  const usableH = Math.max(1, H - bottomReservedPx - 32)
  const aspectScale = LOGO_BBOX_W / LOGO_BBOX_H
  const maxByWidth = W * 0.68
  // Cap the height so the wordmark stays unobtrusive even on tall canvases.
  const maxByHeight = Math.min(usableH * 0.32, 140) * aspectScale
  const targetW = Math.min(maxByWidth, maxByHeight)
  const scale = targetW / LOGO_BBOX_W
  const targetH = LOGO_BBOX_H * scale
  const targetX = (W - targetW) / 2
  const targetY = (usableH - targetH) / 2 + 16

  // Two-layer alpha register — letters stay quiet body, OO chains react.
  // Crashed dims everything (the stamp + scar own the mass). Cashed-out
  // gives a small win-glow boost.
  const baseRest = crashed ? 0.7 : cashedOut ? 1.1 : 1.0
  const letterAlpha = Math.min(0.1, 0.035 * baseRest)
  const ooRestingAlpha = crashed ? 0.025 : cashedOut ? 0.085 : 0.055
  const ooPulseAlpha = brandPulse01 * 0.14
  const ooAlpha = Math.min(0.24, ooRestingAlpha + ooPulseAlpha)
  if (letterAlpha < 0.005 && ooAlpha < 0.005) return

  ctx.save()
  // Position: translate to target origin, then scale, then offset by the
  // wordmark's intrinsic origin so the shape lands inside the target box.
  ctx.translate(targetX, targetY)
  ctx.scale(scale, scale)

  // Layer 1 — SW…BZ letters (static body, white).
  if (letterAlpha >= 0.005) {
    ctx.save()
    ctx.globalAlpha = letterAlpha
    ctx.fillStyle = '#ffffff'
    for (const path of paths.letters) ctx.fill(path)
    ctx.restore()
  }

  // Layer 2 — OO chain rings (reactive, brand cyan, glow on tier-pop).
  // Renders ON TOP of the letter layer so the OO reads as the featured
  // element — same hierarchy as the original logo where the OO carries
  // the gradient highlight.
  if (ooAlpha >= 0.005) {
    ctx.save()
    ctx.globalAlpha = ooAlpha
    ctx.fillStyle = `rgb(${ACCENT_SOLID_RGB})`
    if (brandPulse01 > 0.05) {
      ctx.shadowColor = `rgba(${ACCENT_SOLID_RGB},${brandPulse01 * 0.55})`
      ctx.shadowBlur = 24 * brandPulse01
    }
    for (const path of paths.oo) ctx.fill(path)
    ctx.restore()
  }

  ctx.restore()
}

/**
 * Precision medical-grade graticule per PULSE-ART-DIRECTION-2026-05-25 §3.2.
 *
 * Replaces the previous `drawGrid` + `drawSky` pair. The graticule reads as
 * a clinical-grade EKG-monitor + Bloomberg-terminal readout grid:
 * - horizontal multiplier guide lines in muted-cyan (the cyan is functional
 *   readout chrome, NOT a 5th cyan moment — it lives in the same
 *   trace-instrument identity group)
 * - vertical slot tick markers in barely-visible white every 5 slots, giving
 *   the trace temporal context without competing for attention
 * - the `mul = 1.00x` trace baseline as a 1px hairline floor line in
 *   `#2a3540` (one tonal step above canvas) — the literal floor the trace
 *   climbs above
 *
 * On crash, the lines dim further so the stamp + frozen trace own the
 * canvas, but the labels stay readable (the player needs to know what
 * altitude they reached). Per DLv2 §1 P10 — no ambient motion on grid.
 */
function drawGraticule(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  ceilMul: number,
  crashed: boolean,
  bottomReservedPx: number,
): void {
  // Trace baseline — the `mul = 1.00x` floor line. One tonal step above
  // canvas so the player has a visible "floor" the trace climbs above.
  const baselineY = projectY(1.0, H, ceilMul, bottomReservedPx)
  ctx.strokeStyle = 'rgba(255,255,255,0.10)' // DS line-equivalent baseline
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, baselineY)
  ctx.lineTo(W, baselineY)
  ctx.stroke()

  // Horizontal multiplier guide lines — muted cyan readout chrome at the
  // canonical guide multipliers. Per §3.2: 1.5x / 2x / 5x / 10x / 50x.
  // Crash dims the lines and labels so the stamp + scar own the canvas.
  // A11Y + artotty: grid was too faint and labels failed contrast. Lines
  // raised so the instrument lattice reads; labels raised to pass contrast.
  const lineAlpha = crashed ? 0.07 : 0.12
  const labelAlpha = crashed ? 0.55 : 0.72
  ctx.strokeStyle = `rgba(${ACCENT_TEXT_RGB},${lineAlpha})`
  ctx.lineWidth = 1
  const guides: bigint[] = []
  for (const m of [1.5, 2, 5, 10, 25, 50, 100, 200]) {
    if (m <= ceilMul * 1.1) guides.push(BigInt(Math.floor(m * 10_000)))
  }
  for (const g of guides) {
    const y = projectY(Number(g) / Number(ONE_X_BPS), H, ceilMul, bottomReservedPx)
    if (y < 16 || y > H - 16) continue
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
    ctx.fillStyle = `rgba(${ACCENT_TEXT_RGB},${labelAlpha})`
    ctx.font = '600 11px "Geist Mono", ui-monospace, SFMono-Regular'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(formatMultiplier(g), 12, y - 1)
  }

  // Vertical slot tick markers — barely-visible white every ~50px of
  // canvas width, giving the trace temporal context (the player can feel
  // "the round is progressing" without conscious counting). Per §3.2: 1px
  // lines at rgba(255,255,255,0.04).
  ctx.strokeStyle = `rgba(255,255,255,${crashed ? 0.02 : 0.04})`
  ctx.lineWidth = 1
  const tickSpacing = 50
  for (let x = tickSpacing; x < W; x += tickSpacing) {
    ctx.beginPath()
    ctx.moveTo(x, 16)
    ctx.lineTo(x, H - bottomReservedPx - 4)
    ctx.stroke()
  }
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  crashed: boolean,
  accentSolidRgb: string = ACCENT_SOLID_RGB,
): void {
  const accent = crashed ? CRASH_RGB : accentSolidRgb
  // DLv2 §10: static head. No breathing pulse on chrome — motion is reserved
  // for state change. The fixed-size head reads as "current state", not as
  // an attention-grabbing ambient animation.
  const r = crashed ? 7 : 5
  ctx.strokeStyle = `rgba(${accent},0.55)`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(x, y, r + 6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = `rgba(${accent},1)`
  ctx.shadowColor = `rgba(${accent},1)`
  ctx.shadowBlur = crashed ? 30 : 16
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath()
  ctx.arc(x, y, 1.6, 0, Math.PI * 2)
  ctx.fill()
}

function drawHeadLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  leadBps: bigint,
  crashed: boolean,
  W: number,
): void {
  const label = formatMultiplier(leadBps)
  ctx.font = '600 12px "Geist Mono", ui-monospace, SFMono-Regular'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const metrics = ctx.measureText(label)
  const px = Math.min(W - metrics.width - 14, x + 14)
  const py = Math.max(16, y - 14)
  const pad = 5
  ctx.fillStyle = crashed ? `rgba(${CRASH_RGB},0.92)` : 'rgba(0,0,0,0.55)'
  roundedRect(ctx, px - pad, py - 9, metrics.width + pad * 2, 18, 5)
  ctx.fill()
  ctx.fillStyle = crashed ? 'rgba(255,240,240,1)' : 'rgba(255,255,255,0.95)'
  ctx.fillText(label, px, py)
}

function drawHeroMultiplier(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  leadBps: bigint,
  crashed: boolean,
  popScale: number,
  bottomReservedPx: number,
  accentSolidRgb: string = ACCENT_SOLID_RGB,
): void {
  ctx.save()
  const label = formatMultiplier(leadBps)
  const accent = crashed ? CRASH_RGB : accentSolidRgb
  // Hero multiplier moved to TOP-LEFT corner at small/medium size
  // (Tim 2026-05-25): center-left huge size obstructed the curve trajectory
  // the player is reading. The HUD must wrap the play, never cover it.
  // Subtle pop scale on tier crossing retained for tactile feedback (≤+10 %),
  // but the thrill log-scale removed — the curve carries the climb, the
  // readout stays a steady corner anchor.
  // popScale spec (fusion bible): +16% on tier-cross — the VCM-2087
  // instrument registering a threshold crossing with a perceptible but
  // non-escalating nudge. Cap is a module-const literal (RG-C5: identical
  // every tier-cross, never per-streak). Was 1.1; the frame loop already
  // targets +16% at t=0 so the cap was the bottleneck.
  const popLift = Math.max(1, Math.min(1.16, popScale))
  // Font size scales modestly with canvas height so it reads on mobile
  // (~32px) and desktop (~40px) without overflowing the corner zone.
  const fontSize = Math.max(32, Math.min(40, H * 0.1)) * popLift
  ctx.font = `800 ${fontSize}px "Geist Mono", ui-monospace, SFMono-Regular, Menlo`
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  // Top-left padding 16 px. Trajectory now climbs unobstructed from the
  // lower-left toward the upper-right; the readout sits in the corner the
  // curve will never visit until very late in a high-multiplier run.
  const x = 16
  const y = 16
  void W
  void bottomReservedPx
  ctx.shadowColor = `rgba(${accent},0.7)`
  ctx.shadowBlur = crashed ? 24 : 14 + (popLift - 1) * 80
  ctx.fillStyle = `rgba(${accent},1)`
  ctx.fillText(label, x, y)
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 1
  ctx.strokeText(label, x, y)
  ctx.restore()
}

function drawCrashFlash(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  elapsedMs: number,
): void {
  // The full-canvas flash washed out the stamp + curve + grid. Replaced
  // with a head-focused impact ring elsewhere (debris particles already
  // own the spatial impact). Kept as a no-op so callers don't break.
  void ctx
  void W
  void H
  void elapsedMs
}

/**
 * The dramatic crash stamp. Slides in over ~500 ms, settles. CRASHED in
 * mono caps + "BUST AT X.XXx" in tabular mono. Informational, RG-bounded.
 */
function drawCrashStamp(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  elapsedMs: number,
): void {
  // Slide + fade-in over 360 ms, then steady. With the hero gone and the
  // global flash dropped, the stamp now stands on its own — bigger, with
  // a deeper backdrop band, and tracked letter-spacing so it reads as a
  // verdict, not a chat bubble.
  const reveal = Math.min(1, elapsedMs / 360)
  const offset = (1 - reveal) * 18
  const alpha = reveal
  ctx.save()
  ctx.translate(0, offset)
  // Backdrop band — taller + darker for higher contrast.
  const bandH = 108
  const bandY = H * 0.5 - bandH / 2
  const bandGrad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH)
  bandGrad.addColorStop(0, `rgba(0,0,0,${0.0 * alpha})`)
  bandGrad.addColorStop(0.5, `rgba(0,0,0,${0.88 * alpha})`)
  bandGrad.addColorStop(1, `rgba(0,0,0,${0.0 * alpha})`)
  ctx.fillStyle = bandGrad
  ctx.fillRect(0, bandY, W, bandH)
  // Top + bottom hairline rules in crash coral.
  ctx.strokeStyle = `rgba(${CRASH_RGB},${0.55 * alpha})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(W * 0.18, H * 0.5 - bandH * 0.42)
  ctx.lineTo(W * 0.82, H * 0.5 - bandH * 0.42)
  ctx.moveTo(W * 0.18, H * 0.5 + bandH * 0.42)
  ctx.lineTo(W * 0.82, H * 0.5 + bandH * 0.42)
  ctx.stroke()
  // CRASHED stamp — the verb owns the moment. The bust value lives on the
  // settlement bar below the canvas (one fact, one place). 48px + manual
  // letter-tracking via thin-space joins so it reads as a verdict. Using
  // U+2009 (thin space) avoids relying on `ctx.letterSpacing` which is
  // not supported on Safari < 17.4.
  ctx.font = '800 48px "Geist Mono", ui-monospace, SFMono-Regular, Menlo'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `rgba(${CRASH_RGB},${alpha})`
  ctx.shadowColor = `rgba(${CRASH_RGB},${0.95 * alpha})`
  ctx.shadowBlur = 26
  // Manual tracking via thin spaces — reads as a verdict without depending
  // on ctx.letterSpacing (Safari < 17.4).
  ctx.fillText('C R A S H E D', W / 2, H * 0.5)
  ctx.shadowBlur = 0
  ctx.restore()
}

/**
 * The win stamp — mirror of CRASHED, cyan + positive. Slides in over ~400ms.
 * Per `BEST-PRACTICES.md` §3 GC2: celebrates the real decision + real win;
 * never a near-miss. Caps at the brand cyan economy.
 */
function drawWinStamp(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  elapsedMs: number,
  cashOutBps: bigint,
): void {
  // PULSE-ART-DIRECTION-2026-05-25 §6.1 Category 5 — the cash-out juice is
  // hit-stop + figure-tween + WIN-stamp overshoot. The previous
  // implementation slid in over 400ms then sat still; this adds the
  // overshoot-and-settle scale tween that replaces the deleted
  // 48-cyan-particle radial spark fan. The hit-stop is the first 50ms
  // (3 frames @ 60fps) where the stamp freezes at zero scale — gives the
  // payout figure time to land in the player's eye before the overshoot.
  const HIT_STOP_MS = 50
  const SLIDE_MS = 350
  const slideT = Math.min(1, Math.max(0, (elapsedMs - HIT_STOP_MS) / SLIDE_MS))
  const reveal = slideT
  const offset = (1 - reveal) * 18
  const alpha = reveal
  // Overshoot 1.0 → 1.06 → 1.0 over the slide window (Material expressive
  // "follow-through and settle" per motion-director.md Category 5).
  const overshootT = slideT
  const overshoot =
    overshootT < 0.5
      ? 1 + 0.06 * (overshootT * 2) // ease up to 1.06 at 50%
      : 1.06 - 0.06 * ((overshootT - 0.5) * 2) // ease back to 1.0 at 100%
  ctx.save()
  ctx.translate(W / 2, H * 0.5)
  ctx.scale(overshoot, overshoot)
  ctx.translate(-W / 2, -H * 0.5)
  ctx.translate(0, offset)
  // Backdrop band.
  const bandH = 92
  const bandY = H * 0.5 - bandH / 2
  const grad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH)
  grad.addColorStop(0, `rgba(0,8,12,${0.52 * alpha})`)
  grad.addColorStop(0.5, `rgba(0,16,22,${0.78 * alpha})`)
  grad.addColorStop(1, `rgba(0,8,12,${0.52 * alpha})`)
  ctx.fillStyle = grad
  ctx.fillRect(0, bandY, W, bandH)
  // Cyan hairline rules top + bottom.
  ctx.strokeStyle = `rgba(${ACCENT_SOLID_RGB},${0.55 * alpha})`
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, bandY + 0.5)
  ctx.lineTo(W, bandY + 0.5)
  ctx.moveTo(0, bandY + bandH - 0.5)
  ctx.lineTo(W, bandY + bandH - 0.5)
  ctx.stroke()
  // Big multiplier (the X the player asked for).
  ctx.font = '800 56px "Geist Mono", ui-monospace, SFMono-Regular, Menlo'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `rgba(${ACCENT_SOLID_RGB},${alpha})`
  ctx.shadowColor = `rgba(${ACCENT_SOLID_RGB},${0.9 * alpha})`
  ctx.shadowBlur = 22
  ctx.fillText(formatMultiplier(cashOutBps), W / 2, H * 0.5 - 4)
  ctx.shadowBlur = 0
  // CASHED OUT label.
  ctx.font = '600 12px "Geist Mono", ui-monospace, SFMono-Regular, Menlo'
  ctx.fillStyle = `rgba(${ACCENT_TEXT_RGB},${0.92 * alpha})`
  ctx.letterSpacing = '0.30em' // ignored by many engines; harmless
  ctx.fillText('CASHED OUT', W / 2, H * 0.5 + 28)
  ctx.restore()
}

/**
 * The "ROUND STARTING" anticipation beat. Sits center-canvas, animates a
 * brief countdown ring + label that fades through the warm-up window.
 * Player feedback: "when you start it flickers directly into the action —
 * a bit hard for the eyes to follow." This is the visual anchor that fixes
 * that. Ends cleanly at `INTRO_DELAY_MS`.
 */
function drawIntroOverlay(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  elapsedMs: number,
  durationMs: number,
): void {
  const progress = Math.min(1, elapsedMs / durationMs)
  // Ease-in-out the overall alpha so it appears and clears smoothly.
  const fadeIn = Math.min(1, elapsedMs / 200)
  const fadeOut = Math.min(1, Math.max(0, (durationMs - elapsedMs) / 200))
  const alpha = Math.min(fadeIn, fadeOut)
  ctx.save()
  // Cyan progress ring at the centre, sweeping clockwise over the window.
  const cx = W / 2
  const cy = H * 0.5
  const ringR = Math.min(W, H) * 0.1
  ctx.strokeStyle = `rgba(${ACCENT_TEXT_RGB},${0.18 * alpha})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = `rgba(${ACCENT_SOLID_RGB},${0.95 * alpha})`
  ctx.lineCap = 'round'
  ctx.lineWidth = 2.5
  ctx.shadowColor = `rgba(${ACCENT_SOLID_RGB},${alpha})`
  ctx.shadowBlur = 14
  ctx.beginPath()
  ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
  ctx.stroke()
  ctx.shadowBlur = 0
  // "ROUND STARTING" caption above the ring.
  ctx.font = '600 11px "Geist Mono", ui-monospace, SFMono-Regular'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `rgba(${ACCENT_TEXT_RGB},${alpha})`
  // 2087 instrument register: the ring reads as the VCM-2087 arming
  // sequence (the vitals monitor powering up to record the cardiac trace).
  ctx.fillText('INSTRUMENT ARMED', cx, cy - ringR - 16)
  // Sub-caption with a slot-style readout under the ring.
  ctx.font = '500 10px "Geist Mono", ui-monospace, SFMono-Regular'
  ctx.fillStyle = `rgba(255,255,255,${0.55 * alpha})`
  ctx.fillText('LOCK IN · 1.00x', cx, cy + ringR + 16)
  ctx.restore()
}

// ─── Module-const resting-beat geometry (RG-C5) ───────────────────────────
// The signature idle ambient of the VCM-2087 instrument: a single authored
// lub-dub resting cardiac beat that travels once through a centered window
// per period, then holds flat baseline — a heart monitor at rest. Period and
// amplitudes are module-const: identical every idle frame, no session/streak
// conditionals. This is the ONE idle ambient (the backdrop VCM sweep is
// invisible during idle), so it never competes for the "living place at rest".
const IDLE_BEAT_PERIOD_MS = 3000 // 3.0s total period (~20 BPM resting)
const IDLE_LUB_LIFT_FRAC = 0.06 // lub peak = 6% of half-canvas height
const IDLE_DUB_LIFT_FRAC = 0.03 // dub peak = 3%
const IDLE_LUB_PEAK_MS = 450 // rise to lub by 450ms
const IDLE_DUB_PEAK_MS = 800 // dub peak at 800ms (450 + 150 rest + 200 rise)
const IDLE_RETURN_MS = 1400 // returned to baseline by 1400ms, then hold
const IDLE_CURVE_WIDTH_FRAC = 0.52 // the authored beat spans ~52% of W

/**
 * drawIdleHeartbeat — the signature idle ambient of the VCM-2087 instrument.
 *
 * A single authored lub-dub resting cardiac beat at H/2, centered
 * horizontally. Replaces the previous perpetually-scrolling ~0.14Hz sine
 * (`((x + now/18) % W) / 80`) which read as a drifting ambient without cardiac
 * soul. The beat travels through a centered ±35%-of-period window once per
 * 3.0s, then holds flat baseline — a heart monitor breathing at rest.
 *
 * Beat envelope (authored, not generative): 0-450ms lub lift 6%, 450-600ms
 * rest, 600-800ms dub lift 3%, 800-1400ms return, 1400-3000ms flat hold.
 *
 * RG-C5: period + amplitude fractions are module-const (above). Held-frame
 * test passes: any paused frame reads as a composed EKG slice.
 */
function drawIdleHeartbeat(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  const usableH = H * 0.5 // amplitude reference: half canvas height
  const beatPhaseMs = now % IDLE_BEAT_PERIOD_MS

  // Vertical offset at a given phase — the piecewise cardiac lub-dub envelope.
  // All lifts are fractions of usableH so the shape scales across canvas sizes.
  function beatOffsetAtMs(phaseMs: number): number {
    const lubLift = usableH * IDLE_LUB_LIFT_FRAC
    const dubLift = usableH * IDLE_DUB_LIFT_FRAC
    if (phaseMs < IDLE_LUB_PEAK_MS) {
      const t = phaseMs / IDLE_LUB_PEAK_MS
      return Math.sin(t * Math.PI * 0.5) * lubLift // rise to lub
    }
    if (phaseMs < IDLE_LUB_PEAK_MS + 150) {
      const t = (phaseMs - IDLE_LUB_PEAK_MS) / 150
      return Math.cos(t * Math.PI * 0.5) * lubLift // rest after lub
    }
    if (phaseMs < IDLE_DUB_PEAK_MS) {
      const t = (phaseMs - (IDLE_LUB_PEAK_MS + 150)) / (IDLE_DUB_PEAK_MS - IDLE_LUB_PEAK_MS - 150)
      return Math.sin(t * Math.PI * 0.5) * dubLift // rise to dub
    }
    if (phaseMs < IDLE_RETURN_MS) {
      const t = (phaseMs - IDLE_DUB_PEAK_MS) / (IDLE_RETURN_MS - IDLE_DUB_PEAK_MS)
      return Math.cos(t * Math.PI * 0.5) * dubLift // return to baseline
    }
    return 0 // flat hold for the remainder of the period
  }

  // Draw the beat as a path centered at W/2 spanning IDLE_CURVE_WIDTH_FRAC of W.
  // Each x sample maps a time offset around the current beat phase, so the
  // rendered slice is the segment centered on `now` (oscilloscope sweep).
  const curveW = W * IDLE_CURVE_WIDTH_FRAC
  const xStart = (W - curveW) / 2
  const samples = Math.ceil(curveW / 2)
  const windowHalfMs = IDLE_BEAT_PERIOD_MS * 0.35
  const baseY = H / 2

  ctx.save()
  ctx.lineWidth = 1.6
  ctx.strokeStyle = `rgba(${ACCENT_SOLID_RGB},0.55)`
  ctx.shadowColor = `rgba(${ACCENT_TEXT_RGB},0.85)`
  ctx.shadowBlur = 12
  ctx.beginPath()
  for (let i = 0; i <= samples; i++) {
    const xFrac = i / samples
    const sampleOffsetMs = (xFrac - 0.5) * windowHalfMs * 2
    const samplePhaseMs =
      (((beatPhaseMs + sampleOffsetMs) % IDLE_BEAT_PERIOD_MS) + IDLE_BEAT_PERIOD_MS) %
      IDLE_BEAT_PERIOD_MS
    const x = xStart + xFrac * curveW
    const y = baseY - beatOffsetAtMs(samplePhaseMs)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
  ctx.shadowBlur = 0

  // Instrument-register caption — Geist Mono, 2087 instrument language.
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.font = '500 10px "Geist Mono", ui-monospace, SFMono-Regular'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PLACE WAGER TO ARM INSTRUMENT', W / 2, H - 18)
}

// ─── geometry ─────────────────────────────────────────────────────────────
// (Particle helpers DELETED per PULSE-ART-DIRECTION-2026-05-25 §6.2 — the
//  three particle systems were AI-slop substitutes for real composition.
//  Tim 2026-05-25: "please stop with the particle effects." The trace IS
//  the instrument; the head dot IS the terminus; the stamp IS the
//  punctuation.)

// Vertical zone reserved at the bottom of the canvas. Historically the
// action bar (CASH OUT / BET AGAIN HUD) lived at bottom-right of the
// canvas and needed a 220px reserve so the curve wouldn't terminate
// behind the bar's chrome.
//
// Tim 2026-05-26 SCENE REBUILD: the action panel has been relocated from
// `bottom-right` to `top-right` (instrument plate's right rail, same
// vertical band as the live-multiplier readout). The bottom of the canvas
// is now free — the curve can use the full vertical span. The remaining
// bottom reserve protects the maker-mark + scanner-line ambient zone
// (PulseSceneBackdrop) from being painted over by curve terminus dots
// near 1.0x.
const BOTTOM_RESERVED_BAR_PX = 56
const BOTTOM_RESERVED_IDLE_PX = 28

// projectY / Y_MIN_CEIL / Y_BASELINE_OFFSET moved to `pulseProjection.ts`
// (PULSE-FX-RESTORE-2026-05-27 fix 1) so the curve canvas and the scene
// backdrop share a single source of truth for the bps → Y mapping. The
// imports at the top of this file pull them in.

// Curve geometry — Aviator-style parametric arc (Tim 2026-05-21).
//
// Previously x was a function of time (slot count) and y was a function
// of multiplier. With multiplier growing exponentially in time and the
// auto-scaling ceil pinning the head at a fixed canvas fraction, the
// per-slot dy was roughly constant — straight line, no arc, no
// adrenaline. The flaw was fundamental: any (linear-in-time x) +
// (multiplier-y) combination flattens out.
//
// The fix is what Aviator does — parametrize the WHOLE curve shape by
// multiplier, not time. xNorm = sqrt(normalisedMul), yNorm linear in
// normalisedMul. Plotting (xNorm, yNorm) traces y = x² — a true
// parabola arc. The head's position on that arc advances as mul climbs;
// time only controls SPEED along the path, not the shape. The visible
// curve always reads as the same recognisable Aviator-arc, slot-rate
// independent, and the slope visibly steepens toward the head.
//
// HEAD_PIN_FRACTION = 0.78 caps the head's x at ~78 % of canvas width
// when the multiplier reaches the y-axis ceiling, leaving "future
// runway" to the right.
const HEAD_PIN_FRACTION = 0.78

function projectX(mul: number, ceilMul: number, W: number): number {
  const PAD = 28
  const usableW = Math.max(1, W - PAD * 2)
  const ceil = Math.max(2.0, ceilMul)
  // sqrt of normalised mul: slow at low mul (curve nearly flat), fast at
  // high mul (head accelerates rightward). Combined with linear-in-mul
  // y mapping this draws y = x² as the curve walks the multiplier range.
  const normMul = Math.min(1, Math.max(0, (mul - 1) / (ceil - 1)))
  const xNorm = Math.sqrt(normMul)
  return PAD + xNorm * HEAD_PIN_FRACTION * usableW
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
}

/**
 * Pulse crash debris — single-shot deterministic burst.
 *
 * PULSE-FX-RESTORE-2026-05-27 fix 2. The previous re-skin removed the
 * crash-moment particle burst alongside the (correctly) removed ambient
 * particle spam. Tim reported the regression on 2026-05-27. This module
 * restores ONLY the single crash-moment burst — no ambient spam, no
 * continuous emitters.
 *
 * Behavioral contract (RG-C5 STRUCTURAL):
 *   - Count, lifetime, speed, gravity, palette are module-level consts.
 *   - The draw function takes only (ctx, W, H, elapsedSinceCrashMs, seed,
 *     origin). No streak / wager / session parameter can reach it.
 *   - The burst is IDENTICAL on every crash regardless of context. Only
 *     the deterministic seed (derived from the crash slot) varies fragment
 *     angles so different rounds look different but the SAME crash slot
 *     replays the same burst.
 *   - Lifetime is bounded — burst goes to zero opacity at
 *     CRASH_DEBRIS_LIFETIME_MS. No long tail.
 *
 * Domain C: presentation only. Pure rendering, no state mutations.
 */

export const CRASH_DEBRIS_COUNT = 16 as const
export const CRASH_DEBRIS_LIFETIME_MS = 700 as const
export const CRASH_DEBRIS_SPEED_PX_PER_MS = 0.28 as const
export const CRASH_DEBRIS_GRAVITY_PX_PER_MS2 = 0.0009 as const

/**
 * Cool-palette only: cyan, white, the existing crash coral. No warm
 * (gold/brass/amber) tones — Tim 2026-05-25 hard NO on warm+cool combo.
 */
export const CRASH_DEBRIS_PALETTE: ReadonlyArray<string> = [
  'rgba(0,240,255,', // ACCENT_SOLID cyan
  'rgba(255,255,255,', // white spark
  'rgba(255,65,53,', // DS blood — CRASH color
] as const

export interface CrashDebrisOrigin {
  readonly x: number
  readonly y: number
}

/**
 * Mulberry32-inspired deterministic PRNG. Given the same seed it produces
 * the same sequence — RG-C1 deterministic. Exported for unit testing.
 */
export function seededRandom(seed: number): () => number {
  let state = seed | 0
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Draws the single crash-moment debris burst.
 *
 * Pure function. Returns nothing — only paints into `ctx`. Returns early
 * if `elapsedSinceCrashMs` is outside [0, CRASH_DEBRIS_LIFETIME_MS) so
 * callers can paint unconditionally without bounds checks.
 */
export function drawCrashDebris(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  elapsedSinceCrashMs: number,
  seed: number,
  origin: CrashDebrisOrigin,
): void {
  if (elapsedSinceCrashMs < 0 || elapsedSinceCrashMs >= CRASH_DEBRIS_LIFETIME_MS) {
    return
  }
  void W
  const lifeT = elapsedSinceCrashMs / CRASH_DEBRIS_LIFETIME_MS
  const fade = 1 - lifeT
  const rng = seededRandom(seed)
  ctx.save()
  for (let i = 0; i < CRASH_DEBRIS_COUNT; i++) {
    // Deterministic per-fragment heading + speed + size.
    const angle = rng() * Math.PI * 2
    const speedMul = 0.55 + rng() * 0.9 // 0.55..1.45 × base
    const size = 1.5 + rng() * 2.2 // 1.5..3.7 px
    const colorIdx = Math.floor(rng() * CRASH_DEBRIS_PALETTE.length)
    const rgbaPrefix = CRASH_DEBRIS_PALETTE[colorIdx]!
    const dist = CRASH_DEBRIS_SPEED_PX_PER_MS * speedMul * elapsedSinceCrashMs
    const px = origin.x + Math.cos(angle) * dist
    // Gravity drag: fragments fall ~1px / 33ms² → reads as debris.
    const py =
      origin.y +
      Math.sin(angle) * dist +
      0.5 * CRASH_DEBRIS_GRAVITY_PX_PER_MS2 * elapsedSinceCrashMs * elapsedSinceCrashMs
    if (py > H + 8) continue // off-screen, skip
    const alpha = (0.85 * fade).toFixed(3)
    ctx.fillStyle = `${rgbaPrefix}${alpha})`
    ctx.beginPath()
    ctx.arc(px, py, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

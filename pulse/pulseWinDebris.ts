/**
 * Pulse win debris — single-shot deterministic upward burst on cash-out.
 *
 * Mirrors `pulseCrashDebris.ts` in structure (same PRNG, same draw
 * contract) but with:
 *   - NEGATIVE gravity → fragments rise and drift back, celebration reads up.
 *   - Cool palette only: cyan + mint + white. NO coral, no warm tokens.
 *   - 900ms lifetime (slightly longer than crash's 700ms — win lingers).
 *   - Upward-biased angle distribution (arc spans ±π/4 around straight up).
 *
 * Behavioral contract (RG-C5 STRUCTURAL):
 *   - Count, lifetime, speed, gravity, palette are module-level consts.
 *   - `drawWinDebris` accepts ONLY (ctx, W, H, elapsedMs, seed, origin).
 *     No streak / wager / session / balance parameter can reach it.
 *   - The burst is IDENTICAL for every cash-out; only the deterministic
 *     seed (from `cashedOutAtSlot`) varies fragment angles so different
 *     rounds look different but the same slot replays the same burst.
 *   - Lifetime is bounded — burst goes to zero opacity at WIN_DEBRIS_LIFETIME_MS.
 *
 * Win debris is the ONE allowed celebration burst (per motion-director
 * spec § Win-juice). It is NOT a particle emitter — it is a single-shot
 * deterministic burst drawn once per cash-out event.
 *
 * Domain C: presentation only. Pure rendering, no state mutations.
 */

export const WIN_DEBRIS_COUNT = 16 as const
export const WIN_DEBRIS_LIFETIME_MS = 900 as const
export const WIN_DEBRIS_SPEED_PX_PER_MS = 0.28 as const
/** Negative gravity → upward bias. Fragments rise then gently drift back. */
export const WIN_DEBRIS_GRAVITY_PX_PER_MS2 = -0.0006 as const

/**
 * Cool-only win palette: cyan bright + mint + white spark.
 * NO coral, NO warm tokens (gold/brass/amber) — Tim 2026-05-25 hard NO
 * on warm+cool combo. Crash owns the coral; win owns the cool tones.
 */
export const WIN_DEBRIS_PALETTE: ReadonlyArray<string> = [
  'rgba(0,240,255,', // ACCENT_SOLID cyan — electric
  'rgba(120,255,200,', // cool mint — celebration lift
  'rgba(255,255,255,', // white spark — clarity
] as const

export interface WinDebrisOrigin {
  readonly x: number
  readonly y: number
}

/**
 * Mulberry32-inspired deterministic PRNG — identical algorithm to
 * `pulseCrashDebris.seededRandom`. Exported for unit testing.
 * Given the same seed it produces the same sequence (RG-C1 deterministic).
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
 * Draws the single cash-out win debris burst.
 *
 * Pure function — returns nothing, only paints into `ctx`. Returns early
 * if `elapsedSinceWinMs` is outside [0, WIN_DEBRIS_LIFETIME_MS) so
 * callers can paint unconditionally without bounds checks.
 *
 * Angle distribution: biased upward. Each fragment's heading is drawn
 * from the arc [-π/2 - π/4, -π/2 + π/4] (12 o'clock ± 45°), giving
 * all fragments an upward trajectory. The seeded offset adds ±π/6
 * variation so the burst fans out rather than shooting in a column.
 */
export function drawWinDebris(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  elapsedSinceWinMs: number,
  seed: number,
  origin: WinDebrisOrigin,
): void {
  if (elapsedSinceWinMs < 0 || elapsedSinceWinMs >= WIN_DEBRIS_LIFETIME_MS) {
    return
  }
  void W
  const lifeT = elapsedSinceWinMs / WIN_DEBRIS_LIFETIME_MS
  const fade = 1 - lifeT
  const rng = seededRandom(seed)
  ctx.save()
  for (let i = 0; i < WIN_DEBRIS_COUNT; i++) {
    // Upward-biased angle: centre at -π/2 (straight up), spread ±π/2.
    // This means the full fan is from -π (left) to 0 (right) spanning
    // through -π/2 (up) — a 180° upper hemisphere with central weighting.
    const angleOffset = (rng() - 0.5) * Math.PI // ±π/2 from 12 o'clock
    const angle = -Math.PI / 2 + angleOffset
    const speedMul = 0.55 + rng() * 0.9 // 0.55..1.45 × base
    const size = 1.5 + rng() * 2.2 // 1.5..3.7 px
    const colorIdx = Math.floor(rng() * WIN_DEBRIS_PALETTE.length)
    const rgbaPrefix = WIN_DEBRIS_PALETTE[colorIdx]!

    const dist = WIN_DEBRIS_SPEED_PX_PER_MS * speedMul * elapsedSinceWinMs
    const px = origin.x + Math.cos(angle) * dist
    // Negative gravity lifts fragments; they rise quickly then arc back.
    const py =
      origin.y +
      Math.sin(angle) * dist +
      0.5 * WIN_DEBRIS_GRAVITY_PX_PER_MS2 * elapsedSinceWinMs * elapsedSinceWinMs

    if (py > H + 8) continue // off-screen below, skip (guard for late-time)
    const alpha = (0.85 * fade).toFixed(3)
    ctx.fillStyle = `${rgbaPrefix}${alpha})`
    ctx.beginPath()
    ctx.arc(px, py, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

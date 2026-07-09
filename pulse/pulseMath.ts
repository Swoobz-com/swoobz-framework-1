/**
 * Pulse curve math (off-chain mirror).
 *
 * The on-chain Rust contract (`programs/originals-pulse/src/curve.rs`) ships
 * Shape A linear growth at 20 bps/slot and a 400ms slot rate — calm and
 * sustained. Player feedback after the first build: that pacing reads as
 * "not fun, way too slow." The genre is Aviator-fast (5–30 s rounds with
 * exponential acceleration). The demo provider in `pulseProvider.ts` runs
 * at a 100 ms tick rate and uses the Shape B compounding curve below, which
 * matches Aviator-class pacing. The on-chain growth constants stay
 * configurable so the program can switch to compounding before mainnet.
 *
 * The crash-point derivation (`deriveCrashBps`) is identical to the chain
 * function bit for bit, so the Glass Box verify widget still proves the
 * deployed math.
 */

export const ONE_X_BPS = 10_000n
export const FIELD_SCALE = 1n << 32n
export const HOUSE_EDGE_BPS = 450n
/** Chain-level clamp (on-chain Rust). The demo applies its own tighter cap below. */
export const MAX_CRASH_BPS = 1_000_000_000n

/**
 * Demo provider crash ceiling. The inverse-CDF has a heavy tail (1% of
 * rounds land above 100x), and with the demo's fast climb rate even an
 * uncapped tail-event lasts well over a minute of wall time. Bounding the
 * demo distribution at 200x keeps the worst round around 25 s. The Glass
 * Box verify widget recomputes against this same cap so the verification
 * still matches bit for bit; the on-chain program uses its own
 * `MAX_CRASH_BPS` (100_000x) which is a separate concern.
 */
export const MOCK_MAX_CRASH_BPS = 2_000_000n

/**
 * Demo provider crash floor — 1.10x. A literal 1.00x crash means the curve
 * never climbs and the player gets zero anticipation: rug-pull energy.
 * Industry crash titles either guarantee a minimum climb (Spribe Aviator's
 * tuned distribution) or display a soft "house round" indicator on early
 * busts. The demo enforces the simpler floor; the on-chain program does
 * NOT apply this floor (the chain ships the raw inverse-CDF) — when the
 * Rust program is tuned, it should add an analogous minimum so player
 * experience matches the demo. The verify widget re-derives with the same
 * floor so verification still matches bit-for-bit.
 */
export const MOCK_MIN_CRASH_BPS = 11_000n

/**
 * Demo slot rate — 100 ms wall time per slot. Four times faster than the
 * on-chain 400 ms cadence; with Shape B below the round arc lands in the
 * Aviator-genre 5–30 s window.
 */
export const SLOT_DURATION_MS = 100n

/**
 * Variable growth rate — a smoothstep-ramped curve that starts slow and
 * accelerates, the way Aviator feels in practice (and what player feedback
 * asked for: "a bezier curve delay so people actually have a little time to
 * get excited"). The growth rate per slot follows
 *
 *   g(s) = BASE + (MAX - BASE) * smoothstep( s / RAMP )
 *
 * with smoothstep(t) = 3t² - 2t³ and t clamped to [0, 1]. The cumulative
 * multiplier is the running product. At 100 ms slots this yields roughly:
 *
 *   slot 10 (1.0 s)  : 1.05x  — settling in
 *   slot 20 (2.0 s)  : 1.13x  — building tension
 *   slot 40 (4.0 s)  : 1.50x  — typical cash-out band
 *   slot 60 (6.0 s)  : 2.40x  — accelerating
 *   slot 80 (8.0 s)  : 4.70x  — full ramp reached
 *   slot 100 (10 s)  : 8.60x  — heating up
 *   slot 150 (15 s)  : ~38x   — late-round tension
 *   slot 220 (22 s)  : capped at 200x
 *
 * Median round crashes in 2–7 s; long-tail rounds last up to ~25 s.
 *
 * The on-chain Rust currently ships Shape A linear (20 bps/slot); the demo
 * provider intentionally uses this richer curve so the UX matches the
 * brand's heartbeat register. Bringing the chain up to a variable-growth
 * Shape C is a follow-on Rust task.
 */
export const BASE_GROWTH_BPS = 50n // +0.50%/slot at the start of the ramp
export const MAX_GROWTH_BPS = 300n // +3.00%/slot at the top of the ramp
export const RAMP_SLOTS = 80n // 8 s at 100 ms ticks
const BPS_DENOM = 10_000n
const SMOOTH_SCALE = 1_000_000n // smoothstep computed in fixed-point

// Retained constants used elsewhere — `growthMultiplierBpsAtSlot` is the
// source of truth for both `currentMultiplierBps` and `crashSlot`.
export const GROWTH_NUM_BPS = 10_180n
export const GROWTH_DEN_BPS = 10_000n

/** Per-slot growth in bps (+x.xx %). Smoothstep ramp from BASE to MAX. */
export function growthBpsAtSlot(slotIdx: bigint): bigint {
  if (slotIdx >= RAMP_SLOTS) return MAX_GROWTH_BPS
  if (slotIdx <= 0n) return BASE_GROWTH_BPS
  // smoothstep(t) = 3t² - 2t³, computed in 1e6-fixed-point.
  const t = (slotIdx * SMOOTH_SCALE) / RAMP_SLOTS
  const t2 = (t * t) / SMOOTH_SCALE
  const t3 = (t2 * t) / SMOOTH_SCALE
  const smooth = 3n * t2 - 2n * t3
  return BASE_GROWTH_BPS + ((MAX_GROWTH_BPS - BASE_GROWTH_BPS) * smooth) / SMOOTH_SCALE
}

/**
 * Smooth float multiplier for the canvas — supports fractional slot offsets
 * for between-tick interpolation. Mirrors the BigInt path but uses float
 * arithmetic (presentation only; the chain math stays BigInt).
 */
export function multiplierMulForVisual(elapsedSlotsFloat: number): number {
  if (elapsedSlotsFloat <= 0) return 1.0
  const fullSlots = Math.floor(elapsedSlotsFloat)
  const partial = elapsedSlotsFloat - fullSlots
  let mul = 1.0
  const baseG = Number(BASE_GROWTH_BPS) / Number(BPS_DENOM)
  const maxG = Number(MAX_GROWTH_BPS) / Number(BPS_DENOM)
  const ramp = Number(RAMP_SLOTS)
  for (let i = 0; i < fullSlots; i++) {
    const t = Math.min(1, i / ramp)
    const smooth = t * t * (3 - 2 * t)
    mul *= 1 + baseG + (maxG - baseG) * smooth
  }
  if (partial > 0) {
    const t = Math.min(1, fullSlots / ramp)
    const smooth = t * t * (3 - 2 * t)
    mul *= 1 + (baseG + (maxG - baseG) * smooth) * partial
  }
  return mul
}

// Retained for the linear path (kept for the verify path's documentation; the
// on-chain linear Shape A still uses this slot rate when the program is
// configured for it).
export const GROWTH_BPS_PER_SLOT = 20n

/**
 * Variable-growth current multiplier in basis points after `elapsedSlots`
 * slots, using the smoothstep ramp above. House-favored floor truncation
 * preserved (every per-slot multiply floors toward zero). Loop exits early
 * once the value reaches the cap.
 */
export function currentMultiplierBps(
  roundActiveSlot: bigint,
  currentSlot: bigint,
  maxBps: bigint = MOCK_MAX_CRASH_BPS,
): bigint {
  if (currentSlot < roundActiveSlot) return ONE_X_BPS
  let mul = ONE_X_BPS
  const elapsed = currentSlot - roundActiveSlot
  for (let i = 0n; i < elapsed; i++) {
    const g = growthBpsAtSlot(i)
    mul = (mul * (BPS_DENOM + g)) / BPS_DENOM
    if (mul >= maxBps) return maxBps
  }
  return mul
}

/**
 * First slot at or past `crashBps`. Inverse of `currentMultiplierBps`,
 * walking the variable-growth product forward.
 */
export function crashSlot(
  roundActiveSlot: bigint,
  crashBps: bigint,
  maxBps: bigint = MOCK_MAX_CRASH_BPS,
): bigint {
  if (crashBps <= ONE_X_BPS) return roundActiveSlot
  const target = crashBps > maxBps ? maxBps : crashBps
  let mul = ONE_X_BPS
  let s = 0n
  while (mul < target) {
    const g = growthBpsAtSlot(s)
    mul = (mul * (BPS_DENOM + g)) / BPS_DENOM
    s++
  }
  return roundActiveSlot + s
}

/**
 * Inverse-CDF crash derivation — identical to `programs/originals-pulse/src/
 * curve.rs::derive_crash_bps`, except for the optional `minCrashBps` floor.
 * The on-chain program currently has no minimum (floor is `ONE_X_BPS`); the
 * demo passes `MOCK_MIN_CRASH_BPS` to lift it to 1.10x. The Glass Box
 * widget re-runs with the same arguments so verification matches.
 */
export function deriveCrashBps(
  outcomeWord: Uint8Array,
  houseEdgeBps: bigint = HOUSE_EDGE_BPS,
  maxCrashBps: bigint = MAX_CRASH_BPS,
  minCrashBps: bigint = ONE_X_BPS,
): bigint {
  if (outcomeWord.length !== 32) throw new Error('outcome word must be 32 bytes')
  if (houseEdgeBps >= ONE_X_BPS) throw new Error('house edge >= 1.00x')
  if (minCrashBps < ONE_X_BPS) throw new Error('min crash < 1.00x')
  if (minCrashBps > maxCrashBps) throw new Error('min crash > max crash')
  const r =
    BigInt(outcomeWord[0]!) |
    (BigInt(outcomeWord[1]!) << 8n) |
    (BigInt(outcomeWord[2]!) << 16n) |
    (BigInt(outcomeWord[3]!) << 24n)
  const numerator = FIELD_SCALE * (ONE_X_BPS - houseEdgeBps)
  const denominator = FIELD_SCALE - r
  const raw = numerator / denominator
  // Floor first (the rug-pull guard), then ceiling.
  const floored = raw < minCrashBps ? minCrashBps : raw
  return floored > maxCrashBps ? maxCrashBps : floored
}

/** Settlement payout, mirror of `curve::settle_payout`. */
export function settlePayout(wagerLamports: bigint, cashOutBps: bigint): bigint {
  return (wagerLamports * cashOutBps) / ONE_X_BPS
}

/** Format a basis-points multiplier as `"N.NNx"`. House-favored truncation. */
export function formatMultiplier(multiplierBps: bigint): string {
  const whole = multiplierBps / ONE_X_BPS
  const frac = multiplierBps % ONE_X_BPS
  const hundredths = frac / 100n
  return `${whole}.${hundredths.toString().padStart(2, '0')}x`
}

/** USDC display: 6-decimal lamports → `"N.NN"`. */
export function formatUsdc(lamports: bigint): string {
  const whole = lamports / 1_000_000n
  const frac = lamports % 1_000_000n
  const cents = (frac / 10_000n).toString().padStart(2, '0')
  return `${whole}.${cents} USDC`
}

// Ownership-engine point earn rate at default tier. Mirrors the canonical
// formula in `@swoobz/points/earn-rules.ts`: floor((usdcWhole * mult_bps) /
// BPS_SCALE). House-favored truncation (Domain A rounding rule). When the
// settle event wires the points-package result to the player UI, replace
// this preview with the authoritative value.
const POINTS_BPS_SCALE = 10_000n
const POINTS_WIN_MULT_BPS = 10_000n // 1.0x on wins
const POINTS_LOSS_MULT_BPS = 15_000n // 1.5x on losses — loss-amplified

export function pointsForBet(wagerLamports: bigint, won: boolean): bigint {
  const usdcWhole = wagerLamports / 1_000_000n
  const mult = won ? POINTS_WIN_MULT_BPS : POINTS_LOSS_MULT_BPS
  return (usdcWhole * mult) / POINTS_BPS_SCALE
}

export function formatPoints(points: bigint): string {
  return points.toLocaleString('en-US')
}

// ─── Narrative settlement copy (OO-FISHER bar) ────────────────────────────
//
// Mirrors the OO-FISHER pattern: bucketed copy pools, deterministic selection
// by `multiplierBps % pool.length`. Same outcome always reads the same line.
//
// RG-C5 SAFE: identical visual amplitude across buckets — only the words
// vary. The buckets are FIXED set membership, not a curve. No streak / session
// state can reach this function.
//
// Pulse register: dark-glass observatory / heartbeat lab. Lines are clipped
// trader-floor reads, not slot-machine catchphrases.

/** ≥5.00× — the curve rode far. */
export const HUGE_CRASH_BPS = 50_000n
/** ≥2.00× — a solid read. */
export const SOLID_CRASH_BPS = 20_000n

// Pulse register: observatory / heartbeat-lab trader reads. No fishing
// metaphors (that's OO-FISHER), no predictive copy, no exclamation marks.
export const HUGE_WIN_NARRATIVES = [
  'the curve held',
  'rode the signal',
  'perfect read',
  'long enough',
] as const
export const SOLID_WIN_NARRATIVES = [
  "you'll take it",
  'signal held',
  'clean exit',
  'eyes on the curve',
] as const
export const TIGHT_WIN_NARRATIVES = [
  'barely cleared',
  'clean window',
  'just in time',
  'green by a hair',
] as const
export const LOSS_NARRATIVES = [
  'the curve broke',
  'out before you could blink',
  'curve had its say',
  'gravity caught you',
  'held too long',
] as const

/**
 * Pick a deterministic variant from a pool, indexed by a bigint seed. Same
 * `seed` always returns the same line for a given pool. The seed is typically
 * `multiplierBps` for win-side lines, `crashBps` for loss-side lines — the
 * pool stays stable across re-renders of the same outcome.
 */
export function pickVariant<T>(pool: readonly T[], seed: bigint): T {
  if (pool.length === 0) throw new Error('pool must be non-empty')
  const len = BigInt(pool.length)
  const raw = seed < 0n ? -seed : seed
  const idx = Number(raw % len)
  return pool[idx]!
}

/**
 * Settlement narrative line for the round. Bucket by win-side multiplier
 * magnitude; loss side uses a separate pool keyed by the crash multiplier.
 *
 * @param multiplierBps - the cash-out multiplier (win) OR crash multiplier (loss)
 * @param won - true for win, false for crash/bust
 */
export function settlementNarrative(multiplierBps: bigint, won: boolean): string {
  if (!won) return pickVariant(LOSS_NARRATIVES, multiplierBps)
  if (multiplierBps >= HUGE_CRASH_BPS) return pickVariant(HUGE_WIN_NARRATIVES, multiplierBps)
  if (multiplierBps >= SOLID_CRASH_BPS) return pickVariant(SOLID_WIN_NARRATIVES, multiplierBps)
  return pickVariant(TIGHT_WIN_NARRATIVES, multiplierBps)
}

// ─── Perfect-hit / skill-ceiling moment ───────────────────────────────────
//
// Pulse's skill ceiling is TIMING — cashing out near a clean milestone
// multiplier. When the player cashes out within `PERFECT_BAND_BPS` of any
// `PERFECT_MILESTONES_BPS` value (1.50x, 2.00x, 3.00x, 5.00x, 10.00x, 20.00x),
// the payout gets a 1.05x-1.15x euphoria bump — capped well below "house-loss"
// territory. Linear ramp: dead-center hits get 1.15x, edge hits get 1.05x.
//
// RG-C5 SAFE: every constant in this block is module-level. The milestone
// set + band width + bump min/max are FIXED. No streak / session / wager
// state can reach the bonus computation. The bonus shape is identical across
// every round, every player, every session.
//
// Domain A SAFE: pure BigInt rational math. House-favored floor truncation
// on the final ramp division (the player's bonus rounds DOWN toward the edge,
// never UP toward dead-center).

/** ± window (in bps) around a milestone that counts as a perfect read. */
export const PERFECT_BAND_BPS = 200n // ±2.00% of any milestone

/** Milestone multipliers — the "called shots" the player can hit. */
export const PERFECT_MILESTONES_BPS: readonly bigint[] = [
  15_000n, // 1.50×
  20_000n, // 2.00×
  30_000n, // 3.00×
  50_000n, // 5.00×
  100_000n, // 10.00×
  200_000n, // 20.00×
] as const

/** Minimum perfect bonus (at the edge of the band). 1.05×. */
export const PERFECT_BONUS_MIN_BPS = 10_500n
/** Maximum perfect bonus (dead-center of the band). 1.15×. */
export const PERFECT_BONUS_MAX_BPS = 11_500n
const PERFECT_BONUS_SPREAD_BPS = PERFECT_BONUS_MAX_BPS - PERFECT_BONUS_MIN_BPS // 1000n

/** Returns the nearest milestone to `multiplierBps`, or `null` if none are inside the band. */
export function nearestPerfectMilestoneBps(multiplierBps: bigint): bigint | null {
  let best: { milestone: bigint; distance: bigint } | null = null
  for (const m of PERFECT_MILESTONES_BPS) {
    const d = multiplierBps > m ? multiplierBps - m : m - multiplierBps
    if (d > PERFECT_BAND_BPS) continue
    if (best === null || d < best.distance) best = { milestone: m, distance: d }
  }
  return best === null ? null : best.milestone
}

/**
 * Compute the perfect-hit bonus multiplier in bps for a cash-out at
 * `multiplierBps`. Returns `ONE_X_BPS` (10_000n) when outside any milestone
 * band — i.e. no bonus. Returns 10_500n-11_500n when inside a band.
 *
 * House-favored floor: the ramp division floors toward zero, so a hit at
 * the very edge of the band rounds DOWN to the minimum bonus, never up.
 */
export function perfectHitBonusBps(multiplierBps: bigint): bigint {
  const m = nearestPerfectMilestoneBps(multiplierBps)
  if (m === null) return ONE_X_BPS
  const distance = multiplierBps > m ? multiplierBps - m : m - multiplierBps
  // distance is in [0, PERFECT_BAND_BPS]. within = (BAND - distance).
  const within = PERFECT_BAND_BPS - distance
  // floor truncation (Domain A): payout edge of band → minimum bonus.
  return PERFECT_BONUS_MIN_BPS + (PERFECT_BONUS_SPREAD_BPS * within) / PERFECT_BAND_BPS
}

/** True when `multiplierBps` is inside any milestone's ±band. */
export function isPerfectHit(multiplierBps: bigint): boolean {
  return nearestPerfectMilestoneBps(multiplierBps) !== null
}

// ─── Live "Vitals" survival-odds instrument (the signature transparency hook) ──
//
// Pulse's brand is radical transparency — "most casinos hide this number." This
// reveals the TRUE odds the house already knows: given the curve is alive at the
// current multiplier `m`, the honest conditional probability it reaches a higher
// target `T` is, for the inverse-CDF crash distribution, exactly m / T (the
// house edge cancels in the conditional). DISPLAY ONLY — EV-NEUTRAL: this never
// touches a payout, it just surfaces the real survival curve. Pure BigInt,
// house-favored floor (the shown odds round DOWN, never overstating the chance).

/** The "vitals ladder" — the targets the survival instrument reads against. */
export const VITALS_TARGETS_BPS: readonly bigint[] = [
  15_000n, // 1.50×
  20_000n, // 2.00×
  30_000n, // 3.00×
  50_000n, // 5.00×
  100_000n, // 10.00×
  200_000n, // 20.00×
] as const

/** First vitals target strictly above `currentBps`, or null past the top. */
export function nextVitalsTargetBps(currentBps: bigint): bigint | null {
  for (const t of VITALS_TARGETS_BPS) {
    if (t > currentBps) return t
  }
  return null
}

/**
 * Honest conditional survival probability in bps (0–10_000) that the curve —
 * alive at `currentBps` — reaches `targetBps`. P(crash≥T | crash≥m) = m / T.
 * Returns ONE_X_BPS (100%) if already at/above the target. House-favored floor.
 */
export function survivalOddsBps(currentBps: bigint, targetBps: bigint): bigint {
  if (targetBps <= currentBps) return ONE_X_BPS
  if (currentBps <= 0n) return 0n
  return (currentBps * ONE_X_BPS) / targetBps // floor — never overstates the chance
}

/** Format a 0–10_000 bps probability as a whole-percent string, e.g. "75%". */
export function formatOddsPct(oddsBps: bigint): string {
  return `${oddsBps / 100n}%`
}

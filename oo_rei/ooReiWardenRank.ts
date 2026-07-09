/**
 * ooReiWardenRank.ts — the Warden Rank progression spine (D.1).
 *
 * THE PROGRESSION ECONOMY (separate from the money economy):
 *   OO-REI runs two strictly separate economies. The MONEY economy is the 96.94%
 *   RTP slot — LOCKED, untouched by anything here. The PROGRESSION economy is
 *   ranks / cosmetics / agency / narrative, and THIS module is its spine: it
 *   converts the player's lifetime ownership-points ("seals" — accrued at 1.0x on
 *   wins and 1.5x on losses by computeOwnershipPoints in ooReiMath) into a Warden
 *   Rank. The rank is the "set the next level" feeling — it climbs every spin,
 *   win or lose, and unlocks COSMETICS + AGENCY only.
 *
 * RG / fairness rails (enforced by the SHAPE of this module):
 *   - EV-NEUTRAL: a rank NEVER changes payout, RTP, odds, or any monetary value.
 *     Unlocks are cosmetic (seal skins, region music, codex pages) or agency
 *     (choose map route, 2nd ally slot) — never "+x% win" or "better rewards".
 *   - Pure + deterministic: identical lifetimePoints → identical rank across any
 *     number of calls. No I/O, no clock, no RNG.
 *   - Monotonic + fail-closed: rank never regresses; negative/non-finite input
 *     clamps to 0 (you cannot un-earn a rank). All math is bigint with floor
 *     truncation. The `number` type never enters a points/threshold comparison.
 *
 * Domain A discipline (points are an accumulated value): bigint throughout,
 * floor division, deterministic, fail-closed.
 *
 * Points scale: 1 "seal" = 1_000_000 raw points-units (matches formatPoints in
 * ooReiMath — display = lamports / USDC_LAMPORTS).
 *
 * WAGER-INVARIANT (Tim 2026-06-04): rank accrues a FLAT amount per ROUND — a
 * winning spin = 1.0 seal, a losing spin = 1.5 seals — REGARDLESS of wager size.
 * Wagering more never climbs the ladder faster. See computeWardenSealAccrual.
 * (The wager-scaled 1.5x-loss ownership-points number in ooReiMath is a SEPARATE
 * economic display and never feeds rank.)
 */

/** Raw points-units per one displayed "seal" (mirrors ooReiMath formatPoints). */
export const POINTS_UNITS_PER_SEAL = 1_000_000n

/**
 * Flat seal accrual for ONE settled spin — the LEVEL / RANK channel.
 *
 * Tim 2026-06-04 ruling: progression must be ROUNDS / PARTICIPATION based, NEVER
 * wager-bound. This function takes NO wager parameter by design — a $25 player
 * and a $1 player climb the Warden ladder at exactly the same rate. The only
 * axis of variation is the round OUTCOME (win vs loss), not the stake:
 *   win  → 1.0 seal  (SEAL_UNITS_PER_SPIN_WIN)
 *   loss → 1.5 seals (SEAL_UNITS_PER_SPIN_LOSS — the Ownership Engine: a losing
 *          round still builds the path, slightly faster; this is per-ROUND, not
 *          a wager multiplier, so it can never make bigger stakes rank faster)
 *
 * Calibrated to the historical $1 reference so the WARDEN_RANKS thresholds keep
 * their spin-count tuning (MORITO ≈ 30 spins). Pure, deterministic, fail-closed,
 * module-const — Domain A progression discipline.
 */
export const SEAL_UNITS_PER_SPIN_WIN: bigint = POINTS_UNITS_PER_SEAL // 1.0 seal
export const SEAL_UNITS_PER_SPIN_LOSS: bigint = (POINTS_UNITS_PER_SEAL * 15n) / 10n // 1.5 seals (floor)

export function computeWardenSealAccrual(isWin: boolean): bigint {
  return isWin ? SEAL_UNITS_PER_SPIN_WIN : SEAL_UNITS_PER_SPIN_LOSS
}

/** A single Warden Rank rung. Display + unlock metadata only — zero money. */
export interface WardenRankTier {
  /** 0-based rank index. */
  readonly index: number
  /** Romaji title (Geist Mono label register). */
  readonly title: string
  /** Single-or-double kanji glyph (Noto Serif JP display register). */
  readonly kanji: string
  /** Cumulative lifetime points-units required to REACH this rank (bigint). */
  readonly thresholdUnits: bigint
  /**
   * What reaching this rank unlocks. COSMETIC or AGENCY only — never EV.
   * Descriptive; the actual unlock wiring lives in the consuming layer.
   */
  readonly unlock: string
  /** True for the milestone ranks that grant agency (not just cosmetics). */
  readonly isAgencyMilestone: boolean
}

// Helper: seals → raw units as a compile-time bigint.
const seals = (n: bigint): bigint => n * POINTS_UNITS_PER_SEAL

/**
 * The Warden Rank ladder. Cumulative thresholds rise on an easing curve: the
 * first ranks come fast (early-session momentum), then slow toward the apex.
 * Thresholds are module-const bigints — never derived from session/streak/wager.
 *
 * Titles are the warden's path on Tamashii-Jima: novice → sealer → god-reaper →
 * undying island-warden. Kanji render in Noto Serif JP (brand display register).
 */
// Thresholds in SEALS (1 seal = 1 USDC-unit of ownership points). At a $1
// wager a spin accrues ~1.0-1.5 seals (1.0x win / 1.5x loss), so rank 2 (~40
// seals) takes ~30 spins — earned, not "4 spins and done" (Tim 2026-05-30). The
// curve steepens to an apex worth thousands of spins. Higher wagers progress
// faster (more wagered = more progression) — EV-neutral by construction.
export const WARDEN_RANKS: ReadonlyArray<WardenRankTier> = [
  { index: 0, title: 'MINARAI', kanji: '見習', thresholdUnits: seals(0n), unlock: 'The warden takes up the first ofuda.', isAgencyMilestone: false },
  { index: 1, title: 'MORITO', kanji: '守人', thresholdUnits: seals(40n), unlock: 'REI draws the first plain ofuda. The storm does not break yet.', isAgencyMilestone: false },
  { index: 2, title: 'YUIBITO', kanji: '結人', thresholdUnits: seals(110n), unlock: "The codex opens. ARASHI's first page is written in the rain.", isAgencyMilestone: false },
  { index: 3, title: 'FUSHI', kanji: '封師', thresholdUnits: seals(240n), unlock: 'A second warden arrives at the coast. She is not alone.', isAgencyMilestone: true },
  { index: 4, title: 'CHINSHI', kanji: '鎮師', thresholdUnits: seals(460n), unlock: 'The storm motif plays from the distance. She walks toward it.', isAgencyMilestone: false },
  { index: 5, title: 'TAIMASHI', kanji: '退魔師', thresholdUnits: seals(820n), unlock: 'The vermillion brush. She does not hesitate now.', isAgencyMilestone: false },
  { index: 6, title: 'REISHO', kanji: '霊将', thresholdUnits: seals(1400n), unlock: 'A fork in the path. For the first time, she chooses.', isAgencyMilestone: true },
  { index: 7, title: 'SHUGOSHO', kanji: '守護将', thresholdUnits: seals(2300n), unlock: 'The bestiary opens. Every spirit she sealed is named.', isAgencyMilestone: false },
  { index: 8, title: 'DAIFUSHO', kanji: '大封将', thresholdUnits: seals(3700n), unlock: 'Gold-leaf ofuda. The spirits recognize the seal now.', isAgencyMilestone: false },
  { index: 9, title: 'KAMINAGI', kanji: '神薙', thresholdUnits: seals(5800n), unlock: 'Three wardens at the shore. The island watches.', isAgencyMilestone: true },
  { index: 10, title: 'SHIMAMORI', kanji: '島守', thresholdUnits: seals(9000n), unlock: 'Warden of Tamashii-Jima. The island remembers your name.', isAgencyMilestone: true },
] as const

/** Resolved rank state for a given lifetime points total. */
export interface WardenRankState {
  /** The current rank tier. */
  readonly tier: WardenRankTier
  /** The next tier, or null at the apex. */
  readonly nextTier: WardenRankTier | null
  /** Lifetime points-units accrued INTO the current rank (>= 0). */
  readonly pointsIntoRankUnits: bigint
  /** Points-units from the current floor to the next threshold, or null at apex. */
  readonly pointsToNextUnits: bigint | null
  /** Progress to the next rank in BPS (0..10000). 10000 at the apex. */
  readonly progressBps: bigint
  /** True when at the highest rank. */
  readonly isMaxRank: boolean
}

/**
 * Compute the Warden Rank for a lifetime points total.
 *
 * @param lifetimePointsUnits accumulated ownership points, raw units (bigint).
 *        Negative / non-finite-equivalent inputs clamp to 0 (rank cannot regress).
 * @returns the resolved rank state (display-only — never a monetary value).
 *
 * Deterministic: identical input → identical output. Pure: no I/O / clock / RNG.
 */
export function computeWardenRank(lifetimePointsUnits: bigint): WardenRankState {
  // Fail-closed clamp: a rank can never be earned by a negative balance.
  const points = lifetimePointsUnits > 0n ? lifetimePointsUnits : 0n

  // Highest tier whose threshold has been reached. WARDEN_RANKS is ascending,
  // so walk from the top and take the first satisfied threshold.
  let tier: WardenRankTier = WARDEN_RANKS[0] as WardenRankTier
  for (let i = WARDEN_RANKS.length - 1; i >= 0; i -= 1) {
    const candidate = WARDEN_RANKS[i] as WardenRankTier
    if (points >= candidate.thresholdUnits) {
      tier = candidate
      break
    }
  }

  const isMaxRank = tier.index === WARDEN_RANKS.length - 1
  const nextTier = isMaxRank ? null : (WARDEN_RANKS[tier.index + 1] as WardenRankTier)

  const pointsIntoRankUnits = points - tier.thresholdUnits

  if (nextTier === null) {
    return {
      tier,
      nextTier: null,
      pointsIntoRankUnits,
      pointsToNextUnits: null,
      progressBps: 10_000n,
      isMaxRank: true,
    }
  }

  const span = nextTier.thresholdUnits - tier.thresholdUnits // > 0 by construction
  const pointsToNextUnits = nextTier.thresholdUnits - points
  // Floor division — progress never rounds up into the next rank early.
  const progressBps = (pointsIntoRankUnits * 10_000n) / span

  return {
    tier,
    nextTier,
    pointsIntoRankUnits,
    pointsToNextUnits,
    progressBps,
    isMaxRank: false,
  }
}

/**
 * Did a rank-up occur between two lifetime totals? (prev < next, crossing a
 * threshold). Used by the consuming layer to fire a rank-up celebration ONCE.
 * Returns the newly-reached tier, or null if no rank-up. Pure + deterministic.
 */
export function detectRankUp(
  prevPointsUnits: bigint,
  nextPointsUnits: bigint,
): WardenRankTier | null {
  const before = computeWardenRank(prevPointsUnits).tier.index
  const after = computeWardenRank(nextPointsUnits).tier.index
  return after > before ? (WARDEN_RANKS[after] as WardenRankTier) : null
}

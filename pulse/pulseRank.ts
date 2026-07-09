/**
 * pulseRank.ts — the Pulse Operator Rank progression spine (S1).
 *
 * THE PROGRESSION ECONOMY (separate from the money economy):
 *   This module converts a player's lifetime ROUNDS PLAYED into an Operator
 *   Rank. The rank climbs every round, win or lose, and unlocks COSMETICS /
 *   AGENCY / LOYALTY only. It NEVER changes payout, RTP, odds, or any
 *   monetary value.
 *
 * UNIT — ROUNDS: thresholds are in ROUNDS PLAYED (bigint). A $5 wager and a
 * $100 wager each count as exactly ONE round. This is the fix for Tim's
 * correction #1 ("the more you wager the faster you progress — BAD").
 *
 * SEPARATION OF ECONOMIES:
 *   - RANK (this module): driven by rounds played. Flat per-round accrual.
 *     Every player climbs the ladder at the same pace regardless of wager.
 *   - OWNERSHIP POINTS (pulseOwnershipPoints.ts): driven by wager volume at
 *     1.0x win / 1.5x loss. The "you are a stakeholder" differentiator —
 *     displayed as a SEPARATE running total in the settlement readout and the
 *     RECORD tab. Ownership points DO NOT gate rank unlocks.
 *
 * CRASH-RG FENCE: rounds-played is outcome-neutral (neither win/loss magnitude
 * nor cash-out timing changes the count). The count is incremented exactly once
 * per settle in accumulateRoundsPlayed, which receives only `prevRounds`.
 *
 * RG / fairness rails:
 *   - EV-NEUTRAL: rank NEVER changes payout / RTP / odds.
 *   - Pure + deterministic: identical lifetimeRounds → identical rank.
 *   - Monotonic + fail-closed: rank never regresses; negative input clamps to
 *     0. All math is bigint with floor truncation.
 *
 * Domain A discipline: bigint, floor division, deterministic, fail-closed,
 * zero floats, zero I/O, no clock.
 */

/** The benefit category a rank's milestone grants. None touch the money math. */
export type PulseMilestoneKind = 'cosmetic' | 'agency' | 'loyalty'

/** A single Operator Rank rung. Display + unlock metadata only — zero money. */
export interface PulseRankTier {
  /** 0-based rank index. */
  readonly index: number
  /** Trading-desk theme variant title (Geist Mono label register). */
  readonly titleDesk: string
  /** Cyber-lab / futuristic theme variant title (the default surface). */
  readonly titleLab: string
  /**
   * Cumulative lifetime ROUNDS PLAYED required to REACH this rank (bigint).
   * Wager size has ZERO effect — every round counts as 1 regardless of amount.
   * This is intentional: all players climb the same ladder at the same pace.
   */
  readonly thresholdRounds: bigint
  /**
   * Concrete description of what this rank unlocks IN THE HUD. Must name the
   * exact UI element that changes — not abstract copy.
   */
  readonly unlock: string
  /** The benefit kind this rung's reward grants. Never EV. */
  readonly milestoneKind: PulseMilestoneKind
  /** Convenience flag: true for the agency-granting milestone ranks (3/6/9). */
  readonly isAgencyMilestone: boolean
}

// Helper: declare a tier; isAgencyMilestone is derived from milestoneKind so
// the two can never drift.
function tier(
  index: number,
  titleDesk: string,
  titleLab: string,
  thresholdRounds: bigint,
  unlock: string,
  milestoneKind: PulseMilestoneKind,
): PulseRankTier {
  return {
    index,
    titleDesk,
    titleLab,
    thresholdRounds,
    unlock,
    milestoneKind,
    isAgencyMilestone: milestoneKind === 'agency',
  }
}

/**
 * The Operator Rank ladder — 11 rungs. Thresholds are in ROUNDS PLAYED —
 * wager-size has zero effect (Tim correction #1). Calibration:
 *   rank 1 ≈  10 rounds   (first short session)
 *   rank 5 ≈  60 rounds   (~2 casual sessions)
 *   rank 8 ≈ 250 rounds   (committed player)
 *   rank 10≈ 600 rounds   (apex — long-term earner)
 * Unlock strings name the EXACT HUD element that changes (Tim correction #2).
 */
export const PULSE_RANKS: ReadonlyArray<PulseRankTier> = [
  tier(0, 'OBSERVER', 'BASELINE', 0n, 'Rank 0 — starting state. The curve is live.', 'cosmetic'),
  tier(
    1,
    'READER',
    'NODE-SYNC',
    10n,
    'Curve trace color: tap "Baseline Trace" in COLLECTION to equip the cyan skin.',
    'cosmetic',
  ),
  tier(
    2,
    'ANALYST',
    'COHERENCE-1',
    25n,
    'The Tape: RECORD tab now shows your last 20 settled rounds.',
    'cosmetic',
  ),
  tier(
    3,
    'TRADER',
    'RESONANCE',
    50n,
    'Auto-cashout: a 5th saved preset slot appears in the BET ENTRY panel.',
    'agency',
  ),
  tier(
    4,
    'DESK LEAD',
    'SIGNAL-LOCK',
    90n,
    'Daily signal bonus: platform daily login bonus window activates.',
    'loyalty',
  ),
  tier(
    5,
    'FLOOR RUNNER',
    'FREQUENCY-5',
    150n,
    'Curve trace color: "Signal Blue" (#0088CC) skin unlocks in COLLECTION. Ambient track "Frequency-5" unlocks in COLLECTION.',
    'cosmetic',
  ),
  tier(
    6,
    'SENIOR ANALYST',
    'PHASE-6',
    250n,
    'HUD bezel: tap "Instrument Bezel Frame" in COLLECTION to apply a machined-corner frame to the canvas.',
    'cosmetic',
  ),
  tier(
    7,
    'RISK OFFICER',
    'QUANTUM-CLEAR',
    380n,
    'Platform loyalty tier advances — rakeback rate increases.',
    'loyalty',
  ),
  tier(
    8,
    'HEAD OF DESK',
    'SIGNAL-PRIME',
    540n,
    'Curve trace color: "Ghost Line" (#E0E8F0) skin unlocks. Ambient track "Void Field" unlocks. All three skins + both extra tracks are now in COLLECTION.',
    'cosmetic',
  ),
  tier(
    9,
    'MARKET MAKER',
    'COHERENCE-APEX',
    700n,
    'Auto-cashout: a 6th saved preset slot appears in the BET ENTRY panel.',
    'agency',
  ),
  tier(
    10,
    'SIGNAL MASTER',
    'ARCHITECT',
    900n,
    'Apex tier: platform house-edge-discount eligibility activates.',
    'loyalty',
  ),
] as const

/** Resolved rank state for a given lifetime rounds total. */
export interface PulseRankState {
  /** The current rank tier. */
  readonly tier: PulseRankTier
  /** The next tier, or null at the apex. */
  readonly nextTier: PulseRankTier | null
  /** Lifetime rounds accrued INTO the current rank (>= 0). */
  readonly roundsIntoRank: bigint
  /** Rounds from the current floor to the next threshold, or null at apex. */
  readonly roundsToNext: bigint | null
  /** Progress to the next rank in BPS (0..10000). 10000 at the apex. */
  readonly progressBps: bigint
  /** True when at the highest rank. */
  readonly isMaxRank: boolean
}

/**
 * Compute the Operator Rank for a lifetime rounds-played total.
 *
 * @param lifetimeRounds lifetime rounds played (bigint). Every round counts
 *        as 1 regardless of wager size (Tim correction #1 fix). Negative
 *        inputs clamp to 0 (a rank cannot regress / be un-earned).
 * @returns the resolved rank state (display-only — never a monetary value).
 *
 * Deterministic + pure: no I/O, no clock, no RNG. This is the DISPLAY
 * derivation, so it CLAMPS a negative input to 0 rather than throwing (the
 * strict fail-closed throw lives in the ledger mutation, accumulateRoundsPlayed).
 */
export function computePulseRank(lifetimeRounds: bigint): PulseRankState {
  // Clamp: a rank can never be earned by a negative count.
  const rounds = lifetimeRounds > 0n ? lifetimeRounds : 0n

  // Highest tier whose threshold has been reached. PULSE_RANKS is ascending,
  // so walk from the top and take the first satisfied threshold.
  let current: PulseRankTier = PULSE_RANKS[0] as PulseRankTier
  for (let i = PULSE_RANKS.length - 1; i >= 0; i -= 1) {
    const candidate = PULSE_RANKS[i] as PulseRankTier
    if (rounds >= candidate.thresholdRounds) {
      current = candidate
      break
    }
  }

  const isMaxRank = current.index === PULSE_RANKS.length - 1
  const nextTier = isMaxRank ? null : (PULSE_RANKS[current.index + 1] as PulseRankTier)
  const roundsIntoRank = rounds - current.thresholdRounds

  if (nextTier === null) {
    return {
      tier: current,
      nextTier: null,
      roundsIntoRank,
      roundsToNext: null,
      progressBps: 10_000n,
      isMaxRank: true,
    }
  }

  const span = nextTier.thresholdRounds - current.thresholdRounds // > 0 by construction
  const roundsToNext = nextTier.thresholdRounds - rounds
  // Floor division — progress never rounds up into the next rank early.
  const progressBps = (roundsIntoRank * 10_000n) / span

  return {
    tier: current,
    nextTier,
    roundsIntoRank,
    roundsToNext,
    progressBps,
    isMaxRank: false,
  }
}

/**
 * Did a rank-up occur between two lifetime rounds totals? (prev < next,
 * crossing a threshold). Used by the consuming layer to fire a rank-up
 * celebration ONCE. Returns the newly-reached tier, or null if no rank-up.
 * Pure + deterministic.
 */
export function detectPulseRankUp(prevRounds: bigint, nextRounds: bigint): PulseRankTier | null {
  const before = computePulseRank(prevRounds).tier.index
  const after = computePulseRank(nextRounds).tier.index
  return after > before ? (PULSE_RANKS[after] as PulseRankTier) : null
}

/**
 * How many rounds-to-next-rank for a display label, or null at apex.
 * Pure convenience wrapper. Deterministic.
 */
export function roundsToNextRank(lifetimeRounds: bigint): bigint | null {
  return computePulseRank(lifetimeRounds).roundsToNext
}

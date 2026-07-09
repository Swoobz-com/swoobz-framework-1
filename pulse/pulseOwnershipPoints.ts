/**
 * pulseOwnershipPoints.ts — the Pulse Ownership Engine points ledger (S0).
 *
 * TWO SEPARATE LEDGERS — they are deliberately kept in this one module because
 * both are "progression economy" and both appear together in the settlement
 * readout. Neither ever crosses into the money economy.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  LEDGER A — ROUNDS PLAYED (drives Operator Rank)                        │
 * │  accumulateRoundsPlayed(prev) → prev + 1n                               │
 * │  Flat increment: every round = 1, regardless of wager size.             │
 * │  This is Tim correction #1: "the more you wager the faster you          │
 * │  progress — BAD." Round count is outcome-neutral and wager-neutral.     │
 * │  The Operator Rank thresholds in pulseRank.ts are in ROUNDS.            │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │  LEDGER B — OWNERSHIP POINTS / "SIGNALS" (display: "stake" counter)    │
 * │  accumulatePoints(prev, wager, won) → prev + pointsForBet(wager, won)  │
 * │  1.0x on wins, 1.5x on losses (loss-amplified Ownership Engine).       │
 * │  These are the "you are a stakeholder" differentiator — wager-indexed  │
 * │  and displayed as a running total in the settlement readout + RECORD   │
 * │  tab. They do NOT gate any rank threshold; they are display-only.      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * CRASH-RG FENCE (applies to BOTH ledgers):
 *   - Rounds: outcome-neutral (win/loss doesn't change the count).
 *   - Ownership points: `pointsForBet` takes only (wager, won) — no
 *     multiplier parameter, so holding longer for a bigger multiplier can
 *     NEVER earn more points than bailing early at the same wager.
 *
 * DOMAIN A discipline: bigint throughout, floor truncation, deterministic,
 * fail-closed, zero floats, zero I/O, no Date.now / clock. EV-neutral: a
 * point is never money.
 */
import { formatPoints, pointsForBet } from './pulseMath'

// Re-exported so the settlement readout + showcase consume ONE engagement
// surface instead of reaching into pulseMath internals.
export { formatPoints, pointsForBet }

// ─── Display-rate consts (mirror pulseMath's private POINTS_*_MULT_BPS) ──────
// The money-side multipliers live as module-private consts in pulseMath; these
// public mirrors exist for the settlement readout's factual "1.0× / 1.5×"
// annotation. RG-C5: module-const literals, never runtime-derived.
export const POINTS_WIN_RATE_BPS = 10_000n as const // 1.0x on wins
export const POINTS_LOSS_RATE_BPS = 15_000n as const // 1.5x on losses (loss-amplified)

/**
 * The factual rate label for the settlement readout. Informational only — never
 * near-miss / chase copy. Identical register on win and loss (the loss is never
 * framed as a win); the magnitude lives in the number, this is just the rate.
 */
export function pointsRateLabel(won: boolean): string {
  return won ? '1.0×' : '1.5×'
}

// ─── LEDGER A: Rounds played (drives Operator Rank) ──────────────────────────

/**
 * Increment the lifetime rounds-played counter by exactly ONE.
 *
 * This is the RANK progression counter. Every round counts as 1, regardless
 * of wager size or outcome. This is Tim correction #1: wager-neutral accrual
 * so all players climb the rank ladder at the same pace.
 *
 * @param prevLifetimeRounds lifetime rounds played BEFORE this round (bigint,
 *        never resets). Must be >= 0.
 * @returns prevLifetimeRounds + 1n.
 *
 * FAIL-CLOSED: negative input throws — a corrupted counter, not a normal state.
 * Deterministic: identical inputs → identical output. Zero I/O, zero floats.
 */
export function accumulateRoundsPlayed(prevLifetimeRounds: bigint): bigint {
  if (prevLifetimeRounds < 0n) {
    throw new RangeError('accumulateRoundsPlayed: prevLifetimeRounds must be >= 0')
  }
  return prevLifetimeRounds + 1n
}

// ─── LEDGER B: Ownership points / "signals" (display counter) ────────────────

/**
 * Accumulate a settled round's OWNERSHIP POINTS into the player's lifetime
 * total. This is the "you are a stakeholder" display counter — it is NOT used
 * to gate rank thresholds. Wager-volume-indexed at 1.0x win / 1.5x loss.
 *
 * @param prevLifetimeSignals lifetime signals BEFORE this round (bigint, >= 0).
 * @param wagerLamports round wager in USDC lamports (bigint, >= 0).
 * @param won whether the round was a win (1.0x) or loss (1.5x). The `won`
 *        boolean is a post-outcome fact, NOT a function of cash-out timing.
 * @returns new lifetime signals total, monotonically >= prev.
 *
 * CRASH-RG FENCE: `pointsForBet` has no multiplier parameter — holding longer
 * can NEVER earn more signals than bailing early at the same wager.
 * FAIL-CLOSED: negative inputs throw. Deterministic. Zero floats, zero I/O.
 */
export function accumulatePoints(
  prevLifetimeSignals: bigint,
  wagerLamports: bigint,
  won: boolean,
): bigint {
  if (prevLifetimeSignals < 0n) {
    throw new RangeError('accumulatePoints: prevLifetimeSignals must be >= 0')
  }
  if (wagerLamports < 0n) {
    throw new RangeError('accumulatePoints: wagerLamports must be >= 0')
  }
  // pointsForBet floors (wager/1e6 * mult / 10000) toward zero — sub-1-USDC
  // wagers accrue 0 signals (house-favored, matches the settlement preview).
  return prevLifetimeSignals + pointsForBet(wagerLamports, won)
}

/**
 * Format a signals delta for the settlement readout, e.g. "+187 pts".
 * Always rendered as a positive accrual (the Ownership Engine always adds,
 * even on a loss). Fail-closed: a negative delta is invalid and throws.
 */
export function formatPointsDelta(signals: bigint): string {
  if (signals < 0n) {
    throw new RangeError('formatPointsDelta: signals must be >= 0')
  }
  return `+${formatPoints(signals)} pts`
}

/**
 * pulseRank — Operator Rank spine tests (S1).
 *
 * Updated for Tim correction #1: rank thresholds are now in ROUNDS PLAYED
 * (thresholdRounds), not signals. Threshold-AGNOSTIC: expectations derive
 * from PULSE_RANKS so a calibration rescale never breaks the suite.
 * Verifies: ascending monotonic ladder, pure deterministic compute,
 * fail-closed clamp of negatives, floor-truncated progress (never rounds up
 * early), rank-up detection, apex behaviour, and the EV-neutral shape.
 */
import { describe, expect, it } from 'vitest'
import {
  computePulseRank,
  detectPulseRankUp,
  PULSE_RANKS,
  type PulseMilestoneKind,
} from './pulseRank'

const LEGAL_KINDS: ReadonlyArray<PulseMilestoneKind> = ['cosmetic', 'agency', 'loyalty']

// Non-null index access that fails the test loudly rather than via a `!`
// assertion (keeps the suite inside the noNonNullAssertion lint rule).
function rankAt(i: number) {
  const t = PULSE_RANKS[i]
  if (!t) throw new Error(`PULSE_RANKS has no tier at index ${i}`)
  return t
}

describe('PULSE_RANKS — ladder shape', () => {
  it('has 11 rungs starting at index 0 / threshold 0', () => {
    expect(PULSE_RANKS).toHaveLength(11)
    expect(PULSE_RANKS[0]?.index).toBe(0)
    expect(PULSE_RANKS[0]?.thresholdRounds).toBe(0n)
  })

  it('indices are sequential and thresholds strictly ascending', () => {
    for (let i = 1; i < PULSE_RANKS.length; i++) {
      expect(PULSE_RANKS[i]?.index).toBe(i)
      expect(rankAt(i).thresholdRounds).toBeGreaterThan(rankAt(i - 1).thresholdRounds)
    }
  })

  it('every rung carries exactly one of the 3 legal milestone kinds (EV-neutral)', () => {
    for (const t of PULSE_RANKS) {
      expect(LEGAL_KINDS).toContain(t.milestoneKind)
      expect(t.isAgencyMilestone).toBe(t.milestoneKind === 'agency')
    }
  })

  it('exposes both theme-variant titles on every rung', () => {
    for (const t of PULSE_RANKS) {
      expect(t.titleDesk.length).toBeGreaterThan(0)
      expect(t.titleLab.length).toBeGreaterThan(0)
    }
  })

  it('carries no money / EV fields (the two-economy iron rule)', () => {
    const banned = ['rtp', 'odds', 'payout', 'multiplier', 'winChance', 'edge', 'rate']
    for (const t of PULSE_RANKS) {
      for (const key of Object.keys(t)) {
        expect(banned).not.toContain(key.toLowerCase())
      }
    }
  })
})

describe('computePulseRank — resolution', () => {
  it('zero rounds resolves to rank 0', () => {
    const s = computePulseRank(0n)
    expect(s.tier.index).toBe(0)
    expect(s.isMaxRank).toBe(false)
  })

  it('exactly-at-threshold resolves INTO that rank (boundary)', () => {
    for (const t of PULSE_RANKS) {
      expect(computePulseRank(t.thresholdRounds).tier.index).toBe(t.index)
    }
  })

  it('one round below a threshold stays in the lower rank', () => {
    for (let i = 1; i < PULSE_RANKS.length; i++) {
      const justUnder = rankAt(i).thresholdRounds - 1n
      expect(computePulseRank(justUnder).tier.index).toBe(i - 1)
    }
  })

  it('is monotonic: more rounds never lowers the rank', () => {
    let prevIndex = 0
    for (let r = 0n; r <= 1000n; r += 7n) {
      const idx = computePulseRank(r).tier.index
      expect(idx).toBeGreaterThanOrEqual(prevIndex)
      prevIndex = idx
    }
  })

  it('clamps negative input to rank 0 (fail-closed display derivation)', () => {
    expect(computePulseRank(-1n).tier.index).toBe(0)
    expect(computePulseRank(-999_999n).tier.index).toBe(0)
  })

  it('is deterministic across 100 identical calls', () => {
    const ref = computePulseRank(200n)
    for (let i = 0; i < 100; i++) {
      const s = computePulseRank(200n)
      expect(s.tier.index).toBe(ref.tier.index)
      expect(s.progressBps).toBe(ref.progressBps)
      expect(s.roundsToNext).toBe(ref.roundsToNext)
    }
  })

  it('progressBps is floor-truncated and stays in [0, 10000)', () => {
    // Just past a threshold → progress ~0; just under the next → < 10000.
    const t1 = rankAt(1).thresholdRounds
    const justInto = computePulseRank(t1)
    expect(justInto.progressBps).toBe(0n)
    const t2 = rankAt(2).thresholdRounds
    const almost = computePulseRank(t2 - 1n)
    expect(almost.progressBps).toBeLessThan(10_000n)
    expect(almost.progressBps).toBeGreaterThanOrEqual(0n)
  })

  it('apex: max rank reports progress 10000, null next, null roundsToNext', () => {
    const apexThreshold = rankAt(PULSE_RANKS.length - 1).thresholdRounds
    const s = computePulseRank(apexThreshold + 500n)
    expect(s.isMaxRank).toBe(true)
    expect(s.tier.index).toBe(PULSE_RANKS.length - 1)
    expect(s.nextTier).toBeNull()
    expect(s.roundsToNext).toBeNull()
    expect(s.progressBps).toBe(10_000n)
  })

  it('roundsIntoRank + roundsToNext spans the rank exactly (non-apex)', () => {
    const t2 = rankAt(2).thresholdRounds
    const t3 = rankAt(3).thresholdRounds
    const mid = (t2 + t3) / 2n
    const s = computePulseRank(mid)
    expect(s.roundsIntoRank + (s.roundsToNext ?? 0n)).toBe(t3 - t2)
  })
})

describe('detectPulseRankUp', () => {
  it('returns the newly-reached tier when a threshold is crossed', () => {
    const t1 = rankAt(1).thresholdRounds
    const up = detectPulseRankUp(t1 - 1n, t1)
    expect(up?.index).toBe(1)
  })

  it('returns null when no threshold is crossed', () => {
    const t1 = rankAt(1).thresholdRounds
    expect(detectPulseRankUp(t1, t1 + 1n)).toBeNull()
    expect(detectPulseRankUp(0n, 0n)).toBeNull()
  })

  it('returns the FINAL tier reached on a multi-rank jump (not an intermediate)', () => {
    const t3 = rankAt(3).thresholdRounds
    const up = detectPulseRankUp(0n, t3)
    expect(up?.index).toBe(3)
  })

  it('never reports a rank-up on a decrease', () => {
    expect(detectPulseRankUp(500n, 0n)).toBeNull()
  })
})

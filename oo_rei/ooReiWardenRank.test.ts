/**
 * ooReiWardenRank.test.ts — adversarial tests for the Warden Rank spine (D.1).
 * Domain A discipline: boundary-at-threshold, determinism, monotonicity,
 * fail-closed clamping, floor truncation, EV-neutrality (structural).
 */
import { describe, expect, it } from 'vitest'

import {
  POINTS_UNITS_PER_SEAL,
  SEAL_UNITS_PER_SPIN_LOSS,
  SEAL_UNITS_PER_SPIN_WIN,
  WARDEN_RANKS,
  computeWardenRank,
  computeWardenSealAccrual,
  detectRankUp,
} from './ooReiWardenRank'

const seals = (n: bigint): bigint => n * POINTS_UNITS_PER_SEAL

describe('computeWardenSealAccrual — wager-INVARIANT participation channel (Tim 2026-06-04)', () => {
  it('a winning spin accrues exactly 1.0 seal; a losing spin exactly 1.5 seals (flat)', () => {
    expect(computeWardenSealAccrual(true)).toBe(POINTS_UNITS_PER_SEAL)
    expect(computeWardenSealAccrual(true)).toBe(SEAL_UNITS_PER_SPIN_WIN)
    expect(computeWardenSealAccrual(false)).toBe((POINTS_UNITS_PER_SEAL * 15n) / 10n)
    expect(computeWardenSealAccrual(false)).toBe(SEAL_UNITS_PER_SPIN_LOSS)
  })

  it('is deterministic across 100 identical calls (Domain A)', () => {
    const wins = new Set(
      Array.from({ length: 100 }, () => computeWardenSealAccrual(true).toString()),
    )
    const losses = new Set(
      Array.from({ length: 100 }, () => computeWardenSealAccrual(false).toString()),
    )
    expect(wins.size).toBe(1)
    expect(losses.size).toBe(1)
  })

  it('takes NO wager: a $1 player and a $25 player with the SAME win/loss sequence reach the IDENTICAL rank (wagering more never ranks up faster)', () => {
    // The accrual fn has no wager parameter, so the wager values here are
    // intentionally inert — this is the structural regression guard against the
    // old wager-bound bug (lifetimeSealPoints += wager-scaled ownership points).
    const sequence = [true, false, false, true, false, false, false, true, false, false]
    const accumulate = (_wagerLamports: bigint): bigint =>
      sequence.reduce((sum, isWin) => sum + computeWardenSealAccrual(isWin), 0n)

    const dollarPlayer = accumulate(1_000_000n) // $1
    const whalePlayer = accumulate(25_000_000n) // $25

    expect(whalePlayer).toBe(dollarPlayer)
    expect(computeWardenRank(whalePlayer).tier.index).toBe(
      computeWardenRank(dollarPlayer).tier.index,
    )
  })

  it('reaches MORITO (rank 1) in a few dozen mixed spins — earned, not bought', () => {
    // ~33% hit rate → avg ~1.33 seals/spin → ~30 spins to seals(40). The point:
    // the spin COUNT to rank up is the same whether you bet $1 or $25.
    let total = 0n
    let spins = 0
    while (computeWardenRank(total).tier.index < 1 && spins < 500) {
      total += computeWardenSealAccrual(spins % 3 === 0) // ~33% wins
      spins += 1
    }
    expect(computeWardenRank(total).tier.index).toBeGreaterThanOrEqual(1)
    expect(spins).toBeGreaterThan(20) // not "4 spins and done"
    expect(spins).toBeLessThan(45)
  })
})

describe('WARDEN_RANKS ladder', () => {
  it('is non-empty, index-aligned, and strictly ascending in threshold', () => {
    expect(WARDEN_RANKS.length).toBeGreaterThanOrEqual(2)
    WARDEN_RANKS.forEach((r, i) => {
      expect(r.index).toBe(i)
      if (i > 0) {
        const prev = WARDEN_RANKS[i - 1]
        expect(r.thresholdUnits > (prev?.thresholdUnits ?? 0n)).toBe(true)
      }
    })
  })

  it('starts at threshold 0 (every player is at least the first rank)', () => {
    expect(WARDEN_RANKS[0]?.thresholdUnits).toBe(0n)
  })

  it('every unlock string is non-empty and carries no em-dash (brand)', () => {
    for (const r of WARDEN_RANKS) {
      expect(r.unlock.length).toBeGreaterThan(0)
      expect(r.unlock.includes('—')).toBe(false)
    }
  })
})

describe('computeWardenRank — boundaries', () => {
  it('zero points → rank 0', () => {
    const s = computeWardenRank(0n)
    expect(s.tier.index).toBe(0)
    expect(s.isMaxRank).toBe(false)
    expect(s.pointsIntoRankUnits).toBe(0n)
  })

  it('exactly at a threshold lands ON that rank (not the one below)', () => {
    for (const r of WARDEN_RANKS) {
      const s = computeWardenRank(r.thresholdUnits)
      expect(s.tier.index).toBe(r.index)
      expect(s.pointsIntoRankUnits).toBe(0n)
    }
  })

  it('one unit below a threshold stays on the lower rank', () => {
    for (let i = 1; i < WARDEN_RANKS.length; i += 1) {
      const t = WARDEN_RANKS[i]?.thresholdUnits ?? 0n
      const s = computeWardenRank(t - 1n)
      expect(s.tier.index).toBe(i - 1)
    }
  })

  it('at/above the apex threshold → max rank, progress 10000, no next', () => {
    const apex = WARDEN_RANKS[WARDEN_RANKS.length - 1]!
    const s = computeWardenRank(apex.thresholdUnits + seals(9999n))
    expect(s.tier.index).toBe(apex.index)
    expect(s.isMaxRank).toBe(true)
    expect(s.nextTier).toBeNull()
    expect(s.pointsToNextUnits).toBeNull()
    expect(s.progressBps).toBe(10_000n)
  })
})

describe('computeWardenRank — fail-closed + determinism', () => {
  it('negative input clamps to rank 0 (a rank cannot be un-earned)', () => {
    expect(computeWardenRank(-1n).tier.index).toBe(0)
    expect(computeWardenRank(-999_999_999n).tier.index).toBe(0)
    expect(computeWardenRank(-1n).progressBps >= 0n).toBe(true)
  })

  it('is deterministic across 100 identical calls', () => {
    const input = seals(88n) + 12345n
    const baseline = JSON.stringify(computeWardenRank(input), (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    )
    for (let i = 0; i < 100; i += 1) {
      const got = JSON.stringify(computeWardenRank(input), (_k, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      )
      expect(got).toBe(baseline)
    }
  })

  it('is monotonic: more points never lowers the rank index', () => {
    let prevIndex = 0
    for (let s = 0n; s <= 2000n; s += 7n) {
      const idx = computeWardenRank(seals(s)).tier.index
      expect(idx).toBeGreaterThanOrEqual(prevIndex)
      prevIndex = idx
    }
  })

  it('progressBps is always within [0, 10000]', () => {
    for (let s = 0n; s <= 1800n; s += 13n) {
      const p = computeWardenRank(seals(s)).progressBps
      expect(p >= 0n && p <= 10_000n).toBe(true)
    }
  })

  it('floors progress — just under the next rank never reads 10000 early', () => {
    // Just below rank 1's threshold → still rank 0, progress < 10000.
    const justUnder = (WARDEN_RANKS[1]?.thresholdUnits ?? 0n) - 1n
    const s = computeWardenRank(justUnder)
    expect(s.tier.index).toBe(0)
    expect(s.progressBps < 10_000n).toBe(true)
  })

  it('pointsIntoRank + pointsToNext === span to next threshold', () => {
    const r2 = WARDEN_RANKS[2]?.thresholdUnits ?? 0n
    const r3 = WARDEN_RANKS[3]?.thresholdUnits ?? 0n
    const s = computeWardenRank(r2 + (r3 - r2) / 2n) // midway between rank 2 and 3
    expect(s.tier.index).toBe(2)
    expect(s.nextTier?.index).toBe(3)
    const span = (s.nextTier!.thresholdUnits) - (s.tier.thresholdUnits)
    expect(s.pointsIntoRankUnits + (s.pointsToNextUnits ?? 0n)).toBe(span)
  })
})

describe('detectRankUp', () => {
  it('fires the newly-reached tier when a threshold is crossed', () => {
    const t2 = WARDEN_RANKS[2]?.thresholdUnits ?? 0n
    const up = detectRankUp(t2 - 1n, t2 + 1n) // crosses rank 2's threshold
    expect(up?.index).toBe(2)
  })

  it('returns null when no threshold is crossed', () => {
    expect(detectRankUp(seals(16n), seals(18n))).toBeNull()
    expect(detectRankUp(seals(40n), seals(40n))).toBeNull()
  })

  it('returns the HIGHEST tier reached when several are crossed at once', () => {
    const t3 = WARDEN_RANKS[3]?.thresholdUnits ?? 0n
    const up = detectRankUp(0n, t3) // crosses ranks 1, 2, 3 at once
    expect(up?.index).toBe(3)
  })

  it('never fires on a decrease', () => {
    expect(detectRankUp(seals(100n), seals(10n))).toBeNull()
  })
})

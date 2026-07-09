/**
 * pulseMath — narrative settlement + perfect-hit ramp tests.
 *
 * RG-C5 + Domain A coverage: every constant verified module-const,
 * every division verified house-favored floor, every variant pool
 * verified deterministic-by-seed.
 */
import { describe, expect, it } from 'vitest'

import {
  formatOddsPct,
  HUGE_CRASH_BPS,
  HUGE_WIN_NARRATIVES,
  isPerfectHit,
  LOSS_NARRATIVES,
  nearestPerfectMilestoneBps,
  nextVitalsTargetBps,
  ONE_X_BPS,
  PERFECT_BAND_BPS,
  PERFECT_BONUS_MAX_BPS,
  PERFECT_BONUS_MIN_BPS,
  PERFECT_MILESTONES_BPS,
  perfectHitBonusBps,
  pickVariant,
  SOLID_CRASH_BPS,
  SOLID_WIN_NARRATIVES,
  settlementNarrative,
  survivalOddsBps,
  TIGHT_WIN_NARRATIVES,
  VITALS_TARGETS_BPS,
} from './pulseMath'

describe('survivalOddsBps (vitals instrument — EV-neutral honest odds)', () => {
  it('returns the conditional m/T probability in bps, house-favored floor', () => {
    expect(survivalOddsBps(15_000n, 20_000n)).toBe(7_500n) // 1.5×→2.0× = 75%
    expect(survivalOddsBps(20_000n, 30_000n)).toBe(6_666n) // floor of 66.66%
    expect(survivalOddsBps(50_000n, 100_000n)).toBe(5_000n) // 5×→10× = 50%
  })
  it('never overstates: floor division always rounds the shown chance DOWN', () => {
    // 66.67% true → shows 66%, never 67%.
    expect(survivalOddsBps(20_000n, 30_000n)).toBeLessThan(6_667n)
  })
  it('returns 100% when already at or past the target', () => {
    expect(survivalOddsBps(20_000n, 20_000n)).toBe(ONE_X_BPS)
    expect(survivalOddsBps(30_000n, 20_000n)).toBe(ONE_X_BPS)
  })
  it('is monotonic — odds rise as the curve climbs toward a fixed target', () => {
    expect(survivalOddsBps(10_000n, 50_000n) < survivalOddsBps(25_000n, 50_000n)).toBe(true)
  })
})

describe('nextVitalsTargetBps', () => {
  it('returns the first ladder target strictly above the current multiplier', () => {
    expect(nextVitalsTargetBps(10_000n)).toBe(15_000n)
    expect(nextVitalsTargetBps(15_000n)).toBe(20_000n)
    expect(nextVitalsTargetBps(150_000n)).toBe(200_000n)
  })
  it('returns null past the top of the ladder', () => {
    expect(nextVitalsTargetBps(200_000n)).toBeNull()
    expect(nextVitalsTargetBps(500_000n)).toBeNull()
  })
  it('ladder is the fixed module-const VITALS_TARGETS_BPS (RG-C5 — no session state)', () => {
    expect(VITALS_TARGETS_BPS).toEqual([15_000n, 20_000n, 30_000n, 50_000n, 100_000n, 200_000n])
  })
})

describe('formatOddsPct', () => {
  it('renders whole-percent from bps', () => {
    expect(formatOddsPct(7_500n)).toBe('75%')
    expect(formatOddsPct(6_666n)).toBe('66%')
    expect(formatOddsPct(ONE_X_BPS)).toBe('100%')
  })
})

describe('pickVariant', () => {
  it('selects deterministically by seed mod pool length', () => {
    const pool = ['a', 'b', 'c'] as const
    expect(pickVariant(pool, 0n)).toBe('a')
    expect(pickVariant(pool, 1n)).toBe('b')
    expect(pickVariant(pool, 2n)).toBe('c')
    expect(pickVariant(pool, 3n)).toBe('a')
  })

  it('handles negative bigints by absolute value', () => {
    const pool = ['a', 'b'] as const
    expect(pickVariant(pool, -1n)).toBe('b')
    expect(pickVariant(pool, -2n)).toBe('a')
  })

  it('throws on an empty pool', () => {
    expect(() => pickVariant([], 0n)).toThrow()
  })

  it('is stable across calls for the same seed', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'] as const
    const seed = 12_345n
    expect(pickVariant(pool, seed)).toBe(pickVariant(pool, seed))
  })
})

describe('settlementNarrative', () => {
  it('returns a loss-pool line for crashes', () => {
    const line = settlementNarrative(15_000n, false)
    expect(LOSS_NARRATIVES).toContain(line)
  })

  it('returns a huge-win line at or above HUGE_CRASH_BPS', () => {
    expect(HUGE_WIN_NARRATIVES).toContain(settlementNarrative(HUGE_CRASH_BPS, true))
    expect(HUGE_WIN_NARRATIVES).toContain(settlementNarrative(100_000n, true))
  })

  it('returns a solid-win line between SOLID and HUGE', () => {
    expect(SOLID_WIN_NARRATIVES).toContain(settlementNarrative(SOLID_CRASH_BPS, true))
    expect(SOLID_WIN_NARRATIVES).toContain(settlementNarrative(35_000n, true))
  })

  it('returns a tight-win line below SOLID_CRASH_BPS for wins', () => {
    expect(TIGHT_WIN_NARRATIVES).toContain(settlementNarrative(11_000n, true))
    expect(TIGHT_WIN_NARRATIVES).toContain(settlementNarrative(19_999n, true))
  })

  it('is deterministic for the same outcome', () => {
    expect(settlementNarrative(50_000n, true)).toBe(settlementNarrative(50_000n, true))
    expect(settlementNarrative(12_345n, false)).toBe(settlementNarrative(12_345n, false))
  })
})

describe('nearestPerfectMilestoneBps', () => {
  it('returns null outside any milestone band', () => {
    expect(nearestPerfectMilestoneBps(12_000n)).toBeNull() // 1.20x — between 1.0x and 1.5x
    expect(nearestPerfectMilestoneBps(25_000n)).toBeNull() // 2.50x — between 2.0x and 3.0x
    expect(nearestPerfectMilestoneBps(75_000n)).toBeNull() // 7.50x — between 5.0x and 10.0x
  })

  it('returns the milestone when exactly on it', () => {
    for (const m of PERFECT_MILESTONES_BPS) {
      expect(nearestPerfectMilestoneBps(m)).toBe(m)
    }
  })

  it('returns the milestone when within the band on either side', () => {
    expect(nearestPerfectMilestoneBps(20_000n - PERFECT_BAND_BPS)).toBe(20_000n)
    expect(nearestPerfectMilestoneBps(20_000n + PERFECT_BAND_BPS)).toBe(20_000n)
  })

  it('returns the closer of two milestones when between them', () => {
    // 14,900 is inside the 15,000 band (distance 100), outside the 20,000 band.
    expect(nearestPerfectMilestoneBps(14_900n)).toBe(15_000n)
  })
})

describe('perfectHitBonusBps', () => {
  it('returns ONE_X_BPS (no bonus) outside any milestone band', () => {
    expect(perfectHitBonusBps(12_000n)).toBe(ONE_X_BPS)
    expect(perfectHitBonusBps(25_000n)).toBe(ONE_X_BPS)
  })

  it('returns the maximum bonus at dead-center of a milestone', () => {
    for (const m of PERFECT_MILESTONES_BPS) {
      expect(perfectHitBonusBps(m)).toBe(PERFECT_BONUS_MAX_BPS)
    }
  })

  it('returns the minimum bonus at the edge of a milestone band (house-favored floor)', () => {
    // edge-of-band — distance == PERFECT_BAND_BPS → within == 0 → bonus == MIN
    expect(perfectHitBonusBps(20_000n + PERFECT_BAND_BPS)).toBe(PERFECT_BONUS_MIN_BPS)
    expect(perfectHitBonusBps(20_000n - PERFECT_BAND_BPS)).toBe(PERFECT_BONUS_MIN_BPS)
  })

  it('ramps monotonically toward dead-center', () => {
    const m = 20_000n
    const bonusEdge = perfectHitBonusBps(m + PERFECT_BAND_BPS)
    const bonusMid = perfectHitBonusBps(m + PERFECT_BAND_BPS / 2n)
    const bonusCenter = perfectHitBonusBps(m)
    expect(bonusEdge).toBeLessThan(bonusMid)
    expect(bonusMid).toBeLessThan(bonusCenter)
  })

  it('never exceeds the 1.05-1.15x range', () => {
    // 100 random samples across the range
    for (let i = 0n; i < 100n; i++) {
      const sample = 10_000n + i * 2_500n
      const bonus = perfectHitBonusBps(sample)
      expect(bonus >= ONE_X_BPS).toBe(true)
      expect(bonus <= PERFECT_BONUS_MAX_BPS).toBe(true)
    }
  })
})

describe('isPerfectHit', () => {
  it('is true exactly when nearestPerfectMilestoneBps is non-null', () => {
    for (const sample of [10_000n, 14_999n, 15_000n, 15_200n, 16_000n, 20_000n]) {
      expect(isPerfectHit(sample)).toBe(nearestPerfectMilestoneBps(sample) !== null)
    }
  })
})

describe('RG-C5 structural invariants', () => {
  it('PERFECT_BAND_BPS is a positive bigint', () => {
    expect(typeof PERFECT_BAND_BPS).toBe('bigint')
    expect(PERFECT_BAND_BPS > 0n).toBe(true)
  })

  it('PERFECT_BONUS_MAX_BPS is at most 1.15x (no escalation above the campaign ceiling)', () => {
    expect(PERFECT_BONUS_MAX_BPS).toBeLessThanOrEqual(11_500n)
  })

  it('PERFECT_BONUS_MIN_BPS is at least 1.05x (the campaign floor)', () => {
    expect(PERFECT_BONUS_MIN_BPS).toBeGreaterThanOrEqual(10_500n)
  })

  it('PERFECT_MILESTONES_BPS values are all ≥ ONE_X_BPS', () => {
    for (const m of PERFECT_MILESTONES_BPS) {
      expect(m >= ONE_X_BPS).toBe(true)
    }
  })

  it('narrative pools are all non-empty', () => {
    expect(HUGE_WIN_NARRATIVES.length).toBeGreaterThan(0)
    expect(SOLID_WIN_NARRATIVES.length).toBeGreaterThan(0)
    expect(TIGHT_WIN_NARRATIVES.length).toBeGreaterThan(0)
    expect(LOSS_NARRATIVES.length).toBeGreaterThan(0)
  })
})

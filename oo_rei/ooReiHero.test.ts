/**
 * ooReiHero.test.ts -- adversarial tests for the hero stat model.
 *
 * Domain A discipline:
 *   - EV-neutrality (structural): no monetary fields exist on any output.
 *   - Deterministic: identical input -> identical output across 100 calls.
 *   - Monotonic: more engagement never lowers a stat.
 *   - Fail-closed: negative inputs clamp to 0, never regress.
 *   - Capped: stat values never exceed their season caps.
 *   - No em-dash in any string field.
 *   - No float imprecision: all stat comparison done in bigint space.
 */
import { describe, expect, it } from 'vitest'

import {
  computeHeroStats,
  resolveCurrentSeason,
  anyStatGained,
  seasonHeadline,
  RESOLVE_CAP_PER_SEASON,
  SEAL_POWER_CAP_PER_SEASON,
  WARD_CAP_PER_SEASON,
  SEASONS,
  SEASONS_PER_CYCLE,
  type HeroStatInput,
} from './ooReiHero'
import { WARDEN_RANKS } from './ooReiWardenRank'
import { MYTH_REGIONS } from './ooReiMythRegions'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseInput(overrides: Partial<HeroStatInput> = {}): HeroStatInput {
  return {
    lifetimeSeals: 0,
    lifetimeRegionsCleared: 0,
    seasonDaysActive: 0,
    currentRankIndex: 0,
    lifetimePointsUnits: 0n,
    ...overrides,
  }
}

// ─── EV-neutrality (structural) ───────────────────────────────────────────────

describe('ooReiHero -- EV-neutrality (structural)', () => {
  it('HeroStatsState has no monetary fields', () => {
    const state = computeHeroStats(baseInput())
    // Check that none of the known money-economy field names are present.
    const keys = Object.keys(state)
    const forbidden = ['rtp', 'odds', 'payout', 'lamports', 'wager', 'win', 'multiplier', 'bps']
    for (const f of forbidden) {
      expect(keys.some((k) => k.toLowerCase().includes(f))).toBe(false)
    }
  })

  it('every stat has evNeutral: true', () => {
    const state = computeHeroStats(baseInput({ lifetimeSeals: 10, lifetimeRegionsCleared: 2, seasonDaysActive: 5 }))
    expect(state.evNeutral).toBe(true)
    expect(state.resolve.evNeutral).toBe(true)
    expect(state.sealPower.evNeutral).toBe(true)
    expect(state.ward.evNeutral).toBe(true)
    expect(state.seasonArc.evNeutral).toBe(true)
  })

  it('season configs all carry evNeutral: true', () => {
    for (const s of SEASONS) {
      expect(s.evNeutral).toBe(true)
    }
  })

  it('no stat output has a field named rtp, odds, payout, lamports, wager, or win', () => {
    const state = computeHeroStats(baseInput({ lifetimeSeals: 25, lifetimeRegionsCleared: 3, seasonDaysActive: 30 }))
    const banned = ['rtp', 'odds', 'payout', 'lamports', 'wager', 'win', 'multiplier']
    for (const stat of [state.resolve, state.sealPower, state.ward]) {
      const keys = Object.keys(stat).map((k) => k.toLowerCase())
      for (const b of banned) {
        expect(keys.includes(b)).toBe(false)
      }
    }
  })
})

// ─── Fail-closed on negative inputs ──────────────────────────────────────────

describe('ooReiHero -- fail-closed on negative inputs', () => {
  it('negative lifetimeSeals clamps Resolve to 0', () => {
    const state = computeHeroStats(baseInput({ lifetimeSeals: -100 }))
    expect(state.resolve.value).toBe(0n)
    expect(state.resolve.progressBps).toBe(0n)
  })

  it('negative lifetimeRegionsCleared clamps Seal-Power to 0', () => {
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: -5 }))
    expect(state.sealPower.value).toBe(0n)
  })

  it('negative seasonDaysActive clamps Ward to 0', () => {
    const state = computeHeroStats(baseInput({ seasonDaysActive: -999 }))
    expect(state.ward.value).toBe(0n)
  })

  it('negative currentRankIndex falls back to rank 0', () => {
    const state = computeHeroStats(baseInput({ currentRankIndex: -1 }))
    expect(state.rankTier.index).toBe(0)
  })

  it('rank index above 10 clamps to 10', () => {
    const state = computeHeroStats(baseInput({ currentRankIndex: 99 }))
    // Clamped to rank 10 (the apex).
    expect(state.rankTier.index).toBeLessThanOrEqual(10)
  })
})

// ─── Caps: stats never exceed their season maximums ──────────────────────────

describe('ooReiHero -- stat caps enforced', () => {
  it('Resolve is capped at RESOLVE_CAP_PER_SEASON even with huge input', () => {
    const state = computeHeroStats(baseInput({ lifetimeSeals: 99999 }))
    expect(state.resolve.value).toBe(RESOLVE_CAP_PER_SEASON)
    expect(state.resolve.progressBps).toBe(10_000n)
  })

  it('Seal-Power is capped at SEAL_POWER_CAP_PER_SEASON', () => {
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: 9999 }))
    expect(state.sealPower.value).toBe(SEAL_POWER_CAP_PER_SEASON)
    expect(state.sealPower.progressBps).toBe(10_000n)
  })

  it('Ward is capped at WARD_CAP_PER_SEASON', () => {
    const state = computeHeroStats(baseInput({ seasonDaysActive: 99999 }))
    expect(state.ward.value).toBe(WARD_CAP_PER_SEASON)
    expect(state.ward.progressBps).toBe(10_000n)
  })

  it('progressBps is always in [0, 10000] for any input', () => {
    const testCases = [0, 1, 10, 49, 50, 51, 1000, 99999]
    for (const n of testCases) {
      const state = computeHeroStats(baseInput({ lifetimeSeals: n, lifetimeRegionsCleared: n, seasonDaysActive: n }))
      expect(state.resolve.progressBps >= 0n && state.resolve.progressBps <= 10_000n).toBe(true)
      expect(state.sealPower.progressBps >= 0n && state.sealPower.progressBps <= 10_000n).toBe(true)
      expect(state.ward.progressBps >= 0n && state.ward.progressBps <= 10_000n).toBe(true)
    }
  })

  it('at exactly the cap, progressBps is 10000', () => {
    const state = computeHeroStats(baseInput({
      lifetimeSeals: Number(RESOLVE_CAP_PER_SEASON),
      lifetimeRegionsCleared: Number(SEAL_POWER_CAP_PER_SEASON),
      seasonDaysActive: Number(WARD_CAP_PER_SEASON),
    }))
    expect(state.resolve.progressBps).toBe(10_000n)
    expect(state.sealPower.progressBps).toBe(10_000n)
    expect(state.ward.progressBps).toBe(10_000n)
  })
})

// ─── Monotonicity ─────────────────────────────────────────────────────────────

describe('ooReiHero -- monotonicity (more engagement never lowers a stat)', () => {
  it('Resolve never decreases as lifetimeSeals increases', () => {
    let prevValue = 0n
    for (let n = 0; n <= 60; n += 3) {
      const state = computeHeroStats(baseInput({ lifetimeSeals: n }))
      expect(state.resolve.value >= prevValue).toBe(true)
      prevValue = state.resolve.value
    }
  })

  it('Seal-Power never decreases as lifetimeRegionsCleared increases', () => {
    let prevValue = 0n
    for (let n = 0; n <= 15; n += 1) {
      const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: n }))
      expect(state.sealPower.value >= prevValue).toBe(true)
      prevValue = state.sealPower.value
    }
  })

  it('Ward never decreases as seasonDaysActive increases', () => {
    let prevValue = 0n
    for (let n = 0; n <= 100; n += 5) {
      const state = computeHeroStats(baseInput({ seasonDaysActive: n }))
      expect(state.ward.value >= prevValue).toBe(true)
      prevValue = state.ward.value
    }
  })
})

// ─── Determinism ──────────────────────────────────────────────────────────────

describe('ooReiHero -- determinism (identical input -> identical output)', () => {
  it('produces identical output across 100 calls with the same input', () => {
    const input = baseInput({ lifetimeSeals: 23, lifetimeRegionsCleared: 3, seasonDaysActive: 17, currentRankIndex: 4, lifetimePointsUnits: 460_000_000n })
    const serialize = (s: ReturnType<typeof computeHeroStats>) =>
      JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    const baseline = serialize(computeHeroStats(input))
    for (let i = 0; i < 100; i++) {
      expect(serialize(computeHeroStats(input))).toBe(baseline)
    }
  })
})

// ─── Season resolution ────────────────────────────────────────────────────────

describe('resolveCurrentSeason', () => {
  it('rank 0 and 1 map to Season 1', () => {
    expect(resolveCurrentSeason(0).seasonNumber).toBe(1)
    expect(resolveCurrentSeason(1).seasonNumber).toBe(1)
  })

  it('rank 2-3 map to Season 2', () => {
    expect(resolveCurrentSeason(2).seasonNumber).toBe(2)
    expect(resolveCurrentSeason(3).seasonNumber).toBe(2)
  })

  it('rank 4-5 map to Season 3', () => {
    expect(resolveCurrentSeason(4).seasonNumber).toBe(3)
    expect(resolveCurrentSeason(5).seasonNumber).toBe(3)
  })

  it('rank 6-7 map to Season 4', () => {
    expect(resolveCurrentSeason(6).seasonNumber).toBe(4)
    expect(resolveCurrentSeason(7).seasonNumber).toBe(4)
  })

  it('rank 8-10 map to Season 5', () => {
    expect(resolveCurrentSeason(8).seasonNumber).toBe(5)
    expect(resolveCurrentSeason(9).seasonNumber).toBe(5)
    expect(resolveCurrentSeason(10).seasonNumber).toBe(5)
  })

  it('negative rank is fail-closed to Season 1', () => {
    expect(resolveCurrentSeason(-1).seasonNumber).toBe(1)
    expect(resolveCurrentSeason(-999).seasonNumber).toBe(1)
  })

  it('every season is in the SEASONS array', () => {
    expect(SEASONS.length).toBe(SEASONS_PER_CYCLE)
    for (let i = 0; i <= 10; i++) {
      const s = resolveCurrentSeason(i)
      expect(SEASONS.some((x) => x.seasonNumber === s.seasonNumber)).toBe(true)
    }
  })
})

// ─── Boss-sealed derivation ───────────────────────────────────────────────────

describe('computeHeroStats -- seasonArc boss-sealed logic', () => {
  it('bossSealed is false when lifetimeRegionsCleared < boss traversalOrder', () => {
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: 0, currentRankIndex: 0 }))
    // Season 1 boss is storm-coast (traversalOrder 1). 0 cleared -> not sealed.
    expect(state.seasonArc.bossSealed).toBe(false)
  })

  it('bossSealed is true when lifetimeRegionsCleared >= boss traversalOrder', () => {
    // Season 1 boss is storm-coast (traversalOrder 1). 1 cleared -> sealed.
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: 1, currentRankIndex: 0 }))
    expect(state.seasonArc.bossSealed).toBe(true)
  })

  it('bossSealed is deterministic: same input same output', () => {
    const inp = baseInput({ lifetimeRegionsCleared: 3, currentRankIndex: 4 })
    const r1 = computeHeroStats(inp).seasonArc.bossSealed
    const r2 = computeHeroStats(inp).seasonArc.bossSealed
    expect(r1).toBe(r2)
  })
})

// ─── anyStatGained ────────────────────────────────────────────────────────────

describe('anyStatGained', () => {
  it('returns false when all stats are identical', () => {
    const state = computeHeroStats(baseInput({ lifetimeSeals: 10, lifetimeRegionsCleared: 2, seasonDaysActive: 5 }))
    expect(anyStatGained(state, state)).toBe(false)
  })

  it('returns true when Resolve increases', () => {
    const prev = computeHeroStats(baseInput({ lifetimeSeals: 5 }))
    const next = computeHeroStats(baseInput({ lifetimeSeals: 6 }))
    expect(anyStatGained(prev, next)).toBe(true)
  })

  it('returns true when Seal-Power increases', () => {
    const prev = computeHeroStats(baseInput({ lifetimeRegionsCleared: 0 }))
    const next = computeHeroStats(baseInput({ lifetimeRegionsCleared: 1 }))
    expect(anyStatGained(prev, next)).toBe(true)
  })

  it('returns true when Ward increases', () => {
    const prev = computeHeroStats(baseInput({ seasonDaysActive: 10 }))
    const next = computeHeroStats(baseInput({ seasonDaysActive: 11 }))
    expect(anyStatGained(prev, next)).toBe(true)
  })

  it('returns false when all three stats are at cap and input increases further', () => {
    const capped = computeHeroStats(baseInput({
      lifetimeSeals: 999,
      lifetimeRegionsCleared: 999,
      seasonDaysActive: 999,
    }))
    const alsoAtCap = computeHeroStats(baseInput({
      lifetimeSeals: 9999,
      lifetimeRegionsCleared: 9999,
      seasonDaysActive: 9999,
    }))
    // Both are at cap -- no gain possible.
    expect(anyStatGained(capped, alsoAtCap)).toBe(false)
  })
})

// ─── seasonHeadline ───────────────────────────────────────────────────────────

describe('seasonHeadline', () => {
  it('shows AWAITS when boss not sealed', () => {
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: 0 }))
    const h = seasonHeadline(state.seasonArc)
    expect(h.line2).toContain('AWAITS')
  })

  it('shows SEALED when boss is sealed', () => {
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: 1, currentRankIndex: 0 }))
    const h = seasonHeadline(state.seasonArc)
    expect(h.line2).toContain('SEALED')
  })

  it('contains no em-dash in either line', () => {
    const state = computeHeroStats(baseInput({ lifetimeSeals: 5, lifetimeRegionsCleared: 2, currentRankIndex: 3 }))
    const h = seasonHeadline(state.seasonArc)
    expect(h.line1.includes('--') || h.line1.includes('—')).toBe(false)
    expect(h.line2.includes('--') || h.line2.includes('—')).toBe(false)
  })
})

// ─── Brand: no em-dash in any string field ────────────────────────────────────

describe('ooReiHero -- brand: no em-dash in any string field', () => {
  const state = computeHeroStats(baseInput({ lifetimeSeals: 10, lifetimeRegionsCleared: 2, seasonDaysActive: 20, currentRankIndex: 4 }))

  it('stat label fields contain no em-dash', () => {
    for (const stat of [state.resolve, state.sealPower, state.ward]) {
      expect(stat.label.includes('—')).toBe(false)
      expect(stat.description.includes('—')).toBe(false)
    }
  })

  it('season arc and season title fields contain no em-dash', () => {
    expect(state.seasonArc.season.title.includes('—')).toBe(false)
    expect(state.seasonArc.season.arc.includes('—')).toBe(false)
  })

  it('all SEASONS entries contain no em-dash', () => {
    for (const s of SEASONS) {
      expect(s.title.includes('—')).toBe(false)
      expect(s.arc.includes('—')).toBe(false)
      expect(s.bossName.includes('—')).toBe(false)
    }
  })

  it('WARDEN_RANKS thresholds are bigint and non-negative (sanity)', () => {
    for (const r of WARDEN_RANKS) {
      expect(typeof r.thresholdUnits).toBe('bigint')
      expect(r.thresholdUnits >= 0n).toBe(true)
    }
  })
})

// ─── Stat value accuracy ──────────────────────────────────────────────────────

describe('ooReiHero -- stat value accuracy', () => {
  it('Resolve at 25 seals is 25n (below cap)', () => {
    const state = computeHeroStats(baseInput({ lifetimeSeals: 25 }))
    expect(state.resolve.value).toBe(25n)
  })

  it('Seal-Power at 3 regions is 3n (below cap)', () => {
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: 3 }))
    expect(state.sealPower.value).toBe(3n)
  })

  it('Ward at 45 days is 45n (below cap)', () => {
    const state = computeHeroStats(baseInput({ seasonDaysActive: 45 }))
    expect(state.ward.value).toBe(45n)
  })

  it('progressBps at half-cap is 5000n (floor division)', () => {
    const halfSeals = Number(RESOLVE_CAP_PER_SEASON / 2n)
    const state = computeHeroStats(baseInput({ lifetimeSeals: halfSeals }))
    expect(state.resolve.progressBps).toBe(5_000n)
  })

  it('progressBps at 0 is 0n', () => {
    const state = computeHeroStats(baseInput())
    expect(state.resolve.progressBps).toBe(0n)
    expect(state.sealPower.progressBps).toBe(0n)
    expect(state.ward.progressBps).toBe(0n)
  })
})

// ─── MYTH_REGIONS integration: currentRegion is a valid region or null ────────

describe('ooReiHero -- currentRegion derivation', () => {
  it('at 0 regions cleared, currentRegion is the first authored region', () => {
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: 0 }))
    // First region is storm-coast.
    expect(state.seasonArc.currentRegion?.id).toBe('storm-coast')
  })

  it('at 1 region cleared, currentRegion is the second region', () => {
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: 1 }))
    expect(state.seasonArc.currentRegion?.id).toBe('tide-shore')
  })

  it('at max regions, currentRegion is not null (clamped to last region)', () => {
    const state = computeHeroStats(baseInput({ lifetimeRegionsCleared: 999 }))
    expect(state.seasonArc.currentRegion).not.toBeNull()
  })

  it('MYTH_REGIONS has 10 entries (sanity check)', () => {
    expect(MYTH_REGIONS.length).toBe(10)
  })
})

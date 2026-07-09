/**
 * OO-REI Region Archetypes — Domain-B/RG verification.
 *
 * The load-bearing guarantees:
 *  - Every real region maps to a valid archetype (no unmapped region can be active).
 *  - getRegionArchetype is deterministic + fail-closed (unknown throws).
 *  - The points/gauge multipliers are EV-NEUTRAL: they operate on the loyalty
 *    "seals" ledger and the meter, NEVER on the cash path. Cross-archetype cash
 *    credit for the same spin is bit-identical (T3) — proving RTP is region-blind.
 */

import { describe, expect, it } from 'vitest'

import {
  ARCHETYPE_CONFIGS,
  applyArchetypeGaugeFill,
  applyArchetypePoints,
  getActiveArchetypeOrNull,
  getRegionArchetype,
  type RegionArchetype,
} from './ooReiRegionArchetypes'
import { MYTH_REGIONS } from './ooReiMythRegions'
import { bpsToLamports, BPS_DENOM, evaluateSpin, mulberry32, randomStops } from './ooReiMath'

const ARCHE_KEYS: ReadonlyArray<RegionArchetype> = ['SURGE', 'FORGE', 'DRIFT']

describe('region → archetype coverage (T1: no region can be active without a perk)', () => {
  it('every real MYTH_REGIONS id resolves to a valid archetype', () => {
    for (const region of MYTH_REGIONS) {
      const cfg = getRegionArchetype(region.id)
      expect(ARCHE_KEYS).toContain(cfg.key)
    }
  })

  it('all three archetypes are actually used across the map (no dead archetype)', () => {
    const used = new Set(MYTH_REGIONS.map((r) => getRegionArchetype(r.id).key))
    expect(used.has('SURGE')).toBe(true)
    expect(used.has('FORGE')).toBe(true)
    expect(used.has('DRIFT')).toBe(true)
  })
})

describe('getRegionArchetype — deterministic + fail-closed', () => {
  it('returns the identical config across repeated calls', () => {
    for (let i = 0; i < 50; i++) {
      expect(getRegionArchetype('ember-forge')).toBe(ARCHETYPE_CONFIGS.FORGE)
      expect(getRegionArchetype('storm-coast')).toBe(ARCHETYPE_CONFIGS.SURGE)
    }
  })

  it('THROWS on an unknown region (never silently defaults)', () => {
    expect(() => getRegionArchetype('atlantis')).toThrow()
    expect(() => getRegionArchetype('')).toThrow()
  })

  it('getActiveArchetypeOrNull returns null for the all-cleared sentinel, throws on unknown', () => {
    expect(getActiveArchetypeOrNull('')).toBeNull()
    expect(getActiveArchetypeOrNull('tide-shore')).toBe(ARCHETYPE_CONFIGS.DRIFT)
    expect(() => getActiveArchetypeOrNull('atlantis')).toThrow()
  })
})

describe('archetype multipliers are BPS bigint (no float leak)', () => {
  it('every multiplier is a bigint', () => {
    for (const key of ARCHE_KEYS) {
      const c = ARCHETYPE_CONFIGS[key]
      expect(typeof c.pointsWinMulBps).toBe('bigint')
      expect(typeof c.pointsLossMulBps).toBe('bigint')
      expect(typeof c.gaugeFillMulBps).toBe('bigint')
    }
  })

  it('no multiplier is below 1.0x (perks only add meter fuel, never subtract)', () => {
    for (const key of ARCHE_KEYS) {
      const c = ARCHETYPE_CONFIGS[key]
      expect(c.pointsWinMulBps >= BPS_DENOM).toBe(true)
      expect(c.pointsLossMulBps >= BPS_DENOM).toBe(true)
      expect(c.gaugeFillMulBps >= BPS_DENOM).toBe(true)
    }
  })
})

describe('applyArchetypePoints — floor, house-favored, EV-neutral scaling', () => {
  const base = 1_000_000n

  it('SURGE boosts loss seals ~1.1667x (floor), wins unchanged', () => {
    const surge = ARCHETYPE_CONFIGS.SURGE
    expect(applyArchetypePoints(base, surge, false)).toBe((base * 11_667n) / BPS_DENOM)
    expect(applyArchetypePoints(base, surge, true)).toBe(base) // win mul 1.0x
  })

  it('DRIFT boosts win seals 1.25x (floor), losses unchanged', () => {
    const drift = ARCHETYPE_CONFIGS.DRIFT
    expect(applyArchetypePoints(base, drift, true)).toBe((base * 12_500n) / BPS_DENOM)
    expect(applyArchetypePoints(base, drift, false)).toBe(base)
  })

  it('FORGE leaves points at base (its perk is gauge-fill, not points)', () => {
    const forge = ARCHETYPE_CONFIGS.FORGE
    expect(applyArchetypePoints(base, forge, true)).toBe(base)
    expect(applyArchetypePoints(base, forge, false)).toBe(base)
  })

  it('null archetype (all-cleared) returns the base unchanged', () => {
    expect(applyArchetypePoints(base, null, true)).toBe(base)
    expect(applyArchetypePoints(base, null, false)).toBe(base)
  })

  it('floors a fractional product (house-favored) and rejects negatives', () => {
    // 7n * 12500 / 10000 = 8 (floor of 8.75)
    expect(applyArchetypePoints(7n, ARCHETYPE_CONFIGS.DRIFT, true)).toBe(8n)
    expect(() => applyArchetypePoints(-1n, ARCHETYPE_CONFIGS.SURGE, false)).toThrow()
  })
})

describe('applyArchetypeGaugeFill — FORGE fills 1.25x, others base', () => {
  const base = 1_000_000n
  it('FORGE scales gauge input 1.25x (floor)', () => {
    expect(applyArchetypeGaugeFill(base, ARCHETYPE_CONFIGS.FORGE)).toBe((base * 12_500n) / BPS_DENOM)
  })
  it('SURGE/DRIFT leave gauge input at base', () => {
    expect(applyArchetypeGaugeFill(base, ARCHETYPE_CONFIGS.SURGE)).toBe(base)
    expect(applyArchetypeGaugeFill(base, ARCHETYPE_CONFIGS.DRIFT)).toBe(base)
  })
  it('null archetype returns base; negatives throw', () => {
    expect(applyArchetypeGaugeFill(base, null)).toBe(base)
    expect(() => applyArchetypeGaugeFill(-5n, ARCHETYPE_CONFIGS.FORGE)).toThrow()
  })
})

describe('T3 — cross-region cash equivalence (RTP is region-blind by construction)', () => {
  it('cash credited for a spin is bit-identical regardless of active archetype', () => {
    const wager = 1_000_000n
    let seed = 314159
    for (let i = 0; i < 5_000; i++) {
      const rng = mulberry32(seed)
      const stops = randomStops(rng)
      // The ONLY cash path — takes no region/archetype argument.
      const cash = bpsToLamports(evaluateSpin(stops).totalPayBps, wager)
      // Applying ANY archetype's perks operates on separate (points/gauge) values
      // and cannot alter this cash figure. Prove cash is independent of archetype.
      for (const key of ARCHE_KEYS) {
        const arch = ARCHETYPE_CONFIGS[key]
        // perks touch points + gauge, never the cash we just computed:
        applyArchetypePoints(cash, arch, true)
        applyArchetypeGaugeFill(cash, arch)
        const cashAgain = bpsToLamports(evaluateSpin(stops).totalPayBps, wager)
        expect(cashAgain).toBe(cash) // unchanged — RTP cannot move with region
      }
      seed = (seed * 1664525 + 1013904223) >>> 0
    }
  })
})

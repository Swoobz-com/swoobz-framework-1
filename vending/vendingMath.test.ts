/**
 * AUTOMAT math gate — same assertions as the module-load mirrorRoundtripCheck
 * plus exhaustive boundary + floor cases, for ALL THREE TIERS. Any failure is
 * release-blocking.
 */
import { describe, expect, it } from 'vitest'
import {
  aggregateMultiplierBps,
  DEFAULT_TIER,
  formatMultiplier,
  formatUsdc,
  GOLD_ONE_IN,
  GOLD_ONE_IN_BY_TIER,
  GOLD_WEIGHT_BY_TIER,
  GOLDEN_PACK_TABLES,
  HOUSE_EDGE_BPS,
  MAX_PACKS,
  MIN_PACKS,
  ONE_X_BPS,
  PACK_MAX_MULTIPLIER_BPS,
  PACK_MAX_MULTIPLIER_BPS_BY_TIER,
  PACK_TABLE,
  PACK_TABLES,
  rollToPrize,
  settlePackPayout,
  TARGET_RTP_BPS,
  TIER_ORDER,
  WEIGHT_TOTAL,
} from './vendingMath'

describe('prize table integrity (every tier)', () => {
  it.each(TIER_ORDER)('%s matches its frozen golden table exactly', (tier) => {
    const table = PACK_TABLES[tier]
    const golden = GOLDEN_PACK_TABLES[tier]
    expect(table.length).toBe(golden.length)
    for (let i = 0; i < table.length; i++) {
      const p = table[i]!
      const [id, cls, bps, weight] = golden[i]!
      expect(p.id).toBe(id)
      expect(p.cls).toBe(cls)
      expect(p.multiplierBps).toBe(bps)
      expect(p.weight).toBe(weight)
    }
  })

  it.each(TIER_ORDER)('%s weights sum to WEIGHT_TOTAL', (tier) => {
    const sum = PACK_TABLES[tier].reduce((n, p) => n + p.weight, 0n)
    expect(sum).toBe(WEIGHT_TOTAL)
  })

  it.each(TIER_ORDER)(
    '%s holds the exact EV identity: Σ w·v === TARGET_RTP_BPS · WEIGHT_TOTAL',
    (tier) => {
      const ev = PACK_TABLES[tier].reduce((n, p) => n + p.weight * p.multiplierBps, 0n)
      expect(ev).toBe(TARGET_RTP_BPS * WEIGHT_TOTAL)
    },
  )

  it('locks the RTP constants and the tier ladders', () => {
    expect(TARGET_RTP_BPS).toBe(ONE_X_BPS - HOUSE_EDGE_BPS)
    expect(TARGET_RTP_BPS).toBe(9_650n)
    expect(GOLD_ONE_IN_BY_TIER).toEqual({ easy: 20, medium: 25, hard: 40 })
    expect(GOLD_WEIGHT_BY_TIER).toEqual({ easy: 5_000n, medium: 4_000n, hard: 2_500n })
    expect(PACK_MAX_MULTIPLIER_BPS_BY_TIER).toEqual({
      easy: 1_000_000n,
      medium: 2_500_000n,
      hard: 10_000_000n,
    })
    // Back-compat aliases track the default tier.
    expect(PACK_TABLE).toBe(PACK_TABLES[DEFAULT_TIER])
    expect(GOLD_ONE_IN).toBe(GOLD_ONE_IN_BY_TIER[DEFAULT_TIER])
    expect(PACK_MAX_MULTIPLIER_BPS).toBe(PACK_MAX_MULTIPLIER_BPS_BY_TIER[DEFAULT_TIER])
    expect(MIN_PACKS).toBe(1)
    expect(MAX_PACKS).toBe(20)
  })
})

describe('rollToPrize (cumulative walk, every tier)', () => {
  it.each(TIER_ORDER)('%s maps every cumulative boundary to the right row', (tier) => {
    let cum = 0n
    for (const p of PACK_TABLES[tier]) {
      expect(rollToPrize(cum, tier).id).toBe(p.id) // first roll of the row
      expect(rollToPrize(cum + p.weight - 1n, tier).id).toBe(p.id) // last roll
      cum += p.weight
    }
    expect(cum).toBe(WEIGHT_TOTAL)
  })

  it.each(TIER_ORDER)('%s gold slice begins exactly at WEIGHT_TOTAL − goldWeight', (tier) => {
    const goldStart = WEIGHT_TOTAL - GOLD_WEIGHT_BY_TIER[tier]
    expect(rollToPrize(goldStart - 1n, tier).cls).toBe('standard')
    expect(rollToPrize(goldStart, tier).cls).toBe('gold')
    expect(rollToPrize(WEIGHT_TOTAL - 1n, tier).multiplierBps).toBe(
      PACK_MAX_MULTIPLIER_BPS_BY_TIER[tier],
    )
  })

  it('fails closed on out-of-range rolls', () => {
    expect(() => rollToPrize(-1n)).toThrow()
    expect(() => rollToPrize(WEIGHT_TOTAL)).toThrow()
  })

  it('defaults to the easy tier (back-compat call shape)', () => {
    expect(rollToPrize(0n).id).toBe('dud')
    expect(rollToPrize(WEIGHT_TOTAL - 1n).id).toBe('g100')
  })
})

describe('settlement floors (Domain A)', () => {
  it('flooring is per pack, house-favored', () => {
    expect(settlePackPayout(10_000_000n, 2_500n)).toBe(2_500_000n)
    expect(settlePackPayout(333_333n, 2_500n)).toBe(83_333n) // 83333.25 floors
    expect(settlePackPayout(1n, 9_999n)).toBe(0n) // dust floors to zero
    expect(settlePackPayout(1_000_000n, 0n)).toBe(0n) // dud pays zero
    expect(settlePackPayout(1_000_000n, 10_000_000n)).toBe(1_000_000_000n) // hard 1000×
  })

  it('fails closed on negative inputs', () => {
    expect(() => settlePackPayout(-1n, 10_000n)).toThrow()
    expect(() => settlePackPayout(1_000_000n, -1n)).toThrow()
  })
})

describe('aggregate multiplier (display only)', () => {
  it('floors toward zero', () => {
    expect(aggregateMultiplierBps(3_000_000n, 4_500_000n)).toBe(15_000n) // 1.5×
    expect(aggregateMultiplierBps(3_000_000n, 1_000_000n)).toBe(3_333n) // floors
    expect(aggregateMultiplierBps(1_000_000n, 0n)).toBe(0n)
  })
  it('fails closed on bad totals', () => {
    expect(() => aggregateMultiplierBps(0n, 1n)).toThrow()
    expect(() => aggregateMultiplierBps(1n, -1n)).toThrow()
  })
})

describe('formatting', () => {
  it('formats multipliers with truncation', () => {
    expect(formatMultiplier(9_650n)).toBe('0.96x')
    expect(formatMultiplier(10_000n)).toBe('1.00x')
    expect(formatMultiplier(1_000_000n)).toBe('100.00x')
    expect(formatMultiplier(10_000_000n)).toBe('1000.00x')
    expect(formatMultiplier(0n)).toBe('0.00x')
  })
  it('formats USDC lamports', () => {
    expect(formatUsdc(1_000_000n)).toBe('1.00')
    expect(formatUsdc(2_500_000n)).toBe('2.50')
    expect(formatUsdc(83_333n)).toBe('0.08')
    expect(formatUsdc(-1_500_000n)).toBe('-1.50')
  })
})

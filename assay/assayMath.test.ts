/**
 * The Assay Line — math verification suite.
 *
 * Asserts the two holdgate criteria from the balance-analyst brief, ON EVERY
 * DIFFICULTY TIER (lean/standard/flooded — all the SAME flat ~96.5% RTP):
 *   (a) each tier's golden COIN_LADDER_BPS[0..60] vector matches the runtime
 *       formula, and
 *   (b) S(L)·T(L) ∈ [0.9600, 0.9700] for EVERY L in [8,60], every tier
 * plus the single-final-floor discipline (proving per-step flooring is wrong),
 * the coin-collect delta-sum identity, and settlement floor.
 */
import { describe, expect, it } from 'vitest'
import {
  BOMB_COUNT,
  coinDeltaBps,
  coinLadderBps,
  COIN_LADDER_BPS,
  COIN_LADDER_BPS_BY_TIER,
  DEFAULT_TIER,
  GOLDEN_COIN_LADDER_BPS,
  GOLDEN_COIN_LADDER_BPS_BY_TIER,
  GRID_DIM,
  MAX_TRAIL,
  MIN_TRAIL,
  ONE_X_BPS,
  RTP_BAND_MAX_BPS,
  RTP_BAND_MIN_BPS,
  SAFE_TILES,
  settlePayout,
  survivalRational,
  TARGET_RTP_BPS,
  TIER_MAX_MULTIPLE_BPS,
  TIER_ORDER,
  TIERS,
  TOTAL_TILES,
} from './assayMath'
import type { TierId } from './assayMath'

describe('board constants', () => {
  it('locks the board spec (14×14 = 196, 8-vein default)', () => {
    expect(GRID_DIM).toBe(14)
    expect(TOTAL_TILES).toBe(196)
    expect(BOMB_COUNT).toBe(8)
    expect(SAFE_TILES).toBe(188)
    expect(TARGET_RTP_BPS).toBe(9650n)
    expect(MIN_TRAIL).toBe(8)
    expect(MAX_TRAIL).toBe(60)
    expect(DEFAULT_TIER).toBe('standard')
  })
})

describe('difficulty tiers', () => {
  it('lean=6 / standard=8 / flooded=16 veins, all on the 196-tile grid', () => {
    expect(TIER_ORDER).toEqual(['lean', 'standard', 'flooded'])
    expect(TIERS.lean.bombCount).toBe(6)
    expect(TIERS.lean.safeTiles).toBe(190)
    expect(TIERS.standard.bombCount).toBe(8)
    expect(TIERS.standard.safeTiles).toBe(188)
    expect(TIERS.flooded.bombCount).toBe(16)
    expect(TIERS.flooded.safeTiles).toBe(180)
    for (const t of TIER_ORDER) {
      expect(TIERS[t].safeTiles).toBe(TOTAL_TILES - TIERS[t].bombCount)
    }
  })

  it('exposes the per-tier T(60) ceiling (rises with vein density)', () => {
    expect(TIER_MAX_MULTIPLE_BPS.lean).toBe(89502n)
    expect(TIER_MAX_MULTIPLE_BPS.standard).toBe(191654n)
    expect(TIER_MAX_MULTIPLE_BPS.flooded).toBe(4461248n)
    // Harder tier ⇒ strictly higher ceiling for the same held RTP.
    expect(TIER_MAX_MULTIPLE_BPS.standard).toBeGreaterThan(TIER_MAX_MULTIPLE_BPS.lean)
    expect(TIER_MAX_MULTIPLE_BPS.flooded).toBeGreaterThan(TIER_MAX_MULTIPLE_BPS.standard)
  })

  it('default back-compat exports track the Standard tier', () => {
    expect(COIN_LADDER_BPS).toEqual(COIN_LADDER_BPS_BY_TIER[DEFAULT_TIER])
    expect(GOLDEN_COIN_LADDER_BPS).toEqual(GOLDEN_COIN_LADDER_BPS_BY_TIER[DEFAULT_TIER])
  })
})

describe('(a) golden COIN_LADDER_BPS[0..60] vector — every tier', () => {
  for (const tier of TIER_ORDER) {
    it(`${tier}: runtime ladder equals the frozen golden vector`, () => {
      const runtime = COIN_LADDER_BPS_BY_TIER[tier]
      const golden = GOLDEN_COIN_LADDER_BPS_BY_TIER[tier]
      expect(runtime.length).toBe(MAX_TRAIL + 1)
      expect(golden.length).toBe(MAX_TRAIL + 1)
      for (let L = 0; L <= MAX_TRAIL; L++) {
        expect(runtime[L]).toBe(golden[L])
      }
    })

    it(`${tier}: T(0) equals the target RTP and the ladder is strictly increasing`, () => {
      const { safeTiles } = TIERS[tier]
      expect(coinLadderBps(0, safeTiles)).toBe(TARGET_RTP_BPS)
      for (let L = 1; L <= MAX_TRAIL; L++) {
        expect(coinLadderBps(L, safeTiles)).toBeGreaterThan(coinLadderBps(L - 1, safeTiles))
      }
    })
  }
})

describe('(b) S(L)·T(L) ∈ [0.9600, 0.9700] for every L in [8,60] — every tier', () => {
  for (const tier of TIER_ORDER) {
    const { safeTiles } = TIERS[tier]
    for (let L = MIN_TRAIL; L <= MAX_TRAIL; L++) {
      it(`${tier} L=${L} lands in band`, () => {
        const { num, den } = survivalRational(L, safeTiles)
        const t = coinLadderBps(L, safeTiles)
        // Exact-rational RTP in bps: floor(Snum · T(L) / Sden).
        const rtpBps = (num * t) / den
        expect(rtpBps).toBeGreaterThanOrEqual(RTP_BAND_MIN_BPS)
        expect(rtpBps).toBeLessThanOrEqual(RTP_BAND_MAX_BPS)
        // Tighter: the single-final-floor keeps it house-favored, never above target.
        expect(rtpBps).toBeLessThanOrEqual(TARGET_RTP_BPS)
        // Proven <1bp house-favored margin (loss = S(L)·f < 1bp); 9645 is defensive slack.
        expect(rtpBps).toBeGreaterThanOrEqual(9645n)
      })
    }
  }
})

describe('single-final-floor discipline (balance-analyst correction)', () => {
  it('per-step flooring would crater RTP — proving why we do NOT do it', () => {
    // Emulate vault's per-step floor pattern on THIS forced-completion game,
    // on the default (Standard) board.
    const safe = TIERS[DEFAULT_TIER].safeTiles
    const perStep = (L: number): bigint => {
      let mult = ONE_X_BPS
      for (let i = 0; i < L; i++) {
        // (safe-i)/(total-i) inverse-weighted × target, floored EACH step.
        const num = BigInt(TOTAL_TILES - i) * TARGET_RTP_BPS
        const den = BigInt(safe - i) * ONE_X_BPS
        mult = (mult * num) / den
      }
      return mult
    }
    const single = coinLadderBps(MAX_TRAIL, safe)
    const { num, den } = survivalRational(MAX_TRAIL, safe)
    const singleRtp = (num * single) / den
    const perStepRtp = (num * perStep(MAX_TRAIL)) / den
    expect(singleRtp).toBeGreaterThanOrEqual(9645n)
    // Per-step is provably out of band — geometric truncation craters RTP the
    // deeper the trail runs (documented direction; a strict lower bound).
    expect(perStepRtp).toBeLessThan(9600n)
  })
})

describe('coin-collect delta-sum identity', () => {
  it('∑ flying values (nub1=T(1), nub k≥2=Δ) equals T(L), every playable L, every tier', () => {
    for (const tier of TIER_ORDER) {
      const { safeTiles } = TIERS[tier]
      for (let L = MIN_TRAIL; L <= MAX_TRAIL; L++) {
        let sum = coinLadderBps(1, safeTiles) // nub 1 establishes the base
        for (let k = 2; k <= L; k++) sum += coinDeltaBps(k, safeTiles)
        expect(sum).toBe(coinLadderBps(L, safeTiles))
      }
    }
  })
})

describe('settlement floor (Domain A, house-favored)', () => {
  it('wager × T(L) floors toward zero', () => {
    // 10 USDC × Standard T(8)=1.3552x = 13.552 USDC exact.
    expect(settlePayout(10_000_000n, coinLadderBps(8))).toBe(13_552_000n)
    // Fractional lamport belongs to the house.
    expect(settlePayout(3n, coinLadderBps(8))).toBe((3n * coinLadderBps(8)) / ONE_X_BPS)
  })
  it('fails closed on negative / out-of-band input', () => {
    expect(() => settlePayout(-1n, 10_000n)).toThrow()
    expect(() => coinLadderBps(-1)).toThrow()
    expect(() => coinLadderBps(SAFE_TILES + 1)).toThrow()
    // A trail longer than the SPARSEST tier's safe count still fails closed.
    const flooded: TierId = 'flooded'
    expect(() => coinLadderBps(TIERS[flooded].safeTiles + 1, TIERS[flooded].safeTiles)).toThrow()
  })
})

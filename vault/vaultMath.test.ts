/**
 * Vault math grid-size coverage (Tim 2026-05-26 SCENE-REBUILD).
 *
 * Tim ruling: Vault must support 3×3 and 7×7 as well as 5×5. The on-chain
 * program's `validate_grid_size` accepts 3 + 5 in Phase 1 (7 reserved
 * Phase 2). The frontend math mirror `multiplierAfterSafeTiles` already
 * handles arbitrary `totalTiles`; this suite exercises 3×3 and 7×7 so any
 * future drift breaks loud. The 5×5 case stays covered by the module-load
 * `mirrorRoundtripCheck()` self-assertion (canonical 25/3/1/300 → 11_022).
 */
import { describe, expect, it } from 'vitest'
import {
  cumulativeMultiplierBps,
  GRID_SIZE_3X3,
  GRID_SIZE_5X5,
  GRID_SIZE_7X7,
  HOUSE_EDGE_BPS_ALTSEASON,
  HOUSE_EDGE_BPS_BLUECHIPS,
  HOUSE_EDGE_BPS_DEFAULT,
  HOUSE_EDGE_BPS_SHITCOIN,
  MINE_COUNT_ALTSEASON,
  MINE_COUNT_BLUECHIPS,
  MINE_COUNT_SHITCOIN,
  modeParams,
  MOON_PAYOUT_DENOM,
  MOON_PAYOUT_NUMER,
  MOON_POOL_BPS,
  moonPayoutLamports,
  multiplierAfterSafeTiles,
  ONE_X_BPS,
  settlePayout,
  type VaultMode,
} from './vaultMath'

describe('multiplierAfterSafeTiles — grid-size coverage', () => {
  it('3×3: returns 1.00x at zero safe reveals', () => {
    const m = multiplierAfterSafeTiles({
      totalTiles: GRID_SIZE_3X3 * GRID_SIZE_3X3,
      mineCount: 3,
      safeCount: 0,
    })
    expect(m).toBe(ONE_X_BPS)
  })

  it('3×3: climbs monotonically across all safe reveals', () => {
    let prev = ONE_X_BPS
    for (let n = 1; n <= 6; n++) {
      const cur = multiplierAfterSafeTiles({
        totalTiles: 9,
        mineCount: 3,
        safeCount: n,
      })
      expect(cur).toBeGreaterThan(prev)
      prev = cur
    }
  })

  it('3×3: rejects safe-count exceeding the safe-tile budget', () => {
    expect(() => multiplierAfterSafeTiles({ totalTiles: 9, mineCount: 3, safeCount: 7 })).toThrow()
  })

  it('5×5: matches the canonical bankrun fixture at (25, 3, 1, 300) → 11_022 bps', () => {
    const m = multiplierAfterSafeTiles({
      totalTiles: GRID_SIZE_5X5 * GRID_SIZE_5X5,
      mineCount: 3,
      safeCount: 1,
    })
    expect(m).toBe(11_022n)
  })

  it('7×7: returns 1.00x at zero safe reveals', () => {
    const m = multiplierAfterSafeTiles({
      totalTiles: GRID_SIZE_7X7 * GRID_SIZE_7X7,
      mineCount: 3,
      safeCount: 0,
    })
    expect(m).toBe(ONE_X_BPS)
  })

  it('7×7: climbs monotonically across 20 safe reveals', () => {
    let prev = ONE_X_BPS
    for (let n = 1; n <= 20; n++) {
      const cur = multiplierAfterSafeTiles({
        totalTiles: 49,
        mineCount: 3,
        safeCount: n,
      })
      expect(cur).toBeGreaterThan(prev)
      prev = cur
    }
  })

  it('7×7: house-favored floor at the first safe reveal', () => {
    // n=1, total=49, mines=3: fair = 49/46; with 3% edge:
    // (49 * 9700) / (46 * 10_000) = 475_300 / 460_000 = 1.0332... → floor
    // 10_332 bps. House keeps the .61 of a bp.
    const m = multiplierAfterSafeTiles({
      totalTiles: 49,
      mineCount: 3,
      safeCount: 1,
      houseEdgeBps: HOUSE_EDGE_BPS_DEFAULT,
    })
    expect(m).toBe(10_332n)
    // House-favored: never rounds in the player's direction.
    expect(m).toBeLessThan(10_333n)
  })

  it('deterministic across 100 calls for each grid size', () => {
    const variants = [
      { totalTiles: 9, mineCount: 3, safeCount: 4 },
      { totalTiles: 25, mineCount: 3, safeCount: 10 },
      { totalTiles: 49, mineCount: 5, safeCount: 18 },
    ]
    for (const v of variants) {
      const first = multiplierAfterSafeTiles(v)
      for (let i = 0; i < 100; i++) {
        expect(multiplierAfterSafeTiles(v)).toBe(first)
      }
    }
  })

  it('cumulativeMultiplierBps alias matches multiplierAfterSafeTiles', () => {
    expect(cumulativeMultiplierBps({ totalTiles: 49, mineCount: 5, safeCount: 12 })).toBe(
      multiplierAfterSafeTiles({ totalTiles: 49, mineCount: 5, safeCount: 12 }),
    )
  })
})

// ─── RUG OR RICHES mode balance (RUG-OR-RICHES-MODE-BALANCE-2026-06-04.md) ──
describe('mode balance — RUG OR RICHES', () => {
  // §7 modeParams resolver
  it('modeParams: bluechips → 5×5, 3 rugs, 300 bps, no MOON', () => {
    expect(modeParams('bluechips')).toEqual({
      gridSize: GRID_SIZE_5X5,
      mineCount: MINE_COUNT_BLUECHIPS,
      houseEdgeBps: HOUSE_EDGE_BPS_BLUECHIPS,
      hasMoonTile: false,
    })
  })
  it('modeParams: altseason → 5×5, 5 rugs, 300 bps, no MOON', () => {
    expect(modeParams('altseason')).toEqual({
      gridSize: GRID_SIZE_5X5,
      mineCount: MINE_COUNT_ALTSEASON,
      houseEdgeBps: HOUSE_EDGE_BPS_ALTSEASON,
      hasMoonTile: false,
    })
  })
  it('modeParams: shitcoin → 7×7, 24 rugs, 655 bps, has MOON', () => {
    expect(modeParams('shitcoin')).toEqual({
      gridSize: GRID_SIZE_7X7,
      mineCount: MINE_COUNT_SHITCOIN,
      houseEdgeBps: HOUSE_EDGE_BPS_SHITCOIN,
      hasMoonTile: true,
    })
  })
  it('modeParams: fail-closed on unrecognized mode', () => {
    expect(() => modeParams('moon-farm' as VaultMode)).toThrow()
  })

  // §6.1 BLUECHIPS — T1/T2/T3
  it('T1 BLUECHIPS: (25,3,1,300) → 11_022n (no regression vs canonical)', () => {
    expect(
      multiplierAfterSafeTiles({ totalTiles: 25, mineCount: 3, safeCount: 1, houseEdgeBps: 300n }),
    ).toBe(11_022n)
  })
  it('T2 BLUECHIPS: climbs monotonically safe=1..22', () => {
    let prev = ONE_X_BPS
    for (let n = 1; n <= 22; n++) {
      const cur = multiplierAfterSafeTiles({ totalTiles: 25, mineCount: 3, safeCount: n })
      expect(cur).toBeGreaterThan(prev)
      prev = cur
    }
  })
  it('T3 BLUECHIPS: rejects safeCount=23 on 25-tile/3-mine board', () => {
    expect(() =>
      multiplierAfterSafeTiles({ totalTiles: 25, mineCount: 3, safeCount: 23 }),
    ).toThrow()
  })

  // §6.2 ALTSEASON — T4/T5/T6/T7
  it('T4 ALTSEASON: (25,5,1,300) → 12_125n', () => {
    expect(
      multiplierAfterSafeTiles({ totalTiles: 25, mineCount: 5, safeCount: 1, houseEdgeBps: 300n }),
    ).toBe(12_125n)
  })
  it('T5 ALTSEASON: climbs monotonically safe=1..20', () => {
    let prev = ONE_X_BPS
    for (let n = 1; n <= 20; n++) {
      const cur = multiplierAfterSafeTiles({ totalTiles: 25, mineCount: 5, safeCount: n })
      expect(cur).toBeGreaterThan(prev)
      prev = cur
    }
  })
  it('T6 ALTSEASON: rejects safeCount=21 on 25-tile/5-mine board', () => {
    expect(() =>
      multiplierAfterSafeTiles({ totalTiles: 25, mineCount: 5, safeCount: 21 }),
    ).toThrow()
  })
  it('T7 ALTSEASON: house-favored floor at safe=1 (< 12_126n)', () => {
    expect(
      multiplierAfterSafeTiles({ totalTiles: 25, mineCount: 5, safeCount: 1 }),
    ).toBeLessThan(12_126n)
  })

  // §6.3 SHITCOIN base formula (655 bps) — T8..T12
  it('T8 SHITCOIN: (49,24,1,655) → 18_316n', () => {
    expect(
      multiplierAfterSafeTiles({
        totalTiles: 49,
        mineCount: 24,
        safeCount: 1,
        houseEdgeBps: HOUSE_EDGE_BPS_SHITCOIN,
      }),
    ).toBe(18_316n)
  })
  it('T9 SHITCOIN: climbs monotonically safe=1..8', () => {
    let prev = ONE_X_BPS
    for (let n = 1; n <= 8; n++) {
      const cur = multiplierAfterSafeTiles({
        totalTiles: 49,
        mineCount: 24,
        safeCount: n,
        houseEdgeBps: HOUSE_EDGE_BPS_SHITCOIN,
      })
      expect(cur).toBeGreaterThan(prev)
      prev = cur
    }
  })
  it('T10 SHITCOIN: house-favored floor at safe=1 (< 18_317n)', () => {
    expect(
      multiplierAfterSafeTiles({
        totalTiles: 49,
        mineCount: 24,
        safeCount: 1,
        houseEdgeBps: HOUSE_EDGE_BPS_SHITCOIN,
      }),
    ).toBeLessThan(18_317n)
  })
  it('T11 SHITCOIN: deterministic across 100 calls', () => {
    const v = {
      totalTiles: 49,
      mineCount: 24,
      safeCount: 5,
      houseEdgeBps: HOUSE_EDGE_BPS_SHITCOIN,
    }
    const first = multiplierAfterSafeTiles(v)
    for (let i = 0; i < 100; i++) expect(multiplierAfterSafeTiles(v)).toBe(first)
  })
  it('T12 SHITCOIN: rejects safeCount=26 on 49-tile/24-mine board', () => {
    expect(() =>
      multiplierAfterSafeTiles({ totalTiles: 49, mineCount: 24, safeCount: 26 }),
    ).toThrow()
  })

  // §6.4 MOON payout formula (BigInt adversarial) — T13..T19
  it('T13 moonPayout(1_000_000n) → 49_900n', () => {
    expect(moonPayoutLamports(1_000_000n)).toBe(49_900n)
  })
  it('T14 moonPayout(0n) → 0n', () => {
    expect(moonPayoutLamports(0n)).toBe(0n)
  })
  it('T15 moonPayout(negative) throws (Domain A)', () => {
    expect(() => moonPayoutLamports(-1n)).toThrow()
  })
  it('T16 moonPayout(1n) → 0n (floor, house keeps it)', () => {
    expect(moonPayoutLamports(1n)).toBe(0n)
  })
  it('T17 moonPayout(10_000n) → 499n (exact)', () => {
    expect(moonPayoutLamports(10_000n)).toBe(499n)
  })
  it('T18 moonPayout(10_001n) → 499n (floor, house keeps fractional lamport)', () => {
    expect(moonPayoutLamports(10_001n)).toBe(499n)
  })
  it('T19 moonPayout(20_000_000_000n) does not overflow', () => {
    expect(moonPayoutLamports(20_000_000_000n)).toBe(998_000_000n)
  })

  // §6.5 Settlement with MOON — T20..T24
  it('T20 settle + MOON: floor(wager×cumul/ONE_X) + floor(wager×499/10_000)', () => {
    const wager = 5_000_000n
    const cumul = 25_000n // 2.50x
    const base = settlePayout(wager, cumul)
    const moon = moonPayoutLamports(wager)
    expect(base + moon).toBe(12_500_000n + 249_500n)
  })
  it('T21 mine hit: MOON payout is 0n (no payout on bust)', () => {
    // On bust the round settles to 0n; MOON provides no survival benefit.
    const won = false
    const moon = won ? moonPayoutLamports(5_000_000n) : 0n
    expect(moon).toBe(0n)
  })
  it('T22 cash-out without MOON revealed: 0n', () => {
    const moonRevealed = false
    const moon = moonRevealed ? moonPayoutLamports(5_000_000n) : 0n
    expect(moon).toBe(0n)
  })
  it('T23 cash-out with MOON revealed: floor(wager×499/10_000)', () => {
    const moonRevealed = true
    const moon = moonRevealed ? moonPayoutLamports(5_000_000n) : 0n
    expect(moon).toBe(249_500n)
  })
  it('T24 MOON payout is never folded into the BPS ladder', () => {
    // The cumulative BPS field must equal the formula output only.
    const cumul = multiplierAfterSafeTiles({
      totalTiles: 49,
      mineCount: 24,
      safeCount: 1,
      houseEdgeBps: HOUSE_EDGE_BPS_SHITCOIN,
    })
    expect(cumul).toBe(18_316n) // not 18_316 + 499
  })

  // §6.6 EV-neutrality unit identities — T25..T27
  it('T25 BLUECHIPS depth-1 EV ≈ 0.9700', () => {
    const m = multiplierAfterSafeTiles({ totalTiles: 25, mineCount: 3, safeCount: 1 })
    const ev = (22 * Number(m)) / (25 * 10_000)
    expect(ev).toBeCloseTo(0.97, 3)
  })
  it('T26 ALTSEASON depth-1 EV ≈ 0.9700', () => {
    const m = multiplierAfterSafeTiles({ totalTiles: 25, mineCount: 5, safeCount: 1 })
    const ev = (20 * Number(m)) / (25 * 10_000)
    expect(ev).toBeCloseTo(0.97, 3)
  })
  it('T27 MOON pool derivation identity: floor(255×49/25) === 499n', () => {
    expect((MOON_POOL_BPS * 49n) / 25n).toBe(MOON_PAYOUT_NUMER)
    expect(MOON_PAYOUT_NUMER).toBe(499n)
    expect(MOON_PAYOUT_DENOM).toBe(10_000n)
  })

  // A7 — house-favored floor direction across random wagers
  it('A7 house-favored floor: moonPayout × DENOM ≤ wager × NUMER for any wager', () => {
    for (let i = 0; i < 2000; i++) {
      const wager = BigInt(Math.floor(Math.random() * 50_000_000) + 1)
      const moon = moonPayoutLamports(wager)
      expect(moon * MOON_PAYOUT_DENOM <= wager * MOON_PAYOUT_NUMER).toBe(true)
    }
  })
})

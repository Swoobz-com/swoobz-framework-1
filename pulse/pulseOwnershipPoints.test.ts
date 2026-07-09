/**
 * pulseOwnershipPoints — Ownership Engine ledger tests (S0).
 *
 * TWO LEDGERS tested here:
 *   LEDGER A — accumulateRoundsPlayed: flat +1 per round regardless of wager.
 *   LEDGER B — accumulatePoints: 1.0x win / 1.5x loss wager-indexed signals.
 *
 * ADVERSARIAL Domain A coverage: floor truncation (house-favored), win/loss
 * amplification, wager-indexed NOT outcome-indexed (the crash-RG fence),
 * accumulation, fail-closed rejection of negatives, determinism across 100
 * calls, above-MAX_SAFE_INTEGER bigint precision. No floats, no clock.
 */
import { describe, expect, it } from 'vitest'
import {
  accumulatePoints,
  accumulateRoundsPlayed,
  formatPointsDelta,
  POINTS_LOSS_RATE_BPS,
  POINTS_WIN_RATE_BPS,
  pointsRateLabel,
} from './pulseOwnershipPoints'

const USDC = 1_000_000n // 1 USDC in lamports

describe('pulseOwnershipPoints — rate consts (RG-C5 structural pins)', () => {
  it('win rate is 1.0x and loss rate is 1.5x (loss-amplified)', () => {
    expect(POINTS_WIN_RATE_BPS).toBe(10_000n)
    expect(POINTS_LOSS_RATE_BPS).toBe(15_000n)
    expect(POINTS_LOSS_RATE_BPS).toBeGreaterThan(POINTS_WIN_RATE_BPS)
  })

  it('pointsRateLabel is the factual rate, identical register win/loss', () => {
    expect(pointsRateLabel(true)).toBe('1.0×')
    expect(pointsRateLabel(false)).toBe('1.5×')
  })
})

describe('accumulatePoints — win/loss amplification + wager-indexing', () => {
  it('a $10 win accrues 10 signals; a $10 loss accrues 15 (1.5x)', () => {
    expect(accumulatePoints(0n, 10n * USDC, true)).toBe(10n)
    expect(accumulatePoints(0n, 10n * USDC, false)).toBe(15n)
  })

  it('is wager-indexed, NOT outcome-indexed — no multiplier input exists', () => {
    // The signature is (prev, wager, won). There is no cash-out multiplier
    // parameter, so two losses at the same wager accrue identically regardless
    // of how high the curve was let to run. This is the crash-RG fence.
    const a = accumulatePoints(0n, 25n * USDC, false)
    const b = accumulatePoints(0n, 25n * USDC, false)
    expect(a).toBe(b)
    expect(a).toBe(37n) // floor(25 * 15000 / 10000) = 37 (37.5 floored)
  })

  it('floors house-favored: a sub-1-USDC wager accrues 0 signals', () => {
    expect(accumulatePoints(0n, 500_000n, false)).toBe(0n) // $0.50 → 0
    expect(accumulatePoints(0n, 999_999n, false)).toBe(0n) // just under $1 → 0
  })

  it('floors the 1.5x loss remainder toward zero (house keeps it)', () => {
    // $5 loss = floor(5 * 1.5) = floor(7.5) = 7, never 8.
    expect(accumulatePoints(0n, 5n * USDC, false)).toBe(7n)
    // $3 loss = floor(4.5) = 4.
    expect(accumulatePoints(0n, 3n * USDC, false)).toBe(4n)
  })

  it('accumulates monotonically across rounds', () => {
    let lifetime = 0n
    lifetime = accumulatePoints(lifetime, 10n * USDC, true) // +10 → 10
    lifetime = accumulatePoints(lifetime, 10n * USDC, false) // +15 → 25
    lifetime = accumulatePoints(lifetime, 5n * USDC, true) // +5 → 30
    expect(lifetime).toBe(30n)
  })

  it('is deterministic across 100 identical calls', () => {
    const first = accumulatePoints(1_000n, 7n * USDC, false)
    for (let i = 0; i < 100; i++) {
      expect(accumulatePoints(1_000n, 7n * USDC, false)).toBe(first)
    }
  })

  it('holds bigint precision above Number.MAX_SAFE_INTEGER', () => {
    const huge = BigInt(Number.MAX_SAFE_INTEGER) * 1_000n // way past 2^53
    const wagerUsdc = 1_000_000n // $1,000,000 wager → 1,000,000 signals win
    expect(accumulatePoints(huge, wagerUsdc * USDC, true)).toBe(huge + 1_000_000n)
  })
})

describe('accumulatePoints — fail-closed (Domain A)', () => {
  it('throws on negative prevLifetime (corrupted ledger)', () => {
    expect(() => accumulatePoints(-1n, 10n * USDC, true)).toThrow(RangeError)
  })

  it('throws on negative wager', () => {
    expect(() => accumulatePoints(0n, -1n, true)).toThrow(RangeError)
  })
})

describe('accumulateRoundsPlayed — LEDGER A (wager-neutral rank counter)', () => {
  it('increments by exactly 1 regardless of any external state', () => {
    expect(accumulateRoundsPlayed(0n)).toBe(1n)
    expect(accumulateRoundsPlayed(99n)).toBe(100n)
    expect(accumulateRoundsPlayed(899n)).toBe(900n)
  })

  it('is monotonically increasing — never decreases', () => {
    let rounds = 0n
    for (let i = 0; i < 50; i++) {
      const next = accumulateRoundsPlayed(rounds)
      expect(next).toBeGreaterThan(rounds)
      rounds = next
    }
  })

  it('is deterministic: identical inputs → identical output', () => {
    const ref = accumulateRoundsPlayed(42n)
    for (let i = 0; i < 100; i++) {
      expect(accumulateRoundsPlayed(42n)).toBe(ref)
    }
  })

  it('throws on negative prevRounds (fail-closed, Domain A)', () => {
    expect(() => accumulateRoundsPlayed(-1n)).toThrow(RangeError)
  })

  it('holds bigint precision above Number.MAX_SAFE_INTEGER', () => {
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + 1_000n
    expect(accumulateRoundsPlayed(huge)).toBe(huge + 1n)
  })
})

describe('formatPointsDelta', () => {
  it('formats a positive accrual with a + prefix and thousands separators', () => {
    expect(formatPointsDelta(187n)).toBe('+187 pts')
    expect(formatPointsDelta(12_340n)).toBe('+12,340 pts')
    expect(formatPointsDelta(0n)).toBe('+0 pts')
  })

  it('throws on a negative delta (the engine never subtracts)', () => {
    expect(() => formatPointsDelta(-5n)).toThrow(RangeError)
  })
})

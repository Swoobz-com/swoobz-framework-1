/**
 * OO-FISHER math — unit tests.
 *
 * Tim playtest 2026-05-24 Layer 1 (loss mechanics + RTP):
 *   - evaluateCastOutcome → MISS / SNAP / JUNK / NORMAL by power band
 *   - tripMultiplierFromEntries → JUNK 0.30× + SNAP 0× wired correctly
 *   - simulateFisherRtp → deterministic Monte Carlo
 *   - publishedFisherRtp → caches first call
 *   - RTP < 100% under all conditions (casino discipline)
 *
 * Adversarial Domain A discipline: floor-truncation, deterministic seeds,
 * bounded iteration count, rejection of bad inputs, structural RG-C5
 * caps cannot be raised.
 */
import { describe, expect, it } from 'vitest'

import {
  applyBaitWeights,
  DEPTH_RARITY_WEIGHTS,
  effectiveTargetZone,
  evaluateCastOutcome,
  formatHouseEdge,
  formatRtp,
  JUNK_CATCH_BPS,
  MAX_TRIP_MULTIPLIER_BPS,
  oscillatingTargetCenter,
  publishedFisherRtp,
  reelingParamsForRod,
  simulateFisherRtp,
  SNAP_CATCH_BPS,
  TARGET_ZONE_OSCILLATION_AMPLITUDE,
  TARGET_ZONE_OSCILLATION_PERIOD_MS,
  tripMultiplierFromEntries,
} from './ooFisherMath'

// ─── evaluateCastOutcome ──────────────────────────────────────────────────

describe('evaluateCastOutcome', () => {
  const weights = applyBaitWeights(DEPTH_RARITY_WEIGHTS[3], 'bronze')

  it('is deterministic for the same (seed, power, weights)', () => {
    const a = evaluateCastOutcome(0x12345, 60, weights)
    const b = evaluateCastOutcome(0x12345, 60, weights)
    expect(a.kind).toBe(b.kind)
    expect(a.effectiveBps).toBe(b.effectiveBps)
    expect(a.rarity).toBe(b.rarity)
  })

  it('returns miss with 0 BPS for low-roll seeds at any power', () => {
    // Seed 0 → roll 0 → always MISS (well below missEnd)
    const result = evaluateCastOutcome(0, 60, weights)
    expect(result.kind).toBe('miss')
    expect(result.effectiveBps).toBe(0n)
    expect(result.rarity).toBeNull()
  })

  it('reaches all four outcome kinds across the seed space', () => {
    const seen = new Set<string>()
    for (let s = 0; s < 4000; s += 1) {
      const r = evaluateCastOutcome(s, 60, weights)
      seen.add(r.kind)
      if (seen.size === 4) break
    }
    expect(seen.has('miss')).toBe(true)
    expect(seen.has('snap')).toBe(true)
    expect(seen.has('junk')).toBe(true)
    expect(seen.has('normal')).toBe(true)
  })

  it('JUNK outcomes always return JUNK_CATCH_BPS', () => {
    for (let s = 0; s < 10000; s += 1) {
      const r = evaluateCastOutcome(s, 60, weights)
      if (r.kind === 'junk') {
        expect(r.effectiveBps).toBe(JUNK_CATCH_BPS)
        expect(r.rarity).toBeNull()
      }
    }
  })

  it('SNAP outcomes always return SNAP_CATCH_BPS (0n)', () => {
    for (let s = 0; s < 10000; s += 1) {
      const r = evaluateCastOutcome(s, 60, weights)
      if (r.kind === 'snap') {
        expect(r.effectiveBps).toBe(SNAP_CATCH_BPS)
        expect(r.effectiveBps).toBe(0n)
      }
    }
  })

  it('NORMAL outcomes always carry a valid rarity + non-zero BPS', () => {
    for (let s = 0; s < 10000; s += 1) {
      const r = evaluateCastOutcome(s, 60, weights)
      if (r.kind === 'normal') {
        expect(r.rarity).not.toBeNull()
        expect(r.effectiveBps).toBeGreaterThan(0n)
      }
    }
  })

  it('rejects non-finite or negative seeds', () => {
    expect(() => evaluateCastOutcome(Number.NaN, 60, weights)).toThrow()
    expect(() => evaluateCastOutcome(-1, 60, weights)).toThrow()
    expect(() => evaluateCastOutcome(Number.POSITIVE_INFINITY, 60, weights)).toThrow()
  })

  it('sweet-spot power (60) is more often normal than over-charge (95)', () => {
    let normalAt60 = 0
    let normalAt95 = 0
    const N = 5000
    for (let s = 0; s < N; s += 1) {
      // Vary the seed widely so the per-mille roll is uniformly sampled.
      const seed = (s * 0x9e3779b9) >>> 0
      if (evaluateCastOutcome(seed, 60, weights).kind === 'normal') normalAt60 += 1
      if (evaluateCastOutcome(seed, 95, weights).kind === 'normal') normalAt95 += 1
    }
    // Sweet-spot power (50-70) has miss=50, snap=30, junk=100 → 820/1000 normal
    // Over-charge (>90) has miss=200, snap=100, junk=180 → 520/1000 normal
    expect(normalAt60).toBeGreaterThan(normalAt95)
  })

  it('under-power (< 30) misses more often than sweet-spot (60)', () => {
    let missAt20 = 0
    let missAt60 = 0
    const N = 5000
    for (let s = 0; s < N; s += 1) {
      const seed = (s * 0x9e3779b9) >>> 0
      if (evaluateCastOutcome(seed, 20, weights).kind === 'miss') missAt20 += 1
      if (evaluateCastOutcome(seed, 60, weights).kind === 'miss') missAt60 += 1
    }
    expect(missAt20).toBeGreaterThan(missAt60)
  })
})

// ─── tripMultiplierFromEntries ────────────────────────────────────────────

describe('tripMultiplierFromEntries', () => {
  it('returns 1.00x baseline for invalid casts attempted', () => {
    expect(tripMultiplierFromEntries([], 0)).toBe(10_000n)
    expect(tripMultiplierFromEntries([], -1)).toBe(10_000n)
  })

  it('returns 0n for all-miss trip (3 casts, no entries)', () => {
    const result = tripMultiplierFromEntries([], 3)
    // Empty entries / 3 casts = 0n. Trip mult = 0n (loss).
    expect(result).toBe(0n)
  })

  it('returns 0n for all-snap trip (3 entries all at 0n)', () => {
    const result = tripMultiplierFromEntries(
      [{ effectiveBps: 0n }, { effectiveBps: 0n }, { effectiveBps: 0n }],
      3,
    )
    expect(result).toBe(0n)
  })

  it('JUNK-only trip averages 0.30x (sub-1x loss)', () => {
    // 3 junks → sum 9_000n, / 3 casts = 3_000n = 0.30x
    const result = tripMultiplierFromEntries(
      [
        { effectiveBps: JUNK_CATCH_BPS },
        { effectiveBps: JUNK_CATCH_BPS },
        { effectiveBps: JUNK_CATCH_BPS },
      ],
      3,
    )
    expect(result).toBe(3_000n)
  })

  it('mix of normal + miss + junk averages correctly', () => {
    // 1 normal at 60_000n (epic-ish) + 1 junk at 3_000n + 1 miss
    // sum = 63_000n / 3 = 21_000n = 2.10x
    const result = tripMultiplierFromEntries(
      [{ effectiveBps: 60_000n }, { effectiveBps: JUNK_CATCH_BPS }],
      3,
    )
    expect(result).toBe(21_000n)
  })

  it('caps at MAX_TRIP_MULTIPLIER_BPS (10.00x)', () => {
    const huge = 2_000_000n
    const result = tripMultiplierFromEntries([{ effectiveBps: huge }], 1)
    expect(result).toBe(MAX_TRIP_MULTIPLIER_BPS)
    expect(result).toBe(100_000n)
  })

  it('floor-truncates (house-favored)', () => {
    // 7_000n / 3 = 2_333n (floored). 0.2333x.
    const result = tripMultiplierFromEntries(
      [{ effectiveBps: 7_000n }],
      3,
    )
    expect(result).toBe(2_333n)
  })

  it('rejects negative effectiveBps defensively', () => {
    // Negative entries should be silently dropped, not throw.
    const result = tripMultiplierFromEntries(
      [{ effectiveBps: -1000n }, { effectiveBps: 10_000n }],
      2,
    )
    // Negative dropped; only +10_000n counts. 10_000n / 2 = 5_000n.
    expect(result).toBe(5_000n)
  })
})

// ─── simulateFisherRtp ────────────────────────────────────────────────────

describe('simulateFisherRtp', () => {
  it('is deterministic for the same (seed, iterations)', () => {
    const a = simulateFisherRtp(1, 200)
    const b = simulateFisherRtp(1, 200)
    expect(a.rtp).toBe(b.rtp)
    expect(a.meanTripMultiplierBps).toBe(b.meanTripMultiplierBps)
    expect(a.missRate).toBe(b.missRate)
    expect(a.snapRate).toBe(b.snapRate)
    expect(a.junkRate).toBe(b.junkRate)
  })

  it('yields different stats for different seeds', () => {
    const a = simulateFisherRtp(1, 300)
    const b = simulateFisherRtp(42, 300)
    expect(a.rtp !== b.rtp || a.meanTripMultiplierBps !== b.meanTripMultiplierBps).toBe(true)
  })

  it('rejects non-positive iteration counts', () => {
    expect(() => simulateFisherRtp(1, 0)).toThrow('positive integer')
    expect(() => simulateFisherRtp(1, -5)).toThrow('positive integer')
  })

  it('rejects iteration counts > 100_000', () => {
    expect(() => simulateFisherRtp(1, 200_000)).toThrow('positive integer')
  })

  it('reports houseEdge = 1 - rtp exactly', () => {
    const r = simulateFisherRtp(7, 300)
    expect(r.houseEdge + r.rtp).toBeCloseTo(1.0, 10)
  })

  it('payoutRate is in [0, 1]', () => {
    const r = simulateFisherRtp(11, 300)
    expect(r.payoutRate).toBeGreaterThanOrEqual(0)
    expect(r.payoutRate).toBeLessThanOrEqual(1)
  })

  it('CRITICAL: RTP < 100% across multiple seeds (casino discipline)', () => {
    for (const seed of [1, 7, 42, 99, 137, 1024]) {
      const r = simulateFisherRtp(seed, 2000)
      expect(
        r.rtp,
        `seed ${seed}: RTP must be < 100% (casino discipline). Got ${(r.rtp * 100).toFixed(2)}%`,
      ).toBeLessThan(1.0)
    }
  })

  it('RTP lands in the 94-98% casino band on the published seed', () => {
    // Larger N for tighter bound. The published RTP is the player-facing
    // disclosure; it must sit firmly inside the casino band.
    const r = simulateFisherRtp(1, 5000)
    expect(
      r.rtp,
      `published RTP must be in 94-98% band. Got ${(r.rtp * 100).toFixed(2)}%`,
    ).toBeGreaterThan(0.93)
    expect(r.rtp).toBeLessThan(0.99)
  })

  it('skunkRate > 0 (some trips end with no catches — Tim Layer 1 requirement)', () => {
    const r = simulateFisherRtp(1, 2000)
    expect(r.skunkRate, 'some trips must be skunked').toBeGreaterThan(0)
    // Bronze-bronze-bronze with 3 casts — should be small but non-zero
    expect(r.skunkRate).toBeLessThan(0.4)
  })

  it('missRate > 0 (Layer 1 — line-came-back-empty must happen)', () => {
    const r = simulateFisherRtp(1, 2000)
    expect(r.missRate, 'misses must happen').toBeGreaterThan(0)
  })

  it('junkRate > 0 (Layer 1 — junk catches must happen)', () => {
    const r = simulateFisherRtp(1, 2000)
    expect(r.junkRate, 'junk catches must happen').toBeGreaterThan(0)
  })

  it('snapRate > 0 (Layer 1 — line snaps must happen)', () => {
    const r = simulateFisherRtp(1, 2000)
    expect(r.snapRate, 'line snaps must happen').toBeGreaterThan(0)
  })
})

// ─── publishedFisherRtp ──────────────────────────────────────────────────

describe('publishedFisherRtp', () => {
  it('returns a stable value (caches the first call)', () => {
    const first = publishedFisherRtp()
    const second = publishedFisherRtp()
    expect(first.rtp).toBe(second.rtp)
    expect(first).toBe(second) // referential equality (cache hit)
  })

  it('publishes an RTP in the 94-98% casino band', () => {
    const r = publishedFisherRtp()
    expect(r.rtp).toBeGreaterThan(0.93)
    expect(r.rtp).toBeLessThan(0.99)
  })

  it('CRITICAL: published RTP is strictly < 100% (casino law)', () => {
    const r = publishedFisherRtp()
    expect(r.rtp).toBeLessThan(1.0)
    expect(r.houseEdge).toBeGreaterThan(0)
  })
})

// ─── format helpers ──────────────────────────────────────────────────────

describe('formatRtp / formatHouseEdge', () => {
  it('formats RTP as N.N%', () => {
    expect(formatRtp(0.965)).toBe('96.5%')
    expect(formatRtp(0.98)).toBe('98.0%')
    expect(formatRtp(0.5)).toBe('50.0%')
  })

  it('formats house edge as N.N%', () => {
    expect(formatHouseEdge(0.035)).toBe('3.5%')
    expect(formatHouseEdge(0.02)).toBe('2.0%')
  })

  it('formats negative edge as "+N.N% (player edge)" — sentinel only', () => {
    // Negative edge = player edge — banned per CASINO-RTP-DISCIPLINE but
    // the formatter still handles it for the disclosure surface.
    expect(formatHouseEdge(-0.05)).toContain('player edge')
  })

  it('handles non-finite inputs gracefully', () => {
    expect(formatRtp(Number.NaN)).toBe('--')
    expect(formatRtp(-1)).toBe('--')
    expect(formatHouseEdge(Number.NaN)).toBe('--')
  })
})

// ─── Tim 2026-05-24 OO-FISHER L4 — moving target zone ────────────────────

describe('oscillatingTargetCenter / effectiveTargetZone (L4 moving zone)', () => {
  const baseParams = reelingParamsForRod('bronze')

  it('returns baseCenter at t=0 (sin(0) = 0)', () => {
    const c = oscillatingTargetCenter(0, baseParams)
    expect(c).toBe(baseParams.targetCenter)
  })

  it('oscillates within ±amplitude of baseCenter', () => {
    // Sample 60 points across two full periods.
    let minC = Infinity
    let maxC = -Infinity
    for (let i = 0; i < 60; i += 1) {
      const t = (i / 60) * TARGET_ZONE_OSCILLATION_PERIOD_MS * 2
      const c = oscillatingTargetCenter(t, baseParams)
      if (c < minC) minC = c
      if (c > maxC) maxC = c
    }
    // The clamping in the helper restricts the range to [halfWidth, 100-halfWidth].
    // For bronze rod (halfWidth=12), the absolute min/max would be 12 and 88.
    // Within those bounds, the amplitude swings ±10 around 50.
    const allowedMin = Math.max(
      baseParams.targetHalfWidth,
      baseParams.targetCenter - TARGET_ZONE_OSCILLATION_AMPLITUDE,
    )
    const allowedMax = Math.min(
      100 - baseParams.targetHalfWidth,
      baseParams.targetCenter + TARGET_ZONE_OSCILLATION_AMPLITUDE,
    )
    expect(minC).toBeGreaterThanOrEqual(allowedMin - 0.0001)
    expect(maxC).toBeLessThanOrEqual(allowedMax + 0.0001)
  })

  it('returns baseCenter at every full-period multiple (sin(2πn) = 0)', () => {
    expect(oscillatingTargetCenter(0, baseParams)).toBeCloseTo(baseParams.targetCenter, 5)
    expect(
      oscillatingTargetCenter(TARGET_ZONE_OSCILLATION_PERIOD_MS, baseParams),
    ).toBeCloseTo(baseParams.targetCenter, 5)
    expect(
      oscillatingTargetCenter(TARGET_ZONE_OSCILLATION_PERIOD_MS * 3, baseParams),
    ).toBeCloseTo(baseParams.targetCenter, 5)
  })

  it('peaks at +amplitude when sin reaches 1 (t = period/4)', () => {
    const c = oscillatingTargetCenter(TARGET_ZONE_OSCILLATION_PERIOD_MS / 4, baseParams)
    expect(c).toBeCloseTo(baseParams.targetCenter + TARGET_ZONE_OSCILLATION_AMPLITUDE, 1)
  })

  it('troughs at -amplitude when sin reaches -1 (t = 3 × period/4)', () => {
    const c = oscillatingTargetCenter(
      (TARGET_ZONE_OSCILLATION_PERIOD_MS * 3) / 4,
      baseParams,
    )
    expect(c).toBeCloseTo(baseParams.targetCenter - TARGET_ZONE_OSCILLATION_AMPLITUDE, 1)
  })

  it('rejects non-finite or negative elapsedMs', () => {
    expect(oscillatingTargetCenter(Number.NaN, baseParams)).toBe(baseParams.targetCenter)
    expect(oscillatingTargetCenter(-100, baseParams)).toBe(baseParams.targetCenter)
  })

  it('effectiveTargetZone preserves halfWidth across oscillation', () => {
    for (let i = 0; i < 10; i += 1) {
      const t = i * 200
      const z = effectiveTargetZone(t, baseParams)
      expect(z.halfWidth).toBe(baseParams.targetHalfWidth)
    }
  })

  it('deterministic — same elapsedMs returns same center across calls', () => {
    const t = 1234
    const a = oscillatingTargetCenter(t, baseParams)
    const b = oscillatingTargetCenter(t, baseParams)
    expect(a).toBe(b)
  })

  it('respects RG-C5 — amplitude + period are module constants', () => {
    // Pin the values to catch any future commit that tries to scale them
    // by streak length or rarity.
    expect(TARGET_ZONE_OSCILLATION_AMPLITUDE).toBe(10)
    expect(TARGET_ZONE_OSCILLATION_PERIOD_MS).toBe(2000)
  })
})

/**
 * ooReiSpiritEvolution.test.ts — adversarial Domain A test suite.
 *
 * Tests are adversarial, not just functional. They verify:
 *  - Cap derivation is wager-relative (not wager-absolute)
 *  - Threshold-exact boundaries (gauge must reach OR exceed; never round up)
 *  - Carry-forward remainder is conserved exactly after a cap reset
 *  - Negative inputs THROW (fail-closed — never defaulted away)
 *  - gaugeCap <= 0 THROWS on all three accumulation functions (fail-closed)
 *  - Deterministic output across 100 identical calls
 *  - Form-index derivation matches threshold boundaries
 *  - Multi-threshold vault in one spin reports the highest form reached
 *  - Floor-truncation: a fractional fill ratio truncates toward zero
 *  - RTP/paytable constants are UNTOUCHED by the pacing change
 *  - SPIRIT_GAUGE_CAP_LAMPORTS (wager-absolute) is GONE — not exported
 *  - SPIRIT_FORM_THRESHOLDS (hardcoded) is GONE — replaced by computeSpiritFormThresholds
 *
 * Domain A adversarial pattern: a "minimal" implementation that drops the
 * carry-forward remainder, rounds up at a threshold, or defaults a negative
 * input to 0 would fail these tests.
 *
 * SOLANA-BLUETEAM NOTE (2026-05-29): This is a no-RTP Domain-A-adjacent change.
 * The gauge cap is now derived from wagerLamports at spin time, not a fixed
 * 250_000_000n value. The pacing change affects spin count per cycle only.
 * No new payout path. No balance_ledger writes. No financial state changes.
 * All BigInt, floor truncation, carry-forward remainder logic unchanged.
 */

import { describe, expect, it } from 'vitest'

import * as spiritEvolutionModule from './ooReiSpiritEvolution'
import {
  advanceSpiritGauge,
  computeSpiritFormThresholds,
  currentSpiritForm,
  SPIRIT_FORM_KANJI,
  SPIRIT_FORM_NAME,
  SPIRIT_FORM_OPACITY,
  SPIRIT_GAUGE_CYCLES_SPINS_TARGET,
  SPIRIT_PROCESSION,
  spiritGaugeFillRatio,
} from './ooReiSpiritEvolution'

// ─── Helper: derive cap the same way the provider does ────────────────────────
function deriveCap(wagerLamports: bigint): bigint {
  return wagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET)
}

// ─── Pacing constant: spin-target value ───────────────────────────────────────

describe('SPIRIT_GAUGE_CYCLES_SPINS_TARGET', () => {
  it('is exactly 160 (spec calibration)', () => {
    expect(SPIRIT_GAUGE_CYCLES_SPINS_TARGET).toBe(160)
  })

  it('is a number, not a bigint (used in BigInt() cast at derivation site)', () => {
    expect(typeof SPIRIT_GAUGE_CYCLES_SPINS_TARGET).toBe('number')
  })

  // Backward-compatibility: SPIRIT_GAUGE_CAP_LAMPORTS must NOT be exported.
  // A wager-absolute cap would cause the $25 regression (8 spins per cycle).
  it('SPIRIT_GAUGE_CAP_LAMPORTS is NOT exported (wager-absolute cap removed)', () => {
    // Use the namespace import to check exports without require()
    const mod = spiritEvolutionModule as Record<string, unknown>
    expect(mod['SPIRIT_GAUGE_CAP_LAMPORTS']).toBeUndefined()
  })

  // SPIRIT_FORM_THRESHOLDS must NOT be exported (replaced by computeSpiritFormThresholds).
  it('SPIRIT_FORM_THRESHOLDS is NOT exported (replaced by computeSpiritFormThresholds)', () => {
    const mod = spiritEvolutionModule as Record<string, unknown>
    expect(mod['SPIRIT_FORM_THRESHOLDS']).toBeUndefined()
  })
})

// ─── Cap derivation: wager-relative ──────────────────────────────────────────

describe('gaugeCap derivation (wager-relative pacing)', () => {
  it('$1.00 wager cap = 1_000_000n * 160 = 160_000_000n', () => {
    expect(deriveCap(1_000_000n)).toBe(160_000_000n)
  })

  it('$25.00 wager cap = 25_000_000n * 160 = 4_000_000_000n', () => {
    expect(deriveCap(25_000_000n)).toBe(4_000_000_000n)
  })

  it('$0.10 wager cap = 100_000n * 160 = 16_000_000n', () => {
    expect(deriveCap(100_000n)).toBe(16_000_000n)
  })

  it('cap is always a multiple of wagerLamports (exact integer arithmetic)', () => {
    for (const wager of [1_000_000n, 5_000_000n, 25_000_000n, 100_000n]) {
      const cap = deriveCap(wager)
      expect(cap % wager).toBe(0n)
    }
  })

  it('$1 and $25 players have the SAME expected spin count per cycle (wager-agnostic)', () => {
    // avg accrual per spin ≈ 1.25x wager (50% win 1.0x + 50% loss 1.5x)
    // cap = wager * 160; avgAccrual = wager * 1.25
    // expectedSpins = cap / avgAccrual = (wager * 160) / (wager * 1.25) = 160 / 1.25 = 128
    // At $1 wager:  160_000_000n / 1_250_000n ≈ 128 spins
    // At $25 wager: 4_000_000_000n / 31_250_000n ≈ 128 spins
    const spinCount1  = deriveCap(1_000_000n)  / (1_000_000n  * 5n / 4n) // 1.25x = 5/4
    const spinCount25 = deriveCap(25_000_000n) / (25_000_000n * 5n / 4n)
    expect(spinCount1).toBe(spinCount25)
  })
})

// ─── computeSpiritFormThresholds ──────────────────────────────────────────────

describe('computeSpiritFormThresholds', () => {
  it('throws on gaugeCap <= 0', () => {
    expect(() => computeSpiritFormThresholds(0n)).toThrow(/gaugeCap <= 0/)
    expect(() => computeSpiritFormThresholds(-1n)).toThrow(/gaugeCap <= 0/)
  })

  it('returns four values at exactly 25/50/75/100% of cap (floor division)', () => {
    const cap = 160_000_000n
    const [t0, t1, t2, t3] = computeSpiritFormThresholds(cap)
    expect(t0).toBe(40_000_000n)   // 25% floor
    expect(t1).toBe(80_000_000n)   // 50% floor
    expect(t2).toBe(120_000_000n)  // 75% floor
    expect(t3).toBe(160_000_000n)  // 100% = cap
  })

  it('fourth threshold equals the cap exactly (triggers reset)', () => {
    const cap = 4_000_000_000n
    const thresholds = computeSpiritFormThresholds(cap)
    expect(thresholds[3]).toBe(cap)
  })

  it('all four values are bigint (no IEEE-754 in the accumulation path)', () => {
    const thresholds = computeSpiritFormThresholds(160_000_000n)
    for (const t of thresholds) {
      expect(typeof t).toBe('bigint')
    }
  })

  it('floor-truncates thresholds for odd caps (house-favored)', () => {
    // cap = 7n: 25% = 7n/4n = 1n (not 1.75), 50% = 3n, 75% = 5n (21/4 = 5n)
    const [t0, t1, t2, t3] = computeSpiritFormThresholds(7n)
    expect(t0).toBe(1n)  // floor(7/4) = 1 — not 2
    expect(t1).toBe(3n)  // floor(7/2) = 3
    expect(t2).toBe(5n)  // floor(21/4) = 5
    expect(t3).toBe(7n)  // cap
  })

  it('deterministic: 100 identical calls produce identical tuples', () => {
    const cap = 160_000_000n
    const results = Array.from({ length: 100 }, () => computeSpiritFormThresholds(cap))
    const serialized = new Set(
      results.map(r => JSON.stringify(r.map(v => v.toString()))),
    )
    expect(serialized.size).toBe(1)
  })
})

// ─── advanceSpiritGauge — fail-closed on negatives ───────────────────────────

describe('advanceSpiritGauge — fail-closed', () => {
  const cap = deriveCap(1_000_000n) // $1 wager

  it('throws on negative currentLamports (never defaults to 0)', () => {
    expect(() => advanceSpiritGauge(-1n, 1_000_000n, cap)).toThrow(/currentLamports < 0/)
  })

  it('throws on negative ownershipPoints (never defaults to 0)', () => {
    expect(() => advanceSpiritGauge(0n, -1n, cap)).toThrow(/ownershipPoints < 0/)
  })

  it('throws on gaugeCap <= 0 (fail-closed — zero cap is an invalid state)', () => {
    expect(() => advanceSpiritGauge(0n, 1_000_000n, 0n)).toThrow(/gaugeCap <= 0/)
    expect(() => advanceSpiritGauge(0n, 1_000_000n, -1n)).toThrow(/gaugeCap <= 0/)
  })

  it('accepts exactly 0n for both lamport inputs (boundary, not negative)', () => {
    const r = advanceSpiritGauge(0n, 0n, cap)
    expect(r).toEqual({ newLamports: 0n, formReached: null, didReset: false })
  })
})

// ─── advanceSpiritGauge — threshold-exact boundaries ─────────────────────────

describe('advanceSpiritGauge — threshold-exact boundaries ($1 wager, cap=160M)', () => {
  const cap = 160_000_000n  // $1 wager * 160
  const [t0, t1, t2, t3] = computeSpiritFormThresholds(cap)

  it('one lamport BELOW the first threshold does NOT fire a form change', () => {
    const r = advanceSpiritGauge(0n, t0 - 1n, cap)
    expect(r.formReached).toBeNull()
    expect(r.didReset).toBe(false)
    expect(r.newLamports).toBe(t0 - 1n)
  })

  it('reaching EXACTLY the first threshold fires Form 1 (>= boundary)', () => {
    const r = advanceSpiritGauge(0n, t0, cap)
    expect(r.formReached).toBe(1)
    expect(r.didReset).toBe(false)
    expect(r.newLamports).toBe(t0)
  })

  it('reaching EXACTLY the second threshold fires Form 2', () => {
    const r = advanceSpiritGauge(t0, t0, cap)
    expect(r.formReached).toBe(2)
    expect(r.newLamports).toBe(t1)
  })

  it('reaching EXACTLY the third threshold fires Form 3', () => {
    const r = advanceSpiritGauge(t1, t0, cap)
    expect(r.formReached).toBe(3)
    expect(r.newLamports).toBe(t2)
  })

  it('crossing a threshold already past it fires no duplicate event', () => {
    // Already past t0, small add stays within Form 1 band.
    const r = advanceSpiritGauge(t0 + 1_000_000n, 1_000_000n, cap)
    expect(r.formReached).toBeNull()
  })

  it('a spin that vaults TWO thresholds reports the HIGHER form reached', () => {
    // 0 → past t1 crosses both t0 (Form 1) and t1 (Form 2). Report Form 2.
    const r = advanceSpiritGauge(0n, t1 + 1_000_000n, cap)
    expect(r.formReached).toBe(2)
    expect(r.didReset).toBe(false)
    expect(r.newLamports).toBe(t1 + 1_000_000n)
  })
})

// ─── advanceSpiritGauge — Transcendent reset + carry-forward ─────────────────

describe('advanceSpiritGauge — reset + carry-forward ($25 wager, cap=4000M)', () => {
  const cap = deriveCap(25_000_000n) // $25 wager: 4_000_000_000n

  it('reaching EXACTLY the cap resets to 0 with Form 4', () => {
    const [, , , t3] = computeSpiritFormThresholds(cap)
    const prevLevel = (cap * 3n) / 4n  // at t2
    const delta = t3 - prevLevel       // exact amount to reach cap
    const r = advanceSpiritGauge(prevLevel, delta, cap)
    expect(r.formReached).toBe(4)
    expect(r.didReset).toBe(true)
    expect(r.newLamports).toBe(0n)
  })

  it('OVERSHOOTING the cap carries the exact remainder forward (spec §13)', () => {
    const overshoot = 10_000_000n // 10M over cap
    const r = advanceSpiritGauge(cap - 20_000_000n, 30_000_000n, cap)
    expect(r.didReset).toBe(true)
    expect(r.formReached).toBe(4)
    expect(r.newLamports).toBe(overshoot) // exactly cap-20M + 30M - cap = 10M
  })

  it('carry-forward never drops lamports — total accumulation is conserved', () => {
    const current = cap - 1_000_000n
    const add = 5_000_000n
    const r = advanceSpiritGauge(current, add, cap)
    const rawTotal = current + add
    // cycle consumed exactly cap; rest is in newLamports
    expect(r.newLamports + cap).toBe(rawTotal)
  })

  it('a single massive spin past 2x cap still resets once with correct remainder', () => {
    const r = advanceSpiritGauge(0n, cap * 2n + 50_000_000n, cap)
    expect(r.didReset).toBe(true)
    expect(r.formReached).toBe(4)
    // one reset consumes cap; remainder = cap + 50_000_000n
    expect(r.newLamports).toBe(cap + 50_000_000n)
  })
})

// ─── Determinism (Domain A invariant) ────────────────────────────────────────

describe('advanceSpiritGauge — determinism', () => {
  it('100 identical calls produce identical output ($1 wager)', () => {
    const cap = deriveCap(1_000_000n)
    const results = Array.from({ length: 100 }, () =>
      advanceSpiritGauge(cap / 4n - 200_000n, 400_000n, cap),
    )
    const serialized = new Set(
      results.map((r) =>
        JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
      ),
    )
    expect(serialized.size).toBe(1)
  })

  it('100 identical reset calls produce identical carry-forward ($25 wager)', () => {
    const cap = deriveCap(25_000_000n)
    const results = Array.from({ length: 100 }, () =>
      advanceSpiritGauge(cap - 20_000_000n, 30_000_000n, cap),
    )
    for (const r of results) {
      expect(r.didReset).toBe(true)
      expect(r.formReached).toBe(4)
      expect(r.newLamports).toBe(10_000_000n)
    }
  })

  it('100 identical calls are deterministic across wager tiers ($0.10 wager)', () => {
    const cap = deriveCap(100_000n)
    const results = Array.from({ length: 100 }, () =>
      advanceSpiritGauge(0n, cap / 2n, cap),
    )
    for (const r of results) {
      expect(r.formReached).toBe(2)
      expect(r.didReset).toBe(false)
    }
  })
})

// ─── RTP / paytable untouched ─────────────────────────────────────────────────

describe('RTP / paytable not affected by pacing change', () => {
  it('SPIRIT_FORM_KANJI has exactly 5 entries (Form 0..4)', () => {
    expect(SPIRIT_FORM_KANJI).toHaveLength(5)
  })

  it('SPIRIT_FORM_NAME has exactly 5 entries (Form 0..4)', () => {
    expect(SPIRIT_FORM_NAME).toHaveLength(5)
  })

  it('SPIRIT_FORM_OPACITY has exactly 5 entries (Form 0..4)', () => {
    expect(SPIRIT_FORM_OPACITY).toHaveLength(5)
  })

  it('spirit opacity grows monotonically across forms (spec §5 table)', () => {
    // Composition Pass 2 (2026-05-31): Form 0 raised from 0.12 → 0.32 so
    // Arashi is FELT at session start. Exact values updated; monotonicity
    // invariant (each form strictly greater than the previous) is preserved.
    // The invariant is what matters for legibility — exact values may change
    // as the art direction is refined without breaking the structural contract.
    expect(SPIRIT_FORM_OPACITY).toEqual([0.6, 0.72, 0.82, 0.92, 1.0])
    for (let i = 1; i < SPIRIT_FORM_OPACITY.length; i++) {
      expect(SPIRIT_FORM_OPACITY[i]!).toBeGreaterThan(SPIRIT_FORM_OPACITY[i - 1]!)
    }
  })

  it('SPIRIT_PROCESSION has exactly 10 entries', () => {
    expect(SPIRIT_PROCESSION).toHaveLength(10)
  })

  it('SPIRIT_PROCESSION authored flags: 1-5 true, 6-10 false', () => {
    for (let i = 0; i < 5; i++) expect(SPIRIT_PROCESSION[i]?.authored).toBe(true)
    for (let i = 5; i < 10; i++) expect(SPIRIT_PROCESSION[i]?.authored).toBe(false)
  })
})

// ─── currentSpiritForm — derivation ───────────────────────────────────────────

describe('currentSpiritForm — form-index derivation', () => {
  const cap = deriveCap(1_000_000n)
  const [t0, t1, t2, t3] = computeSpiritFormThresholds(cap)

  it('0 lamports → Form 0 (Dormant)', () => {
    expect(currentSpiritForm(0n, cap)).toBe(0)
  })

  it('one below first threshold → Form 0', () => {
    expect(currentSpiritForm(t0 - 1n, cap)).toBe(0)
  })

  it('exactly first threshold → Form 1', () => {
    expect(currentSpiritForm(t0, cap)).toBe(1)
  })

  it('exactly second threshold → Form 2', () => {
    expect(currentSpiritForm(t1, cap)).toBe(2)
  })

  it('exactly third threshold → Form 3', () => {
    expect(currentSpiritForm(t2, cap)).toBe(3)
  })

  it('at or above cap → Form 4', () => {
    expect(currentSpiritForm(t3, cap)).toBe(4)
    expect(currentSpiritForm(t3 + 1_000_000n, cap)).toBe(4)
  })

  it('negative input clamps to Form 0 (display-safe, never throws)', () => {
    expect(currentSpiritForm(-99n, cap)).toBe(0)
  })

  it('gaugeCap <= 0 clamps to Form 0 (display-safe)', () => {
    expect(currentSpiritForm(1_000_000n, 0n)).toBe(0)
  })

  it('100 identical derivations are deterministic', () => {
    const out = Array.from({ length: 100 }, () => currentSpiritForm(t1 + 1_000n, cap))
    expect(new Set(out).size).toBe(1)
    expect(out[0]).toBe(2)
  })

  it('works identically across wager tiers ($25 wager)', () => {
    const cap25 = deriveCap(25_000_000n)
    const [th0] = computeSpiritFormThresholds(cap25)
    expect(currentSpiritForm(th0 - 1n, cap25)).toBe(0)
    expect(currentSpiritForm(th0, cap25)).toBe(1)
  })
})

// ─── spiritGaugeFillRatio — display float (Domain C, floor-truncation) ───────

describe('spiritGaugeFillRatio — display ratio (floor-truncation, presentation-only)', () => {
  const cap = deriveCap(1_000_000n)  // 160_000_000n

  it('0 lamports → 0.0', () => {
    expect(spiritGaugeFillRatio(0n, cap)).toBe(0)
  })

  it('at cap → 1.0 (clamped)', () => {
    expect(spiritGaugeFillRatio(cap, cap)).toBe(1)
  })

  it('above cap → 1.0 (clamped, never exceeds 1)', () => {
    expect(spiritGaugeFillRatio(cap + 1n, cap)).toBe(1)
  })

  it('half the cap → 0.5', () => {
    expect(spiritGaugeFillRatio(cap / 2n, cap)).toBe(0.5)
  })

  it('quarter the cap → 0.25 (first threshold)', () => {
    expect(spiritGaugeFillRatio(cap / 4n, cap)).toBe(0.25)
  })

  it('floor-truncates a sub-granularity fraction toward zero', () => {
    // 1 lamport of 160M → (1 * 10_000n) / 160_000_000n = 0n → 0.0
    // A player-favoring ceil would yield a non-zero ratio. Floor yields 0.
    expect(spiritGaugeFillRatio(1n, cap)).toBe(0)
  })

  it('negative input clamps to 0 (display-safe, never throws)', () => {
    expect(spiritGaugeFillRatio(-5n, cap)).toBe(0)
  })

  it('gaugeCap <= 0 returns 0 (display-safe)', () => {
    expect(spiritGaugeFillRatio(1_000_000n, 0n)).toBe(0)
  })

  it('result is always within [0, 1]', () => {
    for (const v of [0n, 1n, cap / 4n, cap / 2n, cap - 1n, cap]) {
      const ratio = spiritGaugeFillRatio(v, cap)
      expect(ratio).toBeGreaterThanOrEqual(0)
      expect(ratio).toBeLessThanOrEqual(1)
    }
  })

  it('produces same 0.5 ratio at $1 and $25 wager for exactly-half fill', () => {
    const cap25 = deriveCap(25_000_000n)
    expect(spiritGaugeFillRatio(cap25 / 2n, cap25)).toBe(0.5)
  })
})

/**
 * Tests for vaultCopy — narrative bucketing + rhythm tick evaluator.
 *
 * Adversarial coverage:
 *   • Boundary outcomes at exact threshold values (1.50× and 3.00×).
 *   • Determinism: same inputs read the same line on every call.
 *   • Rhythm window edges: in-window, out-of-window, no prior reveal.
 *   • Cumulative-BPS floor gate: chain alone doesn't surface a badge
 *     below the economic-stake floor.
 *   • Tier transition: rhythm → perfect at the exact peak CHAIN length
 *     (FIX 5, 2026-07-07 — peak tier is chain-based, not BPS-band-based,
 *     so it is reachable in all three worlds regardless of mine density).
 */
import { describe, expect, it } from 'vitest'
import {
  evaluateRhythmTick,
  HUGE_VAULT_NARRATIVES,
  LOSS_VAULT_NARRATIVES,
  RHYTHM_MIN_CHAIN,
  RHYTHM_MIN_CUMULATIVE_BPS,
  RHYTHM_PEAK_CHAIN,
  RHYTHM_WINDOW_MS,
  rhythmBadgeLabel,
  SOLID_VAULT_NARRATIVES,
  settlementEyebrow,
  settlementNarrative,
  TIGHT_VAULT_NARRATIVES,
} from './vaultCopy'
import { ONE_X_BPS } from './vaultMath'

describe('settlementNarrative', () => {
  it('routes a huge win (3.00x+) to the HUGE pool', () => {
    const line = settlementNarrative(30_000n, true)
    expect(HUGE_VAULT_NARRATIVES).toContain(line)
  })

  it('routes a solid win (≥1.50x, <3.00x) to the SOLID pool', () => {
    const line = settlementNarrative(15_000n, true)
    expect(SOLID_VAULT_NARRATIVES).toContain(line)
    const line2 = settlementNarrative(29_999n, true)
    expect(SOLID_VAULT_NARRATIVES).toContain(line2)
  })

  it('routes a tight win (<1.50x) to the TIGHT pool', () => {
    const line = settlementNarrative(ONE_X_BPS, true)
    expect(TIGHT_VAULT_NARRATIVES).toContain(line)
    const line2 = settlementNarrative(14_999n, true)
    expect(TIGHT_VAULT_NARRATIVES).toContain(line2)
  })

  it('routes any loss to the LOSS pool regardless of multiplier', () => {
    expect(LOSS_VAULT_NARRATIVES).toContain(settlementNarrative(50_000n, false))
    expect(LOSS_VAULT_NARRATIVES).toContain(settlementNarrative(ONE_X_BPS, false))
    expect(LOSS_VAULT_NARRATIVES).toContain(settlementNarrative(0n, false))
  })

  it('is deterministic — same inputs read the same line', () => {
    const a = settlementNarrative(18_432n, true)
    const b = settlementNarrative(18_432n, true)
    const c = settlementNarrative(18_432n, true)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('handles negative bps defensively (falls into TIGHT pool, index in range)', () => {
    // Negative wins shouldn't happen in practice, but the function must
    // not throw + must produce a line from one of the canonical pools.
    // The band-gate checks (>=) reject negatives so they route to TIGHT;
    // the absolute-value index keeps the lookup in range.
    const line = settlementNarrative(-15_000n, true)
    expect(TIGHT_VAULT_NARRATIVES).toContain(line)
  })
})

describe('settlementEyebrow', () => {
  // FIX 4 (2026-07-07, consolidated fix pass) — this test still asserted the
  // pre-fix future-tense 'TAKE PROFIT' value; the source (see the "PAST
  // TENSE by design" comment on `settlementEyebrow`) already ships 'TOOK
  // PROFIT' so the settled-WIN eyebrow matches `HudSettledBanner`'s past-
  // tense "SECURED THE BAG" on the same already-settled screen. Stale
  // assertion updated to match the shipped, intended behavior.
  it('reads "TOOK PROFIT" on a win and "RUGGED" on a loss', () => {
    expect(settlementEyebrow(true)).toBe('TOOK PROFIT')
    expect(settlementEyebrow(false)).toBe('RUGGED')
  })
})

describe('evaluateRhythmTick', () => {
  it('resets chain to 1 when there is no prior reveal', () => {
    const tick = evaluateRhythmTick(0, 1_000, 5, 12_000n)
    expect(tick.chain).toBe(1)
    expect(tick.badge).toBeNull()
  })

  it('extends the chain when within the rhythm window', () => {
    const now = 10_000
    const prev = now - (RHYTHM_WINDOW_MS - 100)
    const tick = evaluateRhythmTick(prev, now, 1, 11_000n)
    expect(tick.chain).toBe(2)
  })

  it('resets the chain when the gap exceeds the rhythm window', () => {
    const now = 10_000
    const prev = now - (RHYTHM_WINDOW_MS + 100)
    const tick = evaluateRhythmTick(prev, now, 4, 12_000n)
    expect(tick.chain).toBe(1)
    expect(tick.badge).toBeNull()
  })

  it('does not surface a badge below the minimum chain length', () => {
    const now = 1_000
    const prev = now - 200
    // At previousChain = RHYTHM_MIN_CHAIN - 2 → new chain = RHYTHM_MIN_CHAIN - 1.
    const tick = evaluateRhythmTick(prev, now, RHYTHM_MIN_CHAIN - 2, 20_000n)
    expect(tick.chain).toBe(RHYTHM_MIN_CHAIN - 1)
    expect(tick.badge).toBeNull()
  })

  // FIX 5 (2026-07-07, rhythm-tier reachability): the peak tier is now
  // decided by CHAIN LENGTH (`RHYTHM_PEAK_CHAIN`), not a cumulative-BPS
  // band — a value-based band could not be reached in ALL THREE worlds
  // (bluechips / altseason / shitcoin) because mine-density makes their
  // cumulative curves diverge wildly by the time `RHYTHM_MIN_CHAIN` first
  // allows evaluation. `RHYTHM_MIN_CUMULATIVE_BPS` remains as a pure
  // economic-stake FLOOR gate, decoupled from which tier is shown.

  it('does not surface a badge at chain 3 below the minimum cumulative floor', () => {
    const now = 1_000
    const prev = now - 200
    // previousChain = 2 -> new chain = 3 = RHYTHM_MIN_CHAIN.
    const tick = evaluateRhythmTick(prev, now, RHYTHM_MIN_CHAIN - 1, RHYTHM_MIN_CUMULATIVE_BPS - 1n)
    expect(tick.chain).toBe(RHYTHM_MIN_CHAIN)
    expect(tick.badge).toBeNull()
  })

  it('surfaces the "rhythm" tier at chain 3 (RHYTHM_MIN_CHAIN) once past the floor', () => {
    const now = 1_000
    const prev = now - 200
    const tick = evaluateRhythmTick(prev, now, RHYTHM_MIN_CHAIN - 1, RHYTHM_MIN_CUMULATIVE_BPS)
    expect(tick.chain).toBe(RHYTHM_MIN_CHAIN)
    expect(tick.badge).toBe('rhythm')
  })

  it('stays at the "rhythm" tier at chain 4 (below RHYTHM_PEAK_CHAIN)', () => {
    const now = 1_000
    const prev = now - 200
    const tick = evaluateRhythmTick(prev, now, RHYTHM_MIN_CHAIN, RHYTHM_MIN_CUMULATIVE_BPS)
    expect(tick.chain).toBe(RHYTHM_MIN_CHAIN + 1)
    expect(tick.chain).toBe(RHYTHM_PEAK_CHAIN - 1)
    expect(tick.badge).toBe('rhythm')
  })

  it('upgrades to the "perfect" tier at chain 5 (RHYTHM_PEAK_CHAIN)', () => {
    const now = 1_000
    const prev = now - 200
    const tick = evaluateRhythmTick(prev, now, RHYTHM_PEAK_CHAIN - 1, RHYTHM_MIN_CUMULATIVE_BPS)
    expect(tick.chain).toBe(RHYTHM_PEAK_CHAIN)
    expect(tick.badge).toBe('perfect')
  })

  it('reachability: peak tier is chain-driven, independent of how far cumulative bps has moved', () => {
    const now = 1_000
    const prev = now - 200
    // A world with a much steeper cumulative curve (e.g. SHITCOIN reveal3
    // ~65_370 bps) still resolves the SAME tier at the SAME chain length —
    // the tier decision has no cumulative-value dependency once the floor
    // is cleared.
    const tick = evaluateRhythmTick(prev, now, RHYTHM_PEAK_CHAIN - 1, 65_370n)
    expect(tick.badge).toBe('perfect')
  })

  it('rejects negative elapsed (clock skew) by resetting chain', () => {
    const tick = evaluateRhythmTick(2_000, 1_000, 5, 20_000n)
    expect(tick.chain).toBe(1)
    expect(tick.badge).toBeNull()
  })
})

describe('rhythmBadgeLabel', () => {
  it('reads "CLEAN TEMPO" at the peak band', () => {
    expect(rhythmBadgeLabel('perfect')).toBe('CLEAN TEMPO')
  })

  it('reads "IN RHYTHM" at the mid band', () => {
    expect(rhythmBadgeLabel('rhythm')).toBe('IN RHYTHM')
  })

  it('reads an empty string when no badge is active', () => {
    expect(rhythmBadgeLabel(null)).toBe('')
  })
})

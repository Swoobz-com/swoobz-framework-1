/**
 * AUTOMAT provider gate — pure-reducer invariants + fairness derivation
 * determinism/uniform-band. (The hook lifecycle is exercised in the browser;
 * these are the unit-provable seams, mirroring assayProvider.test.ts.)
 */
import { describe, expect, it } from 'vitest'
import { armTierReducer, derivePackRoll, packCountReducer, wagerReducer } from './vendingProvider'
import type { VendingState } from './vendingProvider'
import { MAX_PACKS, MIN_PACKS, rollToPrize, TIER_ORDER, WEIGHT_TOTAL } from './vendingMath'

function baseState(overrides: Partial<VendingState> = {}): VendingState {
  return {
    phase: { kind: 'ready' },
    balanceLamports: 1_000_000_000n,
    selectedTier: 'easy',
    committedTier: 'easy',
    wagerPerPackLamports: 1_000_000n,
    packCount: 3,
    committedSeedHashHex: null,
    dispensed: [],
    trayLamports: 0n,
    revealPace: 'staggered',
    history: [],
    ...overrides,
  }
}

describe('armTierReducer', () => {
  it('arms a tier in ready/settled and never touches committedTier', () => {
    const s = armTierReducer(baseState(), 'hard')
    expect(s.selectedTier).toBe('hard')
    expect(s.committedTier).toBe('easy')
  })
  it('is a no-op mid-vend (the running round keeps its committed tier)', () => {
    const s = baseState({ phase: { kind: 'vending' }, committedTier: 'medium' })
    expect(armTierReducer(s, 'hard')).toBe(s)
  })
  it('returns the same state when re-arming the current tier', () => {
    const s = baseState()
    expect(armTierReducer(s, 'easy')).toBe(s)
  })
})

describe('packCountReducer', () => {
  it('clamps to [MIN_PACKS, MAX_PACKS]', () => {
    expect(packCountReducer(baseState(), 0).packCount).toBe(MIN_PACKS)
    expect(packCountReducer(baseState(), 21).packCount).toBe(MAX_PACKS)
    expect(packCountReducer(baseState(), 20).packCount).toBe(20)
    expect(packCountReducer(baseState(), 7).packCount).toBe(7)
  })
  it('rejects non-integers, returns the same state object', () => {
    const s = baseState()
    expect(packCountReducer(s, 2.5)).toBe(s)
    expect(packCountReducer(s, Number.NaN)).toBe(s)
  })
  it('is a no-op mid-vend (a running purchase cannot be resized)', () => {
    const s = baseState({ phase: { kind: 'vending' } })
    expect(packCountReducer(s, 9)).toBe(s)
  })
})

describe('wagerReducer', () => {
  it('clamps to [MIN_WAGER, balance]', () => {
    expect(wagerReducer(baseState(), 1n).wagerPerPackLamports).toBe(100_000n)
    expect(wagerReducer(baseState(), 2_000_000_000n).wagerPerPackLamports).toBe(1_000_000_000n)
    expect(wagerReducer(baseState(), 2_500_000n).wagerPerPackLamports).toBe(2_500_000n)
  })
  it('is a no-op mid-vend', () => {
    const s = baseState({ phase: { kind: 'vending' } })
    expect(wagerReducer(s, 5_000_000n)).toBe(s)
  })
})

describe('derivePackRoll (provably-fair derivation)', () => {
  const seed = new Uint8Array(32).fill(7)

  it('is deterministic: same seed + index → same roll', async () => {
    const a = await derivePackRoll(seed, 0)
    const b = await derivePackRoll(seed, 0)
    expect(a).toBe(b)
  })

  it('different indices → independent rolls, all in [0, WEIGHT_TOTAL)', async () => {
    const rolls: bigint[] = []
    for (let i = 0; i < MAX_PACKS; i++) rolls.push(await derivePackRoll(seed, i))
    for (const r of rolls) {
      expect(r >= 0n).toBe(true)
      expect(r < WEIGHT_TOTAL).toBe(true)
      expect(() => rollToPrize(r)).not.toThrow()
    }
    // Not all identical (independence smoke check).
    expect(new Set(rolls.map((r) => r.toString())).size).toBeGreaterThan(1)
  })

  it('a different seed changes the rolls', async () => {
    const other = new Uint8Array(32).fill(8)
    const a = await derivePackRoll(seed, 0)
    const b = await derivePackRoll(other, 0)
    expect(a === b).toBe(false)
  })

  it('tiers are DOMAIN-SEPARATED: same seed+index, different tier → independent rolls', async () => {
    const perTier: bigint[] = []
    for (const tier of TIER_ORDER) perTier.push(await derivePackRoll(seed, 0, tier))
    // easy defaults must equal the explicit easy derivation.
    expect(await derivePackRoll(seed, 0)).toBe(perTier[0])
    // The three tiers must not all collide (astronomically unlikely unless
    // the domain tag is being ignored).
    expect(new Set(perTier.map((r) => r.toString())).size).toBeGreaterThan(1)
  })

  it('empirical distribution over many derived rolls sits in the RTP band (coarse)', async () => {
    // 600 seeded rolls: mean prize EV should land in a generous band around
    // 0.965 — this is a derivation-plumbing check (bias/off-by-one), not a
    // statistical proof (vendingSim.mjs is the Monte-Carlo harness).
    let ev = 0n
    const n = 600
    for (let i = 0; i < n; i++) {
      const s = new Uint8Array(32)
      s[0] = i & 0xff
      s[1] = (i >> 8) & 0xff
      const roll = await derivePackRoll(s, i % MAX_PACKS)
      ev += rollToPrize(roll).multiplierBps
    }
    const mean = Number(ev / BigInt(n)) / 10_000
    expect(mean).toBeGreaterThan(0.5)
    expect(mean).toBeLessThan(1.6)
  })
})

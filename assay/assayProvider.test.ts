/**
 * The Assay Line — provider tier-selection contract tests.
 *
 * Proves the SELECTED difficulty tier genuinely drives the game (all 3 tiers),
 * exercising the REAL `deriveBombBitmap` from `assayProvider.ts` (the exact
 * derivation `generateRoundSecrets` runs at plunge) and the REAL per-tier data
 * from `assayMath.ts` (the verotty-verified ladder source we only CONSUME).
 *
 * Covers the holdgate: (1) each armed tier seeds its own bombCount, (2) seed+tier
 * reproducibility, (3) the tier is folded into the seeded layout (not a Standard
 * fallback), (4) selecting a tier drives that tier's GOLDEN ladder + max multiple,
 * (5) RTP stays FLAT per tier — no float, no clamp.
 */
import { describe, expect, it } from 'vitest'
import {
  coinLadderBps,
  GOLDEN_COIN_LADDER_BPS_BY_TIER,
  MAX_TRAIL,
  MIN_TRAIL,
  RTP_BAND_MAX_BPS,
  RTP_BAND_MIN_BPS,
  survivalRational,
  TIER_MAX_MULTIPLE_BPS,
  TIER_ORDER,
  TIERS,
  TOTAL_TILES,
} from './assayMath'
import type { TierId } from './assayMath'
import type { AssayOutcome, AssayState } from './assayProvider'
import { armTierReducer, deriveBombBitmap, TIER_DISPLAY_LABEL } from './assayProvider'

/** A fixed, arbitrary 32-byte seed — the "same seed" in the determinism proofs. */
const FIXED_SEED = new Uint8Array(32)
for (let i = 0; i < 32; i++) FIXED_SEED[i] = (i * 37 + 11) & 0xff

function bombIndices(bitmap: boolean[]): number[] {
  const out: number[] = []
  for (let i = 0; i < bitmap.length; i++) if (bitmap[i]) out.push(i)
  return out
}

/** Mirror `generateRoundSecrets`: seed the board with the ARMED tier's bombCount
 *  + the tier-domain-separated tag — exactly what the provider does at plunge. */
function board(tierId: TierId, seed: Uint8Array = FIXED_SEED): Promise<boolean[]> {
  return deriveBombBitmap(seed, TOTAL_TILES, TIERS[tierId].bombCount, tierId)
}

describe('tier selection genuinely drives bombCount (no hardcoded Standard)', () => {
  it('each armed tier seeds exactly its own bad-vein count', async () => {
    expect(bombIndices(await board('lean')).length).toBe(6)
    expect(bombIndices(await board('standard')).length).toBe(8)
    expect(bombIndices(await board('flooded')).length).toBe(16)
  })

  it('bombCount matches the assayMath TIERS source of truth', () => {
    expect(TIERS.lean.bombCount).toBe(6)
    expect(TIERS.standard.bombCount).toBe(8)
    expect(TIERS.flooded.bombCount).toBe(16)
  })
})

describe('seed+tier determinism (fairness reproducibility)', () => {
  it('same seed + same tier => identical board, every tier', async () => {
    for (const tier of TIER_ORDER) {
      const a = await board(tier)
      const b = await board(tier)
      expect(b).toEqual(a)
    }
  })

  it('the tier is FOLDED into the seeded derivation: same seed, different tier => independent layout (lean is NOT a nested subset of standard)', async () => {
    const lean = new Set(bombIndices(await board('lean')))
    const std = new Set(bombIndices(await board('standard')))
    // If the tier were NOT folded into the derivation, the two shuffles would be
    // identical and lean's 3 veins would be a strict subset of standard's 4.
    // Domain-separating the tag by tier makes the layouts independent.
    const leanSubsetOfStd = [...lean].every((i) => std.has(i))
    expect(leanSubsetOfStd).toBe(false)
  })
})

describe('selected tier drives the REAL golden ladder + max multiple', () => {
  it('per-tier settlement ladder equals that tier golden vector (no default-tier fallback)', () => {
    for (const tier of TIER_ORDER) {
      const safe = TIERS[tier].safeTiles
      for (let L = 0; L <= MAX_TRAIL; L++) {
        expect(coinLadderBps(L, safe)).toBe(GOLDEN_COIN_LADDER_BPS_BY_TIER[tier][L])
      }
    }
  })

  it('per-tier max multiple is distinct and tier-driven', () => {
    expect(TIER_MAX_MULTIPLE_BPS.lean).toBe(89502n)
    expect(TIER_MAX_MULTIPLE_BPS.standard).toBe(191654n)
    expect(TIER_MAX_MULTIPLE_BPS.flooded).toBe(4461248n)
    expect(TIER_MAX_MULTIPLE_BPS.lean).not.toBe(TIER_MAX_MULTIPLE_BPS.standard)
    expect(TIER_MAX_MULTIPLE_BPS.standard).not.toBe(TIER_MAX_MULTIPLE_BPS.flooded)
  })
})

describe('TIER_DISPLAY_LABEL — dive-depth names for the Glass Box (fairness HIGH #7)', () => {
  it('maps every internal tier id to its Abyss dive-depth display name', () => {
    // ABYSS LINE re-skin (DEPTH↔FLOOR mapping): the tiers DISPLAY as dive depths;
    // the internal ids (lean/standard/flooded) and all math are untouched.
    expect(TIER_DISPLAY_LABEL.lean).toBe('REEF SHELF')
    expect(TIER_DISPLAY_LABEL.standard).toBe('MIDNIGHT ZONE')
    // The deepest tier DISPLAYS as "HADAL TRENCH"; the internal id stays `flooded`.
    expect(TIER_DISPLAY_LABEL.flooded).toBe('HADAL TRENCH')
  })

  it('keeps the internal id `flooded` (only the DISPLAY label is "HADAL TRENCH")', () => {
    // The id is the fairness re-derivation key; it must NOT drift to "heavy".
    expect(TIER_ORDER).toContain('flooded')
    expect(TIER_ORDER).not.toContain('heavy')
    expect(Object.keys(TIER_DISPLAY_LABEL).sort()).toEqual([...TIER_ORDER].sort())
  })
})

describe('settled receipt tier is LOCKED to the tier that produced it (fairness HIGH #8)', () => {
  // A minimal but shape-complete settled state whose outcome was PRODUCED by
  // `committed`, with a (possibly different) armed `selected` tier.
  function settledState(committed: TierId, selected: TierId): AssayState {
    const outcome: AssayOutcome = {
      won: true,
      wagerLamports: 1_000_000n,
      payoutLamports: 2_000_000n,
      finalMultiplierBps: 20_000n,
      committedTrail: [0, 1, 2, 3, 4, 5, 6, 7],
      revealedSafe: [0, 1, 2, 3, 4, 5, 6, 7],
      veinTileIdx: null,
      gridDim: 14,
      tier: committed,
      tierLabel: TIER_DISPLAY_LABEL[committed],
      bombCount: TIERS[committed].bombCount,
      bombBitmap: new Array(196).fill(false),
      serverSeedHex: '00',
      serverSeedHashHex: '00',
      roundIdHex: '01',
    }
    return {
      phase: { kind: 'settled', outcome },
      balanceLamports: 1_000_000_000n,
      wagerLamports: 1_000_000n,
      selectedTier: selected,
      committedTier: committed,
      trail: [],
      committedTrail: [],
      revealedSafe: [],
      tallyBps: 0n,
      lastDeltaBps: 0n,
      revealPace: 'staggered',
      lastTrail: [],
      history: [],
    }
  }

  it('re-arming the rail on the settled screen changes selectedTier ONLY — committedTier, outcome.tier and the frozen outcome.tierLabel are untouched', () => {
    const before = settledState('flooded', 'flooded')
    // Player taps a DIFFERENT floor on the rail after the round settled.
    const after = armTierReducer(before, 'lean')

    // The NEXT-plunge selection moved…
    expect(after.selectedTier).toBe('lean')
    // …but the receipt that was PRODUCED by 'flooded' is fully decoupled:
    expect(after.committedTier).toBe('flooded')
    expect(after.phase.kind).toBe('settled')
    if (after.phase.kind !== 'settled') throw new Error('phase must remain settled')
    expect(after.phase.outcome.tier).toBe('flooded')
    expect(after.phase.outcome.tierLabel).toBe('HADAL TRENCH')
    // The immutable outcome object is preserved by reference — no rewrite path.
    expect(after.phase.outcome).toBe(before.phase.kind === 'settled' ? before.phase.outcome : null)
  })

  it('the receipt label is derived from committedTier, never selectedTier', () => {
    // committed 'standard', armed 'lean' → certificate must say MIDNIGHT ZONE.
    const s = settledState('standard', 'lean')
    if (s.phase.kind !== 'settled') throw new Error('unreachable')
    expect(s.phase.outcome.tierLabel).toBe(TIER_DISPLAY_LABEL.standard)
    expect(s.phase.outcome.tierLabel).toBe('MIDNIGHT ZONE')
    expect(s.phase.outcome.tierLabel).not.toBe(TIER_DISPLAY_LABEL[s.selectedTier])
  })

  it('is a NO-OP mid-flight so a running round keeps its committedTier', () => {
    for (const kind of ['assaying', 'bad-vein', 'settling'] as const) {
      const mid: AssayState = {
        ...settledState('flooded', 'flooded'),
        phase: kind === 'bad-vein' ? { kind, veinTileIdx: 3 } : { kind },
        committedTier: 'flooded',
        selectedTier: 'flooded',
      }
      const after = armTierReducer(mid, 'lean')
      // Reference-equal: no state churn at all mid-flight.
      expect(after).toBe(mid)
      expect(after.selectedTier).toBe('flooded')
      expect(after.committedTier).toBe('flooded')
    }
  })
})

describe('RTP stays FLAT per tier (no per-tier drift, no clamp, no float)', () => {
  it('analytic S(L)*T(L) sits in the RTP band for every playable L on every tier', () => {
    for (const tier of TIER_ORDER) {
      const safe = TIERS[tier].safeTiles
      for (let L = MIN_TRAIL; L <= MAX_TRAIL; L++) {
        const { num, den } = survivalRational(L, safe)
        const t = coinLadderBps(L, safe) // bigint ladder — no IEEE float in the path
        const rtpBps = (num * t) / den
        expect(rtpBps >= RTP_BAND_MIN_BPS && rtpBps <= RTP_BAND_MAX_BPS).toBe(true)
      }
    }
  })
})

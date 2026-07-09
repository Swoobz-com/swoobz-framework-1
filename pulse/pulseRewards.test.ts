/**
 * pulseRewards — Operator reward ladder tests (S2).
 *
 * Enforces the two-economy iron rule structurally: every reward is soulbound,
 * carries exactly one of the 3 legal benefit kinds, has an EV-neutral proof,
 * aligns 1:1 with ranks 1-10, and exposes NO money / EV field. Claim + ladder
 * helpers are pure + deterministic.
 */
import { describe, expect, it } from 'vitest'
import { PULSE_RANKS } from './pulseRank'
import {
  claimablePulseRewards,
  PULSE_REWARDS,
  type PulseBenefitKind,
  pulseRewardLadder,
  rewardForRank,
} from './pulseRewards'

const LEGAL_KINDS: ReadonlyArray<PulseBenefitKind> = ['loyalty', 'cosmetic', 'agency']

describe('PULSE_REWARDS — the iron rule (two-economy)', () => {
  it('every reward is soulbound (non-transferable)', () => {
    for (const r of PULSE_REWARDS) expect(r.soulbound).toBe(true)
  })

  it('every reward carries exactly one of the 3 legal benefit kinds', () => {
    for (const r of PULSE_REWARDS) expect(LEGAL_KINDS).toContain(r.benefitKind)
  })

  it('every reward has a non-empty EV-neutral proof', () => {
    for (const r of PULSE_REWARDS) {
      expect(r.evNeutralProof.length).toBeGreaterThan(0)
      expect(r.benefitLabel.length).toBeGreaterThan(0)
    }
  })

  it('carries NO money / EV field on any reward', () => {
    const banned = ['rtp', 'odds', 'payout', 'multiplier', 'winchance', 'edge', 'rate', 'amount']
    for (const r of PULSE_REWARDS) {
      for (const key of Object.keys(r)) {
        expect(banned).not.toContain(key.toLowerCase())
      }
    }
  })

  it('cosmetic rewards declare a real cosmeticType; agency/loyalty declare none', () => {
    for (const r of PULSE_REWARDS) {
      if (r.benefitKind === 'cosmetic') {
        expect(r.cosmeticType).not.toBe('none')
      } else {
        expect(r.cosmeticType).toBe('none')
      }
    }
  })

  it('no em-dashes in player-facing copy', () => {
    for (const r of PULSE_REWARDS) {
      expect(r.benefitLabel).not.toContain('—')
      expect(r.nftNameDesk).not.toContain('—')
      expect(r.nftNameLab).not.toContain('—')
    }
  })

  it('rank 10 (apex house-edge discount) is gated pending attestation', () => {
    const apex = rewardForRank(10)
    expect(apex?.gatedPendingAttestation).toBe(true)
    // Lower rewards are NOT gated.
    expect(rewardForRank(1)?.gatedPendingAttestation).toBeUndefined()
  })
})

describe('PULSE_REWARDS — 1:1 alignment with ranks', () => {
  it('grants exactly one reward for each rank 1..10, and none for rank 0', () => {
    expect(rewardForRank(0)).toBeNull()
    for (let i = 1; i <= 10; i++) {
      const r = rewardForRank(i)
      expect(r).not.toBeNull()
      expect(r?.rankIndex).toBe(i)
    }
    expect(PULSE_REWARDS).toHaveLength(10)
  })

  it('every reward rankIndex maps to a real PULSE_RANKS tier', () => {
    const rankIndices = new Set(PULSE_RANKS.map((t) => t.index))
    for (const r of PULSE_REWARDS) expect(rankIndices.has(r.rankIndex)).toBe(true)
  })

  it("a reward's benefitKind matches its rank's milestoneKind", () => {
    for (const r of PULSE_REWARDS) {
      const tier = PULSE_RANKS[r.rankIndex]
      expect(r.benefitKind).toBe(tier?.milestoneKind)
    }
  })
})

describe('claimablePulseRewards', () => {
  it('returns all unclaimed rewards up to the current rank', () => {
    const claimable = claimablePulseRewards(3, [])
    expect(claimable.map((r) => r.rankIndex)).toEqual([1, 2, 3])
  })

  it('excludes already-claimed ranks', () => {
    const claimable = claimablePulseRewards(3, [1, 2])
    expect(claimable.map((r) => r.rankIndex)).toEqual([3])
  })

  it('returns nothing at rank 0', () => {
    expect(claimablePulseRewards(0, [])).toHaveLength(0)
  })

  it('is deterministic', () => {
    const a = claimablePulseRewards(5, [2])
    const b = claimablePulseRewards(5, [2])
    expect(a.map((r) => r.rankIndex)).toEqual(b.map((r) => r.rankIndex))
  })
})

describe('pulseRewardLadder', () => {
  it('returns one row per rank tier, reward null only at rank 0', () => {
    const ladder = pulseRewardLadder()
    expect(ladder).toHaveLength(PULSE_RANKS.length)
    expect(ladder[0]?.reward).toBeNull()
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]?.reward?.rankIndex).toBe(i)
    }
  })
})

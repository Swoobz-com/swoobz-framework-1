/**
 * ooReiWardenRewards.test.ts — the Warden reward ladder (D.1 / M2).
 * Verifies alignment with the rank ladder, soulbound invariant, claim logic,
 * legal benefit kinds, and brand (no em-dash).
 */
import { describe, expect, it } from 'vitest'

import { WARDEN_RANKS } from './ooReiWardenRank'
import {
  WARDEN_REWARDS,
  claimableRewards,
  rewardForRank,
  wardenRewardLadder,
  type WardenBenefitKind,
} from './ooReiWardenRewards'

const LEGAL_KINDS: ReadonlyArray<WardenBenefitKind> = ['loyalty', 'cosmetic', 'agency']

describe('WARDEN_REWARDS ladder', () => {
  it('grants one reward per rank index 1..N (rank 0 = no reward)', () => {
    expect(rewardForRank(0)).toBeNull()
    for (let i = 1; i < WARDEN_RANKS.length; i += 1) {
      expect(rewardForRank(i)?.rankIndex).toBe(i)
    }
  })

  it('every reward is soulbound (non-transferable) — structural', () => {
    for (const r of WARDEN_REWARDS) expect(r.soulbound).toBe(true)
  })

  it('every benefit is a LEGAL kind (loyalty/cosmetic/agency — never RTP)', () => {
    for (const r of WARDEN_REWARDS) expect(LEGAL_KINDS).toContain(r.benefitKind)
  })

  it('every reward has a name, kanji, and benefit label with no em-dash', () => {
    for (const r of WARDEN_REWARDS) {
      expect(r.nftName.length).toBeGreaterThan(0)
      expect(r.nftKanji.length).toBeGreaterThan(0)
      expect(r.benefitLabel.length).toBeGreaterThan(0)
      expect(r.benefitLabel.includes('—')).toBe(false)
      expect(r.nftName.includes('—')).toBe(false)
    }
  })

  it('rank indices are unique and ascending', () => {
    const idx = WARDEN_REWARDS.map((r) => r.rankIndex)
    expect(new Set(idx).size).toBe(idx.length)
    for (let i = 1; i < idx.length; i += 1) {
      expect((idx[i] ?? 0) > (idx[i - 1] ?? 0)).toBe(true)
    }
  })
})

describe('claimableRewards', () => {
  it('returns every reward up to the current rank that is not yet claimed', () => {
    const out = claimableRewards(3, [])
    expect(out.map((r) => r.rankIndex)).toEqual([1, 2, 3])
  })

  it('excludes already-claimed rewards', () => {
    const out = claimableRewards(3, [1, 2])
    expect(out.map((r) => r.rankIndex)).toEqual([3])
  })

  it('returns nothing at rank 0', () => {
    expect(claimableRewards(0, [])).toEqual([])
  })

  it('never returns a reward above the current rank', () => {
    const out = claimableRewards(2, [])
    expect(out.every((r) => r.rankIndex <= 2)).toBe(true)
  })

  it('is deterministic across repeated calls', () => {
    const a = JSON.stringify(claimableRewards(5, [2]))
    for (let i = 0; i < 25; i += 1) expect(JSON.stringify(claimableRewards(5, [2]))).toBe(a)
  })
})

describe('wardenRewardLadder', () => {
  it('returns one row per rank tier, each with its reward (or null at rank 0)', () => {
    const ladder = wardenRewardLadder()
    expect(ladder.length).toBe(WARDEN_RANKS.length)
    expect(ladder[0]?.reward).toBeNull()
    expect(ladder[3]?.reward?.rankIndex).toBe(3)
  })
})

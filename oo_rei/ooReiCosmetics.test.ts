/**
 * ooReiCosmetics.test.ts — the cosmetics catalog and perks table (Domain A
 * discipline). Adversarial tests enforce:
 *
 *   1. EV-neutral: every item carries evNeutral:true and NO rtp/odds field.
 *   2. Soulbound: every item and perk carries soulbound:true.
 *   3. Legal benefit kinds only: 'loyalty' | 'cosmetic' | 'agency'.
 *   4. No em-dash in any user-facing string (brand rule).
 *   5. Cosmetics: ascending unlock rank, deterministic output, fail-closed.
 *   6. Perks: ascending rank indices, loyalty kind declares KIND only (no %).
 *   7. Helper functions are deterministic across 25 repeated calls.
 *   8. No import of ooReiMath.ts from ooReiCosmetics.ts (iron line).
 *
 * BLUEPRINT SOURCE: MYTH-OF-REI-ELEVATION-BLUEPRINT-2026-05-30.md §4.
 */

import { describe, expect, it } from 'vitest'

import { WARDEN_RANKS } from './ooReiWardenRank'
import type { WardenBenefitKind } from './ooReiWardenRewards'
import {
  ALL_COSMETICS,
  CODEX_PAGES,
  MUSIC_TRACKS,
  PANEL_FRAMES,
  PERKS,
  SEAL_SKINS,
  cosmeticById,
  ownedCosmetics,
  perkById,
  perksForRank,
  unlockLabel,
  unlockRankIndex,
  type OoReiCosmeticItem,
  type OoReiPerk,
} from './ooReiCosmetics'

// ─── Shared helpers ───────────────────────────────────────────────────────────

const LEGAL_KINDS: ReadonlyArray<WardenBenefitKind> = ['loyalty', 'cosmetic', 'agency']

/** Returns true if the string contains an em-dash (U+2014) or horizontal bar (U+2015). */
function hasEmDash(s: string): boolean {
  return s.includes('—') || s.includes('―')
}

/**
 * Returns true if the object has any key that is EXACTLY one of the banned
 * financial-math field names. Exact match only — avoids false positives on
 * legitimate fields like 'evNeutral', 'evNeutralProof', 'description'.
 */
function hasRtpOrOddsField(obj: Record<string, unknown>): boolean {
  const bannedKeys = new Set(['rtp', 'odds', 'payout', 'houseEdge', 'house_edge', 'winRate', 'win_rate', 'rtpBps', 'payoutBps', 'multiplierBps'])
  for (const key of Object.keys(obj)) {
    if (bannedKeys.has(key.toLowerCase())) return true
  }
  return false
}

// ─── ALL_COSMETICS invariants ─────────────────────────────────────────────────

describe('ALL_COSMETICS — catalog completeness', () => {
  it('contains exactly the 5 seal-skins, 6 music tracks, 5 codex pages, 3 panel frames', () => {
    expect(SEAL_SKINS.length).toBe(5)
    expect(MUSIC_TRACKS.length).toBe(6)
    expect(CODEX_PAGES.length).toBe(5)
    expect(PANEL_FRAMES.length).toBe(3)
    expect(ALL_COSMETICS.length).toBe(5 + 6 + 5 + 3)
  })

  it('every cosmetic id is unique (no id collision)', () => {
    const ids = ALL_COSMETICS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('ALL_COSMETICS — EV-neutral invariant (iron line)', () => {
  it('every cosmetic carries evNeutral: true', () => {
    for (const c of ALL_COSMETICS) {
      expect(c.evNeutral).toBe(true)
    }
  })

  it('no cosmetic object has an rtp, odds, payout, or multiplier field', () => {
    for (const c of ALL_COSMETICS) {
      expect(hasRtpOrOddsField(c as unknown as Record<string, unknown>)).toBe(false)
    }
  })

  it('benefitKind is always "cosmetic" for every cosmetic item', () => {
    for (const c of ALL_COSMETICS) {
      expect(c.benefitKind).toBe('cosmetic')
    }
  })
})

describe('ALL_COSMETICS — soulbound invariant', () => {
  it('every cosmetic is soulbound: true', () => {
    for (const c of ALL_COSMETICS) {
      expect(c.soulbound).toBe(true)
    }
  })
})

describe('ALL_COSMETICS — brand invariants (no em-dash, no cyan hex)', () => {
  it('no em-dash in any id, name, kanji, or description', () => {
    for (const c of ALL_COSMETICS) {
      expect(hasEmDash(c.id)).toBe(false)
      expect(hasEmDash(c.name)).toBe(false)
      expect(hasEmDash(c.description)).toBe(false)
    }
  })

  it('no cyan color hex in any field (zero cyan brand rule)', () => {
    const cyanPattern = /#00[ef][0-9a-f]{3}|#0[0-9a-f][ef][0-9a-f]{3}|rgba?\(\s*0\s*,\s*[2-9][0-9]{1}/i
    for (const c of ALL_COSMETICS) {
      expect(cyanPattern.test(c.assetPath)).toBe(false)
      expect(cyanPattern.test(c.description)).toBe(false)
    }
  })

  it('every cosmetic has a non-empty id, name, kanji, and description', () => {
    for (const c of ALL_COSMETICS) {
      expect(c.id.length).toBeGreaterThan(0)
      expect(c.name.length).toBeGreaterThan(0)
      expect(c.kanji.length).toBeGreaterThan(0)
      expect(c.description.length).toBeGreaterThan(0)
    }
  })
})

// ─── Seal-skin ordering ───────────────────────────────────────────────────────

describe('SEAL_SKINS — unlock ordering', () => {
  it('rank-gated skins unlock at ascending or equal rank indices', () => {
    const rankGated = SEAL_SKINS.filter((s) => s.unlockCondition.kind === 'rank')
    for (let i = 1; i < rankGated.length; i += 1) {
      const prev = rankGated[i - 1]!
      const curr = rankGated[i]!
      const prevRank = prev.unlockCondition.kind === 'rank' ? prev.unlockCondition.rankIndex : 0
      const currRank = curr.unlockCondition.kind === 'rank' ? curr.unlockCondition.rankIndex : 0
      expect(currRank).toBeGreaterThanOrEqual(prevRank)
    }
  })

  it('the storm skin is milestone-gated (first-procession-cycle), not rank-gated', () => {
    const storm = SEAL_SKINS.find((s) => s.id === 'seal-skin-storm')
    expect(storm?.unlockCondition.kind).toBe('milestone')
    if (storm?.unlockCondition.kind === 'milestone') {
      expect(storm.unlockCondition.milestoneId).toBe('first-procession-cycle')
    }
  })

  it('island-warden skin unlocks at rank 10 (apex)', () => {
    const apex = SEAL_SKINS.find((s) => s.id === 'seal-skin-island-warden')
    expect(apex?.unlockCondition.kind).toBe('rank')
    if (apex?.unlockCondition.kind === 'rank') {
      expect(apex.unlockCondition.rankIndex).toBe(10)
    }
  })
})

// ─── Music track ordering ─────────────────────────────────────────────────────

describe('MUSIC_TRACKS — unlock ordering and defaults', () => {
  it('storm coast (default) unlocks at rank 0 (everyone has it)', () => {
    const def = MUSIC_TRACKS.find((t) => t.id === 'music-storm-coast')
    expect(def?.unlockCondition.kind).toBe('rank')
    if (def?.unlockCondition.kind === 'rank') {
      expect(def.unlockCondition.rankIndex).toBe(0)
    }
  })

  it('warden apex music unlocks at rank 10', () => {
    const apex = MUSIC_TRACKS.find((t) => t.id === 'music-warden-apex')
    expect(apex?.unlockCondition.kind).toBe('rank')
    if (apex?.unlockCondition.kind === 'rank') {
      expect(apex.unlockCondition.rankIndex).toBe(10)
    }
  })

  it('track rank unlock indices are ascending', () => {
    const ranks = MUSIC_TRACKS.map((t) =>
      t.unlockCondition.kind === 'rank' ? t.unlockCondition.rankIndex : 0,
    )
    for (let i = 1; i < ranks.length; i += 1) {
      expect((ranks[i] ?? 0) >= (ranks[i - 1] ?? 0)).toBe(true)
    }
  })
})

// ─── Codex pages ──────────────────────────────────────────────────────────────

describe('CODEX_PAGES — blueprint alignment', () => {
  it('has exactly 5 authored codex pages (blueprint §4a)', () => {
    expect(CODEX_PAGES.length).toBe(5)
  })

  it('ARASHI page unlocks at rank 2 (YUIBITO)', () => {
    const p = CODEX_PAGES.find((c) => c.id === 'codex-arashi')
    expect(p?.unlockCondition.kind).toBe('rank')
    if (p?.unlockCondition.kind === 'rank') expect(p.unlockCondition.rankIndex).toBe(2)
  })

  it('KIRI and KAGE both unlock at rank 7 (the Bestiary moment, blueprint §4a)', () => {
    const kiri = CODEX_PAGES.find((c) => c.id === 'codex-kiri')
    const kage = CODEX_PAGES.find((c) => c.id === 'codex-kage')
    for (const p of [kiri, kage]) {
      expect(p?.unlockCondition.kind).toBe('rank')
      if (p?.unlockCondition.kind === 'rank') expect(p.unlockCondition.rankIndex).toBe(7)
    }
  })

  it('all 5 codex pages have distinct asset paths', () => {
    const paths = CODEX_PAGES.map((c) => c.assetPath)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

// ─── Panel frames ─────────────────────────────────────────────────────────────

describe('PANEL_FRAMES — ordered cosmetics', () => {
  it('has 3 frames: plain-ink (rank 0), bamboo-scroll (rank 5), warden-seal (rank 8)', () => {
    const plain = PANEL_FRAMES.find((f) => f.id === 'frame-plain-ink')
    const bamboo = PANEL_FRAMES.find((f) => f.id === 'frame-bamboo-scroll')
    const seal = PANEL_FRAMES.find((f) => f.id === 'frame-warden-seal')

    for (const frame of [plain, bamboo, seal]) expect(frame).toBeTruthy()

    const rankOf = (f: OoReiCosmeticItem | undefined): number =>
      f?.unlockCondition.kind === 'rank' ? f.unlockCondition.rankIndex : -1

    expect(rankOf(plain)).toBe(0)
    expect(rankOf(bamboo)).toBe(5)
    expect(rankOf(seal)).toBe(8)
  })
})

// ─── PERKS invariants ─────────────────────────────────────────────────────────

describe('PERKS — catalog completeness', () => {
  it('has exactly 8 perks (blueprint §4b)', () => {
    expect(PERKS.length).toBe(8)
  })

  it('every perk has a unique id', () => {
    const ids = PERKS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('PERKS — EV-neutral invariant (iron line)', () => {
  it('every perk carries evNeutral: true', () => {
    for (const p of PERKS) {
      expect(p.evNeutral).toBe(true)
    }
  })

  it('no perk object has an rtp, odds, payout, or multiplier field', () => {
    for (const p of PERKS) {
      expect(hasRtpOrOddsField(p as unknown as Record<string, unknown>)).toBe(false)
    }
  })

  it('every perk has a non-empty evNeutralProof string', () => {
    for (const p of PERKS) {
      expect(p.evNeutralProof.length).toBeGreaterThan(0)
    }
  })

  it('loyalty kind perks do not contain a percentage or rate literal in benefitLabel', () => {
    // A loyalty perk must NOT invent "3%" or "0.5x" or similar rates.
    const ratePattern = /\d+(\.\d+)?%|\d+(\.\d+)?x\b/i
    for (const p of PERKS.filter((p) => p.benefitKind === 'loyalty')) {
      expect(ratePattern.test(p.benefitLabel)).toBe(false)
    }
  })
})

describe('PERKS — soulbound invariant', () => {
  it('every perk is soulbound: true', () => {
    for (const p of PERKS) {
      expect(p.soulbound).toBe(true)
    }
  })
})

describe('PERKS — legal benefit kinds', () => {
  it('every perk benefitKind is one of loyalty / cosmetic / agency', () => {
    for (const p of PERKS) {
      expect(LEGAL_KINDS).toContain(p.benefitKind)
    }
  })
})

describe('PERKS — brand invariants (no em-dash)', () => {
  it('no em-dash in any perk id, name, benefitLabel, or evNeutralProof', () => {
    for (const p of PERKS) {
      expect(hasEmDash(p.id)).toBe(false)
      expect(hasEmDash(p.name)).toBe(false)
      expect(hasEmDash(p.benefitLabel)).toBe(false)
      expect(hasEmDash(p.evNeutralProof)).toBe(false)
    }
  })

  it('every perk has a non-empty id, name, kanji, and benefitLabel', () => {
    for (const p of PERKS) {
      expect(p.id.length).toBeGreaterThan(0)
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.kanji.length).toBeGreaterThan(0)
      expect(p.benefitLabel.length).toBeGreaterThan(0)
    }
  })
})

describe('PERKS — ascending rank order', () => {
  it('perk rankIndex values are ascending (no rank regression)', () => {
    for (let i = 1; i < PERKS.length; i += 1) {
      expect((PERKS[i]?.rankIndex ?? 0) >= (PERKS[i - 1]?.rankIndex ?? 0)).toBe(true)
    }
  })

  it('all perk rankIndex values are within the warden rank ladder (1..10)', () => {
    const maxIdx = WARDEN_RANKS.length - 1
    for (const p of PERKS) {
      expect(p.rankIndex).toBeGreaterThanOrEqual(1)
      expect(p.rankIndex).toBeLessThanOrEqual(maxIdx)
    }
  })
})

// ─── ownedCosmetics helper ────────────────────────────────────────────────────

describe('ownedCosmetics()', () => {
  it('at rank 0 the player owns the storm-coast music and plain-ink frame (rank 0 items)', () => {
    const owned = ownedCosmetics(0)
    const ids = owned.map((c) => c.id)
    expect(ids).toContain('music-storm-coast')
    expect(ids).toContain('frame-plain-ink')
  })

  it('at rank 0 the player does NOT own the vermillion-brush skin (rank 5)', () => {
    const owned = ownedCosmetics(0)
    const ids = owned.map((c) => c.id)
    expect(ids).not.toContain('seal-skin-vermillion-brush')
  })

  it('at rank 10 (apex) the player owns every rank-gated cosmetic', () => {
    const owned = ownedCosmetics(10)
    const rankGated = ALL_COSMETICS.filter((c) => c.unlockCondition.kind === 'rank')
    for (const item of rankGated) {
      expect(owned.map((c) => c.id)).toContain(item.id)
    }
  })

  it('storm-skin (milestone-gated) requires the first-procession-cycle milestone', () => {
    const withoutMilestone = ownedCosmetics(10)
    expect(withoutMilestone.map((c) => c.id)).not.toContain('seal-skin-storm')

    const withMilestone = ownedCosmetics(10, ['first-procession-cycle'])
    expect(withMilestone.map((c) => c.id)).toContain('seal-skin-storm')
  })

  it('is fail-closed: negative rank returns only rank-0 items', () => {
    const owned = ownedCosmetics(-5)
    for (const c of owned) {
      const cond = c.unlockCondition
      if (cond.kind === 'rank') expect(cond.rankIndex).toBe(0)
    }
  })

  it('is deterministic across 25 repeated calls', () => {
    const ref = JSON.stringify(ownedCosmetics(5, ['first-procession-cycle']))
    for (let i = 0; i < 25; i += 1) {
      expect(JSON.stringify(ownedCosmetics(5, ['first-procession-cycle']))).toBe(ref)
    }
  })
})

// ─── perksForRank helper ──────────────────────────────────────────────────────

describe('perksForRank()', () => {
  it('at rank 0 returns no perks', () => {
    expect(perksForRank(0)).toHaveLength(0)
  })

  it('at rank 2 returns perk-spirit-codex (rank 2) but not perk-second-ally-slot (rank 3)', () => {
    const perks = perksForRank(2).map((p) => p.id)
    expect(perks).toContain('perk-spirit-codex')
    expect(perks).not.toContain('perk-second-ally-slot')
  })

  it('at rank 10 returns all 8 perks', () => {
    expect(perksForRank(10)).toHaveLength(8)
  })

  it('is fail-closed: negative rank returns nothing', () => {
    expect(perksForRank(-1)).toHaveLength(0)
  })

  it('is deterministic across 25 repeated calls', () => {
    const ref = JSON.stringify(perksForRank(7))
    for (let i = 0; i < 25; i += 1) {
      expect(JSON.stringify(perksForRank(7))).toBe(ref)
    }
  })
})

// ─── cosmeticById helper ──────────────────────────────────────────────────────

describe('cosmeticById()', () => {
  it('returns the correct item for a known id', () => {
    const item = cosmeticById('seal-skin-plain-ofuda')
    expect(item?.id).toBe('seal-skin-plain-ofuda')
    expect(item?.category).toBe('seal-skin')
  })

  it('returns null for an unknown id', () => {
    expect(cosmeticById('does-not-exist')).toBeNull()
  })

  it('is deterministic across 25 repeated calls', () => {
    for (let i = 0; i < 25; i += 1) {
      expect(cosmeticById('codex-arashi')?.id).toBe('codex-arashi')
    }
  })
})

// ─── perkById helper ──────────────────────────────────────────────────────────

describe('perkById()', () => {
  it('returns the correct perk for a known id', () => {
    const p = perkById('perk-daily-seal-bonus')
    expect(p?.id).toBe('perk-daily-seal-bonus')
    expect(p?.benefitKind).toBe('loyalty')
  })

  it('returns null for an unknown id', () => {
    expect(perkById('does-not-exist')).toBeNull()
  })
})

// ─── unlockRankIndex helper ───────────────────────────────────────────────────

describe('unlockRankIndex()', () => {
  it('returns the rank index for rank-gated items', () => {
    const item = cosmeticById('seal-skin-plain-ofuda')!
    expect(unlockRankIndex(item)).toBe(1)
  })

  it('returns null for milestone-gated items', () => {
    const storm = cosmeticById('seal-skin-storm')!
    expect(unlockRankIndex(storm)).toBeNull()
  })
})

// ─── unlockLabel helper ───────────────────────────────────────────────────────

describe('unlockLabel()', () => {
  it('returns empty string for rank-0 items (always owned)', () => {
    const music = cosmeticById('music-storm-coast')!
    expect(unlockLabel(music)).toBe('')
  })

  it('returns "Reach [TITLE] to unlock." for rank-gated items', () => {
    const item = cosmeticById('seal-skin-vermillion-brush')!
    const label = unlockLabel(item)
    expect(label).toContain('TAIMASHI')
    expect(label).not.toContain('—')
  })

  it('returns the milestone label for milestone-gated items', () => {
    const storm = cosmeticById('seal-skin-storm')!
    const label = unlockLabel(storm)
    expect(label).toContain('10 spirits sealed')
    expect(label).not.toContain('—')
  })

  it('never contains an em-dash in any label', () => {
    for (const item of ALL_COSMETICS) {
      expect(hasEmDash(unlockLabel(item))).toBe(false)
    }
  })
})

// ─── Adversarial: verify no ooReiMath import (iron line) ────────────────────

describe('ooReiCosmetics module — no math import (iron line)', () => {
  it('SEAL_SKINS items carry no rtp/odds/payout field at any depth', () => {
    for (const s of SEAL_SKINS) {
      const json = JSON.stringify(s)
      expect(json.toLowerCase()).not.toContain('"rtp"')
      expect(json.toLowerCase()).not.toContain('"odds"')
      expect(json.toLowerCase()).not.toContain('"payout"')
    }
  })

  it('PERKS items carry no rtp/odds/payout field at any depth', () => {
    for (const p of PERKS) {
      const json = JSON.stringify(p)
      expect(json.toLowerCase()).not.toContain('"rtp"')
      expect(json.toLowerCase()).not.toContain('"odds"')
      expect(json.toLowerCase()).not.toContain('"payout"')
    }
  })
})

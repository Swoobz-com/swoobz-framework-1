/**
 * ooReiCosmetics.ts — The cosmetics catalog and perks table for OO-REI / The Myth of REI.
 *
 * THE IRON LINE (two-economy rule — non-negotiable):
 *   NOTHING in this module changes RTP, odds, payout, or EV. The slot's
 *   96.94% RTP is locked in ooReiMath.ts. Do not import ooReiMath.ts from here.
 *   There are no RTP fields, no odds fields, no payout multipliers, no rakeback
 *   magnitudes. Benefits declare their KIND only; magnitudes are owned by the
 *   audited tiers + revenue-router (SC-035 / ADR-017b).
 *
 * DOMAIN: pure model (Domain A discipline — bigint, deterministic, fail-closed,
 * no floats, no I/O). Domain C for display; mint is Domain D.
 *
 * SOULBOUND: every cosmetic item and perk carries soulbound: true. The mint
 * path (originals-collection Anchor program) reads this flag and NEVER mints
 * a transferable token by accident.
 *
 * ENGAGEMENT LAYER SKILL §2 — three legal benefit kinds:
 *   'loyalty'  → advances platform loyalty tier eligibility (SC-035).
 *                Declares the KIND only. Never invents a rakeback %.
 *   'cosmetic' → seal-skins, music tracks, codex pages, panel frames, titles.
 *   'agency'   → ally slots, map-route choices. EV-identical by construction.
 *
 * Asset paths reference blueprint §4 target filenames. Art is generated in
 * a separate parallel fal/audio wave — paths are forward references.
 *
 * BLUEPRINT SOURCE: MYTH-OF-REI-ELEVATION-BLUEPRINT-2026-05-30.md §4.
 */

import { WARDEN_RANKS } from './ooReiWardenRank'
import type { WardenBenefitKind } from './ooReiWardenRewards'

// ─── Base paths (public directory root) ──────────────────────────────────────

const SKINS_BASE = '/assets/generated/oo-rei/cosmetics/skins' as const
const CODEX_BASE = '/assets/generated/oo-rei/cosmetics/codex' as const
const AUDIO_BASE = '/assets/audio/oo-rei' as const

// ─── Cosmetic item kinds ──────────────────────────────────────────────────────

/** All cosmetic sub-categories. */
export type CosmeticCategory = 'seal-skin' | 'music-track' | 'codex-page' | 'panel-frame'

// ─── Unlock condition ─────────────────────────────────────────────────────────

/**
 * What gates this cosmetic. Either a rank index (1-10) or a named milestone.
 * Named milestones: 'first-procession-cycle' = 10 spirits sealed.
 */
export type UnlockCondition =
  | { readonly kind: 'rank'; readonly rankIndex: number }
  | { readonly kind: 'milestone'; readonly milestoneId: 'first-procession-cycle'; readonly label: string }

// ─── Cosmetic item ────────────────────────────────────────────────────────────

/** One collectible cosmetic item (seal-skin, music, codex page, panel frame). */
export interface OoReiCosmeticItem {
  /** Stable identifier string. No em-dashes. */
  readonly id: string
  /** Display name in the collection grid. No em-dashes. */
  readonly name: string
  /** Kanji glyph rendered in Noto Serif JP display register. */
  readonly kanji: string
  /** Cosmetic sub-category. */
  readonly category: CosmeticCategory
  /** The single legal benefit kind for ALL cosmetics. */
  readonly benefitKind: 'cosmetic'
  /**
   * Always true. The originals-collection mint path checks this flag and will
   * NEVER mint a transferable token.
   */
  readonly soulbound: true
  /** What gates this item. */
  readonly unlockCondition: UnlockCondition
  /**
   * Asset path relative to /public. Forward reference: art generated in the
   * fal/audio wave. May 404 until that wave completes; the UI handles missing
   * assets gracefully (lock glyph shown instead).
   */
  readonly assetPath: string
  /**
   * Short description for the collection tooltip. No em-dashes. Calm register:
   * steady accrual, never FOMO or chase pressure.
   */
  readonly description: string
  /**
   * This item NEVER changes the slot's RTP, odds, or payout. Required field so
   * the compiler enforces the invariant at the type level.
   */
  readonly evNeutral: true
}

// ─── Perk ─────────────────────────────────────────────────────────────────────

/** One perk granted at a rank or milestone. */
export interface OoReiPerk {
  /** Stable identifier. No em-dashes. */
  readonly id: string
  /** Display name. No em-dashes. */
  readonly name: string
  /** Kanji glyph in Noto Serif JP display register. */
  readonly kanji: string
  /** Legal benefit kind. */
  readonly benefitKind: WardenBenefitKind
  /** Always true. */
  readonly soulbound: true
  /** Rank index (1-10) that grants this perk. */
  readonly rankIndex: number
  /**
   * What the perk does. Loyalty kind: declares KIND only, no invented rate.
   * Agency kind: declares the new choice/slot, no EV change.
   * Cosmetic kind: declares the display surface unlocked.
   * No em-dashes.
   */
  readonly benefitLabel: string
  /**
   * Single-line EV proof: why this perk does not change the math.
   * Populated for all kinds; always references the correct authority
   * (SC-035, computeOwnershipPoints, SYMBOL_PAYS).
   */
  readonly evNeutralProof: string
  /** This perk NEVER changes the slot's RTP, odds, or payout. */
  readonly evNeutral: true
}

// ─── Seal-skins (5 ofuda visual variants) ────────────────────────────────────

/**
 * SEAL SKINS — CSS class swap on a named data-skin attribute. Three application
 * sites: Spirit Sealing scroll art, Warden Rank chip badge, talisman-paper strip
 * alongside SPIN button. Blueprint §4a.
 */
export const SEAL_SKINS: ReadonlyArray<OoReiCosmeticItem> = [
  {
    id: 'seal-skin-plain-ofuda',
    name: 'Plain Ofuda',
    kanji: '符',
    category: 'seal-skin',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 1 },
    assetPath: `${SKINS_BASE}/seal-skin-plain-ofuda.png`,
    description: 'The first ofuda. Blank washi, a single ink border. The seal before the ink speaks.',
    evNeutral: true,
  },
  {
    id: 'seal-skin-vermillion-brush',
    name: 'Vermillion Brush Ofuda',
    kanji: '朱',
    category: 'seal-skin',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 5 },
    assetPath: `${SKINS_BASE}/seal-skin-vermillion-brush.png`,
    description: 'The vermillion brush. She does not hesitate now. A diagonal wash and three calligraphy lines.',
    evNeutral: true,
  },
  {
    id: 'seal-skin-gold-leaf',
    name: 'Gold Leaf Ofuda',
    kanji: '金',
    category: 'seal-skin',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 8 },
    assetPath: `${SKINS_BASE}/seal-skin-gold-leaf.png`,
    description: 'Deep indigo washi, scattered gold leaf, the kanji for soul pressed in the center. The spirits recognize the seal now.',
    evNeutral: true,
  },
  {
    id: 'seal-skin-storm',
    name: 'Storm Ofuda',
    kanji: '嵐',
    category: 'seal-skin',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: {
      kind: 'milestone',
      milestoneId: 'first-procession-cycle',
      label: '10 spirits sealed',
    },
    assetPath: `${SKINS_BASE}/seal-skin-storm.png`,
    description: 'Storm grey washi, dark ink flooding from the top, a single lightning calligraphy stroke. Ten spirits sealed to earn this mark.',
    evNeutral: true,
  },
  {
    id: 'seal-skin-island-warden',
    name: 'Island Warden Ofuda',
    kanji: '島守',
    category: 'seal-skin',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 10 },
    assetPath: `${SKINS_BASE}/seal-skin-island-warden.png`,
    description: 'Aged parchment-gold washi, 島守 in deep vermillion, four corner seal stamps. Warden of Tamashii-Jima. The island remembers your name.',
    evNeutral: true,
  },
] as const

// ─── Region music tracks (6 seamless loops) ──────────────────────────────────

/**
 * MUSIC TRACKS — 90-second seamless .ogg loops. Blueprint §4a.
 * All tracks play at FANFARE_VOLUME: 0.55 as const (ooReiSignatures.ts).
 * Volume is module-const and never changes by win, loss, streak, or session.
 * Ambient loop switches on region-change and equip-selection, never on spin
 * outcome. RG-C5 structural.
 */
export const MUSIC_TRACKS: ReadonlyArray<OoReiCosmeticItem> = [
  {
    id: 'music-storm-coast',
    name: 'Storm Coast',
    kanji: '嵐岸',
    category: 'music-track',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 0 },
    assetPath: `${AUDIO_BASE}/region-theme-storm-coast.ogg`,
    description: 'The default theme. Shakuhachi and taiko at the tide line. Storm dusk.',
    evNeutral: true,
  },
  {
    id: 'music-tide-shrine',
    name: 'Tide Shrine',
    kanji: '潮浜',
    category: 'music-track',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 4 },
    assetPath: `${AUDIO_BASE}/region-theme-tide-shrine.ogg`,
    description: 'Biwa and temple bell at low tide. The water remembers.',
    evNeutral: true,
  },
  {
    id: 'music-ember-pass',
    name: 'Ember Pass',
    kanji: '炎鍛',
    category: 'music-track',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 6 },
    assetPath: `${AUDIO_BASE}/region-theme-ember-pass.ogg`,
    description: 'Shamisen ascending phrase, hand drum, fire crackle. The pass holds its breath.',
    evNeutral: true,
  },
  {
    id: 'music-mist-valley',
    name: 'Mist Valley',
    kanji: '霧森',
    category: 'music-track',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 7 },
    assetPath: `${AUDIO_BASE}/region-theme-mist-valley.ogg`,
    description: 'Solo koto in deep cave reverb, single water droplets. The forest leans in.',
    evNeutral: true,
  },
  {
    id: 'music-shadow-reach',
    name: 'Shadow Reach',
    kanji: '影谷',
    category: 'music-track',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 9 },
    assetPath: `${AUDIO_BASE}/region-theme-shadow-reach.ogg`,
    description: 'Sub-bass pulse, single taiko at six-bar intervals. The last spirit has waited since the first seal broke.',
    evNeutral: true,
  },
  {
    id: 'music-warden-apex',
    name: "Warden's Song",
    kanji: '島守謡',
    category: 'music-track',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 10 },
    assetPath: `${AUDIO_BASE}/region-theme-warden-apex.ogg`,
    description: 'Composed 64-bar piece: koto, female vocal hum, shakuhachi. Melancholic and resolved. The island remembers your name.',
    evNeutral: true,
  },
] as const

// ─── Codex pages (5 authored spirit lore entries) ────────────────────────────

/**
 * CODEX PAGES — Explorer axis payoff. Blueprint §4a.
 * Each page: spirit kanji, domain, 2-3 line lore fragment, silhouette thumbnail.
 * Entries 6-10 show "????" until the second procession cycle (20 spirits sealed).
 */
export const CODEX_PAGES: ReadonlyArray<OoReiCosmeticItem> = [
  {
    id: 'codex-arashi',
    name: 'ARASHI · Storm Spirit',
    kanji: '嵐',
    category: 'codex-page',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 2 },
    assetPath: `${CODEX_BASE}/codex-spirit-arashi.png`,
    description: 'The first procession-spirit to break loose. REI drew the first seal before the water reached the shrine stairs.',
    evNeutral: true,
  },
  {
    id: 'codex-shio',
    name: 'SHIO · Tide Spirit',
    kanji: '潮',
    category: 'codex-page',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 3 },
    assetPath: `${CODEX_BASE}/codex-spirit-shio.png`,
    description: 'It moves in the dark below the tide flats. The old fishermen say the water remembers every drowned thing. SHIO is what the water remembers.',
    evNeutral: true,
  },
  {
    id: 'codex-homura',
    name: 'HOMURA · Forge Spirit',
    kanji: '炎',
    category: 'codex-page',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 5 },
    assetPath: `${CODEX_BASE}/codex-spirit-homura.png`,
    description: 'A small spirit by ancient count. But it finds the dry places. REI still carries the scar on her left palm.',
    evNeutral: true,
  },
  {
    id: 'codex-kiri',
    name: 'KIRI · Mist Spirit',
    kanji: '霧',
    category: 'codex-page',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 7 },
    assetPath: `${CODEX_BASE}/codex-spirit-kiri.png`,
    description: 'In the valley the mist does not lift. KIRI is not malicious. It simply has no concept of an ending.',
    evNeutral: true,
  },
  {
    id: 'codex-kage',
    name: 'KAGE · Shadow Spirit',
    kanji: '影',
    category: 'codex-page',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 7 },
    assetPath: `${CODEX_BASE}/codex-spirit-kage.png`,
    description: 'The hardest seal. A shadow does not stay where you put the talisman. She has not spoken about what she saw when the final seal held.',
    evNeutral: true,
  },
] as const

// ─── Panel frames (3 border cosmetics) ───────────────────────────────────────

/**
 * PANEL FRAMES — set via data-frame attribute on the Warden's Path panel.
 * Blueprint §4a. CSS-only; no asset PNG needed for 'plain-ink' or
 * 'bamboo-scroll' (pseudo-elements + CSS). 'warden-seal' uses inline SVG
 * corner glyphs. Asset paths are placeholder strings for consistency.
 */
export const PANEL_FRAMES: ReadonlyArray<OoReiCosmeticItem> = [
  {
    id: 'frame-plain-ink',
    name: 'Plain Ink',
    kanji: '墨',
    category: 'panel-frame',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 0 },
    assetPath: '',
    description: 'The default frame. 1px amber hairline. The path begins here.',
    evNeutral: true,
  },
  {
    id: 'frame-bamboo-scroll',
    name: 'Bamboo Scroll',
    kanji: '竹',
    category: 'panel-frame',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 5 },
    assetPath: '',
    description: 'CSS bamboo-gradient texture strips on left and right edges, parchment strips at top and bottom.',
    evNeutral: true,
  },
  {
    id: 'frame-warden-seal',
    name: 'Warden Seal',
    kanji: '封',
    category: 'panel-frame',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 8 },
    assetPath: '',
    description: '2px amber border, soft amber glow, four corner seal-stamp glyphs in 封.',
    evNeutral: true,
  },
] as const

// ─── Perks table (8 perks) ────────────────────────────────────────────────────

/**
 * PERKS TABLE — Blueprint §4b. Eight perks across loyalty / agency / cosmetic
 * kinds. Each perk carries an evNeutralProof string that names the authority
 * (SC-035, computeOwnershipPoints, SYMBOL_PAYS) proving no RTP contact.
 *
 * Loyalty kind: declares KIND only — never a hardcoded rakeback %.
 * Agency kind: ally accrual uses computeOwnershipPoints (zero effect on
 *   SYMBOL_PAYS or computePayout). Map routes are narrative context only.
 * Cosmetic kind: display surface unlocked, zero gameplay effect.
 */
// Perks ordered by ascending rankIndex — required by perksForRank and tests.
export const PERKS: ReadonlyArray<OoReiPerk> = [
  {
    id: 'perk-spirit-codex',
    name: 'Spirit Codex',
    kanji: '霊典',
    benefitKind: 'cosmetic',
    soulbound: true,
    rankIndex: 2,
    benefitLabel: 'The Codex view opens. The first lore page (ARASHI) is unlocked.',
    evNeutralProof: 'Display-only. No effect on SYMBOL_PAYS, computePayout, or any math path.',
    evNeutral: true,
  },
  {
    id: 'perk-second-ally-slot',
    name: 'Second Ally Slot',
    kanji: '双結',
    benefitKind: 'agency',
    soulbound: true,
    rankIndex: 3,
    benefitLabel: 'A second spirit ally can be equipped, doubling ownership-point accrual per spin.',
    evNeutralProof: 'Ally accrual uses computeOwnershipPoints (progression economy only). Zero effect on SYMBOL_PAYS, computePayout, or BPS_DENOM. Points are not money.',
    evNeutral: true,
  },
  {
    id: 'perk-daily-seal-bonus',
    name: 'Daily Seal Bonus',
    kanji: '朝符',
    benefitKind: 'loyalty',
    soulbound: true,
    rankIndex: 4,
    benefitLabel: 'Eligibility for the platform daily login bonus (SC-035).',
    evNeutralProof: 'Fixed flat credit drawn from house-edge share pool per SC-035. Not an RTP change. SYMBOL_PAYS and computePayout are untouched.',
    evNeutral: true,
  },
  {
    id: 'perk-map-route-choice',
    name: 'Map Route Choice',
    kanji: '路選',
    benefitKind: 'agency',
    soulbound: true,
    rankIndex: 6,
    benefitLabel: 'Choose which region to travel to at a path fork.',
    evNeutralProof: 'Region is narrative context only. All regions share identical SYMBOL_PAYS and REEL_STRIPS. computePayout output is identical across all regions. Identical by construction.',
    evNeutral: true,
  },
  {
    id: 'perk-rakeback-tier-advance',
    name: 'Rakeback Tier Advance',
    kanji: '返徽',
    benefitKind: 'loyalty',
    soulbound: true,
    rankIndex: 7,
    benefitLabel: 'Advances your rakeback tier in the platform loyalty system (SC-035 / ADR-017b).',
    evNeutralProof: 'Rakeback is drawn from the house margin share via ADR-017b. Not a change to the on-chain slot payout table. SYMBOL_PAYS unchanged.',
    evNeutral: true,
  },
  {
    id: 'perk-procession-bestiary',
    name: 'Procession Bestiary',
    kanji: '百霊鑑',
    benefitKind: 'cosmetic',
    soulbound: true,
    rankIndex: 7,
    benefitLabel: 'All 5 authored codex pages are visible. Hidden spirits become unlockable in the second procession cycle.',
    evNeutralProof: 'Display-only. No effect on SYMBOL_PAYS, computePayout, or any math path.',
    evNeutral: true,
  },
  {
    id: 'perk-third-ally-slot',
    name: 'Third Ally Slot',
    kanji: '参結',
    benefitKind: 'agency',
    soulbound: true,
    rankIndex: 9,
    benefitLabel: 'A third spirit ally slot opens, tripling ownership-point accrual per spin.',
    evNeutralProof: 'Same proof as perk-second-ally-slot: computeOwnershipPoints (progression economy only). SYMBOL_PAYS and computePayout untouched.',
    evNeutral: true,
  },
  {
    id: 'perk-warden-tier',
    name: 'Warden Tier',
    kanji: '守階',
    benefitKind: 'loyalty',
    soulbound: true,
    rankIndex: 10,
    benefitLabel: 'WARDEN tier eligibility in the house-edge-discount system (SC-035).',
    evNeutralProof: 'House-edge discount is a platform-level allocation in ADR-017b revenue-router, not a change to computePayout or BPS_DENOM. Slot RTP is 96.94% independent of this tier.',
    evNeutral: true,
  },
] as const

// ─── Derived helpers ──────────────────────────────────────────────────────────

/** All cosmetics in a single flat catalog (for iteration). */
export const ALL_COSMETICS: ReadonlyArray<OoReiCosmeticItem> = [
  ...SEAL_SKINS,
  ...MUSIC_TRACKS,
  ...CODEX_PAGES,
  ...PANEL_FRAMES,
] as const

/**
 * Cosmetics the player owns given their current rank index and any milestone
 * ids they have completed. Pure + deterministic.
 *
 * @param currentRankIndex   the player's current Warden rank index (0-10).
 * @param completedMilestones milestone ids the player has completed (e.g.
 *   ['first-procession-cycle']).
 */
export function ownedCosmetics(
  currentRankIndex: number,
  completedMilestones: ReadonlyArray<string> = [],
): ReadonlyArray<OoReiCosmeticItem> {
  // Fail-closed: negative rank = no ownership.
  const rankIdx = currentRankIndex >= 0 ? currentRankIndex : 0
  return ALL_COSMETICS.filter((item) => {
    const cond = item.unlockCondition
    if (cond.kind === 'rank') return cond.rankIndex <= rankIdx
    if (cond.kind === 'milestone') return completedMilestones.includes(cond.milestoneId)
    return false
  })
}

/**
 * Perks the player has unlocked given their rank. Pure + deterministic.
 * Returns perks in ascending rank order.
 *
 * @param currentRankIndex the player's current Warden rank index (0-10).
 */
export function perksForRank(currentRankIndex: number): ReadonlyArray<OoReiPerk> {
  const rankIdx = currentRankIndex >= 0 ? currentRankIndex : 0
  return PERKS.filter((p) => p.rankIndex <= rankIdx)
}

/**
 * Find one cosmetic by its stable id. Returns null if not found.
 * Pure + deterministic.
 */
export function cosmeticById(id: string): OoReiCosmeticItem | null {
  return ALL_COSMETICS.find((c) => c.id === id) ?? null
}

/**
 * Find one perk by its stable id. Returns null if not found.
 * Pure + deterministic.
 */
export function perkById(id: string): OoReiPerk | null {
  return PERKS.find((p) => p.id === id) ?? null
}

/**
 * The Warden rank index that unlocks a given cosmetic item.
 * Returns null for milestone-gated items (no rank index applies directly).
 * Pure + deterministic.
 */
export function unlockRankIndex(item: OoReiCosmeticItem): number | null {
  return item.unlockCondition.kind === 'rank' ? item.unlockCondition.rankIndex : null
}

/**
 * Human-readable unlock label for the collection grid lock overlay.
 * Returns an empty string for rank-0 items (always unlocked).
 * No em-dashes. Pure + deterministic.
 *
 * @param item the cosmetic item.
 */
export function unlockLabel(item: OoReiCosmeticItem): string {
  const cond = item.unlockCondition
  if (cond.kind === 'rank') {
    if (cond.rankIndex === 0) return ''
    const tier = WARDEN_RANKS[cond.rankIndex]
    return tier ? `Reach ${tier.title} to unlock.` : `Rank ${cond.rankIndex} required.`
  }
  if (cond.kind === 'milestone') return `${cond.label} required.`
  return ''
}

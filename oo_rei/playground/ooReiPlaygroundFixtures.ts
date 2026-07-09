/**
 * ooReiPlaygroundFixtures.ts — Static fixture state for the animation playground.
 *
 * DEV-ONLY. These fixtures produce valid-shaped state that drives every cinematic
 * tier without running any Domain A math or making network calls. They are authored
 * constants that hit the named tiers. Production code NEVER imports this file.
 *
 * Domain boundary: Domain C (presentation only). Zero financial math.
 * No bigint arithmetic in any multiplication/division path.
 * All bigint values here are authored display constants only.
 *
 * Brand: amber/cream/vermillion. ZERO cyan.
 */

import type { ChapterCloseEvent } from '../ooReiProvider'
import type { CinematicTier } from '../ooReiSignatures'

// ─── Cinematic tier display fixtures ─────────────────────────────────────────

/** Win multiplier BPS values for the calligraphy-veil tiers (big/mega).
 *  These are authored constants that hit named tiers — NOT real game math.
 *  big:  9.5x wager  = 95_000n BPS
 *  mega: 23.0x wager = 230_000n BPS
 */
export const FIXTURE_WIN_BPS: Partial<Record<CinematicTier, bigint>> = {
  big:  95_000n,
  mega: 230_000n,
} as const

// ─── Chapter-close region fixtures ────────────────────────────────────────────

/** Four chapter-close events — one per authored region (1–4). Fixture data only. */
export const FIXTURE_CHAPTER_CLOSE_EVENTS: ReadonlyArray<{
  readonly event: ChapterCloseEvent
  readonly sealedSpiritCount: number
  readonly nextRegionVistaSrc: string
  readonly nextRegionId: string
  readonly nextRegionGoalStatement: string
  readonly label: string
}> = [
  {
    label: 'Chapter 1 → 2 (Storm Coast sealed)',
    sealedSpiritCount: 1,
    nextRegionVistaSrc: '/assets/generated/oo-rei/myth/region-tide-shore.jpg',
    nextRegionId: 'tide-shore',
    nextRegionGoalStatement: 'Follow the retreating tide. Still the spirit of shifting water.',
    event: {
      sealedRegionId: 'storm-coast',
      sealedRegionNameEN: 'Storm Coast',
      sealedRegionNameJP: '嵐岸',
      nextRegionNameEN: 'Tide Shore',
      nextRegionNameJP: '潮岸',
      requiresPlayerSeal: true,
    },
  },
  {
    label: 'Chapter 2 → 3 (Tide Shore sealed)',
    sealedSpiritCount: 2,
    nextRegionVistaSrc: '/assets/generated/oo-rei/myth/region-ember-forge.jpg',
    nextRegionId: 'ember-forge',
    nextRegionGoalStatement: 'Descend into the forge valley. Face the spirit of unbroken flame.',
    event: {
      sealedRegionId: 'tide-shore',
      sealedRegionNameEN: 'Tide Shore',
      sealedRegionNameJP: '潮岸',
      nextRegionNameEN: 'Ember Forge',
      nextRegionNameJP: '炎鍛',
      requiresPlayerSeal: true,
    },
  },
  {
    label: 'Chapter 3 → 4 (Ember Forge sealed)',
    sealedSpiritCount: 3,
    nextRegionVistaSrc: '/assets/generated/oo-rei/myth/region-mist-forest.jpg',
    nextRegionId: 'mist-forest',
    nextRegionGoalStatement: 'Enter the ancient forest. Seek the spirit that hides in the mist.',
    event: {
      sealedRegionId: 'ember-forge',
      sealedRegionNameEN: 'Ember Forge',
      sealedRegionNameJP: '炎鍛',
      nextRegionNameEN: 'Mist Forest',
      nextRegionNameJP: '霧林',
      requiresPlayerSeal: true,
    },
  },
  {
    label: 'Chapter 4 → 5 (Mist Forest sealed)',
    sealedSpiritCount: 4,
    nextRegionVistaSrc: '/assets/generated/oo-rei/myth/region-shadow-vale.jpg',
    nextRegionId: 'shadow-vale',
    nextRegionGoalStatement: 'Cross into the shadow vale. Confront the last unsealed spirit.',
    event: {
      sealedRegionId: 'mist-forest',
      sealedRegionNameEN: 'Mist Forest',
      sealedRegionNameJP: '霧林',
      nextRegionNameEN: 'Shadow Vale',
      nextRegionNameJP: '影谷',
      requiresPlayerSeal: true,
    },
  },
] as const

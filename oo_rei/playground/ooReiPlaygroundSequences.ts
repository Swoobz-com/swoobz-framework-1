/**
 * ooReiPlaygroundSequences.ts — Sequence registry for the animation playground.
 *
 * DEV-ONLY. Defines all 13+ sequences the playground can render:
 *   - 3 base win tiers (good / big / mega)
 *   - 6 spirit tiers (spirit-trigger, spirit-finale, spirit-form-1..4)
 *   - 4 chapter-close fixtures (regions 1→2, 2→3, 3→4, 4→5)
 *
 * Each sequence carries: id, label, kind, and the minimal display-fixture fields
 * needed to render it. Production code NEVER imports this file.
 *
 * Brand: amber/cream/vermillion. ZERO cyan.
 */

import type { CinematicTier } from '../ooReiSignatures'
import { FIXTURE_CHAPTER_CLOSE_EVENTS, FIXTURE_WIN_BPS } from './ooReiPlaygroundFixtures'

// ─── Sequence kinds ───────────────────────────────────────────────────────────

/** A cinematic-overlay sequence (good / big / mega / spirit tiers). */
export interface CinematicSequence {
  readonly kind: 'cinematic'
  readonly id: string
  readonly label: string
  readonly tier: Exclude<CinematicTier, 'none' | 'nice'>
  /** BPS multiplier to display (for big/mega only — null for all others). */
  readonly winMultiplierBps: bigint | null
}

/** A chapter-close sequence (one of the 4 authored region fixtures). */
export interface ChapterCloseSequence {
  readonly kind: 'chapter-close'
  readonly id: string
  readonly label: string
  /** Index into FIXTURE_CHAPTER_CLOSE_EVENTS. */
  readonly fixtureIndex: number
}

export type PlaygroundSequence = CinematicSequence | ChapterCloseSequence

// ─── Sequence registry ────────────────────────────────────────────────────────

/** All 13 playground sequences in selector order.
 *  Win tiers first, spirit tiers second, chapter-close last. */
export const PLAYGROUND_SEQUENCES: ReadonlyArray<PlaygroundSequence> = [
  // ── Win tiers (3) ──────────────────────────────────────────────────────────
  {
    kind: 'cinematic',
    id: 'good-win',
    label: 'GOOD WIN (3x). Whisper beat',
    tier: 'good',
    winMultiplierBps: null,
  },
  {
    kind: 'cinematic',
    id: 'big-win',
    label: 'BIG WIN (9.5x). Calligraphy veil',
    tier: 'big',
    winMultiplierBps: FIXTURE_WIN_BPS.big ?? 95_000n,
  },
  {
    kind: 'cinematic',
    id: 'mega-win',
    label: 'MEGA WIN (23x). Calligraphy veil + apex',
    tier: 'mega',
    winMultiplierBps: FIXTURE_WIN_BPS.mega ?? 230_000n,
  },

  // ── Spirit tiers (6) ───────────────────────────────────────────────────────
  {
    kind: 'cinematic',
    id: 'spirit-trigger',
    label: 'SPIRIT AWAKENS. Bonus trigger',
    tier: 'spirit-trigger',
    winMultiplierBps: null,
  },
  {
    kind: 'cinematic',
    id: 'spirit-finale',
    label: 'SPIRIT DEPARTS. Bonus finale',
    tier: 'spirit-finale',
    winMultiplierBps: null,
  },
  {
    kind: 'cinematic',
    id: 'spirit-form-1',
    label: 'SPIRIT FORM 1. STIRRING (揺)',
    tier: 'spirit-form-1',
    winMultiplierBps: null,
  },
  {
    kind: 'cinematic',
    id: 'spirit-form-2',
    label: 'SPIRIT FORM 2. MANIFEST (顕)',
    tier: 'spirit-form-2',
    winMultiplierBps: null,
  },
  {
    kind: 'cinematic',
    id: 'spirit-form-3',
    label: 'SPIRIT FORM 3. RADIANT (輝)',
    tier: 'spirit-form-3',
    winMultiplierBps: null,
  },
  {
    kind: 'cinematic',
    id: 'spirit-form-4',
    label: 'SPIRIT FORM 4. TRANSCENDENT (超)',
    tier: 'spirit-form-4',
    winMultiplierBps: null,
  },

  // ── Chapter-close fixtures (4) ─────────────────────────────────────────────
  ...FIXTURE_CHAPTER_CLOSE_EVENTS.map((fixture, idx) => ({
    kind: 'chapter-close' as const,
    id: `chapter-close-${idx + 1}`,
    label: fixture.label,
    fixtureIndex: idx,
  })),
] as const

/** Look up a sequence by id. Returns undefined if not found. */
export function findSequenceById(id: string): PlaygroundSequence | undefined {
  return PLAYGROUND_SEQUENCES.find((s) => s.id === id)
}

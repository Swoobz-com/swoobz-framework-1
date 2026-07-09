/**
 * pulseCosmetics.ts — the Pulse cosmetics catalog (S2).
 *
 * THE IRON LINE (two-economy rule — non-negotiable):
 *   NOTHING here changes RTP, odds, payout, or EV. The money game is locked in
 *   pulseMath.ts — this module does NOT import it. There are no RTP / odds /
 *   payout / multiplier fields. Every item is a display-only CSS var, data
 *   attribute, or audio loop swap.
 *
 * COLOR DISCIPLINE: Pulse's native accent IS cyan on a cool-dark ground, so —
 * unlike OO-REI's warm theme — cyan is used freely here. The HARD ban is
 * warm+cyan: every trace skin swatch is COOL (cyan / signal-blue / near-white).
 * No wood / parchment / amber / brass / gold ever enters a Pulse cosmetic.
 *
 * SOULBOUND: every item carries soulbound: true + evNeutral: true (the latter a
 * required literal so the compiler enforces the invariant at the type level).
 *
 * Domain: pure model (Domain A discipline — deterministic, fail-closed helpers,
 * no floats, no I/O). Display is Domain C; mint is Domain D. Asset paths are
 * forward references (art generated in a later wave); the UI shows a lock glyph
 * when an asset 404s.
 */
import { PULSE_RANKS } from './pulseRank'

// ─── Base paths (public directory root) ──────────────────────────────────────
const AUDIO_BASE = '/assets/music/pulse' as const

// ─── Cosmetic kinds ───────────────────────────────────────────────────────────
export type PulseCosmeticCategory = 'trace-skin' | 'ambient-track' | 'tape-ledger' | 'hud-frame'

/** What gates a cosmetic: a rank index (0 = always owned). */
export interface PulseUnlockCondition {
  readonly kind: 'rank'
  readonly rankIndex: number
}

/** One collectible Pulse cosmetic (trace-skin, ambient-track, tape, HUD frame). */
export interface PulseCosmeticItem {
  /** Stable identifier. No em-dashes. */
  readonly id: string
  /** Display name in the collection grid. Register-neutral. No em-dashes. */
  readonly name: string
  /** Cosmetic sub-category. */
  readonly category: PulseCosmeticCategory
  /** The single legal benefit kind for ALL cosmetics. */
  readonly benefitKind: 'cosmetic'
  /** Always true — the mint path will NEVER mint a transferable token. */
  readonly soulbound: true
  /** What gates this item. */
  readonly unlockCondition: PulseUnlockCondition
  /**
   * For a trace-skin: the COOL hex the canvas stroke swaps to (CSS var). Absent
   * for non-trace cosmetics. Cool-register only — no warm tone ever.
   */
  readonly swatch?: string
  /**
   * Asset path relative to /public (ambient tracks). Forward reference; may 404
   * until the audio wave completes. Absent for CSS-only cosmetics.
   */
  readonly assetPath?: string
  /** Short collection tooltip. Calm register: steady accrual, never FOMO. */
  readonly description: string
  /** This item NEVER changes RTP / odds / payout. Required literal. */
  readonly evNeutral: true
}

// ─── Trace skins (3 stroke colors — all cool) ─────────────────────────────────
/**
 * TRACE SKINS — a CSS-var swap on the canvas curve stroke. The default
 * (baseline cyan) is granted at rank 1 so the starting trace reads as earned,
 * not given. All swatches are cool (cyan / signal-blue / near-white) — the
 * warm+cyan ban holds by construction.
 */
export const PULSE_TRACE_SKINS: ReadonlyArray<PulseCosmeticItem> = [
  {
    id: 'trace-baseline',
    name: 'Baseline Trace',
    category: 'trace-skin',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 1 },
    swatch: '#29E6FF',
    description: 'The first read is yours. The instrument default, in baseline cyan.',
    evNeutral: true,
  },
  {
    id: 'trace-signal-blue',
    name: 'Signal Blue',
    category: 'trace-skin',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 5 },
    swatch: '#0088CC',
    description: 'A cooler read off the floor. Deep signal-blue on the obsidian field.',
    evNeutral: true,
  },
  {
    id: 'trace-ghost-line',
    name: 'Ghost Line',
    category: 'trace-skin',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 8 },
    swatch: '#E0E8F0',
    description: 'The near-white trace of a desk that has seen every read. Quiet, exact.',
    evNeutral: true,
  },
] as const

// ─── Ambient tracks (3 cool loops) ────────────────────────────────────────────
/**
 * AMBIENT TRACKS — register-neutral ambient loops, switched only in lobby /
 * bet-entry (never on a round outcome). RG-C5: amplitude is a module-const in
 * the audio layer; variation is by selection, never by win / streak / session.
 */
export const PULSE_AMBIENT_TRACKS: ReadonlyArray<PulseCosmeticItem> = [
  {
    id: 'track-default',
    name: 'Vitals Idle',
    category: 'ambient-track',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 0 },
    assetPath: `${AUDIO_BASE}/pondering-the-cosmos.ogg`,
    description: 'The default theme. The resting hum of the instrument station.',
    evNeutral: true,
  },
  {
    id: 'track-frequency-5',
    name: 'Frequency-5',
    category: 'ambient-track',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 5 },
    assetPath: `${AUDIO_BASE}/frequency-5.ogg`,
    description: 'A deeper sub-bass floor for the long sessions. Cool and patient.',
    evNeutral: true,
  },
  {
    id: 'track-void',
    name: 'Void Field',
    category: 'ambient-track',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 8 },
    assetPath: `${AUDIO_BASE}/void-field.ogg`,
    description: 'The chamber observed through dark glass. Wide reverb, single low pulses.',
    evNeutral: true,
  },
] as const

// ─── Instrument cosmetics (the Tape + the HUD frame) ──────────────────────────
export const PULSE_INSTRUMENT_COSMETICS: ReadonlyArray<PulseCosmeticItem> = [
  {
    id: 'tape-ledger',
    name: 'The Tape',
    category: 'tape-ledger',
    benefitKind: 'cosmetic',
    soulbound: true,
    unlockCondition: { kind: 'rank', rankIndex: 2 },
    description: 'A printed archive of your settled rounds, newest first. Read it between rounds.',
    evNeutral: true,
  },
  {
    id: 'hud-frame-bezel',
    name: 'Instrument Bezel Frame',
    category: 'hud-frame',
    benefitKind: 'cosmetic',
    soulbound: true,
    // Rank 6 — matches the bezel's rung in pulseRewards.ts (the reward ladder is
    // authoritative). The EQUIP button now appears at the same rank the showcase
    // promises the reward. (Tim can flip both to 8 if he prefers it bundled with
    // the rank-8 Ghost Line + Void Field cosmetic payoff.)
    unlockCondition: { kind: 'rank', rankIndex: 6 },
    description:
      'A machined corner-pip bezel around the readout. CSS-only; the housing of a fielded rig.',
    evNeutral: true,
  },
] as const

// ─── Derived helpers ──────────────────────────────────────────────────────────

/** All Pulse cosmetics in a single flat catalog (for iteration). */
export const ALL_PULSE_COSMETICS: ReadonlyArray<PulseCosmeticItem> = [
  ...PULSE_TRACE_SKINS,
  ...PULSE_AMBIENT_TRACKS,
  ...PULSE_INSTRUMENT_COSMETICS,
] as const

/**
 * Cosmetics the player owns given their current rank index. Pure + deterministic.
 * Fail-closed: a negative rank yields only the always-owned (rank-0) items.
 */
export function ownedPulseCosmetics(currentRankIndex: number): ReadonlyArray<PulseCosmeticItem> {
  const rankIdx = currentRankIndex >= 0 ? currentRankIndex : 0
  return ALL_PULSE_COSMETICS.filter((item) => item.unlockCondition.rankIndex <= rankIdx)
}

/** Find one cosmetic by its stable id. Returns null if not found. Pure. */
export function pulseCosmeticById(id: string): PulseCosmeticItem | null {
  return ALL_PULSE_COSMETICS.find((c) => c.id === id) ?? null
}

/**
 * Human-readable unlock label for the collection lock overlay. Empty for
 * rank-0 (always owned). No em-dashes, calm register. Pure + deterministic.
 */
export function pulseUnlockLabel(item: PulseCosmeticItem): string {
  const rankIndex = item.unlockCondition.rankIndex
  if (rankIndex === 0) return ''
  const tier = PULSE_RANKS[rankIndex]
  return tier ? `Reach ${tier.titleLab} to unlock.` : `Rank ${rankIndex} required.`
}

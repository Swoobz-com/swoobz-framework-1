/**
 * Reward-showcase config — the GENERIC seam that lets the engagement / rewards
 * tab be reused across games.
 *
 * `PulseUnlockShowcase` renders entirely from a `RewardShowcaseConfig`. Pulse
 * supplies `pulseShowcaseConfig` (the adapter at the bottom of this file). To
 * wire the same showcase to ANOTHER game, a dev only writes a new config object
 * implementing `RewardShowcaseConfig` against that game's rank / reward /
 * cosmetic modules — no changes to the showcase component itself.
 *
 * See the commented `EXAMPLE_OTHER_GAME` template at the bottom for the shape.
 *
 * Domain C: pure data + pure functions. No money math, no payout, no I/O.
 */

// ─── Generic data shapes (structural — a game's richer types satisfy these) ───

export interface ShowcaseRankTier {
  readonly index: number
  /** Display title for the rank (e.g. "COHERENCE-1"). */
  readonly titleLab: string
  /** Fallback unlock description when a rung has no reward object. */
  readonly unlock: string
}

export interface ShowcaseReward {
  /** Display name of the reward at this rung. */
  readonly nftNameLab: string
  /** Category tag shown on the rung (e.g. "COSMETIC", "ACCESS"). */
  readonly benefitKind: string
  /** True when the rung is earned but its platform effect is not yet wired. */
  readonly gatedPendingAttestation?: boolean
}

export interface ShowcaseRewardRung {
  readonly tier: ShowcaseRankTier
  readonly reward: ShowcaseReward | null
}

export interface ShowcaseCosmetic {
  readonly id: string
  readonly name: string
  /** Free-form category string the game defines (drives equip behaviour). */
  readonly category: string
  /** Optional color swatch (rendered for color-type cosmetics). */
  readonly swatch?: string
}

/** Opaque bag of the player's currently-equipped selections, game-defined. */
export type ShowcaseEquipState = Readonly<Record<string, string | boolean | null>>

export interface RewardShowcaseRankView {
  readonly rankIndex: number
  readonly rankTitle: string
  /** Progress to the next rank, in basis points (0–10_000). */
  readonly progressBps: bigint
}

export interface RewardShowcaseLabels {
  /** Plural noun for the soft-points currency, e.g. "signals". */
  readonly pointsTerm: string
  /** Label of the row showing the points total, e.g. "OWNERSHIP POINTS". */
  readonly pointsRowLabel: string
  /** Label of the progression metric, e.g. "ROUNDS PLAYED". */
  readonly progressionMetricLabel: string
  /** Total number of ranks (for "rank N of X"). */
  readonly rankCount: number
}

/**
 * Everything the showcase needs, game-agnostic. A game implements this once.
 */
export interface RewardShowcaseConfig {
  /** Map the progression metric (e.g. lifetime rounds) → current rank + progress. */
  readonly computeRank: (progressionMetric: bigint) => RewardShowcaseRankView
  /** The full rung ladder, ascending. */
  readonly rewardLadder: () => ReadonlyArray<ShowcaseRewardRung>
  /** Every cosmetic in the game (owned or not). */
  readonly allCosmetics: ReadonlyArray<ShowcaseCosmetic>
  /** IDs of cosmetics owned at a given rank index. */
  readonly ownedCosmeticIds: (rankIndex: number) => ReadonlySet<string>
  /** Human label for how a locked cosmetic unlocks. */
  readonly unlockLabel: (item: ShowcaseCosmetic) => string
  /** Can the player equip/unequip this cosmetic? (false → passive/auto-active.) */
  readonly isEquippable: (item: ShowcaseCosmetic) => boolean
  /** Is this cosmetic currently equipped, given the equip state? */
  readonly isEquipped: (item: ShowcaseCosmetic, equip: ShowcaseEquipState) => boolean
  /** Label shown on an owned but non-equippable (passive) cosmetic. */
  readonly passiveLabel: string
  /** Format a points total for display. */
  readonly formatPoints: (n: bigint) => string
  /** Rank index at which the history "Tape" view unlocks. */
  readonly tapeUnlockRank: number
  readonly labels: RewardShowcaseLabels
}

// ─── Pulse adapter ───────────────────────────────────────────────────────────

import {
  ALL_PULSE_COSMETICS,
  ownedPulseCosmetics,
  type PulseCosmeticItem,
  pulseUnlockLabel,
} from './pulseCosmetics'
import { formatPoints } from './pulseMath'
import { computePulseRank, PULSE_RANKS } from './pulseRank'
import { pulseRewardLadder } from './pulseRewards'

/** Pulse equip-state keys the adapter reads out of the opaque equip bag. */
export interface PulseEquipState extends ShowcaseEquipState {
  readonly traceSkinId: string | null
  readonly ambientTrackId: string | null
  readonly hudBezel: boolean
}

export const pulseShowcaseConfig: RewardShowcaseConfig = {
  computeRank: (rounds) => {
    const r = computePulseRank(rounds)
    return { rankIndex: r.tier.index, rankTitle: r.tier.titleLab, progressBps: r.progressBps }
  },
  rewardLadder: () => pulseRewardLadder(),
  allCosmetics: ALL_PULSE_COSMETICS,
  ownedCosmeticIds: (rankIndex) => new Set(ownedPulseCosmetics(rankIndex).map((c) => c.id)),
  unlockLabel: (item) => pulseUnlockLabel(item as unknown as PulseCosmeticItem),
  // Every cosmetic is equippable EXCEPT the tape-ledger, which auto-activates.
  isEquippable: (item) => item.category !== 'tape-ledger',
  isEquipped: (item, equip) => {
    if (item.category === 'trace-skin') return equip.traceSkinId === item.id
    if (item.category === 'ambient-track') return equip.ambientTrackId === item.id
    if (item.category === 'hud-frame') return equip.hudBezel === true
    return false
  },
  passiveLabel: 'ACTIVE IN RECORD',
  formatPoints,
  tapeUnlockRank: 2,
  labels: {
    pointsTerm: 'signals',
    pointsRowLabel: 'OWNERSHIP POINTS',
    progressionMetricLabel: 'ROUNDS PLAYED',
    rankCount: PULSE_RANKS.length,
  },
}

/*
 * ── Template: wiring another game ────────────────────────────────────────────
 * Copy this, point it at your game's modules, and pass it to <PulseUnlockShowcase
 * config={myGameShowcaseConfig} … />. Nothing else in the showcase changes.
 *
 * export const myGameShowcaseConfig: RewardShowcaseConfig = {
 *   computeRank: (xp) => {
 *     const r = computeMyRank(xp)
 *     return { rankIndex: r.index, rankTitle: r.title, progressBps: r.progressBps }
 *   },
 *   rewardLadder: () => MY_REWARD_LADDER,           // [{ tier, reward }]
 *   allCosmetics: MY_COSMETICS,                     // [{ id, name, category, swatch? }]
 *   ownedCosmeticIds: (rank) => new Set(ownedAt(rank).map((c) => c.id)),
 *   unlockLabel: (item) => `Reach rank ${item.unlockRank}`,
 *   isEquippable: (item) => item.category !== 'badge',
 *   isEquipped: (item, equip) => equip[item.category] === item.id,
 *   passiveLabel: 'EARNED',
 *   formatPoints: (n) => n.toLocaleString('en-US'),
 *   tapeUnlockRank: 3,
 *   labels: { pointsTerm: 'sparks', pointsRowLabel: 'SPARKS', progressionMetricLabel: 'GAMES PLAYED', rankCount: 8 },
 * }
 */

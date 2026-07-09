/**
 * pulseRewards.ts — the Operator Rank reward ladder (S2).
 *
 * Each Operator Rank (1-10) grants a CLAIMABLE reward: a soulbound
 * (non-transferable) NFT minted to the player's account, carrying a benefit of
 * exactly one of the three legal kinds. This module is the pure DEFINITION the
 * rewards panel, the claim flow, and the on-chain mint all consume — the single
 * source of truth for "what you grind towards" in Pulse.
 *
 * THE IRON LINE (two-economy rule — non-negotiable):
 *   A reward benefit NEVER changes payout / RTP / odds / EV. The money game
 *   stays exactly as audited (pulseMath.ts). Benefits are:
 *     - 'loyalty'  → advances the platform loyalty tier (rakeback / house-edge
 *                    discount eligibility). MAGNITUDES are owned by the audited
 *                    tiers + revenue-router (SC-035 / ADR-017b) — this module
 *                    declares the KIND + intent only.
 *     - 'cosmetic' → trace-skins (changes the CURVE STROKE COLOR in the canvas),
 *                    the Tape ledger (shows round history in RECORD tab), ambient
 *                    tracks (changes the background music), HUD bezel frame
 *                    (applies a CSS frame around the game canvas).
 *     - 'agency'   → extra BLANK auto-cashout preset slots (player-authored
 *                    cashout targets in BET ENTRY). EV-identical by construction.
 *
 * CRASH-RG FENCE: progression is driven by ROUNDS PLAYED (flat per-round),
 * NOT by wager size (Tim correction #1). Agency rewards add player-authored
 * CHOICES, never risk incentives.
 *
 * SOULBOUND: every reward carries soulbound: true.
 *
 * Domain: Domain C display + spec metadata (Domain A discipline on shape).
 */
import { PULSE_RANKS, type PulseRankTier } from './pulseRank'

/** The benefit category a reward carries. None touch the money math. */
export type PulseBenefitKind = 'loyalty' | 'cosmetic' | 'agency'

/** The cosmetic sub-type a reward unlocks, or 'none' for agency/loyalty. */
export type PulseRewardCosmeticType = 'trace-skin' | 'tape-ledger' | 'hud-frame' | 'none'

/** One claimable Operator reward, granted at a specific rank. */
export interface PulseReward {
  /** The rank index (1-10) that grants this reward. */
  readonly rankIndex: number
  /** Soulbound NFT display name — trading-desk theme variant. */
  readonly nftNameDesk: string
  /** Soulbound NFT display name — cyber-lab / futuristic variant (default surface). */
  readonly nftNameLab: string
  /** Benefit category (never touches payout/RTP). */
  readonly benefitKind: PulseBenefitKind
  /** Cosmetic sub-type unlocked, or 'none'. */
  readonly cosmeticType: PulseRewardCosmeticType
  /** Player-facing benefit line (the "what you get"). Calm register, no em-dashes. */
  readonly benefitLabel: string
  /** Single-line EV proof: why this reward does not change the math. */
  readonly evNeutralProof: string
  /**
   * Always true — Operator reward NFTs are non-transferable (soulbound). The
   * flag is explicit so the mint path cannot mint a transferable token.
   */
  readonly soulbound: true
  /**
   * If true, the reward is GATED behind a solana-blueteam attestation (it must
   * be proven post-settlement rakeback with zero payout-path rank-awareness)
   * before it ships. Until attested, the showcase shows it as locked.
   */
  readonly gatedPendingAttestation?: true
}

/**
 * The reward ladder, aligned 1:1 with PULSE_RANKS index 1..10 (rank 0 is the
 * starting state and grants no claimable reward). Benefits mix the three legal
 * kinds; loyalty rungs reference the tier system without inventing a rate.
 *
 * NAMES + LABELS: every entry says EXACTLY what changes in the HUD.
 * Abstract copy ("Resonance Lock", "Coherence-Apex") is gone.
 */
export const PULSE_REWARDS: ReadonlyArray<PulseReward> = [
  {
    rankIndex: 1,
    nftNameDesk: 'Baseline Trace Skin',
    nftNameLab: 'Baseline Trace Skin',
    benefitKind: 'cosmetic',
    cosmeticType: 'trace-skin',
    benefitLabel:
      'Curve stroke color: equip "Baseline Trace" in COLLECTION → the curve turns electric cyan (#29E6FF).',
    evNeutralProof:
      'CSS var swap on canvas strokeStyle only. Zero contact with settlePayout / deriveCrashBps / RTP.',
    soulbound: true,
  },
  {
    rankIndex: 2,
    nftNameDesk: 'The Tape',
    nftNameLab: 'The Tape',
    benefitKind: 'cosmetic',
    cosmeticType: 'tape-ledger',
    benefitLabel:
      'RECORD tab now shows your last 20 settled rounds: crash point, whether you won, your cashout multiplier.',
    evNeutralProof:
      'Display-only read of state.history. Writes nothing to any math path; history array is read-only in the RECORD tab.',
    soulbound: true,
  },
  {
    rankIndex: 3,
    nftNameDesk: '5th Auto-Cashout Slot',
    nftNameLab: '5th Auto-Cashout Slot',
    benefitKind: 'agency',
    cosmeticType: 'none',
    benefitLabel:
      'BET ENTRY panel: a 5th saved auto-cashout preset slot appears. Ships blank. Set any multiplier target you choose.',
    evNeutralProof:
      'A blank player-authored cashout threshold. settlePayout is identical to a manual cashout at the same multiplier; no EV change.',
    soulbound: true,
  },
  {
    rankIndex: 4,
    nftNameDesk: 'Daily Signal Bonus',
    nftNameLab: 'Daily Signal Bonus',
    benefitKind: 'loyalty',
    cosmeticType: 'none',
    benefitLabel: 'Platform daily login bonus window activates for your account.',
    evNeutralProof:
      'Flat credit drawn from the house-edge share pool per SC-035. Not an RTP change; settlePayout untouched.',
    soulbound: true,
    // Loyalty effect is platform-side (SC-035) and not yet wired — the showcase
    // labels this rung "EARNED · SOON" so the unlock is honest, not hollow.
    gatedPendingAttestation: true,
  },
  {
    rankIndex: 5,
    nftNameDesk: 'Signal Blue Trace + Frequency-5 Track',
    nftNameLab: 'Signal Blue Trace + Frequency-5 Track',
    benefitKind: 'cosmetic',
    cosmeticType: 'trace-skin',
    benefitLabel:
      'COLLECTION: "Signal Blue" trace skin (#0088CC) and "Frequency-5" ambient track both unlock. Tap either to equip.',
    evNeutralProof:
      'CSS var swap on strokeStyle + audio src swap. Both are display/audio only; zero math-path contact.',
    soulbound: true,
  },
  {
    rankIndex: 6,
    nftNameDesk: 'Instrument Bezel Frame',
    nftNameLab: 'Instrument Bezel Frame',
    benefitKind: 'cosmetic',
    cosmeticType: 'hud-frame',
    benefitLabel:
      'COLLECTION: "Instrument Bezel Frame" unlocks. Tap to equip. A machined-corner bezel appears around the game canvas.',
    evNeutralProof:
      'CSS border/box-shadow on the canvas shell. No layout shift; all controls stay at identical positions; no math path reads it.',
    soulbound: true,
  },
  {
    rankIndex: 7,
    nftNameDesk: 'Loyalty Tier Advance',
    nftNameLab: 'Loyalty Tier Advance',
    benefitKind: 'loyalty',
    cosmeticType: 'none',
    benefitLabel: 'Platform loyalty tier advances. Rakeback rate increases.',
    evNeutralProof:
      'Rakeback drawn from house margin share via ADR-017b. Not a change to settlePayout / RTP.',
    soulbound: true,
    // Platform-side (ADR-017b) and not yet wired — labeled "EARNED · SOON".
    gatedPendingAttestation: true,
  },
  {
    rankIndex: 8,
    nftNameDesk: 'Ghost Line Trace + Void Field Track',
    nftNameLab: 'Ghost Line Trace + Void Field Track',
    benefitKind: 'cosmetic',
    cosmeticType: 'trace-skin',
    benefitLabel:
      'COLLECTION: "Ghost Line" trace skin (#E0E8F0 near-white) and "Void Field" ambient track both unlock. Tap either to equip.',
    evNeutralProof:
      'CSS var swap on strokeStyle + audio src swap. All three skins and both extra tracks are now selectable.',
    soulbound: true,
  },
  {
    rankIndex: 9,
    nftNameDesk: '6th Auto-Cashout Slot',
    nftNameLab: '6th Auto-Cashout Slot',
    benefitKind: 'agency',
    cosmeticType: 'none',
    benefitLabel:
      'BET ENTRY panel: a 6th saved auto-cashout preset slot appears. Six targets saved.',
    evNeutralProof:
      'Same proof as the 5th slot: player-authored target; settlePayout identical at the same multiplier.',
    soulbound: true,
  },
  {
    rankIndex: 10,
    nftNameDesk: 'Apex House-Edge Discount',
    nftNameLab: 'Apex House-Edge Discount',
    benefitKind: 'loyalty',
    cosmeticType: 'none',
    benefitLabel: 'Apex tier eligibility: house-edge discount activates on your account.',
    evNeutralProof:
      'Platform-level allocation in ADR-017b revenue-router, not a change to settlePayout / RTP. GATED pending solana-blueteam attestation.',
    soulbound: true,
    gatedPendingAttestation: true,
  },
] as const

/** The reward granted at a rank index, or null (rank 0, or out of range). */
export function rewardForRank(rankIndex: number): PulseReward | null {
  return PULSE_REWARDS.find((r) => r.rankIndex === rankIndex) ?? null
}

/**
 * Rewards the player can CLAIM right now: every reward up to their current rank
 * that has not yet been claimed. Pure + deterministic.
 */
export function claimablePulseRewards(
  currentRankIndex: number,
  claimedRankIndices: ReadonlyArray<number>,
): ReadonlyArray<PulseReward> {
  const claimed = new Set(claimedRankIndices)
  return PULSE_REWARDS.filter((r) => r.rankIndex <= currentRankIndex && !claimed.has(r.rankIndex))
}

/** Reward + the rank tier that grants it (for the rewards-panel ladder view). */
export interface PulseRewardRow {
  readonly tier: PulseRankTier
  readonly reward: PulseReward | null
}

/** The full ladder (tier + its reward) for the Pulse rewards showcase panel. */
export function pulseRewardLadder(): ReadonlyArray<PulseRewardRow> {
  return PULSE_RANKS.map((tier) => ({ tier, reward: rewardForRank(tier.index) }))
}

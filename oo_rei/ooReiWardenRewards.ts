/**
 * ooReiWardenRewards.ts — the Warden Rank reward ladder (D.1 / M2).
 *
 * Each Warden Rank grants a CLAIMABLE reward: a soulbound (non-transferable)
 * Ofuda NFT minted to the player's account, carrying a small-to-medium benefit
 * (Tim 2026-05-30, benefit model: loyalty + cosmetic + agency). This module is
 * the pure DEFINITION the rewards panel, the claim flow, and the on-chain mint
 * all consume — it is the single source of truth for "what you grind towards".
 *
 * THE IRON LINE (RG / licensing — non-negotiable):
 *   A reward benefit NEVER changes the slot's RTP / odds / payout. The money
 *   economy stays 96.94% locked. Benefits are ACCOUNT/LOYALTY or PROGRESSION or
 *   COSMETIC/AGENCY level only:
 *     - 'loyalty'  → advances the platform loyalty tier (rakeback / house-edge
 *                    discount eligibility). MAGNITUDES are owned by the audited
 *                    tiers + revenue-router system (SC-035 / ADR-017b), NOT
 *                    invented here — this module only declares the KIND + intent.
 *     - 'cosmetic' → seal-skins, region music, titles, codex pages.
 *     - 'agency'   → 2nd/3rd ally slot, map-route choice (no EV change).
 *
 * Soulbound: every reward NFT is non-transferable (account-bound identity), to
 * be minted via the originals-collection program. This module owns ZERO on-chain
 * logic and ZERO money math — it is display + spec metadata only. Domain C.
 */

import { WARDEN_RANKS, type WardenRankTier } from './ooReiWardenRank'

/** The benefit category a reward carries. None touch slot RTP/odds. */
export type WardenBenefitKind = 'loyalty' | 'cosmetic' | 'agency'

/** One claimable Warden reward, granted at a specific rank. */
export interface WardenReward {
  /** The rank index (1-based rank N = index N) that grants this reward. */
  readonly rankIndex: number
  /** The soulbound NFT's display name. */
  readonly nftName: string
  /** Kanji glyph for the NFT (Noto Serif JP display register). */
  readonly nftKanji: string
  /** Benefit category (never touches slot RTP). */
  readonly benefitKind: WardenBenefitKind
  /** Player-facing benefit line (the "what you get"). No em-dashes. */
  readonly benefitLabel: string
  /**
   * Always true — Warden reward NFTs are non-transferable (soulbound). The flag
   * is explicit so the mint path (originals-collection) cannot accidentally mint
   * a transferable token.
   */
  readonly soulbound: true
  /**
   * Optional asset path for the reward's preview image in the COLLECTION tab.
   * Forward reference: generated art may not yet exist. The panel renders a
   * lock-glyph placeholder when the image 404s. Domain C display only.
   */
  readonly previewAssetPath?: string
}

/**
 * The reward ladder, aligned 1:1 with WARDEN_RANKS index 1..10 (rank 0 MINARAI
 * is the starting state and grants no claimable reward). Benefits mix the three
 * legal kinds; loyalty rungs reference the tier system without inventing a rate.
 */
export const WARDEN_REWARDS: ReadonlyArray<WardenReward> = [
  { rankIndex: 1,  nftName: 'Plain Ofuda',         nftKanji: '符', benefitKind: 'cosmetic', benefitLabel: 'Seal-skin: the plain ofuda.',                              soulbound: true, previewAssetPath: '/assets/generated/oo-rei/cosmetics/skins/seal-skin-plain-ofuda.png'    },
  { rankIndex: 2,  nftName: 'First Lore Scroll',   nftKanji: '巻', benefitKind: 'cosmetic', benefitLabel: 'Spirit Codex: the first lore page opens.',                 soulbound: true, previewAssetPath: '/assets/generated/oo-rei/cosmetics/codex/codex-spirit-arashi.png'   },
  { rankIndex: 3,  nftName: 'Twin-Ward Talisman',  nftKanji: '結', benefitKind: 'agency',   benefitLabel: 'A second ally slot opens.',                                soulbound: true                                                                                          },
  { rankIndex: 4,  nftName: 'Dawn Offering',       nftKanji: '朝', benefitKind: 'loyalty',  benefitLabel: 'Daily seal-bonus eligibility.',                            soulbound: true                                                                                          },
  { rankIndex: 5,  nftName: 'Vermillion Ofuda',    nftKanji: '朱', benefitKind: 'cosmetic', benefitLabel: 'Seal-skin: the vermillion brush ofuda.',                   soulbound: true, previewAssetPath: '/assets/generated/oo-rei/cosmetics/skins/seal-skin-vermillion-brush.png' },
  { rankIndex: 6,  nftName: 'Wayfarer Seal',       nftKanji: '道', benefitKind: 'agency',   benefitLabel: 'Choose your route at a map fork.',                         soulbound: true                                                                                          },
  { rankIndex: 7,  nftName: 'Warden Crest',        nftKanji: '徽', benefitKind: 'loyalty',  benefitLabel: 'Advances your loyalty tier (rakeback).',                   soulbound: true                                                                                          },
  { rankIndex: 8,  nftName: 'Gold-Leaf Ofuda',     nftKanji: '金', benefitKind: 'cosmetic', benefitLabel: 'Seal-skin: the gold-leaf ofuda.',                          soulbound: true, previewAssetPath: '/assets/generated/oo-rei/cosmetics/skins/seal-skin-gold-leaf.png'      },
  { rankIndex: 9,  nftName: 'Trine-Ward Talisman', nftKanji: '参', benefitKind: 'agency',   benefitLabel: 'A third ally slot opens.',                                 soulbound: true                                                                                          },
  { rankIndex: 10, nftName: 'Seal of Tamashii-Jima', nftKanji: '島', benefitKind: 'loyalty', benefitLabel: "Warden's tier: the house-edge-discount rank.",           soulbound: true, previewAssetPath: '/assets/generated/oo-rei/cosmetics/skins/seal-skin-island-warden.png'  },
] as const

/** The reward granted at a rank index, or null (rank 0, or out of range). */
export function rewardForRank(rankIndex: number): WardenReward | null {
  return WARDEN_REWARDS.find((r) => r.rankIndex === rankIndex) ?? null
}

/**
 * Rewards the player can CLAIM right now: every reward up to their current rank
 * that has not yet been claimed. Pure + deterministic.
 *
 * @param currentRankIndex the player's current Warden rank index.
 * @param claimedRankIndices rank indices already claimed.
 */
export function claimableRewards(
  currentRankIndex: number,
  claimedRankIndices: ReadonlyArray<number>,
): ReadonlyArray<WardenReward> {
  const claimed = new Set(claimedRankIndices)
  return WARDEN_REWARDS.filter(
    (r) => r.rankIndex <= currentRankIndex && !claimed.has(r.rankIndex),
  )
}

/** Reward + the rank tier that grants it (for the rewards-panel ladder view). */
export interface WardenRewardRow {
  readonly tier: WardenRankTier
  readonly reward: WardenReward | null
}

/** The full ladder (tier + its reward) for the Warden Rewards panel. */
export function wardenRewardLadder(): ReadonlyArray<WardenRewardRow> {
  return WARDEN_RANKS.map((tier) => ({ tier, reward: rewardForRank(tier.index) }))
}

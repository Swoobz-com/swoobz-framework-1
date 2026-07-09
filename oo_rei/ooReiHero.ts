/**
 * ooReiHero.ts -- REI Seasonal Evolution hero-stat model.
 *
 * THE TWO-ECONOMY IRON RULE (non-negotiable):
 *   This module is 100% PROGRESSION economy. It does NOT import ooReiMath.ts.
 *   There are NO rtp, odds, payout, or EV fields anywhere in this file.
 *   The compiler enforces this structurally: every exported interface carries
 *   `readonly evNeutral: true` and has no financial field.
 *   Stats are derived ONLY from engagement signals (seals sealed, regions
 *   cleared, days active). They NEVER change symbol pays, bonus frequency,
 *   or any on-chain payout computation.
 *
 * HERO STATS (REI-register names):
 *   Resolve   -- cumulative spirits sealed (capped per season).
 *                Register: 封 (seal / guard). HP analog.
 *   Seal-Power -- regions cleared (capped per season).
 *                Register: 霊 (spirit). Damage analog.
 *   Ward      -- days active (capped per season).
 *                Register: 守 (ward / protect). Armor analog.
 *
 * SEASON ARC:
 *   Season = a numbered cycle. Each season maps to a natural region boss
 *   (Season 1 = ARASHI, Season 2 = SHIO, ..., Season 5 = KAGE).
 *   After Season 5 the cycle wraps to Season 1 of Myth Cycle 2.
 *   Progression within a season is measured in three stats above.
 *   The arc is PURELY COSMETIC / NARRATIVE -- it influences no math.
 *
 * Domain A discipline (engagement accumulation deserves determinism):
 *   - All stat values derived from bigint inputs.
 *   - computeHeroStats is pure, deterministic, fail-closed on negatives.
 *   - All caps are module-const bigints.
 *   - Monotonic: more engagement input never lowers a stat.
 *   - No floats, no I/O, no Date.now(), no Math.random().
 *
 * Points scale: 1 "seal" = 1_000_000n raw points-units
 * (matches POINTS_UNITS_PER_SEAL in ooReiWardenRank.ts).
 */

// ─── Import only engagement/rank primitives -- NEVER ooReiMath ───────────────

import {
  WARDEN_RANKS,
  type WardenRankTier,
  POINTS_UNITS_PER_SEAL,
} from './ooReiWardenRank'
import { MYTH_REGIONS, type MythRegionConfig } from './ooReiMythRegions'

// ─── Season configuration ─────────────────────────────────────────────────────

/** One authored season in the Tamashii-Jima arc. */
export interface SeasonConfig {
  /** 1-based season number. */
  readonly seasonNumber: number
  /** Season display title. No em-dashes. */
  readonly title: string
  /** The region boss id for this season (matches MYTH_REGIONS id). */
  readonly bossSpiritId: string
  /** Boss kanji (single glyph). */
  readonly bossKanji: string
  /** Boss romaji name. */
  readonly bossName: string
  /** Season arc tagline. Calm, mythic register. No em-dashes. */
  readonly arc: string
  /**
   * This season description NEVER changes odds, RTP, or payout.
   * Required field so the compiler enforces EV-neutrality at the type level.
   */
  readonly evNeutral: true
}

/**
 * The five-season natural arc of Tamashii-Jima.
 * Each season closes when the community seals its boss spirit.
 * After Season 5, Cycle 2 begins (same arc at higher register).
 */
export const SEASONS: ReadonlyArray<SeasonConfig> = [
  {
    seasonNumber: 1,
    title: 'Season I: The Storm',
    bossSpiritId: 'storm-coast',
    bossKanji: '嵐',
    bossName: 'ARASHI',
    arc: 'The first spirit breaks loose at the shore. REI stands at the tide line.',
    evNeutral: true,
  },
  {
    seasonNumber: 2,
    title: 'Season II: The Tide',
    bossSpiritId: 'tide-shore',
    bossKanji: '潮',
    bossName: 'SHIO',
    arc: 'The tide carries what the storm leaves. REI waits at low water.',
    evNeutral: true,
  },
  {
    seasonNumber: 3,
    title: 'Season III: The Forge',
    bossSpiritId: 'ember-forge',
    bossKanji: '炎',
    bossName: 'HOMURA',
    arc: 'The forge holds its breath. REI presses her palm to the stone.',
    evNeutral: true,
  },
  {
    seasonNumber: 4,
    title: 'Season IV: The Mist',
    bossSpiritId: 'mist-forest',
    bossKanji: '霧',
    bossName: 'KIRI',
    arc: 'The forest does not part. REI carries the lantern low.',
    evNeutral: true,
  },
  {
    seasonNumber: 5,
    title: 'Season V: The Shadow',
    bossSpiritId: 'shadow-vale',
    bossKanji: '影',
    bossName: 'KAGE',
    arc: 'The oldest shadow on Tamashii-Jima. REI enters without her lantern.',
    evNeutral: true,
  },
] as const

/** Total authored seasons in one myth cycle. */
export const SEASONS_PER_CYCLE = SEASONS.length as 5

// ─── Per-season stat caps ─────────────────────────────────────────────────────

/**
 * Maximum Resolve (seals) a warden can accrue in a single season.
 * Calibrated so a player who clears ~5 regions per season hits the cap
 * naturally; a single-session player is far from cap but has visible progress.
 *
 * NOTE: Token-economist calibration required before Season 1 launch.
 * These are the design-intent values from the synthesis doc §4.1.
 * They are display caps only -- no economic consequence.
 */
export const RESOLVE_CAP_PER_SEASON: bigint = 50n

/**
 * Maximum Seal-Power (regions cleared) a warden can accrue per season.
 * Maps to the 5 authored cycle-1 regions; cycle-2 regions count against the
 * same cap (10 authored regions total over two cycles).
 */
export const SEAL_POWER_CAP_PER_SEASON: bigint = 10n

/**
 * Maximum Ward (days active) a warden can accrue per season.
 * One unit per calendar day. 90 covers a standard ~3-month season window.
 * Note: the day-active counter is kept in the PROGRESSION economy only;
 * it is NOT tied to wager volume or session length.
 */
export const WARD_CAP_PER_SEASON: bigint = 90n

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Floor-clamp a bigint to [0n, cap]. Fail-closed on negative. */
function clampStat(value: bigint, cap: bigint): bigint {
  if (value < 0n) return 0n
  return value > cap ? cap : value
}

/** Progress in BPS (0..10000) for a stat value against its cap. */
function statProgressBps(value: bigint, cap: bigint): bigint {
  if (cap <= 0n) return 10_000n
  const clamped = value > cap ? cap : value < 0n ? 0n : value
  return (clamped * 10_000n) / cap
}

// ─── Hero stat input ──────────────────────────────────────────────────────────

/**
 * All engagement signals needed to compute the hero stats.
 * PURE ENGAGEMENT ECONOMY -- no monetary values.
 *
 * EV-neutrality is structurally enforced: this interface has NO rtp, odds,
 * payout, lamports, wager, or win fields. The compiler rejects any attempt
 * to add them (they would not satisfy the HeroStatInput type contract).
 */
export interface HeroStatInput {
  /**
   * Lifetime spirits sealed (increments on each Transcendent gauge reset).
   * Sourced from ooReiProvider sealedSpiritCount. Non-negative integer.
   */
  readonly lifetimeSeals: number
  /**
   * Lifetime regions cleared. Sourced from MythRegionDerivation.clearedCount.
   * Non-negative integer.
   */
  readonly lifetimeRegionsCleared: number
  /**
   * Days the warden has been active in the current season.
   * One unit per calendar day with at least one spin.
   * Non-negative integer. Season-scoped.
   */
  readonly seasonDaysActive: number
  /**
   * Current Warden rank index (0-10).
   * Sourced from computeWardenRank(lifetimePointsUnits).tier.index.
   */
  readonly currentRankIndex: number
  /**
   * Lifetime raw ownership points (bigint).
   * Sourced from ooReiWardenRank computeWardenRank input.
   */
  readonly lifetimePointsUnits: bigint
}

// ─── Hero stat output ─────────────────────────────────────────────────────────

/** A single resolved hero stat. */
export interface HeroStat {
  /** Display value (bigint, clamped to cap, fail-closed). */
  readonly value: bigint
  /** Cap for the current season. */
  readonly cap: bigint
  /** Progress in BPS (0..10000). Floor-truncated. */
  readonly progressBps: bigint
  /** Display label (Noto Serif JP register). */
  readonly label: string
  /** Kanji glyph (single character). */
  readonly kanji: string
  /** Brief tooltip / description. No em-dashes. */
  readonly description: string
  /** This stat NEVER changes the slot RTP, odds, or payout. */
  readonly evNeutral: true
}

/** The resolved season arc state for the warden. */
export interface SeasonArcState {
  /** Current season config. */
  readonly season: SeasonConfig
  /** Whether this season's boss has been collectively sealed. */
  readonly bossSealed: boolean
  /** Active region id (the region REI is currently in). May be '' if all cleared. */
  readonly currentRegionId: string
  /** The region config the warden is currently traversing, or null if complete. */
  readonly currentRegion: MythRegionConfig | null
  /** How many regions the warden has cleared in this session/season. */
  readonly regionsCleared: number
  /** This arc state NEVER changes the slot RTP, odds, or payout. */
  readonly evNeutral: true
}

/** Fully resolved hero stats + season arc. */
export interface HeroStatsState {
  /** Resolve stat (HP analog): cumulative seals, capped per season. */
  readonly resolve: HeroStat
  /** Seal-Power stat (Damage analog): regions cleared, capped per season. */
  readonly sealPower: HeroStat
  /** Ward stat (Armor analog): days active, capped per season. */
  readonly ward: HeroStat
  /** The current Warden rank tier (sourced from the rank spine). */
  readonly rankTier: WardenRankTier
  /** The current season arc. */
  readonly seasonArc: SeasonArcState
  /**
   * This HeroStatsState NEVER changes slot RTP, odds, or payout.
   * The compiler enforces this: the type has no monetary field;
   * ooReiMath.ts is never imported by this module.
   */
  readonly evNeutral: true
}

// ─── Season resolution ────────────────────────────────────────────────────────

/**
 * Derive the current season from the player's engagement state.
 *
 * Season is determined by the Warden rank tier, following the five-season arc.
 * A player in ranks 0-1 is in Season 1. Each two-rank band advances one season.
 * At rank 10 the warden is in Season 5 (the final boss).
 * This is a display convention; no on-chain season tracking exists in Phase 0.
 *
 * Pure + deterministic. Fail-closed on negative rank (season 1).
 */
export function resolveCurrentSeason(rankIndex: number): SeasonConfig {
  // Fail-closed: negative or invalid rank maps to Season 1.
  const safeRank = rankIndex >= 0 && rankIndex <= 10 ? rankIndex : 0
  // Band: ranks 0-1 -> season 1, 2-3 -> season 2, 4-5 -> season 3,
  //       6-7 -> season 4, 8-10 -> season 5.
  const seasonIndex = Math.min(Math.floor(safeRank / 2), SEASONS_PER_CYCLE - 1)
  return SEASONS[seasonIndex] as SeasonConfig
}

// ─── Main compute function ────────────────────────────────────────────────────

/**
 * Compute the full hero stats state from engagement inputs.
 *
 * EV-NEUTRAL PROOF (structural):
 *   - This function does NOT import ooReiMath.ts.
 *   - Inputs contain NO monetary fields (no lamports, no wager, no payout).
 *   - Outputs contain NO monetary fields (no rtp, no odds, no payout).
 *   - All computation is derived from engagement counters only.
 *   - The caps are presentation limits; they do not affect any math path.
 *   - This function may be called N times with identical inputs and produces
 *     identical outputs (pure, deterministic, no side effects).
 *
 * @param input engagement signals (non-monetary). Fail-closed on negatives.
 * @returns resolved hero stats state. All values are display-only.
 */
export function computeHeroStats(input: HeroStatInput): HeroStatsState {
  // ── Fail-closed clamp on all inputs ────────────────────────────────────────
  const lifeSeals = input.lifetimeSeals > 0 ? input.lifetimeSeals : 0
  const lifeRegions = input.lifetimeRegionsCleared > 0 ? input.lifetimeRegionsCleared : 0
  const seasonDays = input.seasonDaysActive > 0 ? input.seasonDaysActive : 0
  const rankIndex = input.currentRankIndex >= 0 && input.currentRankIndex <= 10
    ? input.currentRankIndex
    : 0

  // ── Rank tier ──────────────────────────────────────────────────────────────
  const rankTier = (WARDEN_RANKS[rankIndex] ?? WARDEN_RANKS[0]) as WardenRankTier

  // ── Season arc ─────────────────────────────────────────────────────────────
  const season = resolveCurrentSeason(rankIndex)

  // Active region: the region corresponding to the next sealed spirit count.
  // The warden is in the ACTIVE region at their current cleared count + 1.
  const activeRegionIndex = lifeRegions < MYTH_REGIONS.length ? lifeRegions : MYTH_REGIONS.length - 1
  const currentRegion = (MYTH_REGIONS[activeRegionIndex] ?? null) as MythRegionConfig | null
  const currentRegionId = currentRegion?.id ?? ''

  // Boss is sealed if the player has cleared the region that hosts the season boss.
  const bossRegion = MYTH_REGIONS.find((r) => r.id === season.bossSpiritId) ?? null
  const bossSealed = bossRegion !== null && lifeRegions >= bossRegion.traversalOrder

  const seasonArc: SeasonArcState = {
    season,
    bossSealed,
    currentRegionId,
    currentRegion,
    regionsCleared: lifeRegions,
    evNeutral: true,
  }

  // ── Resolve (seals, bigint-safe) ────────────────────────────────────────────
  const resolveRaw = BigInt(lifeSeals)
  const resolveValue = clampStat(resolveRaw, RESOLVE_CAP_PER_SEASON)
  const resolveProgressBps = statProgressBps(resolveValue, RESOLVE_CAP_PER_SEASON)

  const resolve: HeroStat = {
    value: resolveValue,
    cap: RESOLVE_CAP_PER_SEASON,
    progressBps: resolveProgressBps,
    label: 'Resolve',
    kanji: '封',
    description: 'Spirits sealed. REI grows steadier with every seal.',
    evNeutral: true,
  }

  // ── Seal-Power (regions cleared, bigint-safe) ───────────────────────────────
  const sealPowerRaw = BigInt(lifeRegions)
  const sealPowerValue = clampStat(sealPowerRaw, SEAL_POWER_CAP_PER_SEASON)
  const sealPowerProgressBps = statProgressBps(sealPowerValue, SEAL_POWER_CAP_PER_SEASON)

  const sealPower: HeroStat = {
    value: sealPowerValue,
    cap: SEAL_POWER_CAP_PER_SEASON,
    progressBps: sealPowerProgressBps,
    label: 'Seal-Power',
    kanji: '霊',
    description: 'Regions traversed. Each spirit sealed deepens her power.',
    evNeutral: true,
  }

  // ── Ward (days active, bigint-safe) ────────────────────────────────────────
  const wardRaw = BigInt(seasonDays)
  const wardValue = clampStat(wardRaw, WARD_CAP_PER_SEASON)
  const wardProgressBps = statProgressBps(wardValue, WARD_CAP_PER_SEASON)

  const ward: HeroStat = {
    value: wardValue,
    cap: WARD_CAP_PER_SEASON,
    progressBps: wardProgressBps,
    label: 'Ward',
    kanji: '守',
    description: 'Days spent on Tamashii-Jima. The island knows her name.',
    evNeutral: true,
  }

  return {
    resolve,
    sealPower,
    ward,
    rankTier,
    seasonArc,
    evNeutral: true,
  }
}

// ─── Convenience: did any stat increase between two states? ──────────────────

/**
 * Returns true if any hero stat value increased between prev and next.
 * Used by the panel to highlight new stat gains. Pure + deterministic.
 */
export function anyStatGained(prev: HeroStatsState, next: HeroStatsState): boolean {
  return (
    next.resolve.value > prev.resolve.value ||
    next.sealPower.value > prev.sealPower.value ||
    next.ward.value > prev.ward.value
  )
}

// ─── Season display helpers ───────────────────────────────────────────────────

/**
 * Format the season arc headline for the HERO panel.
 * Returns a two-line string: [season title, boss name + kanji].
 * No em-dashes. Pure + deterministic.
 */
export function seasonHeadline(arc: SeasonArcState): { line1: string; line2: string } {
  const boss = arc.bossSealed
    ? `${arc.season.bossKanji} ${arc.season.bossName} SEALED`
    : `${arc.season.bossKanji} ${arc.season.bossName} AWAITS`
  return {
    line1: arc.season.title,
    line2: boss,
  }
}

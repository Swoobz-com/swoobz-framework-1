/**
 * OO-REI Region Archetypes — the "biome perk" system (Tim 2026-05-30).
 *
 * Each Myth-of-REI region belongs to one of THREE archetypes (SURGE / FORGE /
 * DRIFT) that give the region a distinct FEEL and a genuine stay-or-go trade —
 * "just like actual AAA games" (Hades biomes / Diablo zones). A player grinds the
 * current region for its perk, or advances to trade it for the next region's.
 *
 * THE IRON CONSTRAINT (Domain A / RG): cash RTP MUST stay 96% in EVERY region.
 * This is guaranteed STRUCTURALLY, not by tuning: the cash path
 * (`evaluateSpin` → `totalPayBps` → `bpsToLamports`) takes NO region argument and
 * reads ONLY the shared `REEL_STRIPS` / `SYMBOL_PAYS` / `PAYLINES`. Those are
 * byte-identical for every region ⇒ identical BigInt payout, by construction.
 *
 * Region archetypes touch ONLY the EV-NEUTRAL layers:
 *   - ownership-points yield (the loyalty/"seals" ledger. Never summed into a cash win)
 *   - gauge-fill rate (the Spirit Evolution meter — pays no USDC)
 *   - which spirit themes the Spirit Sealing bonus (pure display metadata)
 *   - cosmetic symbol skin key (resolved in the render layer; SymbolId 0-7 unchanged)
 * None of these can raise cash RTP above 100% because none reaches a payout path.
 *
 * Domain B: pure lookup + BPS-typed multipliers. Multipliers are `bigint` BPS
 * (10_000n = 1.0x) even though they feed the meter, so the type system forbids a
 * future float leak. Fail-closed on unknown regions.
 */

import { BPS_DENOM } from './ooReiMath'

export type RegionArchetype = 'SURGE' | 'FORGE' | 'DRIFT'

export interface ArchetypeConfig {
  readonly key: RegionArchetype
  /** Render-layer sprite selector for the cosmetic symbol skins (art pipeline). */
  readonly skinKey: 'surge' | 'forge' | 'drift'
  /** Which SPIRIT_PROCESSION element themes the Spirit Sealing bonus here. */
  readonly bonusSpiritIndex: 0 | 1 | 2 | 3 | 4
  /** Multiplier on ownership points (seals) for WIN spins. BPS, 10_000n = 1.0x. */
  readonly pointsWinMulBps: bigint
  /** Multiplier on ownership points (seals) for LOSS spins. BPS. */
  readonly pointsLossMulBps: bigint
  /** Extra multiplier on the gauge-fill contribution. BPS. */
  readonly gaugeFillMulBps: bigint
  // ── Display (HUD badge + Myth-map NOW/NEXT) ──
  /** Short archetype name shown on the badge pill. */
  readonly label: RegionArchetype
  /** One-line perk summary in the player's vocabulary ("seals" = points). */
  readonly perkSummary: string
  // ── Spirit Ally identity (chapter-close choose-ally cards) ──
  /** The ally's given name (REI-style character that carries this perk). */
  readonly allyName: string
  /** The ally's epithet / title. */
  readonly allyTitle: string
  /** One sentence of who the ally is — sits under the name on the card. */
  readonly allyTagline: string
  /** Public path to the ally's REI-style portrait (fal, seed 84729x). */
  readonly portraitSrc: string
  /** Card accent hex — sits ONLY on the dark-ink card (never on a warm ground). */
  readonly accentHex: string
}

// The three archetype configs. SURGE's 1.75x effective on-loss yield is encoded
// as a multiplier ON the already-1.5x base loss yield:
//   1.5 (base, POINTS_MULTIPLIER_LOSS_BPS) × 1.1667 (this) ≈ 1.75× effective.
//   11_667n = round(1.75 / 1.5 × 10_000) — floor-safe, house-favored.
export const ARCHETYPE_CONFIGS: Readonly<Record<RegionArchetype, ArchetypeConfig>> = {
  SURGE: {
    key: 'SURGE', skinKey: 'surge', bonusSpiritIndex: 0,
    pointsWinMulBps: 10_000n,
    pointsLossMulBps: 11_667n, // 1.5× base × 1.1667 ≈ 1.75× effective seals on a loss
    gaugeFillMulBps: 10_000n,
    label: 'SURGE', perkSummary: '+75% SEALS ON LOSS',
    allyName: 'Kaen', allyTitle: 'Ember Warden',
    allyTagline: 'Turns every loss into power. Your seals surge when a spin goes cold.',
    portraitSrc: '/assets/generated/oo-rei/allies/kaen-ember-warden.png',
    accentHex: '#d8472b',
  },
  FORGE: {
    key: 'FORGE', skinKey: 'forge', bonusSpiritIndex: 2,
    pointsWinMulBps: 10_000n,
    pointsLossMulBps: 10_000n,
    gaugeFillMulBps: 12_500n, // spirit gauge fills 1.25× faster — reach the bonus sooner
    label: 'FORGE', perkSummary: 'SPIRIT GAUGE +25%',
    allyName: 'Tetsu', allyTitle: 'Anvil Smith',
    allyTagline: 'Quickens the spirit forge. Your Evolution gauge fills a quarter faster.',
    portraitSrc: '/assets/generated/oo-rei/allies/tetsu-anvil-smith.png',
    accentHex: '#c4631f',
  },
  DRIFT: {
    key: 'DRIFT', skinKey: 'drift', bonusSpiritIndex: 1,
    pointsWinMulBps: 12_500n, // +25% seals when you win — rewards proficient play
    pointsLossMulBps: 10_000n,
    gaugeFillMulBps: 10_000n,
    label: 'DRIFT', perkSummary: '+25% SEALS ON WIN',
    allyName: 'Suzu', allyTitle: 'Tidedancer',
    allyTagline: 'Rewards the clean strike. Your seals rise a quarter higher on every win.',
    portraitSrc: '/assets/generated/oo-rei/allies/suzu-tidedancer.png',
    accentHex: '#3f8a93',
  },
} as const

/**
 * The ordered ally roster shown on the chapter-close choose-ally cards. Three
 * choices — one per archetype — offered on EVERY region clear so the player
 * picks the perk that fits how they want to play the next region. Order is
 * fixed (module-const) so the layout never shifts and the choice is not
 * sequenced by any session/streak value (RG-C5).
 */
export const ALLY_CHOICES: readonly ArchetypeConfig[] = [
  ARCHETYPE_CONFIGS.SURGE,
  ARCHETYPE_CONFIGS.FORGE,
  ARCHETYPE_CONFIGS.DRIFT,
] as const

/**
 * Resolve an archetype key to its config. FAIL-CLOSED: an unrecognised key
 * throws — a defaulted perk multiplier is an accumulation-poisoning vector.
 */
export function getArchetypeConfig(key: RegionArchetype): ArchetypeConfig {
  const cfg = ARCHETYPE_CONFIGS[key]
  if (cfg === undefined) {
    throw new Error(`getArchetypeConfig: unknown archetype key "${key}"`)
  }
  return cfg
}

// ─── Per-region ally rosters (Tim 2026-05-30) ─────────────────────────────────
// The three allies are THEMED PER UNLOCKED REGION — a storm region offers storm
// spirits, a forge region offers fire spirits, etc. Each ally still maps to ONE
// of the three EV-neutral archetypes, so the PERK math is unchanged and cash RTP
// stays 96% in every region. Only the character art + names + flavor differ.
export interface AllyChoice {
  /** The EV-neutral perk this ally grants (drives applyArchetype* + the pill). */
  readonly archetype: RegionArchetype
  readonly name: string
  readonly title: string
  readonly tagline: string
  /** Public path to the ally's REI-style portrait (fal). */
  readonly portraitSrc: string
  /** Card accent hex — sits ONLY on the dark-ink card (never on a warm ground). */
  readonly accentHex: string
}

const ALLY = '/assets/generated/oo-rei/allies'

// Rosters keyed by the MythRegionConfig.id of the region being ENTERED (the next
// region a chapter-close reveals). Each is [SURGE, FORGE, DRIFT] in a fixed order
// (module-const — never sequenced by session value, RG-C5).
export const REGION_ALLY_ROSTERS: Readonly<Record<string, readonly AllyChoice[]>> = {
  // Tide Shore — water spirits (teal)
  'tide-shore': [
    { archetype: 'SURGE', name: 'Ranami', title: 'Riptide Warden', portraitSrc: `${ALLY}/ranami-riptide-warden.png`, accentHex: '#2f8e97',
      tagline: 'The tide turns hardest at the ebb. Your seals surge when a spin runs cold.' },
    { archetype: 'FORGE', name: 'Shiotetsu', title: 'Coral Smith', portraitSrc: `${ALLY}/shiotetsu-coral-smith.png`, accentHex: '#3a9aa0',
      tagline: 'Tempers spirit in the tide-pool forge. Your Evolution gauge fills a quarter faster.' },
    { archetype: 'DRIFT', name: 'Suzu', title: 'Tidedancer', portraitSrc: `${ALLY}/suzu-tidedancer.png`, accentHex: '#3f8a93',
      tagline: 'Rewards the clean strike. Your seals rise a quarter higher on every win.' },
  ],
  // Ember Forge — fire spirits (ember / orange)
  'ember-forge': [
    { archetype: 'SURGE', name: 'Kaen', title: 'Ember Warden', portraitSrc: `${ALLY}/kaen-ember-warden.png`, accentHex: '#d8472b',
      tagline: 'Turns every loss into power. Your seals surge when a spin goes cold.' },
    { archetype: 'FORGE', name: 'Tetsu', title: 'Anvil Smith', portraitSrc: `${ALLY}/tetsu-anvil-smith.png`, accentHex: '#c4631f',
      tagline: 'Quickens the spirit forge. Your Evolution gauge fills a quarter faster.' },
    { archetype: 'DRIFT', name: 'Honomai', title: 'Cinder Dancer', portraitSrc: `${ALLY}/honomai-cinder-dancer.png`, accentHex: '#e07a32',
      tagline: 'Dances the clean flame. Your seals rise a quarter higher on every win.' },
  ],
  // Mist Forest — forest spirits (jade-green)
  'mist-forest': [
    { archetype: 'SURGE', name: 'Kiriga', title: 'Bramble Warden', portraitSrc: `${ALLY}/kiriga-bramble-warden.png`, accentHex: '#5f9e6b',
      tagline: 'Thorns grow thickest in hard soil. Your seals surge when a spin runs cold.' },
    { archetype: 'FORGE', name: 'Mokugen', title: 'Grove Smith', portraitSrc: `${ALLY}/mokugen-grove-smith.png`, accentHex: '#6f9a4f',
      tagline: 'Stokes the hollow-log forge. Your Evolution gauge fills a quarter faster.' },
    { archetype: 'DRIFT', name: 'Kasumi', title: 'Mist Dancer', portraitSrc: `${ALLY}/kasumi-mist-dancer.png`, accentHex: '#7faf8c',
      tagline: 'Looses the perfect arrow. Your seals rise a quarter higher on every win.' },
  ],
  // Shadow Vale — shadow spirits (violet)
  'shadow-vale': [
    { archetype: 'SURGE', name: 'Yami', title: 'Dusk Warden', portraitSrc: `${ALLY}/yami-dusk-warden.png`, accentHex: '#8a6fc0',
      tagline: 'Darkness deepens with every fall. Your seals surge when a spin runs cold.' },
    { archetype: 'FORGE', name: 'Kagetsuchi', title: 'Onyx Smith', portraitSrc: `${ALLY}/kagetsuchi-onyx-smith.png`, accentHex: '#7a63b8',
      tagline: 'Forges in cold shadow-flame. Your Evolution gauge fills a quarter faster.' },
    { archetype: 'DRIFT', name: 'Tsukiyo', title: 'Moonshadow Dancer', portraitSrc: `${ALLY}/tsukiyo-moonshadow-dancer.png`, accentHex: '#9a82c8',
      tagline: 'Strikes by moonlight. Your seals rise a quarter higher on every win.' },
  ],
} as const

// Fallback for any region without an explicit roster (e.g. the start region or a
// not-yet-authored cycle-2 region). Cosmetic + EV-neutral, so a default trio is
// safe — the perk is still the archetype. Reuses the founding three portraits.
export const DEFAULT_ALLY_ROSTER: readonly AllyChoice[] = [
  { archetype: 'SURGE', name: 'Kaen', title: 'Ember Warden', portraitSrc: `${ALLY}/kaen-ember-warden.png`, accentHex: '#d8472b',
    tagline: 'Turns every loss into power. Your seals surge when a spin goes cold.' },
  { archetype: 'FORGE', name: 'Tetsu', title: 'Anvil Smith', portraitSrc: `${ALLY}/tetsu-anvil-smith.png`, accentHex: '#c4631f',
    tagline: 'Quickens the spirit forge. Your Evolution gauge fills a quarter faster.' },
  { archetype: 'DRIFT', name: 'Suzu', title: 'Tidedancer', portraitSrc: `${ALLY}/suzu-tidedancer.png`, accentHex: '#3f8a93',
    tagline: 'Rewards the clean strike. Your seals rise a quarter higher on every win.' },
]

/** The themed ally trio for the region being entered (next region). Falls back
 *  to the founding trio for unknown/unauthored regions. */
export function getAllyRoster(regionId: string): readonly AllyChoice[] {
  return REGION_ALLY_ROSTERS[regionId] ?? DEFAULT_ALLY_ROSTER
}

// Every region id maps to an archetype. Cycle-2 regions inherit thematically so
// the verification surface stays at THREE configs, not ten. Keys are the exact
// `MythRegionConfig.id` values from ooReiMythRegions.
const REGION_ARCHETYPE: Readonly<Record<string, RegionArchetype>> = {
  // Cycle 1 (authored)
  'storm-coast': 'SURGE',
  'shadow-vale': 'SURGE',
  'ember-forge': 'FORGE',
  'tide-shore': 'DRIFT',
  'mist-forest': 'DRIFT',
  // Cycle 2 (inherit by elemental mood)
  'cycle2-bamboo-grove': 'DRIFT',
  'cycle2-river-delta': 'DRIFT',
  'cycle2-burial-mounds': 'SURGE',
  'cycle2-frozen-highland': 'SURGE',
  'cycle2-spirit-gate': 'FORGE',
} as const

/**
 * Resolve a region id to its archetype config. FAIL-CLOSED: an unknown region
 * THROWS — it must never silently default, because a defaulted multiplier is an
 * accumulation-poisoning vector. The all-cleared sentinel ('') is NOT a region;
 * callers handle it explicitly before calling (see getActiveArchetypeOrNull).
 */
export function getRegionArchetype(regionId: string): ArchetypeConfig {
  if (typeof regionId !== 'string' || regionId.length === 0) {
    throw new Error('getRegionArchetype: regionId must be a non-empty string')
  }
  const key = REGION_ARCHETYPE[regionId]
  if (key === undefined) {
    throw new Error(`getRegionArchetype: unknown regionId "${regionId}"`)
  }
  const cfg = ARCHETYPE_CONFIGS[key]
  if (cfg === undefined) {
    throw new Error(`getRegionArchetype: missing config for archetype "${key}"`)
  }
  return cfg
}

/**
 * Safe accessor for the active region: returns null for the all-cleared sentinel
 * (''). A legitimate post-cycle state, not an error. But still THROWS for a
 * genuinely unknown non-empty id (fail-closed preserved).
 */
export function getActiveArchetypeOrNull(regionId: string): ArchetypeConfig | null {
  if (regionId === '') return null
  return getRegionArchetype(regionId)
}

/**
 * Scale a base ownership-points (seals) amount by the active archetype's
 * win/loss multiplier. Floor truncation (house-favored). EV-neutral: ownership
 * points are the loyalty ledger and are NEVER summed into a cash win, so this
 * cannot change cash RTP. A null archetype (all-cleared) returns the base.
 */
export function applyArchetypePoints(
  basePoints: bigint,
  archetype: ArchetypeConfig | null,
  didWin: boolean,
): bigint {
  if (basePoints < 0n) throw new Error('applyArchetypePoints: basePoints cannot be negative')
  if (archetype === null) return basePoints
  const mulBps = didWin ? archetype.pointsWinMulBps : archetype.pointsLossMulBps
  return (basePoints * mulBps) / BPS_DENOM // floor — house-favored
}

/**
 * Scale a points amount by the active archetype's gauge-fill multiplier to get
 * the value FED TO the Spirit gauge. Floor truncation. EV-neutral: the gauge
 * credits no USDC, so a faster fill cannot change cash RTP. Null → base.
 */
export function applyArchetypeGaugeFill(
  points: bigint,
  archetype: ArchetypeConfig | null,
): bigint {
  if (points < 0n) throw new Error('applyArchetypeGaugeFill: points cannot be negative')
  if (archetype === null) return points
  return (points * archetype.gaugeFillMulBps) / BPS_DENOM // floor — house-favored
}

/**
 * OO-Fisher cosmetic & EV-neutral perk catalog.
 *
 * Everything here is bought with SCALES (the gear-credit meta-currency) and is
 * strictly EV-NEUTRAL: cosmetics change only how the boat/line/celebration LOOK,
 * and perks change only convenience/information — none of them touches odds,
 * payout, or the wager balance, so RTP is provably untouched. Ownership/equip
 * state lives in the UI layer (localStorage); this module is pure data.
 *
 * Prices are authored in SCALES and stored as lamports (1 scale = 0.10 USDC of
 * stash value, matching `formatScales` in ooFisherMath).
 */

export type CosmeticCategory = 'boat-hull' | 'boat-flag' | 'line-tint' | 'celebration' | 'perk'

export interface FlagValue {
  readonly color: string
  /** Simple drawn design — keeps the flag tasteful, no asset needed. */
  readonly design: 'none' | 'pennant' | 'stripe' | 'sunburst' | 'marlin'
}

export interface CosmeticItem {
  readonly id: string
  readonly category: CosmeticCategory
  readonly name: string
  readonly blurb: string
  /** Price in scales (display) — `priceLamports` is the real cost. */
  readonly priceScales: number
  readonly priceLamports: bigint
  /** Preview swatch color for the shop chip. */
  readonly swatch: string
  /** Free baseline of its category (always owned, can't be bought). */
  readonly isDefault?: boolean
  /** Category-specific applied value. */
  readonly hull?: string
  readonly flag?: FlagValue
  readonly tintRgb?: string
  readonly celebration?: 'classic' | 'golden' | 'crimson' | 'verdigris'
  readonly perk?: 'precision-readout' | 'trophy-wall'
}

const SCALE_LAMPORTS = 100_000n
const scales = (n: number): bigint => BigInt(n) * SCALE_LAMPORTS

const item = (
  partial: Omit<CosmeticItem, 'priceLamports'> & { priceScales: number },
): CosmeticItem => ({ ...partial, priceLamports: scales(partial.priceScales) })

// ─── Boat hull colors (warm engraved-instrument register) ────────────────────
const HULLS: CosmeticItem[] = [
  item({ id: 'hull-walnut', category: 'boat-hull', name: 'Classic Walnut', blurb: 'The maiden hull.', priceScales: 0, swatch: '#6c4628', isDefault: true, hull: '#6c4628' }),
  item({ id: 'hull-ebony', category: 'boat-hull', name: 'Ebony', blurb: 'Blackened oak, brass trim.', priceScales: 400, swatch: '#241a12', hull: '#241a12' }),
  item({ id: 'hull-crimson', category: 'boat-hull', name: 'Crimson Lacquer', blurb: 'Lacquered deep red.', priceScales: 700, swatch: '#7a2418', hull: '#7a2418' }),
  item({ id: 'hull-verdigris', category: 'boat-hull', name: 'Verdigris', blurb: 'Aged copper-green.', priceScales: 900, swatch: '#2f5d4f', hull: '#2f5d4f' }),
  item({ id: 'hull-bone', category: 'boat-hull', name: 'Bone White', blurb: 'Bleached driftwood.', priceScales: 1200, swatch: '#cdbfa6', hull: '#cdbfa6' }),
]

// ─── Boat flags (drawn, no assets) ───────────────────────────────────────────
const FLAGS: CosmeticItem[] = [
  item({ id: 'flag-none', category: 'boat-flag', name: 'No Flag', blurb: 'A bare mast.', priceScales: 0, swatch: 'transparent', isDefault: true, flag: { color: '#000000', design: 'none' } }),
  item({ id: 'flag-amber-pennant', category: 'boat-flag', name: 'Amber Pennant', blurb: 'A warm forked pennant.', priceScales: 250, swatch: '#f0c674', flag: { color: '#f0c674', design: 'pennant' } }),
  item({ id: 'flag-crimson-stripe', category: 'boat-flag', name: 'Crimson Stripe', blurb: 'Two-bar racing flag.', priceScales: 450, swatch: '#c0392b', flag: { color: '#c0392b', design: 'stripe' } }),
  item({ id: 'flag-sunburst', category: 'boat-flag', name: 'Sunburst', blurb: 'A rising-sun banner.', priceScales: 700, swatch: '#ffb347', flag: { color: '#ffb347', design: 'sunburst' } }),
  item({ id: 'flag-marlin', category: 'boat-flag', name: 'Marlin Crest', blurb: 'For the trophy hunters.', priceScales: 1000, swatch: '#3a6ea5', flag: { color: '#3a6ea5', design: 'marlin' } }),
]

// ─── Line / water tint ───────────────────────────────────────────────────────
const TINTS: CosmeticItem[] = [
  item({ id: 'tint-amber', category: 'line-tint', name: 'Amber Line', blurb: 'The default brass line.', priceScales: 0, swatch: '#ffd27a', isDefault: true, tintRgb: '255,210,122' }),
  item({ id: 'tint-teal', category: 'line-tint', name: 'Deep Teal', blurb: 'Cool reef water.', priceScales: 300, swatch: '#2aa7a0', tintRgb: '42,167,160' }),
  item({ id: 'tint-rose', category: 'line-tint', name: 'Coral Rose', blurb: 'Sunset on the water.', priceScales: 450, swatch: '#e8748c', tintRgb: '232,116,140' }),
  item({ id: 'tint-gold', category: 'line-tint', name: 'Molten Gold', blurb: 'A gilded line.', priceScales: 800, swatch: '#f5c542', tintRgb: '245,197,66' }),
]

// ─── Celebration skins (tasteful tint variants — no particles) ───────────────
const CELEBRATIONS: CosmeticItem[] = [
  item({ id: 'cel-classic', category: 'celebration', name: 'Classic Catch', blurb: 'The rarity-tinted reveal.', priceScales: 0, swatch: '#ffd27a', isDefault: true, celebration: 'classic' }),
  item({ id: 'cel-golden', category: 'celebration', name: 'Golden Haul', blurb: 'A warm gold wash on every catch.', priceScales: 600, swatch: '#f5c542', celebration: 'golden' }),
  item({ id: 'cel-crimson', category: 'celebration', name: 'Crimson Strike', blurb: 'A deep-red catch flash.', priceScales: 600, swatch: '#c0392b', celebration: 'crimson' }),
  item({ id: 'cel-verdigris', category: 'celebration', name: 'Tidewater', blurb: 'A sea-green catch glow.', priceScales: 900, swatch: '#2f5d4f', celebration: 'verdigris' }),
]

// ─── EV-neutral perks (info / convenience only — never odds) ──────────────────
const PERKS: CosmeticItem[] = [
  item({ id: 'perk-precision', category: 'perk', name: 'Precision Readout', blurb: 'Shows the exact catch-chance % in the cast preview. Information only — does not change the odds.', priceScales: 500, swatch: '#9ccfd8', perk: 'precision-readout' }),
  item({ id: 'perk-trophy', category: 'perk', name: 'Trophy Wall', blurb: 'Tracks your biggest-ever catch on the lobby card. Bragging rights, nothing more.', priceScales: 400, swatch: '#d4a04a', perk: 'trophy-wall' }),
]

export const ALL_COSMETICS: ReadonlyArray<CosmeticItem> = [
  ...HULLS,
  ...FLAGS,
  ...TINTS,
  ...CELEBRATIONS,
  ...PERKS,
]

export const COSMETIC_CATEGORIES: ReadonlyArray<{ key: CosmeticCategory; label: string }> = [
  { key: 'boat-hull', label: 'HULL' },
  { key: 'boat-flag', label: 'FLAG' },
  { key: 'line-tint', label: 'LINE' },
  { key: 'celebration', label: 'CATCH FX' },
  { key: 'perk', label: 'PERKS' },
]

export function cosmeticById(id: string): CosmeticItem | undefined {
  return ALL_COSMETICS.find((c) => c.id === id)
}

export function cosmeticsByCategory(cat: CosmeticCategory): ReadonlyArray<CosmeticItem> {
  return ALL_COSMETICS.filter((c) => c.category === cat)
}

/** The free default item id for an equippable category (null for perks). */
export function defaultCosmeticId(cat: CosmeticCategory): string | null {
  return ALL_COSMETICS.find((c) => c.category === cat && c.isDefault)?.id ?? null
}

export type EquippedCosmetics = {
  'boat-hull': string
  'boat-flag': string
  'line-tint': string
  'celebration': string
}

export const DEFAULT_EQUIPPED: EquippedCosmetics = {
  'boat-hull': 'hull-walnut',
  'boat-flag': 'flag-none',
  'line-tint': 'tint-amber',
  'celebration': 'cel-classic',
}

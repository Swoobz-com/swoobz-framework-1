/**
 * ooReiLayout — layout system for The Myth of REI.
 *
 * Spacing scale, breakpoint thresholds, zone heights, and the LAYOUT_CONFIG
 * parametric table. This module is the SINGLE SOURCE OF TRUTH for all layout
 * measurements in OO-REI. Every inline-style px value in the HUD band, header,
 * and modals must reference one of these tokens.
 *
 * Domain C: presentation only — zero financial arithmetic.
 *
 * Responsive-interface-plan 2026-05-31:
 *   Move 1  — 7-step spacing scale (SP)
 *   Move 2  — 4-tier breakpoint system (xs/sm/md/lg)
 *   Move 3  — Zone height custom properties per tier
 *   Move 4  — LAYOUT_CONFIG (rail column/area/padding/heights)
 *
 * RG-C5: all timing values remain module-level consts in OoReiExperience.tsx.
 * This module contains NO timing values — it is purely spatial.
 */

// ─── Spacing scale (SP) ──────────────────────────────────────────────────────
// 7 tokens. Every layout px value must use one of these.
// Named via object so search is trivial: `SP[8]` is findable, `8` is not.

export const SP = {
  2: 2,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  24: 24,
  32: 32,
} as const satisfies Record<number, number>

// ─── Typography scale ─────────────────────────────────────────────────────────
// 4 levels. All display/narrative text: Noto Serif JP.
// All numeric/label text: Geist Mono. Geist Sans is BANNED on OO-REI.

export const TYPE = {
  display: {
    fontFamily: '"Noto Serif JP", "Yu Mincho", serif',
    fontSize: 'clamp(22px, 4vw, 30px)',
    fontWeight: 900,
    letterSpacing: 'normal',
  },
  label: {
    fontFamily: '"Geist Mono", ui-monospace, monospace',
    fontSize: 'clamp(11px, 1.4vw, 13px)',
    fontWeight: 600,
    letterSpacing: '0.08em',
  },
  value: {
    fontFamily: '"Geist Mono", ui-monospace, monospace',
    fontSize: 'clamp(13px, 1.8vw, 16px)',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  meta: {
    fontFamily: '"Geist Mono", ui-monospace, monospace',
    fontSize: 'clamp(10px, 1.2vw, 11px)',
    fontWeight: 400,
    letterSpacing: '0.14em',
  },
} as const

// ─── Breakpoint thresholds ────────────────────────────────────────────────────
// 4 named tiers. Content-derived, not device-guessed.
// The old `481 / 901` split is RETIRED.

export type LayoutTier = 'xs' | 'sm' | 'md' | 'lg'

export const BP = {
  /** xs: 0 – 480px (phone portrait, small phone) */
  SM_MIN: 481,
  /** sm: 481 – 767px (phone landscape, phablet) */
  MD_MIN: 768,
  /** md: 768 – 1023px (tablet portrait, large tablet) */
  LG_MIN: 1024,
} as const

/**
 * Classify a container width into the four layout tiers.
 * Replaces the three separate `isMobile / isTablet / isNarrowTablet` booleans.
 */
export function classifyTier(width: number): LayoutTier {
  if (width < BP.SM_MIN) return 'xs'
  if (width < BP.MD_MIN) return 'sm'
  if (width < BP.LG_MIN) return 'md'
  return 'lg'
}

// ─── Zone heights (CSS custom property values) ────────────────────────────────
// --header-h and --rail-h are the ONLY height values that need to be set per tier.
// Everything else is derived from these two.

export const ZONE_HEIGHTS: Record<LayoutTier, { headerH: number; railH: number }> = {
  xs: { headerH: 56, railH: 200 },
  sm: { headerH: 56, railH: 200 },
  // md uses the SAME proven 2-row stacked rail as sm (NOT a compact single row).
  // A single-row md at 88px clipped its own controls (cashout stacks AWAKEN+CASH
  // OUT ≈116px, settled readouts ≈140px) below the viewport. The stacked layout
  // fits deterministically; single-row is reserved for lg (≥1024) only.
  md: { headerH: 60, railH: 200 },
  lg: { headerH: 64, railH: 208 },
}

// ─── HUD band height constants ────────────────────────────────────────────────
// Exposed as named consts so external consumers (OoReiSpiritGauge,
// OoReiCharacterLayer, coachmarks) can read the correct rail height for a given
// tier without importing the full config.
//
// These REPLACE HUD_BAND_HEIGHT_MOBILE / HUD_BAND_HEIGHT_TABLET /
// HUD_BAND_HEIGHT_DESKTOP from OoReiExperience.tsx for NEW code.
// The legacy exports on OoReiExperience.tsx remain (marked DEPRECATED) so
// downstream consumers do not break until they are individually migrated.

export const RAIL_H_XS = ZONE_HEIGHTS.xs.railH  // 200
export const RAIL_H_SM = ZONE_HEIGHTS.sm.railH  // 200
export const RAIL_H_MD = ZONE_HEIGHTS.md.railH  // 88
export const RAIL_H_LG = ZONE_HEIGHTS.lg.railH  // 208

/** Get rail height for a tier (replaces the ternary hudBandHeight derivation). */
export function railHeightForTier(tier: LayoutTier): number {
  return ZONE_HEIGHTS[tier].railH
}

// ─── LAYOUT_CONFIG ────────────────────────────────────────────────────────────
// Parametric config for InstrumentRail. Keyed by LayoutTier.
// gridTemplateColumns + gridTemplateAreas + padding + heights for each tier.

export interface TierRailConfig {
  /** CSS grid-template-columns value for the InstrumentRail outer grid */
  railCols: string
  /**
   * CSS grid-template-areas value.
   * xs/sm: 2-row (cast + controls).
   * md/lg: 1-row (wager context cast readouts cashout).
   */
  railAreas: string
  /** paddingInline in px (use SP tokens) */
  railPxInline: number
  /** Cast button height in px */
  castH: number
  /** Whether the context column (seal medallions) is shown */
  contextVisible: boolean
}

export const LAYOUT_CONFIG: Record<LayoutTier, TierRailConfig> = {
  xs: {
    // 2-row: row 1 = full-width cast; row 2 = controls sub-grid
    railCols: '1fr',
    railAreas: '"cast" "controls"',
    railPxInline: SP[8],
    castH: 52,
    contextVisible: false,
  },
  sm: {
    // 2-row: same as xs but context column is visible in controls row
    railCols: '1fr',
    railAreas: '"cast" "controls"',
    railPxInline: SP[8],
    castH: 52,
    contextVisible: true,
  },
  md: {
    // 2-row stacked (same shape as sm): row 1 = full-width cast; row 2 = controls
    // sub-grid (wager | context | readouts | cashout). md gets the wider inline
    // inset (SP[12]) for tablet breathing room but the SAME layout that sm proves
    // green. Single-row packing is lg-only — it does not fit md's vertical budget.
    railCols: '1fr',
    railAreas: '"cast" "controls"',
    railPxInline: SP[12],
    castH: 56,
    contextVisible: true,
  },
  lg: {
    // Single row: 5 named tracks (wider)
    // context widened 64-80 → 92-112 so the "SEALING <SPIRIT>" medallion label
    // wraps cleanly to two lines instead of center-clipping ("EALING ARASH" bug,
    // Tim 2026-06-01). cashout widened 100-140 → 116-148 so the stacked
    // AWAKEN + CASH OUT pair never crowds the rail edge.
    railCols:
      'minmax(120px, 160px) minmax(92px, 112px) 1fr minmax(220px, 260px) minmax(116px, 148px)',
    railAreas: '"wager context cast readouts cashout"',
    railPxInline: SP[24],
    castH: 64,
    contextVisible: true,
  },
}

// ─── Coachmark clearance helper ───────────────────────────────────────────────
// Replaces the hardcoded `bottom: 220px` in coachmark skip buttons.
// Returns: rail height + SP[12] spacing above rail top edge.

export function coachmarkClearancePx(tier: LayoutTier): number {
  return ZONE_HEIGHTS[tier].railH + SP[12]
}

// ─── Modal max-width helper ───────────────────────────────────────────────────
// Returns the CSS string for modal card width at the given tier.
// xs/sm: fills viewport with SP[16] gutters (tight).
// md/lg: capped at 560/640px with SP[32] gutters.

export function modalCardWidth(tier: LayoutTier): string {
  if (tier === 'xs' || tier === 'sm') {
    return `min(560px, calc(100% - ${SP[32]}px))`
  }
  return `min(640px, calc(100% - ${SP[32] * 2}px))`
}

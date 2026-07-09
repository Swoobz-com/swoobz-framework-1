'use client'

/**
 * OoReiSpiritGauge — the Spirit Evolution prize-meter (spec §7).
 *
 * Physical object: a carved talisman-paper seal-rail mounted in the dead-space
 * margin between the left canvas edge and Rei's figure. It is NOT a floating UI
 * bar — it reads as a vertical seal-tablet column rising from the bottom
 * instrument rail, the same shrine-paper material vocabulary as the rest of the
 * OO-REI HUD. The amber fill is the spirit-seal energy gathering.
 *
 * Layout (spec §7.1):
 *   - Vertical 16px rail pinned to the left edge, running from beneath the
 *     header to just above the bottom instrument rail. Fills bottom → top.
 *   - Falls back to a horizontal 12px strip below the grid when the left margin
 *     is too narrow on mobile (Pixel 7 412px). The fallback is chosen by a
 *     prop (`orientation`) decided at the Experience level via ResizeObserver.
 *
 * Visual design (spec §7.2):
 *   - Background track: near-black amber-tinted trough. No cyan.
 *   - Fill: amber gradient, brightens toward the next threshold. NO glow pulse,
 *     NO breathing animation (DLv2 principle 10 — motion reserved for state
 *     change). The fill ONLY animates on a settled state change via CSS
 *     transition (scaleY/scaleX), duration SPIRIT_GAUGE_FILL_MS, eased with the
 *     DLv2 entrance ease.
 *   - Four threshold notches at 25/50/75/100% with a kanji glyph label each.
 *   - Form badge at the base showing the current form kanji.
 *
 * Color-independence (spec §7.4, WCAG 1.4.1): the fill is NEVER the sole
 * encoding. Each notch carries a kanji glyph (text); the form badge carries the
 * current form kanji (text). Win/loss state is not encoded in the gauge.
 *
 * Reduced-motion (spec §7.3): the fill jumps instantly (no transition) and the
 * badge swaps without crossfade. All text + fill level remain fully visible.
 *
 * Brand register: Anime Cinematic. ZERO cyan. Amber economy only.
 * Domain C: presentation only. Consumes the display fill ratio + form index
 * already computed by the Domain A / Domain B layers.
 */

import { type CSSProperties, type ReactElement } from 'react'

import {
  SPIRIT_FORM_BADGE_CROSSFADE_MS,
  SPIRIT_GAUGE_FILL_MS,
} from './ooReiSignatures'
import {
  SPIRIT_FORM_KANJI,
  SPIRIT_FORM_NAME,
  SPIRIT_PROCESSION,
  type SpiritFormIndex,
} from './ooReiSpiritEvolution'

// ─── Palette (Anime Cinematic — no cyan) ─────────────────────────────────────

const G = {
  // Background track: near-black amber-tinted trough (spec §7.2).
  trackBg: 'rgba(18, 10, 0, 0.70)',
  trackBorder: 'rgba(232, 223, 200, 0.16)',
  // Amber fill gradient: dim at base → bright at the leading edge.
  fillLow: 'rgba(200, 120, 10, 0.60)',
  fillHigh: 'rgba(255, 180, 30, 0.90)',
  // Threshold notch + its kanji label.
  notch: 'rgba(255, 200, 60, 0.50)',
  notchKanji: 'rgba(232, 223, 200, 0.45)',
  // Form badge.
  badgeBg: 'rgba(26, 22, 18, 0.92)',
  badgeBorder: 'rgba(212, 137, 42, 0.55)',
  badgeKanji: '#f4a73e',
  labelMuted: 'rgba(232, 223, 200, 0.55)',
  fontMono: '"Geist Mono", ui-monospace, monospace',
  // QA 2026-05-30: kanji glyphs are DISPLAY identity → Noto Serif JP (brand
  // register), not Geist Mono. Numbers/labels stay Mono.
  fontKanji: '"Noto Serif JP", "Yu Mincho", serif',
} as const

// The DLv2 entrance ease (Carbon ease-out) — fill grows in, never springs.
const FILL_EASE = 'cubic-bezier(0, 0, 0.25, 1)' as const

// The four threshold notch positions as fractions of the rail length.
// 25/50/75/100% — the form-change thresholds (spec §6.1).
const NOTCH_FRACTIONS = [0.25, 0.5, 0.75, 1.0] as const
// Kanji for each threshold: 揺 顕 輝 超 (Form 1..4 glyphs — spec §7.2).
const NOTCH_KANJI = [
  SPIRIT_FORM_KANJI[1],
  SPIRIT_FORM_KANJI[2],
  SPIRIT_FORM_KANJI[3],
  SPIRIT_FORM_KANJI[4],
] as const

// ─── Props ────────────────────────────────────────────────────────────────────

interface OoReiSpiritGaugeProps {
  /** Display fill ratio 0..1 (from spiritGaugeFillRatio — presentation only). */
  readonly fillRatio: number
  /** Current spirit form index 0..4 (drives the badge kanji + name). */
  readonly formIndex: SpiritFormIndex
  /** 'vertical' = left-margin rail (preferred); 'horizontal' = mobile fallback. */
  readonly orientation: 'vertical' | 'horizontal'
  /**
   * Actual bottom HUD band height (px) for the current breakpoint. The gauge
   * pins its bottom to `hudBandHeight + GAUGE_BAND_CLEARANCE` so the wood deck
   * (z-4) NEVER overlaps the rail (z-3). Previously hardcoded to 92 against a
   * stale "88px band" assumption — the band is now 200/194/84px, which buried
   * the fill + badge under the deck (Tim image 65: "wooden background
   * overlapping the progress bar"). Prop-driven = correct at every breakpoint.
   */
  readonly hudBandHeight: number
  /** prefers-reduced-motion → instant fill jump, no badge crossfade. */
  readonly reducedMotion: boolean
  /** Index of the current spirit in SPIRIT_PROCESSION (seal-quest). */
  readonly currentSpiritIndex: number
  /** How many spirits REI has sealed this session (seal-quest ally row). */
  readonly sealedSpiritCount: number
  /** Called when the form badge is tapped — opens OoReiSealCollection overlay. */
  readonly onBadgeTap?: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

// Breathing room between the gauge bottom and the top of the HUD deck band.
const GAUGE_BAND_CLEARANCE = 10 as const

export function OoReiSpiritGauge({
  fillRatio,
  formIndex,
  orientation,
  reducedMotion,
  currentSpiritIndex,
  sealedSpiritCount,
  onBadgeTap,
  hudBandHeight,
}: OoReiSpiritGaugeProps): ReactElement {
  // Clamp defensively — never trust the incoming ratio to be in-band.
  const ratio = Math.max(0, Math.min(1, fillRatio))
  const isVertical = orientation === 'vertical'

  // Pin the rail bottom to clear the ACTUAL band height (not a stale constant).
  // Defensive: never let a bad prop push the bottom off-screen or negative.
  const safeBandHeight = Math.max(0, Math.min(400, hudBandHeight))
  const railBottom = safeBandHeight + GAUGE_BAND_CLEARANCE

  const transition = reducedMotion
    ? 'none'
    : `transform ${SPIRIT_GAUGE_FILL_MS}ms ${FILL_EASE}`
  const badgeTransition = reducedMotion
    ? 'none'
    : `opacity ${SPIRIT_FORM_BADGE_CROSSFADE_MS}ms ${FILL_EASE}`

  // Fill transform: scaleY (vertical, anchored bottom) or scaleX (horizontal,
  // anchored left). Only transform + opacity animate (game-feel discipline).
  const fillTransform = isVertical ? `scaleY(${ratio})` : `scaleX(${ratio})`
  const fillOrigin = isVertical ? 'bottom center' : 'left center'

  const kanji = SPIRIT_FORM_KANJI[formIndex]
  const name = SPIRIT_FORM_NAME[formIndex]

  // Spirit quest: current spirit display.
  const safeSpiritIndex = Math.max(0, Math.min(SPIRIT_PROCESSION.length - 1, currentSpiritIndex))
  const currentSpirit = SPIRIT_PROCESSION[safeSpiritIndex]
  const spiritKanji = currentSpirit?.kanji ?? '?'
  const spiritNameEn = currentSpirit?.nameEn ?? '?????'

  // Seal ally row: show up to 10 small amber ink glyphs for sealed spirits.
  // Wraps at SPIRIT_PROCESSION.length (10). In vertical orientation this
  // column is only 20px wide — show max 5 glyphs vertically to avoid overflow.
  const maxAllyGlyphs = isVertical ? 5 : 10
  const allyCount = Math.min(sealedSpiritCount, maxAllyGlyphs)

  return (
    <div
      style={{
        ...(isVertical ? containerVerticalStyle : containerHorizontalStyle),
        bottom: railBottom,
      }}
      aria-label={`Spirit gauge: ${name} form, ${Math.round(ratio * 100)}% to next form. Sealing ${spiritNameEn}. ${sealedSpiritCount} spirit${sealedSpiritCount !== 1 ? 's' : ''} sealed.`}
      data-testid="oo-rei-spirit-gauge"
      // Stable coachmark anchor — the '封' onboarding step measures this element's
      // bounding box and points its washi card at the gauge. Never rename.
      data-oo-rei-coachmark-target="spirit-gauge"
      data-form={formIndex}
    >
      {/* Spirit quest header — shows current spirit kanji + English name above
          the gauge track in vertical orientation (space permitting). Mobile
          horizontal orientation omits the header to preserve rail width. */}
      {isVertical && (
        <div style={questHeaderStyle} aria-hidden="true">
          <span style={questSpiritKanjiStyle}>{spiritKanji}</span>
          <span style={questSpiritNameStyle}>{spiritNameEn}</span>
        </div>
      )}

      {/* Track + fill */}
      <div style={isVertical ? trackVerticalStyle : trackHorizontalStyle}>
        {/* Amber fill — anchored bottom (vertical) / left (horizontal). */}
        <div
          style={{
            ...(isVertical ? fillVerticalStyle : fillHorizontalStyle),
            transform: fillTransform,
            transformOrigin: fillOrigin,
            transition,
          }}
          data-testid="oo-rei-spirit-gauge-fill"
        />

        {/* Four threshold notches + kanji labels (color-independent encoding). */}
        {NOTCH_FRACTIONS.map((frac, i) => (
          <div
            key={frac}
            style={
              isVertical
                ? {
                    ...notchVerticalStyle,
                    // Bottom-anchored: higher fraction = higher up the rail.
                    bottom: `calc(${frac * 100}% - 1px)`,
                  }
                : {
                    ...notchHorizontalStyle,
                    left: `calc(${frac * 100}% - 1px)`,
                  }
            }
          >
            <span
              style={isVertical ? notchKanjiVerticalStyle : notchKanjiHorizontalStyle}
              aria-hidden="true"
            >
              {NOTCH_KANJI[i]}
            </span>
          </div>
        ))}
      </div>

      {/* Form badge — current form kanji + romanised name. The kanji is the
          color-independent label so the gauge never relies on color alone.
          Tappable: opens OoReiSealCollection overlay (pointer-events override). */}
      <div style={isVertical ? badgeWrapVerticalStyle : badgeWrapHorizontalStyle}>
        <button
          type="button"
          key={formIndex}
          style={{ ...badgeStyle, ...badgeButtonStyle, transition: badgeTransition }}
          data-testid="oo-rei-spirit-gauge-badge"
          onClick={onBadgeTap}
          aria-label={`View spirit seal collection (${sealedSpiritCount} sealed)`}
        >
          <span style={badgeKanjiStyle} aria-hidden="true">
            {kanji}
          </span>
        </button>
        {isVertical && <span style={badgeNameStyle}>{name}</span>}
      </div>

      {/* Seal ally row — small amber ink glyphs per sealed spirit.
          Visible in vertical orientation only. Shows effort payoff.
          "Your effort matters" per design spec. */}
      {isVertical && allyCount > 0 && (
        <div style={allyRowStyle} aria-hidden="true" data-testid="oo-rei-seal-ally-row">
          {Array.from({ length: allyCount }, (_, idx) => {
            const spiritIdx = (sealedSpiritCount - allyCount + idx) % SPIRIT_PROCESSION.length
            const safeIdx = Math.max(0, Math.min(SPIRIT_PROCESSION.length - 1, spiritIdx))
            const sp = SPIRIT_PROCESSION[safeIdx]
            return (
              <span key={idx} style={allyGlyphStyle} title={sp?.nameEn}>
                {sp?.authored ? sp.kanji : '?'}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

// Vertical rail: pinned to the left edge in the dead-space margin between the
// canvas left edge and Rei's figure (Rei owns left ~26%, the gauge sits at the
// very edge so it does not overlap her). Runs from below the header to above
// the integrated bottom HUD band (88px desktop).
// z-3: in front of the canvas, below the HUD card overlays so it never blocks a CTA.
// `bottom` is OVERRIDDEN inline at render via railBottom = hudBandHeight + clearance
// (Pass 3 2026-05-30). The literal below is only a safe fallback default.
const containerVerticalStyle: CSSProperties = {
  position: 'absolute',
  left: 4,
  top: 64, // below the compact header tape (RESERVED_TOP = 64)
  bottom: 92, // fallback only — see railBottom override (clears the real band height)
  width: 28, // Pass 3: 20→28 so the signature Spirit gauge reads as an instrument column, not an edge sliver
  zIndex: 3,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  pointerEvents: 'none',
}

// Horizontal fallback strip: full-width below the grid, above the bottom HUD band.
// `bottom` is OVERRIDDEN inline at render via railBottom = hudBandHeight + clearance
// (Pass 3 2026-05-30). The literal below is only a safe fallback default.
const containerHorizontalStyle: CSSProperties = {
  position: 'absolute',
  left: 12,
  right: 12,
  bottom: 92, // fallback only — see railBottom override (clears the real band height)
  height: 26,
  zIndex: 3,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  pointerEvents: 'none',
}

const trackVerticalStyle: CSSProperties = {
  position: 'relative',
  width: 22, // Pass 3: 16→22 (matches the 28px container) — fill + notches legible at desktop distance
  flex: 1,
  borderRadius: 8,
  background: G.trackBg,
  border: `1px solid ${G.trackBorder}`,
  overflow: 'hidden',
}

const trackHorizontalStyle: CSSProperties = {
  position: 'relative',
  height: 12,
  flex: 1,
  borderRadius: 6,
  background: G.trackBg,
  border: `1px solid ${G.trackBorder}`,
  overflow: 'hidden',
}

// Fill is full-size; the scale transform drives the visible level so we animate
// transform only (never width/height — game-feel discipline).
const fillVerticalStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  top: 0,
  background: `linear-gradient(0deg, ${G.fillLow} 0%, ${G.fillHigh} 100%)`,
  willChange: 'transform',
}

const fillHorizontalStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  top: 0,
  background: `linear-gradient(90deg, ${G.fillLow} 0%, ${G.fillHigh} 100%)`,
  willChange: 'transform',
}

const notchVerticalStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  height: 1,
  background: G.notch,
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const notchHorizontalStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 1,
  background: G.notch,
  display: 'flex',
  alignItems: 'center',
  pointerEvents: 'none',
}

// Kanji glyph beside each notch — 10px Geist Mono, low opacity, non-interactive.
const notchKanjiVerticalStyle: CSSProperties = {
  position: 'absolute',
  left: 26, // to the right of the 22px rail (Pass 3)
  top: -6,
  fontFamily: G.fontKanji,
  fontSize: 10,
  lineHeight: 1,
  color: G.notchKanji,
}

const notchKanjiHorizontalStyle: CSSProperties = {
  position: 'absolute',
  top: -12,
  left: -5,
  fontFamily: G.fontKanji,
  fontSize: 10,
  lineHeight: 1,
  color: G.notchKanji,
}

const badgeWrapVerticalStyle: CSSProperties = {
  marginTop: 8,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
}

const badgeWrapHorizontalStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
}

const badgeStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: G.badgeBg,
  border: `1px solid ${G.badgeBorder}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const badgeKanjiStyle: CSSProperties = {
  fontFamily: G.fontKanji,
  fontSize: 13,
  lineHeight: 1,
  color: G.badgeKanji,
  fontWeight: 700,
}

const badgeNameStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 10, // was 6px — below the legible floor (autisk fix)
  letterSpacing: '0.10em',
  color: G.labelMuted,
  textTransform: 'uppercase',
  textAlign: 'center',
  writingMode: 'vertical-rl',
  textOrientation: 'mixed',
  maxHeight: 56,
  overflow: 'hidden',
}

// Badge is now a button to open the seal collection.
// Override pointer-events and appearance — looks identical to the div badge.
const badgeButtonStyle: CSSProperties = {
  cursor: 'pointer',
  pointerEvents: 'all',
  background: 'none',
  border: 'none',
  padding: 0,
  outline: 'none',
  // Inherit border + bg from badgeStyle. The button reset must not override those.
  // Press-ack: sub-100ms scale (Level 1 juice, GC1 compliant). No hover idle juice.
  transition: 'transform 80ms cubic-bezier(0.2, 0, 0, 1)',
}

// Spirit quest header — two lines above the rail: kanji (amber) + English name (mono caps).
// Visible in vertical orientation only (20px column fits ~10px glyph + 7px name).
const questHeaderStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  marginBottom: 4,
  gap: 1,
}

const questSpiritKanjiStyle: CSSProperties = {
  fontFamily: G.fontKanji, // was fontMono (no CJK coverage) on a kanji glyph (autisk fix)
  fontSize: 13,
  fontWeight: 700,
  color: '#f4a73e',        // amber — no cyan
  lineHeight: 1,
  letterSpacing: 0,
}

const questSpiritNameStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 10, // was 5px — illegible (autisk fix)
  color: G.labelMuted,
  letterSpacing: '0.08em',
  writingMode: 'vertical-rl',
  textOrientation: 'mixed',
  textTransform: 'uppercase',
  maxHeight: 40,
  overflow: 'hidden',
}

// Seal ally row — one small amber ink glyph per sealed spirit.
// Sits below the badge at the very bottom of the gauge column.
const allyRowStyle: CSSProperties = {
  marginTop: 6,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
}

const allyGlyphStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 9,
  color: 'rgba(244, 167, 62, 0.70)', // amber, muted — "stamped" feel
  lineHeight: 1,
}

'use client'

/**
 * OoReiSealCollection — in-canvas spirit seal collection overlay.
 *
 * Opens when the player taps the spirit gauge form badge.
 * Shows the 10-spirit procession REI must seal:
 *   - Sealed (index < sealedCount): stamped amber glyph + name
 *   - Active (index === currentSpiritIndex): highlighted + gauge fill %
 *   - Hidden (authored=false and not yet reached): '?' silhouette
 *
 * Material: talisman-paper, absolute child of canvas shell.
 * Tap outside (scrim) dismisses. Grid dimmed behind.
 * NOT a route. NOT a blocking modal. NOT a portal.
 *
 * RG-C5: no session/streak data drives this panel. Pure display.
 * RG-C1: no win/loss state encoded here. Neutral engagement display.
 * ZERO cyan. Amber/vermillion only.
 *
 * Domain C: presentation only.
 */

import { type CSSProperties, type ReactElement } from 'react'

import { SPIRIT_PROCESSION } from './ooReiSpiritEvolution'

// ─── Palette (Anime Cinematic — no cyan) ─────────────────────────────────────

const G = {
  scrim: 'rgba(10, 8, 6, 0.72)',
  panelBg: 'rgba(26, 22, 18, 0.96)',
  panelBorder: 'rgba(212, 137, 42, 0.40)',
  headerSep: 'rgba(212, 137, 42, 0.55)',
  sealedKanji: '#f4a73e',        // amber stamped
  sealedName: 'rgba(232, 223, 200, 0.90)',
  sealedDomain: 'rgba(232, 223, 200, 0.45)',
  activeBg: 'rgba(212, 137, 42, 0.12)',
  activeBorder: 'rgba(212, 137, 42, 0.55)',
  activeKanji: '#f4a73e',
  activeName: '#e8dfc8',
  activePercent: 'rgba(244, 167, 62, 0.80)',
  hiddenKanji: 'rgba(232, 223, 200, 0.20)',
  hiddenName: 'rgba(232, 223, 200, 0.25)',
  closeBg: 'rgba(36, 30, 22, 0.90)',
  closeBorder: 'rgba(232, 223, 200, 0.22)',
  closeColor: 'rgba(232, 223, 200, 0.70)',
  titleColor: '#e8dfc8',
  titleKanji: '#f4a73e',
  fontMono: '"Geist Mono", ui-monospace, monospace',
} as const

// ─── Props ────────────────────────────────────────────────────────────────────

interface OoReiSealCollectionProps {
  /** Whether the overlay is open. */
  readonly isOpen: boolean
  /** How many spirits have been sealed (0 = none). */
  readonly sealedSpiritCount: number
  /** Index of the current spirit being sealed (active). */
  readonly currentSpiritIndex: number
  /** Fill ratio of the current gauge cycle (0..1) for the active spirit. */
  readonly gaugeRatio: number
  /** Called when the player taps the scrim or the close button. */
  readonly onDismiss: () => void
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OoReiSealCollection({
  isOpen,
  sealedSpiritCount,
  currentSpiritIndex,
  gaugeRatio,
  onDismiss,
}: OoReiSealCollectionProps): ReactElement | null {
  if (!isOpen) return null

  const gaugePercent = Math.round(Math.max(0, Math.min(1, gaugeRatio)) * 100)

  return (
    <>
      {/* Scrim — dims the scene behind. Tapping dismisses. */}
      <div
        style={scrimStyle}
        onClick={onDismiss}
        aria-hidden="true"
        data-testid="oo-rei-seal-collection-scrim"
      />

      {/* Panel — talisman-paper scroll listing the 10 spirits */}
      <div
        style={panelStyle}
        role="dialog"
        aria-label="Spirit seal collection"
        aria-modal="true"
        data-testid="oo-rei-seal-collection"
      >
        {/* Header */}
        <div style={headerStyle}>
          <div style={headerTitleRowStyle}>
            <span style={headerKanjiStyle} aria-hidden="true">封</span>
            <span style={headerTitleStyle}>SPIRIT SEALS</span>
          </div>
          <div style={headerSepStyle} />
          <button
            type="button"
            style={closeButtonStyle}
            onClick={onDismiss}
            aria-label="Close seal collection"
          >
            x
          </button>
        </div>

        {/* Subtitle */}
        <p style={subtitleStyle}>
          {sealedSpiritCount} of {SPIRIT_PROCESSION.length} spirits sealed
        </p>

        {/* Spirit grid */}
        <div style={spiritGridStyle}>
          {SPIRIT_PROCESSION.map((spirit, idx) => {
            const isSealed = idx < sealedSpiritCount
            const isActive = idx === currentSpiritIndex
            const isHidden = !spirit.authored && !isSealed && !isActive

            return (
              <div
                key={idx}
                style={{
                  ...spiritCardStyle,
                  ...(isSealed ? spiritCardSealedStyle : {}),
                  ...(isActive ? spiritCardActiveStyle : {}),
                  ...(isHidden ? spiritCardHiddenStyle : {}),
                }}
                aria-label={
                  isHidden
                    ? 'Unknown spirit, not yet reached'
                    : isSealed
                      ? `${spirit.nameEn} sealed`
                      : isActive
                        ? `${spirit.nameEn}, currently being sealed, ${gaugePercent}% complete`
                        : `${spirit.nameEn}, not yet reached`
                }
              >
                <span
                  style={{
                    ...spiritKanjiStyle,
                    ...(isSealed ? { color: G.sealedKanji } : {}),
                    ...(isActive ? { color: G.activeKanji } : {}),
                    ...(isHidden ? { color: G.hiddenKanji } : {}),
                  }}
                  aria-hidden="true"
                >
                  {isHidden ? '?' : spirit.kanji}
                </span>
                <span
                  style={{
                    ...spiritNameStyle,
                    ...(isSealed ? { color: G.sealedName } : {}),
                    ...(isActive ? { color: G.activeName } : {}),
                    ...(isHidden ? { color: G.hiddenName } : {}),
                  }}
                >
                  {isHidden ? '?????' : spirit.nameEn}
                </span>
                {isSealed && (
                  <span style={sealedDomainStyle}>{spirit.domain}</span>
                )}
                {isActive && (
                  <span style={activePercentStyle}>{gaugePercent}%</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const scrimStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 6,
  background: G.scrim,
  cursor: 'pointer',
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 7,
  width: 'min(280px, calc(100% - 32px))',
  maxHeight: 'calc(100% - 80px)',
  overflowY: 'auto',
  background: G.panelBg,
  border: `1px solid ${G.panelBorder}`,
  borderRadius: 6,
  padding: '14px 14px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const headerTitleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: 1,
}

const headerKanjiStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 16,
  color: G.titleKanji,
  lineHeight: 1,
}

const headerTitleStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.12em',
  color: G.titleColor,
}

const headerSepStyle: CSSProperties = {
  flex: 1,
  height: 1,
  background: G.headerSep,
}

const closeButtonStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 13,
  color: G.closeColor,
  background: G.closeBg,
  border: `1px solid ${G.closeBorder}`,
  borderRadius: 3,
  width: 22,
  height: 22,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
  lineHeight: 1,
}

const subtitleStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 9,
  color: G.sealedDomain,
  letterSpacing: '0.10em',
  margin: 0,
  textTransform: 'uppercase',
}

const spiritGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 6,
}

const spiritCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '8px 6px',
  borderRadius: 4,
  border: '1px solid rgba(232, 223, 200, 0.10)',
  background: 'rgba(26, 22, 18, 0.60)',
  minHeight: 58,
  justifyContent: 'center',
}

const spiritCardSealedStyle: CSSProperties = {
  border: '1px solid rgba(212, 137, 42, 0.30)',
  background: 'rgba(212, 137, 42, 0.06)',
}

const spiritCardActiveStyle: CSSProperties = {
  border: `1px solid ${G.activeBorder}`,
  background: G.activeBg,
}

const spiritCardHiddenStyle: CSSProperties = {
  opacity: 0.45,
}

const spiritKanjiStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 20,
  lineHeight: 1,
  fontWeight: 700,
}

const spiritNameStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 8,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
}

const sealedDomainStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 7,
  color: G.sealedDomain,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const activePercentStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 8,
  color: G.activePercent,
  letterSpacing: '0.06em',
  fontWeight: 600,
}

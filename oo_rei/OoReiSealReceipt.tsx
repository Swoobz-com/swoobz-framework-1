'use client'

/**
 * OoReiSealReceipt — Seal-complete cinematic earned moment (Domain C).
 *
 * SPEC B 2026-05-29: replaces the old sticky glass-box popup.
 *
 * This is the ONE earned moment per full gauge cycle (rare — ~200 spins).
 * Design: a centered cinematic beat that AUTO-DISMISSES after SEAL_REVEAL_MS
 * (3500ms). The X button is an early-out only. Never sticky.
 *
 * Content:
 *   - Centered seal-stamp glyph (spirit kanji, amber, stamps in over 400ms)
 *   - Spirit name in MONO CAPS
 *   - Concrete benefit line: "{NAME} SEALED +1 Spirit Ally (permanent)"
 *   - One-line explainer of what the ally does (narrative, RTP-neutral)
 *   - Seal count badge (#N)
 *   - Cycle stats (factual Glass Box — spins, seal energy)
 *   - Provability line (session seed hex)
 *
 * The full Glass-Box detail (provability, ownership recap) is present but
 * displayed compact. Players who want the full receipt use the "view receipt"
 * affordance in the compact settled strip (bottom sheet, spec D).
 *
 * RG compliance:
 *   - RG-C1: vocabulary is NARRATIVE ("SEALED"), NOT "BIG WIN"
 *   - RG-C2: factual stats only, no win/loss color framing
 *   - RG-C5: dwell is module-const SEAL_REVEAL_MS, never session-scaled
 *   - RG-C1: zero celebratory amplitude on sub-wager outcomes
 *
 * Animation (game-feel-engineer spec):
 *   - Scrim + panel: opacity 0 -> 1 over 200ms (entrance)
 *   - Seal glyph: transform scale(0.4) -> scale(1.0) + opacity over 400ms
 *     cubic-bezier(0.34, 1.56, 0.64, 1) — overshoot stamp-in
 *   - Text: opacity 0 -> 1 at 280ms (staggered after glyph peak)
 *   - Benefit line: opacity 0 -> 1 at 440ms
 *   - Exit: auto after SEAL_REVEAL_MS, or X tap (early-out)
 *   - Reduced-motion: instant appear, no scale/opacity animation
 *
 * ZERO cyan. Amber/vermillion only. No particles. No em-dashes.
 * Domain C: presentation only. No financial writes.
 */

import { type CSSProperties, type ReactElement, useEffect, useRef, useState } from 'react'

import { formatPoints } from './ooReiMath'
import { type SealReceiptData } from './ooReiProvider'
import { SPIRIT_PROCESSION } from './ooReiSpiritEvolution'

// ─── Auto-dismiss dwell (RG-C5 module-const) ─────────────────────────────────
// Forwarded from OoReiExperience.tsx SEAL_REVEAL_MS constant.
// Defined here as a prop to allow OoReiExperience to pass its own module-const
// without duplication, while keeping this component self-contained.
// Default: 3500ms. X is early-out. Never sticky.
export const SEAL_RECEIPT_DEFAULT_DWELL_MS = 3500 as const

// ─── Palette (Anime Cinematic — no cyan) ─────────────────────────────────────

const G = {
  scrim: 'rgba(10, 8, 6, 0.72)',
  panelBg: 'rgba(18, 14, 10, 0.98)',
  panelBorder: 'rgba(212, 137, 42, 0.55)',
  headerSep: 'rgba(212, 137, 42, 0.55)',
  titleKanji: '#f4a73e',
  titleText: '#e8dfc8',
  label: 'rgba(232, 223, 200, 0.55)',
  value: '#e8dfc8',
  amberValue: '#f4a73e',
  benefitBg: 'rgba(212, 137, 42, 0.08)',
  benefitBorder: 'rgba(212, 137, 42, 0.25)',
  benefitText: '#f4a73e',
  explainerText: 'rgba(232, 223, 200, 0.65)',
  codeText: 'rgba(232, 223, 200, 0.55)',
  codeBg: 'rgba(10, 8, 6, 0.60)',
  divider: 'rgba(232, 223, 200, 0.12)',
  closeBg: 'rgba(36, 30, 22, 0.90)',
  closeBorder: 'rgba(232, 223, 200, 0.22)',
  closeColor: 'rgba(232, 223, 200, 0.70)',
  fontMono: '"Geist Mono", ui-monospace, monospace',
  fontKanji: '"Noto Serif JP", "Yu Mincho", serif',
} as const

// ─── Props ────────────────────────────────────────────────────────────────────

interface OoReiSealReceiptProps {
  /** The cycle receipt data to display. null = unmounted. */
  readonly data: SealReceiptData | null
  /** Called when the player dismisses (early X) or auto-dismiss fires. */
  readonly onDismiss: () => void
  /** Auto-dismiss dwell in ms (module-const from OoReiExperience). */
  readonly dwellMs?: number
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OoReiSealReceipt({
  data,
  onDismiss,
  dwellMs = SEAL_RECEIPT_DEFAULT_DWELL_MS,
}: OoReiSealReceiptProps): ReactElement | null {
  // Entrance animation phases: 'entering' | 'visible' | 'exiting'
  const [phase, setPhase] = useState<'entering' | 'visible' | 'exiting'>('entering')
  const [glyphVisible, setGlyphVisible] = useState(false)
  const [textVisible, setTextVisible] = useState(false)
  const [benefitVisible, setBenefitVisible] = useState(false)

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // ── Mount / unmount animation ───────────────────────────────────────────
  useEffect(() => {
    if (data === null) return

    // Reset on each new seal event
    setPhase('entering')
    setGlyphVisible(false)
    setTextVisible(false)
    setBenefitVisible(false)

    if (prefersReducedMotion) {
      // Instant appear — no animation for reduced-motion users
      setPhase('visible')
      setGlyphVisible(true)
      setTextVisible(true)
      setBenefitVisible(true)
    } else {
      // Staggered entrance: panel fades in, then glyph stamps in, then text fades
      const r1 = requestAnimationFrame(() => {
        setPhase('visible')
        // Glyph: 80ms after panel starts
        const t1 = setTimeout(() => setGlyphVisible(true), 80)
        // Spirit name + count: 280ms after panel (after glyph peaks at ~400ms)
        const t2 = setTimeout(() => setTextVisible(true), 280)
        // Benefit line: staggered 160ms after text
        const t3 = setTimeout(() => setBenefitVisible(true), 440)

        dismissTimerRef.current = setTimeout(() => {
          onDismiss()
        }, dwellMs)

        // Store timeouts in a way cleanup can cancel them
        // (closure captures t1/t2/t3 — cleared in cleanup below)
        return () => {
          clearTimeout(t1)
          clearTimeout(t2)
          clearTimeout(t3)
        }
      })
      return () => {
        cancelAnimationFrame(r1)
        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
      }
    }

    // Auto-dismiss for reduced-motion path
    dismissTimerRef.current = setTimeout(() => {
      onDismiss()
    }, dwellMs)

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (data === null) return null

  const safeSpiritIndex = Math.max(0, Math.min(SPIRIT_PROCESSION.length - 1, data.spiritIndex))
  const spirit = SPIRIT_PROCESSION[safeSpiritIndex]
  const spiritKanji = spirit?.kanji ?? '?'
  const spiritNameEn = spirit?.nameEn ?? '?????'
  const spiritDomain = spirit?.domain ?? 'Unknown'
  const isAuthored = spirit?.authored ?? false

  const ownershipDisplay = formatPoints(data.cycleOwnershipPoints)

  // Concrete benefit line — RTP-neutral, RG-safe, no payout framing.
  // States what the player GETS: +1 Spirit Ally (permanent).
  // What the ally does: joins Rei on the field, seal ally row grows,
  // advances next-spirit target, ownership-tier progress.
  const benefitLine = isAuthored
    ? `${spiritNameEn} SEALED +1 Spirit Ally (permanent)`
    : 'SPIRIT SEALED +1 Spirit Ally (permanent)'

  const benefitExplainer = isAuthored
    ? `${spiritDomain} spirit joins Rei on the field. Seal ally row grows. Next spirit target advances.`
    : 'Spirit ally joins Rei on the field. Seal ally row grows. Next spirit target advances.'

  const isVisible = phase === 'visible'
  const panelOpacity = isVisible ? 1 : 0
  const panelTransition = prefersReducedMotion
    ? undefined
    : `opacity 200ms cubic-bezier(0, 0, 0.25, 1)`

  const glyphScale = glyphVisible ? 'scale(1.0)' : 'scale(0.4)'
  const glyphOpacity = glyphVisible ? 1 : 0
  const glyphTransition = prefersReducedMotion
    ? undefined
    : `transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 300ms ease-out`

  const textOpacity = textVisible ? 1 : 0
  const textTransition = prefersReducedMotion ? undefined : `opacity 240ms ease-out`

  const benefitOpacity = benefitVisible ? 1 : 0
  const benefitTransition = prefersReducedMotion ? undefined : `opacity 220ms ease-out`

  return (
    <>
      {/* Scrim — dims the game behind the cinematic earned moment */}
      <div
        style={{
          ...scrimStyle,
          opacity: isVisible ? 1 : 0,
          transition: panelTransition,
        }}
        aria-hidden="true"
      />

      {/* Centered cinematic panel */}
      <div
        style={{
          ...panelStyle,
          opacity: panelOpacity,
          transition: panelTransition,
        }}
        role="status"
        aria-live="polite"
        aria-label={`Seal complete: ${spiritNameEn} sealed. ${ownershipDisplay} seal energy. ${benefitLine}`}
        data-testid="oo-rei-seal-receipt"
      >
        {/* Early-out close button — always accessible (GC1 / RG-C8) */}
        <button
          type="button"
          style={closeButtonStyle}
          onClick={() => {
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
            onDismiss()
          }}
          aria-label="Dismiss seal complete"
          data-testid="oo-rei-seal-receipt-close"
        >
          x
        </button>

        {/* Seal count badge */}
        <div style={{
          ...sealCountBadgeStyle,
          opacity: textVisible ? 1 : 0,
          transition: textTransition,
        }}>
          #{data.totalSealedCount}
        </div>

        {/* Stamp-in seal glyph — the earned cinematic beat */}
        <div
          style={{
            ...glyphContainerStyle,
            transform: glyphScale,
            opacity: glyphOpacity,
            transition: glyphTransition,
          }}
          aria-hidden="true"
        >
          <span style={sealGlyphKanjiStyle}>{spiritKanji}</span>
          {/* Amber ring around the kanji — reads as the seal stamp impression */}
          <div style={sealGlyphRingStyle} />
        </div>

        {/* Spirit name */}
        <div style={{
          ...spiritNameContainerStyle,
          opacity: textVisible ? 1 : 0,
          transition: textTransition,
        }}>
          <span style={sealCompleteKanjiStyle} aria-hidden="true">封印</span>
          <span style={spiritNameStyle}>{spiritNameEn}</span>
        </div>

        {/* Benefit line — the CLEAR concrete reward statement */}
        <div style={{
          ...benefitBlockStyle,
          opacity: benefitOpacity,
          transition: benefitTransition,
        }}>
          <span style={benefitLineStyle}>{benefitLine}</span>
          <span style={benefitExplainerStyle}>{benefitExplainer}</span>
        </div>

        {/* Divider */}
        <div style={{
          ...dividerStyle,
          opacity: textVisible ? 1 : 0,
          transition: textTransition,
        }} />

        {/* Cycle stats — Glass Box factual readout */}
        <div style={{
          ...statsBlockStyle,
          opacity: textVisible ? 1 : 0,
          transition: textTransition,
        }}>
          <div style={statsRowStyle}>
            <span style={statLabelStyle}>seal energy</span>
            <span style={statAmberValueStyle}>{ownershipDisplay}</span>
          </div>
          <div style={statsRowStyle}>
            <span style={statLabelStyle}>spins this cycle</span>
            <span style={statValueStyle}>{data.cycleSpins}</span>
          </div>
        </div>

        {/* Provability line — Glass Box trust surface */}
        <div style={{
          ...provabilityStyle,
          opacity: textVisible ? 1 : 0,
          transition: textTransition,
        }}>
          <span style={statLabelStyle}>verified against seed</span>
          <code style={hexCodeStyle}>{data.sessionSeedHex}</code>
        </div>
      </div>
    </>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

/** Full-canvas scrim — centers the earned moment, dims the game behind. */
const scrimStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 8,
  background: G.scrim,
  pointerEvents: 'none',
}

/**
 * Centered cinematic panel — spec B 2026-05-29.
 * Centered both horizontally and vertically in the canvas hot-zone.
 * z-index 9: above cinematic overlay (z-5), above receipt sheet (z-7), above info (z-7).
 * Width capped at 360px (fits any mobile). Padding generous for the earned beat.
 * Only transform + opacity animated (game-feel-engineer constraint).
 */
const panelStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(360px, calc(100% - 32px))',
  zIndex: 9,
  background: G.panelBg,
  border: `1px solid ${G.panelBorder}`,
  borderRadius: 6,
  padding: '20px 20px 16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  pointerEvents: 'all',
}

const closeButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  fontFamily: G.fontMono,
  fontSize: 13,
  color: G.closeColor,
  background: G.closeBg,
  border: `1px solid ${G.closeBorder}`,
  borderRadius: 3,
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
  lineHeight: 1,
}

const sealCountBadgeStyle: CSSProperties = {
  position: 'absolute',
  top: 10,
  left: 14,
  fontFamily: G.fontMono,
  fontSize: 9,
  color: G.amberValue,
  letterSpacing: '0.06em',
  padding: '2px 5px',
  border: `1px solid rgba(212, 137, 42, 0.35)`,
  borderRadius: 2,
}

/**
 * Glyph container — the stamp-in zone.
 * Receives transform: scale() + opacity for the overshoot stamp animation.
 * Only transform + opacity (game-feel constraint — no layout properties).
 */
const glyphContainerStyle: CSSProperties = {
  position: 'relative',
  width: 96,
  height: 96,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 8,
}

/** Large seal kanji — the stamp impression. Amber glow, no cyan. */
const sealGlyphKanjiStyle: CSSProperties = {
  fontFamily: G.fontKanji,
  fontSize: 56,
  fontWeight: 700,
  color: G.titleKanji,
  lineHeight: 1,
  textShadow: '0 0 24px rgba(212, 137, 42, 0.55), 0 2px 4px rgba(0, 0, 0, 0.8)',
  position: 'relative',
  zIndex: 1,
}

/** Amber ring: reads as the seal stamp impression frame around the kanji. */
const sealGlyphRingStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: '50%',
  border: `2px solid rgba(212, 137, 42, 0.38)`,
  boxShadow: '0 0 20px rgba(212, 137, 42, 0.18)',
}

const spiritNameContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
}

const sealCompleteKanjiStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.28em',
  color: 'rgba(232, 223, 200, 0.42)',
  textTransform: 'uppercase' as const,
}

const spiritNameStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: '0.16em',
  color: G.titleText,
  textTransform: 'uppercase' as const,
}

/**
 * Benefit block — the CLEAR concrete reward statement.
 * Amber tinted background for emphasis (reads as the "here is what you GET" zone).
 * RTP-neutral framing: ally is narrative, no payout, no "keep spinning" nudge.
 */
const benefitBlockStyle: CSSProperties = {
  width: '100%',
  background: G.benefitBg,
  border: `1px solid ${G.benefitBorder}`,
  borderRadius: 4,
  padding: '8px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  alignItems: 'center',
}

const benefitLineStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.10em',
  color: G.benefitText,
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
}

const benefitExplainerStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 9,
  color: G.explainerText,
  letterSpacing: '0.06em',
  textAlign: 'center' as const,
  lineHeight: 1.5,
}

const dividerStyle: CSSProperties = {
  height: 1,
  width: '100%',
  background: G.divider,
}

const statsBlockStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const statsRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  width: '100%',
}

const statLabelStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 9,
  color: G.label,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
}

const statValueStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 11,
  color: G.value,
  letterSpacing: '0.04em',
}

const statAmberValueStyle: CSSProperties = {
  ...statValueStyle,
  color: G.amberValue,
}

const provabilityStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  width: '100%',
}

const hexCodeStyle: CSSProperties = {
  fontFamily: G.fontMono,
  fontSize: 9,
  color: G.codeText,
  background: G.codeBg,
  padding: '2px 5px',
  borderRadius: 2,
  letterSpacing: '0.06em',
}

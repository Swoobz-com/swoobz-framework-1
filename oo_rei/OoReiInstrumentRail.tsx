'use client'

/**
 * OoReiInstrumentRail — the parametric bottom HUD rail for The Myth of REI.
 *
 * This component REPLACES the three JSX branches in OoReiExperience.tsx:
 *   - isTablet && <div style={hudTabletBandZonesStyle}>
 *   - isMobile && <div style={hudMobileZonesColStyle}>
 *   - <div style={hudBandZonesStyle}>   (desktop)
 *
 * Architecture: one CSS-grid container with 5 named tracks:
 *   wager | context | cast | readouts | cashout
 *
 * Per-tier column definitions come from LAYOUT_CONFIG in ooReiLayout.ts.
 * The rail itself is one parametric component; per-zone sub-components
 * receive data props and render identically at all tiers.
 *
 * RECEIPT and GlassBox live INSIDE the readouts column as a collapsible
 * drawer anchored ABOVE the rail — viewport-bottom overflow is structurally
 * impossible.
 *
 * BALANCE stat is present at ALL tiers (cross-tier consistency per plan).
 *
 * Brand rails:
 *   - Dark-glass surface: rgba(34,28,22,0.97)
 *   - Amber accent: #F4A73E / #d4892a
 *   - ZERO cyan (and no teal/neon)
 *   - Noto Serif JP display + Geist Mono numbers (Geist Sans BANNED)
 *   - No em-dash in copy
 *   - transform/opacity animation only, prefers-reduced-motion safe
 *   - RG-C5: all timing consts module-level
 *   - RG-C1: ZERO juice on loss state
 *
 * Domain C: presentation only — ZERO financial arithmetic.
 *
 * Responsive-interface-plan 2026-05-31 Move 4.
 */

import {
  type CSSProperties,
  type ReactElement,
  useCallback,
} from 'react'

import {
  LAYOUT_CONFIG,
  type LayoutTier,
  ZONE_HEIGHTS,
  SP,
} from './ooReiLayout'
import {
  formatPoints,
  formatUsdc,
  formatUsdcCompact,
  bpsToLamports,
  PUBLISHED_RTP,
} from './ooReiMath'
import {
  playCashOut,
  playChipSelect,
} from './ooReiAudio'
import { unlockAudioOnFirstGesture } from '../_shared/audio'
import { ensureAudio } from './ooReiAudio'

// ─── Press/hover timing consts (RG-C5 module-level) ──────────────────────────
const PLAQUE_PRESS_MS = 80 as const
const PLAQUE_HOVER_MS = 120 as const
const CASHOUT_HOVER_MS = 120 as const
const CTA_PRESS_TRANSITION = 'transform 80ms cubic-bezier(0.2, 0, 0, 1)' as const
const CTA_HOVER_TRANSITION =
  'transform 180ms cubic-bezier(0.2, 0, 0, 1), box-shadow 180ms cubic-bezier(0.2, 0, 0, 1), filter 180ms cubic-bezier(0.2, 0, 0, 1)' as const
const CTA_HOVER_SHADOW =
  '0 0 0 1px rgba(212, 137, 42, 0.55), 0 0 18px rgba(212, 137, 42, 0.55), 0 4px 16px rgba(0,0,0,0.4)' as const
const CTA_HOVER_FILTER = 'brightness(1.10)' as const

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  amber: '#d4892a',
  amberGlow: '#f4a73e',
  cream: '#e8dfc8',
  creamMuted: 'rgba(232,223,200,0.62)',
  creamDim: 'rgba(232,223,200,0.35)',
  fontMono: '"Geist Mono", ui-monospace, monospace',
  fontKanji: '"Noto Serif JP", "Yu Mincho", serif',
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

type PhaseKind =
  | 'lobby' | 'bet-entry' | 'spinning' | 'settling'
  | 'win-reveal' | 'settled' | 'free-spinning' | 'free-settling'
  | 'spirit-bonus-entry' | 'spirit-bonus-end' | 'spirit-sealing-active'

export interface InstrumentRailProps {
  readonly layoutTier: LayoutTier
  readonly phaseKind: PhaseKind
  // Wager
  readonly wagerLamports: bigint
  readonly chipTrayOpen: boolean
  readonly onOpenChipTray: () => void
  readonly onStepWagerDown: () => void
  readonly onStepWagerUp: () => void
  readonly canStepWagerDown: boolean
  readonly canStepWagerUp: boolean
  // CTA
  readonly ctaLabel: string
  readonly ctaDisabled: boolean
  readonly ctaHovered: boolean
  readonly ctaPressed: boolean
  readonly onCtaClick: () => void
  readonly onCtaPointerEnter: () => void
  readonly onCtaPointerLeave: () => void
  readonly onCtaPointerDown: () => void
  readonly onCtaPointerUp: () => void
  readonly onCtaPointerCancel: () => void
  // Cash Out
  readonly cashOutPressed: boolean
  readonly cashOutHovered: boolean
  readonly onCashOut: () => void
  readonly onCashOutPointerEnter: () => void
  readonly onCashOutPointerLeave: () => void
  readonly onCashOutPointerDown: () => void
  readonly onCashOutPointerUp: () => void
  readonly onCashOutPointerCancel: () => void
  // Awaken
  readonly talismanAwakenActive: boolean
  readonly isSpiritBonusActive: boolean
  readonly onActivateAwaken: () => void
  // Readouts
  readonly displayedWinLamports: bigint
  readonly sessionWageredLamports: bigint
  readonly sessionNetLamports: bigint
  readonly freeSpinsRemaining: number | null
  // Receipt drawer
  readonly receiptSheetOpen: boolean
  readonly onOpenReceipt: () => void
  // Settled phase data (for receipt + glass box)
  readonly settledTotalWinLamports?: bigint
  readonly settledOwnershipPoints?: bigint
  readonly settledSessionSeedHex?: string
  // Context zone (seal medallions) — passed as ReactElement for composition
  readonly contextSlot?: ReactElement | null
  // Glass Box slot (the ReiGlassBoxSeal inline component)
  readonly glassBoxSlot?: ReactElement | null
  // Reduced motion
  readonly prefersReducedMotion: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unlockAudioNow(): void {
  unlockAudioOnFirstGesture()
  ensureAudio()
}

function formatSessionNet(net: bigint): string {
  if (net >= 0n) return `+${formatUsdcCompact(net)}`
  return `-${formatUsdcCompact(-net)}`
}

// ─── Sub-styles (module-level, no session-state params) ──────────────────────

const railOuterStyle: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 4,
  backgroundColor: 'rgba(34,28,22,0.97)',
  backgroundImage: 'none',
  boxShadow:
    'inset 0 1px 0 rgba(200,184,144,0.22), inset 0 12px 32px rgba(0,0,0,0.45), inset 0 -8px 22px rgba(0,0,0,0.48)',
  overflow: 'visible',
  pointerEvents: 'all',
}

const amberFilamentLeftCap: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 16,
  height: 3,
  background: 'linear-gradient(90deg, #a0651e 0%, #f4a73e 60%, #d4892a 100%)',
  clipPath: 'polygon(0% 50%, 50% 0%, 100% 50%, 50% 100%)',
  pointerEvents: 'none',
  zIndex: 1,
}

const amberFilamentRightCap: CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: 16,
  height: 3,
  background: 'linear-gradient(270deg, #a0651e 0%, #f4a73e 60%, #d4892a 100%)',
  clipPath: 'polygon(0% 50%, 50% 0%, 100% 50%, 50% 100%)',
  pointerEvents: 'none',
  zIndex: 1,
}

const statLabelStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 'clamp(11px, 1.4vw, 13px)',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: C.creamMuted,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}

const statValueStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 'clamp(13px, 1.8vw, 16px)',
  fontWeight: 700,
  color: C.cream,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap',
}

const ctaKanjiStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: 'clamp(13px, 1.6vw, 16px)',
  fontWeight: 700,
  opacity: 0.7,
  pointerEvents: 'none',
}

const ctaDisabledStyle: CSSProperties = {
  opacity: 0.45,
  cursor: 'default',
  pointerEvents: 'none',
}

const awakenKanjiStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: 11,
  fontWeight: 700,
  opacity: 0.7,
}

const receiptLinkStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 'clamp(10px, 1.2vw, 11px)',
  fontWeight: 400,
  letterSpacing: '0.14em',
  color: C.amber,
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  textDecoration: 'underline',
  textUnderlineOffset: 2,
  textAlign: 'left',
}

// ─── Zone sub-components ──────────────────────────────────────────────────────

interface WagerZoneProps {
  readonly wagerLamports: bigint
  readonly chipTrayOpen: boolean
  readonly isDisabled: boolean
  readonly plaquePressed: boolean
  readonly plaqueHovered: boolean
  readonly prefersReducedMotion: boolean
  readonly isMobile: boolean
  readonly onOpen: () => void
  readonly onPointerDown: () => void
  readonly onPointerUp: () => void
  readonly onPointerCancel: () => void
  readonly onPointerEnter: () => void
  readonly onPointerLeave: () => void
  // Inline − / + wager steppers (adjust without opening the chip tray).
  readonly onStepDown: () => void
  readonly onStepUp: () => void
  readonly canStepDown: boolean
  readonly canStepUp: boolean
}

function WagerZone({
  wagerLamports,
  chipTrayOpen,
  isDisabled,
  plaquePressed,
  plaqueHovered,
  prefersReducedMotion,
  isMobile,
  onOpen,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerEnter,
  onPointerLeave,
  onStepDown,
  onStepUp,
  canStepDown,
  canStepUp,
}: WagerZoneProps): ReactElement {
  const isOpen = chipTrayOpen
  const stepBtnStyle = (enabled: boolean): CSSProperties => ({
    width: isMobile ? 40 : 44,
    height: isMobile ? 40 : 44,
    minWidth: isMobile ? 40 : 44,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #2a2520 0%, #201d1a 100%)',
    color: enabled ? '#e8dfc8' : 'rgba(232,223,200,0.28)',
    border: '1px solid rgba(90,78,58,0.42)',
    borderRadius: 4,
    fontFamily: C.fontMono,
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1,
    cursor: enabled && !isDisabled ? 'pointer' : 'default',
    opacity: isDisabled ? 0.45 : 1,
    touchAction: 'manipulation',
  })
  return (
    <div
      data-slot="wager-plaque"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SP[6],
        height: '100%',
        padding: `0 ${SP[8]}px`,
      }}
    >
      <button
        type="button"
        aria-label="Lower bet"
        disabled={isDisabled || !canStepDown}
        onClick={onStepDown}
        style={stepBtnStyle(canStepDown)}
      >
        −
      </button>
      <button
        type="button"
        style={{
          position: 'relative',
          width: isMobile ? '100%' : 112,
          height: isMobile ? 44 : 64,
          // Pressed wager-STONE: matte basalt slab carved into the deck. A warm-
          // stone top-edge highlight catches the shrine light; the concave inner
          // shadow sinks the face so the number reads as struck-into-rock, not a
          // floating debug field. On open we warm the basalt toward amber-lit.
          background: isOpen
            ? 'linear-gradient(135deg, #3a3024 0%, #2a2018 55%, #201a14 100%)'
            : 'linear-gradient(135deg, #2a2520 0%, #231f1b 55%, #201d1a 100%)',
          border: isOpen
            ? '1px solid rgba(212,137,42,0.55)'
            : '1px solid rgba(90,78,58,0.42)',
          borderRadius: 4,
          boxShadow: isOpen
            ? 'inset 0 1px 0 rgba(200,180,140,0.50), inset 0 2px 9px rgba(0,0,0,0.78), inset 0 -1px 2px rgba(0,0,0,0.55)'
            : 'inset 0 1px 0 rgba(200,180,140,0.45), inset 0 2px 9px rgba(0,0,0,0.80), inset 0 -1px 2px rgba(0,0,0,0.60)',
          cursor: isDisabled ? 'default' : 'pointer',
          display: 'flex',
          flexDirection: isMobile ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: isMobile ? 'space-between' : 'center',
          gap: isMobile ? 0 : 2,
          padding: isMobile ? '0 12px' : '8px 10px',
          opacity: isDisabled ? 0.45 : 1,
          pointerEvents: isDisabled ? 'none' : 'all',
          flexShrink: 0,
          overflow: 'hidden',
          transition: plaquePressed
            ? `transform ${PLAQUE_PRESS_MS}ms cubic-bezier(0.2,0,0,1)`
            : `transform ${PLAQUE_HOVER_MS}ms cubic-bezier(0.2,0,0,1)`,
          transform: !prefersReducedMotion
            ? plaquePressed
              ? 'scale(0.97)'
              : plaqueHovered && !isMobile
                ? 'scale(1.02)'
                : undefined
            : undefined,
        }}
        onClick={onOpen}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerEnter={!isMobile ? onPointerEnter : undefined}
        onPointerLeave={!isMobile ? onPointerLeave : undefined}
        disabled={isDisabled}
        aria-expanded={chipTrayOpen}
        aria-label="Select bet amount"
        // Anchor for the WAGER popover — it measures this plaque and blooms
        // directly above it (Tim 2026-06-04: popover must anchor to the BET
        // chip, not float over the board).
        data-oo-rei-wager-anchor="1"
      >
        {/* (Removed the vermilion 賭 corner mark — Tim 2026-06-04 read the red
            seal-ink as off-brand slop. The plaque is now clean amber/stone.) */}
        {/* BET label demoted to a Noto Serif JP whisper above the number. The
         * number is the star — large Geist Mono cream struck into the stone. */}
        <span style={{
          fontFamily: C.fontKanji,
          fontSize: isMobile ? 9 : 10,
          fontWeight: 500,
          letterSpacing: '0.22em',
          color: C.creamMuted,
          textTransform: 'uppercase',
          lineHeight: 1,
          opacity: 0.72,
        }}>BET</span>
        <span style={{
          ...statValueStyle,
          color: C.cream,
          fontWeight: 700,
          letterSpacing: '0.01em',
          textShadow: '0 1px 1px rgba(0,0,0,0.65)',
          fontSize: isMobile ? 'clamp(14px, 3.8vw, 17px)' : 'clamp(20px, 2.2vw, 22px)',
        }}>
          {formatUsdcCompact(wagerLamports)}
        </span>
        {!isMobile && plaqueHovered && !prefersReducedMotion && (
          <span style={{
            fontFamily: C.fontMono,
            fontSize: 9,
            letterSpacing: '0.12em',
            color: 'rgba(232,223,200,0.45)',
            textTransform: 'uppercase',
            transition: `opacity ${PLAQUE_HOVER_MS}ms cubic-bezier(0.2,0,0,1)`,
          }}>
            TAP TO CHANGE
          </span>
        )}
      </button>
      <button
        type="button"
        aria-label="Raise bet"
        disabled={isDisabled || !canStepUp}
        onClick={onStepUp}
        style={stepBtnStyle(canStepUp)}
      >
        +
      </button>
    </div>
  )
}

interface ReadoutsZoneProps {
  readonly phaseKind: PhaseKind
  readonly layoutTier: LayoutTier
  readonly displayedWinLamports: bigint
  readonly sessionWageredLamports: bigint
  readonly sessionNetLamports: bigint
  readonly freeSpinsRemaining: number | null
  readonly isSpiritBonusActive: boolean
  readonly settledTotalWinLamports?: bigint
  readonly settledOwnershipPoints?: bigint
  readonly wagerLamports: bigint
  readonly receiptSheetOpen: boolean
  readonly onOpenReceipt: () => void
  readonly glassBoxSlot?: ReactElement | null
}

/** A single subordinate telemetry row: muted label left, value right.
 *  Crisp type on the deck (no per-stat box) per the HUD-restraint rule. */
function SecondaryStat({
  label,
  value,
  valueColor,
}: {
  readonly label: string
  readonly value: string
  readonly valueColor?: string
}): ReactElement {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: SP[8],
      minWidth: 0,
    }}>
      <span style={{
        fontFamily: C.fontMono,
        fontSize: 'clamp(9px, 1.05vw, 11px)',
        fontWeight: 600,
        letterSpacing: '0.08em',
        color: C.creamDim,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>{label}</span>
      <span style={{
        fontFamily: C.fontMono,
        fontSize: 'clamp(10px, 1.2vw, 12px)',
        fontWeight: 700,
        color: valueColor ?? C.creamMuted,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>{value}</span>
    </div>
  )
}

function ReadoutsZone({
  phaseKind,
  layoutTier,
  displayedWinLamports,
  sessionWageredLamports,
  sessionNetLamports,
  freeSpinsRemaining,
  isSpiritBonusActive,
  settledTotalWinLamports,
  settledOwnershipPoints,
  wagerLamports,
  onOpenReceipt,
  glassBoxSlot,
}: ReadoutsZoneProps): ReactElement {
  const isMobile = layoutTier === 'xs'

  const winLabelColor =
    phaseKind === 'settled' ? 'rgba(212,137,42,0.65)' : undefined
  const winLabel = phaseKind === 'settled' ? 'LAST WIN' : 'WIN'
  const winIsPositive = displayedWinLamports > 0n
  // WIN is the hero readout: it POPS amber when there is a win and recedes to a
  // dim cream at rest, so a real $0.60 win never reads as inert debug output
  // (the #62 "row of equal grey stats" failure, Tim 2026-06-01).
  const heroWinColor = winIsPositive
    ? C.amberGlow
    : phaseKind === 'settled'
      ? C.creamDim
      : C.creamMuted

  return (
    <div
      data-slot="readouts"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'center',
        gap: isMobile ? 3 : SP[4],
        // Tight horizontal padding (SP[4]) so 7-char labels (WAGERED) never
        // truncate in the narrow xs readouts column (was a 2px clip at 390px).
        padding: `${SP[8]}px ${SP[4]}px`,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Hero: WIN — the payoff. Dominant size, amber on win. */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ ...statLabelStyle, color: winLabelColor ?? C.creamMuted }}>{winLabel}</span>
        <span style={{
          fontFamily: C.fontMono,
          fontWeight: winIsPositive ? 800 : 700,
          color: heroWinColor,
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          lineHeight: 1.05,
          fontSize: isMobile ? 'clamp(16px, 5vw, 20px)' : 'clamp(20px, 2.3vw, 28px)',
          textShadow: winIsPositive ? '0 1px 10px rgba(244,167,62,0.28)' : undefined,
        }}>
          {formatUsdcCompact(displayedWinLamports)}
        </span>
      </div>

      {/* Secondary telemetry — demoted UNDER a hairline so it never competes
          with the WIN hero (kills the row-of-equal-grey-stats debug read).
          Crisp type on the deck, no per-stat box (HUD restraint rule). FREE
          SEALS shows only during the bonus, so there is no inert "-" at rest. */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? 1 : 2,
        borderTop: '1px solid rgba(200,184,144,0.10)',
        paddingTop: isMobile ? 3 : SP[4],
        marginTop: 1,
      }}>
        <SecondaryStat
          label={isMobile ? 'NET' : 'SESSION'}
          value={sessionWageredLamports > 0n ? formatSessionNet(sessionNetLamports) : '$0.00'}
        />
        <SecondaryStat
          label="WAGERED"
          value={formatUsdcCompact(sessionWageredLamports)}
        />
        {freeSpinsRemaining !== null && (
          <SecondaryStat
            label={isMobile ? 'SPINS' : 'FREE SPINS'}
            value={String(freeSpinsRemaining)}
            valueColor={isSpiritBonusActive ? C.amberGlow : undefined}
          />
        )}
      </div>

      {/* Receipt row (settled only) */}
      {phaseKind === 'settled' && settledOwnershipPoints !== undefined && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
          <span style={{
            fontFamily: C.fontMono,
            fontSize: 'clamp(9px, 1.1vw, 10px)',
            color: C.amber,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            +{formatPoints(settledOwnershipPoints)} points{' '}
            <span style={{ color: 'rgba(212,137,42,0.60)' }}>
              {settledTotalWinLamports !== undefined && wagerLamports > 0n && settledTotalWinLamports >= wagerLamports
                ? '1.0x' : '1.5x accel.'}
            </span>
          </span>
          <button
            type="button"
            style={receiptLinkStyle}
            onPointerDown={onOpenReceipt}
          >
            RECEIPT 符
          </button>
          {/* Glass Box chip — always visible on settled */}
          {glassBoxSlot && (
            <div style={{ marginTop: 2, overflow: 'hidden' }}>{glassBoxSlot}</div>
          )}
        </div>
      )}
    </div>
  )
}

interface CastZoneProps {
  readonly ctaLabel: string
  readonly ctaDisabled: boolean
  readonly ctaHovered: boolean
  readonly ctaPressed: boolean
  readonly layoutTier: LayoutTier
  readonly isSpiritBonusActive: boolean
  readonly freeSpinsRemaining: number | null
  readonly bonusTotalWin: bigint | null
  readonly prefersReducedMotion: boolean
  readonly phaseKind: PhaseKind
  readonly wagerLamports: bigint
  readonly onCtaClick: () => void
  readonly onCtaPointerEnter: () => void
  readonly onCtaPointerLeave: () => void
  readonly onCtaPointerDown: () => void
  readonly onCtaPointerUp: () => void
  readonly onCtaPointerCancel: () => void
}

function CastZone({
  ctaLabel,
  ctaDisabled,
  ctaHovered,
  ctaPressed,
  layoutTier,
  isSpiritBonusActive,
  freeSpinsRemaining,
  bonusTotalWin,
  prefersReducedMotion,
  phaseKind,
  wagerLamports,
  onCtaClick,
  onCtaPointerEnter,
  onCtaPointerLeave,
  onCtaPointerDown,
  onCtaPointerUp,
  onCtaPointerCancel,
}: CastZoneProps): ReactElement {
  const isLg = layoutTier === 'lg'
  const isStacked = layoutTier !== 'lg'
  const ctaHeight = isLg ? 72 : 52

  const restingShadow =
    !prefersReducedMotion && !ctaHovered && !ctaPressed && isLg
      ? '0 2px 12px rgba(212,137,42,0.30), 0 0 0 1px rgba(212,137,42,0.22), inset 0 1px 0 rgba(255,220,120,0.25)'
      : undefined

  const ctaTransform = prefersReducedMotion
    ? undefined
    : ctaPressed
      ? 'scale(0.98)'
      : ctaHovered
        ? 'scale(1.015)'
        : undefined

  const ctaBoxShadow = !prefersReducedMotion && ctaHovered && !ctaPressed
    ? CTA_HOVER_SHADOW
    : restingShadow

  return (
    <div
      data-slot="cast-button"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SP[4],
        height: '100%',
        padding: isStacked ? `${SP[4]}px ${SP[8]}px` : `${SP[8]}px ${SP[16]}px`,
        position: 'relative',
      }}
    >
      {/* Altar mark (lg single-row only) */}
      {layoutTier === 'lg' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontFamily: C.fontKanji,
            fontSize: 100,
            fontWeight: 400,
            color: '#e8dfc8',
            opacity: 0.05,
            lineHeight: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 0,
          }}
        >霊</div>
      )}

      {/* Spirit bonus status (lg single-row only) */}
      {isSpiritBonusActive && layoutTier === 'lg' && (
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          gap: SP[8],
          alignItems: 'center',
          zIndex: 1,
        }}>
          {freeSpinsRemaining !== null && (
            <span style={{ ...statLabelStyle, fontSize: 11 }}>FREE SPINS: {freeSpinsRemaining}</span>
          )}
          {bonusTotalWin !== null && (
            <span style={{ fontFamily: C.fontMono, fontSize: 14, fontWeight: 700, color: C.amberGlow }}>
              TOTAL: {formatUsdcCompact(bonusTotalWin)}
            </span>
          )}
        </div>
      )}

      {/* Context line (lg single-row only). CONSTANT "TOTAL BET …" in every phase
          (Tim 2026-06-05): it used to flip to "CASTING..." during the spin, which
          (a) duplicated the button's own "CASTING..." label = a double title, and
          (b) shifted the layout as the text length changed phase-to-phase. The
          button alone now carries the CASTING state; this line stays put. */}
      {!isSpiritBonusActive && layoutTier === 'lg' && (
        <div style={{ zIndex: 1 }}>
          <span style={{ ...statLabelStyle, fontSize: 11 }}>
            TOTAL BET {formatUsdcCompact(wagerLamports)} / 20 LINES
          </span>
        </div>
      )}

      {/* CTA button */}
      <button
        style={{
          width: isStacked ? '100%' : 'min(320px, calc(100% - 32px))',
          height: ctaHeight,
          minHeight: 44,
          flexShrink: 0,
          padding: '0 12px',
          fontFamily: C.fontMono,
          fontSize: isStacked ? 16 : 15,
          fontWeight: 800,
          letterSpacing: '0.14em',
          color: '#1a1612',
          background: `linear-gradient(180deg, #f4a73e 0%, #d4892a 60%, #a0651e 100%), url('/assets/generated/oo-rei/hud/ofuda-button-texture.png')`,
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, center',
          backgroundBlendMode: 'normal, multiply',
          backgroundRepeat: 'no-repeat, no-repeat',
          border: 'none',
          borderRadius: 4,
          cursor: ctaDisabled ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: SP[8],
          zIndex: 1,
          ...(ctaDisabled ? ctaDisabledStyle : {}),
          transition: ctaPressed ? CTA_PRESS_TRANSITION : CTA_HOVER_TRANSITION,
          transform: ctaTransform,
          boxShadow: ctaBoxShadow,
          filter: ctaHovered && !ctaPressed ? CTA_HOVER_FILTER : undefined,
        }}
        onClick={onCtaClick}
        type="button"
        disabled={ctaDisabled}
        aria-disabled={ctaDisabled}
        onPointerEnter={onCtaPointerEnter}
        onPointerLeave={onCtaPointerLeave}
        onPointerDown={onCtaPointerDown}
        onPointerUp={onCtaPointerUp}
        onPointerCancel={onCtaPointerCancel}
      >
        <span style={ctaKanjiStyle}>霊</span>
        <span>{ctaLabel}</span>
        <span style={ctaKanjiStyle}>符</span>
      </button>
    </div>
  )
}

interface CashoutZoneProps {
  readonly talismanAwakenActive: boolean
  readonly isSpiritBonusActive: boolean
  readonly cashOutPressed: boolean
  readonly cashOutHovered: boolean
  readonly prefersReducedMotion: boolean
  readonly wagerLamports: bigint
  readonly layoutTier: LayoutTier
  readonly onActivateAwaken: () => void
  readonly onCashOut: () => void
  readonly onCashOutPointerEnter: () => void
  readonly onCashOutPointerLeave: () => void
  readonly onCashOutPointerDown: () => void
  readonly onCashOutPointerUp: () => void
  readonly onCashOutPointerCancel: () => void
}

function CashoutZone({
  talismanAwakenActive,
  isSpiritBonusActive,
  cashOutPressed,
  cashOutHovered,
  prefersReducedMotion,
  wagerLamports,
  layoutTier,
  onActivateAwaken,
  onCashOut,
  onCashOutPointerEnter,
  onCashOutPointerLeave,
  onCashOutPointerDown,
  onCashOutPointerUp,
  onCashOutPointerCancel,
}: CashoutZoneProps): ReactElement {
  const isStacked = layoutTier !== 'lg'
  // Fill the column at every tier (lg column widened to 116-148 — a fixed 100px
  // button left the AWAKEN "+$x" hint cramped). '100%' lets both buttons breathe.
  const btnW = '100%'

  const awakenStyle: CSSProperties = {
    width: btnW,
    height: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SP[4],
    fontFamily: C.fontMono,
    fontSize: isStacked ? 9 : 11,
    fontWeight: 700,
    letterSpacing: '0.10em',
    color: talismanAwakenActive ? C.amber : C.creamMuted,
    background: talismanAwakenActive
      ? 'linear-gradient(160deg, rgba(74,52,20,0.96) 0%, rgba(48,30,8,0.98) 100%)'
      : 'linear-gradient(160deg, rgba(28,20,10,0.96) 0%, rgba(18,12,4,0.98) 100%)',
    border: talismanAwakenActive
      ? '1px solid rgba(212,137,42,0.65)'
      : '1px solid rgba(120,95,55,0.30)',
    borderRadius: 3,
    cursor: talismanAwakenActive || isSpiritBonusActive ? 'default' : 'pointer',
    opacity: talismanAwakenActive || isSpiritBonusActive ? 0.65 : 1,
    pointerEvents: talismanAwakenActive || isSpiritBonusActive ? 'none' : 'all',
    padding: '0 8px',
    boxShadow: talismanAwakenActive
      ? 'inset 0 2px 10px rgba(0,0,0,0.70)'
      : 'inset 0 2px 10px rgba(0,0,0,0.60)',
  }

  const cashOutStyle: CSSProperties = {
    width: btnW,
    height: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: C.fontMono,
    fontSize: isStacked ? 10 : 12,
    fontWeight: 700,
    letterSpacing: '0.10em',
    color: C.cream,
    background: 'linear-gradient(160deg, rgba(48,34,16,0.96) 0%, rgba(28,18,8,0.98) 100%)',
    border: '1px solid rgba(212,137,42,0.45)',
    borderRadius: 3,
    cursor: 'pointer',
    padding: '0 8px',
    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.60)',
    transition: cashOutPressed
      ? 'transform 80ms cubic-bezier(0.2,0,0,1)'
      : `transform ${CASHOUT_HOVER_MS}ms cubic-bezier(0.2,0,0,1), filter ${CASHOUT_HOVER_MS}ms cubic-bezier(0.2,0,0,1)`,
    transform: !prefersReducedMotion && cashOutPressed ? 'scale(0.98)' : undefined,
    filter: !prefersReducedMotion && cashOutHovered && !cashOutPressed ? 'brightness(1.08)' : undefined,
  }

  return (
    <div
      data-slot="cashout-button"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        // lg: center the AWAKEN + CASH OUT pair as one vertical group with a
        // gap, NOT space-between (which shoved AWAKEN into the rail top inset
        // and clipped it — Tim 2026-06-01). Stacked tiers keep tight spacing.
        justifyContent: 'center',
        gap: isStacked ? SP[4] : SP[8],
        height: '100%',
        padding: isStacked ? `${SP[4]}px ${SP[4]}px` : `${SP[12]}px ${SP[12]}px`,
        boxShadow: 'inset 2px 0 0 rgba(0,0,0,0.60), inset 3px 0 0 rgba(200,184,144,0.12)',
      }}
    >
      <button
        style={awakenStyle}
        onClick={() => { unlockAudioNow(); onActivateAwaken() }}
        type="button"
        disabled={talismanAwakenActive || isSpiritBonusActive}
        aria-pressed={talismanAwakenActive}
      >
        <span style={awakenKanjiStyle}>符</span>
        <span>AWAKEN</span>
        {/* The leading "+$0.10" was removed: it read as free money, and the
            Talisman Awaken feature is an inert v1 stub (no cost, no effect).
            Wire the cost + sticky-wilds (with an RTP check) or hide this button —
            flagged as a product decision. jesse/casino fix. */}
      </button>
      <button
        style={cashOutStyle}
        onPointerDown={() => { unlockAudioNow(); playCashOut(); onCashOutPointerDown() }}
        onPointerUp={onCashOutPointerUp}
        onPointerCancel={onCashOutPointerCancel}
        onPointerEnter={onCashOutPointerEnter}
        onPointerLeave={onCashOutPointerLeave}
        type="button"
        data-testid="oo-rei-cash-out"
        data-slot="cashout-button-inner"
      >
        CASH OUT
      </button>
    </div>
  )
}

// ─── InstrumentRail (main export) ─────────────────────────────────────────────

export interface InstrumentRailExtraProps {
  /** Controls whether wager plaque hover is active (forwarded from parent state). */
  readonly plaqueHovered: boolean
  readonly plaquePressed: boolean
  readonly onPlaquePointerEnter: () => void
  readonly onPlaquePointerLeave: () => void
  readonly onPlaquePointerDown: () => void
  readonly onPlaquePointerUp: () => void
  readonly onPlaquePointerCancel: () => void
  /** Bonus total win for context display (only non-null during spirit bonus). */
  readonly bonusTotalWin: bigint | null
}

export function OoReiInstrumentRail(
  props: InstrumentRailProps & InstrumentRailExtraProps,
): ReactElement {
  const {
    layoutTier,
    phaseKind,
    wagerLamports,
    chipTrayOpen,
    onOpenChipTray,
    onStepWagerDown,
    onStepWagerUp,
    canStepWagerDown,
    canStepWagerUp,
    ctaLabel,
    ctaDisabled,
    ctaHovered,
    ctaPressed,
    onCtaClick,
    onCtaPointerEnter,
    onCtaPointerLeave,
    onCtaPointerDown,
    onCtaPointerUp,
    onCtaPointerCancel,
    cashOutPressed,
    cashOutHovered,
    onCashOut,
    onCashOutPointerEnter,
    onCashOutPointerLeave,
    onCashOutPointerDown,
    onCashOutPointerUp,
    onCashOutPointerCancel,
    talismanAwakenActive,
    isSpiritBonusActive,
    onActivateAwaken,
    displayedWinLamports,
    sessionWageredLamports,
    sessionNetLamports,
    freeSpinsRemaining,
    receiptSheetOpen,
    onOpenReceipt,
    settledTotalWinLamports,
    settledOwnershipPoints,
    settledSessionSeedHex: _settledSessionSeedHex,
    contextSlot,
    glassBoxSlot,
    prefersReducedMotion,
    // extra
    plaqueHovered,
    plaquePressed,
    onPlaquePointerEnter,
    onPlaquePointerLeave,
    onPlaquePointerDown,
    onPlaquePointerUp,
    onPlaquePointerCancel,
    bonusTotalWin,
  } = props

  const config = LAYOUT_CONFIG[layoutTier]
  const heights = ZONE_HEIGHTS[layoutTier]
  const isMobile = layoutTier === 'xs'
  // xs, sm, AND md use the 2-row stacked rail (cast row + controls row). Only lg
  // (≥1024) uses the single horizontal row. md was clipping as a single row — its
  // controls need the stacked vertical budget.
  const isStacked = layoutTier !== 'lg'
  const isSingleRow = layoutTier === 'lg'

  return (
    <div
      data-zone="rail"
      style={{
        ...railOuterStyle,
        height: heights.railH,
      }}
    >
      {/* Amber end-caps on filament line */}
      <span aria-hidden="true" style={amberFilamentLeftCap} />
      <span aria-hidden="true" style={amberFilamentRightCap} />

      {/* Grid container — max-width centred, parametric columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isSingleRow ? config.railCols : '1fr',
          gridTemplateRows: isSingleRow ? undefined : 'auto auto',
          gridTemplateAreas: config.railAreas,
          alignItems: isSingleRow ? 'center' : 'stretch',
          height: '100%',
          maxWidth: 1280,
          marginInline: 'auto',
          paddingInline: config.railPxInline,
          gap: `${SP[4]}px ${SP[8]}px`,
        }}
      >
        {/* ── xs/sm/md: CAST row (row 1, full width) ────────────────────── */}
        {isStacked && (
          <div style={{ gridArea: 'cast', padding: `${SP[4]}px 0` }}>
            <CastZone
              ctaLabel={ctaLabel}
              ctaDisabled={ctaDisabled}
              ctaHovered={ctaHovered}
              ctaPressed={ctaPressed}
              layoutTier={layoutTier}
              isSpiritBonusActive={isSpiritBonusActive}
              freeSpinsRemaining={freeSpinsRemaining}
              bonusTotalWin={bonusTotalWin}
              prefersReducedMotion={prefersReducedMotion}
              phaseKind={phaseKind}
              wagerLamports={wagerLamports}
              onCtaClick={onCtaClick}
              onCtaPointerEnter={onCtaPointerEnter}
              onCtaPointerLeave={onCtaPointerLeave}
              onCtaPointerDown={onCtaPointerDown}
              onCtaPointerUp={onCtaPointerUp}
              onCtaPointerCancel={onCtaPointerCancel}
            />
          </div>
        )}

        {/* ── xs/sm/md: controls row (row 2) ─────────────────────────────── */}
        {isStacked && (
          <div
            style={{
              gridArea: 'controls',
              display: 'grid',
              gridTemplateColumns: config.contextVisible
                ? `minmax(88px, 1fr) minmax(48px, 64px) 1fr minmax(76px, 96px)`
                : `minmax(88px, 1fr) 1fr minmax(76px, 96px)`,
              alignItems: 'stretch',
              gap: SP[4],
              height: 96,
            }}
          >
            {/* Wager */}
            <WagerZone
              wagerLamports={wagerLamports}
              chipTrayOpen={chipTrayOpen}
              isDisabled={isSpiritBonusActive}
              plaquePressed={plaquePressed}
              plaqueHovered={false}
              prefersReducedMotion={prefersReducedMotion}
              isMobile={isMobile}
              onOpen={onOpenChipTray}
              onPointerDown={() => { unlockAudioNow(); onPlaquePointerDown() }}
              onPointerUp={onPlaquePointerUp}
              onPointerCancel={onPlaquePointerCancel}
              onPointerEnter={onPlaquePointerEnter}
              onPointerLeave={onPlaquePointerLeave}
              onStepDown={() => { unlockAudioNow(); onStepWagerDown() }}
              onStepUp={() => { unlockAudioNow(); onStepWagerUp() }}
              canStepDown={canStepWagerDown}
              canStepUp={canStepWagerUp}
            />
            {/* Context (spirit medallions) — sm only. Seated in a faint amber
             * seal-recess so the medallion reads as a deliberate mounted seal,
             * not a ghost floating in an empty slot. */}
            {config.contextVisible && contextSlot && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderRadius: 8,
                background: 'radial-gradient(ellipse at center, rgba(212,137,42,0.07) 0%, rgba(212,137,42,0) 70%)',
              }}>
                {contextSlot}
              </div>
            )}
            {/* Readouts */}
            <ReadoutsZone
              phaseKind={phaseKind}
              layoutTier={layoutTier}
              displayedWinLamports={displayedWinLamports}
              sessionWageredLamports={sessionWageredLamports}
              sessionNetLamports={sessionNetLamports}
              freeSpinsRemaining={freeSpinsRemaining}
              isSpiritBonusActive={isSpiritBonusActive}
              settledTotalWinLamports={settledTotalWinLamports}
              settledOwnershipPoints={settledOwnershipPoints}
              wagerLamports={wagerLamports}
              receiptSheetOpen={receiptSheetOpen}
              onOpenReceipt={onOpenReceipt}
              glassBoxSlot={glassBoxSlot}
            />
            {/* Cashout */}
            <CashoutZone
              talismanAwakenActive={talismanAwakenActive}
              isSpiritBonusActive={isSpiritBonusActive}
              cashOutPressed={cashOutPressed}
              cashOutHovered={cashOutHovered}
              prefersReducedMotion={prefersReducedMotion}
              wagerLamports={wagerLamports}
              layoutTier={layoutTier}
              onActivateAwaken={onActivateAwaken}
              onCashOut={onCashOut}
              onCashOutPointerEnter={onCashOutPointerEnter}
              onCashOutPointerLeave={onCashOutPointerLeave}
              onCashOutPointerDown={onCashOutPointerDown}
              onCashOutPointerUp={onCashOutPointerUp}
              onCashOutPointerCancel={onCashOutPointerCancel}
            />
          </div>
        )}

        {/* ── md/lg: single row, 5 named grid areas ──────────────────────── */}
        {isSingleRow && (
          <>
            <div style={{ gridArea: 'wager', height: '100%', display: 'flex', alignItems: 'center' }}>
              <WagerZone
                wagerLamports={wagerLamports}
                chipTrayOpen={chipTrayOpen}
                isDisabled={false}
                plaquePressed={plaquePressed}
                plaqueHovered={plaqueHovered}
                prefersReducedMotion={prefersReducedMotion}
                isMobile={false}
                onOpen={onOpenChipTray}
                onPointerDown={() => { unlockAudioNow(); onPlaquePointerDown() }}
                onPointerUp={onPlaquePointerUp}
                onPointerCancel={onPlaquePointerCancel}
                onPointerEnter={onPlaquePointerEnter}
                onPointerLeave={onPlaquePointerLeave}
              />
            </div>
            <div style={{
              gridArea: 'context',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              // Faint amber seal-recess: the medallion reads as a deliberately
              // mounted seal in a carved niche, not a ghost in an empty slot.
              background: 'radial-gradient(ellipse at center, rgba(212,137,42,0.08) 0%, rgba(212,137,42,0) 68%)',
              boxShadow: 'inset -2px 0 0 rgba(0,0,0,0.60), inset -3px 0 0 rgba(200,184,144,0.12)',
            }}>
              {contextSlot}
            </div>
            <div style={{ gridArea: 'cast', height: '100%' }}>
              <CastZone
                ctaLabel={ctaLabel}
                ctaDisabled={ctaDisabled}
                ctaHovered={ctaHovered}
                ctaPressed={ctaPressed}
                layoutTier={layoutTier}
                isSpiritBonusActive={isSpiritBonusActive}
                freeSpinsRemaining={freeSpinsRemaining}
                bonusTotalWin={bonusTotalWin}
                prefersReducedMotion={prefersReducedMotion}
                phaseKind={phaseKind}
                wagerLamports={wagerLamports}
                onCtaClick={onCtaClick}
                onCtaPointerEnter={onCtaPointerEnter}
                onCtaPointerLeave={onCtaPointerLeave}
                onCtaPointerDown={onCtaPointerDown}
                onCtaPointerUp={onCtaPointerUp}
                onCtaPointerCancel={onCtaPointerCancel}
              />
            </div>
            <div style={{
              gridArea: 'readouts',
              height: '100%',
              boxShadow: 'inset 2px 0 0 rgba(0,0,0,0.50), inset 3px 0 0 rgba(200,184,144,0.09)',
            }}>
              <ReadoutsZone
                phaseKind={phaseKind}
                layoutTier={layoutTier}
                displayedWinLamports={displayedWinLamports}
                sessionWageredLamports={sessionWageredLamports}
                sessionNetLamports={sessionNetLamports}
                freeSpinsRemaining={freeSpinsRemaining}
                isSpiritBonusActive={isSpiritBonusActive}
                settledTotalWinLamports={settledTotalWinLamports}
                settledOwnershipPoints={settledOwnershipPoints}
                wagerLamports={wagerLamports}
                receiptSheetOpen={receiptSheetOpen}
                onOpenReceipt={onOpenReceipt}
                glassBoxSlot={glassBoxSlot}
              />
            </div>
            <div style={{ gridArea: 'cashout', height: '100%' }}>
              <CashoutZone
                talismanAwakenActive={talismanAwakenActive}
                isSpiritBonusActive={isSpiritBonusActive}
                cashOutPressed={cashOutPressed}
                cashOutHovered={cashOutHovered}
                prefersReducedMotion={prefersReducedMotion}
                wagerLamports={wagerLamports}
                layoutTier={layoutTier}
                onActivateAwaken={onActivateAwaken}
                onCashOut={onCashOut}
                onCashOutPointerEnter={onCashOutPointerEnter}
                onCashOutPointerLeave={onCashOutPointerLeave}
                onCashOutPointerDown={onCashOutPointerDown}
                onCashOutPointerUp={onCashOutPointerUp}
                onCashOutPointerCancel={onCashOutPointerCancel}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

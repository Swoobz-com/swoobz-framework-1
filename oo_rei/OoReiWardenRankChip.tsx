'use client'

/**
 * OoReiWardenRankChip — the visible Warden Rank readout (D.1).
 *
 * A compact dark-glass chip (top-left, clear of the bottom HUD) that surfaces
 * the player's progression rank: kanji + title + a thin progress-to-next bar.
 * This is the "set the next level" signal — it climbs every spin, win or lose.
 *
 * Display-only. EV-neutral: the rank never changes payout/odds. Brand register:
 * Noto Serif JP for the kanji (display identity), Geist Mono for the label/
 * numbers, amber accent, zero cyan. pointer-events:none — never blocks a CTA.
 * RG-safe: the progress bar reflects accrued seals only; no chase pressure copy.
 */

import type { CSSProperties, ReactElement } from 'react'

import type { WardenRankState } from './ooReiWardenRank'
import { WARDEN_REWARDS } from './ooReiWardenRewards'

interface OoReiWardenRankChipProps {
  readonly rank: WardenRankState
  /** prefers-reduced-motion → no width transition on the progress fill. */
  readonly reducedMotion: boolean
  /** Tap action — opens the myth map / journey view. Makes the chip interactive. */
  readonly onPress: () => void
  /**
   * compact: mobile portrait mode (≤480px).
   * Suppresses the "NEXT · <unlock>" blurb — too wide and too tall for the
   * 412px canvas top zone. Shows only: kanji + rank label + progress bar.
   * The blurb is still accessible via the Warden's Path rewards panel (tap opens it).
   */
  readonly compact?: boolean
}

// Press + hover feedback (scoped to the chip's testid). Press-ack <100ms (GC1).
const CHIP_INTERACTION_CSS = `
[data-testid="oo-rei-warden-rank"] {
  transition: transform 80ms cubic-bezier(0.2,0,0,1), border-color 150ms ease;
}
[data-testid="oo-rei-warden-rank"]:active { transform: scale(0.97); }
@media (hover: hover) {
  [data-testid="oo-rei-warden-rank"]:hover { border-color: rgba(244,167,62,0.75); }
}
@media (prefers-reduced-motion: reduce) {
  [data-testid="oo-rei-warden-rank"] { transition: none; }
}
`

const C = {
  glass: 'rgba(14, 11, 7, 0.72)',
  rim: 'rgba(212, 137, 42, 0.40)',
  amber: '#f4a73e',
  amberDim: 'rgba(244, 167, 62, 0.30)',
  cream: '#e8dfc8',
  creamMuted: 'rgba(232, 223, 200, 0.55)',
  fontKanji: '"Noto Serif JP", "Yu Mincho", serif',
  fontMono: '"Geist Mono", ui-monospace, monospace',
} as const

export function OoReiWardenRankChip({
  rank,
  reducedMotion,
  onPress,
  compact = false,
}: OoReiWardenRankChipProps): ReactElement {
  // progressBps 0..10000 → 0..100% fill width.
  const fillPct = Number(rank.progressBps) / 100
  // The NEXT teaser names the concrete reward the next rank GRANTS — a short,
  // complete product name (kanji + name), NOT the lore SENTENCE that was being
  // clamped to a mid-word ellipsis ("...The storm..."). Tim composition Tier 4:
  // "complete phrase or nothing, never a cut-off sentence." The reward at
  // rankIndex N is granted on reaching rank N (the next tier's index).
  const nextReward =
    rank.nextTier != null
      ? WARDEN_REWARDS.find((r) => r.rankIndex === rank.nextTier!.index)
      : undefined

  return (
    <button
      type="button"
      style={compact ? wrapStyleCompact : wrapStyle}
      onClick={onPress}
      aria-label={`Warden rank ${rank.tier.title}. Tap to view your journey.`}
      data-testid="oo-rei-warden-rank"
    >
      <style>{CHIP_INTERACTION_CSS}</style>
      <div style={rowStyle}>
        <span style={compact ? kanjiStyleCompact : kanjiStyle} aria-hidden="true">{rank.tier.kanji}</span>
        <div style={textColStyle}>
          <span style={compact ? titleStyleCompact : titleStyle}>{rank.tier.title}</span>
          <span style={compact ? subStyleCompact : subStyle}>
            {rank.isMaxRank ? 'MAX' : `RANK ${rank.tier.index + 1}`}
          </span>
        </div>
      </div>
      <div style={barTrackStyle}>
        <div
          style={{
            ...barFillStyle,
            width: `${fillPct}%`,
            transition: reducedMotion ? 'none' : 'width 600ms cubic-bezier(0,0,0.25,1)',
          }}
        />
      </div>
      {/* NEXT-unlock teaser — only on desktop (compact=false). Names the concrete
          soulbound reward the next rank grants (kanji + short name), one complete
          line that never clamps to a cut sentence. Mobile (compact) suppresses it
          (too wide for the 412px top zone); the full ladder is one tap away. */}
      {!compact && rank.isMaxRank && (
        <span style={nextStyle}>
          <span style={nextNameStyle}>Highest rank reached</span>
        </span>
      )}
      {!compact && !rank.isMaxRank && nextReward != null && (
        <span style={nextStyle}>
          <span style={nextLeadStyle}>NEXT</span>
          <span style={nextKanjiStyle} aria-hidden="true">{nextReward.nftKanji}</span>
          <span style={nextNameStyle}>{nextReward.nftName}</span>
        </span>
      )}
    </button>
  )
}

const wrapStyle: CSSProperties = {
  // Top-RIGHT status cluster (below the region banner) — clear of the OO-REI
  // wordmark + the left spirit-gauge rail (was top-left, which collided).
  position: 'absolute',
  top: 56,
  right: 14,
  zIndex: 4,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 5,
  width: 178,
  margin: 0,
  padding: '8px 11px 9px',
  borderRadius: 9,
  background: C.glass,
  border: `1px solid ${C.rim}`,
  boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
  // Interactive: opens the journey/map view. Press-ack via CHIP_INTERACTION_CSS.
  pointerEvents: 'auto',
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
  appearance: 'none',
  WebkitAppearance: 'none',
  userSelect: 'none',
}

/**
 * Mobile compact variant (≤480px portrait).
 * Suppresses the NEXT-blurb. Narrower (130px vs 178px).
 * Positioned at top:8, right:8 — in the same row as the ‹ LOBBY button
 * (which is top:8, left:12) so both controls sit in ONE header row and
 * never overlap the region banner (top:42) or title cluster.
 * gap:4 (was 5) — tighter without the blurb row.
 */
const wrapStyleCompact: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 6,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'center',
  gap: 4,
  width: 130,
  // 44px minimum touch target (GC7 / RG-C8). Content is ~40px; floor it.
  minHeight: 44,
  margin: 0,
  padding: '5px 8px 6px',
  borderRadius: 6,
  background: C.glass,
  border: `1px solid ${C.rim}`,
  boxShadow: '0 2px 8px rgba(0,0,0,0.40)',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
  pointerEvents: 'auto',
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
  appearance: 'none',
  WebkitAppearance: 'none',
  userSelect: 'none',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
}

const kanjiStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1,
  color: C.amber,
  textShadow: '0 1px 6px rgba(244,167,62,0.35)',
}

/** Compact (mobile) variant — smaller kanji so the chip fits in 130px×40px */
const kanjiStyleCompact: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1,
  color: C.amber,
  textShadow: '0 1px 4px rgba(244,167,62,0.30)',
}

const textColStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
}

const titleStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.12em',
  color: C.cream,
  lineHeight: 1.1,
}

/** Compact (mobile) variant — slightly smaller so it fits in the 130px chip */
const titleStyleCompact: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.10em',
  color: C.cream,
  lineHeight: 1.1,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
  maxWidth: 76,
}

const subStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 9,
  letterSpacing: '0.18em',
  color: C.creamMuted,
  textTransform: 'uppercase',
  lineHeight: 1,
}

/** Compact (mobile) variant — same as subStyle (already small enough) */
const subStyleCompact: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 8,
  letterSpacing: '0.14em',
  color: C.creamMuted,
  textTransform: 'uppercase',
  lineHeight: 1,
}

const barTrackStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 3,
  borderRadius: 2,
  background: C.amberDim,
  overflow: 'hidden',
}

const barFillStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  height: '100%',
  borderRadius: 2,
  background: C.amber,
}

// Single-line teaser row: NEXT · <kanji> <reward name>. One line, never a
// two-line clamp with an ellipsis mid-sentence (Tim Tier 4). The reward name
// ellipsizes only if it ever exceeds the chip — but every nftName is short.
const nextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  marginTop: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}

const nextLeadStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 8,
  fontWeight: 600,
  letterSpacing: '0.16em',
  color: C.creamMuted,
  textTransform: 'uppercase',
  flexShrink: 0,
}

/** The lone amber kanji accent — keeps the chip the single amber element. */
const nextKanjiStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: 11,
  fontWeight: 700,
  lineHeight: 1,
  color: C.amber,
  flexShrink: 0,
}

const nextNameStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 9.5,
  letterSpacing: '0.02em',
  color: 'rgba(232, 223, 200, 0.82)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minWidth: 0,
}

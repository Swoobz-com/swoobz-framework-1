'use client'

/**
 * OoReiRankUpBanner — the Warden Rank-up celebration moment (D.1 / M2).
 *
 * Fires once when the player crosses a Warden Rank threshold (rankUpTier set by
 * the provider). A brief top-center banner: the new rank's kanji + title + the
 * reward it just unlocked, with a tap-through to the Warden's Path. This is the
 * "something happened" answer to a rank-up — the progression payoff moment.
 *
 * RG-C5 (structural): all timings are module-level `as const` — the banner is
 * BYTE-IDENTICAL for a rank-2 and a rank-10 crossing. No escalation by rank,
 * streak, or session. EV-neutral: a rank never changes payout/odds. Brand: dark-
 * glass, Noto Serif JP kanji + Geist Mono labels, amber, ZERO cyan, no em-dash.
 * prefers-reduced-motion: appears instantly, no slide/fade. Domain C.
 */

import { type CSSProperties, type ReactElement, useEffect } from 'react'

import { rewardForRank } from './ooReiWardenRewards'
import type { WardenRankTier } from './ooReiWardenRank'

// ─── Fluid type scale ─────────────────────────────────────────────────────────
function fluid(minPx: number, maxPx: number): string {
  const slope = ((maxPx - minPx) / (1600 - 320)) * 100
  const intercept = minPx - slope * (320 / 100)
  return `clamp(${minPx}px, ${intercept.toFixed(2)}px + ${slope.toFixed(3)}vw, ${maxPx}px)`
}

// RG-C5: module-const durations — identical for every rank crossing.
const ENTER_MS = 220 as const
const TOTAL_MS = 4200 as const

interface OoReiRankUpBannerProps {
  readonly tier: WardenRankTier
  readonly reducedMotion: boolean
  /** Auto-fires after TOTAL_MS, and on the close affordance. Clears rankUpTier. */
  readonly onDismiss: () => void
  /** Tap-through to the Warden's Path rewards panel (also clears rankUpTier). */
  readonly onViewRewards: () => void
}

const C = {
  glass: 'rgba(16, 12, 7, 0.94)',
  rim: 'rgba(244, 167, 62, 0.55)',
  amber: '#f4a73e',
  amberBright: '#ffc44d',
  cream: '#e8dfc8',
  creamMuted: 'rgba(232, 223, 200, 0.62)',
  fontKanji: '"Noto Serif JP", "Yu Mincho", serif',
  fontMono: '"Geist Mono", ui-monospace, monospace',
} as const

export function OoReiRankUpBanner({
  tier,
  reducedMotion,
  onDismiss,
  onViewRewards,
}: OoReiRankUpBannerProps): ReactElement {
  // Auto-dismiss after a module-const dwell. Re-armed if a new rank crosses
  // (tier.index in deps) so a second rank-up shows its own full moment.
  useEffect(() => {
    const id = setTimeout(onDismiss, TOTAL_MS)
    return () => clearTimeout(id)
  }, [onDismiss, tier.index])

  const reward = rewardForRank(tier.index)

  return (
    <div style={veilStyle} role="status" aria-label={`Warden rank up: ${tier.title}`} data-testid="oo-rei-rankup-banner">
      <button
        type="button"
        style={{
          ...cardStyle,
          animation: reducedMotion ? undefined : `oo-rei-rankup-in ${ENTER_MS}ms cubic-bezier(0,0,0.25,1) both`,
        }}
        onClick={onViewRewards}
        aria-label="View your Warden's Path"
      >
        <style>{RANKUP_KEYFRAME}</style>
        <span style={eyebrowStyle}>WARDEN RANK</span>
        <div style={rowStyle}>
          <span style={kanjiStyle} aria-hidden="true">{tier.kanji}</span>
          <div style={textColStyle}>
            <span style={titleStyle}>{tier.title}</span>
            <span style={subStyle}>RANK {tier.index + 1} REACHED</span>
          </div>
        </div>
        {reward && (
          <span style={rewardStyle}>
            Unlocked · {reward.nftName}. {reward.benefitLabel}
          </span>
        )}
        <span style={ctaStyle}>Tap to view your path</span>
      </button>
    </div>
  )
}

// Single authored reveal sweep (no loop). Reduced-motion path omits it entirely.
const RANKUP_KEYFRAME = `
@keyframes oo-rei-rankup-in {
  0%   { opacity: 0; transform: translateY(-10px); }
  100% { opacity: 1; transform: translateY(0); }
}
`

const veilStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 45,
  display: 'flex',
  justifyContent: 'center',
  paddingTop: 'clamp(64px, 14vh, 132px)',
  // The veil itself never blocks the board — only the card is interactive.
  pointerEvents: 'none',
}

const cardStyle: CSSProperties = {
  pointerEvents: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 7,
  width: 'min(clamp(320px, 28vw, 420px), 84vw)',
  padding: '14px 18px 13px',
  borderRadius: 12,
  background: C.glass,
  border: `1px solid ${C.rim}`,
  boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  cursor: 'pointer',
  textAlign: 'center',
  font: 'inherit',
  appearance: 'none',
  WebkitAppearance: 'none',
}

const eyebrowStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(10, 12), letterSpacing: '0.28em', color: C.amber, textTransform: 'uppercase' }
const rowStyle: CSSProperties = { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }
const kanjiStyle: CSSProperties = { fontFamily: C.fontKanji, fontSize: fluid(36, 48), fontWeight: 900, color: C.amberBright, lineHeight: 1, textShadow: '0 2px 14px rgba(244,167,62,0.4)' }
const textColStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }
const titleStyle: CSSProperties = { fontFamily: C.fontKanji, fontSize: fluid(16, 22), fontWeight: 700, color: C.cream, lineHeight: 1.1 }
const subStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(10, 13), letterSpacing: '0.16em', color: C.creamMuted }
const rewardStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(11, 14), lineHeight: 1.35, color: C.cream, maxWidth: 280 }
const ctaStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(10, 12), letterSpacing: '0.14em', color: C.amber, textTransform: 'uppercase', paddingTop: 2 }

'use client'

/**
 * PulseRankUpBanner — the Operator Rank-up celebration moment (S5).
 *
 * Fires ONCE when the player crosses a rank threshold (detected via
 * pulseRank.detectPulseRankUp in the consumer). Shows the new rank, the
 * soulbound reward it unlocked, and a tap-through to the unlock showcase.
 *
 * RG-C5 STRUCTURAL (the load-bearing constraint): every timing + amplitude is
 * a module-level `as const`. The banner is BYTE-IDENTICAL for a rank-2 and a
 * rank-10 crossing — no rankIndex / streak / session value reaches any animation
 * or duration. A different rank gets a different NAME, never a louder or longer
 * celebration. Escalation lives in the number on the ladder, not here.
 *
 * EV-NEUTRAL: a rank-up NEVER pays. This is a progression moment, not a money
 * event — it triggers no payout and no math-path side-effect.
 *
 * Domain C: presentation only. Cyan on cool dark glass (Pulse's native accent;
 * no warm ground, so no warm+cyan conflict). No kanji, no em-dash.
 */
import { type CSSProperties, type ReactElement, useEffect } from 'react'
import type { PulseRankTier } from './pulseRank'
import { rewardForRank } from './pulseRewards'

// ─── RG-C5 structural pins (module-const, identical every rank) ──────────────
export const RANKUP_ENTER_MS = 220 as const
export const RANKUP_TOTAL_MS = 4_000 as const

export interface PulseRankUpBannerProps {
  /** The newly-reached tier. */
  readonly tier: PulseRankTier
  /** Auto-dismiss / manual-dismiss callback. */
  readonly onDismiss: () => void
  /** Tap-through to the unlock showcase. */
  readonly onOpenShowcase: () => void
  /** Reduced-motion preference (suppresses the slide; instant appear). */
  readonly reducedMotion?: boolean
}

export function PulseRankUpBanner({
  tier,
  onDismiss,
  onOpenShowcase,
  reducedMotion = false,
}: PulseRankUpBannerProps): ReactElement {
  // Auto-dismiss after a module-const dwell. Identical for every rank (RG-C5).
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, RANKUP_TOTAL_MS)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  const reward = rewardForRank(tier.index)

  return (
    <div style={styles.veil} aria-hidden={false}>
      <style>{KEYFRAMES}</style>
      <div
        style={{
          ...styles.card,
          // Single authored sweep; slide distance is baked into the keyframe
          // (NOT a runtime value). Reduced-motion: instant appear, no slide.
          animation: reducedMotion
            ? undefined
            : `pulse-rankup-enter ${RANKUP_ENTER_MS}ms cubic-bezier(0.2,0.8,0.2,1)`,
        }}
        role="status"
        aria-live="polite"
      >
        <span style={styles.eyebrow}>SIGNAL RANK</span>
        <span style={styles.title}>{tier.titleLab}</span>
        {reward && (
          <span style={styles.reward}>
            <span style={styles.rewardKind}>{reward.benefitKind.toUpperCase()}</span>
            {reward.nftNameLab}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenShowcase}
          className="pulse-pressable"
          style={styles.cta}
        >
          VIEW REWARDS
        </button>
      </div>
    </div>
  )
}

// Self-contained keyframe (top banner slides DOWN from above + fades in). The
// slide distance (-8px) is a constant in the keyframe — never a runtime param.
const KEYFRAMES = `
@keyframes pulse-rankup-enter {
  0%   { opacity: 0; transform: translateY(-8px); }
  100% { opacity: 1; transform: translateY(0); }
}
`

const MONO = 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)'
const ACCENT = '#29E6FF' // DS cyan — replaces deleted #00D0DE (OLED-safe accent text)

const styles: Record<string, CSSProperties> = {
  veil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 45,
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 'clamp(40px, 10vh, 96px)',
    pointerEvents: 'none',
  },
  card: {
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    minWidth: 220,
    maxWidth: '88vw',
    padding: '16px 24px',
    background: '#0D0F15', // DS coal
    border: `1px solid rgba(0, 240, 255, 0.42)`, // DS volt hairline
    borderRadius: 12,
    boxShadow: '0 16px 48px rgba(3, 7, 13, 0.7)',
    textAlign: 'center',
  },
  eyebrow: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: '0.28em',
    color: 'rgba(255, 255, 255, 0.55)',
  },
  title: {
    fontFamily: MONO,
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: ACCENT,
  },
  reward: {
    fontFamily: MONO,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.72)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  },
  rewardKind: {
    fontSize: 8,
    letterSpacing: '0.16em',
    color: 'rgba(255, 255, 255, 0.45)',
    border: '1px solid rgba(255, 255, 255, 0.10)',
    borderRadius: 4,
    padding: '2px 5px',
  },
  cta: {
    marginTop: 6,
    fontFamily: MONO,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.18em',
    color: ACCENT,
    background: 'transparent',
    border: `1px solid rgba(41, 230, 255, 0.40)`,
    borderRadius: 8,
    padding: '0 18px',
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    touchAction: 'manipulation',
    cursor: 'pointer',
  },
}

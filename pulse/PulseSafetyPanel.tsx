'use client'

/**
 * Pulse Safety Panel — the responsible-gambling surface (RG-C8).
 *
 * Reachable in one tap from the header shield, every phase. Holds the tools a
 * player can actually exercise client-side — a reality check, an in-app
 * reduce-motion toggle, a self-imposed session wager cap, and a one-tap
 * "take a break" — plus an honest pointer that deposit limits and
 * self-exclusion are account-level controls (this standalone build has no
 * account/ledger backend, so it does not fake their enforcement).
 *
 * RG-C5 SAFE: no streak/session value drives any styling; everything here is
 * static chrome. Colors come from the SWOOBZ design system (ink/coal/slate +
 * volt/cyan).
 */
import { type CSSProperties, type ReactElement, useEffect } from 'react'
import { createPortal } from 'react-dom'

const MONO = 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)'
const BODY = 'var(--font-family-body, "Geist", system-ui, sans-serif)'

export interface PulseSafetyPanelProps {
  open: boolean
  onClose: () => void
  /** In-app reduce-motion override (OR'd with the OS media query). */
  reduceMotion: boolean
  onToggleReduceMotion: () => void
  /** Reality-check figures for this session. */
  sessionRounds: number
  sessionNet: string
  sessionDown: boolean
  /** Self-imposed session wager cap in USDC whole units, or null = no cap. */
  wagerCapUsd: number | null
  onCycleWagerCap: () => void
  /** Return to the lobby and close. */
  onTakeABreak: () => void
}

const WAGER_CAP_LABEL = (cap: number | null): string => (cap === null ? 'OFF' : `${cap} USDC`)

export function PulseSafetyPanel(props: PulseSafetyPanelProps): ReactElement | null {
  const { open, onClose } = props

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      style={styles.veil}
      role="dialog"
      aria-modal="true"
      aria-label="Safer play tools"
      onClick={onClose}
    >
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>SAFER PLAY</span>
          <button type="button" onClick={onClose} style={styles.close} aria-label="Close safer play">
            ✕
          </button>
        </div>

        {/* Reality check */}
        <section style={styles.section}>
          <span style={styles.sectionLabel}>REALITY CHECK</span>
          <div style={styles.realityRow}>
            <span style={styles.realityStat}>
              <span style={styles.realityValue}>{props.sessionRounds}</span>
              <span style={styles.realityCaption}>
                {props.sessionRounds === 1 ? 'round' : 'rounds'} this session
              </span>
            </span>
            <span style={styles.realityStat}>
              <span
                style={{
                  ...styles.realityValue,
                  color: props.sessionRounds === 0 ? '#F2F3EF' : props.sessionDown ? '#FF4135' : '#29E6FF',
                }}
              >
                {props.sessionRounds === 0 ? '—' : `${props.sessionDown ? '−' : '+'}${props.sessionNet}`}
              </span>
              <span style={styles.realityCaption}>net position</span>
            </span>
          </div>
        </section>

        {/* Self-imposed session wager cap */}
        <button type="button" style={styles.toggleRow} onClick={props.onCycleWagerCap}>
          <span style={styles.toggleLabel}>
            SESSION WAGER CAP
            <span style={styles.toggleHint}>the most you can stake per round this session</span>
          </span>
          <span style={styles.toggleState}>{WAGER_CAP_LABEL(props.wagerCapUsd)}</span>
        </button>

        {/* Reduce motion */}
        <button type="button" style={styles.toggleRow} onClick={props.onToggleReduceMotion}>
          <span style={styles.toggleLabel}>
            REDUCE MOTION
            <span style={styles.toggleHint}>calmer curve, no shake or debris</span>
          </span>
          <span style={{ ...styles.toggleState, color: props.reduceMotion ? '#29E6FF' : undefined }}>
            {props.reduceMotion ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Take a break */}
        <button type="button" style={styles.breakBtn} onClick={props.onTakeABreak}>
          take a break →
        </button>

        <p style={styles.footnote}>
          Deposit limits and self-exclusion are managed at the account level. If gambling stops
          feeling like a game, take a break — and reach out to a support line in your region.
        </p>
      </div>
    </div>,
    document.body,
  )
}

const styles: Record<string, CSSProperties> = {
  veil: {
    position: 'fixed',
    inset: 0,
    zIndex: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(3, 5, 10, 0.72)',
    padding: 16,
    backdropFilter: 'blur(2px)',
  },
  card: {
    width: 'min(380px, 100%)',
    background: '#0D0F15',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 14,
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    padding: 18,
    fontFamily: BODY,
    color: '#F2F3EF',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.22em',
    color: '#F2F3EF',
  },
  close: {
    width: 44,
    height: 44,
    background: 'transparent',
    border: 'none',
    color: '#98A1B3',
    fontSize: 16,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    background: '#161A23',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  sectionLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.18em',
    color: '#98A1B3',
  },
  realityRow: { display: 'flex', gap: 16 },
  realityStat: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  realityValue: {
    fontFamily: MONO,
    fontSize: 20,
    fontWeight: 700,
    color: '#F2F3EF',
    fontVariantNumeric: 'tabular-nums',
  },
  realityCaption: { fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', color: '#98A1B3' },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 56,
    padding: '10px 12px',
    background: '#161A23',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    cursor: 'pointer',
    touchAction: 'manipulation',
    textAlign: 'left',
  },
  toggleLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: '0.12em',
    color: '#F2F3EF',
  },
  toggleHint: {
    fontFamily: BODY,
    fontSize: 11,
    letterSpacing: 'normal',
    color: '#98A1B3',
    textTransform: 'none',
  },
  toggleState: {
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#98A1B3',
  },
  breakBtn: {
    minHeight: 48,
    background: 'transparent',
    color: '#29E6FF',
    border: '1px solid rgba(41,230,255,0.40)',
    borderRadius: 10,
    fontFamily: MONO,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  footnote: {
    margin: 0,
    fontFamily: BODY,
    fontSize: 11,
    lineHeight: 1.5,
    color: '#98A1B3',
  },
}

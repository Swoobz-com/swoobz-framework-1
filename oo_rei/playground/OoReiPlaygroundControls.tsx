'use client'

/**
 * OoReiPlaygroundControls — Sequence selector + transport controls.
 *
 * DEV-ONLY. Renders the control panel beneath the device frame:
 *   - Sequence selector (all 13 sequences)
 *   - Play / Pause / Replay buttons
 *   - Frame-step (16ms advance)
 *   - 0.25x slow-mo toggle
 *   - Device frame toggle (390 / 1440 width)
 *
 * Brand: amber/cream/vermillion on near-black lacquer surface. ZERO cyan.
 * No animations in this component itself — it is a pure control panel.
 */

import { type CSSProperties } from 'react'

import {
  findSequenceById,
  PLAYGROUND_SEQUENCES,
  type PlaygroundSequence,
} from './ooReiPlaygroundSequences'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OoReiPlaygroundControlsProps {
  readonly activeSequenceId: string
  readonly isPlaying: boolean
  readonly isSlowMo: boolean
  readonly deviceWidth: 390 | 1440
  readonly onSequenceChange: (sequence: PlaygroundSequence) => void
  readonly onPlay: () => void
  readonly onPause: () => void
  readonly onReplay: () => void
  readonly onFrameStep: () => void
  readonly onSlowMoToggle: () => void
  readonly onDeviceWidthToggle: () => void
}

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  bg: '#0e0a06',
  surface: 'rgba(26,18,10,0.96)',
  border: 'rgba(212,137,42,0.28)',
  borderActive: 'rgba(212,137,42,0.65)',
  amber: '#d4892a',
  amberLight: '#f4a73e',
  cream: 'rgba(232,223,200,0.82)',
  creamMuted: 'rgba(232,223,200,0.42)',
  vermillion: '#c0392b',
  mono: '"Geist Mono", ui-monospace, monospace',
} as const

// ─── Component ────────────────────────────────────────────────────────────────

export function OoReiPlaygroundControls({
  activeSequenceId,
  isPlaying,
  isSlowMo,
  deviceWidth,
  onSequenceChange,
  onPlay,
  onPause,
  onReplay,
  onFrameStep,
  onSlowMoToggle,
  onDeviceWidthToggle,
}: OoReiPlaygroundControlsProps) {
  return (
    <div style={panelStyle}>
      {/* ── Sequence selector ──────────────────────────────────────────── */}
      <div style={rowStyle}>
        <label style={labelStyle} htmlFor="pg-seq-select">
          SEQUENCE
        </label>
        <select
          id="pg-seq-select"
          value={activeSequenceId}
          onChange={(e) => {
            const seq = findSequenceById(e.target.value)
            if (seq) onSequenceChange(seq)
          }}
          style={selectStyle}
        >
          {PLAYGROUND_SEQUENCES.map((seq) => (
            <option key={seq.id} value={seq.id}>
              {seq.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Transport ──────────────────────────────────────────────────── */}
      <div style={{ ...rowStyle, gap: 8 }}>
        <label style={labelStyle}>TRANSPORT</label>

        {isPlaying ? (
          <CtrlButton onClick={onPause} label="PAUSE" />
        ) : (
          <CtrlButton onClick={onPlay} label="PLAY" accent />
        )}
        <CtrlButton onClick={onReplay} label="REPLAY" />
        <CtrlButton onClick={onFrameStep} label="+16ms" />
      </div>

      {/* ── Options ────────────────────────────────────────────────────── */}
      <div style={{ ...rowStyle, gap: 8 }}>
        <label style={labelStyle}>OPTIONS</label>

        <CtrlButton
          onClick={onSlowMoToggle}
          label="0.25x SLOW-MO"
          active={isSlowMo}
        />
        <CtrlButton
          onClick={onDeviceWidthToggle}
          label={deviceWidth === 390 ? '390px MOBILE' : '1440px DESKTOP'}
          active={false}
        />
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────── */}
      <div style={legendStyle}>
        <span style={{ color: C.creamMuted, fontFamily: C.mono, fontSize: 9, letterSpacing: '0.16em' }}>
          DEV ONLY · NOT SHIPPED IN PROD · FIXTURE DATA · DOMAIN A MATH NEVER RUNS HERE
        </span>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CtrlButton({
  onClick,
  label,
  accent = false,
  active = false,
}: {
  readonly onClick: () => void
  readonly label: string
  readonly accent?: boolean
  readonly active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...btnBaseStyle,
        borderColor: active || accent ? C.borderActive : C.border,
        color: accent ? C.amberLight : active ? C.amber : C.cream,
        background: active ? 'rgba(212,137,42,0.12)' : 'rgba(14,10,6,0.80)',
      }}
      onPointerDown={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'
      }}
      onPointerUp={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = ''
      }}
      onPointerCancel={(e) => {
        ;(e.currentTarget as HTMLElement).style.transform = ''
      }}
    >
      {label}
    </button>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  width: '100%',
  maxWidth: 860,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '12px 16px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
}

const labelStyle: CSSProperties = {
  fontFamily: C.mono,
  fontSize: 9,
  letterSpacing: '0.22em',
  color: C.creamMuted,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  minWidth: 72,
}

const selectStyle: CSSProperties = {
  fontFamily: C.mono,
  fontSize: 11,
  letterSpacing: '0.06em',
  color: C.cream,
  background: 'rgba(14,10,6,0.90)',
  border: `1px solid ${C.border}`,
  borderRadius: 2,
  padding: '4px 8px',
  flex: 1,
  minWidth: 200,
  maxWidth: 480,
  cursor: 'pointer',
  outline: 'none',
}

const btnBaseStyle: CSSProperties = {
  fontFamily: C.mono,
  fontSize: 10,
  letterSpacing: '0.14em',
  padding: '5px 10px',
  border: '1px solid',
  borderRadius: 2,
  cursor: 'pointer',
  transition: 'transform 80ms cubic-bezier(0.2,0,0,1), border-color 120ms ease, color 120ms ease',
  whiteSpace: 'nowrap',
  outline: 'none',
}

const legendStyle: CSSProperties = {
  paddingTop: 4,
  borderTop: `1px solid rgba(212,137,42,0.12)`,
  textAlign: 'center',
}

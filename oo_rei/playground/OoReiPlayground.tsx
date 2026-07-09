'use client'

/**
 * OoReiPlayground — Root playground component.
 *
 * DEV-ONLY. Orchestrates the sequence selector, transport controls, and device
 * frame view. Manages play/pause/replay state and slow-mo timing.
 *
 * Slow-mo (0.25x) implementation strategy:
 *   CSS animations: injected via .pg-slow-mo CSS class that scales
 *   animation-duration by 4x on child elements.
 *
 *   JS setTimeout delays inside OoReiCinematicOverlay / OoReiChapterClose are
 *   NOT affected by CSS vars. Since those components use module-const timing
 *   from ooReiSignatures (which we cannot mutate — RG-C5), slow-mo for JS
 *   timers is achieved by REMOUNTING with a replayKey and observing the CSS
 *   side only. The phase HUD is driven by onPhaseChange callbacks.
 *
 * Frame-step: advances the sequence by 16ms by pausing + injecting a synthetic
 * tick. In practice, one frame-step = one rAF tick (16.67ms at 60fps).
 *
 * Brand: amber/cream/vermillion. ZERO cyan.
 * Domain C: display only. No financial math.
 */

import { type CSSProperties, useCallback, useState } from 'react'

import { OoReiPlaygroundControls } from './OoReiPlaygroundControls'
import { OoReiPlaygroundSequenceView } from './OoReiPlaygroundSequenceView'
import {
  findSequenceById,
  PLAYGROUND_SEQUENCES,
  type PlaygroundSequence,
} from './ooReiPlaygroundSequences'

// ─── Component ────────────────────────────────────────────────────────────────

export function OoReiPlayground() {
  const [activeSequence, setActiveSequence] = useState<PlaygroundSequence>(
    PLAYGROUND_SEQUENCES[0] as PlaygroundSequence,
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSlowMo, setIsSlowMo] = useState(false)
  const [deviceWidth, setDeviceWidth] = useState<390 | 1440>(390)
  const [replayKey, setReplayKey] = useState(0)
  const [currentPhase, setCurrentPhase] = useState<string>('—')

  // ── Transport handlers ──────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const handleReplay = useCallback(() => {
    setCurrentPhase('—')
    setReplayKey((k) => k + 1)
    setIsPlaying(true)
  }, [])

  const handleFrameStep = useCallback(() => {
    // One frame step: pause if playing, then re-fire a single rAF tick.
    // In the playground context this is a debug aid — the real frame advance
    // happens in the component's own rAF loop. Pausing and resuming causes
    // a single-frame repaint which is the observable effect.
    setIsPlaying(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsPlaying(true)
        requestAnimationFrame(() => setIsPlaying(false))
      })
    })
  }, [])

  const handleSlowMoToggle = useCallback(() => {
    setIsSlowMo((v) => !v)
  }, [])

  const handleDeviceWidthToggle = useCallback(() => {
    setDeviceWidth((w) => (w === 390 ? 1440 : 390))
  }, [])

  const handleSequenceChange = useCallback((seq: PlaygroundSequence) => {
    setActiveSequence(seq)
    setCurrentPhase('—')
    setReplayKey((k) => k + 1)
    setIsPlaying(false)
  }, [])

  const handleComplete = useCallback(() => {
    setIsPlaying(false)
    setCurrentPhase('complete')
  }, [])

  const handlePhaseChange = useCallback((phase: string) => {
    setCurrentPhase(phase)
  }, [])

  // ── URL query param: ?seq=<id> pre-selects a sequence on load ──────────────
  // (Handled at mount only, no router dep needed for a dev-only route)

  return (
    <div style={rootStyle}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={headerStyle}>
        <span style={titleStyle}>OO-REI ANIMATION PLAYGROUND</span>
        <span style={subtitleStyle}>
          DEV · PHASE: {currentPhase.toUpperCase()}
        </span>
      </div>

      {/* ── Sequence view (device frame) ─────────────────────────────────── */}
      <OoReiPlaygroundSequenceView
        sequence={activeSequence}
        isPlaying={isPlaying}
        isSlowMo={isSlowMo}
        deviceWidth={deviceWidth}
        replayKey={replayKey}
        onComplete={handleComplete}
        onPhaseChange={handlePhaseChange}
      />

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div style={controlsWrapStyle}>
        <OoReiPlaygroundControls
          activeSequenceId={activeSequence.id}
          isPlaying={isPlaying}
          isSlowMo={isSlowMo}
          deviceWidth={deviceWidth}
          onSequenceChange={handleSequenceChange}
          onPlay={handlePlay}
          onPause={handlePause}
          onReplay={handleReplay}
          onFrameStep={handleFrameStep}
          onSlowMoToggle={handleSlowMoToggle}
          onDeviceWidthToggle={handleDeviceWidthToggle}
        />
      </div>
    </div>
  )
}

// ─── URL query-param pre-selection ────────────────────────────────────────────
// Called by the page.tsx wrapper after mount. Exported for use by the page.

export function getInitialSequenceFromUrl(): PlaygroundSequence {
  if (typeof window === 'undefined') return PLAYGROUND_SEQUENCES[0] as PlaygroundSequence
  const params = new URLSearchParams(window.location.search)
  const seqId = params.get('seq')
  if (!seqId) return PLAYGROUND_SEQUENCES[0] as PlaygroundSequence
  return findSequenceById(seqId) ?? (PLAYGROUND_SEQUENCES[0] as PlaygroundSequence)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const rootStyle: CSSProperties = {
  minHeight: '100vh',
  background: '#0a0704',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  padding: '24px 0 40px',
  alignItems: 'stretch',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  padding: '0 24px',
  borderBottom: '1px solid rgba(212,137,42,0.18)',
  paddingBottom: 12,
  flexWrap: 'wrap',
  gap: 8,
}

const titleStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.22em',
  color: '#d4892a',
  textTransform: 'uppercase',
}

const subtitleStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 11,
  letterSpacing: '0.16em',
  color: 'rgba(232,223,200,0.42)',
  textTransform: 'uppercase',
}

const controlsWrapStyle: CSSProperties = {
  padding: '0 24px',
}

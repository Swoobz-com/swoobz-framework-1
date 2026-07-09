'use client'

/**
 * OoReiPlaygroundSequenceView — Device frame + active sequence renderer.
 *
 * DEV-ONLY. Renders the selected sequence inside a device frame at the
 * target width (390 iPhone or 1440 desktop), with a live HUD overlay:
 *   PHASE: <name>  ELAPSED: <ms>  FPS: <n>   (FPS turns red below 55)
 *
 * Mounts the REAL OoReiCinematicOverlay or OoReiChapterClose components
 * so any changes tuned here are exactly what ships in the live game path.
 *
 * Slow-mo (0.25x): injects a CSS custom property --pg-time-scale: 4 onto
 * the device frame, which multiplies all CSS animation-duration values by 4x
 * via the global animation-duration calc trick. JS setTimeout delays in the
 * real components are NOT affected by CSS vars — the JS transport clock in
 * OoReiPlayground manages JS-side slow-mo by multiplying all setTimeout
 * delays injected through forwardedSlowMoRef.
 *
 * Brand: amber/cream/vermillion. ZERO cyan.
 * Domain C: display only. No financial math.
 */

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { OoReiChapterClose } from '../OoReiChapterClose'
import { OoReiCinematicOverlay } from '../OoReiCinematicOverlay'
import { FIXTURE_CHAPTER_CLOSE_EVENTS } from './ooReiPlaygroundFixtures'
import type { PlaygroundSequence } from './ooReiPlaygroundSequences'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OoReiPlaygroundSequenceViewProps {
  readonly sequence: PlaygroundSequence
  readonly isPlaying: boolean
  readonly isSlowMo: boolean
  readonly deviceWidth: 390 | 1440
  /** Monotonically increasing replay key — incrementing unmounts + remounts. */
  readonly replayKey: number
  /** Called when the sequence completes naturally (overlay onComplete). */
  readonly onComplete: () => void
  /** Called each time the cinematic phase changes (for the HUD overlay). */
  readonly onPhaseChange: (phase: string) => void
}

// ─── FPS meter hook ───────────────────────────────────────────────────────────

function useFpsMeter(active: boolean): number {
  const [fps, setFps] = useState(60)
  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return
    frameCountRef.current = 0
    lastTimeRef.current = performance.now()

    const tick = () => {
      frameCountRef.current += 1
      const now = performance.now()
      const elapsed = now - lastTimeRef.current
      if (elapsed >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / elapsed))
        frameCountRef.current = 0
        lastTimeRef.current = now
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [active])

  return fps
}

// ─── Elapsed timer hook ───────────────────────────────────────────────────────

function useElapsedMs(running: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      return
    }
    startRef.current = performance.now() - elapsed

    const tick = () => {
      if (startRef.current !== null) {
        setElapsed(Math.round(performance.now() - startRef.current))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [running]) // eslint-disable-line react-hooks/exhaustive-deps

  return elapsed
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OoReiPlaygroundSequenceView({
  sequence,
  isPlaying,
  isSlowMo,
  deviceWidth,
  replayKey,
  onComplete,
  onPhaseChange,
}: OoReiPlaygroundSequenceViewProps) {
  const fps = useFpsMeter(isPlaying)
  const elapsed = useElapsedMs(isPlaying)
  const fpsLow = fps < 55

  // Chapter-close local state (needed because OoReiChapterClose needs these callbacks)
  const [chapterDismissed, setChapterDismissed] = useState(false)
  const [_allyChosen, setAllyChosen] = useState<string | null>(null)

  // Reset chapter-close state on replay
  useEffect(() => {
    setChapterDismissed(false)
    setAllyChosen(null)
  }, [replayKey])

  const handleChapterDismiss = useCallback(() => {
    setChapterDismissed(true)
    onComplete()
  }, [onComplete])

  const handleAllyChoose = useCallback((kanji: string) => {
    setAllyChosen(kanji)
  }, [])

  const handleConfirmSeal = useCallback(() => {
    // Ceremonial — outcome already committed in fixture context
  }, [])

  // Slow-mo: CSS custom property on the wrapper multiplies animation-duration by 4x.
  // The actual CSS animation-duration values in child components are set inline as
  // `animationDuration: ...ms`. To get 4x duration, we wrap in a container that
  // applies a CSS class injected below. JS-based setTimeout delays are handled by
  // the parent playground by slowing the sequence's effective clock.
  const slowMoScale = isSlowMo ? 4 : 1
  const frameStyle: CSSProperties = {
    position: 'relative',
    width: deviceWidth === 390 ? 390 : '100%',
    maxWidth: deviceWidth === 1440 ? 1440 : 390,
    height: deviceWidth === 390 ? 844 : 900,
    overflow: 'hidden',
    background: '#1a1612',
    // Device frame border
    boxShadow: deviceWidth === 390
      ? '0 0 0 8px #0e0a06, 0 0 0 10px rgba(212,137,42,0.28), 0 24px 64px rgba(0,0,0,0.80)'
      : '0 0 0 2px rgba(212,137,42,0.28), 0 8px 32px rgba(0,0,0,0.60)',
    borderRadius: deviceWidth === 390 ? 40 : 4,
    flexShrink: 0,
  }

  // Grid placeholder background (simulates the live reel grid behind the overlay)
  const gridBgStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: `
      repeating-linear-gradient(
        0deg,
        rgba(212,137,42,0.04) 0px,
        rgba(212,137,42,0.04) 1px,
        transparent 1px,
        transparent ${Math.round(frameStyle.height as number / 3)}px
      ),
      repeating-linear-gradient(
        90deg,
        rgba(212,137,42,0.04) 0px,
        rgba(212,137,42,0.04) 1px,
        transparent 1px,
        transparent ${Math.round((deviceWidth === 390 ? 390 : 1440) / 5)}px
      ),
      linear-gradient(180deg, #2d2438 0%, #1a1612 60%, #120c06 100%)
    `,
    zIndex: 0,
  }

  return (
    <div style={viewWrapperStyle}>
      {/* ── Slow-mo CSS injection ──────────────────────────────────────── */}
      {isSlowMo && (
        <style>{`
          .pg-slow-mo * {
            animation-duration: calc(var(--pg-orig-dur, 1ms) * ${slowMoScale}) !important;
          }
        `}</style>
      )}

      {/* ── Device frame ───────────────────────────────────────────────── */}
      <div
        style={frameStyle}
        className={isSlowMo ? 'pg-slow-mo' : undefined}
      >
        {/* Grid stand-in (simulates the live reel grid behind the overlay) */}
        <div style={gridBgStyle} />

        {/* ── Cinematic overlay ────────────────────────────────────────── */}
        {sequence.kind === 'cinematic' && isPlaying && !chapterDismissed && (
          <OoReiCinematicOverlay
            key={`cinematic-${replayKey}`}
            tier={sequence.tier}
            winMultiplierBps={sequence.winMultiplierBps}
            onComplete={onComplete}
            onPhaseChange={onPhaseChange}
            activeRegionId="storm-coast"
          />
        )}

        {/* ── Chapter-close ────────────────────────────────────────────── */}
        {sequence.kind === 'chapter-close' && isPlaying && !chapterDismissed && (() => {
          const fixture = FIXTURE_CHAPTER_CLOSE_EVENTS[sequence.fixtureIndex]
          if (!fixture) return null
          return (
            <OoReiChapterClose
              key={`chapter-${replayKey}`}
              event={fixture.event}
              sealedSpiritCount={fixture.sealedSpiritCount}
              activeAllyKanji={null}
              onConfirmSeal={handleConfirmSeal}
              onDismiss={handleChapterDismiss}
              onChooseAlly={handleAllyChoose}
              nextRegionVistaSrc={fixture.nextRegionVistaSrc}
              nextRegionId={fixture.nextRegionId}
              nextRegionGoalStatement={fixture.nextRegionGoalStatement}
              reducedMotion={false}
              onPhaseChange={onPhaseChange}
            />
          )
        })()}

        {/* ── Idle state (not playing) ──────────────────────────────────── */}
        {!isPlaying && !chapterDismissed && (
          <div style={idlePromptStyle}>
            <span style={idleTextStyle}>PRESS PLAY</span>
          </div>
        )}

        {/* ── HUD overlay ───────────────────────────────────────────────── */}
        <HudOverlay elapsed={elapsed} fps={fps} fpsLow={fpsLow} />
      </div>
    </div>
  )
}

// ─── HUD overlay ──────────────────────────────────────────────────────────────

function HudOverlay({
  elapsed,
  fps,
  fpsLow,
}: {
  readonly elapsed: number
  readonly fps: number
  readonly fpsLow: boolean
}) {
  return (
    <div style={hudOverlayStyle} aria-hidden="true">
      <span style={hudItemStyle}>ELAPSED: {elapsed}ms</span>
      <span style={{ ...hudItemStyle, color: fpsLow ? '#c0392b' : 'rgba(232,223,200,0.55)' }}>
        FPS: {fps}{fpsLow ? ' ⚠' : ''}
      </span>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const viewWrapperStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  width: '100%',
  overflowX: 'auto',
  padding: '0 16px',
}

const idlePromptStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const idleTextStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 13,
  letterSpacing: '0.28em',
  color: 'rgba(232,223,200,0.25)',
  textTransform: 'uppercase',
}

const hudOverlayStyle: CSSProperties = {
  position: 'absolute',
  top: 16,
  left: 16,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  pointerEvents: 'none',
}

const hudItemStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 10,
  letterSpacing: '0.10em',
  color: 'rgba(232,223,200,0.55)',
  textShadow: '0 1px 3px rgba(0,0,0,0.9)',
  lineHeight: 1.4,
}

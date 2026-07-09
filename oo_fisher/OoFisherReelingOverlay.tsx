'use client'

/**
 * OoFisherReelingOverlay — the in-canvas reeling minigame overlay.
 *
 * Drawn ABOVE the water canvas during the `reeling` sub-phase. Shows a
 * horizontal tension bar with a target zone (the rod-tier-widened window)
 * and a moving tension marker. The player taps anywhere in the overlay to
 * nudge tension into the zone.
 *
 * RG-C5 STRUCTURAL: the visual signature (bar height, marker color, zone
 * highlight) is identical across rarity tiers and rod tiers. Only the
 * target-zone WIDTH changes (a gameplay parameter, not a fanfare signal).
 *
 * Brand register: quiet expert. The reeling bar is a precision instrument
 * — the visible state is the truth, the rhythm is the verb.
 */
import type { CSSProperties, ReactElement } from 'react'

import { effectiveTargetZone, type ReelingParams } from './ooFisherMath'

export interface OoFisherReelingOverlayProps {
  /** Live tension value (0-100). */
  readonly tension: number
  /** Reeling parameters (target zone, duration). */
  readonly params: ReelingParams
  /** Elapsed ms inside the current reel — drives the progress bar. */
  readonly elapsedMs: number
  /** Tap handler — fires when player taps anywhere on the overlay. */
  readonly onTap: () => void
}

// Tim 2026-05-26 image 131 — TAP TENSION migrated from cool dark-glass +
// cyan to the wood-plaque grammar that the rest of the in-canvas HUD uses
// (lobby card, casting plaque, FISH ON badge, upgrade modal). The
// green-zone target tint + red danger-zone tint are preserved — they
// carry essential gameplay meaning (chase the green, avoid the red).
// Only the surrounding chrome (panel, eyebrow, copy, marker) migrates.
const TOKENS = {
  fontMono: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
  fontBody: 'var(--font-family-body, "Geist", system-ui, sans-serif)',
  // brass-cream replaces cyan for chrome accents on wood ground
  accent: '#ffd27a',
  accentText: '#ffd27a',
  accentDim: 'rgba(212, 160, 74, 0.42)',
  accentMuted: 'rgba(184, 137, 92, 0.42)',
  ringDim: 'rgba(212, 160, 74, 0.28)',
  // warm cedar wood plaque
  surface:
    'linear-gradient(180deg, rgba(140,92,52,0.94), rgba(108,70,40,0.94), rgba(86,54,30,0.94)), ' +
    'repeating-linear-gradient(90deg, rgba(74,42,18,0.18) 0 1px, transparent 1px 7px)',
  text: 'rgba(255, 232, 188, 0.94)',
  textDim: 'rgba(255, 232, 188, 0.62)',
  // Game-critical signals — gameplay color, not chrome
  zone: 'rgba(80, 200, 120, 0.32)',
  zoneEdge: 'rgba(80, 200, 120, 0.66)',
  danger: '#f87171',
  dangerDim: 'rgba(248, 113, 113, 0.32)',
}

// Tim 2026-05-26 image 142 — PERFECT inner band. A narrow ±5 tension band
// at the zone center signals "you can do better than just landing this fish
// — nail the middle for the boost". Module-const half-width, RG-C5 SAFE:
// the band geometry is fixed and not modulated by streak/session value.
// The actual rarity bonus is provider-side (perfectHitAtFinish flag); this
// overlay is the visible truth so the player knows the upside exists.
const PERFECT_BAND_HALF_WIDTH = 5

export function OoFisherReelingOverlay(props: OoFisherReelingOverlayProps): ReactElement {
  const { tension, params, elapsedMs, onTap } = props
  const zone = effectiveTargetZone(elapsedMs, params)
  const zoneStart = zone.center - zone.halfWidth
  const zoneEnd = zone.center + zone.halfWidth
  const perfectStart = zone.center - PERFECT_BAND_HALF_WIDTH
  const perfectEnd = zone.center + PERFECT_BAND_HALF_WIDTH
  const markerPct = Math.min(100, Math.max(0, tension))
  const inside = tension >= zoneStart && tension <= zoneEnd
  const inPerfect = tension >= perfectStart && tension <= perfectEnd
  const progress = Math.min(1, Math.max(0, elapsedMs / params.durationMs))

  return (
    <div
      style={styles.overlay}
      // Fire on pointer-DOWN, not click — the rhythm reel needs the tap to
      // register at contact, not after the ~300ms click budget (mobile fix).
      onPointerDown={(e) => {
        e.preventDefault()
        onTap()
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          onTap()
        }
      }}
      aria-label="Reeling minigame. Tap to maintain tension"
    >
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.eyebrow}>TAP TENSION</span>
          <span style={styles.sub}>
            tap rhythmically to keep the marker inside the green zone
          </span>
          <span style={styles.subHint}>
            too slow = fish escapes · too fast = line snaps · dead-center = rarity boost
          </span>
        </div>

        {/* Horizontal tension bar — RG-C5: zone color states are calm
            (cyan SAFE / coral DANGER), no scale-on-rarity fanfare. */}
        <div
          style={{
            ...styles.barShell,
            // Calm color framing: cyan border when SAFE, coral when DANGER.
            // Same border weight/radius regardless — only the hue shifts.
            borderColor: inside ? TOKENS.accentDim : TOKENS.dangerDim,
          }}
        >
          {/* Background track */}
          <div style={styles.barTrack} />
          {/* Target zone highlight — green SAFE zone, always centered */}
          <div
            style={{
              ...styles.barZone,
              left: `${zoneStart}%`,
              width: `${zoneEnd - zoneStart}%`,
            }}
          />
          {/* PERFECT inner band — narrow brass-tinted strip at zone center.
              Visible signal that a deeper boost exists for the player who
              can hold the marker dead-center. */}
          <div
            style={{
              ...styles.barPerfect,
              left: `${perfectStart}%`,
              width: `${perfectEnd - perfectStart}%`,
            }}
          />
          {/* Tension marker — brass when PERFECT, green when HOLDING (in zone but off-center),
              coral when LOSING (out of zone). Three semantic states. */}
          <div
            style={{
              ...styles.barMarker,
              left: `${markerPct}%`,
              background: inPerfect ? '#ffd27a' : inside ? '#7cd49a' : TOKENS.danger,
              boxShadow: inPerfect
                ? '0 0 18px rgba(255,210,122,0.65)'
                : inside
                  ? '0 0 16px rgba(124,212,154,0.55)'
                  : `0 0 16px ${TOKENS.dangerDim}`,
            }}
          />
        </div>

        {/* Status row — three-state verb: PERFECT (brass) / HOLDING (green) / LOSING (coral) */}
        <div style={styles.statusRow}>
          <span
            style={
              inPerfect
                ? styles.statusPerfect
                : inside
                  ? styles.statusInZone
                  : styles.statusOutOfZone
            }
          >
            {inPerfect ? 'PERFECT' : inside ? 'HOLDING' : 'LOSING'}
          </span>
          <span style={styles.statusTension}>
            {Math.round(markerPct).toString().padStart(2, '0')}
          </span>
        </div>

        {/* Time progress bar */}
        <div style={styles.timeShell}>
          <div
            style={{
              ...styles.timeFill,
              width: `${progress * 100}%`,
            }}
          />
        </div>
        <div style={styles.timeRow}>
          <span style={styles.timeLabel}>TIME</span>
          <span style={styles.timeValue}>
            {Math.max(0, Math.ceil((params.durationMs - elapsedMs) / 100) / 10).toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse 60% 50% at 50% 60%, rgba(3,7,13,0.65), rgba(3,7,13,0.92))',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    padding: 24,
  },
  panel: {
    position: 'relative',
    width: 'min(560px, 90%)',
    padding: '22px 28px 18px',
    background: TOKENS.surface,
    backgroundBlendMode: 'multiply, normal',
    border: '2px solid #d4a04a',
    borderRadius: 14,
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    boxShadow:
      '0 28px 70px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 222, 158, 0.45), inset 0 -2px 4px rgba(0, 0, 0, 0.4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    alignItems: 'center',
    textAlign: 'center',
  },
  eyebrow: {
    fontFamily: TOKENS.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.32em',
    textTransform: 'uppercase',
    color: TOKENS.accent,
  },
  sub: {
    fontFamily: TOKENS.fontBody,
    fontSize: 12,
    color: TOKENS.text,
    fontWeight: 600,
  },
  subHint: {
    fontFamily: TOKENS.fontBody,
    fontSize: 11,
    color: TOKENS.textDim,
    fontStyle: 'italic',
  },
  barShell: {
    position: 'relative',
    height: 28,
    width: '100%',
    // dark engraved trough inset into the wood plaque
    background: 'rgba(48, 28, 14, 0.62)',
    border: `1px solid ${TOKENS.accentDim}`,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.55), inset 0 -1px 0 rgba(255,222,158,0.18)',
  },
  barTrack: {
    position: 'absolute',
    inset: 0,
    background:
      'linear-gradient(90deg, rgba(248,113,113,0.14), rgba(48,28,14,0.30) 30%, rgba(48,28,14,0.30) 70%, rgba(248,113,113,0.14))',
  },
  barZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    // green-zone target — gameplay-critical color preserved
    background: `linear-gradient(180deg, ${TOKENS.zone}, rgba(80,200,120,0.16))`,
    borderLeft: `1px solid ${TOKENS.zoneEdge}`,
    borderRight: `1px solid ${TOKENS.zoneEdge}`,
    transition: 'left 80ms linear',
  },
  // Inner perfect band — narrow brass strip at the zone center signalling
  // the bonus opportunity. Module-const width (PERFECT_BAND_HALF_WIDTH × 2).
  barPerfect: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    background:
      'linear-gradient(180deg, rgba(255, 210, 122, 0.55), rgba(212, 160, 74, 0.30))',
    borderLeft: '1px solid rgba(255, 210, 122, 0.85)',
    borderRight: '1px solid rgba(255, 210, 122, 0.85)',
    transition: 'left 80ms linear',
    boxShadow: 'inset 0 0 8px rgba(255, 210, 122, 0.45)',
  },
  barMarker: {
    position: 'absolute',
    top: '50%',
    width: 4,
    height: '70%',
    borderRadius: 2,
    transform: 'translate(-50%, -50%)',
    // `left` glides too (was missing) so the marker the player tracks reads as a
    // smooth chase instead of stepping at the 20Hz drift tick. animotty fix.
    transition: 'left 60ms linear, background 80ms ease-out, box-shadow 80ms ease-out',
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusInZone: {
    fontFamily: TOKENS.fontMono,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    // in-zone status uses the gameplay green to match the target band
    color: '#7cd49a',
  },
  statusPerfect: {
    fontFamily: TOKENS.fontMono,
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    // brass-cream PERFECT status — the upside signal
    color: '#ffd27a',
    textShadow: '0 0 12px rgba(255, 210, 122, 0.55)',
  },
  statusOutOfZone: {
    fontFamily: TOKENS.fontMono,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: TOKENS.danger,
  },
  statusTension: {
    fontFamily: TOKENS.fontMono,
    fontSize: 16,
    fontWeight: 800,
    color: TOKENS.text,
    fontVariantNumeric: 'tabular-nums',
  },
  timeShell: {
    position: 'relative',
    height: 4,
    background: 'rgba(48,28,14,0.62)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  timeFill: {
    position: 'absolute',
    inset: 0,
    // brass time-fill engraved into wood trough
    background: TOKENS.accent,
    transformOrigin: 'left center',
    transition: 'width 50ms linear',
  },
  timeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeLabel: {
    fontFamily: TOKENS.fontMono,
    fontSize: 9,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.40)',
  },
  timeValue: {
    fontFamily: TOKENS.fontMono,
    fontSize: 11,
    color: TOKENS.textDim,
    fontVariantNumeric: 'tabular-nums',
  },
}

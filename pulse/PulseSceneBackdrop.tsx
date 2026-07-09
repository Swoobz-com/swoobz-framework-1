'use client'

/**
 * PulseSceneBackdrop — 2087 Holo-Cardiac Monitor (VCM-2087) chassis.
 *
 * FUSION-CAMPAIGN-2026-06-02 (Pulse). Tim 2026-06-02 ruling:
 * The backdrop was rebuilt 2026-05-27 as a "Cyber-Quantum Coherence Lab"
 * but the curve canvas retained its Bloomberg/cardiac register — two
 * registers on one screen. The fusion resolves it: this chassis is now
 * the instrument housing of a **2087 holo-cardiac-finance rig** — a
 * near-future vitals-monitoring station where the rising multiplier IS
 * a live cardiac trace you ride and bail from. The cyber-lab spatial
 * framing (obsidian, titanium, starfield observation glass) is kept;
 * the CARDIAC SOUL from PulseCurveCanvas is lifted up to match it.
 * Theme sentence (locked): "Standing at the vitals rail of a 2087
 * holo-cardiac chamber — obsidian walls, brushed-titanium chassis,
 * cyan plasma trace alive on the field — watching a live cardiac
 * waveform climb a holographic instrument grid until the single
 * decisive bail-out or the flatline."
 *
 * The backdrop is a static DOM+SVG chassis painted over the curve
 * canvas (`position: absolute, inset: 0, pointerEvents: none`). It
 * does NOT touch the curve drawing — PulseCurveCanvas still renders
 * the plasma wave, grid, hero multiplier, head dot and stamps. The
 * chassis only adds the surrounding lab:
 *
 *   1. **Obsidian chamber walls** — deep LAB_BLACK base with a
 *      brushed-titanium frame (1px TITANIUM_MID outer rim + inset
 *      titanium specular highlight). Reads as a milled aluminum
 *      detector housing, not painted pixels.
 *
 *   2. **Distant star field + observation-glass tint** — barely-
 *      visible STAR_FIELD pinpricks and a cool PLANET_RIM wash at
 *      the bottom edge, suggesting the lab observes through dark
 *      glass into deep space (the Roci's tactical display register).
 *
 *   3. **Holographic milestone pips** — 1.5× / 2.0× / 3.0× / 5.0× /
 *      10.0× rendered as cyan HOLOGRAM_INK floating pips on dark
 *      glass (NOT brass etchings on stone). Each pip has a tick
 *      mark, a label, and a faint inner glow. They sit at the
 *      same Y-positions the curve hits — anchoring the SCENE to
 *      pulseMath.PERFECT_MILESTONES_BPS.
 *
 *   4. **Holographic plot-grid overlay** — a faint tron-grid
 *      (HOLO_GRID) of vertical + horizontal hairlines providing
 *      coordinate readability without competing with the plasma
 *      wave. Static, never animated.
 *
 *   5. **VCM sweep arm (round-start ritual)** — a single horizontal
 *      hairline that sweeps top-to-bottom ONCE when a round opens (the
 *      instrument "arming" to record the incoming cardiac trace), then
 *      idles. NOT a perpetual ambient — it is invisible during idle, so
 *      the sole idle ambient is the resting cardiac beat on the curve.
 *      Transform:translateY (compositor-only). Suppressed under
 *      prefers-reduced-motion.
 *
 *   6. **Titanium control console rail** — bottom-edge brushed-
 *      titanium strip with a maker's mark `SWOOBZ · VCM-2087`,
 *      anchoring the chassis as a fielded vitals-cardiac instrument.
 *
 * **Named lights** (no JS — encoded as CSS gradient stops):
 *   - LIGHT_A: cool-white overhead vitals-station lamp (4500K,
 *     intensity 1.4). Top diffuse falloff at root.
 *   - LIGHT_B: cyan plasma self-illumination on the curve — emitted
 *     by the canvas wave itself; the backdrop reserves the central
 *     band free of competing fill so the wave glow reads.
 *   - LIGHT_C: deep-blue ambient floor wash through the observation
 *     glass — bottom radial gradient using PLANET_RIM.
 *
 * **Cultural references** (Tim 2026-05-27 brief):
 *   - CERN LHC tracker readout panel — calm, dense, no decoration
 *   - The Expanse Roci flight-bridge tactical display — dark glass
 *     + cyan ink + minimal chrome
 *   - Apple Vision Pro mixed-reality lab UI — holographic pips
 *     floating in obsidian space, not painted on plates
 *
 * **RG-C5 SAFE**: every component above is structural and identical
 * round-to-round. No per-state amplitude, no streak-driven escalation.
 * Scanner cadence, milestone positions, light intensities are all
 * module-const.
 *
 * Domain C: presentation only. No state mutations, no math, no I/O.
 */

import type { CSSProperties, ReactElement } from 'react'

// ─── Palette (cool-only — verbatim from SCENE-REBUILD brief) ─────────────

const LAB_BLACK = '#07080C' // DS ink
const TITANIUM_DARK = '#1a1f26'
const TITANIUM_MID = '#3a4250'
const TITANIUM_LIGHT = '#6a7384'
const HOLO_GRID = 'rgba(41, 230, 255, 0.10)'
const HOLOGRAM_INK_DIM = 'rgba(41, 230, 255, 0.45)'
const STAR_FIELD = 'rgba(255, 255, 255, 0.05)'
const PLANET_RIM = 'rgba(40, 80, 120, 0.18)'

// ─── Module-const geometry (RG-C5 anchors) ───────────────────────────────

// Milestone pip rendering moved to `pulseCurveCanvas.milestonePips.ts`
// (PULSE-FX-RESTORE-ALIGN-2026-05-27 #2). The canvas frame loop calls
// `projectY(MILESTONE_BPS[i], H, ceilMul, bottomReserve)` with the LIVE
// chart geometry, guaranteeing the pip Y and the curve head Y agree —
// which a static `top: NN%` fraction in this SVG backdrop could not.

// Holographic plot-grid — module-const tron-grid coordinates. Same on
// every round. Vertical lines at 12.5% intervals; horizontal at 20%.
const GRID_VERTICALS: ReadonlyArray<number> = [12.5, 25, 37.5, 50, 62.5, 75, 87.5]
const GRID_HORIZONTALS: ReadonlyArray<number> = [20, 40, 60, 80]

// Star-field pinpricks — module-const positions so the field is
// identical round-to-round (RG-C5). Hand-tuned for a distant-space
// register that does not compete with the plasma wave.
const STAR_FIELD_DOTS: ReadonlyArray<{ x: number; y: number; r: number }> = [
  { x: 8, y: 12, r: 0.6 },
  { x: 21, y: 6, r: 0.4 },
  { x: 34, y: 18, r: 0.5 },
  { x: 47, y: 4, r: 0.3 },
  { x: 61, y: 14, r: 0.7 },
  { x: 73, y: 9, r: 0.4 },
  { x: 86, y: 16, r: 0.5 },
  { x: 92, y: 22, r: 0.3 },
  { x: 16, y: 28, r: 0.4 },
  { x: 55, y: 30, r: 0.3 },
  { x: 79, y: 32, r: 0.5 },
  { x: 5, y: 38, r: 0.3 },
]

// ─── Public surface ─────────────────────────────────────────────────────

export interface PulseSceneBackdropProps {
  readonly reducedMotion: boolean
  /**
   * The slot the round became active, or null outside an active round.
   * Drives the once-per-round VCM sweep arm: a fresh slot value re-keys the
   * sweep element so it replays its single pass at each round-start. Null
   * (idle) renders NO sweep — so the sole idle ambient is the resting
   * cardiac beat on the curve canvas (fusion bible: one ambient at a time).
   */
  readonly roundActiveSlot?: bigint | null
}

export function PulseSceneBackdrop({
  reducedMotion,
  roundActiveSlot = null,
}: PulseSceneBackdropProps): ReactElement {
  return (
    <div
      style={styles.root}
      aria-hidden="true"
      data-testid="pulse-scene-backdrop"
      data-scene="holo-cardiac-monitor-2087"
    >
      {/* LIGHT_A — cool-white overhead lab lamp, 4500K diffuse falloff
          from the top edge. Encoded as a radial gradient so the lab
          reads as illuminated from above without painting a hard cone. */}
      <div style={styles.lightAOverhead} data-testid="pulse-light-a-overhead" />

      {/* Distant star field — module-const pinpricks rendered as an
          SVG layer so the dots stay subpixel-sharp at any DPR. */}
      <svg
        style={styles.starField}
        viewBox="0 0 100 50"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-testid="pulse-star-field"
      >
        {STAR_FIELD_DOTS.map((dot) => (
          <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r={dot.r} fill={STAR_FIELD} />
        ))}
      </svg>

      {/* Holographic plot-grid — faint tron-grid coordinate overlay.
          Vertical + horizontal hairlines on a percentage basis. Reads
          as the CERN tracker readout grid: dense, calm, navigational. */}
      <svg
        style={styles.holoGrid}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-testid="pulse-holo-grid"
      >
        {GRID_VERTICALS.map((x) => (
          <line
            key={`v-${x}`}
            x1={x}
            x2={x}
            y1={0}
            y2={100}
            stroke={HOLO_GRID}
            strokeWidth={0.08}
          />
        ))}
        {GRID_HORIZONTALS.map((y) => (
          <line
            key={`h-${y}`}
            x1={0}
            x2={100}
            y1={y}
            y2={y}
            stroke={HOLO_GRID}
            strokeWidth={0.08}
          />
        ))}
      </svg>

      {/* Titanium chassis frame — 1px brushed-titanium outer rim with
          inset specular highlight. Reads as a milled detector housing,
          not a painted plate. The 4 corner anchors are square shims,
          not the antique brass rivets the previous chassis used. */}
      <div style={styles.chassisFrame} />
      <div style={{ ...styles.cornerAnchor, top: 8, left: 8 }} />
      <div style={{ ...styles.cornerAnchor, top: 8, right: 8 }} />
      <div style={{ ...styles.cornerAnchor, bottom: 8, left: 8 }} />
      <div style={{ ...styles.cornerAnchor, bottom: 8, right: 8 }} />

      {/* Milestone pips moved INTO the curve canvas (PULSE-FX-RESTORE-
          ALIGN-2026-05-27). The pip's Y coordinate must come from the
          SAME `projectY` call the curve head uses — both H and ceilMul
          are runtime-dynamic (viewport + auto-scale), so a static
          `top: NN%` fraction in this SVG layer drifted from the live
          curve. The pips now live in `pulseCurveCanvas.milestonePips.ts`
          and are drawn inside `PulseCurveCanvas`'s frame loop AFTER the
          graticule and BEFORE the curve trace. */}

      {/* VCM sweep arm — fires ONCE per round-start (keyed by
          roundActiveSlot so each new round replays the single pass). A
          full-height track carries a 1px cyan hairline from the top of the
          chassis to the bottom as the instrument "arms" to record the
          incoming cardiac trace. Transform-only (translateY on the
          full-height track) = GPU compositor, zero layout triggers.
          Rendered ONLY during an active round; idle shows no sweep, so the
          sole idle ambient is the resting cardiac beat on the curve canvas
          (fusion bible ambientDecision). Suppressed under reduced-motion. */}
      {!reducedMotion && roundActiveSlot != null && (
        <div
          key={String(roundActiveSlot)}
          style={styles.scannerTrack}
          data-testid="pulse-vcm-sweep"
        >
          <div style={styles.scannerHairline} />
        </div>
      )}

      {/* LIGHT_C — deep-blue ambient floor wash through the
          observation glass. Sits at the bottom edge as a radial
          gradient with PLANET_RIM tone. */}
      <div style={styles.lightCFloor} data-testid="pulse-light-c-floor" />

      {/* Titanium control-console rail — bottom-edge brushed strip
          with the maker's mark. Anchors the chassis as a fielded
          instrument, replaces the antique "QO-1 · 1894" stamp. */}
      <div style={styles.consoleRail} data-testid="pulse-console-rail">
        <span style={styles.makerMark}>SWOOBZ · VCM-2087</span>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
    borderRadius: 12,
    // NO background fill — the curve canvas already paints its own
    // opaque dark backdrop. A gradient here would occlude the rising
    // curve (Tim 2026-05-27 image 160). Chassis chrome (frame border,
    // corner anchors, right-rail milestones) sits OVER the canvas via
    // the layered children below — they have no fill, just outlines.
  },
  // LIGHT_A — cool-white overhead lab lamp (4500K, intensity 1.4).
  // Encoded as a radial gradient from the top edge.
  lightAOverhead: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
    background:
      'radial-gradient(ellipse 70% 100% at 50% 0%, rgba(180, 220, 240, 0.07) 0%, rgba(140, 180, 220, 0.025) 60%, transparent 100%)',
  },
  starField: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    width: '100%',
    pointerEvents: 'none',
  },
  holoGrid: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  chassisFrame: {
    position: 'absolute',
    inset: 0,
    border: `1px solid ${TITANIUM_MID}`,
    borderRadius: 12,
    // Inset titanium specular — picks up LIGHT_A.
    boxShadow: `inset 0 1px 0 ${TITANIUM_LIGHT}33, inset 0 0 0 1px ${TITANIUM_DARK}`,
  },
  cornerAnchor: {
    position: 'absolute',
    width: 8,
    height: 8,
    background: TITANIUM_DARK,
    border: `1px solid ${TITANIUM_MID}`,
    // Subtle inner highlight reads as machined hardware.
    boxShadow: `inset 0 1px 0 ${TITANIUM_LIGHT}44`,
  },
  // VCM sweep arm — a FULL-HEIGHT track (top:0/bottom:0) that translateY-
  // sweeps once per round. Full height matters: `translateY(%)` is relative
  // to the element's OWN box, so a 100% translate on a full-height track
  // moves the top-anchored hairline exactly one chassis-height down (a 1px
  // line would only move 1px). Transform + opacity only — GPU compositor,
  // zero layout triggers. Base state is invisible (opacity 0); the keyframe
  // drives the single pass. fill-mode:none reverts to this invisible base
  // after the one iteration.
  scannerTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 14,
    right: 14,
    transform: 'translateY(0%)',
    opacity: 0,
    animation: 'pulse-vcm-sweep 6s linear 1',
    pointerEvents: 'none',
  },
  // The 1px cyan recording hairline, anchored at the top of the track.
  scannerHairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    background: `linear-gradient(90deg, transparent 0%, ${HOLOGRAM_INK_DIM} 50%, transparent 100%)`,
  },
  // LIGHT_C — deep-blue ambient floor wash through observation glass.
  lightCFloor: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '28%',
    background: `radial-gradient(ellipse 80% 100% at 50% 100%, ${PLANET_RIM} 0%, rgba(40, 80, 120, 0.06) 50%, transparent 100%)`,
  },
  consoleRail: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
    background: `linear-gradient(180deg, transparent 0%, ${TITANIUM_DARK} 60%, ${LAB_BLACK} 100%)`,
    borderTop: `1px solid ${TITANIUM_MID}`,
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 24,
  },
  makerMark: {
    fontFamily: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
    fontSize: 8,
    letterSpacing: '0.32em',
    color: HOLOGRAM_INK_DIM,
    textTransform: 'uppercase',
  },
}

// ─── Keyframes (consumed by PulseExperience's <style> block) ─────────────

// VCM sweep arm — fires ONCE per round-start (animation iteration count 1 on
// styles.scannerTrack). Uses transform:translateY instead of the old `top`
// animation — compositor-only, zero layout triggers (perf hard-rail). The
// full-height track translates one chassis-height down; opacity fades in over
// the first 10%, holds through 90%, fades out for the final 10%. Module-const
// cadence — no per-round / per-streak amplitude (RG-C5).
export const PULSE_SCENE_KEYFRAMES = `
@keyframes pulse-vcm-sweep {
  0%   { transform: translateY(0%);   opacity: 0; }
  10%  { transform: translateY(10%);  opacity: 0.85; }
  90%  { transform: translateY(90%);  opacity: 0.85; }
  100% { transform: translateY(100%); opacity: 0; }
}
`

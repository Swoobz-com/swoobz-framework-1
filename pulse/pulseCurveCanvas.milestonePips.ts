/**
 * drawMilestonePips — renders the 5 cyan milestone pips IN the curve canvas
 * (not in the SVG backdrop) so the pip Y and the curve head Y share the
 * EXACT SAME `projectY` call.
 *
 * Why this lives inside the canvas (PULSE-FX-RESTORE-ALIGN-2026-05-27):
 *   The previous attempt put pips in the SVG backdrop with `top: NN%` derived
 *   from a STATIC reference (H=400, ceil=10, bottomReserve=56). The live
 *   curve canvas uses a DYNAMIC H (viewport-driven via getBoundingClientRect
 *   + ResizeObserver) and a DYNAMIC ceiling (auto-scales as the multiplier
 *   climbs past the previous ceil). The static fractions diverged from the
 *   live projection, so the cyan pip sat at the wrong Y while the audio
 *   tick fired at the right bps. Pulling the pips into the canvas + calling
 *   `projectY(MILESTONE_BPS[i], H, ceil, bottomReserve)` guarantees the
 *   visual line, the curve head, and the audio trigger COINCIDE.
 *
 * RG-C5 STRUCTURAL:
 *   - Signature accepts CHART parameters only — no streak, no wager, no
 *     session state. Identical pip cadence every round.
 *   - `currentBps` is optional and ONLY used to brighten the NEXT-tier pip
 *     when the curve is within 200bps of crossing (no per-streak escalation,
 *     no per-tier escalation).
 *   - `reducedMotion` flag suppresses the next-tier highlight (it's a
 *     subtle motion cue); the static dim cyan pip still renders.
 *
 * Domain C: presentation/projection only. No financial math, no I/O.
 */

import { MILESTONE_BPS, MILESTONE_LABELS, projectY } from './pulseProjection'

// ─── Style constants (RG-C5 module-const) ────────────────────────────────

/** Hairline opacity for the pip line — barely visible until next-tier. */
const HAIRLINE_RGBA = 'rgba(0, 240, 255, 0.20)'

/** Hairline dash pattern — long dash + short gap, reads as a guide. */
const HAIRLINE_DASH: ReadonlyArray<number> = [4, 6] as const

/** Pip dot at the right edge — solid cyan, slightly brighter than the line. */
const PIP_RGBA = 'rgba(0, 240, 255, 0.55)'

/** Pip dot when the NEXT-tier highlight is active — fully saturated. */
const PIP_HIGHLIGHT_RGBA = 'rgba(0, 240, 255, 0.95)'

/** Label color — same hue as the pip, slightly dimmer for hierarchy. */
const LABEL_RGBA = 'rgba(41, 230, 255, 0.65)' // DS cyan

/** Label color when the next-tier highlight is active. */
const LABEL_HIGHLIGHT_RGBA = 'rgba(0, 240, 255, 0.95)'

/** Diameter (px) of the static pip dot. */
const PIP_DIAMETER_PX = 3 as const

/** Diameter (px) of the highlighted pip dot (next-tier within 200bps). */
const PIP_HIGHLIGHT_DIAMETER_PX = 4 as const

/** bps-distance below the milestone threshold within which we highlight. */
const HIGHLIGHT_PROXIMITY_BPS = 200n as const

/** Padding (px) from the right edge of the canvas to the pip dot. */
const RIGHT_PADDING_PX = 14 as const

/** Padding (px) from the pip dot to the label text. */
const LABEL_OFFSET_PX = 8 as const

/** Font for the label — same Geist Mono register as the chassis maker mark. */
const LABEL_FONT = '9px "Geist Mono", ui-monospace, SFMono-Regular'

// ─── Public surface ──────────────────────────────────────────────────────

/**
 * Draws milestone pips at projectY(MILESTONE_BPS[i]) for each i.
 *
 * Call from the curve canvas frame loop AFTER gridlines/graticule but
 * BEFORE the curve trace — so the curve line occludes the pip dot at
 * the exact frame it crosses the threshold.
 *
 * @param ctx              - canvas 2D context
 * @param W                - canvas width in px (from getBoundingClientRect)
 * @param H                - canvas height in px (from getBoundingClientRect)
 * @param ceilMul          - dynamic Y-axis ceiling multiplier
 * @param bottomReservePx  - bottom-edge reserve in px (same as graticule)
 * @param currentBps       - optional: current curve bps for next-tier highlight
 * @param reducedMotion    - optional: suppress next-tier highlight pulse
 */
export function drawMilestonePips(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  ceilMul: number,
  bottomReservePx: number,
  currentBps?: bigint,
  reducedMotion: boolean = false,
): void {
  if (MILESTONE_BPS.length !== MILESTONE_LABELS.length) {
    // Defensive: paired tables must stay 1:1. Bail rather than draw bad.
    return
  }

  for (let i = 0; i < MILESTONE_BPS.length; i++) {
    const bps = MILESTONE_BPS[i]!
    const label = MILESTONE_LABELS[i]!
    const y = projectY(bps, H, ceilMul, bottomReservePx)

    // Skip pips above the visible top-pad or below the bottom reserve —
    // off-canvas pips are noise (the milestone is currently out of view).
    if (y < 16 || y > H - bottomReservePx - 4) continue

    // Next-tier highlight: when the curve is within HIGHLIGHT_PROXIMITY_BPS
    // BELOW this milestone, brighten the pip. RG-C5: NO streak / wager
    // influence — proximity is purely a curve-state cue. Suppressed under
    // reducedMotion (the brightening is a motion-equivalent attention cue).
    const proximityActive =
      !reducedMotion &&
      currentBps !== undefined &&
      currentBps < bps &&
      bps - currentBps <= HIGHLIGHT_PROXIMITY_BPS

    // ── Hairline (left → right, dashed) ──────────────────────────────────
    ctx.save()
    ctx.strokeStyle = HAIRLINE_RGBA
    ctx.lineWidth = 1
    ctx.setLineDash([...HAIRLINE_DASH])
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W - RIGHT_PADDING_PX - PIP_HIGHLIGHT_DIAMETER_PX, y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    // ── Pip dot at the right edge ────────────────────────────────────────
    const dotDiameter = proximityActive ? PIP_HIGHLIGHT_DIAMETER_PX : PIP_DIAMETER_PX
    const dotX = W - RIGHT_PADDING_PX
    ctx.save()
    ctx.fillStyle = proximityActive ? PIP_HIGHLIGHT_RGBA : PIP_RGBA
    ctx.beginPath()
    ctx.arc(dotX, y, dotDiameter / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // ── Label — sits to the LEFT of the pip dot so it stays on-canvas ───
    ctx.save()
    ctx.fillStyle = proximityActive ? LABEL_HIGHLIGHT_RGBA : LABEL_RGBA
    ctx.font = LABEL_FONT
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.fillText(label, dotX - LABEL_OFFSET_PX, y - 0.5)
    ctx.restore()
  }
}

/**
 * Pulse projection — single source of truth for the bps → canvas Y mapping.
 *
 * Why this module exists (PULSE-FX-RESTORE-ALIGN-2026-05-27):
 *   The curve canvas and the scene backdrop both need to know "at what Y
 *   does the multiplier `M` sit on the canvas?". When the two answers
 *   diverged, the cyan milestone PIPs on the backdrop's right rail no
 *   longer aligned with the moment the curve's HEAD crossed the bps
 *   threshold and the audio tier-tick fired.
 *
 *   First fix attempt (2026-05-27 #1) derived MILESTONE_Y_FRACTIONS from
 *   `projectY` at a STATIC reference (H=400, ceil=10, bottomReserve=56)
 *   and rendered the pips in the SVG backdrop via `top: NN%`. But the
 *   live canvas runs DYNAMIC H (viewport-driven via ResizeObserver) and
 *   a DYNAMIC ceiling (auto-scales as the multiplier climbs past the
 *   previous ceil). The static fractions diverged from the live
 *   projection: pip at wrong Y, audio at right bps.
 *
 *   Second fix (this revision, 2026-05-27 #2): pip rendering moved INTO
 *   the curve canvas (`pulseCurveCanvas.milestonePips.ts`) so the pip Y
 *   is computed from `projectY(MILESTONE_BPS[i], H, ceil, bottomReserve)`
 *   using the SAME H + ceil + bottomReserve the curve head consumes. The
 *   visual line, the curve head, and the audio trigger now coincide
 *   exactly — by construction.
 *
 * RG-C5 STRUCTURAL:
 *   - Milestones are a module-level const tuple.
 *   - The mapping function is pure: no state, no I/O, identical output
 *     for identical input.
 *
 * Domain C: presentation/projection math. No financial calculations,
 * no balance mutations, no streak inputs.
 */

import { ONE_X_BPS } from './pulseMath'

// ─── Milestone schedule (RG-C5 anchor) ────────────────────────────────────

/**
 * The 6 milestone multipliers the player visually + audibly tracks.
 *
 * PULSE-AUDIO-ALIGN-2026-05-27: simplified to SCORE-BASED triggers — the
 * audio tier-tick + haptic + pip-highlight fire when the DISPLAYED hero
 * multiplier first crosses each of these labels per round. The bps
 * thresholds are chosen so that `formatMultiplier(MILESTONE_BPS[i])`
 * produces a string whose first numeric token IS the milestone (e.g.
 * `formatMultiplier(12_500n) === "1.25x"`, `formatMultiplier(15_000n) ===
 * "1.50x"`). The `pulseProjection.test.ts` "format alignment" suite locks
 * this in so future drift is caught.
 *
 * Mirrors the perfect-milestone schedule used by `pulseMath.ts` for
 * cash-out bonus payouts, plus 1.25× as the early-game read.
 */
export const MILESTONE_BPS: ReadonlyArray<bigint> = [
  12_500n, // 1.25×
  15_000n, // 1.50×
  20_000n, // 2.00×
  30_000n, // 3.00×
  50_000n, // 5.00×
  100_000n, // 10.00×
] as const

/**
 * Human-readable labels paired 1:1 with `MILESTONE_BPS`. Used by the
 * canvas right-rail pip rendering AND asserted in tests so any future
 * drift in the labels is caught at the test boundary.
 */
export const MILESTONE_LABELS: ReadonlyArray<string> = [
  '1.25×',
  '1.5×',
  '2.0×',
  '3.0×',
  '5.0×',
  '10.0×',
] as const

// ─── Projection constants (single source of truth) ────────────────────────

/**
 * Static Y-axis ceiling floor used by the curve canvas. The dynamic
 * ceiling is `max(Y_MIN_CEIL, headMul * 1.18)`; this floor keeps the
 * 1× – 5× range from being squished against the canvas floor when the
 * round starts.
 */
export const Y_MIN_CEIL = 4.0 as const

/**
 * BASELINE_OFFSET lifts mul=1.0 ~22 % off the bottom so low-mult crashes
 * don't look like they barely moved.
 */
export const Y_BASELINE_OFFSET = 0.22 as const

/**
 * Top padding (px) reserved at the canvas's top edge so the head dot
 * doesn't bump into the chrome.
 */
export const Y_TOP_PAD_PX = 42 as const

/**
 * Bottom reserve when the action bar is mounted (active round / settled
 * round). Matches `BOTTOM_RESERVED_BAR_PX` in the curve canvas.
 */
export const Y_BOTTOM_RESERVED_BAR_PX = 56 as const

/**
 * Bottom reserve when idle (no round active). Smaller because the bar
 * is not mounted. Matches `BOTTOM_RESERVED_IDLE_PX` in the curve canvas.
 */
export const Y_BOTTOM_RESERVED_IDLE_PX = 28 as const

// ─── Pure projection function (no state, no I/O) ──────────────────────────

/**
 * Maps a multiplier (or bps) to a canvas Y coordinate.
 *
 * Linear-in-(mul - 1) with a 22% baseline lift so the curve never sits
 * flat against the canvas floor. Per-slot rise still grows exponentially
 * in time because `mul` does — the offset only affects the visible
 * baseline, not the curve's slope.
 *
 * @param mulOrBps - multiplier as Number (e.g. 1.5) or BPS as bigint (e.g. 15_000n)
 * @param H        - canvas height in px
 * @param ceilMul  - dynamic Y-axis ceiling multiplier (defaults to Y_MIN_CEIL)
 * @param bottomReservedPx - bottom-edge reserve in px (defaults to idle reserve)
 * @returns Y coordinate in px (0 = top of canvas)
 */
export function projectY(
  mulOrBps: bigint | number,
  H: number,
  ceilMul: number = Y_MIN_CEIL,
  bottomReservedPx: number = Y_BOTTOM_RESERVED_IDLE_PX,
): number {
  const v = typeof mulOrBps === 'bigint' ? Number(mulOrBps) / Number(ONE_X_BPS) : mulOrBps
  const ceil = Math.max(2.0, ceilMul)
  const linearT = Math.min(1, Math.max(0, (v - 1) / (ceil - 1)))
  const t = Y_BASELINE_OFFSET + (1 - Y_BASELINE_OFFSET) * linearT
  const drawableH = Math.max(1, H - bottomReservedPx - Y_TOP_PAD_PX)
  return H - bottomReservedPx - t * drawableH
}

// MILESTONE_Y_FRACTIONS + projectYFraction + MILESTONE_REFERENCE_* were
// removed in 2026-05-27 #2: the curve canvas now calls `projectY` directly
// at render time with the live H + ceilMul, so a precomputed static
// fraction table is obsolete (and was the root cause of the alignment
// drift in the first place). See `pulseCurveCanvas.milestonePips.ts`.

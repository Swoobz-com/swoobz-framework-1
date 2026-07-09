/**
 * Vault signatures — procedural visual primitives shared across the canvas.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  RG-C5 INVARIANT (load-bearing for Vault, mirrors Daily Dial §7.1):  ║
 * ║                                                                      ║
 * ║  Every function in this module takes ONLY position parameters         ║
 * ║  (tile index, grid layout coords, normalised progress) — NEVER       ║
 * ║  streak length, session-round count, or any frequency-tracking       ║
 * ║  parameter. The type signatures structurally enforce this. Day-1     ║
 * ║  tile #7 looks bit-identical to day-365 tile #7. A reviewer who      ║
 * ║  finds a streak parameter creeping into any signature here fails     ║
 * ║  the review at the function signature, not at the visual diff.      ║
 * ║                                                                      ║
 * ║  Per VAULT-CRAFT-SPEC.md §5 (RG-C3 structural enforcement) +         ║
 * ║  §6 (RG-C5 brand audio + visual register).                           ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Domain C: presentation only. No mutation, no I/O.
 */

// ─── Brand OO motif inside the 5×5 grid (RG-C5: position-only) ─────────────

/**
 * Generate the OO-chain ring positions that thread BEHIND the grid tiles —
 * the brand-aware grid-signature. Each position is derived ONLY from the
 * grid layout (size + bounds), never from player state. The OO chain runs
 * along the diagonal of the grid as a barely-perceptible motif (~3% alpha),
 * so the grid's positive space silently embeds the brand register.
 *
 * RG-C5: the function signature has NO streak parameter, NO mineCount,
 * NO revealedTiles parameter. The grid background OO motif is identical
 * on round 1 and round 1000 — it's a property of the GRID LAYOUT, not
 * the player's session state.
 *
 * @param gridSize Number of cells per row/column (3, 5, or 7).
 * @param x0 Top-left x of the grid in canvas coords.
 * @param y0 Top-left y of the grid in canvas coords.
 * @param tile Tile size in px.
 * @param gap Inter-tile gap in px.
 * @returns Array of {cx, cy, r} OO ring centers + radius.
 */
export function gridBackgroundOoPositions(
  gridSize: number,
  x0: number,
  y0: number,
  tile: number,
  gap: number,
): Array<{ cx: number; cy: number; r: number }> {
  if (gridSize < 3) return []
  const out: Array<{ cx: number; cy: number; r: number }> = []
  // Two interlocked OO rings centered on the grid — one biased upper-left,
  // one lower-right, forming the brand OO motif at low alpha behind the
  // grid. Radius scales with tile size so the motif reads at any grid scale.
  const cells = gridSize
  const fullW = tile * cells + gap * (cells - 1)
  const r = tile * 0.62
  const offsetX = r * 0.42
  out.push({ cx: x0 + fullW / 2 - offsetX, cy: y0 + fullW / 2, r })
  out.push({ cx: x0 + fullW / 2 + offsetX, cy: y0 + fullW / 2, r })
  return out
}

// ─── Risk meter geometry (per-round position only — RG-C5 safe) ────────────

/**
 * Compute the risk-meter fill fraction for the current round. The fraction
 * is derived ONLY from per-round position (revealed-safe count over total
 * safe tiles available). This is the inverse of "how much exploration room
 * is left" — it fills as the player commits to more tiles in THIS round.
 *
 * RG-C5 SAFE-BY-CONSTRUCTION: the function takes per-round position
 * parameters (revealedSafeCount, totalSafeTiles). It does NOT take a streak
 * count, session-rounds count, or play-frequency parameter. A round-1 player
 * at 18/22 safe reveals sees the same meter as a round-1000 player at
 * 18/22 safe reveals. The mechanic scales with WHERE YOU ARE in the
 * current round, not WHAT YOU'VE DONE before.
 *
 * The fill returns [0, 1]; the caller is responsible for the pulse
 * behaviour past the threshold (~80%) — see VaultGridCanvas.tsx.
 *
 * @param revealedSafeCount Number of safe tiles the player has revealed
 *   THIS round.
 * @param totalSafeTiles Total safe tiles available THIS round
 *   (totalTiles - mineCount).
 * @returns A fill fraction in [0, 1].
 */
export function riskMeterFraction(revealedSafeCount: number, totalSafeTiles: number): number {
  if (totalSafeTiles <= 0) return 0
  if (revealedSafeCount <= 0) return 0
  if (revealedSafeCount >= totalSafeTiles) return 1
  return revealedSafeCount / totalSafeTiles
}

/**
 * The decision-pressure threshold past which the risk meter pulses subtly.
 * Module-level constant — NOT a parameter. RG-C5: the threshold cannot
 * scale with streak length because no parameter path reaches this value.
 *
 * 0.78 means "you've revealed ~78% of the available safe tiles." At a
 * 5×5 grid with 3 mines (22 safe tiles), that's tile #18 — the natural
 * "cash out or push your luck" pressure point.
 */
export const RISK_METER_PULSE_THRESHOLD = 0.78

/**
 * Risk meter pulse period (ms). Module-level constant — the pulse rate
 * does NOT change with streak. Same period from day 1 to day 365.
 */
export const RISK_METER_PULSE_PERIOD_MS = 1_400

// ─── Thrill-scale hero multiplier (POSITION ONLY — RG-C5 safe) ─────────────

/**
 * Compute the thrill-scale multiplier-text font-size factor — mirror of
 * Pulse/Cocascade's `drawHeroMultiplier` log10 growth.
 *
 * The scale is derived ONLY from the multiplier value itself (an economic
 * signal) — not from streak length, not from how many tiles preceded it.
 * A 5.0x reached on tile #2 (mine-count 24) and a 5.0x reached on tile #18
 * (mine-count 1) both produce the SAME hero scale.
 *
 * Capped at 1.6x growth so even at 100x the hero stays inside the canvas
 * frame.
 *
 * @param multiplierBps Cumulative multiplier in BPS.
 * @returns A font-scale factor in [1.0, 1.6].
 */
export function heroMultiplierScale(multiplierBps: bigint): number {
  if (multiplierBps <= 10_000n) return 1
  const mulX = Number(multiplierBps) / 10_000
  const log = Math.log10(Math.max(1, mulX))
  return Math.min(1.6, 1 + log * 0.18)
}

// ─── Tile reveal pop animation (uniform per-reveal — RG-C5 safe) ──────────

/**
 * Tile-reveal pop scale duration (ms). Module-level constant — the pop
 * duration does NOT change with streak. Same 200ms on tile #1 and tile #22.
 */
export const TILE_REVEAL_POP_MS = 200

/**
 * Maximum pop scale at peak of the reveal animation. Module-level constant.
 * RG-C5: peak is identical on tile #1 and tile #22.
 */
export const TILE_REVEAL_POP_PEAK = 1.16

/**
 * Compute the hero-multiplier pop scale given the elapsed time since the
 * most recent safe-tile reveal. Returns 1.0 if outside the pop window.
 *
 * RG-C5: takes ONLY the elapsed-ms parameter. Does NOT take a streak count
 * or a reveal-index parameter. The pop is identical regardless of how
 * many safe tiles preceded this reveal.
 *
 * @param elapsedMs Milliseconds since the most recent safe reveal.
 * @returns Pop scale in [1.0, TILE_REVEAL_POP_PEAK].
 */
export function heroPopScale(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= TILE_REVEAL_POP_MS) return 1
  // Ease-out: pop fast, settle slow. Identical curve every reveal.
  const t = elapsedMs / TILE_REVEAL_POP_MS
  const easeOut = 1 - (1 - t) ** 3
  // From peak back down to 1.0 over the window.
  return TILE_REVEAL_POP_PEAK - (TILE_REVEAL_POP_PEAK - 1) * easeOut
}

// ─── Floating tile-delta text animation (uniform — RG-C5 safe) ─────────────

/**
 * Floating tile-delta text lifetime (ms). Module-level constant.
 * The delta text fades up and away from the just-revealed tile in this
 * window — identical every safe reveal.
 */
export const TILE_DELTA_FLOAT_MS = 700

/**
 * Compute the floating-delta text vertical offset + alpha given elapsed.
 *
 * RG-C5: takes ONLY elapsed-ms. Does NOT take streak count, reveal-index,
 * or any session-state parameter. The float-up animation is identical on
 * every safe reveal.
 *
 * @param elapsedMs Milliseconds since the reveal.
 * @returns { dy, alpha } — dy is vertical offset (negative = up), alpha [0,1].
 */
export function tileDeltaFloatState(elapsedMs: number): { dy: number; alpha: number } {
  if (elapsedMs < 0) return { dy: 0, alpha: 0 }
  if (elapsedMs >= TILE_DELTA_FLOAT_MS) return { dy: -42, alpha: 0 }
  const t = elapsedMs / TILE_DELTA_FLOAT_MS
  // Ease-out-cubic for the float-up.
  const easeOut = 1 - (1 - t) ** 3
  const dy = -42 * easeOut
  // Alpha: ramps in fast, lingers, fades out in the last 35%.
  let alpha: number
  if (t < 0.12) {
    alpha = t / 0.12
  } else if (t < 0.65) {
    alpha = 1
  } else {
    alpha = 1 - (t - 0.65) / 0.35
  }
  return { dy, alpha: Math.max(0, Math.min(1, alpha)) }
}

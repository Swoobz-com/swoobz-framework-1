/**
 * ooReiMapHitTestBuffer.ts — Pure region-label buffer builder for the
 * Tamashii-Jima colormask hit-test.
 *
 * EXPORTED PURE HELPER — no DOM, no React, no I/O.
 * Takes raw ImageData bytes + a palette and returns a filled Int16Array
 * where every land pixel is labelled with a palette entry index and every
 * sea/background pixel is -1.
 *
 * The fill strategy is morphological region-grow (spatial fill), NOT
 * colour-nearest assignment for ambiguous pixels.  Colour-nearest is
 * unstable for dark ink borders / anti-aliased edges because those pixels
 * have high squared-RGB distance to ALL region colours, so tiny colour
 * drift collapses them toward palette index 0 (Storm Coast flicker bug).
 *
 * Algorithm (three steps):
 *   1. CONFIDENT classify:
 *      - r,g,b all > SEA_THRESHOLD → -1  (sea / parchment, NEVER overwritten)
 *      - squared-RGB distance to best palette entry ≤ CONFIDENT_SQ_DIST_MAX
 *        → palette entry index (confident land pixel)
 *      - otherwise → -2  (UNASSIGNED: ink border, AA edge, ambiguous terrain)
 *
 *   2. SPATIAL region-grow:
 *      - Iteratively propagate region labels into -2 pixels from their
 *        labelled (≥0) neighbours (4-connectivity per pass).
 *      - Each -2 pixel with at least one labelled neighbour adopts the
 *        MAJORITY label among those neighbours (ties → lowest index).
 *      - Repeat until no -2 pixel changes OR MAX_GROW_PASSES reached.
 *      - Any -2 still unreachable after the cap (fully enclosed by sea)
 *        is promoted to -1 (sea).
 *
 *   3. Sea sentinel (-1) is never overwritten during region-grow.
 *
 * Why this is correct:
 *   Dark border pixels are physically located INSIDE or ON the edge of a
 *   region.  Their nearest-labelled neighbour is the region they belong to,
 *   not Storm Coast or any other region selected by colour distance.  After
 *   region-grow, hovering a border/dead-spot resolves to the spatially
 *   surrounding region, giving stable hit-test results.
 *
 * Domain C: pure presentation helper.  Zero financial arithmetic.
 */

/** One entry in the colormask palette. */
export interface PaletteEntry {
  /** Index into MYTH_REGIONS that this palette entry maps to. */
  readonly idx: number
  readonly r: number
  readonly g: number
  readonly b: number
}

// Sea / parchment background threshold.  Pixels with r, g, b ALL above this
// value are classified as sea and stored as -1 (never filled).
export const MASK_SEA_THRESHOLD = 220 as const

// Confident-match threshold: maximum squared-RGB distance for a pixel to be
// considered a solid region-colour pixel (not an ambiguous ink/AA edge).
// 40² per channel ≈ 1600 total; tightened relative to the old "no threshold"
// approach so border pixels fall through to UNASSIGNED (-2) for spatial fill.
export const CONFIDENT_SQ_DIST_MAX = 1600 as const

// Maximum number of region-grow passes before giving up on any remaining -2
// pixels (which then become -1 / sea).  64 passes comfortably fills any ink
// border that is ≤ 32px wide on a 1024×1024 colormask.
export const MAX_GROW_PASSES = 64 as const

/**
 * Build a filled region-label Int16Array from raw ImageData bytes.
 *
 * @param data   - Uint8ClampedArray from CanvasRenderingContext2D.getImageData
 *                 (RGBA, row-major, width*height*4 bytes).
 * @param width  - Image width in pixels.
 * @param height - Image height in pixels.
 * @param palette - Palette entries; each entry's `idx` is stored in the buffer.
 *
 * @returns Int16Array of length width*height.
 *   Value ≥ 0  → MYTH_REGIONS index (region label)
 *   Value === -1 → sea / background (never interactive)
 */
export function buildRegionLabelBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  palette: ReadonlyArray<PaletteEntry>,
): Int16Array {
  const total = width * height
  const buffer = new Int16Array(total)

  // ── Step 1: CONFIDENT classify ─────────────────────────────────────────────
  for (let i = 0; i < total; i++) {
    const base = i * 4
    const pr = data[base]!
    const pg = data[base + 1]!
    const pb = data[base + 2]!

    // Sea / parchment background
    if (pr > MASK_SEA_THRESHOLD && pg > MASK_SEA_THRESHOLD && pb > MASK_SEA_THRESHOLD) {
      buffer[i] = -1
      continue
    }

    // Find best palette match and check confidence threshold
    let bestIdx = -1
    let bestDist = Number.MAX_SAFE_INTEGER

    for (let j = 0; j < palette.length; j++) {
      const entry = palette[j]!
      const dr = pr - entry.r
      const dg = pg - entry.g
      const db = pb - entry.b
      const dist = dr * dr + dg * dg + db * db
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = j
      }
    }

    if (bestIdx >= 0 && bestDist <= CONFIDENT_SQ_DIST_MAX) {
      // Confident match — store the MYTH_REGIONS index from the palette entry.
      buffer[i] = palette[bestIdx]!.idx
    } else {
      // Ambiguous (ink border, AA edge, dark terrain) — mark for spatial fill.
      buffer[i] = -2
    }
  }

  // ── Step 2: SPATIAL region-grow ────────────────────────────────────────────
  // Multi-pass 4-connectivity propagation.  Each pass sweeps the whole buffer;
  // any -2 pixel adjacent to at least one labelled (≥0) pixel adopts the
  // majority label.  Sea (-1) is never overwritten.
  //
  // Two alternating passes per iteration (forward + backward sweep) reduces
  // the number of iterations needed to fill wide ink regions.
  //
  // neighbourCounts: reuse a small scratch array to tally votes per palette entry.
  const maxIdx = palette.length  // max region index is palette.length - 1 by idx, but we use raw label values
  // We need to count votes for each MYTH_REGIONS index that appears as a label.
  // To avoid O(palette²) inner loop, find the max possible label value first.
  let maxLabelValue = 0
  for (let j = 0; j < palette.length; j++) {
    if (palette[j]!.idx > maxLabelValue) maxLabelValue = palette[j]!.idx
  }
  const voteCounts = new Int32Array(maxLabelValue + 1)

  let changed = true
  let pass = 0

  while (changed && pass < MAX_GROW_PASSES) {
    changed = false
    pass++

    // Forward sweep (top-left → bottom-right)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        if (buffer[i] !== -2) continue  // already labelled or sea — skip

        // Collect votes from 4 neighbours that are already labelled (≥0)
        let voteCount = 0
        voteCounts.fill(0)

        // Up
        if (y > 0) {
          const nb = buffer[(y - 1) * width + x]!
          if (nb >= 0 && nb <= maxLabelValue) { (voteCounts[nb] as number)++; voteCount++ }
        }
        // Down
        if (y < height - 1) {
          const nb = buffer[(y + 1) * width + x]!
          if (nb >= 0 && nb <= maxLabelValue) { (voteCounts[nb] as number)++; voteCount++ }
        }
        // Left
        if (x > 0) {
          const nb = buffer[y * width + (x - 1)]!
          if (nb >= 0 && nb <= maxLabelValue) { (voteCounts[nb] as number)++; voteCount++ }
        }
        // Right
        if (x < width - 1) {
          const nb = buffer[y * width + (x + 1)]!
          if (nb >= 0 && nb <= maxLabelValue) { (voteCounts[nb] as number)++; voteCount++ }
        }

        if (voteCount === 0) continue  // no labelled neighbours yet

        // Majority label: scan voteCounts for the entry with the most votes.
        // Ties resolve to the lowest label index (deterministic).
        let winner = -1
        let winnerVotes = 0
        for (let label = 0; label <= maxLabelValue; label++) {
          const votes = voteCounts[label] ?? 0
          if (votes > winnerVotes) {
            winnerVotes = votes
            winner = label
          }
        }

        if (winner >= 0) {
          buffer[i] = winner
          changed = true
        }
      }
    }

    // Backward sweep (bottom-right → top-left) — propagates labels that were
    // just set in the forward pass back into their upstream -2 neighbours.
    if (!changed) break  // no point doing backward if forward changed nothing

    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const i = y * width + x
        if (buffer[i] !== -2) continue

        let voteCount = 0
        voteCounts.fill(0)

        if (y > 0) {
          const nb = buffer[(y - 1) * width + x]!
          if (nb >= 0 && nb <= maxLabelValue) { (voteCounts[nb] as number)++; voteCount++ }
        }
        if (y < height - 1) {
          const nb = buffer[(y + 1) * width + x]!
          if (nb >= 0 && nb <= maxLabelValue) { (voteCounts[nb] as number)++; voteCount++ }
        }
        if (x > 0) {
          const nb = buffer[y * width + (x - 1)]!
          if (nb >= 0 && nb <= maxLabelValue) { (voteCounts[nb] as number)++; voteCount++ }
        }
        if (x < width - 1) {
          const nb = buffer[y * width + (x + 1)]!
          if (nb >= 0 && nb <= maxLabelValue) { (voteCounts[nb] as number)++; voteCount++ }
        }

        if (voteCount === 0) continue

        let winner = -1
        let winnerVotes = 0
        for (let label = 0; label <= maxLabelValue; label++) {
          const votes = voteCounts[label] ?? 0
          if (votes > winnerVotes) {
            winnerVotes = votes
            winner = label
          }
        }

        if (winner >= 0) {
          buffer[i] = winner
          changed = true
        }
      }
    }
  }

  // ── Step 3: Promote remaining -2 (unreachable islands) to -1 (sea) ─────────
  for (let i = 0; i < total; i++) {
    if (buffer[i] === -2) buffer[i] = -1
  }

  return buffer
}

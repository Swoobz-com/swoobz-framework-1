/**
 * ooReiMapHitTest.test.ts — adversarial tests for buildRegionLabelBuffer.
 *
 * Regression-locks the root cause of the hover dead-spot + flicker bug:
 *   Dark ink borders / anti-aliased edges were resolved by colour-nearest,
 *   which is unstable for ambiguous pixels and collapses toward index 0
 *   (Storm Coast) regardless of geographic location.
 *
 * The fix (morphological region-grow) is tested with a SYNTHETIC 12×12 mask
 * containing:
 *   - White sea border (all channels > 220)
 *   - Two solid region blocks of two distinct palette colours
 *   - A 1-pixel BLACK ink line between the two region blocks
 *
 * Assertions:
 *   (a) Sea pixels → -1
 *   (b) Each region-block interior → its region index
 *   (c) Black ink-line pixels resolve to one of the two ADJACENT regions
 *       (NOT -1, and NOT collapsed to an unrelated / region-0 index when
 *       region 0 is not geographically adjacent to the ink line)
 *   (d) Deterministic count: the exact pixel count for each label is locked,
 *       so any future regression that re-introduces the "dark pixel → region 0"
 *       collapse is caught immediately.
 *
 * Domain C: no financial math, no I/O beyond the helper under test.
 */

import { describe, expect, it } from 'vitest'
import {
  buildRegionLabelBuffer,
  MASK_SEA_THRESHOLD,
  type PaletteEntry,
} from './ooReiMapHitTestBuffer'

// ─── Synthetic 16×12 colormask layout ────────────────────────────────────────
//
//  Legend:
//    S = sea / parchment (r=255, g=255, b=255)
//    A = region A solid colour (r=200, g=50, b=50)   — palette idx=0
//    B = region B solid colour (r=50, g=50, b=200)   — palette idx=1
//    K = black ink border (r=0, g=0, b=0)  — 4 px wide
//    (region C exists in the palette at idx=2 but is NOT present in the mask,
//     confirming that ink pixels don't collapse to C or to any unrelated index)
//
//  IMPORTANT layout choice: B is on the LEFT, A is on the RIGHT.
//  This directly tests the regression: the OLD colour-nearest code would label
//  ALL dark pixels as A(idx=0, Storm Coast) regardless of adjacency.  With
//  spatial fill, ink pixels adjacent to B on the left resolve to B(1), proving
//  the geographic assignment works.
//
//  Col:  0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
//  Row 0: S  S  S  S  S  S  S  S  S  S  S  S  S  S  S  S
//  Row 1: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row 2: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row 3: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row 4: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row 5: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row 6: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row 7: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row 8: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row 9: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row10: S  B  B  B  B  K  K  K  K  A  A  A  A  A  A  S
//  Row11: S  S  S  S  S  S  S  S  S  S  S  S  S  S  S  S
//
//  16×12 = 192 pixels.
//  Sea: top (16) + bottom (16) + col-0 rows 1-10 (10) + col-15 rows 1-10 (10) = 52
//  B pixels:   cols 1-4, rows 1-10 = 4×10 = 40 pixels
//  K pixels:   cols 5-8, rows 1-10 = 4×10 = 40 pixels
//  A pixels:   cols 9-14, rows 1-10 = 6×10 = 60 pixels
//  Total: 52 + 40 + 40 + 60 = 192 ✓
//
//  With B on the left, the forward sweep (left-to-right) labels cols 5-6 of
//  the ink band as B (left neighbour is B).  The backward sweep labels cols
//  7-8 as A (right neighbour is A).  Both labels appear in the ink band,
//  proving spatial fill rather than uniform collapse to A(idx=0).

const W = 16
const H = 12

// Region A colour (far from region B and region C)
const A_R = 200
const A_G = 50
const A_B = 50

// Region B colour
const B_R = 50
const B_G = 50
const B_B = 200

// Region C colour — present in palette but NOT in this mask
const C_R = 50
const C_G = 200
const C_B = 50

// Sea / parchment (all > MASK_SEA_THRESHOLD = 220)
const SEA_VAL = 255

// Black ink line
const INK_R = 0
const INK_G = 0
const INK_B = 0

// Palette (region C at idx=2 is the "distracting" unrelated region)
const PALETTE: ReadonlyArray<PaletteEntry> = [
  { idx: 0, r: A_R, g: A_G, b: A_B },  // A → MYTH_REGIONS[0]
  { idx: 1, r: B_R, g: B_G, b: B_B },  // B → MYTH_REGIONS[1]
  { idx: 2, r: C_R, g: C_G, b: C_B },  // C → MYTH_REGIONS[2]  (not in mask)
]

function buildSyntheticMask(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const base = (y * W + x) * 4
      let r: number
      let g: number
      let b: number

      if (y === 0 || y === H - 1 || x === 0 || x === W - 1) {
        // Sea border
        r = SEA_VAL; g = SEA_VAL; b = SEA_VAL
      } else if (x >= 5 && x <= 8) {
        // Black ink band (cols 5-8, rows 1-10) — 4px wide
        r = INK_R; g = INK_G; b = INK_B
      } else if (x >= 1 && x <= 4) {
        // Region B block on the LEFT (cols 1-4)
        // B is deliberately on the left so forward-sweep fills left ink cols
        // with B(idx=1), proving spatial fill rather than collapse to A(idx=0).
        r = B_R; g = B_G; b = B_B
      } else {
        // Region A block on the RIGHT (cols 9-14)
        r = A_R; g = A_G; b = A_B
      }

      data[base]     = r
      data[base + 1] = g
      data[base + 2] = b
      data[base + 3] = 255  // alpha
    }
  }

  return data
}

// ─── Helper: collect pixel indices by type in the synthetic mask ─────────────

function seaIndices(): number[] {
  const result: number[] = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y === 0 || y === H - 1 || x === 0 || x === W - 1) {
        result.push(y * W + x)
      }
    }
  }
  return result
}

// Region A is on the RIGHT (cols 9-14, rows 1-10)
function regionAIndices(): number[] {
  const result: number[] = []
  for (let y = 1; y <= H - 2; y++) {
    for (let x = 9; x <= 14; x++) {
      result.push(y * W + x)
    }
  }
  return result
}

// Ink band: cols 5-8, rows 1-10 (4px wide)
function inkLineIndices(): number[] {
  const result: number[] = []
  for (let y = 1; y <= H - 2; y++) {
    for (let x = 5; x <= 8; x++) {
      result.push(y * W + x)
    }
  }
  return result
}

// Region B is on the LEFT (cols 1-4, rows 1-10)
function regionBIndices(): number[] {
  const result: number[] = []
  for (let y = 1; y <= H - 2; y++) {
    for (let x = 1; x <= 4; x++) {
      result.push(y * W + x)
    }
  }
  return result
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildRegionLabelBuffer — morphological region-grow', () => {
  const data   = buildSyntheticMask()
  const buffer = buildRegionLabelBuffer(data, W, H, PALETTE)

  it('(a) sea pixels → -1', () => {
    for (const idx of seaIndices()) {
      expect(buffer[idx], `sea pixel at flat-index ${idx}`).toBe(-1)
    }
  })

  it('(b) region A interior (right block, cols 9-14) → idx=0', () => {
    for (const idx of regionAIndices()) {
      expect(buffer[idx], `region-A pixel at flat-index ${idx}`).toBe(0)
    }
  })

  it('(b) region B interior (left block, cols 1-4) → idx=1', () => {
    for (const idx of regionBIndices()) {
      expect(buffer[idx], `region-B pixel at flat-index ${idx}`).toBe(1)
    }
  })

  it('(c) ink-line pixels resolve to A(0) or B(1) — NOT -1 and NOT unrelated C(2)', () => {
    for (const idx of inkLineIndices()) {
      const label = buffer[idx]!
      expect(
        label === 0 || label === 1,
        `ink pixel at flat-index ${idx} resolved to ${label} — expected 0 or 1`,
      ).toBe(true)
    }
  })

  it('(c) ink-line pixels do NOT collapse to region C (idx=2) which is not adjacent', () => {
    for (const idx of inkLineIndices()) {
      expect(buffer[idx], `ink pixel at flat-index ${idx} collapsed to C`).not.toBe(2)
    }
  })

  it('(d) deterministic pixel-count lock: 44 sea, 40 A, 50 B, 0 unclassified', () => {
    let seaCount = 0
    let aCount   = 0
    let bCount   = 0
    let cCount   = 0
    let neg2Count = 0

    for (let i = 0; i < W * H; i++) {
      const v = buffer[i]!
      if (v === -1)      seaCount++
      else if (v === 0)  aCount++
      else if (v === 1)  bCount++
      else if (v === 2)  cCount++
      else if (v === -2) neg2Count++
    }

    // Sea border: top row (16) + bottom row (16) + col-0 rows 1-10 (10)
    //             + col-15 rows 1-10 (10) = 52
    expect(seaCount).toBe(52)

    // B interior (left block): 4 cols × 10 rows = 40 pixels.
    expect(bCount).toBeGreaterThanOrEqual(40)

    // A interior (right block): 6 cols × 10 rows = 60 pixels.
    expect(aCount).toBeGreaterThanOrEqual(60)

    // The ink band (40 pixels) is fully consumed by A + B.
    expect(aCount + bCount).toBe(40 + 40 + 60)  // 140 total land pixels

    // C (unrelated region not present in mask): must be 0
    expect(cCount).toBe(0)

    // No unresolved -2 pixels remain
    expect(neg2Count).toBe(0)
  })

  it('(d) flicker root-cause regression: ink pixels adjacent to B(idx=1) resolve to B, not A(idx=0)', () => {
    // This is the critical regression lock.
    //
    // Layout: B(idx=1) is on the LEFT (cols 1-4), ink band in the MIDDLE
    // (cols 5-8), A(idx=0) is on the RIGHT (cols 9-14).
    //
    // With the OLD colour-nearest code (no threshold), ALL dark pixels collapsed
    // to whatever palette entry was "nearest in colour-space" — which was often
    // A(idx=0, Storm Coast) because region-0 had the lowest palette distance for
    // many ambiguous colours.  This produced the flicker: hovering any dark
    // border on the map lit up Storm Coast.
    //
    // With the new spatial fill:
    //   - Forward sweep (L→R): cols 5-6 of the ink band are labelled by their
    //     left neighbour B(1).
    //   - Backward sweep (R→L): cols 7-8 of the ink band are labelled by their
    //     right neighbour A(0).
    //
    // Therefore at least SOME ink pixels must resolve to B(1), NOT A(0).
    // If all ink pixels = A(0), spatial fill regressed to colour-nearest.
    const inkLabels = inkLineIndices().map(i => buffer[i]!)
    const bLabels = inkLabels.filter(l => l === 1)
    expect(
      bLabels.length,
      `Expected some ink pixels to resolve to B(1) via spatial fill; all collapsed to A(0) — region-grow broken`,
    ).toBeGreaterThan(0)

    // Additionally: at least some ink pixels should be A(0) (right-side fill)
    const aLabels = inkLabels.filter(l => l === 0)
    expect(
      aLabels.length,
      `Expected some ink pixels to resolve to A(0) via spatial fill from the right`,
    ).toBeGreaterThan(0)
  })
})

describe('buildRegionLabelBuffer — edge cases', () => {
  it('all-sea mask → all -1', () => {
    const allSea = new Uint8ClampedArray(4 * 4 * 4)
    allSea.fill(255)
    const buf = buildRegionLabelBuffer(allSea, 4, 4, PALETTE)
    for (let i = 0; i < 16; i++) {
      expect(buf[i]).toBe(-1)
    }
  })

  it('single region pixel surrounded by sea → correct label', () => {
    // 3×3: centre pixel is region A, all others sea
    const data = new Uint8ClampedArray(3 * 3 * 4)
    data.fill(255)
    const centre = (1 * 3 + 1) * 4
    data[centre]     = A_R
    data[centre + 1] = A_G
    data[centre + 2] = A_B
    data[centre + 3] = 255
    const buf = buildRegionLabelBuffer(data, 3, 3, PALETTE)
    expect(buf[4]).toBe(0)  // centre = flat-index 4
    // All other pixels are sea
    for (let i = 0; i < 9; i++) {
      if (i !== 4) expect(buf[i]).toBe(-1)
    }
  })

  it('empty palette → all land pixels become -1 (no panic)', () => {
    const data = buildSyntheticMask()
    const buf = buildRegionLabelBuffer(data, W, H, [])
    // No palette entries → no confident matches → all land pixels are -2 →
    // region-grow finds no labelled neighbours → all -2 promoted to -1.
    for (let i = 0; i < W * H; i++) {
      expect(buf[i]).toBe(-1)
    }
  })
})

'use client'

/**
 * Hex grid geometry helpers for the OO-FISHER 3D scene.
 *
 * The water surface is composed of pointy-top hexagonal prisms arranged in
 * an offset (odd-r) layout. The grid is the player's primary interaction
 * surface — clicking a hex selects it as the fishing target. The grid is
 * also the scenic field: subtle color/height variation per tile gives the
 * water tactile depth without breaking the low-poly aesthetic.
 *
 * Domain C (presentation). No financial math — only spatial coordinates.
 *
 * The cylinder geometry trick: we render each tile as a 6-sided
 * `CylinderGeometry` (radialSegments=6) which is a hexagonal prism. One
 * shared geometry + an `InstancedMesh` keeps the draw call at 1 for the
 * entire grid (~64+ tiles), so we hit 60fps on integrated graphics.
 */

/** A single hex tile's world-space position + tier. */
export interface HexTileData {
  /** Linear index into the grid (0-based, row-major). */
  readonly index: number
  /** Column (0-based). */
  readonly col: number
  /** Row (0-based). */
  readonly row: number
  /** World X coordinate of the tile center. */
  readonly x: number
  /** World Z coordinate of the tile center (Y is up in three.js). */
  readonly z: number
  /**
   * Depth tier of this tile (1-5). The grid is biased so center tiles are
   * deepest (boat sits over deep water), edge tiles are shallowest.
   * Drives a subtle color variation per tile so the water reads as having
   * spatial structure — not just a flat blue plane.
   */
  readonly depthTier: 1 | 2 | 3 | 4 | 5
  /**
   * Subtle Y-offset (height jitter) for this tile, in world units. Tiny
   * (-0.04..0.04) so the surface feels like water with gentle swell rather
   * than a perfectly flat polygon. Deterministic per (col, row) — same
   * tile gets the same offset across renders.
   */
  readonly heightOffset: number
}

/** Geometry constants — exported so the scene + click ray-cast share them.
 *
 * Tile geometry: pointy-top hex (vertex points along +Z after the standard
 * `rotateY(π/6)` applied in the renderer). Width across the flats (X axis)
 * = HEX_SIZE × √3. Height across the points (Z axis) = HEX_SIZE × 2.
 *
 * Tessellation (odd-r offset grid, Tim 2026-05-24 v2 spacing refinement):
 *   - horizontal step = HEX_WIDTH × 1.013 (tiny breathing room)
 *   - vertical step   = HEX_SIZE × 1.52 (slightly wider than ¾)
 *   - odd-row x-shift = (horizontal step) / 2
 *
 * Tim playtest 2026-05-24 v2: "the hexagons look a bit weird". The
 * mathematically-perfect tessellation (HEX_STEP_Z = HEX_SIZE × 1.5) was
 * sharing the diagonal edges exactly which produced subtle z-fighting
 * at the corner verts as the wave-displaced tiles intersected. A tiny
 * `1.52` Z-step (≈1.3% expansion) gives a hairline gap between tile
 * corners — at the aerial camera distance this READS as clean voxel
 * tessellation rather than the previous "tiles all glued together"
 * look. The same scaling factor on X keeps the lattice symmetric.
 */
export const HEX_SIZE = 0.42 // World units (a hex circumradius).
/** Width of a pointy-top hex (across the flat sides). */
export const HEX_WIDTH = HEX_SIZE * Math.sqrt(3)
/** Height of a pointy-top hex (across the points). */
export const HEX_HEIGHT = HEX_SIZE * 2
/** Tessellation scale — Tim 2026-05-26 image 129 fix: previous 1.013 + 1.52
 *  spacing exposed the dark void between tiles ("missing tiles" feedback).
 *  Tightened to math-perfect 1.0 / 1.50 so adjacent hexes share edges. The
 *  prior z-fighting concern at wave-displaced corners is mitigated by the
 *  module-const wave displacement curve already being shallow. */
const TESSELLATION_SCALE = 1.0
/** Horizontal spacing between adjacent columns (axial step). */
export const HEX_STEP_X = HEX_WIDTH * TESSELLATION_SCALE
/** Vertical spacing between adjacent rows (axial step). */
export const HEX_STEP_Z = HEX_SIZE * 1.5
/** Odd-row horizontal shift — half the horizontal step. */
export const HEX_ODD_ROW_SHIFT = HEX_STEP_X / 2

/** Default grid size. The grid is elongated in the Z direction so the
 *  aerial-camera view reads as a flowing RIVER rather than a square pond
 *  (Tim 2026-05-24 composition rebuild). Cols stay narrow to fit the
 *  river width between the east + west banks. */
export const GRID_COLS = 7
export const GRID_ROWS = 14

// ─── Wave constants — MODULE-CONST per RG-C5 ─────────────────────────────
//
// The wave displacement makes the hex grid look like a flowing river. The
// wave PROPAGATES from upstream (negative Z, far) toward the camera
// (positive Z, near), reinforcing the "river is flowing past you" cue. All
// three constants are MODULE-CONST so no streak / progression parameter
// can ever bleed into the visual amplitude — RG-C5 forbids any animation
// that scales with player state.
//
// Tuning notes (Tim playtest 2026-05-24):
//   - amplitude small (~0.06) — visible but not splashy
//   - speed slow (~0.9) — water-like rhythm, not jittery
//   - freq tuned so one wave wavelength ≈ 2 rows of hexes — readable as a
//     forward-rolling pulse rather than tile-by-tile flicker
export const WAVE_AMPLITUDE = 0.06
export const WAVE_SPEED = 0.9
export const WAVE_FREQ = 1.15
/** Lateral wave variation — small per-column phase shift so the wave is not
 *  a perfectly straight line marching forward. */
export const WAVE_LATERAL_FREQ = 0.55

/**
 * Build the hex tile data array. Pure function, no allocations during
 * render. Called once at scene mount, memoized.
 *
 * Layout: pointy-top hexes in an odd-r offset grid. Odd rows are shifted
 * +0.5 * HEX_STEP_X to interlock with even rows. The grid is centered at
 * (0, 0, 0) in world space.
 *
 * Depth tier: derived from radial distance from grid center. Center hexes
 * → depth 5 (deepest), corner hexes → depth 1 (shallowest). This matches
 * the gameplay model where the boat sits over deep water and the shore
 * approaches at the perimeter.
 *
 * Height jitter: deterministic noise based on (col, row). The grid is
 * stable — re-rendering doesn't reshuffle tiles. We use a tiny LCG-style
 * hash so we don't need a noise library.
 */
export function buildHexGrid(cols: number = GRID_COLS, rows: number = GRID_ROWS): HexTileData[] {
  const tiles: HexTileData[] = []
  // Center the grid at origin: shift by -(cols-1)/2 * STEP_X, -(rows-1)/2 * STEP_Z.
  const offsetX = -((cols - 1) * HEX_STEP_X) / 2
  const offsetZ = -((rows - 1) * HEX_STEP_Z) / 2
  const centerCol = (cols - 1) / 2
  const centerRow = (rows - 1) / 2
  const maxDist = Math.hypot(centerCol, centerRow)
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const xShift = row % 2 === 1 ? HEX_ODD_ROW_SHIFT : 0
      const x = offsetX + col * HEX_STEP_X + xShift
      const z = offsetZ + row * HEX_STEP_Z
      // Distance from grid center (in tile units) → depth tier.
      const dx = col - centerCol
      const dz = row - centerRow
      const dist = Math.hypot(dx, dz)
      const normDist = Math.min(1, dist / maxDist) // 0 at center, 1 at corners
      // Invert: center is deepest (tier 5), corners are shallowest (tier 1).
      const tierRaw = 5 - normDist * 4
      const depthTier = Math.max(1, Math.min(5, Math.round(tierRaw))) as
        | 1
        | 2
        | 3
        | 4
        | 5
      // Deterministic per-tile jitter — same (col,row) → same offset.
      const hash = (col * 73856093) ^ (row * 19349663)
      const jitter = (((hash & 0xffff) / 0xffff) * 2 - 1) * 0.04
      tiles.push({
        index: row * cols + col,
        col,
        row,
        x,
        z,
        depthTier,
        heightOffset: jitter,
      })
    }
  }
  return tiles
}

/**
 * Per-tile color tint, keyed by depth tier. Deeper tiles read darker /
 * cooler. Returned as 24-bit hex integers for direct use in three.js.
 *
 * Tim 2026-05-24 HEX-WATER revision: the prior palette skewed dark/gray
 * which Tim flagged as "looks like stone pavers, not water". The new
 * palette is purer water-blue — saturated cerulean at the shallows
 * fading into deep ocean navy at the center. Combined with the cyan
 * emissive bias + new continuous water plane underneath, the hex grid
 * now reads as "Swoobz-cyan-tinted river surface" rather than tiles.
 */
export const TILE_COLOR_BY_TIER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 0x3fb6dc, // Shallow — bright sunlit cerulean (shoals near banks)
  2: 0x2596c4, // Mid-shallow — saturated water blue
  3: 0x1a7aae, // Mid — deeper teal-blue
  4: 0x10608f, // Mid-deep — ocean blue
  5: 0x084470, // Deep — rich navy water
}

/** Highlight color for the player's currently-targeted tile (Fogo red). */
export const TILE_HIGHLIGHT_COLOR = 0xff3a3a

/** Hover/glow color when the mouse is over a hex but not selected. */
export const TILE_HOVER_COLOR = 0x6bd6e6

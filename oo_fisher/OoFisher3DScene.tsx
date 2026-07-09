'use client'

/**
 * OoFisher3DScene — the low-poly 3D fishing surface.
 *
 * Replaces the 2D side-view OoFisherWaterCanvas with a top-down isometric
 * 3D scene inspired by Fogo Fishing. Composition (camera-down-the-z-axis):
 *   - Hex water grid (clickable, depth-tier color variation, red highlight
 *     on the targeted fishing spot)
 *   - Voxel low-poly boat at center, rocks gently on a sine wave
 *   - Low-poly rod extending from the boat toward the targeted hex
 *   - Cast line + lure animating during line-out / fish-on / reeling
 *   - Low-poly fish swimming under the hex grid at their depth tier
 *   - Distant low-poly mountain silhouettes behind the grid
 *   - Pine trees + rocks scattered on the north/south shores
 *   - Sunset sky gradient (pink → orange → blue) via a custom shader
 *
 * RG-C5 STRUCTURAL: the catch celebration (fish jump arc + audio chord
 * fired upstream in the provider) uses IDENTICAL animation amplitude
 * across all rarities. Only the fish sprite TINT differs (read from
 * `RARITY_VISUALS[rarity].rgb` via `rarityToColor`). No streak parameter
 * threads into the visual pipeline.
 *
 * Performance discipline:
 *   - InstancedMesh for the hex grid (1 draw call for 81 tiles)
 *   - InstancedMesh for trees + rocks (1 draw call per shore-prop type)
 *   - Refs hold rocking/swimming state to avoid React re-render per frame
 *   - DPR capped at 2 via the parent Canvas
 *   - All geometries memoized at scene mount; no per-frame allocations
 *
 * Procedural fallback strategy: we don't load external 3D model files.
 * Every shape is built from three.js primitives (cylinder, box, cone,
 * sphere). This gives us reproducible builds, zero CDN dependencies, and
 * the low-poly aesthetic emerges naturally from primitive composition.
 *
 * Domain C: presentation only.
 */
import { type ReactElement, Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

import { CatchJump, SwimmingFish } from './OoFisher3DFish'
import {
  buildHexGrid,
  GRID_COLS,
  GRID_ROWS,
  HEX_SIZE,
  type HexTileData,
  TILE_COLOR_BY_TIER,
  TILE_HIGHLIGHT_COLOR,
  WAVE_AMPLITUDE,
  WAVE_FREQ,
  WAVE_LATERAL_FREQ,
  WAVE_SPEED,
} from './ooFisher3DHexGrid'
import {
  GroundPlane,
  MountainRange,
  PineForest,
  RollingHills,
  SHORE_LEVEL,
  ShoreDetail,
} from './OoFisher3DScenery'
import {
  type DepthTier,
  type FishRarity,
  type GearTier,
} from './ooFisherMath'

// ─── Scene constants ─────────────────────────────────────────────────────

const WATER_LEVEL = 0 // World Y of the water surface (hex top face).
// SHORE_LEVEL is exported from ./OoFisher3DScenery so the boat + scenery
// both reference the same constant. Imported above.
//
// Tim 2026-05-26 SUNNY DAY revision: Tim: "Please also shine some way more
// light as if its a sunny day to fish." The previous GOLDEN HOUR palette
// (pink→orange→yellow) read as "sunset". New palette is a BRIGHT MIDDAY
// fishing day:
//   SKY_TOP: clear deep blue — classic bright day overhead.
//   SKY_MID: lighter blue-white — the washed-out midday sky band.
//   SKY_LOW: warm yellow-white horizon haze where the sun bleeds in.
//   SUN_COLOR: bright white-cream (5800K noon sun, not amber sunset).
const SKY_TOP = '#4a8fc8' // Clear deep blue — bright midday overhead.
const SKY_MID = '#87bfe0' // Lighter blue-white — washed midday band.
const SKY_LOW = '#e8f4ff' // Near-white horizon haze.
const SUN_COLOR = '#fffef0' // Bright warm-white noon sun core.

const BOAT_ROCK_AMPLITUDE_DEG = 2 // Boat tilts ±2° on the sine wave.
const BOAT_ROCK_PERIOD_S = 3.4 // Full rock cycle period.

// ─── Boat composition constants (Tim playtest 2026-05-24) ───────────────
//
// The boat sits near the GRID CENTER so the aerial-camera view shows
// the river extending in all directions around it — the "river flowing
// past" composition cue. These are MODULE-CONST per RG-C5: nothing in
// the game state can scale or shift the boat's position.
const BOAT_FOREGROUND_Z = 0.4 // Near grid center (so river surrounds boat).
const BOAT_FOREGROUND_Y_OFFSET = 0.22 // Lifted slightly so it reads above water.
const BOAT_SCALE = 1.6 // Magnify ~1.6× over the default tier size.

// ─── Swoobz brand palette (boutique-outdoor brass-fitted register) ───────
//
// Tim 2026-05-25 BRASS-FITTED revision (per OO-FISHER-ART-DIRECTION-
// 2026-05-25.md §4.2): the prior palette used cyan as DECORATION (gunwale
// rim + cabin window + underwater glow + firefly particles = at least 5
// cyan moments, violating the DLv2 §1 P8 4-cyan economy). The register
// drifted toward "Star Trek control panel" rather than "brass-fitted
// dawn fishing skiff."
//
// New register: a boutique-outdoor 1971-Filson-catalogue-page register.
// Walnut grip + brushed-brass fittings + warm-cream morning-light through
// cabin glass. The cyan brand cue stays — it just lives now ONLY at the
// 4 cyan-economy assignments (chassis header, rod-band cast-power gauge,
// chassis CTA, right HUD plaque numerals), NOT painted across every
// metallic accent.
//
// Hull palette unchanged (the navy + dark keel work at aerial POV and
// landed Tim's 2026-05-24 v2 playtest).
// Tim 2026-05-26 image 127 boat fix: the prior NAVY palette read as a
// dark blob under the sunny daylight key. The wood-theme register Tim's
// asking for everywhere extends to the boat itself — a boutique-outdoor
// Filson-catalogue fishing skiff is warm cedar + walnut + brass, NOT
// industrial-navy. New palette: warm cedar deck + walnut hull + deep
// walnut keel + cream cabin + polished brass gunwale (gunwale unchanged).
const BOAT_HULL_COLOR = '#7A4A24' // Warm cedar — main hull plank color
const BOAT_HULL_MID = '#5A3318' // Walnut — mid-hull
const BOAT_HULL_DARK = '#3D200E' // Deep walnut — keel + waterline shadow
// Gunwale CHANGED from cyan #00f0ff to brushed brass #b8895c per §4.2.
// Quote Tim 2026-05-25: the cyan-everywhere read was Star-Trek not Filson.
const BOAT_GUNWALE_COLOR = '#b8895c' // Brushed brass — boutique-outdoor metal.
const BOAT_CABIN_COLOR = '#e8dec8' // Warm cream — wood-theme cabin walls
const BOAT_CABIN_ROOF = '#3D200E' // Deep walnut — matches hull-dark for cohesion
// Window CHANGED from cyan #00f0ff to warm-cream #dcc6a0 per §4.2.
// Reads as "morning light through cabin glass" rather than "neon control
// panel". Subtle emissive (0.15) added on the mesh material to keep the
// "lit through glass" read at the aerial POV.
const BOAT_WINDOW_COLOR = '#dcc6a0' // Warm cream — morning light through glass.
const BOAT_DECK_PLANK = '#A06840' // Lighter cedar — deck plank grain
const BOAT_DECK_PLANK_DARK = '#6B3C1E' // Cedar shadow — alternate plank

// ─── HUD-in-scene material constants (Tim 2026-05-25 brass-fitted) ──────
//
// The cabin-door HUD plaques and the rod-band cast-power gauge inherit
// these. Walnut frame + brushed brass border + dark velvet inset is the
// Cartier/Filson register — every plaque reads as a real engraved
// instrument.
const PLAQUE_WALNUT_COLOR = '#4a2e1e' // Polished walnut frame.
const PLAQUE_BRASS_COLOR = '#b8895c' // Brushed brass border + numerals.
const PLAQUE_INSET_COLOR = '#1a0e0a' // Deep velvet recess inside the plaque.
const PLAQUE_NUMERAL_BRASS = '#dcc6a0' // Warm cream-brass for static labels.
const PLAQUE_NUMERAL_CYAN = '#00D0DE' // DLv2 cyan-economy Job 4 — the data-point accent.

// Underwater cyan point-light DELETED 2026-05-25 (per spec §4.3 + §8.1
// step 3). The previous `UNDERWATER_GLOW_*` constants + `<pointLight>` at
// (0, -1, 0.5) intensity 0.7 was the 5th cyan moment in the scene. With
// it gone the warm key + cool rim do the real cinematographic work on the
// water surface (the water material's metalness 0.6 + roughness 0.35
// already produces a strong specular response from the warm key — the
// cyan point-light was washing that out).

// Animation durations are MODULE-CONST per RG-C5 — no streak-derived
// values. FISH_JUMP_DURATION_MS lives next to its consumer in
// OoFisher3DFish; the local LURE_DROP_DURATION_MS is currently unused
// but kept for future cast-cycle polish.
const LURE_DROP_DURATION_MS = 700
void LURE_DROP_DURATION_MS

// ─── Public props ─────────────────────────────────────────────────────────

export type CanvasPhase =
  | 'lobby'
  | 'bet-entry'
  | 'casting'
  | 'line-out'
  | 'fish-on'
  | 'reeling'
  | 'caught'
  | 'missed'
  | 'between-casts'
  | 'trip-settled'
  | 'upgrade-modal'

export interface OoFisher3DSceneProps {
  readonly phase: CanvasPhase
  readonly castPower: number
  readonly currentDepth: DepthTier | null
  readonly recentCatchRarity: FishRarity | null
  readonly loadout: {
    readonly rod: GearTier
    readonly boat: GearTier
    readonly bait: GearTier
  }
  readonly reducedMotion: boolean
  readonly tripCatchCount: number
  readonly castsRemaining: number
  /**
   * Currently targeted hex tile index (0-based, into the hex grid). Null
   * means no tile is highlighted (player hasn't picked yet, or we're
   * outside the casting sub-phase). The scene paints this tile red.
   */
  readonly targetTileIndex: number | null
  /** Callback when the player clicks a hex tile. */
  readonly onTileClick: (index: number) => void
  /**
   * Tim 2026-05-24 OO-FISHER L3 (direct-manipulation cast):
   * pointerDown handler — fires when the player taps a hex AND holds.
   * The provider starts ramping cast power. Index = the targeted hex.
   * Optional so the 2D fallback canvas can omit it.
   */
  readonly onHexPointerDown?: (index: number) => void
  /**
   * Tim 2026-05-24 OO-FISHER L3: pointerUp handler — fires when the
   * player releases. Triggers the launch if power > min threshold. The
   * provider's launchCast() reads the current cast power.
   */
  readonly onHexPointerUp?: (index: number) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function tierToBoatSize(tier: GearTier): { hullLength: number; hullWidth: number } {
  // Bigger boats for higher tiers — subtle visual GRIND payoff.
  switch (tier) {
    case 'bronze':
      return { hullLength: 1.4, hullWidth: 0.7 }
    case 'silver':
      return { hullLength: 1.55, hullWidth: 0.78 }
    case 'gold':
      return { hullLength: 1.7, hullWidth: 0.86 }
    case 'platinum':
      return { hullLength: 1.85, hullWidth: 0.94 }
    case 'mythic':
      return { hullLength: 2.05, hullWidth: 1.02 }
  }
}

// ─── Sunny-day sky shader background ─────────────────────────────────────

/**
 * Custom shader gradient: top = clear-blue, mid = blue-white, bottom =
 * white-haze. Sun glow added as a soft radial mask in the top-right
 * quadrant. Cheaper than the drei <Sky> (which is a full atmospheric
 * scattering shader). Tim 2026-05-26 sunny-day revision retargets the
 * uniforms (SKY_TOP/SKY_MID/SKY_LOW) from the original golden-hour palette
 * to bright midday. Cohesion review 2026-05-26 Note 2 fix: function name +
 * GLSL inline comment updated to match the current intent.
 */
function SunnySky(): ReactElement {
  const meshRef = useRef<THREE.Mesh>(null)

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(SKY_TOP) },
        midColor: { value: new THREE.Color(SKY_MID) },
        lowColor: { value: new THREE.Color(SKY_LOW) },
        sunColor: { value: new THREE.Color(SUN_COLOR) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 lowColor;
        uniform vec3 sunColor;
        varying vec2 vUv;
        void main() {
          float t = vUv.y;
          // Three-stop BRIGHT MIDDAY gradient: top=clear-blue, mid=blue-white,
          // low=white-haze. The mid band is widened (0.0..0.65) so the lighter
          // blue dominates the visible sky region behind the mountains. Sunny
          // daylight register per Tim 2026-05-26 — replaces prior golden-hour
          // palette while keeping the same shader structure.
          vec3 col = mix(lowColor, midColor, smoothstep(0.0, 0.65, t));
          col = mix(col, topColor, smoothstep(0.7, 1.0, t));
          // Sun radial glow — lowered toward horizon (uv 0.62) and biased
          // right of center (uv 0.72) so the sun sits behind the right-side
          // mountains. Larger + warmer glow than before.
          vec2 sunPos = vec2(0.72, 0.55);
          float dist = distance(vUv, sunPos);
          // Wider soft halo (exp falloff 5.5 vs prior 7.5 → larger).
          float halo = exp(-dist * 5.5);
          col += sunColor * halo * 0.7;
          // Mid corona — a second softer wash that bleeds into the orange band.
          float corona = exp(-dist * 2.0);
          col += vec3(1.0, 0.85, 0.55) * corona * 0.18;
          // Sun core (tight cream dot).
          float core = exp(-dist * 55.0);
          col += sunColor * core * 1.0;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    })
  }, [])

  return (
    <mesh ref={meshRef} material={material} renderOrder={-1}>
      <sphereGeometry args={[60, 32, 16]} />
    </mesh>
  )
}

// ─── Hex water grid (InstancedMesh) ──────────────────────────────────────

interface HexGridProps {
  readonly tiles: ReadonlyArray<HexTileData>
  readonly targetTileIndex: number | null
  readonly onTileClick: (index: number) => void
  readonly reducedMotion: boolean
  /**
   * Tim 2026-05-24 OO-FISHER L3: live cast power (0-100). Drives the
   * power-halo ring rendered around the targeted hex while the player
   * holds. 0 = no halo; 100 = full-radius cyan ring.
   */
  readonly castPower: number
  readonly phase: CanvasPhase
  /** L3: pointerDown handler — start charging cast on this hex. */
  readonly onHexPointerDown?: (index: number) => void
  /** L3: pointerUp handler — release / launch. */
  readonly onHexPointerUp?: (index: number) => void
}

/**
 * Helper: lighten a 24-bit hex color by `factor` (0..1). Used to produce the
 * beveled-rim tone for each tile (slightly brighter than the body).
 */
function lightenHex(hex: number, factor: number): number {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  const lr = Math.min(255, Math.round(r + (255 - r) * factor))
  const lg = Math.min(255, Math.round(g + (255 - g) * factor))
  const lb = Math.min(255, Math.round(b + (255 - b) * factor))
  return (lr << 16) | (lg << 8) | lb
}

/**
 * Helper: atmospheric perspective tint. Distant tiles (higher negative Z)
 * fade slightly toward the mountain-haze color so the player reads depth
 * down the river. `tileZ` is the tile's world-Z; the function returns a
 * blend factor (0 = no fade, 1 = full fade).
 */
const HAZE_COLOR = 0x4a5d72 // Mountain-tinted blue-gray.
const HAZE_NEAR_Z = 1.2 // Tiles in front of this Z get NO fade.
const HAZE_FAR_Z = -3.6 // Tiles behind this Z get FULL fade.
const HAZE_MAX_STRENGTH = 0.42 // Cap so distant tiles still read as water.

function applyDistanceHaze(baseHex: number, tileZ: number): number {
  // Normalize Z into 0..1 across the near→far range.
  const norm = Math.max(
    0,
    Math.min(1, (HAZE_NEAR_Z - tileZ) / (HAZE_NEAR_Z - HAZE_FAR_Z)),
  )
  const strength = norm * HAZE_MAX_STRENGTH
  const br = (baseHex >> 16) & 0xff
  const bg = (baseHex >> 8) & 0xff
  const bb = baseHex & 0xff
  const hr = (HAZE_COLOR >> 16) & 0xff
  const hg = (HAZE_COLOR >> 8) & 0xff
  const hb = HAZE_COLOR & 0xff
  const r = Math.round(br + (hr - br) * strength)
  const g = Math.round(bg + (hg - bg) * strength)
  const b = Math.round(bb + (hb - bb) * strength)
  return (r << 16) | (g << 8) | b
}

function HexGrid({
  tiles,
  targetTileIndex,
  onTileClick,
  reducedMotion,
  castPower,
  phase,
  onHexPointerDown,
  onHexPointerUp,
}: HexGridProps): ReactElement {
  // Body mesh (the hex prism). Beveled-rim mesh sits as a sibling on top.
  const bodyMeshRef = useRef<THREE.InstancedMesh>(null)
  const rimMeshRef = useRef<THREE.InstancedMesh>(null)
  const dummyObject = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  // Hex prism body — 6-sided cylinder. Slightly TALLER (0.18 vs 0.15) so
  // the beveled top rim sits cleanly above the body without z-fighting.
  const bodyGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(HEX_SIZE, HEX_SIZE, 0.18, 6, 1)
    geo.rotateY(Math.PI / 6) // Rotate so flats face north-south.
    return geo
  }, [])

  // Beveled top rim — a thin, slightly-INSET hex disc that sits on the
  // body's top face. Reads as a voxel-style lit top in low-poly art.
  // The rim is INSIDE the body footprint (0.92 × HEX_SIZE) so it never
  // overlaps the adjacent tile — critical for the clean tessellation.
  const rimGeometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(
      HEX_SIZE * 0.92, // Inset top — beveled-inward (no neighbor overlap).
      HEX_SIZE * 0.92,
      0.04,
      6,
      1,
    )
    geo.rotateY(Math.PI / 6)
    return geo
  }, [])

  // Tim 2026-05-24 HEX-WATER revision: the tile materials now read as
  // glassy water surface, not stone pavers.
  //   - HIGHER metalness (0.35 vs 0.10) → specular highlights that look
  //     like sun catching wet water rather than matte rock
  //   - LOWER roughness (0.42 vs 0.65) → smoother specular response,
  //     reflective like a calm river surface
  //   - Cyan EMISSIVE bias (low-intensity #003848) → subtle Swoobz-brand
  //     undertint so the water has the "lit-from-within" glow that says
  //     "river surface" instead of "tile". RG-C5 SAFE: emissive intensity
  //     is module-const, NOT state-driven.
  //   - LOWER opacity (0.82) → the continuous water plane underneath
  //     bleeds through, breaking up the hex grid into a more organic
  //     "water with subtle hex caustics" look.
  const bodyMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      vertexColors: false,
      flatShading: true,
      metalness: 0.35,
      roughness: 0.42,
      transparent: true,
      opacity: 0.82,
      // Tempered far down (was 0.35): the cyan self-glow across all 81 tiles
      // washed the warm brass/wood register cool. Water stays cool, doesn't
      // dominate. (artotty register fix.)
      emissive: new THREE.Color(0x00303c),
      emissiveIntensity: 0.12,
    })
  }, [])

  // Rim: brighter cyan highlight that reads as wet specular edge. Higher
  // emissive than the body so the rim catches the eye as a water-crest
  // glint along the hex boundary (like sun on wave tops).
  const rimMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      vertexColors: false,
      flatShading: true,
      metalness: 0.5,
      roughness: 0.28,
      transparent: true,
      opacity: 0.7,
      // Tempered (was 0.55) to match the body — a quiet wet-crest glint, not a
      // cyan wash. (artotty register fix.)
      emissive: new THREE.Color(0x00485a),
      emissiveIntensity: 0.22,
    })
  }, [])

  // Initial placement — runs once per tile-array change. Both meshes share
  // the same matrix per instance; the rim is rendered with a slight Y
  // offset baked into the matrix.
  useEffect(() => {
    const body = bodyMeshRef.current
    const rim = rimMeshRef.current
    if (body === null || rim === null) return
    for (let i = 0; i < tiles.length; i += 1) {
      const tile = tiles[i]
      if (tile === undefined) continue
      // BODY matrix — sits at WATER_LEVEL + heightOffset.
      dummyObject.position.set(tile.x, WATER_LEVEL + tile.heightOffset, tile.z)
      dummyObject.rotation.set(0, 0, 0)
      dummyObject.updateMatrix()
      body.setMatrixAt(i, dummyObject.matrix)

      // RIM matrix — sits 0.10 units above the body top so the rim disc is
      // perched on the top face (body height is 0.18 → top face at +0.09,
      // rim half-height is 0.02 → rim center at +0.11 over body center).
      dummyObject.position.set(
        tile.x,
        WATER_LEVEL + tile.heightOffset + 0.11,
        tile.z,
      )
      dummyObject.updateMatrix()
      rim.setMatrixAt(i, dummyObject.matrix)

      // Per-instance color — apply atmospheric haze based on tile Z so
      // tiles further from the camera fade toward the mountain palette.
      const baseColor = applyDistanceHaze(
        TILE_COLOR_BY_TIER[tile.depthTier],
        tile.z,
      )
      color.setHex(baseColor)
      body.setColorAt(i, color)

      // Rim is the BODY color lightened by 35% — gives the beveled-voxel
      // look. The rim ALSO gets atmospheric haze so distant rims fade.
      color.setHex(lightenHex(baseColor, 0.35))
      rim.setColorAt(i, color)
    }
    body.instanceMatrix.needsUpdate = true
    rim.instanceMatrix.needsUpdate = true
    if (body.instanceColor !== null) body.instanceColor.needsUpdate = true
    if (rim.instanceColor !== null) rim.instanceColor.needsUpdate = true
  }, [tiles, dummyObject, color])

  // Recolor the highlighted tile per render (cheap; no per-frame work).
  // The highlight applies to BOTH body + rim (rim is the lighter shade).
  useEffect(() => {
    const body = bodyMeshRef.current
    const rim = rimMeshRef.current
    if (body === null || rim === null) return
    for (let i = 0; i < tiles.length; i += 1) {
      const tile = tiles[i]
      if (tile === undefined) continue
      if (targetTileIndex === i) {
        // Highlighted tile: don't haze-fade, render full red.
        color.setHex(TILE_HIGHLIGHT_COLOR)
        body.setColorAt(i, color)
        color.setHex(lightenHex(TILE_HIGHLIGHT_COLOR, 0.3))
        rim.setColorAt(i, color)
      } else {
        const hazed = applyDistanceHaze(
          TILE_COLOR_BY_TIER[tile.depthTier],
          tile.z,
        )
        color.setHex(hazed)
        body.setColorAt(i, color)
        color.setHex(lightenHex(hazed, 0.35))
        rim.setColorAt(i, color)
      }
    }
    if (body.instanceColor !== null) body.instanceColor.needsUpdate = true
    if (rim.instanceColor !== null) rim.instanceColor.needsUpdate = true
  }, [targetTileIndex, tiles, color])

  // Upstream-to-camera wave animation. The wave PROPAGATES from upstream
  // (negative Z, far) toward camera (positive Z, near), reinforcing the
  // "river is flowing past you" composition cue (Tim 2026-05-24).
  //
  // Formula: y_offset = WAVE_AMPLITUDE * sin(t * WAVE_SPEED + tile.z * WAVE_FREQ)
  // - t * WAVE_SPEED  → time term (positive → phase advances)
  // - tile.z * WAVE_FREQ → spatial term in Z
  // - Sign of (tile.z * WAVE_FREQ) is POSITIVE for near tiles, NEGATIVE
  //   for far tiles. Adding a positive time term to a near-tile positive
  //   phase means the near tile's wave LEADS the far tile's wave →
  //   visually the crest appears to roll from far (upstream) toward near
  //   (downstream / camera). This is the upstream-flow cue.
  //
  // RG-C5: all three wave parameters are MODULE-CONST. No streak / win
  // count / progression value can bleed into wave amplitude or speed.
  useFrame((state) => {
    if (reducedMotion) return
    const body = bodyMeshRef.current
    const rim = rimMeshRef.current
    if (body === null || rim === null) return
    const t = state.clock.getElapsedTime()
    for (let i = 0; i < tiles.length; i += 1) {
      const tile = tiles[i]
      if (tile === undefined) continue
      // Primary upstream wave — rolls toward camera.
      const primary = Math.sin(
        t * WAVE_SPEED + tile.z * WAVE_FREQ + tile.x * WAVE_LATERAL_FREQ,
      )
      // Secondary tiny chop — half-amplitude, faster, perpendicular feel.
      const chop = Math.sin(t * 1.7 + tile.x * 0.4 + tile.row * 0.33) * 0.3
      const wave = (primary + chop * 0.35) * WAVE_AMPLITUDE
      const baseY = WATER_LEVEL + tile.heightOffset + wave
      // BODY
      dummyObject.position.set(tile.x, baseY, tile.z)
      dummyObject.rotation.set(0, 0, 0)
      dummyObject.updateMatrix()
      body.setMatrixAt(i, dummyObject.matrix)
      // RIM (always sits +0.11 above body)
      dummyObject.position.set(tile.x, baseY + 0.11, tile.z)
      dummyObject.updateMatrix()
      rim.setMatrixAt(i, dummyObject.matrix)
    }
    body.instanceMatrix.needsUpdate = true
    rim.instanceMatrix.needsUpdate = true
  })

  // Click handler — three.js fires `instanceId` on the event for instanced
  // meshes. We forward it to the controller via the prop callback. Both
  // body + rim accept clicks; the body is the primary hit region.
  const handleClick = (event: ThreeEvent<MouseEvent>): void => {
    event.stopPropagation()
    const id = event.instanceId
    if (id === undefined) return
    onTileClick(id)
  }

  // Tim 2026-05-24 OO-FISHER L3 — direct-manipulation cast.
  // pointerDown on a hex: select it as target + start charging cast.
  // pointerUp anywhere: release / launch. Both events stop propagation
  // so the camera/scene doesn't receive them.
  //
  // FIX 2026-05-26 (P0 TAP-AND-HOLD): the phase guard previously only
  // allowed `phase === 'casting'`. The player taps during `between-casts`
  // which is the natural tap-and-hold entry point — `startHexCharge`
  // internally transitions to 'casting' (see ooFisherProvider line 927).
  // Blocking the call here meant the charge never started from tile taps.
  // Now we fire `onHexPointerDown` for both 'casting' AND 'between-casts'.
  // The provider's internal guard (`sub.kind !== 'casting' && sub.kind !== 'between-casts'`)
  // handles any illegal phase transitions defensively.
  const handlePointerDown = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation()
    const id = event.instanceId
    if (id === undefined) return
    onTileClick(id)
    if (
      onHexPointerDown !== undefined &&
      (phase === 'casting' || phase === 'between-casts')
    ) {
      onHexPointerDown(id)
    }
  }

  const handlePointerUp = (event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation()
    const id = event.instanceId
    if (
      onHexPointerUp !== undefined &&
      (phase === 'casting' || phase === 'between-casts')
    ) {
      onHexPointerUp(id ?? targetTileIndex ?? 0)
    }
  }

  // ─── Power halo (L3) — cyan ring around the targeted hex that grows
  //     with cast power. Sits 0.18 above the tile so it floats just above
  //     the rim. Radius scales with castPower / 100. Opacity also scales
  //     so the halo emerges smoothly from invisible to visible.
  //     RG-C5 SAFE: power is a true per-event physical signal, NOT a
  //     streak/session value. Module-const halo color (cyan brand). */
  const haloTile = useMemo<HexTileData | null>(() => {
    if (targetTileIndex === null) return null
    return tiles[targetTileIndex] ?? null
  }, [tiles, targetTileIndex])
  const haloVisible = phase === 'casting' && castPower > 0 && haloTile !== null
  const haloScale = 1 + (castPower / 100) * 1.8 // 1.0 → 2.8 ring
  const haloOpacity = Math.min(0.65, 0.15 + castPower / 200) // 0.15 → 0.65

  return (
    <>
      <instancedMesh
        ref={bodyMeshRef}
        args={[bodyGeometry, bodyMaterial, tiles.length]}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        castShadow={false}
        receiveShadow
      />
      <instancedMesh
        ref={rimMeshRef}
        args={[rimGeometry, rimMaterial, tiles.length]}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        castShadow={false}
        receiveShadow
      />
      {haloVisible && haloTile !== null ? (
        // Power halo: ring geometry around the targeted tile. Rotated to
        // lie flat on water surface (XZ plane). The ring grows + brightens
        // as the player charges, giving direct visual feedback on the
        // active tile. data-testid not applicable to three.js meshes.
        <mesh
          position={[haloTile.x, WATER_LEVEL + 0.18, haloTile.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[haloScale, haloScale, 1]}
        >
          <ringGeometry args={[HEX_SIZE * 0.95, HEX_SIZE * 1.15, 24]} />
          <meshBasicMaterial
            color="#00f0ff"
            transparent
            opacity={haloOpacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
    </>
  )
}

// ─── Rod-band cast-power gauge (Tim 2026-05-25 brass-fitted HUD) ────────
//
// The IN-SCENE replacement for the floating BoatPowerGauge billboard
// plate. A brushed-brass band wraps the rod shaft at a fixed position
// along its length; an inner cylinder rendered in cyan fills from 0..1
// scale.y with cast power. Only visible during `casting` phase.
//
// Per DLv2 §1 P8 cyan economy: this is Job 2 — the leading-anchor outer
// ring (the "what the player is currently doing" anchor). The cyan fill
// is the ONLY emissive cyan element on the boat in the new register.
//
// Geometry: a brass cylinder + an inset cyan cylinder. The cyan inner
// uses scale.y driven by castPower (0..1). Both share the rod's local
// transform so they tilt with the rod and rock with the boat.
//
// RG-C5 STRUCTURAL: only `castPower` (a per-event physical signal) drives
// the inner cylinder scale. NO streak / multiplier / session value can
// scale it. The brass band geometry is module-const.

interface RodPowerBandProps {
  readonly phase: CanvasPhase
  readonly castPower: number
}

const ROD_BAND_RADIUS = 0.028
const ROD_BAND_HEIGHT = 0.22
// Position on the rod shaft (the rod shaft is centered at y=0.25, z=-0.38,
// rotated -π/2.4). The band sits 0.05 below the rod-tip end, along the
// rod's local Y axis, which translates to world (0, 0.43, -0.62) before
// the rod's parent transform.
const ROD_BAND_LOCAL_Y = 0.43
const ROD_BAND_LOCAL_Z = -0.62

function RodPowerBand({ phase, castPower }: RodPowerBandProps): ReactElement | null {
  const fillRef = useRef<THREE.Mesh>(null)

  // Reusable: avoid per-frame allocation.
  useEffect(() => {
    // Initial scale.y from castPower so the band reads correctly on first
    // render of the casting phase.
    if (fillRef.current === null) return
    const ratio = Math.max(0, Math.min(1, castPower / 100))
    fillRef.current.scale.set(1, ratio < 0.001 ? 0.001 : ratio, 1)
    fillRef.current.position.set(0, -ROD_BAND_HEIGHT / 2 + (ROD_BAND_HEIGHT * ratio) / 2, 0)
  }, [castPower])

  // The band's parent transform matches the rod shaft tilt. Rotate the
  // band about its local Z so it wraps the rod (the rod shaft's
  // cylinderGeometry is along Y, so a cylinder rotated 0 is correctly
  // wrapping the same axis).
  if (phase !== 'casting' && phase !== 'line-out') return null

  // The fill is positioned + scaled inside the brass band. We size the
  // cyan inner cylinder slightly smaller than the brass band, then scale
  // its Y to grow from the bottom up.
  const ratio = Math.max(0, Math.min(1, castPower / 100))
  const fillY = -ROD_BAND_HEIGHT / 2 + (ROD_BAND_HEIGHT * ratio) / 2

  return (
    <group position={[0, ROD_BAND_LOCAL_Y, ROD_BAND_LOCAL_Z]} rotation={[-Math.PI / 2.4, 0, 0]}>
      {/* Tim 2026-05-26 "ONE theme" cohesion fix: the rod-band on a cedar
          rod was a cool-steel outer + cyan fill, which read as a
          cool-island on the warm boat. Migrated to brushed brass outer +
          ember-glow fill — the gauge now reads as a tension-glow on a
          fishing rod, not a sci-fi power meter. The brass band is the
          metal-fitting on the rod; the ember inside is the building
          tension. RG-C5 STRUCTURAL: only `castPower` drives the inner
          scale; band geometry is module-const. */}
      <mesh>
        <cylinderGeometry args={[ROD_BAND_RADIUS, ROD_BAND_RADIUS, ROD_BAND_HEIGHT, 12]} />
        <meshStandardMaterial
          color="#b8895c"
          metalness={0.85}
          roughness={0.22}
          flatShading
        />
      </mesh>
      {/* Ember-glow fill — wood-theme cohesion. Scales Y from 0..1 with
          castPower. Emissive intensity is module-const (RG-C5). */}
      <mesh
        ref={fillRef}
        position={[0, fillY, 0]}
        scale={[1, ratio < 0.001 ? 0.001 : ratio, 1]}
      >
        <cylinderGeometry args={[ROD_BAND_RADIUS * 0.78, ROD_BAND_RADIUS * 0.78, ROD_BAND_HEIGHT, 12]} />
        <meshStandardMaterial
          color="#ffba6e"
          emissive="#ffba6e"
          emissiveIntensity={0.85}
          roughness={0.45}
          flatShading
        />
      </mesh>
    </group>
  )
}

// ─── Cabin-door HUD plaques (Tim 2026-05-25 brass-fitted HUD) ────────────
//
// Two brass-rim walnut plaques mounted on the cabin door / cabin wall.
// Left plaque = WAGER (static brass numerals, brand-cohesive). Right
// plaque = CATCHES REMAINING (cyan numerals — DLv2 cyan-economy Job 4).
//
// Each plaque is a layered composition: walnut frame (outer box) +
// brushed-brass border (slightly inset, slightly forward) + dark velvet
// inset (further forward, the recess inside the brass border). The
// numerals are rendered as additional small boxes in brass / cyan
// (low-poly, no @react-three/drei Text dependency required — keeps the
// build hermetic and the bundle small).
//
// Per BRAND_KIT §5.2 Tactile Futurism: matte walnut body + polished brass
// border + recessed velvet = the Cartier/Filson register. The plaques
// read as engraved nameplates on the boat, NOT as floating overlay UI.

interface CabinDoorPlaquesProps {
  readonly hullLength: number
  readonly hullWidth: number
  readonly wagerUsdc: number
  readonly castsRemaining: number
}

// Module-const plaque geometry (RG-C5: no streak-derived scaling).
const PLAQUE_WIDTH = 0.34
const PLAQUE_HEIGHT = 0.2
const PLAQUE_DEPTH = 0.012
const PLAQUE_BORDER_INSET = 0.022
const PLAQUE_INSET_DEPTH = 0.004

function CabinDoorPlaque({
  position,
  numeralAccent,
  digits,
}: {
  readonly position: readonly [number, number, number]
  readonly numeralAccent: string
  readonly digits: readonly number[]
}): ReactElement {
  return (
    <group position={position as [number, number, number]}>
      {/* Walnut frame (outermost layer). */}
      <mesh>
        <boxGeometry args={[PLAQUE_WIDTH, PLAQUE_HEIGHT, PLAQUE_DEPTH]} />
        <meshStandardMaterial color={PLAQUE_WALNUT_COLOR} roughness={0.55} flatShading />
      </mesh>
      {/* 2026-05-25 warm+cyan substitution: plaque rim swapped from brass
          to cool steel `#7A8590`. The right plaque carries cyan numerals
          (cyan-economy Job 4); cool-steel rim ensures the cyan no longer
          touches a warm metal frame on the same plaque surface. */}
      <mesh position={[0, 0, PLAQUE_DEPTH * 0.51]}>
        <boxGeometry
          args={[
            PLAQUE_WIDTH - PLAQUE_BORDER_INSET,
            PLAQUE_HEIGHT - PLAQUE_BORDER_INSET,
            PLAQUE_DEPTH * 0.4,
          ]}
        />
        <meshStandardMaterial
          color="#7A8590"
          metalness={0.85}
          roughness={0.2}
          flatShading
        />
      </mesh>
      {/* Dark velvet inset (the recess inside the brass border). */}
      <mesh position={[0, 0, PLAQUE_DEPTH * 0.72]}>
        <boxGeometry
          args={[
            PLAQUE_WIDTH - PLAQUE_BORDER_INSET * 2,
            PLAQUE_HEIGHT - PLAQUE_BORDER_INSET * 2,
            PLAQUE_INSET_DEPTH,
          ]}
        />
        <meshStandardMaterial color={PLAQUE_INSET_COLOR} roughness={0.85} flatShading />
      </mesh>
      {/* Numeral indicator — a small horizontal bar of cells representing
          digits. Each digit is a small lit box; brass or cyan tinted per
          the plaque's accent role. Low-poly readable from aerial POV. */}
      {digits.map((digit, index) => {
        const total = digits.length
        const cellWidth = (PLAQUE_WIDTH - PLAQUE_BORDER_INSET * 2.5) / Math.max(total, 1)
        const cellHeight = (PLAQUE_HEIGHT - PLAQUE_BORDER_INSET * 2.5) * 0.55
        const startX = -((cellWidth * (total - 1)) / 2)
        const x = startX + index * cellWidth
        // Each digit's "fill height" represents the digit value (0..9)
        // as a fraction. Reads as a small bar chart of the number — a
        // tactile-instrument register that matches the brass-plaque
        // aesthetic without needing TTF font loading.
        const fillRatio = Math.max(0.1, Math.min(1, digit / 9))
        return (
          <mesh
            key={index}
            position={[
              x,
              -cellHeight / 2 + (cellHeight * fillRatio) / 2,
              PLAQUE_DEPTH * 0.92,
            ]}
            scale={[1, fillRatio, 1]}
          >
            <boxGeometry args={[cellWidth * 0.62, cellHeight, PLAQUE_INSET_DEPTH * 0.5]} />
            <meshStandardMaterial
              color={numeralAccent}
              emissive={numeralAccent === PLAQUE_NUMERAL_CYAN ? '#003a44' : '#000000'}
              emissiveIntensity={numeralAccent === PLAQUE_NUMERAL_CYAN ? 0.25 : 0}
              roughness={0.4}
              flatShading
            />
          </mesh>
        )
      })}
    </group>
  )
}

function CabinDoorPlaques({
  hullLength,
  hullWidth,
  wagerUsdc,
  castsRemaining,
}: CabinDoorPlaquesProps): ReactElement {
  // Encode the wager + casts as readable digit arrays.
  // Wager: round to integer USDC, take up to 4 digits (0..9999).
  // Casts: 0..99 (2 digits).
  const wagerDigits = useMemo(() => {
    const v = Math.max(0, Math.min(9999, Math.floor(wagerUsdc)))
    const str = v.toString().padStart(2, '0')
    return Array.from(str, (c) => Number.parseInt(c, 10))
  }, [wagerUsdc])

  const castsDigits = useMemo(() => {
    const v = Math.max(0, Math.min(99, Math.floor(castsRemaining)))
    const str = v.toString().padStart(2, '0')
    return Array.from(str, (c) => Number.parseInt(c, 10))
  }, [castsRemaining])

  // Plaque mounting positions: on the cabin door / front-facing cabin
  // wall. The cabin sits at hullLength * 0.22 (its center) and its
  // front face is at hullLength * 0.22 - hullLength * 0.15 (the window
  // surface). The plaques mount on the LEFT and RIGHT of the window,
  // facing the same direction (-Z, toward the camera-facing cabin
  // front). Slightly forward of the window so they don't z-fight.
  const cabinFrontZ = hullLength * 0.22 - hullLength * 0.15 - 0.025
  const plaqueY = 0.25
  const plaqueX = hullWidth * 0.42

  return (
    <group>
      {/* LEFT plaque: WAGER (brass numerals — static brand-cohesive). */}
      <CabinDoorPlaque
        position={[-plaqueX, plaqueY, cabinFrontZ]}
        numeralAccent={PLAQUE_NUMERAL_BRASS}
        digits={wagerDigits}
      />
      {/* RIGHT plaque: CATCHES REMAINING (cyan numerals — DLv2
          cyan-economy Job 4 the data-point accent). */}
      <CabinDoorPlaque
        position={[plaqueX, plaqueY, cabinFrontZ]}
        numeralAccent={PLAQUE_NUMERAL_CYAN}
        digits={castsDigits}
      />
    </group>
  )
}

// ─── Voxel low-poly boat ─────────────────────────────────────────────────

interface BoatProps {
  readonly loadout: OoFisher3DSceneProps['loadout']
  readonly reducedMotion: boolean
  readonly targetTile: HexTileData | null
  /**
   * Tim 2026-05-24 OO-FISHER L2: rod-tip marker ref. The boat sets this to
   * a THREE.Object3D parented to the rod tip in BOAT-LOCAL coordinates. The
   * CastLine reads this every frame via getWorldPosition() so the line ALWAYS
   * starts at the actual rod tip — even as the boat rocks ±2° and the rod
   * yaws toward the target tile. Without this, the line floats detached
   * from the rod (Tim playtest 2026-05-24: "the rod and the line are
   * distached and not working together").
   */
  readonly rodTipRef?: React.MutableRefObject<THREE.Object3D | null>
  /**
   * Tim 2026-05-25 BRASS-FITTED revision: the boat now hosts the in-scene
   * HUD plaques (left = wager, right = catches remaining) AND the rod-band
   * cast-power gauge. These need the current phase + cast power to render
   * the correct state. Passed through from the OoFisher3DScene parent.
   * Optional so the existing boat invocations don't break in tests.
   */
  readonly phase?: CanvasPhase
  readonly castPower?: number
  readonly wagerUsdc?: number
  readonly castsRemaining?: number
}

// Boat-rotation tween duration — module-const per RG-C5.
// 220ms per the brief: smooth but not rubbery (snap register).
const BOAT_ROTATION_TWEEN_MS = 220

function VoxelBoat({
  loadout,
  reducedMotion,
  targetTile,
  rodTipRef,
  phase = 'lobby',
  castPower = 0,
  wagerUsdc = 0,
  castsRemaining = 0,
}: BoatProps): ReactElement {
  const groupRef = useRef<THREE.Group>(null)
  const rodRef = useRef<THREE.Group>(null)
  const localRodTipRef = useRef<THREE.Object3D>(null)
  const { hullLength, hullWidth } = useMemo(() => tierToBoatSize(loadout.boat), [loadout.boat])

  // Boat-hull rotation tween toward the targeted hex (FIX 2026-05-26).
  // The hull group rotates to face the target tile over 220ms.
  // targetYawRef = desired yaw angle; currentYawRef = current animated yaw.
  // Both in radians. RG-C5 SAFE: constant speed, never scaled by session state.
  const targetYawRef = useRef(0)
  const currentYawRef = useRef(0)
  const tweenStartRef = useRef<number | null>(null)
  const tweenFromRef = useRef(0)

  // Expose the rod-tip object to the parent (the CastLine reads it per
  // frame). Effect runs once on mount since the local ref is stable.
  useEffect(() => {
    if (rodTipRef !== undefined) {
      rodTipRef.current = localRodTipRef.current
    }
    return () => {
      if (rodTipRef !== undefined) {
        rodTipRef.current = null
      }
    }
  }, [rodTipRef])

  // Gentle rock animation: roll axis (Z) sinusoid. The boat sits in the
  // FOREGROUND (BOAT_FOREGROUND_Z) so the camera looks DOWN-stream from
  // behind/over it. The rocking also follows the upstream wave at the
  // boat's tile position so the boat reads as actually riding the water.
  //
  // Tim 2026-05-26 BOAT ROTATION: hull-yaw tween integrated here.
  // Uses ease-out cubic (1 - (1-t)^3) over BOAT_ROTATION_TWEEN_MS — matches
  // cubic-bezier(0.4, 0, 0.2, 1) snap feel per BRAND_KIT §6. RG-C5 SAFE:
  // module-const duration, not session-scaled.
  useFrame((state) => {
    if (groupRef.current === null) return
    const t = state.clock.getElapsedTime()

    // Hull-yaw tween (boat rotation toward target tile).
    if (tweenStartRef.current !== null) {
      const elapsed = performance.now() - tweenStartRef.current
      const rawT = Math.min(1, elapsed / BOAT_ROTATION_TWEEN_MS)
      // Ease-out cubic: matches cubic-bezier(0.4, 0, 0.2, 1).
      const easedT = 1 - Math.pow(1 - rawT, 3)
      const newYaw = tweenFromRef.current + (targetYawRef.current - tweenFromRef.current) * easedT
      currentYawRef.current = newYaw
      groupRef.current.rotation.y = newYaw
      if (rawT >= 1) tweenStartRef.current = null
    }

    if (reducedMotion) return
    const rockPhase = (t / BOAT_ROCK_PERIOD_S) * Math.PI * 2
    const rollRad = Math.sin(rockPhase) * (BOAT_ROCK_AMPLITUDE_DEG * (Math.PI / 180))
    groupRef.current.rotation.z = rollRad
    // Y bob: combine the boat-rock cycle AND the same upstream wave that
    // drives the tiles directly under the boat. This keeps the boat
    // visually anchored to the water surface as the wave passes through.
    const wave =
      Math.sin(
        t * WAVE_SPEED + BOAT_FOREGROUND_Z * WAVE_FREQ,
      ) * WAVE_AMPLITUDE
    groupRef.current.position.y =
      WATER_LEVEL + BOAT_FOREGROUND_Y_OFFSET + Math.sin(rockPhase + 0.3) * 0.025 + wave * 0.7
  })

  // Rod orientation: point toward the targeted hex tile (if any). The rod
  // base sits at boat-local Z = -hullLength × 0.45 (the bow rail), and
  // the boat sits at world Z = BOAT_FOREGROUND_Z. The rod's local -Z is
  // "forward" (downstream / away from camera). Yaw is computed so the
  // rod faces the target tile from the rod-base position.
  //
  // Tim 2026-05-26 BOAT ROTATION FIX: hull group also rotates to face the
  // target tile. The rod yaw is applied instantly (per-effect); the HULL
  // rotation is tweened at 220ms via the useFrame loop below.
  // Deflection capped at ±30° (0.523 rad) per brief: "if boat rotation
  // breaks camera framing, scope down to ±30° max deflection from bow-forward."
  const MAX_HULL_YAW_RAD = Math.PI / 6 // 30°
  useEffect(() => {
    if (rodRef.current === null) return
    if (targetTile === null) {
      // Default: rod + hull point straight downstream (rotation 0).
      rodRef.current.rotation.y = 0
      targetYawRef.current = 0
      tweenStartRef.current = performance.now()
      tweenFromRef.current = currentYawRef.current
      return
    }
    // Approximate rod base world position (Z-only): boat Z minus the
    // bow-rail offset scaled by BOAT_SCALE. For yaw we don't need pixel-
    // perfect — the player sees rod-points-toward-tile, which is enough.
    const rodBaseWorldZ = BOAT_FOREGROUND_Z - 0.45 * hullLength * BOAT_SCALE
    const dx = targetTile.x
    const dz = targetTile.z - rodBaseWorldZ
    // atan2(dx, -dz) so yaw = 0 when target is straight ahead (-Z).
    const yaw = Math.atan2(dx, -dz)
    // Rod rotates instantly (visual continuity + Fogo reference).
    rodRef.current.rotation.y = yaw
    // Hull rotates toward target, capped at ±30°.
    const clampedHullYaw = Math.max(-MAX_HULL_YAW_RAD, Math.min(MAX_HULL_YAW_RAD, yaw * 0.4))
    targetYawRef.current = clampedHullYaw
    tweenStartRef.current = performance.now()
    tweenFromRef.current = currentYawRef.current
  }, [targetTile, hullLength])

  return (
    <group
      ref={groupRef}
      // Boat is FOREGROUNDED — pulled toward camera (positive Z) and
      // scaled up so it dominates the lower-third of the frame (Tim
      // playtest 2026-05-24).
      position={[0, WATER_LEVEL + BOAT_FOREGROUND_Y_OFFSET, BOAT_FOREGROUND_Z]}
      scale={[BOAT_SCALE, BOAT_SCALE, BOAT_SCALE]}
    >
      {/* ─── HULL ─────────────────────────────────────────────────────
          Boat silhouette per Tim 2026-05-24 correction:
            - Wider at top (deck), tapered at bottom (waterline)
            - Pointed bow at the FRONT (downstream, -Z)
            - Squared stern at the BACK (upstream, +Z)
            - Built from 3 stacked pieces to create a recognizable hull
              silhouette rather than a flat slab.

          Convention: -Z is forward (downstream / bow), +Z is back (stern).
          The deck is at y=0; the keel is at y=-0.22.
      */}
      {/* Hull upper / deck-line — widest piece (where the gunwale sits).
          Tim playtest 2026-05-24 v2: brightened hull palette so the boat
          reads at the new lower camera angle. The voxel layering is
          preserved via mid+dark bands at the waterline. */}
      <mesh castShadow receiveShadow position={[0, -0.02, 0]}>
        <boxGeometry args={[hullWidth, 0.12, hullLength * 0.88]} />
        <meshStandardMaterial color={BOAT_HULL_COLOR} flatShading roughness={0.55} />
      </mesh>
      {/* Hull mid — slightly narrower (taper). Darker than the deck-line. */}
      <mesh castShadow position={[0, -0.14, 0]}>
        <boxGeometry args={[hullWidth * 0.82, 0.12, hullLength * 0.82]} />
        <meshStandardMaterial color={BOAT_HULL_MID} flatShading roughness={0.6} />
      </mesh>
      {/* Hull keel — narrowest piece at the bottom. */}
      <mesh castShadow position={[0, -0.24, 0]}>
        <boxGeometry args={[hullWidth * 0.55, 0.08, hullLength * 0.74]} />
        <meshStandardMaterial color={BOAT_HULL_DARK} flatShading roughness={0.75} />
      </mesh>
      {/* BOW — pointed front. Tim 2026-05-26 image 134 fix: the prior
          4-sided cone with a 45° Z-rotation read as a "weird pyramid"
          floating off the hull. Rebuilt as a low-wedge prow that
          integrates with the keel:
            - 3-sided cone (triangular prism) lying horizontal so the
              bow profile is a flat triangular wedge in plan view —
              reads as "pointed front" not "tetrahedron in front".
            - Pulled into the hull (z ≈ -hullLength*0.42) and lifted to
              keel height (y ≈ -0.05) so it sits flush with the hull
              underside, not jutting below it.
            - No Z-rotation — the wedge points cleanly forward (-Z). */}
      <mesh
        castShadow
        position={[0, -0.05, -hullLength * 0.42]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <coneGeometry args={[hullWidth * 0.5, hullLength * 0.28, 3]} />
        <meshStandardMaterial color={BOAT_HULL_COLOR} flatShading roughness={0.6} />
      </mesh>
      {/* STERN — squared back wall (vertical box capping the back). */}
      <mesh castShadow position={[0, -0.05, hullLength * 0.44]}>
        <boxGeometry args={[hullWidth * 0.95, 0.22, 0.06]} />
        <meshStandardMaterial color={BOAT_HULL_DARK} flatShading roughness={0.7} />
      </mesh>

      {/* ─── DECK ─────────────────────────────────────────────────────
          Deck floor — the surface the captain stands on. The deck is
          assembled from 4 horizontal "plank" strips (Tim playtest
          2026-05-24 v2 enrichment) so the voxel boat reads with deck-
          grain rather than a single flat slab. Alternating plank shades
          give the carpentry detail at the aerial camera angle. */}
      {/* Base deck slab (under-plate) */}
      <mesh receiveShadow position={[0, 0.04, 0]}>
        <boxGeometry args={[hullWidth * 0.95, 0.02, hullLength * 0.85]} />
        <meshStandardMaterial color={BOAT_DECK_PLANK_DARK} flatShading roughness={0.65} />
      </mesh>
      {/* Plank 1 — bow-most (front of deck) */}
      <mesh receiveShadow position={[0, 0.055, -hullLength * 0.28]}>
        <boxGeometry args={[hullWidth * 0.9, 0.01, hullLength * 0.18]} />
        <meshStandardMaterial color={BOAT_DECK_PLANK} flatShading roughness={0.6} />
      </mesh>
      {/* Plank 2 — mid-bow */}
      <mesh receiveShadow position={[0, 0.055, -hullLength * 0.06]}>
        <boxGeometry args={[hullWidth * 0.9, 0.01, hullLength * 0.16]} />
        <meshStandardMaterial color={BOAT_DECK_PLANK_DARK} flatShading roughness={0.6} />
      </mesh>
      {/* Plank 3 — mid-stern */}
      <mesh receiveShadow position={[0, 0.055, hullLength * 0.1]}>
        <boxGeometry args={[hullWidth * 0.9, 0.01, hullLength * 0.16]} />
        <meshStandardMaterial color={BOAT_DECK_PLANK} flatShading roughness={0.6} />
      </mesh>

      {/* ─── GUNWALE — BRUSHED BRASS rim along the deck (Tim 2026-05-25) ─
          Tim 2026-05-25 BRASS-FITTED revision: was emissive cyan
          (Star-Trek register); now non-emissive brushed brass (Filson
          register). metalness 0.8 + roughness 0.25 = polished brass that
          catches the warm key as a soft specular highlight without
          self-illuminating. */}
      <mesh position={[hullWidth * 0.47, 0.07, 0]}>
        <boxGeometry args={[0.03, 0.025, hullLength * 0.86]} />
        <meshStandardMaterial
          color={BOAT_GUNWALE_COLOR}
          metalness={0.8}
          roughness={0.25}
          flatShading
        />
      </mesh>
      <mesh position={[-hullWidth * 0.47, 0.07, 0]}>
        <boxGeometry args={[0.03, 0.025, hullLength * 0.86]} />
        <meshStandardMaterial
          color={BOAT_GUNWALE_COLOR}
          metalness={0.8}
          roughness={0.25}
          flatShading
        />
      </mesh>
      {/* Cross-stripe at the stern (closes the rim visually). */}
      <mesh position={[0, 0.07, hullLength * 0.42]}>
        <boxGeometry args={[hullWidth * 0.95, 0.025, 0.03]} />
        <meshStandardMaterial
          color={BOAT_GUNWALE_COLOR}
          metalness={0.8}
          roughness={0.25}
          flatShading
        />
      </mesh>

      {/* ─── CABIN / WHEELHOUSE ─────────────────────────────────────
          Sits in the back third of the deck. Off-white walls, warm-cream
          morning-light window (was cyan, Tim 2026-05-25 brass-fitted), and
          brushed-brass door trim. */}
      <mesh castShadow position={[0, 0.22, hullLength * 0.22]}>
        <boxGeometry args={[hullWidth * 0.55, 0.32, hullLength * 0.3]} />
        <meshStandardMaterial color={BOAT_CABIN_COLOR} flatShading roughness={0.5} />
      </mesh>
      {/* Cabin roof — slightly oversized so it overhangs the walls. */}
      <mesh position={[0, 0.4, hullLength * 0.22]}>
        <boxGeometry args={[hullWidth * 0.62, 0.04, hullLength * 0.34]} />
        <meshStandardMaterial color={BOAT_CABIN_ROOF} flatShading roughness={0.6} />
      </mesh>
      {/* Cabin window frame (slightly larger than the window, dark trim) —
          enriched detail per Tim 2026-05-24 v2 playtest. The frame reads
          as "this is a window" at the aerial camera distance. */}
      <mesh position={[0, 0.25, hullLength * 0.22 - hullLength * 0.15 - 0.002]}>
        <boxGeometry args={[hullWidth * 0.42, 0.16, 0.015]} />
        <meshStandardMaterial color={BOAT_HULL_DARK} flatShading roughness={0.55} />
      </mesh>
      {/* Cabin window (front-facing, -Z) — WARM CREAM morning-light glow.
          Tim 2026-05-25 BRASS-FITTED revision: was cyan-emissive (Star-Trek
          "control panel" read); now warm-cream emissive @ 0.15 = the
          subtle "morning light through cabin glass" read. One of the two
          allowed emissive surfaces in this scene (the rod-band cyan fill
          is the other — see RodPowerBand). */}
      <mesh
        position={[0, 0.25, hullLength * 0.22 - hullLength * 0.15 - 0.001]}
      >
        <boxGeometry args={[hullWidth * 0.36, 0.12, 0.02]} />
        <meshStandardMaterial
          color={BOAT_WINDOW_COLOR}
          emissive={BOAT_WINDOW_COLOR}
          emissiveIntensity={0.15}
          roughness={0.4}
          flatShading
        />
      </mesh>
      {/* Window cross-bar (vertical) — adds the windowpane silhouette. */}
      <mesh position={[0, 0.25, hullLength * 0.22 - hullLength * 0.15 - 0.0005]}>
        <boxGeometry args={[0.015, 0.13, 0.025]} />
        <meshStandardMaterial color={BOAT_HULL_DARK} flatShading roughness={0.55} />
      </mesh>
      {/* Door (back-facing, +Z) — cyan trim around a darker door panel. */}
      <mesh position={[0, 0.18, hullLength * 0.22 + hullLength * 0.15 + 0.001]}>
        <boxGeometry args={[hullWidth * 0.18, 0.22, 0.02]} />
        <meshStandardMaterial color={BOAT_HULL_DARK} flatShading roughness={0.5} />
      </mesh>
      {/* Door trim — brushed-brass rim around cabin door (Tim 2026-05-25).
          Non-emissive brass, catches the warm key as a hairline highlight. */}
      <mesh position={[0, 0.18, hullLength * 0.22 + hullLength * 0.15 + 0.012]}>
        <boxGeometry args={[hullWidth * 0.22, 0.26, 0.005]} />
        <meshStandardMaterial
          color={BOAT_GUNWALE_COLOR}
          metalness={0.8}
          roughness={0.25}
          flatShading
        />
      </mesh>

      {/* ─── CABIN-DOOR HUD PLAQUES (Tim 2026-05-25 brass-fitted HUD) ──
          Two brass-rim walnut plaques mounted on the cabin front wall,
          flanking the window. Left = WAGER (brass numerals), Right =
          CATCHES REMAINING (cyan numerals — DLv2 cyan-economy Job 4).
          REPLACES the prior floating BoatPowerGauge billboard plate. */}
      <CabinDoorPlaques
        hullLength={hullLength}
        hullWidth={hullWidth}
        wagerUsdc={wagerUsdc}
        castsRemaining={castsRemaining}
      />

      {/* ─── MAST — vertical post from the cabin roof ─────────────── */}
      {/* Mast: 1.5 boat-heights tall, cylinder rising from the cabin roof.
          Boat-height ≈ 0.45 (hull + cabin), so mast height ≈ 0.7. */}
      <mesh castShadow position={[0, 0.78, hullLength * 0.22]}>
        <cylinderGeometry args={[0.018, 0.024, 0.72, 8]} />
        <meshStandardMaterial color="#1a1f2a" flatShading roughness={0.6} />
      </mesh>
      {/* Mast topper — polished-brass bead at the masthead (Tim 2026-05-25).
          Was cyan-emissive; now brushed brass per brass-fitted register. */}
      <mesh position={[0, 1.16, hullLength * 0.22]}>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial
          color={BOAT_GUNWALE_COLOR}
          metalness={0.85}
          roughness={0.2}
          flatShading
        />
      </mesh>
      {/* Mast horizontal yard (small crossbar) — adds boat silhouette. */}
      <mesh position={[0, 0.95, hullLength * 0.22]}>
        <boxGeometry args={[0.35, 0.02, 0.02]} />
        <meshStandardMaterial color="#1a1f2a" flatShading roughness={0.6} />
      </mesh>

      {/* ─── CAPTAIN ───────────────────────────────────────────────────
          Stands on the deck near the rod (front of the boat, downstream
          side). Small humanoid silhouette: body + head. Sized ~0.5 hull
          height so the boat reads as the dominant shape (per Tim's
          "looks like a person on a floating house island" feedback —
          shrink the captain so the BOAT reads first). */}
      <mesh position={[0, 0.22, -hullLength * 0.2]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, 0.18, 6]} />
        <meshStandardMaterial color="#1a3a55" flatShading roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.36, -hullLength * 0.2]} castShadow>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="#e8c2a0" flatShading roughness={0.6} />
      </mesh>
      {/* Captain hat — cyan brim trim (small Swoobz signature). */}
      <mesh position={[0, 0.41, -hullLength * 0.2]}>
        <cylinderGeometry args={[0.045, 0.055, 0.025, 8]} />
        <meshStandardMaterial color="#0d141d" flatShading roughness={0.5} />
      </mesh>

      {/* ─── FISHING ROD ────────────────────────────────────────────
          Mounted on the BOW RAIL (front of boat, downstream side). The
          rod is a child of `rodRef` so it rotates toward the targeted
          tile. Pivot sits on the bow rail; rod extends forward (-Z)
          and slightly upward.
      */}
      <group ref={rodRef} position={[0, 0.1, -hullLength * 0.45]}>
        {/* Rod base mount — brushed brass holder (Tim 2026-05-25 brass-
            fitted). Was emissive cyan; now non-emissive brass per spec. */}
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.025, 0.03, 0.06, 8]} />
          <meshStandardMaterial
            color={BOAT_GUNWALE_COLOR}
            metalness={0.85}
            roughness={0.2}
            flatShading
          />
        </mesh>
        {/* Rod shaft — polished walnut, tilted ~30° upward toward downstream */}
        <mesh position={[0, 0.25, -0.38]} rotation={[-Math.PI / 2.4, 0, 0]} castShadow>
          <cylinderGeometry args={[0.013, 0.022, 0.95, 6]} />
          <meshStandardMaterial color="#3a2818" flatShading roughness={0.6} />
        </mesh>
        {/* Rod-band cast-power gauge — IN-SCENE HUD (Tim 2026-05-25).
            Replaces the floating BoatPowerGauge billboard plate with an
            in-scene brushed-brass band wrapped around the rod shaft. The
            cyan fill inside the band scales from 0..1 with cast power.
            This is the DLv2 §1 P8 cyan-economy Job 2 (leading-anchor
            outer ring) — the "what the player is currently doing" anchor.
            Only visible during `casting` phase. */}
        <RodPowerBand phase={phase} castPower={castPower} />
        {/* Rod tip cap — brushed brass (Tim 2026-05-25 brass-fitted).
            Tim 2026-05-26: cap position corrected. The rod shaft cylinder
            (height 0.95, centered at y=0.25 z=-0.38, rotated -π/2.4 around
            X) has its forward end at rod-group-local (0, 0.373, -0.839).
            The cap was at (0.58, -0.76), ~22cm offset from the actual
            forward end — which made the cast line appear to attach above
            the rod instead of at the tip ("line goes off the rod" bug).
            New position sits the cap AT the cylinder's forward end. */}
        <mesh position={[0, 0.378, -0.852]}>
          <sphereGeometry args={[0.022, 10, 10]} />
          <meshStandardMaterial
            color={BOAT_GUNWALE_COLOR}
            metalness={0.9}
            roughness={0.2}
            flatShading
          />
        </mesh>
        {/* Tim 2026-05-24 OO-FISHER L2: ROD-TIP MARKER. Invisible Object3D
            parented to the rod group AT the rod tip position. The CastLine
            reads its world position every frame via getWorldPosition() so
            the line is rooted to the rod tip through ALL transforms (boat
            rocking ±2°, rod yaw toward target). Position matches the
            corrected cap so the line spools from the visible brass cap. */}
        <object3D ref={localRodTipRef} position={[0, 0.378, -0.852]} />
      </group>
    </group>
  )
}

// ─── BoatPowerGauge — REMOVED 2026-05-25 ────────────────────────────────
//
// The prior `BoatPowerGauge` component (a floating semi-transparent
// billboard plate that lookAt'd the camera, ~1.4 world units tall, sat
// in world space at boat-relative [1.5, 0.85, BOAT_FOREGROUND_Z]) was
// DELETED ENTIRELY per the OO-FISHER 2026-05-25 art-direction reset.
//
// Per composition-designer Anti-slop #2 ("Floating UI in a void — a
// centered card with no contextual frame, no shadow from the scene's
// light source, no relationship to the world behind it"): the gauge
// was a HUD element with no in-scene identity. It existed on the boat's
// right side as a billboarded translucent panel — the SaaS-overlay
// register, not the brass-fitted Filson register.
//
// REPLACED by `RodPowerBand` (above) — a brushed-brass band wrapping
// the rod shaft with a cyan inner cylinder that fills 0..1 with cast
// power. Same data, fully integrated into the boat geometry, brass-
// fitted register.
//
// Also removed: the 6Hz pulse-loop on the threshold-met halo, the
// `useFrame` per-frame allocation pattern (the new RodPowerBand uses
// a simple `useEffect` driven by `castPower` prop — no per-frame work).
//
// See: research/originals-game-craft/OO-FISHER-ART-DIRECTION-2026-05-25.md
//   §6.2 (forbidden motion: continuous shimmer / pulse loops on background)
//   §8.1 step 6 (replacement spec)

// ─── Cast line + lure ────────────────────────────────────────────────────

interface CastLineProps {
  readonly phase: CanvasPhase
  readonly castPower: number
  readonly targetTile: HexTileData | null
  readonly reducedMotion: boolean
  /**
   * Tim 2026-05-24 OO-FISHER L2: a ref to a THREE.Object3D parented to the
   * rod tip in the boat's local space. The CastLine reads its world position
   * every frame so the line is ALWAYS rooted at the actual rod tip — through
   * boat rocking AND rod yaw. Previously the line origin was hardcoded in
   * world coords, so the line floated detached from the visible rod.
   */
  readonly rodTipRef: React.MutableRefObject<THREE.Object3D | null>
}

/**
 * The fishing line + lure. Visible only during line-out / fish-on /
 * reeling. The line is rendered as a thin tube (low-poly cylinder).
 *
 * Tim 2026-05-24 OO-FISHER L2: the line geometry is rebuilt EVERY FRAME
 * inside useFrame so it tracks the rod tip's world position through the
 * boat's rocking transform. The previous render-once-per-state approach
 * produced a static line that didn't follow the rod. The line is built
 * imperatively (positions assigned to refs) for zero allocations.
 */
function CastLine({
  phase,
  castPower,
  targetTile,
  reducedMotion,
  rodTipRef,
}: CastLineProps): ReactElement | null {
  const lineMeshRef = useRef<THREE.Mesh>(null)
  const lureMeshRef = useRef<THREE.Mesh>(null)

  // Reusable vectors so we don't allocate per frame.
  const rodTipWorld = useMemo(() => new THREE.Vector3(), [])
  const lureWorld = useMemo(() => new THREE.Vector3(), [])
  const lineDir = useMemo(() => new THREE.Vector3(), [])
  const lineCenter = useMemo(() => new THREE.Vector3(), [])
  const lineUp = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const lineQuat = useMemo(() => new THREE.Quaternion(), [])

  useFrame(() => {
    if (lineMeshRef.current === null || lureMeshRef.current === null) return
    if (rodTipRef.current === null) return

    // ─── Compute lure world position based on phase ────────────────────
    const tx = targetTile !== null ? targetTile.x : 0
    const tz = targetTile !== null ? targetTile.z : -1.2
    let lureY: number
    if (phase === 'casting') {
      // Hover above water — height scales with cast power.
      lureY = 0.5 + (castPower / 100) * 0.6
    } else if (phase === 'fish-on' || phase === 'reeling') {
      // Bob at water surface (the bite). Use a small sine for the bobber dip.
      const t = reducedMotion ? 0 : performance.now() / 1000
      lureY = -0.05 + Math.sin(t * 4) * 0.06
    } else {
      // line-out: lure descending into the water.
      lureY = -0.05
    }
    lureWorld.set(tx, lureY, tz)

    // ─── Read the rod-tip's WORLD position (follows boat rock + rod yaw) ──
    rodTipRef.current.getWorldPosition(rodTipWorld)

    // ─── Place + scale the line cylinder between rod tip and lure ───────
    lineDir.subVectors(lureWorld, rodTipWorld)
    const distance = lineDir.length()
    if (distance < 0.001) return
    lineDir.normalize()
    lineCenter.addVectors(rodTipWorld, lureWorld).multiplyScalar(0.5)
    lineQuat.setFromUnitVectors(lineUp, lineDir)
    lineMeshRef.current.position.copy(lineCenter)
    lineMeshRef.current.quaternion.copy(lineQuat)
    // Cylinder default height = 1 → scale Y to span the actual distance.
    lineMeshRef.current.scale.set(1, distance, 1)

    // ─── Place the lure ─────────────────────────────────────────────────
    lureMeshRef.current.position.copy(lureWorld)
  })

  // Tim 2026-05-26 image fix: the line + lure rendered during the `casting`
  // (charge) phase with the lure hovering above the water — visually odd
  // ("line goes off the rod") because a real fishing cast keeps the line
  // ON THE SPOOL until release. The line only deploys at line-out (release)
  // onwards. RG-C5 SAFE: this is a phase-gated render decision, not a
  // streak/multiplier-modulated condition.
  if (
    phase !== 'line-out' &&
    phase !== 'fish-on' &&
    phase !== 'reeling'
  ) {
    return null
  }

  return (
    <group>
      {/* Line — thin cylinder; geometry is height-1, scaled in useFrame */}
      <mesh ref={lineMeshRef}>
        <cylinderGeometry args={[0.005, 0.005, 1, 4]} />
        <meshBasicMaterial color="#f4f6fa" transparent opacity={0.75} />
      </mesh>
      {/* Lure — yellow sphere, positioned in useFrame */}
      <mesh ref={lureMeshRef} castShadow>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial
          color="#f5c25b"
          emissive="#f5c25b"
          emissiveIntensity={phase === 'fish-on' ? 0.5 : 0.2}
          flatShading
        />
      </mesh>
    </group>
  )
}

// ─── Lighting setup ─────────────────────────────────────────────────────
//
// Tim 2026-05-26 SUNNY DAY revision: "Please also shine some way more light
// as if its a sunny day to fish." Previous palette was dusk/dawn register
// (warm key 1.4, low ambient 0.08). New palette is BRIGHT MIDDAY SUN:
//   1. KEY: directional warm-white 5800K sun, intensity 1.8, shifted
//      from #ffc080 (amber-orange sunset) to #FFF5DC (warm-white noon).
//      Position unchanged [6, 8, 4] — high overhead from the right.
//   2. SKY FILL: hemisphere light replaces the directional rim. Sky color
//      #A8C8E8 (clear-sky blue) overhead, ground color #4a5e30 (sun-lit
//      grass green) below. Intensity 0.45. Gives the natural sky→ground
//      gradient that a bright outdoor midday scene reads by default.
//   3. AMBIENT FLOOR: ambient 0.18 (raised from 0.08) warm #ffe8c0 —
//      fills back-shadows without washing; reads as bright reflected daylight.
//
// Anti-slop fences (lighting-designer): ≤ 3 light sources (HOLDS — exactly 3).
// No emissive on every surface (HOLDS). No god-rays / lens-flare (HOLDS).
// No bloom (HOLDS). No strobe (HOLDS). No intensity scaled with engagement (HOLDS — RG-C5).
//
// RG-C5 STRUCTURAL: all intensities + colors are MODULE-CONST. No streak /
// session / multiplier value can scale them at runtime.

// Sunny-day light constants — module-const per RG-C5.
// Tim 2026-05-26: "broad daylight, it feels very dark". Bumped key sun +
// ambient + hemisphere fill to read as bright noon, not late afternoon.
const SUN_KEY_INTENSITY = 2.6
const SUN_KEY_COLOR = '#FFF8E4' // crisp midday sun, slightly cooler
const SKY_FILL_INTENSITY = 0.85
const SKY_FILL_SKY_COLOR = '#BFDDF2' // clear blue sky overhead
const SKY_FILL_GROUND_COLOR = '#7a965a' // sun-lit grass reflected from below
const AMBIENT_INTENSITY = 0.42

function SceneLighting(): ReactElement {
  return (
    <>
      {/* Ambient floor: raised to 0.18 warm-cream — reflects bright
          midday sunlight bouncing off the water + ground. Prevents
          black cabin interior without washing the key light. */}
      <ambientLight color="#ffe8c0" intensity={AMBIENT_INTENSITY} />
      {/* KEY — the midday sun. Directional from upper-right at high
          angle. Warm-white 5800K catches brass rod fittings + brass
          gunwale. Intensity 1.8 (boosted from 1.4) = strong noon sun.
          Cast-shadow enabled so boat casts shadow on water hexes. */}
      <directionalLight
        position={[6, 8, 4]}
        intensity={SUN_KEY_INTENSITY}
        color={SUN_KEY_COLOR}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      {/* SKY FILL — hemisphere light replaces the directional rim.
          Sky=clear-blue overhead, ground=sun-lit-grass below. Intensity
          0.45 = strong open-sky fill for a bright day. Hemisphere lights
          are the correct tool for outdoor daylight — they naturally
          produce the sky→ground color gradient that every bright outdoor
          scene reads from. */}
      <hemisphereLight
        args={[SKY_FILL_SKY_COLOR, SKY_FILL_GROUND_COLOR, SKY_FILL_INTENSITY]}
      />
    </>
  )
}

// ─── Camera rig (aerial drone POV) ──────────────────────────────────────
//
// Tim playtest 2026-05-24 v1: "lets change the POV from higher up so you
// look down and are more emersed in the game". The camera sits HIGH and
// looks DOWN at a steep angle — aerial drone shot, not first-person
// behind-boat.
//
// Tim playtest 2026-05-24 v2 (this rev): "the angle is now a bit too
// high. the scenic is somewhat cut off". Lowered the elevation angle
// from ~72° to ~60° (still aerial-ish, but more cinematic) AND widened
// FOV from 46 to 52 so the tree-lined banks + mountains stay in frame.
//
// Tim 2026-05-24 LUSH revision (this rev): the dense forest walls were
// occluding the sunset sky + mountain band. Camera lifted slightly (5.4
// vs 5.2) and pulled forward (4.4 vs 3.6) so the look-down angle stays
// immersive but the horizon line rises into the upper-third of the
// frame, exposing more sky + the snow-capped mountain silhouettes.
// LookAt also raised (y=0.5 vs 0.0) which tilts the camera forward and
// reveals more of the upper scene without losing the boat in the lower
// third.
//
// Camera tuning (lush-forward v3):
//   - Position (0, 5.4, 4.4): elevated + pulled back. Angle ≈
//     arctan(5.4/4.0) ≈ 53° downward — more cinematic, more horizon.
//   - LookAt (0, 0.5, -2.5): raised target Y so the camera tilts upward
//     toward the mountain band; pushed Z further downstream so the
//     vanishing point sits in the upper-middle of the frame.
//   - FOV 56: widened from 52 → 56 so the lush tree banks + snow peaks
//     stay in frame at the new pulled-back position.
//
// The Canvas-level `camera` prop only sets POSITION. To get the explicit
// lookAt, the CameraRig component re-applies position + lookAt on mount.
const CAMERA_POSITION: readonly [number, number, number] = [0, 5.4, 4.4]
const CAMERA_LOOK_AT: readonly [number, number, number] = [0, 0.5, -2.5]
const CAMERA_FOV = 56

function CameraRig(): null {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(...CAMERA_POSITION)
    camera.lookAt(...CAMERA_LOOK_AT)
    // PerspectiveCamera-specific properties (updateProjectionMatrix if FOV
    // changed). We only run once on mount so this is cheap.
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.updateProjectionMatrix()
    }
  }, [camera])
  return null
}

// ─── Main scene composition ──────────────────────────────────────────────

function SceneContents(props: OoFisher3DSceneProps): ReactElement {
  const tiles = useMemo(() => buildHexGrid(GRID_COLS, GRID_ROWS), [])
  const targetTile = useMemo<HexTileData | null>(() => {
    if (props.targetTileIndex === null) return null
    return tiles[props.targetTileIndex] ?? null
  }, [tiles, props.targetTileIndex])

  // Tim 2026-05-24 OO-FISHER L2: shared rod-tip ref so the CastLine can
  // read the actual rod tip's world position every frame. The boat
  // populates this with an Object3D parented to the rod tip; the line
  // reads it via getWorldPosition() so it follows the boat's rock AND
  // the rod's yaw without any manual recomputation.
  const rodTipRef = useRef<THREE.Object3D | null>(null)

  return (
    <>
      <CameraRig />
      <SunnySky />
      <SceneLighting />
      {/* Water grid (with beveled rim + upstream wave) */}
      <HexGrid
        tiles={tiles}
        targetTileIndex={props.targetTileIndex}
        onTileClick={props.onTileClick}
        reducedMotion={props.reducedMotion}
        castPower={props.castPower}
        phase={props.phase}
        onHexPointerDown={props.onHexPointerDown}
        onHexPointerUp={props.onHexPointerUp}
      />
      {/* Tim 2026-05-24 HEX-WATER revision: continuous WATER plane sitting
          just BELOW the hex bodies. With the hex bodies now semi-transparent
          (opacity 0.82) this plane bleeds through and unifies the river as
          one continuous water surface rather than 98 discrete tiles. The
          plane uses a deep teal (#0a3d52) tone with metallic specular so
          the water "below the hex caustics" has the right wet sheen.

          Position: y=-0.05 (just below the hex BODY top face which sits at
          ~y=+0.09). This puts the plane RIGHT under the hex bodies — gaps
          between hexes still show water (not void) and the transparent
          hex bodies tint to the deep blue underneath.

          Tim 2026-05-25 BUG-1 fix: the previous extent (28 × 36 @ z=-2,
          back-edge ≈ z=-20) left a visible dry band BEHIND the gameplay
          hex grid — beyond z≈-20 the camera saw brown ground/shore where
          the river should have continued to the horizon. Tim's
          screenshot: "water polygons don't extend to end of stream — it
          reads as a swimming pool, not a flowing river."

          FIX: extend the primary water plane to 80 × 100 @ z=-22. New
          coverage: x ∈ [-40, +40], z ∈ [-72, +28]. The hex grid (cols=7,
          rows=14, ~5×9 world units) stays the gameplay area; the
          underlying water mesh now stretches all the way to the deepest
          mountain band so the river reads as flowing into the horizon.
          A secondary FAR-FIELD plane (below) handles the visual horizon
          and fades into the sky.

          Material: high metalness (0.6) + low roughness (0.35) = strong
          specular response to the sun light, giving the river that
          "polished mirror" wet look. Subtle cyan emissive bias keeps the
          Swoobz brand undertint consistent with the hex bodies. */}
      <mesh position={[0, -0.04, -22]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 100]} />
        <meshStandardMaterial
          color="#0a3d52"
          metalness={0.6}
          roughness={0.35}
          emissive="#002a3c"
          emissiveIntensity={0.4}
        />
      </mesh>
      {/* Tim 2026-05-25 BUG-1 FAR-FIELD water layer: a secondary, slightly
          darker water plane positioned BENEATH the rolling hills + mountain
          band. This gives the appearance that the river fades into the
          haze of the distant mountains rather than abruptly cutting off
          at the shore line.

          Position: y=-0.08 (a hair below the primary plane to prevent
          z-fighting at the seam) at z=-50 (under the deepest mountain
          band). Extent 120 × 80 — wide enough to wrap behind the rolling
          hills on both banks at the camera's vanishing point.

          Color: deeper navy (#062738) with the same emissive cyan
          undertint so the far-field water reads as "same river, further
          back" rather than a different body of water. Lower
          emissiveIntensity (0.18) so the distance fog cue still reads
          (closer = brighter, farther = duller). */}
      <mesh position={[0, -0.045, -50]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[120, 80]} />
        <meshStandardMaterial
          color="#062738"
          metalness={0.55}
          roughness={0.45}
          emissive="#001a26"
          emissiveIntensity={0.18}
        />
      </mesh>
      {/* Swimming fish */}
      <SwimmingFish count={14} />
      {/* Boat — foreground (Tim 2026-05-24 third-person POV).
          Tim 2026-05-25 BRASS-FITTED: boat now hosts the in-scene HUD
          plaques (left = wager, right = catches) AND the rod-band
          cast-power gauge. Phase + castPower passed through. */}
      <VoxelBoat
        loadout={props.loadout}
        reducedMotion={props.reducedMotion}
        targetTile={targetTile}
        rodTipRef={rodTipRef}
        phase={props.phase}
        castPower={props.castPower}
        wagerUsdc={0 /* wager plaque digits — Phase-2 wires this from provider */}
        castsRemaining={props.castsRemaining}
      />
      {/* BoatPowerGauge DELETED 2026-05-25 — REPLACED by in-scene
          RodPowerBand (the brushed-brass band with cyan fill wrapped
          around the rod shaft inside VoxelBoat). The prior floating
          billboard plate at world (1.5, 0.85, BOAT_FOREGROUND_Z) was a
          plopped HUD-in-a-void per composition-designer Anti-slop #2.
          The new RodPowerBand IS part of the rod — same data, in-scene
          identity. */}
      {/* Cast line + lure */}
      <CastLine
        phase={props.phase}
        castPower={props.castPower}
        targetTile={targetTile}
        reducedMotion={props.reducedMotion}
        rodTipRef={rodTipRef}
      />
      {/* Catch celebration */}
      <CatchJump
        rarity={props.recentCatchRarity}
        targetTile={targetTile}
        reducedMotion={props.reducedMotion}
      />
      {/* Scenery — lush layered composition (Tim 2026-05-24/25):
          GroundPlane fills the valley floor. Mountains form the distant
          horizon. RollingHills rise from the water line on each bank —
          verdant green mounds layered in 3 depth tiers. Pine forest
          sits on the hill slopes. Shore scatter (grass + rocks + bushes
          + flowers) dresses the immediate bank line.

          Tim 2026-05-25 BRASS-FITTED: FireflyParticles DELETED (the
          24-dot cyan Lissajous cloud — taste-guardian Category 1 slop
          per Tim 2026-05-25). The scene rests still in ambient; only
          the boat-rock + water-ripple primitives move at idle.

          Render order (back-to-front for paint):
            1. GroundPlane (valley floor)
            2. MountainRange (distant horizon silhouettes)
            3. RollingHills (mid-distance green hills)
            4. PineForest (trees on the hill slopes)
            5. ShoreDetail (grass / rocks / bushes / flowers near water) */}
      <GroundPlane />
      <MountainRange />
      <RollingHills />
      <PineForest />
      <ShoreDetail />
    </>
  )
}

// ─── Public component ───────────────────────────────────────────────────

/**
 * The exported 3D scene. Wrapped in a Canvas + Suspense. The parent
 * (OoFisherExperience) lazy-loads this via `next/dynamic` to skip SSR.
 *
 * data-testid="oo-fisher-3d-canvas" exposes the canvas wrapper for the
 * Playwright smoke test.
 */
export function OoFisher3DScene(props: OoFisher3DSceneProps): ReactElement {
  // Auto-select the center tile if nothing's selected and we're in casting.
  useEffect(() => {
    if (props.targetTileIndex !== null) return
    if (props.phase !== 'casting') return
    // Center of an N x N grid is (cols/2, rows/2).
    const centerIdx = Math.floor(GRID_ROWS / 2) * GRID_COLS + Math.floor(GRID_COLS / 2)
    props.onTileClick(centerIdx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.phase])

  return (
    <div
      data-testid="oo-fisher-3d-canvas"
      style={{
        // Tim 2026-05-26 (image 123 root-cause v4): DUPLICATE `position`
        // key bug! Earlier edits left both `position: 'absolute'` AND
        // `position: 'relative'` in this style object — JS object literal
        // = second key wins, so absolute was silently overridden. Every
        // browser probe showed the wrapper as position:relative + 150px
        // and I kept "fixing" wrong layers. FIX: single position:absolute
        // + inset:0 fills canvasShell (which is position:relative). This
        // ALSO establishes a containing block for descendants so any
        // child position:absolute uses this wrapper as reference. Probe
        // verified the wrapper is now 696px (= canvasShell height).
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, #4a8fc8 0%, #87bfe0 55%, #e8f4ff 100%)',
        borderRadius: 14,
        overflow: 'hidden',
        cursor: props.phase === 'casting' || props.phase === 'between-casts' ? 'crosshair' : 'default',
        // 3D-scene-qa 2026-05-26 fix: prevent mobile browser scroll/pan
        // gesture from intercepting the tap-and-hold cast input on iOS/
        // Android. Without this, browser default touch handling can win
        // the gesture before R3F's onPointerDown fires.
        touchAction: 'none',
      }}
    >
      <Canvas
        // PCFShadowMap (non-soft) avoids the PCFSoftShadowMap deprecation
        // warning in three r170+. The hard-edge softness is acceptable in
        // a low-poly aesthetic where every shadow is already a stylized
        // approximation.
        shadows="basic"
        dpr={[1, 2]}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          // preserveDrawingBuffer: true is required for canvas.toDataURL()
          // to return a non-blank image — used by the boat-renders-pixels
          // Playwright test AND by any future screenshot integration tests.
          // Cost is minor (no swap-chain optimization); pixels remain in
          // memory after the frame ends.
          preserveDrawingBuffer: true,
        }}
        // Seed camera at the aerial-drone POV (Tim playtest 2026-05-24 v2).
        // CameraRig re-applies position AND lookAt on mount so the camera
        // points downstream toward the mountains rather than the default
        // (0,0,0) auto-target. FOV widened to 52° so the tree-lined banks
        // + mountain backdrop stop being clipped at the new lower angle.
        camera={{
          position: CAMERA_POSITION,
          fov: CAMERA_FOV,
          near: 0.1,
          far: 100,
        }}
        // Keep the canvas behind any DOM overlays the experience layers above.
        style={{ width: '100%', height: '100%' }}
      >
        {/* Group rotated slightly so the iso angle leans more toward the
            boat — feels like the Fogo Fishing camera. */}
        <group>
          <Suspense fallback={null}>
            <SceneContents {...props} />
          </Suspense>
        </group>
      </Canvas>
      {/* Hidden hook so the legacy boat-painted Playwright test still
          finds *a* canvas element. The hex grid + boat render real WebGL
          pixels into the underlying <canvas> — the test samples those
          pixels for non-background paint. */}
    </div>
  )
}

// (Stats re-export removed — @react-three/drei is not installed in this
// workspace. Demos that need a perf overlay can import drei directly when
// the dep is added.)

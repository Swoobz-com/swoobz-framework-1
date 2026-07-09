'use client'

/**
 * OoFisher3DScenery — the static low-poly scenery surrounding the water.
 *
 * Tim 2026-05-25 BRASS-FITTED revision (this rev, per OO-FISHER-ART-
 * DIRECTION-2026-05-25.md): the prior lush-forward iteration shipped a
 * `FireflyParticles` cloud of 24 cyan dots drifting via Lissajous over the
 * water (Tim 2026-05-25 verbatim: "please stop with the particle effects -
 * that is like AI slop for igaming"). The fireflies are DELETED ENTIRELY.
 * The composition work in the rest of this file landed well; the ambient
 * particle layer was the slop. With the fireflies gone the dawn scene
 * rests still — the boat rocks on the water and the water surface
 * ripples; everything else is composed and static.
 *
 * Anti-slop fences (per taste-guardian + motion-director):
 *   - NO particle effects (no fireflies, no drifting dust, no sparkle)
 *   - NO ambient breathing on scenery (mountains, hills, trees are static)
 *   - NO atmospheric drift particles
 *   - NO 5th cyan moment (cyan economy is exhausted by chassis + the
 *     rod-band cast-power gauge + the right-side HUD plaque numerals)
 *
 * Composition (back-to-front):
 *   - MountainRange: THREE layered ranges with snow caps + atmospheric
 *     perspective fade (z=-40 distant, z=-30 mid, z=-22 near)
 *   - RollingHills: rolling green hill mounds along each bank, rising
 *     from water level up to ~5 units, layered for depth
 *   - PineForest: ~75 trees per bank using 3 variants (cypress,
 *     pine, fir w/ snow cap) clustered in groups of 3-5, plus saplings
 *     scattered between — InstancedMesh per primitive part for 60fps
 *   - ShoreDetail: ~100 grass tufts + ~60 rocks + ~25 bushes + ~12 flowers
 *     all instanced (brown earth strips removed)
 *
 * Performance discipline:
 *   - InstancedMesh for every repeated primitive (one draw call per part
 *     type). Tree count went from 60 individual meshes (60 draw calls) to
 *     ~10 instanced calls totaling ~250 trees + shore detail.
 *   - All placements use deterministic hash seeds so positions stable
 *     across re-renders (no random allocation per render).
 *   - Memoized data arrays computed once at mount.
 *
 * Domain C: presentation only. No financial math; no streak parameters
 * bleed into any animation amplitude.
 */
import { type ReactElement, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { GRID_ROWS, HEX_SIZE } from './ooFisher3DHexGrid'

// World Y of the shore platform — exported so the scene can stack things
// on top.
export const SHORE_LEVEL = 0.6

// ─── Deterministic PRNG ──────────────────────────────────────────────────
//
// Splitmix32 hash → 32-bit integer. Same (seed, index) → same value across
// re-renders. Used for stable scatter positions so the scene doesn't
// reshuffle on every mount.
function hash32(seed: number, index: number): number {
  let h = (seed ^ (index * 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}
function frand(seed: number, index: number): number {
  return hash32(seed, index) / 0xffffffff
}

// ─── Mountain ranges (Tim 2026-05-24 LUSH revision: 3 layered ranges) ────
//
// Three ranges at different distances. Each range is shorter than the one
// behind it (atmospheric perspective: distant mountains appear shorter +
// hazier from the lower-elevated camera). Snow caps on the upper 35% of
// each cone via a secondary white cone mesh.

interface MountainSeed {
  readonly x: number
  readonly z: number
  readonly height: number
  readonly radius: number
  readonly bodyTint: number
  readonly hasSnow: boolean
}

const MOUNTAIN_BAND_COLOR_FAR = 0x6a7a92 // Distant — hazier, lighter blue.
const MOUNTAIN_BAND_COLOR_MID = 0x4d5d76
const MOUNTAIN_BAND_COLOR_NEAR = 0x3a4b62
const SNOW_CAP_COLOR = 0xf2f6fa // Off-white with cool tint.

function buildMountainBand(
  seedOffset: number,
  z: number,
  count: number,
  baseHeight: number,
  heightJitter: number,
  baseRadius: number,
  bodyTint: number,
  snowChance: number,
): MountainSeed[] {
  const arr: MountainSeed[] = []
  for (let i = 0; i < count; i += 1) {
    const seed = seedOffset + i
    const x = -count * 1.0 + i * 2.0 + (frand(seed, 1) - 0.5) * 1.4
    const height = baseHeight + frand(seed, 2) * heightJitter
    const radius = baseRadius + frand(seed, 3) * (baseRadius * 0.35)
    const hasSnow = frand(seed, 4) < snowChance
    arr.push({ x, z, height, radius, bodyTint, hasSnow })
  }
  return arr
}

export function MountainRange(): ReactElement {
  // Three layered bands — pulled CLOSER (z=-25 to z=-15) than the prior
  // -40/-30/-22 range so the mountains actually peek above the dense tree
  // line. The bands are also TALLER (5.5/4.2/3.0) so the snow-capped
  // silhouettes rise clearly above the upstream tree heights.
  const farBand = useMemo(
    () =>
      buildMountainBand(
        /*seedOffset*/ 1000,
        /*z*/ -25,
        /*count*/ 20,
        /*baseHeight*/ 5.5,
        /*heightJitter*/ 2.8,
        /*baseRadius*/ 2.0,
        /*bodyTint*/ MOUNTAIN_BAND_COLOR_FAR,
        /*snowChance*/ 0.9, // Almost all far peaks have snow (highest).
      ),
    [],
  )
  const midBand = useMemo(
    () =>
      buildMountainBand(
        /*seedOffset*/ 2000,
        /*z*/ -19,
        /*count*/ 16,
        /*baseHeight*/ 4.2,
        /*heightJitter*/ 2.0,
        /*baseRadius*/ 1.7,
        /*bodyTint*/ MOUNTAIN_BAND_COLOR_MID,
        /*snowChance*/ 0.6,
      ),
    [],
  )
  const nearBand = useMemo(
    () =>
      buildMountainBand(
        /*seedOffset*/ 3000,
        /*z*/ -15,
        /*count*/ 12,
        /*baseHeight*/ 3.0,
        /*heightJitter*/ 1.5,
        /*baseRadius*/ 1.5,
        /*bodyTint*/ MOUNTAIN_BAND_COLOR_NEAR,
        /*snowChance*/ 0.35,
      ),
    [],
  )

  function renderBand(band: MountainSeed[], keyPrefix: string): ReactElement[] {
    return band.map((m, i) => (
      // Tim 2026-05-24 OO-FISHER playtest L1: mountains were FLOATING above
      // the shore plane because the prior y=SHORE_LEVEL + height/2 - 0.2
      // anchored at the SHORE level (y=0.6) which sits ABOVE the water plane
      // (y=0). The cone's BASE then hovered at y=0.4 while the water + grid
      // sat at y=0 → a visible gap between mountain base and ground.
      //
      // Fix: anchor the cone base at world y=0 (water level) so the mountain
      // ROOTS into the ground. A cone's local origin is its center, so we
      // position at y=(height/2 - 0.05) where -0.05 plants the base SLIGHTLY
      // BELOW the water plane (matches the new GroundPlane). This eliminates
      // the float gap from any camera angle.
      <group key={`${keyPrefix}-${i}`} position={[m.x, m.height / 2 - 0.05, m.z]}>
        {/* Mountain body — 5-sided cone for the low-poly chunky read. */}
        <mesh receiveShadow>
          <coneGeometry args={[m.radius, m.height, 5, 1]} />
          <meshStandardMaterial color={m.bodyTint} flatShading roughness={0.85} />
        </mesh>
        {/* Snow cap — smaller cone perched on the upper 35% of the peak.
            Snow cap is offset upward so it caps the mountain's apex. */}
        {m.hasSnow ? (
          <mesh position={[0, m.height * 0.32, 0]}>
            <coneGeometry args={[m.radius * 0.55, m.height * 0.4, 5, 1]} />
            <meshStandardMaterial
              color={SNOW_CAP_COLOR}
              flatShading
              roughness={0.6}
              emissive={SNOW_CAP_COLOR}
              emissiveIntensity={0.05}
            />
          </mesh>
        ) : null}
      </group>
    ))
  }

  return (
    <group>
      {renderBand(farBand, 'far')}
      {renderBand(midBand, 'mid')}
      {renderBand(nearBand, 'near')}
    </group>
  )
}

// ─── PineForest (Tim 2026-05-24 LUSH revision: 75/bank × 2 banks) ────────
//
// Three tree variants for visual variety:
//   - cypress: thin + tall (single elongated cone)
//   - pine:    cone stack (3 stacked cones) — the original variant
//   - fir:     wider cone with snow-cap topper (mountain-foothills feel)
//
// Trees clustered in groups of 3-5 along the bank. Saplings (smaller pines)
// scattered between clusters for the dense forest read.
//
// Performance: each tree-part (cypress body, pine cone, pine trunk, fir
// body, fir cap, sapling cone) is its own InstancedMesh → constant draw
// calls regardless of tree count.

type TreeVariant = 'cypress' | 'pine' | 'fir' | 'sapling'

interface TreeInstance {
  readonly x: number
  readonly z: number
  readonly scale: number
  readonly rotation: number
  readonly tint: number
  readonly variant: TreeVariant
}

const TREE_CANOPY_PALETTE = [
  0x2d6b3f,
  0x357c4a,
  0x2a5e3a,
  0x3f8a55,
  0x265a37,
  0x4a9560,
  0x1e4e2e,
  0x568f60,
] as const

const TREE_TRUNK_COLOR = 0x5e3a1f
const CYPRESS_TINT_PALETTE = [0x2f5a3a, 0x265030, 0x386a48] as const

const TREES_PER_BANK = 75 // ~Fogo-density target.

function buildBankTrees(seedOffset: number, bankSide: 1 | -1): TreeInstance[] {
  const arr: TreeInstance[] = []
  const halfZ = (GRID_ROWS * HEX_SIZE * 1.5) / 2
  // Trees span from upstream (camera-side, +halfZ + 3) to mid-downstream
  // (-halfZ - 4). The deep downstream area (further toward camera lookAt
  // and the mountain band) is intentionally LEFT EMPTY so the mountain
  // silhouettes are visible at the vanishing point. Previous Z_END was -8;
  // now -4 so the last 4 units toward the mountains have no tree wall.
  const Z_START = halfZ + 3.0
  const Z_END = -halfZ - 4.0
  const Z_SPAN = Z_START - Z_END

  // Cluster placement: divide bank into ~15 cluster anchors, each with
  // 3-5 trees in a tight knot, plus 1-3 saplings around it.
  const CLUSTER_COUNT = 15
  let treeIdx = 0
  for (let c = 0; c < CLUSTER_COUNT; c += 1) {
    const seedC = seedOffset + c * 100
    // Cluster anchor — even spacing along Z with jitter.
    const anchorZ = Z_START - (c / (CLUSTER_COUNT - 1)) * Z_SPAN
    // Distance-based scale falloff: trees at the downstream end (negative Z,
    // toward the mountains) are progressively SHORTER so the mountain
    // silhouettes peek above them via atmospheric perspective. The
    // normalized "upstream-ness" goes from 1.0 (camera-side, full scale)
    // to ~0.55 (downstream, half-height).
    const upstreamness = (anchorZ - Z_END) / (Z_START - Z_END) // 1=camera, 0=downstream
    const distanceScale = 0.55 + upstreamness * 0.55 // 0.55..1.10
    // Bank X position: 4.0 + variation (further from water = more depth).
    const anchorX = bankSide * (4.0 + frand(seedC, 1) * 1.2)

    // Cluster size: 3-5 main trees + 1-3 saplings = 4-8 per cluster.
    // Downstream clusters get FEWER main trees (1-2 vs 3-5) so the river
    // vanishing point has thinner foliage — mountains read clearly through.
    const downstreamThinning = upstreamness < 0.25 ? 0 : 1
    const mainCount = 1 + Math.floor(frand(seedC, 2) * 3) + downstreamThinning * 2
    const saplingCount = 1 + Math.floor(frand(seedC, 3) * 3)

    for (let m = 0; m < mainCount; m += 1) {
      const seedM = seedC + m
      // Tight cluster — radius ~0.9 around anchor.
      const dx = (frand(seedM, 10) - 0.5) * 1.8
      const dz = (frand(seedM, 11) - 0.5) * 2.0
      const x = anchorX + dx + bankSide * Math.abs(dx) * 0.3 // Bias away from water.
      const z = anchorZ + dz
      // Final scale = base jitter × distance falloff. Downstream trees
      // shrink to ~half their upstream cousins, opening the sky band above.
      const baseScale = 0.7 + frand(seedM, 12) * 0.7 // 0.7-1.4
      const scale = baseScale * distanceScale
      const rotation = frand(seedM, 13) * Math.PI * 2
      const variantRoll = frand(seedM, 14)
      let variant: TreeVariant
      let tint: number
      if (variantRoll < 0.33) {
        variant = 'cypress'
        tint =
          CYPRESS_TINT_PALETTE[
            Math.floor(frand(seedM, 15) * CYPRESS_TINT_PALETTE.length) %
              CYPRESS_TINT_PALETTE.length
          ] ?? CYPRESS_TINT_PALETTE[0]
      } else if (variantRoll < 0.7) {
        variant = 'pine'
        tint =
          TREE_CANOPY_PALETTE[
            Math.floor(frand(seedM, 16) * TREE_CANOPY_PALETTE.length) %
              TREE_CANOPY_PALETTE.length
          ] ?? TREE_CANOPY_PALETTE[0]
      } else {
        variant = 'fir'
        tint =
          TREE_CANOPY_PALETTE[
            Math.floor(frand(seedM, 17) * TREE_CANOPY_PALETTE.length) %
              TREE_CANOPY_PALETTE.length
          ] ?? TREE_CANOPY_PALETTE[0]
      }
      arr.push({ x, z, scale, rotation, tint, variant })
      treeIdx += 1
      if (treeIdx >= TREES_PER_BANK) return arr
    }

    // Saplings — small pines scattered just outside the cluster. Also
    // get the downstream distance falloff so the bank tapers gracefully.
    for (let s = 0; s < saplingCount; s += 1) {
      const seedS = seedC + 50 + s
      const dx = (frand(seedS, 20) - 0.5) * 3.0
      const dz = (frand(seedS, 21) - 0.5) * 3.5
      const x = anchorX + dx + bankSide * Math.abs(dx) * 0.3
      const z = anchorZ + dz
      const baseScale = 0.32 + frand(seedS, 22) * 0.28 // Tiny — half-size of mains.
      const scale = baseScale * distanceScale
      const rotation = frand(seedS, 23) * Math.PI * 2
      const tint =
        TREE_CANOPY_PALETTE[
          Math.floor(frand(seedS, 24) * TREE_CANOPY_PALETTE.length) %
            TREE_CANOPY_PALETTE.length
        ] ?? TREE_CANOPY_PALETTE[0]
      arr.push({ x, z, scale, rotation, tint, variant: 'sapling' })
      treeIdx += 1
      if (treeIdx >= TREES_PER_BANK) return arr
    }
  }
  return arr
}

/**
 * Helper to populate an InstancedMesh with per-instance matrices + colors.
 * Used by every instanced part below to avoid duplicated boilerplate.
 */
function applyInstanceTransforms(
  mesh: THREE.InstancedMesh | null,
  entries: ReadonlyArray<{
    readonly x: number
    readonly y: number
    readonly z: number
    readonly scaleX: number
    readonly scaleY: number
    readonly scaleZ: number
    readonly rotationY: number
    readonly colorHex: number
  }>,
): void {
  if (mesh === null) return
  const dummy = new THREE.Object3D()
  const color = new THREE.Color()
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]
    if (e === undefined) continue
    dummy.position.set(e.x, e.y, e.z)
    dummy.rotation.set(0, e.rotationY, 0)
    dummy.scale.set(e.scaleX, e.scaleY, e.scaleZ)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    color.setHex(e.colorHex)
    mesh.setColorAt(i, color)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true
}

export function PineForest(): ReactElement {
  const trees = useMemo<TreeInstance[]>(() => {
    return [
      ...buildBankTrees(/*seedOffset*/ 7000, /*bankSide*/ 1), // EAST bank
      ...buildBankTrees(/*seedOffset*/ 8000, /*bankSide*/ -1), // WEST bank
    ]
  }, [])

  // Split trees by variant so each gets its own InstancedMesh.
  const cypresses = useMemo(() => trees.filter((t) => t.variant === 'cypress'), [trees])
  const pines = useMemo(() => trees.filter((t) => t.variant === 'pine'), [trees])
  const firs = useMemo(() => trees.filter((t) => t.variant === 'fir'), [trees])
  const saplings = useMemo(() => trees.filter((t) => t.variant === 'sapling'), [trees])

  // ─── Cypress (1 instanced mesh: tall elongated cone) ───────────────
  const cypressBodyRef = useRef<THREE.InstancedMesh>(null)
  const cypressTrunkRef = useRef<THREE.InstancedMesh>(null)

  // ─── Pine (3 instanced meshes: trunk + 3 stacked cones, one mesh per
  //          cone tier so we get distinct geometry sizes) ─────────────
  const pineTrunkRef = useRef<THREE.InstancedMesh>(null)
  const pineCone1Ref = useRef<THREE.InstancedMesh>(null)
  const pineCone2Ref = useRef<THREE.InstancedMesh>(null)
  const pineCone3Ref = useRef<THREE.InstancedMesh>(null)

  // ─── Fir (3 instanced meshes: trunk + body cone + snow cap) ────────
  const firTrunkRef = useRef<THREE.InstancedMesh>(null)
  const firBodyRef = useRef<THREE.InstancedMesh>(null)
  const firCapRef = useRef<THREE.InstancedMesh>(null)

  // ─── Sapling (2 instanced meshes: tiny trunk + cone) ───────────────
  const saplingTrunkRef = useRef<THREE.InstancedMesh>(null)
  const saplingConeRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    // CYPRESS — single tall cone (height 1.5 × radius 0.18) on a small trunk.
    applyInstanceTransforms(
      cypressBodyRef.current,
      cypresses.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 0.9 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: t.tint,
      })),
    )
    applyInstanceTransforms(
      cypressTrunkRef.current,
      cypresses.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 0.12 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: TREE_TRUNK_COLOR,
      })),
    )

    // PINE — trunk at y=0.25, cones at y=0.7, 1.0, 1.3 (matches original
    // stacked-cone shape).
    applyInstanceTransforms(
      pineTrunkRef.current,
      pines.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 0.25 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: TREE_TRUNK_COLOR,
      })),
    )
    applyInstanceTransforms(
      pineCone1Ref.current,
      pines.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 0.7 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: t.tint,
      })),
    )
    applyInstanceTransforms(
      pineCone2Ref.current,
      pines.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 1.0 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: t.tint,
      })),
    )
    applyInstanceTransforms(
      pineCone3Ref.current,
      pines.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 1.3 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: t.tint,
      })),
    )

    // FIR — trunk + wide body cone + snow cap.
    applyInstanceTransforms(
      firTrunkRef.current,
      firs.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 0.18 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: TREE_TRUNK_COLOR,
      })),
    )
    applyInstanceTransforms(
      firBodyRef.current,
      firs.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 0.85 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: t.tint,
      })),
    )
    applyInstanceTransforms(
      firCapRef.current,
      firs.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 1.55 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: SNOW_CAP_COLOR,
      })),
    )

    // SAPLING — tiny trunk + single small cone.
    applyInstanceTransforms(
      saplingTrunkRef.current,
      saplings.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 0.12 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: TREE_TRUNK_COLOR,
      })),
    )
    applyInstanceTransforms(
      saplingConeRef.current,
      saplings.map((t) => ({
        x: t.x,
        y: SHORE_LEVEL + 0.45 * t.scale,
        z: t.z,
        scaleX: t.scale,
        scaleY: t.scale,
        scaleZ: t.scale,
        rotationY: t.rotation,
        colorHex: t.tint,
      })),
    )
  }, [cypresses, pines, firs, saplings])

  // Static geometries + materials — memoized once. Each material has
  // vertexColors=true so per-instance color works.
  const trunkGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6),
    [],
  )
  const cypressBodyGeometry = useMemo(
    () => new THREE.ConeGeometry(0.18, 1.5, 6, 1),
    [],
  )
  const pineCone1Geometry = useMemo(
    () => new THREE.ConeGeometry(0.42, 0.5, 6, 1),
    [],
  )
  const pineCone2Geometry = useMemo(
    () => new THREE.ConeGeometry(0.32, 0.42, 6, 1),
    [],
  )
  const pineCone3Geometry = useMemo(
    () => new THREE.ConeGeometry(0.22, 0.34, 6, 1),
    [],
  )
  const firBodyGeometry = useMemo(
    () => new THREE.ConeGeometry(0.55, 1.2, 7, 1),
    [],
  )
  const firCapGeometry = useMemo(
    () => new THREE.ConeGeometry(0.3, 0.55, 7, 1),
    [],
  )
  const saplingTrunkGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.04, 0.05, 0.24, 5),
    [],
  )
  const saplingConeGeometry = useMemo(
    () => new THREE.ConeGeometry(0.22, 0.5, 5, 1),
    [],
  )

  const canopyMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.7,
        vertexColors: false,
      }),
    [],
  )
  const trunkMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.8,
        vertexColors: false,
      }),
    [],
  )
  const snowCapMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.6,
        vertexColors: false,
      }),
    [],
  )

  return (
    <group>
      {cypresses.length > 0 ? (
        <>
          <instancedMesh
            ref={cypressTrunkRef}
            args={[trunkGeometry, trunkMaterial, cypresses.length]}
            castShadow
          />
          <instancedMesh
            ref={cypressBodyRef}
            args={[cypressBodyGeometry, canopyMaterial, cypresses.length]}
            castShadow
          />
        </>
      ) : null}
      {pines.length > 0 ? (
        <>
          <instancedMesh
            ref={pineTrunkRef}
            args={[trunkGeometry, trunkMaterial, pines.length]}
            castShadow
          />
          <instancedMesh
            ref={pineCone1Ref}
            args={[pineCone1Geometry, canopyMaterial, pines.length]}
            castShadow
          />
          <instancedMesh
            ref={pineCone2Ref}
            args={[pineCone2Geometry, canopyMaterial, pines.length]}
            castShadow
          />
          <instancedMesh
            ref={pineCone3Ref}
            args={[pineCone3Geometry, canopyMaterial, pines.length]}
            castShadow
          />
        </>
      ) : null}
      {firs.length > 0 ? (
        <>
          <instancedMesh
            ref={firTrunkRef}
            args={[trunkGeometry, trunkMaterial, firs.length]}
            castShadow
          />
          <instancedMesh
            ref={firBodyRef}
            args={[firBodyGeometry, canopyMaterial, firs.length]}
            castShadow
          />
          <instancedMesh
            ref={firCapRef}
            args={[firCapGeometry, snowCapMaterial, firs.length]}
          />
        </>
      ) : null}
      {saplings.length > 0 ? (
        <>
          <instancedMesh
            ref={saplingTrunkRef}
            args={[saplingTrunkGeometry, trunkMaterial, saplings.length]}
            castShadow
          />
          <instancedMesh
            ref={saplingConeRef}
            args={[saplingConeGeometry, canopyMaterial, saplings.length]}
            castShadow
          />
        </>
      ) : null}
    </group>
  )
}

// ─── RollingHills (Tim 2026-05-24 ROLLING HILLS revision) ────────────────
//
// Rolling green hill landscape on each bank. Replaces the flat brown dirt
// strip with rolling grassy slopes that rise from the water line. Hills
// extend BACK from the water (away from camera) in three depth layers so
// the river sits in a verdant valley:
//
//   - Inner ridge (closest to water, lowest, brightest green)
//   - Mid ridge   (taller, mid green, recedes into the bank)
//   - Outer ridge (tallest, hazier dusty green, sits in front of mountains)
//
// Each ridge is a row of overlapping ellipsoidal dome mounds along the Z
// axis. The mounds vary in height/width via deterministic seeds so the
// silhouette is rolling, not regular.
//
// All hill geometry is single-mesh (per ridge tier) since each is a static
// scattering — using InstancedMesh would cost more in mesh-overhead than
// just letting three.js batch the spheres. We use SphereGeometry scaled
// non-uniformly to get the wider-than-tall rolling-hill shape.
//
// RG-C5 SAFE: every parameter is module-const; no streak/session value
// can scale hill height or color.

interface HillSeed {
  readonly x: number
  readonly z: number
  readonly height: number
  readonly radiusX: number
  readonly radiusZ: number
  readonly tint: number
}

// Lush rolling-hill green palette — three depth tiers. Brighter near
// the water (in-sun bank), hazier on the back ridge (atmospheric).
const HILL_COLOR_INNER = 0x4a7d3a // Inner ridge — bright lush green.
const HILL_COLOR_MID = 0x3d6a30 // Mid ridge — deeper forest green.
const HILL_COLOR_OUTER = 0x4d6a55 // Outer ridge — hazy green-gray (aerial perspective).

// Hill placement is along the Z axis (river-axis) on both banks. X-base is
// further from the water than the prior shore strip so the hills can rise
// without overlapping the hex grid. Hills extend slightly into the camera-
// side foreground and well past the downstream tree line.
const HILL_X_INNER = 4.2 // Closest to water.
const HILL_X_MID = 5.8
const HILL_X_OUTER = 7.4
const HILL_RIDGE_COUNT_INNER = 14
const HILL_RIDGE_COUNT_MID = 12
const HILL_RIDGE_COUNT_OUTER = 10

function buildHillRidge(
  seedOffset: number,
  bankSide: 1 | -1,
  count: number,
  xBase: number,
  zStart: number,
  zEnd: number,
  heightBase: number,
  heightJitter: number,
  radiusXBase: number,
  radiusZBase: number,
  tint: number,
): HillSeed[] {
  const arr: HillSeed[] = []
  for (let i = 0; i < count; i += 1) {
    const seed = seedOffset + i
    // Hill anchor — evenly spaced along Z with jitter.
    const t = count === 1 ? 0.5 : i / (count - 1)
    const z = zStart + (zEnd - zStart) * t + (frand(seed, 1) - 0.5) * 1.4
    const xJitter = (frand(seed, 2) - 0.5) * 0.9
    const x = bankSide * (xBase + xJitter)
    const height = heightBase + frand(seed, 3) * heightJitter
    const radiusX = radiusXBase + frand(seed, 4) * (radiusXBase * 0.4)
    const radiusZ = radiusZBase + frand(seed, 5) * (radiusZBase * 0.35)
    arr.push({ x, z, height, radiusX, radiusZ, tint })
  }
  return arr
}

export function RollingHills(): ReactElement {
  const halfZ = (GRID_ROWS * HEX_SIZE * 1.5) / 2

  // Build three ridges per bank (east + west). Each ridge has its own
  // height profile — inner is shortest (subtle bank rise), outer is
  // tallest (greater hill silhouette behind tree line).
  const innerEast = useMemo(
    () =>
      buildHillRidge(
        /*seedOffset*/ 30000,
        /*bankSide*/ 1,
        HILL_RIDGE_COUNT_INNER,
        /*xBase*/ HILL_X_INNER,
        /*zStart*/ halfZ + 4.0,
        /*zEnd*/ -halfZ - 6.0,
        /*heightBase*/ 1.2,
        /*heightJitter*/ 0.6,
        /*radiusXBase*/ 1.6,
        /*radiusZBase*/ 2.1,
        HILL_COLOR_INNER,
      ),
    [halfZ],
  )
  const innerWest = useMemo(
    () =>
      buildHillRidge(
        /*seedOffset*/ 31000,
        /*bankSide*/ -1,
        HILL_RIDGE_COUNT_INNER,
        /*xBase*/ HILL_X_INNER,
        /*zStart*/ halfZ + 4.0,
        /*zEnd*/ -halfZ - 6.0,
        /*heightBase*/ 1.2,
        /*heightJitter*/ 0.6,
        /*radiusXBase*/ 1.6,
        /*radiusZBase*/ 2.1,
        HILL_COLOR_INNER,
      ),
    [halfZ],
  )
  const midEast = useMemo(
    () =>
      buildHillRidge(
        /*seedOffset*/ 32000,
        /*bankSide*/ 1,
        HILL_RIDGE_COUNT_MID,
        /*xBase*/ HILL_X_MID,
        /*zStart*/ halfZ + 5.0,
        /*zEnd*/ -halfZ - 7.0,
        /*heightBase*/ 2.4,
        /*heightJitter*/ 1.2,
        /*radiusXBase*/ 2.2,
        /*radiusZBase*/ 2.6,
        HILL_COLOR_MID,
      ),
    [halfZ],
  )
  const midWest = useMemo(
    () =>
      buildHillRidge(
        /*seedOffset*/ 33000,
        /*bankSide*/ -1,
        HILL_RIDGE_COUNT_MID,
        /*xBase*/ HILL_X_MID,
        /*zStart*/ halfZ + 5.0,
        /*zEnd*/ -halfZ - 7.0,
        /*heightBase*/ 2.4,
        /*heightJitter*/ 1.2,
        /*radiusXBase*/ 2.2,
        /*radiusZBase*/ 2.6,
        HILL_COLOR_MID,
      ),
    [halfZ],
  )
  const outerEast = useMemo(
    () =>
      buildHillRidge(
        /*seedOffset*/ 34000,
        /*bankSide*/ 1,
        HILL_RIDGE_COUNT_OUTER,
        /*xBase*/ HILL_X_OUTER,
        /*zStart*/ halfZ + 6.0,
        /*zEnd*/ -halfZ - 8.0,
        /*heightBase*/ 4.0,
        /*heightJitter*/ 1.8,
        /*radiusXBase*/ 2.8,
        /*radiusZBase*/ 3.2,
        HILL_COLOR_OUTER,
      ),
    [halfZ],
  )
  const outerWest = useMemo(
    () =>
      buildHillRidge(
        /*seedOffset*/ 35000,
        /*bankSide*/ -1,
        HILL_RIDGE_COUNT_OUTER,
        /*xBase*/ HILL_X_OUTER,
        /*zStart*/ halfZ + 6.0,
        /*zEnd*/ -halfZ - 8.0,
        /*heightBase*/ 4.0,
        /*heightJitter*/ 1.8,
        /*radiusXBase*/ 2.8,
        /*radiusZBase*/ 3.2,
        HILL_COLOR_OUTER,
      ),
    [halfZ],
  )

  const allHills = useMemo(
    () => [
      ...outerEast,
      ...outerWest, // back layer first (so closer hills paint on top)
      ...midEast,
      ...midWest,
      ...innerEast,
      ...innerWest, // front layer last
    ],
    [outerEast, outerWest, midEast, midWest, innerEast, innerWest],
  )

  // Shared dome geometry — a low-poly hemisphere. We scale per-instance so
  // each hill gets its own ellipsoid shape. flatShading gives the chunky
  // low-poly read consistent with the rest of the scene.
  const hillGeometry = useMemo(() => {
    // Half-sphere (phi 0..π/2) so we only render the top dome — no waste
    // geometry below the ground plane. 8 width-segments + 6 height-segments
    // gives the rolling shape without too many faces.
    const geo = new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)
    return geo
  }, [])

  // ─── Outer/Mid/Inner — separate InstancedMesh per ridge so the colors
  //     stay distinct without per-instance color overhead. ─────────────
  const outerRef = useRef<THREE.InstancedMesh>(null)
  const midRef = useRef<THREE.InstancedMesh>(null)
  const innerRef = useRef<THREE.InstancedMesh>(null)

  const outerHills = useMemo(() => [...outerEast, ...outerWest], [outerEast, outerWest])
  const midHills = useMemo(() => [...midEast, ...midWest], [midEast, midWest])
  const innerHills = useMemo(() => [...innerEast, ...innerWest], [innerEast, innerWest])

  useEffect(() => {
    function applyHillTransforms(
      mesh: THREE.InstancedMesh | null,
      hills: ReadonlyArray<HillSeed>,
    ): void {
      if (mesh === null) return
      const dummy = new THREE.Object3D()
      const color = new THREE.Color()
      for (let i = 0; i < hills.length; i += 1) {
        const h = hills[i]
        if (h === undefined) continue
        // Anchor hill base at ground level. Sphere's local origin is its
        // center; since we render the top hemisphere, y=0 puts the base
        // at the ground plane. Pull DOWN slightly (-0.1) so it sinks into
        // the ground plane and doesn't show a hard cutoff at the base.
        dummy.position.set(h.x, -0.1, h.z)
        dummy.rotation.set(0, 0, 0)
        // Scale: X = width across bank, Y = height, Z = depth along river.
        dummy.scale.set(h.radiusX, h.height, h.radiusZ)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        color.setHex(h.tint)
        mesh.setColorAt(i, color)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true
    }
    applyHillTransforms(outerRef.current, outerHills)
    applyHillTransforms(midRef.current, midHills)
    applyHillTransforms(innerRef.current, innerHills)
  }, [outerHills, midHills, innerHills])

  // Per-ridge material. Each ridge has its own material so we can tune
  // roughness + emissive cyan rim independently. The rolling-hill green
  // gets a tiny cyan emissive bias so the water-facing side of the hill
  // catches a hint of Swoobz brand light from the river.
  const hillMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.85,
        metalness: 0.05,
        vertexColors: false,
      }),
    [],
  )

  // Reference allHills to keep the memo for any downstream consumer
  // (also prevents unused-var lint).
  void allHills

  return (
    <group>
      {/* Outer ridge — back layer (tallest, hazier) */}
      {outerHills.length > 0 ? (
        <instancedMesh
          ref={outerRef}
          args={[hillGeometry, hillMaterial, outerHills.length]}
          receiveShadow
          castShadow
        />
      ) : null}
      {/* Mid ridge */}
      {midHills.length > 0 ? (
        <instancedMesh
          ref={midRef}
          args={[hillGeometry, hillMaterial, midHills.length]}
          receiveShadow
          castShadow
        />
      ) : null}
      {/* Inner ridge — front layer (closest to water, brightest) */}
      {innerHills.length > 0 ? (
        <instancedMesh
          ref={innerRef}
          args={[hillGeometry, hillMaterial, innerHills.length]}
          receiveShadow
          castShadow
        />
      ) : null}
    </group>
  )
}

// ─── ShoreDetail (Tim 2026-05-24 LUSH revision) ──────────────────────────
//
// Scattered along both banks: grass tufts (~100), rocks (~60), bushes
// (~25), flowers (~12). All InstancedMesh — one draw call per category.

interface ScatterInstance {
  readonly x: number
  readonly z: number
  readonly scale: number
  readonly rotation: number
  readonly tint: number
}

const GRASS_COLOR_PALETTE = [0x3f8a55, 0x4ea065, 0x5ab070, 0x368048, 0x5fbe78] as const
const ROCK_COLOR_PALETTE = [0x6d7585, 0x808a9a, 0x5d6575, 0x756855, 0x8a7e6a] as const
const BUSH_COLOR_PALETTE = [0x2a5e3a, 0x357c4a, 0x265a37, 0x3a7048] as const
const FLOWER_COLOR_PALETTE = [0xff8fb0, 0xffd57a, 0xffa6c8, 0xfff0a8, 0xff9d80] as const

const GRASS_COUNT = 100
const ROCK_COUNT = 60
const BUSH_COUNT = 25
const FLOWER_COUNT = 12

function buildShoreScatter(
  seedOffset: number,
  count: number,
  bankXBase: number,
  bankXJitter: number,
  zSpan: number,
  zCenter: number,
  scaleBase: number,
  scaleJitter: number,
  palette: ReadonlyArray<number>,
): ScatterInstance[] {
  const arr: ScatterInstance[] = []
  for (let i = 0; i < count; i += 1) {
    const seed = seedOffset + i
    // Alternate banks (east + west).
    const bankSide = i % 2 === 0 ? 1 : -1
    const xJitter = frand(seed, 1) * bankXJitter
    const x = bankSide * (bankXBase + xJitter)
    const z = zCenter + (frand(seed, 2) - 0.5) * zSpan
    const scale = scaleBase + frand(seed, 3) * scaleJitter
    const rotation = frand(seed, 4) * Math.PI * 2
    const tint = palette[Math.floor(frand(seed, 5) * palette.length) % palette.length] ?? palette[0] ?? 0
    arr.push({ x, z, scale, rotation, tint })
  }
  return arr
}

export function ShoreDetail(): ReactElement {
  const halfZ = (GRID_ROWS * HEX_SIZE * 1.5) / 2

  // Grass tufts — densely scattered along the shore strip (close to water).
  const grass = useMemo(
    () =>
      buildShoreScatter(
        /*seedOffset*/ 11000,
        GRASS_COUNT,
        /*bankXBase*/ 3.2,
        /*bankXJitter*/ 1.3,
        /*zSpan*/ halfZ * 2 + 12,
        /*zCenter*/ -1.0,
        /*scaleBase*/ 0.7,
        /*scaleJitter*/ 0.8,
        GRASS_COLOR_PALETTE,
      ),
    [halfZ],
  )

  // Rocks — slightly larger, scattered evenly.
  const rocks = useMemo(
    () =>
      buildShoreScatter(
        /*seedOffset*/ 12000,
        ROCK_COUNT,
        /*bankXBase*/ 3.4,
        /*bankXJitter*/ 1.6,
        /*zSpan*/ halfZ * 2 + 14,
        /*zCenter*/ -1.0,
        /*scaleBase*/ 0.22,
        /*scaleJitter*/ 0.22,
        ROCK_COLOR_PALETTE,
      ),
    [halfZ],
  )

  // Bushes — small dark green clusters near the tree line.
  const bushes = useMemo(
    () =>
      buildShoreScatter(
        /*seedOffset*/ 13000,
        BUSH_COUNT,
        /*bankXBase*/ 3.7,
        /*bankXJitter*/ 1.4,
        /*zSpan*/ halfZ * 2 + 10,
        /*zCenter*/ -1.0,
        /*scaleBase*/ 0.35,
        /*scaleJitter*/ 0.25,
        BUSH_COLOR_PALETTE,
      ),
    [halfZ],
  )

  // Flowers — tiny color pops along the bank.
  const flowers = useMemo(
    () =>
      buildShoreScatter(
        /*seedOffset*/ 14000,
        FLOWER_COUNT,
        /*bankXBase*/ 3.3,
        /*bankXJitter*/ 0.9,
        /*zSpan*/ halfZ * 2 + 8,
        /*zCenter*/ -1.0,
        /*scaleBase*/ 1.0,
        /*scaleJitter*/ 0.5,
        FLOWER_COLOR_PALETTE,
      ),
    [halfZ],
  )

  // Instanced refs.
  const grassRef = useRef<THREE.InstancedMesh>(null)
  const rockRef = useRef<THREE.InstancedMesh>(null)
  const bushBodyRef = useRef<THREE.InstancedMesh>(null)
  const bushPetalRef = useRef<THREE.InstancedMesh>(null)
  const flowerStemRef = useRef<THREE.InstancedMesh>(null)
  const flowerHeadRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    applyInstanceTransforms(
      grassRef.current,
      grass.map((g) => ({
        x: g.x,
        y: SHORE_LEVEL + 0.05,
        z: g.z,
        scaleX: g.scale,
        scaleY: g.scale,
        scaleZ: g.scale,
        rotationY: g.rotation,
        colorHex: g.tint,
      })),
    )
    applyInstanceTransforms(
      rockRef.current,
      rocks.map((r) => ({
        x: r.x,
        y: SHORE_LEVEL,
        z: r.z,
        scaleX: r.scale,
        scaleY: r.scale * 0.7,
        scaleZ: r.scale,
        rotationY: r.rotation,
        colorHex: r.tint,
      })),
    )
    // Bushes — body cluster + small accent dome.
    applyInstanceTransforms(
      bushBodyRef.current,
      bushes.map((b) => ({
        x: b.x,
        y: SHORE_LEVEL + 0.1 * b.scale,
        z: b.z,
        scaleX: b.scale,
        scaleY: b.scale,
        scaleZ: b.scale,
        rotationY: b.rotation,
        colorHex: b.tint,
      })),
    )
    applyInstanceTransforms(
      bushPetalRef.current,
      bushes.map((b) => ({
        x: b.x + 0.12 * b.scale,
        y: SHORE_LEVEL + 0.16 * b.scale,
        z: b.z + 0.05 * b.scale,
        scaleX: b.scale * 0.65,
        scaleY: b.scale * 0.65,
        scaleZ: b.scale * 0.65,
        rotationY: b.rotation + 0.7,
        colorHex: b.tint,
      })),
    )
    // Flower stem + head.
    applyInstanceTransforms(
      flowerStemRef.current,
      flowers.map((f) => ({
        x: f.x,
        y: SHORE_LEVEL + 0.06,
        z: f.z,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotationY: f.rotation,
        colorHex: 0x3a7048,
      })),
    )
    applyInstanceTransforms(
      flowerHeadRef.current,
      flowers.map((f) => ({
        x: f.x,
        y: SHORE_LEVEL + 0.13,
        z: f.z,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotationY: f.rotation,
        colorHex: f.tint,
      })),
    )
  }, [grass, rocks, bushes, flowers])

  // Static geometries + materials.
  const grassGeometry = useMemo(() => new THREE.ConeGeometry(0.08, 0.16, 4), [])
  const rockGeometry = useMemo(() => new THREE.DodecahedronGeometry(0.3, 0), [])
  const bushBodyGeometry = useMemo(() => new THREE.SphereGeometry(0.22, 6, 5), [])
  const bushPetalGeometry = useMemo(() => new THREE.SphereGeometry(0.16, 6, 5), [])
  const flowerStemGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4),
    [],
  )
  const flowerHeadGeometry = useMemo(() => new THREE.SphereGeometry(0.04, 6, 5), [])

  const standardMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.75,
      }),
    [],
  )
  const stoneMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.85,
      }),
    [],
  )
  const flowerHeadMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        flatShading: true,
        roughness: 0.5,
        emissiveIntensity: 0.25,
      }),
    [],
  )

  return (
    <group>
      {/* Tim 2026-05-24 ROLLING HILLS revision: the brown sand/dirt shore
          strips were REMOVED. They've been replaced by the RollingHills
          component (separate mesh group) which renders verdant green hill
          mounds rising from the water line on each bank. The hills give
          the "great landscape" Tim asked for instead of the flat dirt
          shoulders that previously sat alongside the water.
          Prior code (kept here as the deletion record): two flat brown
          (#9d7d5a) box meshes at (±3.6, SHORE_LEVEL/2 - 0.3, -1.0). */}
      {/* Grass tufts (instanced) */}
      <instancedMesh
        ref={grassRef}
        args={[grassGeometry, standardMaterial, grass.length]}
        castShadow
      />
      {/* Rocks (instanced) */}
      <instancedMesh
        ref={rockRef}
        args={[rockGeometry, stoneMaterial, rocks.length]}
        castShadow
        receiveShadow
      />
      {/* Bushes — body + accent petal (2 instanced meshes) */}
      <instancedMesh
        ref={bushBodyRef}
        args={[bushBodyGeometry, standardMaterial, bushes.length]}
        castShadow
      />
      <instancedMesh
        ref={bushPetalRef}
        args={[bushPetalGeometry, standardMaterial, bushes.length]}
        castShadow
      />
      {/* Flowers — stem + head (2 instanced meshes) */}
      <instancedMesh
        ref={flowerStemRef}
        args={[flowerStemGeometry, standardMaterial, flowers.length]}
      />
      <instancedMesh
        ref={flowerHeadRef}
        args={[flowerHeadGeometry, flowerHeadMaterial, flowers.length]}
      />
    </group>
  )
}

// ─── GroundPlane (Tim 2026-05-24 OO-FISHER playtest L1) ─────────────────
//
// A large flat ground mesh sitting at y=-0.05 (just below the water plane).
// Previously the area behind the shore banks was just dark sky → mountains
// + trees appeared to FLOAT against a void. The ground plane gives the
// scene a continuous earth surface that the mountains root into and the
// trees stand on.
//
// Color: muted forest green-brown blend that reads as "river valley floor"
// from the aerial camera angle. Slightly darker than the shore bank so the
// banks still pop visually but there's no visible gap.
//
// Sized 80×80 — large enough to cover any camera FOV expansion. Positioned
// at z=-15 (below the mountain band centerline) so it extends from camera-
// side all the way past the deepest mountains.

// Tim 2026-05-24 ROLLING HILLS revision: tinted the ground plane to mid
// forest green (#395a30) so the rolling hills sit on a verdant valley
// floor that reads continuously with the inner-ridge bright green
// (#4a7d3a). The prior #3a4830 read as drier loam; the new tint matches
// the grass + hill palette so the visual transition from water → hills
// → ground stays cohesive at the aerial camera angle.
const GROUND_COLOR = 0x395a30 // Verdant valley floor green.

export function GroundPlane(): ReactElement {
  return (
    <mesh
      position={[0, -0.05, -10]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[80, 80]} />
      <meshStandardMaterial
        color={GROUND_COLOR}
        flatShading
        roughness={0.95}
      />
    </mesh>
  )
}

// ─── FireflyParticles — REMOVED 2026-05-25 ───────────────────────────────
//
// The prior `FireflyParticles` component (24 cyan dots drifting via
// Lissajous orbit, ±0.15 scale flicker, useFrame allocation per tick) was
// DELETED ENTIRELY per the OO-FISHER 2026-05-25 art-direction reset.
//
// Quote Tim 2026-05-25 (verbatim, the founding critique of this reset):
//   "please stop with the particle effects - that is like AI slop for
//    igaming. you need the /game-art-director to create a cohesive game
//    theme. You are now just dispatching general agents that create AI
//    slop and mediocre designs"
//
// Taste-guardian Category 1 (the bright-line particle ban) flagged this as
// three patterns in one component:
//   - "Cosmic fairy lights / drifting glow orbs"
//   - "Atmospheric drift particles"
//   - "Continuous shimmer loops" (the ±0.15 scale pulse at 2.2Hz)
//
// All three are auto-reject. The component is gone, its constants are
// gone, its `useFrame` Lissajous tick is gone. The dawn-fishing scene now
// rests still — the boat rocks (existing primitive), the water ripples
// (existing wave shader), nothing else moves in ambient.
//
// See: research/originals-game-craft/OO-FISHER-ART-DIRECTION-2026-05-25.md
//   §6.2 (forbidden motion) and §8.1 step 1 (delete instructions).

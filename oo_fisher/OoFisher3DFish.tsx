'use client'

/**
 * OoFisher3DFish — the underwater fish + catch celebration meshes.
 *
 * Two components:
 *   - SwimmingFish: a deterministic flock of low-poly fish circling at
 *     various depths under the hex grid. Animated via useFrame.
 *   - CatchJump: a single fish that arcs out of the water at the targeted
 *     hex when the rarity prop flips from null. RG-C5 STRUCTURAL — the
 *     arc amplitude + duration are IDENTICAL across all rarities; only
 *     the fish tint differs.
 *
 * Domain C: presentation only. Animation timing is read from MODULE-CONST
 * values (no streak-derived parameters).
 */

import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { GRID_COLS, GRID_ROWS, HEX_SIZE, type HexTileData } from './ooFisher3DHexGrid'
import { type DepthTier, type FishRarity, RARITY_VISUALS } from './ooFisherMath'

/** OS prefers-reduced-motion flag — freezes ambient/decorative 3D motion. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = (e: MediaQueryListEvent): void => setReduced(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** Catch-jump arc duration — MODULE-CONST per RG-C5. */
export const FISH_JUMP_DURATION_MS = 900

function rarityToColor(rarity: FishRarity): THREE.Color {
  const rgb = RARITY_VISUALS[rarity].rgb.split(',').map((s) => Number(s.trim()))
  return new THREE.Color(
    (rgb[0] ?? 244) / 255,
    (rgb[1] ?? 246) / 255,
    (rgb[2] ?? 250) / 255,
  )
}

// ─── SwimmingFish ────────────────────────────────────────────────────────

interface FishEntry {
  readonly x: number
  readonly z: number
  readonly tier: DepthTier
  readonly speed: number
  readonly phase: number
  readonly bodyColor: number
  readonly accentColor: number
}

const FISH_COLORS: Record<DepthTier, { body: number; accent: number }> = {
  1: { body: 0xb8d4d4, accent: 0xffffff }, // pale silver
  2: { body: 0x6fc0c4, accent: 0xe2f4f4 }, // teal
  3: { body: 0x8aa8e0, accent: 0xc8d4f4 }, // soft blue
  4: { body: 0xc88aff, accent: 0xe8d0ff }, // lavender (rare)
  5: { body: 0xffaa55, accent: 0xffd590 }, // amber (mythic)
}

export function SwimmingFish({
  count = 12,
}: {
  readonly count?: number
}): ReactElement {
  const groupRef = useRef<THREE.Group>(null)
  const reducedMotion = usePrefersReducedMotion()
  const fishData = useMemo<FishEntry[]>(() => {
    const halfX = (GRID_COLS * HEX_SIZE * 1.5) / 2
    const halfZ = (GRID_ROWS * HEX_SIZE * 1.5) / 2
    const arr: FishEntry[] = []
    for (let i = 0; i < count; i += 1) {
      const tier = (((i % 5) + 1) as 1 | 2 | 3 | 4 | 5)
      const colors = FISH_COLORS[tier]
      // Deterministic placement — same seed every render.
      const seed = (i * 2654435761) >>> 0
      const x = ((seed & 0xffff) / 0xffff) * (halfX * 2) - halfX
      const z = (((seed >> 16) & 0xffff) / 0xffff) * (halfZ * 2) - halfZ
      arr.push({
        x,
        z,
        tier,
        speed: 0.15 + ((seed >> 4) & 0xff) / 0xff * 0.25,
        phase: ((seed >> 8) & 0xff) / 0xff * Math.PI * 2,
        bodyColor: colors.body,
        accentColor: colors.accent,
      })
    }
    return arr
  }, [count])

  useFrame((state) => {
    if (groupRef.current === null) return
    // Reduced-motion: freeze the flock at a static layout (no perpetual
    // circling). animotty fix — the ambient swim was the one 3D loop that
    // leaked past the reduced-motion gate.
    if (reducedMotion) {
      groupRef.current.children.forEach((child, idx) => {
        const f = fishData[idx]
        if (f === undefined) return
        child.position.set(f.x, -0.18 - f.tier * 0.04, f.z)
        child.rotation.y = Math.PI / 2
      })
      return
    }
    const t = state.clock.getElapsedTime()
    groupRef.current.children.forEach((child, idx) => {
      const f = fishData[idx]
      if (f === undefined) return
      const angle = t * f.speed + f.phase
      const rad = 0.6 + f.tier * 0.15
      child.position.x = f.x + Math.cos(angle) * rad
      child.position.z = f.z + Math.sin(angle) * rad
      child.position.y =
        -0.18 - f.tier * 0.04 + Math.sin(t * 2 + f.phase) * 0.015
      child.rotation.y = -angle + Math.PI / 2
    })
  })

  return (
    <group ref={groupRef}>
      {fishData.map((f, i) => (
        <group key={i} position={[f.x, -0.18, f.z]}>
          {/* Body — elongated box */}
          <mesh>
            <boxGeometry args={[0.12, 0.06, 0.22]} />
            <meshStandardMaterial color={f.bodyColor} flatShading roughness={0.5} />
          </mesh>
          {/* Tail — small triangular fin (cone) */}
          <mesh position={[0, 0, -0.13]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.05, 0.07, 4]} />
            <meshStandardMaterial color={f.accentColor} flatShading roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ─── CatchJump ───────────────────────────────────────────────────────────

interface CatchJumpProps {
  readonly rarity: FishRarity | null
  readonly targetTile: HexTileData | null
  readonly reducedMotion: boolean
}

/**
 * When `rarity` flips from null to a concrete value, a fish arcs out of
 * the water at the targeted tile. RG-C5 STRUCTURAL: the arc amplitude,
 * duration, and audio (fired in the provider) are IDENTICAL across all
 * rarities — only the fish TINT differs.
 */
export function CatchJump({
  rarity,
  targetTile,
  reducedMotion,
}: CatchJumpProps): ReactElement | null {
  const meshRef = useRef<THREE.Group>(null)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (rarity === null) {
      startedAtRef.current = null
      return
    }
    startedAtRef.current = performance.now()
  }, [rarity])

  useFrame(() => {
    if (meshRef.current === null) return
    if (startedAtRef.current === null) {
      meshRef.current.visible = false
      return
    }
    const elapsed = performance.now() - startedAtRef.current
    if (elapsed > FISH_JUMP_DURATION_MS) {
      meshRef.current.visible = false
      return
    }
    meshRef.current.visible = true
    const t = elapsed / FISH_JUMP_DURATION_MS // 0..1
    // Parabolic arc: peak at t=0.5.
    const arcY = -Math.pow(t * 2 - 1, 2) + 1
    const heightAmp = reducedMotion ? 0.2 : 0.8
    meshRef.current.position.y = -0.05 + arcY * heightAmp
    // No spin under reduced-motion — just a low, calm reveal (animotty fix).
    meshRef.current.rotation.x = reducedMotion ? 0 : t * Math.PI * 1.2
  })

  if (rarity === null || targetTile === null) return null

  const color = rarityToColor(rarity)
  return (
    <group ref={meshRef} position={[targetTile.x, -0.05, targetTile.z]}>
      <mesh>
        <boxGeometry args={[0.16, 0.09, 0.32]} />
        <meshStandardMaterial color={color} flatShading roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, -0.2]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.07, 0.1, 4]} />
        <meshStandardMaterial color={color} flatShading roughness={0.4} />
      </mesh>
    </group>
  )
}

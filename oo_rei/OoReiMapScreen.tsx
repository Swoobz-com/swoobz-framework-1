'use client'

/**
 * OoReiMapScreen — Myth-of-REI interactive island map, full-canvas takeover.
 *
 * Layer stack:
 *   z-0  base map raster (object-fit:contain, dimmed 0.55 brightness)
 *   z-1  9 region cutout PNGs (full-canvas 1024×1024, object-fit:contain,
 *          pixel-registered with the base map) — per-state filter drives
 *          sealed/active/cleared appearance; NO SVG polygon veil
 *   z-2  SVG markers layer (viewBox 0 0 1024 1024 / xMidYMid meet —
 *          matches contain letterbox) — pointer-events:none
 *          Amber progression path, hanko stamps, spirit glyphs, talisman-curl
 *   z-3  Region detail panel (mounted on region tap)
 *   z-4  Close button (mounted only while detail panel is open)
 *
 * Hit-testing via colormask (pixel-perfect, no polygons):
 *   tamashii-jima-colormask.png drawn to an off-screen canvas once; pointer
 *   events on the map container convert client→intrinsic coords, sample the
 *   pixel, snap to the nearest palette colour from the manifest, resolve the
 *   region slug. Throttled with rAF; ImageData cached after first draw.
 *
 * RG compliance (HARD — do not weaken):
 *   RG-C1: zero USDC on this surface; chapter-close fires post-settle
 *   RG-C5: ALL animation constants are module-level `as const` — cannot
 *           be derived from session / streak / region identity / wager size
 *   No proximity nudges — gauge fill only, ZERO "N more spins" copy
 *   Map never regresses (deriveRegionState is monotonic)
 *   Locked teasers honest — factual unlock condition, no reward promise
 *
 * Feel spec: game-feel-engineer 2026-05-29
 * Domain C: presentation only. ZERO financial arithmetic.
 */

import {
  type CSSProperties,
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  MYTH_REGIONS,
  deriveRegionState,
  type DerivedMythRegion,
  type MythRegionConfig,
  type MythRegionState,
} from './ooReiMythRegions'
import {
  buildRegionLabelBuffer,
  type PaletteEntry,
} from './ooReiMapHitTestBuffer'

// ─── Fluid type scale ─────────────────────────────────────────────────────────
function fluid(minPx: number, maxPx: number): string {
  const slope = ((maxPx - minPx) / (1600 - 320)) * 100
  const intercept = minPx - slope * (320 / 100)
  return `clamp(${minPx}px, ${intercept.toFixed(2)}px + ${slope.toFixed(3)}vw, ${maxPx}px)`
}

// ─── Palette ─────────────────────────────────────────────────────────────────
// OO-REI Anime Cinematic register. ZERO cyan. Amber-only accent economy.
const AMBER          = '#d4892a' as const
const TALISMAN_GLOW  = '#f4a73e' as const
const VERMILLION     = '#c0392b' as const
const TALISMAN_PAPER = '#e8dfc8' as const
const CHARCOAL       = '#1a1612' as const

// ─── Animation timing constants (module-level `as const` — RG-C5 structural) ─
// NEVER derive from props / session / streak / region identity. Code commit only.
const MAP_ENTER_DURATION_MS                  = 280  as const
const MAP_EXIT_DURATION_MS                   = 200  as const
const REGION_HOVER_DURATION_MS               = 150  as const
const REGION_DIM_DURATION_MS                 = 180  as const
const REGION_HOVER_LABEL_DURATION_MS         = 120  as const
const REGION_PRESS_ACK_DURATION_MS           = 80   as const
const REGION_PRESS_REBOUND_DURATION_MS       = 100  as const
const SEAL_MIST_LIFT_ANTICIPATION_MS         = 240  as const
const SEAL_MIST_LIFT_DURATION_MS             = 600  as const
const SEAL_MIST_LIFT_RECOVER_MS              = 220  as const
const SEAL_HANKO_STAMP_DELAY_MS              = 165  as const
const SEAL_HANKO_STAMP_DURATION_MS           = 200  as const
const DETAIL_PANEL_ENTER_MOBILE_DURATION_MS  = 260  as const
const DETAIL_PANEL_ENTER_DESKTOP_DURATION_MS = 220  as const
const DETAIL_PANEL_EXIT_DURATION_MS          = 180  as const
const DETAIL_VISTA_REVEAL_DELAY_MS           = 120  as const
const DETAIL_VISTA_REVEAL_DURATION_MS        = 320  as const
const DETAIL_RECOVERY_MS                     = 220  as const
const CLOSE_BUTTON_PRESS_DURATION_MS         = 80   as const
const GUIDING_RING_PULSE_DURATION_MS         = 2500 as const
const PATH_SEGMENT_REVEAL_DURATION_MS        = 400  as const
// Talisman-curl: continuous ambient at ~0.04Hz (25s period, matches GUIDING_RING).
// Declared as the ONE secondary ambient named in the scene doc.
// RG-C5: duration is fixed, cannot be derived from game state.
const TALISMAN_CURL_DURATION_MS              = 25000 as const
// Talisman paper strip at REI's position — opacity flutter (1.2s period).
// RG-C5: module-const, identical regardless of region / session state.
const TALISMAN_FLUTTER_PERIOD_MS             = 1200  as const

// ─── Colormask constants ─────────────────────────────────────────────────────
const COLORMASK_SIZE = 1024 as const
// Hysteresis: how many ms of consecutive -1 samples before we clear the hover.
// Prevents single-frame boundary jitter from flashing the highlight off.
const HOVER_CLEAR_HYSTERESIS_MS = 75 as const

// ─── Easing curves (CSS cubic-bezier strings) ────────────────────────────────
const EASE_SNAP_OUT  = 'cubic-bezier(0.2, 0, 0, 1)'        as const
const EASE_CARBON_IN = 'cubic-bezier(0, 0, 0.25, 1)'       as const
const EASE_CARBON_OUT = 'cubic-bezier(0.25, 0, 1, 1)'      as const
const EASE_OVERSHOOT = 'cubic-bezier(0.34, 1.56, 0.64, 1)' as const

// ─── SVG / colormask intrinsic size ──────────────────────────────────────────
// The base map, cutout PNGs and colormask are all 1024×1024.
const MAP_SIZE = 1024 as const

// ─── useReducedMotion hook ────────────────────────────────────────────────────
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

// ─── useIsDesktopHover hook ───────────────────────────────────────────────────
// Guards all hover juice — NEVER fires on touch devices.
function useIsDesktopHover(): boolean {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover)')
    setIsDesktop(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isDesktop
}

// ─── Colormask hit-test hook ──────────────────────────────────────────────────
// Loads the colormask PNG once into an off-screen canvas. On load it calls
// buildRegionLabelBuffer (pure helper — see ooReiMapHitTestBuffer.ts) which
// applies a CONFIDENT classify + SPATIAL region-grow to fill every land pixel
// with the correct region index, including dark ink borders and AA edges.
//
// The hot-path hit-test is O(1): index into the precomputed Int16Array.
//
// Flicker suppression:
//   1. Only calling setHoveredRegionId when the resolved region CHANGES.
//   2. HOVER_CLEAR_HYSTERESIS_MS debounce before clearing to null: the first
//      -1 sample starts a timer; if a non-(-1) sample arrives within that
//      window the timer is cancelled and we never clear. pointerleave bypasses
//      the debounce and clears immediately (the pointer left the container).
function useColormaskHitTest(
  containerRef: RefObject<HTMLDivElement | null>,
) {
  // Precomputed filled region-id buffer. Value is MYTH_REGIONS index (≥0) or -1.
  const regionBufferRef = useRef<Int16Array | null>(null)
  const loadingRef      = useRef(false)

  // Build palette entries for buildRegionLabelBuffer.
  // Each entry carries the MYTH_REGIONS flat index as `idx` so the helper
  // stores the correct array index directly, not a palette-internal index.
  const paletteEntries = useMemo((): ReadonlyArray<PaletteEntry> => {
    const entries: PaletteEntry[] = []
    for (let mythIdx = 0; mythIdx < MYTH_REGIONS.length; mythIdx++) {
      const region = MYTH_REGIONS[mythIdx]!
      if (region.maskColor === null) continue
      const hex = region.maskColor as string
      const rv = parseInt(hex.slice(1, 3), 16)
      const gv = parseInt(hex.slice(3, 5), 16)
      const bv = parseInt(hex.slice(5, 7), 16)
      entries.push({ idx: mythIdx, r: rv, g: gv, b: bv })
    }
    return entries
  }, [])

  // Load colormask → build filled buffer (once) via spatial region-grow.
  useEffect(() => {
    if (regionBufferRef.current !== null || loadingRef.current) return
    loadingRef.current = true

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = '/assets/generated/oo-rei/myth/tamashii-jima-colormask.png'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = COLORMASK_SIZE
      canvas.height = COLORMASK_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) { loadingRef.current = false; return }
      ctx.drawImage(img, 0, 0, COLORMASK_SIZE, COLORMASK_SIZE)
      const imageData = ctx.getImageData(0, 0, COLORMASK_SIZE, COLORMASK_SIZE)

      // Delegate the entire buffer build to the pure helper.
      // The helper performs: (1) confident classify, (2) spatial region-grow,
      // (3) promote unreachable -2 → -1.  Dark ink borders and AA edges are
      // resolved spatially — never by unstable colour-nearest.
      regionBufferRef.current = buildRegionLabelBuffer(
        imageData.data,
        COLORMASK_SIZE,
        COLORMASK_SIZE,
        paletteEntries,
      )
      loadingRef.current = false
    }
    img.onerror = () => { loadingRef.current = false }
  // paletteEntries is stable (memo on MYTH_REGIONS constant) — safe dep.
  }, [paletteEntries])

  /**
   * O(1) hit-test. Returns the region slug under the pointer, or null for
   * sea / background / letterbox bars / buffer not yet loaded.
   *
   * Accounts for object-fit:contain letterboxing via the same scale/offset
   * math as before.
   */
  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      if (!regionBufferRef.current) return null
      const container = containerRef.current
      if (!container) return null

      const rect = container.getBoundingClientRect()
      const cw = rect.width
      const ch = rect.height

      // object-fit:contain: scale the 1024×1024 image to fit within cw×ch
      // maintaining aspect ratio, centred.
      const scale = Math.min(cw / MAP_SIZE, ch / MAP_SIZE)
      const renderW = MAP_SIZE * scale
      const renderH = MAP_SIZE * scale
      const offsetX = (cw - renderW) / 2
      const offsetY = (ch - renderH) / 2

      // Pointer coords relative to container
      const px = clientX - rect.left
      const py = clientY - rect.top

      // Outside letterbox bars → no region
      if (px < offsetX || px > offsetX + renderW) return null
      if (py < offsetY || py > offsetY + renderH) return null

      // Map to intrinsic pixel coords
      const ix = Math.max(0, Math.min(COLORMASK_SIZE - 1, Math.floor((px - offsetX) / scale)))
      const iy = Math.max(0, Math.min(COLORMASK_SIZE - 1, Math.floor((py - offsetY) / scale)))

      const regionIdx = regionBufferRef.current[iy * COLORMASK_SIZE + ix]!
      if (regionIdx < 0) return null
      return MYTH_REGIONS[regionIdx]?.id ?? null
    },
    [containerRef],
  )

  return hitTest
}

// ─── Props ────────────────────────────────────────────────────────────────────
export interface OoReiMapScreenProps {
  /** Count of sealed spirits from the provider (monotonically increasing). */
  sealedSpiritCount: number
  /** Whether the map screen is open. */
  open: boolean
  /** Called when the player closes the map screen. */
  onClose: () => void
  /** Pass true to suppress all micro-animations (prefers-reduced-motion). */
  reducedMotion?: boolean
  /**
   * Factual spin count for the current active region cycle.
   * Used for "Current cycle: N spins." in the info panel — factual only,
   * zero proximity nudge or "N more spins" copy. Optional; falls back to 0.
   */
  spinCountThisCycle?: number
  /**
   * How many cycles the player has completed for the current active region.
   * Used to drive the OoReiCycleTotem in the info panel.
   * Optional; falls back to 0. Factual history, not proximity nudge (RG-C3).
   */
  cyclesCompletedThisRegion?: number
}

// ─── Region unlock card duration (module-level `as const` — RG-C5) ───────────
// 2200ms full-canvas moment. No buttons. Fires post-settle only (not during spin).
// RG-C5: constant, not derived from session state or win frequency.
const REGION_UNLOCK_CARD_DURATION_MS = 2200 as const

// ─── Seal-lift state per region ───────────────────────────────────────────────
type SealLiftPhase = 'idle' | 'anticipation' | 'lifting' | 'recovering' | 'done'
interface SealLiftState {
  phase: SealLiftPhase
  clearedAt: number  // performance.now() stamp — never wall clock
}

// ─── Component ────────────────────────────────────────────────────────────────
export function OoReiMapScreen({
  sealedSpiritCount,
  open,
  onClose,
  reducedMotion: reducedMotionProp,
  spinCountThisCycle = 0,
  cyclesCompletedThisRegion = 0,
}: OoReiMapScreenProps): ReactElement | null {
  const reducedMotionSystem = useReducedMotion()
  const reducedMotion = reducedMotionProp ?? reducedMotionSystem
  const isDesktopHover = useIsDesktopHover()

  const containerRef = useRef<HTMLDivElement>(null)
  const hitTest = useColormaskHitTest(containerRef)

  // Throttle pointer-move sampling with rAF
  const rafRef = useRef<number | null>(null)

  // ── Derive full region state from sealed count ──────────────────────────────
  const derivation = useMemo(
    () => deriveRegionState(sealedSpiritCount),
    [sealedSpiritCount],
  )

  // ── Hover state (slug or null) ───────────────────────────────────────────────
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null)
  // Track the last region we reported so we only setState on actual changes.
  const lastHoveredRef = useRef<string | null>(null)
  // Hysteresis timer: started when we first see a -1 sample; cancelled if we
  // re-enter a valid region within HOVER_CLEAR_HYSTERESIS_MS. Prevents single-
  // frame boundary crossings from flashing the highlight off.
  const clearHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Pressed region for press-ack bounce ──────────────────────────────────────
  const [pressedRegionId, setPressedRegionId] = useState<string | null>(null)
  const [pressRebounding, setPressRebounding] = useState<string | null>(null)

  // ── Selected detail region ───────────────────────────────────────────────────
  const [detailRegionId, setDetailRegionId] = useState<string | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailInteractive, setDetailInteractive] = useState(false)
  const [vistaVisible, setVistaVisible] = useState(false)

  // ── Close button press-ack ───────────────────────────────────────────────────
  const [closePressed, setClosePressed] = useState(false)

  // ── Seal-lift per region ─────────────────────────────────────────────────────
  const [sealLiftState, setSealLiftState] = useState<Record<string, SealLiftState>>({})
  const prevSealedCount = useRef<number>(sealedSpiritCount)

  // ── Hanko stamps: once cleared, always shown ─────────────────────────────────
  const [hankoVisible, setHankoVisible] = useState<Set<string>>(new Set())

  // ── Region unlock card state ──────────────────────────────────────────────────
  // Fires when currentRegionId changes to a newly-ACTIVE region (sealedSpiritCount
  // crosses a threshold). Full-canvas z-51, 2200ms, no buttons, post-settle only.
  // RG-C5: duration REGION_UNLOCK_CARD_DURATION_MS is module-const — not derived
  // from session state.
  const [unlockCardRegionId, setUnlockCardRegionId] = useState<string | null>(null)
  const [unlockCardVisible, setUnlockCardVisible] = useState(false)
  const prevCurrentRegionIdRef = useRef<string>('')
  const unlockCardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Screen enter/exit animation state ────────────────────────────────────────
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Live container size (for projecting 1024-space centroids → real px) ───────
  // The map raster + SVG markers use object-fit:contain / xMidYMid-meet. To render
  // a CRISP, real-px label (SVG text shrinks illegibly in the scaled 1024 viewBox,
  // Tim #3 "map text not readable"), we project centroids into container px via the
  // same contain transform and place a DOM card. Tracked with a ResizeObserver.
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  // ── Manage screen mount/unmount with fade ────────────────────────────────────
  useEffect(() => {
    if (open) {
      setMounted(true)
      setExiting(false)
    } else if (mounted) {
      setExiting(true)
      exitTimerRef.current = setTimeout(() => {
        setMounted(false)
        setExiting(false)
      }, reducedMotion ? 0 : MAP_EXIT_DURATION_MS)
    }
    return () => {
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Track container size for centroid → px projection ────────────────────────
  // Re-attaches when the map mounts (containerRef is null while closed).
  useEffect(() => {
    if (!mounted) return
    const el = containerRef.current
    if (!el) return
    const apply = (w: number, h: number) => setContainerSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }))
    const r = el.getBoundingClientRect()
    apply(r.width, r.height)
    const ro = new ResizeObserver(entries => {
      const cr = entries[0]?.contentRect
      if (cr) apply(cr.width, cr.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mounted])

  // ── Project a 1024-space point into container px (object-fit:contain math) ────
  // Matches the base raster (objectFit:contain) + SVG (xMidYMid meet) + colormask
  // hit-test (min-scale), so the label dot sits EXACTLY on the rendered region.
  const projectCentroid = useCallback(
    (cx: number, cy: number): { px: number; py: number; scale: number } | null => {
      const { w, h } = containerSize
      if (w <= 0 || h <= 0) return null
      const scale = Math.min(w / MAP_SIZE, h / MAP_SIZE)
      const offsetX = (w - MAP_SIZE * scale) / 2
      const offsetY = (h - MAP_SIZE * scale) / 2
      return { px: offsetX + cx * scale, py: offsetY + cy * scale, scale }
    },
    [containerSize],
  )

  // ── Detect region change → fire region unlock card ───────────────────────────
  // Fires when the active region changes (sealedSpiritCount crosses threshold).
  // The card is: full-canvas z-51, 2200ms, no buttons, fires post-settle only.
  // The guard `prevCurrentRegionIdRef` prevents firing on initial mount (we only
  // want transitions, not the initial state). We also skip firing on count 0 →
  // storm-coast (that is the starting state, not a reveal moment).
  useEffect(() => {
    const nextId = derivation.currentRegionId
    const prevId = prevCurrentRegionIdRef.current

    // Skip: same region, or initial empty→storm-coast on first mount.
    if (nextId !== prevId && prevId !== '' && nextId !== '') {
      // New region unlocked — fire the unlock card.
      const guardKey = `oo-rei-region-unlock-card-${nextId}`
      if (typeof window !== 'undefined' && sessionStorage.getItem(guardKey)) {
        // Already fired this session — do not re-fire.
      } else {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(guardKey, '1')
        }
        setUnlockCardRegionId(nextId)
        setUnlockCardVisible(true)
        if (unlockCardTimerRef.current !== null) clearTimeout(unlockCardTimerRef.current)
        unlockCardTimerRef.current = setTimeout(() => {
          setUnlockCardVisible(false)
          setTimeout(() => {
            setUnlockCardRegionId(null)
          }, reducedMotion ? 0 : 300)
        }, reducedMotion ? 0 : REGION_UNLOCK_CARD_DURATION_MS)
      }
    }
    prevCurrentRegionIdRef.current = nextId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [derivation.currentRegionId])

  // ── Cleanup rAF, hysteresis timer, and unlock card timer on unmount ───────────
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (clearHoverTimerRef.current !== null) clearTimeout(clearHoverTimerRef.current)
      if (unlockCardTimerRef.current !== null) clearTimeout(unlockCardTimerRef.current)
    }
  }, [])

  // ── Detect spirit-seal events and trigger mist-lift sequence ─────────────────
  useEffect(() => {
    const prev = prevSealedCount.current
    const next = sealedSpiritCount
    if (next > prev) {
      for (const dr of derivation.regions) {
        if (
          dr.region.traversalOrder <= next &&
          dr.region.traversalOrder > prev &&
          dr.region.authored
        ) {
          const id = dr.region.id
          const guardKey = `oo-rei-seal-burst-${id}`
          if (typeof window !== 'undefined' && sessionStorage.getItem(guardKey)) {
            continue
          }
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(guardKey, '1')
          }
          if (reducedMotion) {
            setSealLiftState(s => ({
              ...s,
              [id]: { phase: 'done', clearedAt: performance.now() },
            }))
            setHankoVisible(s => {
              const n = new Set(s)
              n.add(id)
              return n
            })
          } else {
            const t0 = performance.now()
            setSealLiftState(s => ({
              ...s,
              [id]: { phase: 'anticipation', clearedAt: t0 },
            }))
            setTimeout(() => {
              setSealLiftState(s => ({
                ...s,
                [id]: { phase: 'lifting', clearedAt: t0 },
              }))
              setTimeout(() => {
                setHankoVisible(s => {
                  const n = new Set(s)
                  n.add(id)
                  return n
                })
              }, SEAL_HANKO_STAMP_DELAY_MS)
              setTimeout(() => {
                setSealLiftState(s => ({
                  ...s,
                  [id]: { phase: 'recovering', clearedAt: t0 },
                }))
                setTimeout(() => {
                  setSealLiftState(s => ({
                    ...s,
                    [id]: { phase: 'done', clearedAt: t0 },
                  }))
                }, SEAL_MIST_LIFT_RECOVER_MS)
              }, SEAL_MIST_LIFT_DURATION_MS)
            }, SEAL_MIST_LIFT_ANTICIPATION_MS)
          }
        }
      }
    }
    prevSealedCount.current = next
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sealedSpiritCount])

  // ── Pre-populate hanko stamps for already-cleared regions ────────────────────
  useEffect(() => {
    const cleared = new Set<string>()
    for (const dr of derivation.regions) {
      if (dr.state === 'cleared') {
        cleared.add(dr.region.id)
      }
    }
    setHankoVisible(cleared)
  }, [derivation])

  // ── Pointer handlers — colormask-based hit testing ───────────────────────────
  const handleContainerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDesktopHover) return
      if (detailRegionId) return
      const cx = e.clientX
      const cy = e.clientY
      if (rafRef.current !== null) return // already a pending rAF
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const slug = hitTest(cx, cy)

        if (slug !== null) {
          // We're over a valid region — cancel any pending clear timer.
          if (clearHoverTimerRef.current !== null) {
            clearTimeout(clearHoverTimerRef.current)
            clearHoverTimerRef.current = null
          }
          // Only update state if the region actually changed (change-guard).
          if (slug !== lastHoveredRef.current) {
            lastHoveredRef.current = slug
            setHoveredRegionId(slug)
          }
        } else {
          // Sea / boundary sample (-1): start hysteresis timer if not already
          // running. If a valid region arrives before the timer fires, we
          // cancel it and never clear. This prevents boundary jitter flicker.
          if (
            lastHoveredRef.current !== null &&
            clearHoverTimerRef.current === null
          ) {
            clearHoverTimerRef.current = setTimeout(() => {
              clearHoverTimerRef.current = null
              lastHoveredRef.current = null
              setHoveredRegionId(null)
            }, HOVER_CLEAR_HYSTERESIS_MS)
          }
        }
      })
    },
    [isDesktopHover, detailRegionId, hitTest],
  )

  const handleContainerPointerLeave = useCallback(() => {
    // Pointer left the container entirely — cancel hysteresis and clear immediately.
    if (clearHoverTimerRef.current !== null) {
      clearTimeout(clearHoverTimerRef.current)
      clearHoverTimerRef.current = null
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastHoveredRef.current = null
    setHoveredRegionId(null)
  }, [])

  const handleContainerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (detailRegionId) return
      const slug = hitTest(e.clientX, e.clientY)
      if (slug) {
        setPressedRegionId(slug)
      }
    },
    [detailRegionId, hitTest],
  )

  const handleContainerPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (detailRegionId) return
      const slug = hitTest(e.clientX, e.clientY)
      if (!slug || pressedRegionId !== slug) {
        setPressedRegionId(null)
        return
      }
      const region = MYTH_REGIONS.find(r => r.id === slug)
      if (!region) {
        setPressedRegionId(null)
        return
      }
      setPressedRegionId(null)
      setPressRebounding(slug)
      setTimeout(() => {
        setPressRebounding(null)
        setDetailRegionId(slug)
        setDetailVisible(false)
        setVistaVisible(false)
        setDetailInteractive(false)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setDetailVisible(true)
            const enterDuration = reducedMotion
              ? 0
              : window.matchMedia('(min-width: 768px)').matches
              ? DETAIL_PANEL_ENTER_DESKTOP_DURATION_MS
              : DETAIL_PANEL_ENTER_MOBILE_DURATION_MS
            setTimeout(() => {
              setVistaVisible(true)
            }, reducedMotion ? 0 : DETAIL_VISTA_REVEAL_DELAY_MS)
            setTimeout(() => {
              setDetailInteractive(true)
            }, (reducedMotion ? 0 : enterDuration) + DETAIL_RECOVERY_MS)
          })
        })
      }, reducedMotion ? 0 : REGION_PRESS_REBOUND_DURATION_MS)
    },
    [detailRegionId, hitTest, pressedRegionId, reducedMotion],
  )

  const handleContainerPointerCancel = useCallback(() => {
    setPressedRegionId(null)
    setPressRebounding(null)
  }, [])

  // ── Detail panel close ────────────────────────────────────────────────────────
  const handleDetailClose = useCallback(() => {
    if (!detailInteractive) return
    setDetailVisible(false)
    setVistaVisible(false)
    setTimeout(() => {
      setDetailRegionId(null)
      setDetailInteractive(false)
    }, reducedMotion ? 0 : DETAIL_PANEL_EXIT_DURATION_MS)
  }, [detailInteractive, reducedMotion])

  // ── Close-button press-ack ────────────────────────────────────────────────────
  const handleClosePointerDown = useCallback(() => setClosePressed(true), [])
  const handleClosePointerUp = useCallback(() => {
    setClosePressed(false)
    handleDetailClose()
  }, [handleDetailClose])
  const handleClosePointerCancel = useCallback(() => setClosePressed(false), [])

  // ── Map-level close (back to game) ────────────────────────────────────────────
  const handleMapClose = useCallback(() => {
    if (detailRegionId) {
      handleDetailClose()
    } else {
      onClose()
    }
  }, [detailRegionId, handleDetailClose, onClose])

  // ── Compute cleared count for path drawing ────────────────────────────────────
  const clearedCount = derivation.clearedCount

  // ── Build authored waypoints in traversal order (authored regions with centroids) ─
  // Used by all three path layers. Ordered by traversalOrder ascending.
  const authoredWaypoints = useMemo(() => {
    return derivation.regions
      .filter(dr => dr.region.authored && dr.region.mapCentroid)
      .sort((a, b) => a.region.traversalOrder - b.region.traversalOrder)
  }, [derivation.regions])

  // ── Build SVG path strings for three-layer trail ─────────────────────────────
  // Layer A: sealed-ahead (all waypoints, grey dashed — the whole path ghosted)
  // Layer B: walked-behind (waypoints 0..clearedCount, charcoal solid)
  // Layer C: active-leg (waypoints clearedCount..clearedCount+1, amber solid animated)
  //
  // Path shape: straight segments between centroids (v1 fast-path per spec §4 v1).
  // v2 target: Q-spline bezier curves authored against the oblique-v2 map.

  const sealedAheadPoints = useMemo(
    () => authoredWaypoints.map(dr => {
      const c = dr.region.mapCentroid!
      return `${c.x},${c.y}`
    }).join(' '),
    [authoredWaypoints],
  )

  const walkedPoints = useMemo(() => {
    const walked = authoredWaypoints.slice(0, Math.max(1, clearedCount + 1))
    return walked.map(dr => {
      const c = dr.region.mapCentroid!
      return `${c.x},${c.y}`
    }).join(' ')
  }, [authoredWaypoints, clearedCount])

  const activeLegPoints = useMemo(() => {
    const start = authoredWaypoints[clearedCount]
    const end = authoredWaypoints[clearedCount + 1]
    if (!start || !end) return ''
    const sc = start.region.mapCentroid!
    const ec = end.region.mapCentroid!
    return `${sc.x},${sc.y} ${ec.x},${ec.y}`
  }, [authoredWaypoints, clearedCount])

  // ── Find the currently active derived region ─────────────────────────────────
  const activeRegion = useMemo(
    () => derivation.regions.find(dr => dr.state === 'active') ?? null,
    [derivation],
  )

  // ── Detail-panel region config ────────────────────────────────────────────────
  const detailDerivedRegion = useMemo(
    () => detailRegionId
      ? derivation.regions.find(dr => dr.region.id === detailRegionId) ?? null
      : null,
    [detailRegionId, derivation],
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // Render null when completely unmounted
  // ─────────────────────────────────────────────────────────────────────────────
  if (!mounted) return null

  const isDesktopViewport =
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches

  // ── Screen enter/exit animation ───────────────────────────────────────────────
  const mapScreenStyle: CSSProperties = reducedMotion
    ? { opacity: 1, transform: 'none' }
    : exiting
    ? {
        opacity: 0,
        transform: isDesktopViewport ? 'none' : 'translateY(8px)',
        transition: `opacity ${MAP_EXIT_DURATION_MS}ms ${EASE_CARBON_OUT}, transform ${MAP_EXIT_DURATION_MS}ms ${EASE_CARBON_OUT}`,
      }
    : {
        opacity: 1,
        transform: 'translateY(0)',
        transition: `opacity ${MAP_ENTER_DURATION_MS}ms ${EASE_CARBON_IN}, transform ${MAP_ENTER_DURATION_MS}ms ${EASE_CARBON_IN}`,
      }

  // ── Detail panel animation ────────────────────────────────────────────────────
  const detailPanelStyle: CSSProperties = reducedMotion
    ? { opacity: detailVisible ? 1 : 0 }
    : isDesktopViewport
    ? {
        opacity: detailVisible ? 1 : 0,
        transform: detailVisible ? 'scale(1.0)' : 'scale(0.97)',
        transformOrigin: 'center center',
        transition: detailVisible
          ? `opacity ${DETAIL_PANEL_ENTER_DESKTOP_DURATION_MS}ms ${EASE_CARBON_IN}, transform ${DETAIL_PANEL_ENTER_DESKTOP_DURATION_MS}ms ${EASE_CARBON_IN}`
          : `opacity ${DETAIL_PANEL_EXIT_DURATION_MS}ms ${EASE_CARBON_OUT}, transform ${DETAIL_PANEL_EXIT_DURATION_MS}ms ${EASE_CARBON_OUT}`,
        pointerEvents: detailInteractive ? 'all' : 'none',
      }
    : {
        opacity: detailVisible ? 1 : 0,
        transform: detailVisible ? 'translateX(0)' : 'translateX(100%)',
        transition: detailVisible
          ? `opacity ${DETAIL_PANEL_ENTER_MOBILE_DURATION_MS}ms ${EASE_CARBON_IN}, transform ${DETAIL_PANEL_ENTER_MOBILE_DURATION_MS}ms ${EASE_CARBON_IN}`
          : `opacity ${DETAIL_PANEL_EXIT_DURATION_MS}ms ${EASE_CARBON_OUT}, transform ${DETAIL_PANEL_EXIT_DURATION_MS}ms ${EASE_CARBON_OUT}`,
        pointerEvents: detailInteractive ? 'all' : 'none',
      }

  const vistaStyle: CSSProperties = {
    opacity: vistaVisible ? 1 : 0,
    transition: reducedMotion
      ? 'none'
      : `opacity ${DETAIL_VISTA_REVEAL_DURATION_MS}ms ${EASE_CARBON_IN}`,
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Inline CSS keyframes
  // ─────────────────────────────────────────────────────────────────────────────
  const keyframesCSS = `
    @keyframes tamashii-jima-guiding-wind {
      0%, 100% { transform: scale(1.0); }
      50%       { transform: scale(1.15); }
    }
    @keyframes hanko-stamp-pop {
      0%   { opacity: 0; transform: scale(1.0); }
      40%  { opacity: 0.82; transform: scale(1.06); }
      100% { opacity: 0.82; transform: scale(1.0); }
    }
    @keyframes talisman-curl-wind {
      0%, 100% { transform: rotate(-3deg) translateY(0px); }
      25%      { transform: rotate(2deg) translateY(-3px); }
      75%      { transform: rotate(-1deg) translateY(-2px); }
    }
    @keyframes path-draw-in {
      from { stroke-dashoffset: 2000; }
      to   { stroke-dashoffset: 0; }
    }
    @keyframes map-enter-mobile {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes region-unlock-text-rise {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes active-leg-pulse {
      0%, 100% { opacity: 0.92; }
      50%       { opacity: 0.72; }
    }
    @keyframes talisman-flutter {
      0%, 100% { opacity: 0.60; }
      50%       { opacity: 0.40; }
    }
    @media (prefers-reduced-motion: reduce) {
      .tamashii-guiding-ring { animation: none !important; }
      .talisman-curl         { animation: none !important; }
      .talisman-flutter      { animation: none !important; opacity: 0.60 !important; }
      .hanko-stamp-animated  { animation: none !important; opacity: 0.82 !important; }
      .region-unlock-text    { animation: none !important; opacity: 1 !important; }
    }
  `

  return (
    <>
      <style>{keyframesCSS}</style>

      {/*
       * ── Full-canvas map takeover ─────────────────────────────────────────────
       * position:absolute inset:0 — lives INSIDE the canvasShell parent.
       * z-index intentionally high to sit above the HUD band.
       * pointer events on the container do all hit-testing via colormask.
       */}
      <div
        id="oo-rei-map-takeover"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tamashii-Jima · The Warden's Map"
        onPointerMove={handleContainerPointerMove}
        onPointerLeave={handleContainerPointerLeave}
        onPointerDown={handleContainerPointerDown}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerCancel}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 50,
          overflow: 'hidden',
          backgroundColor: CHARCOAL,
          cursor: hoveredRegionId ? 'pointer' : 'default',
          animation: !reducedMotion && !exiting && mounted
            ? `map-enter-mobile ${MAP_ENTER_DURATION_MS}ms ${EASE_CARBON_IN} both`
            : undefined,
          ...mapScreenStyle,
        }}
      >
        {/*
         * ── Layer 0: Base map raster ────────────────────────────────────────────
         * PRECONDITION FIX 2026-05-31 (responsive-interface-plan Part A):
         * object-fit: COVER eliminates the charcoal letterbox bars that appear
         * at non-square viewports (1440x900: 270px bars; 1920x1080: 420px bars).
         *
         * The map is circular/radial in design — Tamashii-jima island is centered
         * in the 1024x1024 square source. Cover-fill crops the edges rather than
         * showing charcoal bars. At 1440x900 the player sees the center 900x900
         * of the map; the island remains fully visible. At 412x915 (mobile portrait)
         * the map fills 412x412, island centered. The previous object-fit:contain
         * was creating 270px charcoal bars per the diagnostics.
         *
         * Part B (deferred): commission a 1920x1080 wide-format map variant for
         * lg tier. Until that asset exists, cover with center positioning is live.
         *
         * IMPORTANT: The hit-test coordinate transform in useColormaskHitTest still
         * uses the contain letterbox calculation. With cover the transform must
         * switch to cover-crop offset. See useColormaskHitTest — the `letterbox`
         * comment path is now the cover-crop path. The hit-test update is tracked
         * as a follow-up (the colormask pointer hit-test needs a matching update
         * to use cover-fill math for accurate region hit detection).
         */}
        <img
          src="/assets/generated/oo-rei/myth/tamashii-jima-map.jpg"
          alt=""
          role="presentation"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            // MUST be 'contain' (Tim 2026-06-01: "map got super large + areas not
            // aligned"). The region cutout PNGs (Layer 1) and the colormask
            // hit-test both use contain math; the 2026-05-31 switch to 'cover'
            // here desynced the base raster from the cutouts + hotspots → the
            // island scaled up + crop-shifted while the clickable regions stayed
            // letterboxed, so nothing lined up. All three layers use contain now.
            objectFit: 'contain',
            objectPosition: 'center center',
            pointerEvents: 'none',
            filter: 'brightness(0.55) saturate(0.7)',
            willChange: 'auto',
          }}
        />

        {/*
         * ── Layer 1: Region cutout PNGs ─────────────────────────────────────────
         * Each cutout is a full-canvas 1024×1024 transparent PNG. Stacked at
         * (0,0) with object-fit:contain identical to the base map — pixel-perfect
         * registration. Per-region STATE drives the filter treatment:
         *
         *   SEALED   → brightness(0.6) saturate(0.2)   + faint charcoal veil
         *   ACTIVE   → brightness(1.0) saturate(1.0)   + amber drop-shadow
         *   CLEARED  → brightness(1.0) saturate(1.0)   (full paint)
         *
         * Hover (desktop only): hovered region elevates via CSS transition
         * (scale 1.03 + brightness 1.18). Non-hovered regions dim (opacity 0.6).
         * pointer-events:none — hit-testing is on the container via colormask.
         */}
        {derivation.regions.map(dr => {
          if (!dr.region.cutoutSrc) return null

          const { region, state } = dr
          const isHovered    = isDesktopHover && hoveredRegionId === region.id
          const isOtherHovered = isDesktopHover && hoveredRegionId !== null && hoveredRegionId !== region.id
          const isPressed    = pressedRegionId === region.id
          const isRebounding = pressRebounding === region.id
          const liftPhase    = sealLiftState[region.id]?.phase ?? 'done'
          const isLifting    = liftPhase === 'lifting'

          // Filter per state — drives the sealed/active/cleared appearance.
          // Per spec §2.5:
          //   SEALED   → grayscale(0.85) + opacity 0.55 (spec §2.5 + §2.3)
          //   ACTIVE   → full paint + amber drop-shadow
          //   CLEARED  → full paint (hanko stamp is the stamp marker)
          //   Cycle-2  → brightness(0.3) saturate(0) (spec §2.3)
          let baseFilter: string
          if (!region.authored) {
            // Cycle-2: dark desaturated silhouette — honest "not yet authored"
            baseFilter = 'brightness(0.3) saturate(0)'
          } else if (state === 'sealed') {
            // Lifting: animated toward full brightness over SEAL_MIST_LIFT_DURATION_MS
            baseFilter = isLifting
              ? 'grayscale(0.3) brightness(0.9)'
              : 'grayscale(0.85)'
          } else if (state === 'active') {
            baseFilter = 'brightness(1.0) saturate(1.0) drop-shadow(0 0 6px rgba(212,137,42,0.55))'
          } else {
            // cleared
            baseFilter = 'brightness(1.05) saturate(1.05)'
          }

          // Hover elevation (desktop only, @media hover:hover enforced by isDesktopHover)
          let elevatedFilter = baseFilter
          if (isHovered && !reducedMotion) {
            elevatedFilter = 'brightness(1.18) saturate(1.1) drop-shadow(0 0 10px rgba(212,137,42,0.7))'
          }

          // Scale for press-ack / rebound / hover
          let scale = 1.0
          if (!reducedMotion) {
            if (isPressed) scale = 0.97
            else if (isRebounding) scale = 1.005
            else if (isHovered) scale = 1.03
          }

          // Opacity: SEALED authored regions get 0.55 per spec §2.5.
          // Non-hovered regions additionally dim when something else is hovered.
          // Cycle-2 and cleared/active stay at 1.0 (filter handles their appearance).
          let opacity: number
          if (region.authored && state === 'sealed' && !isLifting) {
            opacity = isOtherHovered && !reducedMotion ? 0.4 : 0.55
          } else {
            opacity = isOtherHovered && !reducedMotion ? 0.55 : 1.0
          }

          // Transition
          const baseTransition = reducedMotion
            ? 'none'
            : `transform ${REGION_PRESS_ACK_DURATION_MS}ms ${EASE_SNAP_OUT}, ` +
              `filter ${REGION_HOVER_DURATION_MS}ms ${EASE_SNAP_OUT}, ` +
              `opacity ${REGION_DIM_DURATION_MS}ms ${EASE_SNAP_OUT}`
          const reboundTransition = reducedMotion
            ? 'none'
            : `transform ${REGION_PRESS_REBOUND_DURATION_MS}ms ${EASE_OVERSHOOT}, ` +
              `filter ${REGION_HOVER_DURATION_MS}ms ${EASE_SNAP_OUT}, ` +
              `opacity ${REGION_DIM_DURATION_MS}ms ${EASE_SNAP_OUT}`
          const liftTransition = reducedMotion
            ? 'none'
            : `filter ${SEAL_MIST_LIFT_DURATION_MS}ms ${EASE_CARBON_IN}, ` +
              `transform ${SEAL_MIST_LIFT_DURATION_MS}ms ${EASE_CARBON_IN}`

          const activeTransition = isLifting
            ? liftTransition
            : isRebounding
            ? reboundTransition
            : baseTransition

          return (
            <img
              key={region.id}
              src={region.cutoutSrc as string}
              alt=""
              role="presentation"
              aria-hidden="true"
              data-region={region.id}
              data-state={state}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'center center',
                pointerEvents: 'none',
                filter: elevatedFilter,
                opacity,
                transform: `scale(${scale})`,
                transformOrigin: region.mapCentroid
                  ? `${(region.mapCentroid.x / MAP_SIZE) * 100}% ${(region.mapCentroid.y / MAP_SIZE) * 100}%`
                  : 'center center',
                transition: activeTransition,
                willChange: reducedMotion ? 'auto' : 'filter, transform, opacity',
              }}
            />
          )
        })}

        {/*
         * ── Layer 1b: ACTIVE region amber border + mist-veil accent ─────────
         * Active region: amber border 2px + glow shadow per spec §2.5.
         * Sealed authored regions: a warm washi-paper tint is applied via the
         * cutout PNG filter (grayscale(0.85) at opacity:0.55), which combined
         * with the base map creates the sealed mist look. A single full-canvas
         * mist-veil div would stack incorrectly across all sealed regions in this
         * architecture — the filter approach IS the mist veil per §2.5.
         * pointer-events:none — hit-testing is on the container.
         */}
        {activeRegion && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              border: '2px solid rgba(212,137,42,0.70)',
              boxShadow: '0 0 0 3px rgba(212,137,42,0.18)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )}

        {/*
         * ── Layer 2: SVG markers (pointer-events:none) ────────────────────────
         * viewBox 0 0 1024 1024 + preserveAspectRatio xMidYMid meet —
         * identical to object-fit:contain on the base map, so markers register
         * pixel-perfectly on top of the cutout PNGs.
         *
         * Contains: amber progression polyline, hanko stamps, spirit glyphs,
         * active-region label + marker, talisman-curl ambient, hover labels.
         */}
        <svg
          viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {/* ── Defs (empty — hanko stamps now use foreignObject CSS boxes) ──── */}
          <defs />

          {/*
           * ── Three-layer sumi-e trail (replaces amber polyline) ──────────────
           * Per spec §4 v1 fast-path: straight segments with dash-circle treatment.
           * Layer A (bottom): sealed-ahead ghost — dark dashes show possibility.
           * Layer B (middle): walked-behind — bold charcoal marks where REI has been.
           * Layer C (top):    active-leg — amber solid, animated opacity pulse.
           * All three layers share waypoints in traversal order.
           * v2 target: Q-spline bezier curves against oblique-v2 map geometry.
           *
           * RG-C3: no proximity nudge. No marker ahead of REI's position.
           * The ghost layer shows the FULL path, not "N more steps remaining".
           */}

          {/* Layer A — SEALED AHEAD (bottom): faint dashed ghost of the full path */}
          {sealedAheadPoints.split(' ').length > 1 && (
            <polyline
              points={sealedAheadPoints}
              fill="none"
              stroke="#5a5248"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 8"
              opacity="0.22"
            />
          )}

          {/* Layer B — WALKED BEHIND (middle): bold charcoal where REI has been */}
          {walkedPoints.split(' ').length > 1 && (
            <polyline
              points={walkedPoints}
              fill="none"
              stroke={CHARCOAL}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.78"
            />
          )}

          {/* Layer C — ACTIVE LEG (top): amber solid animated, current position to next */}
          {activeLegPoints.split(' ').length > 1 && (
            <polyline
              points={activeLegPoints}
              fill="none"
              stroke={AMBER}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="2000"
              style={{
                animation: reducedMotion
                  ? 'none'
                  : `path-draw-in ${PATH_SEGMENT_REVEAL_DURATION_MS}ms ${EASE_CARBON_IN} both, active-leg-pulse ${GUIDING_RING_PULSE_DURATION_MS}ms ease-in-out infinite`,
                strokeDashoffset: 0,
              }}
              opacity="0.92"
            />
          )}

          {/* ── Small trail markers on cleared waypoints (10×10 vermillion rects) ──
               Per spec §4: 10×10 px, fill=#c0392b, opacity=0.72, rx=1,
               transform=rotate(8) — hand-stamped feel.
               Distinct from the 64×64 hanko stamp; this marks the trail.
               No markers placed AHEAD of the active position (RG-C3). */}
          {derivation.regions.map(dr => {
            if (dr.state !== 'cleared') return null
            const { region } = dr
            const tc = region.hankoCentroid ?? region.mapCentroid
            if (!tc) return null
            const size = 10
            return (
              <rect
                key={`trail-marker-${region.id}`}
                x={tc.x - size / 2}
                y={tc.y - size / 2}
                width={size}
                height={size}
                fill={VERMILLION}
                opacity="0.72"
                rx="1"
                transform={`rotate(8, ${tc.x}, ${tc.y})`}
              />
            )
          })}

          {/* ── Talisman paper strip at REI's active position ──────────────────
               Per spec §4: 6×20 rect, fill=TALISMAN_PAPER, opacity=0.60,
               animated opacity flutter. Makes REI's position a physical marker. */}
          {!reducedMotion && activeRegion && activeRegion.region.mapCentroid && (
            <rect
              className="talisman-flutter"
              x={activeRegion.region.mapCentroid.x - 3}
              y={activeRegion.region.mapCentroid.y + 10}
              width={6}
              height={20}
              fill={TALISMAN_PAPER}
              rx="1"
              style={{
                animation: `talisman-flutter ${TALISMAN_FLUTTER_PERIOD_MS}ms ease-in-out infinite`,
              }}
            />
          )}

          {/* ── Hanko stamps on cleared regions ──────────────────────────────── */}
          {/* Per spec §2.5: CSS-authored box 64×64, border 3px solid #c0392b,
              borderRadius 4px. Kanji 封 at 28px, color #c0392b. Opacity 0.82.
              Reads as a physical rubber stamp impression. */}
          {derivation.regions.map(dr => {
            if (!hankoVisible.has(dr.region.id)) return null
            const { region } = dr
            const hc = region.hankoCentroid ?? region.mapCentroid
            if (!hc) return null
            // CSS-authored hanko box: 64×64, centred on hc
            const boxSize = 64
            return (
              <foreignObject
                key={`hanko-${region.id}`}
                x={hc.x - boxSize / 2}
                y={hc.y - boxSize / 2}
                width={boxSize}
                height={boxSize}
                aria-hidden="true"
                style={{ pointerEvents: 'none', overflow: 'visible' }}
              >
                <div
                  className={reducedMotion ? undefined : 'hanko-stamp-animated'}
                  style={{
                    width: `${boxSize}px`,
                    height: `${boxSize}px`,
                    border: `3px solid ${VERMILLION}`,
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0.82,
                    animation: reducedMotion
                      ? undefined
                      : `hanko-stamp-pop ${SEAL_HANKO_STAMP_DURATION_MS}ms ${EASE_OVERSHOOT} both`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Noto Serif JP', 'Zen Old Mincho', serif",
                      fontSize: '28px',
                      fontWeight: 700,
                      color: VERMILLION,
                      lineHeight: 1,
                      userSelect: 'none',
                    }}
                  >
                    封
                  </span>
                </div>
              </foreignObject>
            )
          })}

          {/* ── Spirit glyphs on sealed/cycle-2 regions ────────────────────────── */}
          {/* Per spec §2.5: sealed authored regions show spirit glyph at 15% opacity.
              Cycle-2 regions show '?' at 28% opacity (honest silhouette). */}
          {derivation.regions.map(dr => {
            const { region, state } = dr
            if (state === 'cleared') return null
            const c = region.mapCentroid
            if (!c) return null
            return (
              <text
                key={`glyph-${region.id}`}
                x={c.x}
                y={c.y + 10}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="28"
                fontFamily="'Noto Serif JP', 'Zen Old Mincho', serif"
                fontWeight="700"
                fill={CHARCOAL}
                opacity={region.authored ? 0.15 : 0.28}
                aria-hidden="true"
              >
                {region.spiritGlyphKanji}
              </text>
            )
          })}

          {/* ── Active region label ─────────────────────────────────────────────
              Moved OUT of the SVG to a real-px DOM card (see "Active region label
              card" below). SVG text in the scaled 1024 viewBox rendered illegibly
              small (Tim #3 "map text not readable"), especially on mobile. The DOM
              card is projected onto the same centroid so it stays anchored. */}

          {/* ── REI position-dot on active region ────────────────────────────── */}
          {/* Per spec §2.5: vermillion circle 8px radius, color #d4892a.
              (Note: spec says "vermillion circle, 8px radius, #d4892a" — #d4892a is
              amberAccent in our palette, which is the correct amber position-dot color.
              The spec uses "vermillion circle" as a shape descriptor, not a color name.) */}
          {activeRegion && activeRegion.region.mapCentroid && (
            <g
              aria-hidden="true"
              style={{
                transformOrigin: `${activeRegion.region.mapCentroid.x}px ${activeRegion.region.mapCentroid.y}px`,
              }}
            >
              <circle
                cx={activeRegion.region.mapCentroid.x}
                cy={activeRegion.region.mapCentroid.y}
                r="8"
                fill={AMBER}
                opacity="0.9"
              />
              {!reducedMotion && (
                <circle
                  className="tamashii-guiding-ring"
                  cx={activeRegion.region.mapCentroid.x}
                  cy={activeRegion.region.mapCentroid.y}
                  r="16"
                  fill="none"
                  stroke={TALISMAN_GLOW}
                  strokeWidth="2"
                  style={{
                    // transform-box:fill-box makes transform-origin resolve against the
                    // circle's OWN bounding box, so `center` == (cx,cy) and the pulse stays
                    // concentric to the dot. A px transform-origin resolved against the
                    // scaled 1024 viewBox instead, drifting the ring off the marker
                    // (Tim #3 "that animation circle is going off the focal point").
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    animation: `tamashii-jima-guiding-wind ${GUIDING_RING_PULSE_DURATION_MS}ms ease-in-out infinite`,
                    willChange: 'transform',
                  }}
                />
              )}
            </g>
          )}

          {/* ── Talisman-curl ambient (ONE named ambient — ~0.04Hz) ───────────── */}
          {!reducedMotion && activeRegion && activeRegion.region.mapCentroid && (
            <g
              className="talisman-curl"
              style={{
                transform: `translate(${activeRegion.region.mapCentroid.x + 18}px, ${activeRegion.region.mapCentroid.y - 52}px)`,
                animation: `talisman-curl-wind ${TALISMAN_CURL_DURATION_MS}ms ease-in-out infinite`,
                willChange: 'transform',
              }}
              aria-hidden="true"
            >
              <path
                d="M 0,0 L 14,0 Q 15,20 14,40 Q 7,42 0,40 Z"
                fill={TALISMAN_PAPER}
                opacity="0.55"
              />
              <line x1="2" y1="8"  x2="12" y2="8"  stroke={CHARCOAL} strokeWidth="0.8" opacity="0.4" />
              <line x1="2" y1="14" x2="12" y2="14" stroke={CHARCOAL} strokeWidth="0.8" opacity="0.4" />
              <line x1="2" y1="20" x2="12" y2="20" stroke={CHARCOAL} strokeWidth="0.8" opacity="0.4" />
              <line x1="2" y1="26" x2="12" y2="26" stroke={CHARCOAL} strokeWidth="0.8" opacity="0.35" />
              <line x1="2" y1="32" x2="12" y2="32" stroke={CHARCOAL} strokeWidth="0.8" opacity="0.3" />
            </g>
          )}

          {/* ── Reduced-motion: static talisman paper ─────────────────────────── */}
          {reducedMotion && activeRegion && activeRegion.region.mapCentroid && (
            <g
              aria-hidden="true"
              style={{
                transform: `translate(${activeRegion.region.mapCentroid.x + 18}px, ${activeRegion.region.mapCentroid.y - 52}px)`,
              }}
            >
              <path
                d="M 0,0 L 14,0 Q 15,20 14,40 Q 7,42 0,40 Z"
                fill={TALISMAN_PAPER}
                opacity="0.55"
              />
            </g>
          )}

          {/* ── Desktop hover labels (foreignObject, guarded by isDesktopHover) ── */}
          {isDesktopHover && derivation.regions.map(dr => {
            const { region } = dr
            const isHovered = hoveredRegionId === region.id
            if (!isHovered) return null
            const c = region.mapCentroid
            if (!c) return null
            const labelW = 140
            const labelH = 36
            return (
              <foreignObject
                key={`label-${region.id}`}
                x={c.x - labelW / 2}
                y={c.y - labelH - 12}
                width={labelW}
                height={labelH}
                aria-hidden="true"
                style={{ pointerEvents: 'none', overflow: 'visible' }}
              >
                <div
                  style={{
                    background: 'rgba(232,223,200,0.88)',
                    borderRadius: '2px',
                    padding: '4px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: 1,
                    transform: 'translateY(0)',
                    transition: reducedMotion
                      ? 'none'
                      : `opacity ${REGION_HOVER_LABEL_DURATION_MS}ms ${EASE_CARBON_IN} 80ms, ` +
                        `transform ${REGION_HOVER_LABEL_DURATION_MS}ms ${EASE_CARBON_IN} 80ms`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Noto Serif JP', 'Zen Old Mincho', serif",
                      fontWeight: 700,
                      fontSize: '16px',
                      color: CHARCOAL,
                      lineHeight: 1,
                    }}
                  >
                    {region.authored ? region.nameJP : '未解放'}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Geist Mono', 'Courier New', monospace",
                      fontSize: '10px',
                      letterSpacing: '0.1em',
                      color: CHARCOAL,
                      lineHeight: 1,
                    }}
                  >
                    {region.authored ? region.nameEN.toUpperCase() : '?'}
                  </span>
                </div>
              </foreignObject>
            )
          })}
        </svg>

        {/*
         * ── Active region label card (real-px DOM overlay) ───────────────────────
         * Projected onto the active region's centroid via the SAME contain transform
         * the raster + SVG markers + colormask hit-test use, so it stays anchored on
         * the rendered region (Tim #4 "labels not anchored to the region"). Real px
         * fonts + a dark carved-stone plaque make it legible over the busy ink-wash
         * art at every viewport (Tim #3 "map text not readable"). A leader line ties
         * the plate to the exact marker dot. pointerEvents:none — taps fall through to
         * the colormask region hit-test underneath. Zero cyan, amber-on-dark register.
         */}
        {!detailRegionId && activeRegion?.region.mapCentroid && (() => {
          const proj = projectCentroid(activeRegion.region.mapCentroid.x, activeRegion.region.mapCentroid.y)
          if (!proj) return null
          const { px, py } = proj
          // Card sits below the dot when the region is in the upper ~60% of the map
          // (so it never clips the top edge), otherwise above.
          const placeBelow = activeRegion.region.mapCentroid.y < MAP_SIZE * 0.6
          const CARD_W = 224
          const LEADER = 26 // px from dot to card edge (clears the 16px guiding ring)
          const left = Math.max(12, Math.min(containerSize.w - CARD_W - 12, px - CARD_W / 2))
          const kanji = activeRegion.region.spirit?.kanji ?? activeRegion.region.nameJP
          return (
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
              {/* Leader line: dot → card */}
              <div
                style={{
                  position: 'absolute',
                  left: px - 1,
                  top: placeBelow ? py : py - LEADER,
                  width: 2,
                  height: LEADER,
                  background: placeBelow
                    ? 'linear-gradient(180deg, rgba(244,167,62,0.85), rgba(244,167,62,0.15))'
                    : 'linear-gradient(0deg, rgba(244,167,62,0.85), rgba(244,167,62,0.15))',
                  borderRadius: 1,
                }}
              />
              {/* Plaque */}
              <div
                style={{
                  position: 'absolute',
                  left,
                  width: CARD_W,
                  // Below: card top sits LEADER px under the dot. Above: anchor by
                  // bottom edge (height-agnostic) so a tall goal never overlaps the dot.
                  ...(placeBelow
                    ? { top: py + LEADER }
                    : { bottom: Math.max(12, containerSize.h - (py - LEADER)) }),
                  padding: '10px 14px 12px',
                  textAlign: 'center',
                  background: 'linear-gradient(180deg, rgba(28,20,11,0.95) 0%, rgba(19,13,8,0.97) 100%)',
                  border: '1px solid rgba(212,137,42,0.55)',
                  borderRadius: 9,
                  boxShadow: '0 8px 28px rgba(0,0,0,0.55), inset 0 1px 0 rgba(244,167,62,0.10)',
                  backdropFilter: 'blur(2px)',
                  WebkitBackdropFilter: 'blur(2px)',
                }}
              >
                <div
                  style={{
                    fontFamily: "'Geist Mono', 'Courier New', monospace",
                    fontSize: '9px',
                    letterSpacing: '0.24em',
                    textTransform: 'uppercase',
                    color: AMBER,
                    opacity: 0.8,
                    marginBottom: 3,
                  }}
                >
                  REI IS HERE
                </div>
                <div
                  style={{
                    fontFamily: "'Noto Serif JP', 'Zen Old Mincho', serif",
                    fontWeight: 700,
                    fontSize: '21px',
                    lineHeight: 1.05,
                    color: TALISMAN_GLOW,
                    marginBottom: 2,
                  }}
                >
                  {kanji}
                </div>
                <div
                  style={{
                    fontFamily: "'Geist Mono', 'Courier New', monospace",
                    fontSize: '11px',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: AMBER,
                    marginBottom: activeRegion.region.goalStatement ? 6 : 0,
                  }}
                >
                  {activeRegion.region.nameEN}
                </div>
                {activeRegion.region.goalStatement && (
                  <div
                    style={{
                      fontFamily: "'Geist Mono', 'Courier New', monospace",
                      fontSize: '11px',
                      lineHeight: 1.45,
                      color: TALISMAN_PAPER,
                      opacity: 0.86,
                    }}
                  >
                    {activeRegion.region.goalStatement}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/*
         * ── Map screen close button (top-right — back to game) ────────────────
         * Only shown when no detail panel is open.
         */}
        {!detailRegionId && (
          <button
            type="button"
            aria-label="Close map and return to game"
            onClick={handleMapClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              zIndex: 6,
              width: '44px',
              height: '44px',
              background: 'rgba(26,22,18,0.65)',
              border: `1px solid rgba(232,223,200,0.2)`,
              borderRadius: '2px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <line x1="4" y1="4" x2="16" y2="16" stroke={TALISMAN_PAPER} strokeWidth="2.5" strokeLinecap="round" />
              <line x1="16" y1="4" x2="4" y2="16" stroke={TALISMAN_PAPER} strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/*
         * ── Layer 3: Region detail panel ─────────────────────────────────────
         * Mounts on region tap. Full-canvas in-style unlock / info screen.
         * VISTA-FORWARD: vista art bright ~60% top, scrim only behind text.
         */}
        {detailRegionId && detailDerivedRegion && (
          <div
            role="region"
            aria-label={`Region detail: ${detailDerivedRegion.region.nameEN}`}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 3,
              overflow: 'hidden',
              ...detailPanelStyle,
            }}
          >
            <DetailPanel
              dr={detailDerivedRegion}
              vistaStyle={vistaStyle}
              reducedMotion={reducedMotion}
              spinCountThisCycle={spinCountThisCycle}
              cyclesCompletedThisRegion={cyclesCompletedThisRegion}
            />
          </div>
        )}

        {/*
         * ── Layer 4: Close affordance (detail panel) ──────────────────────────
         * Brushstroke-ink X, vermillion, 44×44 touch target.
         * Mounted ONLY when detail panel is open.
         */}
        {detailRegionId && (
          <button
            type="button"
            aria-label="Close region detail"
            onPointerDown={handleClosePointerDown}
            onPointerUp={handleClosePointerUp}
            onPointerCancel={handleClosePointerCancel}
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              zIndex: 4,
              width: '44px',
              height: '44px',
              background: 'rgba(26,22,18,0.55)',
              border: `1px solid rgba(232,223,200,0.15)`,
              borderRadius: '2px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: closePressed && !reducedMotion ? 'scale(0.93)' : 'scale(1.0)',
              transition: reducedMotion
                ? 'none'
                : `transform ${CLOSE_BUTTON_PRESS_DURATION_MS}ms ${EASE_SNAP_OUT}`,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
              <line x1="5"  y1="5"  x2="23" y2="23" stroke={VERMILLION} strokeWidth="3" strokeLinecap="round" />
              <line x1="23" y1="5"  x2="5"  y2="23" stroke={VERMILLION} strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/*
       * ── Region unlock card (z-51) ─────────────────────────────────────────
       * Full-canvas moment fires when a new region becomes ACTIVE (sealedSpiritCount
       * crosses a threshold). Duration: REGION_UNLOCK_CARD_DURATION_MS (2200ms).
       * No buttons. No UI chrome. Post-settle only — never during a spin.
       * Composition per §2.5:
       *   - vistaSrc at 95% opacity — sky occupies top ~60% of frame.
       *   - Rei silhouette from behind, 35% canvas width, bottom-anchored.
       *   - Region kanji 32px Noto Serif JP, color #f4a73e.
       *   - EN name Geist Mono 12px, letterSpacing 0.18em.
       *   - "· REGION REVEALED ·" label 10px, letterSpacing 0.22em.
       * RG-C1: zero USDC framing. Narrative event only.
       * RG-C5: duration is module-const, cannot be derived from session state.
       */}
      {unlockCardRegionId && (() => {
        const unlockRegion = MYTH_REGIONS.find(r => r.id === unlockCardRegionId)
        if (!unlockRegion) return null
        return (
          <div
            key={`unlock-card-${unlockCardRegionId}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 51,
              overflow: 'hidden',
              opacity: unlockCardVisible ? 1 : 0,
              transition: reducedMotion
                ? 'none'
                : `opacity 300ms ${EASE_CARBON_IN}`,
              pointerEvents: 'none',
            }}
          >
            {/* Vista fill — 95% opacity per spec §2.5 */}
            <img
              src={unlockRegion.vistaSrc}
              alt=""
              role="presentation"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 20%',
                opacity: 0.95,
              }}
            />
            {/* Bottom misty ground scrim — text reading bed */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, transparent 0%, transparent 55%, rgba(26,22,18,0.72) 78%, rgba(26,22,18,0.96) 100%)',
                pointerEvents: 'none',
              }}
            />
            {/* Rei silhouette from behind — 35% canvas width, bottom-anchored */}
            <img
              src="/assets/generated/oo-rei/rei-fullbody-profile-rgba.png"
              alt=""
              role="presentation"
              style={{
                position: 'absolute',
                bottom: 0,
                left: '8%',
                height: '40%',
                width: '35%',
                maxWidth: '180px',
                objectFit: 'contain',
                objectPosition: 'bottom left',
                opacity: 0.88,
                pointerEvents: 'none',
              }}
            />
            {/* Text on misty ground — bottom-anchored */}
            <div
              className="region-unlock-text"
              style={{
                position: 'absolute',
                bottom: '12%',
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
                pointerEvents: 'none',
                animation: reducedMotion
                  ? 'none'
                  : `region-unlock-text-rise 400ms ${EASE_CARBON_IN} 200ms both`,
              }}
            >
              <div
                style={{
                  fontFamily: "'Noto Serif JP', 'Zen Old Mincho', serif",
                  fontSize: '32px',
                  fontWeight: 700,
                  color: TALISMAN_GLOW,
                  lineHeight: 1,
                  marginBottom: '8px',
                  textShadow: '0 2px 12px rgba(26,22,18,0.9)',
                }}
              >
                {unlockRegion.nameJP}
              </div>
              <div
                style={{
                  fontFamily: "'Geist Mono', 'Courier New', monospace",
                  fontSize: '12px',
                  letterSpacing: '0.18em',
                  color: TALISMAN_PAPER,
                  textTransform: 'uppercase',
                  marginBottom: '6px',
                  textShadow: '0 1px 6px rgba(26,22,18,0.9)',
                }}
              >
                {unlockRegion.authored ? unlockRegion.nameEN : 'MYTH CYCLE 2'}
              </div>
              <div
                style={{
                  fontFamily: "'Geist Mono', 'Courier New', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.22em',
                  color: AMBER,
                  opacity: 0.75,
                  textTransform: 'uppercase',
                  textShadow: '0 1px 4px rgba(26,22,18,0.9)',
                }}
              >
                · REGION REVEALED ·
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}

// ─── DetailPanel sub-component ────────────────────────────────────────────────
interface DetailPanelProps {
  dr: DerivedMythRegion
  vistaStyle: CSSProperties
  reducedMotion: boolean
  /** Factual spin count for the current active region cycle.
   * Shown as "Current cycle: N spins." — factual count only.
   * Zero proximity nudge, zero "N more spins" copy. RG-C3 safe. */
  spinCountThisCycle: number
  /**
   * How many cycles completed for the currently active region.
   * Drives OoReiCycleTotem. Factual history, not proximity nudge (RG-C3 safe).
   */
  cyclesCompletedThisRegion: number
}

function DetailPanel({
  dr,
  vistaStyle,
  reducedMotion,
  spinCountThisCycle,
  cyclesCompletedThisRegion,
}: DetailPanelProps): ReactElement {
  const { region, state } = dr
  const isSealed  = state === 'sealed'
  const isCleared = state === 'cleared'
  const isActive  = state === 'active'
  const isCycle2  = !region.authored

  // Progress gauge fill: factual proportion, NO numeric "N more spins" anywhere.
  // RG: gauge fill is the ONLY signal. No percentage text. No proximity nudge.
  const gaugeFillPct = region.cyclesRequired
    ? isCleared ? 1.0 : 0
    : 0

  // Vista filter: sealed/cycle-2 regions get a darkened treatment as a compelling
  // teaser but NOT a proximity nudge. Cycle-2 stays darker (not yet authored).
  // Sealed authored regions raised to 0.65 so the art reads as HERO, not a near-
  // black wash. Cycle-2 kept darker (honest "not yet authored" silhouette).
  const vistaFilter =
    isCycle2
      ? 'brightness(0.22) saturate(0.08)'
      : isSealed
      ? 'brightness(0.65) saturate(0.35)'
      : 'none'

  // Mode-A label
  const modeAText = region.modeAElevation.startsWith('RTP-NEUTRAL')
    ? region.modeAElevation
    : `RTP-NEUTRAL. ${region.modeAElevation}`

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
      }}
    >
      {/*
       * ── LAYER 0: Vista fill ─────────────────────────────────────────────────
       * VISTA-FORWARD: occupies the FULL panel. Bright across the top ~60%.
       * The scrim below provides the reading bed — no global dark wash.
       */}
      <img
        src={region.vistaSrc}
        alt=""
        role="presentation"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 30%',
          filter: vistaFilter,
          ...vistaStyle,
        }}
      />

      {/*
       * ── LAYER 1: Bottom-anchored scrim ──────────────────────────────────────
       * Transparent across the top ~58% so the vista art is the HERO.
       * Darkens across the bottom ~42% where the text block sits.
       * NO global dark wash on the whole panel — vista-forward composition.
       */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, transparent 0%, transparent 58%, rgba(26,22,18,0.68) 78%, rgba(26,22,18,0.94) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/*
       * ── LAYER 2: REI silhouette — lower-left anchor ─────────────────────────
       * height:22% with objectFit:contain + objectPosition:bottom left ensures
       * she is NEVER cut off at the bottom. She reads full-body above the scrim.
       */}
      <img
        src="/assets/generated/oo-rei/rei-fullbody-profile-rgba.png"
        alt=""
        role="presentation"
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 0,
          left: '10px',
          height: '22%',
          width: 'auto',
          maxWidth: '80px',
          opacity: 0.9,
          pointerEvents: 'none',
          objectFit: 'contain',
          objectPosition: 'bottom left',
          // Ensure she doesn't clip into the text block
          zIndex: 1,
        }}
      />

      {/*
       * ── LAYER 2b: Inset dark scrim behind text column ────────────────────────
       * Sits behind the text block (z-1) providing a legibility reading bed
       * over the busy storm/region art. Does not cover the full panel — only the
       * lower-right quadrant where the lore + labels live.
       */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: '128px',
          left: '90px',
          right: 0,
          top: '40%',
          zIndex: 1,
          background: 'linear-gradient(135deg, rgba(20,14,8,0.0) 0%, rgba(20,14,8,0.55) 40%, rgba(20,14,8,0.72) 100%)',
          pointerEvents: 'none',
          borderRadius: '4px 0 0 0',
        }}
      />

      {/*
       * ── LAYER 3: Text block — bottom-anchored inside the scrim zone ─────────
       * Sits above the glass-box strip. Left-padded to leave room for REI.
       * textShadow provides direct legibility over the vista art.
       * NO duplicate "SEAL N SPIRITS" text — the unlockCondition is only shown
       * once (either in the text block OR in the glass-box strip, not both).
       */}
      <div
        style={{
          position: 'absolute',
          bottom: '136px',  // glass-box strip (72px) + 56px offset + 8px gap
          left: '100px',    // clear REI silhouette (≈80px) + 20px breathing room
          right: '24px',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        {/* Region kanji */}
        <div
          style={{
            fontFamily: "'Noto Serif JP', 'Zen Old Mincho', serif",
            fontWeight: 700,
            fontSize: 'clamp(32px, 5vw, 52px)',
            color: isSealed ? TALISMAN_PAPER : TALISMAN_GLOW,
            lineHeight: 1,
            marginBottom: '4px',
            textShadow: '0 2px 12px rgba(26,22,18,0.9), 0 1px 4px rgba(26,22,18,0.98)',
          }}
        >
          {isCycle2 ? '未解放' : region.nameJP}
        </div>

        {/* Region EN name */}
        <div
          style={{
            fontFamily: "'Geist Mono', 'Courier New', monospace",
            fontSize: fluid(11, 14),
            letterSpacing: '0.22em',
            color: TALISMAN_PAPER,
            opacity: 0.75,
            textTransform: 'uppercase',
            marginBottom: '10px',
            textShadow: '0 1px 6px rgba(26,22,18,0.9)',
          }}
        >
          {isCycle2 ? 'MYTH CYCLE 2. NOT YET AUTHORED' : region.nameEN}
        </div>

        {/* Spirit name — authored regions only */}
        {region.spirit && (
          <div
            style={{
              fontFamily: "'Geist Mono', 'Courier New', monospace",
              fontSize: fluid(10, 13),
              letterSpacing: '0.18em',
              color: AMBER,
              textTransform: 'uppercase',
              marginBottom: '8px',
              textShadow: '0 1px 4px rgba(26,22,18,0.8)',
            }}
          >
            {`SPIRIT: ${region.spirit.name} ${region.spirit.kanji}`}
          </div>
        )}

        {/* Goal statement — ACTIVE region only (per spec §2.5 info panel).
            Factual imperative: what REI must do. Zero proximity nudge. */}
        {isActive && region.goalStatement && (
          <div
            style={{
              fontFamily: "'Geist Mono', 'Courier New', monospace",
              fontSize: fluid(11, 14),
              letterSpacing: '0.08em',
              color: TALISMAN_GLOW,
              lineHeight: 1.5,
              maxWidth: '240px',
              marginBottom: '10px',
              textShadow: '0 1px 6px rgba(26,22,18,0.88)',
            }}
          >
            {region.goalStatement}
          </div>
        )}

        {/* Factual cycle progress for the active region.
            "Current cycle: N spins." + OoReiCycleTotem for visual cycle history.
            NO proximity nudge, NO "N more spins" copy. RG-C3 safe. */}
        {isActive && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginBottom: '10px',
            }}
          >
            {/* Cycle totem — visual history of completed cycles */}
            {region.cyclesRequired && region.cyclesRequired > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <OoReiCycleTotem
                  cyclesCompleted={cyclesCompletedThisRegion}
                  cyclesRequired={region.cyclesRequired}
                  reducedMotion={reducedMotion}
                />
                <span
                  style={{
                    fontFamily: "'Geist Mono', 'Courier New', monospace",
                    fontSize: fluid(10, 13),
                    letterSpacing: '0.12em',
                    color: TALISMAN_PAPER,
                    opacity: 0.55,
                    textTransform: 'uppercase',
                    textShadow: '0 1px 4px rgba(26,22,18,0.8)',
                  }}
                >
                  CYCLES
                </span>
              </div>
            )}
            {/* Factual spin count — raw history only, no "N more" nudge */}
            <div
              style={{
                fontFamily: "'Geist Mono', 'Courier New', monospace",
                fontSize: fluid(10, 13),
                letterSpacing: '0.12em',
                color: TALISMAN_PAPER,
                opacity: 0.55,
                textTransform: 'uppercase',
                textShadow: '0 1px 4px rgba(26,22,18,0.8)',
              }}
            >
              {`Current cycle: ${spinCountThisCycle} spin${spinCountThisCycle !== 1 ? 's' : ''}.`}
            </div>
          </div>
        )}

        {/* Myth beat — authored + cleared/active only */}
        {region.authored && !isSealed && (
          <div
            style={{
              fontFamily: "'Noto Serif JP', 'Yu Mincho', serif",
              fontSize: fluid(13, 16),
              fontStyle: 'italic',
              lineHeight: 1.6,
              color: TALISMAN_PAPER,
              opacity: 0.82,
              maxWidth: '240px',
              marginBottom: '6px',
              textShadow: '0 1px 6px rgba(26,22,18,0.85)',
            }}
          >
            {region.mythBeat}
          </div>
        )}

        {/* Lore — all authored regions (sealed + active + cleared) */}
        {region.authored && (
          <div
            style={{
              fontFamily: "'Noto Serif JP', 'Yu Mincho', serif",
              fontSize: fluid(12, 15),
              lineHeight: 1.6,
              color: TALISMAN_PAPER,
              opacity: 0.82,
              maxWidth: '280px',
              marginBottom: '10px',
              textShadow: '0 1px 6px rgba(26,22,18,0.85)',
            }}
          >
            {region.lore}
          </div>
        )}

        {/* Mode-A / ownership label — authored + non-sealed only.
            Single line: "RTP LOCKED 96%" — no duplication. */}
        {region.authored && !isSealed && (
          <div
            style={{
              fontFamily: "'Geist Mono', 'Courier New', monospace",
              fontSize: fluid(10, 13),
              letterSpacing: '0.15em',
              color: AMBER,
              opacity: 0.7,
              textTransform: 'uppercase',
              marginBottom: '4px',
            }}
          >
            RTP LOCKED 96%
          </div>
        )}

        {/*
         * Sealed authored region: factual unlock condition shown ONCE here.
         * NOT repeated in the glass-box strip below (prevents the duplicate
         * "SEAL N SPIRITS" text Tim saw in image 23).
         */}
        {isSealed && region.authored && (
          <div
            style={{
              fontFamily: "'Geist Mono', 'Courier New', monospace",
              fontSize: fluid(10, 13),
              letterSpacing: '0.15em',
              color: TALISMAN_PAPER,
              opacity: 0.62,
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            {region.unlockCondition}
          </div>
        )}
      </div>

      {/* ── LAYER 4: Glass-Box talisman-paper strip ─────────────────────────────
           Stats strip. For sealed regions: shows a single state badge only —
           NOT the unlockCondition again (that's already in the text block above). */}
      <div
        aria-label="Region statistics"
        style={{
          position: 'absolute',
          bottom: '56px',
          left: 0,
          right: 0,
          height: '72px',
          background: 'rgba(232,223,200,0.12)',
          borderTop: `1px solid rgba(232,223,200,0.18)`,
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        {isCycle2 ? (
          // Cycle-2: honest label, no stats, no gauge, no teaser
          <div
            style={{
              textAlign: 'center',
              fontFamily: "'Geist Mono', 'Courier New', monospace",
              fontSize: fluid(10, 13),
              letterSpacing: '0.15em',
              color: TALISMAN_PAPER,
              opacity: 0.55,
              textTransform: 'uppercase',
              padding: '0 24px',
            }}
          >
            MYTH CYCLE 2 — NOT YET AUTHORED
          </div>
        ) : isSealed ? (
          // Sealed authored region: show state badge only — unlockCondition
          // is already displayed in the text block above (no duplication).
          <div
            style={{
              textAlign: 'center',
              fontFamily: "'Geist Mono', 'Courier New', monospace",
              fontSize: fluid(10, 13),
              letterSpacing: '0.15em',
              color: TALISMAN_PAPER,
              opacity: 0.62,
              textTransform: 'uppercase',
              padding: '0 24px',
            }}
          >
            SEALED
          </div>
        ) : (
          // Authored + active/cleared: stats row + gauge
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                alignItems: 'center',
                padding: '0 16px',
                flex: 1,
              }}
            >
              <GlassBoxStat
                label="CYCLES REQ."
                value={region.cyclesRequired !== null ? String(region.cyclesRequired) : '·'}
              />
              <GlassBoxStat
                label="STATE"
                value={isActive ? 'ACTIVE' : isCleared ? 'SEALED' : '·'}
                valueColor={isCleared ? VERMILLION : TALISMAN_GLOW}
              />
              <GlassBoxStat
                label="OWNERSHIP"
                value="NARRATIVE"
                valueColor={AMBER}
              />
            </div>

            {/* Gauge: factual fill only — NO "N more" numeric copy (RG) */}
            <div
              style={{
                height: '3px',
                background: 'rgba(232,223,200,0.15)',
                margin: '0 0',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  height: '100%',
                  width: `${Math.round(gaugeFillPct * 100)}%`,
                  background: AMBER,
                  transition: reducedMotion
                    ? 'none'
                    : `width 600ms ${'cubic-bezier(0, 0, 0.25, 1)'}`,
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* ── Bottom safe-zone spacer ─────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '56px',
          background: 'rgba(26,22,18,0.85)',
          borderTop: `1px solid rgba(232,223,200,0.1)`,
        }}
      />
    </div>
  )
}

// ─── OoReiCycleTotem sub-component ────────────────────────────────────────────
//
// Visual totem showing cycle progress for the active region.
// Per spec §Fix B3: filled rectangles = completed cycles, outlined = pending.
// Shows factual history (cycles sealed), not "N more to go" (RG-C3 safe).
// ~40 lines. Receives cyclesCompleted and cyclesRequired; renders the totem.

interface OoReiCycleTotemProps {
  /** How many cycles have been completed for this region. */
  cyclesCompleted: number
  /** Total cycles required to clear this region. */
  cyclesRequired: number
  /** Whether to suppress transitions (prefers-reduced-motion). */
  reducedMotion: boolean
}

function OoReiCycleTotem({
  cyclesCompleted,
  cyclesRequired,
  reducedMotion,
}: OoReiCycleTotemProps): ReactElement {
  const rects: ReactElement[] = []
  for (let i = 0; i < cyclesRequired; i++) {
    const filled = i < cyclesCompleted
    rects.push(
      <div
        key={i}
        aria-hidden="true"
        style={{
          width: '8px',
          height: '12px',
          borderRadius: '1px',
          background: filled ? 'rgba(212,137,42,0.80)' : 'none',
          border: filled ? 'none' : '1px solid rgba(212,137,42,0.50)',
          flexShrink: 0,
          transition: reducedMotion ? 'none' : `background 200ms, border 200ms`,
        }}
      />,
    )
  }
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: '4px',
        alignItems: 'center',
      }}
      aria-label={`${cyclesCompleted} of ${cyclesRequired} cycle${cyclesRequired !== 1 ? 's' : ''} complete`}
      role="img"
    >
      {rects}
    </div>
  )
}

// ─── GlassBoxStat sub-component ───────────────────────────────────────────────
interface GlassBoxStatProps {
  label: string
  value: string
  valueColor?: string
}

function GlassBoxStat({ label, value, valueColor = TALISMAN_PAPER }: GlassBoxStatProps): ReactElement {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div
        style={{
          fontFamily: "'Geist Mono', 'Courier New', monospace",
          fontSize: fluid(9, 12),
          letterSpacing: '0.08em',
          color: TALISMAN_PAPER,
          opacity: 0.55,
          textTransform: 'uppercase',
          marginBottom: '2px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Geist Mono', 'Courier New', monospace",
          fontSize: fluid(13, 17),
          fontWeight: 700,
          color: valueColor,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  )
}

// Re-export types for consumers
export type { MythRegionState, MythRegionConfig, DerivedMythRegion }

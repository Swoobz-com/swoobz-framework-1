'use client'

/**
 * VaultGridCanvas — the hero live-surface for RUG OR RICHES.
 *
 * The degen ape apes into a grid of on-chain coins inside a crypto VAULT.
 * Each safe tap PUMPS (green), each bomb is a RUG PULL (red, the floor drops),
 * cash-out is TAKE PROFIT. Three difficulty worlds — BLUECHIPS, ALTSEASON,
 * SHITCOIN CASINO — each a flat-cartoon vault-interior backdrop telling its
 * risk story (full gold vault → charged vault → ransacked/robbed vault), with
 * its own mode palette + glow. See RUG-OR-RICHES-THEME-BIBLE-2026-06-04.md.
 *
 * RG-C3 STRUCTURAL RENDER CONTRACT (load-bearing):
 * -------------------------------------------------------------------------
 * The render loop reads ONLY: (a) the player's reveal trace (safe coins, in
 * click order), (b) the single rug tile on a rug-pull (terminal), (c) the
 * MOON tile index ONLY ONCE THE PLAYER HAS REVEALED IT. The full rug bitmap
 * is NOT a prop on this component. The canvas cannot draw a coin the player
 * did not tap — the data isn't there.
 *
 * RG-C5 STRUCTURAL: every animation timing is a module-level constant. The
 * type system cannot pass a streak count into any timing. The ape's reaction
 * state is a read of the CURRENT phase + cumulative position, never a streak.
 *
 * Domain C: presentation only. State + math live in vaultProvider + vaultMath.
 */
import { type ReactElement, useEffect, useRef } from 'react'

import {
  formatMultiplier,
  formatUsdc,
  multiplierAfterSafeTiles,
  ONE_X_BPS,
  type VaultMode,
} from './vaultMath'
import {
  heroMultiplierScale,
  heroPopScale,
  RISK_METER_PULSE_PERIOD_MS,
  RISK_METER_PULSE_THRESHOLD,
  riskMeterFraction,
  TILE_DELTA_FLOAT_MS,
  tileDeltaFloatState,
} from './vaultSignatures'
import { playMineHit, playCashOutWin } from './vaultAudio'

// ─── Per-mode candle palette (RUG-OR-RICHES-THEME-BIBLE §palettes) ─────────
// Candle-chart accent economy: green = pump/safe, red = rug/loss, gold = bag/
// reward. NO cyan in this game (documented brand exception). Each mode is the
// same grammar at a different temperature.
interface ModePalette {
  ground: string
  groundDeep: string
  pump: string
  pumpRgb: string
  rug: string
  rugRgb: string
  bag: string
  bagRgb: string
  glow: string
  glowRgb: string
  scrim: number
  backdrop: string
}

export const PALETTES: Record<VaultMode, ModePalette> = {
  bluechips: {
    ground: '#0D1117',
    groundDeep: '#070A0E',
    pump: '#00B366',
    pumpRgb: '0,179,102',
    rug: '#FF4444',
    rugRgb: '255,68,68',
    bag: '#D4A017',
    bagRgb: '212,160,23',
    glow: '#00B366',
    glowRgb: '0,179,102',
    scrim: 0.42,
    backdrop: '/assets/generated/rug-or-riches/backdrop-bluechips.png',
  },
  altseason: {
    ground: '#0A0E12',
    groundDeep: '#05080B',
    // Softened off pure #00FF7F — the neon spring-green blew out on the board
    // (user: "token te groen"). Richer emerald reads pumped without glowing.
    pump: '#00E676',
    pumpRgb: '0,230,118',
    rug: '#FF2244',
    rugRgb: '255,34,68',
    bag: '#FFD700',
    bagRgb: '255,215,0',
    // Volt-cyan wash to match the new alt-season backdrop (was pink #FF66CC,
    // which reintroduced the banned magenta over the cyan art).
    glow: '#00F0FF',
    glowRgb: '0,240,255',
    scrim: 0.48,
    backdrop: '/assets/generated/rug-or-riches/backdrop-altseason.png',
  },
  shitcoin: {
    ground: '#120800',
    groundDeep: '#0A0400',
    // Softened off pure #00FF44 — that electric green fought the warm rubble
    // backdrop and read as garish (user: "token te groen"). Deeper green sits
    // in the shitcoin scene without screaming.
    pump: '#00D455',
    pumpRgb: '0,212,85',
    rug: '#FF2200',
    rugRgb: '255,34,0',
    bag: '#FFB000',
    bagRgb: '255,176,0',
    glow: '#FF6600',
    glowRgb: '255,102,0',
    scrim: 0.42,
    backdrop: '/assets/generated/rug-or-riches/backdrop-shitcoin.png',
  },
}

// Single source of truth for "which backdrop photo + scrim strength belongs
// to the current world" — consumed by VaultExperience's shell-wide DOM
// backdrop layer (desktopGridBackdrop / mobile cabinet backdrop) so the two
// render paths (this canvas's fallback gating below, and the DOM layer that
// now owns the actual paint) can never drift into two different lists of the
// same three PNGs (doortrekken-de-achtergrond fix, 2026-07-06).
export function getModeBackdrop(mode: VaultMode): { backdrop: string; scrim: number } {
  const pal = PALETTES[mode] ?? PALETTES.bluechips
  return { backdrop: pal.backdrop, scrim: pal.scrim }
}

// Designed tile sprites (bold-cartoon $ tokens). Rendered in place of procedural
// circles; procedural drawCoinFace is the fallback until the sprites load.
const COIN_IDLE = '/assets/generated/rug-or-riches/coin-idle.png'
// Face-down tile = a sealed VAULT COMPARTMENT (the board reads as vault vaults
// you crack open, not "coins on a panel" — art-director's #1 identity move).
const TILE_LOCKBOX = '/assets/generated/rug-or-riches/tile-lockbox.png'
const COIN_PUMP = '/assets/generated/rug-or-riches/coin-pump.png'
const TILE_RUG = '/assets/generated/rug-or-riches/tile-rug.png'
const TILE_MOON = '/assets/generated/rug-or-riches/tile-moon.png'

// ─── Lazy image cache (loads once, paints once available; rAF picks it up) ──
const imageCache = new Map<string, HTMLImageElement>()
function getImage(src: string): HTMLImageElement | null {
  if (typeof window === 'undefined') return null
  const cached = imageCache.get(src)
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null
  const img = new Image()
  img.src = src
  imageCache.set(src, img)
  return null
}

// ─── Reveal / brand timing — IDENTICAL EVERY ROUND (RG-C5) ─────────────────
// Module-level constants, not parameters. The type system literally cannot
// pass a streak count through to any animation timing.
const TILE_FLIP_MS = 180
const RUG_BURST_DURATION_MS = 400 // the "crash is a punch" rug burst
const MOON_FLASH_MS = 700
const COIN_ARCS = 8 // authored rug-burst coin trajectories (not particles)
// Reveal "pop": the icon overshoots slightly then settles (chunky, not soft) —
// identical every reveal (RG-C5). motion-director spec.
const REVEAL_PEAK_FRAC = 0.6 // reach the peak earlier so the overshoot has room to bounce (animotty)
const REVEAL_OVERSHOOT = 1.11 // a real chunky "pump" pop (was 1.06 — imperceptible) (animotty)
function revealScale(fp: number, base: number): number {
  if (fp >= 1) return 1
  if (fp < REVEAL_PEAK_FRAC) {
    const t = fp / REVEAL_PEAK_FRAC
    return base + (REVEAL_OVERSHOOT - base) * (1 - (1 - t) ** 3)
  }
  const t = (fp - REVEAL_PEAK_FRAC) / (1 - REVEAL_PEAK_FRAC)
  return REVEAL_OVERSHOOT - (REVEAL_OVERSHOOT - 1) * t
}
// Rug-hit feel (motion-director): the grid punches + a one-shot red flash.
const RUG_SHAKE_MS = 220
const RUG_SHAKE_PX = 5
const RUG_FLASH_MS = 160
// Staggered aftershock — a single delayed concussion ring from the rug tile
// (aliveness-director: hit-stop → headline → aftershock). Authored geometry,
// not particles.
const RUG_RING_DELAY_MS = 165
const RUG_RING_MS = 420
// The PUMP twin of the rug concussion ring — a green glow ring blooms out of a
// safe crack so a win gets the same satisfying "effect around it" as a rug
// (user request). Fixed duration (RG-C5); off under reduced motion.
const SAFE_RING_MS = 460

// ── Ambient aliveness — ALL time-driven only (RG-C5: fixed amplitude +
//    period, never streak/session/value input; gated off reducedMotion). ──
const SCENE_BREATH_HZ = 0.04 // one slow glow breath (~25s) — the vault hums
const SHEEN_PERIOD_MS = 7000 // highlight band sweeps the sealed grid every 7s
const SHEEN_BAND_WIDTH = 1.6 // band width in diagonal tile units
const SHEEN_ALPHA = 0.085 // peak sheen opacity on a sealed compartment
const PRESS_MS = 140 // tile press-bounce duration
const PRESS_DEPTH = 0.05 // tile press-bounce scale dip

const FONT_MONO = '"Geist Mono", ui-monospace, monospace'

// ─── Render contract types — RG-C3 plant ───────────────────────────────────
export interface VaultGridCanvasProps {
  /** Difficulty world — drives palette + backdrop. */
  mode: VaultMode
  /** Grid size — 5 (bluechips/altseason) or 7 (shitcoin). */
  gridSize: number
  /** Rug count for THIS round. Used only for the pump-gauge denominator. */
  mineCount: number
  /** Coins the player has tapped (safe), in reveal order. */
  revealedTiles: number[]
  /**
   * Tile that ended the round on a rug pull. Null during play. THE ONLY rug
   * information the canvas receives — the full bitmap stays in the controller.
   */
  mineHitTileIdx: number | null
  /**
   * MOON tile index — ONLY once the player has revealed it (SHITCOIN). null
   * otherwise. RG-C3: the canvas never knows the MOON position before the tap.
   */
  revealedMoonTileIdx: number | null
  /** Cumulative multiplier in BPS. */
  cumulativeMultiplierBps: bigint
  /** Previous cumulative multiplier in BPS (drives the floating-delta text). */
  previousCumulativeMultiplierBps: bigint
  /** Per-mode house edge in BPS — used to preview the NEXT safe-tap payoff. */
  houseEdgeBps: bigint
  /** Wager in USDC lamports — drives the BAG (cash-out value) readout. */
  wagerLamports: bigint
  /** Phase — drives static-frame vs reveal choreography + ape reaction state. */
  phase: 'bet-entry' | 'playing' | 'mine-hit' | 'settling' | 'settled'
  /** TRAIL play style on? (false = MANUAL classic Mines: tap reveals.) */
  trailMode?: boolean
  /** TRAIL path-betting: the ordered tiles the player has selected. */
  trail?: number[]
  /** Reveal a tile (MANUAL tap). */
  onTileReveal: (tileIdx: number) => void
  /** Toggle a tile on the TRAIL (a clean tap in TRAIL mode). */
  onTileTrail: (tileIdx: number) => void
  /** Append a tile to the TRAIL (hold/drag paint — add-only). */
  onTilePaint: (tileIdx: number) => void
  /** True when `prefers-reduced-motion` is set. */
  reducedMotion: boolean
  /** Board height CSS (the chassis passes a taller value on desktop where the
   *  control panel sits beside the board instead of below it). */
  boardHeightCss?: string
  /**
   * True on the >=960px desktop chassis, false on the narrow/mobile stacked
   * layout (mirrors VaultExperience's `isWide` breakpoint). ONLY used to
   * suppress `drawBottomHint`'s SETTLED caption on mobile, where the
   * near-board `VaultBoardRebet` CTA plate sits over this fixed-pixel text
   * and a long caption ("SECURED THE BAG · {mult}") bleeds out both sides
   * of the plate. Optional/undefined preserves the old always-drawn
   * behavior for any caller that hasn't threaded it yet.
   */
  isWide?: boolean
  /**
   * CSS-GRID CHASSIS REFACTOR (2026-07-05): true when the DOM control column
   * owns the HUD (pump-mult/bag row + rug-risk/next-safe row + settled
   * banner + status caption) — the desktop >=960px chassis now renders those
   * as real DOM elements above/around the board instead of canvas text. When
   * true, `drawHeroPnl`/`drawPumpGauge`/`drawNextPayoff`/`drawBottomHint` are
   * skipped entirely (no double-render) and `computeGridLayout` reserves only
   * a minimal top/bottom/side band (tile padding, not HUD-text space) so the
   * grid fills its container with no dead band. Optional/undefined preserves
   * the old always-drawn-canvas-HUD behavior for the mobile chassis, which
   * keeps its in-canvas HUD unchanged.
   */
  domHudActive?: boolean
}

interface TileAnim {
  idx: number
  safe: boolean
  startedAt: number
  deltaBps: bigint
}

/**
 * GUTTER-CARD BOARD-EDGE ANCHOR (restored 2026-07-05 revert) — the actual
 * visible grid panel (computed by `computeGridLayout`, NOT the full-width
 * `<canvas>` element) is letterboxed inside the canvas on wide viewports.
 * `boardPanelLeftX`/`boardPanelRightX` are the grid panel's own left/right
 * edges, in px relative to the canvas element's own origin (== the
 * `vault-canvas-shell` container's origin, since the canvas fills 100% of
 * that shell) — this is exactly what VaultExperience's gutter cards anchor
 * off (`BETENTRY_PANEL_GAP` px outside these edges) so the cards track the
 * board's actual rendered width on every viewport instead of a fixed offset
 * that broke below/above a crossover width.
 */
export interface VaultBoardLayout {
  boardPanelLeftX: number
  boardPanelRightX: number
  boardShellWidth: number
  boardShellHeight: number
  /** Drawn grid geometry (spec proof surface) — the fixed 96px tile / 16px gap
   *  the 5×5 desktop board locks to (see computeGridLayout), so the DOM chassis
   *  can expose them as data-attributes for measurement. */
  gridTile: number
  gridGap: number
}

export function VaultGridCanvas(
  props: VaultGridCanvasProps & { onBoardLayout?: (layout: VaultBoardLayout) => void },
): ReactElement {
  const { revealedTiles, mineHitTileIdx, phase, reducedMotion } = props
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastSafeRevealAtRef = useRef(0)
  const lastBoardLayoutRef = useRef<VaultBoardLayout | null>(null)

  const propsRef = useRef(props)
  useEffect(() => {
    propsRef.current = props
  }, [props])

  const lastRevealedCountRef = useRef(0)
  const tileAnimsRef = useRef<TileAnim[]>([])
  const lastMineHitRef = useRef<number | null>(null)
  const rugHitAtRef = useRef(0) // timestamp of the last rug hit (shake + flash)
  const pressRef = useRef<{ idx: number; at: number } | null>(null) // tile press-bounce
  // Hovered/aimed compartment (desktop pointer) — drives the green "selection"
  // glow so you can see which vault you're about to crack before you commit.
  const hoverIdxRef = useRef<number | null>(null)
  const lastMoonRef = useRef<number | null>(null)
  const moonFlashAtRef = useRef(0)
  // Eased multiplier (bps) for a smooth count-up on each reveal instead of a
  // hard jump (autisk fix). Snaps on reset / rug / reduced-motion.
  const displayedMultRef = useRef(10_000)
  // Gesture state for tap-vs-hold/drag: a quick tap reveals; a hold or drag
  // paints a TRAIL path. No mode button needed.
  const draggingRef = useRef(false)
  const downTileRef = useRef<number | null>(null)
  const downPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const movedRef = useRef(false)
  const holdActiveRef = useRef(false)
  const holdTimerRef = useRef<number | null>(null)

  useEffect(() => {
    // New safe reveal(s) → flip + per-tile delta float. All timings module
    // consts. Generalized (2026-07-02) from "always exactly one newest tile"
    // to "every tile added since the last render" so it handles BOTH the
    // staggered path (exactly one new tile per effect fire — unchanged
    // behavior) AND the INSTANT reveal-pace batch path (N tiles committed in
    // ONE state update): every tile in the batch gets a `startedAt = now`
    // anim entry pushed in the SAME loop, so all N flips start on the same
    // frame instead of only the last one animating.
    if (revealedTiles.length > lastRevealedCountRef.current) {
      const now = performance.now()
      const totalDeltaBps =
        props.cumulativeMultiplierBps > props.previousCumulativeMultiplierBps
          ? props.cumulativeMultiplierBps - props.previousCumulativeMultiplierBps
          : 0n
      const startIdx = lastRevealedCountRef.current
      const endIdx = revealedTiles.length
      for (let i = startIdx; i < endIdx; i++) {
        const tileIdx = revealedTiles[i]
        if (typeof tileIdx !== 'number') continue
        // Only the LAST tile in the batch carries the floating-delta text —
        // one economic event (one cumulative-bps jump, however many tiles it
        // took) gets exactly one readout, matching revealTile()'s one-call/
        // one-delta contract even when the whole batch commits at once. This
        // also keeps the staggered path byte-identical to before (there,
        // startIdx === endIdx - 1 always, so this is always true).
        const isLastInBatch = i === endIdx - 1
        tileAnimsRef.current.push({
          idx: tileIdx,
          safe: true,
          startedAt: now,
          deltaBps: isLastInBatch ? totalDeltaBps : 0n,
        })
      }
      lastSafeRevealAtRef.current = now
    }
    lastRevealedCountRef.current = revealedTiles.length
  }, [revealedTiles, props.cumulativeMultiplierBps, props.previousCumulativeMultiplierBps])

  useEffect(() => {
    // Rug pull — single burst, calm + final. No celebratory feedback (RG-C1).
    if (mineHitTileIdx !== null && mineHitTileIdx !== lastMineHitRef.current) {
      tileAnimsRef.current.push({
        idx: mineHitTileIdx,
        safe: false,
        startedAt: performance.now(),
        deltaBps: 0n,
      })
      if (!reducedMotion) rugHitAtRef.current = performance.now()
      // Impact sound ON the detonation frame (was silent until settle ~760ms
      // later). Parameterless + identical every hit — RG-C5 safe.
      playMineHit()
    }
    lastMineHitRef.current = mineHitTileIdx
  }, [mineHitTileIdx])

  useEffect(() => {
    // MOON reveal flash (SHITCOIN). Fires once when the MOON tile is tapped.
    if (props.revealedMoonTileIdx !== null && props.revealedMoonTileIdx !== lastMoonRef.current) {
      moonFlashAtRef.current = performance.now()
      // The jackpot deserves a chime — playCashOutWin was defined but never
      // called. Fires once on the MOON reveal. Parameterless → RG-C5 safe.
      playCashOutWin()
    }
    lastMoonRef.current = props.revealedMoonTileIdx
  }, [props.revealedMoonTileIdx])

  useEffect(() => {
    if (phase === 'bet-entry') {
      tileAnimsRef.current = []
      lastRevealedCountRef.current = 0
      lastMineHitRef.current = null
      lastMoonRef.current = null
      lastSafeRevealAtRef.current = 0
      moonFlashAtRef.current = 0
    }
  }, [phase])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const frame = (): void => {
      const rect = canvas.getBoundingClientRect()
      const W = rect.width
      const H = rect.height
      const now = performance.now()
      const p = propsRef.current
      const pal = PALETTES[p.mode] ?? PALETTES.bluechips

      ctx.clearRect(0, 0, W, H)

      // ── Camera shake on a rug hit — a single decaying horizontal jolt
      //    (motion-director). The whole scene jolts, then settles. ──────────
      const rugElapsed = now - rugHitAtRef.current
      let shakeX = 0
      if (rugHitAtRef.current > 0 && rugElapsed >= 0 && rugElapsed < RUG_SHAKE_MS) {
        const decay = 1 - rugElapsed / RUG_SHAKE_MS
        shakeX = RUG_SHAKE_PX * Math.sin((rugElapsed / 73) * Math.PI * 2) * decay
      }
      ctx.save()
      if (shakeX !== 0) ctx.translate(shakeX, 0)

      // ── Scene: backdrop + scrim + breathing glow + vignette ─────────────
      drawDegenScene(ctx, W, H, p, pal, now)

      // ── Grid geometry ──────────────────────────────────────────────────
      const grid = computeGridLayout(W, H, p.gridSize, p.domHudActive ?? false)

      // ── Board-edge anchor callback (restored 2026-07-05) — cheap compare
      //    against the last-sent values so the parent only re-renders when
      //    the board's actual measured edges change (resize, grid-size
      //    switch, or mode change), not every animation frame. ─────────────
      if (p.onBoardLayout) {
        const nextLayout: VaultBoardLayout = {
          boardPanelLeftX: grid.x,
          boardPanelRightX: grid.x + grid.full,
          boardShellWidth: W,
          boardShellHeight: H,
          gridTile: grid.tile,
          gridGap: grid.gap,
        }
        const prevLayout = lastBoardLayoutRef.current
        if (
          !prevLayout ||
          Math.abs(prevLayout.boardPanelLeftX - nextLayout.boardPanelLeftX) > 0.5 ||
          Math.abs(prevLayout.boardPanelRightX - nextLayout.boardPanelRightX) > 0.5 ||
          Math.abs(prevLayout.boardShellWidth - nextLayout.boardShellWidth) > 0.5 ||
          Math.abs(prevLayout.boardShellHeight - nextLayout.boardShellHeight) > 0.5
        ) {
          lastBoardLayoutRef.current = nextLayout
          p.onBoardLayout(nextLayout)
        }
      }

      // ── Terminal panel the grid sits on ────────────────────────────────
      drawTerminalPanel(ctx, grid.x, grid.y, grid.full, pal)

      // ── Hero P&L (top-left) ────────────────────────────────────────────
      const popElapsed =
        lastSafeRevealAtRef.current > 0 ? now - lastSafeRevealAtRef.current : Infinity
      const popScale = p.reducedMotion ? 1 : heroPopScale(popElapsed)
      const isRug = p.phase === 'mine-hit' || (p.phase === 'settled' && p.mineHitTileIdx !== null)
      // Ease the displayed multiplier up toward the real value for a smooth
      // count-up; snap on reset (target ≤ current), rug, or reduced-motion.
      const targetMult = Number(p.cumulativeMultiplierBps)
      if (p.reducedMotion || isRug || targetMult <= displayedMultRef.current) {
        displayedMultRef.current = targetMult
      } else {
        displayedMultRef.current += (targetMult - displayedMultRef.current) * 0.2
        if (targetMult - displayedMultRef.current < 5) displayedMultRef.current = targetMult
      }
      const displayedBps = BigInt(Math.max(0, Math.round(displayedMultRef.current)))
      // autisk 2026-07-04: right inset for the top-right HUD (RUG RISK meter +
      // NEXT-SAFE preview). On the desktop (isWide) chassis VaultExperience
      // paints a corner-chrome globe icon over the board's top-right corner
      // (CHROME token: edgeOffset 16 + size 36 = rightmost 52px, z ABOVE the
      // canvas); 60 tucks the HUD's right edge 8px LEFT of the icon. Mobile
      // has no corner icon, so it keeps the tight 24px inset (no shift).
      const hudRightInset = (p.isWide ?? false) ? 60 : 24
      // CSS-GRID CHASSIS REFACTOR: the desktop chassis renders this same
      // information as a real DOM HUD row above the board (DesktopHudRow in
      // VaultExperience.tsx) — skip the canvas draw there so nothing
      // double-renders. Mobile (domHudActive undefined/false) is unchanged.
      if (!p.domHudActive) {
        drawHeroPnl(ctx, W, displayedBps, p.wagerLamports, p.phase, isRug, popScale, pal, p.isWide ?? false)
      }

      // ── RUG RISK gauge (top-right) ─────────────────────────────────────
      if (
        !p.domHudActive &&
        (p.phase === 'playing' || p.phase === 'mine-hit' || p.phase === 'settling' || p.phase === 'settled')
      ) {
        // Chance the NEXT tap is a rug = rugs / tiles still face-down. Rises as
        // you clear — an honest danger gauge (jesse "10x clearer" fix).
        const tilesLeft = p.gridSize * p.gridSize - p.revealedTiles.length
        const rugRisk = tilesLeft > 0 ? p.mineCount / tilesLeft : 0
        drawPumpGauge(ctx, W, rugRisk, p.phase, now, p.reducedMotion, pal, hudRightInset)
      }

      // ── NEXT SAFE payoff preview (under the gauge) — quantifies the reward
      //    for aping deeper so the greed is visible, not blind (jesse #1). ──
      if (!p.domHudActive && p.phase === 'playing') {
        const totalTiles = p.gridSize * p.gridSize
        const nextSafe = p.revealedTiles.length + 1
        if (nextSafe + p.mineCount <= totalTiles) {
          const nextBps = multiplierAfterSafeTiles({
            totalTiles,
            mineCount: p.mineCount,
            safeCount: nextSafe,
            houseEdgeBps: p.houseEdgeBps,
          })
          const nextBag = (p.wagerLamports * nextBps) / 10_000n
          drawNextPayoff(ctx, W, nextBps, nextBag, pal, hudRightInset)
        }
      }

      // ── Coins (grid tiles) ─────────────────────────────────────────────
      const revealedSet = new Set(p.revealedTiles)
      const revealOrder = new Map<number, number>()
      p.revealedTiles.forEach((idx, i) => revealOrder.set(idx, i + 1))
      const totalTiles = p.gridSize * p.gridSize

      for (let i = 0; i < totalTiles; i++) {
        const row = Math.floor(i / p.gridSize)
        const col = i % p.gridSize
        const x = grid.x + col * (grid.tile + grid.gap)
        const y = grid.y + row * (grid.tile + grid.gap)

        const isRevealedSafe = revealedSet.has(i)
        const isMineHit = p.mineHitTileIdx === i
        const isAfterMine = p.mineHitTileIdx !== null && !isMineHit && !isRevealedSafe
        const isMoon = p.revealedMoonTileIdx === i

        const anim = tileAnimsRef.current.find((a) => a.idx === i)
        let flipProgress = 1
        if (anim && !p.reducedMotion) {
          const dur = anim.safe ? TILE_FLIP_MS : RUG_BURST_DURATION_MS
          flipProgress = Math.min(1, (now - anim.startedAt) / dur)
        }

        // Press-bounce — the tile dips the instant the finger lands (same
        // frame), independent of the reveal. Fixed depth/duration (RG-C5).
        let pressScale = 1
        const press = pressRef.current
        if (press && press.idx === i) {
          const pe = now - press.at
          if (pe >= 0 && pe < PRESS_MS) {
            pressScale = 1 - PRESS_DEPTH * Math.sin((pe / PRESS_MS) * Math.PI)
          }
        }

        // ── SELECTION GLOW — the aimed sealed compartment gets a soft green
        //    halo + ring (desktop hover) so you can see which vault you're
        //    about to crack. Same warm-glow grammar as the rug reveal, but in
        //    the pump-green so it reads as "safe pick". Time-driven pulse only
        //    (RG-C5: fixed amplitude/period, no streak/value input); off under
        //    reduced motion. ────────────────────────────────────────────────
        if (
          !p.reducedMotion &&
          p.phase === 'playing' &&
          hoverIdxRef.current === i &&
          !isRevealedSafe &&
          !isMineHit &&
          !isAfterMine &&
          flipProgress >= 1
        ) {
          const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * 0.9)
          ctx.save()
          ctx.shadowColor = `rgba(${pal.pumpRgb},${(0.5 + 0.3 * pulse).toFixed(3)})`
          ctx.shadowBlur = grid.tile * (0.24 + 0.06 * pulse)
          ctx.strokeStyle = `rgba(${pal.pumpRgb},${(0.7 + 0.25 * pulse).toFixed(3)})`
          ctx.lineWidth = Math.max(2, grid.tile * 0.045)
          roundedRect(
            ctx,
            x + grid.tile * 0.06,
            y + grid.tile * 0.06,
            grid.tile * 0.88,
            grid.tile * 0.88,
            grid.tile * 0.16,
          )
          ctx.stroke()
          ctx.restore()
        }

        ctx.save()
        if (pressScale !== 1) {
          const cx = x + grid.tile / 2
          const cy = y + grid.tile / 2
          ctx.translate(cx, cy)
          ctx.scale(pressScale, pressScale)
          ctx.translate(-cx, -cy)
        }
        drawCoin(ctx, {
          idx: i,
          x,
          y,
          size: grid.tile,
          isRevealedSafe,
          isMineHit,
          isAfterMine,
          isMoon,
          flipProgress,
          revealNumber: revealOrder.get(i),
          pal,
        })
        ctx.restore()

        // ── SAFE REVEAL RING — a green glow ring blooms out of a freshly
        //    cracked compartment, the pump twin of the rug's red concussion
        //    ring (user: "wil ik ook voor groene symbol"). Authored geometry,
        //    fixed timing (RG-C5); off under reduced motion. ────────────────
        if (!p.reducedMotion && isRevealedSafe && anim && anim.safe) {
          const ringT = (now - anim.startedAt) / SAFE_RING_MS
          if (ringT >= 0 && ringT < 1) {
            const cx = x + grid.tile / 2
            const cy = y + grid.tile / 2
            const ease = 1 - (1 - ringT) ** 3
            ctx.save()
            ctx.shadowColor = `rgba(${pal.pumpRgb},${(0.5 * (1 - ringT)).toFixed(3)})`
            ctx.shadowBlur = grid.tile * 0.16 * (1 - ringT)
            ctx.strokeStyle = `rgba(${pal.pumpRgb},${(0.7 * (1 - ringT)).toFixed(3)})`
            ctx.lineWidth = Math.max(2, grid.tile * 0.07 * (1 - ringT))
            ctx.beginPath()
            ctx.arc(cx, cy, grid.tile * (0.4 + 0.62 * ease), 0, Math.PI * 2)
            ctx.stroke()
            ctx.restore()
          }
        }

        // Idle sheen — a soft highlight band sweeps diagonally across the
        // SEALED compartments every SHEEN_PERIOD_MS, so the grid is never
        // dead-still. Time-only input, fixed amplitude (RG-C5); off under
        // reduced-motion. Authored gradient sweep — not particles.
        if (
          !p.reducedMotion &&
          !isRevealedSafe &&
          !isMineHit &&
          !isAfterMine &&
          flipProgress >= 1
        ) {
          const diagMax = 2 * (p.gridSize - 1) + SHEEN_BAND_WIDTH * 2
          const band = ((now % SHEEN_PERIOD_MS) / SHEEN_PERIOD_MS) * diagMax - SHEEN_BAND_WIDTH
          const dist = Math.abs(row + col - band)
          if (dist < SHEEN_BAND_WIDTH) {
            const glint = 1 - dist / SHEEN_BAND_WIDTH
            ctx.save()
            roundedRect(
              ctx,
              x + grid.tile * 0.07,
              y + grid.tile * 0.07,
              grid.tile * 0.86,
              grid.tile * 0.86,
              grid.tile * 0.16,
            )
            ctx.clip()
            ctx.fillStyle = `rgba(255,255,255,${(SHEEN_ALPHA * glint).toFixed(3)})`
            ctx.fillRect(x, y, grid.tile, grid.tile)
            ctx.restore()
          }
        }
      }

      // ── Rug AFTERSHOCK — one delayed concussion ring expanding from the
      //    rug tile (authored geometry, fixed timing consts — RG-C5). ──────
      if (!p.reducedMotion && rugHitAtRef.current > 0 && p.mineHitTileIdx !== null) {
        const ringT = (rugElapsed - RUG_RING_DELAY_MS) / RUG_RING_MS
        if (ringT >= 0 && ringT < 1) {
          const mRow = Math.floor(p.mineHitTileIdx / p.gridSize)
          const mCol = p.mineHitTileIdx % p.gridSize
          const mcx = grid.x + mCol * (grid.tile + grid.gap) + grid.tile / 2
          const mcy = grid.y + mRow * (grid.tile + grid.gap) + grid.tile / 2
          const ease = 1 - (1 - ringT) ** 3
          ctx.save()
          ctx.strokeStyle = `rgba(${pal.rugRgb},${(0.38 * (1 - ringT)).toFixed(3)})`
          ctx.lineWidth = Math.max(2, grid.tile * 0.06 * (1 - ringT))
          ctx.beginPath()
          ctx.arc(mcx, mcy, grid.tile * (0.55 + 2.4 * ease), 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }

      // ── TRAIL overlay: green ring + order number on each selected tile ─
      if (p.trail && p.trail.length > 0) {
        p.trail.forEach((tileIdx, order) => {
          if (revealedSet.has(tileIdx)) return
          const row = Math.floor(tileIdx / p.gridSize)
          const col = tileIdx % p.gridSize
          const x = grid.x + col * (grid.tile + grid.gap)
          const y = grid.y + row * (grid.tile + grid.gap)
          ctx.save()
          // Green glow ring — matches the hover selection grammar so a planned
          // trail tile reads as the same "safe pick" highlight.
          ctx.shadowColor = `rgba(${pal.pumpRgb},0.6)`
          ctx.shadowBlur = grid.tile * 0.18
          ctx.strokeStyle = `rgba(${pal.pumpRgb},0.95)`
          ctx.lineWidth = 2.5
          roundedRect(ctx, x + 2, y + 2, grid.tile - 4, grid.tile - 4, 8)
          ctx.stroke()
          ctx.shadowBlur = 0
          const bx = x + grid.tile / 2
          const by = y + grid.tile / 2
          const r = Math.max(9, grid.tile * 0.2)
          ctx.fillStyle = 'rgba(0,230,118,0.92)'
          ctx.beginPath()
          ctx.arc(bx, by, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#04140b'
          ctx.font = `700 ${Math.max(10, grid.tile * 0.24)}px ${FONT_MONO}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(order + 1), bx, by + 1)
          ctx.restore()
        })
      }

      // ── Rug-burst coin scatter (authored arcs, not particles) ──────────
      if (!p.reducedMotion) {
        for (const anim of tileAnimsRef.current) {
          if (anim.safe) continue
          const elapsed = now - anim.startedAt
          if (elapsed >= RUG_BURST_DURATION_MS) continue
          const row = Math.floor(anim.idx / p.gridSize)
          const col = anim.idx % p.gridSize
          const cx = grid.x + col * (grid.tile + grid.gap) + grid.tile / 2
          const cy = grid.y + row * (grid.tile + grid.gap) + grid.tile / 2
          drawRugBurst(ctx, cx, cy, grid.tile, elapsed / RUG_BURST_DURATION_MS, pal)
        }
      }

      // ── Floating "+N.NNx" pump delta on safe reveals ───────────────────
      if (!p.reducedMotion) {
        for (const anim of tileAnimsRef.current) {
          if (!anim.safe || anim.deltaBps <= 0n) continue
          const elapsed = now - anim.startedAt
          if (elapsed >= TILE_DELTA_FLOAT_MS) continue
          const row = Math.floor(anim.idx / p.gridSize)
          const col = anim.idx % p.gridSize
          const cx = grid.x + col * (grid.tile + grid.gap) + grid.tile / 2
          const cy = grid.y + row * (grid.tile + grid.gap) + grid.tile * 0.18
          const { dy, alpha } = tileDeltaFloatState(elapsed)
          drawFloatingDelta(ctx, cx, cy + dy, anim.deltaBps, alpha, pal)
        }
      }

      // ── MOON flash overlay ─────────────────────────────────────────────
      if (!p.reducedMotion && moonFlashAtRef.current > 0) {
        const me = now - moonFlashAtRef.current
        if (me < MOON_FLASH_MS) drawMoonFlash(ctx, W, H, me / MOON_FLASH_MS, pal)
      }

      // ── Bottom status hint ─────────────────────────────────────────────
      // CSS-GRID CHASSIS REFACTOR: the desktop chassis renders this same
      // status text as a DOM caption below the board (boardCaptionText in
      // VaultExperience.tsx) — skip the canvas draw there. Mobile unchanged.
      if (!p.domHudActive) drawBottomHint(ctx, W, H, p, pal)

      ctx.restore() // end camera-shake transform

      // ── One-shot red flash on a rug hit (motion-director) — a single
      //    radial vignette that fires once and fades, no loop. ─────────────
      if (rugHitAtRef.current > 0 && rugElapsed >= 0 && rugElapsed < RUG_FLASH_MS) {
        const a = (1 - (rugElapsed / RUG_FLASH_MS) ** 3) * 0.42
        const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.72)
        g.addColorStop(0, `rgba(${pal.rugRgb},0)`)
        g.addColorStop(1, `rgba(${pal.rugRgb},${a})`)
        ctx.save()
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
      }

      // GC old anims.
      tileAnimsRef.current = tileAnimsRef.current.filter((a) => {
        const flipDur = a.safe ? TILE_FLIP_MS : RUG_BURST_DURATION_MS
        const dur = Math.max(flipDur, a.safe ? TILE_DELTA_FLOAT_MS : 0)
        return now - a.startedAt < dur + 200
      })

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)

    return () => {
      ro.disconnect()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [reducedMotion])

  // Map a pointer event to a tile index (with gap tap-forgiveness), or null.
  const tileIdxFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): number | null => {
    const p = propsRef.current
    if (p.phase !== 'playing') return null
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const grid = computeGridLayout(rect.width, rect.height, p.gridSize, p.domHudActive ?? false)
    const col = Math.floor((x - grid.x) / (grid.tile + grid.gap))
    const row = Math.floor((y - grid.y) / (grid.tile + grid.gap))
    // Tap forgiveness: the whole cell (tile + its gap) is tappable (autisk fix).
    if (col < 0 || col >= p.gridSize || row < 0 || row >= p.gridSize) return null
    return row * p.gridSize + col
  }

  // Add a tile to the trail during a paint gesture — add-only (append-if-absent
  // in the provider; never toggles/removes).
  const paintTrail = (idx: number): void => {
    propsRef.current.onTilePaint(idx)
  }

  const HOLD_MS = 220
  const DRAG_THRESHOLD_PX = 10

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const idx = tileIdxFromEvent(e)
    if (idx === null) return
    // Touch-down is answered THIS frame (press-bounce), decoupled from the
    // reveal state commit. Fixed depth + duration (RG-C5).
    if (!propsRef.current.reducedMotion) pressRef.current = { idx, at: performance.now() }
    // MANUAL (classic Mines): a tap reveals immediately — no gesture at all.
    if (!propsRef.current.trailMode) {
      propsRef.current.onTileReveal(idx)
      return
    }
    // TRAIL: hold/drag paints a path; a clean tap toggles a tile.
    draggingRef.current = true
    downTileRef.current = idx
    downPosRef.current = { x: e.clientX, y: e.clientY }
    movedRef.current = false
    holdActiveRef.current = false
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
    // HOLD: after a short press (no movement), start a trail from this tile.
    holdTimerRef.current = window.setTimeout(() => {
      holdActiveRef.current = true
      if (downTileRef.current !== null) paintTrail(downTileRef.current)
    }, HOLD_MS)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    // Track the aimed compartment for the green selection glow (any pointer,
    // even when not dragging). Fine-pointer only — touch has no hover state.
    if (e.pointerType !== 'touch') hoverIdxRef.current = tileIdxFromEvent(e)
    if (!draggingRef.current) return
    const dx = e.clientX - downPosRef.current.x
    const dy = e.clientY - downPosRef.current.y
    if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    // Crossed the drag threshold → this is a DRAG (paint a trail).
    if (!movedRef.current) {
      movedRef.current = true
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
      if (downTileRef.current !== null) paintTrail(downTileRef.current) // include start tile
    }
    const idx = tileIdxFromEvent(e)
    if (idx !== null) paintTrail(idx)
  }

  const handlePointerUp = (): void => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
    const wasGesture = movedRef.current || holdActiveRef.current
    const idx = downTileRef.current
    draggingRef.current = false
    downTileRef.current = null
    if (wasGesture || idx === null) return // paint already happened
    // Clean TAP in TRAIL mode → toggle the tile on/off the path. (MANUAL taps
    // never reach here — they reveal on pointer-down.)
    propsRef.current.onTileTrail(idx)
  }
  const cancelDrag = (): void => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
    draggingRef.current = false
    downTileRef.current = null
    hoverIdxRef.current = null // drop the selection glow when the pointer leaves
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={cancelDrag}
      onPointerCancel={cancelDrag}
      aria-label={phase === 'playing' ? 'Coin grid — tap to open, hold and drag to plan a trail' : 'RUG OR RICHES grid'}
      style={{
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: props.boardHeightCss ?? 'min(58vh, 500px)',
        display: 'block',
        background: 'transparent',
        cursor: phase === 'playing' ? 'pointer' : 'default',
        // 'none' so a touch DRAG paints a trail instead of scrolling the page.
        touchAction: 'none',
      }}
    />
  )
}

// ─── Layout ─────────────────────────────────────────────────────────────────

interface GridLayout {
  x: number
  y: number
  tile: number
  gap: number
  full: number
}

function computeGridLayout(
  W: number,
  H: number,
  gridSize: number,
  // CSS-GRID CHASSIS REFACTOR (2026-07-05): true once the DOM HUD row/
  // caption own the space the canvas used to reserve for its own HUD text
  // (drawHeroPnl/drawPumpGauge/drawNextPayoff/drawBottomHint, all skipped
  // when this is true — see domHudActive on VaultGridCanvasProps). The
  // canvas then only needs a small tile-padding margin, not 12-18% bands —
  // this is the fix for the "dead space under the grid" defect: the OLD
  // bands existed to leave room for HUD text that no longer paints here.
  minimalBands = false,
): GridLayout {
  // Reserve top space for the P&L readout and bottom space for the status
  // hint. On WIDE (landscape) boards the HUD hugs the left/right edges while
  // the grid sits centred, so the vertical bands can be tighter — otherwise
  // the height-bound grid under-fills the board (autisk: it seated at only
  // ~46-53% of the board width on desktop). Portrait/mobile keeps the roomier
  // bands (there the HUD and grid share horizontal space).
  const wide = W / H > 1.2
  const topReserved = minimalBands ? H * 0.035 : H * (wide ? 0.12 : 0.15)
  const bottomReserved = minimalBands ? H * 0.035 : H * (wide ? 0.14 : 0.18)
  const sideFrac = minimalBands ? 0.04 : 0.08
  const safeW = W * (1 - sideFrac * 2)
  const safeH = (H - topReserved - bottomReserved) * 0.96
  const available = Math.min(safeW, safeH)
  // LAYOUT-SPEC FIXED BOARD (2026-07-06) — on the desktop DOM-HUD chassis
  // (`minimalBands`), lock the grid to the spec's fixed tile/gap so the 5×5
  // board measures EXACTLY 96px tiles + 16px gaps = 544px grid (plate = 544 +
  // 24×2 padding = 592) at every desktop viewport height, keeping the board
  // width — and therefore the board Y — rock-stable across phases instead of
  // the old fluid `available*0.026` sizing that drifted with viewport height.
  // Applied only when it fits inside the available square; the 7×7 SHITCOIN
  // world (768px at 96/16) exceeds the height-bound square, so it cleanly
  // falls through to the fluid path below and scales to fit as before.
  const FIXED_TILE = 96
  const FIXED_GAP = 16
  const fixedFull = FIXED_TILE * gridSize + FIXED_GAP * (gridSize - 1)
  if (minimalBands && fixedFull <= available + 0.5) {
    const x = (W - fixedFull) / 2
    const bandCenterY = topReserved + (H - topReserved - bottomReserved) / 2
    const y = bandCenterY - fixedFull / 2
    return { x, y, tile: FIXED_TILE, gap: FIXED_GAP, full: fixedFull }
  }
  const gap = Math.max(6, available * 0.026)
  const tile = (available - gap * (gridSize - 1)) / gridSize
  const full = tile * gridSize + gap * (gridSize - 1)
  const x = (W - full) / 2
  const bandCenterY = topReserved + (H - topReserved - bottomReserved) / 2
  const y = bandCenterY - full / 2
  return { x, y, tile, gap, full }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// The scene glow-wash + focal vignette are geometry-and-mode-fixed radial
// gradients — identical every frame until the canvas resizes or the mode
// changes. Cache them (keyed by ctx + dims + mode) instead of allocating two
// CanvasGradients per frame in the rAF loop (perf — aliveness-director note).
let sceneGradCache: {
  ctx: CanvasRenderingContext2D
  key: string
  wash: CanvasGradient
  vignette: CanvasGradient
} | null = null
function degenGradients(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pal: ModePalette,
  mode: VaultMode,
): { wash: CanvasGradient; vignette: CanvasGradient } {
  const key = `${Math.round(W)}x${Math.round(H)}x${mode}`
  if (sceneGradCache && sceneGradCache.ctx === ctx && sceneGradCache.key === key) {
    return sceneGradCache
  }
  const wash = ctx.createRadialGradient(W * 0.5, H * 0.14, 0, W * 0.5, H * 0.14, H * 0.95)
  wash.addColorStop(0, `rgba(${pal.glowRgb},0.12)`)
  wash.addColorStop(1, 'rgba(0,0,0,0)')
  const vignette = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.18, W * 0.5, H * 0.5, H * 0.95)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, `rgba(${hexToRgb(pal.groundDeep)},0.78)`)
  sceneGradCache = { ctx, key, wash, vignette }
  return sceneGradCache
}

// ─── Scene: BOLD FLAT illustrated backdrop ─────────────────────────────────
// The per-world backdrops are flat cartoon poster-illustrations (bold ink
// outline, cel-shaded, dark empty centre) drawn in the SAME register as the
// coins — one cohesive bold-illustration style. When a backdrop image hasn't
// loaded yet we fall back to flat procedural geometry (trend/skyline/ember).

function drawDegenScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: VaultGridCanvasProps,
  pal: ModePalette,
  now: number,
): void {
  // 1. Base: the per-world BACKDROP photo used to be drawn straight onto this
  //    canvas (cover-fit + scrim), which is exactly why it stopped dead at
  //    the board's right edge with a hard seam against the control column
  //    (Tim, 2026-07-06: "kun je de achtergrond foto doortrekken zodat het
  //    ook achter het betting paneel zit?"). The backdrop photo is now a
  //    shell-wide DOM layer painted ONCE behind the whole desktop grid AND
  //    the mobile cabinet (see `desktopGridBackdrop` / the mobile backdrop
  //    layer in VaultExperience.tsx, both sourced from this file's
  //    `getModeBackdrop`), so this canvas must NOT paint it a second time —
  //    that would double-draw the art and risk it drifting out of alignment
  //    with the DOM copy. This canvas stays fully TRANSPARENT for the photo
  //    layer (no fill here at all) so the DOM backdrop shows straight
  //    through the board area; the per-world scrim also moved to the DOM
  //    layer for the same reason (keeping it here too would double-darken
  //    the board relative to the un-scrimmed control column and reintroduce
  //    a — softer — seam).
  //    We still track the photo's load state via `getImage` (unchanged
  //    cache) purely to gate the procedural fallback graphics below — they
  //    exist for the brief window before the photo has loaded and must not
  //    render once the real backdrop (now painted by the DOM layer) is up,
  //    or they'd clash with the rendered room.
  const backdrop = getImage(pal.backdrop)
  if (!(backdrop && backdrop.naturalWidth > 0)) {
    // Procedural fallback: flat ground gradient, drawn on THIS canvas only
    // (the DOM layer has no photo yet either at this point, so nothing else
    // is painting the board area — this keeps the board from reading as a
    // void while the shared photo asset is still in flight).
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, pal.ground)
    g.addColorStop(1, pal.groundDeep)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  // 2. A soft mode-glow wash from the top (sets the world temperature). The
  //    wash + vignette (step 6) are cached per (ctx, dims, mode) — see above.
  //    The wash BREATHES on one slow fixed-period sine (the vault hums) —
  //    time-only input, fixed amplitude, off under reduced-motion (RG-C5).
  const grads = degenGradients(ctx, W, H, pal, p.mode)
  const breath = p.reducedMotion
    ? 1
    : 0.78 + 0.22 * (0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * SCENE_BREATH_HZ))
  ctx.save()
  ctx.globalAlpha = breath
  ctx.fillStyle = grads.wash
  ctx.fillRect(0, 0, W, H)
  ctx.restore()

  // 3-5. Procedural scene graphics — ONLY when there is no backdrop image
  //     (they'd clash with the rendered room). Trend line / skyline / ember.
  if (!(backdrop && backdrop.naturalWidth > 0)) {
    drawTrendLine(ctx, W, H, pal, p.mode)
    drawFlatSkyline(ctx, W, H, pal)
    if (p.mode === 'shitcoin') drawEmberBand(ctx, W, H, pal)
  }

  // 6. Focal vignette — darkens the corners + a soft glow seats the grid as
  //    the unambiguous focal point (cached alongside the wash, above).
  ctx.fillStyle = grads.vignette
  ctx.fillRect(0, 0, W, H)
}

// ONE bold trend line with a soft area fill — the single hero backdrop graphic.
// Deterministic shape per mode (RG-C5 safe). Replaces the old candle pattern.
function drawTrendLine(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pal: ModePalette,
  mode: VaultMode,
): void {
  const n = 7
  const midY = H * 0.52
  const amp = H * 0.2
  // Per-mode normalized trajectory (left→right), values in [-1 (low) .. 1 (high)].
  const traj: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const jag = Math.sin(i * 2.7) * (mode === 'altseason' ? 0.4 : 0.16)
    let base: number
    if (mode === 'shitcoin') base = 0.8 - t * 1.7 // crash: high → low
    else if (mode === 'altseason') base = -0.3 + t * 0.9 // volatile climb
    else base = -0.5 + t * 1.0 // steady climb
    traj.push(Math.max(-1, Math.min(1, base + jag)))
  }
  const isDown = mode === 'shitcoin'
  const colRgb = isDown ? pal.rugRgb : pal.pumpRgb
  const px = (i: number) => (i / n) * W
  const py = (v: number) => midY - v * amp
  ctx.save()
  // Area fill under the line.
  ctx.beginPath()
  ctx.moveTo(0, H)
  for (let i = 0; i <= n; i++) ctx.lineTo(px(i), py(traj[i]!))
  ctx.lineTo(W, H)
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, midY - amp, 0, H)
  fill.addColorStop(0, `rgba(${colRgb},0.12)`)
  fill.addColorStop(1, `rgba(${colRgb},0)`)
  ctx.fillStyle = fill
  ctx.fill()
  // The line itself — bold, soft glow.
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const x = px(i)
    const y = py(traj[i]!)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = `rgba(${colRgb},0.5)`
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.shadowColor = `rgba(${colRgb},0.4)`
  ctx.shadowBlur = 14
  ctx.stroke()
  ctx.restore()
}

// Deterministic flat tower silhouette — a bold city skyline, low in the frame.
function drawFlatSkyline(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pal: ModePalette,
): void {
  const baseY = H * 0.78
  const towerW = Math.max(34, W / 22)
  const count = Math.ceil(W / towerW) + 1
  ctx.save()
  ctx.globalAlpha = 0.5
  for (let i = 0; i < count; i++) {
    const h01 = 0.35 + ((Math.sin(i * 2.3) + 1) / 2) * 0.6
    const th = H * 0.3 * h01
    const x = i * towerW
    ctx.fillStyle = `rgba(${hexToRgb(pal.groundDeep)},0.96)`
    ctx.fillRect(x, baseY - th, towerW - 3, th + H)
    // Lit windows: faint mode-glow dots.
    ctx.fillStyle = `rgba(${pal.glowRgb},0.1)`
    const rows = Math.floor(th / 18)
    for (let r = 0; r < rows; r++) {
      if ((i + r) % 3 === 0) ctx.fillRect(x + 5, baseY - th + 8 + r * 18, towerW - 13, 4)
    }
  }
  ctx.restore()
}

// SHITCOIN ember band — flat flame triangles + warm glow at the very bottom.
function drawEmberBand(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  pal: ModePalette,
): void {
  const bandH = H * 0.14
  const grad = ctx.createLinearGradient(0, H - bandH, 0, H)
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, `rgba(${pal.glowRgb},0.32)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, H - bandH, W, bandH)
  // Flat flame triangles along the bottom edge (left + right clusters).
  ctx.save()
  ctx.globalAlpha = 0.5
  const flameW = Math.max(22, W / 36)
  const drawFlames = (x0: number, x1: number) => {
    for (let x = x0; x < x1; x += flameW) {
      const fh = bandH * (0.5 + ((Math.sin(x * 0.4) + 1) / 2) * 0.7)
      ctx.fillStyle = pal.glow
      ctx.beginPath()
      ctx.moveTo(x, H)
      ctx.lineTo(x + flameW * 0.5, H - fh)
      ctx.lineTo(x + flameW, H)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = pal.bag
      ctx.beginPath()
      ctx.moveTo(x + flameW * 0.25, H)
      ctx.lineTo(x + flameW * 0.5, H - fh * 0.55)
      ctx.lineTo(x + flameW * 0.75, H)
      ctx.closePath()
      ctx.fill()
    }
  }
  drawFlames(0, W * 0.22)
  drawFlames(W * 0.78, W)
  ctx.restore()
}


// ─── Terminal panel (grid substrate) ───────────────────────────────────────

function drawTerminalPanel(
  ctx: CanvasRenderingContext2D,
  gridX: number,
  gridY: number,
  gridFull: number,
  pal: ModePalette,
): void {
  const pad = Math.max(14, gridFull * 0.045)
  const px = gridX - pad
  const py = gridY - pad
  const pw = gridFull + pad * 2
  const ph = gridFull + pad * 2
  const radius = Math.max(12, gridFull * 0.03)

  // Embedded recess for the grid — NO borders, NO colored rule. A soft dark
  // translucent backing grounded by a drop shadow + a faint top sheen, so the
  // coins read as sitting INSIDE the scene rather than on an outlined card.
  void pal
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 34
  ctx.shadowOffsetY = 12
  const fg = ctx.createLinearGradient(0, py, 0, py + ph)
  fg.addColorStop(0, 'rgba(14,18,25,0.5)')
  fg.addColorStop(1, 'rgba(8,11,16,0.62)')
  ctx.fillStyle = fg
  roundedRect(ctx, px, py, pw, ph, radius)
  ctx.fill()
  ctx.restore()

  // Faint top sheen (a soft highlight, not a hard rule).
  ctx.save()
  ctx.beginPath()
  roundedRect(ctx, px, py, pw, ph, radius)
  ctx.clip()
  const sheen = ctx.createLinearGradient(0, py, 0, py + ph * 0.4)
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)')
  sheen.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sheen
  ctx.fillRect(px, py, pw, ph * 0.4)
  ctx.restore()
}

// ─── Coin (tile) rendering ──────────────────────────────────────────────────

interface DrawCoinArgs {
  idx: number
  x: number
  y: number
  size: number
  isRevealedSafe: boolean
  isMineHit: boolean
  isAfterMine: boolean
  isMoon: boolean
  flipProgress: number
  revealNumber: number | undefined
  pal: ModePalette
}

// Draw a designed tile sprite centred in the tile box, scaled by `scale`. The
// sprite already carries transparent padding, so we slightly oversize it to
// fill the cell. Optional glow for the special tiles.
function drawTileSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  size: number,
  scale: number,
  glowRgb?: string,
  // Halo strength. Default is the punchy rug/moon bloom; the pump token passes
  // a calmer halo so the green doesn't blow out (user: "token te groen").
  glowAlpha = 0.75,
  glowScale = 0.32,
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.translate(-cx, -cy)
  if (glowRgb) {
    ctx.shadowColor = `rgba(${glowRgb},${glowAlpha})`
    ctx.shadowBlur = size * glowScale
  }
  // 1.08 (was 1.18) — at 1.18 the sprite sat 18% wider than the cell while the
  // inter-tile gap is only ~2.6%, so revealed symbols overlapped their
  // neighbours (user: "de symbol overlapt"). 1.08 fills the cell edge-to-edge
  // without bleeding into the next tile.
  const s = size * 1.08
  ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s)
  ctx.restore()
}

function drawCoin(ctx: CanvasRenderingContext2D, a: DrawCoinArgs): void {
  const { idx, x, y, size, isRevealedSafe, isMineHit, isAfterMine, isMoon, flipProgress, revealNumber, pal } = a
  const cx = x + size / 2
  const cy = y + size / 2
  const r = size * 0.42
  ctx.save()

  if (isMineHit) {
    const flash = 1 - flipProgress
    const sprite = getImage(TILE_RUG)
    if (sprite) {
      // Punch-IN: the bomb lands hard at ~1.28× then SNAPS back (squared decay,
      // not a slow linear deflate) so it reads as a hit, not a leaking balloon.
      drawTileSprite(ctx, sprite, cx, cy, size, 1 + (1 - flipProgress) ** 2 * 0.28, pal.rugRgb)
    } else {
      // Procedural fallback.
      ctx.fillStyle = `rgba(${pal.rugRgb},${0.5 + flash * 0.3})`
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = Math.max(2, size * 0.04)
      ctx.strokeStyle = pal.rug
      ctx.stroke()
    }
  } else if (isMoon) {
    const eased = 1 - (1 - flipProgress) ** 3
    const sprite = getImage(TILE_MOON)
    if (sprite) {
      // Rests at 1.0 (dropped the 1.06 bump) so it fills the cell without
      // overlapping neighbours, matching the pump coin.
      drawTileSprite(ctx, sprite, cx, cy, size, revealScale(flipProgress, 0.6), pal.bagRgb)
    } else {
      ctx.save()
      ctx.shadowColor = `rgba(${pal.bagRgb},0.8)`
      ctx.shadowBlur = size * 0.4 * eased
      ctx.fillStyle = pal.bag
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  } else if (isRevealedSafe) {
    const eased = 1 - (1 - flipProgress) ** 3
    const sprite = getImage(COIN_PUMP)
    if (sprite) {
      // Gem "pumps" up: overshoot then settle (motion-director). Rests at 1.0
      // (was 1.06) — the extra bump pushed the coin past the cell and it
      // overlapped neighbours (user). Calmer halo (0.42 / 0.22) so the pump
      // green reads rich, not neon; the expanding reveal ring below carries the
      // "nice effect around it" the player asked for.
      drawTileSprite(ctx, sprite, cx, cy, size, revealScale(flipProgress, 0.7), pal.pumpRgb, 0.42, 0.22)
    } else {
      ctx.fillStyle = `rgba(${pal.pumpRgb},${0.2 + 0.12 * eased})`
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.lineWidth = Math.max(1.4, size * 0.022)
      ctx.strokeStyle = `rgba(${pal.pumpRgb},${0.6 + 0.3 * eased})`
      ctx.stroke()
    }
    // Faint reveal-order number bottom-corner (the trace).
    if (revealNumber !== undefined) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * eased})`
      ctx.font = `700 ${Math.max(8, size * 0.14)}px ${FONT_MONO}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(revealNumber), cx, cy + size * 0.3)
    }
  } else if (isAfterMine) {
    // Dimmed sealed compartment — the player never cracked this one. RG-C3.
    ctx.globalAlpha = 0.32
    const sprite = getImage(TILE_LOCKBOX)
    if (sprite) drawTileSprite(ctx, sprite, cx, cy, size, 0.98)
    else drawCoinFace(ctx, cx, cy, r, size, pal, true)
  } else {
    // Untapped = a sealed vault compartment you tap to crack open.
    const sprite = getImage(TILE_LOCKBOX)
    if (sprite) drawTileSprite(ctx, sprite, cx, cy, size, 1.0)
    else drawCoinFace(ctx, cx, cy, r, size, pal, false)
  }
  ctx.restore()
}

function drawCoinFace(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  size: number,
  pal: ModePalette,
  dim: boolean,
): void {
  // Coin body — dark metal with a soft top sheen + mode-rim.
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
  g.addColorStop(0, dim ? 'rgba(40,44,52,0.6)' : 'rgba(46,52,62,0.95)')
  g.addColorStop(1, dim ? 'rgba(20,22,28,0.6)' : 'rgba(22,26,32,0.98)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  // Rim.
  ctx.lineWidth = Math.max(1.2, size * 0.02)
  ctx.strokeStyle = `rgba(${pal.bagRgb},${dim ? 0.18 : 0.42})`
  ctx.stroke()
  // Inner ring.
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2)
  ctx.stroke()
  // $ glyph.
  ctx.fillStyle = `rgba(${pal.bagRgb},${dim ? 0.22 : 0.5})`
  ctx.font = `800 ${size * 0.34}px ${FONT_MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('$', cx, cy + size * 0.02)
}

// ─── Hero P&L readout ───────────────────────────────────────────────────────

function drawHeroPnl(
  ctx: CanvasRenderingContext2D,
  W: number,
  cumulativeBps: bigint,
  wagerLamports: bigint,
  phase: VaultGridCanvasProps['phase'],
  isRug: boolean,
  popScale: number,
  pal: ModePalette,
  // autisk 2026-07-04 (defect #2): on the desktop (isWide) chassis the left-
  // gutter status/result card (vault-playing-status / vault-settled-result)
  // sits directly over this top-left headline's 3rd (subtitle) line AND fully
  // repeats it ("BAG NOW · x"/"BAGGED · x"). Suppress the redundant subtitle
  // there so nothing renders under the card — the card is the single source of
  // that value on desktop. Mobile (isWide=false) has no gutter card overlapping
  // the board headline, so it KEEPS the subtitle (its own bottom panel doesn't
  // occlude the canvas), preserving the loss-narrative "floor dropped out" line.
  isWide: boolean,
): void {
  if (phase !== 'playing' && phase !== 'settled' && phase !== 'mine-hit' && phase !== 'settling') return
  // On a rug the round is BUST — never show the surviving multiplier (it reads
  // as "broke even"). Hero collapses to 0.00× + the loss (jesse honesty fix).
  const baseScale = heroMultiplierScale(isRug ? 0n : cumulativeBps)
  const baseSize = Math.min(52, W * 0.058)
  const fontSize = baseSize * baseScale * popScale
  const mulX = Number(cumulativeBps) / 10_000

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.62)' // contrast raised to clear WCAG floor (autisk)
  ctx.font = `10px ${FONT_MONO}`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.letterSpacing = '0.2em' as unknown as CanvasRenderingContext2D['letterSpacing']
  ctx.fillText(isRug ? 'RUGGED' : 'PUMP ×', 24, 18)

  const color = isRug ? pal.rug : phase === 'playing' || phase === 'settled' ? (mulX > 1.0 ? pal.pump : '#f4f6fa') : '#f4f6fa'

  ctx.font = `900 ${fontSize}px ${FONT_MONO}`
  ctx.textBaseline = 'top'
  if (!isRug && phase === 'playing' && mulX > 1.0) {
    ctx.shadowColor = `rgba(${pal.pumpRgb},${0.4 + 0.3 * (baseScale - 1)})`
    ctx.shadowBlur = 16 + 34 * (baseScale - 1) + (popScale - 1) * 110
  }
  ctx.fillStyle = color
  ctx.letterSpacing = '0em' as unknown as CanvasRenderingContext2D['letterSpacing']
  ctx.fillText(isRug ? 'BUST' : formatMultiplier(cumulativeBps), 24, 32)
  ctx.shadowBlur = 0

  // Subtitle (3rd line) — desktop suppresses it (redundant + occluded by the
  // left-gutter card; see the `isWide` param doc above). Mobile keeps it.
  if (!isWide) {
    ctx.font = `13px ${FONT_MONO}`
    if (isRug) {
      ctx.fillStyle = `rgba(${pal.rugRgb},0.95)`
      ctx.fillText(`−${formatUsdc(wagerLamports)} · the floor dropped out`, 24, 32 + fontSize + 8)
    } else {
      const payoutLamports = (wagerLamports * cumulativeBps) / 10_000n
      ctx.fillStyle = phase === 'playing' && mulX > 1.0 ? `rgba(${pal.bagRgb},0.95)` : 'rgba(255,255,255,0.6)'
      ctx.fillText(
        // "BAG NOW" (not bare "BAG") so it reads as the CURRENT cash-out value —
        // distinct from the top-right "NEXT SAFE → BAG" preview, and consistent
        // with the side-panel "BAG NOW" stat (user: some texts unclear).
        `${phase === 'settled' ? 'BAGGED' : 'BAG NOW'} · ${formatUsdc(payoutLamports)}`,
        24,
        32 + fontSize + 8,
      )
    }
  }
  ctx.restore()
}

// ─── Pump gauge ─────────────────────────────────────────────────────────────

function drawPumpGauge(
  ctx: CanvasRenderingContext2D,
  W: number,
  fraction: number,
  phase: VaultGridCanvasProps['phase'],
  now: number,
  reducedMotion: boolean,
  pal: ModePalette,
  // autisk 2026-07-04 (defect #1): right inset for the whole top-right HUD so
  // the RUG RISK title/bar/% clear VaultExperience's top-right corner-chrome
  // globe icon (z-order ABOVE this canvas). See HUD_TR_INSET_* in the frame loop.
  rightInset: number = 24,
): void {
  const barW = Math.min(170, W * 0.2)
  const barH = 6
  const barX = W - rightInset - barW
  const barY = 30
  ctx.save()
  // RUG RISK meter (was a green "CLEARED" progress bar that confusingly rose-as-
  // green while danger rose). `fraction` is now the chance the NEXT tap is a rug,
  // and the bar reddens as it climbs — an honest, instantly-readable danger gauge
  // (jesse "10x clearer" fix). pal is unused now; risk color is universal.
  void pal
  const clamped = Math.max(0, Math.min(1, fraction))
  // green → amber → red by risk
  const riskRgb =
    clamped < 0.34 ? '0,230,118' : clamped < 0.67 ? '245,180,40' : '255,70,70'
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.font = `10px ${FONT_MONO}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.letterSpacing = '0.2em' as unknown as CanvasRenderingContext2D['letterSpacing']
  ctx.fillText('RUG RISK', W - rightInset, 18)

  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  roundedRect(ctx, barX, barY, barW, barH, 3)
  ctx.fill()

  let alpha = 0.9
  let glow = 0
  if (!reducedMotion && phase === 'playing' && fraction >= RISK_METER_PULSE_THRESHOLD) {
    const phaseT = (now % RISK_METER_PULSE_PERIOD_MS) / RISK_METER_PULSE_PERIOD_MS
    const breath = (Math.sin(phaseT * Math.PI * 2) + 1) / 2
    alpha = 0.7 + 0.3 * breath
    glow = 6 + 10 * breath
  }
  const fillW = clamped * barW
  if (fillW > 0) {
    ctx.fillStyle = `rgba(${riskRgb},${alpha})`
    if (glow > 0) {
      ctx.shadowColor = `rgba(${riskRgb},0.55)`
      ctx.shadowBlur = glow
    }
    roundedRect(ctx, barX, barY, fillW, barH, 3)
    ctx.fill()
    ctx.shadowBlur = 0
  }
  ctx.fillStyle = 'rgba(255,255,255,0.80)' // contrast raised (autisk)
  ctx.font = `11px ${FONT_MONO}`
  ctx.textAlign = 'right'
  ctx.letterSpacing = '0.06em' as unknown as CanvasRenderingContext2D['letterSpacing']
  const pct = Math.round(clamped * 100)
  ctx.fillText(`${pct}%`, W - rightInset, barY + barH + 5)
  ctx.restore()
}

// ─── NEXT-SAFE payoff preview (top-right, under the gauge) ───────────────────
// Shows what the NEXT safe tap would pay — the reward side of the risk the gauge
// above quantifies. Pure display of existing math (multiplierAfterSafeTiles with
// the mode's house edge); no streak/session input → RG-C5 safe.
function drawNextPayoff(
  ctx: CanvasRenderingContext2D,
  W: number,
  nextBps: bigint,
  nextBag: bigint,
  pal: ModePalette,
  // autisk 2026-07-04 (defect #1): shares the RUG RISK meter's right inset so
  // this preview stays right-edge-aligned with it AND clears the corner globe.
  rightInset: number = 24,
): void {
  ctx.save()
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = `9px ${FONT_MONO}`
  ctx.letterSpacing = '0.16em' as unknown as CanvasRenderingContext2D['letterSpacing']
  // "IF NEXT IS SAFE" — spell out that the multiplier + bag below are the
  // conditional next-crack payoff, not a live value (user: texts unclear).
  ctx.fillText('IF NEXT IS SAFE →', W - rightInset, 58)

  ctx.fillStyle = pal.pump
  ctx.font = `800 15px ${FONT_MONO}`
  ctx.letterSpacing = '0.02em' as unknown as CanvasRenderingContext2D['letterSpacing']
  ctx.shadowColor = `rgba(${pal.pumpRgb},0.35)`
  ctx.shadowBlur = 8
  ctx.fillText(formatMultiplier(nextBps), W - rightInset, 69)
  ctx.shadowBlur = 0

  ctx.fillStyle = `rgba(${pal.bagRgb},0.9)`
  ctx.font = `10px ${FONT_MONO}`
  ctx.letterSpacing = '0.04em' as unknown as CanvasRenderingContext2D['letterSpacing']
  ctx.fillText(`BAG ${formatUsdc(nextBag)}`, W - rightInset, 88)
  ctx.restore()
}

// ─── Floating pump delta ────────────────────────────────────────────────────

function drawFloatingDelta(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  deltaBps: bigint,
  alpha: number,
  pal: ModePalette,
): void {
  if (alpha <= 0) return
  const whole = deltaBps / ONE_X_BPS
  const frac = deltaBps % ONE_X_BPS
  const hundredths = frac / 100n
  const label = `+${whole}.${hundredths.toString().padStart(2, '0')}x`
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = pal.pump
  ctx.font = `800 14px ${FONT_MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = `rgba(${pal.pumpRgb},${alpha * 0.6})`
  ctx.shadowBlur = 8
  ctx.fillText(label, cx, cy)
  ctx.shadowBlur = 0
  ctx.restore()
}

// ─── Rug burst — 8 authored coin arcs (not particles) ──────────────────────

function drawRugBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  t: number,
  pal: ModePalette,
): void {
  // Your Swoobz COINS scatter + fall from the rug tile: authored, fixed
  // trajectories (taste-guardian — the burst now uses the game's own coin
  // symbol tumbling, not abstract red dots). Falls back to dots if unloaded.
  const reach = size * 1.4
  const coin = getImage(COIN_IDLE)
  ctx.save()
  for (let i = 0; i < COIN_ARCS; i++) {
    const ang = (Math.PI * 2 * i) / COIN_ARCS + Math.PI / COIN_ARCS
    const dist = reach * t
    const px = cx + Math.cos(ang) * dist
    const py = cy + Math.sin(ang) * dist + size * 0.9 * t * t // gravity drop
    ctx.globalAlpha = Math.max(0, 1 - t)
    if (coin) {
      const s = size * 0.34 * (1 - t * 0.4)
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(t * Math.PI * 1.6 * (i % 2 === 0 ? 1 : -1)) // tumble, alternating spin
      ctx.drawImage(coin, -s / 2, -s / 2, s, s)
      ctx.restore()
    } else {
      const cr = size * 0.12 * (1 - t * 0.5)
      ctx.fillStyle = pal.rug
      ctx.beginPath()
      ctx.arc(px, py, cr, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

// ─── MOON flash ─────────────────────────────────────────────────────────────

function drawMoonFlash(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  pal: ModePalette,
): void {
  const alpha = Math.sin(Math.min(1, t) * Math.PI) // ease in/out
  ctx.save()
  ctx.globalAlpha = alpha * 0.9
  ctx.fillStyle = pal.bag
  ctx.font = `900 ${Math.min(64, W * 0.08)}px ${FONT_MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = `rgba(${pal.bagRgb},0.8)`
  ctx.shadowBlur = 30
  ctx.fillText('MOON', W / 2, H * 0.42)
  ctx.shadowBlur = 0
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#fff'
  ctx.font = `700 13px ${FONT_MONO}`
  ctx.fillText('WE FOUND THE MOON', W / 2, H * 0.42 + Math.min(48, W * 0.06))
  ctx.restore()
}

// ─── Bottom status hint ─────────────────────────────────────────────────────

function drawBottomHint(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  p: VaultGridCanvasProps,
  pal: ModePalette,
): void {
  let text = ''
  let color = 'rgba(255,255,255,0.80)' // raised from 0.62 — was hard to read (autisk/user)
  const trailLen = p.trail?.length ?? 0
  // Narrow/mobile SETTLED-only suppression: the near-board VaultBoardRebet
  // CTA plate (VaultExperience.tsx boardRebetWrapMobile, bottom:6px) sits
  // directly over this fixed-pixel caption on mobile during the settled
  // phase. On WIN the caption "SECURED THE BAG · {mult}" is longer than the
  // plate, so its ends bled out both sides of it ("SEC" / "53x" fragments —
  // taste-guardian ship-gate, 2026-07-02). Both settled captions here are
  // 100% duplicate of the larger VaultHeroOverlay headline one region above
  // (the already-accepted near-board CTA trade-off), so the clean fix is to
  // suppress them on mobile rather than half-occlude one of them. Desktop
  // (isWide) is unaffected — the desktop ledge sits at bottom:72px with real
  // clearance, so both captions stay exactly as before there. `mine-hit` is
  // a separate, pre-settled phase (the CTA only ever renders once
  // `phase.kind === 'settled'`), so its own RUGGED caption is untouched.
  const suppressSettledCaption = p.phase === 'settled' && p.isWide === false
  if (p.phase === 'playing' && p.trailMode && trailLen === 0) {
    // TRAIL mode, nothing painted yet — must NOT say "tap a coin" (jesse fix).
    text = 'HOLD + DRAG TO PLAN A PATH'
    color = `rgba(${pal.pumpRgb},0.7)`
  } else if (p.phase === 'playing' && p.trailMode) {
    text = 'HIT GO TO RUN YOUR TRAIL'
    color = `rgba(${pal.pumpRgb},0.7)`
  } else if (p.phase === 'playing' && p.revealedTiles.length === 0) {
    text = 'CRACK A VAULT · APE IN'
  } else if (p.phase === 'playing') {
    text = 'TAKE PROFIT OR APE DEEPER'
    color = `rgba(${pal.pumpRgb},0.7)`
  } else if (p.phase === 'mine-hit' || (p.phase === 'settled' && p.mineHitTileIdx !== null)) {
    if (!suppressSettledCaption) {
      text = 'RUGGED'
      color = pal.rug
    }
  } else if (p.phase === 'settled' && p.mineHitTileIdx === null) {
    if (!suppressSettledCaption) {
      text = `SECURED THE BAG · ${formatMultiplier(p.cumulativeMultiplierBps)}`
      color = pal.pump
    }
  }
  if (!text) return
  ctx.save()
  ctx.fillStyle = color
  ctx.font = `600 12.5px ${FONT_MONO}` // was 11px — undersized for the hero hint
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.letterSpacing = '0.22em' as unknown as CanvasRenderingContext2D['letterSpacing']
  ctx.fillText(text, W / 2, H - 14)
  ctx.restore()
}

// ─── helpers ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  return `${r},${g},${b}`
}

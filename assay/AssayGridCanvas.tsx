/**
 * ABYSS LINE — sunken-treasure board canvas (2026-07-06 re-skin from the prior
 * dark-stone Aztec register). Renders the 14×14 = 196-tile deep-water floor: 196
 * seafloor sockets each holding a gold DUCAT. Claim-line selection (trace a line
 * of ducats → each gets a cyan route seal + number + connector), the cascade
 * reveal (each claimed ducat flips to a gold chest as the line runs), and the
 * cracked-ducat naval MINE that busts the dive.
 *
 * THEME (deep-water + gold hero): a deep-water board bed, gold ducats as the
 * value hero, cyan as the player/route accent, red as the mine/danger accent.
 * A cool sub-light key falls UPPER-LEFT: the board `bgGrad` hotspot + falloff
 * and the cyan sub-light flicker agree on that one direction.
 *
 * TILES ARE PROCEDURAL PODS (canvas-2D, no image assets). `paintDoubloonCore`
 * draws three pod states (drawn from the mockup `#coin`/`#rcoin` + assets.svg
 * mine/chest geometry), each baked ONCE at `SPRITE_REF_PX`=160 into an offscreen
 * sprite-cache canvas, then scaled per tile via `ctx.drawImage`:
 *   - DORMANT (idle DUCAT) — rim + hammered-gold body + dashed pearl ring +
 *                center disc + a stamped 8-point star + top-left shine arc.
 *   - STRUCK (revealed-gold) — an open treasure chest on a gold ring with an
 *                amber radial glow ("claimed / safe").
 *   - CRACKED (revealed-mine) — a naval mine: dark spiked sphere + 8 spikes + a
 *                red danger core + red radial glow.
 * A selected ducat is overpainted with the cyan route SEAL (playerDeep fill +
 * player-cyan ring + dashed inner) and its route NUMBER (playerText); a dashed
 * cyan route_link connector links consecutive selected ducats. Selection is
 * blind (mines are never drawn during planning/assaying — RG-C3). The 8-point
 * star stamp reuses `sunGlyphPoints` (shared with the win-badge geometry).
 *
 * INTERACTION MODEL (unchanged): the loupe/zoom/pan magnifier is removed.
 * DESKTOP (`desktopSizePx` set by the parent from the viewport-height clamp)
 * renders the WHOLE 14×14 board at that exact size — click/
 * drag-paintable with zero zoom. MOBILE/narrow (`desktopSizePx` omitted) renders
 * at a fixed, always-legible tile size (`MOBILE_TILE_PX`, ≥44px tap target)
 * inside a native-scroll viewport window; the player PANS to reach the far side
 * and SELECTS with a genuine tap (`pointerdown`→`pointerup` under
 * `TAP_MOVE_THRESHOLD_PX`), a pan disambiguated by the browser's own
 * `pointercancel`, not a hand-rolled heuristic.
 *
 * JUICE / SATISFACTION (RG-C5: all timings/geometry are module consts, never
 * scaled by a coin's value, streak, or session). Every real reveal fires a
 * bounded per-tile OVERSHOOT pop (`REVEAL_POP_*`, peak ~1.11× at 60% of the
 * curve, then settles) with a one-shot brightness lift + a tightening contact
 * shadow around the peak (the coin "lands" its socket), plus a bounded sub-
 * light flare wash (`SUB_FLARE_*`) synced to the same pop timeline. Every newly-
 * PINNED disc fires a ~140ms press-bounce dip. A bad-vein entry fires — once,
 * together — a bounded grid shake, a full-canvas blood flash, an expanding ember
 * aftershock ring, and a fixed, deterministically-seeded set of `SCATTER_COUNT`
 * AUTHORED shard arcs (trajectories keyed by `mulberry32(veinTileIdx)`, never a
 * particle spawner: fixed count, fixed per-instance trajectory). A winning
 * settle fires the same expanding-ring in gold. A slow sub-light flicker
 * (`SUB_LIGHT_FLICKER_*`, ~0.06 Hz, tiny amplitude, well under 3 Hz and distinct
 * from `BEAD_PULSE_HZ`) breathes the ambient sub-light vignette — RG-C5 fixed,
 * never derived from game state.
 *
 * Pure presentation. Takes engine values (trail, revealedSafe, tally) and the
 * bad-vein position ONLY once it has actually busted the run. No math here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { coinDeltaBps, GRID_DIM } from './assayMath'
import type { AssayPhase } from './assayProvider'

/** Manual rounded-rect path (not `ctx.roundRect` — avoids a runtime crash on
 *  any WebView that predates it). Used for the gold/jade accents this file
 *  draws around a tile (the standing dormant socket rim, the struck energized
 *  ring, the jade pinned targeting frame) — a rounded-rect hugging the tile's
 *  own outer boundary, geometrically clear of the doubloon's own body. */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.arcTo(x + w, y, x + w, y + rr, rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr)
  ctx.lineTo(x + rr, y + h)
  ctx.arcTo(x, y + h, x, y + h - rr, rr)
  ctx.lineTo(x, y + rr)
  ctx.arcTo(x, y, x + rr, y, rr)
  ctx.closePath()
}

// (LEGACY token names kept — the `jade*` tokens are repurposed below; see the
// per-token comments and the PROVENANCE ledger for the pre-Abyss mapping.)
// ── ABYSS LINE — SUNKEN-TREASURE PALETTE (2026-07-06 re-skin from the prior
// dark-stone Aztec register). Deep-water board bed, hammered-gold DUCATS as the
// value hero, cyan as the PLAYER/route accent, red as the danger/mine accent.
// Rule of three (strict): gold = value, cyan = player (route seal + number +
// connector), red = danger (mine core, bust). The coin's stamped 8-point star
// is a dark-gold emboss (the former `jade*` glyph tokens are repurposed to
// gold-dark tones); the former `jade` selection token is now player cyan.
const COL = {
  boardBg: '#0a1a26', // deep-water board bed (panel rgba(10,20,30,.9))
  boardBgHi: '#103042', // upper-water glow lift (bg-water-light)
  boardEdge: '#03090f', // deepest water inset stroke (bg-deep)
  grain: 'rgba(53,224,210,0.03)', // faint cyan plankton grain on deep water
  sand: '#87a6b5', // muted water text (text-muted)
  bone: '#e6f1f5', // primary water text (text)
  gold: '#f0b542', // Abyss GOLD — value / ducat body / needle
  goldLight: '#f5d98a', // glint / highlight (gold-light)
  goldDark: '#8a6a26', // coin rim / brass (gold-dark)
  goldGlow: 'rgba(240,181,66,0.5)',
  blood: '#ff5d5d', // danger — mine core / cracked / bust (danger)
  bloodDark1: '#3a1a1c',
  bloodDark2: '#180a0b',
  jade: '#35e0d2', // repurposed → PLAYER cyan (route seal ring / connector)
  jadeMuted: '#8a6a26', // repurposed → coin star stamp body (dark-gold emboss)
  jadeLight: '#c99b45', // repurposed → coin star light edge (gold sheen)
  jadeDark: '#6b5018', // repurposed → coin star carved shadow (deep gold-brown)
  revealGlow: '#f0b542', // reveal-gold amber flare atmosphere (claimed ducat glow)
  thread: 'rgba(53,224,210,0.55)', // cyan route-connector token (§ route_link)
  player: '#35e0d2', // player cyan (route seal ring, CTA)
  playerDeep: '#0d3c38', // cyan seal fill
  playerText: '#8ff2e8', // route number text
  accentNum: '#f0b542', // small accent numerals — gold (value)
}

// ── Module-const motion timings (RG-C5: fixed, never derived from streak, ────
// session value, or payout size — every one of these fires the same way on
// every round regardless of stakes).
const BEAD_PULSE_HZ = 2.2 // pulsing halo on the live current-bead — the running current itself, not decorative atmosphere
const SPARK_TRAVEL_MS = 150 // travelling spark from the last-proven nub to the next — fires on a real reveal event only
const BUST_SHAKE_MS = 320
const BUST_SHAKE_PX = 9 // nudged up from 7 (casino-AAA revise pass) for a punchier bust hit (still bounded, still one-shot, RG-C5 fixed)
const COIN_STAGGER_MS = 55 // stagger between coin-fly launches within one reveal batch (instant pace collects several at once)
const SPRITE_REF_PX = 160 // reference resolution the coin sprites are rendered at once (bumped 128→160 for supersample headroom on the smaller 14×14 tiles), then scaled per tile size

// ── Reveal/press juice timings (RG-C5: fixed geometry/duration, never scaled
// by the coin's collected value) ────────────────────────────────────────────
const REVEAL_POP_MS = 260 // per-coin overshoot pop on a real reveal event
const REVEAL_POP_PEAK = 1.11 // peak scale, chunky not a soft fade
const REVEAL_POP_PEAK_T = 0.6 // fraction of REVEAL_POP_MS where the peak lands
const PRESS_BOUNCE_MS = 140 // squish-dip when a coin is pinned into the claim-line
const PRESS_BOUNCE_DIP = 0.05 // scale dips to (1 - 0.05)
const RING_WIN_MS = 480 // expanding gold bloom ring on a full claim-line proven
const RING_LOSS_MS = 420 // expanding ember aftershock ring on a bad-vein bust
const BUST_FLASH_MS = 180 // full-canvas ember flash wash on a bust, fast fade
const SCATTER_COUNT = 8 // fixed count of AUTHORED coin-scatter shards on a bust — never a particle spawner, RG-C5 fixed regardless of magnitude
const SCATTER_MS = 520 // scatter-arc travel duration

// ── Sub-light one-shots / breathing (RG-C5: fixed, never derived from coin
// value, streak, or session — every reveal flares identically, the sub-light
// breathes identically every round). The cool key falls UPPER-LEFT (see the
// coin material + the relocated board `bgGrad` hotspot). ──────────────────────
const REVEAL_BRIGHTEN = 1.15 // one-shot brightness lift on the struck sprite around the reveal-pop peak (§5.5)
const SUB_FLARE_ALPHA = 0.28 // peak alpha of the one-shot additive sub-light flare wash on a real reveal, synced to REVEAL_POP_MS
const SUB_FLARE_R_MULT = 2.6 // flare radius in tile-widths
// (DE-HAZE 2026-07-06) The persistent additive sub-light flicker consts
// (SUB_LIGHT_FLICKER_HZ/_AMP/_BASE) are retired — the always-on `lighter` wash
// they drove over the whole board was hazing the coins. Sub-light life is now
// event-only via the transient reveal SUB_FLARE (SUB_FLARE_ALPHA above).

// ── CONDUIT accent polish (ranked item 7) — the claim-thread gains a slow
// flowing dash pattern ONLY while the current is actually live ('assaying'),
// unifying it with the bead pulse + travelling spark as one current-carrying
// visual language. Fixed speed (RG-C5) — never derived from trail length,
// wager, or streak. ─────────────────────────────────────────────────────────
const CONDUIT_FLOW_PX_PER_S = 90

// ── Zero-allocation "clear the dash pattern" constant (final polish pass) —
// a single module-scope array reused across every `ctx.setLineDash(NO_DASH)`
// call so resetting a stroke to solid never allocates a fresh `[]` per call,
// per-frame or otherwise. Canvas's `setLineDash` only READS the array, never
// mutates it, so one shared reference is safe. ──────────────────────────────
const NO_DASH: number[] = []

// ── Mobile pan-viewport scroll-edge fade (final polish pass, autisk SHOULD
// — the right-column/bottom-row coins were hard-clipping against the
// rounded scroll-panel corner). A plain solid-to-transparent CSS gradient
// tinted to the board's own background, not a mask-image — the simplest
// technique that reads correctly in every browser. ──────────────────────────
const MOBILE_EDGE_FADE_PX = 20

// ── Desktop board sizing (composition-designer re-spec, 2026-07-03): the
// parent computes `desktopSizePx` from clamp(innerHeight-300,660,960) so the
// whole board is always the exact size passed in — no zoom, no ResizeObserver
// override here. ─────────────────────────────────────────────────────────
// ── Mobile/narrow pan-only sizing: a FIXED, always-legible tile size (well
// above the 44pt Apple HIG / WCAG 2.5.5 tap-target floor) inside a native-
// scroll viewport window sized to the available container width. ──────────
// Mobile CRIT #1 fix (orchestrator, 2026-07-04): the VIEWPORT WINDOW cap
// dropped 420->300 (live-measured against BOTH Pixel 7 412×915 AND iPhone 14
// Pro 393×852 — the narrower/shorter iPhone needed the lower cap; 420 and
// 340 both still left RUN THE LINE below the fold there). This is NOT a
// "board shrunk" change — `MOBILE_TILE_PX` (the actual tap-target/render
// scale) and the board's real content size (`MOBILE_TILE_PX * GRID_DIM` =
// 460×460) are BOTH untouched; only how much of that same 460px board is
// visible before the player pans (already the established interaction model
// — reaching the far side of the board on mobile always required a pan, even
// at the old 420px cap) shrinks, buying back the vertical budget RUN THE
// LINE needs to clear the fold.
const MOBILE_TILE_PX = 46
// 180/200, not 260/300: live-measured 300 left only ~3px of clearance on
// iPhone 14 Pro (393×852); 280 got RUN THE LINE's TOP edge on-screen but
// still clipped ~35px off its BOTTOM edge there; 240 (with MIN still 260,
// which silently floored the clamp back up to 260 — MIN must drop too for a
// lower MAX to actually take effect) still clipped ~15px. 180/200 gets the
// WHOLE button on-screen with real margin on both devices (see the
// consolidated-verify-0704 report for exact numbers) — a genuine safety
// margin for cross-browser font-metric variance, not a bare pass.
// Mobile pan-window (the CLIP box into the fixed 46px-tile board — NOT the tile
// size, which stays a ≥44px tap target). Trimmed 220→190 (2026-07-06) to buy
// back the vertical the new "TO WIN" hero costs so RUN THE LINE keeps clearing
// the iPhone 14 Pro fold; the ducats stay full-size and legible, the window
// just shows ~4 tiles at a time (the board was always pannable).
const MOBILE_VIEWPORT_MIN_PX = 165
const MOBILE_VIEWPORT_MAX_PX = 180
const TAP_MOVE_THRESHOLD_PX = 10

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/** Chunky overshoot ease for the reveal pop — rises from 0.72 to
 *  `REVEAL_POP_PEAK` over the first `REVEAL_POP_PEAK_T` of the duration, then
 *  settles back to 1 over the remainder. Deterministic function of `u` only
 *  (no streak/value input) — RG-C5. */
function popScale(u: number): number {
  if (u <= REVEAL_POP_PEAK_T) {
    const k = u / REVEAL_POP_PEAK_T
    return 0.72 + (REVEAL_POP_PEAK - 0.72) * (1 - Math.pow(1 - k, 2))
  }
  const k = (u - REVEAL_POP_PEAK_T) / (1 - REVEAL_POP_PEAK_T)
  return REVEAL_POP_PEAK + (1 - REVEAL_POP_PEAK) * (1 - Math.pow(1 - k, 3))
}

/** Symmetric squish-dip for the press-bounce — dips to `1-PRESS_BOUNCE_DIP`
 *  at the midpoint, returns to 1 at both ends. */
function pressDipScale(u: number): number {
  return 1 - PRESS_BOUNCE_DIP * Math.sin(Math.PI * u)
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export interface AssayGridCanvasProps {
  phase: AssayPhase
  trail: number[]
  committedTrail: number[]
  revealedSafe: number[]
  veinTileIdx: number | null
  /** Full bad-vein bitmap — only on settled (Glass Box); null during play. */
  bombBitmap: boolean[] | null
  onToggleTile: (idx: number) => void
  onPaintTile: (idx: number) => void
  interactive: boolean
  /** Fired once per newly-struck disc with its ON-SCREEN (page) center
   *  and its exact coin-collect delta, so the HUD can fly a coin to the tally. */
  onCoinFly?: (flight: { x: number; y: number; deltaBps: bigint }) => void
  /** Desktop-only: the exact px side length for the WHOLE 14×14 board,
   *  computed by the parent from the viewport-height clamp. When omitted,
   *  the board runs in mobile pan-only mode at a fixed tile size. */
  desktopSizePx?: number
  /** B2 (WCAG 2.2.2): when true, the time-based bust FX (grid shake, blood
   *  flash, bloom ring, shard scatter, travelling spark) collapse to their
   *  instant END-STATE — no motion. The STATIC bust read (cracked ducat +
   *  focus vignette, baked into the board) is unaffected, so a bust still
   *  clearly communicates. Fed live from the parent's `matchMedia` listener. */
  reducedMotion?: boolean
}

/** Tiny deterministic PRNG (mulberry32) — used for the board grain streaks,
 *  the bad-vein crack/shard pattern, AND the authored bust coin-scatter arcs
 *  so they're stable/reproducible per tile-index seed, never re-randomized
 *  per frame (that would read as a particle system, not authored motion). */
function mulberry32(seed: number) {
  let a = seed
  return function rand() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TAU = Math.PI * 2
const D2R = Math.PI / 180

/** The ONE Aztec sun-disc glyph geometry — a central boss + 8 alternating
 *  long/short triangular rays — as a list of outline vertices, sized to outer
 *  (long-ray) radius `gr`, centered at (cx, cy). Deterministic, no state input.
 *  This is the single source of truth for the sun-disc SHAPE: the board coins
 *  trace it via `traceSunPath`, and the win-celebration `HeroPopCallout` badge
 *  (in `AssayExperience.tsx`) renders the SAME points as an SVG polygon — so
 *  the "proven" provenance glyph is provably one motif across the whole game. */
export function sunGlyphPoints(cx: number, cy: number, gr: number): Array<[number, number]> {
  const rays = 8
  const pts: Array<[number, number]> = []
  for (let k = 0; k < rays * 2; k++) {
    const ang = (Math.PI * k) / rays - Math.PI / 2
    let rad: number
    if (k % 2 === 0) {
      const long = (k / 2) % 2 === 0
      rad = long ? gr : gr * 0.72 // alternating long / short rays
    } else {
      rad = gr * 0.42 // valley at the boss edge
    }
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad])
  }
  return pts
}

/** The boss-circle radius the sun-disc glyph sits on, relative to outer ray
 *  radius `gr` — shared by the coin glyph fill and the SVG badge so both draw
 *  the same central disc. */
export const SUN_GLYPH_BOSS_RATIO = 0.4

/** Traces the sun-disc glyph path into a canvas ctx, centered at (cx+ox, cy+oy).
 *  Reuses `sunGlyphPoints` so the coins and the badge share ONE geometry. */
function traceSunPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, gr: number, ox: number, oy: number) {
  const pts = sunGlyphPoints(cx + ox, cy + oy, gr)
  ctx.beginPath()
  pts.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
  ctx.closePath()
}

/** Center relief glyph = Aztec SUN-DISC, carved in jade with a 3-pass recess
 *  (§5e): (1) a dark jadeDark copy offset down-right = the carved shadow; (2)
 *  the true-position body inlay; (3) a jadeLight light-edge stroke clipped to
 *  the upper-left half (the sub-light-facing side). `body` is jade for a live
 *  disc, jadeDark for a tarnished/cracked one (no light edge then). */
function paintSunGlyph(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  gr: number,
  body: string,
  lightEdge: boolean,
  edgeAlpha: number,
  shadowOffX: number,
  shadowOffY: number,
) {
  // (1) carved shadow copy — jadeDark, offset down-right.
  ctx.fillStyle = COL.jadeDark
  traceSunPath(ctx, cx, cy, gr, shadowOffX, shadowOffY)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx + shadowOffX, cy + shadowOffY, gr * 0.4, 0, TAU)
  ctx.fill()
  // (2) true-position body inlay.
  ctx.fillStyle = body
  traceSunPath(ctx, cx, cy, gr, 0, 0)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, gr * 0.4, 0, TAU)
  ctx.fill()
  // (3) light-edge stroke, clipped to the upper-left (sub-light-facing) half.
  if (lightEdge) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, gr * 1.5, 145 * D2R, 305 * D2R) // upper-left wedge (canvas y-down)
    ctx.closePath()
    ctx.clip()
    ctx.globalAlpha = edgeAlpha
    ctx.strokeStyle = COL.jadeLight
    ctx.lineWidth = Math.max(0.6, gr * 0.08)
    traceSunPath(ctx, cx, cy, gr, 0, 0)
    ctx.stroke()
    ctx.restore()
  }
}

/** Paints ONE gold-doubloon state into a sprite-cache canvas (baked once at
 *  SPRITE_REF_PX, never per-tile/per-frame). ONE shared coin material; the
 *  three states differ only in value + glint (§5). Sub-light key is UPPER-LEFT:
 *  the base dome sheen, the bevel light-arc, and the specular glint all agree
 *  on that direction, matching the board `bgGrad` hotspot.
 *   - DORMANT: dim unlit disc (plain gold→goldDark), thin bevel, low glint,
 *     no sweep streak — "not yet claimed."
 *   - STRUCK:  hero revealed disc — full dome, thick bevel, bright glint +
 *     sweep streak + a standing gold energized ring — "revealed/energized."
 *   - CRACKED: tarnished dud (desaturated/dimmed), an ember fracture over a
 *     soft ember glow — the danger accent shows only through the damage. */
function paintDoubloonCore(ctx: CanvasRenderingContext2D, sz: number, state: 'dormant' | 'struck' | 'cracked') {
  ctx.clearRect(0, 0, sz, sz)
  const cx = sz / 2
  const cy = sz / 2
  const r = sz * 0.43

  // (a) Soft contact shadow under the pod — a "seated in the seafloor" weight
  // cue, deep-water tone.
  const amb = ctx.createRadialGradient(cx, cy + r * 0.16, r * 0.2, cx, cy + r * 0.2, r * 1.25)
  amb.addColorStop(0, 'rgba(3,9,15,0.35)')
  amb.addColorStop(1, 'rgba(3,9,15,0)')
  ctx.fillStyle = amb
  ctx.beginPath()
  ctx.ellipse(cx, cy + r * 0.18, r * 1.15, r * 0.85, 0, 0, TAU)
  ctx.fill()

  if (state === 'cracked') {
    // REVEALED-MINE (ZEEMIJN · BUST) — naval mine: red radial glow, 8 spikes,
    // dark spiked sphere, red danger core. From assets.svg mine geometry.
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6)
    glow.addColorStop(0, 'rgba(255,93,93,0.5)')
    glow.addColorStop(1, 'rgba(255,93,93,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, r * 1.6, 0, TAU)
    ctx.fill()
    // 8 spikes radiating out
    ctx.strokeStyle = '#1a2a35'
    ctx.lineWidth = Math.max(2, r * 0.16)
    ctx.lineCap = 'round'
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78)
      ctx.lineTo(cx + Math.cos(a) * r * 1.12, cy + Math.sin(a) * r * 1.12)
      ctx.stroke()
    }
    // dark spiked-sphere body
    const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.32, r * 0.1, cx, cy, r * 0.85)
    body.addColorStop(0, '#243746')
    body.addColorStop(1, '#111f2a')
    ctx.fillStyle = body
    ctx.strokeStyle = COL.boardEdge
    ctx.lineWidth = Math.max(1.5, r * 0.06)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.8, 0, TAU)
    ctx.fill()
    ctx.stroke()
    // red danger core
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.34)
    core.addColorStop(0, '#ffb0b0')
    core.addColorStop(0.4, COL.blood)
    core.addColorStop(1, '#a01f1f')
    ctx.fillStyle = core
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.24, 0, TAU)
    ctx.fill()
    // faint steel highlight arc (upper-left)
    ctx.strokeStyle = 'rgba(140,200,220,0.5)'
    ctx.lineWidth = Math.max(1, r * 0.05)
    ctx.beginPath()
    ctx.arc(cx - r * 0.1, cy - r * 0.1, r * 0.5, 200 * D2R, 250 * D2R)
    ctx.stroke()
    return
  }

  if (state === 'struck') {
    // REVEALED-GOLD (POD · GECLAIMD) — open treasure chest on a gold ring, amber
    // radial glow. From assets.svg claimed geometry.
    // S3 — brighter amber glow (was 0.45, read muddy): a hot inner core fading
    // out, so the claimed ducat reads unmistakably as treasure "going off."
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6)
    glow.addColorStop(0, 'rgba(245,217,138,0.7)')
    glow.addColorStop(0.4, 'rgba(240,181,66,0.55)')
    glow.addColorStop(1, 'rgba(240,181,66,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(cx, cy, r * 1.6, 0, TAU)
    ctx.fill()
    // disc with a gold ring — lifted from the muddy near-black to a warmer,
    // brighter deep-teal so the gold coins/chest pop (S3).
    const discG = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.28, r * 0.1, cx, cy, r * 0.9)
    discG.addColorStop(0, '#274c5c')
    discG.addColorStop(1, '#1a3a49')
    ctx.fillStyle = discG
    ctx.strokeStyle = COL.gold
    ctx.lineWidth = Math.max(1.5, r * 0.1)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.9, 0, TAU)
    ctx.fill()
    ctx.stroke()
    // spilling gold coins above the chest
    ctx.fillStyle = COL.gold
    ctx.beginPath()
    ctx.ellipse(cx, cy - r * 0.36, r * 0.34, r * 0.13, 0, 0, TAU)
    ctx.fill()
    ctx.fillStyle = COL.goldLight
    ctx.beginPath()
    ctx.ellipse(cx - r * 0.18, cy - r * 0.4, r * 0.2, r * 0.09, 0, 0, TAU)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx + r * 0.2, cy - r * 0.36, r * 0.16, r * 0.08, 0, 0, TAU)
    ctx.fill()
    // wooden chest body
    ctx.save()
    ctx.strokeStyle = COL.boardEdge
    ctx.lineWidth = Math.max(1, r * 0.05)
    ctx.lineJoin = 'round'
    const cw = r * 1.06
    const chh = r * 0.62
    const chx = cx - cw / 2
    const chy = cy - chh * 0.18
    ctx.fillStyle = '#6e4526'
    roundRectPath(ctx, chx, chy, cw, chh, r * 0.1)
    ctx.fill()
    ctx.stroke()
    // lid seam
    ctx.beginPath()
    ctx.moveTo(chx, chy + chh * 0.3)
    ctx.lineTo(chx + cw, chy + chh * 0.3)
    ctx.stroke()
    // gold lock plate
    ctx.fillStyle = COL.gold
    ctx.fillRect(cx - r * 0.12, chy + chh * 0.15, r * 0.24, r * 0.22)
    ctx.restore()
    return
  }

  // IDLE / DICHT — hammered-gold DUCAT (mockup #coin geometry): rim, body,
  // dashed pearl ring, center disc, stamped 8-point star, top-left shine arc.
  ctx.fillStyle = COL.goldDark // rim #8a6a26
  ctx.strokeStyle = COL.boardEdge
  ctx.lineWidth = Math.max(1, r * 0.05)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.fill()
  ctx.stroke()
  // body dome #d9a94f (dome sheen toward upper-left)
  const bodyG = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.32, r * 0.1, cx, cy, r * 0.9)
  bodyG.addColorStop(0, '#e6bd6a')
  bodyG.addColorStop(1, '#d9a94f')
  ctx.fillStyle = bodyG
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.85, 0, TAU)
  ctx.fill()
  // dashed pearl ring #b98f3a
  ctx.strokeStyle = '#b98f3a'
  ctx.lineWidth = Math.max(0.8, r * 0.05)
  ctx.setLineDash([r * 0.16, r * 0.14])
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.7, 0, TAU)
  ctx.stroke()
  ctx.setLineDash(NO_DASH)
  // center disc #c99b45
  ctx.fillStyle = '#c99b45'
  ctx.strokeStyle = '#a87f2e'
  ctx.lineWidth = Math.max(0.6, r * 0.03)
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.5, 0, TAU)
  ctx.fill()
  ctx.stroke()
  // stamped 8-point star — dark-gold emboss (paintSunGlyph, recolored via COL)
  paintSunGlyph(ctx, cx, cy, Math.max(sz * 0.14, r * 0.4), COL.jadeMuted, true, 0.5, sz * 0.01, sz * 0.014)
  // top-left shine arc #f5d98a — lifted (S3: was under-rendered): a brighter,
  // slightly wider sweep plus a small specular glint dot so the idle ducat
  // catches the sub-light and reads premium, not flat.
  ctx.strokeStyle = COL.goldLight
  ctx.lineWidth = Math.max(1.2, r * 0.12)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.74, 196 * D2R, 254 * D2R)
  ctx.stroke()
  // specular glint at the upper-left highlight
  const glintG = ctx.createRadialGradient(
    cx - r * 0.42, cy - r * 0.42, 0,
    cx - r * 0.42, cy - r * 0.42, r * 0.24,
  )
  glintG.addColorStop(0, 'rgba(255,248,224,0.9)')
  glintG.addColorStop(1, 'rgba(255,248,224,0)')
  ctx.fillStyle = glintG
  ctx.beginPath()
  ctx.arc(cx - r * 0.42, cy - r * 0.42, r * 0.24, 0, TAU)
  ctx.fill()
}

/** The bespoke STRUCK doubloon, baked ONCE at `SPRITE_REF_PX` and cached as a
 *  data URL — the single source for the flying collect coin (`CoinFly` in
 *  `AssayExperience.tsx`). Reuses the exact `paintDoubloonCore(..,'struck')`
 *  material the board reveals, so the coin a player watches leave the board and
 *  the coin that lands in the HOARD dial are provably ONE coin (no stock PNG).
 *  Lazily built on first call (client-only, inside render/effect) and memoized;
 *  the browser's own image cache then covers "decode once" for the DOM <img>. */
let _struckDoubloonUrl: string | null = null
export function struckDoubloonDataUrl(): string {
  if (_struckDoubloonUrl) return _struckDoubloonUrl
  const c = document.createElement('canvas')
  c.width = SPRITE_REF_PX
  c.height = SPRITE_REF_PX
  paintDoubloonCore(c.getContext('2d')!, SPRITE_REF_PX, 'struck')
  _struckDoubloonUrl = c.toDataURL()
  return _struckDoubloonUrl
}

export function AssayGridCanvas(props: AssayGridCanvasProps) {
  const {
    phase,
    trail,
    committedTrail,
    revealedSafe,
    veinTileIdx,
    bombBitmap,
    onToggleTile,
    onPaintTile,
    interactive,
    onCoinFly,
    desktopSizePx,
    reducedMotion = false,
  } = props
  const isDesktop = desktopSizePx != null
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const paintingRef = useRef(false)
  const tapStartRef = useRef<{ x: number; y: number } | null>(null)
  const centeredRef = useRef(false)
  const rafRef = useRef<number>(0)
  const [viewportBoxPx, setViewportBoxPx] = useState(360)
  // ── Keyboard board-paint (accessibility-qa CRIT #3, 2026-07-04): the board
  // was total keyboard lockout — a bare canvas with tabIndex=-1 has zero
  // keyboard equivalent for the core "paint a deposit line" mechanic. This is
  // the standard accessible-canvas pattern: a single focusable element with a
  // roving `cursorIdx`, arrow keys move it, Space/Enter mirrors a tap (calls
  // the SAME `onToggleTile` a pointer tap already uses, so keyboard and touch
  // share one code path, never a parallel keyboard-only mechanic). `hasFocus`
  // gates the on-canvas cursor paint so it never shows for a purely
  // mouse-hover/drag session — it only appears once the board actually has
  // DOM focus (tab-in or a real click-to-focus), matching the CSS
  // `:focus-visible` ring on the element itself (see the `<style>` block in
  // `AssayExperience.tsx`, `.assayFocusable`).
  const [cursorIdx, setCursorIdx] = useState(() => Math.floor((GRID_DIM * GRID_DIM) / 2))
  const [hasFocus, setHasFocus] = useState(false)
  // Procedural gold-doubloon sprites: the three states (dormant/struck/cracked)
  // are drawn ONCE by `paintDoubloonCore` into their own offscreen cache
  // canvas (see the bake below), then scaled per tile — never per-frame,
  // never per-tile paint. No image decode: the discs are pure canvas-2D art.
  const spritesRef = useRef<{ dormant: HTMLCanvasElement; struck: HTMLCanvasElement; cracked: HTMLCanvasElement } | null>(
    null,
  )
  // Offscreen STATIC-board cache: the board backdrop + grain + all 196 tiles +
  // claim-thread + bust vignette are rendered here ONCE per board-state change,
  // then blitted every frame. Per-frame we only redraw the dynamic layer (the
  // pulsing current-bead, the travelling spark, the bust shake, the reveal-pop/
  // press-bounce overlays, the bloom ring/flash/scatter) — so a cascade frame
  // or a paint move is one drawImage + a few strokes instead of 100 per-tile
  // draws. `staticDirtyRef` marks the cache stale.
  const boardRef = useRef<HTMLCanvasElement | null>(null)
  // Backdrop-only cache (gradient + grain + dither, NO tiles, NO falloff),
  // baked once alongside the full static rebake. Lets a single reveal re-bake
  // ONLY its own tile into the board cache (clear cell → blit this backdrop rect
  // back → redraw the settled tile) instead of re-running the whole O(GRID_DIM²)
  // board bake per reveal step — the 196-tile perf fix (was ~60 full rebakes per
  // reveal trail; the reveal-pop/press-finish handlers below now call
  // `bakeStaticTile` for O(1) per-reveal cost).
  const backdropRef = useRef<HTMLCanvasElement | null>(null)
  const staticDirtyRef = useRef(true)
  // Signature of everything the STATIC bake draws EXCEPT the incrementally-handled
  // reveal step (revealed tile + advancing bead). A full 196-tile rebake fires
  // only when this changes (dims / phase / claim-line set / vein) — a plain
  // reveal during assaying does not, so the reveal cascade no longer rebakes the
  // whole board per disc. See the gate in `draw`.
  const staticSigRef = useRef('')
  // The bead tile currently cleared-to-bare in the static cache; when the bead
  // advances without a full rebake we incrementally clear the new bead's stale
  // committed frame (see `draw`).
  const lastBeadRef = useRef<number | undefined>(undefined)
  // jitters precomputed once at set-time (same seed => same 4 values every
  // frame anyway; hoisted alongside the scatter-shard fix for consistency).
  const sparkRef = useRef<{ from: number; to: number; start: number; jitters: number[] } | null>(null)
  const veinEnterRef = useRef<number | null>(null)
  const prevRevealedRef = useRef<number[]>([])
  const coinFlyTimeoutsRef = useRef<number[]>([])
  // Reveal-pop / press-bounce: idx -> animation start time (performance.now()).
  // Drawn as a transient dynamic-layer overlay; the tile is skipped from the
  // static bake while animating (same "skip from cache, draw live" technique
  // the pre-existing current-bead tile already used) so no double-image.
  const popRef = useRef<Map<number, number>>(new Map())
  const pressRef = useRef<Map<number, number>>(new Map())
  // One-shot bloom ring (win: gold, from the last-proven tile; loss: blood,
  // from the vein tile) + the bust-only full-canvas flash + the authored
  // coin-scatter arcs. All transient, canvas-only.
  const ringRef = useRef<{ kind: 'win' | 'loss'; origin: number; start: number } | null>(null)
  const flashRef = useRef<number | null>(null)
  // Shard trajectory params are computed ONCE at set-time (bad-vein entry
  // effect below), not per animation frame — the per-frame draw only reads
  // these and interpolates by elapsed time.
  const scatterRef = useRef<{
    origin: number
    start: number
    shards: { ang: number; dist: number; rot0: number; shardSz: number }[]
  } | null>(null)
  const winRingFiredRef = useRef(false)

  // Mobile/narrow only: measure the available container width so the
  // scrollable viewport window (NOT the board itself, which stays a fixed
  // tile size) fits the device. Desktop ignores this entirely — its size
  // comes straight from `desktopSizePx`.
  useEffect(() => {
    if (isDesktop) return
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setViewportBoxPx(clamp(r.width, MOBILE_VIEWPORT_MIN_PX, MOBILE_VIEWPORT_MAX_PX))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isDesktop])

  // Desktop canvas is EXACTLY `desktopSizePx` square — no extra strip below
  // the tiles (casino-AAA revise pass, 2026-07-04: the board-edge GAUGE strip
  // that used to add 38px here is removed outright, see the header comment;
  // the whole canvas budget goes to the tile board). Mobile pan-only mode is
  // unchanged.
  const dims = isDesktop
    ? { w: desktopSizePx!, h: desktopSizePx! }
    : { w: MOBILE_TILE_PX * GRID_DIM, h: MOBILE_TILE_PX * GRID_DIM }
  const tile = dims.w / GRID_DIM
  // The board tiles occupy the WHOLE canvas now (no gauge strip carved out
  // of the remainder) — `boardAreaH` still named separately from `dims.h`
  // only because the grain/backdrop bake below reads it as a named value.
  const boardAreaH = dims.h

  // Center the initial mobile scroll position so all four directions are
  // reachable from the first frame, once (never fights a player's own scroll).
  useEffect(() => {
    if (isDesktop || centeredRef.current) return
    const el = scrollRef.current
    if (!el || viewportBoxPx <= 0) return
    el.scrollLeft = Math.max(0, (dims.w - viewportBoxPx) / 2)
    el.scrollTop = Math.max(0, (dims.h - viewportBoxPx) / 2)
    centeredRef.current = true
  }, [isDesktop, viewportBoxPx, dims.w, dims.h])

  const tileScreen = useCallback(
    (idx: number) => {
      const col = idx % GRID_DIM
      const row = Math.floor(idx / GRID_DIM)
      return { x: col * tile, y: row * tile }
    },
    [tile],
  )

  const hitTest = useCallback(
    (px: number, py: number): number | null => {
      const col = Math.floor(px / tile)
      const row = Math.floor(py / tile)
      if (col < 0 || col >= GRID_DIM || row < 0 || row >= GRID_DIM) return null
      return row * GRID_DIM + col
    },
    [tile],
  )

  // ── Reveal-event watcher: fires the travelling spark + coin-fly launches +
  // the per-tile overshoot pop on every REAL newly-proven nub (pop starts
  // immediately/un-staggered — the board reveal itself is instantaneous per
  // React state; only the coin-FLY toward the tally staggers for the
  // cascade-counter read). ───────────────────────────────────────────────
  useEffect(() => {
    const prev = prevRevealedRef.current
    const grew =
      revealedSafe.length > prev.length &&
      prev.every((v, i) => revealedSafe[i] === v)
    if (grew) {
      const added = revealedSafe.slice(prev.length)
      const fromIdx = prev.length > 0 ? prev[prev.length - 1]! : (committedTrail[0] ?? added[0]!)
      const sparkJitterRnd = mulberry32(fromIdx * 97 + added[0]!)
      const sparkJitters = [1, 2, 3, 4].map(() => sparkJitterRnd())
      sparkRef.current = { from: fromIdx, to: added[0]!, start: performance.now(), jitters: sparkJitters }
      const popStart = performance.now()
      added.forEach((tileIdx) => popRef.current.set(tileIdx, popStart))

      const canvas = canvasRef.current
      // CHANGE A: a coin only flies to the HAUL meter for a safe tile collected
      // while the run is STILL ALIVE (phase 'assaying'). On an INSTANT bust the
      // pre-bomb `revealedSafe` batch and the phase flip to 'bad-vein' land in
      // ONE setState, so this effect's render sees phase.kind === 'bad-vein' and
      // launches ZERO flies. STAGGERED reveals happen tile-by-tile during
      // 'assaying' (the bomb tile is never added to revealedSafe), so its
      // pre-bomb flies are untouched; both WIN paths keep phase 'assaying' when
      // revealedSafe grows, so wins still fly. (phase is a live prop, read here.)
      if (canvas && onCoinFly && phase.kind === 'assaying') {
        const rect = canvas.getBoundingClientRect()
        // Clamp the flight's launch point to the VISIBLE viewport (the
        // scroll window on mobile; the canvas itself on desktop, where the
        // whole board is always visible) — a tile scrolled out of view on
        // mobile still launches a coin from the edge of what's on-screen.
        const viewportEl = isDesktop ? canvas : scrollRef.current
        const clampRect = viewportEl ? viewportEl.getBoundingClientRect() : rect
        added.forEach((tileIdx, i) => {
          const k = prev.length + i + 1
          const local = tileScreen(tileIdx)
          const cx = Math.max(clampRect.left, Math.min(clampRect.right, rect.left + local.x + tile / 2))
          const cy = Math.max(clampRect.top, Math.min(clampRect.bottom, rect.top + local.y + tile / 2))
          const timeoutId = window.setTimeout(() => {
            onCoinFly({ x: cx, y: cy, deltaBps: coinDeltaBps(k) })
          }, i * COIN_STAGGER_MS)
          coinFlyTimeoutsRef.current.push(timeoutId)
        })
      }
    } else if (revealedSafe.length < prev.length) {
      // New round started — drop any stale scheduled coin-flies from the last one.
      coinFlyTimeoutsRef.current.forEach((t) => window.clearTimeout(t))
      coinFlyTimeoutsRef.current = []
    }
    prevRevealedRef.current = revealedSafe
    // Intentionally keyed on revealedSafe only — tile/tileScreen/committedTrail
    // are read at the moment of the real reveal event, not on every geometry change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedSafe])

  useEffect(
    () => () => {
      coinFlyTimeoutsRef.current.forEach((t) => window.clearTimeout(t))
    },
    [],
  )

  // Bad-vein entry: the whole "PUNCH" fires together, once — the bounded grid
  // shake (pre-existing), a full-canvas blood flash, an expanding blood
  // aftershock ring, and a fixed, deterministically-seeded set of authored
  // coin-scatter arcs, all originating from the vein tile.
  useEffect(() => {
    if (phase.kind === 'bad-vein') {
      // FIX 2 (display-only): the instant a ducat cracks, cancel any STILL-
      // PENDING staggered coin-fly LAUNCHES so no coin flies to the HAUL meter
      // after the bomb. Pre-bomb coins that already launched during 'assaying'
      // are the intended ducat-by-ducat collect suspense and are untouched here
      // (the HUD cancels the ones still airborne). Mirrors the instant pace,
      // which launches ZERO flies because its bomb reveal never grows
      // revealedSafe. No math — coin-flies are pure presentation.
      coinFlyTimeoutsRef.current.forEach((t) => window.clearTimeout(t))
      coinFlyTimeoutsRef.current = []
      const now = performance.now()
      veinEnterRef.current = now
      if (veinTileIdx != null) {
        ringRef.current = { kind: 'loss', origin: veinTileIdx, start: now }
        flashRef.current = now
        // Precompute the fixed 6-shard trajectory ONCE here (deterministic
        // per vein tile) — the per-frame draw below must not recompute this.
        const seedRnd = mulberry32(veinTileIdx * 131 + 7)
        const shards = Array.from({ length: SCATTER_COUNT }, () => ({
          ang: seedRnd() * Math.PI * 2,
          dist: 2.0 + seedRnd() * 2.2,
          rot0: seedRnd() * Math.PI * 2,
          shardSz: 0.22 + seedRnd() * 0.14,
        }))
        scatterRef.current = { origin: veinTileIdx, start: now, shards }
      }
    } else {
      veinEnterRef.current = null
    }
  }, [phase.kind, veinTileIdx])

  // Winning settle: the FULL committed trail was proven with no vein hit —
  // fires the same expanding-ring mechanic, once, in gold instead of blood,
  // from the last-proven tile. Self-contained (no new prop needed): derived
  // purely from the trail/reveal counts already passed in.
  useEffect(() => {
    const isWinSettle =
      phase.kind === 'settled' && committedTrail.length > 0 && revealedSafe.length === committedTrail.length
    if (isWinSettle) {
      if (!winRingFiredRef.current) {
        winRingFiredRef.current = true
        const originIdx = revealedSafe[revealedSafe.length - 1]!
        ringRef.current = { kind: 'win', origin: originIdx, start: performance.now() }
      }
    } else {
      winRingFiredRef.current = false
    }
  }, [phase.kind, revealedSafe, committedTrail])

  // ── Hoisted per-frame lookups (perf hardening, 2026-07-03) ─────────────────
  // These three used to be rebuilt with `new Map()`x2 + `new Set()` INSIDE
  // `draw()` on every call — including the cache-reuse rAF frames during
  // 'assaying'/'bad-vein' where the STATIC board cache is reused and only the
  // dynamic layer (bead pulse/spark/shake) redraws every frame. That's a
  // no-alloc-in-render-rule violation: real allocation churn for values that
  // only actually change when the trail/committed-trail/revealed-set itself
  // changes. `staticDirtyRef` invalidation (driven by the `draw` identity
  // change in the effect below) is unaffected — same trigger, same effect,
  // just no longer reallocated on every animation frame in between.
  const trailIndex = useMemo(() => {
    const m = new Map<number, number>()
    trail.forEach((t, i) => m.set(t, i))
    return m
  }, [trail])
  const committedIndex = useMemo(() => {
    const m = new Map<number, number>()
    committedTrail.forEach((t, i) => m.set(t, i))
    return m
  }, [committedTrail])
  const revealedSet = useMemo(() => new Set(revealedSafe), [revealedSafe])

  // ── Draw ──────────────────────────────────────────────────────────────────
  // `draw` composites a frame: it rebuilds the offscreen STATIC board only when
  // `staticDirtyRef` is set (a real board-state change), then blits it and paints
  // the DYNAMIC layer (bead pulse, spark, shake, pop/press overlays, bloom
  // ring/flash/scatter). Per-frame cost during a cascade or a drag-paint move
  // is thus a single blit + a few dynamic strokes.
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    if (canvas.width !== dims.w * dpr || canvas.height !== dims.h * dpr) {
      canvas.width = dims.w * dpr
      canvas.height = dims.h * dpr
      staticDirtyRef.current = true // geometry changed → static cache stale
    }

    if (!spritesRef.current) {
      // Procedural gold-doubloon bake — the three states, each painted ONCE by
      // the shared `paintDoubloonCore` material into its own 128px reference
      // cache canvas, then scaled per tile below. Zero image decode, zero
      // per-tile/per-frame paint.
      const dormantCanvas = document.createElement('canvas')
      dormantCanvas.width = SPRITE_REF_PX
      dormantCanvas.height = SPRITE_REF_PX
      const struckCanvas = document.createElement('canvas')
      struckCanvas.width = SPRITE_REF_PX
      struckCanvas.height = SPRITE_REF_PX
      const crackedCanvas = document.createElement('canvas')
      crackedCanvas.width = SPRITE_REF_PX
      crackedCanvas.height = SPRITE_REF_PX
      paintDoubloonCore(dormantCanvas.getContext('2d')!, SPRITE_REF_PX, 'dormant')
      paintDoubloonCore(struckCanvas.getContext('2d')!, SPRITE_REF_PX, 'struck')
      paintDoubloonCore(crackedCanvas.getContext('2d')!, SPRITE_REF_PX, 'cracked')
      spritesRef.current = { dormant: dormantCanvas, struck: struckCanvas, cracked: crackedCanvas }
    }
    const sprites = spritesRef.current

    // ── State maps (shared by the static build + the dynamic layer) — hoisted
    // to `useMemo` above (no-alloc-in-render rule); referenced directly here,
    // zero allocation on cache-reuse rAF frames.
    const revealed = revealedSet
    const isPlanning = phase.kind === 'planning'
    const isSettled = phase.kind === 'settled'
    const nextBeadTile =
      phase.kind === 'assaying' ? committedTrail[revealedSafe.length] : undefined

    // Render one tile. `skipBead` renders the next-bead tile in its underlying
    // (committed) state so the pulsing gold bead can be composited dynamically on
    // top each frame without rebuilding the static cache.
    const drawTile = (
      ctx: CanvasRenderingContext2D,
      idx: number,
      x: number,
      y: number,
      sz: number,
      skipBead = false,
      // `true` ONLY at the one static-bake call site below (final polish
      // pass, per-frame-alloc fix). Every dynamic-overlay call site (bead,
      // press-bounce, reveal-pop) omits it and gets `false` — see the
      // dormant-coin branch's own comment for why this matters.
      isStaticBake = false,
    ) => {
      const g = 1.5
      const px = x + g
      const py = y + g
      const s = sz - g * 2
      if (s <= 0) return
      const cx = px + s / 2
      const cy = py + s / 2
      const r = (s / 2) * 0.86
      const inTrail = trailIndex.has(idx)
      const inCommitted = committedIndex.has(idx)
      const isRevealed = revealed.has(idx)
      const isVein = idx === veinTileIdx
      const isBombOnSettle = isSettled && bombBitmap ? bombBitmap[idx] : false

      if (isVein) {
        // Hazard-corona (bad-vein salience boost): a soft ember radial wash
        // sitting BEHIND the cracked doubloon sprite, wider than the tile
        // itself — reads as unmistakably dangerous, not just a dark icon.
        const corona = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.9)
        corona.addColorStop(0, 'rgba(255,93,93,0.32)')
        corona.addColorStop(1, 'rgba(255,93,93,0)')
        ctx.fillStyle = corona
        ctx.beginPath()
        ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2)
        ctx.fill()
        // The dart-trap dud: the CRACKED doubloon sprite (tarnished disc, ember
        // fracture + glow baked in by `paintDoubloonCore`) — the danger accent
        // shows only through the damage.
        ctx.drawImage(sprites.cracked, px, py, s, s)
        return
      }
      if (isRevealed) {
        // jesse nit (14×14): at the smallest tile size a struck/BANKED disc read
        // too close to a dormant one, so "this one is banked" didn't register
        // mid-reveal. A bounded soft gold halo UNDER the sprite + a stronger
        // energized contact ring make the banked state legible without changing
        // the coin material. Both stay INSIDE the cell (so the incremental
        // single-tile re-bake never clips them) and are fixed alpha/geometry
        // (RG-C5 — never keyed to streak/session/value).
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const bankHalo = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.15)
        bankHalo.addColorStop(0, 'rgba(240,181,66,0.24)')
        bankHalo.addColorStop(1, 'rgba(240,181,66,0)')
        ctx.fillStyle = bankHalo
        ctx.beginPath()
        ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        // Struck (revealed) doubloon catching the sub-light — the cached hero
        // sprite (full dome, thick bevel, bright glint + sweep + standing
        // energized ring, all baked by `paintDoubloonCore`).
        ctx.drawImage(sprites.struck, px, py, s, s)
        // A `lighter`-blend gold contact ring at the tile's own outer boundary
        // (alpha 0.32→0.44), so the banked disc pops harder against the dormant
        // field below — one warm gold family, no accent clash.
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.strokeStyle = 'rgba(240,181,66,0.44)'
        ctx.lineWidth = Math.max(1.2, s * 0.06)
        roundRectPath(ctx, px + s * 0.01, py + s * 0.01, s * 0.98, s * 0.98, s * 0.15)
        ctx.stroke()
        ctx.restore()
        return
      }
      if (idx === nextBeadTile) {
        // Static pass leaves this tile as bare board (matching the original, which
        // drew ONLY the probing glow+frame over the backdrop for the bead) —
        // the pulsing charge is composited live in the dynamic layer.
        if (skipBead) return
        // The disc being probed stays visibly a dormant doubloon at all times
        // — draw the dormant disc body first (never a bare glowing orb), then
        // overlay the pulsing sonar "charging" glow + frame ring on top, tied
        // directly to the running cascade — the sonar-lit current running the
        // marked line.
        ctx.drawImage(sprites.dormant, px, py, s, s)
        const now = performance.now()
        const pulse = 0.5 + 0.5 * Math.sin((now * 2 * Math.PI * BEAD_PULSE_HZ) / 1000)
        const glowR = s * (0.75 + pulse * 0.4)
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR)
        glow.addColorStop(0, COL.goldGlow)
        glow.addColorStop(1, 'rgba(240,181,66,0)')
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        // Outward sonar-frame — a single stroked rounded-rect riding the
        // same pulse, reading as the live current probing the disc's own
        // seafloor socket (tied 1:1 to the running cascade, not a decorative
        // loop layered on top).
        ctx.strokeStyle = `rgba(240,181,66,${Math.max(0.35, 0.75 * pulse).toFixed(3)})`
        ctx.lineWidth = Math.max(1.2, s * 0.045)
        roundRectPath(ctx, px + s * 0.01, py + s * 0.01, s * 0.98, s * 0.98, s * 0.15)
        ctx.stroke()
        return
      }
      // Dormant doubloon: cached procedural sprite (tiles run ~53-96px on the
      // 14×14 board). A tiny DETERMINISTIC per-tile rotation + brightness
      // jitter so 100 identical discs read as a real floor of hammered gold,
      // not a repeated stamp — seeded off the tile's own index via the same
      // `mulberry32` PRNG already used for grain/scatter. GUARDED to
      // `isStaticBake` (per-frame-alloc fix): this whole `drawTile` fn is ALSO
      // invoked from the live press-bounce dynamic overlay for a just-pinned
      // tile (every rAF frame for `PRESS_BOUNCE_MS`=140ms) — allocating a
      // jitter closure there every frame would be a real allocation-in-render
      // violation. On the dynamic path the disc draws without the
      // rotation/alpha jitter for that bounded 140ms window instead — a
      // barely-visible trade for zero per-frame allocation; the static field
      // (99.9% of rendered frames) is byte-for-byte unchanged.
      if (isStaticBake) {
        const varyRnd = mulberry32(idx * 7919 + 3)
        const jitterAngle = (varyRnd() - 0.5) * (Math.PI / 20) // ±9°
        const jitterAlpha = 0.92 + varyRnd() * 0.08
        ctx.save()
        ctx.globalAlpha = jitterAlpha
        ctx.translate(cx, cy)
        ctx.rotate(jitterAngle)
        ctx.drawImage(sprites.dormant, -s / 2, -s / 2, s, s)
        ctx.restore()
      } else {
        ctx.drawImage(sprites.dormant, px, py, s, s)
      }
      // Standing "stone socket" rim across the WHOLE dormant field (not just
      // pinned/struck tiles) — a rounded-rect hugging the tile's own outer
      // boundary. A dim gold rim, matching the frame family, so each dormant
      // disc carries a quiet standing warmth against the brown board, well
      // under the struck disc's own much stronger glint + energized ring.
      ctx.strokeStyle = 'rgba(166,124,62,0.24)'
      ctx.lineWidth = Math.max(0.9, s * 0.02)
      roundRectPath(ctx, px + s * 0.02, py + s * 0.02, s * 0.96, s * 0.96, s * 0.14)
      ctx.stroke()
      if (inTrail || (inCommitted && !isSettled)) {
        // Pinned/queued disc — a DETACHED targeting FRAME outside the tile
        // (never touching the disc body), plus the claim-order number in the
        // small-numeral accent color (OLED-bloom exception: bright text blooms
        // at this point size, so pinned order numbers use the dimmer accent
        // green). JADE ring (§7 bounded 2nd-accent role): jade = "this is the
        // line you are arming" — the queued/armed marker, distinct from the
        // warm gold on every struck/revealed surface, so a player tells
        // "armed" from "claimed" at a glance. The dash pattern is GUARDED to
        // `isStaticBake` for the same per-frame-allocation reason as the jitter
        // above — `ctx.setLineDash([...])` allocated a fresh array every
        // dynamic-overlay frame too. On the dynamic path the frame strokes
        // SOLID via the hoisted, reused `NO_DASH` constant (zero allocation)
        // instead of dashed, for the tile's ~140ms bounce.
        // Cyan route SEAL (#rcoin) — a teal wax seal covering the ducat face:
        // a radial cyan glow, the seal fill (playerDeep) + player-cyan ring, and
        // a dashed inner ring. This is the "on route" pod state (§3 selected).
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const sealGlow = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.5)
        sealGlow.addColorStop(0, 'rgba(53,224,210,0.4)')
        sealGlow.addColorStop(1, 'rgba(53,224,210,0)')
        ctx.fillStyle = sealGlow
        ctx.beginPath()
        ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
        ctx.fillStyle = COL.playerDeep
        ctx.strokeStyle = COL.player
        ctx.lineWidth = Math.max(1.2, s * 0.045)
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.strokeStyle = '#1c5a52'
        ctx.lineWidth = Math.max(0.8, s * 0.03)
        ctx.setLineDash(isStaticBake ? [s * 0.055, s * 0.045] : NO_DASH)
        ctx.beginPath()
        ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash(NO_DASH)
        if (s > 16) {
          const order = (inTrail ? trailIndex.get(idx) : committedIndex.get(idx))! + 1
          const orderStr = String(order)
          // Readability floor (Tim, 2026-07-06): the claim-order numeral is
          // sized 0.44×tile but never allowed below 13px, so on the small
          // ~24-27px mobile pods (and the MIN_BOARD_PX short-window edge) the
          // route numbers stay legible instead of collapsing to ~10px. Two-
          // digit orders still fit the cell (mono ~7.8px/digit at 13px vs the
          // ≥24px tile), and the scrim + ink outline below keep contrast.
          ctx.font = `${Math.max(13, Math.floor(s * 0.44))}px "Geist Mono", monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          // autisk nit: the accent-green claim-order numeral on the gold
          // doubloon reads low-contrast at 14×14. A thin soft dark scrim disc
          // behind the digit (the recurring "a value on a busy surface needs a
          // dark backing" move) lifts it off the gold before the ink outline —
          // bounded within the cell, fixed geometry (RG-C5).
          ctx.save()
          const numScrim = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.3)
          numScrim.addColorStop(0, 'rgba(3,9,15,0.62)')
          numScrim.addColorStop(0.7, 'rgba(3,9,15,0.4)')
          numScrim.addColorStop(1, 'rgba(3,9,15,0)')
          ctx.fillStyle = numScrim
          ctx.beginPath()
          ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          // M3 (autisk, §7 two-greens): the accent-green order numeral sits over
          // the jade sun-disc glyph + inside the jade armed-ring — two greens
          // muddying. A dark ink outline behind the digit (the recurring "a
          // value on a busy surface needs a dark backing" rule) keeps the green
          // legible and off the jade, without nudging the number off-center.
          ctx.save()
          ctx.lineJoin = 'round'
          ctx.lineWidth = Math.max(1.5, s * 0.07)
          ctx.strokeStyle = 'rgba(3,9,15,0.9)'
          ctx.strokeText(orderStr, cx, cy)
          ctx.restore()
          ctx.fillStyle = COL.playerText
          ctx.fillText(orderStr, cx, cy)
        }
      }
      if (isBombOnSettle && !isRevealed) {
        // Certificate view: bad-vein audit marks, post-settlement only. The
        // already-drawn dormant disc (above) gets the cracked doubloon sprite
        // composited on top at reduced opacity — an "audit x-ray" reading as
        // an unambiguous "this was a dart-trap disc" mark rather than a stray
        // tint — plus a thin dashed ember frame for legibility at a glance.
        // A per-tile rotation jitter (own seed, distinct from the dormant-
        // sprite jitter above) keeps multiple audit-marked tiles (up to 8 on
        // the Flooded tier) from reading as a repeated stamp.
        const auditRnd = mulberry32(idx * 5081 + 5)
        const auditAngle = (auditRnd() - 0.5) * (Math.PI / 24)
        ctx.save()
        ctx.globalAlpha = 0.72
        ctx.translate(cx, cy)
        ctx.rotate(auditAngle)
        ctx.drawImage(sprites.cracked, -s / 2, -s / 2, s, s)
        ctx.restore()
        ctx.strokeStyle = 'rgba(255,93,93,0.85)'
        ctx.lineWidth = Math.max(0.8, s * 0.04)
        ctx.setLineDash([s * 0.06, s * 0.05])
        roundRectPath(ctx, px + s * 0.02, py + s * 0.02, s * 0.96, s * 0.96, s * 0.14)
        ctx.stroke()
        ctx.setLineDash(NO_DASH)
      }
    }

    // ── (1) STATIC board — rebuilt offscreen ONLY when marked dirty ──────────
    // Background + grain + all 196 tiles. The next-bead tile AND any tile
    // currently mid reveal-pop/press-bounce are deferred (composited live in
    // the dynamic layer below), so the cache survives the whole
    // between-reveals interval; per rAF frame we skip the 196-tile loop.
    if (!boardRef.current) boardRef.current = document.createElement('canvas')
    const board = boardRef.current
    if (board.width !== dims.w * dpr || board.height !== dims.h * dpr) {
      board.width = dims.w * dpr
      board.height = dims.h * dpr
      staticDirtyRef.current = true
    }
    // ── Static-cache invalidation GATE (perf) ────────────────────────────────
    // Re-bake the whole 196-tile board ONLY when something the static layer
    // draws actually changes: dims, phase, the claim-line SET (trail/committed),
    // or the vein tile. A plain reveal STEP during assaying (revealedSafe grows,
    // the bead advances) is deliberately EXCLUDED from this signature — those are
    // handled incrementally (the revealed tile via reveal-pop → `bakeStaticTile`,
    // the advancing bead via the bead-advance clear below) — so a 60-disc trail
    // no longer triggers ~60 full-board rebakes. Cursor/focus/hover deps are also
    // excluded (they only touch the dynamic overlay, never the static bake).
    const staticSig = `${dims.w}x${dims.h}|${phase.kind}|t:${trail.join(',')}|c:${committedTrail.join(',')}|v:${veinTileIdx}`
    if (staticSig !== staticSigRef.current) {
      staticDirtyRef.current = true
      staticSigRef.current = staticSig
    }
    const fullBaked = staticDirtyRef.current
    if (staticDirtyRef.current) {
      // (a) Bake the BACKDROP-ONLY layer (gradient + grain + dither — no tiles,
      // no falloff) into its own cache so a single revealed tile can later be
      // re-baked incrementally (`bakeStaticTile`) without re-running any of it.
      if (!backdropRef.current) backdropRef.current = document.createElement('canvas')
      const backdrop = backdropRef.current
      if (backdrop.width !== dims.w * dpr || backdrop.height !== dims.h * dpr) {
        backdrop.width = dims.w * dpr
        backdrop.height = dims.h * dpr
      }
      const dctx = backdrop.getContext('2d')!
      dctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dctx.clearRect(0, 0, dims.w, dims.h)
      // Board backdrop — deep-water seafloor bed lit by the UPPER-LEFT sub-light
      // key (§6): the radial hotspot is relocated to upper-left (~w*0.28, h*0.22)
      // so the water light agrees with every coin's upper-left dome sheen +
      // glint; it pools a dim cool glow up-left, fading to the deep-water boardBg
      // (#0a1a26) toward the lower-right, plus static grain streaks
      // (the board's own material, drawn once behind the tiles — not atmosphere).
      // `boardAreaH` == `dims.h` — kept as a named value only because the
      // dither/grain code below reads it.
      const bgGrad = dctx.createRadialGradient(dims.w * 0.28, boardAreaH * 0.22, 8, dims.w * 0.28, boardAreaH * 0.22, dims.w * 1.05)
      bgGrad.addColorStop(0, COL.boardBgHi)
      // EVEN-LIGHT (Tim, 2026-07-06): the bed used to fall off from boardBgHi
      // #103042 all the way to boardBg #0a1a26 at the far/lower-right corner — a
      // ~40% luminance drop that, together with the (now removed) per-frame
      // multiply falloff, made that corner read visibly dark. The far/mid stops
      // are lifted right up next to the center tone so the board bed is a single
      // near-uniform deep-water tone (only a whisper of a gradient survives to
      // keep the radial from banding); no visible corner vignette remains.
      bgGrad.addColorStop(0.5, '#0f2e40')
      bgGrad.addColorStop(1, '#0e2c3d')
      dctx.fillStyle = bgGrad
      dctx.fillRect(0, 0, dims.w, boardAreaH)
      // Dampened (final polish pass, autisk nit — "current streak bleed":
      // these board-material grain streaks sit BEHIND every coin, so they
      // were showing through the transparent gaps around each coin's
      // circular silhouette loud enough to read as interference lines
      // muddying the field). 9 streaks at 6-18px amplitude / 16% alpha ->
      // 6 streaks at 2-6px amplitude / 7% alpha — same authored technique,
      // much quieter; the board's own material texture survives without
      // competing with the coins on top of it.
      const grainRnd = mulberry32(1337)
      dctx.strokeStyle = COL.grain
      dctx.lineWidth = 1
      for (let i = 0; i < 6; i++) {
        const y = grainRnd() * boardAreaH
        const amp = 2 + grainRnd() * 4
        dctx.beginPath()
        dctx.moveTo(0, y)
        dctx.bezierCurveTo(dims.w * 0.3, y + amp, dims.w * 0.7, y - amp, dims.w, y)
        dctx.stroke()
      }
      // Static dither (P2-I) — a fixed, deterministically-seeded scatter of
      // near-invisible 1px dots that further breaks up the radial gradient's
      // banding. Baked once into this same static cache, zero per-frame cost.
      const ditherRnd = mulberry32(4242)
      for (let i = 0; i < 140; i++) {
        const dx = ditherRnd() * dims.w
        const dy = ditherRnd() * boardAreaH
        const da = 0.015 + ditherRnd() * 0.02
        dctx.fillStyle = `rgba(53,224,210,${da.toFixed(3)})` // plankton-grain dither (aligned to new COL.grain; §C-CRITICAL: was warm-brown rgba(168,122,74))
        dctx.fillRect(dx, dy, 1, 1)
      }
      // (b) Compose the board cache = backdrop blit + all static tiles. The
      // multiply light-falloff is NO LONGER baked here (it moved to the per-frame
      // composite below) so an incrementally re-baked tile matches its neighbours
      // exactly without having to re-apply a board-wide gradient per reveal.
      const bctx = board.getContext('2d')!
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      bctx.clearRect(0, 0, dims.w, dims.h)
      bctx.drawImage(backdrop, 0, 0, dims.w, dims.h)
      for (let idx = 0; idx < GRID_DIM * GRID_DIM; idx++) {
        if (popRef.current.has(idx) || pressRef.current.has(idx)) continue // mid-animation — drawn live below
        const { x, y } = tileScreen(idx)
        if (x + tile < 0 || y + tile < 0 || x > dims.w || y > dims.h) continue
        drawTile(bctx, idx, x, y, tile, true, true) // skipBead: next-bead deferred; isStaticBake: true (the ONLY such call site)
      }
      staticDirtyRef.current = false
    }

    // Incremental single-tile re-bake into the static board cache — the 196-tile
    // perf fix. Called when ONE tile's reveal-pop / press-bounce finishes,
    // instead of the old full-board (O(GRID_DIM²)) rebake per reveal step: the
    // tile's cell is cleared, the baked backdrop rect is blitted back under it,
    // and the tile is redrawn in its now-settled state. O(1) per reveal, so a
    // 60-disc trail no longer costs ~60 full-board rebakes (no per-disc frame
    // spike). The full rebake stays reserved for genuine layout/dimension
    // changes (resize) via `staticDirtyRef`.
    const bakeStaticTile = (idx: number) => {
      const backdrop = backdropRef.current
      if (!backdrop) {
        staticDirtyRef.current = true // no backdrop yet → fall back to a full rebake
        return
      }
      const bctx = board.getContext('2d')!
      bctx.save()
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const { x, y } = tileScreen(idx)
      // Pad the invalidated rect enough to cover cross-cell overdraw (the jade
      // targeting frame reaches ~0.06s outside its own cell + its stroke width).
      const pad = Math.ceil(tile * 0.1) + 2
      const rx = Math.floor(x) - pad
      const ry = Math.floor(y) - pad
      const rw = Math.ceil(tile) + pad * 2
      const rh = Math.ceil(tile) + pad * 2
      bctx.beginPath()
      bctx.rect(rx, ry, rw, rh)
      bctx.clip() // bound every redraw below to this rect — never disturbs tiles further out
      bctx.clearRect(rx, ry, rw, rh)
      bctx.drawImage(backdrop, rx * dpr, ry * dpr, rw * dpr, rh * dpr, rx, ry, rw, rh)
      // Redraw this tile AND its 8 neighbours (clipped), in strict idx order to
      // match the full-bake `lighter`-blend layering, so any neighbour overdraw
      // (targeting frame / contact ring) that bled into this rect is restored.
      // Still O(9), not O(GRID_DIM²) — bounded, does not scale with trail length.
      const col = idx % GRID_DIM
      const row = Math.floor(idx / GRID_DIM)
      for (let dr = -1; dr <= 1; dr++) {
        const nr = row + dr
        if (nr < 0 || nr >= GRID_DIM) continue
        for (let dc = -1; dc <= 1; dc++) {
          const nc = col + dc
          if (nc < 0 || nc >= GRID_DIM) continue
          const nidx = nr * GRID_DIM + nc
          if (popRef.current.has(nidx) || pressRef.current.has(nidx)) continue // still animating → drawn live
          const p = tileScreen(nidx)
          drawTile(bctx, nidx, p.x, p.y, tile, true, true)
        }
      }
      bctx.restore()
    }

    // Bead-advance incremental clear (perf): when the probing bead moves to the
    // next committed tile WITHOUT a full rebake, that tile still carries its
    // baked committed (jade) targeting frame in the static cache. Clear it to
    // bare board (the live pulsing bead draws over it) so no stale frame rings
    // the bead. A full rebake already bakes the bead bare (skipBead), so this is
    // only needed on the incremental path.
    if (nextBeadTile !== lastBeadRef.current) {
      if (!fullBaked && nextBeadTile !== undefined && !popRef.current.has(nextBeadTile) && !pressRef.current.has(nextBeadTile)) {
        bakeStaticTile(nextBeadTile)
      }
      lastBeadRef.current = nextBeadTile
    }

    // ── (2) Composite: blit the cached board + the DYNAMIC layer per frame ────
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, dims.w, dims.h)
    ctx.save()

    // Bounded, one-shot bust shake — decays to 0 well inside the settle hold.
    // Applied at composite time so it jitters the cached board without a rebuild.
    // B2: end-state of the shake is zero offset (board settled), so under
    // reduced-motion we simply never apply the jitter translate.
    if (!reducedMotion && phase.kind === 'bad-vein' && veinEnterRef.current != null) {
      const elapsed = performance.now() - veinEnterRef.current
      if (elapsed < BUST_SHAKE_MS) {
        const decay = 1 - elapsed / BUST_SHAKE_MS
        const amp = BUST_SHAKE_PX * decay
        ctx.translate((Math.random() - 0.5) * 2 * amp, (Math.random() - 0.5) * 2 * amp)
      }
    }

    // Cached static board (backdrop + grain + tiles) — one drawImage.
    ctx.drawImage(board, 0, 0, dims.w, dims.h)

    // EVEN-LIGHT (Tim, 2026-07-06): the board-wide multiply-blend light falloff
    // that used to live here crushed the far / lower-right corner to ~10%
    // brightness (an `rgba(10,26,38)` multiply stop at the corner) — that was the
    // visible dark corner / black haze Tim saw, with the pods in that corner
    // reading noticeably dimmer than up-left. It is REMOVED so the board bed is
    // evenly lit and every pod is equally crisp/readable in all four corners.
    // Depth now comes only from the (now near-uniform) baked `bgGrad` bed + the
    // per-sprite baked lighting; the transient one-shot gold SUB_FLARE on a real
    // reveal (event-only juice, in the reveal-pop loop below) stays.

    // DE-HAZE (Tim, 2026-07-06): the persistent additive `lighter` cyan sub-
    // light vignette that used to breathe over the WHOLE board every frame was
    // milking the gold ducats' contrast and casting a cyan film over the pods —
    // an always-on additive wash is exactly the "waas over de munten" haze. It
    // is REMOVED. The board's depth now comes only from the multiply falloff
    // above (a lighting vignette that darkens the far corner, never washes the
    // coins) and the baked sprite lighting. All sub-light "life" is now purely
    // EVENT-driven: the transient one-shot gold SUB_FLARE on a real reveal
    // (below, in the reveal-pop loop) stays — it is brief, localized to the
    // struck tile, and never sits over the idle/planning board. Ambient deep-
    // water motion (caustics/bubbles/plankton) lives only in the scene margins
    // outside the opaque board card, never over the pods.

    // Live current-bead — the pulsing sonar-probed dormant disc, composited
    // over its cached tile (drawn here, before the thread, to match the
    // original layer order exactly).
    if (nextBeadTile !== undefined) {
      const { x, y } = tileScreen(nextBeadTile)
      if (!(x + tile < 0 || y + tile < 0 || x > dims.w || y > dims.h)) {
        drawTile(ctx, nextBeadTile, x, y, tile, false)
      }
    }

    // Press-bounce dynamic overlay — a ~140ms squish dip on a just-pinned coin.
    pressRef.current.forEach((start, idx) => {
      const age = performance.now() - start
      if (age >= PRESS_BOUNCE_MS) {
        pressRef.current.delete(idx)
        bakeStaticTile(idx) // incremental: bake just this settled tile (not a full 196 rebake)
        return
      }
      const { x, y } = tileScreen(idx)
      if (x + tile < 0 || y + tile < 0 || x > dims.w || y > dims.h) return
      const scale = pressDipScale(age / PRESS_BOUNCE_MS)
      const px2 = x + tile / 2
      const py2 = y + tile / 2
      ctx.save()
      ctx.translate(px2, py2)
      ctx.scale(scale, scale)
      ctx.translate(-px2, -py2)
      drawTile(ctx, idx, x, y, tile, false)
      ctx.restore()
    })

    // Reveal-pop dynamic overlay — a ~260ms chunky overshoot as a struck disc
    // "lands" its socket. §5.5: a one-shot brightness lift on the struck
    // sprite peaking around REVEAL_POP_PEAK_T (the coin catches the sub-light),
    // and §6: a bounded one-shot additive sub-light flare wash synced to the pop
    // timeline. Both keyed only to the fixed curve (RG-C5) — the contact shadow
    // is baked into the sprite so it tightens with the scale automatically.
    popRef.current.forEach((start, idx) => {
      const age = performance.now() - start
      if (age >= REVEAL_POP_MS) {
        popRef.current.delete(idx)
        bakeStaticTile(idx) // incremental: bake just this settled tile (not a full 196 rebake)
        return
      }
      const { x, y } = tileScreen(idx)
      if (x + tile < 0 || y + tile < 0 || x > dims.w || y > dims.h) return
      const u = age / REVEAL_POP_MS
      const scale = popScale(u)
      // Triangular envelope peaking at REVEAL_POP_PEAK_T.
      const peakEnv =
        u <= REVEAL_POP_PEAK_T ? u / REVEAL_POP_PEAK_T : 1 - (u - REVEAL_POP_PEAK_T) / (1 - REVEAL_POP_PEAK_T)
      const px2 = x + tile / 2
      const py2 = y + tile / 2
      ctx.save()
      ctx.translate(px2, py2)
      ctx.scale(scale, scale)
      ctx.translate(-px2, -py2)
      if (peakEnv > 0) ctx.filter = `brightness(${(1 + (REVEAL_BRIGHTEN - 1) * peakEnv).toFixed(3)})`
      drawTile(ctx, idx, x, y, tile, false)
      ctx.restore()
      if (peakEnv > 0) {
        const fr = tile * SUB_FLARE_R_MULT
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        const fg = ctx.createRadialGradient(px2, py2, 0, px2, py2, fr)
        fg.addColorStop(0, `rgba(240,181,66,${(SUB_FLARE_ALPHA * peakEnv).toFixed(3)})`)
        fg.addColorStop(1, 'rgba(240,181,66,0)')
        ctx.fillStyle = fg
        ctx.beginPath()
        ctx.arc(px2, py2, fr, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    })

    // Keyboard cursor (accessibility-qa CRIT #3) — a bone corner-bracket
    // frame OUTSIDE the tile, deliberately a different shape than the
    // pinned/queued rounded-rect frame (also bone) so a keyboard user can
    // tell "where my cursor is" apart from "what's already marked" even when
    // the cursor currently sits on a marked tile. Only drawn once the board
    // actually has DOM focus (`hasFocus`) — never shown during a pure mouse
    // session, matching the CSS `:focus-visible` ring on the canvas element.
    if (hasFocus && interactive) {
      const { x, y } = tileScreen(cursorIdx)
      if (!(x + tile < 0 || y + tile < 0 || x > dims.w || y > dims.h)) {
        // Readability (Option A / A3): the keyboard-focus cursor is toned DOWN
        // so it no longer reads like a placed "mark" in a screenshot — smaller
        // (tighter arms + inset), thinner stroke, and semi-transparent bone —
        // a clearly different, quieter visual register than the solid cyan
        // selection ring. Still fully functional for keyboard a11y (unchanged
        // gating on `hasFocus && interactive`), just visually subordinate.
        const cInset = tile * -0.06
        const armLen = tile * 0.2
        const cx0 = x + cInset
        const cy0 = y + cInset
        const cx1 = x + tile - cInset
        const cy1 = y + tile - cInset
        ctx.strokeStyle = 'rgba(230,241,245,0.4)'
        ctx.lineWidth = Math.max(1, tile * 0.03)
        ctx.lineCap = 'round'
        // Four L-bracket corners, drawn as four direct beginPath/moveTo/
        // lineTo calls (no array-of-points literal) — this file's own
        // no-alloc-in-render discipline (see `drawTile`'s `isStaticBake`
        // comment above) applies here too: this cursor redraws every rAF
        // frame while the board has focus, so a fresh nested-array literal
        // per frame would be exactly the allocation-in-render violation the
        // rest of this function was carefully built to avoid.
        ctx.beginPath()
        ctx.moveTo(cx0, cy0 + armLen)
        ctx.lineTo(cx0, cy0)
        ctx.lineTo(cx0 + armLen, cy0)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx1 - armLen, cy0)
        ctx.lineTo(cx1, cy0)
        ctx.lineTo(cx1, cy0 + armLen)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx1, cy1 - armLen)
        ctx.lineTo(cx1, cy1)
        ctx.lineTo(cx1 - armLen, cy1)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx0 + armLen, cy1)
        ctx.lineTo(cx0, cy1)
        ctx.lineTo(cx0, cy1 - armLen)
        ctx.stroke()
      }
    }

    // Claim-line thread — a JADE inlay vein linking the marked/queued discs
    // (§7: jade is the "armed line" marker). A struck disc shows the hero gold
    // doubloon, so a persistent bright thread through every committed tile's
    // center would compete with it — the thread shows only the QUEUED,
    // not-yet-revealed portion of the traced line (from the live bead onward)
    // while the ember is actually running, and isn't drawn once settled, so it
    // never crosses a struck disc. Its jade reads as ONE consistent
    // "armed / not-yet-claimed" language together with the jade pinned frame
    // above. While live, the thread flows with a moving dash at a fixed speed,
    // unifying it with the bead pulse + travelling ember as one visual language.
    const threadTiles = isPlanning
      ? trail
      : phase.kind === 'assaying'
        ? committedTrail.slice(revealedSafe.length)
        : []
    if (threadTiles.length > 1) {
      // Dashed CYAN route_link connector between consecutive selected ducats
      // (§ route_link). Flows while the line is live; static dash while plotting.
      ctx.strokeStyle = 'rgba(53,224,210,0.7)'
      ctx.lineWidth = Math.max(1.5, tile * 0.08)
      ctx.lineJoin = 'round'
      const dash = tile * 0.32
      ctx.setLineDash([dash, dash * 0.9])
      if (phase.kind === 'assaying') {
        ctx.lineDashOffset = -((performance.now() / 1000) * CONDUIT_FLOW_PX_PER_S)
      }
      ctx.beginPath()
      let prevTile = -1
      threadTiles.forEach((t, i) => {
        const { x, y } = tileScreen(t)
        const tcx = x + tile / 2
        const tcy = y + tile / 2
        if (i === 0) {
          ctx.moveTo(tcx, tcy)
        } else {
          // Free-pick readability (Option A / A1): picks need NOT be adjacent
          // (intended mechanic), so a connector is drawn ONLY between two
          // consecutive picks that are spatially ADJACENT on the grid (the
          // 8-neighbourhood). A pick that jumps across a gap starts a fresh
          // subpath (moveTo, no line) instead of a straight line spanning the
          // gap — so a contiguous drag-painted run stays visibly connected
          // while an isolated/far free pick reads as a deliberate independent
          // pick (cyan ring + number only), never a stray point on a path.
          const pCol = prevTile % GRID_DIM
          const pRow = Math.floor(prevTile / GRID_DIM)
          const cCol = t % GRID_DIM
          const cRow = Math.floor(t / GRID_DIM)
          const adjacent =
            t !== prevTile &&
            Math.abs(pCol - cCol) <= 1 &&
            Math.abs(pRow - cRow) <= 1
          if (adjacent) ctx.lineTo(tcx, tcy)
          else ctx.moveTo(tcx, tcy)
        }
        prevTile = t
      })
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Travelling current-spark — the sensing light running from the
    // last-struck disc to the next, fired only by a real reveal event (see the
    // watcher effect above). A hot gold pulse with a thin jittering arc
    // trailing its head, reading as a live probing current rather than a floating
    // blob — still O(1) per frame, still strictly bound to SPARK_TRAVEL_MS and
    // a real reveal event. (`assayAudio.ts`'s cues for this same reveal event
    // are timbred as physical sonar/coin/breaker sounds — the two channels agree
    // at the fiction level.) `from` is the just-struck disc; the ember's origin
    // is offset from that tile's CENTER out to its EDGE (halfway to `to`) so
    // this transient arc never crosses the disc body, keeping the struck
    // doubloon as the one static hero pixel on the tile.
    // B2: the travelling reveal-spark is pure in-flight motion; its end-state is
    // "arrived" (nothing drawn), so under reduced-motion it is skipped entirely.
    if (!reducedMotion && sparkRef.current && phase.kind === 'assaying') {
      const { from, to, start, jitters } = sparkRef.current
      const t = Math.min(1, (performance.now() - start) / SPARK_TRAVEL_MS)
      if (t < 1) {
        const a = tileScreen(from)
        const b = tileScreen(to)
        const fromCx = a.x + tile / 2
        const fromCy = a.y + tile / 2
        const toCx = b.x + tile / 2
        const toCy = b.y + tile / 2
        const dirX = toCx - fromCx
        const dirY = toCy - fromCy
        const dirLen = Math.hypot(dirX, dirY) || 1
        const ax = fromCx + (dirX / dirLen) * (tile * 0.5)
        const ay = fromCy + (dirY / dirLen) * (tile * 0.5)
        const ex = ax + (toCx - ax) * t
        const ey = ay + (toCy - ay) * t
        // Jittering current-arc from the last nub to the spark head — jitter
        // values precomputed once at spark-fire time (see reveal watcher).
        ctx.strokeStyle = COL.goldGlow
        ctx.lineWidth = Math.max(1, tile * 0.05)
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        const steps = 4
        const remX = toCx - ax
        const remY = toCy - ay
        for (let i = 1; i <= steps; i++) {
          const st = (t * i) / steps
          const bx = ax + remX * st
          const by = ay + remY * st
          const nx = -dirY
          const ny = dirX
          const nlen = Math.hypot(nx, ny) || 1
          const jitter = (jitters[i - 1]! - 0.5) * tile * 0.18
          ctx.lineTo(bx + (nx / nlen) * jitter, by + (ny / nlen) * jitter)
        }
        ctx.stroke()
        const r = tile * 0.42
        const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r)
        g.addColorStop(0, 'rgba(255,255,255,0.9)')
        g.addColorStop(0.4, COL.goldGlow)
        g.addColorStop(1, 'rgba(240,181,66,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(ex, ey, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Bloom concussion ring — expands from the causal tile (win: the
    // last-struck disc, gold; loss: the vein tile, ember), one-shot, fixed
    // duration (RG-C5: never scaled by the
    // payout size).
    // B2: the concussion ring's end-state is fully expanded + faded (opacity 0),
    // i.e. gone, so under reduced-motion it is skipped.
    if (!reducedMotion && ringRef.current) {
      const { kind, origin, start } = ringRef.current
      const dur = kind === 'win' ? RING_WIN_MS : RING_LOSS_MS
      const age = performance.now() - start
      if (age >= dur) {
        ringRef.current = null
      } else {
        const t = age / dur
        const o = tileScreen(origin)
        const rcx = o.x + tile / 2
        const rcy = o.y + tile / 2
        // Tile-relative cap (was viewport-relative — at a 20×20 board that
        // let the ring's radius exceed the board itself, so only a thin
        // ARC of a huge, mostly off-canvas circle was ever visible, reading
        // like a stray line rather than a localized concussion). Capped to
        // ~9 tile-widths so the ring visibly closes back on itself near its
        // own origin — a real "concussion," not a board-spanning sweep.
        const maxR = tile * 9
        const rr = tile * 0.6 + (maxR - tile * 0.6) * easeOutCubic(t)
        const alpha = (1 - t) * 0.55
        const rgb = kind === 'win' ? '240,181,66' : '255,93,93'
        ctx.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`
        ctx.lineWidth = Math.max(2, tile * 0.22 * (1 - t * 0.6))
        ctx.beginPath()
        ctx.arc(rcx, rcy, rr, 0, Math.PI * 2)
        ctx.stroke()
        if (t < 0.3) {
          const flashAlpha = (1 - t / 0.3) * 0.35
          const g = ctx.createRadialGradient(rcx, rcy, 0, rcx, rcy, tile * 2.2)
          g.addColorStop(0, `rgba(${rgb},${flashAlpha.toFixed(3)})`)
          g.addColorStop(1, `rgba(${rgb},0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(rcx, rcy, tile * 2.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // Authored bust coin-scatter — a FIXED count of deterministically-seeded
    // shard trajectories tumbling from the vein tile (never a particle
    // spawner: fixed N, a pure function of (tile-seed, elapsed time), no
    // continuous emission or pooling).
    // B2: the shard scatter's end-state is landed/faded (opacity 0), i.e. gone,
    // so under reduced-motion it is skipped — the cracked ducat itself (baked
    // into the static board) still marks the bust tile.
    if (!reducedMotion && scatterRef.current) {
      const { origin, start, shards } = scatterRef.current
      const age = performance.now() - start
      if (age >= SCATTER_MS) {
        scatterRef.current = null
      } else {
        const t = age / SCATTER_MS
        const o = tileScreen(origin)
        const scx = o.x + tile / 2
        const scy = o.y + tile / 2
        const ease = 1 - Math.pow(1 - t, 2)
        for (let i = 0; i < SCATTER_COUNT; i++) {
          const { ang, dist: distFactor, rot0, shardSz: shardSzFactor } = shards[i]!
          const dist = tile * distFactor
          const shardSz = tile * shardSzFactor
          const px2 = scx + Math.cos(ang) * dist * ease
          const py2 = scy + Math.sin(ang) * dist * ease - tile * 2.4 * t * (1 - t)
          const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3
          ctx.save()
          ctx.translate(px2, py2)
          ctx.rotate(rot0 + t * Math.PI * 2.4)
          ctx.globalAlpha = Math.max(0, alpha)
          const grad = ctx.createLinearGradient(-shardSz / 2, -shardSz / 2, shardSz / 2, shardSz / 2)
          grad.addColorStop(0, COL.gold)
          grad.addColorStop(1, COL.bloodDark1)
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(0, 0, shardSz / 2, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = COL.blood
          ctx.lineWidth = Math.max(1, shardSz * 0.12)
          ctx.stroke()
          ctx.restore()
        }
      }
    }

    // Full-canvas blood flash on a bust — fast fade, bounded, one-shot.
    // B2: the flash's end-state is fully faded (alpha 0), so under reduced-motion
    // it is skipped — no full-canvas red pulse. The static focus vignette below
    // (a non-animated gradient) still draws the eye to the vein on a bust.
    if (!reducedMotion && flashRef.current != null) {
      const age = performance.now() - flashRef.current
      if (age >= BUST_FLASH_MS) {
        flashRef.current = null
      } else {
        const t = age / BUST_FLASH_MS
        const alpha = (1 - t) * 0.22
        ctx.fillStyle = `rgba(255,93,93,${alpha.toFixed(3)})`
        ctx.fillRect(0, 0, dims.w, dims.h)
      }
    }

    // Focus vignette on a bust — draws the eye to the vein, board dims around it.
    if (phase.kind === 'bad-vein' && veinTileIdx != null) {
      const v = tileScreen(veinTileIdx)
      const vcx = v.x + tile / 2
      const vcy = v.y + tile / 2
      const vg = ctx.createRadialGradient(vcx, vcy, tile * 1.4, vcx, vcy, Math.max(dims.w, dims.h) * 0.75)
      vg.addColorStop(0, 'rgba(0,0,0,0)')
      vg.addColorStop(1, 'rgba(0,0,0,0.45)')
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, dims.w, dims.h)
    }

    ctx.restore()
  }, [
    dims.w,
    dims.h,
    boardAreaH,
    isDesktop,
    tile,
    phase,
    trail,
    committedTrail,
    revealedSafe,
    veinTileIdx,
    bombBitmap,
    tileScreen,
    trailIndex,
    committedIndex,
    revealedSet,
    interactive,
    cursorIdx,
    hasFocus,
    reducedMotion,
  ])

  // Redraw on any relevant change + a light rAF for every phase except lobby
  // (bead pulse, travelling spark, bust shake, reveal-pop/press-bounce
  // overlays, bloom ring/flash/scatter — all bounded, all tied to a real
  // round event, none of them a decorative idle loop; each frame's dynamic-
  // layer work is a single cached-board blit plus a handful of cheap branch
  // checks, so running this continuously outside lobby carries no meaningful
  // per-frame cost beyond what the pre-existing assaying/bad-vein loop already
  // paid). A new `draw` identity means a board-state dep changed → the static
  // cache is stale, so rebuild it once here; the rAF loop below then reuses
  // that cache. NOTE: this no longer blanket-marks the static cache dirty on
  // every `draw` identity change — the signature gate inside `draw` decides when
  // a full rebake is genuinely needed, so a reveal step (a new `draw` identity
  // via the `revealedSafe` dep) reuses the cache + incremental bakes instead of
  // rebaking all 196 tiles.
  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (phase.kind === 'lobby') return
    const loop = () => {
      draw() // reuses the cached static board; only the dynamic layer redraws
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase.kind, draw])

  // ── Pointer handling ────────────────────────────────────────────────────
  const localPoint = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  /** Starts the ~140ms press-bounce dip IFF `idx` is not already pinned (i.e.
   *  this click/paint/tap is about to ADD it to the claim-line, not remove
   *  it) — checked against the pre-toggle `trailIndex` snapshot. */
  const maybeStartPress = (idx: number) => {
    if (!trailIndex.has(idx)) pressRef.current.set(idx, performance.now())
  }

  /** Keyboard equivalent of drag-paint/tap (accessibility-qa CRIT #3): arrow
   *  keys move the roving cursor within the GRID_DIM×GRID_DIM board (clamped,
   *  never wraps — wrap-around on a spatial grid is disorienting for a
   *  screen-reader/keyboard user tracking position), Space/Enter mirrors a
   *  tap on the cursor's tile via the same `onToggleTile` a pointer tap
   *  already calls. A no-op while `!interactive` (mirrors every pointer
   *  handler's own guard — matches the board's real state, never a dead
   *  control that looks live). */
  const onKeyDownBoard = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!interactive) return
    const col = cursorIdx % GRID_DIM
    const row = Math.floor(cursorIdx / GRID_DIM)
    let nextCol = col
    let nextRow = row
    switch (e.key) {
      case 'ArrowUp':
        nextRow = Math.max(0, row - 1)
        break
      case 'ArrowDown':
        nextRow = Math.min(GRID_DIM - 1, row + 1)
        break
      case 'ArrowLeft':
        nextCol = Math.max(0, col - 1)
        break
      case 'ArrowRight':
        nextCol = Math.min(GRID_DIM - 1, col + 1)
        break
      case ' ':
      case 'Spacebar':
      case 'Enter':
        e.preventDefault()
        maybeStartPress(cursorIdx)
        onToggleTile(cursorIdx)
        return
      default:
        return
    }
    e.preventDefault()
    const nextIdx = nextRow * GRID_DIM + nextCol
    setCursorIdx(nextIdx)
    // Mobile/narrow pan-only mode: keep the moved-to cursor tile inside the
    // visible scroll window (the same reachability guarantee a sighted
    // drag-pan gets for free) — clamps the scroll container to the cursor's
    // tile rect, never fights a player's own subsequent scroll.
    if (!isDesktop && scrollRef.current) {
      const el = scrollRef.current
      const { x, y } = tileScreen(nextIdx)
      if (x < el.scrollLeft) el.scrollLeft = x
      else if (x + tile > el.scrollLeft + el.clientWidth) el.scrollLeft = x + tile - el.clientWidth
      if (y < el.scrollTop) el.scrollTop = y
      else if (y + tile > el.scrollTop + el.clientHeight) el.scrollTop = y + tile - el.clientHeight
    }
  }

  // DESKTOP: press-and-drag paints the claim-line directly (whole board is
  // always visible, so no scroll/pan is ever needed).
  const onPointerDownDesktop = (e: React.PointerEvent) => {
    if (!interactive) return
    const p = localPoint(e)
    paintingRef.current = true
    const idx = hitTest(p.x, p.y)
    if (idx !== null) {
      maybeStartPress(idx)
      onToggleTile(idx)
    }
    draw()
  }
  const onPointerMoveDesktop = (e: React.PointerEvent) => {
    if (!interactive || !paintingRef.current) return
    const p = localPoint(e)
    const idx = hitTest(p.x, p.y)
    if (idx !== null) {
      maybeStartPress(idx)
      onPaintTile(idx)
    }
  }
  const endPointerDesktop = () => {
    paintingRef.current = false
  }

  // MOBILE/narrow: a genuine TAP (pointerdown→pointerup under
  // TAP_MOVE_THRESHOLD_PX) toggles a tile; any real drag is a native pan
  // scroll (`touchAction:'pan-x pan-y'` on the canvas lets the browser take
  // the gesture over — it delivers `pointercancel`, not a large-delta
  // pointerup, so no hand-rolled distance-tracking on every move is needed).
  const onPointerDownMobile = (e: React.PointerEvent) => {
    if (!interactive) return
    const p = localPoint(e)
    tapStartRef.current = { x: p.x, y: p.y }
  }
  const onPointerUpMobile = (e: React.PointerEvent) => {
    const start = tapStartRef.current
    tapStartRef.current = null
    if (!interactive || !start) return
    const p = localPoint(e)
    const dist = Math.hypot(p.x - start.x, p.y - start.y)
    if (dist > TAP_MOVE_THRESHOLD_PX) return // a real drag/pan, not a tap
    const idx = hitTest(p.x, p.y)
    if (idx !== null) {
      maybeStartPress(idx)
      onToggleTile(idx)
    }
  }
  const cancelTapMobile = () => {
    tapStartRef.current = null
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
      {isDesktop ? (
        <div style={{ position: 'relative', width: dims.w, height: dims.h }}>
          <canvas
            ref={canvasRef}
            className="assayFocusable"
            role="application"
            aria-label={
              interactive
                ? `Abyss floor board, ${GRID_DIM} by ${GRID_DIM} ducats. Arrow keys move the cursor, Space or Enter marks or unmarks a ducat for the claim line.`
                : `Abyss floor board, ${GRID_DIM} by ${GRID_DIM} ducats.`
            }
            tabIndex={interactive ? 0 : -1}
            style={{
              width: dims.w,
              height: dims.h,
              borderRadius: 8,
              touchAction: 'none',
              cursor: interactive ? 'crosshair' : 'default',
              boxShadow: 'inset 0 0 0 2px #1a1f26, inset 0 0 24px rgba(0,0,0,0.6)',
            }}
            onPointerDown={onPointerDownDesktop}
            onPointerMove={onPointerMoveDesktop}
            onPointerUp={endPointerDesktop}
            onPointerLeave={endPointerDesktop}
            onPointerCancel={endPointerDesktop}
            onKeyDown={onKeyDownBoard}
            onFocus={() => setHasFocus(true)}
            onBlur={() => setHasFocus(false)}
          />
          {/* Focus-ring fallback (independent accessibility-qa re-verify,
              2026-07-04, round 2): a `:focus-visible` CSS rule using inset
              `box-shadow` was the round-1 fix for the outline getting
              clipped by `overflow:hidden` ancestors — proven INERT by an
              isolated repro (a plain `<canvas>` + opaque fill + identical
              inset box-shadow renders NOTHING; box-shadow does not paint
              above a canvas element's own bitmap, inset or not). A real
              sibling `<div>` overlay, sized and positioned to exactly match
              the canvas, does what the canvas's own CSS never could — it's
              a normal DOM box painting a normal CSS border, not competing
              with the canvas's bitmap at all. Gated on the same `hasFocus`
              state the in-canvas keyboard cursor already uses (not a bare
              `:focus-visible` match — kept as one consistent focus signal
              rather than two independently-computed ones). `pointerEvents:
              'none'` so it never intercepts a pointer/paint gesture. */}
          {hasFocus && interactive && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 8,
                border: '3px solid #f0b542',
                boxShadow: '0 0 0 2px rgba(240,181,66,0.35)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      ) : (
        <div style={{ position: 'relative', width: '100%', maxWidth: viewportBoxPx, height: viewportBoxPx }}>
          <div
            ref={scrollRef}
            className="assayBoardScroll"
            style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'auto',
              borderRadius: 8,
              WebkitOverflowScrolling: 'touch',
              // B5 — themed thin gold-brown scrollbars (Firefox; WebKit via the
              // `.assayBoardScroll::-webkit-scrollbar` rule in ASSAY_KEYFRAMES),
              // so the native grey OS bars don't read off-theme over the gold
              // board. Does not affect the pan gesture.
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(166,124,62,0.7) rgba(3,9,15,0.5)',
              boxShadow: 'inset 0 0 0 2px #1a1f26, inset 0 0 24px rgba(0,0,0,0.6)',
            }}
          >
            <canvas
              ref={canvasRef}
              className="assayFocusable"
              role="application"
              aria-label={
                interactive
                  ? `Abyss floor board, ${GRID_DIM} by ${GRID_DIM} ducats. Arrow keys move the cursor, Space or Enter marks or unmarks a ducat for the claim line.`
                  : `Abyss floor board, ${GRID_DIM} by ${GRID_DIM} ducats.`
              }
              tabIndex={interactive ? 0 : -1}
              style={{
                width: dims.w,
                height: dims.h,
                display: 'block',
                touchAction: 'pan-x pan-y',
                cursor: interactive ? 'pointer' : 'default',
              }}
              onPointerDown={onPointerDownMobile}
              onPointerUp={onPointerUpMobile}
              onPointerCancel={cancelTapMobile}
              onPointerLeave={cancelTapMobile}
              onKeyDown={onKeyDownBoard}
              onFocus={() => setHasFocus(true)}
              onBlur={() => setHasFocus(false)}
            />
          </div>
          {/* Scroll-edge fade (final polish pass, autisk SHOULD — the
              right-column/bottom-row coins were hard-clipping against the
              rounded scroll-panel corner). A plain 4-side CSS gradient
              scrim, not a mask-image — sits OUTSIDE the scrollable element
              (a sibling, not a child) so it stays pinned to the viewport
              edges instead of scrolling away with the content; tinted to
              the board's own dark field (`COL.boardBg`) so coins recede
              into it rather than vanishing against a mismatched color. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 8,
              pointerEvents: 'none',
              background: [
                `linear-gradient(to right, ${COL.boardBg}, transparent ${MOBILE_EDGE_FADE_PX}px)`,
                `linear-gradient(to left, ${COL.boardBg}, transparent ${MOBILE_EDGE_FADE_PX}px)`,
                `linear-gradient(to bottom, ${COL.boardBg}, transparent ${MOBILE_EDGE_FADE_PX}px)`,
                `linear-gradient(to top, ${COL.boardBg}, transparent ${MOBILE_EDGE_FADE_PX}px)`,
              ].join(','),
            }}
          />
          {/* Focus-ring fallback — same reasoning as the desktop branch's own
              sibling-overlay comment above (inset box-shadow on a canvas is
              inert, proven by an isolated repro). Sized to the VIEWPORT
              window (this outer wrapper), not the full scrollable canvas —
              on mobile most of the 460x460 board is scrolled out of view at
              any moment, so the ring should mark "the board viewport has
              focus," not draw a mostly-offscreen rectangle around content
              the player can't currently see. */}
          {hasFocus && interactive && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 8,
                border: '3px solid #f0b542',
                boxShadow: '0 0 0 2px rgba(240,181,66,0.35)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

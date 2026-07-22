/**
 * AUTOMAT — the machine itself (Canvas2D, per-frame layer).
 *
 * Draws the porcelain vending machine from Tim's reference set
 * (`input/vending/vending1.jpg` register: white gacha cabinet, cyan neon
 * header, glass front with shelved packs, dispense tray) and choreographs the
 * physical vend per pack inside the provider's VEND_STEP_MS window:
 *
 *   coil turn (260ms ease-in-out anticipation)
 *   → pack tips + free-falls (accelerating, slight tumble)
 *   → tray landing (squash-and-rebound impact + flap swing)
 *
 * Discipline (swoobz-canvas2d-mechanic): ONE rAF loop started in ONE effect;
 * all animation state lives in refs (never per-frame React state); props are
 * mirrored into refs so the loop reads stable current values; DPR-scaled
 * backing store; cleanup cancels the rAF. Idle aliveness is limited to a slow
 * neon-breathing glow (~0.05Hz) + a faint glass sheen drift — no particles.
 *
 * RG-C5: all timings/geometry are module consts. A GOLD pack differs by
 * outcome CLASS only (gold wrap + fixed glow) — identical for 5× and 100×.
 * prefers-reduced-motion: the drop physics collapse to a simple fade-in at the
 * tray; the neon breathing freezes at its mean.
 */
import { useEffect, useRef } from 'react'
import { GOLD_ONE_IN_BY_TIER } from './vendingMath'
import type { VendingTierId } from './vendingMath'
import type { PackResult } from './vendingProvider'

// ── Logical geometry (module consts) ────────────────────────────────────────
const W = 520
const H = 760
/** Machine body. */
const BODY = { x: 42, y: 18, w: 436, h: 700, r: 20 } as const
/** Neon header strip. */
const HEAD = { x: 66, y: 40, w: 388, h: 58 } as const
/** Glass window. */
const GLASS = { x: 74, y: 118, w: 372, h: 400 } as const
/** Four shelves × five slots — ALL 20 slots are live (MAX_PACKS = 20 = one
 *  full machine). Slots beyond the purchase count read as dimmed stock. */
const SHELF_YS = [208, 308, 408, 508] as const
const SLOT_XS = [118, 186, 254, 322, 390] as const
const TOTAL_SLOTS = SHELF_YS.length * SLOT_XS.length
const LIVE_SLOTS = TOTAL_SLOTS
const PACK_W = 46
const PACK_H = 58
/** Dispense tray mouth — a LIT BAY (machnicsdrop ref): the pack lands and
 *  rests INSIDE this opening, never outside the machine. */
const TRAY = { x: 150, y: 628, w: 220, h: 64 } as const

// ── Slot-selection overlay (OPTIONAL feature) geometry (module consts) ───────
// A DOM hit-cell sits over every glass pack slot. Codes: shelves A-D (top→
// bottom) × columns 1-5 → A1..A5, B1..B5, C1..C5, D1..D5. Cells are sized to
// the slot pitch (col 68px / row 100px) so they stay >=44px on the smallest
// portrait render; the code tag + glow are drawn in DOM, never baked into art.
const SLOT_CELL_W = 68
const SLOT_CELL_H = 92
/** On-select bloom duration (RG-C5 module const — identical for every slot,
 *  tier value, price and streak; keyed only to the select gesture). */
const SLOT_BLOOM_MS = 240
/** Ambient breathe period for the steady selected glow. All selected cells run
 *  on ONE shared phase clock (negative animation-delay from a common epoch —
 *  animation-counting law: no unsynced oscillators). Opacity-only (composited,
 *  cheap); reduced-motion shows the static glow instead. */
const SLOT_BREATHE_MS = 2600
const SHELF_LETTERS = ['A', 'B', 'C', 'D'] as const
/** Slot index (0..19, shelf-major) → punch-code tag (A1..D5). */
function slotCode(slot: number): string {
  return `${SHELF_LETTERS[Math.floor(slot / 5)] ?? '?'}${(slot % 5) + 1}`
}

// ── Vend choreography timings (module consts, RG-C5) ────────────────────────
// Drop path per the machnicsdrop reference video: coil turn → the pack falls
// STRAIGHT DOWN inside the glass chamber (clipped — it vanishes behind the
// glass bottom edge) → a hidden beat travelling through the machine guts →
// it drops INTO the lit bay and settles there.
const COIL_MS = 380
const GLASS_FALL_MS = 240
const HIDDEN_MS = 90
const TRAY_FALL_MS = 170
const SQUASH_MS = 90
const REBOUND_MS = 110
/** Pile poses inside the bay, indexed by pack order: landed packs STACK UP
 *  (heap of boosters lying at angles, four layers deep for a full 20-pack
 *  machine) and persist until the round is collected. Deterministic — same
 *  buy count, same pile. dx/dy are offsets from the bay center; rot in deg. */
const PILE_POSES: readonly { dx: number; dy: number; rot: number }[] = [
  { dx: -58, dy: 13, rot: 82 },
  { dx: 22, dy: 15, rot: -76 },
  { dx: 74, dy: 11, rot: 68 },
  { dx: -16, dy: 6, rot: -58 },
  { dx: -62, dy: -2, rot: -78 },
  { dx: 42, dy: -3, rot: 84 },
  { dx: -4, dy: -9, rot: -68 },
  { dx: 28, dy: -15, rot: 62 },
  { dx: -38, dy: -17, rot: -84 },
  { dx: 6, dy: -21, rot: 74 },
  { dx: -76, dy: 8, rot: -64 },
  { dx: 58, dy: 12, rot: 78 },
  { dx: -28, dy: 14, rot: 70 },
  { dx: 12, dy: -2, rot: -82 },
  { dx: -50, dy: -12, rot: 66 },
  { dx: 66, dy: -8, rot: -70 },
  { dx: 34, dy: -20, rot: -60 },
  { dx: -12, dy: -24, rot: 80 },
  { dx: -60, dy: -22, rot: -72 },
  { dx: 48, dy: -24, rot: 64 },
]
// Header marquee: the SWOOBZ wordmark scrolls right→left through the neon
// band (LED-ticker read). Module consts (RG-C5) — constant speed, state-blind.
const LOGO_AR = 2745.91 / 444.31
const LOGO_H = 30
const LOGO_GAP = 300
const MARQUEE_PX_S = 34
/** When the pack hits the pile, relative to the drop start. Landed packs
 *  never expire — they stay in the pile until the round resets. */
const LANDING_AT_MS = COIL_MS + GLASS_FALL_MS + HIDDEN_MS + TRAY_FALL_MS
/** Reduced-motion: simple fade-in at the pile spot. */
const REDUCED_FADE_MS = 420

// ── Palette (rule of three: cyan = player/neon, gold = value, slate = pack) ─
// Doodle-skin pass (AUTOMAT-DOODLE-SKIN-SPEC.md): warm porcelain shell, coal
// ink, registry volt cyan (#00F0FF — the hex pulse/vault/oo_fisher ship on).
const COL = {
  bodyTop: '#F2EEE4',
  bodyBottom: '#C9C2B0',
  bodyEdge: '#C2B8A6',
  headerBg: '#0b0e13',
  neon: '#00F0FF',
  ink: '#0D0F15',
  glassBg: '#10141b',
  glassEdge: '#2a313c',
  shelf: '#8f98a4',
  coil: '#aab3bf',
  packBody: '#2b5e74',
  packEdge: '#1d4356',
  packEmblem: '#f0b542',
  goldBody: '#f0b542',
  goldEdge: '#b07f22',
  goldEmblem: '#7a5510',
  trayBg: '#07090d',
  trayLip: '#9aa3af',
  flapTop: '#d7dce3',
  flapBottom: '#a7b0bc',
  lipTop: '#c9d0d9',
  lipBottom: '#8f97a3',
  floorShadow: 'rgba(0,0,0,0.35)',
} as const

// ── Doodle layer (Shantell-Martin register: ONE hand, coal outline marks) ───
// 8-mark abstract library, seeded wobble, baked ONCE to an offscreen canvas at
// mount → one drawImage per frame. Marks live only on porcelain (side rails,
// header collar, skirt) — glass/tray/panel/fall-corridor stay clean.

/** Deterministic PRNG (same convention as the sibling games' sprite caches). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type MarkType =
  | 'coil-loop'
  | 'hex-pip'
  | 'spark-burst'
  | 'orbit-ring'
  | 'sparkle-diamond'
  | 'drop-arc'
  | 'stack-tally'
  | 'loop-knot'

interface DoodleMark {
  x: number
  y: number
  t: MarkType
  s: number
  /** rotation, degrees */
  r: number
  a: number
  /** band tag — 'glassFlank' marks drop out on small renders (mobile rule). */
  band: 'collar' | 'headerFlank' | 'glassFlank' | 'mechFlank' | 'trayFlank' | 'skirt'
}

/** Fixed doodle placement table — deterministic, never re-randomized.
 *  NO-MURAL FALLBACK ONLY: once a tier's mural wrap loads, bakeDoodleLayer
 *  takes the mural branch and this table is not drawn. */
const DOODLE_MARKS: readonly DoodleMark[] = [
  // RAIL_L (porcelain strip x:42-74, center ~58)
  { x: 55, y: 44, t: 'spark-burst', s: 0.9, r: -10, a: 0.82, band: 'headerFlank' },
  { x: 61, y: 76, t: 'hex-pip', s: 0.9, r: 14, a: 0.82, band: 'headerFlank' },
  { x: 56, y: 106, t: 'orbit-ring', s: 0.9, r: -6, a: 0.82, band: 'headerFlank' },
  { x: 54, y: 225, t: 'sparkle-diamond', s: 0.7, r: 8, a: 0.82, band: 'glassFlank' },
  { x: 61, y: 392, t: 'drop-arc', s: 0.7, r: -14, a: 0.82, band: 'glassFlank' },
  { x: 57, y: 556, t: 'coil-loop', s: 0.9, r: 4, a: 0.82, band: 'mechFlank' },
  { x: 54, y: 602, t: 'stack-tally', s: 0.9, r: -8, a: 0.82, band: 'mechFlank' },
  { x: 59, y: 655, t: 'sparkle-diamond', s: 1, r: 12, a: 0.82, band: 'trayFlank' },
  { x: 56, y: 698, t: 'hex-pip', s: 0.9, r: -4, a: 0.82, band: 'trayFlank' },
  // RAIL_R (porcelain strip x:446-478, center ~462)
  { x: 465, y: 44, t: 'orbit-ring', s: 0.9, r: 10, a: 0.82, band: 'headerFlank' },
  { x: 459, y: 76, t: 'coil-loop', s: 0.9, r: -14, a: 0.82, band: 'headerFlank' },
  { x: 463, y: 106, t: 'hex-pip', s: 0.9, r: 6, a: 0.82, band: 'headerFlank' },
  { x: 466, y: 225, t: 'stack-tally', s: 0.7, r: -8, a: 0.82, band: 'glassFlank' },
  { x: 460, y: 392, t: 'sparkle-diamond', s: 0.7, r: 14, a: 0.82, band: 'glassFlank' },
  { x: 464, y: 556, t: 'drop-arc', s: 0.9, r: -4, a: 0.82, band: 'mechFlank' },
  { x: 461, y: 602, t: 'spark-burst', s: 0.9, r: 8, a: 0.82, band: 'mechFlank' },
  { x: 458, y: 655, t: 'coil-loop', s: 1, r: -12, a: 0.82, band: 'trayFlank' },
  { x: 462, y: 698, t: 'orbit-ring', s: 0.9, r: 4, a: 0.82, band: 'trayFlank' },
  // Header collar (thin strips above/below the neon capsule; dimmer)
  { x: 100, y: 29, t: 'loop-knot', s: 0.75, r: -8, a: 0.6, band: 'collar' },
  { x: 420, y: 30, t: 'hex-pip', s: 0.75, r: 12, a: 0.6, band: 'collar' },
  { x: 110, y: 108, t: 'drop-arc', s: 0.75, r: 6, a: 0.6, band: 'collar' },
  { x: 410, y: 108, t: 'spark-burst', s: 0.75, r: -10, a: 0.6, band: 'collar' },
  // Tray flanks (porcelain beside the tray mouth, clear of the fall corridor)
  { x: 104, y: 652, t: 'sparkle-diamond', s: 1, r: -8, a: 0.82, band: 'trayFlank' },
  { x: 416, y: 652, t: 'spark-burst', s: 1, r: 6, a: 0.82, band: 'trayFlank' },
  // Skirt (under the tray, flanking the TAKE YOUR PACKS label)
  { x: 150, y: 705, t: 'stack-tally', s: 0.9, r: -6, a: 0.82, band: 'skirt' },
  { x: 370, y: 705, t: 'drop-arc', s: 0.9, r: 10, a: 0.82, band: 'skirt' },
  { x: 92, y: 703, t: 'hex-pip', s: 0.7, r: 8, a: 0.7, band: 'skirt' },
  { x: 428, y: 703, t: 'coil-loop', s: 0.7, r: -12, a: 0.7, band: 'skirt' },
  // Mid-strip (porcelain between glass bottom 518 and the info panel 548 —
  // the fall corridor has converged to x≈254-266 here, edges are safe)
  { x: 104, y: 533, t: 'spark-burst', s: 0.8, r: 12, a: 0.75, band: 'mechFlank' },
  { x: 140, y: 534, t: 'loop-knot', s: 0.7, r: -6, a: 0.75, band: 'mechFlank' },
  { x: 382, y: 533, t: 'orbit-ring', s: 0.8, r: 6, a: 0.75, band: 'mechFlank' },
  { x: 418, y: 534, t: 'stack-tally', s: 0.8, r: -10, a: 0.75, band: 'mechFlank' },
]

/** Hand-wobbled polyline: per-anchor jitter ±0.8px, quadratic midpoint bulge
 *  ±1.5px perpendicular — the "hand can't draw a straight line" tell. */
function wobblyPath(
  g: CanvasRenderingContext2D,
  rnd: () => number,
  pts: readonly (readonly [number, number])[],
  close = false,
): void {
  const j = pts.map(([x, y]) => [x + (rnd() * 2 - 1) * 0.8, y + (rnd() * 2 - 1) * 0.8] as const)
  g.beginPath()
  g.moveTo(j[0]![0], j[0]![1])
  for (let i = 1; i < j.length; i++) {
    const [ax, ay] = j[i - 1]!
    const [bx, by] = j[i]!
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy) || 1
    const bulge = (rnd() * 2 - 1) * 1.5
    g.quadraticCurveTo((ax + bx) / 2 + (-dy / len) * bulge, (ay + by) / 2 + (dx / len) * bulge, bx, by)
  }
  if (close) g.closePath()
}

function circlePts(r: number, n: number, a0 = 0, a1 = Math.PI * 2): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return out
}

/** Draw one mark at local origin (≤15px bbox at s=1). Coal ink, outline-only —
 *  except sparkle-diamond, the ONE controlled gold-fill exception (the literal
 *  vault-altseason rhyme, per the locked spec). */
function drawMark(g: CanvasRenderingContext2D, t: MarkType, rnd: () => number): void {
  g.strokeStyle = COL.ink
  g.lineWidth = 2.2
  g.lineJoin = 'round'
  g.lineCap = 'round'
  switch (t) {
    case 'coil-loop': {
      const pts: (readonly [number, number])[] = []
      for (let i = 0; i <= 22; i++) {
        const th = (i / 22) * Math.PI * 2 * 2.5
        const r = 2 + (5 * th) / (Math.PI * 2 * 2.5)
        pts.push([Math.cos(th) * r, Math.sin(th) * r])
      }
      wobblyPath(g, rnd, pts)
      g.stroke()
      break
    }
    case 'hex-pip': {
      const pts: (readonly [number, number])[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6
        pts.push([Math.cos(a) * 5, Math.sin(a) * 5])
      }
      wobblyPath(g, rnd, pts, true)
      g.stroke()
      wobblyPath(g, rnd, [
        [5, -3],
        [7.5, -5],
      ])
      g.stroke()
      break
    }
    case 'spark-burst': {
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
        const r0 = 2
        const r1 = i % 2 === 0 ? 7 : 4.5
        wobblyPath(g, rnd, [
          [Math.cos(a) * r0, Math.sin(a) * r0],
          [Math.cos(a) * r1, Math.sin(a) * r1],
        ])
        g.stroke()
      }
      break
    }
    case 'orbit-ring': {
      wobblyPath(g, rnd, circlePts(4, 10), true)
      g.stroke()
      wobblyPath(g, rnd, circlePts(6.5, 12), true)
      g.stroke()
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3 + 0.5
        wobblyPath(g, rnd, [
          [Math.cos(a) * 3, Math.sin(a) * 3],
          [Math.cos(a) * 8, Math.sin(a) * 8],
        ])
        g.stroke()
      }
      break
    }
    case 'sparkle-diamond': {
      // Gold-filled 4-point twinkle + coal outline (the vault rhyme).
      wobblyPath(
        g,
        rnd,
        [
          [0, -7],
          [1.6, -1.6],
          [5.5, 0],
          [1.6, 1.6],
          [0, 7],
          [-1.6, 1.6],
          [-5.5, 0],
          [-1.6, -1.6],
        ],
        true,
      )
      g.fillStyle = COL.goldBody
      g.fill()
      g.lineWidth = 1.8
      g.stroke()
      break
    }
    case 'drop-arc': {
      wobblyPath(g, rnd, circlePts(6, 9, -Math.PI * 0.7, Math.PI * 0.45))
      g.stroke()
      wobblyPath(g, rnd, [
        [Math.cos(Math.PI * 0.45) * 6, Math.sin(Math.PI * 0.45) * 6],
        [Math.cos(Math.PI * 0.45) * 6 - 2.5, Math.sin(Math.PI * 0.45) * 6 + 1.5],
      ])
      g.stroke()
      break
    }
    case 'stack-tally': {
      for (let i = 0; i < 3; i++) {
        const x = -3.5 + i * 3.5
        wobblyPath(g, rnd, [
          [x, -4],
          [x, 4],
        ])
        g.stroke()
      }
      wobblyPath(g, rnd, [
        [-6, 4.5],
        [6, -4.5],
      ])
      g.stroke()
      break
    }
    case 'loop-knot': {
      const pts: (readonly [number, number])[] = []
      for (let i = 0; i <= 26; i++) {
        const th = (i / 26) * Math.PI * 2
        pts.push([Math.sin(th) * 6.5, Math.sin(th) * Math.cos(th) * 7])
      }
      wobblyPath(g, rnd, pts, true)
      g.stroke()
      break
    }
  }
}

/** Rects the porcelain texture must not touch (glass, header, panel, tray). */
const TEXTURE_HOLES: readonly (readonly [number, number, number, number])[] = [
  [GLASS.x - 4, GLASS.y - 4, GLASS.w + 8, GLASS.h + 8],
  [HEAD.x - 4, HEAD.y - 4, HEAD.w + 8, HEAD.h + 8],
  [BODY.x + 20, 544, BODY.w - 40, 70], // info plaque
  [TRAY.x - 6, TRAY.y - 8, TRAY.w + 12, TRAY.h + 36], // tray + label plate
]

/** Bake the whole static cabinet skin once. With a loaded `mural` (the
 *  generated wrap that matches the pack art — the ref's one-brand system) the
 *  shell becomes a full-bleed mural wrap + seams/screws; otherwise porcelain
 *  paper-grain + the doodle marks. `thin` drops the glassFlank band (mobile
 *  rule). Everything seeded/static — never re-randomized. */
function bakeDoodleLayer(dpr: number, thin: boolean, mural: HTMLImageElement | null = null): HTMLCanvasElement {
  const off = document.createElement('canvas')
  off.width = W * dpr
  off.height = H * dpr
  const g = off.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)

  if (mural) {
    // ── Mural wrap: cover-fit, clipped 3px inside the body so the coal
    //    structure outline stays visible; seams + screws keep the machine
    //    reading as built hardware, not a flat poster. ──
    g.save()
    roundRect(g, BODY.x + 3, BODY.y + 3, BODY.w - 6, BODY.h - 6, BODY.r - 3)
    g.clip()
    const bw = BODY.w - 6
    const bh = BODY.h - 6
    const r = bw / bh
    let sx = 0
    let sy = 0
    let sw = mural.naturalWidth
    let sh = mural.naturalHeight
    if (sw / sh > r) {
      sw = sh * r
      sx = (mural.naturalWidth - sw) / 2
    } else {
      sh = sw / r
      sy = (mural.naturalHeight - sh) / 2
    }
    g.drawImage(mural, sx, sy, sw, sh, BODY.x + 3, BODY.y + 3, bw, bh)
    // Soften the art under the furniture zones so glass/plaque/tray pop.
    g.fillStyle = 'rgba(242,238,228,0.16)'
    g.fillRect(BODY.x, GLASS.y - 8, BODY.w, GLASS.h + 16)
    for (const seamY of [113, 541, 620]) {
      g.globalAlpha = 0.18
      g.fillStyle = COL.ink
      g.fillRect(BODY.x + 10, seamY, BODY.w - 20, 1)
      g.globalAlpha = 0.14
      g.fillStyle = '#ffffff'
      g.fillRect(BODY.x + 10, seamY + 1, BODY.w - 20, 1)
    }
    g.globalAlpha = 1
    const bottomShade = g.createLinearGradient(0, BODY.y + BODY.h - 42, 0, BODY.y + BODY.h)
    bottomShade.addColorStop(0, 'rgba(0,0,0,0)')
    bottomShade.addColorStop(1, 'rgba(0,0,0,0.2)')
    g.fillStyle = bottomShade
    g.fillRect(BODY.x, BODY.y + BODY.h - 42, BODY.w, 42)
    g.restore()
    const screwRnd = mulberry32(777)
    for (const [sx2, sy2] of [
      [BODY.x + 12, BODY.y + 14],
      [BODY.x + BODY.w - 12, BODY.y + 14],
      [BODY.x + 12, BODY.y + BODY.h - 14],
      [BODY.x + BODY.w - 12, BODY.y + BODY.h - 14],
    ] as const) {
      g.save()
      g.translate(sx2, sy2)
      g.rotate(screwRnd() * Math.PI)
      g.globalAlpha = 0.55
      g.strokeStyle = COL.ink
      g.lineWidth = 1.2
      g.beginPath()
      g.arc(0, 0, 2.6, 0, Math.PI * 2)
      g.stroke()
      g.beginPath()
      g.moveTo(-1.8, 0)
      g.lineTo(1.8, 0)
      g.stroke()
      g.restore()
    }
    return off
  }

  // ── Porcelain texture (clipped to the body, holes cut for furniture) ──
  g.save()
  roundRect(g, BODY.x, BODY.y, BODY.w, BODY.h, BODY.r)
  g.clip()
  const inHole = (x: number, y: number): boolean =>
    TEXTURE_HOLES.some(([hx, hy, hw, hh]) => x >= hx && x <= hx + hw && y >= hy && y <= hy + hh)
  // Paper-grain speckle: two seeded passes (fine + coarse), ink at whisper alpha.
  const grain = mulberry32(4242)
  g.fillStyle = COL.ink
  for (let i = 0; i < 420; i++) {
    const x = BODY.x + grain() * BODY.w
    const y = BODY.y + grain() * BODY.h
    if (inHole(x, y)) continue
    g.globalAlpha = 0.025 + grain() * 0.03
    const r = 0.4 + grain() * 0.8
    g.fillRect(x, y, r, r)
  }
  for (let i = 0; i < 46; i++) {
    const x = BODY.x + grain() * BODY.w
    const y = BODY.y + grain() * BODY.h
    if (inHole(x, y)) continue
    g.globalAlpha = 0.03 + grain() * 0.03
    g.beginPath()
    g.arc(x, y, 1 + grain() * 1.4, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  // Panel seams: embossed grooves (ink line + light line under it).
  for (const seamY of [113, 541, 620]) {
    g.globalAlpha = 0.12
    g.fillStyle = COL.ink
    g.fillRect(BODY.x + 10, seamY, BODY.w - 20, 1)
    g.globalAlpha = 0.18
    g.fillStyle = '#ffffff'
    g.fillRect(BODY.x + 10, seamY + 1, BODY.w - 20, 1)
  }
  g.globalAlpha = 1
  // Corner screws (slotted, in the rails).
  const screwRnd = mulberry32(777)
  for (const [sx, sy] of [
    [BODY.x + 12, BODY.y + 14],
    [BODY.x + BODY.w - 12, BODY.y + 14],
    [BODY.x + 12, BODY.y + BODY.h - 14],
    [BODY.x + BODY.w - 12, BODY.y + BODY.h - 14],
  ] as const) {
    g.save()
    g.translate(sx, sy)
    g.rotate(screwRnd() * Math.PI)
    g.globalAlpha = 0.45
    g.strokeStyle = COL.ink
    g.lineWidth = 1.2
    g.beginPath()
    g.arc(0, 0, 2.6, 0, Math.PI * 2)
    g.stroke()
    g.beginPath()
    g.moveTo(-1.8, 0)
    g.lineTo(1.8, 0)
    g.stroke()
    g.restore()
  }
  // Edge shading: left porcelain highlight + inner bottom contact shade.
  g.globalAlpha = 1
  g.fillStyle = 'rgba(255,255,255,0.35)'
  g.fillRect(BODY.x + 5, BODY.y + 10, 1.5, BODY.h - 20)
  const bottomShade = g.createLinearGradient(0, BODY.y + BODY.h - 42, 0, BODY.y + BODY.h)
  bottomShade.addColorStop(0, 'rgba(0,0,0,0)')
  bottomShade.addColorStop(1, 'rgba(0,0,0,0.14)')
  g.fillStyle = bottomShade
  g.fillRect(BODY.x, BODY.y + BODY.h - 42, BODY.w, 42)
  g.restore()

  // ── Doodle marks (on top of the grain) ──
  DOODLE_MARKS.forEach((m, i) => {
    if (thin && m.band === 'glassFlank') return
    const rnd = mulberry32(i * 97 + 13)
    g.save()
    g.translate(m.x, m.y)
    g.rotate((m.r * Math.PI) / 180)
    g.scale(m.s, m.s)
    g.globalAlpha = m.a
    drawMark(g, m.t, rnd)
    g.restore()
  })
  return off
}

interface DropAnim {
  startedAt: number
  cls: 'standard' | 'gold'
  slot: number // 0..TOTAL_SLOTS-1 → shelf = floor(slot/5), col = slot%5
}

export interface VendingMachineCanvasProps {
  phaseKind: 'ready' | 'vending' | 'settled'
  dispensed: readonly PackResult[]
  packCount: number
  reducedMotion: boolean
  /** Which machine on the turntable this canvas IS. Each machine has its own
   *  shell palette + mural wrap; glass/tray hardware is shared. */
  tier: VendingTierId
  /** True for the dimmed background machines on the turntable: rendering is
   *  throttled to ~3fps (they only idle) so three mounted canvases stay cheap. */
  backdrop?: boolean
  /** OPTIONAL slot-picking (pure presentation): packIndex → physical slot the
   *  drop choreography vends from. Frozen at VEND time by the Experience; the
   *  ROLLS/order/receipt are untouched — this only re-routes which glass slot a
   *  pack visually emerges from. Undefined → today's default (packIndex order). */
  slotOrder?: readonly number[]
  /** Currently selected slots (selection order), for the interactive front
   *  machine only — drives the code-tag glow. Undefined on backdrop machines. */
  selectedSlots?: readonly number[]
  /** Toggle a slot's selection. Provided ONLY for the interactive front
   *  machine; when absent the overlay does not render (backdrop machines). */
  onToggleSlot?: (slot: number) => void
  /** Whether toggles are live (ready phase). Inert (pointer-events off) mid-
   *  vend / during overlays — matching the armTierReducer no-op discipline. */
  slotSelectEnabled?: boolean
  /** Tier LED color for the steady selection glow (difficulty identity color,
   *  never value/streak keyed — RG-C5). */
  ledColor?: string
}

/** Per-machine shells (Tim: each machine is its OWN machine). */
const TIER_SKINS: Readonly<
  Record<VendingTierId, { bodyTop: string; bodyBottom: string; bodyEdge: string; muralSrc: string }>
> = {
  easy: { bodyTop: '#F2EEE4', bodyBottom: '#C9C2B0', bodyEdge: '#C2B8A6', muralSrc: '/skin/mural.png' },
  medium: { bodyTop: '#c3ccd8', bodyBottom: '#8d99a8', bodyEdge: '#768494', muralSrc: '/skin/mural-storm.png' },
  hard: { bodyTop: '#33373f', bodyBottom: '#1a1d23', bodyEdge: '#454a54', muralSrc: '/skin/mural-obsidian.png' },
}

// ── Easing helpers ──────────────────────────────────────────────────────────
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const easeOutBack = (t: number): number => {
  const c = 1.70158
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)

function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** One pack pouch, centered at (cx, cy). With a loaded wrap `sprite` (the
 *  generated art that matches the cabinet mural — the ref's one-brand trick)
 *  the pouch wears the art; otherwise the procedural vector pouch renders. */
function drawPack(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cls: 'standard' | 'gold',
  scaleX = 1,
  scaleY = 1,
  rot = 0,
  alpha = 1,
  glow = 0,
  sprite: HTMLImageElement | null = null,
): void {
  g.save()
  g.translate(cx, cy)
  g.rotate(rot)
  g.scale(scaleX, scaleY)
  g.globalAlpha = alpha
  if (glow > 0) {
    g.shadowColor = COL.goldBody
    g.shadowBlur = 18 * glow
  }
  const edge = cls === 'gold' ? COL.goldEdge : COL.packEdge
  if (sprite) {
    // Real booster cutout (alpha-trimmed): the sprite IS the pack silhouette —
    // crimped seal lips top/bottom included. Drawn full, no clip, no stroke
    // (the art carries its own edges); the gold glow follows the image alpha.
    const dh = PACK_H * 1.14
    const dw = dh * (sprite.naturalWidth / sprite.naturalHeight)
    g.drawImage(sprite, -dw / 2, -dh / 2, dw, dh)
    g.restore()
    return
  }
  const body = cls === 'gold' ? COL.goldBody : COL.packBody
  const emblem = cls === 'gold' ? COL.goldEmblem : COL.packEmblem
  const grad = g.createLinearGradient(0, -PACK_H / 2, 0, PACK_H / 2)
  grad.addColorStop(0, body)
  grad.addColorStop(1, edge)
  roundRect(g, -PACK_W / 2, -PACK_H / 2, PACK_W, PACK_H, 7)
  g.fillStyle = grad
  g.fill()
  // Ink under-stroke (outline law): every pack joins the cabinet's coal-ink
  // family; the thinner colored rim on top keeps the material identity.
  g.lineWidth = 3
  g.strokeStyle = COL.ink
  g.stroke()
  g.lineWidth = 1.5
  g.strokeStyle = edge
  g.stroke()
  // Crimp seams top/bottom (reads as a foil pouch).
  g.fillStyle = 'rgba(255,255,255,0.18)'
  g.fillRect(-PACK_W / 2 + 3, -PACK_H / 2 + 3, PACK_W - 6, 4)
  g.fillRect(-PACK_W / 2 + 3, PACK_H / 2 - 7, PACK_W - 6, 4)
  // Hex emblem (the beezie-box motif from the reference art).
  g.beginPath()
  const R = 11
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6
    const px = Math.cos(a) * R
    const py = Math.sin(a) * R + 2
    if (i === 0) g.moveTo(px, py)
    else g.lineTo(px, py)
  }
  g.closePath()
  g.lineWidth = 3.5
  g.strokeStyle = COL.ink
  g.stroke()
  g.lineWidth = 2.5
  g.strokeStyle = emblem
  g.stroke()
  g.restore()
}

export function VendingMachineCanvas({
  phaseKind,
  dispensed,
  packCount,
  reducedMotion,
  tier,
  backdrop = false,
  slotOrder,
  selectedSlots,
  onToggleSlot,
  slotSelectEnabled = false,
  ledColor = COL.neon,
}: VendingMachineCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // slotOrder mirrored into a ref so the dispense effect reads the value frozen
  // at VEND time without needing it in the dependency array.
  const slotOrderRef = useRef(slotOrder)
  slotOrderRef.current = slotOrder
  // Props mirrored into refs so the single rAF loop reads current values.
  const propsRef = useRef({ phaseKind, packCount, reducedMotion, tier, backdrop })
  propsRef.current = { phaseKind, packCount, reducedMotion, tier, backdrop }
  const dropsRef = useRef<DropAnim[]>([])
  const seenRef = useRef(0)
  const flapRef = useRef(0) // 0..1 flap swing amount, decays per frame
  /** Slots emptied THIS round — persists after the drop sprite is culled so a
   *  vended slot never regrows its pack mid-round. Cleared on round reset. */
  const emptiedRef = useRef<Set<number>>(new Set())

  // Enqueue a drop sprite for each newly dispensed pack; reset on a new round.
  useEffect(() => {
    if (dispensed.length === 0) {
      dropsRef.current = []
      seenRef.current = 0
      emptiedRef.current = new Set()
      return
    }
    const now = performance.now()
    for (let i = seenRef.current; i < dispensed.length; i++) {
      const p = dispensed[i]!
      // OPTIONAL slot pick: the physical slot this pack drops from. The order
      // is the Experience's frozen presentation map — never the roll (money
      // law). Falls back to today's packIndex order when no picks were made.
      const mapped = slotOrderRef.current?.[p.packIndex]
      const slot = mapped != null ? mapped % TOTAL_SLOTS : p.packIndex % TOTAL_SLOTS
      dropsRef.current.push({ startedAt: now, cls: p.cls, slot })
      emptiedRef.current.add(slot)
    }
    seenRef.current = dispensed.length
  }, [dispensed])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = W * dpr
    canvas.height = H * dpr
    // Cabinet skins: baked per TIER (deterministic), composited as ONE
    // drawImage per frame. Small renders drop the glassFlank band (checked at
    // mount). Each tier's mural wrap hot-swaps in when its image loads; until
    // then the procedural porcelain/doodle skin renders — no blank frames.
    const thinDoodles = window.matchMedia('(max-width: 480px)').matches
    const murals = new Map<VendingTierId, HTMLImageElement>()
    const bakes = new Map<VendingTierId, HTMLCanvasElement>()
    for (const t of ['easy', 'medium', 'hard'] as const) {
      const img = new Image()
      img.onload = () => {
        bakes.delete(t) // rebuild with the mural on next frame
      }
      img.src = TIER_SKINS[t].muralSrc
      murals.set(t, img)
    }
    const getBake = (t: VendingTierId): HTMLCanvasElement => {
      let b = bakes.get(t)
      if (!b) {
        const m = murals.get(t)
        b = bakeDoodleLayer(dpr, thinDoodles, m && m.complete && m.naturalWidth > 0 ? m : null)
        bakes.set(t, b)
      }
      return b
    }
    const packStdImg = new Image()
    packStdImg.src = '/skin/pack-standard-cut.png'
    const packGoldImg = new Image()
    packGoldImg.src = '/skin/pack-gold-cut.png'
    let logoReady = false
    const logoImg = new Image()
    logoImg.onload = () => {
      logoReady = true
    }
    logoImg.src = '/skin/swoobz-logo.svg'
    const readySprite = (img: HTMLImageElement): HTMLImageElement | null =>
      img.complete && img.naturalWidth > 0 ? img : null

    let raf = 0
    let frame = 0
    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      const { phaseKind: phase, packCount: count, reducedMotion: reduced, tier: tierNow, backdrop: bg } = propsRef.current
      // Background turntable machines idle at ~3fps (first frame always draws).
      frame++
      if (bg && frame > 1 && frame % 24 !== 0) return
      const skin = TIER_SKINS[tierNow]
      // Cyan hardware neon on every machine. Same tube, same clock.
      const NEON = COL.neon
      // Background machines are fully static idle: no marquee scroll, frozen
      // neon breath, frozen sheen — they come alive when they reach the front.
      const still = reduced || bg
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, W, H)

      const neonPulse = still ? 0.5 : 0.5 + 0.5 * Math.sin((now / 1000) * 2 * Math.PI * 0.05)

      // Floor shadow.
      g.save()
      g.fillStyle = COL.floorShadow
      g.beginPath()
      g.ellipse(W / 2, BODY.y + BODY.h + 16, BODY.w / 2, 16, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
      // Soft cast shadow behind the cabinet — seats the machine against the
      // room art (WALL template) instead of floating in front of it.
      g.save()
      g.shadowColor = 'rgba(0,0,0,0.5)'
      g.shadowBlur = 26
      g.shadowOffsetY = 14
      g.fillStyle = 'rgba(6,8,11,0.9)'
      roundRect(g, BODY.x, BODY.y, BODY.w, BODY.h, BODY.r)
      g.fill()
      g.restore()

      // Body (coal structure ink under the shell edge — outline law). Shell
      // palette is the armed TIER's machine.
      const bodyGrad = g.createLinearGradient(0, BODY.y, 0, BODY.y + BODY.h)
      bodyGrad.addColorStop(0, skin.bodyTop)
      bodyGrad.addColorStop(1, skin.bodyBottom)
      roundRect(g, BODY.x, BODY.y, BODY.w, BODY.h, BODY.r)
      g.fillStyle = bodyGrad
      g.fill()
      g.lineWidth = 3.5
      g.strokeStyle = COL.ink
      g.stroke()
      g.lineWidth = 2
      g.strokeStyle = skin.bodyEdge
      g.stroke()
      // Side depth strip.
      g.fillStyle = 'rgba(0,0,0,0.07)'
      g.fillRect(BODY.x + BODY.w - 14, BODY.y + 8, 8, BODY.h - 16)

      // Tier skin (baked per tier) — the mural wrap, under all furniture.
      g.drawImage(getBake(tierNow), 0, 0, W, H)

      // Neon header — a mounted TUBE, not just glowing text: coal base ring,
      // volt halo + core on the SAME neonPulse clock, end-caps + brackets.
      roundRect(g, HEAD.x, HEAD.y, HEAD.w, HEAD.h, 10)
      g.fillStyle = COL.headerBg
      g.fill()
      g.save()
      roundRect(g, HEAD.x, HEAD.y, HEAD.w, HEAD.h, 10)
      g.lineWidth = 2
      g.globalAlpha = 0.5
      g.strokeStyle = COL.ink
      g.stroke()
      g.globalAlpha = 0.06 + 0.12 * neonPulse
      g.lineWidth = 10
      g.strokeStyle = NEON
      g.stroke()
      g.globalAlpha = 0.75 + 0.15 * neonPulse
      g.lineWidth = 2
      g.stroke()
      g.restore()
      // Tube end-caps + mounting brackets (hardware neutral, no glow).
      g.save()
      g.fillStyle = NEON
      g.shadowColor = NEON
      g.shadowBlur = 6
      g.beginPath()
      g.arc(HEAD.x + 10, HEAD.y + HEAD.h - 6, 3, 0, Math.PI * 2)
      g.arc(HEAD.x + HEAD.w - 10, HEAD.y + HEAD.h - 6, 3, 0, Math.PI * 2)
      g.fill()
      g.restore()
      g.fillStyle = COL.bodyEdge
      g.fillRect(HEAD.x + HEAD.w * 0.28 - 4, HEAD.y + HEAD.h - 3, 8, 4)
      g.fillRect(HEAD.x + HEAD.w * 0.72 - 4, HEAD.y + HEAD.h - 3, 8, 4)
      // Marquee: the SWOOBZ wordmark rides right→left through the band
      // (clipped, seamless wrap; reduced motion pins it centered). Falls back
      // to the AUTOMAT lettering until the logo loads.
      if (logoReady) {
        g.save()
        roundRect(g, HEAD.x + 8, HEAD.y + 6, HEAD.w - 16, HEAD.h - 12, 8)
        g.clip()
        g.shadowColor = NEON
        g.shadowBlur = 5 + 5 * neonPulse
        const lw = LOGO_H * LOGO_AR
        const ly = HEAD.y + (HEAD.h - LOGO_H) / 2
        if (still) {
          g.drawImage(logoImg, HEAD.x + (HEAD.w - lw) / 2, ly, lw, LOGO_H)
        } else {
          const cycle = lw + LOGO_GAP
          const offset = ((now / 1000) * MARQUEE_PX_S) % cycle
          const xBase = HEAD.x + HEAD.w - offset
          for (let k = 0; k >= -2; k--) {
            g.drawImage(logoImg, xBase + k * cycle, ly, lw, LOGO_H)
          }
        }
        g.restore()
      } else {
        g.save()
        g.font = '700 30px "Geist Mono", monospace'
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.shadowColor = NEON
        g.shadowBlur = 10 + 10 * neonPulse
        g.fillStyle = NEON
        g.fillText('A U T O M A T', HEAD.x + HEAD.w / 2, HEAD.y + HEAD.h / 2 + 1)
        g.restore()
      }
      // Neon underline.
      g.save()
      g.globalAlpha = 0.55 + 0.35 * neonPulse
      g.fillStyle = NEON
      g.fillRect(HEAD.x + 24, HEAD.y + HEAD.h - 8, HEAD.w - 48, 2)
      g.restore()

      // Glass window (coal ink under the cool glass edge).
      roundRect(g, GLASS.x, GLASS.y, GLASS.w, GLASS.h, 12)
      g.fillStyle = COL.glassBg
      g.fill()
      g.lineWidth = 3.5
      g.strokeStyle = COL.ink
      g.stroke()
      g.lineWidth = 2
      g.strokeStyle = COL.glassEdge
      g.stroke()

      // Interior + shelves + queued packs (clip to glass).
      g.save()
      roundRect(g, GLASS.x, GLASS.y, GLASS.w, GLASS.h, 12)
      g.clip()
      // Faint interior top-light.
      const lightGrad = g.createLinearGradient(0, GLASS.y, 0, GLASS.y + 90)
      lightGrad.addColorStop(0, `rgba(0,240,255,${0.06 + 0.04 * neonPulse})`)
      lightGrad.addColorStop(1, 'rgba(0,240,255,0)')
      g.fillStyle = lightGrad
      g.fillRect(GLASS.x, GLASS.y, GLASS.w, 90)

      // Which slots still hold their pack? A slot empties the moment its drop
      // starts and STAYS empty for the round (the sprite takes over drawing).
      const dropped = emptiedRef.current
      // Queued-this-purchase follows the slotOrder map (hand-picks first, then
      // auto-fill) so the BRIGHT packs are exactly the ones THIS purchase will
      // vend — picking C1 visibly steals a spot from the auto set (Tim
      // 2026-07-22: the old fixed [0..count) read as a stuck auto-selection
      // next to fresh hand-picks). No slotOrder → [0..count), same as ever.
      const orderNow = slotOrderRef.current
      const queued = new Set<number>()
      for (let i = 0; i < Math.min(count, LIVE_SLOTS); i++) {
        const s = orderNow?.[i]
        queued.add(s != null ? s % TOTAL_SLOTS : i)
      }
      for (let slot = 0; slot < TOTAL_SLOTS; slot++) {
        const shelf = Math.floor(slot / 5)
        const col = slot % 5
        const cx = SLOT_XS[col]!
        const cy = SHELF_YS[shelf]! - PACK_H / 2 - 4
        if (dropped.has(slot)) continue
        const inPurchase = queued.has(slot)
        const active = phase === 'ready' ? inPurchase : phase === 'vending' && inPurchase
        drawPack(g, cx, cy, 'standard', 1, 1, 0, active ? 1 : 0.4, 0, readySprite(packStdImg))
      }
      // Shelf strips + coils (drawn OVER packs: packs sit behind the coil).
      for (const sy of SHELF_YS) {
        g.fillStyle = COL.shelf
        g.fillRect(GLASS.x + 6, sy - 4, GLASS.w - 12, 5)
        g.fillStyle = 'rgba(0,0,0,0.25)'
        g.fillRect(GLASS.x + 6, sy + 1, GLASS.w - 12, 3)
        // Ink seam along the shelf's light band (flat-vector metal read).
        g.save()
        g.globalAlpha = 0.5
        g.fillStyle = COL.ink
        g.fillRect(GLASS.x + 6, sy - 5, GLASS.w - 12, 1)
        g.restore()
        for (const sx of SLOT_XS) {
          // Helix coil seen down its axis (the real vending-machine read from
          // the refs): the pack stands INSIDE the winding — a big front turn
          // around the pack + a smaller receding turn — instead of loose
          // rings sitting on top of it. The winding gap rotates on a vend.
          const active = dropsRef.current.find(
            (d) =>
              SLOT_XS[d.slot % 5] === sx &&
              SHELF_YS[Math.floor(d.slot / 5)] === sy &&
              now - d.startedAt < COIL_MS,
          )
          // TWO full revolutions over the coil window (ends where it started
          // — no snap when the pack releases); a WIDE gap + a traveling
          // tip-node make the rotation actually read (a near-closed circle
          // only moves its tiny gap — invisible).
          const turn = active ? easeInOut(clamp01((now - active.startedAt) / COIL_MS)) : 0
          const spin = turn * Math.PI * 4
          const cy = sy - PACK_H / 2 - 4 // pack center this shelf
          g.save()
          const drawTurn = (rx: number, ry: number, ox: number, oy: number, dim: number, off: number): void => {
            const phase0 = -Math.PI * 0.35 + spin + off
            g.beginPath()
            g.ellipse(sx + ox, cy + oy, rx, ry, 0, phase0, phase0 + Math.PI * 1.4)
            g.strokeStyle = COL.ink
            g.globalAlpha = 0.5 * dim
            g.lineWidth = 4
            g.stroke()
            g.globalAlpha = dim
            g.strokeStyle = COL.coil
            g.lineWidth = 2.5
            g.stroke()
          }
          // Receding turn (smaller, dimmer, phase-offset — screw feel).
          drawTurn(22, 20, 1.5, -3, 0.55, 0.5)
          drawTurn(26, 24, 0, 2, 1, 0)
          // Traveling tip-node at the winding's leading end — the eye-catch
          // that sells the rotation.
          const tipA = -Math.PI * 0.35 + spin + Math.PI * 1.4
          const tipX = sx + Math.cos(tipA) * 26
          const tipY = cy + 2 + Math.sin(tipA) * 24
          g.globalAlpha = 1
          g.beginPath()
          g.arc(tipX, tipY, 3, 0, Math.PI * 2)
          g.fillStyle = '#e8ecf1'
          g.fill()
          g.lineWidth = 1.5
          g.strokeStyle = COL.ink
          g.stroke()
          g.restore()
        }
      }
      // Glass sheen (slow diagonal drift; frozen when still).
      const sheenX = still ? GLASS.x + GLASS.w * 0.3 : GLASS.x + ((now / 90) % (GLASS.w * 1.6)) - GLASS.w * 0.3
      const sheen = g.createLinearGradient(sheenX, GLASS.y, sheenX + 90, GLASS.y + GLASS.h)
      sheen.addColorStop(0, 'rgba(255,255,255,0)')
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.05)')
      sheen.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = sheen
      g.fillRect(GLASS.x, GLASS.y, GLASS.w, GLASS.h)
      // Interior bottom shadow (frame depth), inside the clip.
      const glassShadow = g.createLinearGradient(0, GLASS.y + GLASS.h - 46, 0, GLASS.y + GLASS.h)
      glassShadow.addColorStop(0, 'rgba(0,0,0,0)')
      glassShadow.addColorStop(1, 'rgba(0,0,0,0.28)')
      g.fillStyle = glassShadow
      g.fillRect(GLASS.x, GLASS.y + GLASS.h - 46, GLASS.w, 46)
      g.restore()
      // Glass dressing (static, flat-vector): asymmetric edge highlight +
      // corner reflection wedge — a full ring would read as a sticker.
      g.save()
      g.strokeStyle = 'rgba(255,255,255,0.35)'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(GLASS.x + 14, GLASS.y + 2)
      g.lineTo(GLASS.x + GLASS.w - 14, GLASS.y + 2)
      g.stroke()
      g.beginPath()
      g.moveTo(GLASS.x + 2, GLASS.y + 12)
      g.lineTo(GLASS.x + 2, GLASS.y + 72)
      g.stroke()
      const wedge = g.createLinearGradient(GLASS.x, GLASS.y, GLASS.x + 64, GLASS.y + 96)
      wedge.addColorStop(0, 'rgba(255,255,255,0.14)')
      wedge.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = wedge
      g.beginPath()
      g.moveTo(GLASS.x + 4, GLASS.y + 4)
      g.lineTo(GLASS.x + 62, GLASS.y + 4)
      g.lineTo(GLASS.x + 4, GLASS.y + 92)
      g.closePath()
      g.fill()
      g.restore()

      // Bottom panel: a DARK MARQUEE island (the ref's black band on the loud
      // wrap) — solid so the mural can never swallow the signage.
      g.save()
      roundRect(g, BODY.x + 24, 548, BODY.w - 48, 62, 10)
      g.fillStyle = '#14171d'
      g.fill()
      g.lineWidth = 2.5
      g.strokeStyle = COL.ink
      g.stroke()
      g.lineWidth = 1
      g.strokeStyle = 'rgba(255,255,255,0.14)'
      g.beginPath()
      g.moveTo(BODY.x + 32, 550)
      g.lineTo(BODY.x + BODY.w - 34, 550)
      g.stroke()
      // Rivets (light-rimmed on the dark island).
      for (const [rx, ry] of [
        [BODY.x + 32, 556],
        [BODY.x + BODY.w - 32, 556],
        [BODY.x + 32, 602],
        [BODY.x + BODY.w - 32, 602],
      ] as const) {
        g.beginPath()
        g.arc(rx, ry, 2, 0, Math.PI * 2)
        g.fillStyle = '#0a0c10'
        g.fill()
        g.lineWidth = 0.8
        g.strokeStyle = 'rgba(255,255,255,0.22)'
        g.stroke()
      }
      g.fillStyle = '#39404a'
      roundRect(g, BODY.x + BODY.w - 96, 562, 44, 34, 6)
      g.fill()
      g.fillStyle = '#0a0c10'
      g.fillRect(BODY.x + BODY.w - 79, 568, 10, 22) // coin slit
      g.font = '600 12px "Geist Mono", monospace'
      g.textAlign = 'left'
      g.textBaseline = 'middle'
      // Gold marquee lettering (value register, matches the wrap's gold).
      // Odds read the ARMED tier's table — the plaque is per-machine signage.
      g.fillStyle = 'rgba(240,181,66,0.92)'
      g.fillText(`MULTIPLIER PACKS · 1-IN-${GOLD_ONE_IN_BY_TIER[tierNow]} VENDS GOLD`, BODY.x + 40, 579)
      g.restore()

      // Tray mouth: a LIT interior bay (machnicsdrop ref) — the landed pack
      // sits visibly INSIDE this opening.
      g.save()
      roundRect(g, TRAY.x, TRAY.y, TRAY.w, TRAY.h, 10)
      const bayGrad = g.createLinearGradient(0, TRAY.y, 0, TRAY.y + TRAY.h)
      bayGrad.addColorStop(0, '#3a3f47')
      bayGrad.addColorStop(0.35, '#efe9dc')
      bayGrad.addColorStop(1, '#cfc8b8')
      g.fillStyle = bayGrad
      g.fill()
      g.clip()
      // Interior shading: dark ceiling band + side falloff sell the box depth.
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(TRAY.x, TRAY.y, TRAY.w, 10)
      const baySideL = g.createLinearGradient(TRAY.x, 0, TRAY.x + 26, 0)
      baySideL.addColorStop(0, 'rgba(0,0,0,0.22)')
      baySideL.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = baySideL
      g.fillRect(TRAY.x, TRAY.y, 26, TRAY.h)
      const baySideR = g.createLinearGradient(TRAY.x + TRAY.w - 26, 0, TRAY.x + TRAY.w, 0)
      baySideR.addColorStop(0, 'rgba(0,0,0,0)')
      baySideR.addColorStop(1, 'rgba(0,0,0,0.22)')
      g.fillStyle = baySideR
      g.fillRect(TRAY.x + TRAY.w - 26, TRAY.y, 26, TRAY.h)
      g.restore()

      // Falling + PILED packs (landed packs persist and stack up in the bay
      // until the round resets — vend 10, get a heap of 10).
      for (const d of dropsRef.current) {
        const t = now - d.startedAt
        const col = d.slot % 5
        const shelf = Math.floor(d.slot / 5)
        const sx = SLOT_XS[col]!
        const sy = SHELF_YS[shelf]! - PACK_H / 2 - 4
        const trayCx = TRAY.x + TRAY.w / 2
        const pose = PILE_POSES[d.slot % PILE_POSES.length]!
        const restX = trayCx + pose.dx
        const restY = TRAY.y + TRAY.h / 2 + pose.dy
        const restRot = (pose.rot * Math.PI) / 180
        // Static class glow (art-roster fix): the old 0.6+0.4·sin(now/110) was
        // an unsynced ~1.4Hz third oscillator. Class-keyed only — identical
        // for a 5× and a 100× gold (RG-C5).
        const glow = d.cls === 'gold' ? 0.85 : 0

        const dropSprite = readySprite(d.cls === 'gold' ? packGoldImg : packStdImg)
        // Clip helpers: the pack only ever renders INSIDE the machine — the
        // glass chamber while falling, the lit bay while landing (ref video).
        const clipGlass = (): void => {
          g.save()
          roundRect(g, GLASS.x + 2, GLASS.y + 2, GLASS.w - 4, GLASS.h - 4, 10)
          g.clip()
        }
        const clipBay = (): void => {
          g.save()
          roundRect(g, TRAY.x + 2, TRAY.y + 2, TRAY.w - 4, TRAY.h - 4, 8)
          g.clip()
        }
        if (reduced) {
          // Reduced motion: fade in at the pile spot, no physics; persists.
          const a = clamp01(t / REDUCED_FADE_MS)
          clipBay()
          drawPack(g, restX, restY, d.cls, 1, 1, restRot, a, glow * a, dropSprite)
          g.restore()
          continue
        }
        if (t < COIL_MS) {
          // Anticipation: pack nudges forward off the coil (inside the glass).
          const k = easeInOut(t / COIL_MS)
          clipGlass()
          drawPack(g, sx, sy + k * 6, d.cls, 1 + k * 0.03, 1 + k * 0.03, k * 0.06, 1, glow, dropSprite)
          g.restore()
        } else if (t < COIL_MS + GLASS_FALL_MS) {
          // Chamber fall: STRAIGHT DOWN from the slot, clipped to the glass —
          // the pack visibly vanishes behind the window's bottom edge.
          const k = clamp01((t - COIL_MS) / GLASS_FALL_MS)
          const fallK = k * k // gravity
          const yEnd = GLASS.y + GLASS.h + PACK_H
          const y = sy + 6 + (yEnd - sy - 6) * fallK
          clipGlass()
          drawPack(g, sx, y, d.cls, 1, 1, 0.05 + k * 0.16, 1, glow, dropSprite)
          g.restore()
        } else if (t < COIL_MS + GLASS_FALL_MS + HIDDEN_MS) {
          // Hidden beat: travelling through the machine guts. Nothing renders.
        } else if (t < LANDING_AT_MS) {
          // Bay drop: the pack falls to ITS pile spot, screwing toward its
          // rest rotation, clipped to the mouth — it lands INSIDE the heap.
          const k = clamp01((t - COIL_MS - GLASS_FALL_MS - HIDDEN_MS) / TRAY_FALL_MS)
          const fallK = k * k
          const yStart = TRAY.y - PACK_H / 2 + 6
          const y = yStart + (restY - yStart) * fallK
          if (flapRef.current < 0.05) flapRef.current = 1
          clipBay()
          drawPack(g, restX, y, d.cls, 1, 1, restRot * easeInOut(k), 1, glow, dropSprite)
          g.restore()
        } else {
          // Landed: squash → rebound, then REST — the pack stays in the pile
          // for the whole round (the DOM rail chip carries the value).
          const t2 = t - LANDING_AT_MS
          let sxk = 1
          let syk = 1
          if (t2 < SQUASH_MS) {
            const k = t2 / SQUASH_MS
            sxk = 1 + 0.12 * (1 - Math.abs(k * 2 - 1))
            syk = 1 - 0.16 * (1 - Math.abs(k * 2 - 1))
          } else if (t2 < SQUASH_MS + REBOUND_MS) {
            const k = easeOutBack((t2 - SQUASH_MS) / REBOUND_MS)
            sxk = 1.04 - 0.04 * k
            syk = 0.94 + 0.06 * k
          }
          clipBay()
          drawPack(g, restX, restY, d.cls, sxk, syk, restRot, 1, glow, dropSprite)
          g.restore()
        }
      }

      // Tray lip + swinging flap (drawn OVER packs so they fall "behind" it).
      // Gold class-cue: the lip flashes gold for the fixed impact window of a
      // gold landing only (binary, module-const duration — never value-scaled).
      const goldImpact = dropsRef.current.some((d) => {
        if (d.cls !== 'gold') return false
        const t2 = now - d.startedAt - LANDING_AT_MS
        return t2 >= 0 && t2 <= SQUASH_MS + REBOUND_MS
      })
      const flap = flapRef.current
      if (flap > 0.01) flapRef.current = reduced ? 0 : flap * 0.86
      g.save()
      // The swing stays INSIDE the mouth (ref video) — never over the wrap.
      roundRect(g, TRAY.x - 2, TRAY.y - 4, TRAY.w + 4, TRAY.h + 8, 10)
      g.clip()
      g.translate(TRAY.x + TRAY.w / 2, TRAY.y + 2)
      g.rotate(-flap * 0.28)
      // Flap: flat 2-tone metal + ink rim + top highlight.
      g.fillStyle = COL.flapTop
      g.fillRect(-TRAY.w / 2 + 4, 0, TRAY.w - 8, 6)
      g.fillStyle = COL.flapBottom
      g.fillRect(-TRAY.w / 2 + 4, 6, TRAY.w - 8, 4)
      g.strokeStyle = COL.ink
      g.lineWidth = 1.5
      g.strokeRect(-TRAY.w / 2 + 4, 0, TRAY.w - 8, 10)
      g.strokeStyle = 'rgba(255,255,255,0.5)'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(-TRAY.w / 2 + 6, 1)
      g.lineTo(TRAY.w / 2 - 6, 1)
      g.stroke()
      g.restore()
      // Tray mouth rim: coal ink under the metal lip (double-stroke law).
      roundRect(g, TRAY.x, TRAY.y, TRAY.w, TRAY.h, 10)
      g.lineWidth = 4.5
      g.strokeStyle = COL.ink
      g.stroke()
      g.lineWidth = 3
      g.strokeStyle = goldImpact ? COL.goldBody : COL.trayLip
      g.stroke()
      // Tray label: a solid dark sticker sub-plate (island on the wrap).
      g.save()
      const lblW = 128
      const lblX = TRAY.x + TRAY.w / 2 - lblW / 2
      const lblY = TRAY.y + TRAY.h + 7
      roundRect(g, lblX, lblY, lblW, 17, 4)
      g.fillStyle = '#14171d'
      g.fill()
      g.strokeStyle = COL.ink
      g.lineWidth = 1.5
      g.stroke()
      g.beginPath()
      g.arc(lblX + 6, lblY + 8.5, 1.5, 0, Math.PI * 2)
      g.arc(lblX + lblW - 6, lblY + 8.5, 1.5, 0, Math.PI * 2)
      g.fillStyle = '#0a0c10'
      g.fill()
      g.lineWidth = 0.8
      g.strokeStyle = 'rgba(255,255,255,0.22)'
      g.stroke()
      g.font = '600 11px "Geist Mono", monospace'
      g.fillStyle = '#98a1b3'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('TAKE YOUR PACKS', TRAY.x + TRAY.w / 2, lblY + 9)
      g.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  // OPTIONAL slot-selection overlay: DOM hit-cells over the glass slots, given
  // for free keyboard + screen-reader access. Renders ONLY for the interactive
  // front machine (onToggleSlot present) — backdrop machines get none. The cells
  // are positioned in PERCENTAGES of the logical 520x760 frame, so they track
  // the canvas box exactly across resize/orientation with no measurement (the
  // canvas keeps the same aspect ratio at every width — avoids the learning-3
  // detached-ref trap entirely). The container is pointer-events:none so only
  // the cells (never the gutters or the area outside the glass) catch input.
  const overlay = onToggleSlot ? (
    <div aria-hidden={false} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
      <style>{`
        @keyframes vendSlotBloom {
          0%   { opacity: 0.95; transform: scale(1.55); }
          100% { opacity: 0;    transform: scale(1); }
        }
        .vend-slot-bloom { animation: vendSlotBloom ${SLOT_BLOOM_MS}ms ease-out both; }
        @keyframes vendSlotBreathe {
          0%   { opacity: 0.55; }
          50%  { opacity: 1; }
          100% { opacity: 0.55; }
        }
        .vend-slot-glow { animation: vendSlotBreathe ${SLOT_BREATHE_MS}ms ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .vend-slot-bloom { animation: none; opacity: 0; }
          .vend-slot-glow { animation: none; opacity: 0.85; }
        }
        .vend-slot-cell:hover:not(:disabled) .vend-slot-tag,
        .vend-slot-cell:focus-visible .vend-slot-tag { color: #e8ecf1; }
      `}</style>
      {Array.from({ length: TOTAL_SLOTS }, (_, slot) => {
        const shelf = Math.floor(slot / 5)
        const col = slot % 5
        const cx = SLOT_XS[col]!
        const cy = SHELF_YS[shelf]! - PACK_H / 2 - 4
        // Glow only while picking is live (ready phase): once the vend runs,
        // no cell may keep a selected mark (defense-in-depth beside the
        // Experience's clear-on-vend — Tim: only current hand-picks ever glow).
        const selected = slotSelectEnabled && !!selectedSlots?.includes(slot)
        const order = selectedSlots?.indexOf(slot) ?? -1
        return (
          <button
            key={slot}
            type="button"
            className="vend-slot-cell"
            aria-label={`Select slot ${slotCode(slot)}`}
            aria-pressed={selected}
            disabled={!slotSelectEnabled}
            onClick={() => onToggleSlot(slot)}
            style={{
              position: 'absolute',
              left: `${((cx - SLOT_CELL_W / 2) / W) * 100}%`,
              top: `${((cy - SLOT_CELL_H / 2) / H) * 100}%`,
              width: `${(SLOT_CELL_W / W) * 100}%`,
              height: `${(SLOT_CELL_H / H) * 100}%`,
              padding: 0,
              margin: 0,
              border: `1px solid ${selected ? ledColor : 'rgba(255,255,255,0.10)'}`,
              borderRadius: 9,
              background: selected ? `${ledColor}1f` : 'transparent',
              cursor: slotSelectEnabled ? 'pointer' : 'default',
              pointerEvents: slotSelectEnabled ? 'auto' : 'none',
              touchAction: 'manipulation',
              transition: 'border-color 110ms ease, background 110ms ease',
            }}
          >
            {/* Ambient steady glow: the box-shadow lives on this span so only its
                OPACITY animates (composited breathe on the shared phase clock —
                the negative delay pins every cell to one global epoch). */}
            {selected && (
              <span
                aria-hidden
                className="vend-slot-glow"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 9,
                  boxShadow: `0 0 14px 1px ${ledColor}, inset 0 0 10px ${ledColor}55`,
                  pointerEvents: 'none',
                  animationDelay: `-${Date.now() % SLOT_BREATHE_MS}ms`,
                }}
              />
            )}
            {/* One-shot bloom ring — flashes on select, then fades to 0; the
                steady glow lives on the button box-shadow above. Gated under
                reduced-motion (steady glow stays). */}
            {selected && (
              <span
                key={`bloom-${order}`}
                aria-hidden
                className="vend-slot-bloom"
                style={{
                  position: 'absolute',
                  inset: -2,
                  borderRadius: 11,
                  border: `2px solid ${ledColor}`,
                  boxShadow: `0 0 18px 4px ${ledColor}`,
                  pointerEvents: 'none',
                }}
              />
            )}
            {/* Punch-code tag (A1..D5), always visible, mono, calm dim. */}
            <span
              className="vend-slot-tag"
              style={{
                position: 'absolute',
                top: 3,
                left: 4,
                fontFamily: '"Geist Mono", ui-monospace, monospace',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: selected ? ledColor : '#9aa3b2',
                background: 'rgba(6,8,12,0.62)',
                borderRadius: 4,
                padding: '1px 4px',
                lineHeight: 1.2,
                pointerEvents: 'none',
              }}
            >
              {slotCode(slot)}
            </span>
          </button>
        )
      })}
    </div>
  ) : null

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: W, margin: '0 auto' }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="AUTOMAT vending machine dispensing multiplier packs"
        style={{ width: '100%', maxWidth: W, height: 'auto', display: 'block' }}
      />
      {overlay}
    </div>
  )
}

'use client'

/**
 * OoReiSlotCanvas -- the Canvas2D slot grid and animation layer.
 *
 * Renders the 5x3 slot grid with:
 *  - Symbol images loaded via HTMLImageElement cache (8 PNG alpha symbols)
 *  - Talisman-drift reel spin animation (vertical symbol strip scroll)
 *  - Payline win amber brushstroke trace across matching cells
 *  - Stone-lift win animation (2 canvas-painted stones, mechanic-tied, once per win)
 *  - Spirit-aura amber rim breathing (Spirit Bonus phase only, 0.04Hz)
 *  - Sumi-e ink-splash brush wipe (phase transition animation)
 *  - Talisman Awaken pre-committed cell borders
 *  - SWOOBZ watermark (brushed-ink, 6% opacity, behind symbols)
 *  - Rain streak overlay (canvas-paint scanlines, 250ms interval, NOT particles)
 *  - Kanji glyph bloom on 4-tier win system (良/大/神/霊光)
 *  - Per-symbol 5oaK multiplier badge (completeness spec 2026-05-28)
 *  - Win-line amber brushstroke trace per payline
 *
 * Z-index: 2 (between spirit backdrop z-1 and Rei character layer z-3).
 *
 * Performance:
 *  - rAF discipline: all state in refs, no React re-renders per frame
 *  - DevicePixelRatio capped at 2
 *  - Symbol images loaded lazily via Image() cache, drawn when ready
 *  - 16ms frame budget target (60fps)
 *
 * Brand register: Anime Cinematic -- charcoal + talisman-paper + amber palette.
 * Zero cyan anywhere in this component.
 *
 * Domain C: presentation only. Math lives in ooReiMath.ts.
 *
 * Per OO-REI-ART-DIRECTION-FINAL-2026-05-28.md:
 *   - Floating talisman tablet aesthetic: cells rendered as aged-paper squares
 *     with talisman-paper border (#e8dfc8) -- reads as paper tablets in air
 *   - Grid position: shifted right to W*0.38 base X to give Rei left-third presence
 *   - Win-line trace: amber brushstroke drawn as a thick Canvas2D stroke with
 *     soft edges (simulated via layered strokes with decreasing alpha)
 */

import { type CSSProperties, type ReactElement, useEffect, useRef } from 'react'

import type { PaylineWin, ReelGrid, SymbolId } from './ooReiMath'
import { PAYLINES, REEL_STRIPS, SYMBOL_NAMES } from './ooReiMath'
import {
  playPaylineDraw,
  playReelStop,
  playWinSymbolLight,
} from './ooReiAudio'
import {
  MAX_DPR,
  RAIN_REDRAW_INTERVAL_MS,
  REEL_DECEL_MS,
  REEL_DECEL_STAGGER_MS,
  STONE_LIFT_MS,
  STONE_LIFT_PX,
  WIN_ANTICIPATION_GAP_MS,
  WIN_LINE_DRAW_DELAY_MS,
  WIN_REVEAL_MS,
  WIN_SAVOR_HOLD_MS,
  WIN_SYMBOL_LIGHT_STAGGER_MS,
  WIN_TRACE_DRAW_DURATION_MS,
  WIN_TRACE_PER_LINE_STAGGER_MS,
  type WinTier,
} from './ooReiSignatures'

// ─── Anime Cinematic color tokens (zero cyan) ────────────────────────────────

// ─── Per-region cell palette (composition spec v3 2026-06-01) ────────────────
// Each region has its own cell ground colour, border, and active-border colour.
// These are the ONLY tokens that vary per region.
// ALL amber accent tokens (amberAccent, talismanGlow, spiritAura, paylineWin)
// are region-invariant -- the amber win economy is a studio-wide constant.
// ZERO cyan across all five palettes. Deep indigo-slate for tide-shore (NOT teal).

interface CellPalette {
  readonly cellBg: string
  readonly cellBgAlt: string
  readonly cellBorder: string
  readonly cellBorderActive: string
}

function getCellPalette(regionId: string | null): CellPalette {
  switch (regionId) {
    case 'tide-shore':
      // Deep indigo-slate night-water. NOT teal, ZERO cyan hue.
      // Bolder 2026-06-01: raised saturation on bg + brighter border tones.
      return {
        cellBg: 'rgba(16, 14, 34, 0.82)',
        cellBgAlt: 'rgba(22, 20, 48, 0.76)',
        cellBorder: '#7a76a0',
        cellBorderActive: '#a8a2c8',
      }
    case 'ember-forge':
      // Deep warm charcoal with ember-forge ground. Zero cyan.
      // Bolder 2026-06-01: richer ember-ochre fills + warmer brighter border.
      return {
        cellBg: 'rgba(38, 22, 10, 0.84)',
        cellBgAlt: 'rgba(52, 32, 14, 0.78)',
        cellBorder: '#b07840',
        cellBorderActive: '#d4a060',
      }
    case 'mist-forest':
      // Muted forest-floor dark green-grey. Silvered cedar edge.
      // Bolder 2026-06-01: deeper moss ground + brighter sage border.
      return {
        cellBg: 'rgba(18, 26, 18, 0.80)',
        cellBgAlt: 'rgba(24, 36, 22, 0.74)',
        cellBorder: '#7a8e6c',
        cellBorderActive: '#a2b890',
      }
    case 'shadow-vale':
      // Void near-black purple-tinted. Single amber lantern contrast on win.
      // Bolder 2026-06-01: deeper void + more visible purple-smoke border.
      return {
        cellBg: 'rgba(10, 8, 18, 0.92)',
        cellBgAlt: 'rgba(16, 12, 28, 0.88)',
        cellBorder: '#5c5278',
        cellBorderActive: '#847898',
      }
    default:
      // storm-coast (default): Storm wet-basalt -- cold coastal stone tablets.
      // Bolder 2026-06-01: deeper blue-grey ground + brighter slate border.
      return {
        cellBg: 'rgba(18, 16, 30, 0.82)',
        cellBgAlt: 'rgba(26, 24, 42, 0.76)',
        cellBorder: '#8e8aaa',
        cellBorderActive: '#b8b2d4',
      }
  }
}

const C = {
  substrate: '#1a1612',
  // Storm wet-basalt aesthetic: cells read as cold coastal stone tablets, not warm
  // paper. Blue-grey-black ground makes amber win-state stand out as supernatural
  // fire breaking the cold stone register. Storm Coast composition fix 2026-06-01.
  // NOTE: These four values are the region-invariant DEFAULTS (storm-coast).
  // The draw loop uses getCellPalette(activeRegionId) for per-region values.
  cellBg: 'rgba(22, 20, 26, 0.74)',
  cellBgAlt: 'rgba(30, 28, 36, 0.68)',   // Slight variation for depth
  // Stone groove border: weathered basalt incision (cool violet-grey idle)
  cellBorder: '#6b6878',                  // Basalt groove, muted violet-grey
  cellBorderActive: '#9a9298',            // Lighter stone edge when active, still cool
  gridBorder: 'rgba(120, 116, 136, 0.14)',
  // Amber accent tokens (4-job economy)
  amberAccent: '#d4892a',
  talismanGlow: '#f4a73e',
  spiritAura: 'rgba(212, 137, 42, 0.32)',
  symTextColor: '#e8dfc8',
  watermark: 'rgba(232, 223, 200, 0.05)',
  rainLine: 'rgba(180, 168, 148, 0.08)',
  stickyWild: 'rgba(244, 167, 62, 0.22)',
  // Bolder 2026-06-01: higher alpha for a more impactful win rim (was 0.65).
  paylineWin: 'rgba(244, 167, 62, 0.92)',
  // Win-tier kanji glyph colors
  kanjiColor: 'rgba(244, 167, 62, 0.92)',
  kanjiShadow: 'rgba(26, 22, 18, 0.8)',
  // Sumi-e wipe color
  sumiBlack: 'rgba(8, 5, 3, 0.95)',
  // CJK display face for kanji glyphs (Geist is Latin-only)
  fontKanji: '"Noto Serif JP", "Yu Mincho", serif',
} as const

// ─── Symbol asset paths ───────────────────────────────────────────────────────

const SYMBOL_PATHS: Record<SymbolId, string> = {
  0: '/assets/generated/oo-rei/sym-rice.png?v=2026-06-01-ink',
  1: '/assets/generated/oo-rei/sym-stone.png?v=2026-06-01-ink',
  2: '/assets/generated/oo-rei/sym-lantern.png?v=2026-06-01-ink',
  3: '/assets/generated/oo-rei/sym-talisman.png?v=2026-06-01-ink',
  4: '/assets/generated/oo-rei/sym-hat.png?v=2026-06-01-ink',
  5: '/assets/generated/oo-rei/sym-eye.png?v=2026-06-01-ink',
  6: '/assets/generated/oo-rei/sym-torii.png?v=2026-06-01-cream',
  7: '/assets/generated/oo-rei/sym-spirit-orb.png?v=2026-06-01-ink',
}

// ─── Canvas dimensions ────────────────────────────────────────────────────────

const COLS = 5
const ROWS = 3
const CELL_PAD = 6

// ─── Win tier thresholds REMOVED 2026-05-28 (cohesion rebuild) ──────────────
// The canvas no longer owns tier thresholds. OoReiSlotCanvas receives the
// pre-computed `winTier: WinTier` prop (from computeWinTier in ooReiSignatures).
// This ensures the canvas and the DOM overlay read from ONE authority.
// Rationale: the old WIN_TIER_T1..T4_BPS constants were 100× below their labels
// (unit error: 500n = 0.05x, labeled "5x") causing the violet banner to fire
// on nearly every win. The canvas now maps tier names to visual behavior.
//
// Canvas tier → banner mapping (amber on charcoal, ZERO violet/purple):
//   'none'  → no banner
//   'nice'  → thin amber banner, 良 glyph
//   'good'  → medium amber banner, 大 glyph
//   'big'   → amber burst, 大勝 glyph
//   'mega'  → talisman-glow burst, 神勝 glyph

// Win-tier celebration timings -- module-const, RG-C5 ENFORCED.
// IDENTICAL for all 4 tiers. Character variation is glyph/subtitle/banner.
const WIN_TIER_BLOOM_MS = 500 as const   // glyph elastic-out bloom
const WIN_TIER_HOLD_MS  = 900 as const   // hold at full scale
const WIN_TIER_FADE_MS  = 800 as const   // fade out
const WIN_TIER_TOTAL_MS = 2200 as const  // must equal bloom + hold + fade

// ─── Win-tile highlight + enlargement (game-feel Fix 2) ──────────────────────
// Winning tiles are highlighted by the CONTAINED amber background wash (below),
// NOT by scaling the cell up. Tim 2026-06-05 (#142): "the enlargement of the
// tiles breaks design" — a sustained >1.0 scale pushed winning cells past their
// grid slot, misaligning the board. The scale is neutralised to 1.0 so winning
// cells stay EXACTLY grid-sized; the warm amber wash carries the highlight.
// RG-C5 module-const: identical for all win sizes (BIG === STANDARD).
const WIN_TILE_SCALE_STANDARD = 1.0 as const  // no enlargement — grid stays crisp
// RG-C5 structural identity: tier distinction is by dwell/waveform timing only,
// never by scale amplitude. Both tiers resolve to the same scale value.
const WIN_TILE_SCALE_BIG: typeof WIN_TILE_SCALE_STANDARD = WIN_TILE_SCALE_STANDARD
// Bolder 2026-06-01: stronger rim alpha + wider stroke for Big Bass energy.
const WIN_TILE_GLOW_ALPHA = 0.96 as const      // Amber rim max alpha on winning tile (was 0.80)
const WIN_TILE_GLOW_WIDTH = 4 as const         // Rim stroke width px (was 3)

// ─── Per-reel landing beat (constant choreography — RG-C3/C5 compliant) ──────
// Fires on every reel stop, every spin, identical for every outcome.
// The weight comes from physical choreography, not from outcome-correlated tension.
// RG-C3: NO near-miss / partial-match / hasThreeMatch conditional anywhere.
// RG-C5: all values module-const; never derived from wager / streak / session state.
const REEL_LAND_HIT_STOP_MS = 60 as const   // brief clean settle hold at exact target (no over-travel)
const REEL_LAND_SETTLE_MS   = 60 as const   // settle from over-travel back to exact target
// Total landing beat per reel: 60 + 110 = 170ms visible, resolves in ~230ms

// Per-symbol landing tick pop (game-feel-engineer §1.4 — Pass 6 aliveness).
// Scale pop 1.0 → 1.03 → 1.0 over 120ms on ALL THREE symbols in the landed column.
// Module-const amplitude: identical for every column, every outcome. RG-C5.
// NOTE: ooReiSignatures.ts owns the canonical home for this constant.
// Inline here per Pass 6 spec: "add it directly in this pass noting that
// OoReiSlotCanvas.tsx uses it as an inline const with a comment pointing to the
// signatures module for future consolidation."
const SYMBOL_POP_SCALE = 1.03 as const  // → consolidate to ooReiSignatures.ts in cleanup pass
const SYMBOL_POP_MS    = 120 as const   // total pop duration (ms): bloom 60ms + recover 60ms

// Staggered world-aftershock (game-feel-engineer §1.5 — Pass 6 aliveness).
// 165ms after win-settle headline fires, secondary HUD elements respond.
// Module-const, RG-C5 (not session/wager scaled). OoReiExperience wires the callback.
const AFTERSHOCK_DELAY_MS = 165 as const

// ─── Living Spirit Header (composition-designer spec 2026-06-02) ──────────────
// The active region spirit coils across the TOP of the board frame and COLLECTS
// the 3 Spirit Orbs into itself as they land; its eyes ignite amber at 3/3 to
// signal the bonus. Drawn ON the canvas as part of the board frame (NOT a DOM
// overlay) so it is integrated, persists through casting/spinning, and the
// spirit is visibly present every base-game phase. Replaces the rejected DOM
// scatter marquee (a "bolted on rectangle"). Display-only — RTP locked.
//
// RG-C5 STRUCTURAL: every timing/amplitude below is a module-level `as const`,
// byte-identical regardless of streak/session/wager/value. The orb-rise + the
// eye-ignite fire identically every spin. The only thing that varies by orb
// index is the socket DESTINATION, never the speed or size.
const SPIRIT_HEADER_BAND_H_DESKTOP = 72 as const  // band height, W >= 901
const SPIRIT_HEADER_BAND_H_TABLET = 56 as const   // band height, 481..900
// Mobile (W < 481): a real (shorter) header band ABOVE the cells — NOT an in-board
// row over the symbols (Tim 2026-06-02: the row overlapped the top tile row).
// gridH is cap-limited on mobile (min(.., 340, ..)) so reserving this band lowers
// the board without shrinking the cells.
const SPIRIT_HEADER_BAND_H_MOBILE = 46 as const

const ORB_RISE_MS = 420 as const            // cell-center → socket travel
const ORB_RISE_SCALE_START = 0.48 as const  // 48% of socket diameter at the cell
const ORB_RISE_SCALE_END = 1.0 as const
const ORB_RISE_ALPHA_START = 0.7 as const
const ORB_RISE_ALPHA_END = 0.0 as const     // fades out as it merges into socket
const SOCKET_FILL_DELAY_MS = ORB_RISE_MS - 60  // socket starts filling 60ms before arrival (module-const, RG-C5)
const ORB_FILL_MS = 200 as const            // socket fill fade-in
const EYE_IGNITE_BLOOM_MS = 320 as const    // eye glow bloom on 3/3 armed
const EYE_IGNITE_PEAK_ALPHA = 0.9 as const
const ORB_ARMED_PULSE_HZ = 0.06 as const    // ambient 3/3 ring pulse rate
const ORB_ARMED_PULSE_AMPLITUDE = 0.18 as const  // outer ring alpha swing

// ─── Living Spirit Header — desktop/tablet shrine alcove (Tim 2026-06-02) ─────
// The dark-on-dark trap: screen(darkInkPNG, nearBlackBand) ≈ 0, so the region
// spirit barely registered. Fix = paint a WARM-CHARCOAL ALCOVE behind the figure
// first, THEN screen-blend the spirit on top → the dark ink reads as a sumi-e
// ink-wash silhouette against a lantern-lit shrine recess. ZERO cyan (all stops
// audited: every rgba has r >= g >= b, no g>180 && b>180). RG-C5: every timing /
// amplitude below is a module-const, value / streak / wager-independent.
const NICHE_BREATH_HZ = 0.028 as const         // ≤0.04Hz RG-C5 ✓ (one inhale ~36s)
const NICHE_BREATH_AMPLITUDE = 0.12 as const   // additive alpha swing on amber edge
const NICHE_BREATH_BASE_ALPHA = 0.22 as const  // base amber-edge center-stop alpha
// Spirit figure sizing — raised 3.2 → 4.2 so the head/shoulders fill the band.
const SPIRIT_HEADER_DRAW_H_MULT = 4.2 as const
// Feathering fractions (offscreen rebuild). Top + left reduced so more of the
// dragon head / body reads in the band; bottom + right unchanged.
const SPIRIT_FEATHER_TOP = 0.12 as const     // was 0.18 — less top erasure
const SPIRIT_FEATHER_LEFT = 0.1 as const     // was 0.18 — body reads at center
const SPIRIT_FEATHER_BOTTOM = 0.4 as const   // unchanged — dissolves into cells
const SPIRIT_FEATHER_RIGHT = 0.18 as const   // unchanged — resolves into frame
// Alcove gradient radii (multiples of band height hbH).
const ALCOVE_PRIMARY_RADIUS_MULT = 3.6 as const  // warm-charcoal primary ground
const ALCOVE_AMBER_RADIUS_MULT = 2.2 as const    // amber lantern-ring layer
// Spirit width clamp (openRisks MEDIUM): wide-aspect PNGs (ARASHI wing-spread)
// must not bleed left past the sumi-e column accents. Cap at 52% of grid width.
const SPIRIT_MAX_W_FRAC = 0.52 as const

// ─── In-board cinematic dragon · DEPTH-WEAVE (Tim 2026-06-02) ────────────────
// "the dragon needs to be IN FRONT OF the Spirit bonus background but BEHIND the
// slot tiles." The cinematic dragon (the HEAD-FORWARD arashi-head.png storm-dragon
// for storm-coast / cycle2-frozen-highland) is drawn ON the canvas in BOARD space,
// AFTER the ink-wash panel base fill (so its HEAD reads in FRONT of the band
// background) but BEFORE the cell clip + symbol tiles (so the opaque tiles OCCLUDE
// the BODY where it dips into the cell region — depth: body behind the reels).
// Net z-weave: backdrop sky < dragon body (occluded by tiles) … band-bg < dragon
// head (in front of band) < tiles < sockets/label. Replaces the rejected DOM z-1
// spirit-behind-the-veil treatment in base-game board phases.
//
// SIZING + ANCHOR (Tim #94/#95 BOLD-head retune, 2026-06-02): the head-forward
// arashi-head.png puts the dragon FACE + mane + amber eye in the TOP ~45% of the
// PNG. The OLD sizing scaled the whole dragon to the full PANEL height — which made
// the head region ~235px tall on desktop, far taller than the ~72px band, so only a
// thin slice of the head fit the band (occluded/clipped elsewhere) = "present but
// not bold". THE FIX: size the dragon RELATIVE TO THE BAND so the head zone (face +
// mane + upper neck) roughly FILLS the band height, with the jaw/neck/coils trailing
// DOWN one-to-two cell rows behind the ~82%-opaque tiles (occlusion = depth). The
// dragon height = headerBandH × SLOT_DRAGON_BAND_FILL_MULT, clamped to the panel
// height (never larger than the board) and clamped to SLOT_DRAGON_MAX_W_FRAC of
// gridW for width. Result: a BOLD pale dragon head dominating the band's right
// portion (clear of the left "0/3 SPIRIT BONUS" label), body weaving behind tiles.
// SLOT_DRAGON_H_FRAC is kept as the PANEL-height ceiling (the dragon never exceeds
// this fraction of the panel even if the band-relative size would).
const SLOT_DRAGON_H_FRAC = 1.0 as const             // panel-height CEILING (dragon never taller than this × panelHt)
const SLOT_DRAGON_MAX_W_FRAC = 0.62 as const        // width clamp (fraction of gridW) — head dominates the band RIGHT, clears the left label
// Band-relative head fill: dragon height = headerBandH × this. The head zone (top
// ~45% of the PNG) then spans ≈ band + ~1.3 cell-rows so the FACE + mane + amber eye
// fill the band BOLDLY and the jaw trails one row into the cells. Tuned so on desktop
// (band 72) the dragon is ~430px (head zone ~190px → band 72 + ~120px trail) and on
// mobile (band 46) ~275px. Module-const (RG-C5 — never runtime-scaled).
const SLOT_DRAGON_BAND_FILL_MULT = 4.5 as const
// HEAD ANCHOR (Tim #94/#95 CROWN-anchored BOLD-head, 2026-06-02): the dragon FACE
// must read BOLD in the band — not clipped above the board nor sunk into the occluded
// cells. arashi-head.png is a HEAD-FORWARD composition: the dragon FACE + mane + amber
// eye fill the TOP ~45% of the PNG (generated 2026-06-02, seed 8831). Module-consts
// (RG-C5 — never runtime-scaled).
//   SLOT_DRAGON_HEAD_Y_FRAC   — where the amber EYE sits within the PNG (top=0, bottom=1);
//                               used only for the warm-halo centre now.
//   SLOT_DRAGON_CROWN_LEAD_FRAC — how far ABOVE the band top the PNG top edge starts, as
//                               a fraction of dragonH. Small (the mane crown sits just
//                               below the band top, a sliver of mane feathers over the
//                               edge). The face (crown → eye → snout) then fills the
//                               band; the lower jaw/neck trails into the first cell row
//                               (behind the ~82%-opaque tiles = depth). Anchoring on the
//                               CROWN (not the eye) is what makes the head BOLD in a band
//                               that is far shorter than a full dragon head.
const SLOT_DRAGON_HEAD_Y_FRAC = 0.25 as const
const SLOT_DRAGON_CROWN_LEAD_FRAC = 0.06 as const
// Horizontal RIGHT bias as a fraction of gridW: the PNG head sits in the LEFT-ish
// half of the cutout, and the "0/3 SPIRIT BONUS" label occupies the band LEFT, so
// we push the figure RIGHT so the head clears the label. 0 = centred, +0.5 = hard
// right. Module-const (RG-C5 — never runtime-scaled).
const SLOT_DRAGON_X_BIAS_FRAC = 0.16 as const
// Presence opacity band of the in-board dragon (Tim's 0.7-0.85 brief): a strong
// floor so the resting dragon is BOLD (in FRONT of the band bg, not a veil), plus
// a modest ramp on top so it still GROWS with the Spirit Gauge. Effective alpha =
// SLOT_DRAGON_FLOOR_ALPHA + SLOT_DRAGON_RAMP_ALPHA × spiritOpacity, where
// spiritOpacity is the SPIRIT_FORM_OPACITY gauge value (~0.60 → 1.0). At the
// resting Form 0 (0.60) that is 0.72 + 0.13×0.6 ≈ 0.80; at Form 4 (1.0) ≈ 0.85.
// RG-C5: both consts are module-level; the only runtime input is the form-driven
// gauge value (never streak/session/wager).
const SLOT_DRAGON_FLOOR_ALPHA = 0.88 as const
const SLOT_DRAGON_RAMP_ALPHA = 0.10 as const
// Edge-feather fractions for the in-board offscreen mask (soft-feather lower/side
// edges so no hard rectangle): bottom dissolves most (merges behind the reels),
// top/left/right feather to atmosphere. Module-consts (RG-C5 — never runtime-scaled).
const SLOT_DRAGON_FEATHER_BOTTOM = 0.22 as const  // dissolve the trailing tail into the lower reels (lighter — keep the dense upper body)
const SLOT_DRAGON_FEATHER_TOP = 0.02 as const   // minimal — the HEAD lives in the top band region; do NOT erase it
const SLOT_DRAGON_FEATHER_SIDE = 0.10 as const

// The Spirit Orb scatter symbol id (reused from the reel; display-only).
const SPIRIT_ORB_SYMBOL_ID: SymbolId = 7

// Per-region spirit blend + base opacity in the header band. Mirrors
// getSpiritBlendStyle() in OoReiCharacterLayer.tsx: screen for dark-ink spirits
// (ARASHI/HOMURA) on white/near-white PNG ground, normal for wisp/translucent
// spirits (SHIO/KIRI/KAGE). baseAlpha is tuned per the spec so the spirit reads
// present-but-not-dominant behind the socket row + typography.
interface SpiritHeaderBlend {
  readonly composite: GlobalCompositeOperation
  readonly baseAlpha: number
  readonly posX: number  // normalized horizontal center within the header band
}
function getSpiritHeaderBlend(regionId: string | null): SpiritHeaderBlend {
  switch (regionId) {
    // baseAlpha raised ~+0.20 (Tim 2026-06-02 "make the desktop spirit more
    // present"). The spirit now reads as a clearly-present looming chrome figure
    // in the header band rather than a faint wash, while still feathered so it
    // does not fight the reels. screen-blend spirits (dark-ink ground) take a
    // higher alpha than normal-blend wisps.
    case 'storm-coast':
    case 'cycle2-frozen-highland':  // inherits ARASHI
      return { composite: 'screen', baseAlpha: 0.82, posX: 0.58 }
    case 'ember-forge':
    case 'cycle2-spirit-gate':      // inherits HOMURA
      return { composite: 'screen', baseAlpha: 0.85, posX: 0.64 }
    case 'tide-shore':
    case 'cycle2-river-delta':      // inherits SHIO
      return { composite: 'source-over', baseAlpha: 0.48, posX: 0.55 }
    case 'mist-forest':
    case 'cycle2-bamboo-grove':     // inherits KIRI
      return { composite: 'source-over', baseAlpha: 0.52, posX: 0.66 }
    case 'shadow-vale':
    case 'cycle2-burial-mounds':    // inherits KAGE
      return { composite: 'source-over', baseAlpha: 0.56, posX: 0.5 }
    default:
      return { composite: 'screen', baseAlpha: 0.56, posX: 0.62 }
  }
}

// Draw left-aligned text with manual per-glyph letter-spacing. Canvas2D's
// `letterSpacing` is not universally supported, so the header tracks glyphs
// by hand. The caller sets ctx.font / fillStyle / textBaseline; this advances
// x by each glyph width + `tracking` px. textAlign is forced to 'left'.
function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): void {
  const prevAlign = ctx.textAlign
  ctx.textAlign = 'left'
  let cursor = x
  for (const ch of text) {
    ctx.fillText(ch, cursor, y)
    cursor += ctx.measureText(ch).width + tracking
  }
  ctx.textAlign = prevAlign
}

// Per-spirit eye-anchor estimate, normalized [0,1] from the cutout's top-left.
// The eye-ignite glow is drawn at this point at 3/3. These are starting estimates
// (spec openRisks MEDIUM): the upper-center head zone of each looming figure.
// Refine by measuring the actual eye centroid in each PNG.
const SPIRIT_EYE_ANCHORS: Readonly<Record<string, { nx: number; ny: number }>> = {
  'storm-coast': { nx: 0.46, ny: 0.12 },
  'ember-forge': { nx: 0.5, ny: 0.1 },
  'tide-shore': { nx: 0.5, ny: 0.12 },
  'mist-forest': { nx: 0.52, ny: 0.1 },
  'shadow-vale': { nx: 0.48, ny: 0.14 },
}
const SPIRIT_EYE_ANCHOR_DEFAULT = { nx: 0.48, ny: 0.12 } as const

// Header band colour tokens — zero cyan (all amber/stone). Audited:
//   #f4a73e = rgb(244,167,62): g=167 < 180 ✓   #d4892a = rgb(212,137,42) ✓
const HEADER_DIVIDER = 'rgba(212,137,42,0.22)' as const
const HEADER_SOCKET_BORDER_IDLE = 'rgba(180,148,80,0.30)' as const
const HEADER_SOCKET_BORDER_FILLED = 'rgba(244,167,62,0.60)' as const
const HEADER_SOCKET_INNER_RIM = 'rgba(120,100,60,0.18)' as const
const HEADER_COUNT_NUMERATOR = '#f4a73e' as const
const HEADER_COUNT_DENOM = 'rgba(232,223,200,0.55)' as const
const HEADER_LABEL_ROMAN = 'rgba(232,223,200,0.92)' as const
const HEADER_LABEL_KANJI_IDLE = '#d4892a' as const
const HEADER_LABEL_KANJI_ARMED = '#f4a73e' as const

// In-flight orb-rise entry: one per landed orb this spin.
interface OrbRiseEntry {
  active: boolean
  startTime: number
  fromX: number
  fromY: number
  toX: number
  toY: number
  orbIndex: number
}

// Header geometry snapshot, written each frame so the reel-land trigger can
// resolve socket destinations + cell centers without recomputing layout.
interface HeaderGeom {
  hbH: number           // header band height (0 on mobile / during bonus)
  isMobile: boolean
  socketCx: [number, number, number]
  socketCy: number
  orbD: number
}

// ─── Painted slot interior backplate alpha (art-director 2026-05-28) ──────────
// Per OO-REI-ART-DIRECTION-FINAL: the painted ink-wash mountain + paddy plate
// renders BEHIND the cells inside the clip region so the scene breathes through
// the semi-transparent cell paper. RG-C5 module-const, never streak-scaled.
// Reduced from 0.65 to 0.18: the ink-wash panel (new layer added 2026-05-29)
// provides the dark base. The per-cell backplate now serves only as a faint
// scene-hint (paddy atmosphere visible through each cell window), not darkening.
const SLOT_INTERIOR_BACKPLATE_ALPHA = 0.18
const SLOT_INTERIOR_BACKPLATE_PATH =
  '/assets/generated/oo-rei/slot-interior-backplate.jpg'

// ─── Cell background substrate constants (fairness-perception fix 2026-05-29) ──
//
// Root cause of the "looks rigged on landing" bug (Tim image 30):
//   Previously the cell-bg alpha was conditional on `animating`:
//     animating → row0: 0.28, row1+: 0.36
//     settled   → row0: 0.42, row1+: 0.54
//   This caused a visible opacity POP the instant the reel state transitioned
//   from 'decel' to 'idle', making it look like the game was changing the
//   outcome as symbols landed.
//
// Fix: the cell-bg substrate is CONSTANT across all reel states (spinning,
// decelerating, idle). The values chosen (0.42 / 0.54) match the old settled
// alpha so the post-land look is unchanged. The slightly higher alpha during
// spin (vs old 0.28/0.36) improves symbol legibility at cruise speed.
//
// The ONLY things allowed to differ between spinning and settled:
//   1. Symbol POSITION (strip scroll, handled by subOffsetPx).
//   2. Win-line / win-cell highlight AFTER settle.
//   3. Symbol filter (brightness / motion-stretch) — symbol layer, not cell-bg.
//   4. Border alpha for win/sticky/talisman states — win highlight, not spin state.
//
// RG-C5: module-const, identical for every reel regardless of session/wager/streak.
const CELL_BG_ALPHA_ROW0 = 0.42 as const   // Top row — consistent with settled look
const CELL_BG_ALPHA_ROW1 = 0.54 as const   // Middle + bottom rows
// Tier 1 (Tim 2026-06-04): lowered 0.40 -> 0.24 so the idle grid reads as soft
// stone seams between carved shrine tiles, not a hard "prison grid" of UI lines.
// The stone-gradient cell faces + top-rim highlights carry the cell definition;
// the border is now just a faint groove. Win/sticky borders are unchanged (full).
const CELL_BG_BORDER_ALPHA_IDLE = 0.24 as const   // Border alpha in normal/spinning state

// ─── Symbol multiplier badge labels (completeness spec 2026-05-28) ───────────
// Display-only: derived from SYMBOL_PAYS 5oaK column in ooReiMath.ts.
// NO math here -- these are the formatted display values only.
// Spirit Orb (7) uses kanji 符 (talisman seal) to preserve Anime Cinematic register.
const BADGE_LABELS: Record<SymbolId, string> = {
  0: '1.6x',  // Rice
  1: '2.4x',  // Stone
  2: '4x',    // Lantern
  3: '6x',    // Talisman
  4: '10x',   // Hat
  5: '16x',   // Eye
  6: '24x',   // Torii
  7: '符',    // Spirit Orb -- kanji for talisman seal
}

// ─── Animation state types ────────────────────────────────────────────────────

/**
 * Per-column reel animation state.
 *
 * REEL_STRIPS provides the symbol source per column; `stripOffset` is a
 * continuous pixel position that advances during a spin. The visible 3-row
 * window samples strip[(baseIndex + r) % stripLen] for r in [-1..3], so
 * symbols actually stream through the viewport.
 *
 * Phases:
 *  idle    — no motion; visible cells read from `grid` (or REEL_STRIPS fallback)
 *  accel   — velocity ramps from 0 to peak over ACCEL_MS
 *  cruise  — peak velocity, symbols streaming
 *  decel   — cubic-out ease to `decelTargetOffset`, snapping to grid[col][0..2]
 *
 * Decel triggers staggered per column so reels land left-to-right.
 */
type SpinState = 'idle' | 'cruise' | 'decel' | 'land'

interface ReelAnimState {
  stripOffset: number        // Continuous pixel offset (only meaningful while spinning)
  state: SpinState
  spinStartTime: number      // ts of accel start
  decelStartTime: number     // ts of decel start
  decelStartOffset: number   // stripOffset at decel start
  decelTargetOffset: number  // stripOffset at decel end (aligns to grid)
  /**
   * The integer strip index (mod stripLen) that the decel lazy-resolver committed
   * to. Stored at the moment targetBaseIdx is computed so the idle branch can
   * sample strip[lockedStopIdx + r] directly — eliminating the float round-trip
   * (decelTargetOffset → wrappedLocked → Math.floor → lockedBaseIdx) that caused
   * a ±1 index error when cellPitch is a non-integer canvas pixel value.
   *
   * FIX: "symbols change on landing" (Tim 2026-05-29).
   * Root cause: Math.floor((targetBaseIdx * cellPitch) / cellPitch) can produce
   * targetBaseIdx − 1 when cellPitch is not an exact integer (e.g. 87.333…px).
   * The last decel frame drew strip[targetBaseIdx + r]; the first idle frame
   * drew strip[targetBaseIdx − 1 + r] — a different symbol — making it look
   * as though the game changed the outcome at landing.
   *
   * -1 = sentinel "not yet resolved" (set to a valid index by decel lazy-resolve).
   */
  lockedStopIdx: number
  // Landing beat phase (constant choreography — RG-C3/C5 compliant)
  landStartTime: number      // ts when 'land' phase started
  landDirection: 1 | -1      // always -1 (over-travel upward for downward-scrolling strip)
}

// Peak velocity bumped again 2026-05-28 per Tim verbatim image 59:
// "On Cast (wager) it needs to spin super fast and the reverse roll should be
// slow." Cruise now 2.5 px/ms (~20 cells/sec — Hacksaw Gaming / NetEnt pace,
// faster than Pragmatic Play). Decel lengthened to 900ms with a 7-cell arc
// so the reel SETTLES rather than slams — the "reverse roll" feels deliberate.
const CRUISE_PEAK_VEL = 2.5 as const          // px / ms  (was 1.6 — Tim wants "super fast")
// Decel timing is owned by ooReiSignatures.ts (single source of truth) so the
// provider's win-reveal gate (REEL_SETTLE_TO_REVEAL_MS) can never drift from the
// actual reel-land duration. These aliases keep every existing usage intact.
const DECEL_MS = REEL_DECEL_MS                 // ease into the stop (900ms — Tim wants slow settle)
const DECEL_STAGGER_MS = REEL_DECEL_STAGGER_MS // col N starts decel N×200ms after col 0
const CRUISE_MIN_MS = 500 as const            // minimum cruise time before first reel can stop
// Decel target distance is chosen so v(0+) of decel matches CRUISE_PEAK_VEL —
// no spike at the cruise→decel handoff. For cubic-out: v(0+) = 3·D/T.
// To make v(0+) == CRUISE_PEAK_VEL: D = CRUISE_PEAK_VEL × DECEL_MS / 3
// = 2.5 × 900 / 3 = 750 px ≈ 6 cells at cellPitch ~125. Rounded to 7 cells
// per column (5 cells minimum + col-based stagger) so the settle feels
// generous — the player sees the reel slow visibly over many cells.
const DECEL_TARGET_CELLS = 7 as const

interface StoneLiftState {
  active: boolean
  startTime: number
}

interface WinTraceState {
  active: boolean
  startTime: number
  winCols: ReadonlyArray<number>  // Which columns have wins
}

/**
 * Per-cell sequential illumination state — drives Beat 3 (LIGHT MATCHES).
 * After WIN_ANTICIPATION_GAP_MS of silence, each winning cell lights up in
 * sequence (staggered WIN_SYMBOL_LIGHT_STAGGER_MS per cell). The payline
 * trace and kanji are gated to fire only after ALL cells have lit.
 *
 * litCount: how many cells have lit so far (0 = none yet; === winCols.length = all done).
 * winCols: ordered list of columns to illuminate.
 * audio is fired via the setTimeout chain in the win-reveal useEffect.
 */
interface WinCellLightState {
  active: boolean
  /** Ordered list of columns being illuminated left to right. */
  winCols: ReadonlyArray<number>
  /** How many cells have lit so far. Used by draw code to determine which cells glow. */
  litCount: number
  /** Timestamp when litCount was last incremented — for the draw code's glow alpha. */
  lastLitTime: number
}

interface SumieSplashState {
  active: boolean
  startTime: number
  direction: 'enter' | 'exit'  // Enter = wipe from left to right covering, exit = reveals
}

interface KanjiGlyphState {
  active: boolean
  startTime: number
  tier: WinTier        // Win tier at trigger time — drives banner vs. glyph-only path
  glyph: string        // The kanji character(s) -- 良 / 大 / 神 / 霊光
  subtitle: string     // English subtitle -- NICE WIN / BIG WIN / MEGA WIN / SPIRIT LIGHT
  bannerTop: string    // Banner gradient dark-edge CSS color (tier-specific, 'nice' only)
  bannerMid: string    // Banner gradient bright-mid CSS color (tier-specific, 'nice' only)
  scale: number        // Current scale (animated)
}

/**
 * Per-winning-tile scale state: driven by the win-reveal phase.
 * Tracks the pop scale and glow for each cell in winCols.
 */
interface WinTileState {
  active: boolean
  startTime: number
  isBig: boolean   // true if BIG/MEGA tier → WIN_TILE_SCALE_BIG, else STANDARD
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OoReiSlotCanvasProps {
  readonly grid: ReelGrid | null
  readonly isSpinning: boolean
  readonly paylineWins: ReadonlyArray<PaylineWin>
  readonly showWinHighlight: boolean
  readonly stickyWildCells: ReadonlySet<string>
  readonly isSpiritBonusActive: boolean
  readonly talismanAwakenCells: ReadonlyArray<readonly [number, number]>
  readonly onSpinComplete?: () => void
  /**
   * Pre-computed win tier from computeWinTier() in ooReiSignatures.
   * The canvas maps this to canvas banner behavior (amber on charcoal).
   * Defaults to 'none' (no banner). OoReiExperience passes this down.
   */
  readonly winTier?: WinTier
  /**
   * Called once the trace draw + savor hold are complete, signalling the DOM
   * WIN panel is now safe to mount. Fires at:
   *   traceActivateAt + WIN_TRACE_DRAW_DURATION_MS + WIN_SAVOR_HOLD_MS
   * RG-C5: the timer is module-const; the callback fires at the same offset
   * for every win tier and wager size.
   */
  readonly onWinSavorComplete?: () => void
  /**
   * Staggered world-aftershock signal (Pass 6 aliveness — §1.5).
   * Called AFTERSHOCK_DELAY_MS (165ms) after the win-settle headline fires.
   * OoReiExperience wires this to the region-banner nudge transform.
   * Only fires on win outcomes (tier !== 'none'). Never fires on loss. RG-C1.
   */
  readonly onAfterShock?: () => void
  /**
   * AUTHORITATIVE stop indices from the provider's evaluateSpin call.
   * When provided, the canvas uses these directly for decel targeting instead
   * of reverse-searching the strip — making display == settlement BY CONSTRUCTION.
   *
   * Architecture: ooReiProvider's `randomStops()` + `evaluateSpin(stops)` produces
   * `grid[col][r] = REEL_STRIPS[col][(stops[col] + r) % len]` by definition.
   * With settledStops[col] === stops[col], lockedStopIdx === stops[col], so
   * `strip[(lockedStopIdx + r) % stripLen] === grid[col][r]` — provably identical,
   * no reverse-search needed, failsafe eliminated.
   *
   * Optional: when null/undefined, the canvas falls back to reverse-search
   * (for backward-compatibility with callers that don't yet pass stops).
   *
   * Wire-up: pass `lastSpinStops` from useOoRei() to this prop via OoReiExperience.
   */
  readonly settledStops?: ReadonlyArray<number> | null
  /**
   * Region spirit premium-symbol art (B.2). When set, the Spirit Orb symbol
   * (SymbolId 7) is re-skinned to the active region's spirit emblem
   * (spirit-arashi / spirit-shio / ...). RTP-neutral: only symbol 7's painted
   * art changes -- its paytable and reel-strip weight are untouched. Null keeps
   * the default Spirit Orb. OoReiExperience derives it from the active region.
   */
  readonly regionSpiritSymbolSrc?: string | null
  /**
   * Per-region themed symbol overrides for SymbolIds 0-6 (B.2 expanded --
   * Storm Coast symbol skins, 2026-05-31). A partial map: only symbol ids
   * with a dedicated skin for this region are present. For each id present,
   * the canvas attempts to load the themed path; if the image fails (file not
   * yet on disk), it silently falls back to the default SYMBOL_PATHS[id].
   * Missing symbol ids always render the default asset.
   * RTP-neutral: art swap only. Paytable and reel-strip weights are untouched.
   * Null keeps all default symbols. OoReiExperience derives from active region.
   */
  readonly regionThemedSymbolSrcs?: Readonly<Partial<Record<number, string>>> | null
  /** @deprecated -- kept for backward-compat; canvas now reads winTier prop instead */
  readonly wagerLamports?: bigint
  /** @deprecated -- kept for backward-compat; canvas now reads winTier prop instead */
  readonly totalWinLamports?: bigint
  /**
   * Active myth-region slug (e.g. 'storm-coast', 'ember-forge').
   * Drives the per-region cell palette via getCellPalette().
   * Only cellBg/cellBgAlt/cellBorder/cellBorderActive vary -- amber accents,
   * watermark, rain, sumi-e, and kanji tokens are region-invariant.
   * RTP-neutral: display-only cosmetic colour change.
   */
  readonly activeRegionId?: string | null
  /**
   * @deprecated No-op since 2026-06-02. The Spirit Bonus tracker is now drawn
   * canvas-native (the Living Spirit Header carved into the board frame top),
   * so no DOM anchor geometry is needed. Retained for backward-compat with any
   * caller still passing it; the prop is never invoked.
   */
  readonly onBoardRect?: (rect: { x: number; y: number; w: number; h: number }) => void
  /**
   * Active region spirit cutout PNG (e.g. storm-coast → cinematic/spirits/
   * arashi-loom-v2.png, the PALE luminous storm-dragon), from
   * regionSpiritCutoutForRegion(activeRegionId). Drives the in-board DEPTH-WEAVE
   * dragon: head in FRONT of the band, body BEHIND the slot tiles. Null → the
   * figure is skipped (the header band still draws sockets + count). Display-only.
   */
  readonly spiritHeaderSrc?: string | null
  /**
   * Live Spirit Orb count on the displayed grid (0-3), from countSpiritOrbs()
   * in OoReiExperience. DISPLAY ONLY — the canvas never computes RTP math from
   * it. Drives which sockets show filled, the orbIndex assigned to a new rise
   * triggered by a reel stop, and the 3/3 armed eye-ignite + ambient pulse.
   */
  readonly scatterCount?: number
  /**
   * Spirit-form presence 0-1 (Tim 2026-06-02 — Fix 1 z-order). Drives the alpha
   * of the in-board cinematic dragon (drawn in BOARD space, in FRONT of the
   * ink-wash panel band-bg, BEHIND the slot tiles). Sourced from the same
   * SPIRIT_FORM_OPACITY gauge ramp as the lobby DOM spirit so the dragon's
   * presence still GROWS with the Spirit Gauge. Display-only; RG-C5 (form-driven,
   * never streak/session/wager). Default 0 (dragon not drawn).
   */
  readonly spiritOpacity?: number
}

export function OoReiSlotCanvas({
  grid,
  isSpinning,
  paylineWins,
  showWinHighlight,
  stickyWildCells,
  isSpiritBonusActive,
  talismanAwakenCells,
  winTier = 'none',
  onWinSavorComplete,
  onAfterShock,
  settledStops = null,
  regionSpiritSymbolSrc = null,
  regionThemedSymbolSrcs = null,
  wagerLamports: _wagerLamports = 1_000_000n,
  totalWinLamports: _totalWinLamports = 0n,
  activeRegionId = null,
  onBoardRect,
  spiritHeaderSrc = null,
  scatterCount = 0,
  spiritOpacity = 0,
}: OoReiSlotCanvasProps): ReactElement {
  // onBoardRect (re-enabled 2026-06-02): reports the board PANEL rect in CSS px
  // (same coordinate space as the inset:0 character layer) so the DOM ARASHI
  // dragon can be anchored to the board's top-right corner — integrated WITH the
  // slot tile area (Tim #98), not a full-viewport background layer. Fired only on
  // layout change (change-guarded in the draw loop), never per-frame.
  // Per-region cell palette: derives cellBg/cellBgAlt/cellBorder/cellBorderActive.
  // All amber accent tokens, watermark, rain, sumi-e, and kanji are region-invariant.
  // RTP-neutral display-only cosmetic colour change. Zero cyan across all palettes.
  const cellPalette = getCellPalette(activeRegionId ?? null)
  // winTier drives the canvas banner now (single authority via ooReiSignatures.computeWinTier)
  const winTierRef = useRef<WinTier>('none')
  winTierRef.current = winTier
  // BACK canvas (z-2): everything EXCEPT the cell tiles — frame, panel bg +
  // gradient, spirit-bonus band + orb sockets + header text, haze, idle/outer
  // glow, dais/plinth, vignette, left/right bleed, rain.
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // FRONT canvas (z-4): ONLY the cell-grid content — clipped reel strips, symbol
  // sprites, per-cell bg/border, win highlight + dim, win-trace, per-cell badges,
  // hit-stop sub-cell bounce, plus the win-celebration marks (stone-lift, tier
  // stamp, sumi-e wipe) that must sit ABOVE the tiles. Transparent everywhere else.
  // The DOM ARASHI dragon (z-3) sits BETWEEN these two canvases — in front of the
  // back panel/band, behind the front tiles (Tim #103 three-level depth, 2026-06-03).
  const frontCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number>(0)

  // Symbol image cache -- loaded once, drawn every frame when ready
  const symbolImagesRef = useRef<Partial<Record<SymbolId, HTMLImageElement>>>({})
  const symbolsLoadedRef = useRef<boolean>(false)

  // Painted slot interior backplate -- art-director 2026-05-28.
  // Rendered BEHIND cells inside the clip region so the ink-wash mountain +
  // paddy scene breathes through the semi-transparent cell paper.
  const backplateImageRef = useRef<HTMLImageElement | null>(null)

  // Animation state refs (no React state -- rAF discipline)
  const reelStates = useRef<ReelAnimState[]>(
    Array.from({ length: COLS }, () => ({
      stripOffset: 0,
      state: 'idle' as SpinState,
      spinStartTime: 0,
      decelStartTime: 0,
      decelStartOffset: 0,
      decelTargetOffset: 0,
      lockedStopIdx: -1,  // -1 = sentinel (no committed stop yet)
      landStartTime: 0,
      landDirection: -1 as const,
    }))
  )
  const stoneLiftRef = useRef<StoneLiftState>({ active: false, startTime: 0 })
  const winTraceRef = useRef<WinTraceState>({ active: false, startTime: 0, winCols: [] })
  // Beat 3: per-cell sequential illumination (LIGHT MATCHES phase).
  // Sequenced by the win-reveal useEffect; read each frame by the draw loop.
  const winCellLightRef = useRef<WinCellLightState>({
    active: false,
    winCols: [],
    litCount: 0,
    lastLitTime: 0,
  })
  const sumieSplashRef = useRef<SumieSplashState>({ active: false, startTime: 0, direction: 'enter' })
  const kanjiGlyphRef = useRef<KanjiGlyphState>({
    active: false, startTime: 0, tier: 'none', glyph: '良', subtitle: '',
    bannerTop: '#1a3a1a', bannerMid: '#3d7a3d', scale: 0,
  })

  // Win-tile pop state (Fix 2): amber glow rim + scale 1.10 on winning cells
  const winTileRef = useRef<WinTileState>({ active: false, startTime: 0, isBig: false })

  // Landing tick fired guard — one boolean per column, reset on each new spin.
  // Prevents double-firing playReelTick() if the rAF loop fires multiple frames
  // in the same decel→land transition tick (RG-C5: constant, outcome-independent).
  const reelLandTickFiredRef = useRef<boolean[]>(Array.from({ length: COLS }, () => false))
  // TRUE only once EVERY reel has visually landed (all decel arcs complete). The
  // win-reveal choreography gates on this so the payline trace can NEVER draw
  // before the cards land — that early draw read as "rigged" (Tim 2026-06-01).
  const allReelsLandedRef = useRef<boolean>(false)
  // Per-settle savor-fired guard (Tim 2026-06-02: "sometimes the winnings do not
  // even pop up as an overlay"). The win-reveal effect re-runs whenever
  // `paylineWins` identity changes (it is a useMemo keyed on `phase`, so the
  // win-reveal→settled transition produces a NEW array identity). That re-run
  // tears down the pending savor setTimeout in its cleanup, then re-arms a fresh
  // chain — but if the second chain's timer outlives the win-reveal window the
  // overlay-mount signal is lost. This boolean makes onWinSavorComplete fire
  // EXACTLY ONCE per settled win regardless of how many times the effect re-runs:
  // the first chain to reach the savor beat wins; later chains short-circuit.
  // Reset to false on every new spin (re-arm). RG-C5: not session/streak state.
  const savorFiredRef = useRef<boolean>(false)

  const lastRainRedrawRef = useRef<number>(0)
  const rainLinesRef = useRef<Array<{ x: number; y: number; len: number; opacity: number }>>([])
  const spiritAuraPhaseRef = useRef<number>(0)
  // Idle board-aura ambient breath (spec §4a): 0.04Hz, base-game only.
  // dt-based advance so it is frame-rate-independent. RG-C5 module-const rate.
  const idleAuraPhaseRef = useRef<number>(0)
  // Stone cell gradient cache (spec §2a): keyed on `${cellH}:${r}` (0 or non-0).
  // Invalidated when cellH changes (i.e. on resize). Prevents recreating per frame.
  const stoneCellGradCacheRef = useRef<Map<string, CanvasGradient>>(new Map())
  const stoneCellGradCacheKeyRef = useRef<number>(-1)  // tracks last cellH for invalidation
  // prefers-reduced-motion: cached once at mount (static media query, DOM C).
  const prefersReducedMotionRef = useRef<boolean>(false)
  // Per-column stop candidates for the decel lazy-resolver.
  //
  // When settledStops prop is provided (authoritative path):
  //   stopCandidatesRef[col] = [settledStops[col]] — a single-element array.
  //   The lazy-resolver's "pick nearest forward" logic works correctly with
  //   one candidate, computing the smallest N such that
  //   stops[col] + N*stripLen >= currentBaseIdx + minCellAdvance.
  //   lockedStopIdx then equals stops[col] % stripLen === stops[col] (provider
  //   uses floor(rng()*len), always in [0,len)), giving BY-CONSTRUCTION identity:
  //     strip[(lockedStopIdx + r) % stripLen] === grid[col][r].
  //
  // When settledStops prop is absent (fallback reverse-search path):
  //   stopCandidatesRef[col] = all i where strip[i..i+2] === grid[col][0..2].
  //   Multiple matches possible (duplicate 3-windows in the strip). The
  //   lazy-resolver picks the nearest forward one to bound decel distance.
  //   This path is preserved for backward-compatibility. The failsafe
  //   (push(0) when matches is empty) has been replaced with a dev warning;
  //   ooReiMath.test.ts INV-2 proves candidates is never empty for valid strips.
  const stopCandidatesRef = useRef<number[][]>(Array.from({ length: COLS }, () => []))
  // Frame timing (for time-based animation independent of frame rate)
  const lastFrameTsRef = useRef<number>(0)

  // Props refs (no render on prop change in rAF loop)
  const isSpinningRef = useRef<boolean>(false)
  const gridRef = useRef<ReelGrid | null>(null)
  const settledStopsRef = useRef<ReadonlyArray<number> | null>(null)
  const paylineWinsRef = useRef<ReadonlyArray<PaylineWin>>([])
  const showWinHighlightRef = useRef<boolean>(false)
  const stickyWildRef = useRef<ReadonlySet<string>>(new Set())
  const talismanAwakenRef = useRef<ReadonlyArray<readonly [number, number]>>([])
  const isSpiritBonusRef = useRef<boolean>(false)

  // Per-column symbol pop state (Pass 6 aliveness — §1.4 landing tick).
  // One entry per column; startTime = -1 means inactive.
  // RG-C5: amplitude SYMBOL_POP_SCALE (1.03) is module-const, outcome-independent.
  const symbolPopRef = useRef<Array<{ startTime: number }>>(
    Array.from({ length: COLS }, () => ({ startTime: -1 }))
  )

  // Callback refs (avoids stale closure in setTimeout chain)
  const onWinSavorCompleteRef = useRef(onWinSavorComplete)
  onWinSavorCompleteRef.current = onWinSavorComplete
  const onAfterShockRef = useRef(onAfterShock)
  onAfterShockRef.current = onAfterShock

  // ── Living Spirit Header state (canvas-native scatter tracker) ──────────────
  // The active region spirit cutout, loaded once per src + feathered into an
  // offscreen canvas so the per-frame draw is a single drawImage with zero
  // allocations. Mobile skips the offscreen entirely (no header band, no figure).
  const spiritHeaderImageRef = useRef<HTMLImageElement | null>(null)
  const spiritHeaderSrcRef = useRef<string | null>(null)
  const spiritHeaderOffscreenRef = useRef<HTMLCanvasElement | null>(null)
  const spiritHeaderOffscreenKeyRef = useRef<string>('')  // `${src}:${w}x${h}` invalidation key
  // In-board cinematic dragon (Fix 1 z-order, 2026-06-02): reuses the same
  // preloaded spiritHeaderImageRef, but feathered into its OWN offscreen at the
  // larger board-relative size. Separate cache so it never collides with the
  // (currently disabled) header-band offscreen above.
  const slotDragonOffscreenRef = useRef<HTMLCanvasElement | null>(null)
  const slotDragonOffscreenKeyRef = useRef<string>('')  // `${src}:${w}x${h}` invalidation key
  // onBoardRect plumbing: latest callback mirrored into a ref (loop has empty deps)
  // + the last-reported rect so we fire ONLY on layout change, never per-frame.
  const onBoardRectRef = useRef(onBoardRect)
  const lastBoardRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  // DEV-ONLY: last-computed in-board dragon geometry (read via __ooReiGetDragonGeom).
  const slotDragonGeomRef = useRef<Record<string, number> | null>(null)
  // Shrine-alcove warm-charcoal ground (Tim 2026-06-02). The PRIMARY 4-stop
  // gradient is static (depends only on figureCx/cy + hbH), so it is cached as a
  // CanvasGradient and invalidated only when those change — zero per-frame alloc.
  // The amber edge layer animates with NICHE_BREATH so it is recreated each frame
  // (one small createRadialGradient call — acceptable; see openRisks LOW).
  const alcovePrimaryGradRef = useRef<CanvasGradient | null>(null)
  const alcovePrimaryGradKeyRef = useRef<string>('')  // `${cx},${cy},${hbH}` invalidation
  // The single ≤0.04Hz ambient breath of the alcove's inner amber warmth.
  // Advances every base-game frame (dt-based, frame-rate-independent). RG-C5.
  const nicheBreathPhaseRef = useRef<number>(0)
  // Live orb count (display only). Synced from the scatterCount prop each render.
  const scatterCountRef = useRef<number>(0)
  // Per-socket fill alpha [0,1] and the timestamp each socket began filling (-1 =
  // not yet). Reset on each new spin. Driven by the rAF loop as ORB_FILL_MS elapses.
  const orbFillAlphaRef = useRef<[number, number, number]>([0, 0, 0])
  const orbFillStartTimeRef = useRef<[number, number, number]>([-1, -1, -1])
  // In-flight orb rises (array — two orbs can land in one spin). Reset per spin.
  const orbRiseRef = useRef<OrbRiseEntry[]>([])
  // Per-column rise-fired guard (mirrors reelLandTickFiredRef) so the rise pushes
  // exactly once per landed column, never double-firing on a same-tick boundary.
  const orbRiseFiredRef = useRef<boolean[]>(Array.from({ length: COLS }, () => false))
  // Running count of orbs whose rise has fired this spin → assigns orbIndex.
  const orbCountForCurrentSpinRef = useRef<number>(0)
  // 3/3 eye-ignite bloom + shared ambient pulse phase (advances every frame).
  const eyeIgniteRef = useRef<{ active: boolean; startTime: number }>({ active: false, startTime: 0 })
  const orbArmedPhaseRef = useRef<number>(0)
  // Live header geometry, written each frame for the reel-land rise trigger.
  const headerGeomRef = useRef<HeaderGeom>({
    hbH: 0,
    isMobile: false,
    socketCx: [0, 0, 0],
    socketCy: 0,
    orbD: 0,
  })
  // Font-ready flags for crisp header typography (Noto Serif JP + Geist Mono).
  const geistMonoReadyRef = useRef<boolean>(false)
  const notoSerifJPReadyRef = useRef<boolean>(false)
  // Spirit-form presence 0-1 for the in-board cinematic dragon alpha (Fix 1).
  const spiritOpacityRef = useRef<number>(0)

  // Sync refs
  isSpinningRef.current = isSpinning
  gridRef.current = grid
  settledStopsRef.current = settledStops
  paylineWinsRef.current = paylineWins
  showWinHighlightRef.current = showWinHighlight
  stickyWildRef.current = stickyWildCells
  talismanAwakenRef.current = talismanAwakenCells
  isSpiritBonusRef.current = isSpiritBonusActive
  scatterCountRef.current = scatterCount
  spiritOpacityRef.current = spiritOpacity
  onBoardRectRef.current = onBoardRect

  // Load symbol images + painted interior backplate once
  useEffect(() => {
    if (symbolsLoadedRef.current) return
    symbolsLoadedRef.current = true
    // Cache prefers-reduced-motion at mount (static query — does not change mid-session).
    prefersReducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const symIds: SymbolId[] = [0, 1, 2, 3, 4, 5, 6, 7]
    for (const id of symIds) {
      const img = new Image()
      img.src = SYMBOL_PATHS[id]
      img.onload = () => {
        symbolImagesRef.current[id] = img
      }
    }

    // Painted ink-wash interior backplate (art-director 2026-05-28).
    // Loaded once, painted inside the cell clip at SLOT_INTERIOR_BACKPLATE_ALPHA
    // so the scene reads as a window into the paddy/mountain rather than an
    // opaque cell well.
    const backplateImg = new Image()
    backplateImg.src = SLOT_INTERIOR_BACKPLATE_PATH
    backplateImg.onload = () => {
      backplateImageRef.current = backplateImg
    }

    // Font-load guard for the header typography (Living Spirit Header). The draw
    // loop only paints the count / label once the face is ready, so it is never
    // a wrong-metrics fallback serif. Probe synchronously, then resolve on ready.
    if (typeof document !== 'undefined' && document.fonts) {
      try {
        geistMonoReadyRef.current = document.fonts.check('800 14px "Geist Mono"')
        notoSerifJPReadyRef.current = document.fonts.check('700 14px "Noto Serif JP"')
      } catch {
        // document.fonts.check can throw on malformed font strings in some
        // engines — fall through to the .ready resolution below. Fail-open here
        // is display-only (text simply appears one frame later).
      }
      document.fonts.ready
        .then(() => {
          geistMonoReadyRef.current = true
          notoSerifJPReadyRef.current = true
        })
        .catch(() => {
          // ignore — text falls back to the synchronous probe result
        })
    }
  }, [])

  // ── Living Spirit Header — region spirit cutout preload + feathering ────────
  // One Image() per region cutout src, cached + soft-feathered into an offscreen
  // canvas ONCE per src so the per-frame draw is a single drawImage with zero
  // allocations. The feather (bottom/top/left/right gradient masks via
  // destination-in) dissolves the figure INTO the board frame so it is not a
  // cut-out sticker. The offscreen is rebuilt when the src changes OR the figure
  // draw size changes (resize) — see the rebuild call in the rAF loop. Loaded
  // off the rAF loop here; the loop checks img.complete before drawing.
  useEffect(() => {
    spiritHeaderSrcRef.current = spiritHeaderSrc
    if (!spiritHeaderSrc) {
      spiritHeaderImageRef.current = null
      spiritHeaderOffscreenRef.current = null
      spiritHeaderOffscreenKeyRef.current = ''
      slotDragonOffscreenRef.current = null
      slotDragonOffscreenKeyRef.current = ''
      return
    }
    const img = new Image()
    img.src = spiritHeaderSrc
    img.onload = () => {
      // Guard against a stale load resolving after the region changed again.
      if (spiritHeaderSrcRef.current === spiritHeaderSrc) {
        spiritHeaderImageRef.current = img
        // Force an offscreen rebuild next frame (key reset) — both the (disabled)
        // header-band offscreen and the in-board dragon offscreen.
        spiritHeaderOffscreenKeyRef.current = ''
        slotDragonOffscreenKeyRef.current = ''
      }
    }
    // On error: leave the image ref untouched (the loop skips the figure draw).
  }, [spiritHeaderSrc])

  // B.2 -- re-skin the premium symbol (SymbolId 7) to the active region's spirit.
  // Authoritative for slot 7: when a region spirit src is provided, load it;
  // otherwise restore the default Spirit Orb. RTP-neutral (art only -- pays and
  // strip weights are untouched). Keyed on the src so it re-loads per region.
  useEffect(() => {
    const targetSrc = regionSpiritSymbolSrc ?? SYMBOL_PATHS[7]
    const img = new Image()
    img.src = targetSrc
    img.onload = () => {
      symbolImagesRef.current[7] = img
    }
  }, [regionSpiritSymbolSrc])

  // B.2 expanded -- re-skin symbols 0-6 with per-region themed art (Storm Coast
  // symbol set, 2026-05-31). For each symbol id in the themed map, attempt to
  // load the themed image. On load success the cache slot is updated; if the
  // file is missing (404 / error), the existing default image stays in place --
  // guaranteed by NOT updating the cache slot on error. Caller passes null when
  // no themed set is available; all 7 symbols revert to their default paths via
  // an explicit reload. Keyed on the map object reference (stable per region
  // transition, same object across renders for the same region). RTP-neutral.
  useEffect(() => {
    const symIds = [0, 1, 2, 3, 4, 5, 6] as const
    for (const id of symIds) {
      const themedSrc = regionThemedSymbolSrcs?.[id]
      if (themedSrc) {
        // Attempt to load the themed asset; fall back silently on error.
        const img = new Image()
        img.src = themedSrc
        img.onload = () => {
          symbolImagesRef.current[id] = img
        }
        // On error: do NOT overwrite the cache slot -- the default asset
        // loaded at mount remains, so the reel never renders a broken image.
      } else {
        // No themed override for this id: restore the default asset.
        // This handles the region-change case: storm-coast -> tide-shore
        // reverts to the default paddy symbols.
        const defaultSrc = SYMBOL_PATHS[id]
        if (defaultSrc) {
          const img = new Image()
          img.src = defaultSrc
          img.onload = () => {
            symbolImagesRef.current[id] = img
          }
        }
      }
    }
  // Stringify the themed map as dependency: React identity comparison is
  // unreliable for plain objects across re-renders in the prop chain.
  // JSON.stringify is safe here (small fixed-size partial record of strings).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(regionThemedSymbolSrcs)])

  // Trigger reel spin when isSpinning changes
  useEffect(() => {
    if (!isSpinning) {
      // isSpinning went false: trigger staggered decel per column toward the
      // grid that the provider just settled. Read grid via gridRef (always
      // current). decelTargetOffset is computed lazily once we know the
      // strip-index that aligns visible row[0..2] with grid[col][0..2].
      const settledGrid = gridRef.current
      if (!settledGrid) return
      // Snapshot the authoritative stops at effect-fire time (not inside setTimeout).
      // settledStopsRef is already current (synced on every render above).
      const authStops = settledStopsRef.current
      for (let col = 0; col < COLS; col++) {
        const s = reelStates.current[col]
        if (!s || s.state === 'idle') continue
        const strip = REEL_STRIPS[col]
        if (!strip) continue
        const stripLen = strip.length

        // ── Authoritative path (settledStops prop provided) ─────────────────
        // settledStops[col] is the EXACT integer stop index that the provider
        // passed to resolveGrid(stops), so grid[col][r] = strip[(stops[col]+r)%len]
        // by definition. Using it as the sole candidate guarantees:
        //   lockedStopIdx === stops[col] % stripLen === stops[col]  (provider
        //   uses floor(rng()*len), always in [0,len)).
        //   ⟹ strip[(lockedStopIdx + r) % stripLen] === grid[col][r]  — display
        //   equals settlement BY CONSTRUCTION, no reverse-search needed,
        //   no failsafe possible.
        //
        // ── Fallback path (settledStops prop absent) ─────────────────────────
        // Reverse-search the strip for all positions where the 3-window matches
        // grid[col][0..2]. Multiple matches possible (duplicate patterns in the
        // strip). The lazy-resolver picks the nearest-forward one to keep decel
        // distance bounded and the cruise→decel velocity continuous.
        // ooReiMath.test.ts INV-2 proves candidates is never empty for valid
        // REEL_STRIPS — the old `matches.push(0)` failsafe has been replaced
        // with a dev warning so mismatches surface in CI rather than silently
        // landing on strip index 0.
        let candidates: number[]
        if (authStops != null && col < authStops.length) {
          // Authoritative: single entry = exact settlement stop.
          const authStop = authStops[col]
          candidates = authStop !== undefined ? [((authStop % stripLen) + stripLen) % stripLen] : []
        } else {
          // Fallback: reverse-search for all matching 3-windows.
          const target0 = settledGrid[col]?.[0]
          const target1 = settledGrid[col]?.[1]
          const target2 = settledGrid[col]?.[2]
          candidates = []
          for (let i = 0; i < stripLen; i++) {
            if (
              strip[i] === target0 &&
              strip[(i + 1) % stripLen] === target1 &&
              strip[(i + 2) % stripLen] === target2
            ) {
              candidates.push(i)
            }
          }
          if (candidates.length === 0) {
            // INV-2 in ooReiMath.test.ts proves this is dead code for valid strips.
            // Log in dev so CI catches any strip mutation that breaks the invariant.
            if (process.env.NODE_ENV !== 'production') {
              console.warn(
                `[OoReiSlotCanvas] No strip match for col ${col} — ` +
                `grid=[${settledGrid[col]?.join(',')}]. ` +
                `Falling back to index 0 (display may not match settlement).`,
              )
            }
            candidates = [0]
          }
        }

        // CRITICAL: decelStartTime and decelStartOffset are ONLY set as NaN
        // sentinels here. They are resolved LAZILY on the first decel rAF
        // frame (inside the state machine below) against the CURRENT
        // stripOffset, so the quintic arc starts from the actual position
        // the reel is at, not from a stale snapshot taken at setTimeout
        // fire-time. This eliminates the velocity spike that happens when
        // cruise drifts the offset between setTimeout and the next rAF tick.
        setTimeout(() => {
          const sNow = reelStates.current[col]
          if (!sNow) return
          stopCandidatesRef.current[col] = candidates
          sNow.state = 'decel'
          sNow.decelStartTime = Number.NaN
          sNow.decelStartOffset = Number.NaN
          sNow.decelTargetOffset = Number.NaN
        }, col * DECEL_STAGGER_MS)
      }

      return
    }

    // isSpinning went true: kick all reels directly into cruise.
    //
    // Tim feedback (2026-05-28 image 43): "the speed sequence is not right,
    // it goes slowly first then fast after. Should be the other way around."
    // Real slot reels burst into motion at peak velocity and decelerate to
    // a stop — they don't ramp up. The accel ramp was reading as a slow
    // start before the cruise kicked in. Skipping accel entirely; the reel
    // is at CRUISE_PEAK_VEL from frame 0.
    const now = performance.now()
    for (let col = 0; col < COLS; col++) {
      const s = reelStates.current[col]
      if (!s) continue
      s.state = 'cruise'
      s.spinStartTime = now
      s.stripOffset = 0
      s.lockedStopIdx = -1  // reset: no committed stop for this new spin yet
      stopCandidatesRef.current[col] = []
    }
    // Reset win-tile, cell-light, landing-tick guards, and symbol pop on new spin
    reelLandTickFiredRef.current = Array.from({ length: COLS }, () => false)
    allReelsLandedRef.current = false  // re-arm the win-reveal land gate
    savorFiredRef.current = false      // re-arm the once-per-settle savor signal
    winTileRef.current = { active: false, startTime: 0, isBig: false }
    winCellLightRef.current = { active: false, winCols: [], litCount: 0, lastLitTime: 0 }
    for (let c = 0; c < COLS; c++) {
      const pop = symbolPopRef.current[c]
      if (pop) pop.startTime = -1
    }
    // Living Spirit Header per-spin reset (spec §persistence.phaseChangeReset):
    // sockets empty, no in-flight rises, eye dark, rise guards re-armed. The
    // shared armed-pulse phase (orbArmedPhaseRef) is intentionally NOT reset so
    // the ambient pulse stays smooth across spins. The spirit figure + sockets
    // remain visible at 0/3 during the spin (drawn from scatterCountRef).
    orbFillAlphaRef.current = [0, 0, 0]
    orbFillStartTimeRef.current = [-1, -1, -1]
    eyeIgniteRef.current = { active: false, startTime: 0 }
    orbRiseRef.current = []
    orbRiseFiredRef.current = Array.from({ length: COLS }, () => false)
    orbCountForCurrentSpinRef.current = 0
  }, [isSpinning])

  // Win animation trigger — orchestrates the celebration sequence.
  //
  // CHOREOGRAPHY (RG-C5 module-const timings — all values from ooReiSignatures):
  //
  //   Beat 1 — LAND (t=0ms):
  //     Reels have settled. NO trace, NO highlight, NO banner yet.
  //     The player sees the symbols on the grid.
  //
  //   Beat 2 — ANTICIPATION GAP (t=WIN_ANTICIPATION_GAP_MS = 200ms):
  //     Nothing happens. The held silence that builds tension.
  //     (swoobz-sound-immersion Beat 2 reference.)
  //
  //   Beat 3 — LIGHT MATCHES (starting at 200ms, staggered 80ms per cell):
  //     Each winning cell illuminates in sequence left-to-right.
  //     winCellLightRef.litCount increments per setTimeout.
  //     playWinSymbolLight() fires once per cell (zero-param, RG-C5).
  //     Duration: nCells × WIN_SYMBOL_LIGHT_STAGGER_MS ms.
  //
  //   Beat 4 — DRAW LINE (after last cell + WIN_LINE_DRAW_DELAY_MS = 80ms):
  //     winTraceRef activates → amber brushstroke draws across the lit cells.
  //     playPaylineDraw() fires once (zero-param, RG-C5).
  //     Simultaneously: kanji bloom + winTile pop + stone-lift aftershock.
  //
  //   Beat 5 — RESOLVE: tier banner holds, then receipt after WIN_REVEAL_MS.
  //
  // RG-C5 STRUCTURAL: all timings are module-const imports from ooReiSignatures.
  //   They CANNOT vary with wager / session / streak state.
  // RG-C1: 'none' tier = no banner, no audio (sub-break-even wins are silent).
  // 2026-05-28: winTierRef (prop, from computeWinTier) is the single authority.
  useEffect(() => {
    if (!showWinHighlight || paylineWins.length === 0) return

    // ── REEL-LAND GATE (Tim 2026-06-01: "the winning line draws before the
    // cards land — makes it look rigged"). The entire reveal choreography (cell
    // lights, payline trace, banner) must NOT begin until EVERY reel has
    // visually landed. showWinHighlight flips at the React 'settled' phase, but
    // the canvas reels keep decelerating for up to ~1.7s after that. We gate the
    // choreography start on allReelsLandedRef and poll until it is true. ──────
    let tInitLight: ReturnType<typeof setTimeout> | null = null
    const cellTimers: ReturnType<typeof setTimeout>[] = []
    let tTrace: ReturnType<typeof setTimeout> | null = null
    let tStone: ReturnType<typeof setTimeout> | null = null
    let tSavor: ReturnType<typeof setTimeout> | null = null
    let tAfterShock: ReturnType<typeof setTimeout> | null = null
    let landGate: ReturnType<typeof setInterval> | null = null

    const runChoreography = () => {
    // Ordered unique winning columns (left to right for staggered lighting).
    const winCols = Array.from(
      new Set(paylineWins.flatMap((pw) => pw.matchedCols))
    ).sort((a, b) => a - b)

    const nCells = winCols.length
    // Total light-up duration (ms): nCells × stagger.
    const totalLightMs = nCells * WIN_SYMBOL_LIGHT_STAGGER_MS
    // When the payline trace activates relative to t=0.
    const traceActivateAt = WIN_ANTICIPATION_GAP_MS + totalLightMs + WIN_LINE_DRAW_DELAY_MS
    // Stone-lift fires at mid-draw so stones rise as the brushstroke completes.
    // Previously hardcoded +80ms (trace barely started); now at +250ms (mid-draw).
    const stoneLiftAt = traceActivateAt + WIN_TRACE_DRAW_DURATION_MS / 2
    // Panel savor gate: fires when trace draw + savor hold are both complete.
    const savorCompleteAt = traceActivateAt + WIN_TRACE_DRAW_DURATION_MS + WIN_SAVOR_HOLD_MS

    // Beat 2 → Beat 3: initialise cell-light state (lights start at tAntGap).
    tInitLight = setTimeout(() => {
      winCellLightRef.current = {
        active: true,
        winCols,
        litCount: 0,
        lastLitTime: performance.now(),
      }
    }, WIN_ANTICIPATION_GAP_MS)

    // Beat 3: per-cell staggered setTimeout chain.
    // Each timeout increments litCount and fires the koto-shimmer chime.
    // RG-C5: playWinSymbolLight() is zero-param — same chime for every cell.
    for (let i = 0; i < nCells; i++) {
      const delay = WIN_ANTICIPATION_GAP_MS + i * WIN_SYMBOL_LIGHT_STAGGER_MS
      const cellTimer = setTimeout(() => {
        winCellLightRef.current.litCount = i + 1
        winCellLightRef.current.lastLitTime = performance.now()
        playWinSymbolLight()
      }, delay)
      cellTimers.push(cellTimer)
    }

    // Beat 4: activate win trace + fire payline-draw audio + kanji bloom + winTile pop.
    // All gated to fire AFTER the last cell has lit + WIN_LINE_DRAW_DELAY_MS.
    tTrace = setTimeout(() => {
      // Activate the amber brushstroke trace (now sequenced — was immediate).
      winTraceRef.current = {
        active: true,
        startTime: performance.now(),
        winCols,
      }

      // Payline-draw brush sweep audio — fires once as the line draws.
      // Zero-param, RG-C5 structural.
      playPaylineDraw()

      // Canvas tier → glyph mapping. Single authority: winTierRef (from prop).
      // ZERO violet/purple. All banner colors are amber on charcoal palette.
      // RG-C5: same timing for all tiers; only glyph + color differ (character, not amplitude).
      // RG-C1: 'none' tier = no banner (sub-break-even wins are silent).
      let isBig = false
      const tier = winTierRef.current
      if (tier === 'mega') {
        isBig = true
        kanjiGlyphRef.current = {
          active: true, startTime: performance.now(), tier: 'mega',
          glyph: '神勝',           // Shin-sho — Divine Victory
          subtitle: 'MEGA WIN',
          bannerTop: 'rgba(26, 22, 14, 0.95)',
          bannerMid: 'rgba(244, 167, 62, 0.95)',  // talisman-glow burst
          scale: 0,
        }
      } else if (tier === 'big') {
        isBig = true
        kanjiGlyphRef.current = {
          active: true, startTime: performance.now(), tier: 'big',
          glyph: '大勝',           // Dai-sho — Big Victory
          subtitle: 'BIG WIN',
          bannerTop: 'rgba(26, 22, 14, 0.95)',
          bannerMid: 'rgba(244, 167, 62, 0.92)',  // amber burst
          scale: 0,
        }
      } else if (tier === 'good') {
        // isBig stays false — uses WIN_TILE_SCALE_STANDARD (waveform character, not amplitude)
        kanjiGlyphRef.current = {
          active: true, startTime: performance.now(), tier: 'good',
          glyph: '大',             // Dai — great
          subtitle: 'GOOD WIN',
          bannerTop: 'rgba(26, 22, 14, 0.92)',
          bannerMid: 'rgba(212, 137, 42, 0.85)',  // medium amber
          scale: 0,
        }
      } else if (tier === 'nice') {
        // isBig stays false — uses WIN_TILE_SCALE_STANDARD
        kanjiGlyphRef.current = {
          active: true, startTime: performance.now(), tier: 'nice',
          glyph: '良',             // Yoshi — nice / good
          subtitle: 'NICE WIN',
          bannerTop: 'rgba(26, 22, 14, 0.88)',
          bannerMid: 'rgba(212, 137, 42, 0.70)',  // thin amber
          scale: 0,
        }
      }
      // 'none' tier: no kanjiGlyph activation (RG-C1 compliant — sub-break-even silent)

      // Win-tile pop — amber glow rim + scale 1.10 from cell center.
      // Gated here (Beat 4) so cells are visibly glowing before they pop.
      // isBig → WIN_TILE_SCALE_BIG (waveform character, not escalating amplitude. RG-C5.)
      // Only fire tile pop for tiers that have a visual beat (not 'none').
      if (tier !== 'none') {
        winTileRef.current = {
          active: true,
          startTime: performance.now(),
          isBig,
        }
      }
    }, traceActivateAt)

    // Stone-lift — rises at mid-draw (traceActivateAt + WIN_TRACE_DRAW_DURATION_MS / 2).
    tStone = setTimeout(() => {
      stoneLiftRef.current = { active: true, startTime: performance.now() }
    }, stoneLiftAt)

    // Savor gate — fires when trace fully drawn + WIN_SAVOR_HOLD_MS elapsed.
    // Signals OoReiExperience that the DOM WIN panel is now safe to mount.
    // RG-C5: module-const offset, identical for every win tier and wager size.
    tSavor = setTimeout(() => {
      // Fire EXACTLY ONCE per settled win. If the effect re-ran mid-choreography
      // (new paylineWins identity on the win-reveal→settled flip) the previous
      // chain's tSavor was cleared in cleanup and this fresh chain re-armed it;
      // the guard ensures only the first chain to reach the beat signals the
      // overlay mount, and a duplicate late chain can never double-fire it.
      if (savorFiredRef.current) return
      savorFiredRef.current = true
      onWinSavorCompleteRef.current?.()
    }, savorCompleteAt)

    // World-aftershock signal (Pass 6 aliveness — §1.5).
    // Fires AFTERSHOCK_DELAY_MS (165ms) after the trace activates (Beat 4).
    // Triggers region-banner nudge in OoReiExperience via the onAfterShock callback.
    // RG-C1: only fires when tier !== 'none' (wins only, never loss state).
    // RG-C5: module-const delay, identical for every win tier and wager size.
    if (winTierRef.current !== 'none') {
      tAfterShock = setTimeout(() => {
        onAfterShockRef.current?.()
      }, traceActivateAt + AFTERSHOCK_DELAY_MS)
    }
    } // end runChoreography

    // Start immediately if the cards have already landed; otherwise poll the
    // land gate every 60ms and start the instant the last reel lands.
    if (allReelsLandedRef.current) {
      runChoreography()
    } else {
      landGate = setInterval(() => {
        if (allReelsLandedRef.current) {
          if (landGate !== null) { clearInterval(landGate); landGate = null }
          runChoreography()
        }
      }, 60)
    }

    return () => {
      if (landGate !== null) clearInterval(landGate)
      if (tInitLight !== null) clearTimeout(tInitLight)
      for (const t of cellTimers) clearTimeout(t)
      if (tTrace !== null) clearTimeout(tTrace)
      if (tStone !== null) clearTimeout(tStone)
      if (tSavor !== null) clearTimeout(tSavor)
      if (tAfterShock !== null) clearTimeout(tAfterShock)
    }
  }, [showWinHighlight, paylineWins])

  // Resize handler — sizes + dpr-scales BOTH canvases identically (same rect,
  // same dpr) so the FRONT cell layer aligns pixel-for-pixel with the BACK panel.
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    function resize() {
      if (!canvas || !container) return
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const rect = container.getBoundingClientRect()
      const sizeCanvas = (c: HTMLCanvasElement | null) => {
        if (!c) return
        c.width = rect.width * dpr
        c.height = rect.height * dpr
        c.style.width = `${rect.width}px`
        c.style.height = `${rect.height}px`
        const cctx = c.getContext('2d')
        if (cctx) {
          // setTransform resets any prior scale before re-applying (a bare
          // scale() compounds across resizes). Identity then dpr scale.
          cctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
      }
      sizeCanvas(canvas)
      sizeCanvas(frontCanvasRef.current)
      // Invalidate stone cell gradient cache on resize — gradients are geometry-bound.
      stoneCellGradCacheRef.current.clear()
      stoneCellGradCacheKeyRef.current = -1
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // rAF loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function drawFrame(ts: number) {
      const cvs = canvasRef.current
      if (!cvs) return
      // BACK context — panel / band / sockets / haze / dais / dragon-ground.
      const bctx = cvs.getContext('2d')
      if (!bctx) return
      // FRONT context — ONLY the cell tiles + win marks (transparent elsewhere).
      // If the front canvas is not yet mounted (first frame race) fall back to the
      // back context so nothing is dropped; the next frame resolves it cleanly.
      const fcvs = frontCanvasRef.current
      const fctx = fcvs ? fcvs.getContext('2d') : null

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const W = cvs.width / dpr
      const H = cvs.height / dpr

      // `ctx` is the ACTIVE draw target. The whole routine below was authored
      // against a single `ctx`; we keep that and SWAP `ctx` between the back and
      // front contexts at the two layer boundaries (cell-grid block + win marks)
      // rather than threading two params through ~1800 lines. This is a pure
      // render-target change — the reel state machine / decel / hit-stop / win
      // choreography are untouched. `ctx` starts as BACK.
      let ctx: CanvasRenderingContext2D = bctx

      // Clear BOTH canvases every frame (front may be the same ref as back during
      // the first-frame fallback — clearing twice is harmless).
      bctx.clearRect(0, 0, W, H)
      if (fctx && fctx !== bctx) fctx.clearRect(0, 0, W, H)

      // ── Rain streak overlay (canvas-paint scanlines, NOT particles) ─────────
      // Per BRAND_REGISTER.md §6 and ART_DIRECTION_FINAL: rain is authored
      // scanlines redrawn at 250ms intervals, NOT a particle system.
      if (ts - lastRainRedrawRef.current > RAIN_REDRAW_INTERVAL_MS) {
        lastRainRedrawRef.current = ts
        // Generate rain lines: sparse for base game, denser during spirit bonus
        const rainCount = isSpiritBonusRef.current ? 28 : 16
        rainLinesRef.current = Array.from({ length: rainCount }, () => ({
          x: Math.random() * W,
          y: Math.random() * H,
          len: 10 + Math.random() * 18,
          opacity: 0.04 + Math.random() * 0.06,
        }))
      }
      ctx.save()
      ctx.lineWidth = 1
      for (const line of rainLinesRef.current) {
        // Rain falls at a slight angle (1px right per 5px down)
        ctx.strokeStyle = `rgba(180, 165, 145, ${line.opacity})`
        ctx.beginPath()
        ctx.moveTo(line.x, line.y)
        ctx.lineTo(line.x + line.len * 0.18, line.y + line.len)
        ctx.stroke()
      }
      ctx.restore()

      // ── Grid layout ─────────────────────────────────────────────────────────
      // Layout rebuild 2026-05-29: RESERVED_BOTTOM abolished. The grid is now
      // sized to sit above a fixed-height DOM HUD band (88px desktop / 80px
      // Pixel-7). The HUD band never overlaps the grid — grid bottom edge sits
      // 8px above the band top edge.
      //
      // TARGET GRID METRICS (replaces RESERVED_BOTTOM=360 + gridW=W*0.58):
      //
      // HUD_BAND_HEIGHT: 3-tier responsive — mirrors DOM HUD band heights exactly.
      // < 481px → mobile 160px canvas reserve (DOM band 178px, 18px safe margin).
      // 481–900px → tablet 84px (DOM band 84px; single-row layout).
      // > 900px → desktop 200px (DOM band 200px; 5-col layout).
      // Threshold update: w < 481 (was w < 500) aligns with new DOM breakpoints.
      const isMobile = W < 481
      const isTabletCanvas = W >= 481 && W < 901
      const HUD_BAND_HEIGHT = isMobile ? 160 : isTabletCanvas ? 84 : 200
      // RESERVED_TOP = compact title tape (64px) + the Living Spirit Header band.
      // The header band is CARVED INTO the board frame top (composition-designer
      // spec 2026-06-02): the active region spirit coils across it and collects
      // the 3 Spirit Orbs. RESERVED_TOP shifts gridY down by the band height so
      // the band sits between the lacquer panel's top edge and the cell zone — one
      // continuous board object (NOT a separate DOM overlay).
      //   desktop (W>=901): 72px band   tablet (481..900): 56px band
      //   mobile (W<481):    0px band — a compact in-board row carries the count
      //   during Spirit Bonus: 0px — the bonus owns its own identity; cells regain
      //     the band space. The sumi-e splash wipe covers the one-frame gridY shift.
      const isSpiritBonusNow = isSpiritBonusRef.current
      const headerBandH = isSpiritBonusNow
        ? 0
        : isMobile
          ? SPIRIT_HEADER_BAND_H_MOBILE
          : isTabletCanvas
            ? SPIRIT_HEADER_BAND_H_TABLET
            : SPIRIT_HEADER_BAND_H_DESKTOP
      const SCATTER_HEADER_RESERVE = headerBandH
      const RESERVED_TOP = 64 + SCATTER_HEADER_RESERVE

      // availableH = canvas height minus header tape and HUD band, minus 8px breath.
      const availableH = Math.max(240, H - RESERVED_TOP - HUD_BAND_HEIGHT - 8)

      // DESKTOP (W ≥ 500):
      //   gridW: min(W*0.74, W-32, 680) — grid fills ~74% canvas width centred.
      //   gridH: min(H*0.56, availableH, 480) — near-square tall cells.
      //
      // PIXEL-7 (W < 500):
      //   gridW: W - 24 — nearly full canvas width; tiles fill the hand.
      //   gridH: min(H*0.48, 340) — max 340px on mobile, no thumb-zone overflow.
      //   gridX: 12 — left 12px gutter; Rei is BEHIND/OVERLAPPING not a side gutter.
      // Board scale fix (spec §1 Fix A + Fix D): cap raised from 680→820 and 480→560.
      // At 1440px desktop: min(0.72*1440, 1408, 820) = 820px — board spans gridX=310..1130.
      // At 1024px: min(737, 992, 820) = 737px — reasonable.
      // The W−32 guard keeps ≥16px gutter on any screen. gridH cap 480→560 uses more
      // of the vertical zone. Responsive geometry harness must be re-recorded after this.
      const gridW = isMobile
        ? W - 24
        : Math.min(W * 0.72, W - 32, 820)

      const gridH = isMobile
        ? Math.min(H * 0.48, 340, availableH)
        : Math.min(H * 0.58, availableH, 560)

      // gridX: Composition Pass 2 (2026-05-31) — left margin reduced from
      // W*0.13 to W*0.10 so the board's left columns move closer to Rei.
      // At 1440px: 0.10×1440=144px vs the old 0.13×1440=187px — 43px shift
      // leftward, cutting the Rei-board gap noticeably. Rei's container is
      // 32% wide (460px) and her painted body occupies ~60% = ~276px, so
      // at gridX=144 the board's left edge is at x=144 and Rei's body edge
      // is around x=270-300 — meaning Rei genuinely overlaps the left ~150px
      // of the board, exactly the "in front of left columns" depth read.
      // W/2-gridW/2 stays as a centering fallback for very wide displays.
      const gridX = isMobile
        ? 12
        : Math.max(W * 0.10, W / 2 - gridW / 2)

      // gridY: vertically centred in the hot zone between header and HUD band.
      // RESERVED_TOP now includes the Living Spirit Header band (headerBandH), so
      // the header band occupies y = (gridY - headerBandH) .. gridY — carved into
      // the board frame top, drawn after the cells below.
      const gridY = RESERVED_TOP + (availableH - gridH) / 2

      // ── Report the board PANEL rect (CSS px) on layout change ────────────────
      // The visible board content top is the band top (gridY - headerBandH); the
      // DOM ARASHI dragon anchors its head to this rect's top-right corner so it
      // drapes over the board (Tim #98), not the viewport. Fire only on change.
      if (onBoardRectRef.current) {
        const br = { x: gridX, y: gridY - headerBandH, w: gridW, h: gridH + headerBandH }
        const prev = lastBoardRectRef.current
        if (
          !prev ||
          Math.abs(prev.x - br.x) > 1 || Math.abs(prev.y - br.y) > 1 ||
          Math.abs(prev.w - br.w) > 1 || Math.abs(prev.h - br.h) > 1
        ) {
          lastBoardRectRef.current = br
          onBoardRectRef.current(br)
        }
      }

      const cellW = (gridW - CELL_PAD * (COLS + 1)) / COLS
      const cellH = (gridH - CELL_PAD * (ROWS + 1)) / ROWS

      // ── Spirit-field depth haze (spec §5c warm basalt ground) ────────────────
      // Center shifted downward (gridH * 0.2 offset) so haze reads as the ground
      // plane under the board, not cosmic mist above it.
      // Purple cast removed — pure warm-dark basalt. Zero cyan.
      const hazeCx = gridX + gridW / 2
      // Spec §5c: shift center DOWN toward the stone ground (was gridH*0.52)
      const hazeCy = gridY + gridH * 0.52 + gridH * 0.2
      ctx.save()
      const hazeGrad = ctx.createRadialGradient(
        hazeCx, hazeCy, 0,
        hazeCx, hazeCy, Math.max(gridW, gridH) * 0.80
      )
      hazeGrad.addColorStop(0,    'rgba(28, 22, 18, 0.30)')  // warm dark, not purple
      hazeGrad.addColorStop(0.35, 'rgba(22, 18, 14, 0.18)')
      hazeGrad.addColorStop(1,    'rgba(20, 16, 12, 0)')
      ctx.fillStyle = hazeGrad
      ctx.beginPath()
      ctx.ellipse(hazeCx, hazeCy, gridW * 0.95, gridH * 0.80, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Freestanding torii pillars + spirit-thread REMOVED 2026-05-28 per
      // Tim verbatim image 58: "i really do not like that things are not
      // aligned, the red poles on the side". The atmospheric haze alone
      // grounds the tablets in the scene now. If a scene-anchor element is
      // wanted in a future iteration, it should be COMMISSIONED as a painted
      // backdrop element (not procedural Canvas2D rectangles) — the
      // composition-designer's freestanding-pillars idea was a step toward
      // scene integration but the procedural draw read as a UI frame anyway.

      // ── Atmospheric edge bleeds (composition-designer 2026-05-28 BT-5) ─────
      // Two static canvas gradients that bleed the paddy backdrop INTO the
      // canvas edges, making the grid read as EMBEDDED in the scene rather
      // than floating above it.
      //
      // Left/Rei-side: 64px charcoal-to-transparent — wider on Rei's side so
      // the grid appears to EMERGE from behind her gesture. The grid starts
      // where her hands are; the atmosphere blurs the boundary.
      //
      // Right side: 48px charcoal-to-transparent — standard atmospheric fade.
      //
      // Bottom ground plane: 24px wet-mud gradient at canvas bottom so the
      // spirit-seal tablets appear to RISE from the paddy ground.
      //
      // These are static fills drawn each frame — not particles, not animation.
      // They are part of the canvas composition layer.
      ctx.save()

      // Left (Rei-side) atmospheric bleed — 80px (wider in Pass 2 to darken
      // the sea gap between Rei's right edge and the board's left columns).
      // The canvas left-side atmosphere merges with Rei's figure, reducing the
      // open-sea read in the gap. Still atmospheric (not a solid fill).
      // STRETCH the left atmospheric bleed across the FULL left margin (0 → the
      // board's left edge gridX) instead of a fixed 80px (Tim 2026-06-04 #121/#125:
      // the shadow behind Rei "does not fully stretch on wider screens — there is a
      // cut off line"). The fixed 80px ended mid-margin behind her leg on wide
      // screens; now it fades dark→transparent across the whole gap, so there is no
      // hard seam at any width. Warm browns only (zero cyan). Floor 80px so narrow
      // screens keep the original vignette.
      const leftBleedW = Math.max(80, gridX)
      const leftBleedGrad = ctx.createLinearGradient(0, 0, leftBleedW, 0)
      leftBleedGrad.addColorStop(0,    'rgba(30, 23, 15, 0.55)')
      leftBleedGrad.addColorStop(0.5,  'rgba(34, 27, 18, 0.28)')
      leftBleedGrad.addColorStop(1,    'rgba(38, 30, 20, 0)')
      ctx.fillStyle = leftBleedGrad
      ctx.fillRect(0, 0, leftBleedW, H)

      // Right atmospheric bleed — 48px
      const rightBleedGrad = ctx.createLinearGradient(W - 48, 0, W, 0)
      rightBleedGrad.addColorStop(0,    'rgba(26, 22, 18, 0)')
      rightBleedGrad.addColorStop(0.3,  'rgba(26, 22, 18, 0.18)')
      rightBleedGrad.addColorStop(1,    'rgba(26, 22, 18, 0.55)')
      ctx.fillStyle = rightBleedGrad
      ctx.fillRect(W - 48, 0, 48, H)

      // ── Stone altar dais base + contact shadow (Composition Pass 2, 2026-05-31) ─
      //
      // Pass 1 had a 24px "wet-mud" gradient — too faint; the board still read
      // as a floating window. Pass 2 replaces it with a REAL stone altar base:
      //
      //  1. Dais plinth — a visible stone base rect below the panel's bottom
      //     edge. Height: 18px + CELL_PAD*1.5. Dark basalt, slightly lighter
      //     on top edge (wet stone rim catching diffuse sky light).
      //     Horizontally: same width as the panel (panelX → panelX + panelW)
      //     so it reads as the board literally resting on a stone slab.
      //
      //  2. Contact shadow pool — a darkened radial ellipse on the shore deck
      //     UNDER the dais base. Wide (panelW * 1.1), tall (20px), centered at
      //     dais base bottom. Near-black at center, fading to transparent.
      //     This is the shadow the stone slab casts onto the wet shore.
      //
      //  3. Dais depth haze — the stone shelf surface visible under the dais
      //     extends the shore plane. A horizontal gradient strip from the dais
      //     base down to canvas bottom, same dark-basalt tone, so the board
      //     is seen sitting ON the shore rather than floating above it.
      //
      // RG-C5: static geometry every frame — no outcome-correlated values.
      // prefers-reduced-motion: static draw, no animation.
      // Zero cyan. Palette: basalt (#1c1a20), wet rock (#242229), shadow black.
      {
        // Re-derive panel geometry (same calc as ink-wash panel above).
        // Local scope so we don't conflict with the ink-wash panel block's vars.
        // NOTE: must match the gridX formula above (W*0.10 not W*0.13 — Pass 2).
        // Dais geometry must mirror the gridW/gridX formula above (820 cap, 0.72 factor).
        const daisGridX = isMobile ? 12 : Math.max(W * 0.10, W / 2 - Math.min(W * 0.72, W - 32, 820) / 2)
        const daisGridW = isMobile ? W - 24 : Math.min(W * 0.72, W - 32, 820)
        const dasiPanelX = daisGridX - 8
        const daisPanelW = daisGridW + 16

        // Panel bottom Y: gridY + gridH + 8 (the ink-wash panel outer rect).
        // We place the dais plinth immediately below this.
        const daisPanelBottomY = gridY + gridH + 8
        const plinthH = 18   // visible stone base height (px)
        const plinthY = daisPanelBottomY

        // 1. Dais stone plinth
        ctx.save()
        // Top edge of plinth: slightly lighter stone (wet rim catching light)
        const plinthTopGrad = ctx.createLinearGradient(0, plinthY, 0, plinthY + plinthH)
        plinthTopGrad.addColorStop(0,    'rgba(42, 38, 48, 0.92)')
        plinthTopGrad.addColorStop(0.15, 'rgba(34, 32, 40, 0.96)')
        plinthTopGrad.addColorStop(1,    'rgba(24, 22, 28, 0.98)')
        ctx.fillStyle = plinthTopGrad
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(dasiPanelX, plinthY, daisPanelW, plinthH, [0, 0, 4, 4])
        } else {
          ctx.rect(dasiPanelX, plinthY, daisPanelW, plinthH)
        }
        ctx.fill()

        // Subtle top-edge gleam on plinth (wet stone rim)
        ctx.strokeStyle = 'rgba(56, 52, 64, 0.55)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(dasiPanelX, plinthY + 0.5)
        ctx.lineTo(dasiPanelX + daisPanelW, plinthY + 0.5)
        ctx.stroke()
        ctx.restore()

        // 2. Contact shadow pool under dais base — the most load-bearing change.
        // The shadow pools on the shore deck, widening slightly beyond the dais
        // edges. This is what makes the board READ as resting ON a surface rather
        // than hovering above it.
        ctx.save()
        const shadowCx = dasiPanelX + daisPanelW / 2
        const shadowCy = plinthY + plinthH + 2  // just below plinth base
        const shadowRx = daisPanelW * 0.58       // wide shadow (stone is solid)
        const shadowRy = 22                      // tall enough to pool visibly

        const shadowGrad = ctx.createRadialGradient(
          shadowCx, shadowCy, 0,
          shadowCx, shadowCy, shadowRx
        )
        shadowGrad.addColorStop(0,    'rgba(0, 0, 0, 0.72)')   // near-black center
        shadowGrad.addColorStop(0.35, 'rgba(0, 0, 0, 0.50)')
        shadowGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.22)')
        shadowGrad.addColorStop(1,    'rgba(0, 0, 0, 0)')
        ctx.fillStyle = shadowGrad
        ctx.beginPath()
        ctx.ellipse(shadowCx, shadowCy, shadowRx, shadowRy, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // 3. Dais depth haze — shore surface below dais extends the stone plane.
        // Bridges between the plinth base and the canvas bottom edge, so the
        // stone shore from the backdrop bleeds seamlessly into the canvas.
        ctx.save()
        const depthY = plinthY + plinthH + 4
        const depthH = Math.max(0, H - depthY)
        if (depthH > 0) {
          const depthGrad = ctx.createLinearGradient(0, depthY, 0, depthY + depthH)
          depthGrad.addColorStop(0,    'rgba(28, 26, 33, 0.82)')
          depthGrad.addColorStop(0.4,  'rgba(24, 22, 29, 0.72)')
          depthGrad.addColorStop(1,    'rgba(20, 18, 24, 0.60)')
          ctx.fillStyle = depthGrad
          ctx.fillRect(0, depthY, W, depthH)
        }
        ctx.restore()
      }

      ctx.restore()

      // ── Rei cast shadow onto board left edge (Composition Pass 2, 2026-05-31) ─
      //
      // Rei stands at the left edge of the shore deck. Her silhouette casts a
      // directional shadow rightward onto the board — this is what CONNECTS them
      // compositionally. Without a cast shadow, Rei and the board are independent
      // floating elements. With it, she reads as a physical figure on the same
      // surface as the board.
      //
      // Pass 1 had a 20px shadow at 0.20 alpha — too faint. Pass 2:
      //   - Widens the shadow spread from 20px → 44px (Rei is ~26% wide, so
      //     the shadow extends well past her edge into the board's left columns)
      //   - Two-stop gradient: hard near the silhouette edge, soft at the far end
      //   - Extended vertically: from gridY - 24 down to H (covers ground plane too)
      //     so her standing shadow hits the shore deck as well as the board face
      //
      // seamX at W*0.18: slightly left of Rei's painted body right edge
      // (~W*0.22 at desktop). With the board now at W*0.10 minimum, the shadow
      // starts just inside the board's first column — her cast shadow falls
      // directly on the stone panels, no empty sea gap between them.
      //
      // REMOVED (Tim 2026-06-04 #121/#125/#126: "the weird background shadow … there
      // is now a cut off line"). This was a fixed-position 50px "Rei standing shadow"
      // band hard-anchored at W*0.18 with a HARD 0.38-alpha left edge — on wider
      // screens it read as a random vertical shadow with a cut-off line, untethered
      // from Rei's actual (board-relative) position. Rei's grounding already comes
      // from her DOM contact-shadow + container drop-shadow, and the left atmospheric
      // bleed (stretched 0 → board edge above) fills the gap with NO hard seam. So
      // the band is removed rather than kept as a fixed-x artifact.

      // Frame delta — hoisted here because the idle-aura breath below needs it.
      // Single dt per frame (consumed again by the reel decel further down).
      const dt = lastFrameTsRef.current === 0 ? 16 : Math.min(50, ts - lastFrameTsRef.current)
      lastFrameTsRef.current = ts

      // ── Idle board-aura ambient breath (spec §4a) ────────────────────────────
      // ONE allowed ambient: a 0.04Hz amber outer glow on the board panel.
      // Fires ONLY in base-game idle (not spinning, not Spirit Bonus).
      // dt-based phase advance: 0.04 complete cycles per second regardless of fps.
      // Warm amber-to-basalt gradient drawn on a roundRect 14px outside the board.
      // RG-C5: module-const 0.04Hz rate. prefers-reduced-motion: skip entirely.
      // Zero cyan. Only transform/opacity analogs (Canvas2D fillStyle alpha).
      if (
        !isSpinningRef.current &&
        !isSpiritBonusRef.current &&
        !prefersReducedMotionRef.current
      ) {
        idleAuraPhaseRef.current += 0.04 * dt / 1000
        const idleAlpha = 0.06 + 0.04 * Math.sin(idleAuraPhaseRef.current * Math.PI * 2)
        ctx.save()
        const idleGlowGrad = ctx.createRadialGradient(
          gridX + gridW / 2, gridY + gridH / 2, Math.min(gridW, gridH) * 0.35,
          gridX + gridW / 2, gridY + gridH / 2, Math.max(gridW, gridH) * 0.72,
        )
        idleGlowGrad.addColorStop(0, 'rgba(212,137,42,0)')
        idleGlowGrad.addColorStop(0.6, `rgba(212,137,42,${(idleAlpha * 0.3).toFixed(3)})`)
        idleGlowGrad.addColorStop(1, `rgba(180,100,30,${idleAlpha.toFixed(3)})`)
        ctx.fillStyle = idleGlowGrad
        ctx.beginPath()
        ctx.roundRect(gridX - 14, gridY - 14 - headerBandH, gridW + 28, gridH + 28 + headerBandH, 14)
        ctx.fill()
        ctx.restore()
      }

      // ── Ink-wash panel behind cells ──────────────────────────────────────────
      // Near-opaque dark lacquer rect over the grid region so symbols read clearly
      // against a consistent sumi-e ground rather than the variable photographic
      // backdrop. The photographic scene remains visible at the outer canvas edges
      // (Rei's strip, frame perimeter) via the atmospheric bleeds above.
      //
      // Layer A — base dark lacquer fill (near-solid, #12080 register).
      // Layer B — slot-interior-backplate at 0.12 alpha (temporary sumi-e texture;
      //           replace with ink-wash-panel-tile.jpg when commissioned).
      //           Commission: 512×512px tileable sumi-e paper, deep charcoal, no
      //           figurative content, dry-brush ink strokes at 10–15% contrast.
      // Layer C — vignette: radial gradient from transparent center → 0.45 at edges.
      //
      // SLOT_INTERIOR_BACKPLATE_ALPHA is changed from 0.65 to 0.18 (below) so the
      // per-cell backplate draw serves only as a faint scene-hint, not the primary
      // darkening layer (the panel base fill handles that now).
      {
        // Panel extends UP by headerBandH so the Living Spirit Header band is
        // INSIDE the lacquer frame (one continuous object), not floating above it.
        const panelX = gridX - 8
        const panelY = gridY - 8 - headerBandH
        const panelW = gridW + 16
        const panelH = gridH + 16 + headerBandH
        ctx.save()
        // SHRINE-ALTAR GROUNDING (Tier 1, Tim 2026-06-04 composition critique):
        // a soft directional cast shadow so the panel reads as a RAISED altar slab
        // over the storm, not a flat UI inlay. Light source = the dragon's eye
        // (upper-right), so the shadow falls DOWN-LEFT. Built from a few stacked
        // translucent offset rounded-rects — NOT per-frame ctx.shadowBlur, which
        // dropped the back canvas to ~42fps. This stays 60. Zero cyan (cool-neutral
        // near-black). Corner radius 10 -> 14: a clearer carved-stone edge, less
        // "web panel". RG-C5: static geometry, no outcome-correlated values.
        if (ctx.roundRect) {
          const shLayers = [
            { dx: -3, dy: 5, a: 0.16 },
            { dx: -6, dy: 9, a: 0.12 },
            { dx: -10, dy: 14, a: 0.085 },
            { dx: -14, dy: 19, a: 0.05 },
          ]
          for (const s of shLayers) {
            ctx.fillStyle = `rgba(6, 5, 10, ${s.a})`
            ctx.beginPath()
            ctx.roundRect(panelX + s.dx, panelY + s.dy, panelW, panelH, 14)
            ctx.fill()
          }
        }
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(panelX, panelY, panelW, panelH, 14)
        } else {
          ctx.rect(panelX, panelY, panelW, panelH)
        }
        // Storm-coast lacquer. Near-opaque (0.96) THROUGHOUT — INCLUDING the header
        // band region at the top.
        // Tim 2026-06-02 (DEPTH-WEAVE / PALE dragon): the band background is restored
        // to clean opaque-ish lacquer. The earlier translucent-band hack existed only
        // to keep a DARK arashi.png from vanishing dark-on-dark behind an opaque band.
        // With the HEAD-FORWARD arashi-head.png render the dragon reads bold IN FRONT
        // of an opaque band on its own — so the band no longer needs to be see-through.
        // Z-weave is unchanged: the dragon is drawn AFTER this panel fill (in front of
        // the band bg) and BEFORE the slot tiles (which occlude the body where it dips
        // into the cell region). band-bg < dragon HEAD < tiles; tiles < dragon body
        // is occluded. A faint top-edge vignette (0.84 → 0.96 over the band) keeps a
        // soft sumi-e gradient at the very top without re-introducing the veil.
        // headerBandH===0 (bonus) → dividerFrac negligible → effectively solid lacquer.
        const dividerFrac = Math.min(0.5, Math.max(0.001, (headerBandH + 8) / panelH))
        const panelGrad = ctx.createLinearGradient(0, panelY, 0, panelY + panelH)
        panelGrad.addColorStop(0, 'rgba(14, 12, 20, 0.84)')
        panelGrad.addColorStop(Math.max(0, dividerFrac - 0.05), 'rgba(14, 12, 20, 0.92)')
        panelGrad.addColorStop(dividerFrac, 'rgba(14, 12, 20, 0.96)')
        panelGrad.addColorStop(1, 'rgba(14, 12, 20, 0.96)')
        ctx.fillStyle = panelGrad
        ctx.fill()
        // Kill the slab shadow — interior passes (texture, vignette, edge-dissolve)
        // must not re-cast it.
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        // Layer B: faint sumi-e texture from backplate (0.12 alpha, temporary)
        const panelBackplate = backplateImageRef.current
        if (panelBackplate && panelBackplate.complete && panelBackplate.naturalWidth > 0) {
          ctx.save()
          ctx.clip()
          ctx.globalAlpha = 0.12
          ctx.drawImage(panelBackplate, panelX, panelY, panelW, panelH)
          ctx.globalAlpha = 1
          ctx.restore()
        }
        // Layer C: vignette — depth at corners, eye drawn to center symbols
        const vigGrad = ctx.createRadialGradient(
          panelX + panelW / 2, panelY + panelH / 2, Math.min(panelW, panelH) * 0.2,
          panelX + panelW / 2, panelY + panelH / 2, Math.max(panelW, panelH) * 0.72,
        )
        vigGrad.addColorStop(0, 'rgba(0,0,0,0)')
        vigGrad.addColorStop(0.7, 'rgba(0,0,0,0.18)')
        vigGrad.addColorStop(1, 'rgba(0,0,0,0.45)')
        ctx.fillStyle = vigGrad
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(panelX, panelY, panelW, panelH, 14)
        } else {
          ctx.rect(panelX, panelY, panelW, panelH)
        }
        ctx.fill()
        // ── EDGE DISSOLVE (Tier 1) ────────────────────────────────────────────
        // Melt the panel's hard LEFT/RIGHT edges into the storm so the lacquer
        // reads as a surface IN the world, not a UI rectangle ON it. Cool storm-
        // grey (matches the backdrop sky; ZERO cyan — b<180) feathered inward on
        // each vertical edge, clipped to the rounded panel so the corners stay
        // carved. Top/bottom edges keep their crisp line (the header tape caps the
        // top; the stone dais grounds the bottom). The front-canvas cells draw over
        // the interior, so this only softens the visible panel margin + band edges.
        ctx.save()
        ctx.beginPath()
        if (ctx.roundRect) {
          ctx.roundRect(panelX, panelY, panelW, panelH, 14)
        } else {
          ctx.rect(panelX, panelY, panelW, panelH)
        }
        ctx.clip()
        const edgeDisW = Math.min(64, panelW * 0.07)
        const leftDis = ctx.createLinearGradient(panelX, 0, panelX + edgeDisW, 0)
        leftDis.addColorStop(0, 'rgba(34, 38, 52, 0.55)')
        leftDis.addColorStop(0.5, 'rgba(32, 36, 50, 0.20)')
        leftDis.addColorStop(1, 'rgba(30, 34, 46, 0)')
        ctx.fillStyle = leftDis
        ctx.fillRect(panelX, panelY, edgeDisW, panelH)
        const rightDis = ctx.createLinearGradient(panelX + panelW - edgeDisW, 0, panelX + panelW, 0)
        rightDis.addColorStop(0, 'rgba(30, 34, 46, 0)')
        rightDis.addColorStop(0.5, 'rgba(32, 36, 50, 0.20)')
        rightDis.addColorStop(1, 'rgba(34, 38, 52, 0.55)')
        ctx.fillStyle = rightDis
        ctx.fillRect(panelX + panelW - edgeDisW, panelY, edgeDisW, panelH)
        ctx.restore()
        ctx.restore()
      }

      // ══ IN-BOARD CINEMATIC DRAGON (Tim 2026-06-02 — Fix 1 z-order) ═══════════
      // "the dragon needs to be IN FRONT OF the Spirit bonus background but BEHIND
      // the slot tiles." Drawn HERE — AFTER the ink-wash panel base fill (so it is
      // in FRONT of the band background) and BEFORE the cell clip + symbol tiles
      // below (so the opaque tiles OCCLUDE it: band-bg < dragon < tiles). Depth.
      //
      // Gating: base-game board phases only. headerBandH > 0 implies NOT the Spirit
      // Bonus (bonus sets headerBandH=0 → no dragon here; the bonus owns its own
      // identity / curtain). The canvas never mounts in the lobby (Experience gates
      // on phase.kind !== 'lobby'), so this can never paint in the lobby. The DOM
      // z-1 spirit is suppressed in base-game (OoReiCharacterLayer) so there is no
      // double-spirit. Uses the preloaded spiritHeaderImageRef (single Image()).
      //
      // Alpha = SLOT_DRAGON_BASE_ALPHA × spiritOpacity (the gauge ramp) so the
      // dragon's presence still GROWS with the Spirit Gauge. RG-C5: base alpha +
      // sizing are module-consts; the only runtime input is the form-driven gauge
      // value (never streak/session/wager). Zero allocation per frame: the figure
      // is feathered ONCE into slotDragonOffscreenRef (rebuilt only on src/size
      // change), then a single drawImage per frame. Zero cyan (the PALE silver +
      // amber/gold lightning PNG is warm/neutral; no cool tone added in any pass).
      {
        const dragonImg = spiritHeaderImageRef.current
        const dragonPresence = Math.max(0, Math.min(1, spiritOpacityRef.current))
        if (
          headerBandH > 0 &&
          dragonPresence > 0.001 &&
          dragonImg &&
          dragonImg.complete &&
          dragonImg.naturalWidth > 0
        ) {
          // Panel geometry (mirrors the ink-wash panel block above).
          const panelTop = gridY - 8 - headerBandH
          const panelHt = gridH + 16 + headerBandH
          // HEAD-IN-BAND ANCHOR (Tim #94/#95 BOLD-head retune): size the dragon
          // RELATIVE TO THE BAND (headerBandH × SLOT_DRAGON_BAND_FILL_MULT) so the
          // head zone (top ~45% of the head-forward PNG = face + mane + amber eye)
          // FILLS the band height boldly, with the jaw/neck/coils trailing down ~1.3
          // cell-rows behind the ~82%-opaque tiles (occlusion = depth). Clamped to a
          // panel-height ceiling (never taller than the board) and to a width clamp
          // (head dominates the band RIGHT, clears the left "0/3 SPIRIT BONUS" label).
          // The PRIOR full-panel-height sizing made the head ~235px tall vs a 72px
          // band → only a sliver fit the band = "present but not bold". Width follows
          // the PNG aspect; the width clamp may shrink height to keep it in-frame.
          const panelCeilingH = panelHt * SLOT_DRAGON_H_FRAC
          let dragonH = Math.min(panelCeilingH, headerBandH * SLOT_DRAGON_BAND_FILL_MULT)
          let dragonW = dragonH * (dragonImg.naturalWidth / dragonImg.naturalHeight)
          const maxDragonW = gridW * SLOT_DRAGON_MAX_W_FRAC
          if (dragonW > maxDragonW) {
            dragonW = maxDragonW
            dragonH = dragonW * (dragonImg.naturalHeight / dragonImg.naturalWidth)
          }
          // Horizontal: centre, then bias RIGHT so the head clears the "0/3 SPIRIT
          // BONUS" label on the band LEFT.
          const dragonX = gridX + gridW / 2 - dragonW / 2 + gridW * SLOT_DRAGON_X_BIAS_FRAC
          // Vertical: CROWN-ANCHORED (Tim #94/#95 BOLD-head). The band is only ~72px
          // (desktop) — far shorter than a full dragon head — so the prior eye-at-band-
          // mid anchor pushed the mane CROWN well above the board top (clipped) and the
          // jaw deep into the occluded cells: only a thin eye-line slice was visible in
          // the band. Instead, anchor the MANE CROWN (PNG yFrac ≈ SLOT_DRAGON_CROWN_FRAC)
          // just below the band top so the FACE (crown → eye → snout) fills the band
          // boldly and only the lower jaw/neck trails into the first cell row (behind
          // tiles = depth). A tiny crown lead lets the very top of the mane feather over
          // the band's top edge. headScreenY (eye) is retained for the warm-halo centre.
          //   dragonY = bandTop - dragonH * CROWN_LEAD   (crown ≈ band top, small bleed)
          const bandTop = gridY - headerBandH
          const dragonY = bandTop - dragonH * SLOT_DRAGON_CROWN_LEAD_FRAC
          // Eye screen-Y for the warm-halo centre (PNG eye at HEAD_Y_FRAC down the cutout).
          const headScreenY = dragonY + dragonH * SLOT_DRAGON_HEAD_Y_FRAC
          if (process.env.NODE_ENV !== 'production') {
            slotDragonGeomRef.current = {
              dragonX, dragonY, dragonW, dragonH, headScreenY, bandTop,
              gridX, gridW, gridY, headerBandH, presence: dragonPresence,
            }
          }

          // Rebuild the feathered offscreen ONCE per src/size (no per-frame alloc).
          // The mask erases the bottom (dissolve into reels), top, and both sides so
          // there is no hard rectangle — mirrors the existing spiritHeader offscreen.
          const dKey = `${spiritHeaderSrcRef.current ?? ''}:${Math.round(dragonW)}x${Math.round(dragonH)}`
          if (
            slotDragonOffscreenKeyRef.current !== dKey &&
            dragonW >= 1 && dragonH >= 1
          ) {
            const off = document.createElement('canvas')
            off.width = Math.max(1, Math.round(dragonW))
            off.height = Math.max(1, Math.round(dragonH))
            const octx = off.getContext('2d')
            if (octx) {
              const ow = off.width
              const oh = off.height
              octx.clearRect(0, 0, ow, oh)
              octx.drawImage(dragonImg, 0, 0, ow, oh)
              // WARM TINT (baked once): arashi-head.png is a HEAD-FORWARD pale
              // silver-scaled dragon cutout. A 'source-atop' warm-amber wash over the
              // dragon's OWN opaque pixels enriches the cool silver toward the OO-REI
              // amber/gold register (silver → warm pewter) so it sits in-palette with
              // the storm-coast warm-stone HUD rather than reading as a flat cool grey
              // cutout. 'source-atop' tints only where the dragon is opaque; the
              // transparent ground stays transparent (no rectangle). Zero cyan — the
              // wash is pure amber (r > g > b). Baked into the offscreen ONCE — no
              // per-frame cost. NOTE: this is a TINT for palette cohesion, not a
              // dark-on-dark rescue (the pale render needs no luminance rescue); the
              // screen pass below additionally lifts the gold-lightning highlights.
              octx.globalCompositeOperation = 'source-atop'
              octx.fillStyle = 'rgba(168, 132, 78, 0.22)'  // MODERATE warm wash — enough warmth to sit in-palette, light enough to keep the pale silver luminous over the dark band. Zero cyan.
              octx.fillRect(0, 0, ow, oh)
              // LUMINANCE LIFT (Tim #94/#95 BOLD-head, baked once): the head region
              // of arashi-head.png is MID-GREY silver (sampled lum ~150) — against the
              // near-black Spirit-Bonus band the screen passes lifted it only to a dim
              // grey = "present but not bold". Compositing the cutout onto ITSELF with
              // 'lighter' (additive) pushes the mid-grey head toward LUMINOUS silver
              // (lum 150 → clamps high), so the FACE + mane read BOLD against the dark
              // band. 'lighter' is gated by the cutout alpha (transparent ground stays
              // transparent — no rectangle). A second warm 'overlay' biases the lift
              // toward the amber/gold register (zero cyan — additive of warm/neutral
              // silver stays warm/neutral; no cool channel introduced). Baked ONCE.
              octx.globalCompositeOperation = 'lighter'
              octx.globalAlpha = 0.55
              octx.drawImage(dragonImg, 0, 0, ow, oh)
              octx.globalAlpha = 1
              // Warm highlight bias on the now-brighter form (source-atop = only on the
              // dragon's opaque pixels). Pure amber (r > g > b). Keeps the lifted silver
              // from going flat-white and locks it into the OO-REI warm register.
              octx.globalCompositeOperation = 'source-atop'
              octx.fillStyle = 'rgba(196, 158, 96, 0.16)'
              octx.fillRect(0, 0, ow, oh)
              octx.globalCompositeOperation = 'destination-in'
              // Bottom feather: dissolves into the reel zone (longest fade).
              const bStart = oh * (1 - SLOT_DRAGON_FEATHER_BOTTOM)
              const gB = octx.createLinearGradient(0, bStart, 0, oh)
              gB.addColorStop(0, 'rgba(0,0,0,1)')
              gB.addColorStop(1, 'rgba(0,0,0,0)')
              octx.fillStyle = gB
              octx.fillRect(0, bStart, ow, oh - bStart)
              // Top feather.
              const tEnd = oh * SLOT_DRAGON_FEATHER_TOP
              const gT = octx.createLinearGradient(0, tEnd, 0, 0)
              gT.addColorStop(0, 'rgba(0,0,0,1)')
              gT.addColorStop(1, 'rgba(0,0,0,0)')
              octx.fillStyle = gT
              octx.fillRect(0, 0, ow, tEnd)
              // Left feather.
              const lEnd = ow * SLOT_DRAGON_FEATHER_SIDE
              const gL = octx.createLinearGradient(0, 0, lEnd, 0)
              gL.addColorStop(0, 'rgba(0,0,0,0)')
              gL.addColorStop(1, 'rgba(0,0,0,1)')
              octx.fillStyle = gL
              octx.fillRect(0, 0, lEnd, oh)
              // Right feather.
              const rStart = ow * (1 - SLOT_DRAGON_FEATHER_SIDE)
              const gR = octx.createLinearGradient(rStart, 0, ow, 0)
              gR.addColorStop(0, 'rgba(0,0,0,1)')
              gR.addColorStop(1, 'rgba(0,0,0,0)')
              octx.fillStyle = gR
              octx.fillRect(rStart, 0, ow - rStart, oh)
              octx.globalCompositeOperation = 'source-over'
              slotDragonOffscreenRef.current = off
              slotDragonOffscreenKeyRef.current = dKey
            }
          }

          const dOff = slotDragonOffscreenRef.current
          if (dOff) {
            ctx.save()
            // Clip to the panel rect so a wide-aspect dragon never bleeds outside
            // the board frame (it can only show within band + cell region; the
            // tiles drawn after then occlude the cell-region portion).
            ctx.beginPath()
            const dpX = gridX - 8
            const dpY = gridY - 8 - headerBandH
            if (ctx.roundRect) {
              ctx.roundRect(dpX, dpY, gridW + 16, gridH + 16 + headerBandH, 10)
            } else {
              ctx.rect(dpX, dpY, gridW + 16, gridH + 16 + headerBandH)
            }
            ctx.clip()
            const dragonAlpha = Math.min(
              0.92,
              SLOT_DRAGON_FLOOR_ALPHA + SLOT_DRAGON_RAMP_ALPHA * dragonPresence,
            )
            // WARM HALO GROUND (between the opaque band-bg and the dragon): a SOFT
            // warm-amber radial bloom seated behind the dragon's head/upper-coil mass.
            // This is a 'screen' (additive-ish) LIFT, not a dark recess — the earlier
            // dark-charcoal "alcove" buried the pale dragon to a dim brown (sampled
            // ~37,29,26 over the dark band → invisible). A luminous warm halo instead
            // brightens the band exactly where the dragon sits so the pale silver
            // form reads as an emerging spirit, not a flat dim ghost. Tracks the head
            // (right-biased, lifted into the band). Cheap (one radial). Zero cyan
            // (r > g > b warm). RG-C5: alpha is form-gauge-driven only.
            {
              const haloCx = dragonX + dragonW * 0.46
              const haloCy = headScreenY - headerBandH * 0.1
              const haloR = Math.max(gridW * 0.40, headerBandH * 4.5) * 0.6
              const hg = ctx.createRadialGradient(haloCx, haloCy, 0, haloCx, haloCy, haloR)
              hg.addColorStop(0.0, `rgba(150, 120, 74, ${(0.34 * dragonPresence + 0.22).toFixed(3)})`)
              hg.addColorStop(0.5, `rgba(96, 78, 48, ${(0.2 * dragonPresence + 0.1).toFixed(3)})`)
              hg.addColorStop(1.0, 'rgba(40, 32, 20, 0)')
              ctx.globalCompositeOperation = 'screen'
              ctx.globalAlpha = 1
              ctx.fillStyle = hg
              ctx.fillRect(dpX, dpY, gridW + 16, gridH + 16 + headerBandH)
            }
            // arashi-head.png is an ALPHA CUT-OUT (transparent ground) of a PALE
            // silver HEAD-FORWARD dragon with a white spectral mane + GOLD lightning. Two
            // passes give a BOLD, LUMINOUS, IN-FRONT read against the dark band:
            //   (1) a 'screen' pass lifts the bright values (gold lightning, silver
            //       rim, white mane) into a glowing silver silhouette over the band;
            //   (2) a 'source-over' (normal) pass lays the actual pale scales on top
            //       so the body has real density (not just a glow ghost).
            // Together: a bold luminous silver-white dragon in FRONT of the band-bg,
            // gold lightning popping. The transparent ground means neither pass paints
            // a rectangle. Zero cyan (the PNG + amber/gold + silver are warm/neutral;
            // no cool tone added). RG-C5: dragonAlpha is form-gauge-driven only.
            // (1a) screen pass — lift the bright silver/white/gold into a glow.
            ctx.globalCompositeOperation = 'screen'
            ctx.globalAlpha = dragonAlpha
            ctx.drawImage(dOff, dragonX, dragonY, dragonW, dragonH)
            // (1b) a second screen pass — the single screen over the near-opaque dark
            // band netted to a dim brown (sampled ~37,29,26 → invisible). A second
            // screen lift makes the pale form read LUMINOUS against the lacquer band.
            ctx.globalAlpha = dragonAlpha * 0.7
            ctx.drawImage(dOff, dragonX, dragonY, dragonW, dragonH)
            // (2) source-over pass at full presence — lays the actual pale scales on
            // top so the body has real DENSITY (a solid emerging form, not just glow).
            ctx.globalCompositeOperation = 'source-over'
            ctx.globalAlpha = Math.min(1, dragonAlpha + 0.06)
            ctx.drawImage(dOff, dragonX, dragonY, dragonW, dragonH)
            ctx.restore()
          }
        }
      }

      // ── SWOOBZ watermark (behind symbols) ────────────────────────────────────
      // QA fix: single alpha layer at 3.5% effective opacity.
      // Previous: globalAlpha 0.05 * fillStyle rgba(...,0.05) = 0.25% (invisible).
      // Fix: globalAlpha 1.0, fillStyle carries the full 3.5% as a single rgba value.
      ctx.save()
      ctx.globalAlpha = 1
      ctx.fillStyle = 'rgba(232, 223, 200, 0.035)'
      const wmFontSize = Math.floor(cellH * 0.35)
      ctx.font = `600 ${wmFontSize}px "Geist Mono", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('SWOOBZ', gridX + gridW / 2, gridY + gridH / 2)
      ctx.restore()

      // ── Spirit-aura rim (only during Spirit Bonus) ───────────────────────────
      // Per BRAND_REGISTER.md §6: "Spirit-aura radial gradient 0.04Hz breathing
      // ONLY during Spirit Bonus phase" -- amber economy job 3.
      if (isSpiritBonusRef.current) {
        spiritAuraPhaseRef.current += 0.0002  // ~0.04Hz at 60fps
        const auraAlpha = 0.22 + 0.12 * Math.sin(spiritAuraPhaseRef.current * Math.PI * 2)
        ctx.save()
        const rimGrad = ctx.createRadialGradient(
          gridX + gridW / 2, gridY + gridH / 2, Math.min(gridW, gridH) * 0.4,
          gridX + gridW / 2, gridY + gridH / 2, Math.max(gridW, gridH) * 0.65,
        )
        rimGrad.addColorStop(0, 'rgba(212,137,42,0)')
        rimGrad.addColorStop(0.7, `rgba(212,137,42,${auraAlpha * 0.4})`)
        rimGrad.addColorStop(1, `rgba(212,137,42,${auraAlpha})`)
        ctx.fillStyle = rimGrad
        ctx.beginPath()
        ctx.roundRect(
          gridX - 10, gridY - 10,
          gridW + 20, gridH + 20,
          10
        )
        ctx.fill()
        ctx.restore()
      }

      // ── Reel cells (streaming strip + per-reel decel) ───────────────────────
      // Each column is a continuously scrolling vertical strip of symbols from
      // REEL_STRIPS[col]. Visible window = 3 rows. We draw rows -1..3 (5 cells)
      // and clip to the grid frame so partial cells are masked at top/bottom.
      const currentGrid = gridRef.current
      const cellPitch = cellH + CELL_PAD

      // Outer clip: EXACTLY the cell-content region (not the looser frame).
      // Using the frame rect leaked the r=3 partial cell into a sliver under
      // the bottom edge — Tim image 45-47 "you can see another row and some
      // slots below". Tightening to gridY + CELL_PAD → gridY + CELL_PAD +
      // ROWS*cellH + (ROWS-1)*CELL_PAD masks anything outside the 5×3 area.
      // Image 50 verified — partial cells were leaking from the frame rect,
      // not from this region; we keep the strict cell-content clip.
      const cellsX = gridX + CELL_PAD
      const cellsY = gridY + CELL_PAD
      const cellsW = cellW * COLS + CELL_PAD * (COLS - 1)
      const cellsH = cellH * ROWS + CELL_PAD * (ROWS - 1)

      // ── Living Spirit Header geometry (computed BEFORE the cell loop so the
      //    reel-land orb-rise trigger can resolve socket destinations) ─────────
      // Desktop/tablet: a 3-socket row in the left portion of the carved header
      // band. Mobile: a compact 3-socket row inside the top of the board frame.
      // headerBandH is 0 on mobile / during bonus (the band reserve was 0 too).
      {
        const hg = headerGeomRef.current
        hg.hbH = headerBandH
        hg.isMobile = isMobile
        if (headerBandH > 0) {
          // Carved header band (ALL viewports incl. mobile): 3 sockets in the LEFT
          // portion, vertically centered in the band ABOVE the cell zone. orbD
          // scales with the band height; the floor keeps mobile sockets legible.
          const orbD = Math.max(24, Math.min(46, headerBandH * 0.56))
          const gap = orbD * 1.4
          const groupStartX = gridX + (isMobile ? 12 : 18)
          const cx0 = groupStartX + orbD * 0.5
          const cx1 = cx0 + gap
          const cx2 = cx1 + gap
          hg.orbD = orbD
          hg.socketCy = gridY - headerBandH * 0.5
          hg.socketCx = [cx0, cx1, cx2]
        } else {
          // No header (bonus): zeroed so no rise destinations resolve.
          hg.orbD = 0
          hg.socketCy = 0
          hg.socketCx = [0, 0, 0]
        }
      }

      // ══ LAYER SWAP → FRONT (z-4) ════════════════════════════════════════════
      // From here, all CELL-GRID content (clipped reel strips, symbol sprites,
      // per-cell bg/border, win highlight + dim, per-cell badges, hit-stop pop)
      // draws to the FRONT canvas so it sits IN FRONT of the z-3 DOM dragon. The
      // back canvas (panel/band/dais/haze/dragon-ground) is already painted. The
      // backplate scene-hint (drawn just below, inside the cell clip) is part of
      // the cell-window read, so it travels with the cells to the front layer.
      // Reverts to BACK after the outer frame clip restore (sockets/band draw next).
      if (fctx) ctx = fctx

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(cellsX - 1, cellsY - 1, cellsW + 2, cellsH + 2, 4)
      ctx.clip()

      // ── Painted slot interior backplate (art-director 2026-05-28) ─────────
      // Ink-wash mountain + paddy painted at SLOT_INTERIOR_BACKPLATE_ALPHA
      // inside the clip so the scene breathes through the semi-transparent
      // cells. Tim image 48-50: "background of the slots is just some random
      // element not awesome art in the style of REI" → backplate provides
      // the painted REI scene behind every cell.
      const backplateImg = backplateImageRef.current
      if (backplateImg && backplateImg.complete && backplateImg.naturalWidth > 0) {
        ctx.save()
        ctx.globalAlpha = SLOT_INTERIOR_BACKPLATE_ALPHA
        ctx.drawImage(backplateImg, gridX, gridY, gridW, gridH)
        ctx.restore()
      }

      // RENDER-LEVEL LAND GATE (Tim 2026-06-02: the win line still drew before
      // the tiles landed). The choreography-start flag (allReelsLandedRef) can
      // race across the isSpinning-reset vs win-reveal effects on CAST AGAIN.
      // This is the bulletproof belt: the win trace + per-cell win highlight may
      // ONLY paint when EVERY reel is currently at rest ('land' or 'idle').
      // Any reel still in 'cruise'/'decel' → no trace, no highlight. It can only
      // ever DELAY the reveal by a frame, never show it early.
      const allReelsSettledNow = reelStates.current.every(
        (s) => s.state === 'land' || s.state === 'idle',
      )

      for (let col = 0; col < COLS; col++) {
        const cellX = gridX + CELL_PAD + col * (cellW + CELL_PAD)
        const reelState = reelStates.current[col]
        if (!reelState) continue

        const strip = REEL_STRIPS[col]
        if (!strip) continue
        const stripLen = strip.length

        // Advance state machine. The 'accel' branch was removed 2026-05-28 per
        // Tim's "slow first, fast last" complaint — reels jump straight into
        // cruise at peak velocity (real slot reels burst into motion).
        if (reelState.state === 'cruise') {
          reelState.stripOffset += CRUISE_PEAK_VEL * dt
        } else if (reelState.state === 'decel') {
          // Lazy-resolve decelStartTime + decelStartOffset on the FIRST decel
          // frame (rather than at setTimeout fire-time) so the easing arc
          // starts at the actual current position. Without this, cruise
          // drifts the offset between setTimeout firing and the next rAF,
          // leaving a stale decelStartOffset that the curve tries to span.
          if (Number.isNaN(reelState.decelTargetOffset)) {
            reelState.decelStartTime = ts
            reelState.decelStartOffset = reelState.stripOffset
            // Decel distance is bounded so v(0+) of decel matches CRUISE_PEAK_VEL
            // exactly — no velocity spike at the cruise→decel handoff.
            // For cubic-out: v(0+) = 3·D/T. To make v(0+) == CRUISE_PEAK_VEL
            // we want D ≈ CRUISE_PEAK_VEL × DECEL_MS / 3 = 320 px ≈ 2.7 cells.
            // We require minimum DECEL_TARGET_CELLS advance for a perceptible
            // decel arc, then pick whichever of the matching strip-indices is
            // closest to that target distance (forward only).
            const currentBaseIdx = Math.floor(reelState.stripOffset / cellPitch)
            const minCellAdvance = DECEL_TARGET_CELLS + Math.floor(col / 2)
            const candidates = stopCandidatesRef.current[col] ?? []
            // candidates is populated in the isSpinning→false effect above.
            // Authoritative path: single element [stops[col]] — always non-empty.
            // Fallback path: reverse-search results — INV-2 proves non-empty.
            // The [0] final fallback is a last-resort guard; it should never fire.
            const safeMatches = candidates.length > 0 ? candidates : [0]
            // For each strip-match, compute forwardToStop from (currentBaseIdx +
            // minCellAdvance). Pick the match with the SMALLEST forwardToStop
            // — i.e., the next forward occurrence of the target rows on the
            // strip. This caps total decel distance at minCellAdvance + (stripLen−1)
            // worst case, but on a strip with multiple matches it picks the
            // closest, typically minCellAdvance + 0..3 cells.
            const base = currentBaseIdx + minCellAdvance
            const baseMod = ((base % stripLen) + stripLen) % stripLen
            let bestForward = stripLen
            for (const m of safeMatches) {
              const forward = ((m - baseMod) % stripLen + stripLen) % stripLen
              if (forward < bestForward) bestForward = forward
            }
            const targetBaseIdx = base + bestForward
            reelState.decelTargetOffset = targetBaseIdx * cellPitch
            // Store the EXACT integer stop index (mod stripLen) so the idle
            // branch can sample strip[lockedStopIdx + r] directly — no float
            // round-trip through decelTargetOffset. This is the fix for the
            // "symbols change on landing" desync (Tim 2026-05-29).
            reelState.lockedStopIdx = ((targetBaseIdx % stripLen) + stripLen) % stripLen
          }
          const elapsed = ts - reelState.decelStartTime
          // All reels decelerate identically — constant DECEL_MS, no outcome-conditional
          // multiplier. RG-C3: NO partial-match or hasThreeMatch branch here.
          const colDecelMs = DECEL_MS
          const t = Math.min(elapsed / colDecelMs, 1)
          // QUINTIC-OUT (Pass 6 aliveness — §1.3): 1 − (1−t)^5.
          // Visual signature: the last 20% of each column's travel decelerates visibly
          // faster than cubic-out. The eye reads a precision mechanism resolving.
          // DECEL distance D is set so v(0+) = 5·D/T ≈ CRUISE_PEAK_VEL:
          //   D ≈ CRUISE_PEAK_VEL × DECEL_MS / 5 = 2.5 × 900 / 5 = 450px ≈ 3.6 cells.
          // DECEL_TARGET_CELLS = 7 keeps the arc generous (≥3.6 cells minimum).
          // The stronger final-20% deceleration is exactly what makes quintic-out feel
          // like "a precision mechanism resolving" vs cubic's steadier coast.
          const eased = 1 - Math.pow(1 - t, 5)
          reelState.stripOffset =
            reelState.decelStartOffset +
            (reelState.decelTargetOffset - reelState.decelStartOffset) * eased
          if (t >= 1) {
            // Transition to landing beat — constant choreography, outcome-independent.
            // RG-C3/C5: fires identically for every spin, every outcome.
            reelState.state = 'land'
            reelState.stripOffset = reelState.decelTargetOffset
            reelState.landStartTime = ts
            reelState.landDirection = -1
            // Per-symbol landing tick (Pass 6 aliveness — §1.4).
            // Fires once per reel, every spin, outcome-independent.
            // playReelStop() is zero-param — RG-C5 structural (back-compat alias for playReelTick).
            // Simultaneously starts the 120ms SYMBOL_POP_SCALE (1.03) scale pop on
            // all three visible symbols in this column.
            if (!reelLandTickFiredRef.current[col]) {
              reelLandTickFiredRef.current[col] = true
              playReelStop()
              const pop = symbolPopRef.current[col]
              if (pop) pop.startTime = ts
              // Once EVERY reel has fired its land tick, the cards have all
              // visually landed — release the win-reveal gate (see reveal effect).
              if (reelLandTickFiredRef.current.every(Boolean)) {
                allReelsLandedRef.current = true
              }
              // ── Living Spirit Header: orb-rise on a Spirit Orb landing ────────
              // When a Spirit Orb (id 7) settles in this column, animate it rising
              // from the cell into the spirit's next socket. Display-only — the
              // count itself comes from the scatterCount prop (countSpiritOrbs).
              // RG-C5: ORB_RISE_MS / scale / alpha are module-const, identical for
              // every orb. Skipped under prefers-reduced-motion (static end-state)
              // and on mobile / during bonus (no header band → no destination).
              // orbRiseFiredRef[col] guards against a same-tick double push.
              const hg = headerGeomRef.current
              const settledGridForRise = gridRef.current
              if (
                !prefersReducedMotionRef.current &&
                !isSpiritBonusRef.current &&
                hg.hbH > 0 &&
                !orbRiseFiredRef.current[col] &&
                settledGridForRise
              ) {
                orbRiseFiredRef.current[col] = true
                const colCells = settledGridForRise[col]
                if (colCells) {
                  for (let r = 0; r < ROWS; r++) {
                    if (colCells[r] !== SPIRIT_ORB_SYMBOL_ID) continue
                    // Only animate up to the 3 sockets (the count caps at 3).
                    const idx = orbCountForCurrentSpinRef.current
                    if (idx > 2) break
                    const destX = hg.socketCx[idx] ?? hg.socketCx[2] ?? 0
                    const destY = hg.socketCy
                    const fromX = cellsX + col * (cellW + CELL_PAD) + cellW / 2
                    const fromY = cellsY + r * (cellH + CELL_PAD) + cellH / 2
                    orbRiseRef.current.push({
                      active: true,
                      startTime: ts,
                      fromX,
                      fromY,
                      toX: destX,
                      toY: destY,
                      orbIndex: idx,
                    })
                    // Arm the matching socket to begin filling 60ms before arrival.
                    orbFillStartTimeRef.current[idx] = ts + SOCKET_FILL_DELAY_MS
                    orbCountForCurrentSpinRef.current = idx + 1
                  }
                }
              }
            }
          }
        } else if (reelState.state === 'land') {
          // Landing hold — the strip rests at the EXACT target. NO over-travel.
          // The cubic-out decel above already eases the reel to a smooth stop; the
          // prior sin over-travel bounce read as "wobbly / something wrong" on every
          // reel (Tim image 39). The reel now settles cleanly. The landing tick still
          // fires at the decel->land transition; weight comes from the decel curve +
          // the tick, never from a positional wobble. RG-C3/C5 unchanged.
          reelState.stripOffset = reelState.decelTargetOffset
          if (ts - reelState.landStartTime >= REEL_LAND_HIT_STOP_MS) {
            reelState.state = 'idle'
          }
        }

        const animating =
          reelState.state === 'cruise' ||
          reelState.state === 'decel' ||
          reelState.state === 'land'

        // Strip indexing
        const stripPx = stripLen * cellPitch
        const wrappedOffset = ((reelState.stripOffset % stripPx) + stripPx) % stripPx
        // SETTLE-SYNC FIX 2026-05-29 (v2): when the reel is AT REST (land OR idle) and the
        // decel resolver has committed an integer lockedStopIdx, anchor BOTH the symbol index
        // AND the sub-cell offset to lockedStopIdx — never to Math.floor(wrappedOffset/cellPitch).
        // cellPitch is a non-integer canvas pixel value, so that floor can return
        // (targetBaseIdx - 1) with subOffsetPx ≈ cellPitch. The previous fix corrected the idle
        // IDENTITY (used lockedStopIdx) but left the POSITION on the float subOffsetPx, so at
        // land→idle every cell shifted up exactly one row — the visible "symbols switch on
        // settle" Tim saw every spin. The hook-based repro missed it because it compared identity
        // per logical row, not pixel position. Anchoring the offset to lockedStopIdx makes the
        // residual ≈0, so land and idle render IDENTICAL pixels. Motion frames (cruise/decel)
        // keep the float path — they are mid-scroll so exactness is irrelevant.
        const reelAtRest =
          reelState.lockedStopIdx >= 0 &&
          (reelState.state === 'land' || reelState.state === 'idle')
        let baseStripIdx: number
        let subOffsetPx: number
        if (reelAtRest) {
          baseStripIdx = reelState.lockedStopIdx
          let resid = wrappedOffset - reelState.lockedStopIdx * cellPitch
          resid = ((resid % cellPitch) + cellPitch) % cellPitch
          if (resid > cellPitch / 2) resid -= cellPitch
          subOffsetPx = resid // ≈ 0 — true rest residual, not the float-floor artifact
        } else {
          baseStripIdx = Math.floor(wrappedOffset / cellPitch)
          subOffsetPx = wrappedOffset - baseStripIdx * cellPitch
        }

        // Draw 5 symbols per column: rows -1, 0, 1, 2, 3 (extra top + extra bottom).
        // cellY uses MINUS subOffsetPx so symbols SCROLL UPWARD with stripOffset
        // — continuous with the `strip[(baseIdx + r) % L]` sampling above.
        // Sub-cell bounce on winning columns (game-feel-engineer §2.B). When
        // the kanji bloom is mid-flight and this col contains a payline win,
        // lift the settled cells by 0..4px on a sin half-wave. Pure canvas,
        // RG-C5 module-const (BOUNCE_MS), bounded by confirmed outcome.
        let winBounceY = 0
        if (!animating && kanjiGlyphRef.current.active) {
          const winCols = winTraceRef.current.winCols
          if (winCols.includes(col)) {
            const elapsed = ts - kanjiGlyphRef.current.startTime
            const BOUNCE_MS = 500
            const tBounce = Math.min(elapsed / BOUNCE_MS, 1)
            winBounceY = -Math.sin(tBounce * Math.PI) * 4
          }
        }

        for (let r = -1; r <= ROWS; r++) {
          const cellY = gridY + CELL_PAD + r * cellPitch - subOffsetPx + winBounceY
          if (cellY + cellH < gridY || cellY > gridY + gridH) continue

          // Resolve which symbol to draw at this position.
          //
          // Strip scrolls UPWARD through the viewport (symbols rise — the most
          // common slot reel direction). Each row r at the END of the spin
          // (subOffsetPx=0) shows strip[(baseStripIdx + r) % stripLen]. This
          // matches ooReiMath's grid generation `visible[r] = strip[stop + r]`
          // directly, so the decel target alignment is trivial.
          //
          // Continuity at baseStripIdx tick: at sub→cellPitch, row r is drawn
          // at y = baseY + r*cellPitch − cellPitch ≈ baseY + (r−1)*cellPitch
          // showing strip[(baseIdx + r) % L]. After tick (baseIdx+1, sub=0):
          // row (r−1) at y = baseY + (r−1)*cellPitch shows strip[((baseIdx+1) + (r−1)) % L]
          // = strip[(baseIdx + r) % L] — SAME symbol, continuous.
          let symId: SymbolId
          if (animating) {
            // Spinning or decelerating: always sample the strip at the current
            // offset so symbols stream through continuously.
            const idx = ((baseStripIdx + r) % stripLen + stripLen) % stripLen
            symId = strip[idx] as SymbolId
          } else if (r >= 0 && r < ROWS) {
            // FAIRNESS FIX 2026-05-29: use `lockedStopIdx` — the integer strip
            // index committed by the decel lazy-resolver — instead of recomputing
            // from the float `decelTargetOffset`.
            //
            // Old path: Math.floor((targetBaseIdx * cellPitch) / cellPitch)
            // When cellPitch is a non-integer (e.g. 87.333…px), this round-trip
            // can silently return (targetBaseIdx − 1), causing the idle frame to
            // show strip[targetBaseIdx − 1 + r] — a different symbol than the
            // last decel frame drew — i.e. the symbol visibly changes at landing.
            //
            // New path: reelState.lockedStopIdx is set to
            //   ((targetBaseIdx % stripLen) + stripLen) % stripLen
            // at the moment targetBaseIdx is committed during lazy-resolve, so
            // this sampling is ALWAYS strip[lockedStopIdx + r], identical to
            // the last decel frame. No float arithmetic involved.
            //
            // Invariant maintained: resolveGrid(stops)[col][r] ===
            //   strip[(lockedStopIdx + r) % stripLen] for r = 0,1,2.
            // Proof: the decel lazy-resolver selects only strip-indices in
            //   `candidates` = matches found by the reverse-search loop
            //   (strip[i] === grid[col][0] && strip[i+1] === grid[col][1] &&
            //    strip[i+2] === grid[col][2]). If candidates is non-empty,
            //   lockedStopIdx is one of those matching indices → invariant holds.
            //   If candidates was empty (failsafe), lockedStopIdx would be the
            //   index of the first candidate in safeMatches = [0], which is
            //   strip index 0 — that strip window may not match the grid.
            //   The regression test below (ooReiSettleSyncFix) asserts that
            //   candidates is NEVER empty for any stop vector, making the
            //   failsafe dead code and guaranteeing the invariant.
            const lockedStopIdx = reelState.lockedStopIdx
            const idx = lockedStopIdx >= 0
              ? ((lockedStopIdx + r) % stripLen + stripLen) % stripLen
              // lockedStopIdx === -1 means this col never started a spin
              // (e.g. first mount before any spin). Fall back to strip[col + r]
              // as a stable initial display — not a spinning reel so no
              // continuity requirement.
              : ((col + r) % stripLen + stripLen) % stripLen
            symId = strip[idx] as SymbolId
          } else {
            // Rows outside [0, ROWS) during idle: preview strip at a stable index.
            const idx = ((col + r) % stripLen + stripLen) % stripLen
            symId = strip[idx] as SymbolId
          }

          const inVisibleRow = r >= 0 && r < ROWS
          const cellKey = `${col}:${r}`
          const isSticky = inVisibleRow && stickyWildRef.current.has(cellKey)

          // isWin: true only if the cell has been illuminated in Beat 3 sequence.
          // During the ANTICIPATION GAP (litCount === 0) and before the gap fires,
          // no winning cells show the highlighted state — they look like settled cells.
          // Once winCellLightRef fires, each column lights up in sequence
          // (winCols[0..litCount-1] are the lit columns).
          // This gates the amber rim, the brightness(1.2) symbol filter, and the
          // winTile pop to fire only AFTER the cell has been sequentially illuminated.
          const cellLight = winCellLightRef.current
          // PER-CELL win gate (Tim 2026-06-01: "why are all tiles lighten up when
          // only 1 was hit?"). A payline occupies ONE row per column —
          // PAYLINES[lineIndex][col]. Gating on matchedCols.includes(col) alone lit
          // every row in a winning column. Require the cell's row r to be the row
          // the payline actually runs through, so only true winning cells light.
          const isWin =
            inVisibleRow &&
            allReelsSettledNow &&
            showWinHighlightRef.current &&
            cellLight.active &&
            paylineWinsRef.current.some(
              (pw) => pw.matchedCols.includes(col) && PAYLINES[pw.lineIndex]?.[col] === r,
            ) &&
            cellLight.winCols.slice(0, cellLight.litCount).includes(col)
          const isTalismanAwaken =
            inVisibleRow &&
            talismanAwakenRef.current.some(([c, r2]) => c === col && r2 === r)

          // ── Non-winning dim (Pass 6 aliveness — §1.3 RELEASE beat) ─────────────
          // Dim is by COLUMN, not per-cell (Tim 2026-06-01 "made it worse"): the
          // per-cell badge/border fix is correct, but dimming every non-winning
          // ROW too made multi-line wins read sparse + dark. Winning COLUMNS stay
          // fully bright (the board reads full + celebratory); only columns with
          // no win at all recede. Badge/border remain strictly per-cell.
          // Gentler 0.82 floor (was 0.70). RG-C1: never fires on loss.
          let nonWinDimAlpha = 1.0
          const cellLightForDim = winCellLightRef.current
          const colHasWin = paylineWinsRef.current.some((pw) => pw.matchedCols.includes(col))
          if (
            inVisibleRow &&
            showWinHighlightRef.current &&
            cellLightForDim.active &&
            paylineWinsRef.current.length > 0 &&
            !colHasWin
          ) {
            nonWinDimAlpha = 0.82
          }

          // ── Per-symbol landing pop scale (Pass 6 aliveness — §1.4) ───────────
          // 120ms scale pop 1.0 → 1.03 → 1.0 at the moment the reel lands.
          // Applied as a canvas transform around cell center. All 3 rows in the
          // column pop together (per-column, not per-symbol). RG-C5: module-const
          // amplitude SYMBOL_POP_SCALE (1.03), identical for every outcome.
          let symbolPopScale = 1.0
          const popState = symbolPopRef.current[col]
          if (popState && popState.startTime >= 0 && inVisibleRow) {
            const popElapsed = ts - popState.startTime
            if (popElapsed < SYMBOL_POP_MS) {
              // Ease-out cubic: rises quickly then returns smoothly.
              // Half-sine bell: peak at midpoint, symmetric rise/fall.
              const tPop = popElapsed / SYMBOL_POP_MS
              symbolPopScale = 1.0 + (SYMBOL_POP_SCALE - 1.0) * Math.sin(tPop * Math.PI)
            } else {
              // Pop finished — deactivate
              popState.startTime = -1
              symbolPopScale = 1.0
            }
          }

          // ── Fix 2: Win-tile pop scale + amber glow rim ──────────────────────
          // When a cell is in the winning set AND the winTile state is active,
          // scale the cell outward from its center (1.0 → target pop → 1.0 ease).
          // Pure Canvas2D translate-scale-translate. RG-C5 module-const.
          // The scale eases in over the first 150ms, holds, then recovers over
          // the remainder of WIN_REVEAL_MS. No particles. No layout change.
          const winTile = winTileRef.current
          let winTileScale = 1.0
          let winTileGlowAlpha = 0.0
          if (isWin && winTile.active) {
            const winElapsed = ts - winTile.startTime
            const targetScale = winTile.isBig ? WIN_TILE_SCALE_BIG : WIN_TILE_SCALE_STANDARD
            const TILE_BLOOM_MS = 150   // Rise over 150ms
            const TILE_HOLD_MS = WIN_REVEAL_MS - TILE_BLOOM_MS - 100  // Hold
            const TILE_FADE_MS = 100    // Recover over 100ms
            if (winElapsed < TILE_BLOOM_MS) {
              // Ease-out overshoot bloom (elastic-ish feel, cubic-bezier approx)
              const tBloom = winElapsed / TILE_BLOOM_MS
              const eBloom = 1 - Math.pow(1 - tBloom, 2) // ease-out quad
              winTileScale = 1.0 + (targetScale - 1.0) * eBloom
              winTileGlowAlpha = WIN_TILE_GLOW_ALPHA * eBloom
            } else if (winElapsed < TILE_BLOOM_MS + TILE_HOLD_MS) {
              winTileScale = targetScale
              winTileGlowAlpha = WIN_TILE_GLOW_ALPHA
            } else if (winElapsed < WIN_REVEAL_MS) {
              const tFade = (winElapsed - TILE_BLOOM_MS - TILE_HOLD_MS) / TILE_FADE_MS
              const eFade = Math.min(tFade, 1)
              winTileScale = targetScale - (targetScale - 1.0) * eFade
              winTileGlowAlpha = WIN_TILE_GLOW_ALPHA * (1 - eFade)
            } else {
              winTileScale = 1.0
              winTileGlowAlpha = 0.0
              winTile.active = false
            }
          }

          // ── Cell background substrate — shared draw path (fairness-perception fix) ──
          // drawCellBackground() is called identically for BOTH spinning and settled
          // states. The alpha values (CELL_BG_ALPHA_ROW0 / _ROW1) are module-const
          // and do NOT depend on `animating`. This prevents the opacity pop that
          // occurred when the reel transitioned from 'decel' → 'idle'.
          //
          // The only reel-state-dependent rendering in this block is:
          //   - winTileScale (win highlight after settle — not reel spin state)
          //   - borderAlpha for win/sticky states (same: not spin-gated)
          //   - nonWinDimAlpha (70% for non-winning cells after WIN_ANTICIPATION_GAP_MS)
          // The symbol position (subOffsetPx) and the symbol filter differ between
          // spinning and settled, but those are drawn AFTER this cell-bg save/restore.
          ctx.save()

          // Non-winning cell dim: reduce whole-cell opacity to 70% (Pass 6 aliveness).
          // Applied here so both background AND symbol draw at the dimmed level.
          if (nonWinDimAlpha < 1.0) {
            ctx.globalAlpha = nonWinDimAlpha
          }

          // Apply win-tile scale transform from cell center (Fix 2)
          if (winTileScale !== 1.0) {
            const cx = cellX + cellW / 2
            const cy = cellY + cellH / 2
            ctx.translate(cx, cy)
            ctx.scale(winTileScale, winTileScale)
            ctx.translate(-cx, -cy)
          }

          // ── Cell background fill — carved-stone wet-basalt gradient (spec §2a) ──
          // Replaces flat rgba with a per-cell linear gradient that reads as the
          // face of a wet stone tablet: top surface catches cool overcast light,
          // bottom sinks into shadow. Zero cyan.
          // Cache keyed on `${cellH}:${r===0 ? 0 : 1}` — same gradient for r>0.
          // Invalidated on resize via stoneCellGradCacheRef.current.clear().
          // RG-C5: module-const alphas, no session/wager/streak variance.
          // prefers-reduced-motion: static gradient (no animation) — always drawn.
          {
            // Invalidate if cellH changed (fresh resize)
            if (stoneCellGradCacheKeyRef.current !== cellH) {
              stoneCellGradCacheRef.current.clear()
              stoneCellGradCacheKeyRef.current = cellH
            }
            const gradKey = `${cellH}:${r === 0 ? 0 : 1}`
            let stoneGrad = stoneCellGradCacheRef.current.get(gradKey)
            if (!stoneGrad) {
              // Create gradient anchored to y=0 so it works for any cellY.
              // We re-create using a representative y range; since all cells in
              // the same row-band share identical cellH, this is stable.
              // Bolder 2026-06-01: richer colour presence in idle cells --
              // top stop has more material depth (light-catch), bottom drops to
              // near-opaque deep tone. Region tint comes from cellPalette fills
              // above/below; the gradient shapes the stone face.
              stoneGrad = ctx.createLinearGradient(cellX, cellY, cellX, cellY + cellH)
              if (r === 0) {
                // Top row: slightly warmer amber-tinged light-catch at top
                stoneGrad.addColorStop(0,    'rgba(48,42,58,0.88)')
                stoneGrad.addColorStop(0.25, 'rgba(34,30,44,0.92)')
                stoneGrad.addColorStop(0.65, 'rgba(22,20,30,0.94)')
                stoneGrad.addColorStop(1,    'rgba(14,12,20,0.98)')
              } else {
                stoneGrad.addColorStop(0,    'rgba(42,38,52,0.84)')
                stoneGrad.addColorStop(0.25, 'rgba(30,26,38,0.88)')
                stoneGrad.addColorStop(0.65, 'rgba(20,18,28,0.93)')
                stoneGrad.addColorStop(1,    'rgba(14,12,20,0.98)')
              }
              stoneCellGradCacheRef.current.set(gradKey, stoneGrad)
            }
            ctx.fillStyle = stoneGrad
            ctx.beginPath()
            ctx.roundRect(cellX, cellY, cellW, cellH, 5)
            ctx.fill()
          }

          // ── WIN cell: warm amber fill wash (bolder 2026-06-01) ─────────────────
          // Big Bass Bonanza energy: winning cells get a SUBSTANTIAL warm amber
          // fill -- not just a rim line. A radial amber-gold wash from center
          // outward, saturating the cell face. Fires during Beat 3+ (isWin true).
          // Cached gradients are keyed on cellW:cellH:col (stable between resizes).
          // RG-C5: fixed alpha values, no session/wager/streak scaling.
          // RG-C1: only fires when isWin (win outcome only, never loss).
          // Zero cyan. Only transform/opacity analogues (Canvas2D fillStyle).
          // prefers-reduced-motion: static gradient (no animation) -- always drawn.
          if (isWin) {
            ctx.save()
            // Amber wash alpha driven by winTileGlowAlpha (0 → WIN_TILE_GLOW_ALPHA)
            // so the wash appears in sync with the tile pop animation.
            // When winTile animation is complete (winTileGlowAlpha=0), fallback to
            // a sustained ambient amber wash so the cell stays visibly warm while
            // showWinHighlight remains true.
            // The background wash is the win highlight (Tim 2026-06-05: "colour the
            // background instead of largen the borders") — BUT it must stay CONTAINED
            // and centred so the cell EDGES stay dark and the grid gutters read crisp
            // (Tim 2026-06-05 #139: "stop making that background larger — it's breaking
            // the grid"). Radius kept TIGHT (0.58 of the cell) so the amber concentrates
            // in the centre and never saturates edge-to-edge into the gutters.
            const washAlpha = winTileGlowAlpha > 0
              ? winTileGlowAlpha * 0.55   // animated phase: build with the pop
              : 0.42                       // settled phase: sustained warm amber fill
            const winWashGrad = ctx.createRadialGradient(
              cellX + cellW * 0.5, cellY + cellH * 0.42, 0,
              cellX + cellW * 0.5, cellY + cellH * 0.42, Math.max(cellW, cellH) * 0.58
            )
            winWashGrad.addColorStop(0,    `rgba(220, 150, 40, ${(washAlpha * 0.90).toFixed(3)})`)
            winWashGrad.addColorStop(0.45, `rgba(200, 120, 28, ${(washAlpha * 0.60).toFixed(3)})`)
            winWashGrad.addColorStop(0.80, `rgba(160,  90, 20, ${(washAlpha * 0.28).toFixed(3)})`)
            winWashGrad.addColorStop(1,    'rgba(0,0,0,0)')
            ctx.fillStyle = winWashGrad
            ctx.beginPath()
            ctx.roundRect(cellX, cellY, cellW, cellH, 5)
            ctx.fill()
            ctx.restore()
          }

          // ── SPECIAL SCATTER cell — the spirit-bonus item (Tim 2026-06-05) ──────
          // The Spirit Orb scatter (the item you collect toward the SPIRIT BONUS)
          // must read as a SPECIAL framed card so the player SEES each one land,
          // not blend in as a flat icon ("make the special spirit bonus items have
          // full background and are actually special and you see them"). A deep dark
          // vignette backing + a warm amber glow + a brass double-frame (the card
          // border) set it apart from the common symbols. The orb art draws on top
          // via the symbol path below. Keyed SOLELY on "this settled cell holds a
          // Spirit Orb" — RG-C5 (no streak/session/value scaling), RG-C1 (settled
          // only, never on spin/loss), zero cyan. prefers-reduced-motion safe
          // (static gradients, no animation).
          if (!animating && inVisibleRow && symId === 7) {
            const sccx = cellX + cellW / 2
            const sccy = cellY + cellH * 0.46
            ctx.save()
            // 1. Deep vignette backing — sets the scatter on its own dark field.
            const scBg = ctx.createRadialGradient(sccx, sccy, 0, sccx, sccy, Math.max(cellW, cellH) * 0.72)
            scBg.addColorStop(0,    'rgba(30, 19, 9, 0.58)')
            scBg.addColorStop(0.58, 'rgba(17, 11, 6, 0.80)')
            scBg.addColorStop(1,    'rgba(8, 6, 4, 0.92)')
            ctx.fillStyle = scBg
            ctx.beginPath()
            ctx.roundRect(cellX, cellY, cellW, cellH, 5)
            ctx.fill()
            // 2. Warm amber glow halo behind the orb (stronger than the old idle glow).
            const scGlow = ctx.createRadialGradient(sccx, sccy, 0, sccx, sccy, cellW * 0.58)
            scGlow.addColorStop(0,    'rgba(244, 175, 70, 0.50)')
            scGlow.addColorStop(0.45, 'rgba(212, 137, 42, 0.26)')
            scGlow.addColorStop(0.82, 'rgba(150, 92, 26, 0.08)')
            scGlow.addColorStop(1,    'rgba(0,0,0,0)')
            ctx.fillStyle = scGlow
            ctx.beginPath()
            ctx.roundRect(cellX, cellY, cellW, cellH, 5)
            ctx.fill()
            // 3. Brass double-frame — the "special card" border (zero cyan).
            ctx.lineWidth = 1.75
            ctx.strokeStyle = 'rgba(244, 175, 70, 0.92)'
            ctx.beginPath()
            ctx.roundRect(cellX + 1.5, cellY + 1.5, cellW - 3, cellH - 3, 5)
            ctx.stroke()
            ctx.lineWidth = 1
            ctx.strokeStyle = 'rgba(150, 98, 34, 0.85)'
            ctx.beginPath()
            ctx.roundRect(cellX + 4.5, cellY + 4.5, cellW - 9, cellH - 9, 3)
            ctx.stroke()
            ctx.restore()
          }

          // ── Top-rim highlight (spec §2e): amber tint for top row ────────────
          // 1px horizontal fill at the cell top — a sky-light catch on the stone face.
          // Top row (r=0) uses slightly warmer stone tone (amber register from
          // Rei's lantern + spirit aura above). Other rows stay cool violet-grey.
          // RG-C5: module-const, no animation. Zero cyan.
          // Bolder 2026-06-01: top-rim highlight strengthened so cells read as
          // physical stone faces catching diffuse overcast light. Was barely visible.
          if (r >= 0 && r < ROWS) {
            const rimGrad = ctx.createLinearGradient(cellX, 0, cellX + cellW, 0)
            if (r === 0) {
              // Top row: warm amber-tinged stone rim (spec §2e — amber hierarchy)
              rimGrad.addColorStop(0,    'rgba(90, 78, 64, 0)')
              rimGrad.addColorStop(0.12, 'rgba(90, 78, 64, 0.68)')
              rimGrad.addColorStop(0.50, 'rgba(96, 84, 68, 0.88)')
              rimGrad.addColorStop(0.88, 'rgba(90, 78, 64, 0.68)')
              rimGrad.addColorStop(1,    'rgba(90, 78, 64, 0)')
            } else {
              // Mid/bottom rows: neutral cool-stone rim (stronger than before)
              rimGrad.addColorStop(0,    'rgba(80, 76, 96, 0)')
              rimGrad.addColorStop(0.12, 'rgba(80, 76, 96, 0.62)')
              rimGrad.addColorStop(0.50, 'rgba(86, 82, 102, 0.82)')
              rimGrad.addColorStop(0.88, 'rgba(80, 76, 96, 0.62)')
              rimGrad.addColorStop(1,    'rgba(80, 76, 96, 0)')
            }
            ctx.fillStyle = rimGrad
            ctx.fillRect(cellX + 2, cellY, cellW - 4, 1)
          }

          // Cell border — INSET by half the lineWidth so the stroke stays strictly
          // inside the cell and never bleeds onto the neighbour (Tim 2026-05-30:
          // "the borders on the winning slot tiles go over other cards"). Canvas
          // strokes are path-centred, so the old shared full-rect path painted half
          // its width into the adjacent cell.
          // Win highlight = the BACKGROUND wash above, NOT a thick rim (Tim 2026-06-05:
          // "the thick borders … are too thick … just colour the background instead of
          // largen the borders"). The win border is now a thin 1px crisp rim (same as
          // idle); only sticky/talisman keeps its 2px inset rim.
          const bLineW = isSticky ? 2 : 1
          const bInset = isSticky ? 3 + bLineW / 2 : bLineW / 2
          const bRadius = isSticky ? 6 : 5
          // Bolder 2026-06-01: win border alpha at full 1.0 (was 0.9).
          const borderAlpha = isWin ? 1.0 : isSticky ? 0.85 : CELL_BG_BORDER_ALPHA_IDLE
          ctx.strokeStyle = isWin
            ? C.paylineWin
            : isSticky
              ? C.talismanGlow
              : cellPalette.cellBorderActive
          ctx.globalAlpha = borderAlpha
          ctx.lineWidth = bLineW
          ctx.beginPath()
          ctx.roundRect(cellX + bInset, cellY + bInset, cellW - bInset * 2, cellH - bInset * 2, bRadius)
          ctx.stroke()
          ctx.globalAlpha = 1

          // REMOVED the amber glow-ring halo (Tim 2026-06-05: "the thick borders on
          // that highlight animation are too thick … just colour the background"). It
          // was two stroked rounded-rects at WIN_TILE_GLOW_WIDTH*3 with per-frame
          // shadowBlur — a fat glowing frame, exactly the "thick border" being
          // rejected (and a per-frame-shadowBlur perf cost). The win highlight is now
          // carried entirely by the boosted background wash above + the thin 1px rim.
          // winTileGlowAlpha still drives the wash build-up, so it stays referenced.

          if (isSticky) {
            ctx.fillStyle = C.stickyWild
            ctx.beginPath()
            ctx.roundRect(cellX, cellY, cellW, cellH, 5)
            ctx.fill()
          }

          if (isTalismanAwaken && !isWin && !isSticky) {
            ctx.strokeStyle = C.amberAccent
            ctx.lineWidth = 1.5
            ctx.globalAlpha = 0.7
            ctx.beginPath()
            ctx.roundRect(cellX + 1, cellY + 1, cellW - 2, cellH - 2, 4)
            ctx.stroke()
            ctx.globalAlpha = 1
          }

          // ── Tier ring: amber hierarchy ring for high-value symbols (spec §2b) ──
          // Draws a 1px inset stroke in shrine-warm tones for symIds 4-7 on settled
          // idle state. Signals premium vs common symbols without cyan. Zero cyan.
          // RG-C1: only on settled, never on loss state (loss = no win highlight at all).
          // RG-C5: module-const ring colors, identical regardless of session state.
          // prefers-reduced-motion: static stroke (no animation) — always drawn.
          // Bolder 2026-06-01: raise tier ring alphas so premium symbols read
          // with material depth even in the idle state (Big Bass completeness floor).
          // Zero cyan. RG-C5: module-const values, no session/streak scaling.
          if (!animating && inVisibleRow && !isWin) {
            const TIER_RING_COLORS: Partial<Record<number, string>> = {
              4: 'rgba(200, 130, 52, 0.70)',  // Hat -- amber (was 0.55)
              5: 'rgba(220, 150, 52, 0.82)',  // Eye -- bright amber (was 0.65)
              6: 'rgba(210,  65, 48, 0.72)',  // Torii -- shrine vermilion (was 0.55)
              7: 'rgba(240, 160, 48, 0.95)',  // Spirit Orb -- full amber-gold (was 0.80)
            }
            // symId 7 (Spirit Orb scatter) owns its own brass double-frame from the
            // special-scatter block above — skip the generic tier ring so it does not
            // triple-rim the cell.
            const ringColor = symId === 7 ? undefined : TIER_RING_COLORS[symId]
            if (ringColor !== undefined) {
              ctx.save()
              ctx.strokeStyle = ringColor
              ctx.lineWidth = 1
              ctx.globalAlpha = 1
              ctx.beginPath()
              ctx.roundRect(cellX + 3, cellY + 3, cellW - 6, cellH - 6, 4)
              ctx.stroke()
              ctx.restore()
            }
          }

          ctx.restore()

          // Symbol image
          const symbolImg = symbolImagesRef.current[symId]
          if (symbolImg && symbolImg.complete) {
            ctx.save()
            // Clip symbol to its own cell so adjacent cells don't bleed in
            ctx.beginPath()
            ctx.roundRect(cellX, cellY, cellW, cellH, 5)
            ctx.clip()
            const imgPad = cellW * 0.1
            // Bolder 2026-06-01: winning symbols significantly brightened (was 1.2).
            if (isWin) ctx.filter = 'brightness(1.5) saturate(1.2)'
            // Slight motion-blur during fastest part of spin: vertical scale stretch
            if (animating && reelState.state !== 'decel') {
              ctx.translate(cellX + cellW / 2, cellY + cellH / 2)
              ctx.scale(1, 1.04)
              ctx.translate(-(cellX + cellW / 2), -(cellY + cellH / 2))
              ctx.globalAlpha = 0.92
            }
            // Per-symbol landing pop scale (Pass 6 aliveness — §1.4).
            // Scale pop fires during 'land' phase: 120ms half-sine 1.0→1.03→1.0.
            // Transform around cell center. RG-C5: SYMBOL_POP_SCALE (1.03) is const.
            if (symbolPopScale !== 1.0) {
              const pcx = cellX + cellW / 2
              const pcy = cellY + cellH / 2
              ctx.translate(pcx, pcy)
              ctx.scale(symbolPopScale, symbolPopScale)
              ctx.translate(-pcx, -pcy)
            }
            ctx.drawImage(
              symbolImg,
              cellX + imgPad,
              cellY + imgPad,
              cellW - imgPad * 2,
              cellH - imgPad * 2,
            )
            ctx.restore()
          } else {
            // Fallback text glyph while image loads
            const symName = SYMBOL_NAMES[symId] ?? '?'
            ctx.save()
            ctx.beginPath()
            ctx.roundRect(cellX, cellY, cellW, cellH, 5)
            ctx.clip()
            ctx.globalAlpha = 0.65
            ctx.fillStyle = C.symTextColor
            ctx.font = `700 ${Math.floor(cellH * 0.2)}px "Geist Mono", monospace`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(
              symName.slice(0, 3).toUpperCase(),
              cellX + cellW / 2,
              cellY + cellH / 2,
            )
            ctx.restore()
          }

          // ── Symbol multiplier badge (BUG-A reform — 2026-05-28 cohesion rebuild) ──
          // Visibility rules (gated on paylineWin membership):
          //
          // 1. WINNING CELL (part of an active paylineWin):
          //    → Show match-count-specific pay derived from the paylineWin multiplier.
          //      NOT the 5oaK value from BADGE_LABELS. E.g. 3x Torii = "8x" not "24x".
          //      Full amber border + bright amber text.
          //
          // 2. NON-WINNING CELL on a settled grid that HAS wins:
          //    → Show the 5oaK label at 0.30 opacity with "MAX" prefix.
          //      Reads as a paytable reference, not a live win.
          //
          // 3. NON-WINNING CELL on a 0-win settled grid:
          //    → NO badge. Hidden entirely. Prevents "I won 24x on every cell
          //      and still got nothing" confusion (Tim's core complaint).
          //
          // RG-C5: same badge logic regardless of session/streak state.
          // RG-C1: badges never shown on sub-break-even wins that are tier='none'.
          if (!animating && inVisibleRow) {
            // BADGE INTEGRITY (Tim 2026-05-30): the multiplier badge appears ONLY
            // on winning cells and shows that line's multiplier, persisting with
            // paylineWins until the next spin. Non-winning cells are NEVER badged.
            // This kills the every-cell paytable clutter AND the "0.6x -> 2.4x" /
            // "4x -> 10x" flip — a winning cell used to fall back to its 5-of-a-kind
            // paytable label once the highlight cleared. One cell, one value.
            // PER-CELL (Tim 2026-06-01): a payline runs through ONE row per column
            // (PAYLINES[lineIndex][col]). Matching by column alone badged every row
            // in a winning column. Require the cell's row r to be on the line.
            //
            // ONCE-PER-LINE (Tim 2026-06-02 "sometimes the win percentage is not
            // correct"): the badge previously showed the FULL line multiplier on
            // EVERY matched cell, so three 0.4x cells read as 1.2x while the line
            // pays 0.4x ONCE. Now the multiplier badge renders only on the line's
            // RIGHTMOST matched cell (the end of the matched run) — one line, one
            // number, matching the payout. The other matched cells still get the
            // win highlight (glow/frame) elsewhere; they just carry no number.
            // matchedCols is [0..matchCount-1], so the last element is the end col.
            // If several lines end on the same cell, show the highest-paying one.
            const winningPayline = paylineWinsRef.current
              .filter((pw) => {
                const endCol = pw.matchedCols[pw.matchedCols.length - 1] ?? -1
                return endCol === col && PAYLINES[pw.lineIndex]?.[col] === r
              })
              .sort((a, b) => (b.payBps > a.payBps ? 1 : b.payBps < a.payBps ? -1 : 0))[0]
            if (winningPayline === undefined) {
              // no badge rendered — skip
            } else {
              // B3 (Tim 2026-05-30): ONE clean mark — no nested box. A flush
              // bottom-right corner tab: an amber-tinted radial underlay fading up
              // from the corner (no outline, no dark pill, no second rounded box),
              // with the multiplier label in amber Geist Mono on top. Reads as part
              // of the cell, not a box inside the symbol.
              const tabW = cellW * 0.34
              const tabH = cellH * 0.22
              const tabX = cellX + cellW - tabW
              const tabY = cellY + cellH - tabH

              // Label is THIS line's multiplier from paylineWin.payBps (BPS,
              // 10_000n = 1.0x) — never the 5-of-a-kind paytable value, so it
              // can never flip. Always a number → Geist Mono in the draw below.
              const multWhole = Number(winningPayline.payBps) / 10000
              const badgeLabel = multWhole % 1 === 0
                ? `${multWhole}x`
                : `${multWhole.toFixed(1)}x`
              // Readability (Tim 2026-06-01 "winnings not readable"): the value is
              // CREAM (high contrast), amber is reserved for the cell border. The
              // scrim below is deepened to a true dark anchor so cream reads >7:1.
              const badgeTextColor = '#f2e9d2'

              ctx.save()

              // Underlay: radial amber-tinted glow anchored at the cell's bottom-right
              // corner, fading to fully transparent toward the cell interior. Clipped
              // to the cell's rounded rect so it never spills onto a neighbour. No
              // stroke, no fill-box — a single soft mark that lifts the label off the
              // dark symbol for legibility. Zero cyan.
              ctx.beginPath()
              ctx.roundRect(cellX, cellY, cellW, cellH, 5)
              ctx.clip()
              const tabCornerX = cellX + cellW
              const tabCornerY = cellY + cellH
              const tabGrad = ctx.createRadialGradient(
                tabCornerX, tabCornerY, 0,
                tabCornerX, tabCornerY, Math.max(tabW, tabH) * 1.15
              )
              tabGrad.addColorStop(0, 'rgba(10, 8, 6, 0.94)')     // deep scrim anchor — cream reads >7:1
              tabGrad.addColorStop(0.55, 'rgba(12, 9, 6, 0.62)')
              tabGrad.addColorStop(1, 'rgba(12, 9, 6, 0)')        // fully transparent — no edge
              ctx.fillStyle = tabGrad
              ctx.fillRect(tabX - tabW * 0.4, tabY - tabH * 0.4, tabW * 1.4, tabH * 1.4)

              // Label: amber Geist Mono, flush bottom-right with a small inset.
              const badgeFontSize = Math.floor(tabH * 0.58)
              ctx.font = `700 ${badgeFontSize}px "Geist Mono", monospace`
              ctx.textAlign = 'right'
              ctx.textBaseline = 'alphabetic'
              ctx.fillStyle = badgeTextColor
              ctx.fillText(badgeLabel, cellX + cellW - 5, cellY + cellH - 5)

              ctx.restore()
            }
          }
        }
      }

      ctx.restore() // outer frame clip

      // ══ LAYER SWAP → BACK (z-2) ═════════════════════════════════════════════
      // The slab stone border (A8), dais ledge (A6), contact shadow (A7) and the
      // LIVING SPIRIT HEADER (band + orb sockets + count text + orb rises) are all
      // part of the board PANEL / FRAME, so they belong on the BACK canvas BEHIND
      // the z-3 DOM dragon. Revert the active target before drawing them.
      if (fctx) ctx = bctx

      const spinningNow = isSpinningRef.current
      // (kept for downstream draw code that references spinningNow)
      void spinningNow

      // ── A8: Slab stone border (cohesive composition 2026-05-31) ──────────────
      // Stone-cream strokeRect at [gridX-3, gridY-3, gridW+6, gridH+6].
      // Reads as the weathered outer rim of the stone sealing-dais.
      // Replaces the former boxShadow inset (which was a CSS value on the wrapper div);
      // this is now a Canvas2D draw so it sits in the correct layer (above cells, below
      // win trace). A secondary vermillion inner ring maintains the ritual-frame quality.
      // Drawn FIRST after clip restore so the dais ledge (A6) draws on top.
      {
        ctx.save()
        ctx.shadowBlur = 0
        // Outer stone-cream rim: aged granite edge
        ctx.strokeStyle = 'rgba(200,184,144,0.22)'
        ctx.lineWidth = 1.5
        ctx.strokeRect(gridX - 3, gridY - 3, gridW + 6, gridH + 6)
        // Secondary inner vermillion ring: carved ritual frame, subdued
        ctx.strokeStyle = 'rgba(192,57,43,0.12)'
        ctx.lineWidth = 0.5
        ctx.strokeRect(gridX + 1, gridY + 1, gridW - 2, gridH - 2)
        ctx.restore()
      }

      // ── A6: Stone sealing-dais front-face ledge (cohesive composition 2026-05-31) ─
      // A horizontal stone ledge at the grid's bottom edge tells the eye:
      // "this object has physical depth and rests on a floor."
      // (a) Ledge face: slightly lighter stone on the visible front face
      // (b) Shadow underline: the underside of the slab, darker
      // Colors: overcast key from upper-left — top face lighter, bottom face darker.
      // Drawn in Canvas2D, ~4 draw calls. NOT a DOM element.
      {
        ctx.save()
        ctx.shadowBlur = 0
        // (a) Top surface strip at the very top of the slab — overcast light catch
        // rgba(42,34,26,0.55): slightly lighter stone top edge
        ctx.fillStyle = 'rgba(42,34,26,0.55)'
        ctx.fillRect(gridX, gridY, gridW, 4)
        // (b) Ledge front face: the 8px tall stone ledge below the cell area
        // rgba(30,22,16,0.88): dark aged stone, denser than cell bg
        ctx.fillStyle = 'rgba(30,22,16,0.88)'
        ctx.fillRect(gridX, gridY + gridH, gridW, 8)
        // (c) Shadow underline: the underside of the slab, deepest shadow face
        // rgba(10,8,6,0.60): near-opaque bottom shadow
        ctx.fillStyle = 'rgba(10,8,6,0.60)'
        ctx.fillRect(gridX, gridY + gridH + 8, gridW, 2)
        ctx.restore()
      }

      // ── A7: Contact shadow below dais onto paddy floor (cohesive composition 2026-05-31) ─
      // A soft elliptical gradient below the dais ledge, fading from
      // rgba(10,8,6,0.40) at center to transparent over ~24px downward.
      // Gives the impression the slab casts a shadow onto wet ground.
      // Centered at [gridX + gridW/2, gridY + gridH + 12], radii [gridW*0.4, 24].
      // Technique: scale context to squash a circular radial gradient into an ellipse.
      {
        ctx.save()
        ctx.shadowBlur = 0
        const shadowCx = gridX + gridW / 2
        const shadowCy = gridY + gridH + 12
        const shadowR = gridW * 0.4  // horizontal radius (controls spread width)
        const shadowScaleY = 24 / shadowR  // squash to 24px vertical depth
        // Apply the squash transform, then create a circular gradient in local space
        ctx.translate(shadowCx, shadowCy)
        ctx.scale(1, shadowScaleY)
        const contactShadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, shadowR)
        contactShadowGrad.addColorStop(0, 'rgba(10,8,6,0.40)')
        contactShadowGrad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = contactShadowGrad
        ctx.beginPath()
        ctx.arc(0, 0, shadowR, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // ══ LIVING SPIRIT HEADER (composition-designer spec 2026-06-02) ══════════
      // The active region spirit coils across the board frame top and COLLECTS
      // the 3 Spirit Orbs into itself; its eyes ignite amber at 3/3. Drawn as
      // part of the board frame (carved into the SCATTER_HEADER_RESERVE band), so
      // it is truly integrated, persists through casting/spinning, and the spirit
      // is visibly present. Replaces the rejected DOM marquee.
      //
      // Visible in every base-game phase. Hidden in lobby (no grid yet → the
      // experience does not mount the canvas in lobby) and during the Spirit
      // Bonus (headerBandH = 0; the bonus owns its own identity). On mobile the
      // band is 0 and a compact in-board row carries the count instead.
      // RG-C5: all motion is module-const, byte-identical per spin. Zero cyan.
      {
        const scatter = scatterCountRef.current
        const armed = scatter >= 3
        const hg = headerGeomRef.current
        const reduced = prefersReducedMotionRef.current

        // (A) Advance socket fill alphas from their armed start-times. Under
        // reduced-motion (or any path where no rise was queued — mobile, a count
        // that arrived without a per-cell land), fall back to the count: a socket
        // shows filled if i < scatter. This keeps the displayed state correct in
        // every phase regardless of whether the rise animation ran.
        const fillAlpha = orbFillAlphaRef.current
        for (let i = 0; i < 3; i++) {
          const startedAt = orbFillStartTimeRef.current[i] ?? -1
          let a = 0
          if (startedAt >= 0 && ts >= startedAt) {
            const t = Math.min((ts - startedAt) / ORB_FILL_MS, 1)
            a = t * (2 - t)  // ease-out-quad
          }
          // Count-based fallback (reduced-motion / mobile / pre-rise display):
          // the socket is filled if the live count covers it.
          if (i < scatter) a = Math.max(a, reduced ? 1 : a > 0 ? a : 1)
          else if (startedAt < 0) a = 0
          fillAlpha[i] = a
        }

        // (B) Eye-ignite bloom: arms the exact frame the 3rd socket reaches full.
        // Reduced-motion → set active immediately when armed (drawn at peak).
        if (armed) {
          if (!eyeIgniteRef.current.active) {
            if (reduced || fillAlpha[2] >= 0.999) {
              eyeIgniteRef.current = { active: true, startTime: ts }
            }
          }
        } else if (eyeIgniteRef.current.active) {
          eyeIgniteRef.current = { active: false, startTime: 0 }
        }

        // (C) Shared ambient 3/3 pulse phase (advances every frame, smooth across
        // spins). RG-C5: ORB_ARMED_PULSE_HZ is module-const.
        if (!reduced) {
          orbArmedPhaseRef.current += (ORB_ARMED_PULSE_HZ * dt) / 1000
          // Niche breath advances on EVERY base-game frame (openRisks LOW): it
          // must NOT live inside the drawSpiritFigure gate, so the phase never
          // resets when the figure's visibility toggles. RG-C5: NICHE_BREATH_HZ
          // is module-const (≤0.04Hz), value/streak/wager-independent.
          nicheBreathPhaseRef.current += (NICHE_BREATH_HZ * dt) / 1000
        }

        // The header band only draws on desktop/tablet (hg.hbH > 0). Mobile uses
        // the compact in-board row path (hg.hbH === 0 but hg.isMobile true). The
        // bonus phase sets hg.hbH === 0 and hg.isMobile false → nothing draws.
        // The band draws in every base-game phase (hg.hbH > 0) on ALL viewports —
        // mobile now uses a real (shorter) band carved into the frame top. The
        // SPIRIT FIGURE is desktop/tablet only: on mobile the character-layer
        // dragon already looms in the gap above, so a second band figure would be
        // redundant. The bonus phase sets hg.hbH === 0 → nothing draws.
        const drawBand = hg.hbH > 0
        // Tim 2026-06-02: the in-canvas band spirit + warm backlight glow read as a
        // "pathetic lantern glow". The spirit now comes from the z-1 character-layer
        // cutout that looms BEHIND the slots (in front of the dark backdrop) through
        // the translucent band region of the panel — NOT drawn on the canvas band.
        // So the in-band figure draw is disabled (kept gated, not deleted).
        const drawSpiritFigure = false
        if (drawBand) {
          const orbD = hg.orbD
          const socketCx = hg.socketCx
          const socketCy = hg.socketCy

          // ── (0) Sumi-e ink-wash column accents — CENTER-TRANSITION zone ──────
          // Two faint static ink-tone columns bridge the data-left and spirit-right
          // halves so the band has no dead band-center. STATIC (no animation): two
          // tiny radialGradients painted source-over each frame (negligible cost).
          // Desktop/tablet only (drawSpiritFigure) — mobile has no transition zone.
          // Ink tone rgba(8,5,3,...) → zero cyan (r >= g >= b).
          if (drawSpiritFigure) {
            const accentCy = gridY - hg.hbH * 0.5
            const inkAccents: ReadonlyArray<{ fx: number; rMult: number; a: number }> = [
              { fx: 0.415, rMult: 0.9, a: 0.15 },
              { fx: 0.468, rMult: 0.7, a: 0.1 },
            ]
            ctx.save()
            for (const acc of inkAccents) {
              const acx = gridX + gridW * acc.fx
              const ar = hg.hbH * acc.rMult
              const ig = ctx.createRadialGradient(acx, accentCy, 0, acx, accentCy, ar)
              ig.addColorStop(0, `rgba(8,5,3,${acc.a})`)
              ig.addColorStop(1, 'rgba(8,5,3,0)')
              ctx.fillStyle = ig
              ctx.beginPath()
              ctx.arc(acx, accentCy, ar, 0, Math.PI * 2)
              ctx.fill()
            }
            ctx.restore()
          }

          // ── (1) Spirit figure (feathered) — desktop/tablet band only ─────────
          if (drawSpiritFigure) {
            const hImg = spiritHeaderImageRef.current
            if (hImg && hImg.complete && hImg.naturalWidth > 0) {
              const blend = getSpiritHeaderBlend(activeRegionId ?? null)
              // spiritDrawH = 4.2x band height so the dragon HEAD + SHOULDERS fill
              // the band (the band shows the top ~24% of the 4.2x figure); the
              // lower body bleeds into the top of the cell zone via the bottom
              // feather. Raised from 3.2 → 4.2 (Tim 2026-06-02 "kinda boring").
              let spiritDrawH = hg.hbH * SPIRIT_HEADER_DRAW_H_MULT
              let spiritDrawW = spiritDrawH * (hImg.naturalWidth / hImg.naturalHeight)
              // openRisks MEDIUM — clamp width so wide-aspect PNGs (ARASHI wing
              // spread) never bleed left past the sumi-e column accents. Applied
              // BEFORE drawX/drawY + the offscreen-rebuild check so the cached
              // offscreen + draw all agree on one size.
              const maxSpiritW = gridW * SPIRIT_MAX_W_FRAC
              if (spiritDrawW > maxSpiritW) {
                spiritDrawW = maxSpiritW
                spiritDrawH = spiritDrawW * (hImg.naturalHeight / hImg.naturalWidth)
              }
              const figureCx = gridX + gridW * blend.posX
              // Vertical midpoint a touch above the divider (gridY) → head in band.
              const figureCy = gridY - hg.hbH * 0.08
              const drawX = figureCx - spiritDrawW / 2
              const drawY = figureCy - spiritDrawH / 2
              const bandCy = gridY - hg.hbH * 0.5

              // ── STEP 1 — SHRINE ALCOVE (warm-charcoal ground, drawn BEFORE the
              // figure). This is the structural fix for the dark-on-dark trap:
              // screen(darkInk, nearBlackBand) ≈ 0, so the dark-ink spirit barely
              // registered. Painting a warm-charcoal recess first means the dark
              // ink now reads as a sumi-e ink-wash SILHOUETTE against a lantern-lit
              // shrine, exactly as sumi-e reads on aged shikishi paper. Two layers:
              //   (a) PRIMARY warm-charcoal ground — STATIC, cached as a
              //       CanvasGradient (depends only on figureCx/bandCy/hbH).
              //   (b) AMBER edge layer — animated by NICHE_BREATH, recreated per
              //       frame (one small createRadialGradient; openRisks LOW).
              // ZERO cyan: every stop has r >= g >= b (no g>180 && b>180). Amber
              // peaks at r=200,g=120 (g < 180 ✓).
              {
                // (a) Primary warm-charcoal ground — cached.
                const alcoveKey = `${Math.round(figureCx)},${Math.round(bandCy)},${hg.hbH}`
                if (
                  alcovePrimaryGradKeyRef.current !== alcoveKey ||
                  !alcovePrimaryGradRef.current
                ) {
                  const rOuter = hg.hbH * ALCOVE_PRIMARY_RADIUS_MULT
                  const g = ctx.createRadialGradient(figureCx, bandCy, 0, figureCx, bandCy, rOuter)
                  g.addColorStop(0.0, 'rgba(42,30,18,0.92)')   // warm-charcoal peak (legibility ground)
                  g.addColorStop(0.28, 'rgba(34,24,14,0.72)')
                  g.addColorStop(0.58, 'rgba(22,16,10,0.42)')
                  g.addColorStop(1.0, 'rgba(12,8,5,0)')
                  alcovePrimaryGradRef.current = g
                  alcovePrimaryGradKeyRef.current = alcoveKey
                }
                const rPrimary = hg.hbH * ALCOVE_PRIMARY_RADIUS_MULT
                ctx.save()
                ctx.fillStyle = alcovePrimaryGradRef.current
                ctx.beginPath()
                ctx.arc(figureCx, bandCy, rPrimary, 0, Math.PI * 2)
                ctx.fill()
                ctx.restore()

                // (b) Amber lantern-ring layer — animated by NICHE_BREATH. The
                // amber warmth RINGS the silhouette (transparent center) so it
                // reads as side-lit lantern glow wrapping the form, not a flat
                // orange blob. RG-C5: phase/amplitude/base are module-const;
                // reduced-motion freezes breathT to 0 → fixed warm zone.
                const breathT = prefersReducedMotionRef.current
                  ? 0
                  : Math.sin(nicheBreathPhaseRef.current * Math.PI * 2)
                const nicheAmberAlpha = NICHE_BREATH_BASE_ALPHA + NICHE_BREATH_AMPLITUDE * breathT
                const outerAmberAlpha = Math.min(0.45, nicheAmberAlpha * 1.4)
                const rAmber = hg.hbH * ALCOVE_AMBER_RADIUS_MULT
                const ag = ctx.createRadialGradient(figureCx, bandCy, 0, figureCx, bandCy, rAmber)
                ag.addColorStop(0.0, 'rgba(200,120,38,0)')                                   // transparent center
                ag.addColorStop(0.4, `rgba(196,108,28,${nicheAmberAlpha.toFixed(3)})`)        // animated amber ring
                ag.addColorStop(0.7, `rgba(172,90,22,${outerAmberAlpha.toFixed(3)})`)         // outer warm peak
                ag.addColorStop(1.0, 'rgba(160,82,18,0)')                                     // transparent edge
                ctx.save()
                ctx.fillStyle = ag
                ctx.beginPath()
                ctx.arc(figureCx, bandCy, rAmber, 0, Math.PI * 2)
                ctx.fill()
                ctx.restore()
              }

              // Rebuild the feathered offscreen ONCE per src/size (no per-frame
              // allocation). The mask: bottom/top/left/right gradients erased via
              // destination-in, dissolving the figure INTO the board frame so it
              // is not a cut-out sticker. Feather fractions are module-consts (they
              // never change at runtime) so the offKey need only capture size.
              const offKey = `${spiritHeaderSrcRef.current ?? ''}:${Math.round(spiritDrawW)}x${Math.round(spiritDrawH)}`
              if (
                spiritHeaderOffscreenKeyRef.current !== offKey &&
                spiritDrawW >= 1 && spiritDrawH >= 1
              ) {
                const off = document.createElement('canvas')
                off.width = Math.max(1, Math.round(spiritDrawW))
                off.height = Math.max(1, Math.round(spiritDrawH))
                const octx = off.getContext('2d')
                if (octx) {
                  const ow = off.width
                  const oh = off.height
                  octx.clearRect(0, 0, ow, oh)
                  octx.drawImage(hImg, 0, 0, ow, oh)
                  // Erase the edges by modulating the alpha channel. Fractions are
                  // module-consts: bottom 40% / top 12% / left 10% / right 18%.
                  octx.globalCompositeOperation = 'destination-in'
                  // Bottom feather (merge into cell zone): opaque→transparent.
                  const bottomStart = oh * (1 - SPIRIT_FEATHER_BOTTOM)
                  const gB = octx.createLinearGradient(0, bottomStart, 0, oh)
                  gB.addColorStop(0, 'rgba(0,0,0,1)')
                  gB.addColorStop(1, 'rgba(0,0,0,0)')
                  octx.fillStyle = gB
                  octx.fillRect(0, bottomStart, ow, oh - bottomStart)
                  // Top feather: reduced to 12% so more of the dragon head reads.
                  const topEnd = oh * SPIRIT_FEATHER_TOP
                  const gT = octx.createLinearGradient(0, topEnd, 0, 0)
                  gT.addColorStop(0, 'rgba(0,0,0,1)')
                  gT.addColorStop(1, 'rgba(0,0,0,0)')
                  octx.fillStyle = gT
                  octx.fillRect(0, 0, ow, topEnd)
                  // Left feather: reduced to 10% so the body reads toward center.
                  const leftEnd = ow * SPIRIT_FEATHER_LEFT
                  const gL = octx.createLinearGradient(0, 0, leftEnd, 0)
                  gL.addColorStop(0, 'rgba(0,0,0,0)')
                  gL.addColorStop(1, 'rgba(0,0,0,1)')
                  octx.fillStyle = gL
                  octx.fillRect(0, 0, leftEnd, oh)
                  // Right feather (resolves into lacquer frame): 18%.
                  const rightStart = ow * (1 - SPIRIT_FEATHER_RIGHT)
                  const gR = octx.createLinearGradient(rightStart, 0, ow, 0)
                  gR.addColorStop(0, 'rgba(0,0,0,1)')
                  gR.addColorStop(1, 'rgba(0,0,0,0)')
                  octx.fillStyle = gR
                  octx.fillRect(rightStart, 0, ow - rightStart, oh)
                  octx.globalCompositeOperation = 'source-over'
                  spiritHeaderOffscreenRef.current = off
                  spiritHeaderOffscreenKeyRef.current = offKey
                }
              }

              const off = spiritHeaderOffscreenRef.current
              if (off) {
                ctx.save()
                ctx.globalCompositeOperation = blend.composite
                ctx.globalAlpha = blend.baseAlpha
                ctx.drawImage(off, drawX, drawY, spiritDrawW, spiritDrawH)
                ctx.restore()

                // (1b) Eye-ignite glow — two amber radial blooms at the estimated
                // eye anchor. Only at 3/3. RG-C5: bloom duration is module-const.
                if (eyeIgniteRef.current.active) {
                  const anchor = SPIRIT_EYE_ANCHORS[activeRegionId ?? ''] ?? SPIRIT_EYE_ANCHOR_DEFAULT
                  const eyeX = drawX + spiritDrawW * anchor.nx
                  const eyeY = drawY + spiritDrawH * anchor.ny
                  const e = Math.min((ts - eyeIgniteRef.current.startTime) / EYE_IGNITE_BLOOM_MS, 1)
                  const eyeAlpha = (reduced ? 1 : 1 - Math.pow(1 - e, 2)) * EYE_IGNITE_PEAK_ALPHA
                  ctx.save()
                  // Slight horizontal eye separation so it reads as two eyes.
                  for (const ex of [eyeX - spiritDrawW * 0.04, eyeX + spiritDrawW * 0.04]) {
                    const eg = ctx.createRadialGradient(ex, eyeY, 1, ex, eyeY, 22)
                    eg.addColorStop(0, `rgba(244,167,62,${(0.95 * eyeAlpha).toFixed(3)})`)
                    eg.addColorStop(0.4, `rgba(212,100,20,${(0.5 * eyeAlpha).toFixed(3)})`)
                    eg.addColorStop(1, 'rgba(212,100,20,0)')
                    ctx.fillStyle = eg
                    ctx.beginPath()
                    ctx.arc(ex, eyeY, 22, 0, Math.PI * 2)
                    ctx.fill()
                  }
                  ctx.restore()
                }
              }
            }
          }

          // ── (2) Amber hairline divider at y = gridY (band ↔ cell zone) ───────
          {
            ctx.save()
            ctx.strokeStyle = HEADER_DIVIDER
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(gridX + 8, gridY)
            ctx.lineTo(gridX + gridW - 8, gridY)
            ctx.stroke()
            ctx.restore()
          }

          // ── (3) Orb sockets (empty / filled / armed) ─────────────────────────
          const armedPhase = orbArmedPhaseRef.current
          const armedRingAlpha = 0.28 + ORB_ARMED_PULSE_AMPLITUDE * Math.sin(armedPhase * Math.PI * 2)
          const orbImg = symbolImagesRef.current[SPIRIT_ORB_SYMBOL_ID]
          for (let i = 0; i < 3; i++) {
            const cx = socketCx[i] ?? 0
            const cy = socketCy
            const a = fillAlpha[i] ?? 0
            ctx.save()
            // EMPTY socket well — engraved-stone radial + double-wall rim.
            const wellGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbD * 0.5)
            wellGrad.addColorStop(0, 'rgba(18,14,10,0.92)')
            wellGrad.addColorStop(1, 'rgba(36,28,20,0.85)')
            ctx.fillStyle = wellGrad
            ctx.beginPath()
            ctx.arc(cx, cy, orbD * 0.5, 0, Math.PI * 2)
            ctx.fill()
            // Inner rim (double-wall engraved effect).
            ctx.strokeStyle = HEADER_SOCKET_INNER_RIM
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.arc(cx, cy, orbD * 0.5 - 2, 0, Math.PI * 2)
            ctx.stroke()

            // FILLED state — orb sprite + amber halo + brightened border, all
            // scaled by the fill alpha (the orb-rise feeds the destination glow).
            if (a > 0.001) {
              if (orbImg && orbImg.complete && orbImg.naturalWidth > 0) {
                ctx.save()
                ctx.globalAlpha = a
                ctx.drawImage(
                  orbImg,
                  cx - orbD * 0.38, cy - orbD * 0.38,
                  orbD * 0.76, orbD * 0.76,
                )
                ctx.restore()
              }
              // Warm amber halo over the orb (peak 0.50 amber at the mid stop).
              const halo = ctx.createRadialGradient(cx, cy, orbD * 0.38, cx, cy, orbD * 0.72)
              halo.addColorStop(0, 'rgba(244,167,62,0)')
              halo.addColorStop(0.5, 'rgba(212,137,42,0.50)')
              halo.addColorStop(1, 'rgba(180,100,30,0)')
              ctx.globalAlpha = a * 0.7
              ctx.fillStyle = halo
              ctx.beginPath()
              ctx.arc(cx, cy, orbD * 0.72, 0, Math.PI * 2)
              ctx.fill()
              ctx.globalAlpha = 1
              // Border brightens on fill.
              ctx.strokeStyle = HEADER_SOCKET_BORDER_FILLED
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.arc(cx, cy, orbD * 0.5, 0, Math.PI * 2)
              ctx.stroke()
            } else {
              // EMPTY socket — a faint warm inner glow so the dormant inscription
              // reads as alive-and-waiting rather than a dead hole (Tier 5). Static
              // literal alpha (RG-C5: not derived from streak / session / wager).
              const emptyGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbD * 0.5)
              emptyGlow.addColorStop(0,   'rgba(212,137,42,0.13)')
              emptyGlow.addColorStop(0.6, 'rgba(212,137,42,0.05)')
              emptyGlow.addColorStop(1,   'rgba(212,137,42,0)')
              ctx.fillStyle = emptyGlow
              ctx.beginPath()
              ctx.arc(cx, cy, orbD * 0.5, 0, Math.PI * 2)
              ctx.fill()
              // EMPTY border.
              ctx.strokeStyle = HEADER_SOCKET_BORDER_IDLE
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.arc(cx, cy, orbD * 0.5, 0, Math.PI * 2)
              ctx.stroke()
            }

            // ARMED ambient pulse ring (all sockets share one phase). RG-C5: the
            // amplitude (ORB_ARMED_PULSE_AMPLITUDE) is module-const.
            if (armed) {
              ctx.strokeStyle = `rgba(244,167,62,${Math.max(0, armedRingAlpha).toFixed(3)})`
              ctx.lineWidth = 1.5
              ctx.beginPath()
              ctx.arc(cx, cy, orbD * 0.62, 0, Math.PI * 2)
              ctx.stroke()
            }
            ctx.restore()
          }

          // ── (4) Count readout + label typography ─────────────────────────────
          // ALL on ONE horizontal line, vertically centered at socketCy:
          //   [sockets]  N / 3   SPIRIT BONUS  霊宿る
          // The label is laid out left→right (NOT stacked) so "SPIRIT BONUS" and
          // "霊宿る" can never overlap (Tim 2026-06-02). Sizes clamp so the mobile
          // 46px band stays legible and fits the narrow board width.
          const cx2 = socketCx[2] ?? 0
          {
            const numSize = Math.max(13, Math.min(26, Math.floor(hg.hbH * 0.34)))
            const denSize = Math.max(10, Math.min(17, Math.floor(hg.hbH * 0.22)))
            const countX = cx2 + orbD * 0.9
            if (geistMonoReadyRef.current) {
              ctx.save()
              ctx.textAlign = 'left'
              ctx.textBaseline = 'middle'
              ctx.font = `800 ${numSize}px "Geist Mono", monospace`
              ctx.fillStyle = HEADER_COUNT_NUMERATOR
              ctx.fillText(String(scatter), countX, socketCy)
              const numW = ctx.measureText(String(scatter)).width
              ctx.font = `600 ${denSize}px "Geist Mono", monospace`
              ctx.fillStyle = HEADER_COUNT_DENOM
              ctx.fillText(' / 3', countX + numW, socketCy)
              const slashW = ctx.measureText(' / 3').width
              ctx.restore()

              // SPIRIT BONUS + 霊宿る — one line, side by side, to the RIGHT of the count.
              if (notoSerifJPReadyRef.current) {
                const romanSize = Math.max(10, Math.min(16, Math.floor(hg.hbH * 0.2)))
                // 霊宿る reads as a board threshold INSCRIPTION, not a footnote — sized
                // LARGER than the roman label so it carries presence (Tim composition
                // Tier 5). Noto Serif JP, muted amber. Clamps so the mobile band stays
                // within the narrow board width.
                const kanjiSize = Math.max(15, Math.min(27, Math.floor(hg.hbH * 0.33)))
                const labelX = countX + numW + slashW + 16
                ctx.save()
                ctx.textAlign = 'left'
                ctx.textBaseline = 'middle'
                // Roman header (manual letter-spacing — Canvas2D letterSpacing is unreliable).
                const romanTracking = romanSize * 0.18
                ctx.font = `700 ${romanSize}px "Noto Serif JP", "Yu Mincho", "Source Han Serif", serif`
                ctx.fillStyle = HEADER_LABEL_ROMAN
                drawTrackedText(ctx, 'SPIRIT BONUS', labelX, socketCy, romanTracking)
                const romanW = ctx.measureText('SPIRIT BONUS').width + 'SPIRIT BONUS'.length * romanTracking
                // 霊宿る — same line, to the right of the roman with a gap. NEVER stacked.
                const kanjiX = labelX + romanW + 12
                const kanjiTracking = kanjiSize * 0.05
                ctx.font = `600 ${kanjiSize}px "Noto Serif JP", "Yu Mincho", "Source Han Serif", serif`
                if (armed && typeof ctx.filter !== 'undefined') {
                  ctx.save()
                  ctx.filter = 'blur(4px)'
                  ctx.fillStyle = 'rgba(244,167,62,0.22)'
                  drawTrackedText(ctx, '霊宿る', kanjiX, socketCy, kanjiTracking)
                  ctx.restore()
                }
                ctx.fillStyle = armed ? HEADER_LABEL_KANJI_ARMED : HEADER_LABEL_KANJI_IDLE
                drawTrackedText(ctx, '霊宿る', kanjiX, socketCy, kanjiTracking)
                ctx.restore()
              }
            }
          }

          // ── (5) In-flight orb-rise particles ─────────────────────────────────
          // A single animated orb sprite per rise traces cell-center → socket over
          // ORB_RISE_MS, ease-out-cubic, scaling up + fading out as it merges.
          // RG-C5: speed/scale/alpha module-const. Drawn across board space (above
          // the cells, outside the cell clip). Skipped under reduced-motion (the
          // rises are never pushed there). Mark inactive when complete; compact
          // the array opportunistically so it never grows unbounded.
          const rises = orbRiseRef.current
          if (rises.length > 0) {
            let anyActive = false
            for (const rise of rises) {
              if (!rise.active) continue
              const t = (ts - rise.startTime) / ORB_RISE_MS
              if (t >= 1) {
                rise.active = false
                continue
              }
              anyActive = true
              const ease = 1 - Math.pow(1 - t, 3)
              const x = rise.fromX + (rise.toX - rise.fromX) * ease
              const y = rise.fromY + (rise.toY - rise.fromY) * ease
              const scale = ORB_RISE_SCALE_START + (ORB_RISE_SCALE_END - ORB_RISE_SCALE_START) * ease
              const alpha = ORB_RISE_ALPHA_START + (ORB_RISE_ALPHA_END - ORB_RISE_ALPHA_START) * ease
              const riseD = orbD * scale
              if (orbImg && orbImg.complete && orbImg.naturalWidth > 0) {
                ctx.save()
                ctx.globalAlpha = Math.max(0, alpha)
                ctx.drawImage(orbImg, x - riseD / 2, y - riseD / 2, riseD, riseD)
                ctx.restore()
              }
            }
            // Drop completed entries once none remain active (cheap GC).
            if (!anyActive) orbRiseRef.current = []
          }
        }
      }

      // ══ LAYER SWAP → FRONT (z-4) ════════════════════════════════════════════
      // The win-celebration marks (payline trace, stone-lift, tier kanji stamp,
      // sumi-e wipe) are foreground feedback over the winning TILES — they must
      // sit on the FRONT canvas, above both the tiles and the z-3 DOM dragon.
      if (fctx) ctx = fctx

      // ── Win-line amber brushstroke trace ────────────────────────────────────
      // 2026-05-29 game-feel rebuild:
      //   - Catmull-rom smooth spline path per payline (no tangle from diagonals)
      //   - Per-payline stagger within WIN_TRACE_DRAW_DURATION_MS window
      //   - Fixed REVEAL_MS replaced by per-payline draw window
      //
      // Path construction: centripetal catmull-rom via bezierCurveTo control handles.
      // For each segment P[i]→P[i+1]:
      //   cp1 = P[i] + (P[i+1] - P[i-1]) * alpha/6   (alpha=0.5 centripetal)
      //   cp2 = P[i+1] - (P[i+2] - P[i]) * alpha/6
      // Boundary clamping: duplicate first/last point as phantom control points.
      // W-pattern paylines draw as smooth sinusoidal waves, not diagonal zigzags.
      //
      // Stroke spec (identical for all lines — RG-C5):
      //   Outer halo: rgba(244,167,62,0.28) lineWidth 10, shadowBlur 20
      //   Core:       rgba(244,167,62,0.88) lineWidth 3.5
      //   Spine:      rgba(255,245,180,0.55) lineWidth 1
      //   Nodes: r=6, rgba(255,220,80,x), shadowBlur 12
      //
      // RG-C5: pulseMod driven by cos(time) — NOT by wager/session/streak.
      const winTrace = winTraceRef.current
      // Render-level land gate: the brushstroke trace never paints while any reel
      // is still moving (Tim 2026-06-02). Pairs with the isWin gate above.
      if (winTrace.active && allReelsSettledNow) {
        const elapsed = ts - winTrace.startTime
        // C-3 FIX (2026-05-31): Trace persists as long as showWinHighlight is true
        // (i.e. through win-reveal AND settled). Previously expired at WIN_REVEAL_MS-100
        // which deactivated the trace before the cinematic completed, leaving the settled
        // grid with no payline connector. Now the trace is deactivated only when the
        // showWinHighlight useEffect re-fires (next spin start clears paylineWins → effect
        // cleanup runs → winTraceRef reset). No time-based expiry here.
        // RG-C1: trace only activates when paylineWins.length > 0 (loss = no trace).
        {
          // Pulse: ~3 oscillations per 3 s (period = 1 s).
          // Use fixed 1000ms period so the pulse is constant regardless of elapsed time.
          const pulsePhase = (elapsed / 1000) * Math.PI * 2
          const pulseMod = 0.65 + 0.35 * Math.cos(pulsePhase)
          // No fade-out — stays at full opacity while showWinHighlight is true.
          const fadeOut = 1.0

          // Draw each payline with its own per-payline draw-in stagger.
          const allPaylines = paylineWinsRef.current
          allPaylines.forEach((pw, lineIndex) => {
            const lineDef = PAYLINES[pw.lineIndex]
            if (!lineDef) return

            // Per-payline draw window: first payline gets full WIN_TRACE_DRAW_DURATION_MS,
            // each subsequent one starts WIN_TRACE_PER_LINE_STAGGER_MS later.
            const lineStartOffset = lineIndex * WIN_TRACE_PER_LINE_STAGGER_MS
            const lineElapsed = elapsed - lineStartOffset
            if (lineElapsed <= 0) return  // this line hasn't started drawing yet

            const lineDrawWindow = WIN_TRACE_DRAW_DURATION_MS - lineStartOffset
            const revealProgress = lineDrawWindow > 0
              ? Math.min(lineElapsed / lineDrawWindow, 1)
              : 1

            const visibleCols = Math.ceil(pw.matchedCols.length * revealProgress)
            if (visibleCols === 0) return

            // Build full center-point array for all matched cols (for spline math)
            const allPoints: Array<{ cx: number; cy: number }> = []
            for (let colIdx = 0; colIdx < pw.matchedCols.length; colIdx++) {
              const col = pw.matchedCols[colIdx]
              if (col === undefined) continue
              const row = lineDef[col]
              if (row === undefined) continue
              allPoints.push({
                cx: gridX + CELL_PAD + col * (cellW + CELL_PAD) + cellW / 2,
                cy: gridY + CELL_PAD + row * (cellH + CELL_PAD) + cellH / 2,
              })
            }

            // Visible slice (draw-in reveal)
            const points = allPoints.slice(0, visibleCols)
            if (points.length < 2) return

            ctx.save()
            ctx.lineCap = 'round'
            ctx.lineJoin = 'miter' // sharp V at direction changes — deliberate inlay geometry, not a sketch

            // Crisp STRAIGHT segments between winning-cell centres (Tim 2026-05-30:
            // "the line is not really straight, it's like drawn — not in our art
            // direction"). Lacquer-inlay register: tight string between points, not a
            // calligraphic catmull-rom sweep.
            const buildLinePath = () => {
              ctx.beginPath()
              ctx.moveTo(points[0]!.cx, points[0]!.cy)
              for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i]!.cx, points[i]!.cy)
              }
            }

            // Layer 1: soft outer halo
            ctx.strokeStyle = `rgba(244, 167, 62, ${0.28 * pulseMod * fadeOut})`
            ctx.lineWidth = 10
            ctx.shadowColor = 'rgba(244, 167, 62, 0.75)'
            ctx.shadowBlur = 20
            buildLinePath()
            ctx.stroke()

            // Layer 2: bright amber core (3.5px — smoother spline reads better than 4px)
            ctx.strokeStyle = `rgba(244, 167, 62, ${0.88 * pulseMod * fadeOut})`
            ctx.lineWidth = 3.5
            ctx.shadowColor = 'rgba(244, 167, 62, 0.70)'
            ctx.shadowBlur = 10
            buildLinePath()
            ctx.stroke()

            // Layer 3: white-amber spine highlight
            ctx.strokeStyle = `rgba(255, 245, 180, ${0.55 * pulseMod * fadeOut})`
            ctx.lineWidth = 1
            ctx.shadowBlur = 4
            buildLinePath()
            ctx.stroke()

            // Node dots at each visible cell center (r=6 — reference markers)
            ctx.shadowColor = 'rgba(244, 167, 62, 0.95)'
            ctx.shadowBlur = 12
            ctx.fillStyle = `rgba(255, 220, 80, ${pulseMod * fadeOut})`
            for (const { cx, cy } of points) {
              ctx.beginPath()
              ctx.arc(cx, cy, 6, 0, Math.PI * 2)
              ctx.fill()
            }

            ctx.restore()
          })
        }
      }

      // ── Stone-lift win animation (2 painted stones) ────────────────────────
      // Per BRAND_REGISTER.md §6: "Stone-lift win animation (2 canvas-painted
      // stones, 400ms, once per confirmed win, NOT looping)"
      const stone = stoneLiftRef.current
      if (stone.active) {
        const elapsed = ts - stone.startTime
        const progress = Math.min(elapsed / STONE_LIFT_MS, 1)
        const liftY = progress * STONE_LIFT_PX
        const alpha = progress < 0.5 ? 1.0 : 1.0 - (progress - 0.5) / 0.5

        if (progress >= 1) {
          stone.active = false
        } else {
          ctx.save()
          ctx.globalAlpha = alpha * 0.85

          // Stone 1: left of grid, wet rock shape
          ctx.fillStyle = '#26252a'
          ctx.beginPath()
          ctx.ellipse(
            gridX - 8,
            gridY + gridH - 16 - liftY,
            7, 4.5, 0, 0, Math.PI * 2
          )
          ctx.fill()
          // Wet sheen
          ctx.fillStyle = 'rgba(160, 155, 165, 0.4)'
          ctx.beginPath()
          ctx.ellipse(
            gridX - 9,
            gridY + gridH - 18 - liftY,
            2.5, 1.5, -0.5, 0, Math.PI * 2
          )
          ctx.fill()

          // Stone 2: right of grid, slightly smaller
          ctx.fillStyle = '#26252a'
          ctx.beginPath()
          ctx.ellipse(
            gridX + gridW + 8,
            gridY + gridH - 12 - liftY * 0.75,
            5, 3.5, 0.3, 0, Math.PI * 2
          )
          ctx.fill()
          ctx.fillStyle = 'rgba(160, 155, 165, 0.35)'
          ctx.beginPath()
          ctx.ellipse(
            gridX + gridW + 7,
            gridY + gridH - 14 - liftY * 0.75,
            2, 1, -0.3, 0, Math.PI * 2
          )
          ctx.fill()

          ctx.restore()
        }
      }

      // ── Win tier mark — NON-OBSCURING small tier indicator ──────────────────
      //
      // WIN ANIMATION DESIGN (2026-05-29 fix — Tim images 31/32/33):
      //
      // The previous implementation drew a giant kanji glyph (fontSize = cellH×1.1
      // ≈ 110px) centred on the grid, which COVERED the symbol cells entirely
      // (the DOM win-reveal card + this canvas glyph competed for the same space).
      //
      // NEW APPROACH — single focal element, no redundancy:
      //   DOM win-reveal card = the clean focal celebration (stays as-is).
      //   Canvas in-grid elements = payline trace + tile-pop (the mechanical juice).
      //   Canvas tier mark = a SMALL amber kanji stamp in the top-right corner of
      //   the grid (outside the symbol cells), NOT centred over them.
      //
      // Tier treatment:
      //   'nice'  → small 良 stamp in grid corner, no subtitle (DOM card is enough)
      //   'good'  → small 大 stamp in grid corner (DOM overlay is the hero)
      //   'big'   → drop canvas mark — DOM thunderstrike-clash overlay IS the moment
      //   'mega'  → drop canvas mark — DOM thunderstrike-clash overlay IS the moment
      //
      // Result: symbols ALWAYS stay visible. The WIN card reads clean.
      // No redundancy between DOM card and canvas. RG-C5 enforced (same timing).
      //
      // RG-C5 STRUCTURAL: all timings module-const. No session/streak scaling.
      // RG-C1: 'none' tier = no mark fired (sub-break-even wins are silent).
      const kanji = kanjiGlyphRef.current
      if (kanji.active) {
        const elapsed = ts - kanji.startTime

        let scale: number
        let alpha: number
        const scrimAlpha = 0  // scrim permanently removed — keeps DOM elements accessible

        if (elapsed < WIN_TIER_BLOOM_MS) {
          const t = elapsed / WIN_TIER_BLOOM_MS
          scale = 0.7 + t * 0.3  // simple ease-in from 0.7 → 1.0 (no elastic overshoot for small mark)
          alpha = t
        } else if (elapsed < WIN_TIER_BLOOM_MS + WIN_TIER_HOLD_MS) {
          scale = 1.0
          alpha = 1.0
        } else if (elapsed < WIN_TIER_TOTAL_MS) {
          const t = (elapsed - WIN_TIER_BLOOM_MS - WIN_TIER_HOLD_MS) / WIN_TIER_FADE_MS
          scale = 1.0
          alpha = 1.0 - t
        } else {
          kanji.active = false
          scale = 1.0
          alpha = 0
        }

        void scrimAlpha

        // 'big' and 'mega': DOM cinematic overlay is the sole celebration.
        // Drop ALL canvas kanji for these tiers — no redundancy, no competition.
        const showCanvasMark = kanji.tier === 'nice' || kanji.tier === 'good'

        if (showCanvasMark && (kanji.active || alpha > 0)) {
          // Small amber tier-mark stamp positioned at the TOP of the grid,
          // horizontally centred over the grid, above the symbol rows.
          // Height: CELL_PAD band above the first row — never overlaps any cell.
          // fontSize: fixed 22px (not cell-relative) — tasteful small stamp.
          const markFontSize = Math.round(22 * scale)
          const markX = gridX + gridW / 2
          // Anchor at gridY + CELL_PAD/2 — inside the top padding strip between
          // the grid frame and the first row of cells. Strictly above all symbols.
          const markY = gridY + CELL_PAD * 0.5

          ctx.save()
          ctx.globalAlpha = alpha * 0.82  // slightly subdued — secondary element

          // Small amber pill background behind the stamp (readable but lightweight)
          const pillW = markFontSize * (kanji.glyph.length === 1 ? 1.8 : 2.8)
          const pillH = markFontSize * 1.4
          const pillX = markX - pillW / 2
          const pillY = markY - pillH * 0.65
          ctx.fillStyle = 'rgba(14, 10, 6, 0.70)'
          ctx.shadowColor = 'rgba(0,0,0,0.55)'
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.roundRect(pillX, pillY, pillW, pillH, 3)
          ctx.fill()

          // Amber rim on the pill
          ctx.shadowBlur = 0
          ctx.strokeStyle = 'rgba(212, 137, 42, 0.55)'
          ctx.lineWidth = 1
          ctx.stroke()

          // Kanji stamp: amber, small, crisp
          ctx.font = `700 ${markFontSize}px ${C.fontKanji}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.shadowColor = 'rgba(244, 167, 62, 0.75)'
          ctx.shadowBlur = 6
          ctx.fillStyle = '#f4a73e'
          ctx.fillText(kanji.glyph, markX, markY)

          ctx.restore()
        }
      }

      // ── Sumi-e ink-splash wipe (backdrop transition) ─────────────────────────
      // Per SLOT-CRAFT-RESEARCH §11.2: full-canvas brush-stroke wipe.
      // Simulated here as a thick canvas-paint brushstroke sweep.
      // The actual backdrop change is handled by OoReiSceneBackdrop CSS crossfade.
      const sumieSplash = sumieSplashRef.current
      if (sumieSplash.active) {
        const elapsed = ts - sumieSplash.startTime
        const wipeDuration = 500
        const progress = Math.min(elapsed / wipeDuration, 1)

        if (progress >= 1) {
          sumieSplash.active = false
        } else {
          ctx.save()
          // The brushstroke sweeps from left to right
          const wipeX = -W * 0.2 + W * 1.4 * progress  // Overshoots right
          const brushH = H * 1.2

          // Create a brush-like irregular edge using a set of overlapping strokes
          const numStrokes = 8
          for (let i = 0; i < numStrokes; i++) {
            const offset = (i - numStrokes / 2) * (brushH / numStrokes)
            const thickness = H * 0.25 + Math.sin(i * 1.7) * H * 0.08
            const xVariance = Math.sin(i * 2.3) * W * 0.05

            ctx.globalAlpha = 0.85 - i * 0.05
            ctx.fillStyle = C.sumiBlack
            ctx.beginPath()
            ctx.ellipse(
              wipeX + xVariance,
              H * 0.5 + offset,
              thickness,
              brushH / numStrokes * 0.7,
              0,
              0,
              Math.PI * 2
            )
            ctx.fill()
          }
          ctx.restore()
        }
      }

      rafRef.current = requestAnimationFrame(drawFrame)
    }

    rafRef.current = requestAnimationFrame(drawFrame)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ─── DEV-ONLY: window.__ooReiGetRenderedGrid ─────────────────────────────────
  // Returns a 5×3 array of the symId the canvas is CURRENTLY drawing per visible
  // cell. Uses the EXACT same draw-resolution path as the rAF idle branch:
  //   strip[(lockedStopIdx + r) % stripLen]
  // so the values reflect pixels-on-screen, not provider state.
  //
  // In cruise/decel: samples live strip at current wrappedOffset (same as rAF).
  // In idle/land: samples via lockedStopIdx (same as rAF idle branch).
  //
  // Guarded by process.env.NODE_ENV !== 'production'; removed from prod bundle
  // by Next.js dead-code elimination. Registers on mount, tears down on unmount.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return undefined
    const w = window as unknown as Record<string, unknown>
    w['__ooReiGetDragonGeom'] = (): Record<string, number> | null => slotDragonGeomRef.current
    w['__ooReiGetRenderedGrid'] = (): Array<Array<number>> => {
      const result: Array<Array<number>> = []
      for (let col = 0; col < COLS; col++) {
        const strip = REEL_STRIPS[col]
        if (!strip) { result.push([-1, -1, -1]); continue }
        const stripLen = strip.length
        const reelState = reelStates.current[col]
        if (!reelState) { result.push([-1, -1, -1]); continue }

        const colSyms: number[] = []
        for (let r = 0; r < ROWS; r++) {
          let symId: number
          const animating =
            reelState.state === 'cruise' ||
            reelState.state === 'decel' ||
            reelState.state === 'land'

          if (animating) {
            // Spinning/decelerating/landing: sample live strip at current offset.
            const cellPitch = 0  // cellPitch not available here — use decelTargetOffset if decel
            // Best approximation during animation: use decelTargetOffset when in decel/land.
            if (
              (reelState.state === 'decel' || reelState.state === 'land') &&
              reelState.lockedStopIdx >= 0
            ) {
              // lockedStopIdx is set during decel lazy-resolve — use it (same as idle path)
              const idx = ((reelState.lockedStopIdx + r) % stripLen + stripLen) % stripLen
              symId = strip[idx] as number
            } else {
              // Cruise: no locked stop yet — report -1 (still spinning, can't read)
              symId = -1
            }
          } else {
            // Idle: exact same path as rAF loop draw code
            const lockedStopIdx = reelState.lockedStopIdx
            const idx = lockedStopIdx >= 0
              ? ((lockedStopIdx + r) % stripLen + stripLen) % stripLen
              : ((col + r) % stripLen + stripLen) % stripLen
            symId = strip[idx] as number
          }
          colSyms.push(symId ?? -1)
        }
        result.push(colSyms)
      }
      return result
    }
    return () => {
      delete w['__ooReiGetRenderedGrid']
      delete w['__ooReiGetDragonGeom']
    }
  // reelStates is a ref — intentionally not in deps (stable identity)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      {/* BACK canvas (z-2): panel / band / sockets / haze / dais / dragon-ground.
          The DOM ARASHI dragon sits at z-3 (between), in front of THIS canvas. */}
      <div ref={containerRef} style={backContainerStyle}>
        <canvas
          ref={canvasRef}
          style={canvasStyle}
          aria-label="OO-REI slot grid"
          role="img"
        />
      </div>
      {/* FRONT canvas (z-4): ONLY the cell tiles + win marks. Transparent
          elsewhere, so the z-3 DOM dragon shows through everywhere there is no
          tile — and the opaque tiles OCCLUDE the dragon body that crosses them.
          pointerEvents:none — the BACK container already owns the interaction
          surface (the wrapper in OoReiExperience sets pointer-events:all on it). */}
      <canvas
        ref={frontCanvasRef}
        style={frontCanvasStyle}
        aria-hidden="true"
      />
    </>
  )
}

// BACK layer wrapper — z-2. Holds the panel/band/dais/dragon-ground canvas.
const backContainerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 2,
}

// FRONT layer canvas — z-4. ONLY the cell tiles. Sits in FRONT of the z-3 DOM
// dragon so the tiles stay fully visible + playable and occlude the dragon body.
const frontCanvasStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  zIndex: 4,
  pointerEvents: 'none',
}

const canvasStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
}

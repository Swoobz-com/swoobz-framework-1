/**
 * ABYSS LINE — Sunken Treasure. Top-level experience (2026-07-06 re-skin from
 * the prior dark-stone Aztec register). The wreck of the "Golden Sledge",
 * 3,800m deep: a fixed underwater scene (the supplied `abyss-background.svg` —
 * water gradient, godrays, trench walls, kelp, seafloor, wreck treasure, a naval
 * mine, and the SUB with its cyan porthole + amber lamp + light cone on the
 * board) frames a board of gold DUCATS. The diver traces a claim line of ducats,
 * then RUNS THE LINE (commit once) to run it ducat-to-ducat; one cracked ducat
 * (a naval mine) busts the dive. The board is the centerpiece; the control
 * column carries DIVE DEPTH, CLAIM LINE, the brass HAUL gauge, YOUR BET and the
 * single cyan CTA. Settlement is the Glass Box receipt (house-wide concept, kept).
 *
 * PALETTE / RULE OF THREE (strict): gold (`GOLD`/`GOLD_LIGHT`/`GOLD_DARK`) = value
 * (balance, multipliers, haul, chips, ducat body, needle); player cyan
 * (`PLAYER`/`PLAYER_DEEP`/`PLAYER_TEXT`) = the player (route seal + number +
 * connector, toggles, primary CTA, sub-light); red (`BLOOD`) = danger (mine,
 * cracked, bust). Panels/text use the Abyss water tokens (`STONE_*`/`INK`/`BONE`/
 * `SAND`, `BRASS_*` = the steel-panel family). Cyan + gold return together but
 * stay spatially separated (never on the same element).
 *
 * BACKGROUND. The supplied `abyss-background.svg` is drawn as a full-cover page
 * background: "the background never moves, only board contents + panel states
 * change." A per-depth `DepthTint` overlay recolors the SAME scene per DIVE DEPTH
 * (reef lighter / midnight default / hadal darker + red lamp dots).
 *
 * JUICE (RG-C5: all celebration timings/amplitudes are module consts, identical
 * regardless of streak, session balance, or payout). Every claimed ducat flies a
 * gold coin from the board to the HAUL gauge (symbol→meter, exact per-ducat delta
 * via `coinDeltaBps`); the gauge needle swings + overshoots to the running total;
 * a fixed "SECURED THE HAUL" hero-pop fires once on any fully-claimed line; a
 * bust fires the red shockwave. The board canvas owns the ducat reveal/mine
 * satisfaction — see `AssayGridCanvas.tsx`'s own header docblock.
 *
 * NAME "ABYSS LINE" (display + wordmark). Folder slug stays `assay`; internal ids
 * (`TierId`, `phase.kind`, engine/component names) and ALL math are untouched —
 * this is a skin/color/vocabulary/backdrop/asset pass only.
 *
 * Engine/UI boundary: this file reads engine values and renders; all math lives
 * in `assayMath.ts` / `assayProvider.ts`. No payout arithmetic here.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  coinLadderBps,
  formatMultiplier,
  formatUsdc,
  GOLDEN_COIN_LADDER_BPS,
  MAX_TRAIL,
  MIN_TRAIL,
  ONE_X_BPS,
  settlePayout,
  TARGET_RTP_BPS,
  TIER_MAX_MULTIPLE_BPS,
  TIER_ORDER,
  TIERS,
} from './assayMath'
import type { TierId } from './assayMath'
// TIER_DISPLAY_LABEL is owned by `assayProvider.ts` so the copy-only tier
// display labels have ONE source of truth shared by `TierRow`/`TierChip` AND
// the Glass Box certificate — this file declares no local copy.
import { tallyLamports, TIER_DISPLAY_LABEL, useAssayController } from './assayProvider'
import { AssayGridCanvas, struckDoubloonDataUrl, sunGlyphPoints, SUN_GLYPH_BOSS_RATIO } from './AssayGridCanvas'
// BACKGROUND (2026-07-06 Abyss re-skin): the page is backed by the SUPPLIED
// `abyss-background.svg` full-cover scene (below). No image PNG backdrop and no
// procedural warm-glow stack — the illustrated underwater world IS the backdrop.
// The wordmark is drawn in-tokens (`AbyssWordmark`), single off-white; the
// legacy PNG lockup is retired.
// ABYSS LINE background scene (supplied vector) — the fixed underwater world:
// water gradient, godrays, trench walls, kelp, seafloor, wreck treasure, a naval
// mine, and the SUB with its cyan porthole + amber lamp + light cone on the
// board. "Background never moves; only board contents + panel states change."
import abyssBgUrl from './assets/abyss-background.svg'

// ── ABYSS WATER + GOLD PALETTE (2026-07-06 re-skin). Deep-water tokens
// (`INK`/`STONE_DEEP`/`STONE_WARM` = bg-deep/water/water-light), a gold family
// (`GOLD`/`GOLD_LIGHT`/`GOLD_DARK`) = VALUE (balance/multiplier/haul/chip/ducat/
// needle), player cyan (`PLAYER`/`PLAYER_DEEP`/`PLAYER_TEXT`) = the player
// (route/selection/toggles/CTA/sub-light), red (`BLOOD`) = danger. The `BRASS_*`
// names are legacy identifiers now pointing at the cool STEEL-BLUE panel family
// (#2c4356 hairline etc.). Converges with `AssayGridCanvas.tsx`'s `COL` object —
// the gold family is IDENTICAL across both files. Cyan + gold stay spatially
// separated; the small-numeral `ACCENT_NUM` is Abyss gold (value).
const CARD_BG = 'linear-gradient(160deg,#103042,#081b28 60%,#03090f)'
// (LEGACY token names kept — `STONE_*`/`BRASS_*` are repurposed to the cool
// Abyss deep-water register below; see the per-token comments + PROVENANCE.)
const INK = '#03090f' // deepest water / vignette (bg-deep)
const STONE_DEEP = '#081b28' // mid water panel bed (bg-water)
const STONE_WARM = '#103042' // upper-water glow (bg-water-light)
const BRASS_DARK = '#22333f' // panel-border-dark / secondary button base
const BRASS_MID = '#2c4356' // panel hairline (panel-border)
const BRASS_LIGHT = '#3d5666' // lighter panel edge
const SAND = '#87a6b5' // muted water text (text-muted)
const BONE = '#e6f1f5' // primary water text (text)
const BLOOD = '#ff5d5d' // danger — mine / cracked / bust (danger)
// Player cyan family — route / selection / toggles / primary CTA / sub-light.
const PLAYER = '#35e0d2'
const PLAYER_DEEP = '#0d3c38'
const PLAYER_TEXT = '#8ff2e8'
// Gold triad — the ONE energized/interactive accent family (board, HUD, CTA,
// frame all share it), re-anchored off Tim's `#E8B04B`.
const GOLD = '#f0b542'
const GOLD_LIGHT = '#f5d98a'
const GOLD_DARK = '#8a6a26'
/** Accent numerals under 32px render in this dimmer green, not gold directly
 *  — the canonical OLED-bloom exception for small brand-theme accent text
 *  (SWOOBZ-DESIGN-SYSTEM.md v3): saturated accent hues bloom badly at small
 *  point sizes. Reserved for genuine numeric/monetary/count VALUES, not
 *  headings/labels. Kept green through the pivot (§7) — jade never lands on a
 *  HUD numeral, so the two greens stay on non-overlapping surfaces. */
const ACCENT_NUM = '#f0b542' // monetary values render in Abyss gold (value)
const BRASS_BTN = `linear-gradient(${BRASS_LIGHT},${BRASS_MID})`
const BRASS_BTN_DIM = `linear-gradient(${BRASS_MID},${BRASS_DARK})`
const HAIRLINE = 'rgba(255,255,255,0.08)'
// Frame brass — the outer card hairline + corner brackets + rail bezel ring.
// The cool bone north-star the rest of the frame matches.
const FRAME_HAIRLINE = 'rgba(44,67,86,0.9)'
const FRAME_BRACKET = 'rgba(61,86,102,0.8)'
/** Hoisted so sub-components declared below `AssayExperience` (e.g.
 *  `TierRow`, `QuickChip`) can reference the same font stack without each
 *  redeclaring the literal string. */
const FONT_MONO = '"Geist Mono", monospace'

/** The mockup `.p` info panel (entry-screen THE DIVE / DIVE DEPTH column):
 *  semi-transparent Abyss panel, steel hairline, radius 10. */
const LOBBY_INFO_PANEL: React.CSSProperties = {
  background: 'rgba(16,26,36,0.93)',
  border: '1px solid #2c4356',
  borderRadius: 10,
  padding: '9px 11px',
  marginBottom: 8,
}
const LOBBY_INFO_LABEL: React.CSSProperties = {
  color: '#87a6b5',
  fontSize: 11,
  letterSpacing: 2,
  marginBottom: 5,
  fontFamily: FONT_MONO,
}

// ── PLATE / GAUGE_WINDOW — the deep-water console material grammar. PLATE = the
// dark plaque surface skinning the header console bar and the rail
// casing's recess; GAUGE_WINDOW = a recessed instrument readout (deep inset
// shadow + a faint gold hairline) skinning the certificate's seed/hash strip.
// Both are pure cool CSS gradients (no image art this round — Higgsfield
// offline), built from this file's (legacy-named) deep-water tokens, so there is
// nothing to scrim and no baked cast to police. ─────────────────────────────────
const PLATE_CONSOLE: React.CSSProperties = {
  backgroundImage: `linear-gradient(100deg, ${INK}, ${STONE_DEEP} 55%, ${INK})`,
}
// Deep-water console plaque — a plain dark deep-water gradient (the former
// `plate-specimen.png` image is dropped: it carried a baked cool readout-
// channel cast that had to be heavily scrimmed, and an interim CSS gradient is
// cleaner and provably dark by construction). A future pass can reintroduce
// a generated deep-water texture here.
const PLATE_SPECIMEN: React.CSSProperties = {
  backgroundImage: `linear-gradient(180deg, ${STONE_WARM} 0%, ${STONE_DEEP} 55%, ${INK} 100%)`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
}
const GAUGE_WINDOW: React.CSSProperties = {
  background: `linear-gradient(180deg, ${INK} 0%, ${STONE_DEEP} 100%)`,
  border: `1px solid ${BRASS_DARK}`,
  boxShadow:
    'inset 0 3px 8px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(240,181,66,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
}

// ── Module-const juice timings (RG-C5: fixed, never derived from streak, ────
// session balance, or payout size). ─────────────────────────────────────────
const COIN_FLY_MS = 520
const TALLY_SWING_MS = 320
const TALLY_PULSE_MS = 260
/** One-shot landing spark on the ASSAY TALLY dial — fired 1:1 with a real
 *  coin-fly arrival, identical duration/amplitude regardless of the coin's
 *  value (RG-C5). */
const TALLY_SPARK_MS = 420
/** Ambient work-lamp breathe period on the counter — 18s = ~0.056Hz, under
 *  the ≤0.06Hz ceiling; a slow, bounded lighting cue, never a strobe. Cool
 *  bone-tinted (a soft sub-light bone, never a saturated accent) specifically
 *  because it sits directly under the top-right `BrassCornerBracket` — a
 *  clashing wash there would fight the cool bone frame. */
const LAMP_BREATHE_MS = 18000
/** Display scale reference for the tally needle sweep — the real max ladder
 *  value (T(MAX_TRAIL)), not a magic number. Purely a gauge-face scale. */
const TALLY_MAX_REF_BPS = GOLDEN_COIN_LADDER_BPS[GOLDEN_COIN_LADDER_BPS.length - 1]!
/** "SECURED" hero-pop callout hold time — fixed, fires once per fully-proven
 *  claim-line regardless of payout size (RG-C5: no tier/streak scaling).
 *  Lengthened 1400 -> 1700 (casino-AAA revise pass, P0-C — artotty scored
 *  win-celebration 2/5): a bigger, richer badge earns a slightly longer
 *  hold so it reads as a real beat, not a blip — still a single fixed
 *  constant, identical for a 1.3x and a 100x win. */
const HERO_POP_HOLD_MS = 1700
// ── Hero-moment amplification (casino-AAA revise pass, P0-C) — every value
// below is a fixed module const, identical regardless of payout magnitude
// or streak (RG-C5 hard guardrail: the same "SECURED" beat fires for a 1.3x
// win and a 100x win, byte-for-byte). ───────────────────────────────────────
/** Second concussion-ring echo behind the hero badge — delayed start via
 *  `animationDelay`, both rings share this one fixed duration. */
const HERO_RING_MS = 900
const HERO_RING_2_DELAY_MS = 150
/** One-shot diagonal light-sweep across the whole board on a winning settle
 *  — synced with `AssayGridCanvas`'s own gold bloom-ring (`RING_WIN_MS`). */
const BOARD_SWEEP_MS = 900

// AXIS 4 — hero cartouche + strengthened settle bloom.
/** B3 fix: the cartouche body must be FULLY OPAQUE — read as a translucent hole
 *  the board coins bled through if it bottomed out at the page bed. §C: a dark
 *  deep-water gradient (was warm-brown), backed by a solid
 *  `backgroundColor` so nothing shows through at any point of the pop; the gold/
 *  brass border + inset stops (unchanged) keep it reading as a premium cartouche
 *  on the dark scene. */
const CARTOUCHE_BG = 'linear-gradient(160deg,#103042 0%,#0b2231 55%,#05121c 100%)'
const CARTOUCHE_BG_SOLID = '#081b28'
/** Concussion-ring diameter behind the hero cartouche (was a hard-coded 120). */
const HERO_RING_SIZE_PX = 150
/** One-shot carved-stone shine sweep across the cartouche, fires once with the
 *  pop-in. Fixed duration regardless of payout (RG-C5). */
const CARTOUCHE_SHINE_MS = 620
/** Peak alpha of the strengthened board-sweep gold stop on settle. */
const BOARD_BLOOM_PEAK_ALPHA = 0.35
/** Simultaneous radial flash under the diagonal board sweep on a winning
 *  settle. Fixed duration/geometry regardless of payout (RG-C5). */
const BOARD_BLOOM_RADIAL_MS = 700

// ── ASSAY TALLY premium-meter tokens (P1-F — the consolidated gauge that
// replaces the old in-canvas board-edge socket-charge strip, see
// `AssayGridCanvas.tsx`'s header comment). ──────────────────────────────────
/** Fixed cosmetic tick count along the gauge arc — purely a display scale
 *  (like `TALLY_MAX_REF_BPS`), never an economic/round value. */
const TALLY_TICK_COUNT = 9
/** One-shot shine-sweep across the gauge arc, fired 1:1 with a real coin
 *  landing (RG-C5: fixed duration/amplitude regardless of the coin's value). */
const TALLY_SHINE_MS = 700
/** Standing needle glow-pulse frequency while a tally is live — a "real
 *  instrument reading a live current" cue, the same discipline as the
 *  board's own `BEAD_PULSE_HZ` (2.2Hz), not decorative atmosphere. */
const TALLY_NEEDLE_PULSE_HZ = 1.4

// ── DESKTOP BOARD-SCALE tokens (composition-designer re-spec, 2026-07-03;
// Tim: "het is alleen heel klein voor desktop") ─────────────────────────────
// `desktopBoardPx = clamp(innerHeight - CHROME_RESERVE_PX, MIN_BOARD_PX,
// DESKTOP_BOARD_CAP_PX)`. UNCHANGED by the ROUND D rail restructure below —
// this formula still governs the board's rendered px size at a given
// viewport height; only `AssayGridCanvas`'s `GRID_DIM` import (10, was 20)
// makes each tile bigger at that SAME board size (guard: this pass must not
// silently fold new chrome into `CHROME_RESERVE_PX` in a way that shrinks
// the board — verified live via the render pass, not just by inspection).
//
// CTA-BELOW-FOLD FIX (visual-regression 2026-07-03, holdgate): the original
// CHROME_RESERVE_PX=300 was budgeted against the PLANNING-phase chrome only
// (~294px measured). The SETTLED phase is TALLER — it adds the Glass Box
// certificate block + the DIVE AGAIN →/CLOSE row on top of the same header —
// and that taller assembly was never re-budgeted, so at 1440×900 the old
// MIN_BOARD_PX=660 floor forced a board bigger than the settled state's real
// height budget, pushing "DIVE AGAIN →" 59-102px below the fold (worse at
// 1920×1080 too, 0-42px). `desktopBoardPx` is a SINGLE value shared by every
// phase (the board can't resize mid-round), so it must be budgeted against
// the TALLEST phase (settled), not the shortest (planning).
// Fix = two parts:
//  1. Re-measured CHROME_RESERVE_PX against the SETTLED assembly (the real
//     worst case), after also compacting that assembly's own padding/
//     line-height/margins (settled block, Glass Box certificate strip, page
//     padding, board-wrapper padding — see those call sites) so the board
//     doesn't have to shrink more than necessary to buy back the fit.
//     Live-measured non-board settled overhead (header + wordmark + page
//     padding + board-wrapper padding + settled block, everything except the
//     canvas itself) is a TRUE CONSTANT across viewport heights — 348px at
//     both 1440×900 and 1920×1080 (`scrollHeight - boardRect.height`,
//     `assay-run/holdgate-settled-cta-0703.mjs`) — plus a ~20px safety
//     margin for cross-browser font-metric variance = 368, rounded to 370.
//  2. MIN_BOARD_PX lowered from 660 to a pure SAFETY floor (480) rather than
//     a target size, so it only binds on genuinely tiny windows
//     (<480+370=850px tall) instead of overriding the height-driven formula
//     at ordinary short-desktop heights like 900 and forcing an overflow —
//     this IS the "lower the board floor on short viewports" fix: at
//     1440×900 the formula alone now yields 900-370=530 (floor never binds),
//     at 1920×1080 it yields 710, and the 2560×1440 cap (960) is untouched —
//     taller viewports still get the full-size hero board, unchanged.
// Board sizes: 530/710/960px. After codotty's grid re-baseline (10×10=100,
// `GRID_DIM` in `assayMath.ts`, math untouched here) that's ~53/71/96px
// tiles @1440×900/1920×1080/2560×1440 — the "unmistakable struck coin" scale
// ROUND D's coin-material swap (`AssayGridCanvas.tsx`) was authored for.
const CHROME_RESERVE_PX = 370
const MIN_BOARD_PX = 480
const DESKTOP_BOARD_CAP_PX = 960
/** The board's own padding (14px horizontal×2, `padding:'10px 14px 4px'`
 *  below — horizontal untouched by the vertical compaction) folded into the
 *  counter card's width, same relationship as the pre-existing 492-board/
 *  520-card pair (492+28=520). */
const BOARD_PAD_PX = 28

// ── RIGHT-GUTTER RAIL layout tokens (ROUND D — composition-designer's
// RoR-grammar port, run 2026-07-04T09-40-47Z). The shell/gutter width now
// scales off the board-driven card width, same discipline as before, but
// there is only ONE gutter now (not two flanking ones) — the rail sits
// beside the board, not mirrored on both sides, and the whole shell is a
// plain flex row (`alignItems:'stretch'` matches heights automatically, no
// manual `specimenCaseHeightPx` formula needed anymore). `WIDE_BREAKPOINT_PX`
// drops 1360→1080: the single-gutter shell needs far less width than the
// old two-flanking-case one did (roughly centerCardWidthPx + one gutter +
// one gap, vs. + two gutters + two gaps before), so more ordinary desktop
// widths now get the richer wide layout. Below the breakpoint the shell
// collapses to the original min(520px,100%) block and the rail renders
// in-flow BELOW the board instead (mobile bottom-dock, `showRail && !isWide`)
// — a graceful degradation onto the untouched, pan-only mobile board. ──────
const WIDE_BREAKPOINT_PX = 1080
const GUTTER_MIN_PX = 260
const GUTTER_MAX_PX = 380
/** Gap held between the rail casing and the center counter card. */
const RAIL_GAP_PX = 24

/** RoR-analog quick-bet chips (`YOUR BET` row) — 1/5/10/25/50 USDC. Fixed
 *  module-const preset list (RG-C5: never derived from balance/streak). */
const QUICK_CHIP_AMOUNTS_LAMPORTS: readonly bigint[] = [
  1_000_000n,
  5_000_000n,
  10_000_000n,
  25_000_000n,
  50_000_000n,
]

/** Formats a bps value as a fixed percentage string, e.g. `9650n` → "96.50%".
 *  Used ONLY for the flat RTP callout — printed IDENTICALLY on every
 *  `TierRow` (Assay's identity: RTP never varies per tier). */
function formatRtpPct(bps: bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/** Live viewport size — drives the desktop board-fill formula. SSR-safe
 *  (falls back to a sane desktop default before mount); resize-reactive. */
function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }))
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

const ASSAY_KEYFRAMES = `
@keyframes assayCoinFly {
  0%   { transform: translate(0,0) scale(1) rotate(0deg); opacity: 1; }
  50%  { transform: translate(calc(var(--dx) * 0.5), calc(var(--dy) * 0.5 - 34px)) scale(0.85) rotate(150deg); opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) scale(0.3) rotate(320deg); opacity: 0; }
}
@keyframes assayTallyPulse {
  0%   { transform: scale(1); filter: brightness(1); }
  35%  { transform: scale(1.08); filter: brightness(1.4); }
  100% { transform: scale(1); filter: brightness(1); }
}
/* One-shot ring on the ASSAY TALLY dial, fired only on a real coin landing
   (RG-C5: fixed duration/amplitude, never scaled by the coin's value). */
@keyframes assayTallySpark {
  0%   { transform: scale(0.5); opacity: 0.9; }
  100% { transform: scale(1.7); opacity: 0; }
}
/* Ambient work-lamp breathe on the counter — a real named lighting cue (the
   scene's own upper-right key light), not a decorative atmosphere loop.
   Bounded amplitude, <=0.06Hz. Bone-tinted — see LAMP_BREATHE_MS comment on
   why this is never warm gold. */
@keyframes assayLampBreathe {
  0%   { opacity: 0.65; }
  100% { opacity: 1; }
}
/* "SECURED" hero-pop — fixed pop-in/hold/fade, identical regardless of the
   claim-line's payout size (RG-C5: no tier/streak scaling). */
@keyframes assayHeroPop {
  0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.6); }
  15%  { opacity: 1; transform: translate(-50%,-50%) scale(1.08); }
  25%  { opacity: 1; transform: translate(-50%,-50%) scale(1); }
  82%  { opacity: 1; transform: translate(-50%,-50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%,-50%) scale(0.96); }
}
/* Double concussion ring behind the amplified "SECURED" badge — a second,
   slightly-delayed echo of the same shockwave (CSS animation-delay handles
   the offset, see HeroPopCallout), fixed regardless of payout size (RG-C5). */
@keyframes assayHeroRing {
  0%   { transform: translate(-50%,-50%) scale(0.5); opacity: 0.5; }
  100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; }
}
/* One-shot diagonal light-sweep across the WHOLE board on a winning settle —
   the "board bloom sweep" (P0-C). Fixed duration/amplitude regardless of
   payout size (RG-C5); fires once per proven claim-line, synced with the
   canvas's own gold bloom-ring (see AssayGridCanvas's ringRef win case).
   Authored motion, not a particle system. */
@keyframes assayBoardSweep {
  0%   { transform: translateX(-130%) skewX(-12deg); opacity: 0; }
  15%  { opacity: 0.9; }
  55%  { opacity: 0.5; }
  100% { transform: translateX(130%) skewX(-12deg); opacity: 0; }
}
/* AXIS 4 — one-shot shine sweep across the hero cartouche, fired
   once with the pop-in (reuses the assayTallyShine technique). Fixed duration
   (CARTOUCHE_SHINE_MS), identical regardless of payout size (RG-C5). */
@keyframes assayCartoucheShine {
  0%   { transform: translateX(-120%); opacity: 0; }
  20%  { opacity: 0.9; }
  100% { transform: translateX(120%); opacity: 0; }
}
/* AXIS 4 — simultaneous radial flash under the diagonal board sweep on a
   winning settle. One-shot, fixed duration/geometry regardless of payout
   (RG-C5). */
@keyframes assayBoardBloomRadial {
  0%   { opacity: 0; transform: scale(0.6); }
  25%  { opacity: 1; }
  100% { opacity: 0; transform: scale(1.15); }
}
/* ASSAY TALLY premium-meter shine sweep — a single fixed-duration highlight
   pass across the gauge arc, fired 1:1 with a real coin landing (same
   trigger as assayTallySpark/assayTallyPulse), never a decorative idle
   loop (RG-C5: fixed duration/amplitude regardless of the coin's value). */
@keyframes assayTallyShine {
  0%   { transform: translateX(-120%); opacity: 0; }
  20%  { opacity: 0.9; }
  100% { transform: translateX(120%); opacity: 0; }
}
/* ASSAY TALLY needle standing pulse — a bounded, continuous glow-breathe on
   the needle ONLY while a real tally is live (tallyBps > 0), the same "this
   is a real instrument reading a live current" cue as the board's own
   BEAD_PULSE_HZ, not decorative atmosphere. Fixed Hz (see TALLY_NEEDLE_PULSE_HZ). */
@keyframes assayNeedlePulse {
  0%   { filter: drop-shadow(0 0 1px rgba(240,181,66,0.4)); }
  50%  { filter: drop-shadow(0 0 4px rgba(240,181,66,0.95)); }
  100% { filter: drop-shadow(0 0 1px rgba(240,181,66,0.4)); }
}
/* Accessibility-qa CRIT #4 — a real focus ring on the board canvas
   (\`AssayGridCanvas.tsx\`) and every keyboard-operable control that strips its
   own default outline via inline \`all:'unset'\` (\`TierRow\`/\`TierChip\`/
   \`BreakerLever\`). \`!important\` is required here specifically because
   inline \`style\` (including \`all:'unset'\`) otherwise always wins over an
   external stylesheet rule for the same property regardless of pseudo-class
   — this is the one legitimate case where \`!important\` restores, rather
   than fights, the cascade. \`:focus-visible\` (not bare \`:focus\`) so the
   ring shows for keyboard/AT focus and does not appear on an incidental
   mouse click. */
.assayFocusable:focus-visible {
  outline: 3px solid #f0b542 !important;
  outline-offset: 2px !important;
}
/* B5 — themed thin gold-brown scrollbars on the mobile board pan-viewport
   (\`.assayBoardScroll\`, AssayGridCanvas). The native grey OS scrollbars read
   off-theme over the gold board. Thin + warm, never breaking the pan. */
.assayBoardScroll::-webkit-scrollbar { width: 6px; height: 6px; }
.assayBoardScroll::-webkit-scrollbar-track { background: rgba(3,9,15,0.5); border-radius: 6px; }
.assayBoardScroll::-webkit-scrollbar-thumb { background: rgba(166,124,62,0.7); border-radius: 6px; }
.assayBoardScroll::-webkit-scrollbar-thumb:hover { background: rgba(199,154,92,0.85); }
.assayBoardScroll::-webkit-scrollbar-corner { background: transparent; }
/* HIGH finding, board canvas focus ring — TWO failed CSS-only attempts before
   landing on the real fix (independent accessibility-qa re-verify,
   2026-07-04, both rounds): round 1 found the \`outline\` rule above computes
   correctly on the canvas but is fully clipped by two \`overflow:hidden\`
   ancestors (the counter card + the board-sweep clip wrapper). Round 1's own
   fix — an inset \`box-shadow\` via a \`.assayCanvasFocusable\` class — was
   proven INERT by an isolated repro: box-shadow, inset or not, does not
   paint above a \`<canvas>\` element's own bitmap at all, clipping ancestors
   aside. Neither CSS property can put a ring on a canvas. The actual fix
   lives in \`AssayGridCanvas.tsx\` now: a real sibling \`<div>\` overlay, sized
   to match the canvas (desktop) or the pan-viewport window (mobile),
   rendered conditionally on the same \`hasFocus\` state the in-canvas
   keyboard-cursor bracket already uses — a normal DOM box painting a normal
   CSS border competes with nothing. This comment is kept as a record of
   what NOT to try again; there is no canvas-targeted CSS rule left here. */
/* ── S5 AMBIENT DEEP-WATER FX (RG-C5: every timing/geometry below is a fixed
   module const, byte-identical on every render — never derived from streak,
   payout, balance, or session; all well under 3Hz). These give the static
   scene life: rising bubbles, drifting plankton, a slow caustic light drift,
   and a gentle kelp sway. Purely ambient, pointer-events:none, aria-hidden. */
@keyframes assayBubbleRise {
  0%   { transform: translateY(0) translateX(0); opacity: 0; }
  12%  { opacity: 0.34; }
  70%  { opacity: 0.28; }
  100% { transform: translateY(-260px) translateX(10px); opacity: 0; }
}
@keyframes assayPlanktonDrift {
  0%   { transform: translate(0,0); opacity: 0.15; }
  50%  { transform: translate(14px,-10px); opacity: 0.38; }
  100% { transform: translate(0,0); opacity: 0.15; }
}
@keyframes assayCausticDrift {
  0%   { transform: translate(-3%, 0) scale(1); opacity: 0.055; }
  50%  { transform: translate(3%, 1.5%) scale(1.06); opacity: 0.075; }
  100% { transform: translate(-3%, 0) scale(1); opacity: 0.055; }
}
@keyframes assayKelpSway {
  0%   { transform: rotate(-2.2deg); }
  100% { transform: rotate(2.2deg); }
}
@media (prefers-reduced-motion: reduce) {
  .assayAmbient * { animation: none !important; }
}
`

/** B7 (brand-cohesion) — the injected `<style>` must not leak source-comments
 *  (several of which contain em-dashes) into DOM text, where brand-cohesion-qa
 *  greps for stray em-dashes in user-facing strings. Strip every CSS comment
 *  once at module load; the rules + keyframes themselves are untouched. */
const ASSAY_STYLE_CSS = ASSAY_KEYFRAMES.replace(/\/\*[\s\S]*?\*\//g, '')

interface CoinFlight {
  id: number
  from: { x: number; y: number }
  to: { x: number; y: number }
}

/** Wide-viewport gate for the right-gutter rail. Pure media-query layout
 *  state — no gameplay/economic effect, matches on resize only. */
function useIsWide(breakpointPx: number): boolean {
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= breakpointPx,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(min-width: ${breakpointPx}px)`)
    const handler = () => setIsWide(mq.matches)
    handler()
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpointPx])
  return isWide
}

export function AssayExperience() {
  const c = useAssayController()
  const s = c.state
  const { phase } = s
  const isWide = useIsWide(WIDE_BREAKPOINT_PX)
  const showRail = phase.kind === 'planning' || phase.kind === 'assaying' || phase.kind === 'bad-vein'
  // Wide-viewport rail stays mounted one phase LONGER than the narrow
  // bottom-dock (`showRail`) — composition-designer finding, 2026-07-03:
  // `showRail` never covered 'settled'/'settling', so wide-viewport settled
  // had ZERO side rail. Scoped to ONLY the rail gate (see the JSX below) —
  // the narrow bottom-dock correctly retires on settle already (the Glass
  // Box certificate's own inline CTA replaces its job there).
  const showSpecimenCases = showRail || phase.kind === 'settled' || phase.kind === 'settling'
  // Entry/lobby two-column (autisk nit, 2026-07-06): on wide viewports the
  // lobby must lay out playfield-left / control-column-right (per the entry
  // mockup) so THE DIVE + DIVE DEPTH + ENTER THE DIVE sit above the fold —
  // planning/settled already do this via `showSpecimenCases`. `reserveGutter`
  // widens the shell + statusbar to the full two-column span whenever EITHER a
  // specimen rail OR the wide lobby column is mounted. On narrow the lobby stays
  // a single below-board block (mobile can't two-column).
  const lobbyWide = isWide && phase.kind === 'lobby'
  const reserveGutter = showSpecimenCases || lobbyWide

  // ── Desktop board-fill sizing (composition-designer re-spec) ──────────────
  // Computed unconditionally (cheap) but only ever RENDERED when isWide — the
  // narrow/mobile path below stays on the original 'min(520px,100%)' shell
  // and AssayGridCanvas's own pan-only mode, byte-unchanged in spirit.
  const { height: viewportH } = useViewportSize()
  const desktopBoardPx = clamp(viewportH - CHROME_RESERVE_PX, MIN_BOARD_PX, DESKTOP_BOARD_CAP_PX)
  const centerCardWidthPx = desktopBoardPx + BOARD_PAD_PX
  // ROUND D: ONE gutter now (was two flanking) — widened the ratio slightly
  // (0.4→0.42) since this single column now carries all five rail sections
  // that used to be split across two cases.
  const gutterWidthPx = clamp(centerCardWidthPx * 0.42, GUTTER_MIN_PX, GUTTER_MAX_PX)
  const shellMaxWidthPx = Math.round(centerCardWidthPx + gutterWidthPx + RAIL_GAP_PX)

  const trailLen = phase.kind === 'planning' ? s.trail.length : s.committedTrail.length
  const potentialBps = trailLen >= MIN_TRAIL ? coinLadderBps(Math.min(trailLen, MAX_TRAIL)) : ONE_X_BPS
  const potentialPay = settlePayout(s.wagerLamports, potentialBps)
  const liveTally = tallyLamports(s.wagerLamports, s.tallyBps)

  const outcome = phase.kind === 'settled' ? phase.outcome : null
  const veinTileIdx =
    phase.kind === 'bad-vein' ? phase.veinTileIdx : outcome ? outcome.veinTileIdx : null

  // ── "TO WIN" HERO (item 4, 2026-07-06) — the single headline value promoted
  // to hero weight in the in-canvas HUD strip above the board. ONE source of
  // truth (mirrors the HAUL gauge's own numbers), recomputed live off the
  // already-derived values — NO new math, RG-C5: purely informational, no
  // flash / pulse / escalation on ordinary updates.
  //   · arming   → below MIN_TRAIL: the "select N more" arming prompt (no number)
  //   · armed    → planning: the plotted claim line's potential payout ("TO WIN")
  //   · running  → assaying: the LIVE running haul + the frozen target as a ref
  //   · settled  → the ACTUAL settled payout (0 on a bust), held with no surprise
  //   · bust     → 0 (the line broke)
  const heroPhase: 'arming' | 'armed' | 'running' | 'settled' | 'bust' =
    phase.kind === 'planning'
      ? trailLen >= MIN_TRAIL
        ? 'armed'
        : 'arming'
      : phase.kind === 'assaying'
        ? 'running'
        : phase.kind === 'bad-vein'
          ? 'bust'
          : 'settled'
  const heroPay =
    heroPhase === 'running'
      ? liveTally
      : heroPhase === 'settled'
        ? outcome
          ? outcome.payoutLamports
          : 0n
        : heroPhase === 'bust'
          ? 0n
          : potentialPay
  const heroBps =
    heroPhase === 'running'
      ? s.tallyBps
      : heroPhase === 'settled'
        ? outcome
          ? outcome.finalMultiplierBps
          : ONE_X_BPS
        : heroPhase === 'bust'
          ? 0n
          : potentialBps
  const heroLabel =
    heroPhase === 'running'
      ? 'HAUL · LIVE'
      : heroPhase === 'settled'
        ? outcome && outcome.won
          ? 'LINE CLAIMED'
          : 'LINE BROKE'
        : heroPhase === 'bust'
          ? 'LINE BROKE'
          : 'TO WIN'
  const heroHot = heroPay > 0n

  // ── Safety surface (RG-C5/RG-C8): rounds + net delta, READ ONLY off the
  // provider's own `history` array (MAX_HISTORY=20, already tracked, never
  // previously rendered). Purely factual — no streak length, no per-round
  // escalation, no color-coded celebration; matches the sibling game's
  // `SessionMeta` derivation exactly (net = sum of payout-minus-wager). ──────
  const sessionRounds = s.history.length
  const sessionDeltaLamports = s.history.reduce(
    (acc, row) => acc + (row.payoutLamports - row.wagerLamports),
    0n,
  )
  // Session-coverage: cumulative ore-nubs claimed across every claim-line this
  // session ("cover more of the board over time"). Read-only off `history`,
  // purely descriptive — NOT a goal, quota, or decrementing pressure counter
  // (RG-C5). Each line is still an INDEPENDENT fresh-seed round; this is only a
  // running tally of what already happened, it carries no board/bomb state.
  const sessionTilesClaimed = s.history.reduce((acc, row) => acc + row.revealedSafeCount, 0)
  const [showSafety, setShowSafety] = useState(false)

  // ── Coin-fly + tally-pulse juice state ────────────────────────────────────
  const tallyRef = useRef<HTMLDivElement | null>(null)
  const flightIdRef = useRef(0)
  const [coinFlights, setCoinFlights] = useState<CoinFlight[]>([])
  const [tallyPulseKey, setTallyPulseKey] = useState(0)
  const pulseWrapRef = useRef<HTMLDivElement | null>(null)

  // ── "SECURED" hero-pop callout — fires once per fully-proven claim-line
  // (RG-C5: fixed hold time, no tier/streak scaling). Keyed on the outcome's
  // own roundIdHex so it never re-fires on an unrelated re-render of the same
  // settled state. ───────────────────────────────────────────────────────
  const [heroPopVisible, setHeroPopVisible] = useState(false)
  const heroFiredKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (outcome && outcome.won) {
      if (heroFiredKeyRef.current !== outcome.roundIdHex) {
        heroFiredKeyRef.current = outcome.roundIdHex
        setHeroPopVisible(true)
        const t = window.setTimeout(() => setHeroPopVisible(false), HERO_POP_HOLD_MS)
        return () => window.clearTimeout(t)
      }
    } else {
      heroFiredKeyRef.current = null
    }
    return undefined
  }, [outcome])

  const handleCoinFly = useCallback((flight: { x: number; y: number; deltaBps: bigint }) => {
    const targetEl = tallyRef.current
    if (!targetEl) return
    const r = targetEl.getBoundingClientRect()
    const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    const id = flightIdRef.current++
    setCoinFlights((f) => [...f, { id, from: { x: flight.x, y: flight.y }, to }])
    window.setTimeout(() => {
      setCoinFlights((f) => f.filter((cf) => cf.id !== id))
      setTallyPulseKey((k) => k + 1)
    }, COIN_FLY_MS)
  }, [])

  // Re-trigger the tally pulse CSS animation WITHOUT remounting the dial (so
  // the needle's own swing transition keeps running uninterrupted).
  useEffect(() => {
    const el = pulseWrapRef.current
    if (!el || tallyPulseKey === 0) return
    el.style.animation = 'none'
    void el.offsetWidth // force reflow so the animation can restart
    el.style.animation = `assayTallyPulse ${TALLY_PULSE_MS}ms ease-out`
  }, [tallyPulseKey])

  /** One-shot landing spark ring on the ASSAY TALLY dial, keyed so a fresh
   *  DOM node (and thus a fresh animation) mounts per real coin landing —
   *  self-cleans by ending at opacity 0, fixed duration (RG-C5). Gold (was
   *  gold) — a "charged" reaction on the dial itself, matching the coin's own
   *  proven-state gold rim motif. */
  const TallyLandSpark = () =>
    tallyPulseKey === 0 ? null : (
      <div
        key={tallyPulseKey}
        aria-hidden
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: 12,
          border: `1.5px solid rgba(240,181,66,0.85)`,
          boxShadow: '0 0 12px rgba(240,181,66,0.5)',
          pointerEvents: 'none',
          animation: `assayTallySpark ${TALLY_SPARK_MS}ms ease-out forwards`,
        }}
      />
    )

  // Shared status-line copy — used verbatim across the header status strip,
  // the mobile bottom-dock, and the wide right-gutter rail, so the layouts
  // never drift out of sync with hand-copied ternaries.
  // Numeral font routing (brand-cohesion-qa nit, 2026-07-03): every numeric
  // value gets explicit Geist Mono even when inline inside a Geist Sans
  // prose sentence, so digits read crisp/monospace everywhere on screen,
  // not just in the standalone dial/wager/payout readouts.
  const renderStatusText = () =>
    phase.kind === 'planning' ? (
      // The gold "to win" value now lives ONCE in the TO WIN hero above the
      // board — this status strip stays a plain action prompt so there are
      // never two competing gold numbers on screen (item 4, ONE source of truth).
      trailLen < MIN_TRAIL ? (
        <span style={{ color: SAND }}>
          Select <b style={{ color: PLAYER, fontFamily: FONT_MONO }}>{MIN_TRAIL - trailLen}</b> more ducat
          {MIN_TRAIL - trailLen === 1 ? '' : 's'} to trace the claim line
          {' · '}
          <span style={{ color: BONE, opacity: 0.7 }}>tap any tiles · they need not connect</span>
        </span>
      ) : (
        <span style={{ color: SAND }}>
          Claim line marked · <b style={{ color: PLAYER }}>run the line</b> to commit
        </span>
      )
    ) : phase.kind === 'bad-vein' ? (
      <span style={{ color: BLOOD }}>CRACKED DUCAT · the line broke. Dive busted.</span>
    ) : (
      <span style={{ color: BONE }}>
        Line running…{' '}
        <b style={{ fontFamily: FONT_MONO, fontWeight: 400, color: ACCENT_NUM }}>
          {s.revealedSafe.length}/{s.committedTrail.length}
        </b>{' '}
        ducats claimed
      </span>
    )

  // ── ROUND D right-gutter card stack content — ONE JSX tree, reused as-is
  // in BOTH the wide `RailShell` (right column) and the narrow bottom-dock
  // (in-flow below the board), so the two layouts can never drift out of
  // sync (composition-designer's explicit ask). Only ever ONE of the two
  // containers is actually mounted at a time (`isWide` gates them), so refs
  // (`tallyRef`/`pulseWrapRef`) always attach to exactly one live instance. */
  const railRows = (
    <>
      {/* DIVE DEPTH — the difficulty selector. Functional 3-tier selector:
          every tier genuinely arms its own real bombCount/ladder via
          `assayProvider.ts`'s shared `selectedTier`/`setSelectedTier`
          contract.
          MOBILE LAYOUT FIX (orchestrator CRIT #1, 2026-07-04): on narrow
          viewports this used to stack 3 full `TierRow` cards (~194px total)
          — the single biggest contributor to RUN THE LINE landing 417-461px
          below the fold on Pixel 7 / iPhone 14 Pro. `isWide` branches to a
          single-row, 3-up `TierChip` segmented control instead (one ~52px
          row) — same contract (`active`/`disabled`/`onClick`), same real
          per-tier math, far less height. Desktop keeps the richer `TierRow`
          stack — it isn't fold-constrained the same way. `railRows` is still
          ONE shared JSX tree (composition-designer's original discipline);
          only this one section branches internally on viewport, so the wide
          rail and the narrow bottom-dock still can never drift apart on
          everything else. */}
      <RailRow title="DIVE DEPTH" first compact={!isWide}>
        {isWide ? (
          TIER_ORDER.map((tier) => (
            <TierRow
              key={tier}
              tier={tier}
              active={tier === s.selectedTier}
              // Mirrors `assayProvider.ts`'s own `setSelectedTier` guard
              // exactly (it no-ops mid-flight so a running round's board/ladder
              // can never change under the player) — disabled here purely so
              // the UI doesn't invite a tap that would silently no-op.
              disabled={phase.kind === 'assaying' || phase.kind === 'bad-vein' || phase.kind === 'settling'}
              onClick={() => c.setSelectedTier(tier)}
            />
          ))
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            {TIER_ORDER.map((tier) => (
              <TierChip
                key={tier}
                tier={tier}
                active={tier === s.selectedTier}
                disabled={phase.kind === 'assaying' || phase.kind === 'bad-vein' || phase.kind === 'settling'}
                onClick={() => c.setSelectedTier(tier)}
              />
            ))}
          </div>
        )}
      </RailRow>

      <RailRow title="CLAIM LINE" compact={!isWide}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: phase.kind === 'planning' ? 4 : 0 }}>
          <Odometer len={trailLen} />
        </div>
        {phase.kind === 'planning' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Mobile CRIT #1 fix: CLEAR + PACE sit side by side (one ~40px
                row via `CalibToggle`'s `flexItem`) instead of stacked (was
                two ~40px rows) — one of several trims reclaiming the vertical
                budget RUN THE LINE needs to clear the mobile fold. */}
            <div style={{ display: 'flex', gap: 6 }}>
              <CalibToggle label="CLEAR" onClick={c.clearTrail} flexItem />
              <CalibToggle
                label={`PACE: ${s.revealPace === 'staggered' ? 'DUCAT-BY-DUCAT' : 'INSTANT'}`}
                onClick={c.toggleRevealPace}
                flexItem
                dense
              />
            </div>
            {s.lastTrail.length >= MIN_TRAIL && (
              <CalibToggle label="SAME LINE" onClick={c.reuseLastTrail} fullWidth />
            )}
          </div>
        )}
      </RailRow>

      {/* De-duped tally readout (autisk nit, 2026-07-04): this used to stack
          TWO numbers for the exact same running total — a dollar figure and a
          multiplier — one directly under the other with no visual relation
          between them, reading as "the tally rendered twice." Now ONE line:
          the dollar figure is the headline number, the multiplier rides
          alongside it in parentheses, exactly the way `TierRow`'s own "up to
          Nx" reads next to its label. */}
      <RailRow title="HAUL" compact={!isWide}>
        <div ref={tallyRef}>
          <div ref={pulseWrapRef} style={{ position: 'relative' }}>
            <TallyLandSpark />
            {/* Mobile CRIT #1 fix: a smaller dial on narrow viewports (one of
                several trims reclaiming the vertical budget RUN THE LINE
                needs) — desktop keeps the full "lg" instrument, it isn't
                fold-constrained the same way. */}
            <TallyDial tallyBps={s.tallyBps} size={isWide ? 'lg' : 'sm'} shineKey={tallyPulseKey} />
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 15,
                color: s.tallyBps > 0n ? ACCENT_NUM : BONE,
                textAlign: 'center',
                textShadow: s.tallyBps > 0n ? '0 0 10px rgba(240,181,66,0.35)' : 'none',
              }}
            >
              {s.tallyBps > 0n ? (
                <>
                  {formatUsdc(liveTally)}{' '}
                  <span style={{ fontSize: 11, opacity: 0.75 }}>({formatMultiplier(s.tallyBps)})</span>
                </>
              ) : (
                // Zero-state: the "up to Nx" value now lives in the TO WIN hero
                // above the board (ONE source of truth) — the gauge shows only
                // its own tactile prompt here, no competing gold number.
                <span style={{ fontSize: 12, color: BONE, opacity: 0.75 }}>haul builds as the line runs</span>
              )}
            </div>
          </div>
        </div>
      </RailRow>

      <RailRow title="YOUR BET" compact={!isWide}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <CalibKnob
            label="−"
            disabled={phase.kind !== 'planning'}
            onClick={() => c.setWager(s.wagerLamports - 500_000n)}
          />
          <div style={{ fontFamily: FONT_MONO, fontSize: 19, color: ACCENT_NUM }}>{formatUsdc(s.wagerLamports)}</div>
          <CalibKnob
            label="+"
            disabled={phase.kind !== 'planning'}
            onClick={() => c.setWager(s.wagerLamports + 500_000n)}
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {QUICK_CHIP_AMOUNTS_LAMPORTS.map((amount) => (
            <QuickChip
              key={amount.toString()}
              amount={amount}
              active={s.wagerLamports === amount}
              disabled={phase.kind !== 'planning'}
              onClick={() => c.setWager(amount)}
            />
          ))}
        </div>
      </RailRow>

      <RailRow title="BALANCE" compact={!isWide}>
        {/* Mobile CRIT #1 fix: this readout duplicates the header's own
            always-visible `BalanceDial` — on desktop it earns its place as a
            "richer, phase-aware repeat next to the CTA," but on a
            fold-constrained mobile viewport it's pure redundant height. Hide
            it there; the CTA controls below are unaffected. */}
        {isWide && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 17, color: ACCENT_NUM, marginBottom: 10 }}>
            {formatUsdc(s.balanceLamports)}
          </div>
        )}
        {phase.kind === 'planning' && (
          <BreakerLever
            onClick={() => void c.plungeKey()}
            armed={c.canPlunge}
            disabledReason={
              c.canPlunge
                ? undefined
                : s.trail.length < MIN_TRAIL
                  ? `${MIN_TRAIL - s.trail.length} MORE`
                  : s.trail.length > MAX_TRAIL
                    ? `MAX ${MAX_TRAIL}`
                    : s.wagerLamports > s.balanceLamports
                      ? 'LOW BALANCE'
                      : undefined
            }
          />
        )}
        {outcome && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <CurrentKey label="DIVE AGAIN →" onClick={c.acknowledgeSettlement} armed />
            <CalibToggle label="SAME LINE" onClick={c.reDiveSameLine} fullWidth />
          </div>
        )}
        {(phase.kind === 'assaying' || phase.kind === 'bad-vein') && (
          <div style={{ fontSize: 11, textAlign: 'center' }}>{renderStatusText()}</div>
        )}
      </RailRow>
    </>
  )

  return (
    <>
      <style>{ASSAY_STYLE_CSS}</style>
      <div
        style={{
          minHeight: '100dvh',
          width: '100%',
          // ABYSS LINE — the fixed underwater SCENE is the supplied
          // `abyss-background.svg` (water gradient, godrays, trench walls, kelp,
          // seafloor, wreck treasure, a naval mine, and the SUB with its light
          // cone aimed at the board). It is drawn as a full-cover background;
          // "the background never moves, only board contents + panel states
          // change." A per-depth tint overlay (z3, below) recolors the SAME
          // scene per DIVE DEPTH (reef lighter / midnight default / hadal darker).
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: INK,
          backgroundImage: `url(${abyssBgUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'center',
          // Trimmed 16/40 -> 12/20 -> 12/8 -> 8/6 top/bottom (visual-
          // regression 2026-07-03 CTA-below-fold fix, then re-trimmed
          // 2026-07-04 casino-AAA revise pass — FIX-6 — then re-trimmed once
          // more the same day for the mobile CRIT #1 fix, the last few px
          // RUN THE LINE needed to clear the fold on iPhone 14 Pro 393×852):
          // the old 20px bottom margin was "inert trailing padding past the
          // fold," measured live as real overflow at the LOBBY phase, same
          // reserve-budget effort as the settled block above — the card's
          // own shadow (0 24px 60px) still reads as separated from the page
          // edge at 6px.
          padding: '8px 10px 6px',
          boxSizing: 'border-box',
          fontFamily: '"Geist", system-ui, sans-serif',
          color: BONE,
        }}
      >
        {/* ── DIVE-DEPTH recolor overlay (z3, pointer-events:none, below the
            shell at zIndex 7). Recolors the SAME fixed underwater scene per
            selected depth: REEF SHELF = water +15% lighter + a cyan reef wash;
            MIDNIGHT ZONE = default (no tint); HADAL TRENCH = −20% darker + faint
            red lamp dots (the deep-danger register). Geometry never changes —
            only the wash, exactly as specced. Plus a shared bottom vignette so
            the panels read against the deep water at the frame edges. ── */}
        <DepthTint tier={s.selectedTier} />

        {/* S5 — ambient deep-water life (caustic drift, rising bubbles,
            plankton, kelp sway). RG-C5 fixed timings; below the shell. */}
        <AmbientFX />

        {/* Quiet SWOOBZ maker's-mark wordmark — DOM-level treatment (see
            `originals/pulse/PulseCurveCanvas.tsx` for the canvas Path2D
            approach used elsewhere; a plain text mark is enough here since
            this header is DOM chrome, not a canvas). Sits above the shell,
            with page-edge padding above it so it can never clip. */}
        <div style={{ textAlign: 'center', marginBottom: 4, position: 'relative', zIndex: 7 }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 5,
              // AXIS 3 — gold recolor (was SAND): the wordmark is a hero brand
              // surface, so it joins the gold value family with a soft gold
              // glow. (Small monetary numerals stay ACCENT_NUM.)
              color: GOLD_LIGHT,
              opacity: 0.9,
              textShadow: '0 0 8px rgba(240,181,66,0.35)',
            }}
          >
            SWOOBZ
          </span>
        </div>

        {/* ── ROUND D shell — a plain flex row: [counter card][right-gutter
            rail]. `alignItems:'stretch'` matches the rail casing's height to
            the counter card automatically, so no manual height formula is
            needed (the old `specimenCaseHeightPx` dance is gone). Below the
            breakpoint this collapses to a single block column and the rail
            content renders IN-FLOW below the board instead (mobile
            bottom-dock, see the narrow branch further down). ── */}
        <div
          style={{
            // Lobby-phase layout-gap fix (independent taste-guardian
            // re-review, 2026-07-04): `showSpecimenCases` is false during
            // 'lobby' (no gutter rail renders then), but this width used to
            // reserve the FULL `shellMaxWidthPx` — including the gutter +
            // gap — regardless of phase, leaving a blank unrendered strip on
            // wide viewports that exposed the raw page backdrop underneath
            // (visible ONLY through this gap, ONLY during lobby). With the
            // supplied SVG scene backdrop this just exposes the deep-water
            // gradient, but the width fix stays correct. Width now matches
            // whatever's actually rendered — the center card alone when the
            // rail isn't mounted, the full shell width when it is.
            width: isWide
              ? `min(${reserveGutter ? shellMaxWidthPx : centerCardWidthPx}px, 100%)`
              : 'min(520px, 100%)',
            display: isWide ? 'flex' : 'block',
            gap: isWide ? RAIL_GAP_PX : 0,
            alignItems: isWide ? 'stretch' : undefined,
            justifyContent: isWide ? 'center' : undefined,
            // AXIS 1 — the interactive shell (z7) stacks above the whole
            // underwater background stack: the supplied `abyss-background.svg`
            // full-cover page backdrop, the per-depth `DepthTint` wash (z3), and
            // the subtle `AmbientFX` deep-water life layer (z2).
            position: 'relative',
            zIndex: 7,
          }}
        >
        <div
          style={{
            position: 'relative',
            width: isWide ? centerCardWidthPx : '100%',
            flexShrink: isWide ? 0 : undefined,
            background: CARD_BG,
            borderRadius: 16,
            border: `1px solid ${FRAME_HAIRLINE}`,
            // A soft gold glow layer on the TOP edge — reads as the sub-light's
            // own glow spilling onto the board's edge, the same gold family as
            // the brass hairline's own inset highlight and the frame corners,
            // alongside the pre-existing black contact/cast shadow (unchanged).
            boxShadow:
              '0 24px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(202,160,64,0.12), 0 -14px 34px -20px rgba(240,181,66,0.22)',
            overflow: 'hidden',
          }}
        >
          {/* Ambient sub-light breathe — a real named lighting cue riding the
              scene's own established upper-left sub-light key. Cool bone tint,
              sitting directly under the top-right `BrassCornerBracket`,
              matching the cool bone frame. Bounded amplitude (0.65-1 opacity),
              <=0.06Hz, pointer-events none. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '55%',
              height: 220,
              pointerEvents: 'none',
              zIndex: 1,
              background: 'radial-gradient(ellipse at 100% 0%, rgba(230,241,245,0.07), rgba(230,241,245,0) 70%)',
              animation: `assayLampBreathe ${LAMP_BREATHE_MS}ms ease-in-out infinite alternate`,
            }}
          />
          {/* Brass corner brackets — the "bound ledger/counter" read: this is
              a crafted piece of furniture, not a flat panel. FRAME element
              #2 of 3 — brass survives here untouched by the recolor. */}
          <BrassCornerBracket corner="left" />
          <BrassCornerBracket corner="right" />
          {/* ── Header: nameplate — `PLATE_CONSOLE` skinned as a plain
              deep-water gradient built from this file's own (legacy-named)
              deep-water tokens (no image art this round). The bracket-buffer patches inside
              `BrassCornerBracket` (below) are defensive-only — kept because
              they cost nothing. ── */}
          <div
            style={{
              // M4 (visual-regression): the header's right-aligned BALANCE dial
              // rendered as "BALANC" — its final letter clipped. Two distinct
              // causes, both cleared here by reserving right padding:
              //  • NARROW: the page-fixed `SafetyLink` "PLAY SAFE" pill sits ~81px
              //    off the viewport's right edge and overlapped the dial; 88px
              //    clears the caption + value with margin.
              //  • WIDE: the pill is far away (centered card), but the 30px
              //    top-right `BrassCornerBracket` overlapped the caption's last
              //    letter; 38px reserves room so BALANCE clears the bracket too.
              //  • LEFT (autisk nit, 2026-07-06): the top-LEFT `BrassCornerBracket`
              //    L-stroke spans x=7..23px, so the old 16px left padding let the
              //    bracket clip the leading "A" of the ABYSS LINE wordmark. Left
              //    padding bumped 16 -> 26px (desktop + mobile) so the wordmark's
              //    first glyph clears the bracket arm.
              padding: isWide ? '10px 38px 10px 26px' : '10px 88px 10px 26px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: `1px solid ${BRASS_DARK}`,
              ...PLATE_CONSOLE,
            }}
          >
            {/* `minWidth:0` — without it, this plain block flex item keeps
                its max-content width even under a header squeeze, so the
                overflow lands on `BalanceDial` (pushed off-screen) instead
                of being absorbed here where the SESSION chip can actually
                truncate (mobile legibility fix, holdgate 2026-07-03). */}
            <div style={{ minWidth: 0 }}>
              {/* Collapsed ABYSS LINE wordmark (in-tokens: cyan + gold on deep
                  water). Drawn as text — the legacy PNG is retired. */}
              <AbyssWordmark size={15} />
              <div style={{ fontSize: 10, color: SAND, letterSpacing: 1, marginTop: 3 }}>
                the wreck of the golden sledge · RTP{' '}
                <span style={{ fontFamily: FONT_MONO, color: ACCENT_NUM }}>{formatRtpPct(TARGET_RTP_BPS)}</span>
              </div>
              {/* RG-C8 safety surface: factual session chip (rounds + signed
                  net), read-only. The PLAY SAFE affordance itself is no
                  longer rendered inline here — see `SafetyLink` below, now a
                  page-level `position:fixed` pill (mobile CRIT #2 fix: it
                  must be reachable in EVERY phase independent of the rail/
                  floor-stack height, not just scrolled-to within the header). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2, minWidth: 0 }}>
                <SessionMeta
                  rounds={sessionRounds}
                  tilesClaimed={sessionTilesClaimed}
                  deltaLamports={sessionDeltaLamports}
                />
              </div>
            </div>
            <BalanceDial label="BALANCE" value={formatUsdc(s.balanceLamports)} />
          </div>

          {/* ── Board ── */}
          {/* Vertical-only trim 14/6 -> 10/4 (horizontal 14/14 unchanged so
              `BOARD_PAD_PX` — the width-only constant folded into
              `centerCardWidthPx` — stays correct); same CTA-below-fold
              reserve-budget effort. */}
          <div style={{ padding: isWide ? '10px 14px 4px' : '6px 14px 4px', position: 'relative' }}>
            {/* ── "TO WIN" HERO plaque (item 4, 2026-07-06) — the in-canvas HUD
                strip promoted into the headline "what you can win" instrument.
                Recessed GAUGE_WINDOW material (no new panel). LEFT = depth
                context (tier name + cracked-ducat count). The tier CEILING is
                NOT repeated here (S1, 2026-07-06) — it lives once on the DIVE
                DEPTH tile's "up to {N}x". RIGHT = the hero: 11px
                "TO WIN" cap label, the 44px GOLD amount, the 18px multiplier —
                one gold value at hero weight, recomputed live. Cyan SONAR tag
                stays (rule-of-three: cyan=player) but demoted to a tiny cue. ── */}
            {phase.kind !== 'lobby' && (
              <div
                style={{
                  ...GAUGE_WINDOW,
                  borderRadius: 12,
                  padding: isWide ? '10px 16px' : '7px 12px',
                  marginBottom: isWide ? 8 : 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                {/* LEFT — depth context (tier name + cracked-ducat count). The
                    tier ceiling repeat was removed (S1): the DIVE DEPTH tile is
                    the single ceiling reference, so nothing here competes with
                    the live TO WIN route on the right. */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 13, letterSpacing: 2, color: BONE }}>
                    {TIER_DISPLAY_LABEL[s.selectedTier]}
                  </div>
                  {isWide ? (
                    <>
                      <div style={{ fontSize: 11, color: SAND, letterSpacing: 0.5, marginTop: 3 }}>
                        {TIERS[s.selectedTier].bombCount} CRACKED DUCATS
                      </div>
                      {/* S1 (2026-07-06, jesse): the "depth ceiling {N}x" repeat
                          was dropped here — it duplicated the selected DIVE DEPTH
                          tile's own "up to {N}x", a redundant second ceiling
                          number. The tile is the single ceiling reference now. */}
                      {phase.kind === 'planning' && (
                        <div style={{ fontSize: 10, color: PLAYER, letterSpacing: 1.5, marginTop: 4 }}>SONAR ACTIVE</div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: SAND, letterSpacing: 0.5, marginTop: 3 }}>
                      {/* S1 (2026-07-06): dropped the redundant "· ceiling {N}x"
                          repeat — the DIVE DEPTH tile carries the one ceiling. */}
                      {TIERS[s.selectedTier].bombCount} cracked ducats
                    </div>
                  )}
                </div>

                {/* RIGHT — the TO WIN hero (11px cap label, the big GOLD amount,
                    the multiplier). On mobile the amount + multiplier ride ONE
                    baseline row (amount stays the dominant weight) so the hero
                    pays for itself vertically and the fold clears. */}
                <div style={{ textAlign: 'right', minWidth: 0 }}>
                  {heroPhase === 'arming' ? (
                    <>
                      <div style={{ fontSize: 11, letterSpacing: 2, color: SAND }}>TO WIN</div>
                      <div style={{ fontSize: 13, color: SAND, marginTop: 4, lineHeight: 1.3, maxWidth: 210 }}>
                        Select{' '}
                        <b style={{ color: PLAYER, fontFamily: FONT_MONO }}>{MIN_TRAIL - trailLen}</b> more ducat
                        {MIN_TRAIL - trailLen === 1 ? '' : 's'} to arm the line
                      </div>
                      <div style={{ fontSize: 11, color: BONE, opacity: 0.65, marginTop: 3, lineHeight: 1.25, maxWidth: 210 }}>
                        Picks are free · they need not connect
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, letterSpacing: 2, color: heroHot ? GOLD_LIGHT : SAND }}>
                        {heroLabel}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 8, marginTop: 1 }}>
                        <div
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: isWide ? 44 : 30,
                            lineHeight: 1.02,
                            fontWeight: 700,
                            color: heroHot ? GOLD : BONE,
                            textShadow: heroHot ? '0 0 14px rgba(240,181,66,0.30)' : 'none',
                          }}
                        >
                          {formatUsdc(heroPay)}
                        </div>
                        <div style={{ fontFamily: FONT_MONO, fontSize: isWide ? 18 : 15, color: heroHot ? GOLD_LIGHT : SAND }}>
                          {formatMultiplier(heroBps)}
                        </div>
                      </div>
                      {heroPhase === 'running' && (
                        <div style={{ fontSize: 10, color: SAND, letterSpacing: 0.5, marginTop: 3 }}>
                          target {formatUsdc(potentialPay)} if line holds
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            {/* Clipped inner wrapper — ONLY so the win "board bloom sweep"
                (P0-C) is cropped to the board's own bounds rather than
                bleeding into the card padding; the coin-fly readout and the
                hero badge below stay OUTSIDE this wrapper, unclipped. */}
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <AssayGridCanvas
                phase={phase}
                trail={s.trail}
                committedTrail={s.committedTrail}
                revealedSafe={s.revealedSafe}
                veinTileIdx={veinTileIdx}
                bombBitmap={outcome ? outcome.bombBitmap : null}
                onToggleTile={c.toggleTrailTile}
                onPaintTile={c.addTrailTile}
                interactive={phase.kind === 'planning'}
                onCoinFly={handleCoinFly}
                desktopSizePx={isWide ? desktopBoardPx : undefined}
              />
              {/* Board bloom sweep — a one-shot diagonal light pass across
                  the board on a winning settle, synced with the canvas's own
                  gold bloom-ring. Fixed timing regardless of payout size
                  (RG-C5). */}
              {heroPopVisible && <BoardSweep />}
            </div>

            {/* Coin-fly readout during the cascade (cause→effect juice).
                Taste-guardian nit (2026-07-04): this used to be bare text
                over the board, which could overlap a glowing reveal coin at
                the exact spot it announces — a small opaque backing chip
                guarantees legibility regardless of what's directly behind it
                on any given frame, the same "solid base under a readout"
                discipline the accessibility contrast fixes elsewhere in this
                file already use. */}
            {phase.kind === 'assaying' && s.lastDeltaBps > 0n && (
              <div
                style={{
                  position: 'absolute',
                  // Mobile-only fix: at top:14 the centered chip's bottom-left
                  // corner brushed the tier/depth label's right end (transient
                  // sliver during the reveal). On the narrow board the centered
                  // chip is unavoidably at the label's x-range, so the clean fix
                  // is vertical: drop it clear BELOW the whole TO WIN hero plaque
                  // (measured plaque bottom ≈ 84px below this wrapper's top on
                  // mobile) so it floats over the board-top where coins reveal —
                  // 0 overlap with the depth label on every mobile viewport.
                  // Wide was already measured clean, so it stays at 14.
                  top: isWide ? 14 : 88,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: ACCENT_NUM,
                  fontFamily: FONT_MONO,
                  fontSize: 13,
                  textShadow: '0 0 8px rgba(240,181,66,0.5)',
                  pointerEvents: 'none',
                  background: 'rgba(3,9,15,0.72)',
                  borderRadius: 6,
                  padding: '3px 8px',
                }}
              >
                +{formatMultiplier(s.lastDeltaBps)} → haul
              </div>
            )}

            {/* "LINE CLAIMED" hero-pop — fires once on any fully-claimed
                line, gold register, fixed timing regardless of
                payout size. */}
            {heroPopVisible && <HeroPopCallout />}
          </div>

          {/* ── Lobby overlay (narrow only) ── on wide the SAME content renders
              as the right-gutter control column (see the lobby `RailShell`
              below) so the entry screen is two-column with ENTER THE DIVE above
              the fold, per the entry mockup. */}
          {phase.kind === 'lobby' && !isWide && (
            <Panel>
              {/* Hero ABYSS LINE wordmark — the ONE "poster" moment, run large,
                  in-tokens (cyan + gold on deep water). Legacy PNG retired. */}
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <AbyssWordmark size={40} />
                <div style={{ fontSize: 11, color: PLAYER, letterSpacing: 3, marginTop: 8 }}>SONAR ACTIVE</div>
              </div>
              {/* THE DIVE — the 4-step how-to, 1:1 with the entry mockup's
                  right-column panel (replaces the old prose intro). */}
              <div style={LOBBY_INFO_PANEL}>
                <div style={LOBBY_INFO_LABEL}>THE DIVE</div>
                <div style={{ color: BONE, fontSize: 12, lineHeight: 1.7, fontFamily: FONT_MONO }}>
                  1 · Plot your claim line
                  <br />2 · Run the line, ducat by ducat
                  <br />3 · Every ducat loads the haul
                  <br />4 · <span style={{ color: BLOOD }}>Cracked ducat = bust</span>
                </div>
              </div>
              {/* DIVE DEPTH — the 3 depth floors + their ceiling multiples
                  (gold = value), built from the live tier table so the numbers
                  can never drift from the math. */}
              <div style={{ ...LOBBY_INFO_PANEL, marginBottom: 14 }}>
                <div style={LOBBY_INFO_LABEL}>DIVE DEPTH</div>
                {TIER_ORDER.map((tier) => (
                  <div
                    key={tier}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      color: BONE,
                      fontSize: 12,
                      fontFamily: FONT_MONO,
                      padding: '2px 0',
                    }}
                  >
                    <span>{TIER_DISPLAY_LABEL[tier]}</span>
                    <span style={{ color: GOLD }}>{formatMultiplier(TIER_MAX_MULTIPLE_BPS[tier])}</span>
                  </div>
                ))}
              </div>
              <CurrentKey label="ENTER THE DIVE →" onClick={c.openPlanning} armed />
            </Panel>
          )}

          {/* ── Mobile bottom-dock (narrow viewports only): the SAME
              `railRows` content as the wide right-gutter rail, reflowed
              in-flow below the board (composition spec: setyourplay.jpg /
              blokuitelkaar.jpg bottom-dock variant), reusing the existing
              `isWide`/`WIDE_BREAKPOINT_PX` gate. PLATE_SPECIMEN material
              (the portrait panel — actually shows the hex-bolt/sub-panel-bay
              motif intact at this narrow width, unlike the wide PLATE
              landscape plate), PLUS the same smoked-glass tint overlay
              `RailShell` uses on wide — found live (first render pass): the
              bare plate art alone reads as a bright unfiltered metal panel,
              a jarring register mismatch against the desktop rail's moodier
              tinted-glass casing. ── */}
          {showRail && !isWide && (
            <div
              style={{
                position: 'relative',
                borderTop: `1px solid ${BRASS_DARK}`,
                boxShadow: `inset 0 1px 0 ${HAIRLINE}`,
                ...PLATE_SPECIMEN,
              }}
            >
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  // AZTEC PIVOT follow-up, round 2 (independent
                  // taste-guardian re-review, 2026-07-04 — the round-1 fix's
                  // 0.60-0.75 stack, PLUS a non-monotonic middle stop
                  // (0.62->0.60->0.75, an authoring slip: the 50% point was
                  // WEAKER than the 0% point) was still measurably
                  // insufficient: a bright, near-saturated highlight pixel
                  // in the source asset survives visibly even through a
                  // 25-40% transmittance gap against a near-black backdrop
                  // — human perception is very sensitive to a saturated hue
                  // against near-black, so "mostly opaque" was never going
                  // to be enough for THIS asset. Pushed to a strong,
                  // monotonic, near-flat 0.88/0.9/0.92 stack and `saturate`
                  // down further (0.75->0.6) — deliberately sacrificing most
                  // of the plate's own visible bolt/panel texture in favor
                  // of the hard "no cool accent" requirement, which wins that
                  // trade every time.
                  background:
                    'linear-gradient(180deg, rgba(16,26,36,0.88) 0%, rgba(16,26,36,0.9) 50%, rgba(16,26,36,0.92) 100%)',
                  backdropFilter: 'blur(3px) saturate(0.6)',
                  WebkitBackdropFilter: 'blur(3px) saturate(0.6)',
                }}
              />
              <div style={{ position: 'relative' }}>{railRows}</div>
            </div>
          )}

          {/* ── Slim status strip (wide viewports, active-round phases only):
              status text ONLY — the single PLUNGE control now lives
              exclusively in the right-gutter rail's BALANCE footer (ROUND D:
              never two PLUNGE buttons on screen at once). Kept here purely
              because status feedback reads better right next to the board
              than in the far right column. ── */}
          {showRail && isWide && (
            <div
              style={{
                padding: '10px 14px',
                borderTop: `1px solid ${BRASS_DARK}`,
                boxShadow: `inset 0 1px 0 ${HAIRLINE}`,
                fontSize: 11,
                ...PLATE_CONSOLE,
              }}
            >
              {renderStatusText()}
            </div>
          )}

          {/* ── Settlement: Glass Box certificate ── */}
          {outcome && (
            <div
              style={{
                // Compacted (visual-regression 2026-07-03 CTA-below-fold fix,
                // then re-compacted 2026-07-04 casino-AAA revise pass to
                // absorb the FIX-3 CopyGlyph 40x40 tap-target growth below —
                // two inline copy buttons each forcing their own row from a
                // text-driven ~26px up to a real 40px is a genuine, wanted
                // accessibility cost, so it has to be paid for here rather
                // than by shrinking the board): 16/18 -> 10/10 -> 8/6
                // top/bottom — the settled assembly is the TALLEST chrome
                // state and drives `CHROME_RESERVE_PX` below, so every px
                // trimmed here buys back board size at every desktop
                // viewport height.
                padding: '8px 14px 6px',
                borderTop: `1px solid ${BRASS_DARK}`,
                background: outcome.won
                  ? `linear-gradient(${STONE_WARM},${STONE_DEEP})`
                  : 'linear-gradient(#1c1012,#120a0b)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <div>
                  <div
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 18,
                      letterSpacing: 2,
                      // Abyss rule-of-three: WIN heading = player TEAL (spec),
                      // with a soft cyan glow; the bust label stays the danger
                      // BLOOD accent. The gold PAYOUT value below carries the
                      // "value" colour — teal never lands on the money itself.
                      color: outcome.won ? PLAYER_TEXT : BLOOD,
                      textShadow: outcome.won ? '0 0 10px rgba(53,224,210,0.45)' : 'none',
                    }}
                  >
                    {outcome.won ? 'SECURED THE HAUL' : 'RUGGED BY THE DEEP'}
                  </div>
                  <div style={{ fontSize: 11, color: SAND, fontFamily: FONT_MONO }}>
                    {outcome.won
                      ? `${outcome.revealedSafe.length} ducats · ${formatMultiplier(outcome.finalMultiplierBps)}`
                      : `busted at ducat ${outcome.revealedSafe.length + 1} of ${outcome.committedTrail.length}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: SAND }}>PAYOUT</div>
                  <div
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 20,
                      color: outcome.won ? ACCENT_NUM : SAND,
                    }}
                  >
                    {formatUsdc(outcome.payoutLamports)}
                  </div>
                </div>
              </div>

              {/* Struck-hallmark provably-fair strip — the seal reuses the
                  coin's own hallmark motif (gold-leaf, never wax) so the
                  certificate reads as part of the SAME instrument family as
                  the board, not a separate decorative flourish. */}
              <div style={{ position: 'relative' }}>
                {/* GAUGE_WINDOW material — the fairness printout is a real
                    readout, not a decorative dashed box. Text lifted (final
                    polish pass, autisk nit — "small/dim grey-on-dark, hard
                    to read"): 9.5px->10.5px, SAND->a lighter bone-tinted grey
                    (still Geist Mono, still clearly a quieter register than
                    the certificate's own BONE headline text above). */}
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10.5,
                    color: 'rgba(230,241,245,0.72)',
                    borderRadius: 8,
                    // Compacted alongside the outer settled padding above —
                    // same fix, same reason (2026-07-04: re-compacted again
                    // to help absorb the FIX-3 CopyGlyph growth).
                    padding: '4px 6px',
                    lineHeight: 1.25,
                    marginBottom: 3,
                    ...GAUGE_WINDOW,
                  }}
                >
                  {/* Header row: the certificate headline + the struck
                      HallmarkSeal as a REAL flex child. The seal used to be
                      position:absolute top:-10 right:6, which poked UP into the
                      PAYOUT value above and reached DOWN onto the first seed
                      copy button on desktop. As a flex sibling it now owns its
                      own top-right slot — 0 overlap with PAYOUT or the copy
                      buttons on every viewport — and flex wrapping (not the old
                      paddingRight:36 hack) keeps the 2-line mobile headline
                      clear of it. */}
                  {/* marginBottom clears the seal's rotate(-9deg) overflow
                      (~2.3px below its 32px flex slot) from the seed copy button
                      below with comfortable breathing room (measured desktop gap
                      ~4.7px, not a hairline). */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    {/* autisk readability (2026-07-06): the headline is prose
                        ("… cracked ducats in 14×14"), NOT hex — `break-all`
                        (inherited pattern from the hex rows) was splitting real
                        words mid-word on mobile ("ducats"→"ducat"/"s"). Scope
                        it to `normal` + `overflowWrap:break-word` so words wrap
                        at spaces (and any freak long token still breaks rather
                        than overflowing). `break-all` stays ONLY on the 64-char
                        seed/hash/round hex value spans below. */}
                    <div style={{ flex: 1, wordBreak: 'normal', overflowWrap: 'break-word' }}>
                      {/* Fairness fix (orchestrator HIGH #7, 2026-07-04): the
                          certificate NAMES the committed floor — reads
                          `outcome.tierLabel` (frozen at settle time off
                          `committedTier`) not the live `s.selectedTier`, which
                          can legally change the moment this settled screen
                          renders (a post-settle rail tap arms the NEXT round). */}
                      ◆ WRECK RECKONING · {outcome.tierLabel} · {outcome.bombCount} cracked ducats in{' '}
                      {outcome.gridDim}×{outcome.gridDim}
                    </div>
                    <HallmarkSeal />
                  </div>
                  {/* FULL 64-hex-char seed + hash (fairness self-verification —
                      a truncated-to-48 receipt is not independently
                      recomputable). Monospace + wordBreak so it wraps
                      cleanly at any viewport; a copy affordance on each so a
                      player can actually paste it into a SHA-256 tool. */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ flex: 1, wordBreak: 'break-all' }}>
                      seed&nbsp;&nbsp;{outcome.serverSeedHex}
                    </span>
                    <CopyGlyph text={outcome.serverSeedHex} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ flex: 1, wordBreak: 'break-all' }}>
                      hash&nbsp;&nbsp;{outcome.serverSeedHashHex}
                    </span>
                    <CopyGlyph text={outcome.serverSeedHashHex} />
                  </div>
                  {/* autisk readability (2026-07-06): mixed hex+prose row —
                      `break-all` was splitting "matches"→"ma"/"tches" on
                      mobile. Same scope-fix as the headline: `normal` +
                      `overflowWrap:break-word` wraps the prose at spaces while
                      the short roundIdHex (and any freak long token) still
                      breaks rather than overflowing. */}
                  <div style={{ wordBreak: 'normal', overflowWrap: 'break-word' }}>
                    round {outcome.roundIdHex} · re-derive Fisher-Yates → matches board
                  </div>
                </div>
              </div>

              {/* ROUND D: on wide viewports the primary CTA now lives ONLY
                  in the right-gutter rail's BALANCE footer (DIVE AGAIN → +
                  CLOSE) — rendering it again here would duplicate the
                  primary action. Narrow viewports have no separate rail
                  mounted during settled (`showRail` excludes it), so this
                  inline row stays the ONLY CTA there, unchanged from before. */}
              {!isWide && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <CurrentKey label="DIVE AGAIN →" onClick={c.acknowledgeSettlement} armed />
                  <CalibToggle label="SAME LINE" onClick={c.reDiveSameLine} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right-gutter rail (wide viewports only): ONE continuous
            plate-specimen-backed casing (`RailShell`), holding the 5
            `railRows` sections. See the ROUND D header-docblock paragraph
            for the full "why" — this replaces the prior two flanking
            `SpecimenCase` panels entirely. `showSpecimenCases` (not the
            narrow-dock `showRail`) also keeps this mounted through
            'settled'/'settling'. ── */}
        {isWide && showSpecimenCases && <RailShell widthPx={gutterWidthPx}>{railRows}</RailShell>}

        {/* ── Lobby control column (wide viewports only): the entry mockup's
            right column — THE DIVE how-to, the DIVE DEPTH ceiling table, and the
            ENTER THE DIVE key — hosted in the SAME `RailShell` casing as the
            planning/settled rail so the entry screen reads as one two-column
            piece with the CTA above the fold. The narrow path keeps the
            below-board `Panel` block above. ── */}
        {lobbyWide && (
          <RailShell widthPx={gutterWidthPx}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 12,
                height: '100%',
                boxSizing: 'border-box',
              }}
            >
              <div style={LOBBY_INFO_PANEL}>
                <div style={LOBBY_INFO_LABEL}>THE DIVE</div>
                <div style={{ color: BONE, fontSize: 12, lineHeight: 1.7, fontFamily: FONT_MONO }}>
                  1 · Plot your claim line
                  <br />2 · Run the line, ducat by ducat
                  <br />3 · Every ducat loads the haul
                  <br />4 · <span style={{ color: BLOOD }}>Cracked ducat = bust</span>
                </div>
              </div>
              <div style={LOBBY_INFO_PANEL}>
                <div style={LOBBY_INFO_LABEL}>DIVE DEPTH</div>
                {TIER_ORDER.map((tier) => (
                  <div
                    key={tier}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      color: BONE,
                      fontSize: 12,
                      fontFamily: FONT_MONO,
                      padding: '2px 0',
                    }}
                  >
                    <span>{TIER_DISPLAY_LABEL[tier]}</span>
                    <span style={{ color: GOLD }}>{formatMultiplier(TIER_MAX_MULTIPLE_BPS[tier])}</span>
                  </div>
                ))}
              </div>
              {/* CTA pinned toward the bottom of the column (mockup `margin-top:auto`). */}
              <div style={{ marginTop: 'auto' }}>
                <CurrentKey label="ENTER THE DIVE →" onClick={c.openPlanning} armed />
              </div>
            </div>
          </RailShell>
        )}
        </div>

        {/* ── Statusbar (the mockup bottom strip): the wreck fiction left, the
            phase-context copy right. Same panel material as the topbar. ── */}
        <div
          style={{
            position: 'relative',
            zIndex: 7,
            marginTop: 6,
            width: isWide
              ? `min(${reserveGutter ? shellMaxWidthPx : centerCardWidthPx}px, 100%)`
              : 'min(520px, 100%)',
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '0 12px',
            boxSizing: 'border-box',
            background: 'rgba(16,26,36,0.93)',
            border: `1px solid ${BRASS_MID}`,
            borderRadius: 8,
            fontFamily: FONT_MONO,
            // S7 — shrink on narrow so the status line reads without an
            // ellipsis clip ("DEPTH 3,8…"); desktop keeps the roomier spacing.
            // S2+S3 (2026-07-06, autisk+mobile-touch, Tim ≥11px readability
            // floor): the footer legend / lobby flavour pill was the smallest
            // text on the page (9px). Floored to 11px on both viewports; the
            // narrow string is already the short variant + ellipsis-safe, so
            // 11px reads without clipping.
            fontSize: 11,
            letterSpacing: isWide ? 1 : 0.3,
            color: SAND,
          }}
        >
          <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {phase.kind === 'planning' || phase.kind === 'assaying' || phase.kind === 'bad-vein'
              ? isWide
                ? 'THE LINE RUNS DUCAT-TO-DUCAT · CRACKED = BUST'
                : 'DUCAT-TO-DUCAT · CRACKED = BUST'
              : isWide
                ? 'THE WRECK OF THE GOLDEN SLEDGE · DEPTH 3,800M'
                : 'GOLDEN SLEDGE · DEPTH 3,800M'}
          </span>
          {/* The inline PLAY SAFE also exists as a page-fixed pill on mobile;
              keep it here only on wide to buy the narrow status line its width. */}
          {isWide && <span style={{ flexShrink: 0 }}>PLAY SAFE ↗</span>}
        </div>
      </div>

      {/* Coin-fly overlay — page-fixed, travels from the struck ducat to the HAUL dial. */}
      {coinFlights.map((f) => (
        <CoinFly key={f.id} from={f.from} to={f.to} />
      ))}

      {/* PLAY SAFE — page-level `position:fixed` pill (mobile CRIT #2 fix,
          orchestrator 2026-07-04: measured scrolling off-screen, top:-195,
          during the 'assaying' phase on Heavy floor). Pinned to the viewport
          corner, independent of the rail/floor-stack height and of any
          scroll position, in every phase — a sibling of the coin-fly
          overlay/SafetyPanel here rather than a header-row child. */}
      <SafetyLink onClick={() => setShowSafety(true)} />

      {showSafety && (
        <SafetyPanel
          rounds={sessionRounds}
          deltaLamports={sessionDeltaLamports}
          onClose={() => setShowSafety(false)}
        />
      )}

      {/* Accessibility-qa CRIT #6 — a single visually-hidden aria-live region
          announcing BALANCE, TRAIL, TALLY, disc reveals, and the win/bust
          outcome. React re-renders this div's text content on every relevant
          state change; a live region already present in the DOM announces
          its own content mutations automatically, so no imperative
          "announce()" plumbing is needed. */}
      <LiveAnnouncer
        phase={phase}
        balanceLamports={s.balanceLamports}
        trailLen={trailLen}
        revealedCount={s.revealedSafe.length}
        committedLen={s.committedTrail.length}
        tallyBps={s.tallyBps}
        liveTally={liveTally}
        outcome={outcome}
      />

      {/* First-time coachmark — a 2-line, dismissible, localStorage-gated
          banner teaching the core loop (theme-composer's coachmark copy).
          Shown only during a player's FIRST `planning` phase, as a
          `position:fixed` overlay — deliberately NOT an in-flow element, so
          it adds zero height to the page and can never re-open the mobile
          CTA-below-fold problem this pass just fought to close. */}
      {phase.kind === 'planning' && (
        <IntroCoachmark
          // B6 — on wide viewports the shell is centred as [board][gap][rail],
          // so the board's own centre sits LEFT of the viewport centre by half
          // the (gap + rail) width. Shift the coachmark by that so it centres
          // over the board and never covers the DIVE DEPTH tier tiles.
          boardShiftPx={isWide ? (RAIL_GAP_PX + gutterWidthPx) / 2 : 0}
        />
      )}
    </>
  )
}

// ─── In-scene HUD pieces ────────────────────────────────────────────────────

/** The ABYSS LINE wordmark, drawn in-tokens (no image asset): SINGLE off-white
 *  (#e6f1f5 / BONE) as the mockup renders it — no cyan+gold split on one element
 *  (that was a rule-of-three collision). Cyan and gold stay on their own
 *  surfaces elsewhere. Scales via `size` (collapsed header ~15px, lobby hero
 *  ~40px). */
function AbyssWordmark({ size }: { size: number }) {
  return (
    <span
      style={{
        fontFamily: FONT_MONO,
        fontSize: size,
        fontWeight: 800,
        letterSpacing: Math.max(2, size * 0.1),
        display: 'inline-block',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        color: BONE,
        textShadow: `0 0 ${size * 0.45}px rgba(230,241,245,0.28)`,
      }}
    >
      ABYSS<span style={{ marginLeft: size * 0.35 }}>LINE</span>
    </span>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  // Bottom padding trimmed 18 -> 12 (FIX-6, casino-AAA revise pass): this
  // is the LOBBY overlay's own wrapper (the ONLY call site) — live-measured
  // as the source of a residual few px of "inert trailing padding past the
  // fold" at 1440x900/1920x1080 after the page-level trim above.
  return (
    <div
      style={{
        padding: '14px 16px 12px',
        borderTop: `1px solid ${BRASS_DARK}`,
        background: `linear-gradient(${STONE_DEEP},${INK})`,
      }}
    >
      {children}
    </div>
  )
}

/** BALANCE is a monetary VALUE like every other numeric readout on this
 *  screen (PAYOUT, TO ASSAY, ASSAY TALLY) — it gets the same `ACCENT_NUM`
 *  treatment for consistency (end-to-end-cohesion-reviewer finding,
 *  2026-07-03: this was the one monetary readout left in plain bone while
 *  every sibling readout used the accent numeral color). Stays in the
 *  header (ROUND D: unchanged) so BALANCE is always visible regardless of
 *  phase — the right-gutter rail's own BALANCE row (see `railRows`) is a
 *  richer, phase-aware repeat next to the CTA, not a replacement for this
 *  always-on header readout. */
function BalanceDial({ label, value }: { label: string; value: string }) {
  // `flexShrink:0` — the balance readout always renders at full width; any
  // header-row squeeze (e.g. a long SESSION chip) must be absorbed by the
  // nameplate column, never by hiding the player's own balance off-screen
  // (mobile legibility fix, holdgate 2026-07-03).
  return (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: SAND }}>{label}</div>
      {/* GAUGE_WINDOW readout box — matches every other numeric readout. */}
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 15,
          color: ACCENT_NUM,
          borderRadius: 6,
          padding: '2px 8px',
          marginTop: 2,
          ...GAUGE_WINDOW,
        }}
      >
        {value}
      </div>
    </div>
  )
}

/** A single brass L-bracket at the top corner of the counter card — the
 *  "bound ledger/counter" material read. Static, no motion. FRAME element
 *  #2 of 3 — brass survives here untouched by the recolor. */
function BrassCornerBracket({ corner }: { corner: 'left' | 'right' }) {
  return (
    <>
      {/* Corner-buffer patch — a small opaque deep-water radial under the
          bracket corner, kept as a defensive seam against whatever sits behind
          the bracket, harmonizing the corner with the cool bone frame (same
          discipline as the rail casing's bezel buffer below). Sits at
          zIndex 1, between the plate (z-index: auto) and the bracket stroke
          itself (z-index 2). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          [corner]: 0,
          width: 30,
          height: 30,
          pointerEvents: 'none',
          zIndex: 1,
          background: `radial-gradient(circle at ${corner === 'left' ? '0% 0%' : '100% 0%'}, ${INK} 0%, ${INK} 55%, rgba(3,9,15,0) 100%)`,
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 7,
          [corner]: 7,
          width: 16,
          height: 16,
          pointerEvents: 'none',
          zIndex: 2,
          borderTop: `2px solid ${FRAME_BRACKET}`,
          [corner === 'left' ? 'borderLeft' : 'borderRight']: `2px solid ${FRAME_BRACKET}`,
          borderTopLeftRadius: corner === 'left' ? 4 : 0,
          borderTopRightRadius: corner === 'right' ? 4 : 0,
        }}
      />
    </>
  )
}

// ─── RG-C8 safety surface ───────────────────────────────────────────────────
// Pattern lifted from `originals/vault/VaultExperience.tsx`'s `SessionMeta`
// (header chip) + `AutopickSafetySurface` (safety-tools affordance), adapted
// to the cool Pulse register. Purely factual — sign is shown but the color
// is a MUTED accent/blood pair (not a bright celebratory green/red), and
// nothing here scales, pulses, or times out based on streak or payout size.

/** Header session chip: coverage stat for the session — claim-lines played,
 *  cumulative ore-nubs claimed, and net delta — derived READ ONLY from
 *  `state.history`. Renders nothing until at least one line has settled (matches
 *  the sibling game's own "no chip on a blank session" choice). Purely descriptive: it is
 *  NOT a goal, quota, or decrementing "lines remaining" pressure counter, and
 *  nothing here escalates or celebrates with streak/session size (RG-C5). Each
 *  line remains an INDEPENDENT fresh-seed round; this only tallies coverage that
 *  already happened, carrying no board or bad-vein state across lines. */
function SessionMeta({
  rounds,
  tilesClaimed,
  deltaLamports,
}: {
  rounds: number
  tilesClaimed: number
  deltaLamports: bigint
}) {
  if (rounds === 0) return null
  const positive = deltaLamports >= 0n
  const abs = positive ? deltaLamports : -deltaLamports
  const sign = positive ? '+' : '-'
  return (
    // Mobile legibility fix (holdgate 2026-07-03): this chip's string grows
    // unbounded with session length. `SafetyLink` moved off this row entirely
    // (mobile CRIT #2 fix, 2026-07-04 — it's now a page-level `position:fixed`
    // pill, no longer sharing width with this chip at all), but the truncation
    // stays: an unbounded SESSION string still shouldn't blow out the header's
    // own layout on a narrow screen.
    <span
      style={{
        fontSize: 10,
        letterSpacing: 0.5,
        color: positive ? ACCENT_NUM : BLOOD,
        fontFamily: FONT_MONO,
        flex: '1 1 auto',
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
      aria-label={`Session: ${rounds} claim ${rounds === 1 ? 'line' : 'lines'}, ${tilesClaimed} ${tilesClaimed === 1 ? 'ducat' : 'ducats'} claimed, net ${positive ? 'plus' : 'minus'} ${formatUsdc(abs)}`}
    >
      SESSION · {rounds} {rounds === 1 ? 'LINE' : 'LINES'} · {tilesClaimed} CLAIMED · {sign}
      {formatUsdc(abs)}
    </span>
  )
}

/** Reachable safety/limits affordance (RG-C8) — mobile CRIT #2 fix
 *  (orchestrator 2026-07-04: measured scrolling off-screen, top:-195, during
 *  the 'assaying' phase on Heavy floor). PLAY SAFE used to live inline in the
 *  header's flex row, which meant its reachability depended on the whole
 *  page's scroll position — fine on a short page, not fine once the
 *  rail/floor stack made the page tall enough that a mobile browser's own
 *  auto-scroll (e.g. following a focus change) could carry the header out of
 *  view. It is now a `position:fixed` pill pinned to the viewport's own
 *  top-right corner — reachable in literally every phase, independent of the
 *  rail/floor-stack height AND of any scroll position, not just "scrolled
 *  into view." Real `<button>`, 40x40 minimum tap target (mobile-touch-qa
 *  2026-07-03 finding, carried over), opaque background so it stays legible
 *  over every backdrop it might sit above. */
function SafetyLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 90,
        background: 'rgba(16,26,36,0.88)',
        border: `1px solid ${BRASS_DARK}`,
        borderRadius: 8,
        padding: '4px 10px',
        // S4 (2026-07-06, Tim ≥44px touch floor): PLAY SAFE pill 40 → 44.
        minHeight: 44,
        minWidth: 44,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        letterSpacing: 0.5,
        color: SAND,
        textDecoration: 'underline',
        textUnderlineOffset: 2,
        cursor: 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
      aria-label="Play safe · session limits and self-exclusion information"
    >
      PLAY SAFE
    </button>
  )
}

/** The safety/limits info panel — plain cool-register modal, no escalation,
 *  no upsell. States the session facts the player already sees in the
 *  header chip plus general limit-setting/self-exclusion guidance. */
function SafetyPanel({
  rounds,
  deltaLamports,
  onClose,
}: {
  rounds: number
  deltaLamports: bigint
  onClose: () => void
}) {
  const positive = deltaLamports >= 0n
  const abs = positive ? deltaLamports : -deltaLamports
  const sign = positive ? '+' : '-'
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Play safe"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3,9,15,0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          background: CARD_BG,
          border: `1px solid ${BRASS_DARK}`,
          borderRadius: 14,
          padding: '18px 18px 16px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 13,
            letterSpacing: 2,
            color: BONE,
            marginBottom: 10,
          }}
        >
          PLAY SAFE
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: SAND, margin: '0 0 10px', fontFamily: FONT_MONO }}>
          This session: {rounds} {rounds === 1 ? 'round' : 'rounds'} played ·{' '}
          <span style={{ color: positive ? ACCENT_NUM : BLOOD }}>
            {sign}
            {formatUsdc(abs)}
          </span>{' '}
          net.
        </p>
        <p style={{ fontSize: 11.5, lineHeight: 1.6, color: BONE, margin: '0 0 14px' }}>
          Set your own deposit and time limits before you play, and take breaks between
          sessions. If it stops being fun, step away · the assay line will be here tomorrow.
          Deposit limits, cool-off periods, and self-exclusion are available from your account
          settings at any time.
        </p>
        <CalibToggle label="CLOSE" onClick={onClose} fullWidth />
      </div>
    </div>
  )
}

/** The ASSAY TALLY balance-dial: a PREMIUM meter (casino-AAA revise pass,
 *  P1-F + P0-A — artotty/AGENT_MEMORY flagged the old dial as "a flat thin
 *  line," and this consolidation is also where the removed in-canvas
 *  board-edge socket-charge strip's job lands, see `AssayGridCanvas.tsx`'s
 *  header comment) with a needle that swings to the running coin-collect
 *  total, `TALLY_TICK_COUNT` fixed ticks that light in sequence as the
 *  multiplier climbs (round-progress against the gauge's own fixed display
 *  scale, not a timer — RG-clean), a one-shot shine sweep fired 1:1 with a
 *  real coin landing (`shineKey`, mirrors the `TallyLandSpark` keyed-remount
 *  pattern in the parent), and a bounded standing glow-pulse on the needle
 *  itself while a tally is live (the same "real instrument reading a live
 *  current" discipline as the board's own bead pulse). Purely a display
 *  scale against the real max ladder value — never affects payout math.
 *  `size` scales the whole SVG (same viewBox, just a bigger/smaller render
 *  box) so the spacious wide-viewport rail can run a genuinely bigger
 *  instrument than the tighter mobile bottom-dock. Warm gold gradient (was
 *  brass/gold) — this is play-surface HUD, not a frame element. */
function TallyDial({
  tallyBps,
  size = 'sm',
  shineKey = 0,
}: {
  tallyBps: bigint
  size?: 'sm' | 'lg'
  shineKey?: number
}) {
  const clamped = tallyBps > TALLY_MAX_REF_BPS ? TALLY_MAX_REF_BPS : tallyBps < 0n ? 0n : tallyBps
  const frac = Number(clamped) / Number(TALLY_MAX_REF_BPS)
  const angleDeg = -85 + frac * 170
  const isLive = tallyBps > 0n
  const dims = size === 'lg' ? { w: 168, h: 91 } : { w: 96, h: 48 }
  const ticks = Array.from({ length: TALLY_TICK_COUNT }, (_, i) => {
    const tFrac = i / (TALLY_TICK_COUNT - 1)
    const a = (-85 + tFrac * 170 - 90) * (Math.PI / 180) // -90 so 0deg points up like the needle's own rest frame
    const lit = tFrac <= frac + 0.001
    const x1 = 50 + Math.cos(a) * 34
    const y1 = 50 + Math.sin(a) * 34
    const x2 = 50 + Math.cos(a) * 42
    const y2 = 50 + Math.sin(a) * 42
    return { i, x1, y1, x2, y2, lit }
  })
  // The HAUL gauge is a BRASS instrument (mockup gauge_haul): brass bezel/track,
  // a CYAN progress arc (the line's progress = player), a GOLD needle (value),
  // gold tick marks. Brass tones are local (the shared BRASS_* tokens are the
  // Abyss steel-panel family now, not brass).
  const BRASS_HI = '#c99b45'
  const BRASS_MD = '#8a6a26'
  const BRASS_LO = '#3a2e18'
  return (
    <div
      style={{
        // Machined brass bezel wrapper with an always-on ambient rim glow
        // (fixed, RG-C5) so the HAUL gauge reads as a premium instrument at rest.
        width: dims.w,
        height: dims.h,
        margin: '2px auto 0',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 999,
        boxSizing: 'border-box',
        background: `radial-gradient(circle at 50% 40%, ${BRASS_HI} 0%, ${BRASS_MD} 55%, ${BRASS_LO} 100%)`,
        boxShadow:
          'inset 0 2px 3px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(245,217,138,0.15), 0 0 10px rgba(240,181,66,0.22)',
      }}
    >
      {/* Recessed dark gauge face — the brass bezel above frames this darker
          inner well so the gold arc reads on depth, not on flat brass. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 3,
          borderRadius: 999,
          background: `linear-gradient(180deg, ${STONE_DEEP}, ${INK})`,
          boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.6)',
        }}
      />
      <svg width={dims.w} height={dims.h} viewBox="0 0 100 54" style={{ position: 'relative' }}>
        {/* Static outer bezel ring (spec §AXIS3.4) — a fixed hairline circle
            just outside the gauge arc. */}
        <circle cx={50} cy={50} r={48} fill="none" stroke={FRAME_HAIRLINE} strokeWidth={1.5} />
        <path d="M8,50 A42,42 0 0 1 92,50" fill="none" stroke={BRASS_LO} strokeWidth={5} strokeLinecap="round" />
        <path
          d="M8,50 A42,42 0 0 1 92,50"
          fill="none"
          stroke="url(#assayGaugeGrad)"
          strokeWidth={5}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${frac * 100} 100`}
          style={{ transition: `stroke-dasharray ${TALLY_SWING_MS}ms cubic-bezier(0.3,0.7,0.3,1)` }}
        />
        <defs>
          <linearGradient id="assayGaugeGrad" x1="0" x2="1">
            <stop offset="0%" stopColor={PLAYER_TEXT} />
            <stop offset="100%" stopColor={PLAYER} />
          </linearGradient>
        </defs>
        {/* Fixed tick ladder — lights sequentially as the multiplier climbs
            against the gauge's own display scale. Purely cosmetic round
            state, never a timer/countdown. Unlit-tick brightness lifted
            (final polish pass, autisk nit — "dark-grey-on-dark, barely
            readable"): BRASS_MID->BRASS_LIGHT stroke + 0.55->0.72 opacity,
            ~+20% perceptual lift; needle + glow untouched, and the lit/unlit
            tiers stay clearly distinct (GOLD@0.95 vs BRASS_LIGHT@0.72). */}
        {ticks.map((t) => (
          <line
            key={t.i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.lit ? GOLD : BRASS_HI}
            strokeWidth={t.lit ? 2 : 1.4}
            strokeLinecap="round"
            opacity={t.lit ? 0.95 : 0.72}
            style={{
              transition: 'stroke 200ms ease-out, opacity 200ms ease-out',
              // AXIS 3 — a faint brass drop-shadow on the unlit ticks lifts
              // them off the recessed face so the whole tick ladder reads at
              // rest (machined-instrument premium cue).
              filter: t.lit ? undefined : 'drop-shadow(0 0 1.5px rgba(199,154,92,0.4))',
            }}
          />
        ))}
        <line
          x1={50}
          y1={50}
          x2={50}
          y2={12}
          stroke={GOLD}
          strokeWidth={2.4}
          strokeLinecap="round"
          className={isLive ? 'assayNeedleLive' : undefined}
          style={{
            transformOrigin: '50px 50px',
            transform: `rotate(${angleDeg}deg)`,
            transition: `transform ${TALLY_SWING_MS}ms cubic-bezier(0.34,1.4,0.4,1)`,
            animation: isLive ? `assayNeedlePulse ${1000 / TALLY_NEEDLE_PULSE_HZ}ms ease-in-out infinite` : 'none',
          }}
        />
        <circle cx={50} cy={50} r={4} fill={GOLD} stroke={BRASS_LO} strokeWidth={1} />
      </svg>
      {/* One-shot shine sweep — fired 1:1 with a real coin landing (never a
          decorative idle loop). Keyed so a fresh DOM node (and thus a fresh
          animation) mounts per landing, self-cleans by ending at opacity 0. */}
      {shineKey !== 0 && (
        <div
          key={shineKey}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(100deg, transparent 30%, rgba(230,241,245,0.5) 48%, rgba(240,181,66,0.35) 52%, transparent 70%)',
            animation: `assayTallyShine ${TALLY_SHINE_MS}ms ease-out forwards`,
          }}
        />
      )}
    </div>
  )
}

function Odometer({ len }: { len: number }) {
  const armed = len >= MIN_TRAIL
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 4,
        background: BRASS_BTN_DIM,
        borderRadius: 8,
        border: `1px solid ${BRASS_MID}`,
        padding: '5px 10px',
        boxShadow: `inset 0 1px 0 ${HAIRLINE}`,
      }}
    >
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 18,
          fontWeight: 700,
          color: armed ? ACCENT_NUM : SAND,
        }}
      >
        {len}
      </span>
      {/* "MIN" read as minutes (jesse nit) — spelled so {MIN_TRAIL} clearly
          reads as the minimum DUCAT count, not a duration. */}
      <span style={{ fontSize: 10, color: SAND, fontFamily: FONT_MONO }}>DUCATS · MIN {MIN_TRAIL}</span>
    </div>
  )
}

/** Abyss steel bet knob — the cool panel button material (`BRASS_BTN`, an
 *  Abyss steel-blue gradient token) shared by every HUD control this round. */
function CalibKnob({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        // S4 (2026-07-06, Tim ≥44px touch floor): bet steppers bumped 40 → 44.
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: `1px solid ${BRASS_MID}`,
        background: disabled ? BRASS_BTN_DIM : BRASS_BTN,
        color: BONE,
        fontFamily: FONT_MONO,
        fontWeight: 800,
        fontSize: 17,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        boxShadow: `inset 0 1px 0 ${HAIRLINE}`,
        touchAction: 'manipulation',
      }}
    >
      {label}
    </button>
  )
}

/** Abyss segmented/secondary control — the cool steel-panel button material
 *  shared with `CalibKnob` above (CLEAR / PACE / SAME LINE). */
function CalibToggle({
  label,
  onClick,
  fullWidth,
  flexItem,
  dense,
}: {
  label: string
  onClick: () => void
  /** Vertical-stack layout for cramped rail content (narrow content width
   *  cannot fit a horizontal CLEAR/PACE/SAME LINE row). */
  fullWidth?: boolean
  /** Equal-width row layout (mobile CRIT #1 fix, 2026-07-04): `flex:1` inside
   *  a flex-row parent instead of a full-width block — lets CLEAR + PACE sit
   *  SIDE BY SIDE (one ~40px row) instead of stacked (two ~40px rows), one of
   *  several small trims that together reclaim the vertical budget RUN THE
   *  LINE needs to clear the mobile fold. */
  flexItem?: boolean
  /** Long-label variant (M5, autisk 2026-07-04): the "PACE: DISC-BY-DISC"
   *  label wrapped to two lines in the narrow desktop rail gutter. `dense`
   *  gives this item slightly more of the shared row (flex-grow 1.4), a 1px
   *  smaller font, tighter horizontal padding, and forces a single line — so
   *  the long label stays one line on desktop without touching the sibling. */
  dense?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: dense ? '8px 5px' : '8px 8px',
        // mobile-touch-qa 2026-07-03: text-wrap inside a squeezed flex item
        // silently shrank this below the 40px bar (measured 30×66px live).
        // minHeight/minWidth are a hard floor independent of sibling count.
        // S4 (2026-07-06, Tim ≥44px touch floor): 40 → 44.
        minHeight: 44,
        minWidth: 44,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        border: `1px solid ${BRASS_MID}`,
        background: BRASS_BTN_DIM,
        color: BONE,
        fontFamily: FONT_MONO,
        fontSize: dense ? 10 : 11,
        fontWeight: 600,
        letterSpacing: 0.5,
        whiteSpace: dense ? 'nowrap' : undefined,
        cursor: 'pointer',
        width: fullWidth ? '100%' : undefined,
        flex: flexItem ? (dense ? '1.4 1 0' : '1 1 0') : undefined,
        textAlign: fullWidth || flexItem ? 'center' : undefined,
        touchAction: 'manipulation',
      }}
    >
      {label}
    </button>
  )
}

/** ONE continuous plate-specimen-backed casing for the whole right-gutter
 *  card stack (ROUND D — composition-designer's RoR-grammar port, run
 *  2026-07-04T09-40-47Z; Tim: "check de foto rugs in input daar zie je hoe
 *  de ui blokken samen komen met transparant"). Replaces the PRIOR two
 *  free-standing `SpecimenCase` panels (deleted) — this is deliberately ONE
 *  brass-bezeled casing with ~1px hairline seams BETWEEN its internal
 *  `RailRow` sections (see below), not five individually floating bordered
 *  cards, which is exactly the "comes together" cohesion Tim's orange
 *  bracket circled on the reference screenshots. Reuses the same
 *  PLATE_SPECIMEN carved-stone material + brass bezel-ring language the
 *  old `SpecimenCase` used, just as one taller piece of furniture.
 *  `alignItems:'stretch'` on the parent flex row (see `AssayExperience`)
 *  matches this casing's height to the counter card's own rendered height
 *  automatically — no manual height formula needed. */
function RailShell({ widthPx, children }: { widthPx: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: widthPx,
        flexShrink: 0,
        borderRadius: 13,
        padding: 6,
        boxSizing: 'border-box',
        // PLATE material — the real carved-stone instrument panel
        // (`plate-specimen.png`), same as the old SpecimenCase's recess.
        backgroundImage:
          'radial-gradient(ellipse at 50% -15%, rgba(3,9,15,0.55), transparent 55%), ' +
          (PLATE_SPECIMEN.backgroundImage as string),
        backgroundSize: 'cover, cover',
        backgroundPosition: 'center, center',
        boxShadow:
          'inset 0 3px 8px rgba(0,0,0,0.65), -3px 6px 8px rgba(0,0,0,0.55), 0 16px 20px -6px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          borderRadius: 10,
          // FRAME element #3 of 3 — the control-column bezel-ring. Steel-blue
          // (#2c4356, `BRASS_MID`), NOT gold: gold = value, chrome stays steel
          // (S1). A faint cool bone inset reads the edge without borrowing value.
          border: `3px solid ${BRASS_MID}`,
          boxShadow: `inset 0 1px 0 rgba(230,241,245,0.12), inset 0 -1px 0 rgba(0,0,0,0.4), 0 0 0 6px ${INK}`,
          overflow: 'hidden',
          height: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            position: 'relative',
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            // Recessed deep-water interior — a near-flat dark cool ramp
            // (low blur + high alpha) reading as the machined rail recess.
            background:
              'linear-gradient(180deg, rgba(16,26,36,0.88) 0%, rgba(16,26,36,0.9) 50%, rgba(16,26,36,0.92) 100%)',
            backdropFilter: 'blur(3px) saturate(0.6)',
            WebkitBackdropFilter: 'blur(3px) saturate(0.6)',
            boxShadow:
              'inset 0 1px 0 rgba(230,241,245,0.2), inset 0 -2px 4px rgba(0,0,0,0.5), inset 0 0 20px rgba(3,9,15,0.4)',
          }}
        >
          {/* Sheen band — the catch-light cue, positioned toward the scene's
              key light. Bone-tinted — a material sheen, not an accent glow,
              keeping bone reserved for the "marked, not-yet-revealed" board
              language and gold reserved for genuinely interactive/energized
              elements (the dial, the CTA). */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'radial-gradient(ellipse at 85% 10%, rgba(230,241,245,0.16), rgba(230,241,245,0) 55%)',
            }}
          />
          {/* `flex:1` lets the child stack fill the full casing height (the rail
              stretches to the board via the shell's `alignItems:stretch`). The
              existing `railRows` stack top-down with no auto margins, so they
              are visually unchanged; the lobby control column uses this to pin
              its ENTER THE DIVE key to the bottom (mockup `margin-top:auto`). */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

/** One row/section of the right-gutter rail stack — used both inside the
 *  desktop `RailShell` and, unstyled, in the narrow bottom-dock (see
 *  `railRows` in `AssayExperience`, reused verbatim in both so the two
 *  layouts never drift out of sync). `first` suppresses the hairline
 *  divider so the stack's own top row doesn't double a border against the
 *  casing's own top edge. The ~1px hairline seam BETWEEN rows (not a
 *  full card border around each) is the literal "comes together" cohesion
 *  fix — see `RailShell`'s docblock. */
function RailRow({
  title,
  first,
  compact,
  children,
}: {
  title: string
  first?: boolean
  /** Mobile CRIT #1 fix, 2026-07-04: trims this row's own vertical padding
   *  (12px -> 8px, ×5 rows) — one of several small trims reclaiming the
   *  budget RUN THE LINE needs to clear the mobile fold. Desktop keeps the
   *  roomier padding; it isn't fold-constrained the same way. */
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        // S6 — compact rows shaved 8->6 (×5 rows) + tighter title gap to reclaim
        // the last vertical budget RUN THE LINE needs to clear the 852px fold on
        // iPhone 14 Pro. Desktop keeps the roomier padding. Compact vertical
        // trimmed 6→4 (2026-07-06) to help pay for the TO WIN hero on the fold.
        padding: compact ? '4px 14px' : '12px 14px',
        borderTop: first ? 'none' : `1px solid ${HAIRLINE}`,
      }}
    >
      {/* Readability floor (Tim, 2026-07-06): systemic caption label bumped
          8.5 → 11px — the game-wide rail-section title convention. */}
      <div style={{ fontSize: 11, letterSpacing: 1.5, color: SAND, marginBottom: compact ? 3 : 8 }}>{title}</div>
      {children}
    </div>
  )
}

/** DIVE DEPTH row content — one of the three difficulty tiers
 *  (`assayMath.ts`'s `TIERS`). Shows the REAL per-tier math: bomb count, the
 *  per-tier "up to Nx" ceiling (`TIER_MAX_MULTIPLE_BPS`), and the flat RTP
 *  printed IDENTICALLY on every row (Assay's identity — unlike RoR, RTP
 *  never varies per difficulty here). Display label is the AZTEC PIVOT copy
 *  override (`TIER_DISPLAY_LABEL`), not `assayMath.ts`'s own internal
 *  `t.label`.
 *
 *  FUNCTIONAL 3-TIER SELECTOR (AZTEC PIVOT — closes the prior ROUND D
 *  honesty-gate): `assayProvider.ts`'s `selectedTier`/`setSelectedTier` now
 *  genuinely arm every tier's own real `bombCount`/ladder (wired in parallel
 *  by codotty against the shared `TierId` contract), so all three rows are
 *  real, clickable selections — no "SOON" marker, no fake interactive
 *  affordance. `active`/`disabled`/`onClick` are owned by the caller
 *  (`AssayExperience`'s `railRows`), which reads/writes `assayProvider.ts`'s
 *  actual selection state — this component stays a pure display + a11y
 *  wrapper. Renders as a real `<button>` (was a plain `<div>`) for native
 *  keyboard/screen-reader affordance now that it's genuinely interactive. */
function TierRow({
  tier,
  active,
  disabled,
  onClick,
}: {
  tier: TierId
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  const t = TIERS[tier]
  const maxBps = TIER_MAX_MULTIPLE_BPS[tier]
  return (
    <button
      type="button"
      className="assayFocusable"
      aria-current={active ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
      style={{
        all: 'unset',
        display: 'block',
        width: '100%',
        padding: '8px 10px',
        marginBottom: 6,
        borderRadius: 8,
        boxSizing: 'border-box',
        // Accessibility-qa CRIT #5 fix: the active row used to be a THIN
        // translucent wash (2-10% alpha) with nothing solid behind it — its
        // rendered contrast depended on whatever bled through `RailShell`'s
        // own backdrop-blur glass, which measured as low as 1.6:1 in
        // practice. A solid `STONE_DEEP` base UNDER the gold wash makes the active
        // row's contrast independent of anything behind it. FOLLOW-UP
        // (independent accessibility-qa re-verify, 2026-07-04): the first
        // fix's own top-of-gradient stop (0.26 alpha) still measured only
        // 4.06-4.11:1 for the "up to Nx" multiplier text — WCAG-computed,
        // that stop composites to a background bright enough to undercut the
        // 4.5:1 floor even with the opaque STONE_DEEP base underneath it. Cut both
        // stops further (0.26->0.10, 0.12->0.08) — WCAG-computed >=5.2:1 for
        // both `BONE` and `ACCENT_NUM` text at every point along the
        // gradient now, not just at its darkest stop.
        border: active ? `1.5px solid ${PLAYER}` : `1px solid ${BRASS_DARK}`,
        background: active
          ? `linear-gradient(180deg, ${PLAYER_DEEP}, rgba(13,60,56,0.9)), ${STONE_DEEP}`
          : BRASS_BTN_DIM,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {/* Row 1: label left, "up to Nx" right — a genuine two-row STACK (not a
          single flex row with a vertically-centered multiplier sibling) so
          the taller two-line label column can never visually overlap the
          multiplier text at narrow gutter widths. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: active ? PLAYER_TEXT : SAND,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {TIER_DISPLAY_LABEL[tier]}
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 13,
            fontWeight: 700,
            color: active ? ACCENT_NUM : SAND,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          up to {formatMultiplier(maxBps)}
        </span>
      </div>
      {/* Row 2: bomb count + flat RTP. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          marginTop: 2,
          fontSize: 11,
          color: SAND,
          fontFamily: FONT_MONO,
        }}
      >
        <span>
          {t.bombCount} cracked ducats · RTP {formatRtpPct(TARGET_RTP_BPS)}
        </span>
      </div>
    </button>
  )
}

/** Compact 3-up DIVE DEPTH segmented control — the mobile-layout fix
 *  (orchestrator CRIT #1, 2026-07-04) for narrow viewports: same contract as
 *  `TierRow` (`active`/`disabled`/`onClick`, real per-tier math), one dense
 *  ~52px row of three chips instead of three ~55px stacked cards. Label
 *  abbreviates to the tier's first word (Lean/Standard/Heavy) so it fits a
 *  third-width column at 40px minHeight — the full `TIER_DISPLAY_LABEL`
 *  string still carries the accessible name via `aria-label`. Same solid-
 *  backing-chip contrast fix as `TierRow`'s active state (CRIT #5) — the gold
 *  wash sits over an opaque `STONE_DEEP` base, never a bare translucency depending
 *  on whatever backdrop shows through. */
function TierChip({
  tier,
  active,
  disabled,
  onClick,
}: {
  tier: TierId
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  const maxBps = TIER_MAX_MULTIPLE_BPS[tier]
  const shortLabel = TIER_DISPLAY_LABEL[tier].split(' ')[0]
  return (
    <button
      type="button"
      className="assayFocusable"
      aria-current={active ? 'true' : undefined}
      aria-label={`${TIER_DISPLAY_LABEL[tier]}, up to ${formatMultiplier(maxBps)}`}
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        minHeight: 44,
        boxSizing: 'border-box',
        padding: '5px 4px',
        borderRadius: 8,
        border: active ? `1.5px solid ${PLAYER}` : `1px solid ${BRASS_DARK}`,
        background: active
          ? `linear-gradient(180deg, ${PLAYER_DEEP}, rgba(13,60,56,0.9)), ${STONE_DEEP}`
          : BRASS_BTN_DIM,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
      }}
    >
      {/* S2 (2026-07-06, autisk ≥11px floor): tier sublabel REEF/MIDNIGHT/HADAL
          bumped 10 → 11px. */}
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: active ? PLAYER_TEXT : SAND }}>
        {shortLabel}
      </span>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          fontWeight: 700,
          color: active ? ACCENT_NUM : SAND,
          whiteSpace: 'nowrap',
        }}
      >
        {formatMultiplier(maxBps)}
      </span>
    </button>
  )
}

/** RoR-analog quick-bet chip — one of the `QUICK_CHIP_AMOUNTS_LAMPORTS`
 *  presets in the YOUR BET row. `minHeight`/`minWidth` (taste-guardian
 *  finding, Round D review): this component originally shipped without the
 *  40px touch-target floor `CalibToggle` (two components above it in this
 *  same file) already enforces after a prior live-measured regression —
 *  mirrored here rather than reintroducing the same gap on a new control. */
function QuickChip({
  amount,
  active,
  disabled,
  onClick,
}: {
  amount: bigint
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '6px 2px',
        // S4 (2026-07-06, Tim ≥44px touch floor): quick-bet chip 40 → 44.
        minHeight: 44,
        minWidth: 44,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 6,
        border: active ? '1px solid rgba(240,181,66,0.5)' : `1px solid ${BRASS_MID}`,
        background: active ? 'rgba(240,181,66,0.14)' : BRASS_BTN_DIM,
        color: active ? ACCENT_NUM : BONE,
        fontSize: 10.5,
        fontWeight: 700,
        fontFamily: FONT_MONO,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        touchAction: 'manipulation',
      }}
    >
      {/* Preset chips are whole-USDC values — show the clean integer (1/5/10/25/50),
          not the "1.00" money format (S4, jesse: decimals read noisy on a chip). */}
      {String(amount / 1_000_000n)}
    </button>
  )
}

/** The current-key — the single GO control (ENTER THE DIVE / DIVE AGAIN). Gives
 *  a physical press (translateY + inset shadow) on pointer-down, identical every
 *  time (RG-C5). Player-CYAN body + a cyan border/glow when armed (spec
 *  rule-of-three: cyan = the one primary action), never gold. */
function CurrentKey({ label, onClick, armed }: { label: string; onClick: () => void; armed?: boolean }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      onClick={onClick}
      onPointerDown={() => armed && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      disabled={!armed}
      style={{
        // `width:100%` alongside `flex:1` — this component is used both
        // inside flex-row wrappers (DIVE AGAIN → + CLOSE) AND directly inside
        // a plain block `Panel` (the lobby ENTER CTA) or the rail's own
        // BALANCE column, where `flex:1` alone is inert and `<button>`'s
        // default shrink-to-fit sizing would leave it undersized.
        flex: 1,
        width: '100%',
        boxSizing: 'border-box',
        padding: '12px 16px',
        // Hard 44px tap-target floor (S6 / mobile-touch) + no 300ms tap delay.
        minHeight: 44,
        touchAction: 'manipulation',
        borderRadius: 10,
        // Primary CTA — player CYAN when armed (spec rule-of-three: cyan = the
        // one primary action). Disabled reads as a flat dark panel.
        border: armed ? `1px solid ${PLAYER}` : `1px solid ${BRASS_DARK}`,
        background: armed ? PLAYER : BRASS_BTN_DIM,
        color: armed ? '#042220' : SAND,
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: 1,
        cursor: armed ? 'pointer' : 'default',
        opacity: armed ? 1 : 0.55,
        transform: pressed ? 'translateY(2px)' : 'translateY(0)',
        boxShadow: armed
          ? pressed
            ? 'inset 0 3px 8px rgba(0,0,0,0.55)'
            : '0 0 18px rgba(53,224,210,0.4), inset 0 1px 0 rgba(143,242,232,0.5)'
          : 'none',
        transition: 'transform 80ms ease-out, box-shadow 80ms ease-out',
        fontFamily: FONT_MONO,
      }}
    >
      {label}
    </button>
  )
}

/** BREAKER — the single GO control that commits the claim-line and sends
 *  current down the conduit. A literal switch-handle affordance keyed to the
 *  fiction's own verb ("throw the breaker"), not a generic button with a
 *  color swap (composition-designer ranked item 2) — replaces `CurrentKey`
 *  at ONLY the two PLUNGE call sites (ENTER THE ASSAY LINE / DIVE AGAIN →
 *  stay plain `CurrentKey` restart actions, which is exactly right for
 *  them). `plungeKey()` fires immediately on press — this component never
 *  delays the actual commit, only its own cosmetic throw animation, so the
 *  round's real timing is untouched. The THROWN state reads as "already
 *  fired, current now live" via a steady gold pilot-light — never dimmed in
 *  a way that could read as broken/disabled (the failure mode the
 *  composition-designer's spec explicitly flagged as a risk). ROUND D: this
 *  is now the ONLY plunge control on screen (previously duplicated between
 *  the narrow rail and the wide slim-center-rail, both gated so only one was
 *  ever visible at once — now genuinely the single instance, living in the
 *  right-gutter rail's BALANCE row on wide, and the same `railRows` content
 *  on narrow). Fixed-duration animation regardless of wager/streak/session
 *  (RG-C5). */
function BreakerLever({
  onClick,
  armed,
  disabledReason,
}: {
  onClick: () => void
  armed: boolean
  /** When disarmed, the WHY, appended as "· {reason}" (mockup: "RUN THE LINE · 3 MORE"). */
  disabledReason?: string
}) {
  // No local "thrown" state: throwing the breaker fires `onClick` (plungeKey),
  // which transitions planning → assaying in the SAME React 18 batch and
  // unmounts this component — so any post-throw visual would never paint (dead
  // code, removed). The lever renders one resting appearance only.
  const handleClick = () => {
    if (!armed) return
    onClick()
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!armed}
      aria-label="Run the line · commit the claim line and throw the breaker"
      className="assayFocusable"
      style={{
        // `flex:1` only takes effect when the PARENT is itself a flex
        // container — `<button>` elements shrink-to-fit by default
        // regardless of `display:flex` on themselves, so without an
        // explicit `width:100%` this button would only be as wide as its
        // content in a plain block parent (the rail's BALANCE row).
        flex: 1,
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 18px',
        borderRadius: 10,
        border: armed ? `1px solid ${PLAYER}` : `1px solid ${BRASS_DARK}`,
        // Always FULLY OPAQUE (never `opacity < 1` on the whole element) — CSS
        // `opacity` makes the WHOLE subtree translucent as a composited
        // group, letting whatever sits behind it bleed through as a stray
        // artifact when disarmed. Armed = the player CYAN primary CTA; disarmed
        // = a darker, flatter dark-panel gradient ("at rest," never a hole).
        background: armed
          ? `linear-gradient(180deg, ${PLAYER}, #1fbfb0)`
          : `linear-gradient(180deg, ${BRASS_DARK}, ${INK})`,
        cursor: armed ? 'pointer' : 'default',
        boxShadow: armed
          ? '0 0 18px rgba(53,224,210,0.4), inset 0 1px 0 rgba(143,242,232,0.5)'
          : 'inset 0 1px 0 rgba(230,241,245,0.06)',
        transition: 'background 120ms ease-out, box-shadow 120ms ease-out',
        touchAction: 'manipulation',
      }}
    >
      {/* Switch housing — a diagonal throw-slot with a rotating handle. */}
      <span
        aria-hidden
        style={{
          position: 'relative',
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: 6,
          background: `linear-gradient(135deg, ${BRASS_DARK}, ${INK})`,
          border: `1px solid ${BRASS_DARK}`,
          boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '18%',
            top: '50%',
            width: '64%',
            height: 3,
            background: 'rgba(0,0,0,0.5)',
            borderRadius: 2,
            transform: 'translateY(-50%) rotate(-38deg)',
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 5,
            height: 22,
            marginLeft: -2.5,
            marginTop: -11,
            borderRadius: 3,
            background: `linear-gradient(${BONE},${BRASS_LIGHT})`,
            transformOrigin: '50% 100%',
            transform: 'rotate(-38deg)',
            boxShadow: '0 0 6px rgba(230,241,245,0.6)',
          }}
        />
        {/* Pilot light — a NEUTRAL steel dot (not gold): gold = value, and a
            status indicator on the primary player-cyan CTA must not borrow the
            value colour. Dim, never a dead-grey hole. */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 4,
            bottom: 4,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'rgba(135,166,181,0.5)', // neutral steel (SAND @ .5) — off the rule-of-three
            boxShadow: 'none',
          }}
        />
      </span>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 1,
          color: armed ? '#042220' : SAND,
        }}
      >
        {armed || !disabledReason ? 'RUN THE LINE' : `RUN THE LINE · ${disabledReason}`}
      </span>
    </button>
  )
}

/** Struck-hallmark seal on the Glass Box certificate — gold-leaf-on-stone
 *  (never the bust-only blood accent), overlapping the certificate's top-right
 *  corner. Reuses the doubloon's own struck sun-glyph motif so the certificate
 *  reads as one treasure family with the board, not a separate flourish. */
function HallmarkSeal() {
  return (
    <div
      style={{
        // Was position:absolute top:-10 right:6 — which poked the seal UP into
        // the PAYOUT value above and DOWN onto the first seed copy button on
        // desktop's tighter rhythm. Now a real in-flow flex child of the
        // certificate header row (see the receipt render), so it owns its own
        // top-right slot with zero overlap on every viewport. rotate() overflow
        // (~2.3px) stays inside the header row's gap/margin.
        position: 'relative',
        flexShrink: 0,
        width: 32,
        height: 32,
        borderRadius: '50%',
        background: `radial-gradient(circle at 35% 28%, ${BRASS_LIGHT}, ${BRASS_MID} 65%, ${BRASS_DARK} 100%)`,
        border: `1px solid ${BRASS_DARK}`,
        boxShadow: '0 3px 7px rgba(0,0,0,0.55), inset 0 1px 2px rgba(230,241,245,0.35), 0 0 8px rgba(240,181,66,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: 'rotate(-9deg)',
        zIndex: 2,
      }}
    >
      {/* The hallmark itself: the SAME struck-diamond rune drawn on every
          coin (`paintCoinDormant`'s emboss block in `AssayGridCanvas.tsx`),
          retraced here at seal scale — a dark recessed stroke, a lit
          counter-edge stroke, and a gold-inlined retrace, matching a
          PROVEN coin's own motif exactly rather than substituting an
          unrelated letterform (end-to-end-cohesion-reviewer finding,
          2026-07-03: the seal previously claimed motif reuse without
          actually retracing the shape). */}
      <svg width={22} height={22} viewBox="0 0 32 32" style={{ position: 'absolute' }} aria-hidden>
        <polygon points="16,10.8 20.6,16 16,21.2 11.4,16" fill="none" stroke="rgba(3,9,15,0.5)" strokeWidth={1.6} />
        <polygon points="16,11.8 19.6,16 16,20.2 12.4,16" fill="none" stroke="rgba(230,241,245,0.4)" strokeWidth={0.9} />
        <polygon points="16,10.8 20.6,16 16,21.2 11.4,16" fill="none" stroke={GOLD_LIGHT} strokeWidth={0.7} opacity={0.8} />
      </svg>
    </div>
  )
}

/** Fixed-duration copy-to-clipboard affordance for the Glass Box certificate
 *  (fairness fix — the full seed/hash need to be pasteable somewhere a
 *  player can actually run SHA-256, not just eyeballed). "copied" reverts on
 *  a module-const timer (RG-C5: fixed, never derived from any economic
 *  value or streak). */
const COPY_GLYPH_RESET_MS = 1200

function CopyGlyph({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        if (navigator.clipboard) void navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), COPY_GLYPH_RESET_MS)
      }}
      style={{
        flexShrink: 0,
        alignSelf: 'flex-start',
        fontSize: 11,
        letterSpacing: 0.5,
        color: SAND,
        background: 'rgba(196,150,86,0.1)', // §C: faint gold-tan inset on deep water (was warm-brown rgba(168,122,74))
        border: `1px solid ${BRASS_DARK}`,
        borderRadius: 4,
        padding: '2px 6px',
        // mobile-touch-qa (holdgate revise gate, 2026-07-04): measured
        // 34.7×16px — under the tap-target floor. Mirrors the
        // `CalibToggle` minHeight/minWidth-floor pattern rather than a
        // negative-margin hit-area hack (which would extend the click zone
        // over neighboring certificate text). Final-polish (2026-07-06):
        // raised 40→44 to meet Tim's ≥44px tap-target floor (the other
        // controls — CalibKnob/QuickChip/CalibToggle/SafetyLink — were
        // bumped earlier; CopyGlyph was the missed straggler). The 4px
        // grows DOWNWARD (alignSelf:flex-start, in the seed/hash row BELOW
        // the header) — away from the HallmarkSeal above, so the
        // seal∩copy#1 gap is preserved. Compact visual kept via the tight
        // `2px 6px` padding; the box is a 44² tap area, the ink stays small.
        minWidth: 44,
        minHeight: 44,
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontFamily: FONT_MONO,
      }}
      aria-label={`Copy ${text}`}
    >
      {copied ? 'copied' : 'copy'}
    </button>
  )
}

type CoinFlyStyle = React.CSSProperties & { '--dx': string; '--dy': string }

/** A single flying coin — travels from a just-struck disc to the HOARD dial,
 *  arcing via the assayCoinFly keyframes. Fixed duration (RG-C5), never
 *  scaled by the coin's value. GOLD REVEAL COIN (consolidated fix pass,
 *  2026-07-04): the flying collect coin is the SAME bespoke struck doubloon the
 *  board reveals — `struckDoubloonDataUrl()` returns a data-URL snapshot of the
 *  exact `paintDoubloonCore(..,'struck')` sprite (no stock PNG anywhere) — so
 *  the coin a player watches leave the board and the coin that lands in the
 *  HOARD dial are provably ONE coin. A DOM `<img>` (not a canvas draw) is the
 *  right tool here: this is a page-fixed CSS-animated overlay, not a per-frame
 *  render loop, so the browser's own image cache covers the "decode once"
 *  contract without any extra plumbing. The data URL is baked+memoized once. */
function CoinFly({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const style: CoinFlyStyle = {
    position: 'fixed',
    left: from.x - 13,
    top: from.y - 13,
    width: 26,
    height: 26,
    pointerEvents: 'none',
    zIndex: 60,
    '--dx': `${dx}px`,
    '--dy': `${dy}px`,
    animation: `assayCoinFly ${COIN_FLY_MS}ms cubic-bezier(0.25,0.6,0.3,1) forwards`,
  }
  return (
    <img
      src={struckDoubloonDataUrl()}
      alt=""
      aria-hidden
      draggable={false}
      style={{
        ...style,
        borderRadius: '50%',
        objectFit: 'contain',
        filter: 'drop-shadow(0 0 8px rgba(240,181,66,0.6))',
      }}
    />
  )
}

/** The win-celebration badge glyph = the SAME 8-ray Aztec sun-disc struck into
 *  every coin — rendered from `AssayGridCanvas`'s shared `sunGlyphPoints`
 *  geometry as an SVG polygon, so the "proven" mark is provably ONE motif
 *  across the board coins, this badge, and the certificate seal (B2 fix,
 *  2026-07-04: the badge used to draw an unrelated diamond with a stale comment
 *  citing a `paintCoinProven` function that no longer exists). Computed once. */
const SUN_BADGE_PTS = sunGlyphPoints(16, 16, 12)
  .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
  .join(' ')
const SUN_BADGE_BOSS_R = 12 * SUN_GLYPH_BOSS_RATIO

/** "LINE CLAIMED" hero-pop callout — fires once per fully-proven claim-line,
 *  centered over the board. AMPLIFIED (casino-AAA revise pass, P0-C —
 *  artotty scored win-celebration 2/5): a bigger badge carrying the 8-ray
 *  sun-disc provenance glyph (the SAME motif struck into every coin and the
 *  certificate's own seal — not a generic checkmark/diamond), and a double
 *  concussion-ring echo behind it. HARD RG-C5 GUARDRAIL: every value here is a
 *  fixed module const — the exact same badge, at the exact same size, for the
 *  exact same hold time, fires for a 1.3x win and a 100x win. Warm register
 *  (gold-rimmed pill, parchment text). Purely decorative reinforcement; the
 *  settlement panel's "LINE CLAIMED" heading already carries the accessible
 *  state announcement. */
function HeroPopCallout() {
  return (
    <div aria-hidden style={{ position: 'absolute', top: '38%', left: '50%', zIndex: 20, pointerEvents: 'none' }}>
      {/* Double concussion-ring echo — two identical rings, the second
          delayed by a fixed offset, both fixed duration (RG-C5). */}
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: HERO_RING_SIZE_PX,
          height: HERO_RING_SIZE_PX,
          marginLeft: -HERO_RING_SIZE_PX / 2,
          marginTop: -HERO_RING_SIZE_PX / 2,
          borderRadius: '50%',
          border: '1.5px solid rgba(240,181,66,0.55)',
          animation: `assayHeroRing ${HERO_RING_MS}ms ease-out forwards`,
        }}
      />
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: HERO_RING_SIZE_PX,
          height: HERO_RING_SIZE_PX,
          marginLeft: -HERO_RING_SIZE_PX / 2,
          marginTop: -HERO_RING_SIZE_PX / 2,
          borderRadius: '50%',
          border: '1.5px solid rgba(240,181,66,0.4)',
          animation: `assayHeroRing ${HERO_RING_MS}ms ease-out ${HERO_RING_2_DELAY_MS}ms forwards`,
          opacity: 0,
        }}
      />
      {/* AXIS 4 — the callout is now a gold-bordered DEEP-WATER CARTOUCHE (spec
          §AXIS4), not a dark toast pill: the main-card CARD_BG material, a
          double brass bevel, a scaled-up badge, goldLight text, and a one-shot
          shine sweep firing with the pop-in. Every value fixed
          (RG-C5): byte-identical for a 1.3x and a 100x win. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '22px 46px',
          // Elongated stadium cartouche.
          borderRadius: '40px / 32px',
          // B3 — FULLY OPAQUE deep-water body (solid color under the
          // gradient) so the board coins can never bleed through.
          backgroundColor: CARTOUCHE_BG_SOLID,
          backgroundImage: CARTOUCHE_BG,
          border: `2px solid ${GOLD_LIGHT}`,
          // Strengthened inner double-bevel: a bright top inset highlight + a
          // deeper stone/gold double inset ring + an inner shadow well, over the
          // outer gold bloom + drop shadow.
          boxShadow: `inset 0 2px 0 rgba(245,217,138,0.28), inset 0 0 0 5px ${STONE_DEEP}, inset 0 0 0 7px ${GOLD_DARK}, inset 0 0 26px rgba(0,0,0,0.55), 0 0 42px rgba(240,181,66,0.5), 0 14px 34px rgba(0,0,0,0.6)`,
          overflow: 'hidden',
          animation: `assayHeroPop ${HERO_POP_HOLD_MS}ms ease-out forwards`,
        }}
      >
        {/* Sun-disc provenance device — renders `AssayGridCanvas`'s shared
            `sunGlyphPoints` geometry (the exact 8-ray Aztec sun-disc struck
            into every coin) as an SVG polygon, so "proven" reads as ONE
            consistent glyph across board coins, this badge and the certificate
            seal — not a generic checkmark or diamond. Scaled up 22→28px. */}
        <svg width={28} height={28} viewBox="0 0 32 32" aria-hidden style={{ flexShrink: 0, position: 'relative' }}>
          <polygon points={SUN_BADGE_PTS} fill="none" stroke="rgba(3,9,15,0.5)" strokeWidth={1.8} strokeLinejoin="round" />
          <polygon points={SUN_BADGE_PTS} fill={GOLD} opacity={0.16} />
          <polygon points={SUN_BADGE_PTS} fill="none" stroke={GOLD} strokeWidth={0.9} strokeLinejoin="round" opacity={0.9} />
          <circle cx={16} cy={16} r={SUN_BADGE_BOSS_R} fill={GOLD} opacity={0.16} />
          <circle cx={16} cy={16} r={SUN_BADGE_BOSS_R} fill="none" stroke={GOLD} strokeWidth={0.9} opacity={0.9} />
        </svg>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: 4,
            // B3 — bright goldLight hero text with the gold glow (plus a dark
            // edge for a crisp read on the opaque stone).
            color: GOLD_LIGHT,
            textShadow: '0 1px 1px rgba(3,9,15,0.7), 0 0 16px rgba(245,217,138,0.85), 0 0 30px rgba(240,181,66,0.6)',
            position: 'relative',
          }}
        >
          LINE CLAIMED
        </span>
        {/* One-shot carved-stone shine sweep — fires once with the pop-in. */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(100deg, transparent 30%, rgba(230,241,245,0.5) 48%, rgba(240,181,66,0.35) 52%, transparent 70%)',
            animation: `assayCartoucheShine ${CARTOUCHE_SHINE_MS}ms ease-out forwards`,
          }}
        />
      </div>
    </div>
  )
}

/** Board bloom sweep — a one-shot diagonal light pass across the WHOLE
 *  board on a winning settle (P0-C, "a board bloom sweep"), synced with
 *  `AssayGridCanvas`'s own canvas-level gold bloom-ring for the win case
 *  (AZTEC PIVOT — now warm gold). Fixed duration/amplitude regardless of
 *  payout size (RG-C5). Authored motion (a single deterministic sweep),
 *  never a particle system. */
function BoardSweep() {
  return (
    <>
      {/* AXIS 4 — simultaneous radial bloom flash UNDER the diagonal sweep, so
          the whole board blooms warm on settle (not just a moving streak).
          Fixed geometry/duration regardless of payout (RG-C5). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 14,
          pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(245,217,138,0.22), transparent 60%)',
          animation: `assayBoardBloomRadial ${BOARD_BLOOM_RADIAL_MS}ms ease-out forwards`,
        }}
      />
      {/* Diagonal light sweep — AXIS 4 strengthened peak alphas (0.16→0.24
          cream, 0.22→BOARD_BLOOM_PEAK_ALPHA gold). Duration unchanged. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 15,
          pointerEvents: 'none',
          background: `linear-gradient(100deg, transparent 35%, rgba(230,241,245,0.24) 47%, rgba(240,181,66,${BOARD_BLOOM_PEAK_ALPHA}) 50%, transparent 65%)`,
          animation: `assayBoardSweep ${BOARD_SWEEP_MS}ms ease-out forwards`,
        }}
      />
    </>
  )
}

// ─── DIVE-DEPTH recolor overlay ─────────────────────────────────────────────
/** Recolors the SAME fixed underwater scene per selected DIVE DEPTH (spec §7:
 *  "selecting a depth recolors the bg scene"). Geometry never changes — only the
 *  wash: REEF SHELF = a lighter cyan reef glow; MIDNIGHT ZONE = default (no
 *  tint); HADAL TRENCH = a darker deep-water crush + faint red lamp dots (the
 *  deep-danger register). Plus a shared bottom vignette so the panels read
 *  against the water at the frame edges. All fixed geometry, pointer-events:none,
 *  below the shell (zIndex 7). */
function DepthTint({ tier }: { tier: TierId }) {
  const layers: string[] = [
    'radial-gradient(120% 80% at 50% 100%, rgba(3,9,15,0.55) 0%, rgba(3,9,15,0) 55%)',
  ]
  if (tier === 'lean') {
    // REEF SHELF — visibly LIGHTER, greener water + a stronger cyan reef wash
    // (S2: the 3 depths must read distinct; the old 0.10-0.12 wash was near
    // imperceptible). A broad top lift raises the whole upper water.
    layers.unshift(
      'radial-gradient(90% 68% at 50% 6%, rgba(53,224,210,0.22) 0%, rgba(53,224,210,0) 62%)',
      'linear-gradient(180deg, rgba(120,200,210,0.20) 0%, rgba(120,200,210,0.06) 40%, rgba(120,200,210,0) 62%)',
      'radial-gradient(60% 42% at 82% 78%, rgba(15,58,48,0.28) 0%, rgba(15,58,48,0) 70%)', // a hint of kelp-green in the lower reef
    )
  } else if (tier === 'flooded') {
    // HADAL TRENCH — distinctly DARKER deep-water crush + brighter, larger red
    // lamp dots (S2). Stronger than the old 0.32 crush so it reads as "deeper."
    layers.unshift(
      'radial-gradient(110% 110% at 50% 45%, rgba(3,9,15,0.52) 0%, rgba(3,9,15,0.24) 58%, rgba(3,9,15,0.06) 100%)',
      'radial-gradient(3px 3px at 12% 30%, rgba(255,93,93,0.8), transparent 62%)',
      'radial-gradient(3px 3px at 88% 24%, rgba(255,93,93,0.72), transparent 62%)',
      'radial-gradient(3px 3px at 78% 62%, rgba(255,93,93,0.66), transparent 62%)',
      'radial-gradient(3px 3px at 20% 66%, rgba(255,93,93,0.66), transparent 62%)',
      'radial-gradient(2.5px 2.5px at 46% 18%, rgba(255,93,93,0.6), transparent 62%)',
      'radial-gradient(2.5px 2.5px at 60% 84%, rgba(255,93,93,0.55), transparent 62%)',
    )
  }
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 3,
        backgroundImage: layers.join(', '),
      }}
    />
  )
}

/** Fixed ambient-FX geometry (RG-C5: module-const, byte-identical every render,
 *  never state-derived). left% / size / delay / duration for the rising
 *  bubbles and the drifting plankton — all sub-3Hz, all authored (never a
 *  particle spawner). */
const AMBIENT_BUBBLES = [
  { left: 8, size: 5, delay: 0, dur: 11 },
  { left: 17, size: 3, delay: 4.5, dur: 9 },
  { left: 26, size: 6, delay: 2, dur: 13 },
  { left: 41, size: 4, delay: 6, dur: 10 },
  { left: 58, size: 3, delay: 1.5, dur: 12 },
  { left: 69, size: 6, delay: 5, dur: 14 },
  { left: 80, size: 4, delay: 3, dur: 10 },
  { left: 90, size: 5, delay: 7.5, dur: 12 },
  { left: 96, size: 3, delay: 2.5, dur: 9 },
] as const
const AMBIENT_PLANKTON = [
  { left: 12, top: 22, size: 2.5, delay: 0, dur: 7 },
  { left: 33, top: 58, size: 2, delay: 2, dur: 9 },
  { left: 47, top: 34, size: 3, delay: 4, dur: 8 },
  { left: 63, top: 70, size: 2, delay: 1, dur: 10 },
  { left: 78, top: 40, size: 2.5, delay: 3, dur: 7 },
  { left: 88, top: 64, size: 2, delay: 5, dur: 9 },
] as const

/** S5 ambient deep-water layer over the fixed scene: a slow caustic light
 *  drift, rising bubbles, drifting plankton, and two swaying kelp blades.
 *  Sits below the shell (z2) so it lives in the scene margins, never washing a
 *  panel or the board. All timings are the fixed consts above (RG-C5); disabled
 *  under prefers-reduced-motion via the `.assayAmbient` media rule. */
function AmbientFX() {
  return (
    <div
      className="assayAmbient"
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'hidden' }}
    >
      {/* Slow caustic light drift over the water (5.5-7.5% layer opacity, within
          the 6-8% ceiling). */}
      <div
        style={{
          position: 'absolute',
          inset: '-6%',
          background:
            'radial-gradient(38% 26% at 30% 24%, rgba(143,242,232,0.5), transparent 70%), ' +
            'radial-gradient(30% 20% at 66% 40%, rgba(120,200,210,0.4), transparent 70%), ' +
            'radial-gradient(26% 22% at 48% 66%, rgba(143,242,232,0.35), transparent 72%)',
          animation: 'assayCausticDrift 26s ease-in-out infinite alternate',
        }}
      />
      {/* Rising bubbles — anchored to the seafloor band, drifting up. */}
      {AMBIENT_BUBBLES.map((b, i) => (
        <div
          key={`bub${i}`}
          style={{
            position: 'absolute',
            left: `${b.left}%`,
            bottom: '4%',
            width: b.size,
            height: b.size,
            borderRadius: '50%',
            border: '1px solid rgba(143,242,232,0.4)',
            background: 'rgba(143,242,232,0.08)',
            animation: `assayBubbleRise ${b.dur}s linear ${b.delay}s infinite`,
          }}
        />
      ))}
      {/* Drifting plankton motes (cyan). */}
      {AMBIENT_PLANKTON.map((p, i) => (
        <div
          key={`pl${i}`}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: 'rgba(53,224,210,0.5)',
            animation: `assayPlanktonDrift ${p.dur}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
      {/* Two kelp blades swaying at the lower corners (transform-origin at the
          seafloor base). */}
      {[
        { left: '3%', h: 190, dur: 6.5, delay: 0 },
        { left: '93%', h: 150, dur: 7.5, delay: 1.2 },
      ].map((k, i) => (
        <div
          key={`kelp${i}`}
          style={{
            position: 'absolute',
            left: k.left,
            bottom: 0,
            width: 10,
            height: k.h,
            borderRadius: '6px 6px 0 0',
            background: 'linear-gradient(180deg, rgba(15,58,48,0) 0%, rgba(15,58,48,0.55) 60%, rgba(20,72,58,0.7) 100%)',
            transformOrigin: '50% 100%',
            animation: `assayKelpSway ${k.dur}s ease-in-out ${k.delay}s infinite alternate`,
          }}
        />
      ))}
    </div>
  )
}

// ─── Accessibility: live announcer ─────────────────────────────────────────

/** Visually-hidden `aria-live="polite"` region (accessibility-qa CRIT #6)
 *  announcing BALANCE, TRAIL, TALLY, disc reveals, and the win/bust outcome.
 *  ONE region for the whole game rather than one per HUD element — a screen
 *  reader user gets a single coherent status line instead of a flurry of
 *  independent announcements racing each other on every render. The text
 *  itself changes whenever any of the underlying values change (React
 *  re-renders this component's children), and a live region already present
 *  in the DOM announces its own content mutations automatically — no
 *  imperative "announce()" call needed. `aria-atomic` so a partial text diff
 *  (e.g. only the revealed count changed) still reads the WHOLE sentence,
 *  not just the changed substring, which would be incomprehensible out of
 *  context. Visually hidden via the standard clip-rect technique (not
 *  `display:none`, which would remove it from the accessibility tree
 *  entirely). */
function LiveAnnouncer({
  phase,
  balanceLamports,
  trailLen,
  revealedCount,
  committedLen,
  tallyBps,
  liveTally,
  outcome,
}: {
  phase: { kind: string }
  balanceLamports: bigint
  trailLen: number
  revealedCount: number
  committedLen: number
  tallyBps: bigint
  liveTally: bigint
  outcome: { won: boolean; payoutLamports: bigint } | null
}) {
  let text = `Balance ${formatUsdc(balanceLamports)}.`
  if (phase.kind === 'planning') {
    text += ` ${trailLen} of up to ${MAX_TRAIL} ducats marked for the claim line.`
  } else if (phase.kind === 'assaying') {
    text += ` Line running. ${revealedCount} of ${committedLen} ducats claimed. Haul ${
      tallyBps > 0n ? formatUsdc(liveTally) : '0'
    }.`
  } else if (phase.kind === 'bad-vein') {
    text += ' Cracked ducat hit. Dive busted.'
  } else if (phase.kind === 'settled' && outcome) {
    text += outcome.won
      ? ` Secured the haul. Payout ${formatUsdc(outcome.payoutLamports)}.`
      : ' Rugged by the deep. No payout.'
  }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {text}
    </div>
  )
}

// ─── First-time coachmark ───────────────────────────────────────────────────

/** localStorage key gating the one-time coachmark — bumped with a version
 *  suffix (`_v1`) so a future copy rewrite can re-show it once without
 *  clearing unrelated player storage. */
const COACHMARK_SEEN_KEY = 'assay_coachmark_seen_v1'

/** First-time coachmark (theme-composer's 2-line copy, run-20260704T162500Z)
 *  teaching TRACE a claim line of ducats -> RUN THE LINE (commit once) -> ALL-OR-
 *  NOTHING (one cracked ducat loses the whole line), plus the risk/reward lever
 *  (pick a deeper DIVE DEPTH). Shown once ever, on a player's first
 *  `planning` phase — persisted to `localStorage` the moment it first MOUNTS
 *  (taste-guardian doc/behavior-mismatch fix, 2026-07-04: an earlier draft
 *  only persisted on the explicit X-tap, so a player who instead just played
 *  a round without tapping X would see it resurface on every subsequent
 *  `planning` phase this session — this component only ever renders once
 *  per browser now, regardless of how the player leaves it). The X button
 *  still lets a player hide it immediately within the current view (`
 *  dismiss()`, purely local state) without changing that persistence
 *  decision. `position:fixed` (see the call site's own comment) — it is an
 *  overlay, never an in-flow layout element, so it can never re-open the
 *  mobile CTA-below-fold problem. SSR-safe (mirrors this file's own
 *  `useViewportSize`/`useIsWide` guard pattern). */
function IntroCoachmark({ boardShiftPx }: { boardShiftPx: number }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return window.localStorage.getItem(COACHMARK_SEEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const persistSeen = useCallback(() => {
    try {
      window.localStorage.setItem(COACHMARK_SEEN_KEY, '1')
    } catch {
      // Storage unavailable (private mode, quota) — dismiss for THIS session
      // only; not worth failing the coachmark over.
    }
  }, [])
  // Mark "seen" the moment this actually renders (not only on explicit
  // dismiss) — see the docblock above for why: this is what makes "shown
  // once ever" true regardless of whether the player taps X or just plays.
  useEffect(() => {
    if (!dismissed) persistSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const dismiss = useCallback(() => {
    setDismissed(true)
    persistSeen()
  }, [persistSeen])
  if (dismissed) return null
  return (
    <div
      role="note"
      aria-label="How to play"
      style={{
        // CRITICAL regression fix (independent accessibility-qa re-verify,
        // 2026-07-04): `bottom:12` overlapped RUN THE LINE on iPhone 14 Pro
        // (393×852) — confirmed via `elementFromPoint` and a real coordinate
        // tap that never reached the button. This is the exact viewport this
        // pass otherwise fought hard to un-crowd (mobile CRIT #1). Anchored
        // to the TOP instead, below the header's own SWOOBZ mark + the
        // fixed `SafetyLink` pill (`top:8`, ~40px tall).
        // ROUND 2 (same re-verify, second pass): `top:56` traded the RUN THE
        // LINE overlap for a NEW one — on short viewports the banner's own
        // height reaches down over the board's own top ~2 rows, and
        // `elementFromPoint` on a top-left tile resolved to the coachmark,
        // not the canvas, meaning a first-time player's very first tap could
        // silently hit nothing. Fixed at the right layer instead of chasing
        // position again: `pointerEvents:'none'` on this whole wrapper, with
        // `pointerEvents:'auto'` restored ONLY on the dismiss button below.
        // Any tap that lands on the banner's visual footprint now passes
        // straight through to the board underneath — the banner can inform
        // without ever intercepting a tap meant for the game, regardless of
        // exactly where it ends up sitting on any given viewport.
        // B6 fix (2026-07-05): on DESKTOP the centred banner at top:56 covered
        // the card's title/BALANCE + the DIVE DEPTH rail header. Nudged below
        // the header there (top:150) so it sits over the top of the board, not
        // the chrome.
        // B6b fix (2026-07-05, taste-guardian mobile re-verify): the mobile
        // banner at top:56 STILL sat on "THE ASSAY LINE" title + the BALANCE
        // header (live-measured: header band y≈40–95, banner spanned y[56,149]).
        // Nudged to top:104 so it clears the header band and sits over the
        // board top, mirroring the desktop intent. Safe: the whole wrapper is
        // pointerEvents:none (can't intercept a board tap) and RUN THE LINE
        // lives far below at y≈781, so no CTA overlap either.
        // B1 fix (2026-07-06, game-flow-qa BLOCKER — corroborated autisk+jesse):
        // top:104/150 sat DIRECTLY over the new "TO WIN" hero strip that now
        // lives at the top of the board card — live-measured 100% occlusion on
        // mobile (hero y[121,179]) and a 30px clip on desktop (hero y[120,180]).
        // A first-time player (this coachmark's own audience) could not see
        // "what you can win" while planning. Dropped BELOW the hero strip
        // (top:200 clears both viewports' hero-bottom ≤180 by ~20px) so it sits
        // over the board's top grid rows, never the hero. Still fixed (zero
        // layout height → can't reopen the mobile fold) + pointerEvents:none
        // (taps pass through to the grid) + one-shot/dismissable, and its
        // bottom (~200+93=293) stays far above RUN THE LINE (y≈780) — no CTA
        // overlap either. Probe target: overlap(note, TO WIN hero) area === 0.
        position: 'fixed',
        left: '50%',
        top: 200,
        transform: `translateX(calc(-50% - ${boardShiftPx}px))`,
        zIndex: 95,
        width: 'min(420px, calc(100% - 24px))',
        boxSizing: 'border-box',
        background: `linear-gradient(160deg,${STONE_WARM},${STONE_DEEP})`,
        border: `1px solid ${BRASS_DARK}`,
        // Coachmark accent stripe — player CYAN (this is a player-guidance card),
        // never gold (S1: gold = value, not chrome/UI accents).
        borderLeft: `3px solid ${PLAYER}`,
        borderRadius: 10,
        padding: '10px 12px',
        boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <div style={{ flex: 1, fontSize: 11.5, lineHeight: 1.5, color: BONE }}>
        <div>
          TRACE a claim line of ducats, then <b style={{ color: PLAYER }}>RUN THE LINE</b> to commit once.
        </div>
        <div style={{ color: SAND, marginTop: 2 }}>
          ALL-OR-NOTHING · one cracked ducat loses the line. Pick a deeper dive depth for more risk and reward.
        </div>
      </div>
      <button
        type="button"
        className="assayFocusable"
        onClick={dismiss}
        aria-label="Dismiss how-to-play tip"
        style={{
          flexShrink: 0,
          minWidth: 32,
          minHeight: 32,
          boxSizing: 'border-box',
          background: 'none',
          border: 'none',
          color: SAND,
          fontSize: 16,
          lineHeight: 1,
          cursor: 'pointer',
          fontFamily: 'inherit',
          // Re-enables pointer events for JUST this button — the wrapper
          // above is `pointerEvents:'none'` specifically so the rest of the
          // banner never intercepts a tap meant for the board underneath.
          pointerEvents: 'auto',
        }}
      >
        ×
      </button>
    </div>
  )
}

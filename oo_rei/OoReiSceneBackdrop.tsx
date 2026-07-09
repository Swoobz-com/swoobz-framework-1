'use client'

/**
 * OoReiSceneBackdrop -- the AI-generated backdrop plates.
 *
 * Renders two backdrop plates:
 *  1. Lobby plate: rice paddy at storm dusk (base game) -- REF-B aesthetic
 *     File: backdrop-paddy-lobby.jpg (cinematic, dark-purple palette, excellent quality)
 *  2. Spirit plate: action keyframe (REF-A aesthetic -- channeling moment)
 *     File: backdrop-paddy-spirit-bonus.jpg (spirit looming over paddy, warm-orange)
 *
 * The crossfade between them is driven by the backdropState prop.
 * Crossfade duration: 800ms ease.
 *
 * Spirit bonus backdrop has a warm-orange palette that contrasts with the lobby's
 * cool-purple. This is INTENTIONAL for the Spirit Bonus phase transition:
 * the warmth of the spirit's energy vs the cool storm of the base game.
 * A cool-purple gradient overlay softens the color temperature shift.
 *
 * Integration point: z-index 0, position absolute, fills the canvas shell.
 * The Canvas2D mechanic layer (z-2) and character layer (z-3) sit on top.
 *
 * Domain C: display only. No math.
 *
 * Brand register: Anime Cinematic. Storm-purple sky in base, amber-warm in Spirit Bonus.
 * Zero cyan anywhere in this component.
 *
 * Brushstroke wipe transition: the sumi-e canvas-paint wipe is rendered
 * by OoReiSlotCanvas (z-2) on top, not here. This component handles only
 * the CSS opacity crossfade between the two backdrop plates.
 *
 * backgroundPosition 'center 35%' (completeness spec 2026-05-28):
 * The storm sky must be visible ABOVE the grid, not cropped out by 'center top'.
 * At '35%' the vertical midpoint of the image sits at 35% of the container,
 * ensuring the dramatic sky fills the region above the slot tablets.
 */

import type { CSSProperties, ReactElement } from 'react'

import type { BackdropState } from './ooReiSignatures'

interface OoReiSceneBackdropProps {
  readonly backdropState: BackdropState
  /** Whether to darken backdrop (spin active -- storm deepens) */
  readonly stormDeepen?: boolean
  /**
   * Session-scoped active ally kanji (the player's chosen spirit companion).
   * When non-null, a sigil watermark is layered on the backdrop at 8% opacity.
   * Maps to a PNG under /assets/generated/oo-rei/ally-sigils/.
   * Display-only -- zero financial state. Domain C.
   * Sigil assets are rendered only when the file exists; a missing file shows
   * nothing (graceful degradation until Phase 6 assets land).
   */
  readonly activeAllyKanji?: string | null
  /**
   * Active region's vista art path (B.1 -- per-region slot backdrop).
   * When non-null, the slot's base-play backdrop becomes THIS region's vista
   * (storm-coast / tide-shore / ember-forge / mist-forest / shadow-vale, plus
   * cycle-2 regions), so the actual game world changes as Rei advances across
   * Tamashii-Jima -- not a single static rice paddy for every region.
   * Null falls back to the generic paddy-lobby plate (pre-region / true lobby).
   * Display-only; resolves to a real file under public/. Domain C. Zero cyan.
   *
   * Superseded for Storm Coast when cohesiveSrc is provided (see below).
   */
  readonly regionVistaSrc?: string | null
  /**
   * Cohesive scene full-bleed backdrop (B.3 -- Storm Coast art set, 2026-05-31).
   * When non-null, this scene image REPLACES both the region vista plate AND the
   * generic paddy plate for the base-play backdrop. The scene is a complete
   * authored composition (Rei + ARASHI + Storm Coast environment in one image),
   * so the separate Rei/spirit character layers are hidden by the CALLER when
   * this is non-null (OoReiExperience guards the hide).
   *
   * Two variants exist (wide/portrait); the caller resolves the correct src based
   * on viewport width BEFORE passing it here. This component renders whatever src
   * is supplied.
   *
   * Fallback contract: if null, falls through to regionVistaSrc / paddy plate.
   * If the image 404s (file not yet on disk), CSS gracefully shows nothing and
   * the vignette/stone-shore layers remain in place. Domain C. Zero cyan.
   */
  readonly cohesiveSrc?: string | null
}

export function OoReiSceneBackdrop({
  backdropState,
  stormDeepen = false,
  activeAllyKanji = null,
  regionVistaSrc = null,
  cohesiveSrc = null,
}: OoReiSceneBackdropProps): ReactElement {
  // Brightness: spirit bonus is darker (0.78), stormDeepen is 0.82, base is 0.92
  const brightness =
    backdropState === 'spirit-bonus' ? (stormDeepen ? 0.72 : 0.78)
    : stormDeepen ? 0.82
    : 0.92

  const isLobby = backdropState === 'lobby'
  const isSpirit = backdropState === 'spirit-bonus'

  // B.3: cohesive scene takes priority when available. It is a full-bleed
  // scene image that already contains Rei and the spirit -- so the separate
  // character layers are hidden by the caller (OoReiExperience). The scene
  // hides under the Spirit Bonus plate so the bonus phase retains its own
  // warm cinematic moment.
  const hasCohesive = cohesiveSrc !== null && cohesiveSrc.length > 0
  const showCohesiveScene = hasCohesive && !isSpirit

  // B.1: once a region is active, its vista becomes the base-play backdrop and
  // the generic paddy plate steps aside. The region vista hides under the
  // Spirit Bonus plate so the bonus phase still reads as its own warm moment.
  // When the cohesive scene is active, the region vista is superseded.
  const hasRegion = regionVistaSrc !== null && regionVistaSrc.length > 0
  const showRegionVista = hasRegion && !isSpirit && !hasCohesive

  // Ally sigil watermark -- path derived from kanji identity.
  // Maps kanji → spirit slug for the asset path. Only authored spirits (1-5) have sigil assets.
  // Kanji-to-slug mapping mirrors the Phase 6 asset naming convention.
  const allySlug = activeAllyKanji ? KANJI_TO_SLUG[activeAllyKanji] ?? null : null
  const allySigilSrc = allySlug
    ? `/assets/generated/oo-rei/ally-sigils/ally-sigil-${allySlug}.png`
    : null

  return (
    <div style={containerStyle}>
      {/* Fallback gradient shown when backdrop images are not yet loaded */}
      <div style={fallbackGradientStyle} />

      {/* B.3 -- cohesive scene plate (Storm Coast art set, 2026-05-31).
          This is a full-bleed authored composition: Rei + ARASHI + Storm Coast
          environment in one image. It supersedes both the lobby plate and the
          region vista plate when active. Hidden during Spirit Bonus so the
          warm spirit-bonus plate retains its distinct cinematic feel.
          The caller (OoReiExperience) hides the separate Rei/spirit character
          layers when cohesiveSrc is non-null (they are already in the scene).
          backgroundPosition 'center 30%': the horizon + sky sit in the upper
          60% of the image; centering at 30% keeps the action zone (Rei + board)
          in the scene's quiet middle strip. Zero cyan per quality gate audit. */}
      {hasCohesive && (
        <div
          key={cohesiveSrc}
          aria-hidden="true"
          style={{
            ...backdropBaseStyle,
            opacity: showCohesiveScene ? 1 : 0,
            filter: `brightness(${brightness})`,
            backgroundImage: `url('${cohesiveSrc}')`,
            backgroundPosition: 'center 30%',
          }}
        />
      )}

      {/* Lobby backdrop plate -- base game -- REF-B paddy at dusk.
          Shown only as the pre-region fallback: once a region is active its
          vista plate (below) or cohesive scene (above) takes over. */}
      <div
        style={{
          ...backdropBaseStyle,
          opacity: isLobby && !hasRegion && !hasCohesive ? 1 : 0,
          filter: `brightness(${brightness})`,
          backgroundImage: `url('/assets/generated/oo-rei/backdrop-paddy-lobby.jpg')`,
        }}
      />

      {/* B.1 -- per-region vista plate. THIS is the base-play backdrop while a
          region is active: the world changes per region (storm coast → ember
          forge → mist forest → shadow vale …). The 800ms opacity transition
          carries the lobby→region crossfade on first entry; region→region
          swaps happen behind the full-screen chapter-close ceremony so the
          single keyed plate never shows a mid-swap flash. */}
      {hasRegion && (
        <div
          key={regionVistaSrc}
          aria-hidden="true"
          style={{
            ...backdropBaseStyle,
            opacity: showRegionVista ? 1 : 0,
            filter: `brightness(${brightness})`,
            backgroundImage: `url('${regionVistaSrc}')`,
          }}
        />
      )}

      {/* Spirit Bonus backdrop plate -- action keyframe -- REF-A looming spirit over paddy */}
      <div
        style={{
          ...backdropBaseStyle,
          opacity: isSpirit ? 1 : 0,
          filter: `brightness(${brightness})`,
          backgroundImage: `url('/assets/generated/oo-rei/backdrop-paddy-spirit-bonus.jpg')`,
        }}
      />

      {/* Cool-purple tone overlay for spirit bonus -- softens warm orange towards the
          base game's cool-purple palette register. Not atmospheric particles -- it is
          a fixed color grade overlay that shifts the spirit bonus closer to the brand
          anime cinematic palette. */}
      {isSpirit && (
        <div style={spiritCoolOverlayStyle} />
      )}

      {/* Spirit Ally watermark -- 8% opacity sigil layered over the backdrop.
          Appears when activeAllyKanji is non-null (player has chosen a companion).
          CSS backgroundBlendMode:luminosity -- blends with the backdrop texture.
          Sigil asset is a 64x64 PNG tiled via background-size:cover for full-canvas
          presence at low opacity. If the asset is not yet on disk (Phase 6 pending),
          nothing renders (img onerror graceful degradation).
          Domain C display only -- zero financial state. ZERO cyan. */}
      {allySigilSrc !== null && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            backgroundImage: `url('${allySigilSrc}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundBlendMode: 'luminosity',
            opacity: 0.08,
            pointerEvents: 'none',
            // Crossfade in when ally is set (300ms ease)
            transition: 'opacity 300ms ease',
          }}
        />
      )}

      {/* ── Foreground stone shore / wet-rock altar deck ─────────────────────
          Composition Pass 2 (2026-05-31): the root cause of the "floating
          window" read is that Rei and the slot board have no shared ground
          contact surface — they both hover over sea with nothing under them.

          This deck is a single CSS-gradient stone shelf at the lower portion
          of the scene that spans the full width. Rei's feet and the sealing-dais
          base both contact this deck. It reads as dark wet rock / stone shore.

          Implementation: three stacked gradient divs for depth:
            1. Base stone shelf — dark charcoal-brown stone, positioned from
               ~70% height down to the bottom. Solid enough to read as a
               distinct surface change from the sky/sea above it.
            2. Horizon waterline — a thin lighter stripe just above the shelf
               top edge (the sky reflects on the stone at the waterline).
            3. Surface wet-sheen — a subtle lighter-center radial on the shelf
               to suggest wet stone catching light from the overcast sky.

          Zero cyan. Colors: dark basalt (#1e1d1a), wet-rock (#26232b),
          horizon gleam (#2e2b35 at 40% opacity).
          prefers-reduced-motion: these are static CSS gradients, no animation.
          Domain C: pure presentation. No financial state. */}

      {/* Layer 1: Stone shore base — the shared ground deck */}
      <div style={stoneShoreDeckStyle} />

      {/* Layer 2: Horizon waterline — thin reflective stripe at deck top */}
      <div style={horizonWaterlineStyle} />

      {/* Layer 3: Wet-rock surface sheen — center highlight on the deck */}
      <div style={deckSheenStyle} />

      {/* Board-focus lens (spec §5a) — subtle radial brightening at board center.
          Static CSS gradient. z=2, below vignette. Zero cyan. No animation. */}
      <div style={boardFocusLensStyle} />

      {/* Atmospheric vignette overlay -- darkens edges, draws focus to center.
          spec §1 Fix C: deeper outer stops + tighter ellipse for cinematic framing.
          Distant torii silhouette removed 2026-05-28 per Tim verbatim image 55. */}
      <div style={vignetteStyle} />
    </div>
  )
}

const containerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  overflow: 'hidden',
}

const backdropBaseStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundSize: 'cover',
  // 'center 35%': storm sky sits above the grid, not cropped by 'center top'.
  // Completeness spec 2026-05-28 -- backdrop must WRAP the grid, sky above tablets.
  backgroundPosition: 'center 35%',
  backgroundRepeat: 'no-repeat',
  transition: 'opacity 800ms ease, filter 300ms ease',
}

/** Fallback gradient shown when backdrop images are not yet loaded */
const fallbackGradientStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  background: 'linear-gradient(180deg, #2d2438 0%, #1a1612 45%, #2b2419 100%)',
}

/**
 * Cool-purple tone overlay for spirit bonus phase.
 * The spirit-bonus backdrop has a warm-orange palette (spirit's energy glow).
 * This fixed overlay blends cool-purple back in to maintain brand register cohesion.
 * Opacity 0.35 -- enough to shift the temperature without losing the spirit's warmth.
 * NOT a particle/glow effect -- it is a flat color grade layer.
 */
const spiritCoolOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
  background: 'rgba(45, 36, 56, 0.35)',
  pointerEvents: 'none',
}

/**
 * Maps authored spirit kanji → asset slug for ally-sigil PNG paths.
 * Only the five authored spirits have assets (Phase 6). Unauthored '?' returns null
 * via the lookup so no broken request fires.
 */
const KANJI_TO_SLUG: Readonly<Record<string, string>> = {
  '嵐': 'arashi',
  '潮': 'shio',
  '炎': 'homura',
  '霧': 'kiri',
  '影': 'kage',
} as const

/**
 * Studio-finish vignette (spec §1 Fix C + §5a board-focus lens, 2026-06-01).
 *
 * Two layers:
 *  1. Deeper outer vignette — outer stops lifted to 0.55/0.72 so corners and
 *     top edge read as intentional cinematic darkness framing the lit board.
 *     Ellipse shifted to 50% 46% (was 48% 48%) and compressed slightly to
 *     tighten the bright zone around the board center.
 *  2. Board-focus lens — radial brightening overlay (z=2, behind vignette z=3)
 *     that puts a 0.06 white-warm tint at the board zone center, fading to
 *     transparent at 70%. Compositional tool, not a particle. Static CSS.
 *     Zero cyan. prefers-reduced-motion: safe (static gradient).
 */
const vignetteStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 3,
  pointerEvents: 'none',
  background:
    'radial-gradient(ellipse 68% 62% at 50% 46%, transparent 28%, rgba(8,6,4,0.55) 70%, rgba(4,3,2,0.72) 100%)',
}

/**
 * Board-focus lens (spec §5a): a subtle radial brightening centred on the
 * play field (52% 48%) that pulls the eye toward the board without adding
 * light effects. 0.06 alpha max — barely perceptible individually but
 * compositionally significant when combined with the deeper corner vignette.
 * Static CSS gradient, no animation. Zero cyan.
 * prefers-reduced-motion: static — no concern.
 * Domain C: pure presentation.
 */
const boardFocusLensStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  pointerEvents: 'none',
  background:
    'radial-gradient(ellipse 52% 48% at 52% 48%, rgba(255,245,220,0.06) 0%, rgba(255,245,220,0.02) 40%, rgba(0,0,0,0) 70%)',
}

// ─── Stone shore ground deck (Composition Pass 2 — 2026-05-31) ────────────────
//
// The THREE-LAYER stone shore that creates the shared ground plane on which BOTH
// Rei stands and the sealing-dais rests. This is the single structural fix that
// fuses them into one authored ritual frame.
//
// Color palette: dark basalt and wet rock, NO warm or cyan — registers as
// cold-wet coastal stone, matching Tamashii-Jima storm-coast aesthetic.
//   #1c1b1f — near-black basalt (the main shelf body)
//   #24232a — dark wet rock (the upper edge of the shelf)
//   rgba(40,37,46,0.55) — lighter stone center (horizon reflection on wet surface)
//
// zIndex 3: above the vignette (z-2), below any HUD chrome. The stone reads
// through the vignette's radial darkening so the deck edges are naturally dark.
//
// Height: the shelf occupies approximately the lower 30% of the backdrop.
// 'bottom: 0' anchors it to the actual screen bottom; 'height: 30%' lets the
// shelf fill whether viewport is 412px or 1440px tall.
//
// This approach is CSS-only (no canvas, no JS) — cheaper and frame-perfect.
// prefers-reduced-motion: static gradient, no animation, no concern.
// Domain C: display only.

/**
 * Stone shore base — the main shelf body.
 * The primary dark-basalt ground surface. A linear gradient from fully
 * transparent (at the top of the shelf region) to solid stone at the bottom.
 * Top portion fades so the sea/sky above bleeds through into the shelf edge.
 */
const stoneShoreDeckStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  // Height deliberately generous: 32% of backdrop height.
  // The upper 40% of this zone is transparent (gradient), so the visible
  // stone ledge reads as occupying roughly the lower ~20% of the scene.
  height: '32%',
  zIndex: 3,
  pointerEvents: 'none',
  // Gradient: fully transparent at top → dark basalt at bottom.
  // The inflection at 35% creates a visible shelf top-edge (the stone
  // appears to emerge from the sea/paddy horizon at this line).
  background: `linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0%,
    rgba(0,0,0,0) 30%,
    rgba(22,20,26,0.45) 45%,
    rgba(26,24,30,0.72) 58%,
    rgba(24,23,27,0.88) 72%,
    rgba(22,21,25,0.96) 100%
  )`,
}

/**
 * Horizon waterline — a thin reflective stripe at the top of the stone shelf.
 * The overcast sky reflects on the wet stone at the tideline, reading as a
 * slightly lighter band separating sky/sea above from stone below.
 * Height: 3px at 70% down from the backdrop top (= 30% up from bottom).
 */
const horizonWaterlineStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  // 68% from top = 32% up from bottom — sits at the shelf's top edge.
  top: '68%',
  height: '2px',
  zIndex: 4,
  pointerEvents: 'none',
  // The waterline is a subtle gleam — not bright, just slightly lighter than
  // the stone immediately below and the sea immediately above.
  background: 'linear-gradient(to right, rgba(42,40,50,0) 0%, rgba(50,47,58,0.50) 20%, rgba(55,52,62,0.60) 50%, rgba(50,47,58,0.50) 80%, rgba(42,40,50,0) 100%)',
  // Soften the line: it is a water-reflection edge, not a hard ruled line.
  filter: 'blur(1px)',
}

/**
 * Wet-rock surface sheen — a subtle radial highlight on the stone deck.
 * The overcast sky casts diffuse light onto the wet stone; the center of
 * the scene has more sky exposure than the edges (which are in shade from
 * Rei on the left and the board structure on the right). This reads as wet
 * stone responding to ambient light — grounding without a literal texture.
 */
const deckSheenStyle: CSSProperties = {
  position: 'absolute',
  left: '15%',
  right: '15%',
  bottom: 0,
  height: '20%',
  zIndex: 4,
  pointerEvents: 'none',
  // Radial from center-bottom: slightly lighter stone in the middle where
  // reflected light is strongest, fading to dark at the horizontal edges.
  background: 'radial-gradient(ellipse at 50% 100%, rgba(48,45,55,0.38) 0%, rgba(30,28,34,0.15) 55%, rgba(0,0,0,0) 100%)',
}

'use client'

/**
 * OoReiCharacterLayer -- Rei full-body + Spirit figure overlays.
 *
 * Z-layer assignment:
 *   Spirit figure: z-index 1 (behind slot canvas z-2, in front of backdrop z-0)
 *   Rei full-body: z-index 3 (in FRONT of slot canvas z-2)
 *
 * Per Tim's verbatim brief: "artistic characters slightly in front of the
 * slot grid" -- Rei at z-3 is ALWAYS in front of the grid at z-2.
 *
 * CONTAINMENT LAW (enforced here -- Tim rejected 2× for violations):
 *   1. NO figure (Rei OR any spirit) may be hard-clipped by a viewport edge.
 *   2. BANNED: negative top/right/left/bottom on spirit or Rei containers.
 *      BANNED: container dimension > 100% that overscans a figure off an edge.
 *   3. Spirit looms via SIZE + BOARD-CENTRED POSITION + soft mask -- NOT by
 *      bleeding off edges. The spirit container is centred over the board
 *      (left:50% + translateX(-50%)) so the figure hangs over the board
 *      top-centre (Tim 2026-06-02 "BEHIND THE SLOTS, IN FRONT OF THE DARK
 *      BACKGROUND" at the top). objectFit:contain keeps the whole spirit in-frame.
 *   4. Any edge a figure actually reaches is SOFT-FEATHERED with mask-image
 *      (radial/linear gradient dissolving into atmosphere) -- never a hard cut.
 *   5. Rei: container top clears the header; objectFit:contain + objectPosition:bottom;
 *      full figure incl hat always visible at every height.
 *   6. Verified at 390/834/1440/1920 AND both intro + board-active phases.
 *
 * Blend-mode per-region (composition spec v3 2026-06-01):
 *   storm-coast / ember-forge: dark ink on white/near-white PNG ground → screen at 0.68-0.72
 *   tide-shore / mist-forest:  near-white wispy form → normal at 0.38-0.42 (no white blast)
 *   shadow-vale:               grey-white body, purple eyes → normal at 0.55 (shadow mass)
 *
 * Brand register: Anime Cinematic. Zero cyan in any element of this component.
 * Domain C: presentation only.
 */

import { type CSSProperties, type ReactElement, useEffect, useState } from 'react'

import type { CharacterPose } from './ooReiSignatures'
import { regionSpiritCutoutForRegion } from './ooReiMythRegions'

/** Fallback golem loom: shown only when no per-region cutout is available. */
const FALLBACK_SPIRIT_SRC = '/assets/generated/oo-rei/spirit-shadow-loom.png'

interface OoReiCharacterLayerProps {
  readonly characterPose: CharacterPose
  /** Whether reel is currently spinning -- drives talisman flutter + idle pause */
  readonly isSpinning: boolean
  /** Whether a win was just confirmed -- drives amber eye pulse (once, not loop) */
  readonly winPulseActive: boolean
  /** Spirit loom opacity 0-1. Controlled by Spirit Bonus phase. */
  readonly spiritOpacity: number
  /**
   * HUD band height in px (176 desktop / 160 mobile).
   * Used to anchor Rei's bottom edge to the altar-band top, solving the
   * image-21 Rei-overlap failure: her feet land ON the instrument panel
   * floor rail, NOT overlapping the stat cells inside the band.
   * 0 when HUD is hidden (lobby phase).
   */
  readonly hudBandHeight: number
  /**
   * Active myth-region slug (e.g. 'storm-coast', 'ember-forge').
   * Drives the per-region spirit PNG so the looming background spirit
   * matches the active region: ARASHI for Storm Coast, HOMURA for Ember Forge, etc.
   * Null (pre-region / all regions cleared) → fallback golem loom.
   * RG note: driven purely by region progression, never by economic events.
   */
  readonly activeRegionId: string | null
  /**
   * Lobby composition mode (Tim 2026-06-01 "fix the lobby - REI looks bad").
   * When true, Rei is enlarged (~42% xs / ~36% md / ~30% lg, up from base 32%)
   * via the `is-lobby` container class + media-query width overrides in the
   * keyframes <style> block. This pulls her face/hat into the upper third so
   * the empty storm sky reads as HER backdrop (Ghost-of-Tsushima hero framing)
   * rather than a tiny figure lost in an empty sky.
   * The committed grounding (contact shadow, no glow rim, 18% feet feather,
   * objectFit:contain) is untouched. No sky particles. Default false.
   */
  readonly isLobby?: boolean
  /**
   * In-game board loom mode (Tim #93/#94/#95, 2026-06-02). When true (base-game
   * board, not lobby, not bonus), the spirit looms from the UPPER-RIGHT: its head
   * crests over the board's top-right against the storm sky (where it reads bold,
   * the lighter ground), body coiling DOWN behind the right columns (occluded by
   * the opaque board panel = the depth-weave). This REPLACES the retired in-canvas
   * band dragon. Distinct from the centred bonus loom + the subtle lobby loom.
   * Default false. Mutually exclusive with isLobby.
   */
  readonly inGameLoom?: boolean
  /**
   * Board PANEL rect in CSS px (same coordinate space as this inset:0 layer),
   * reported by OoReiSlotCanvas via onBoardRect. When present AND inGameLoom, the
   * dragon is anchored to the board's TOP-RIGHT corner (draping OVER the slot tile
   * area, Tim #98) instead of the viewport. Null until the canvas reports it.
   */
  readonly boardRect?: { x: number; y: number; w: number; h: number } | null
}

// ─── Per-region blend mode + opacity + objectPosition ────────────────────────
// Composition spec v3 2026-06-01: match PNG ground colour to blend strategy.
//
// screen blend:  dark ink on white/near-white PNG ground → white disappears on dark backdrop.
//                Use for: arashi (dark dragon + white fog) and homura (dark lava on white).
// normal blend:  near-white or all-white wispy form → screen would blast white veil.
//                Use for: shio (near-white mist), kiri (near-white smoke), kage (grey-white body).
//
// objectPosition (2026-06-02 — container is now BOARD-CENTRED, not viewport-right):
//   'center top'  → spirit's mass hangs from the TOP-CENTRE of its frame and
//                   looms over the board midpoint. ALL regions use this now: the
//                   cinematic PNGs (cinematic/spirits/*.png) all compose the
//                   spirit descending from top-centre, so a centred container +
//                   'center top' plants the figure directly above the board top.
interface SpiritBlendStyle {
  mixBlendMode: CSSProperties['mixBlendMode']
  opacity: number
  objectPosition: string
}

function getSpiritBlendStyle(regionId: string | null): SpiritBlendStyle {
  switch (regionId) {
    case 'tide-shore':
      // SHIO "dissolves into the foam whenever a hand reaches for it" — elusive by
      // lore, so softer than ARASHI/HOMURA. normal blend (screen would white-veil
      // the near-white wisp); 0.54 reads as a present-but-elusive tide-form.
      return { mixBlendMode: 'normal', opacity: 0.54, objectPosition: 'center top' }
    case 'mist-forest':
      // KIRI "hides the path in fog" — the most elusive spirit by lore. normal blend
      // on near-white smoke; 0.50 registers as a ghostly fog-form among the trees
      // without blasting a flat white veil. Grows as the gauge fills.
      return { mixBlendMode: 'normal', opacity: 0.50, objectPosition: 'center top' }
    case 'shadow-vale':
      // KAGE: grey-white body, purple eyes. normal at 0.55 — shadow mass reads as
      // looming presence. Purple eye-glow shows as two violet points. No white blast.
      // 2026-06-02: 'right top' → 'center top' so the shadow mass looms over the
      // board midpoint with the now board-centred container (was viewport-right).
      return { mixBlendMode: 'normal', opacity: 0.55, objectPosition: 'center top' }
    case 'ember-forge':
      // HOMURA: dark lava-crack figure on white/near-white ground. screen is correct.
      // Centered upright in PNG (not upper-right like ARASHI).
      return { mixBlendMode: 'screen', opacity: 0.68, objectPosition: 'center top' }
    default:
      // storm-coast (ARASHI) and fallback golem: dark ink on white/near-white ground.
      // screen inverts the white ground to transparent on dark backdrop.
      // 2026-06-02 (Tim "position him BEHIND THE SLOTS, IN FRONT OF THE DARK
      // BACKGROUND" at the TOP of the board): objectPosition flipped 'right top'
      // → 'center top'. The cinematic ARASHI PNG (cinematic/spirits/arashi.png)
      // is a colossal dragon head + coiled body hanging from the TOP-CENTRE of
      // its frame. With the container now centred over the board (see
      // spiritContainerStyle), 'center top' plants the dragon head directly above
      // the board midpoint so it LOOMS over the reels rather than drifting off to
      // the viewport's upper-right corner. opacity 0.86 + screen reads strongly
      // through the now-translucent header band, in front of the dark storm bg.
      return { mixBlendMode: 'screen', opacity: 0.86, objectPosition: 'center top' }
  }
}

export function OoReiCharacterLayer({
  characterPose,
  isSpinning,
  winPulseActive,
  spiritOpacity,
  hudBandHeight,
  activeRegionId,
  isLobby = false,
  inGameLoom = false,
  boardRect = null,
}: OoReiCharacterLayerProps): ReactElement {
  const [eyePulse, setEyePulse] = useState(false)

  // ── BOARD-ANCHORED DRAGON LOOM — CORNER-DRAPE DEPTH WEAVE v2 (2026-06-02)
  //
  // PROBLEM WITH v1: The head was anchored 72% across the board (deep in the tiles),
  // so the head sat INSIDE the board area at 20% down. The front mask was a tiny
  // 13%-radius circle — just a floating head blob with no connecting neck. The board
  // panel occluded the body but the head appeared pasted ON the tiles, not draping
  // OVER the board's frame edge. Five rejected iterations on this pattern.
  //
  // CORNER-DRAPE v2:
  //   The head is positioned just above and inside the board's TOP-RIGHT CORNER
  //   (headScreenX ≈ board right edge, headScreenY ≈ board top - 6% board height).
  //   This puts the head IN THE STORM SKY above the frame, with the neck/mane
  //   descending to cross the board's top-right frame corner — the seam where
  //   body (behind board panel) and head (in front of sky) meet reads as a TRUE
  //   spatial crossing, not a floating sticker.
  //
  //   Larger box (1.35× board height vs 1.18×): the body coils to the right of
  //   the board into the storm sky, with room to loop down behind the right edge.
  //
  //   BEHIND copy (z-1): full dragon with warm amber-gold filter bloom. The board
  //   panel (z-2) naturally occludes the body tiles. The BEHIND layer also shows
  //   the body that sticks out ABOVE and to the RIGHT of the board — the sky-
  //   framing coil. Warm filter: drop-shadow amber so the DARK dragon body reads
  //   against the DARK storm sky (without backlight the coil disappears into the
  //   backdrop — zero cyan, amber only).
  //
  //   FRONT copy (z-3): wide angular reveal covering the HEAD + NECK ARC + MANE
  //   that drapes OVER the board's top-right frame corner. This is NOT a tiny head
  //   circle — it's a diagonal wedge that shows everything from the top of the box
  //   down through the board-top crossing point, tapering to feather out below.
  //   The seam where the mask cuts off corresponds to the board's top frame edge
  //   within the box, so the front layer carries the "over-the-frame" portion.
  //
  //   MOBILE: same two-layer system; boardRect is reported by the canvas on all
  //   viewports. The body is smaller (boardRect.h is shorter on portrait) but
  //   the corner-drape principle is unchanged — head above the board top,
  //   neck crossing the top-right corner, body behind the right columns.
  //
  // Zero cyan; amber filter only. RG-C5: no streak/session state — opacity
  // comes from spiritOpacity prop (phase/form-driven at call site).
  const boardLoom = inGameLoom && boardRect != null
  // THREE-LEVEL DEPTH (Tim #103, 2026-06-03): the canvas was split into a BACK
  // canvas (z-2: panel / spirit-bonus band + sockets / haze / dais) and a FRONT
  // canvas (z-4: ONLY the cell tiles + win marks, transparent elsewhere). This
  // dragon is the MIDGROUND at z-3 — BETWEEN them. Result:
  //   • where the dragon overlaps the dark PANEL / BAND → it reads IN FRONT of
  //     them (z-3 > z-2) — it is no longer "hidden behind everything";
  //   • where the dragon crosses the slot TILES → the opaque front tiles (z-4)
  //     OCCLUDE it (z-4 > z-3) — body disappears behind the reels = the depth;
  //   • where there are no tiles (open upper-right above/right of the board) the
  //     FRONT canvas is transparent, so the head + mane read against the backdrop.
  // Both rejected extremes are now avoided: z-1 (hidden behind everything) and
  // z-3-over-a-single-canvas (covered the tiles, "nothing is visible").
  // arashi-storm.png: head at ~26% X / 37% Y, points LEFT; body curls down-right.
  const ART_HEAD_X = 0.26 as const
  const ART_HEAD_Y = 0.37 as const
  let boardLoomStyle: CSSProperties | undefined
  if (boardRect) {
    // BOUND TO THE SLOT AREA (Tim 2026-06-03 "on larger screens it scales bad …
    // should scale and bound towards the actual slot area, not the viewheight or
    // width"). The box is sized + anchored PURELY from boardRect (the slot panel),
    // and kept TIGHT to the board so it hugs the top-right instead of sprawling
    // into the large-screen margins. boxSide 1.12× board height (was 1.55×): the
    // head + mane crest just past the board's top-right, the body reaches
    // ~(1−ART_HEAD_Y)·1.12·h ≈ 0.7·h down over the right columns (z-4 tiles occlude
    // it = depth). Smaller + corner-hugging = consistent at every screen size.
    // Head at the board's TOP-RIGHT corner, looking LEFT, anchored to boardRect.
    const headScreenX = boardRect.x + boardRect.w * 0.82
    const headScreenY = boardRect.y + boardRect.h * 0.01
    // CLAMP THE BOX TO THE VIEWPORT (Tim 2026-06-03): on wide screens cap boxSide
    // so the coiling body never hard-clips at the viewport right edge.
    const desiredSide = boardRect.h * 1.12
    const vw =
      typeof window !== 'undefined' && window.innerWidth > 0
        ? window.innerWidth
        : headScreenX + (1 - ART_HEAD_X) * desiredSide + 12
    const maxSideByRight = (vw - 12 - headScreenX) / (1 - ART_HEAD_X)
    const boxSide = Math.round(
      Math.max(boardRect.h * 0.78, Math.min(desiredSide, maxSideByRight)),
    )
    const boxLeft = Math.round(headScreenX - ART_HEAD_X * boxSide)
    const boxTop = Math.round(headScreenY - ART_HEAD_Y * boxSide)
    boardLoomStyle = {
      position: 'absolute',
      left: boxLeft,
      top: boxTop,
      width: boxSide,
      height: boxSide,
      zIndex: 3, // BETWEEN back canvas (z-2) and front tiles (z-4) — the midground
      pointerEvents: 'none',
      transition: 'opacity 800ms ease',
      // REVERTED to this-morning's known-good head-centred radial dissolve (Tim
      // 2026-06-04 #124: "the head is now invisible … it was better before … the
      // dragon positioning only regressed"). Every clip-path / linear-mask attempt
      // this session cut the dragon's FACE — so they are removed. Feather is centred
      // on the head (29% / 34%) so the head + neck stay crisp and the long coiling
      // body fades outward into the storm before any edge. NO clip-path. Zero cyan.
      WebkitMaskImage:
        'radial-gradient(ellipse 114% 106% at 29% 34%, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 36%, rgba(0,0,0,0.68) 54%, rgba(0,0,0,0.28) 72%, rgba(0,0,0,0) 86%)',
      maskImage:
        'radial-gradient(ellipse 114% 106% at 29% 34%, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 36%, rgba(0,0,0,0.68) 54%, rgba(0,0,0,0.28) 72%, rgba(0,0,0,0) 86%)',
    }
  }
  // Dragon img: clean transparent cutout, normal blend, fills the square box.
  const loomImgStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    height: '100%',
    width: '100%',
    objectFit: 'contain',
    objectPosition: 'center',
    mixBlendMode: 'normal',
  }

  // REI SIZED TO THE LEFT MARGIN (Tim 2026-06-03 "REI is in the screen too much
  // … wider its perfect"). Rei used a fixed 32% width + fit-by-height, so she was
  // a constant pixel size: on a wide screen she sat neatly in the left margin, but
  // as the centred board shifts LEFT on narrower-wide screens she overran it.
  // Bind her container width to the actual left margin (boardRect.x) so she scales
  // WITH the gap — full presence when there's room, smaller when the board crowds
  // in, never overlapping. objectFit:contain keeps her proportional; objectPosition
  // bottom-center seats her in the margin. Only applied on real desktop margins
  // (>=160px); xs/sm media queries (!important) still own the mobile/tablet layout.
  const reiBoundWidth =
    boardRect && boardRect.x >= 90 ? `${Math.round(boardRect.x + 24)}px` : undefined

  // Resolve the per-region themed spirit for both the back-layer loom and the
  // front-coil fragment. Falls back to the generic golem when no region is active.
  // Single source of truth: regionSpiritCutoutForRegion (ooReiMythRegions.ts).
  // RG-C5: determined solely by region progression, never by economic events.
  const spiritSrc =
    (activeRegionId !== null ? regionSpiritCutoutForRegion(activeRegionId) : null) ??
    FALLBACK_SPIRIT_SRC

  // Per-region blend style: computed once per activeRegionId change
  const blendStyle = getSpiritBlendStyle(activeRegionId)

  // Single eye pulse on win confirmation -- fires once, not looping
  useEffect(() => {
    if (!winPulseActive) return
    setEyePulse(true)
    const timer = setTimeout(() => setEyePulse(false), 600)
    return () => clearTimeout(timer)
  }, [winPulseActive])

  return (
    <>
      {/* Spirit figure back layer -- z-1, behind the slot canvas.
          Src is the ACTIVE REGION's themed spirit (via regionSpiritCutoutForRegion).
          Storm Coast → cinematic/spirits/arashi.png (colossal looming dragon),
          Ember Forge → homura.png, etc. Falls back to the generic golem loom when
          no region is active.
          Blend mode and opacity are per-region (see getSpiritBlendStyle above).
          Soft mask-image on the container eliminates ALL hard rectangular edges.

          Tim 2026-06-02 (Fix 1 z-order): in BASE-GAME board phases the spirit is
          now drawn ON the canvas (OoReiSlotCanvas in-board dragon, in FRONT of the
          band-bg, BEHIND the tiles). So this DOM z-1 spirit is SUPPRESSED there
          (Experience passes spiritOpacity=0) to avoid a double-spirit. It still
          carries the spirit in the two places the canvas dragon is absent:
            • LOBBY  — a SUBTLE atmospheric storm-form, off to the UPPER-RIGHT,
              integrated into the storm sky (is-lobby class + 'right top') so it
              does NOT crowd Rei (Fix 2). Low opacity (OO_REI_LOBBY_SPIRIT_OPACITY).
            • SPIRIT BONUS — the canvas band collapses, so the DOM spirit carries
              the bonus presence (board-centred loom, gauge-floored at 0.5).
          CONTAINMENT LAW: top:0, height:100%, no negative offsets, no overscan. */}
      {boardLoom ? (
        // COMPOSED CORNER ART — single layer. The dragon woven through the lacquer
        // frame rail with depth PAINTED IN (arashi-corner.png), anchored to the
        // board's top-right corner. No live z-weave: the over/under is in the art.
        <div className="oo-rei-spirit-loom" style={{ ...boardLoomStyle, opacity: spiritOpacity }}>
          <img
            src={spiritSrc}
            alt=""
            aria-hidden="true"
            style={loomImgStyle}
            onError={(e) => {
              const parent = (e.currentTarget as HTMLImageElement).parentElement
              if (parent) parent.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div
          className={
            isLobby
              ? 'oo-rei-spirit-container is-lobby'
              : inGameLoom
                ? 'oo-rei-spirit-container is-ingame-loom'
                : 'oo-rei-spirit-container'
          }
          style={{ ...spiritContainerStyle, opacity: spiritOpacity }}
        >
          <img
            src={spiritSrc}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              height: '100%',
              width: '100%',
              objectFit: 'contain',
              // LOBBY: subtle atmospheric storm-form, upper-right ('right top').
              // IN-GAME (no boardRect yet): 'right top'. BONUS: per-region.
              objectPosition: isLobby || inGameLoom ? 'right top' : blendStyle.objectPosition,
              opacity: isLobby ? blendStyle.opacity * 0.62 : inGameLoom ? 1 : blendStyle.opacity,
              mixBlendMode: inGameLoom ? 'normal' : blendStyle.mixBlendMode,
            }}
            onError={(e) => {
              const parent = (e.currentTarget as HTMLImageElement).parentElement
              if (parent) parent.style.display = 'none'
            }}
          />
        </div>
      )}

      {/* Rei character -- z-3, left third, in front of the slot canvas.
          bottom: hudBandHeight - 8 anchors her feet so they plant INTO the
          transition gradient (§4.2), overlapping by 8px. She stands ON the
          altar deck surface, not floating above a hard seam.
          top: 48px clears the header bar (44-48px); the PNG's 18% transparent
          top margin provides further hat clearance above the container.
          CONTAINMENT LAW: objectFit:contain + objectPosition:bottom center
          ensures full figure incl. hat is always visible. No overflow:hidden. */}
      <div
        className={isLobby ? 'oo-rei-character-container is-lobby' : 'oo-rei-character-container'}
        style={{
          ...reiContainerStyle,
          bottom: Math.max(0, hudBandHeight - 8),
          ...(reiBoundWidth ? { width: reiBoundWidth } : null),
        }}
      >
        {/* Ground-contact shadow (Tim 2026-06-01): a soft elliptical pool under
            Rei's feet that plants her weight on the shore. This — NOT a filter
            halo — is what sells physical presence (every GoT figure has one).
            z below the plates; pointer-events none; zero cyan. */}
        <div aria-hidden="true" style={reiContactShadowStyle} />
        {/* Profile plate -- base game standing pose */}
        <div
          style={{
            ...reiImageWrapperStyle,
            opacity: characterPose === 'profile' ? 1 : 0,
            // Idle sway animation -- only when NOT spinning (stops distraction during spin)
            animation: !isSpinning ? 'reiIdleSway 4s ease-in-out infinite alternate' : 'none',
          }}
        >
          <img
            src="/assets/generated/oo-rei/rei-fullbody-profile-v4.png?v=2026-06-03-v4b"
            alt="Rei, last warden of Tamashii-Jima"
            style={{
              ...reiImageStyle,
              // FLIP (Tim 2026-06-03 "flip her horizontally"): scaleX(-1) on the
              // <img> ONLY (not the container) so the contact-shadow ellipse +
              // talisman flutter stay un-mirrored. The v3 render is near-frontal,
              // so the flip turns her gaze toward the board (screen-right) and
              // moves the kusarigama to the OUTER/left side — decluttering the
              // board edge. The ofuda strokes are impressionistic, so the mirror
              // is imperceptible at this scale.
              transform: 'scaleX(-1)',
              // GROUNDING (Tim 2026-06-01/06-03 "cutoff and floating"): weight
              // comes from the container drop-shadow + contact-shadow ellipse +
              // feet feather. Win feedback = eye-pulse brightness only. NO glow rim.
              filter: eyePulse
                ? 'brightness(1.18)'
                : 'none',
              transition: eyePulse
                ? 'filter 180ms ease-out'
                : 'filter 500ms ease-in',
            }}
            onError={(e) => {
              // Fallback: show amber silhouette placeholder until asset is generated
              const img = e.currentTarget as HTMLImageElement
              img.style.display = 'none'
              const parent = img.parentElement
              if (parent) parent.setAttribute('data-asset-pending', 'rei-fullbody-profile')
            }}
          />
          {/* Talisman ribbon flutter overlay -- only during spin, NOT a particle */}
          {isSpinning && <div style={talismanFlutterStyle} />}
        </div>

        {/* Channeling plate -- Spirit Bonus pose */}
        <div
          style={{
            ...reiImageWrapperStyle,
            opacity: characterPose === 'channeling' ? 1 : 0,
          }}
        >
          <img
            src="/assets/generated/oo-rei/rei-fullbody-channeling.png?v=2026-05-31-canon2"
            alt="Rei channeling the spirit seal"
            style={{
              ...reiImageStyle,
              filter: 'brightness(1.08) saturate(1.1)',
            }}
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement
              img.style.display = 'none'
              const parent = img.parentElement
              if (parent) parent.setAttribute('data-asset-pending', 'rei-fullbody-channeling')
            }}
          />
        </div>
      </div>

      {/* CSS keyframes for Rei animations */}
      <style>{REI_ANIMATION_KEYFRAMES}</style>
    </>
  )
}

// ─── Spirit container (CONTAINMENT LAW enforced) ─────────────────────────────
//
// CONTAINMENT LAW v4 — BOARD-CENTRED LOOM (2026-06-02, Tim verbatim "position
// him BEHIND THE SLOTS, IN FRONT OF THE DARK BACKGROUND" at the TOP of the board):
//   left: 50% + translateX(-50%)  -- CENTRED over the board midpoint, NOT pinned
//                                     to the viewport right edge. This is the core
//                                     fix: the looming dragon now hangs over the
//                                     centre-top of the reels, reading through the
//                                     translucent header band, in front of the
//                                     dark storm backdrop.
//   top: 0       -- flush with top, NO negative overscan
//   height: 100% -- NEVER exceeds parent height
//   width: 58%   -- xs base; media queries grow it (board-relative) at md/lg/xl
//
// The spirit "looms" via:
//   1. WIDTH (large percentage, grows at md/lg/xl)
//   2. CENTRE POSITION (container centred + objectPosition 'center top' plants
//      the dragon head directly above the board top-centre)
//   3. SOFT MASK (radial gradient fades all edges; the BOTTOM dissolves into the
//      board so the spirit melts behind the reels rather than ending in a hard cut)
//   NOT by negative offsets that push the figure off the viewport edge.
//
// SOFT MASK v5 (2026-06-02 — board-centred): ellipse 82% 82% centred at 50% 34%.
//   Horizontal centre 50% (was 55%) matches the now-centred container so the
//   opaque core sits over the dragon's head/coil mass. Vertical centre 34% keeps
//   the mass high (looming from the top) and lets the lower body feather away
//   into the board zone. No hard cut at any edge; bottom dissolves last + softest
//   so the spirit melts INTO the board behind the reels (Tim "dissolves into the
//   board"). Left/right symmetric so the centred figure never clips either side.
//
// prefers-reduced-motion: mask-image is a static gradient (no animation).
// Zero cyan. transform/opacity/mask only -- no layout properties animated.
const spiritContainerStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',                       // CONTAINMENT LAW v4: BOARD-CENTRED, not right-pinned
  transform: 'translateX(-50%)',     // centre the container over the board midpoint
  top: 0,                            // CONTAINMENT LAW: ZERO -- flush with top, no overscan
  height: '100%',                    // CONTAINMENT LAW: never exceeds parent
  width: '58%',                      // xs base: full figure in-frame; media queries grow it
  zIndex: 1,
  transition: 'opacity 800ms ease',
  pointerEvents: 'none',
  // SOFT MASK v5: large ellipse centred (50% horizontal) over the contained
  // figure, biased high (34% vertical) so the dragon looms from the top and the
  // lower body dissolves into the board. Feathers all four edges; the bottom
  // fades softest so the spirit melts behind the reels.
  WebkitMaskImage: `radial-gradient(ellipse 82% 82% at 50% 34%,
    rgba(0,0,0,1) 0%,
    rgba(0,0,0,1) 30%,
    rgba(0,0,0,0.88) 46%,
    rgba(0,0,0,0.58) 62%,
    rgba(0,0,0,0.22) 78%,
    rgba(0,0,0,0) 95%
  )`,
  maskImage: `radial-gradient(ellipse 82% 82% at 50% 34%,
    rgba(0,0,0,1) 0%,
    rgba(0,0,0,1) 30%,
    rgba(0,0,0,0.88) 46%,
    rgba(0,0,0,0.58) 62%,
    rgba(0,0,0,0.22) 78%,
    rgba(0,0,0,0) 95%
  )`,
}

// ─── Rei container (CONTAINMENT LAW enforced) ────────────────────────────────
//
// top: 48px -- clears the 44-48px header bar.
//   The PNG's transparent top margin provides further hat clearance.
//   Desktop breakpoint (>=768px) overrides to 44px in media query.
//
// bottom: overridden inline by Math.max(0, hudBandHeight - 8) to anchor feet
//   to the HUD rail's top with an 8px overlap into the transition gradient.
//
// width: 32% base -- grows in media queries for desktop presence.
//   CONTAINMENT LAW: objectFit:contain preserves aspect ratio; the PNG's
//   transparent side margins prevent hard edge clipping.
//
// Feet feather: 11% (reduced from 18% on 2026-06-02 -- the 18% reach was
//   eating into Rei's knees at common viewport heights, Tim "cut off at bottom").
const reiContainerStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 48,    // clears header bar; PNG's transparent top margin provides hat clearance
  bottom: 0,
  width: '32%',
  // GROUNDING (Tim 2026-06-03 "characters are still floating"): a soft cast
  // shadow on the WHOLE figure (container, not the masked wrapper, so the shadow
  // is never clipped by the feet feather). This is what stops the cutout reading
  // as a pasted sticker — a lit figure throws a shadow onto the storm deck.
  // Cool-neutral dark to match the overcast storm-coast key light. ZERO cyan
  // (rgb 12,16,24 → g/b both < 180, passes the cyan gate). Pairs with the
  // contact-shadow ellipse (feet) for a planted read.
  filter: 'drop-shadow(0px 7px 16px rgba(12,16,24,0.50))',
  // z-5 (Tim #103, 2026-06-03): the canvas now has a FRONT tile layer at z-4, so
  // Rei must sit ABOVE it (z-5) to stay in front of the board. (Was z-3 when the
  // canvas was a single z-2 layer.) The midground dragon is z-3.
  zIndex: 5,
  pointerEvents: 'none',
}

// Ground-contact shadow: a very soft, wide ellipse pooled under Rei's feet.
// Active-board: kept subtle (opacity effectively ~0.22 via gradient stops) so it
// does NOT read as a separate dark blob on the dark deck — just barely grounds
// her weight. The gradient stops themselves are low (0.22 / 0.10) to prevent
// the "odd dark shape" artefact Tim flagged on 2026-06-02.
// Lobby-only amplification is done via the isLobby conditional in JSX (below).
// Zero cyan; pointer-events none.
const reiContactShadowStyle: CSSProperties = {
  position: 'absolute',
  bottom: 4,
  left: '50%',
  transform: 'translateX(-50%)',
  width: '80%',      // wider + flatter ellipse = more diffuse, less blob-like
  height: 14,
  borderRadius: '50%',
  background:
    'radial-gradient(ellipse at 50% 50%, rgba(10,8,6,0.22) 0%, rgba(10,8,6,0.10) 50%, rgba(0,0,0,0) 82%)',
  pointerEvents: 'none',
  zIndex: 0,
}

const reiImageWrapperStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  transition: 'opacity 400ms ease',
  // Pivot from her feet so the upper body sways while feet stay grounded.
  transformOrigin: 'bottom left',
  // Bottom feather: dissolves Rei's feet into the shore-mist.
  // 2026-06-02: pulled back from 18% → 11% so far less of her body is eaten.
  // At 18% the feather reached her knees on many viewport heights — Tim flagged
  // as "cut off at bottom". At 11% only the very base of her feet dissolves;
  // the rest of her figure reads fully solid. The 4%@0.45 mid-stop keeps a
  // gentle onset (not an abrupt hard edge at the feet).
  WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 4%, rgba(0,0,0,1) 11%)',
  maskImage: 'linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,0.45) 4%, rgba(0,0,0,1) 11%)',
}

/**
 * Rei image: fills 100% of her container.
 * objectFit 'contain' preserves aspect ratio (CONTAINMENT LAW: never clips figure).
 * objectPosition 'bottom center' anchors feet at container bottom; the 18%
 * transparent top margin provides natural hat clearance without any pixel clipping.
 */
const reiImageStyle: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  height: '100%',
  width: '100%',
  objectFit: 'contain',
  objectPosition: 'bottom center',
}

/**
 * Talisman flutter hint -- a CSS rotate oscillation on the hat-talisman zone.
 * NOT a particle system. Active spin phase only.
 */
const talismanFlutterStyle: CSSProperties = {
  position: 'absolute',
  top: '8%',
  left: '48%',
  width: '6px',
  height: '18px',
  borderRadius: '2px',
  background: 'rgba(232,223,200,0.22)',
  transformOrigin: 'top center',
  animation: 'talismanFlutter 1.2s ease-in-out infinite alternate',
}

/**
 * CSS keyframes: idle sway + talisman flutter.
 * Responsive overrides for spirit container and Rei container.
 *
 * CONTAINMENT LAW enforced throughout ALL 5 media queries:
 *   - NO negative right/top/left/bottom on any spirit or Rei container
 *   - NO height > 100% on the spirit container (portrait orientation exception: 52%)
 *   - Spirit looms via width growth + mask, never via overscan
 *
 * Portrait Triad mode (@media orientation:portrait):
 *   Spirit owns the upper sky zone (height: 52% is a zone allocation, not overscan).
 *   Rei owns the ground zone (bottom-left, full opacity).
 *   Board owns the mid zone. Three clear zones, no overlap or z-fighting.
 *
 * prefers-reduced-motion: freeze all transforms. Mask/sizing overrides are
 * static (not animations) -- they remain active regardless.
 */
const REI_ANIMATION_KEYFRAMES = `
@keyframes reiIdleSway {
  from {
    transform: rotate(-0.5deg);
  }
  to {
    transform: rotate(0.5deg);
  }
}
@keyframes talismanFlutter {
  from { transform: rotate(-8deg); }
  to   { transform: rotate(8deg); }
}

/* xs (<=480px): Portrait Triad mode.
   Spirit looms in the upper-CENTRE gap above the board, IN-FRAME. Rei fully
   visible bottom-left. CONTAINMENT LAW v4: BOARD-CENTRED (left:50% + translateX),
   top:0, NO negative offsets, height:100%.
   Spirit width 58% so objectFit:contain keeps the full figure in-frame.
   Mask: large ellipse centred (50%) over the contained figure, feathers all edges.
   Mobile is preserved: the dragon still reads large in the gap above the board;
   only its horizontal anchor moved from right to centre. */
@media (max-width: 480px) {
  /* Hide the IN-GAME Rei on phones (Tim 2026-06-04: cramped + out of place at
     the bottom-left on portrait). The LOBBY hero (.is-lobby) stays — she is the
     centerpiece of the lobby and is sized for it. Only the non-lobby (board)
     instance is suppressed. */
  .oo-rei-character-container:not(.is-lobby) {
    display: none !important;
  }
  .oo-rei-character-container {
    left: 0 !important;        /* CONTAINMENT: was -10% (violation) */
    width: 28% !important;
    opacity: 1 !important;     /* Full presence -- she is NOT a ghost */
    top: 48px !important;
  }
  .oo-rei-spirit-container {
    width: 58% !important;     /* full figure in-frame, board-centred */
    left: 50% !important;      /* CONTAINMENT v4: board-centred, not right-pinned */
    transform: translateX(-50%) !important;
    top: 0 !important;         /* CONTAINMENT: ZERO, no overscan */
    height: 100% !important;   /* CONTAINMENT: never exceeds parent */
    opacity: inherit !important;
    -webkit-mask-image: radial-gradient(ellipse 84% 80% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.85) 44%,
      rgba(0,0,0,0.55) 60%,
      rgba(0,0,0,0.20) 76%,
      rgba(0,0,0,0) 93%
    ) !important;
    mask-image: radial-gradient(ellipse 84% 80% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.85) 44%,
      rgba(0,0,0,0.55) 60%,
      rgba(0,0,0,0.20) 76%,
      rgba(0,0,0,0) 93%
    ) !important;
  }
}

/* sm (481-767px): Portrait Triad, slightly wider.
   Spirit looms in the upper-CENTRE over the board; Rei full-figure bottom-left.
   CONTAINMENT LAW v4: BOARD-CENTRED (left:50% + translateX), top:0, height:100%.
   Mask: large centred (50%) ellipse feathers all edges -- no hard clip. */
@media (min-width: 481px) and (max-width: 767px) {
  .oo-rei-character-container {
    left: 0 !important;        /* CONTAINMENT: was -4% (violation) */
    width: 30% !important;
    opacity: 1 !important;
    top: 48px !important;
  }
  .oo-rei-spirit-container {
    width: 64% !important;     /* full figure in-frame, board-centred, no hard clip */
    left: 50% !important;      /* CONTAINMENT v4: board-centred */
    transform: translateX(-50%) !important;
    top: 0 !important;
    height: 100% !important;
    -webkit-mask-image: radial-gradient(ellipse 84% 82% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 30%,
      rgba(0,0,0,0.88) 46%,
      rgba(0,0,0,0.58) 62%,
      rgba(0,0,0,0.22) 78%,
      rgba(0,0,0,0) 94%
    ) !important;
    mask-image: radial-gradient(ellipse 84% 82% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 30%,
      rgba(0,0,0,0.88) 46%,
      rgba(0,0,0,0.58) 62%,
      rgba(0,0,0,0.22) 78%,
      rgba(0,0,0,0) 94%
    ) !important;
  }
}

/* md (768-1023px): Landscape tablet. Three-body composition.
   Spirit looms large over the board TOP-CENTRE, fully in-frame. Large mask
   feathers all edges; the bottom dissolves into the board behind the reels.
   CONTAINMENT LAW v4: BOARD-CENTRED (left:50% + translateX), top:0, height:100%.
   Width 74%: a strong looming boss presence over the board, mask feathers all sides. */
@media (min-width: 768px) and (max-width: 1023px) {
  .oo-rei-spirit-container {
    width: 74% !important;       /* strong loom, full containment */
    left: 50% !important;        /* CONTAINMENT v4: board-centred */
    transform: translateX(-50%) !important;
    top: 0 !important;
    height: 100% !important;
    -webkit-mask-image: radial-gradient(ellipse 84% 82% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.88) 44%,
      rgba(0,0,0,0.58) 60%,
      rgba(0,0,0,0.22) 76%,
      rgba(0,0,0,0) 94%
    ) !important;
    mask-image: radial-gradient(ellipse 84% 82% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.88) 44%,
      rgba(0,0,0,0.58) 60%,
      rgba(0,0,0,0.22) 76%,
      rgba(0,0,0,0) 94%
    ) !important;
  }
  .oo-rei-character-container {
    /* width is driven INLINE from boardRect.x (the left margin) so Rei scales
       with the gap and never overruns the board — see reiBoundWidth. */
    left: 0 !important;
    top: 44px !important;  /* desktop header is ~44px */
  }
}

/* lg (1024-1279px): Desktop. Spirit looms over the board TOP-CENTRE, fully in-frame.
   CONTAINMENT LAW v4: BOARD-CENTRED (left:50% + translateX), top:0, height:100%.
   Width 70%: board-relative loom (Rei owns 36% on the left); mask feathers all
   sides; bottom dissolves into the board, no hard clip. */
@media (min-width: 1024px) and (max-width: 1279px) {
  .oo-rei-spirit-container {
    width: 70% !important;       /* board-relative loom, full containment */
    left: 50% !important;        /* CONTAINMENT v4: board-centred */
    transform: translateX(-50%) !important;
    top: 0 !important;
    height: 100% !important;
    -webkit-mask-image: radial-gradient(ellipse 84% 82% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.88) 44%,
      rgba(0,0,0,0.58) 60%,
      rgba(0,0,0,0.22) 76%,
      rgba(0,0,0,0) 94%
    ) !important;
    mask-image: radial-gradient(ellipse 84% 82% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.88) 44%,
      rgba(0,0,0,0.58) 60%,
      rgba(0,0,0,0.22) 76%,
      rgba(0,0,0,0) 94%
    ) !important;
  }
  .oo-rei-character-container {
    /* width driven INLINE from boardRect.x (reiBoundWidth) — board-relative. */
    left: 0 !important;
    top: 44px !important;
  }
}

/* xl (>=1280px): Wide desktop. Spirit looms over the board TOP-CENTRE, fully in-frame.
   Width 72%: a board-relative boss loom (Rei owns 38% on the left); the figure
   stays centred over the board midpoint, large mask feathers all edges, the
   bottom dissolves into the board.
   CONTAINMENT LAW v4: BOARD-CENTRED (left:50% + translateX), top:0, height:100%. */
@media (min-width: 1280px) {
  .oo-rei-spirit-container {
    width: 72% !important;       /* board-relative loom, full containment */
    left: 50% !important;        /* CONTAINMENT v4: board-centred */
    transform: translateX(-50%) !important;
    top: 0 !important;
    height: 100% !important;
    -webkit-mask-image: radial-gradient(ellipse 84% 82% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.88) 44%,
      rgba(0,0,0,0.58) 60%,
      rgba(0,0,0,0.22) 76%,
      rgba(0,0,0,0) 94%
    ) !important;
    mask-image: radial-gradient(ellipse 84% 82% at 50% 34%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.88) 44%,
      rgba(0,0,0,0.58) 60%,
      rgba(0,0,0,0.22) 76%,
      rgba(0,0,0,0) 94%
    ) !important;
  }
  .oo-rei-character-container {
    /* width driven INLINE from boardRect.x (reiBoundWidth) — board-relative. */
    left: 0 !important;
    top: 44px !important;
  }
}

/* Portrait Triad: fires at any width when viewport is taller than wide.
   Catches portrait phones (390x844), portrait iPad (834x1194).
   Spirit owns the upper sky CENTRE (~52% zone) — the gap above the board. Board
   owns mid. Rei owns ground. height:52% is a ZONE ALLOCATION (upper sky), NOT an
   overscan -- the figure is fully contained within its 52% zone; the mask
   feathers all edges. The dragon now looms CENTRED in the gap above the board
   (Tim 2026-06-02), preserving the existing big-dragon-in-the-gap mobile read —
   only its horizontal anchor moved from right to centre.
   Width 64%: full containment, board-centred.
   CONTAINMENT LAW v4: left:50% + translateX, top:0, NO negative offsets. */
@media (orientation: portrait) {
  .oo-rei-spirit-container {
    width: 64% !important;     /* full containment, board-centred */
    left: 50% !important;      /* CONTAINMENT v4: board-centred */
    transform: translateX(-50%) !important;
    top: 0 !important;
    height: 52% !important;    /* Zone allocation: spirit owns upper sky. NOT overscan. */
    -webkit-mask-image: radial-gradient(ellipse 84% 80% at 50% 36%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.86) 44%,
      rgba(0,0,0,0.55) 60%,
      rgba(0,0,0,0.18) 76%,
      rgba(0,0,0,0) 94%
    ) !important;
    mask-image: radial-gradient(ellipse 84% 80% at 50% 36%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.86) 44%,
      rgba(0,0,0,0.55) 60%,
      rgba(0,0,0,0.18) 76%,
      rgba(0,0,0,0) 94%
    ) !important;
  }
  .oo-rei-character-container {
    left: 0 !important;
    width: 30% !important;
    top: 48px !important;
    opacity: 1 !important;  /* Full opacity -- Rei is present in portrait triad */
  }
}

/* Portrait Triad -- iPad portrait (md portrait: 768-1023px portrait).
   Spirit looms CENTRED in the upper-half gap above the board (zone allocation).
   CONTAINMENT LAW v4: left:50% + translateX, top:0, height:50% (zone, not overscan). */
@media (min-width: 768px) and (max-width: 1023px) and (orientation: portrait) {
  .oo-rei-spirit-container {
    width: 70% !important;   /* full containment, board-centred */
    height: 50% !important;  /* spirit in upper half -- zone allocation, not overscan */
    left: 50% !important;    /* CONTAINMENT v4: board-centred */
    transform: translateX(-50%) !important;
    top: 0 !important;
  }
  .oo-rei-character-container {
    width: 32% !important;
    left: 0 !important;
    top: 44px !important;
  }
}

/* ── LOBBY HERO FRAMING (Tim 2026-06-01 "fix the lobby - REI looks bad") ──────
   In the lobby, Rei should DOMINATE — she is the hero of "The Myth of REI",
   not a small figure lost in an empty storm sky. Enlarging her container width
   (objectFit:contain keeps aspect ratio + objectPosition:bottom center keeps
   feet grounded) lifts her face + ofuda-straw-hat into the upper third, so the
   storm becomes HER backdrop (Ghost-of-Tsushima hero composition).

   These .oo-rei-character-container.is-lobby rules use a TWO-CLASS selector so
   they out-specify every single-class .oo-rei-character-container width rule
   above, regardless of media-query source order. Only WIDTH changes — the
   committed grounding (contact shadow, 18% feet feather, no glow rim,
   objectFit:contain) is untouched. No sky particles. transform/opacity/mask are
   the only animated properties anywhere in this component (width is static here,
   not animated). CONTAINMENT LAW holds: left:0, objectFit:contain, no overscan.
   Widths (Tim 2026-06-01: desktop Rei was still too small — the lobby board is
   hidden, so she is the sole focal figure and must read as a HERO on the left,
   with the narrative card + CTA in her right-side negative space at left:44%):
   ~56% xs(≤480) → ~50% base → ~48% md(≥768) → ~44% lg(≥1024). All comfortably
   larger than the 32% active-board size; the card column begins at 44% so no
   overlap. CONTAINMENT LAW holds (left:0, objectFit:contain, no overscan). */
.oo-rei-character-container.is-lobby {
  width: 50% !important;   /* base (481–767px) */
}
@media (max-width: 480px) {
  .oo-rei-character-container.is-lobby {
    width: 56% !important;  /* xs portrait: hero scale, face into upper third */
  }
}
@media (min-width: 768px) {
  .oo-rei-character-container.is-lobby {
    width: 48% !important;  /* md tablet/landscape hero */
  }
}
@media (min-width: 1024px) {
  .oo-rei-character-container.is-lobby {
    width: 44% !important;  /* lg+ desktop: Rei fills the left, card sits right */
  }
}

/* ── LOBBY SPIRIT — subtle atmospheric storm-dragon (Tim 2026-06-02 Fix 2) ────
   The recent in-game spirit treatment (board-CENTRED loom + raised opacity floor)
   ALSO hit the lobby and read as a "big, dead-centre, pasted-looking mass" that
   competed with Rei + the storm vista. The lobby is now ISOLATED from the in-game
   treatment: the dragon is pushed to the UPPER-RIGHT third of the sky, scaled
   smaller, and biased high so it integrates as part of the storm vista BEHIND
   Rei (who owns the left as the hero, z-3) — never a centred competing object.

   These .oo-rei-spirit-container.is-lobby rules use a TWO-CLASS selector so they
   out-specify every single-class .oo-rei-spirit-container rule above, regardless
   of media-query source order. The container opacity (OO_REI_LOBBY_SPIRIT_OPACITY
   ~0.34) + the JS-side blend.opacity × 0.62 + 'right top' objectPosition keep it
   faint and upper-right. The soft mask still feathers all edges (no hard rect).
   CONTAINMENT LAW holds: top:0, height:100%, no negative offsets. Zero cyan;
   transform/opacity/mask only (width/left are static here, not animated). */
.oo-rei-spirit-container.is-lobby {
  /* Pin the dragon's frame to the RIGHT half of the sky (left:46% start), so its
     mass lands upper-right of Rei rather than dead-centre. No translateX centring
     — that is what produced the dead-centre mass. Narrower so it reads as sky
     atmosphere, not a foreground figure. */
  left: 46% !important;
  transform: none !important;
  width: 50% !important;
  top: 0 !important;
  height: 100% !important;
  /* Mask biased high + right so the contained figure feathers into the storm sky;
     bottom dissolves earliest so the dragon melts into the horizon behind Rei. */
  -webkit-mask-image: radial-gradient(ellipse 80% 70% at 64% 26%,
    rgba(0,0,0,1) 0%,
    rgba(0,0,0,1) 24%,
    rgba(0,0,0,0.78) 44%,
    rgba(0,0,0,0.42) 60%,
    rgba(0,0,0,0.14) 76%,
    rgba(0,0,0,0) 92%
  ) !important;
  mask-image: radial-gradient(ellipse 80% 70% at 64% 26%,
    rgba(0,0,0,1) 0%,
    rgba(0,0,0,1) 24%,
    rgba(0,0,0,0.78) 44%,
    rgba(0,0,0,0.42) 60%,
    rgba(0,0,0,0.14) 76%,
    rgba(0,0,0,0) 92%
  ) !important;
}
/* xs portrait: keep the dragon high in the sky strip above Rei; a touch wider so
   it still reads, but biased to the upper-right and low opacity. */
@media (max-width: 480px) {
  .oo-rei-spirit-container.is-lobby {
    left: 40% !important;
    width: 58% !important;
    height: 56% !important;  /* upper sky strip only — Rei owns the ground */
  }
}
/* lg+ desktop: pull the dragon further right + slightly smaller so the centre
   sky stays clean for the narrative card column, with Rei the clear hero. */
@media (min-width: 1024px) {
  .oo-rei-spirit-container.is-lobby {
    left: 50% !important;
    width: 46% !important;
  }
}

/* ── IN-GAME BOARD LOOM (Tim #93/#94/#95, 2026-06-02) ─────────────────────────
   The looming spirit on the active board. REPLACES the retired in-canvas band
   dragon (which read faint on desktop — the dark-on-dark band trap). The head
   crests the board's TOP-RIGHT against the storm sky (the lighter ground, where
   a pale dragon finally reads BOLD), and the body coils DOWN behind the right
   columns — naturally occluded by the opaque board panel of the z-2 canvas. That
   occlusion IS the depth-weave (#94/#95): head in front of the sky, body behind
   the reels, no in-canvas masking needed.

   Two-class selector (.oo-rei-spirit-container.is-ingame-loom) out-specifies the
   single-class media rules above. Default = LANDSCAPE/DESKTOP upper-right loom.
   Portrait phones override back to the centred upper-sky gap (the composition
   that already reads on the tall mobile layout). CONTAINMENT LAW holds: top:0,
   height:100%, no negative offsets, soft mask feathers every edge. Zero cyan;
   only opacity is animated (width/left/mask are static here). */
.oo-rei-spirit-container.is-ingame-loom {
  /* Pin the frame to the RIGHT half so the head mass lands over the board's
     top-right + the right margin sky; 'right top' objectPosition (set in JSX)
     seats the head high-right. No translateX centring. */
  left: 40% !important;
  transform: none !important;
  width: 62% !important;
  top: 0 !important;
  height: 100% !important;
  /* Mask biased HIGH + RIGHT: opaque over the head/mane, feathering the lower
     body so it dissolves DOWN into the board behind the reels (no hard cut). */
  -webkit-mask-image: radial-gradient(ellipse 86% 80% at 64% 30%,
    rgba(0,0,0,1) 0%,
    rgba(0,0,0,1) 30%,
    rgba(0,0,0,0.86) 46%,
    rgba(0,0,0,0.52) 62%,
    rgba(0,0,0,0.18) 78%,
    rgba(0,0,0,0) 94%
  ) !important;
  mask-image: radial-gradient(ellipse 86% 80% at 64% 30%,
    rgba(0,0,0,1) 0%,
    rgba(0,0,0,1) 30%,
    rgba(0,0,0,0.86) 46%,
    rgba(0,0,0,0.52) 62%,
    rgba(0,0,0,0.18) 78%,
    rgba(0,0,0,0) 94%
  ) !important;
}
/* lg+ desktop: pull a touch further right + slightly larger so the head reads
   as a looming boss over the board's top-right corner, body down the right edge. */
@media (min-width: 1024px) {
  .oo-rei-spirit-container.is-ingame-loom {
    left: 44% !important;
    width: 60% !important;
  }
}
/* Portrait phones/tablets: revert to the centred upper-sky gap above the board —
   the narrow tall layout reads best with the head looming centre-top (the body
   feathers down into the board). Zone allocation (height 56%), not overscan. */
@media (orientation: portrait) {
  .oo-rei-spirit-container.is-ingame-loom {
    left: 50% !important;
    transform: translateX(-50%) !important;
    width: 70% !important;
    height: 56% !important;
    -webkit-mask-image: radial-gradient(ellipse 84% 80% at 50% 32%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.86) 44%,
      rgba(0,0,0,0.55) 60%,
      rgba(0,0,0,0.18) 76%,
      rgba(0,0,0,0) 93%
    ) !important;
    mask-image: radial-gradient(ellipse 84% 80% at 50% 32%,
      rgba(0,0,0,1) 0%,
      rgba(0,0,0,1) 28%,
      rgba(0,0,0,0.86) 44%,
      rgba(0,0,0,0.55) 60%,
      rgba(0,0,0,0.18) 76%,
      rgba(0,0,0,0) 93%
    ) !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  @keyframes reiIdleSway {
    from, to { transform: none; }
  }
  @keyframes talismanFlutter {
    from, to { transform: none; }
  }
}
`

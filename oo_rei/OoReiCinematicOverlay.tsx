'use client'

/**
 * OoReiCinematicOverlay — Azuki-register anime cinematic overlay system.
 *
 * 4 named tier moments. Dual-character split-screen clash reveals.
 * Rei (left) vs spirit-monster (right), meeting at center with a bold
 * kanji impact-frame. Pure CSS keyframe animations, no particles.
 *
 * Reference: OO-REI-AZUKI-CINEMATIC-OVERLAYS-2026-05-28.md
 *
 * Z-layer: z-5 (above the receipt panel at z-4, below nothing).
 *
 * Architecture:
 *   - Module-const durations from ooReiSignatures.ts — never runtime-scaled
 *   - CSS keyframes only: slideInLeft, slideInRight, impactFrameHold, cameraPullBack
 *   - Asset fallback: onError swaps to CSS-styled placeholder silhouette
 *   - prefers-reduced-motion: all sliding becomes instant opacity cross-fade
 *   - onComplete called after the tier duration to advance the phase state machine
 *
 * RG compliance:
 *   - RG-C5 structural: BIG WIN always shows 1500ms, MEGA WIN always 2500ms.
 *     No amplitude, duration, or visual intensity scaling per session/streak.
 *   - ZERO cyan. ZERO particles. Composition sweep is the motion.
 *   - Loss state: component returns null (caller never passes a losing tier).
 *
 * Anime Cinematic palette (matches OoReiExperience.tsx):
 *   - amberAccent #d4892a  (leading anchor)
 *   - talismanGlow #f4a73e
 *   - talismanPaper #e8dfc8
 *   - stormPurple #2d2438
 *   - bgCanvas #1a1612
 *   - vermillion #c0392b  (kanji impact color — from spec)
 *
 * Domain C: presentation only. No financial math.
 */

import {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  BIG_WIN_OVERLAY_MS,
  BRUSH_SWEEP_MS,
  CLASH_HOLD_BIG_MS,
  CLASH_HOLD_MEGA_MS,
  CLASH_HOLD_SPIRIT_TRIGGER_MS,
  type CinematicTier,
  GOOD_WIN_OVERLAY_MS,
  KANJI_BLOOM_MS,
  KANJI_SETTLE_MS,
  MEGA_WIN_OVERLAY_MS,
  SPEED_LINE_DRAW_MS,
  SPEED_LINE_HOLD_MS,
  SPEED_LINES,
  type SpeedLineSpec,
  SPIRIT_BONUS_FINALE_MS,
  SPIRIT_BONUS_TRIGGER_OVERLAY_MS,
  SPIRIT_FORM_1_OVERLAY_MS,
  SPIRIT_FORM_2_OVERLAY_MS,
  SPIRIT_FORM_3_OVERLAY_MS,
  SPIRIT_FORM_4_OVERLAY_MS,
  ZOOM_PUNCH_MS,
} from './ooReiSignatures'
import { SPIRIT_FORM_OPACITY } from './ooReiSpiritEvolution'
import {
  INK_FILTER_SVG_DEFS,
  InkNumber,
} from './ooReiInkNumber'

// ─── RG-C5 module-level constants (tier-identical — never scaled by session or win magnitude) ──

/**
 * Duration of the multiplier figure fade-in during the PULL-OUT phase.
 * Module-level `as const` per swoobz-rg-c5-structural: this value is IDENTICAL
 * for every cinematic tier — BIG WIN and MEGA WIN share the same reveal duration.
 * Only the NUMBER differs; magnitude is never communicated through timing.
 */
const MULTIPLIER_REVEAL_MS = 200 as const
// The won-multiplier figure COUNTS UP from 0 to its settled value when the
// pull-out begins (Tim 2026-05-30: "that winning number should be animated upwards
// toward the settled number"). RG-C5: fixed duration for every tier — a bigger win
// counts faster within the same window; the NUMBER tells the magnitude, not the timing.
const MULTIPLIER_COUNT_UP_MS = 1200 as const

/**
 * Count the won-multiplier figure UP from 0 to its settled BPS value over
 * MULTIPLIER_COUNT_UP_MS once `active` (the pull-out phase) begins. easeOutCubic.
 * reduced-motion jumps straight to the settled value. BPS stays in Number range
 * for display interpolation only (never re-enters Domain-A math).
 */
function useCountUpBps(targetBps: bigint | null, active: boolean, reducedMotion: boolean): bigint {
  const [displayBps, setDisplayBps] = useState<bigint>(targetBps ?? 0n)
  const rafRef = useRef(0)
  useEffect(() => {
    if (targetBps == null) { setDisplayBps(0n); return undefined }
    if (!active || reducedMotion) { setDisplayBps(targetBps); return undefined }
    const target = Number(targetBps)
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MULTIPLIER_COUNT_UP_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayBps(BigInt(Math.round(target * eased)))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [targetBps, active, reducedMotion])
  return displayBps
}

/**
 * Font size (px) of the won-multiplier figure in the PULL-OUT phase for tiers
 * that do not specify a per-tier fontPx (i.e. spirit tiers, good tier).
 * BIG WIN and MEGA WIN override this via TierConfig.fontPx per the Design Bible §4.5.
 * Module-level `as const` per swoobz-rg-c5-structural — only the tier-config value
 * changes per tier; this const is the fallback, not the headline tier value.
 */
const MULTIPLIER_FONT_PX = 48 as const

/**
 * Viewport breakpoint (px) below which mobile multiplier font sizes apply.
 * Matches the OO-REI mobile breakpoint (< 481px).
 * Domain C presentation only — no financial math.
 */
const MOBILE_BREAKPOINT_PX = 481 as const

// ─── Props ────────────────────────────────────────────────────────────────────

interface OoReiCinematicOverlayProps {
  /** Which cinematic moment to show, or null/none/nice to render nothing (canvas-only tiers). */
  readonly tier: CinematicTier | null
  /** Called after the overlay's full duration completes. Advances the phase SM. */
  readonly onComplete: () => void
  /**
   * Called at the exact moment the IMPACT-HOLD phase begins (after approach).
   * The caller should fire the cinematic audio stinger here so the audio peak
   * lands within ≤80ms of the visual impact frame (ufotable/MAPPA sync rule).
   * Fires once per overlay mount. Optional — omit when no audio is needed
   * (e.g. 'good' tier whisper beat, spirit form-change overlays).
   */
  readonly onImpactHoldStart?: () => void
  /**
   * Won multiplier in BPS to display during the PULL-OUT phase.
   * Pass the economic win BPS (totalWinLamports / wagerLamports * 10_000n) for
   * 'big' and 'mega' base-game tiers only.
   * Pass null (or omit) for: 'good' tier (sub-2x whisper), spirit-trigger,
   * spirit-finale, spirit-form-*, and any dev-forced tier with no economic win.
   * Rendered as formatted string via formatMultiplier (e.g. "20.00x") ONLY during
   * phase === 'pullout'. ZERO juice on loss-state (null → nothing renders, RG-C1).
   * Font size: MULTIPLIER_FONT_PX (48px) — same for every tier (RG-C5).
   * Reveal duration: MULTIPLIER_REVEAL_MS (200ms) — same for every tier (RG-C5).
   */
  readonly winMultiplierBps?: bigint | null
  /**
   * DEV-ONLY — called each time the internal phase state machine advances.
   * Used by the animation playground to drive the phase HUD overlay.
   * Safe to pass in production (no-ops when undefined). Does NOT affect
   * any game logic — purely observational.
   * Phase values: 'entering' | 'impact' | 'kinetic' | 'pullout' | 'exiting'
   */
  readonly onPhaseChange?: (phase: string) => void
  /**
   * The active region id (e.g. 'storm-coast'). Selects which region's spirit
   * appears as the duel opponent in the full-screen battle scene. Display-only —
   * cosmetic. The cinematic fires at the same BPS thresholds regardless. Null →
   * the generic spirit (graceful fallback).
   */
  readonly activeRegionId?: string | null
}

// ─── Palette (Anime Cinematic — no cyan) ─────────────────────────────────────

const C = {
  bgCanvas: '#1a1612',
  stormPurple: '#2d2438',
  amberAccent: '#d4892a',
  talismanGlow: '#f4a73e',
  talismanPaper: '#e8dfc8',
  vermillion: '#c0392b',
  vermillionLight: '#e05240',
  charcoal: '#1a1820',
  cream: '#f0e8d0',
  fontMono: '"Geist Mono", ui-monospace, monospace',
  /** CJK display face for kanji fallback glyphs. Matches T.fontKanji in OoReiExperience. */
  fontSerifKanji: '"Noto Serif JP", "Yu Mincho", serif',
} as const

// ─── Asset paths ──────────────────────────────────────────────────────────────
// Spec filenames from OO-REI-AZUKI-CINEMATIC-OVERLAYS-2026-05-28.md §Asset commissioning.
// asset-curator is generating these in parallel. The component MUST NOT crash
// if they are missing — onError swaps to CSS placeholder silhouettes.

const ASSET_BASE = '/assets/generated/oo-rei/cinematic'
// spirit-shadow-loom.png lives in the parent oo-rei assets dir, not the cinematic subdir.
// It is used as the faint spirit ghost at 0.15 opacity for the 'good' tier whisper beat.
const SPIRIT_SHADOW_LOOM_PATH = '/assets/generated/oo-rei/spirit-shadow-loom.png'

// Win calligraphy PNGs — used as hero background for big/mega tiers (spec B 2026-05-29).
// art-director: replace the dual split-screen with calligraphy-dominant veil + edge silhouettes.
const WIN_CALLIGRAPHY_BASE = '/assets/generated/oo-rei/win-calligraphy'
const WIN_CALLIGRAPHY_ASSETS = {
  bigWin:  `${WIN_CALLIGRAPHY_BASE}/kanji-daisho-big-win.png`,   // 大勝
  megaWin: `${WIN_CALLIGRAPHY_BASE}/kanji-shinsho-god-win.png`,  // 神勝
} as const

const ASSETS = {
  reiProfile: `${ASSET_BASE}/rei-keyframe-profile-talisman-raised.png`,
  reiWarrior: `${ASSET_BASE}/rei-keyframe-warrior-pose-forward.png`,
  reiMidStride: `${ASSET_BASE}/rei-keyframe-mid-stride-procession.png`,
  reiBow: `${ASSET_BASE}/rei-keyframe-bow-talisman-lowered.png`,
  spiritLoom: `${ASSET_BASE}/spirit-monster-keyframe-profile-looming.png`,
  spiritClash: `${ASSET_BASE}/spirit-monster-keyframe-clash-forward.png`,
  spiritOmen: `${ASSET_BASE}/spirit-monster-keyframe-omen-emergence.png`,
  spiritThunderstrike: `${ASSET_BASE}/spirit-monster-keyframe-thunderstrike.png`,
  spiritMidStride: `${ASSET_BASE}/spirit-monster-keyframe-mid-stride.png`,
  spiritBow: `${ASSET_BASE}/spirit-monster-keyframe-bow.png`,
  kanjiDaiSho: `${ASSET_BASE}/impact-kanji-dai-sho.png`,
  kanjiShinSho: `${ASSET_BASE}/impact-kanji-shin-sho.png`,
  kanjiReiYadoru: `${ASSET_BASE}/impact-kanji-rei-yadoru.png`,
  kanjiReiKo: `${ASSET_BASE}/impact-kanji-rei-ko.png`,
  brushstrokeSweep: `${ASSET_BASE}/impact-brushstroke-clash-sweep.png`,
} as const

// ─── Full-screen 1v1 battle scene (Tim 2026-05-30) ───────────────────────────
// Replaces the old side-by-side "two characters standing apart" sprites with a
// full-frame duel: REI vs the shadow-spirit across three beats (FACE-OFF → CLASH
// → SEAL), landscape for a wide canvas + portrait for a narrow one. The beat is
// chosen by the PHASE, and how far the duel progresses scales by the win TIER
// (RG-C5: a 20x and a 660x both get the full MEGA arc — the number tells the rest).
type CinematicPhase = 'entering' | 'impact' | 'kinetic' | 'pullout' | 'exiting'

const BATTLE_BASE = '/assets/generated/oo-rei/cinematic/battle'

// Blueprint Fix 4 (2026-05-30): per-tier BATTLE_ART subdirectory map.
// CURRENT WAVE: all tier keys point at the EXISTING shared files (no 404s).
// A separate later wave will generate and wire distinct per-tier fal art when
// the per-tier subdirectories (big/, mega/, spirit-trigger/, spirit-finale/)
// exist under BATTLE_BASE. Until then, every tier inherits the shared art.
type BattleTierKey = 'good' | 'big' | 'mega' | 'spirit-trigger' | 'spirit-finale'

interface BattleArtPaths {
  readonly faceoffLand: string
  readonly faceoffPort: string
  readonly clashLand: string
  readonly clashPort: string
  readonly sealLand: string
  readonly sealPort: string
}

// Shared fallback paths — the six existing battle PNGs that ship today.
const BATTLE_ART_SHARED: BattleArtPaths = {
  faceoffLand: `${BATTLE_BASE}/faceoff-land.png`,
  faceoffPort: `${BATTLE_BASE}/faceoff-port.png`,
  clashLand: `${BATTLE_BASE}/clash-land.png`,
  clashPort: `${BATTLE_BASE}/clash-port.png`,
  sealLand: `${BATTLE_BASE}/seal-land.png`,
  sealPort: `${BATTLE_BASE}/seal-port.png`,
}

// Per-tier art factory — each tier reads its OWN subdirectory of distinct fal art
// (faceoff/clash/seal beats, landscape + portrait). Generated 2026-05-30; this
// ends the reused-artwork issue — BIG = face-off, MEGA = clash detonation,
// spirit tiers = emergence/finale, each visually distinct.
const battleArtFor = (sub: string): BattleArtPaths => ({
  faceoffLand: `${BATTLE_BASE}/${sub}/faceoff-land.png`,
  faceoffPort: `${BATTLE_BASE}/${sub}/faceoff-port.png`,
  clashLand: `${BATTLE_BASE}/${sub}/clash-land.png`,
  clashPort: `${BATTLE_BASE}/${sub}/clash-port.png`,
  sealLand: `${BATTLE_BASE}/${sub}/seal-land.png`,
  sealPort: `${BATTLE_BASE}/${sub}/seal-port.png`,
})

const BATTLE_ART_BY_TIER: Record<BattleTierKey, BattleArtPaths> = {
  good:            BATTLE_ART_SHARED, // 'good' skips BattleScene (skipBattleScene:true) — never reads this
  big:             battleArtFor('big'),
  mega:            battleArtFor('mega'),
  'spirit-trigger': battleArtFor('spirit-trigger'),
  'spirit-finale':  battleArtFor('spirit-finale'),
}

function tierKeyForBattle(tier: Exclude<CinematicTier, 'none' | 'nice'>): BattleTierKey {
  if (tier === 'big') return 'big'
  if (tier === 'mega' || tier === 'spirit-form-4') return 'mega'
  if (tier === 'spirit-trigger' || tier.startsWith('spirit-form-')) return 'spirit-trigger'
  if (tier === 'spirit-finale') return 'spirit-finale'
  return 'good'
}

function getBattleArt(tier: Exclude<CinematicTier, 'none' | 'nice'>): BattleArtPaths {
  return BATTLE_ART_BY_TIER[tierKeyForBattle(tier)]
}

// NOTE (Tim 2026-06-03): the region-spirit transparent-cutout overlay that used
// to composite over the FACE-OFF + SEAL beats was REMOVED. Layering a clean-edged
// PNG on top of an already-authored painted scene read as "pasted." Embedding now
// lives entirely in the painted battle scenes (the spirit emerges from the mist
// inside the art). Per-region battle paintings are the future path for region
// identity, not a floating cutout layer.

type BattleBeat = 'faceoff' | 'clash' | 'seal'

/** Which battle beat is on screen for a given phase + tier. Module-pure, fixed
 *  per tier (RG-C5). Bigger tiers traverse more of the FACE-OFF→CLASH→SEAL arc. */
function battleBeatForPhase(
  tier: Exclude<CinematicTier, 'none' | 'nice'>,
  phase: CinematicPhase,
): BattleBeat {
  const isMega = tier === 'mega' || tier === 'spirit-form-4'
  const isFinale = tier === 'spirit-finale'
  if (isFinale) {
    // The sealing finale: clash resolves into the seal.
    return phase === 'entering' ? 'clash' : 'seal'
  }
  if (phase === 'entering') return 'faceoff'
  if (phase === 'impact' || phase === 'kinetic') {
    // Form-1/2 (early evolution) linger on the looming face-off; everyone else clashes.
    return tier === 'spirit-form-1' || tier === 'spirit-form-2' ? 'faceoff' : 'clash'
  }
  // pullout / exiting: BIG/MEGA + later forms land the SEAL (you defeat the
  // spirit); GOOD + spirit-trigger + early forms hold the CLASH.
  return isMega || tier === 'big' || tier === 'spirit-form-3' ? 'seal' : 'clash'
}

const battleSceneRootStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflow: 'hidden',
  zIndex: 1,
  containerType: 'inline-size',
  pointerEvents: 'none',
}
const battleBeatLayerStyle: CSSProperties = { position: 'absolute', inset: 0 }
const battleImgStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  // 'contain' preserves the full composition so the spirit figure is never
  // hard-cropped on narrow portrait canvases. Letterbox bars fill with the
  // near-black background color below and are indistinguishable from the
  // vignette that darkens the edges. Previously 'cover' cropped the right
  // side of wide compositions on mobile portrait (e.g. 412px wide canvas).
  objectFit: 'contain',
  objectPosition: 'center 30%',
  // Near-black fill for letterbox bars; blends with the vignette overlay.
  background: 'rgb(8, 5, 2)',
  userSelect: 'none',
}
// Vignette so the calligraphy + counted number stay legible over the duel art.
const battleVignetteStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  background:
    'radial-gradient(120% 90% at 50% 42%, rgba(20,16,12,0) 38%, rgba(20,16,12,0.42) 78%, rgba(20,16,12,0.72) 100%), linear-gradient(180deg, rgba(20,16,12,0.30) 0%, rgba(20,16,12,0.05) 30%, rgba(20,16,12,0.45) 78%, rgba(20,16,12,0.82) 100%)',
}
const BATTLE_SCENE_CSS = `
.oo-rei-battle-port{display:block;}
.oo-rei-battle-land{display:none;}
@container (min-width:560px){.oo-rei-battle-port{display:none;}.oo-rei-battle-land{display:block;}}
`

interface BattleSceneProps {
  readonly tier: Exclude<CinematicTier, 'none' | 'nice'>
  readonly phase: CinematicPhase
  readonly prefersReducedMotion: boolean
}

/** The full-screen duel layer. Three beats crossfade; an authored Ken-Burns
 *  push-in runs across the phases (NOT a physics sim — one transition per phase).
 *  Container-query picks landscape vs portrait so it fills mobile + desktop.
 *  The spirit is embedded INTO each authored battle painting (it emerges from
 *  the mist) — there is NO separate composited cutout layer (Tim 2026-06-03).
 *  Blueprint Fix 4 (2026-05-30): per-tier art via getBattleArt(). */
function BattleScene({ tier, phase, prefersReducedMotion }: BattleSceneProps) {
  const activeBeat = battleBeatForPhase(tier, phase)
  // Authored push-in: rest → punch at impact → ease back during pull-out.
  const scale = prefersReducedMotion
    ? 1
    : phase === 'entering'
      ? 1.0
      : phase === 'impact' || phase === 'kinetic'
        ? 1.08
        : 1.04
  const beats: ReadonlyArray<BattleBeat> = ['faceoff', 'clash', 'seal']
  const tierArt = getBattleArt(tier)
  return (
    <div className="oo-rei-battle-cq" style={battleSceneRootStyle} aria-hidden="true">
      <style>{BATTLE_SCENE_CSS}</style>
      {beats.map((b) => {
        const land = tierArt[`${b}Land` as keyof BattleArtPaths]
        const port = tierArt[`${b}Port` as keyof BattleArtPaths]
        return (
          <div
            key={b}
            style={{
              ...battleBeatLayerStyle,
              opacity: activeBeat === b ? 1 : 0,
              transform: `scale(${scale})`,
              // QA 2026-05-30: was 320ms — the seal beat was still mid-crossfade
              // (~0.72 opacity) when the pullout number reveal began, so the duel
              // victory context arrived half-rendered under the counting number.
              // 180ms settles the beat before the number is read; the transform
              // push-in stays long for cinematic weight.
              transition: prefersReducedMotion
                ? 'none'
                : 'opacity 180ms ease-out, transform 1400ms cubic-bezier(0.16,0.84,0.28,1)',
            }}
          >
            <img className="oo-rei-battle-land" src={land} alt="" aria-hidden="true" style={battleImgStyle} draggable={false} />
            <img className="oo-rei-battle-port" src={port} alt="" aria-hidden="true" style={battleImgStyle} draggable={false} />
          </div>
        )
      })}
      {/* The authored battle paintings (faceoff/clash/seal) already embed the
          spirit INTO the storm scene (it emerges from the mist, not a cutout).
          The previous transparent region-spirit PNG composited on top of these
          read as "pasted" (Tim 2026-06-03) and is removed — embedding lives in
          the painted scene, never a second floating layer. */}
      <div style={battleVignetteStyle} />
    </div>
  )
}

// ─── Tier config ──────────────────────────────────────────────────────────────

interface TierConfig {
  readonly duration: number
  readonly reiAsset: string
  readonly spiritAsset: string
  readonly kanjiAsset: string
  readonly kanjiText: string         // fallback kanji text for CSS placeholder
  readonly kanjiSubtext: string      // romanised / English label
  /**
   * Show the vermillion brushstroke clash-sweep on this tier.
   * True for the five "true clash" tiers: big / mega / spirit-trigger /
   * spirit-finale / spirit-form-4. False for 'good' (whisper beat) and
   * spirit-form-1/2/3 (quiet progress beats).
   *
   * RG-C5: which tiers show it may differ — the SWEEP DURATION (BRUSH_SWEEP_MS)
   * is identical for all of them (module-const, never scaled).
   */
  readonly showClashBrushstroke: boolean
  readonly showCameraPullBack: boolean
  readonly impactHoldMs: number      // how long the impact frame holds
  readonly slideSpeedMs: number      // how fast characters enter from sides
  /**
   * 'good' tier whisper mode: Rei is 40% width, spirit is a faint static ghost (0.15 opacity).
   * When true: spirit does NOT slide in — it is static right-side at 0.15 opacity.
   * When false (default): full dual-character clash composition.
   */
  readonly isWhisperBeat?: boolean
  /**
   * Spirit opacity override. For 'good' tier: 0.15 (ghost hint). Default: 1.0.
   */
  readonly spiritOpacityOverride?: number
  /**
   * Rei image width as % of overlay width. For 'good' tier: 40%. Default: 45%.
   */
  readonly reiWidthPercent?: number
  /**
   * Calligraphy-veil format (spec B 2026-05-29):
   * For 'big' and 'mega' tiers — replaces the dual split-screen with a full-canvas
   * dark veil, the calligraphy PNG hero at center, and character edge silhouettes
   * (Rei at far right, spirit at far left) at low opacity.
   *
   * When true: the composition is calligraphy-dominant (ufotable principle —
   * visual spectacle dominates, characters are secondary anchors).
   * When false (default): full dual-character split-screen.
   */
  readonly isCalligraphyVeil?: boolean
  /**
   * The win calligraphy PNG path for 'isCalligraphyVeil' tiers.
   */
  readonly calligraphyAsset?: string
  /**
   * Per-tier multiplier font size in px (desktop).
   * Design Bible §4.5 / §4.6: big = 64px, mega = 80px.
   * When absent, the component falls back to MULTIPLIER_FONT_PX (48px).
   * Domain C only — no financial math. RG-C5: the VALUE communicates magnitude,
   * not the font size. The size here is the authored visual apex per tier.
   */
  readonly fontPx?: number
  /**
   * Per-tier multiplier font size in px (mobile, viewport < MOBILE_BREAKPOINT_PX).
   * Design Bible §4.5: big = 48px mobile, mega = 60px mobile.
   * When absent, fontPx (desktop) is used at all sizes.
   */
  readonly fontPxMobile?: number
  /**
   * Show the MEGA apex radial glow div on this tier.
   * Only true for 'mega'. Fires once at IMPACT-HOLD entry, holds at opacity 0.18.
   * This is NOT a particle emitter — one authored div, one authored keyframe.
   * Per game-feel-engineer anti-slop fence: one div, fires once, NOT looping.
   */
  readonly showApexRadialGlow?: boolean
  /**
   * Skip the BattleScene entirely for this tier.
   * True for 'good' tier whisper beat — no full-screen duel, just the warm amber
   * tint backdrop + static spirit ghost + 良 kanji + 900ms. The BattleScene
   * (full-canvas 1v1 duel) is reserved for BIG/MEGA/SPIRIT tiers only.
   * Blueprint Fix 1 (2026-05-30): GOOD WIN was triggering BattleScene at the same
   * visual weight as BIG WIN — this flag gates it out entirely for the whisper tier.
   */
  readonly skipBattleScene?: boolean
}

const TIER_CONFIG: Record<Exclude<CinematicTier, 'none' | 'nice'>, TierConfig> = {
  good: {
    // Blueprint Fix 1 (2026-05-30): GOOD WIN is a ~900ms WHISPER beat.
    // NO BattleScene, NO full-screen duel. Warm amber tint backdrop + static spirit
    // ghost at 0.18 opacity (right edge) + 良 kanji + label. Canvas stays visible
    // through the tint. Reserve the full clash for BIG/MEGA/SPIRIT only.
    duration: GOOD_WIN_OVERLAY_MS,   // 900ms — whisper beat
    reiAsset: ASSETS.reiProfile,
    spiritAsset: ASSETS.spiritOmen,
    kanjiAsset: ASSETS.kanjiDaiSho,
    kanjiText: '良',                  // blueprint: 良 for "good/fortunate", not 大
    // #3 FIX: OO-REI register — narrative vocab, not casino brag.
    kanjiSubtext: 'SPIRIT STIRS',
    showClashBrushstroke: false,  // whisper beat — no clash energy
    showCameraPullBack: false,
    impactHoldMs: 260,            // blueprint: 260ms (was 520)
    slideSpeedMs: 240,            // blueprint: 240ms (was 560)
    isWhisperBeat: true,
    spiritOpacityOverride: 0.18,  // blueprint: 0.18 static ghost (was 0.32)
    reiWidthPercent: 32,          // blueprint: 32% (was 40%)
    skipBattleScene: true,        // blueprint: no BattleScene for whisper tier
    // Design Bible / blueprint: GOOD WIN whisper — 40px desktop / 30px mobile.
    fontPx: 40,
    fontPxMobile: 30,
  },
  big: {
    duration: BIG_WIN_OVERLAY_MS,
    reiAsset: ASSETS.reiProfile,
    spiritAsset: ASSETS.spiritLoom,
    kanjiAsset: ASSETS.kanjiDaiSho,
    kanjiText: '大勝',
    // #3 FIX: OO-REI register — narrative vocab, not casino brag.
    kanjiSubtext: 'GREAT SEAL',
    // Spec B 2026-05-29: calligraphy-dominant veil replaces dual split-screen.
    // Rei and spirit appear as edge silhouettes at reduced opacity.
    // The calligraphy PNG is the hero; the split-screen is the ufotable lesson applied.
    showClashBrushstroke: false,  // brushstroke replaced by calligraphy center bloom
    showCameraPullBack: false,
    impactHoldMs: 1200,  // clash lingers — the spirit lands (Tim 2026-05-30)
    slideSpeedMs: 1300,  // face-off looms before the clash
    isCalligraphyVeil: true,
    calligraphyAsset: WIN_CALLIGRAPHY_ASSETS.bigWin,
    // Design Bible §4.5: BIG WIN multiplier — 64px desktop / 48px mobile.
    fontPx: 64,
    fontPxMobile: 48,
  },
  mega: {
    duration: MEGA_WIN_OVERLAY_MS,
    reiAsset: ASSETS.reiWarrior,
    spiritAsset: ASSETS.spiritThunderstrike,
    kanjiAsset: ASSETS.kanjiShinSho,
    kanjiText: '神勝',
    // #3 FIX: OO-REI register — narrative vocab, not casino brag.
    kanjiSubtext: 'DIVINE SEAL',
    // Spec B 2026-05-29: calligraphy-dominant veil for the mega 20x+ tier.
    // The 神勝 calligraphy PNG is the hero. Camera pull-back retained.
    showClashBrushstroke: false,  // calligraphy replaces brushstroke
    showCameraPullBack: true,     // MAPPA pull-out creates space for multiplier reveal
    impactHoldMs: 1700,  // long clash hold — the apex duel lingers (Tim 2026-05-30)
    slideSpeedMs: 1700,  // face-off looms; spirit fully lands before the clash
    isCalligraphyVeil: true,
    calligraphyAsset: WIN_CALLIGRAPHY_ASSETS.megaWin,
    // Design Bible §4.5 / §4.6: MEGA WIN multiplier — authored apex, 80px desktop / 60px mobile.
    fontPx: 80,
    fontPxMobile: 60,
    // Apex radial glow: fires once at IMPACT-HOLD entry, holds at opacity 0.18.
    // One authored div, one keyframe. NOT a particle emitter. NOT looping.
    showApexRadialGlow: true,
  },
  'spirit-trigger': {
    duration: SPIRIT_BONUS_TRIGGER_OVERLAY_MS,
    reiAsset: ASSETS.reiMidStride,
    spiritAsset: ASSETS.spiritMidStride,
    kanjiAsset: ASSETS.kanjiReiYadoru,
    kanjiText: '霊宿る',
    kanjiSubtext: 'SPIRIT AWAKENS',
    showClashBrushstroke: true,   // Rei challenges the spirit — clash slash
    showCameraPullBack: false,
    impactHoldMs: 800,
    slideSpeedMs: 1000,  // the awakening spirit looms (Tim 2026-05-30)
  },
  'spirit-finale': {
    duration: SPIRIT_BONUS_FINALE_MS,
    reiAsset: ASSETS.reiBow,
    spiritAsset: ASSETS.spiritBow,
    kanjiAsset: ASSETS.kanjiReiKo,
    kanjiText: '霊光',
    kanjiSubtext: 'SPIRIT DEPARTS',
    showClashBrushstroke: true,   // final resolution slash before the bow
    showCameraPullBack: false,
    impactHoldMs: 900,
    slideSpeedMs: 1000,  // the sealing lingers (Tim 2026-05-30)
  },
  // ── Spirit Evolution form-change moments (spec §8.2) ──────────────────────
  // These reuse the looming spirit figure (SPIRIT_SHADOW_LOOM_PATH) at the
  // FORM's opacity per the spec §5 table — the spirit visibly grows form to
  // form. Rei is the static profile pose at full presence; the spirit slides
  // in at its form opacity. The kanji is the form glyph (蠢/顕/光/封), the
  // subtext is the form NAME (STIRRING/MANIFEST/...) — NO currency, NO win
  // framing (RG-C1/RG-C2 safe; this is a narrative progress beat, not a win).
  'spirit-form-1': {
    duration: SPIRIT_FORM_1_OVERLAY_MS,
    reiAsset: ASSETS.reiProfile,
    spiritAsset: SPIRIT_SHADOW_LOOM_PATH,
    kanjiAsset: ASSETS.kanjiReiYadoru,
    kanjiText: '蠢',
    kanjiSubtext: 'STIRRING',
    showClashBrushstroke: false,  // quiet progress beat — no clash slash
    showCameraPullBack: false,
    impactHoldMs: 300,
    slideSpeedMs: 450,
    spiritOpacityOverride: SPIRIT_FORM_OPACITY[1], // 0.28
  },
  'spirit-form-2': {
    duration: SPIRIT_FORM_2_OVERLAY_MS,
    reiAsset: ASSETS.reiProfile,
    spiritAsset: SPIRIT_SHADOW_LOOM_PATH,
    kanjiAsset: ASSETS.kanjiReiYadoru,
    kanjiText: '顕',
    kanjiSubtext: 'MANIFEST',
    showClashBrushstroke: false,  // quiet progress beat — no clash slash
    showCameraPullBack: false,
    impactHoldMs: 400,
    slideSpeedMs: 420,
    spiritOpacityOverride: SPIRIT_FORM_OPACITY[2], // 0.50
  },
  'spirit-form-3': {
    duration: SPIRIT_FORM_3_OVERLAY_MS,
    reiAsset: ASSETS.reiProfile,
    spiritAsset: SPIRIT_SHADOW_LOOM_PATH,
    kanjiAsset: ASSETS.kanjiReiKo,
    kanjiText: '光',
    kanjiSubtext: 'RADIANT',
    showClashBrushstroke: false,  // quiet progress beat — no clash slash
    showCameraPullBack: false,
    impactHoldMs: 500,
    slideSpeedMs: 400,
    spiritOpacityOverride: SPIRIT_FORM_OPACITY[3], // 0.70
  },
  'spirit-form-4': {
    duration: SPIRIT_FORM_4_OVERLAY_MS,
    reiAsset: ASSETS.reiWarrior,
    spiritAsset: SPIRIT_SHADOW_LOOM_PATH,
    kanjiAsset: ASSETS.kanjiShinSho,
    kanjiText: '封',
    kanjiSubtext: 'SEALING',
    showClashBrushstroke: true,   // climax clash sweep — full presence confrontation
    showCameraPullBack: true,     // camera pull-back at the reset climax
    impactHoldMs: 600,
    slideSpeedMs: 380,
    spiritOpacityOverride: SPIRIT_FORM_OPACITY[4], // 1.0 — full presence
  },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OoReiCinematicOverlay({
  tier,
  onComplete,
  onImpactHoldStart,
  winMultiplierBps,
  onPhaseChange,
  activeRegionId,
}: OoReiCinematicOverlayProps): ReactElement | null {
  // Short-circuit: nothing to render for non-cinematic tiers.
  // 'none' and 'nice' are canvas-only (no DOM overlay).
  if (!tier || tier === 'none' || tier === 'nice') return null

  const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG]
  if (!config) return null

  return (
    <OoReiCinematicOverlayInner
      key={tier}
      config={config}
      tier={tier}
      onComplete={onComplete}
      onImpactHoldStart={onImpactHoldStart}
      winMultiplierBps={winMultiplierBps ?? null}
      onPhaseChange={onPhaseChange}
      activeRegionId={activeRegionId ?? null}
    />
  )
}

// ─── Inner (keyed, so it remounts cleanly on tier change) ─────────────────────

interface InnerProps {
  readonly config: TierConfig
  readonly tier: Exclude<CinematicTier, 'none' | 'nice'>
  readonly onComplete: () => void
  readonly onImpactHoldStart?: () => void
  /** See OoReiCinematicOverlayProps.winMultiplierBps for full contract. */
  readonly winMultiplierBps: bigint | null
  /** See OoReiCinematicOverlayProps.onPhaseChange for full contract. */
  readonly onPhaseChange?: (phase: string) => void
  /** The active region id — selects the region's spirit in the duel. */
  readonly activeRegionId: string | null
}

/** Format BPS multiplier as display string: 20_000n → "20.00x".
 *  Kept local to the overlay; the overlay is Domain C (presentation only).
 *  We duplicate only the arithmetic that belongs in the presentation layer —
 *  no financial mutation, no bigint outside of formatting. */
function formatMultiplierLocal(bps: bigint): string {
  if (bps < 0n) return '0.00x'
  const BPS_DENOM = 10_000n
  const whole = bps / BPS_DENOM
  const frac = bps % BPS_DENOM
  const fracStr = frac.toString().padStart(4, '0').slice(0, 2)
  return `${whole.toString()}.${fracStr}x`
}

/**
 * Ink-ruled manuscript divider between calligraphy PNG and the win number.
 * Communicates that the number is the seal's revealed value, not a UI metric.
 * Width 40%: a partial horizontal rule in the Japanese manuscript register --
 * not a full-width UI separator. Amber gradient thins at both ends.
 * No border. No box-shadow.
 */
const INK_RULE_DIVIDER_STYLE: CSSProperties = {
  width: '40%',
  height: 1,
  background: `linear-gradient(
    90deg,
    transparent 0%,
    rgba(212,137,42,0.5) 20%,
    rgba(212,137,42,0.4) 80%,
    transparent 100%
  )`,
  marginTop: 6,
  marginBottom: 6,
  alignSelf: 'center',
  flexShrink: 0,
}

// InkNumber and INK_FILTER_SVG_DEFS are imported from ooReiInkNumber (shared module).
// See ooReiInkNumber.tsx for INK_NUMBER_TEXT_SHADOW, WIN_NUMBER_FONT_FAMILY, InkNumberProps.

// activeRegionId is still accepted on InnerProps (public API + future per-region
// battle paintings) but no longer consumed internally — the region-spirit cutout
// overlay was removed (Tim 2026-06-03), so nothing inside reads it today.
function OoReiCinematicOverlayInner({ config, tier, onComplete, onImpactHoldStart, winMultiplierBps, onPhaseChange }: InnerProps): ReactElement {
  // 5-phase cinematic state machine:
  //   'entering'  — characters slide in from off-screen (APPROACH)
  //   'impact'    — kanji bursts, edge-lights fire (IMPACT-HOLD start)
  //   'kinetic'   — Canvas2D speed-lines draw outward (KINETIC-RELEASE)
  //   'pullout'   — scene scales from 1.0 → 0.96 (PULL-OUT, reveals multiplier)
  //   'exiting'   — overlay fades out
  //
  // The 'impact' phase transition is the sync point for audio. onImpactHoldStart
  // fires here so the stinger peak lands within ≤80ms of the visual impact frame
  // (ufotable/MAPPA synchronisation principle).
  const [phase, setPhase] = useState<'entering' | 'impact' | 'kinetic' | 'pullout' | 'exiting'>('entering')
  const [reiImgError, setReiImgError] = useState(false)
  const [spiritImgError, setSpiritImgError] = useState(false)
  const [kanjiImgError, setKanjiImgError] = useState(false)
  const [calligraphyImgError, setCalligraphyImgError] = useState(false)
  // Responsive font size: mobile breakpoint for per-tier fontPx selection.
  // Read once at mount — the overlay mounts during a cinematic moment, not on resize.
  const [isMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX
  )
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onImpactHoldStartRef = useRef(onImpactHoldStart)
  onImpactHoldStartRef.current = onImpactHoldStart
  const onPhaseChangeRef = useRef(onPhaseChange)
  onPhaseChangeRef.current = onPhaseChange

  // Per-tier effective multiplier font size, responsive.
  // Design Bible §4.5: big=64px/48px mobile, mega=80px/60px mobile, fallback=48px.
  // RG-C5 safe: the size is authored per tier in TierConfig (module-const).
  // It is not scaled by session, streak, or win magnitude at runtime.
  const effectiveFontPx: number = (() => {
    if (config.fontPx === undefined) return MULTIPLIER_FONT_PX
    if (isMobile && config.fontPxMobile !== undefined) return config.fontPxMobile
    return config.fontPx
  })()

  // Canvas ref for Canvas2D speed-lines (KINETIC-RELEASE beat)
  const speedLinesCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const speedLinesRafRef = useRef<number | null>(null)

  // Per-tier impact-hold duration: use the module-const named values for
  // tiers that have dedicated consts; fall back to config.impactHoldMs for
  // spirit-finale and spirit-form tiers (which use their own authored timing).
  const impactHoldMs: number = (() => {
    if (tier === 'mega' || tier === 'spirit-form-4') return CLASH_HOLD_MEGA_MS
    if (tier === 'big') return CLASH_HOLD_BIG_MS
    if (tier === 'spirit-trigger') return CLASH_HOLD_SPIRIT_TRIGGER_MS
    return config.impactHoldMs
  })()

  useEffect(() => {
    const { slideSpeedMs, duration } = config

    // T=0:                    ENTERING (approach)
    // T=slideSpeedMs:         IMPACT   (audio fires here via onImpactHoldStart)
    // T=+impactHoldMs:        KINETIC  (speed-lines draw)
    // T=+SPEED_LINE_DRAW_MS:  PULLOUT  (scene pulls out)
    // T=duration-220:         EXITING  (fade out)
    // T=duration:             onComplete

    const impactAt    = slideSpeedMs
    const kineticAt   = slideSpeedMs + impactHoldMs
    const pulloutAt   = kineticAt + SPEED_LINE_DRAW_MS
    const exitAt      = duration - 220

    const impactTimer = setTimeout(() => {
      setPhase('impact')
      onPhaseChangeRef.current?.('impact')
      // Fire audio at the visual impact frame — ≤80ms gap guaranteed (GC1 sync).
      onImpactHoldStartRef.current?.()
    }, impactAt)
    const kineticTimer = setTimeout(() => {
      setPhase('kinetic')
      onPhaseChangeRef.current?.('kinetic')
    }, kineticAt)
    const pulloutTimer = setTimeout(() => {
      setPhase('pullout')
      onPhaseChangeRef.current?.('pullout')
    }, pulloutAt)
    const exitTimer = setTimeout(() => {
      setPhase('exiting')
      onPhaseChangeRef.current?.('exiting')
    }, exitAt)
    const completeTimer = setTimeout(() => onCompleteRef.current(), duration)
    // Notify initial phase on mount
    onPhaseChangeRef.current?.('entering')

    return () => {
      clearTimeout(impactTimer)
      clearTimeout(kineticTimer)
      clearTimeout(pulloutTimer)
      clearTimeout(exitTimer)
      clearTimeout(completeTimer)
      if (speedLinesRafRef.current !== null) {
        cancelAnimationFrame(speedLinesRafRef.current)
        speedLinesRafRef.current = null
      }
    }
  }, [config, impactHoldMs])

  // ── Canvas2D speed-lines (KINETIC-RELEASE beat) ──────────────────────────
  // Fires on mega/spirit-trigger/spirit-form-4 tiers during the 'kinetic' phase.
  // Draws the authored SPEED_LINES array from impact center outward via rAF.
  // Only transforms (no layout) — sub-16ms per frame budget.
  // prefers-reduced-motion: no canvas drawing (static fallback already shows
  // the CSS brushstroke placeholder as authored background).
  const showSpeedLines = tier === 'mega' || tier === 'spirit-trigger' || tier === 'spirit-form-4'

  // prefers-reduced-motion check — collapses all transforms to opacity-only
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // The won-multiplier figure counts up from 0 → settled value during pull-out.
  const displayMultBps = useCountUpBps(winMultiplierBps, phase === 'pullout', prefersReducedMotion)

  useEffect(() => {
    if (!showSpeedLines) return
    if (phase !== 'kinetic') return
    if (prefersReducedMotion) return
    const canvas = speedLinesCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    const cx = W / 2
    const cy = H / 2
    // Half-diagonal: lines radiate outward from center to the canvas edge area.
    const halfDiag = Math.sqrt(cx * cx + cy * cy)

    const startTime = performance.now()
    const totalMs = SPEED_LINE_DRAW_MS + SPEED_LINE_HOLD_MS

    function drawFrame(now: number): void {
      const elapsed = now - startTime
      if (elapsed >= totalMs) {
        // Final frame: clear canvas (phase will be 'pullout' soon, canvas fades with overlay)
        ctx!.clearRect(0, 0, W, H)
        speedLinesRafRef.current = null
        return
      }
      // Progress: 0→1 during DRAW phase, then hold at 1 during HOLD phase
      const drawProgress = Math.min(1, elapsed / SPEED_LINE_DRAW_MS)
      ctx!.clearRect(0, 0, W, H)

      for (const line of SPEED_LINES as ReadonlyArray<SpeedLineSpec>) {
        const angleRad = (line.angleDeg * Math.PI) / 180
        const totalLength = halfDiag * line.lengthFactor
        // Lines animate outward: they draw from a minimum stub to their full length.
        // The stub-start creates the "burst from center" feel (not from the edge inward).
        const stubLength = totalLength * 0.15
        const currentLength = stubLength + (totalLength - stubLength) * drawProgress

        const x1 = cx + Math.cos(angleRad) * stubLength
        const y1 = cy + Math.sin(angleRad) * stubLength
        const x2 = cx + Math.cos(angleRad) * currentLength
        const y2 = cy + Math.sin(angleRad) * currentLength

        ctx!.beginPath()
        ctx!.moveTo(x1, y1)
        ctx!.lineTo(x2, y2)
        // Amber-vermillion gradient color: warm at center (amber), cooler at tip (vermillion)
        ctx!.strokeStyle = `rgba(192, 57, 43, ${0.55 * (1 - drawProgress * 0.3)})`
        ctx!.lineWidth = line.weight
        ctx!.lineCap = 'round'
        ctx!.stroke()
      }

      speedLinesRafRef.current = requestAnimationFrame(drawFrame)
    }

    speedLinesRafRef.current = requestAnimationFrame(drawFrame)

    return () => {
      if (speedLinesRafRef.current !== null) {
        cancelAnimationFrame(speedLinesRafRef.current)
        speedLinesRafRef.current = null
      }
      // Clear canvas on cleanup
      const c = speedLinesCanvasRef.current
      if (c) {
        const ctx2 = c.getContext('2d')
        ctx2?.clearRect(0, 0, c.width, c.height)
      }
    }
  }, [phase, showSpeedLines, prefersReducedMotion])

  const isExiting = phase === 'exiting'
  const impactVisible = phase === 'impact' || phase === 'kinetic' || phase === 'pullout'

  // Character horizontal position.
  // ENTERING: characters start off-screen on their respective sides.
  // All other phases: resting positions flanking center.
  // NOTE: No scale-in during ENTERING (that was the wrong direction).
  const getReiTranslateX = useCallback((): string => {
    if (prefersReducedMotion) return '0%'
    if (phase === 'entering') return '-100%'
    return '0%'
  }, [phase, prefersReducedMotion])

  const getSpiritTranslateX = useCallback((): string => {
    if (prefersReducedMotion) return '0%'
    if (phase === 'entering') return '100%'
    return '0%'
  }, [phase, prefersReducedMotion])

  // MAPPA pull-out-to-multiplier reveal:
  // PULL-OUT phase: scene scales from 1.0 → 0.96 (pulling back, not zooming in).
  // This is the CORRECT direction — it clears center space after the impact.
  // The previous implementation had 1.05→1.0 during ENTERING (wrong direction,
  // wrong phase). We remove that entirely. ENTERING is pure motion (slide).
  const getSceneScale = useCallback((): string => {
    if (!config.showCameraPullBack) return 'scale(1)'
    // Pull-out fires after impact-hold. Scale down to 0.96, not up.
    if (phase === 'pullout' || phase === 'exiting') return 'scale(0.96)'
    return 'scale(1.0)'
  }, [config.showCameraPullBack, phase])

  const slideTransition = `transform ${config.slideSpeedMs}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 220ms ease-out`
  // Pull-out transition: ZOOM_PUNCH_MS for the scale, ease-out (crisp decel).
  const cameraTransition = config.showCameraPullBack
    ? `transform ${ZOOM_PUNCH_MS}ms cubic-bezier(0.2, 0, 0, 1)`
    : 'none'

  // ── CALLIGRAPHY-VEIL format (big/mega tiers — spec B 2026-05-29) ─────────
  // Replaces the dual split-screen with: full-canvas dark veil + calligraphy
  // hero at center + Rei right-edge silhouette + spirit left-edge silhouette.
  // Art-director reference: ufotable "Your Name" comet composition — the visual
  // spectacle (calligraphy) dominates, characters are secondary edge anchors.
  //
  // Pass 3 changes (Design Bible §4.5 + §4.6):
  //   - Center composition uses flexbox column: label → calligraphy → number.
  //     No absolute offsets — adapts to viewport height.
  //   - calligraphyVeilCenterStyle.width = min(380px, 70vw) (not a fixed pixel value).
  //   - Multiplier uses InkNumber (ink-black fill + INK_NUMBER_TEXT_SHADOW + SVG feTurbulence).
  //   - MEGA tier: apex radial glow div fires once at impact, holds at opacity 0.18.
  if (config.isCalligraphyVeil) {
    const calligraphyVisible = phase === 'impact' || phase === 'kinetic' || phase === 'pullout'
    // Apex glow fires once when we enter 'impact' phase and holds. Only for mega tier.
    const apexGlowActive = config.showApexRadialGlow && (
      phase === 'impact' || phase === 'kinetic' || phase === 'pullout'
    )
    return (
      <div
        role="status"
        aria-label={`${config.kanjiSubtext} celebration`}
        aria-live="assertive"
        style={{
          ...overlayShellStyle,
          opacity: isExiting ? 0 : 1,
          transition: isExiting ? 'opacity 220ms ease-out' : 'opacity 180ms ease-in',
        }}
      >
        {/* SVG filter defs -- ink-rough displacement. Zero layout impact (width/height 0).
            Must be first child so the filter ID resolves before any referencing span renders.
            aria-hidden: true on the SVG itself (set inside INK_FILTER_SVG_DEFS). */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static authored SVG filter defs, no user input */}
        <div dangerouslySetInnerHTML={{ __html: INK_FILTER_SVG_DEFS }} />

        {/* Full-canvas dark veil */}
        <div style={calligraphyVeilBackdropStyle} />

        {/* MEGA apex radial glow — one authored div, one keyframe, fires once at impact.
            Design Bible §4.6: radial-gradient amber ellipse, opacity 0→1→0.18 over 400ms.
            NOT a particle emitter. NOT looping. Holds at 0.18 for the remainder of the overlay.
            Anti-slop fence: this is the single authored ambient beat for MEGA tier only. */}
        {config.showApexRadialGlow && (
          <div
            aria-hidden="true"
            style={{
              ...apexRadialGlowStyle,
              animationName: apexGlowActive ? 'ooReiKanjiApex' : 'none',
              animationDuration: '400ms',
              animationTimingFunction: 'ease-out',
              animationFillMode: 'forwards',
              // Before impact: invisible. After keyframe: holds at 0.18 via fill-mode forwards.
              opacity: apexGlowActive ? undefined : 0,
            }}
          />
        )}

        {/* Scene container — receives PULL-OUT scale */}
        <div style={{
          ...sceneContainerStyle,
          transform: getSceneScale(),
          transition: cameraTransition,
        }}>

          {/* Full-screen 1v1 duel — replaces the old edge silhouettes (Tim 2026-05-30). */}
          <BattleScene tier={tier} phase={phase} prefersReducedMotion={prefersReducedMotion} />

          {/* Win panel: centered flexbox column — label / calligraphy / number.
              Design Bible §4.3 + §4.6: The column adapts to viewport height.
              Width: min(380px, 70vw) per §4.6 spec.
              Only visible from impact phase onward (same as calligraphyVisible). */}
          {calligraphyVisible && (
            <div style={{
              ...calligraphyVeilWinPanelStyle,
              // Blueprint Fix 3 (2026-05-30): shift panel down on mobile portrait
              // (412x915) so the win number sits below the spirit figure.
              // objectPosition:'center 30%' on battleImgStyle keeps spirit in upper area;
              // this top shift reserves the lower half for the number overlay.
              top: isMobile ? '58%' : '50%',
            }}>
              {/* "BIG WIN" / "MEGA WIN" label above calligraphy */}
              <span style={calligraphyVeilTierLabelStyle}>{config.kanjiSubtext}</span>

              {/* Calligraphy hero — blooms on impact phase */}
              {config.calligraphyAsset && !calligraphyImgError ? (
                <img
                  src={config.calligraphyAsset}
                  alt={config.kanjiText}
                  aria-hidden="true"
                  style={{
                    ...calligraphyVeilHeroImgStyle,
                    animationName: 'ooReiCalligraphyBloom',
                    animationDuration: '240ms',
                    animationTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
                    animationFillMode: 'both',
                  }}
                  onError={() => setCalligraphyImgError(true)}
                />
              ) : (
                // CSS fallback when PNG is missing
                <KanjiPlaceholder kanjiText={config.kanjiText} subtext={config.kanjiSubtext} tier={tier} />
              )}

              {/* Won-multiplier figure — PULL-OUT phase only.
                  FIX-B (2026-05-31): InkNumber replaces the white outlined span.
                  Ink-black fill + amber hairline highlight + SVG feTurbulence roughness
                  unifies the number with the kanji's sumi-e ink surface grammar.
                  Ink-ruled divider (INK_RULE_DIVIDER_STYLE) separates calligraphy
                  from number — reads as a seal inscription, not a scoreboard readout.
                  RG-C5: MULTIPLIER_REVEAL_MS is identical for every tier.
                  RG-C1: winMultiplierBps null on loss → renders nothing. */}
              {phase === 'pullout' && winMultiplierBps != null && (
                <>
                  <div aria-hidden="true" style={INK_RULE_DIVIDER_STYLE} />
                  <InkNumber
                    value={formatMultiplierLocal(displayMultBps)}
                    fontPx={effectiveFontPx}
                    isWhisperBeat={false}
                    prefersReducedMotion={prefersReducedMotion}
                    ariaLabel={`Won ${formatMultiplierLocal(winMultiplierBps)}`}
                    revealMs={MULTIPLIER_REVEAL_MS}
                  />
                </>
              )}
            </div>
          )}

          {/* Canvas2D speed-lines (mega only) */}
          {showSpeedLines && (
            <canvas
              ref={speedLinesCanvasRef}
              width={600}
              height={400}
              aria-hidden="true"
              style={speedLinesCanvasStyle}
            />
          )}
        </div>

        <style>{CINEMATIC_KEYFRAMES}</style>
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-label={`${config.kanjiSubtext} celebration`}
      aria-live="assertive"
      style={{
        ...overlayShellStyle,
        opacity: isExiting ? 0 : 1,
        transition: isExiting ? 'opacity 220ms ease-out' : 'opacity 180ms ease-in',
      }}
    >
      {/* SVG filter defs -- ink-rough displacement. Zero layout impact (width/height 0).
          Must be first child so the filter ID resolves before any referencing span renders.
          aria-hidden: true on the SVG itself (set inside INK_FILTER_SVG_DEFS). */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static authored SVG filter defs, no user input */}
      <div dangerouslySetInnerHTML={{ __html: INK_FILTER_SVG_DEFS }} />

      {/* Backdrop — whisper tiers use warm amber tint; clash tiers use dark storm purple.
          Blueprint Fix 1 (2026-05-30): isWhisperBeat → goodWinBackdropStyle (warm amber).
          Full-clash tiers keep the existing backdropStyle (storm purple + edge bleeds). */}
      <div style={config.isWhisperBeat ? goodWinBackdropStyle : backdropStyle} />

      {/* Scene container — receives PULL-OUT scale transform after impact-hold */}
      <div
        style={{
          ...sceneContainerStyle,
          transform: getSceneScale(),
          transition: cameraTransition,
        }}
      >

        {/* Canvas2D speed-lines — KINETIC-RELEASE beat (mega/spirit-trigger/spirit-form-4).
            Positioned absolute, full overlay, pointer-events:none, zIndex 1.
            rAF-driven: draws the authored SPEED_LINES const array during 'kinetic' phase.
            Canvas is sized at mount via inline width/height; actual drawing happens in useEffect.
            prefers-reduced-motion: canvas is present but the rAF draw loop does not fire. */}
        {showSpeedLines && (
          <canvas
            ref={speedLinesCanvasRef}
            width={600}
            height={400}
            aria-hidden="true"
            style={speedLinesCanvasStyle}
          />
        )}

        {/* Full-screen 1v1 duel — skipped for 'good' whisper tier (skipBattleScene:true).
            Blueprint Fix 1 (2026-05-30): BattleScene is reserved for BIG/MEGA/SPIRIT only.
            The 'good' whisper beat shows a static spirit ghost at 0.18 opacity instead. */}
        {!config.skipBattleScene && (
          <BattleScene tier={tier} phase={phase} prefersReducedMotion={prefersReducedMotion} />
        )}

        {/* GOOD WIN whisper — static spirit ghost at right edge, 0.18 opacity.
            Blueprint Fix 1 (2026-05-30): "For isWhisperBeat, render the spirit as a
            static right-edge ghost at opacity:0.18. No slide-in animation — static
            presence, not a combatant."
            Uses SPIRIT_SHADOW_LOOM_PATH (the existing loom asset) — no new file needed.
            z-index 0 — behind the impact column at z-index 2. */}
        {config.isWhisperBeat && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              right: '-4%',
              top: 0,
              bottom: 0,
              width: '50%',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'flex-end',
              overflow: 'hidden',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            <img
              src={SPIRIT_SHADOW_LOOM_PATH}
              alt=""
              aria-hidden="true"
              draggable={false}
              style={{
                height: '80%',
                width: 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                objectPosition: 'bottom right',
                opacity: config.spiritOpacityOverride ?? 0.18,
                userSelect: 'none',
                // Static presence — no animation, no slide-in.
                // prefers-reduced-motion: already static, no transition needed.
              }}
            />
          </div>
        )}

        {/* Brushstroke clash-sweep — FOREGROUND diagonal slash.
            Rendered OUTSIDE the impact column (which lives at zIndex 2) so the
            z-layer order is: characters (z0) → brushstroke (z1) → kanji (z2).
            The slash sweeps across both character halves — it IS the collision point.
            Only shown on true clash tiers (showClashBrushstroke = true).
            Animation: ooReiCinematicBrushSweep fires when phase becomes 'impact'.
            Duration: BRUSH_SWEEP_MS (280ms) — module-const, identical for all tiers
            (RG-C5: only WHICH tiers show it differs, never the sweep duration).
            prefers-reduced-motion: keyframe override swaps clip-path reveal for
            opacity cross-fade only (defined in CINEMATIC_KEYFRAMES below). */}
        {config.showClashBrushstroke && (
          <div style={brushstrokeSlashContainerStyle}>
            <img
              src={ASSETS.brushstrokeSweep}
              alt=""
              aria-hidden="true"
              style={{
                ...brushstrokeSlashImgStyle,
                // Animate when phase is impact or later — the sweep fires at impact
                // and persists through kinetic/pullout until the overlay exits.
                animationName: (phase === 'impact' || phase === 'kinetic' || phase === 'pullout')
                  ? 'ooReiCinematicBrushSweep'
                  : 'none',
                animationDuration: `${BRUSH_SWEEP_MS}ms`,
                animationTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
                animationFillMode: 'forwards',
                // Pre-animation state: clipped fully (invisible until phase = impact)
                clipPath: (phase === 'entering') ? 'inset(0 100% 0 0)' : undefined,
              }}
              onError={(e) => {
                // On missing PNG: show the CSS diagonal-gradient placeholder
                const img = e.currentTarget
                img.style.display = 'none'
                const sibling = img.nextElementSibling as HTMLElement | null
                if (sibling) sibling.style.display = 'block'
              }}
            />
            {/* CSS-authored diagonal brushstroke placeholder — shown only when PNG is missing.
                The linear-gradient IS the authored vermillion diagonal path (sumi-e sweep),
                not a particle or emitter. Hidden by default; shown via onError above. */}
            <div style={brushstrokeSlashPlaceholderStyle} />
          </div>
        )}

        {/* Center impact column — kanji + label + multiplier.
            GOOD tier whisper: brushstroke-amber.png at 0.55 opacity as background layer.
            Design Bible §1.2: GOOD tier uses brushstroke-amber.png bg for the number.
            Pass 3: outlined number 48px desktop / 36px mobile over warm brushstroke ground.
            The brushstroke is a separate child div at 0.55 opacity — this keeps the number
            at full opacity while the warm brushstroke ground reads through beneath it. */}
        <div
          style={{
            ...impactColumnStyle,
            opacity: impactVisible ? 1 : 0,
            transform: impactVisible
              ? 'translateX(-50%) scale(1)'
              : 'translateX(-50%) scale(0.85)',
            transition: 'opacity 80ms ease-in, transform 80ms cubic-bezier(0.2, 0, 0, 1)',
            ...(config.isWhisperBeat ? { padding: '12px 20px', minWidth: 160 } : {}),
          }}
        >
          {/* GOOD tier brushstroke-amber.png ground at 0.55 opacity.
              Absolutely positioned so it sits behind the kanji/number content.
              Static PNG — not animated, not a particle. transform/opacity only. */}
          {config.isWhisperBeat && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `url('/assets/generated/oo-rei/win-calligraphy/brushstroke-amber.png')`,
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center center',
                opacity: 0.55,
                pointerEvents: 'none',
                zIndex: 0,
              }}
            />
          )}
          {/* (brushstroke is now above the scene container, not inside the column) */}

          {/* Kanji impact frame.
              Whisper beat ('good' tier): 32px height (small, per spec).
              Standard tiers: full 140px height.
              Animation: ooReiCinematicKanjiStrike — bloom from scale(0.6) → 1.12 → 1.0.
              Duration is driven by module consts: bloom (KANJI_BLOOM_MS=100) +
              settle (KANJI_SETTLE_MS=120) + hold + exit totals ~700ms. */}
          {!kanjiImgError ? (
            <img
              src={config.kanjiAsset}
              alt={config.kanjiText}
              style={{
                ...kanjiImgStyle,
                height: config.isWhisperBeat ? 32 : 140,
                // Animation duration derived from module consts (bloom + settle + hold buffer).
                // This ensures the keyframe percentages (0%/12%/20%) are correctly timed.
                animationDuration: prefersReducedMotion
                  ? `${KANJI_BLOOM_MS + KANJI_SETTLE_MS}ms`
                  : `${KANJI_BLOOM_MS + KANJI_SETTLE_MS + 480}ms`,
                animationName: impactVisible ? 'ooReiCinematicKanjiStrike' : 'none',
                animationTimingFunction: 'ease-out',
                animationFillMode: 'forwards',
              }}
              onError={() => setKanjiImgError(true)}
            />
          ) : (
            <KanjiPlaceholder
              kanjiText={config.kanjiText}
              subtext={config.kanjiSubtext}
              tier={tier}
            />
          )}

          {/* English label below kanji — always visible as accessibility anchor */}
          <span style={kanjiEnglishLabelStyle}>
            {config.kanjiSubtext}
          </span>

          {/* Won-multiplier figure — PULL-OUT phase only, only when winMultiplierBps is set.
              FIX-B (2026-05-31): InkNumber replaces the white outlined span.
              isWhisperBeat controls the backing-plate opacity (lower for GOOD tier —
              the brushstroke-amber.png ground already provides warm backing).
              RG-C5: reveal duration MULTIPLIER_REVEAL_MS (200ms) — identical for every tier.
              RG-C1: winMultiplierBps is null on loss states → renders nothing.
              prefers-reduced-motion: figure appears instantly (no scale animation). */}
          {phase === 'pullout' && winMultiplierBps != null && (
            <InkNumber
              value={formatMultiplierLocal(displayMultBps)}
              fontPx={effectiveFontPx}
              isWhisperBeat={config.isWhisperBeat ?? false}
              prefersReducedMotion={prefersReducedMotion}
              ariaLabel={`Won ${formatMultiplierLocal(winMultiplierBps)}`}
              revealMs={MULTIPLIER_REVEAL_MS}
            />
          )}
        </div>
      </div>

      {/* CSS keyframes injected once */}
      <style>{CINEMATIC_KEYFRAMES}</style>
    </div>
  )
}

// ─── CSS placeholder silhouettes ─────────────────────────────────────────────
// Fire when PNG assets are not yet available. Preserve composition timing.

function ReiPlaceholder({
  tier,
}: {
  readonly tier: Exclude<CinematicTier, 'none' | 'nice'>
}): ReactElement {
  const isBow = tier === 'spirit-finale'
  const isStride = tier === 'spirit-trigger'
  return (
    <div style={reiPlaceholderStyle} aria-hidden="true">
      {/* Silhouette: amber sugegasa hat disc at top + narrow robed body */}
      <div style={hatDiscStyle} />
      <div
        style={{
          ...bodyRectStyle,
          transform: isBow
            ? 'rotate(-20deg) translateX(-8px)'
            : isStride
              ? 'translateX(8px)'
              : 'none',
        }}
      />
      {/* Talisman arm */}
      <div style={talismanArmStyle} />
    </div>
  )
}

function SpiritPlaceholder({
  tier,
}: {
  readonly tier: Exclude<CinematicTier, 'none' | 'nice'>
}): ReactElement {
  const isBow = tier === 'spirit-finale'
  return (
    <div style={spiritPlaceholderStyle} aria-hidden="true">
      {/* Spirit silhouette: wide angular head + massive body */}
      <div
        style={{
          ...spiritHeadStyle,
          transform: isBow ? 'rotate(30deg) translateX(8px)' : 'none',
        }}
      />
      <div style={spiritBodyStyle} />
      {/* Amber rune marks */}
      <div style={spiritRuneStyle} />
    </div>
  )
}

function KanjiPlaceholder({
  kanjiText,
  subtext,
  tier,
}: {
  readonly kanjiText: string
  readonly subtext: string
  readonly tier: Exclude<CinematicTier, 'none' | 'nice'>
}): ReactElement {
  const isMega = tier === 'mega'
  return (
    <div style={kanjiPlaceholderWrapStyle} aria-hidden="true">
      <span
        style={{
          ...kanjiTextStyle,
          fontSize: isMega ? 72 : 56,
          color: tier === 'spirit-finale' ? C.cream : C.vermillion,
          textShadow: isMega
            ? `0 0 40px ${C.amberAccent}, 0 0 80px rgba(192,57,43,0.6), 0 4px 12px rgba(0,0,0,0.9)`
            : `0 0 24px ${C.amberAccent}, 0 2px 8px rgba(0,0,0,0.8)`,
        }}
      >
        {kanjiText}
      </span>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// ── Calligraphy-veil styles (spec B 2026-05-29 — big/mega tiers) ─────────────

/** Full-canvas dark radial veil — replaces the split half-backdrop.
 *  Pass 2 (2026-05-29): center opacity 0.72→0.88, edge 0.90→0.97.
 *  The live game is now ≤12% visible at center — a warm depth hint, not a bleed-through.
 */
const calligraphyVeilBackdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: `radial-gradient(ellipse at center, rgba(14,10,6,0.88) 0%, rgba(8,5,2,0.97) 100%)`,
}

/** Rei edge silhouette — far right, enters with 0.55 terminal opacity.
 *  Pass 2 (2026-05-29): width 22%→28%, right -4%→-2%, opacity 0.38→0.55.
 *  Wider panel + tighter crop = more presence without dominating the calligraphy.
 */
const calligraphyVeilReiEdgeStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  right: '-2%',
  bottom: 0,
  width: '28%',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  overflow: 'hidden',
  pointerEvents: 'none',
}

/** Spirit edge silhouette — far left, enters with 0.40 terminal opacity.
 *  Pass 2 (2026-05-29): width 20%→24%, left -4%→-2%, opacity 0.25→0.40.
 */
const calligraphyVeilSpiritEdgeStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: '-2%',
  bottom: 0,
  width: '24%',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  overflow: 'hidden',
  pointerEvents: 'none',
}

/** Character image for edge silhouettes — tall, contained.
 *  Pass 2 (2026-05-29): height 80%→90% — slightly taller crop for more presence. */
const calligraphyVeilCharImgStyle: CSSProperties = {
  height: '90%',
  maxHeight: 480,
  width: 'auto',
  objectFit: 'contain',
  objectPosition: 'bottom center',
}

/**
 * Win panel for calligraphy-veil tiers — centered flexbox column.
 * Design Bible §4.3 + §4.6: label / calligraphy / number stack.
 * Pass 2 (2026-05-29): width min(380px,70vw) → min(440px,78vw) — wider hero frame.
 * Uses flexbox column so the stack adapts to viewport height across breakpoints.
 * No absolute offsets — each element is in document flow within the column.
 */
const calligraphyVeilWinPanelStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'min(440px, 78vw)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 0,
  zIndex: 2,
  pointerEvents: 'none',
}

/** Calligraphy hero image — fills the win panel.
 *  Pass 2 (2026-05-29): opacity removed from inline style — the ooReiCalligraphyBloom
 *  keyframe drives opacity to 1.0 with animationFillMode: 'both' (was 0.88).
 *  Double amber drop-shadow added: 48px outer bloom + 24px inner warmth.
 */
const calligraphyVeilHeroImgStyle: CSSProperties = {
  width: '100%',
  height: 'auto',
  maxHeight: 280,
  objectFit: 'contain',
  filter: 'drop-shadow(0 0 48px rgba(212,137,42,0.65)) drop-shadow(0 0 24px rgba(244,167,62,0.40))',
  pointerEvents: 'none',
}

/**
 * Tier label above calligraphy (e.g. "MEGA WIN", "BIG WIN").
 * Pass 2 (2026-05-29): 12px → 18px, opacity 0.80 → 0.96, textShadow adds
 * amber warmth glow. marginBottom 8 → 12 for breathing room above hero.
 * RG-C5 structural: identical size/color for both big and mega tiers.
 */
const calligraphyVeilTierLabelStyle: CSSProperties = {
  // Vibrant ember-gold tier label (Tim 2026-05-30: the old cream mono "looked
  // old and dull"). Bright warm gold + a strong warm glow so it reads as premium
  // key-art type over the duel art, not a faint system label.
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 19,
  fontWeight: 800,
  letterSpacing: '0.36em',
  color: '#f7b24a',
  textTransform: 'uppercase',
  textShadow:
    '0 1px 6px rgba(0,0,0,0.9), 0 0 18px rgba(247,178,74,0.6), 0 0 3px rgba(255,214,150,0.55)',
  marginBottom: 14,
}

/**
 * MEGA apex radial glow — one authored div, no particles.
 * Design Bible §4.6: radial-gradient amber ellipse centered.
 * Animated via ooReiKanjiApex keyframe: opacity 0→1→0.18 over 400ms.
 * Fires once at IMPACT-HOLD entry. animationFillMode: 'forwards' holds at 0.18.
 * z-index 3 (above veil backdrop at z-auto, above scene at z-auto, below kanji z-2).
 * NOT a particle emitter. NOT looping. Anti-slop fence: single authored glow.
 */
const apexRadialGlowStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'radial-gradient(ellipse 50% 40% at center, rgba(244,167,62,0.28) 0%, transparent 70%)',
  pointerEvents: 'none',
  zIndex: 3,
}

/**
 * Good-win whisper backdrop — warm amber tint (not storm-purple).
 * Blueprint Fix 1 (2026-05-30): replaces the dark storm backdrop for isWhisperBeat tiers.
 * The canvas game stays faintly visible through the warm radial (≈38% max opacity center).
 * No cyan. No purple. Warm dark amber-to-almost-black radial.
 */
const goodWinBackdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: `radial-gradient(ellipse at center, rgba(28,20,10,0.45) 0%, rgba(18,12,6,0.62) 100%)`,
}

const overlayShellStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 5,
  overflow: 'hidden',
  pointerEvents: 'none', // Overlay is non-interactive — all game controls remain accessible
}

const backdropStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  // Dark storm-purple base with amber edge bleeds (vermillion at edges for impact)
  background: `
    radial-gradient(ellipse 60% 100% at 50% 50%, rgba(26, 22, 18, 0.82) 0%, rgba(45, 36, 56, 0.94) 60%, rgba(26, 22, 18, 0.98) 100%),
    linear-gradient(to right, rgba(192, 57, 43, 0.15) 0%, rgba(26,22,18,0) 20%, rgba(26,22,18,0) 80%, rgba(192, 57, 43, 0.15) 100%)
  `,
}

const sceneContainerStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  transformOrigin: 'center center',
}

const characterHalfStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: '45%',
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  overflow: 'hidden',
}

const leftHalfStyle: CSSProperties = {
  left: 0,
  justifyContent: 'flex-end',   // Rei pushes toward center
  paddingRight: '2%',
  // FIX 2: Amber warmth from the right edge (center) — reduced from 0.06 to 0.02
  // so the background gradient does NOT compound with the edge-light div to form
  // a hard amber bar at the seam. The gradient now reads as a soft warmth, not a bar.
  background: 'linear-gradient(to right, rgba(26,22,18,0) 0%, rgba(212,137,42,0.02) 100%)',
}

const rightHalfStyle: CSSProperties = {
  right: 0,
  justifyContent: 'flex-start', // Spirit pushes toward center
  paddingLeft: '2%',
  // FIX 2: Amber warmth from the left edge (center) — reduced from 0.06 to 0.02.
  background: 'linear-gradient(to left, rgba(26,22,18,0) 0%, rgba(212,137,42,0.02) 100%)',
}

const characterImgStyle: CSSProperties = {
  height: '85%',
  maxHeight: 520,
  width: 'auto',
  objectFit: 'contain',
  objectPosition: 'bottom center',
  filter: 'drop-shadow(0 0 18px rgba(212,137,42,0.25)) drop-shadow(0 4px 24px rgba(0,0,0,0.7))',
}

/** Amber glow edge-light emanating from the impact center point.
 *  FIX 2: Widened from 40px → 80px and max opacity reduced from 0.35 → 0.22.
 *  This converts the hard ~4-6px bar at the seam into a wide soft bleed —
 *  the amber warmth reads as "energy between the figures", not a UI divider bar. */
const characterEdgeLightStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 80,
  transition: 'opacity 80ms ease-in',
}

const leftEdgeLightStyle: CSSProperties = {
  right: 0,
  background: 'linear-gradient(to right, rgba(244,167,62,0) 0%, rgba(244,167,62,0.22) 100%)',
}

const rightEdgeLightStyle: CSSProperties = {
  left: 0,
  background: 'linear-gradient(to left, rgba(244,167,62,0) 0%, rgba(244,167,62,0.22) 100%)',
}

/** Impact column — centered vertically + horizontally over the split */
const impactColumnStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  // translateX(-50%) applied inline (avoids overwriting the scale transform)
  transform: 'translateX(-50%)',
  marginTop: '-10%', // slight up-shift: impact frame sits above center-line
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  zIndex: 2,
  // Circular amber-to-transparent radial behind the kanji
  filter: 'drop-shadow(0 0 32px rgba(212,137,42,0.5))',
}

/** Canvas2D speed-lines overlay — KINETIC-RELEASE beat.
    Full-overlay, pointer-events none, zIndex 1 (behind kanji column at zIndex 2).
    Sized via HTML width/height attributes to match approximate overlay viewport;
    CSS stretches it to fill absolute-inset without affecting layout. */
const speedLinesCanvasStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 1,
}

/**
 * Brushstroke clash-sweep container — the full-width diagonal vermillion slash.
 *
 * Z-layer contract (important):
 *   - Characters (Rei + spirit) render inside sceneContainer at default z-index (0)
 *   - This slash container is z-index 1 — above the characters, below the kanji column
 *   - Kanji impact column is z-index 2 — the kanji strikes ON TOP of the slash
 *   - Canvas2D speed-lines canvas is also z-index 1 — slash and speed-lines share this
 *     layer but don't fight: slash is IMPACT-HOLD, speed-lines are KINETIC-RELEASE.
 *
 * Sizing: width 118% of parent (overflows both sides — the slash is bigger than
 * the overlay, so its tail and head disappear past the crop boundary).
 * Height: 260px — tall enough to read as a bold brushstroke, not a hairline.
 * Rotation: -10deg — diagonal slash from bottom-left to top-right.
 * The transform-origin is center so the rotation balances across the frame.
 */
const brushstrokeSlashContainerStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  // Center in frame, then rotate the slash -10deg for the diagonal energy line
  transform: 'translate(-50%, -50%) rotate(-10deg)',
  width: '118%',
  height: 260,
  zIndex: 1,
  pointerEvents: 'none',
  // Overflow is clipped by the overlayShellStyle (overflow: hidden)
}

const brushstrokeSlashImgStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'fill',   // stretch to fill the container — the slash ink spans the full width
  opacity: 0.72,       // assertive presence, not overpowering the characters
  // clip-path starting state: fully clipped (handled via inline style in JSX).
  // The ooReiCinematicBrushSweep keyframe reveals left-to-right.
}

/**
 * CSS-only brushstroke placeholder — rendered when the PNG is missing.
 * The linear-gradient IS the authored vermillion diagonal path (sumi-e sweep).
 * Hidden by default (display:none); the img onError handler makes it visible.
 * This is a static authored CSS path — not a particle, not an emitter.
 */
const brushstrokeSlashPlaceholderStyle: CSSProperties = {
  display: 'none',     // shown only when PNG fails to load (set via onError)
  position: 'absolute',
  inset: 0,
  // Wide gradient stroke: vermillion core + amber flanks — the collision energy
  background: `linear-gradient(
    180deg,
    transparent 10%,
    rgba(192,57,43,0.12) 22%,
    rgba(212,137,42,0.38) 35%,
    rgba(192,57,43,0.65) 44%,
    rgba(244,167,62,0.80) 50%,
    rgba(192,57,43,0.65) 56%,
    rgba(212,137,42,0.38) 65%,
    rgba(192,57,43,0.12) 78%,
    transparent 90%
  )`,
  borderRadius: 4,
}

const kanjiImgStyle: CSSProperties = {
  width: 'auto',
  height: 140,
  maxWidth: 200,
  objectFit: 'contain',
  filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.8))',
}

const kanjiEnglishLabelStyle: CSSProperties = {
  // QA 2026-05-30: was 11px cream — illegible as a game-moment label + dull.
  // Raised to the premium ember-gold register so good/spirit tiers read at the
  // same key-art weight as the calligraphy-veil (big/mega) label.
  fontFamily: C.fontMono,
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: '0.34em',
  color: '#f7b24a',
  textTransform: 'uppercase',
  textShadow:
    '0 1px 6px rgba(0,0,0,0.9), 0 0 18px rgba(247,178,74,0.55), 0 0 3px rgba(255,214,150,0.5)',
  marginTop: 6,
}

// ── CSS placeholder silhouette styles ─────────────────────────────────────────

const reiPlaceholderStyle: CSSProperties = {
  position: 'relative',
  width: 120,
  height: 320,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 0,
}

const hatDiscStyle: CSSProperties = {
  width: 80,
  height: 22,
  borderRadius: '50%',
  background: `radial-gradient(ellipse, ${C.talismanPaper} 0%, rgba(232,223,200,0.6) 60%, rgba(232,223,200,0.1) 100%)`,
  marginBottom: 4,
  boxShadow: `0 0 12px rgba(244,167,62,0.3)`,
}

const bodyRectStyle: CSSProperties = {
  width: 44,
  height: 200,
  background: `linear-gradient(180deg, rgba(30,24,18,0.95) 0%, rgba(20,16,12,0.98) 100%)`,
  borderRadius: '4px 4px 0 0',
  boxShadow: `0 0 20px rgba(212,137,42,0.2), inset 0 0 0 1px rgba(212,137,42,0.15)`,
  transition: 'transform 0.3s ease',
}

const talismanArmStyle: CSSProperties = {
  position: 'absolute',
  top: 80,
  right: 8,
  width: 6,
  height: 80,
  background: `linear-gradient(180deg, ${C.amberAccent} 0%, ${C.talismanGlow} 50%, rgba(244,167,62,0.4) 100%)`,
  borderRadius: 3,
  transform: 'rotate(-25deg)',
  transformOrigin: 'top center',
  boxShadow: `0 0 10px rgba(244,167,62,0.5)`,
}

const spiritPlaceholderStyle: CSSProperties = {
  position: 'relative',
  width: 160,
  height: 380,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 0,
}

const spiritHeadStyle: CSSProperties = {
  width: 100,
  height: 70,
  borderRadius: '40% 40% 30% 30%',
  background: `linear-gradient(180deg, rgba(50,45,55,0.95) 0%, rgba(35,30,42,0.98) 100%)`,
  boxShadow: `0 0 22px rgba(212,137,42,0.35), inset 0 0 0 2px rgba(212,137,42,0.2)`,
  marginBottom: 4,
  transition: 'transform 0.3s ease',
}

const spiritBodyStyle: CSSProperties = {
  width: 130,
  height: 260,
  background: `linear-gradient(180deg, rgba(40,35,50,0.92) 0%, rgba(25,20,30,0.98) 100%)`,
  borderRadius: '8px 8px 4px 4px',
  boxShadow: `0 0 30px rgba(212,137,42,0.22), inset 0 0 0 1px rgba(212,137,42,0.12)`,
}

const spiritRuneStyle: CSSProperties = {
  position: 'absolute',
  top: 110,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 30,
  height: 30,
  border: `2px solid ${C.amberAccent}`,
  borderRadius: 4,
  boxShadow: `0 0 12px rgba(212,137,42,0.6), inset 0 0 8px rgba(212,137,42,0.2)`,
  opacity: 0.8,
}

const kanjiPlaceholderWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}

const kanjiTextStyle: CSSProperties = {
  fontFamily: C.fontSerifKanji,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: '0.02em',
  // FIX-B (2026-05-31): same ink-rough SVG filter as the win number -- when the
  // calligraphy PNG is missing, the CSS kanji fallback shares the identical ink
  // surface grammar. Static paint quality, not a motion keyframe.
  filter: 'url(#oo-rei-ink-rough)',
}

// ─── DEV export — playground phase timeline scrubber ─────────────────────────
//
// The playground imports this to render labeled phase tick-marks on its
// phase timeline scrubber. Never used in the production game path.
// Aliased with underscore prefix to signal "dev/internal use only".
//
// eslint-disable-next-line @typescript-eslint/naming-convention
export { TIER_CONFIG as _TIER_CONFIG_DEV }

// ─── CSS Keyframes ────────────────────────────────────────────────────────────
//
// ooReiCinematicKanjiStrike — corrected bloom direction per ufotable lesson:
//   START SMALL → OVERSHOOT slightly past 1.0 → SETTLE at 1.0
//   (not the previous "start large → compress down" which read as shrinking)
//
// ooReiCalligraphyBloom — calligraphy-veil hero bloom (Pass 2 2026-05-29 rev):
//   scale 0.85→1.0, blur 4px→0, opacity 0→1.0. Fires on impact phase.
//   Duration: 240ms ease-out cubic. RG-C5: identical for big and mega.
//   animationFillMode: 'both' on the img so the keyframe drives opacity fully
//   (no inline opacity override — that was capping the hero at 0.88).
//
// ooReiMultiplierReveal — Pass 2 (2026-05-29): replaces ooReiMultiplierFadeIn.
//   3-keyframe scale overshoot: 0.85 → 1.05 → 1.0.
//   0%: invisible + scaled down. 75%: visible + micro-overshoot at 1.05.
//   100%: settled at 1.0. Duration: MULTIPLIER_REVEAL_MS (200ms) — module-const.
//   RG-C5: scale values are authored constants, never varied by session or win amount.
//   display: 'inline-block' is applied inline on the span so transform: scale() applies.
//
// ooReiCharEnterRight / ooReiCharEnterLeft — edge silhouettes for calligraphy-veil.
//   Pass 2 (2026-05-29): terminal opacities updated to match new silhouette widths:
//   Rei (right) 0.38 → 0.55, spirit (left) 0.25 → 0.40.
//   RG-C5: identical timing for big and mega.
//
// prefers-reduced-motion: no keyframe-based motion — opacity cross-fade only.
const CINEMATIC_KEYFRAMES = `
@keyframes ooReiMultiplierReveal {
  0%   { opacity: 0; transform: scale(0.85); }
  75%  { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1.00); }
}
@keyframes ooReiKanjiApex {
  0%   { opacity: 0; }
  40%  { opacity: 1; }
  100% { opacity: 0.18; }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes ooReiKanjiApex {
    from { opacity: 0; }
    to   { opacity: 0.18; }
  }
}
@keyframes ooReiCinematicBrushSweep {
  from {
    clip-path: inset(0 100% 0 0);
    opacity: 0.3;
  }
  to {
    clip-path: inset(0 0% 0 0);
    opacity: 0.72;
  }
}
@keyframes ooReiCinematicKanjiStrike {
  0%   { transform: scale(0.6);  opacity: 0; filter: brightness(1.8); }
  12%  { transform: scale(1.12); opacity: 1; filter: brightness(1.2); }
  20%  { transform: scale(1.0);  opacity: 1; filter: brightness(1);   }
  85%  { transform: scale(1.0);  opacity: 1; filter: brightness(1);   }
  100% { transform: scale(0.95); opacity: 0; filter: brightness(0.8); }
}
@keyframes ooReiCalligraphyBloom {
  from { transform: scale(0.85); opacity: 0; filter: blur(4px); }
  to   { transform: scale(1.00); opacity: 1.0; filter: blur(0px); }
}
@keyframes ooReiCharEnterRight {
  from { transform: translateX(40px); opacity: 0; }
  to   { transform: translateX(0); opacity: 0.55; }
}
@keyframes ooReiCharEnterLeft {
  from { transform: translateX(-40px); opacity: 0; }
  to   { transform: translateX(0); opacity: 0.40; }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes ooReiMultiplierReveal {
    from { opacity: 0; transform: scale(1); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes ooReiCinematicBrushSweep {
    from { opacity: 0; }
    to   { opacity: 0.72; }
  }
  @keyframes ooReiCinematicKanjiStrike {
    from { opacity: 0; transform: scale(1); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes ooReiCalligraphyBloom {
    from { opacity: 0; }
    to   { opacity: 1.0; }
  }
  @keyframes ooReiCharEnterRight {
    from { opacity: 0; }
    to   { opacity: 0.55; }
  }
  @keyframes ooReiCharEnterLeft {
    from { opacity: 0; }
    to   { opacity: 0.40; }
  }
}
`

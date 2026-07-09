'use client'

/**
 * OoReiExperience — the player surface for OO-REI.
 *
 * Anime Cinematic slot game. 5×3 fixed grid, 20 paylines.
 * Rei — silver-haired talisman bearer — stands in front of the slot grid.
 * An ancient earth spirit looms behind the reels during Spirit Bonus.
 *
 * Architecture (Z-layer stack):
 *   z-0: OoReiSceneBackdrop (AI raster, rice paddy plates)
 *   z-1: Spirit figure (inside OoReiCharacterLayer, behind canvas)
 *   z-2: OoReiSlotCanvas (Canvas2D mechanic layer)
 *   z-3: Rei character art (inside OoReiCharacterLayer, in front of canvas)
 *   z-4: HUD overlays (this component — talisman plaques, bet card, receipt)
 *
 * Per Tim verbatim: "artistic characters slightly in front of the slot grid"
 * — Rei is z-3, grid is z-2. She is always in front.
 *
 * Brand register: Anime Cinematic.
 *   - Amber accent economy (4 jobs): header separator / leading anchor /
 *     spirit-aura mechanic / CTA button.
 *   - NO cyan anywhere in this component.
 *   - Talisman-paper HUD plates (NOT plopped CSS chrome — these look like
 *     dry paper pinned to bamboo stakes).
 *
 * RG compliance:
 *   - RG-C1: loss state is silent, no celebratory feedback
 *   - RG-C5: audio fns take zero state-dependent params
 *   - RG-C8: CASH OUT always visible, END BONUS always visible during bonus
 *
 * Domain C: presentation only.
 */

import {
  type CSSProperties,
  type ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'

import {
  hasSeenOoReiOnboarding,
  markOoReiOnboardingSeen,
  OO_REI_COACHMARK_ANCHOR,
  OO_REI_ONBOARDING_KEY,
  OO_REI_ONBOARDING_SCREENS,
} from './ooReiOnboarding'

// ─── Spirit-bonus curtain timing (RG-C5 module-const) ─────────────────────────
// Per art-director 2026-05-28: spirit-bonus-entry phase runs ~800ms total.
// The painted curtain fades in over 200ms, holds, then fades out as the phase
// transitions to free-spinning. Module-level so the timing never streak-scales.
const CURTAIN_FADE_IN_MS = 200
const CURTAIN_HOLD_MS = 400
const CURTAIN_PEAK_OPACITY = 0.92

// ─── Lobby spirit presence (RG-C5 module-const) — Tim 2026-06-02 Fix 2 ───────
// The LOBBY storm-dragon is a SUBTLE, atmospheric presence integrated into the
// storm sky — NOT the bold dead-centre in-game mass (which Tim rejected as
// "pasted-looking"). 0.34 keeps the dragon reading as part of the storm vista
// behind Rei, not a competing focal object. The is-lobby gating in
// OoReiCharacterLayer ALSO shifts it off-centre/upper so it never sits dead-centre
// behind Rei. This is a fixed presentation constant — never scaled by wager,
// streak, session, or the in-game gauge ramp (the lobby is isolated from the
// in-game spirit treatment by design).
const OO_REI_LOBBY_SPIRIT_OPACITY = 0.34

// ─── Integrated bottom HUD band height (RG-C5 module-const) ──────────────────
// DEPRECATED 2026-05-31 responsive-interface-plan:
//   Use ZONE_HEIGHTS[layoutTier].railH from ooReiLayout.ts instead.
//   These exports remain for downstream consumers (OoReiSpiritGauge,
//   OoReiCharacterLayer) until they are individually migrated.
//   New code must NOT reference these consts — use railHeightForTier() instead.
//
// Legacy values preserved:
//   HUD_BAND_HEIGHT_DESKTOP = 200  (was LAYOUT_CONFIG.lg.railH = 208 in new system)
//   HUD_BAND_HEIGHT_TABLET  = 84   (was LAYOUT_CONFIG.md.railH = 88 in new system)
//   HUD_BAND_HEIGHT_MOBILE  = 194  (was LAYOUT_CONFIG.xs.railH = 200 in new system)
/** @deprecated Use railHeightForTier(layoutTier) from ooReiLayout */
export const HUD_BAND_HEIGHT_DESKTOP = 200 as const
/** @deprecated Use railHeightForTier(layoutTier) from ooReiLayout */
export const HUD_BAND_HEIGHT_TABLET  = 84 as const
/** @deprecated Use railHeightForTier(layoutTier) from ooReiLayout */
export const HUD_BAND_HEIGHT_MOBILE  = 194 as const

// ─── Win panel ink-number reveal duration (RG-C5 module-const) ──────────────
// InkNumber fade-in on the in-canvas win-reveal panel. Module-level so it is
// never scaled by session state or win magnitude (RG-C5 structural).
const WIN_PANEL_REVEAL_MS = 200 as const

// ─── Win panel font sizes (RG-C5 module-const) ───────────────────────────────
// Matches the InkNumber sizes in the in-canvas panel. Desktop 60px, mobile 48px.
// Module-level so they are not computed per-render.
const WIN_PANEL_FONT_PX_DESKTOP = 60 as const
const WIN_PANEL_FONT_PX_MOBILE  = 48 as const

// ─── Seal reveal auto-dismiss dwell (RG-C5 module-const) ─────────────────────
// Spec B: seal-complete panel auto-dismisses after this dwell. X is early-out.
const SEAL_REVEAL_MS = 3500 as const

// ─── Chapter-close beat timing (RG-C5 module-const — narrative, not win) ─────
// "封印 · REGION SEALED" banner auto-dismisses after this dwell.
// Identical for every region — shape + duration are session-state-independent.
// NOT framed as a win (RG-C1). Fires post-settle only (RG-C1).
// 3000ms: long enough to read 2 lines of kanji + EN, short enough to not linger.
const CHAPTER_CLOSE_DISMISS_MS = 3000 as const

// ─── Region banner press-ack (Level 1 sub-100ms — GC1) ───────────────────────
const REGION_BANNER_PRESS_MS = 80 as const

// ─── Spirit Bonus tracker (Living Spirit Header — canvas-native) ─────────────
// The Spirit Bonus scatter tracker is now drawn inside OoReiSlotCanvas as the
// Living Spirit Header (carved into the board frame top). The rejected DOM
// marquee + its SCATTER_PIP_*/SCATTER_MARQUEE_* sizing constants were removed
// (Tim 2026-06-02). The only remaining surface here is the screen-reader live
// region (see srOnlyStyle). The orb count is read display-only via
// countSpiritOrbs() and passed to the canvas as the scatterCount prop.

// ─── Micro-interaction timing consts (RG-C5 module-const — game-feel-engineer) ─
// All durations module-level so they never scale with session/streak state.
// NO cyan. No particles. Hover ends when pointer leaves.
const STEPPER_PRESS_MS = 80 as const
const STEPPER_HOVER_MS = 120 as const
const PLAQUE_HOVER_MS = 120 as const   // wager plaque hover — module-level RG-C5
const PLAQUE_PRESS_MS = 80 as const    // wager plaque press-ack sub-100ms — GC1
const WATER_BLOOM_ENTER_MS = 260 as const
const WATER_BLOOM_EXIT_MS = 200 as const
const WATER_BREATH_DURATION_MS = 3000 as const
const SPIRIT_GLYPH_HOVER_MS = 120 as const
const SPIRIT_GLYPH_PRESS_MS = 80 as const
const SPIRIT_GLYPH_TOOLTIP_DWELL_MS = 2000 as const
const CASHOUT_HOVER_MS = 120 as const

// ─── CTA hover micro-interaction constants (RG-C5 module-const) ──────────────
// game-feel-engineer: press-ack sub-100ms (GC1), hover-glow 180ms (desktop only).
// Amber rim intensification reads as "talisman paper warming + spirit energy
// gathering" per Tim's image 56 ask. Scale values match SKILL.md Level 1+2 spec.
// NO cyan. No particles. Hover ends when pointer leaves (no continuous idle juice).
const CTA_HOVER_TRANSITION = 'transform 180ms cubic-bezier(0.2, 0, 0, 1), box-shadow 180ms cubic-bezier(0.2, 0, 0, 1), filter 180ms cubic-bezier(0.2, 0, 0, 1)' as const
const CTA_PRESS_TRANSITION = 'transform 80ms cubic-bezier(0.2, 0, 0, 1)' as const
const CTA_HOVER_SHADOW = '0 0 0 1px rgba(212, 137, 42, 0.55), 0 0 18px rgba(212, 137, 42, 0.55), 0 4px 16px rgba(0,0,0,0.4)' as const
const CTA_HOVER_FILTER = 'brightness(1.10)' as const
const CTA_SCALE_HOVER = 'translateX(-50%) scale(1.015)' as const  // for positioned buttons
const CTA_SCALE_PRESS = 'translateX(-50%) scale(0.98)' as const
const CTA_SCALE_HOVER_INLINE = 'scale(1.015)' as const  // for non-positioned buttons
const CTA_SCALE_PRESS_INLINE = 'scale(0.98)' as const

// ─── Spirit identity kanji lookup (medallion spec — SPIRIT_PROCESSION sourced) ─
// Maps 1-based spirit index to its identity kanji (WHO is sealed, not gauge form).
// First 5 come from SPIRIT_PROCESSION (authored). 6-10 are unnamed ('?') per procession.
// BUG FIX: old code used SPIRIT_FORM_GLYPHS[spiritFormIndex] which shows the gauge
// FORM state (眠/揺/顕/輝/超), not the spirit IDENTITY (嵐/潮/炎/霧/影).
// The medallions show WHO is sealed; the gauge shows the form progression.
const SPIRIT_KANJI: Record<number, string> = Object.fromEntries(
  SPIRIT_PROCESSION.map((s, i) => [i + 1, s.kanji]),
) as Record<number, string>

// Spirit name labels for tooltip (narrative only — no economic framing, RG-safe)
const SPIRIT_NAMES: Record<number, string> = {
  1: 'ARASHI',
  2: 'KASAI',
  3: 'MIZUCHI',
  4: 'TSUCHI',
  5: 'KUMO',
  6: 'KORI',
  7: 'YAMI',
  8: 'HIKARI',
  9: 'KAZE',
  10: 'KAMI',
}
// Spirit-form descriptions — narrative, not economic (RG-C1/C5 safe)
const SPIRIT_FORM_DESCS: Record<number, string> = {
  1: 'Spirit Ally',
  2: 'Spirit Companion',
  3: 'Spirit Guardian',
  4: 'Spirit Awakened',
}

import {
  INK_FILTER_SVG_DEFS,
  InkNumber,
} from './ooReiInkNumber'
import { OoReiChapterClose } from './OoReiChapterClose'
import { OoReiCharacterLayer } from './OoReiCharacterLayer'
import { OoReiCinematicOverlay } from './OoReiCinematicOverlay'
import { OoReiSpiritSealing } from './OoReiSpiritSealing'
import { OoReiMapScreen } from './OoReiMapScreen'
import { OoReiSceneBackdrop } from './OoReiSceneBackdrop'
import { OoReiSealCollection } from './OoReiSealCollection'
import { OoReiSealReceipt } from './OoReiSealReceipt'
import { OoReiSlotCanvas } from './OoReiSlotCanvas'
import { OoReiSpiritGauge } from './OoReiSpiritGauge'
import { OoReiWardenRankChip } from './OoReiWardenRankChip'
import { OoReiWardenRewardsPanel } from './OoReiWardenRewardsPanel'
import { OoReiRankUpBanner } from './OoReiRankUpBanner'
import {
  bpsToLamports,
  countSpiritOrbs,
  formatPoints,
  formatUsdc,
  formatUsdcCompact,
  PUBLISHED_HOUSE_EDGE,
  PUBLISHED_RTP,
  SPIRIT_BONUS_TRIGGER_MIN,
  WAGER_INCREMENTS_LAMPORTS,
} from './ooReiMath'
import { useOoRei } from './ooReiProvider'
import {
  MYTH_REGIONS,
  cohesiveScenesForRegion,
  regionSpiritCutoutForRegion,
  regionSpiritSymbolForRegion,
  regionThemedSymbolsForRegion,
  slotBackdropForRegion,
} from './ooReiMythRegions'
import {
  AUDIO_MANIFEST,
  ensureAudio,
  MUSIC_OO_REI_THEME,
  playCashOut,
  playBigWinCinematic,
  playMegaWinCinematic,
  playSpiritBonusTrigger,
  playSpiritBonusFinale,
  playChipSelect,
} from './ooReiAudio'
import {
  type CinematicTier,
  type WinTier,
  computeWinTier,
  RECOVERY_BREATH_MS,
  SPIRIT_BONUS_FINALE_MS,
} from './ooReiSignatures'
import {
  spiritGaugeFillRatio,
  SPIRIT_FORM_OPACITY,
  SPIRIT_PROCESSION,
  type SpiritFormIndex,
} from './ooReiSpiritEvolution'
import { unlockAudioOnFirstGesture, useSwoobzAudio, useSwoobzMusic } from '../_shared/audio'
// ─── Responsive-interface-plan 2026-05-31 — new layout system ────────────────
import { ZONE_HEIGHTS, coachmarkClearancePx } from './ooReiLayout'
import { useOoReiLayoutTier } from './useOoReiLayoutTier'
import { OoReiInstrumentRail } from './OoReiInstrumentRail'

// Map a pending spirit-form event (form index reached) to its cinematic tier.
// Form 0 has no overlay (it is the resting/reset state). Forms 1..4 each map to
// their named moment (spec §8.2). Module-level — RG-C5 structural.
const SPIRIT_FORM_EVENT_TIER: Record<SpiritFormIndex, CinematicTier | null> = {
  0: null,
  1: 'spirit-form-1',
  2: 'spirit-form-2',
  3: 'spirit-form-3',
  4: 'spirit-form-4',
}

// ─── WIN count-up duration (module-const — RG-C5 structural) ─────────────────
// 600ms ease-out cubic, per swoobz-game-feel score-tick spec.
// Identical for all win amounts — amplitude never scales with session/streak.
const WIN_COUNTUP_DURATION_MS = 600 as const

// ─── Win-number overlay fallback delay (reliability fix — Tim 2026-06-02) ────
// The center win-number overlay normally mounts on the canvas savor callback
// (which fires after the reels land + the trace draws + the savor hold). On
// spins where that callback is delayed/lost (effect re-run mid-choreography),
// this deterministic timer guarantees the number still pops. Set to comfortably
// exceed the worst-case land+choreography latency (reel decel ~1.7s + light/trace
// /savor ~1.7s) while landing well inside the WIN_REVEAL_MS (4400ms) window, so
// a healthy canvas signal still wins (line-draws-first beat preserved) and a lost
// one is covered. RG-C5: module-const, identical for every tier/wager; the
// 'settled'-phase backstop covers any case where this still does not fire in time.
const WIN_OVERLAY_FALLBACK_MS = 3600 as const

/**
 * useWinCountUp — chunked rAF counter for the WIN HUD readout.
 *
 * Counts from the previous displayed value to `targetLamports` over
 * WIN_COUNTUP_DURATION_MS using ease-out cubic. Returns the current
 * display lamport value as a bigint (for formatUsdcCompact).
 *
 * RG-C5 structural: identical duration + easing for ALL win amounts.
 * The animation is driven by rAF, NOT setInterval (per game-feel-engineer spec).
 *
 * Reduced-motion: when `skip` is true, returns target immediately with no rAF.
 */
function useWinCountUp(targetLamports: bigint, skip: boolean): bigint {
  const [displayed, setDisplayed] = useState<bigint>(targetLamports)
  const prevTargetRef = useRef<bigint>(targetLamports)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (skip) {
      setDisplayed(targetLamports)
      prevTargetRef.current = targetLamports
      return
    }

    // If target didn't change, no animation needed
    if (targetLamports === prevTargetRef.current) return

    const startLamports = prevTargetRef.current
    const startTime = performance.now()
    prevTargetRef.current = targetLamports

    // Cancel any in-flight animation
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const tick = (now: number) => {
      const elapsed = now - startTime
      const t = Math.min(1, elapsed / WIN_COUNTUP_DURATION_MS)
      // Ease-out cubic: 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - t, 3)
      // Interpolate in number space for display (lamports is large but fits in JS number
      // safely for values up to 2^53; USDC display values are well within that range).
      const start = Number(startLamports)
      const end = Number(targetLamports)
      // Clamp to [0, end] before BigInt to prevent negative->BigInt->formatUsdc throw.
      // Floating-point drift between start and end can produce -0.0 or -1 at t≈0.
      const raw = Math.round(start + (end - start) * eased)
      const clamped = Math.max(0, Math.min(raw, Math.max(start, end)))
      setDisplayed(BigInt(clamped))
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDisplayed(targetLamports)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [targetLamports, skip])

  return displayed
}

// ─── Fluid type scale ─────────────────────────────────────────────────────────
// fluid(minPx, maxPx) returns clamp() anchored ~1280-1600px viewport.
// Use for every UI text that should grow with the window.
function fluid(minPx: number, maxPx: number): string {
  const slope = ((maxPx - minPx) / (1600 - 320)) * 100
  const intercept = minPx - slope * (320 / 100)
  return `clamp(${minPx}px, ${intercept.toFixed(2)}px + ${slope.toFixed(3)}vw, ${maxPx}px)`
}

// ─── Anime Cinematic palette (no cyan) ───────────────────────────────────────

const T = {
  bgCanvas: '#1a1612',
  substrate: '#2b2419',
  stormPurple: '#2d2438',
  amberAccent: '#d4892a',
  talismanGlow: '#f4a73e',
  talismanPaper: '#e8dfc8',
  riceStalk: '#5a4f2d',
  wetRock: '#26252a',
  fontMono: '"Geist Mono", ui-monospace, monospace',
  fontBody: '"Geist", system-ui, sans-serif',
  /** CJK display face for in-scene kanji glyphs (霊符 seals, 奉 offering, 霊宿る bonus).
   *  Geist Sans/Mono remain the UI faces. Kanji legitimately needs a CJK serif. */
  fontKanji: '"Noto Serif JP", "Yu Mincho", serif',
  textPrimary: '#e8dfc8',
  textMuted: 'rgba(232, 223, 200, 0.62)',
  borderSubtle: 'rgba(232, 223, 200, 0.12)',
  borderDefault: 'rgba(232, 223, 200, 0.22)',
  borderAmber: 'rgba(212, 137, 42, 0.55)',
  cellPaper: 'rgba(26, 22, 18, 0.88)',
} as const

// ─── Win calligraphy tier-to-PNG mapping (art-director spec B.4) ─────────────
// Maps WinTier → calligraphy PNG path for the win panel background layer.
// 'nice' → no panel (canvas banner only). 'none' → no panel.
// PNGs are self-authored assets already on disk in /assets/generated/oo-rei/win-calligraphy/.
// Spec opacity: 'good' = 0.60 (whisper accent), all others = 0.88 (hero).
const WIN_CALLIGRAPHY: Record<string, { path: string; opacity: number; label: string }> = {
  good:   { path: '/assets/generated/oo-rei/win-calligraphy/brushstroke-amber.png',      opacity: 0.60, label: 'WIN'              },
  big:    { path: '/assets/generated/oo-rei/win-calligraphy/kanji-daisho-big-win.png',   opacity: 0.88, label: 'BIG WIN'          },
  mega:   { path: '/assets/generated/oo-rei/win-calligraphy/kanji-shinsho-god-win.png',  opacity: 0.88, label: 'MEGA WIN'         },
  // spirit-bonus finale uses the lightning kanji
  'spirit-bonus': { path: '/assets/generated/oo-rei/win-calligraphy/kanji-raiko-lightning.png', opacity: 0.88, label: 'SPIRIT UNLEASHED' },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OoReiExperience(): ReactElement {
  const controller = useOoRei()
  const {
    phase,
    wagerLamports,
    grid,
    backdropState,
    characterPose,
    talismanAwakenActive,
    spiritGaugeLamports,
    gaugeCap,
    spiritFormIndex,
    pendingSpiritFormEvent,
    clearSpiritFormEvent,
    sealedSpiritCount,
    currentSpiritIndex,
    spinCountThisCycle,
    cycleOwnershipPointsTotal,
    pendingSealEvent,
    dismissSealReceipt,
    // Myth map layer
    regionState,
    mapOpen,
    openMap,
    closeMap,
    pendingChapterClose,
    dismissChapterClose,
    confirmSeal,
    activeAllyKanji,
    chooseAlly,
    wardenRank,
    lifetimeSealPoints,
    rankUpTier,
    clearRankUp,
    goToBetEntry,
    lastSpinStops,
    setWager,
    activateTalismanAwaken,
    spin,
    sealScroll,
    endBonus,
    cashOut,
    // dismissReceipt no longer used — CAST AGAIN now calls spin() directly
    // for one-step respin (Tim image 61/62 verbatim 2026-05-28: "there are
    // now two steps every time you want to respin"). The provider's spin()
    // already accepts being called from 'settled' phase.
  } = controller

  // Silence lint — spinCountThisCycle and cycleOwnershipPointsTotal are
  // consumed by OoReiSealReceipt via pendingSealEvent only, not directly here.
  void spinCountThisCycle
  void cycleOwnershipPointsTotal

  // ── Audio wiring (audio-design-director 2026-05-28) ──────────────────────
  // useSwoobzAudio preloads the Kenney sample stubs; WebAudio synth fallback
  // fires if Howler hasn't loaded the sample yet.
  // useSwoobzMusic loops the spirit-paddy-dusk ambient at MUSIC_VOLUME = 0.35
  // (ASSET_STUB until dedicated CC0 track lands).
  useSwoobzAudio(AUDIO_MANIFEST)
  const audioReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useSwoobzMusic(MUSIC_OO_REI_THEME, { reducedMotion: audioReducedMotion })

  const isSpinning = phase.kind === 'spinning'
  const isFreeSpin = phase.kind === 'free-spinning' || phase.kind === 'free-settling'
  const isActive = isSpinning || isFreeSpin

  const isSpiritBonusActive =
    phase.kind === 'free-spinning' ||
    phase.kind === 'free-settling' ||
    phase.kind === 'spirit-bonus-entry' ||
    phase.kind === 'spirit-bonus-end'

  const paylineWins = useMemo(() => {
    if (phase.kind === 'win-reveal') return phase.paylineWins
    if (phase.kind === 'free-settling') return phase.paylineWins
    if (phase.kind === 'settled') return phase.paylineWins
    return []
  }, [phase])

  // Winning state PERSISTS through 'settled' until the next spin (Tim 2026-05-30:
  // "do not reset the winning state until the next spin"). Loss-settles carry no
  // paylineWins, so nothing highlights — the canvas gates every win visual on
  // paylineWins membership. The next spin clears paylineWins → highlight clears.
  const showWinHighlight =
    phase.kind === 'win-reveal' ||
    phase.kind === 'free-settling' ||
    phase.kind === 'settled'

  const stickyWildCells = useMemo(() => {
    if (phase.kind === 'free-spinning') return phase.stickyWildCells
    if (phase.kind === 'free-settling') return phase.stickyWildCells
    return new Set<string>()
  }, [phase])

  // ── shellRef — must be declared BEFORE useOoReiLayoutTier hook ─────────────
  // The hook attaches a ResizeObserver to this element.
  const shellRef = useRef<HTMLDivElement | null>(null)

  // ── Layout tier — single ResizeObserver (responsive-interface-plan 2026-05-31) ─
  // Replaces the three separate ResizeObserver callbacks (isMobile, isTablet, hudBandHeight).
  // One ResizeObserver, one layoutTier string, all layout decisions derived from it.
  const {
    layoutTier,
    isMobile,
    isTablet,
    hudBandHeight: hudBandHeightFromTier,
    gaugeOrientation: gaugeOrientationFromTier,
  } = useOoReiLayoutTier(shellRef)

  // isNarrowTablet DEPRECATED — was 481–550px special case. Not needed in new system.
  // Retained as false so any remaining references don't break at compile time.
  const isNarrowTablet = false

  // ── Session P&L (spec C — Glass Box, factual, can be negative) ───────────
  // Pure bigint sums. No RTP change. Display only. Reset on cashOut (lobby).
  // sessionNetLamports = returned - wagered (signed bigint).
  const [sessionWageredLamports, setSessionWageredLamports] = useState<bigint>(0n)
  const [sessionReturnedLamports, setSessionReturnedLamports] = useState<bigint>(0n)

  // Reset session P&L on a fresh session. With the lobby removed (direct play),
  // 'bet-entry' is the fresh-start state: it occurs at initial mount + after
  // cashOut, never mid-session (the loop is bet-entry → spinning → … → settled →
  // spinning, with CAST AGAIN re-spinning directly). So resetting here zeroes the
  // session totals on a new session exactly as the old lobby reset did.
  useEffect(() => {
    if (phase.kind === 'bet-entry') {
      setSessionWageredLamports(0n)
      setSessionReturnedLamports(0n)
    }
  }, [phase.kind])

  // Accumulate session P&L on every settled spin.
  // phase.kind === 'settled' fires once per settled spin; wagerLamports is the
  // wager for that spin; phase.totalWinLamports is the return.
  useEffect(() => {
    if (phase.kind !== 'settled') return
    setSessionWageredLamports((prev) => prev + wagerLamports)
    setSessionReturnedLamports((prev) => prev + phase.totalWinLamports)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // sessionNetLamports: signed. Use BigInt arithmetic, never convert to Number for display.
  const sessionNetLamports = sessionReturnedLamports - sessionWageredLamports

  // ── Chip tray state (progressive wager selector) ──────────────────────────
  const [chipTrayOpen, setChipTrayOpen] = useState(false)
  const openChipTray = useCallback(() => setChipTrayOpen((v) => !v), [])
  // Close chip tray when phase changes away from bet-entry or on spin start
  useEffect(() => {
    if (phase.kind !== 'bet-entry' && phase.kind !== 'settled') {
      setChipTrayOpen(false)
    }
  }, [phase.kind])

  // WAGER popover anchor (Tim 2026-06-04: the picker must bloom from the BET
  // plaque, not float centred over the board). On open we measure the plaque's
  // shell-local rect (the plaque carries data-oo-rei-wager-anchor). null until
  // measured → the popover falls back to its old centred placement so it can
  // never disappear if the plaque is missing. Measured in useLayoutEffect (after
  // layout, before paint) so there is no from-centre flicker.
  const [wagerAnchorRect, setWagerAnchorRect] = useState<{
    left: number
    width: number
    shellWidth: number
  } | null>(null)
  useLayoutEffect(() => {
    if (!chipTrayOpen) {
      setWagerAnchorRect(null)
      return
    }
    const shell = shellRef.current
    if (shell === null) return
    const plaque = shell.querySelector<HTMLElement>('[data-oo-rei-wager-anchor]')
    if (plaque === null) return
    const pBox = plaque.getBoundingClientRect()
    const sBox = shell.getBoundingClientRect()
    if (pBox.width === 0 && pBox.height === 0) return
    setWagerAnchorRect({
      left: pBox.left - sBox.left,
      width: pBox.width,
      shellWidth: sBox.width,
    })
  }, [chipTrayOpen])

  // ── Receipt sheet state (spec D — opt-in expanded receipt) ───────────────
  const [receiptSheetOpen, setReceiptSheetOpen] = useState(false)
  useEffect(() => {
    if (phase.kind !== 'settled') setReceiptSheetOpen(false)
  }, [phase.kind])

  // CTA hover state — used for amber rim intensification + scale juice
  // (desktop only; @media (hover: hover) guard is enforced via JS window.matchMedia
  // so mobile touch surfaces never get a hover-stuck state from pointer-events:none)
  const [ctaHovered, setCtaHovered] = useState(false)
  const [ctaPressed, setCtaPressed] = useState(false)

  // ── Wager plaque press/hover state (Level 1+2 — GC1, PLAQUE_*_MS) ───────
  // stepperMinusPressed / stepperPlusPressed removed — DOM stepper retired.
  // Underlying stepWagerDown/stepWagerUp logic kept for keyboard/swipe.
  const [plaquePressed, setPlaquePressed] = useState(false)
  const [plaqueHovered, setPlaqueHovered] = useState(false)

  // ── Cash-out hover state (CASHOUT_HOVER_MS = 120ms desktop-guarded) ─────
  const [cashOutPressed, setCashOutPressed] = useState(false)
  const [cashOutHovered, setCashOutHovered] = useState(false)

  // ── Active glyph tooltip (spirit panel — narrative, RG-safe) ─────────────
  // activeGlyphTooltip: null = no tooltip. spiritIndex 1..N = that spirit's tooltip.
  // Auto-dismisses after SPIRIT_GLYPH_TOOLTIP_DWELL_MS (2000ms).
  const [activeGlyphTooltip, setActiveGlyphTooltip] = useState<number | null>(null)
  const glyphTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showGlyphTooltip = useCallback((spiritIdx: number) => {
    if (glyphTooltipTimerRef.current) clearTimeout(glyphTooltipTimerRef.current)
    setActiveGlyphTooltip(spiritIdx)
    glyphTooltipTimerRef.current = setTimeout(() => {
      setActiveGlyphTooltip(null)
    }, SPIRIT_GLYPH_TOOLTIP_DWELL_MS)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (glyphTooltipTimerRef.current) clearTimeout(glyphTooltipTimerRef.current)
    }
  }, [])

  // ── Water-art wager bloom state ───────────────────────────────────────────
  // chipTrayOpen is REPURPOSED as the water bloom flag (per spec: "reuse chipTrayOpen
  // state but render the wager-art screen"). The old floating chip tray is deprecated.
  // waterArtHovered removed — the water-art panel is replaced by the wager plaque in COL-4.
  // The wager plaque onClick calls openChipTray (same state). No hover state needed here.

  // ── Spirit Gauge orientation — derived from layoutTier (responsive-interface-plan 2026-05-31) ─
  // Threshold: xs tier (< 481px) uses horizontal gauge (left margin too tight).
  // All other tiers use vertical gauge in the left dead-space margin.
  // Previously: separate ResizeObserver with 360px threshold. Now: from useOoReiLayoutTier hook.
  const gaugeOrientation = gaugeOrientationFromTier

  // Spirit Gauge display ratio (presentation float — never re-enters math).
  // gaugeCap from provider: wager-relative (wagerLamports * SPIRIT_GAUGE_CYCLES_SPINS_TARGET).
  const spiritGaugeRatio = spiritGaugeFillRatio(spiritGaugeLamports, gaugeCap)

  // ── Current region for the persistent banner ──────────────────────────────
  // Pure derivation from regionState (already computed by the provider).
  // activeRegionForBanner: the single 'active' region, or null when all cleared.
  const activeRegionForBannerReal = useMemo(
    () => regionState.regions.find((dr) => dr.state === 'active') ?? null,
    [regionState],
  )

  // ── DEV-ONLY: region override for QA (display-state only, never balance/RTP) ─
  // window.__ooReiSetRegion('tide-shore') lets QA switch the active region to
  // capture all 5 spirit blend modes / cell palettes without game progression.
  // Guarded by NODE_ENV !== 'production'. Torn down on unmount.
  // NEVER wires into game state, provider, or any financial path.
  const [devRegionOverride, setDevRegionOverride] = useState<string | null>(null)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      ;(window as unknown as Record<string, unknown>)['__ooReiSetRegion'] = (
        regionId: string | null,
      ) => setDevRegionOverride(regionId)
    }
    return () => {
      if (process.env.NODE_ENV !== 'production') {
        delete (window as unknown as Record<string, unknown>)['__ooReiSetRegion']
      }
    }
  }, [])

  // When a dev override is active, synthesise a fake DerivedMythRegion so all
  // consumers (backdrop, character layer, canvas palette) see the override region.
  // Null override → use real provider state.
  const activeRegionForBanner = useMemo(() => {
    if (process.env.NODE_ENV !== 'production' && devRegionOverride !== null) {
      const overrideConfig = MYTH_REGIONS.find((r) => r.id === devRegionOverride)
      if (overrideConfig) return { region: overrideConfig, state: 'active' as const }
    }
    return activeRegionForBannerReal
  }, [activeRegionForBannerReal, devRegionOverride])

  // ── B.3: Cohesive scene derivation (Storm Coast art set, 2026-05-31) ─────
  // When the active region has a cohesive scene, resolve the correct variant
  // based on the current viewport width (isMobile = width < 768px → portrait,
  // wider → wide). The scene is a full-bleed composition that already contains
  // Rei and the spirit, so the character layers are hidden when it is active.
  // FALLBACK: if cohesiveScenesForRegion returns null (no scene for this
  // region), cohesiveSrc stays null and the old backdrop + character path
  // is used unchanged.
  const cohesiveScene = useMemo(
    () =>
      activeRegionForBanner
        ? cohesiveScenesForRegion(activeRegionForBanner.region.id)
        : null,
    [activeRegionForBanner],
  )
  // Select wide vs portrait variant based on current viewport width.
  // isMobile breakpoint: < 768px (portrait variant matches the 576x1024 asset).
  const cohesiveSrc = cohesiveScene
    ? isMobile
      ? cohesiveScene.portrait
      : cohesiveScene.wide
    : null
  // Guard: character layers (Rei + spirit) are HIDDEN when a cohesive scene is
  // active in base-play (not during Spirit Bonus -- the bonus phase overrides
  // the backdrop with the spirit-bonus plate, so Rei/spirit reappear there).
  const hasCohesiveScene = cohesiveSrc !== null && backdropState !== 'spirit-bonus'

  // ── B.2 expanded: themed symbol skins (Storm Coast, 2026-05-31) ──────────
  // Partial record of SymbolId -> themed asset path. Null when no themed set
  // is available for the active region (canvas falls back to default assets).
  const regionThemedSymbols = useMemo(
    () =>
      activeRegionForBanner
        ? regionThemedSymbolsForRegion(activeRegionForBanner.region.id)
        : null,
    [activeRegionForBanner],
  )

  // Gauge is visible on all non-lobby phases (mirrors the rail).
  const isGaugeVisible = phase.kind !== 'lobby'

  // ── Next-region data for OoReiChapterClose (Phase C) ─────────────────────
  // Derived from pendingChapterClose.nextRegionNameEN matched against MYTH_REGIONS.
  // Pure presentation derivation — no financial state. Domain C.
  const nextRegionForChapterClose = useMemo(() => {
    if (!pendingChapterClose?.nextRegionNameEN) return null
    return MYTH_REGIONS.find(
      (r) => r.nameEN.toLowerCase() === pendingChapterClose.nextRegionNameEN!.toLowerCase()
    ) ?? null
  }, [pendingChapterClose])

  // Win pulse: fires once when win-reveal phase mounts
  const [winPulseActive, setWinPulseActive] = useState(false)
  useEffect(() => {
    if (phase.kind === 'win-reveal') {
      setWinPulseActive(true)
      const t = setTimeout(() => setWinPulseActive(false), 600)
      return () => clearTimeout(t)
    }
    return undefined
  }, [phase.kind])

  // ── WIN-number overlay controller (RELIABILITY FIX — Tim 2026-06-02) ───────
  // BUG: "sometimes your winnings do not even pop up as an overlay — you do not
  // see the number you won." The center win-number panel used to mount ONLY on
  // `phase.kind === 'win-reveal' && winRevealPanelReady`, where winRevealPanelReady
  // was set EXCLUSIVELY by the canvas onWinSavorComplete callback. That callback
  // sits at the end of a setTimeout chain that (a) only starts once every reel has
  // visually landed (~1.7s after win-reveal begins) and (b) re-arms whenever the
  // win-reveal effect re-runs (paylineWins is a useMemo on `phase`, so the
  // win-reveal→settled flip mints a NEW array identity, re-running the effect and
  // clearing the pending savor timer). On some spins the savor signal therefore
  // fired AFTER the provider had already advanced win-reveal→settled (after
  // WIN_REVEAL_MS), at which point the old `phase.kind === 'win-reveal'` guard
  // rejected it and the number never appeared.
  //
  // FIX: drive the overlay off an OWN state machine with THREE independent mount
  // triggers (any one mounts it) and persist it across the win-reveal→settled
  // flip so a late/lost canvas signal can never hide the number:
  //   1. canvas savor callback (handleWinSavorComplete) — earliest, preserves the
  //      "line draws before the number" beat when timing is healthy.
  //   2. a deterministic module-const fallback timer armed when win-reveal starts
  //      on a qualifying win — guarantees the mount even if the canvas signal is lost.
  //   3. the phase reaching 'settled' with a qualifying win — the absolute backstop.
  // The overlay dismisses only when the phase leaves the win/settled cluster (next
  // spin), so it holds for the full WIN_REVEAL_MS window. RG-C5: all timing is
  // module-const, identical for every tier/wager; perf-clock setTimeout only.
  const [winOverlayActive, setWinOverlayActive] = useState(false)
  // Stable callback passed to canvas — primary (earliest) mount trigger.
  // Fires once per win sequence; idempotent (setState to the same value is a no-op).
  const handleWinSavorComplete = useCallback(() => {
    setWinOverlayActive(true)
  }, [])
  // Deterministic fallback + backstop + dismiss, all keyed off phase.
  // A qualifying win = a settled-or-revealing return strictly above the 'none'
  // tier (computeWinTier !== 'none'); RG-C1 keeps sub-break-even returns silent.
  useEffect(() => {
    // Dismiss the overlay the moment the phase leaves the win/settled cluster
    // (i.e. the next spin starts, or the bonus path takes over). This is what
    // gives the overlay its WIN_REVEAL_MS dwell without a self-cancelling timer.
    if (phase.kind !== 'win-reveal' && phase.kind !== 'settled') {
      setWinOverlayActive(false)
      return undefined
    }
    // Only base-game scatter < 3 wins use this center number overlay; scatter ≥ 3
    // is the bonus-trigger narrative beat (mounted immediately, separate branch).
    // Both narrowed phases (win-reveal | settled) carry totalWinLamports.
    const total = phase.totalWinLamports
    const tier = computeWinTier(total, wagerLamports)
    const scatter = phase.kind === 'win-reveal' ? phase.scatterCount : 0
    if (tier === 'none' || scatter >= 3) return undefined
    if (phase.kind === 'settled') {
      // Backstop: the spin has settled and it is a win — the number MUST be on
      // screen. Mount synchronously (covers any lost/late canvas savor signal).
      setWinOverlayActive(true)
      return undefined
    }
    // win-reveal: arm the deterministic fallback. The canvas savor callback will
    // normally beat this (preserving the line-draws-first beat); if it is lost,
    // this fires the mount well inside the WIN_REVEAL_MS window. Monotonic
    // setTimeout only (no system-clock read). RG-C5: module-const offset.
    const fallback = setTimeout(() => {
      setWinOverlayActive(true)
    }, WIN_OVERLAY_FALLBACK_MS)
    return () => clearTimeout(fallback)
  }, [phase, wagerLamports])

  // Spirit-bonus curtain opacity — driven by phase.kind, animated via CSS
  // transition on the <img> element. Art-director 2026-05-28: full-canvas
  // painted curtain (towering shadowy spirit with amber flame curtains)
  // overlays during the 800ms spirit-bonus-entry phase, then fades out as
  // free-spinning begins.
  const [curtainOpacity, setCurtainOpacity] = useState(0)
  useEffect(() => {
    if (phase.kind === 'spirit-bonus-entry') {
      // Tiny rAF tick so the initial 0 paints before we transition to peak
      // (otherwise the CSS transition starts mid-render and no fade happens).
      const raf = requestAnimationFrame(() => setCurtainOpacity(CURTAIN_PEAK_OPACITY))
      const t = setTimeout(
        () => setCurtainOpacity(0),
        CURTAIN_FADE_IN_MS + CURTAIN_HOLD_MS,
      )
      return () => {
        cancelAnimationFrame(raf)
        clearTimeout(t)
      }
    }
    // When phase leaves spirit-bonus-entry, ensure curtain is fully gone
    setCurtainOpacity(0)
    return undefined
  }, [phase.kind])

  // Spirit overlay opacity — driven by the Spirit Evolution form index.
  // The looming spirit behind the grid VISIBLY GROWS as the gauge climbs across
  // forms (spec §5 table): the SPIRIT_FORM_OPACITY ramp from Form 0 → Form 4 1.0.
  // This is the "REI grows spirits" depth — a persistent, slowly strengthening
  // presence rather than a jump-scare cutout.
  //
  // `spiritOpacity` is the CANVAS in-board dragon presence (Fix 1, 2026-06-02):
  // it always follows the gauge ramp so the in-board dragon grows with the gauge.
  // The canvas itself only DRAWS the dragon in base-game board phases (headerBandH
  // > 0) — never in bonus, never in lobby (the canvas does not mount in lobby).
  const formSpiritOpacity = SPIRIT_FORM_OPACITY[spiritFormIndex] ?? 0

  // ── IN-CANVAS BAND DRAGON: RETIRED (Tim 2026-06-02) ──────────────────────────
  // Three architectures of "draw the dragon INTO the header band" (band-glow →
  // pale-loom → head-forward) all read FAINT on desktop. Root cause: the band is
  // the darkest, most tile-occluded strip of the whole scene — a dragon painted
  // there fights an un-winnable dark-on-dark trap (it only escaped on the tall
  // mobile layout where the head could clear up into the un-tiled title area).
  // The looming spirit is now carried entirely by the DOM z-1 layer
  // (OoReiCharacterLayer), which sits IN FRONT of the storm backdrop and BEHIND
  // the slot canvas: the head reads against the LIGHTER sky above/around the
  // board (Tim's #93 reference) and the body is naturally occluded by the opaque
  // board panel (the #94/#95 depth-weave, for free). spiritOpacity=0 disables the
  // in-canvas draw (it gates `dragonPresence > 0.001` in OoReiSlotCanvas).
  const spiritOpacity = 0

  // ── DOM z-1 spirit opacity (OoReiCharacterLayer) — the looming spirit ────────
  // The DOM z-1 spirit now OWNS the looming spirit in every phase:
  //   • LOBBY: a SUBTLE atmospheric storm-dragon integrated into the storm sky
  //     (is-lobby gating: low opacity + upper-right position). NOT a bold mass.
  //   • BASE-GAME BOARD: a BOLD upper-right loom (is-ingame-loom gating) — the
  //     dragon head crests over the board's top-right against the storm sky, body
  //     coiling down behind the right columns. Follows the gauge ramp so the
  //     spirit strengthens as REI grows it (floored strong so it reads from spin 1).
  //   • SPIRIT BONUS: the canvas band collapses, so the DOM spirit carries the
  //     bonus presence (centred loom, gauge ramp floored at the bonus 0.5).
  //   RG-C5: value is form/phase-driven, never streak/session/wager.
  const isLobbyPhase = phase.kind === 'lobby'
  const domSpiritOpacity = isLobbyPhase
    ? OO_REI_LOBBY_SPIRIT_OPACITY
    : isSpiritBonusActive
      ? Math.max(0.5, formSpiritOpacity)
      : Math.max(0.92, formSpiritOpacity)
  // Base-game board uses the bold upper-right loom; lobby + bonus keep their
  // existing centred/atmospheric treatments.
  const spiritLoomInGame = !isLobbyPhase && !isSpiritBonusActive

  // Board PANEL rect (CSS px, same coordinate space as the inset:0 character
  // layer) reported by OoReiSlotCanvas on layout change. Used to anchor the DOM
  // ARASHI dragon to the board's top-right corner so it drapes OVER the slot tile
  // area (Tim #98), not the viewport background. Null until the canvas mounts.
  const [boardRect, setBoardRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const handleBoardRect = useCallback(
    (r: { x: number; y: number; w: number; h: number }) => setBoardRect(r),
    [],
  )

  // ── Canvas win tier — passed to OoReiSlotCanvas for banner rendering ────
  // Unified tier ladder (2026-05-28 cohesion rebuild). Same computeWinTier()
  // authority drives both the canvas banner and the DOM cinematic overlay.
  // RG-C1: 'none' on sub-break-even wins (< 1.0x). RG-C5: no session state.
  const [canvasWinTier, setCanvasWinTier] = useState<WinTier>('none')

  // ── Cinematic overlay tier (Azuki-register big moment system) ────────────
  // Computed from phase + wager amounts. Module-const durations.
  // RG-C5: tier is determined solely by economic ratio — never streak/session.
  // RG-C1: loss phases never set a non-null cinematic tier.
  //
  // Spirit bonus finale: computed from spirit-bonus-end phase if total ≥ 50x.
  // The 50x threshold uses BigInt BPS math (Domain A floor-truncation).
  // wagerLamports * 50n = 50x minimum threshold in lamports.
  const [cinematicTier, setCinematicTier] = useState<CinematicTier | null>(null)

  // Won-multiplier BPS for the cinematic overlay pull-out phase reveal.
  // Set alongside setCinematicTier for 'big'/'mega' base-game wins only.
  // Null for: spirit-trigger, spirit-finale, spirit-form-*, 'good' whisper tier,
  // and any dev-forced tier with no economic win. RG-C1: null on loss states.
  // The overlay formats this as "20.00x" using formatMultiplierLocal (Domain C).
  // Domain A note: wagerLamports is the settled wager — no float arithmetic used.
  // The BPS ratio is computed as: (totalWinLamports * 10_000n) / wagerLamports.
  // Floor-truncation is house-favored (consistent with Domain A rounding rules).
  const [cinematicMultiplierBps, setCinematicMultiplierBps] = useState<bigint | null>(null)

  // Dev-mode test hook: exposes setCinematicTier via window.__ooReiSetCinematicTier
  // so Playwright can inject a cinematic tier directly without probabilistic RNG.
  // Only registered in development (NODE_ENV !== 'production').
  // Production builds: this useEffect body is dead code that tree-shakes away
  // since process.env.NODE_ENV is replaced at build time.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      ;(window as unknown as Record<string, unknown>)['__ooReiSetCinematicTier'] = setCinematicTier
      // Display-only: lets QA drive the FULL celebration incl. the win-number
      // reveal (pullout phase only renders the number when this is non-null).
      // Sets visual state only — never a balance/RTP value.
      ;(window as unknown as Record<string, unknown>)['__ooReiSetCinematicMultiplierBps'] = (
        bps: number,
      ) => setCinematicMultiplierBps(BigInt(Math.max(0, Math.floor(bps))))
    }
    return () => {
      if (process.env.NODE_ENV !== 'production') {
        delete (window as unknown as Record<string, unknown>)['__ooReiSetCinematicTier']
        delete (window as unknown as Record<string, unknown>)['__ooReiSetCinematicMultiplierBps']
      }
    }
  }, [setCinematicTier])

  useEffect(() => {
    if (phase.kind === 'win-reveal') {
      const tier = computeWinTier(phase.totalWinLamports, wagerLamports)
      // Set canvas win tier (banner) for all winning tiers
      setCanvasWinTier(tier)
      // Blueprint 2026-05-30 §2 build order item 8: GOOD WIN overlay removed.
      // 'good' (1.5-3.9x) uses canvas banner only (payline trace + amber cell glow).
      // No DOM cinematic overlay — the full BattleScene is disproportionate at this tier.
      // 'big' and 'mega' retain the full cinematic overlay.
      if (tier === 'mega' || tier === 'big') {
        setCinematicTier(tier)
        // Audio is NOT fired here. It is moved into handleCinematicImpactHoldStart
        // so the stinger peak lands at the visual impact-hold frame, not ~250ms early.
        // This closes the audio-visual sync gap (ufotable/MAPPA sync principle).
        // 'big' and 'mega': audio fires via onImpactHoldStart callback on the overlay.
      }
      // Multiplier reveal: 'big' and 'mega' only — these are the tiers where
      // the pull-out "WON X.xx×" moment is meaningful and warranted.
      // 'good' tier is the 1–2× whisper beat — the number would be anticlimactic.
      // Compute BPS ratio via floor-truncation (house-favored, Domain A rule).
      // Guard: wagerLamports must be > 0 to avoid divide-by-zero (enforced by
      // the bet-entry panel which requires a non-zero wager before spin).
      if ((tier === 'mega' || tier === 'big') && wagerLamports > 0n) {
        setCinematicMultiplierBps((phase.totalWinLamports * 10_000n) / wagerLamports)
      } else {
        setCinematicMultiplierBps(null)
      }
      // 'nice' and 'none' tiers: canvas banner only, no DOM overlay
    } else if (phase.kind === 'free-settling' && phase.paylineWins.length > 0) {
      // THROTTLE: full-screen Azuki DOM overlay is suppressed during free spins.
      //
      // Monte Carlo analysis (1M+ spins, two seeds, cross-method, 2026-05-28):
      // sticky-wild accumulation inside Spirit Bonus causes the MEGA tier to fire
      // on ~60% of free spins. Firing the 2500ms thunderstrike-clash cinematic
      // back-to-back through a bonus cheapens the "earned moment" — the studio
      // rule is 2–4 EARNED cinematics per game, not constant overlay churn.
      //
      // Per-spin feedback during free spins = in-canvas kanji banner only
      // (setCanvasWinTier below). Per-spin audio feedback = playWinSettle,
      // which the provider already emits on spinWinLamports > 0n — no new
      // audio is added here.
      //
      // The ONE earned bonus cinematic is the spirit-bonus-end branch below
      // (fires via setCinematicTier('spirit-finale') when total ≥ 50× wager).
      //
      // RG-C5: same computeWinTier logic — only economic ratio, no session state.
      // Use spinWinLamports (per-spin win only) — NOT bonusTotalWinLamports.
      // bonusTotalWinLamports is the running cumulative; using it would inflate
      // late-bonus tiers from tiny sub-break-even spins (RG-C1 violation).
      const tier = computeWinTier(phase.spinWinLamports, wagerLamports)
      setCanvasWinTier(tier)
      // No setCinematicTier / cinematic audio during free spins — see throttle above.
      setCinematicMultiplierBps(null)
    } else if (phase.kind === 'spirit-bonus-entry') {
      // Spirit bonus trigger cinematic — replaces the curtain-only moment
      // with the 1500ms "Awakening" overlay. The curtain still fires too
      // (both run in parallel at different z-layers).
      // Audio is moved into handleCinematicImpactHoldStart for sync.
      setCanvasWinTier('none')
      setCinematicTier('spirit-trigger')
      // spirit-trigger has no economic win figure (it is a narrative beat) → null
      setCinematicMultiplierBps(null)
    } else if (phase.kind === 'spirit-bonus-end') {
      // Spirit bonus finale — fires only if total bonus ≥ 50x wager.
      // Lowered from 100x to 50x (2026-05-28 cohesion rebuild): was statistically
      // unreachable at 100x, now a rare-but-earned moment at 50x.
      // Floor-truncation: house-favored.
      const threshold = wagerLamports * 50n
      // #9 FIX (RG-C2): also gate the cinematic on the sub-stake check.
      // A spirit-finale with bonusTotalWinLamports < wagerLamports is a net loss
      // displayed with celebratory win-cinematic treatment = RG-C2 violation.
      // The 50x threshold already makes this impossible in practice (50x > 1x),
      // but the structural gate is required for defence-in-depth and future-proofing.
      const isAboveStake = phase.bonusTotalWinLamports >= wagerLamports
      if (phase.bonusTotalWinLamports >= threshold && isAboveStake) {
        setCinematicTier('spirit-finale')
        playSpiritBonusFinale()
      }
      // spirit-finale overlays the total bonus win — but that is already shown
      // in the spirit-bonus-end DOM panel. The cinematic has its own "SPIRIT
      // DEPARTS" composition which does not benefit from a multiplier figure
      // (the total was accumulated over many spins, not a single bet outcome).
      // Pass null so the pull-out phase does not render a potentially confusing number.
      setCinematicMultiplierBps(null)
      setCanvasWinTier('none')
    } else {
      // All other phases: clear canvas win tier (no banner during idle/spinning/bet-entry)
      setCanvasWinTier('none')
      setCinematicMultiplierBps(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind])

  // ── Spirit Evolution form-change cinematic ──────────────────────────────
  // When the provider sets pendingSpiritFormEvent (a form threshold was crossed
  // this settled spin), fire the matching form-change cinematic, then clear the
  // pending event so it fires exactly once. The form moment is a NARRATIVE beat
  // driven by accumulated ownership progress — NOT by the win/loss outcome
  // (spec §8.4; RG-C1/RG-C2 safe). It carries no currency / win framing.
  //
  // The settled-phase win overlay (if any) is given priority: if a win tier is
  // already showing, we defer the form moment by leaving pendingSpiritFormEvent
  // set until the win overlay completes (handleCinematicComplete re-checks it).
  useEffect(() => {
    if (pendingSpiritFormEvent === null) return
    const formTier = SPIRIT_FORM_EVENT_TIER[pendingSpiritFormEvent]
    if (formTier === null) {
      clearSpiritFormEvent()
      return
    }
    // Only take the overlay slot if it is free (no win/bonus cinematic running).
    if (cinematicTier === null) {
      setCinematicTier(formTier)
      clearSpiritFormEvent()
    }
    // else: a win/bonus overlay owns the slot. Leave the event pending; the
    // overlay's onComplete clears its tier, this effect re-runs, slot is free.
  }, [pendingSpiritFormEvent, cinematicTier, clearSpiritFormEvent])

  // Handler called by OoReiCinematicOverlay when its duration completes.
  // Clears the overlay tier so it unmounts cleanly. The state machine
  // transition (win-reveal → settled, spirit-bonus-entry → free-spinning,
  // spirit-bonus-end → settled) is driven by the provider's existing
  // setTimeout logic — the overlay is additive, not blocking the SM.
  // (The spec says overlay DELAYS the transition; v1 keeps SM timing intact
  // and fires the overlay as a visual-only overlay. A future pass can gate.)
  const handleCinematicComplete = () => {
    setCinematicTier(null)
    setCinematicMultiplierBps(null)
  }

  // Audio sync callback — fires at the visual impact-hold frame inside the overlay.
  // Moves the stinger from t=0 (phase mount) to t=slideSpeedMs (impact frame), so
  // the taiko body peak lands within ≤80ms of the visual impact, not ~250ms early.
  // This closes the ufotable/MAPPA synchronisation gap.
  //
  // Reads cinematicTier from the ref so it is not stale at callback time.
  const cinematicTierRef = useRef(cinematicTier)
  cinematicTierRef.current = cinematicTier

  const handleCinematicImpactHoldStart = () => {
    const tier = cinematicTierRef.current
    if (tier === 'mega') {
      playMegaWinCinematic()
    } else if (tier === 'big') {
      playBigWinCinematic()
    } else if (tier === 'spirit-trigger') {
      playSpiritBonusTrigger()
    }
    // 'good', spirit-form-*, spirit-finale: no audio on impact (intentional).
  }

  // Clear the cinematic tier if the phase transitions away unexpectedly.
  // free-settling is intentionally EXCLUDED from this list: the overlay slot
  // must be force-cleared to null during free spins so no full-screen cinematic
  // can show. Base-game win-reveal, spirit-bonus-entry, and spirit-bonus-end
  // legitimately own the overlay slot — any other phase (including free-settling)
  // triggers a forced clear. This also means a pending form-change cinematic
  // cannot slip in mid-free-spin (desirable — don't interrupt the bonus run).
  useEffect(() => {
    const activeCinematicPhases: Array<typeof phase.kind> = [
      'win-reveal',
      'spirit-bonus-entry',
      'spirit-bonus-end',
    ]
    if (!activeCinematicPhases.includes(phase.kind)) {
      // #12 FIX: only null out cinematicMultiplierBps when the tier itself is
      // also being cleared. If the provider SM advances (win-reveal → settling)
      // while the overlay is still playing its pullout phase, the multiplierBps
      // prop must survive until handleCinematicComplete fires. Clearing it here
      // caused the win number to vanish mid-animation because the prop flipped
      // to null before the overlay reached its pullout render.
      setCinematicTier(null)
      // cinematicMultiplierBps is cleared in handleCinematicComplete (overlay done)
      // so the number stays visible through the full pullout → exiting arc.
    }
    // canvasWinTier is managed by the main cinematicTier useEffect above.
    // It clears to 'none' in the else branch for non-winning phases.
  }, [phase.kind])

  // Spirit seals count (free spins remaining)
  const freeSpinsRemaining =
    phase.kind === 'free-spinning' ? phase.spinsRemaining
    : phase.kind === 'free-settling' ? phase.spinsRemaining
    : null

  // Total free seals awarded this bonus run (the denominator for "N / total").
  // free-settling does not carry spinsTotal, so we hold the last spinsTotal we
  // saw during free-spinning in a ref. Display-only; reset when no longer in bonus.
  const freeSpinsTotalRef = useRef<number | null>(null)
  if (phase.kind === 'free-spinning') {
    freeSpinsTotalRef.current = phase.spinsTotal
  } else if (phase.kind === 'spirit-bonus-entry') {
    freeSpinsTotalRef.current = phase.freeSpinsAwarded
  } else if (
    phase.kind !== 'free-settling' &&
    phase.kind !== 'spirit-bonus-end' &&
    phase.kind !== 'spirit-sealing-entry' &&
    phase.kind !== 'spirit-sealing-active' &&
    phase.kind !== 'spirit-sealing-end'
  ) {
    // Left the bonus entirely — clear so a stale total never shows next run.
    freeSpinsTotalRef.current = null
  }
  const freeSpinsTotal = freeSpinsTotalRef.current

  // ── Scatter progress (Spirit Bonus tracker — display only) ────────────────
  // Live Spirit Orb count on the settled grid, read via countSpiritOrbs() (pure
  // read of the grid the provider already resolved — NO math/RTP touch). Shown
  // only on settled base-game phases (after the reels have landed) so the player
  // tracks toward the SPIRIT_BONUS_TRIGGER_MIN-orb Spirit Bonus, the same way Big
  // Bass surfaces its scatter counter. Suppressed during the bonus itself (the
  // FREE SEALS readout owns that phase) and while reels are in motion.
  // The marquee is the board's PERMANENT top header (board-anchored, seated in the
  // reserved header band). Shown in every base-game phase (hidden only in lobby +
  // during the bonus, which owns its own FREE SEALS readout) so the reserved zone
  // is never an empty gap and the bonus mechanic is always visible (0/3 teaser
  // pre-first-spin). scatterCount reflects the displayed grid (0 until first land).
  // showScatterProgress now ONLY gates the screen-reader live region (the visual
  // tracker is canvas-native: the Living Spirit Header). Hidden in lobby + bonus.
  const showScatterProgress =
    !isSpiritBonusActive && phase.kind !== 'lobby'
  const scatterCount = useMemo(
    () => (grid !== null ? countSpiritOrbs(grid) : 0),
    [grid],
  )

  // ── Living Spirit Header source (canvas-native scatter tracker — Tim 2026-06-02) ─
  // The active region's spirit cutout PNG. The Canvas2D Living Spirit Header
  // composites this looming figure across the board frame top and collects the
  // 3 Spirit Orbs into it (the rejected DOM marquee is gone). Falls back to the
  // shared shadow-loom cutout pre-region / unknown id. Display-only, RTP-neutral.
  const spiritHeaderSrc = useMemo<string>(
    () =>
      (activeRegionForBanner
        ? regionSpiritCutoutForRegion(activeRegionForBanner.region.id)
        : null) ?? '/assets/generated/oo-rei/spirit-shadow-loom.png',
    [activeRegionForBanner],
  )

  // ── Next region (unlockable hint — display only) ──────────────────────────
  // The single 'sealed' region with the lowest traversal order beyond the active
  // one. Calm "what you grind toward" hint; carries no economic value (RG §7).
  const nextRegionForUnlock = useMemo(() => {
    const sealed = regionState.regions
      .filter((dr) => dr.state === 'sealed')
      .map((dr) => dr.region)
      .sort((a, b) => a.traversalOrder - b.traversalOrder)
    return sealed[0] ?? null
  }, [regionState])

  const bonusTotalWin =
    phase.kind === 'free-spinning' ? phase.bonusTotalWinLamports
    : phase.kind === 'free-settling' ? phase.bonusTotalWinLamports
    : phase.kind === 'spirit-bonus-end' ? phase.bonusTotalWinLamports
    : null

  // ── Bottom rail win display (cohesion rebuild 2026-05-28) ────────────────
  // RG-C1: shows $0.00 on loss phases with NO color change or animation.
  // Only win-reveal and settled phases show a non-zero win value.
  // Bonus phases show accumulated bonus win.
  // All other phases (lobby, bet-entry, spinning, settling): 0.
  const railWinLamports: bigint =
    phase.kind === 'win-reveal' ? phase.totalWinLamports
    : phase.kind === 'settled' ? phase.totalWinLamports
    : bonusTotalWin ?? 0n

  // HUD band height: derived from layoutTier (responsive-interface-plan 2026-05-31).
  // Previously: separate ResizeObserver using old 481/901 thresholds.
  // Now: ZONE_HEIGHTS[layoutTier].railH via useOoReiLayoutTier hook.
  // xs=200, sm=200, md=88, lg=208.
  const hudBandHeight = hudBandHeightFromTier

  // HUD band is visible on all non-lobby phases (always-present, never a modal).
  const isHudVisible = phase.kind !== 'lobby'
  // During spinning: wager controls collapse; CTA shows "CASTING..."
  const isHudSpinning = phase.kind === 'spinning' || phase.kind === 'settling' ||
    phase.kind === 'free-spinning'

  // ── Chapter-close beat auto-dismiss ──────────────────────────────────────
  // Fires ONCE per region-clear event (post-settle, RG-C1). Module-const timer.
  // RG-C5: identical dismiss timing regardless of region identity or session state.
  const chapterCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (pendingChapterClose !== null) {
      // Cancel any in-flight timer (safety — should not happen; one event at a time).
      if (chapterCloseTimerRef.current !== null) {
        clearTimeout(chapterCloseTimerRef.current)
      }
      chapterCloseTimerRef.current = setTimeout(() => {
        dismissChapterClose()
        chapterCloseTimerRef.current = null
      }, CHAPTER_CLOSE_DISMISS_MS)
    }
    return () => {
      if (chapterCloseTimerRef.current !== null) {
        clearTimeout(chapterCloseTimerRef.current)
        chapterCloseTimerRef.current = null
      }
    }
  }, [pendingChapterClose, dismissChapterClose])

  // ── Region banner press-ack + hover state ────────────────────────────────
  // Desktop hover: amber border intensifies, background lightens slightly.
  // Hover ends immediately when pointer leaves (no continuous idle juice).
  const [regionBannerPressed, setRegionBannerPressed] = useState(false)
  const [regionBannerHovered, setRegionBannerHovered] = useState(false)
  // Warden's Path rewards panel (D.1 / M2) — the chip opens THIS, not the map.
  const [showRewards, setShowRewards] = useState(false)
  // The game ships isolated (no platform shell), so it owns the exit back to the
  // Originals catalogue. Router push, not a hard nav, to keep SPA state.
  const router = useRouter()

  // ── INFO panel (Paytable overlay) ────────────────────────────────────────
  // Opens an in-canvas overlay explaining symbols, the Spirit Orb (scatter+wild),
  // paylines, and goal. Tap outside to dismiss. No route, no modal portal.
  const [infoOpen, setInfoOpen] = useState(false)
  const closeInfo = useCallback(() => setInfoOpen(false), [])

  // ── Seal Collection overlay ───────────────────────────────────────────────
  // Opens when the player taps the gauge form badge.
  // No route, no modal portal. Dismissable by tap-outside.
  const [sealCollectionOpen, setSealCollectionOpen] = useState(false)
  const openSealCollection = useCallback(() => setSealCollectionOpen(true), [])
  const closeSealCollection = useCallback(() => setSealCollectionOpen(false), [])

  // ── Coachmark coordinator (Pass 5 · 2026-05-29) ───────────────────────────
  // Four in-canvas coachmark steps that surface the seal/region mechanic to
  // new players. Returns players see none; returning players see none.
  //
  // pendingCoachmarkId: which step is currently displayed (null = no coachmark).
  // Only non-null when !hasSeenOoReiOnboarding().
  //
  // RG-C5: the coachmark coordinator never reads session P&L, win amounts, or
  // streak state. It reads only phase transitions, a spin counter, and a first-
  // net-win boolean — all purely mechanical, not economic.
  const [pendingCoachmarkId, setPendingCoachmarkId] = useState<string | null>(null)

  // spinCountRef: incremented on every settled phase transition. Used to auto-
  // fire step 3 after 5 spins without a banner tap.
  const spinCountRef = useRef<number>(0)

  // firstNetWinFiredRef: set to true after step 4 fires once, preventing re-fire
  // on subsequent net-win spins.
  const firstNetWinFiredRef = useRef<boolean>(false)

  // bannerTappedRef: set to true when the region banner is tapped, allowing step
  // 3 to fire on the banner-tap path instead of waiting for 5 spins.
  const bannerTappedRef = useRef<boolean>(false)

  // hasFiredStep1Ref: prevents step 1 re-firing if phase cycles through bet-entry.
  const hasFiredStep1Ref = useRef<boolean>(false)

  // hasFirstSpinSettledRef: prevents step 2 re-firing on subsequent settles.
  const hasFirstSpinSettledRef = useRef<boolean>(false)

  // hasFiredStep3Ref: prevents the step-3 (region-map) coachmark re-firing on
  // EVERY settle once spinCount >= 5 (Tim 2026-06-02 "this map message triggers
  // like 100 times" → in fact once per spin). The old auto-fire only checked
  // `prev === null`, so after the player dismissed it the next settle re-showed
  // it. This ref makes step 3 fire AT MOST ONCE per session.
  const hasFiredStep3Ref = useRef<boolean>(false)

  // Dismiss all coachmarks and mark the flow as seen.
  const dismissCoachmarks = useCallback(() => {
    setPendingCoachmarkId(null)
    markOoReiOnboardingSeen()
  }, [])

  // Advance to the next coachmark id (or dismiss if at step 3 — step 4 is
  // triggered by a later economic event, not by CTA press).
  // Exported as a stable ref so the render section can use it.
  const advanceCoachmarkRef = useRef<(id: string) => void>(() => {})

  advanceCoachmarkRef.current = (currentId: string) => {
    const idx = OO_REI_ONBOARDING_SCREENS.findIndex((s) => s.id === currentId)
    // Step 3 CTA: dismisses and potentially opens map (handled inline in JSX).
    // Step 4 is the last — dismiss after Continue.
    // Steps 1 and 2: simply clear the coachmark (next one fires on its own trigger).
    setPendingCoachmarkId(null)
    // If we are completing the last step (step 4, idx 3), mark as seen.
    if (idx >= OO_REI_ONBOARDING_SCREENS.length - 1) {
      markOoReiOnboardingSeen()
    }
  }

  // Step 1: fires on first arrival at 'bet-entry' phase for new players.
  useEffect(() => {
    if (phase.kind !== 'bet-entry') return
    if (hasSeenOoReiOnboarding()) return
    if (hasFiredStep1Ref.current) return
    hasFiredStep1Ref.current = true
    const step = OO_REI_ONBOARDING_SCREENS[0]
    if (step) setPendingCoachmarkId(step.id)
  // phase.kind is the only dependency — intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind])

  // Step 2 + Step 3 spin counter: combined effect that fires on every 'settled'
  // phase transition. On the first settle it fires step 2 (400ms delay). On
  // subsequent settles it increments the spin counter for step 3.
  useEffect(() => {
    if (phase.kind !== 'settled') return
    if (hasSeenOoReiOnboarding()) return
    // Increment spin count on every settle (first settle = 1, second = 2, ...).
    spinCountRef.current += 1
    const count = spinCountRef.current
    if (count === 1) {
      // First settle: fire step 2 after 400ms.
      hasFirstSpinSettledRef.current = true
      const step = OO_REI_ONBOARDING_SCREENS[1]
      if (!step) return
      const t = setTimeout(() => {
        setPendingCoachmarkId(step.id)
      }, 400)
      return () => clearTimeout(t)
    }
    // Step 3 spin-count path: auto-fire after 5 spins if banner not tapped.
    if (count >= 5 && !bannerTappedRef.current && !hasFiredStep3Ref.current) {
      const step = OO_REI_ONBOARDING_SCREENS[2]
      if (step) {
        hasFiredStep3Ref.current = true  // fire at most once — never re-show every settle
        setPendingCoachmarkId((prev) => (prev === null ? step.id : prev))
      }
    }
    return undefined
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind])

  // Step 4: fires on first genuine net-win spin (winLamports > wagerLamports).
  useEffect(() => {
    if (phase.kind !== 'settled') return
    if (hasSeenOoReiOnboarding()) return
    if (firstNetWinFiredRef.current) return
    if (phase.totalWinLamports <= wagerLamports) return
    firstNetWinFiredRef.current = true
    const step = OO_REI_ONBOARDING_SCREENS[3]
    if (step) {
      setPendingCoachmarkId(step.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind])

  // Reset coachmark coordinator when the player clears their onboarding flag
  // (info-button "SHOW TUTORIAL AGAIN" action).
  // The reset is triggered by setting pendingCoachmarkId to step 1 externally.

  // Coachmark coordinator: find the current coachmark screen definition.
  const activeCoachmark = pendingCoachmarkId !== null
    ? OO_REI_ONBOARDING_SCREENS.find((s) => s.id === pendingCoachmarkId) ?? null
    : null

  // Dynamic CTA style for lobby CTA: hover → amber rim + scale 1.015 + brightness pop.
  // Press → scale 0.98. Ends when pointer leaves (no looping idle juice).
  // prefers-reduced-motion: if the OS requests it, skip scale; use filter only.
  // Desktop guard: we check window.matchMedia at render time — no hover state
  // leaks onto touch devices (they never fire pointerenter).
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // ── WIN count-up (FIX 1: cumulative win rAF counter) ─────────────────────
  // railWinLamports is already totalWinLamports (sum of ALL paylines) from
  // the provider. We animate it counting up over 600ms ease-out cubic.
  // Reduced-motion: skip animation, snap to value immediately.
  const displayedWinLamports = useWinCountUp(railWinLamports, prefersReducedMotion)

  const ctaDynamicStyle: CSSProperties = {
    ...ctaButtonStyle,
    transition: ctaPressed
      ? CTA_PRESS_TRANSITION
      : CTA_HOVER_TRANSITION,
    transform: prefersReducedMotion
      ? ctaButtonStyle.transform
      : ctaPressed
        ? CTA_SCALE_PRESS_INLINE
        : ctaHovered
          ? CTA_SCALE_HOVER_INLINE
          : undefined,
    boxShadow: !prefersReducedMotion && ctaHovered && !ctaPressed
      ? CTA_HOVER_SHADOW
      : undefined,
    filter: ctaHovered && !ctaPressed ? CTA_HOVER_FILTER : undefined,
  }

  // ctaLanternOpacity removed — lantern <img> elements removed from CAST button per spec.

  // Audio unlock helper — called on every first user gesture.
  // unlockAudioOnFirstGesture (Howler) + ensureAudio (WebAudio synth ctx).
  // Both are idempotent. iOS Safari requires user-gesture before AudioContext
  // can play; calling both ensures the Howler ctx AND the WebAudio synth ctx
  // are resumed before any playback attempt.
  function unlockAudioNow() {
    unlockAudioOnFirstGesture()
    ensureAudio()
  }

  const ctaHoverHandlers = {
    onPointerEnter: () => setCtaHovered(true),
    onPointerLeave: () => { setCtaHovered(false); setCtaPressed(false) },
    onPointerDown: () => { unlockAudioNow(); setCtaPressed(true) },
    onPointerUp: () => setCtaPressed(false),
    onPointerCancel: () => { setCtaHovered(false); setCtaPressed(false) },
  } as const

  // ── Determine CTA label + action from current phase ──────────────────────
  // The HUD band CTA is always visible (RG-C8). Its label and action shift
  // by phase but it is NEVER hidden (only dimmed+disabled during spinning).
  // HARD RULE: NEVER compound two actions in one CTA label (no "&").
  // CASH OUT is a SEPARATE button with separate affordance and hierarchy.
  // Blueprint 2026-05-30 §2 Component 6.
  const ctaLabel =
    isHudSpinning ? 'CASTING...'
    : phase.kind === 'settled' ? 'CAST AGAIN'
    : isSpiritBonusActive ? 'END BONUS'
    : 'CAST A SEAL'

  const ctaAction =
    isHudSpinning ? undefined
    : phase.kind === 'settled' ? spin
    : isSpiritBonusActive ? endBonus
    : spin // bet-entry + win-reveal: spinning starts

  // Recovery breath (QA 2026-05-30): RECOVERY_BREATH_MS was a dead const — on a
  // non-cinematic settle (loss, 'nice' tier) the CTA re-enabled within ~50ms, so
  // a fast tapper could re-spin with zero pacing beat. Hold the CTA for the
  // documented 500ms after every settle. Module-const duration (RG-C5).
  const [ctaInRecovery, setCtaInRecovery] = useState(false)
  useEffect(() => {
    if (phase.kind !== 'settled') {
      setCtaInRecovery(false)
      return
    }
    setCtaInRecovery(true)
    const t = setTimeout(() => setCtaInRecovery(false), RECOVERY_BREATH_MS)
    return () => clearTimeout(t)
  }, [phase.kind])

  // CAST AGAIN is gated while a win cinematic plays so the earned moment gets its
  // full time (Tim 2026-05-30: big/mega "went by too quickly" — the player could
  // previously spin straight through it). Re-enables on handleCinematicComplete.
  // Also gated for the recovery breath after every settle.
  const ctaDisabled = isHudSpinning || cinematicTier !== null || ctaInRecovery

  // ── Wager stepper handlers ────────────────────────────────────────────────
  const stepWagerDown = useCallback(() => {
    unlockAudioNow()
    playChipSelect()
    const idx = WAGER_INCREMENTS_LAMPORTS.indexOf(wagerLamports)
    const prev = idx > 0 ? WAGER_INCREMENTS_LAMPORTS[idx - 1] : WAGER_INCREMENTS_LAMPORTS[0]
    if (prev !== undefined) setWager(prev)
  }, [wagerLamports, setWager])

  const stepWagerUp = useCallback(() => {
    unlockAudioNow()
    playChipSelect()
    const idx = WAGER_INCREMENTS_LAMPORTS.indexOf(wagerLamports)
    const last = WAGER_INCREMENTS_LAMPORTS.length - 1
    const next = idx < last ? WAGER_INCREMENTS_LAMPORTS[idx + 1] : WAGER_INCREMENTS_LAMPORTS[last]
    if (next !== undefined) setWager(next)
  }, [wagerLamports, setWager])

  // Can the inline − / + wager steppers move (for disabling at the ends)?
  const wagerStepIdx = WAGER_INCREMENTS_LAMPORTS.indexOf(wagerLamports)
  const canStepWagerDown = wagerStepIdx > 0
  const canStepWagerUp = wagerStepIdx >= 0 && wagerStepIdx < WAGER_INCREMENTS_LAMPORTS.length - 1

  // ── Session P&L display helper (spec C) ──────────────────────────────────
  // NEVER pass a negative value to formatUsdc/formatUsdcCompact (they throw).
  // Compute abs + prefix '-' manually.
  function formatSessionNet(net: bigint): string {
    if (net >= 0n) return `+${formatUsdcCompact(net)}`
    return `-${formatUsdcCompact(-net)}`
  }

  return (
    <div
      ref={shellRef}
      style={shellStyle}
      data-testid="oo-rei-experience"
      data-phase={phase.kind}
      data-win-panel-ready={winOverlayActive ? 'true' : 'false'}
    >
      {/* ── Win panel entry keyframes — injected once, scoped to this component ──
          Hit-stop pop: scale 0.90→1.0 over 120ms ease-out, opacity 0→1 over 80ms.
          Tied to mount time (winOverlayActive), not to win amount.
          RG-C5: amplitude and timing are module-const, identical for all tiers. */}
      <style>{`
        @keyframes ooReiWinPanelEntry {
          from { transform: scale(0.90); opacity: 0; }
          to   { transform: scale(1.00); opacity: 1; }
        }
        @keyframes ooReiKanjiBloom {
          from { transform: scale(0.85); opacity: 0; filter: blur(4px); }
          to   { transform: scale(1.00); opacity: 1; filter: blur(0px); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ooReiWinPanelEntry {
            from { opacity: 1; }
            to   { opacity: 1; }
          }
          @keyframes ooReiKanjiBloom {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        }
      `}</style>
      {/* ── z-0: Backdrop ─────────────────────────────────────────────── */}
      <OoReiSceneBackdrop
        backdropState={backdropState}
        stormDeepen={isActive}
        activeAllyKanji={activeAllyKanji}
        regionVistaSrc={
          activeRegionForBanner
            ? slotBackdropForRegion(activeRegionForBanner.region.id)
            : null
        }
        cohesiveSrc={cohesiveSrc}
      />

      {/* ── z-1+z-3: Characters ───────────────────────────────────────── */}
      {/* hudBandHeight prop: anchors Rei's feet to the altar-band top edge,
          resolving the image-21 overlap (she stands ON the floor rail,
          stat cells are fully below her lowest visible pixel).
          B.3 guard: when a cohesive scene is active (hasCohesiveScene),
          Rei and the spirit are already embedded in the scene image, so the
          separate character layers are hidden (opacity:0 + pointer-events:none).
          The character layers are retained in the DOM so a region change back
          to a non-cohesive region instantly restores them without re-mounting.
          Revert path: remove hasCohesiveScene guard to restore old behaviour. */}
      <div
        aria-hidden={hasCohesiveScene ? 'true' : undefined}
        style={hasCohesiveScene ? cohesiveSceneCharacterHideStyle : undefined}
      >
        <OoReiCharacterLayer
          characterPose={characterPose}
          isSpinning={isSpinning}
          winPulseActive={winPulseActive}
          spiritOpacity={domSpiritOpacity}
          hudBandHeight={isHudVisible ? hudBandHeight : 0}
          activeRegionId={activeRegionForBanner?.region.id ?? null}
          isLobby={isLobbyPhase}
          inGameLoom={spiritLoomInGame}
          boardRect={boardRect}
        />
      </div>

      {/* ── z-2: Slot canvas — only after lobby (don't reveal reels until commit) */}
      {/* Reel grid frame — §4.7 vermillion hairline + idle amber drop-shadow.
          box-shadow inset hairline grounds the talisman tablets as a unified
          composition. filter drop-shadow creates a warm ambient glow.
          Pass 1 (2026-05-29). */}
      {phase.kind !== 'lobby' && (
        // THREE-LEVEL DEPTH (Tim #103, 2026-06-03): this wrapper is now a PURE
        // pass-through — NO z-index and NO filter — so it does NOT establish a
        // stacking context. The OoReiSlotCanvas renders TWO canvases that carry
        // their OWN z-index (BACK z-2 + FRONT z-4); they must reach the ROOT
        // stacking context so the z-3 DOM ARASHI dragon (in OoReiCharacterLayer)
        // sits BETWEEN them. If this wrapper kept zIndex:2 + filter (both create a
        // stacking context) the FRONT z-4 canvas would be trapped at root-z-2 and
        // the dragon (root-z-3) would cover the tiles — exactly Tim's rejected
        // state. The cosmetic frame + idle amber glow moved to a sibling z-2
        // decoration div below (box-shadow/filter there create their own context,
        // which is fine — that div has no children to trap).
        <>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              pointerEvents: 'none',
              // Vermillion hairline frame around the reel grid bounding rect
              boxShadow: 'inset 0 0 0 1px rgba(192,57,43,0.18)',
              // Idle amber outer glow — spirit aura at rest.
              // spec §5b: idle lifted from 0.08→0.14 so the board reads as warmed
              // by the amber atmosphere. Spirit bonus stays at 0.20 (distinct phase).
              filter: isSpiritBonusActive
                ? 'drop-shadow(0 0 32px rgba(212,137,42,0.20))'
                : 'drop-shadow(0 0 28px rgba(212,137,42,0.14))',
            }}
          />
          {/* pointer-events:all preserves the prior interaction surface on the
              canvas region. This div has NO z-index so it does not trap the
              canvases' own z-2 / z-4 (they reach the root stacking context). */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'all' }}>
            <OoReiSlotCanvas
              grid={grid}
              isSpinning={isActive}
              paylineWins={paylineWins}
              showWinHighlight={showWinHighlight}
              stickyWildCells={stickyWildCells}
              isSpiritBonusActive={isSpiritBonusActive}
              talismanAwakenCells={[]}
              winTier={canvasWinTier}
              onWinSavorComplete={handleWinSavorComplete}
              settledStops={lastSpinStops}
              regionSpiritSymbolSrc={
                activeRegionForBanner
                  ? regionSpiritSymbolForRegion(activeRegionForBanner.region.id)
                  : null
              }
              regionThemedSymbolSrcs={regionThemedSymbols}
              activeRegionId={activeRegionForBanner?.region.id ?? null}
              spiritHeaderSrc={spiritHeaderSrc}
              scatterCount={scatterCount}
              spiritOpacity={spiritOpacity}
              onBoardRect={handleBoardRect}
            />
          </div>
          {/* Screen-reader-only live region for the Spirit Bonus tracker. The
              Living Spirit Header is now canvas-native (no DOM marquee), so this
              hidden span preserves the polite announcement the removed marquee's
              aria-label used to carry. Visually hidden; present in the a11y tree. */}
          {showScatterProgress && (
            <span
              aria-live="polite"
              data-testid="oo-rei-scatter-progress"
              style={srOnlyStyle}
            >
              {scatterCount >= SPIRIT_BONUS_TRIGGER_MIN
                ? `Spirit Bonus triggered: ${scatterCount} of ${SPIRIT_BONUS_TRIGGER_MIN} spirit orbs landed`
                : `${scatterCount} of ${SPIRIT_BONUS_TRIGGER_MIN} spirit orbs toward the Spirit Bonus`}
            </span>
          )}
        </>
      )}

      {/* ── z-3: Spirit Evolution gauge ───────────────────────────────────
          The permanent prize-meter (spec §7). Vertical rail in the left
          dead-space margin (preferred) or horizontal strip above the HUD band
          (mobile fallback). ZERO cyan; amber economy.
          pointer-events:none so it never blocks a CTA. */}
      {isGaugeVisible && (
        <OoReiSpiritGauge
          fillRatio={spiritGaugeRatio}
          formIndex={spiritFormIndex}
          orientation={gaugeOrientation}
          reducedMotion={prefersReducedMotion}
          currentSpiritIndex={currentSpiritIndex}
          sealedSpiritCount={sealedSpiritCount}
          onBadgeTap={openSealCollection}
          hudBandHeight={isHudVisible ? hudBandHeight : 0}
        />
      )}

      {/* ── z-3.5: Spirit-bonus curtain ────────────────────────────────────
          Full-canvas painted overlay during the 800ms spirit-bonus-entry
          phase. The painted shadowy spirit + amber flame curtains carry
          the world-shift moment. Sits above the canvas but below the HUD
          so the END BONUS button (RG-C8) and READOUTS remain accessible. */}
      <img
        src="/assets/generated/oo-rei/spirit-bonus-curtain.jpg"
        alt=""
        aria-hidden="true"
        style={{ ...spiritCurtainStyle, opacity: curtainOpacity }}
      />

      {/* ── z-4: HUD shell (header + phase-specific overlays in the hot zone) */}
      <div style={hudStyle}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        {/* Mobile (≤480px): the LOBBY button (absolute, top:8, left:12) and the
            compact warden chip (absolute, top:8, right:8, 130px) occupy the top
            row at z=6. The header title group uses a reduced left margin on mobile
            so the wordmark centers in the remaining space. The RTP and 20-LINES
            chips are suppressed on mobile — they are accessible via the 巻 button
            which opens the full paytable. The 巻 button is the only meta control
            shown in the header on mobile. This keeps the top zone clear with
            verified zero-overlap. */}
        {/* ── Header — responsive-interface-plan 2026-05-31 (Phase 2) ──────────
            data-zone="header" for probe assertions.
            PRECONDITION FIX: on mobile (xs), the 巻 button moves to the LEFT
            cluster (between LOBBY button and title) so the warden rank chip
            cannot occlude it. The rank chip is at top:8, right:8 (absolute)
            and at 390px would fully overlap the right cluster.
            On sm/md/lg: 巻 stays in the right meta cluster as before.
            The header itself is already a flex row (headerStyle); no absolute
            positions on the title group or meta chips. */}
        <header style={headerStyle} data-zone="header">
          {/* Left cluster: title group + 巻 on mobile (left of title = safe from rank chip) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            {/* On mobile, 巻 is LEFT of title so rank chip (top:8,right:8) cannot occlude it */}
            {isMobile && phase.kind !== 'lobby' && (
              <button
                type="button"
                data-slot="info-button"
                style={infoButtonMobileStyle}
                onClick={() => {
                  const willOpen = !infoOpen
                  setInfoOpen(willOpen)
                  if (willOpen && typeof window !== 'undefined') {
                    localStorage.removeItem(OO_REI_ONBOARDING_KEY)
                    hasFiredStep1Ref.current = false
                    hasFirstSpinSettledRef.current = false
                    spinCountRef.current = 0
                    firstNetWinFiredRef.current = false
                    bannerTappedRef.current = false
                    hasFiredStep3Ref.current = false
                    setPendingCoachmarkId(null)
                  }
                }}
                aria-label="Symbol paytable and game info — RTP, lines, rules · tap again to show tutorial"
                aria-expanded={infoOpen}
              >
                <span style={infoButtonGlyphStyle}>巻</span>
              </button>
            )}
            <div style={isMobile ? headerTitleGroupMobileStyle : headerTitleGroupStyle}>
              {/* Full identity lockup: THE MYTH OF REI (神話).
                  Eyebrow "THE MYTH OF" in Geist Mono; "REI" in Noto Serif JP
                  display register; 神話 ("shinwa", divine legend) as the amber
                  kanji subtitle. Per Myth-of-REI elevation blueprint §0. */}
              <span style={gameTitleEyebrowStyle}>THE MYTH OF</span>
              <span style={gameTitleLockupRowStyle}>
                <span style={gameTitleStyle}>REI</span>
                <span style={gameTitleSubtitleStyle} aria-hidden="true">神話</span>
              </span>
              {/* Amber economy job 1: header separator */}
              <div style={amberSeparatorStyle} />
            </div>
          </div>
          {/* Right cluster: RTP + LINES chips (sm+) + 巻 (sm/md/lg only) */}
          <div style={headerMetaStyle}>
            {/* RTP + 20 LINES chips: sm/md/lg only.
                On mobile (xs) these are hidden from the header — accessible via 巻. */}
            {!isMobile && (
              <span style={phase.kind === 'lobby' ? rtpChipStyle : rtpChipInGameStyle}>
                RTP: {PUBLISHED_RTP}
              </span>
            )}
            {!isMobile && (
              <span style={linesPillStyle}>20 LINES</span>
            )}
            {/* INFO button — desktop/tablet right cluster (sm/md/lg).
                On mobile it lives in the LEFT cluster above (precondition fix). */}
            {!isMobile && phase.kind !== 'lobby' && (
              <button
                type="button"
                data-slot="info-button"
                style={infoButtonStyle}
                onClick={() => {
                  const willOpen = !infoOpen
                  setInfoOpen(willOpen)
                  if (willOpen && typeof window !== 'undefined') {
                    localStorage.removeItem(OO_REI_ONBOARDING_KEY)
                    hasFiredStep1Ref.current = false
                    hasFirstSpinSettledRef.current = false
                    spinCountRef.current = 0
                    firstNetWinFiredRef.current = false
                    bannerTappedRef.current = false
                    hasFiredStep3Ref.current = false
                    setPendingCoachmarkId(null)
                  }
                }}
                aria-label="Symbol paytable and game info — RTP, lines, rules · tap again to show tutorial"
                aria-expanded={infoOpen}
              >
                <span style={infoButtonGlyphStyle}>巻</span>
              </button>
            )}
          </div>
        </header>

        {/* ── Spirit Bonus status strip — below header when bonus is active ────
            During the bonus the FREE SEALS count IS the focus (Tim: surface the
            free spins). Shows remaining / total awarded so the run reads as a
            bounded, visible sequence (the way Big Bass shows its free-spin count)
            plus the running bonus TOTAL. Display-only — no math/RTP touch.
            RG-C5: static styles, identical regardless of streak/session/wager. */}
        {isSpiritBonusActive && (
          <div style={spiritBonusBarStyle}>
            {freeSpinsRemaining !== null ? (
              <span style={spiritBonusLabelStyle}>
                <span style={spiritBonusLabelLeadStyle}>FREE SEALS</span>{' '}
                <span style={spiritBonusCountStyle}>{freeSpinsRemaining}</span>
                {freeSpinsTotal !== null && (
                  <span style={spiritBonusOfTotalStyle}> / {freeSpinsTotal}</span>
                )}
              </span>
            ) : (
              <span style={spiritBonusLabelStyle}>
                <span style={spiritBonusLabelLeadStyle}>SPIRIT BONUS</span>
              </span>
            )}
            {bonusTotalWin !== null && (
              <span style={spiritBonusTotalStyle}>
                TOTAL {formatUsdcCompact(bonusTotalWin)}
              </span>
            )}
          </div>
        )}

        {/* The Spirit Bonus tracker is now the canvas-native Living Spirit
            Header (drawn inside OoReiSlotCanvas as part of the board frame). The
            previous DOM marquee here was rejected by Tim 2026-06-02 ("not
            integrated, feels like a separate design, bolted on rectangle") and
            has been removed. The screen-reader live region lives beside the
            canvas mount above. */}

        {/* ── Lobby surface: anchored in Rei's RIGHT-side negative space ──────
            Tim 2026-06-01 "fix the lobby - REI looks bad": Rei is now the
            enlarged hero on the left (is-lobby). The narrative card sits in the
            empty centre-right space beside her (NOT floating over the open sea),
            and the CTA is pulled OUT of the card as a standalone amber-fill
            button just below it. Eye path: Rei face (upper-left) → body →
            card (centre-right) → CTA. ONE amber CTA per phase. */}
        {phase.kind === 'lobby' && (
          <div style={isMobile ? lobbySurfaceMobileStyle : lobbySurfaceStyle}>
            <div style={lobbyCardStyle}>
              <p style={lobbyTaglineStyle}>
                {activeRegionForBanner
                  ? activeRegionForBanner.region.mythBeat
                  : 'She drew the first seal at the edge of the storm. The island still holds her name.'}
              </p>
              <p style={lobbySubtitleStyle}>
                5 reels · 20 paylines · Spirit Bonus free spins · RTP {PUBLISHED_RTP}
              </p>
            </div>
            <button
              style={ctaDynamicStyle}
              onClick={() => { unlockAudioNow(); goToBetEntry() }}
              type="button"
              {...ctaHoverHandlers}
            >
              <span style={ctaKanjiStyle}>霊</span>
              <span>CAST A SEAL</span>
              <span style={ctaKanjiStyle}>符</span>
            </button>
          </div>
        )}

        {/* ── Win-reveal announcement — CENTERED in canvas hot-zone (spec A) ──
            z-index 5: above HUD band (z-4), below cinematic overlay (z-5).
            Vertically and horizontally centered over the grid, NOT pinned bottom.
            Never occluded by or overlapping the HUD band.
            scatter >= 3: mounts immediately (narrative beat, not win amount).
            scatter < 3: gated behind winOverlayActive (savor beat OR deterministic
            fallback OR settled backstop — see the win-overlay controller above).
            The win-number panel now spans BOTH win-reveal AND settled so a late or
            lost canvas savor signal can never hide the number (Tim 2026-06-02). */}
        {phase.kind === 'win-reveal' && phase.scatterCount >= 3 && (
          <div style={winRevealCenteredStyle(hudBandHeight, isMobile)}>
            <div style={{ ...winRevealInnerStyle, ...bonusTriggerLayoutStyle }}>
              <span style={bonusTriggerKanjiStyle}>霊宿る</span>
              <span style={bonusTriggerHeadlineStyle}>SPIRIT AWAKENS</span>
              <span style={bonusTriggerMechanicStyle}>
                3 SPIRIT ORBS · REELS 1 / 3 / 5
              </span>
              <span style={bonusTriggerWinStyle}>
                {formatUsdcCompact(phase.totalWinLamports)}
              </span>
            </div>
          </div>
        )}
        {(phase.kind === 'win-reveal' || phase.kind === 'settled') &&
          winOverlayActive &&
          (phase.kind === 'settled' || phase.scatterCount < 3) &&
          (() => {
          // Displayed total comes from whichever of the two win phases is active.
          const overlayTotal = phase.totalWinLamports
          // Only render for genuine wins above the 'none' tier (RG-C1: sub-break-even silent).
          if (computeWinTier(overlayTotal, wagerLamports) === 'none') return null
          // Compute the win tier so we can pick the calligraphy PNG (RG-C5: no session state).
          const revealTier = computeWinTier(overlayTotal, wagerLamports)
          const calligraphy = WIN_CALLIGRAPHY[revealTier] ?? null
          // 'nice' tier: use simple panel (no calligraphy hero — too quiet for art).
          // 'good'/'big'/'mega': calligraphy-dominant banner.
          return (
            <div style={winRevealCenteredStyle(hudBandHeight, isMobile)}>
              {/* Ink filter defs — injected once so InkNumber can reference
                  url(#oo-rei-ink-rough). aria-hidden zero-size SVG. */}
              <div dangerouslySetInnerHTML={{ __html: INK_FILTER_SVG_DEFS }} />
              {/* Inner panel: constrained width, flex column, centered content */}
              <div style={{
                ...winRevealInnerStyle,
                animation: prefersReducedMotion
                  ? undefined
                  : 'ooReiWinPanelEntry 120ms cubic-bezier(0.2, 0, 0, 1) both',
              }}>
                {/* Layer 1: calligraphy background PNG (big/mega/good only) */}
                {calligraphy && (
                  <img
                    src={calligraphy.path}
                    alt=""
                    aria-hidden="true"
                    style={{
                      ...winCalligraphyStyle,
                      opacity: calligraphy.opacity,
                      animation: prefersReducedMotion
                        ? undefined
                        : 'ooReiKanjiBloom 240ms cubic-bezier(0.2, 0, 0, 1) both',
                    }}
                  />
                )}
                {/* Layer 2: win number — ink-black InkNumber treatment (shared module).
                    Matches the cinematic pull-out register: ink-black #1a0f06 fill,
                    amber hairline highlight, SVG feTurbulence roughness, ink-wash plate.
                    Replaces the old white WebkitTextStroke outline (winAmountBannerStyle). */}
                <InkNumber
                  value={formatUsdcCompact(overlayTotal)}
                  fontPx={isMobile ? WIN_PANEL_FONT_PX_MOBILE : WIN_PANEL_FONT_PX_DESKTOP}
                  isWhisperBeat={false}
                  prefersReducedMotion={prefersReducedMotion}
                  ariaLabel={`Win: ${formatUsdcCompact(overlayTotal)}`}
                  revealMs={WIN_PANEL_REVEAL_MS}
                />
                {/* Layer 3: tier English label below number */}
                {calligraphy && (
                  <span style={winTierLabelStyle}>{calligraphy.label}</span>
                )}
                {/* Fallback label for 'nice' tier (no calligraphy) */}
                {!calligraphy && (
                  <span style={winLabelStyle}>WIN</span>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── Spirit-bonus entry world-shift banner (in-hotzone) ───────────── */}
        {phase.kind === 'spirit-bonus-entry' && (
          <div style={{ ...hotzoneCardStyle(hudBandHeight), ...spiritEntryLayoutStyle }}>
            <span style={spiritEntryKanjiStyle}>霊が目覚める</span>
            <span style={spiritEntryHeadlineStyle}>THE SPIRIT IS AWAKE</span>
            <span style={spiritEntryAwardStyle}>
              {phase.freeSpinsAwarded} FREE SEALS BESTOWED
            </span>
          </div>
        )}

        {/* ── Spirit bonus end (in-hotzone) ────────────────────────────────── */}
        {phase.kind === 'spirit-bonus-end' && (
          <div style={{ ...hotzoneCardStyle(hudBandHeight), ...spiritBonusEndLayoutStyle }}>
            <span style={spiritBonusEndTitleStyle}>SPIRIT DEPARTS</span>
            <span style={spiritBonusEndAmountStyle}>
              {formatUsdcCompact(phase.bonusTotalWinLamports)}
            </span>
          </div>
        )}

        {/* ── Settled compact strip — in CENTER zone (spec D/State A) ──────────
            Replaces the blocking receipt modal. Grid stays visible behind HUD.
            Shows outcome label / win value / seals earned.
            The opt-in expanded receipt sheet is below (receiptSheetOpen). */}

        {/* RG-C8: END BONUS is handled by the integrated HUD band CTA
            (ctaLabel = 'END BONUS', ctaAction = endBonus when isSpiritBonusActive).
            No duplicate button needed here. */}

      </div>

      {/* ── Opt-in receipt bottom sheet (spec D / State B) ────────────────────
          Appears above the HUD band when the player taps "view receipt" in
          the compact settled strip. Non-blocking: the HUD band remains accessible.
          Only mounted in 'settled' phase. Dismissed by handle / outside / grid tap. */}
      {phase.kind === 'settled' && receiptSheetOpen && (
        <>
          <div
            style={receiptSheetScrimStyle}
            onClick={() => setReceiptSheetOpen(false)}
            aria-hidden="true"
          />
          <div style={receiptSheetStyle(hudBandHeight)} role="dialog" aria-label="Spin receipt">
            <div style={receiptSheetHandleStyle} onClick={() => setReceiptSheetOpen(false)} />
            <img
              src="/assets/generated/oo-rei/receipt-brushstroke-divider.png"
              alt=""
              aria-hidden="true"
              style={receiptSheetBrushTopStyle}
            />
            <div style={receiptSheetBodyStyle}>
              <div style={receiptTitleRowStyle}>
                <img
                  src="/assets/generated/oo-rei/sym-talisman.png"
                  alt=""
                  aria-hidden="true"
                  style={receiptTitleTalismanStyle}
                />
                <span style={receiptTitleStyle}>SPIRIT SEAL RECEIPT</span>
              </div>

              <div style={receiptRowStyle}>
                <span style={receiptLabelStyle}>wager</span>
                <span style={receiptValueStyle}>{formatUsdc(wagerLamports)}</span>
              </div>

              {phase.totalWinLamports >= wagerLamports && (
                <div style={receiptRowStyle}>
                  <span style={receiptLabelStyle}>win</span>
                  <span style={{ ...receiptValueStyle, color: T.talismanGlow }}>
                    {formatUsdc(phase.totalWinLamports)}
                  </span>
                </div>
              )}

              {phase.totalWinLamports > 0n && phase.totalWinLamports < wagerLamports && (
                <>
                  <div style={receiptRowStyle}>
                    <span style={receiptLabelStyle}>partial return</span>
                    <span style={receiptValueStyle}>
                      {formatUsdc(phase.totalWinLamports)}
                    </span>
                  </div>
                  <div style={receiptRowStyle}>
                    <span style={receiptLabelStyle}>net</span>
                    <span style={receiptValueStyle}>
                      {`-${formatUsdc(wagerLamports - phase.totalWinLamports)}`}
                    </span>
                  </div>
                </>
              )}

              {phase.totalWinLamports === 0n && (
                <div style={receiptRowStyle}>
                  <span style={receiptLabelStyle}>result</span>
                  <span style={receiptValueStyle}>no seal activated</span>
                </div>
              )}

              <div style={receiptRowStyle}>
                <span style={receiptLabelStyle}>spirit seals earned</span>
                <span style={{ ...receiptValueStyle, color: T.amberAccent }}>
                  +{formatPoints(phase.ownershipPoints)}
                </span>
              </div>

              <div style={receiptRowStyle}>
                <span style={receiptLabelStyle}>RTP</span>
                <span style={receiptValueStyle}>{PUBLISHED_RTP}</span>
              </div>

              <div style={receiptRowStyle}>
                <span style={receiptLabelStyle}>session net</span>
                <span style={receiptValueStyle}>{formatSessionNet(sessionNetLamports)}</span>
              </div>

              <img
                src="/assets/generated/oo-rei/receipt-brushstroke-divider.png"
                alt=""
                aria-hidden="true"
                style={receiptBrushDividerStyle}
              />

              <ReiGlassBoxSeal sessionSeedHex={phase.sessionSeedHex} />
            </div>
          </div>
        </>
      )}

      {/* ── z-4: Integrated bottom HUD band — 3-tier responsive ─────────────────
          DESKTOP >900px (200px): COL-1 stats / COL-2 seals / COL-3 CAST /
            COL-4 wager plaque / COL-5 AWAKEN+CASH OUT.
          TABLET 481–900px (84px): single-row — STAT-PAIR / WAGER-PLAQUE /
            CAST-CENTER / COL-RIGHT (AWAKEN+CASH OUT stacked).
          MOBILE <481px (178px): seal strip (36px) above 3-col row (142px):
            COL-A stats / COL-B CAST+wager / COL-C AWAKEN+CASH OUT.
          RG-C1: WIN readout cream always. RG-C5: identical styles, module-const timings.
          ZERO cyan. Amber economy only. NO lantern images. */}
      {/* ── z-3.9: Transition zone — scene-to-altar-deck gradient seam ────────────
          40px gradient strip positioned immediately above the HUD band.
          Dissolves the paddy scene floor into the altar deck surface so the
          band reads as a lacquered floor Rei stands on, not bolted UI chrome.
          Pass 1 (2026-05-29): §4.2 of the design bible. */}
      {isHudVisible && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: hudBandHeight,
            left: 0,
            right: 0,
            height: 40,
            zIndex: 3,
            background: 'linear-gradient(180deg, rgba(27,19,12,0) 0%, rgba(27,19,12,0.35) 40%, rgba(35,26,14,0.82) 80%, rgba(35,26,14,1.0) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}
      {/* DEPRECATED_BRANCH: CSS custom property injection for zone heights.
          Sets --header-h and --rail-h on the shell element for coachmark clearance.
          These are consumed by calc(var(--rail-h) + 12px) in coachmark skip buttons. */}
      <style>{`
        [data-testid="oo-rei-experience"] {
          --header-h: ${ZONE_HEIGHTS[layoutTier].headerH}px;
          --rail-h: ${ZONE_HEIGHTS[layoutTier].railH}px;
        }
      `}</style>

      {/* ── z-4: Instrument Rail — responsive-interface-plan 2026-05-31 ────────────
          OoReiInstrumentRail replaces the three-branch HUD (tablet/mobile/desktop).
          One CSS-grid parametric component with 5 named tracks:
            wager | context | cast | readouts | cashout
          layoutTier drives column definitions via LAYOUT_CONFIG.
          RECEIPT and GlassBox are inside the readouts column as a collapsible
          drawer — viewport-bottom overflow is structurally impossible.
          BALANCE stat shown at ALL tiers (cross-tier consistency).

          DEPRECATED_BRANCH: old 3-branch JSX is preserved below as dead code.
          DO NOT delete until probe baseline is established and CI passes 24/24. */}
      {isHudVisible && (
        <OoReiInstrumentRail
          layoutTier={layoutTier}
          phaseKind={phase.kind as Parameters<typeof OoReiInstrumentRail>[0]['phaseKind']}
          wagerLamports={wagerLamports}
          chipTrayOpen={chipTrayOpen}
          onOpenChipTray={openChipTray}
          onStepWagerDown={stepWagerDown}
          onStepWagerUp={stepWagerUp}
          canStepWagerDown={canStepWagerDown}
          canStepWagerUp={canStepWagerUp}
          ctaLabel={ctaLabel}
          ctaDisabled={ctaDisabled}
          ctaHovered={ctaHovered}
          ctaPressed={ctaPressed}
          onCtaClick={ctaAction ? () => { unlockAudioNow(); ctaAction() } : () => {}}
          onCtaPointerEnter={() => setCtaHovered(true)}
          onCtaPointerLeave={() => { setCtaHovered(false); setCtaPressed(false) }}
          onCtaPointerDown={() => { unlockAudioNow(); setCtaPressed(true) }}
          onCtaPointerUp={() => setCtaPressed(false)}
          onCtaPointerCancel={() => { setCtaHovered(false); setCtaPressed(false) }}
          cashOutPressed={cashOutPressed}
          cashOutHovered={cashOutHovered}
          onCashOut={cashOut}
          onCashOutPointerEnter={() => setCashOutHovered(true)}
          onCashOutPointerLeave={() => { setCashOutHovered(false); setCashOutPressed(false) }}
          onCashOutPointerDown={() => { setCashOutPressed(true) }}
          onCashOutPointerUp={() => setCashOutPressed(false)}
          onCashOutPointerCancel={() => { setCashOutPressed(false); setCashOutHovered(false) }}
          talismanAwakenActive={talismanAwakenActive}
          isSpiritBonusActive={isSpiritBonusActive}
          onActivateAwaken={activateTalismanAwaken}
          displayedWinLamports={displayedWinLamports}
          sessionWageredLamports={sessionWageredLamports}
          sessionNetLamports={sessionNetLamports}
          freeSpinsRemaining={freeSpinsRemaining}
          receiptSheetOpen={receiptSheetOpen}
          onOpenReceipt={() => setReceiptSheetOpen(true)}
          settledTotalWinLamports={phase.kind === 'settled' ? phase.totalWinLamports : undefined}
          settledOwnershipPoints={phase.kind === 'settled' ? phase.ownershipPoints : undefined}
          settledSessionSeedHex={phase.kind === 'settled' ? phase.sessionSeedHex : undefined}
          glassBoxSlot={phase.kind === 'settled'
            ? <ReiGlassBoxSeal sessionSeedHex={phase.sessionSeedHex} />
            : null
          }
          contextSlot={
            talismanAwakenActive ? (
              <div style={hudTalismanAwokenChipStyle}>
                <span style={hudTalismanAwokenKanjiStyle}>符</span>
                <span style={hudTalismanAwokenTextStyle}>TALISMAN AWOKEN</span>
              </div>
            ) : sealedSpiritCount === 0 ? (
              (() => {
                const pursuedIdx = currentSpiritIndex >= 1 ? currentSpiritIndex : 1
                const targetKanji = SPIRIT_KANJI[pursuedIdx] ?? '霊'
                const targetName = SPIRIT_NAMES[pursuedIdx] ?? `SPIRIT ${pursuedIdx}`
                return (
                  <div style={hudSealColEmptyStyle}>
                    <div
                      aria-label={`Sealing ${targetName}`}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'radial-gradient(circle at 40% 35%, rgba(90,79,45,0.28), rgba(42,34,22,0.55))',
                        border: '1px solid rgba(212,137,42,0.28)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, opacity: 0.65,
                      }}
                    >
                      <span style={{ fontFamily: T.fontKanji, fontSize: 13, fontWeight: 700, color: 'rgba(244,167,62,0.50)', lineHeight: 1, pointerEvents: 'none', userSelect: 'none' }} aria-hidden="true">{targetKanji}</span>
                    </div>
                    <span style={{ ...hudSpiritsPromptStyle, fontSize: 9, whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.3, maxWidth: 104 }}>SEALING {targetName}</span>
                  </div>
                )
              })()
            ) : (
              <div style={hudSealColGridStyle}>
                {Array.from({ length: Math.min(sealedSpiritCount, 4) }).map((_, i) => {
                  const spiritIdx = i + 1
                  const identityKanji = SPIRIT_KANJI[spiritIdx] ?? '霊'
                  const spiritName = SPIRIT_NAMES[spiritIdx] ?? `SPIRIT ${spiritIdx}`
                  const isCurrentlyActive = spiritIdx === currentSpiritIndex
                  const isSealed = spiritIdx < currentSpiritIndex
                  return (
                    <button
                      key={spiritIdx}
                      type="button"
                      aria-label={`Spirit ally ${spiritIdx}: ${spiritName}`}
                      style={{
                        ...hudSpiritMedallionCircleStyle(false),
                        boxShadow: isCurrentlyActive
                          ? '0 0 0 2px rgba(212,137,42,0.45), 0 0 8px rgba(212,137,42,0.25), inset 0 1px 3px rgba(0,0,0,0.55)'
                          : hudSpiritMedallionCircleStyle(false).boxShadow,
                        opacity: isSealed ? 0.78 : 1,
                        transition: `transform 80ms cubic-bezier(0.2,0,0,1)`,
                      }}
                      onPointerDown={(e) => {
                        if (!prefersReducedMotion) (e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'
                        showGlyphTooltip(spiritIdx); openMap()
                      }}
                      onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
                      onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
                    >
                      <span style={hudSpiritMedallionKanjiStyle(false)}>{identityKanji}</span>
                      {isSealed && <span style={hudSpiritSealedDotStyle} aria-hidden="true">·</span>}
                    </button>
                  )
                })}
              </div>
            )
          }
          prefersReducedMotion={prefersReducedMotion}
          plaqueHovered={plaqueHovered}
          plaquePressed={plaquePressed}
          onPlaquePointerEnter={() => setPlaqueHovered(true)}
          onPlaquePointerLeave={() => { setPlaqueHovered(false); setPlaquePressed(false) }}
          onPlaquePointerDown={() => setPlaquePressed(true)}
          onPlaquePointerUp={() => setPlaquePressed(false)}
          onPlaquePointerCancel={() => { setPlaquePressed(false); setPlaqueHovered(false) }}
          bonusTotalWin={bonusTotalWin}
        />
      )}

      {/* DEPRECATED_BRANCH: old three-branch HUD removed per responsive-interface-plan 2026-05-31.
          Reference the git history of OoReiExperience.tsx at commit before this plan
          if reverting to the old three-branch system is needed. */}

      {/* ── z-6: Wager-Art Bloom Screen (full-canvas overlay, water-art) ─────────
          Opens when water-art panel OR stepper value is tapped.
          Reuses chipTrayOpen state. REPLACES old floating chip tray.
          Bloom enter: 260ms (opacity + scaleY 0.92->1.0, origin bottom)
          Bloom exit: 200ms
          Chips: 4-col desktop / 2-col mobile; active chip amber glow.
          prefers-reduced-motion: instant (no scaleY animation).
          RG-C5: identical chip styles regardless of session/streak.
          ZERO cyan. Amber economy only. */}
      {chipTrayOpen && !isHudSpinning && (
        <>
          {/* Tap-outside scrim */}
          <div
            style={wagerBloomScrimStyle}
            onClick={() => setChipTrayOpen(false)}
            aria-hidden="true"
          />
          {/* Bloom panel */}
          <div
            style={wagerBloomPanelStyle(hudBandHeight, prefersReducedMotion, wagerAnchorRect)}
            role="dialog"
            aria-label="Select wager amount"
          >
            <div style={wagerBloomHeaderStyle}>
              <span style={wagerBloomTitleStyle}>WAGER</span>
              <button
                type="button"
                style={wagerBloomCloseStyle}
                onClick={() => setChipTrayOpen(false)}
                aria-label="Close wager selector"
              >
                ×
              </button>
            </div>
            <img
              src="/assets/generated/oo-rei/receipt-brushstroke-divider.png"
              alt=""
              aria-hidden="true"
              style={{ height: 1, width: '100%', objectFit: 'cover' as const, opacity: 0.35, marginBottom: 8 }}
            />
            <div style={wagerBloomChipGridStyle(isMobile)}>
              {WAGER_INCREMENTS_LAMPORTS.map((lamports) => {
                const isActive = lamports === wagerLamports
                return (
                  <button
                    key={lamports.toString()}
                    type="button"
                    style={{
                      ...wagerBloomChipStyle,
                      ...(isActive ? wagerBloomChipActiveStyle : {}),
                    }}
                    onPointerDown={(e) => {
                      // Level 1 press-ack: scale(0.96) 80ms
                      if (!prefersReducedMotion) {
                        ;(e.currentTarget as HTMLElement).style.transition = `transform 80ms cubic-bezier(0.2,0,0,1)`
                        ;(e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'
                      }
                      unlockAudioNow()
                      playChipSelect()
                      setWager(lamports)
                      setChipTrayOpen(false)
                    }}
                    onPointerEnter={(e) => {
                      // Level 2 hover: scale(1.02) 120ms desktop-only (pointer:fine)
                      if (!prefersReducedMotion && !isActive) {
                        ;(e.currentTarget as HTMLElement).style.transition = `transform 120ms cubic-bezier(0.2,0,0,1)`
                        ;(e.currentTarget as HTMLElement).style.transform = 'scale(1.02)'
                      }
                    }}
                    onPointerLeave={(e) => {
                      ;(e.currentTarget as HTMLElement).style.transform = ''
                    }}
                    aria-pressed={isActive}
                  >
                    {formatUsdcCompact(lamports)}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* ── z-4.5: Paytable info overlay (in-canvas, tap-outside dismiss) ───────
          Opens when the amber 巻 button is tapped. Talisman-paper material,
          absolute child of the canvas shell, grid dimmed behind.
          No route. No modal portal. No cyan. Amber/vermillion only.
          RG-C5: no session state drives this panel. Pure display.
          tap/click on the scrim (dimmed grid area) dismisses. */}
      {infoOpen && (
        <>
          {/* Scrim — dims the grid behind the panel */}
          <div
            style={infoScrimStyle}
            onClick={closeInfo}
            aria-hidden="true"
          />
          {/* Info panel — talisman-paper scroll */}
          <div style={infoPanelStyle} role="dialog" aria-label="Paytable and game info">
            <div style={infoPanelHeaderStyle}>
              <span style={infoPanelTitleKanjiStyle}>解</span>
              <span style={infoPanelTitleStyle}>HOW TO PLAY</span>
              <button
                type="button"
                style={infoPanelCloseStyle}
                onClick={closeInfo}
                aria-label="Close info"
              >
                ×
              </button>
            </div>

            <div style={infoScrollBodyStyle}>

              {/* Goal */}
              <div style={infoSectionStyle}>
                <span style={infoSectionHeadStyle}>GOAL</span>
                <p style={infoBodyStyle}>
                  Match 3 or more identical symbols on a payline starting from reel 1 (left).
                  20 fixed paylines. Wins pay left to right.
                </p>
              </div>

              <div style={infoDividerStyle} />

              {/* Spirit Orb role */}
              <div style={infoSectionStyle}>
                <span style={infoSectionHeadStyle}>SPIRIT ORB</span>
                <p style={infoBodyStyle}>
                  The Spirit Orb (glowing sphere) is both a WILD and a SCATTER.
                  As a WILD it substitutes for all other symbols on any payline.
                  As a SCATTER it pays anywhere on reels 1, 3, and 5 only.
                  3 or more Spirit Orbs on eligible reels trigger the SPIRIT BONUS:
                  10 (3 orbs), 15 (4 orbs), or 20 (5 orbs) free spins.
                  2 orbs on eligible reels pay a consolation 0.4x without triggering the bonus.
                </p>
              </div>

              <div style={infoDividerStyle} />

              {/* Wet Stone note */}
              <div style={infoSectionStyle}>
                <span style={infoSectionHeadStyle}>WET STONE (RUNE STONE)</span>
                <p style={infoBodyStyle}>
                  The stone glyph with the spirit rune is a LOW-PAY payline symbol.
                  It is NOT a wild or scatter. It pays when 3, 4, or 5 appear
                  consecutively on a payline from reel 1.
                  The Spirit Orb (wild) can substitute for it on paylines.
                </p>
              </div>

              <div style={infoDividerStyle} />

              {/* Paytable */}
              <div style={infoSectionStyle}>
                <span style={infoSectionHeadStyle}>PAYTABLE (× WAGER)</span>
                <div style={infoPaytableGridStyle}>
                  <span style={infoPaytableHeadStyle}>SYMBOL</span>
                  <span style={infoPaytableHeadStyle}>3 OF A KIND</span>
                  <span style={infoPaytableHeadStyle}>4 OF A KIND</span>
                  <span style={infoPaytableHeadStyle}>5 OF A KIND</span>

                  <span style={infoPaytableSymStyle}>Torii Gate</span>
                  <span style={infoPaytableValStyle}>8x</span>
                  <span style={infoPaytableValStyle}>12.8x</span>
                  <span style={infoPaytableValAmberStyle}>24x</span>

                  <span style={infoPaytableSymStyle}>Amber Eye</span>
                  <span style={infoPaytableValStyle}>6.4x</span>
                  <span style={infoPaytableValStyle}>9.6x</span>
                  <span style={infoPaytableValAmberStyle}>16x</span>

                  <span style={infoPaytableSymStyle}>Rei's Hat</span>
                  <span style={infoPaytableValStyle}>4x</span>
                  <span style={infoPaytableValStyle}>6x</span>
                  <span style={infoPaytableValAmberStyle}>10x</span>

                  <span style={infoPaytableSymStyle}>Talisman</span>
                  <span style={infoPaytableValStyle}>1.2x</span>
                  <span style={infoPaytableValStyle}>2.4x</span>
                  <span style={infoPaytableValStyle}>6x</span>

                  <span style={infoPaytableSymStyle}>Stone Lantern</span>
                  <span style={infoPaytableValStyle}>0.8x</span>
                  <span style={infoPaytableValStyle}>1.6x</span>
                  <span style={infoPaytableValStyle}>4x</span>

                  <span style={infoPaytableSymStyle}>Wet Stone</span>
                  <span style={infoPaytableValStyle}>0.6x</span>
                  <span style={infoPaytableValStyle}>1.2x</span>
                  <span style={infoPaytableValStyle}>2.4x</span>

                  <span style={infoPaytableSymStyle}>Rice Bundle</span>
                  <span style={infoPaytableValStyle}>0.4x</span>
                  <span style={infoPaytableValStyle}>0.8x</span>
                  <span style={infoPaytableValStyle}>1.6x</span>

                  <span style={infoPaytableSymStyle}>Spirit Orb</span>
                  <span style={{ ...infoPaytableValStyle, gridColumn: 'span 3', textAlign: 'left' as const }}>
                    wild + scatter (see above)
                  </span>
                </div>
              </div>

              <div style={infoDividerStyle} />

              {/* Talisman Awaken */}
              <div style={infoSectionStyle}>
                <span style={infoSectionHeadStyle}>TALISMAN AWAKEN</span>
                <p style={infoBodyStyle}>
                  Costs 10% of your wager. Activates a Talisman wild on two pre-committed
                  grid cells before the spin. Sticky wilds stay in place during Spirit Bonus
                  free spins and attract bonus free spins when Spirit Orbs land adjacent.
                </p>
              </div>

              <div style={infoDividerStyle} />

              {/* Lines */}
              <div style={infoSectionStyle}>
                <span style={infoSectionHeadStyle}>PAYLINES</span>
                <p style={infoBodyStyle}>
                  20 fixed paylines. All lines are always active. You cannot reduce paylines.
                  Wins on multiple paylines in a single spin are summed together as your total win.
                </p>
              </div>

              <div style={infoDividerStyle} />

              {/* Meta layer — explains the gauge / points / rank / map so a new
                  player knows none of it changes payouts (jesse fix). */}
              <div style={infoSectionStyle}>
                <span style={infoSectionHeadStyle}>PROGRESS &amp; COLLECTION (cosmetic)</span>
                <p style={infoBodyStyle}>
                  None of these change your payouts — RTP stays 96% no matter what. The Spirit
                  Gauge fills as you spin and only unlocks new spirit looks; it is NOT a win
                  multiplier. Points (+N per spin) are loyalty rewards. Warden Rank climbs as you
                  play and unlocks skins, music and codex entries. The Map / Myth Regions just
                  track how far you&apos;ve explored.
                </p>
              </div>

            </div>
          </div>
        </>
      )}

      {/* Back-to-catalogue control — the game ships isolated (no platform shell),
          so it owns the exit. Always present, top-left, dark-glass + amber, zero
          cyan. Compact so it never competes with the wordmark/region banner. */}
      <button
        type="button"
        onClick={() => router.push('/originals')}
        aria-label="Leave the game and return to the Originals catalogue"
        data-testid="oo-rei-back"
        style={backControlStyle}
      >
        {/* Blueprint 2026-05-30 §2 Component 7: font scales with viewport */}
        <span aria-hidden="true" style={{ fontSize: fluid(13, 16), lineHeight: 1 }}>‹</span>
        <span style={{ fontFamily: '"Geist Mono", ui-monospace, monospace', fontSize: fluid(10, 13), letterSpacing: '0.16em' }}>LOBBY</span>
      </button>

      {/* ── z-3.8: Persistent region banner (top of canvas — tappable plaque) ─
          Shows current region nameJP + nameEN + clearedCount/totalRegions.
          Talisman-paper/charcoal material, NOT a plopped UI chip.
          TAPPABLE → openMap(). Amber economy respected, zero cyan.
          Under the 30% HUD budget (tiny, top-anchored, ~28px high).
          Only shown on non-lobby phases when there is an active region. */}
      {/* Warden Rank chip (D.1) — the progression readout, top-right, clear of
          the bottom HUD. Climbs every spin (win or lose); EV-neutral.
          Taps open the Warden's Path rewards ladder (NOT the region map).
          compact={isMobile}: on portrait ≤480px moves chip to top:8 right:8
          (same row as LOBBY) and suppresses the long NEXT blurb so it never
          overlaps the region banner or title cluster. */}
      {isHudVisible && (
        <OoReiWardenRankChip
          rank={wardenRank}
          reducedMotion={prefersReducedMotion}
          onPress={() => setShowRewards(true)}
          compact={isMobile}
        />
      )}

      {isHudVisible && activeRegionForBanner && (
        <button
          type="button"
          aria-label={`Current region: ${activeRegionForBanner.region.nameEN} · tap to open myth map`}
          data-oo-rei-coachmark-target="region"
          onPointerDown={() => {
            setRegionBannerPressed(true)
            // Step 3 banner-tap path: fire coachmark if not yet seen and not already showing.
            if (!hasSeenOoReiOnboarding() && !bannerTappedRef.current && !hasFiredStep3Ref.current && hasFirstSpinSettledRef.current) {
              bannerTappedRef.current = true
              hasFiredStep3Ref.current = true
              const step = OO_REI_ONBOARDING_SCREENS[2]
              if (step && pendingCoachmarkId !== step.id) {
                setPendingCoachmarkId(step.id)
              }
            }
          }}
          onPointerUp={() => { setRegionBannerPressed(false); openMap() }}
          onPointerCancel={() => { setRegionBannerPressed(false); setRegionBannerHovered(false) }}
          onPointerLeave={() => { setRegionBannerPressed(false); setRegionBannerHovered(false) }}
          onPointerEnter={() => setRegionBannerHovered(true)}
          style={{
            position: 'absolute',
            // Mobile (≤480px): header is ~50px tall; banner at 42px clips into the
            // header separator. Push to 54px on mobile for clear vertical separation.
            // Desktop/tablet: 42px stays (header is same height but the warden chip
            // at top:56 provides a reference — banner sits in the gap above it).
            top: isMobile ? '54px' : '42px',
            left: '50%',
            // FIX 3: hover amber-glow + press scale. Ends on pointer-leave (no idle juice).
            transform: prefersReducedMotion
              ? 'translateX(-50%)'
              : regionBannerPressed
              ? `translateX(-50%) scale(0.97)`
              : regionBannerHovered
              ? `translateX(-50%) scale(1.02)`
              : `translateX(-50%) scale(1.0)`,
            transition: prefersReducedMotion
              ? 'none'
              : regionBannerPressed
              ? `transform ${REGION_BANNER_PRESS_MS}ms cubic-bezier(0.2,0,0,1), box-shadow ${REGION_BANNER_PRESS_MS}ms cubic-bezier(0.2,0,0,1), border-color ${REGION_BANNER_PRESS_MS}ms cubic-bezier(0.2,0,0,1)`
              : `transform 150ms cubic-bezier(0.2,0,0,1), box-shadow 150ms cubic-bezier(0.2,0,0,1), border-color 150ms cubic-bezier(0.2,0,0,1)`,
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px 5px 10px',
            background: regionBannerHovered && !prefersReducedMotion
              ? 'rgba(36,29,20,0.90)'
              : 'rgba(26,22,18,0.82)',
            // A9 (cohesive composition 2026-05-31): region-banner border → stone-cream.
            // Resting: rgba(200,184,144,0.35) — aged stone, same material as the dais rim.
            // Hover: brightens to rgba(200,184,144,0.65) with stone-cream glow.
            // The amber economy rule: amber is reserved for the CAST CTA and win-state.
            // The region plaque reads as a carved stone marker, not an amber-economy element.
            border: `1px solid ${regionBannerHovered && !prefersReducedMotion ? 'rgba(200,184,144,0.65)' : 'rgba(200,184,144,0.35)'}`,
            boxShadow: regionBannerHovered && !prefersReducedMotion
              ? '0 0 0 1px rgba(200,184,144,0.12), 0 2px 10px rgba(0,0,0,0.35)'
              : 'none',
            borderRadius: '2px',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            pointerEvents: 'all',
            whiteSpace: 'nowrap' as const,
          }}
        >
          {/* Spirit kanji glyph — brush register — §4.4: 18px Noto Serif JP weight 700 */}
          <span
            style={{
              fontFamily: '"Noto Serif JP", "Yu Mincho", serif',
              fontWeight: 700,
              fontSize: '18px',
              color: '#f4a73e',
              lineHeight: 1,
              letterSpacing: 0,
            }}
          >
            {activeRegionForBanner.region.nameJP}
          </span>
          {/* Amber divider dot */}
          <span
            aria-hidden="true"
            style={{
              fontSize: '9px',
              color: 'rgba(212,137,42,0.55)',
              lineHeight: 1,
            }}
          >
            ·
          </span>
          {/* EN name — §4.4: 11px Geist Mono, letterSpacing 0.14em */}
          <span
            style={{
              fontFamily: '"Geist Mono", ui-monospace, monospace',
              fontSize: '11px',
              letterSpacing: '0.14em',
              color: '#e8dfc8',
              opacity: 0.82,
              lineHeight: 1,
              textTransform: 'uppercase' as const,
            }}
          >
            {activeRegionForBanner.region.nameEN}
          </span>
          {/* Progress read — §4.4: 10px, amber 0.72 */}
          <span
            aria-label={`${regionState.clearedCount} of ${regionState.totalRegions} regions cleared`}
            style={{
              fontFamily: '"Geist Mono", ui-monospace, monospace',
              fontSize: '10px',
              letterSpacing: '0.08em',
              color: 'rgba(212,137,42,0.72)',
              lineHeight: 1,
              marginLeft: '2px',
            }}
          >
            {regionState.clearedCount}/{regionState.totalRegions}
          </span>
          {/* Map affordance arrow — vermillion micro-chevron */}
          <span
            aria-hidden="true"
            style={{
              fontSize: '8px',
              color: '#c0392b',
              opacity: 0.72,
              lineHeight: 1,
              marginLeft: '1px',
            }}
          >
            ▸
          </span>
        </button>
      )}

      {/* ── Next-unlock hint — what you grind toward (display only) ────────────
          A calm "next region" line under the region banner so the player SEES
          the grind target (the unlockable beyond the active region). Carries no
          economic value and uses steady-accrual copy, never chase pressure
          (RG §7). Suppressed while the scatter readout occupies the same center
          lane (base-game settled/win-reveal) so the two never overlap, and on
          mobile portrait where the top zone is already dense. */}
      {isHudVisible &&
        !isMobile &&
        nextRegionForUnlock !== null &&
        !showScatterProgress && (
          <div
            style={{ ...nextUnlockHintStyle, top: isMobile ? 86 : 74 }}
            data-testid="oo-rei-next-unlock"
            aria-label={`Next region to unlock: ${nextRegionForUnlock.nameEN}`}
          >
            <span style={nextUnlockLabelStyle}>NEXT REGION</span>
            <span style={nextUnlockKanjiStyle} aria-hidden="true">
              {nextRegionForUnlock.nameJP}
            </span>
            <span style={nextUnlockNameStyle}>{nextRegionForUnlock.nameEN}</span>
          </div>
        )}

      {/* ── z-6: Seal Collection overlay — in-canvas spirit roster ────────────
          Opens when the gauge form badge is tapped. Lists the 10 spirits.
          Tap-outside (scrim) dismisses. No route, no modal portal.
          RG-C5: no session state drives this panel.
          ZERO cyan. Amber only. */}
      <OoReiSealCollection
        isOpen={sealCollectionOpen}
        sealedSpiritCount={sealedSpiritCount}
        currentSpiritIndex={currentSpiritIndex}
        gaugeRatio={spiritGaugeRatio}
        onDismiss={closeSealCollection}
      />

      {/* ── z-5.5: Seal Receipt — Glass Box cycle receipt (one per seal) ─────
          Unfurls from the bottom HUD band when a Transcendent reset fires.
          NARRATIVE vocabulary: "封印 / SEAL COMPLETE". NOT "BIG WIN" (RG-C1).
          Factual receipt: ownership points, spins, provability line.
          Non-blocking: HUD band remains accessible below it. */}
      <OoReiSealReceipt
        data={pendingSealEvent}
        onDismiss={dismissSealReceipt}
        dwellMs={SEAL_REVEAL_MS}
      />

      {/* ── z-5.2: Chapter-close participatory ritual (OoReiChapterClose) ────
          Three-beat sequence: Seal Ceremony → Vista Breath → Region Reveal.
          The player taps the hovering hanko stamp to cast the final seal.
          Outcome-neutral, carries zero USDC. Fires AFTER settle (RG-C1).
          NARRATIVE vocabulary only — NOT "WIN" (RG-C1).
          Non-escalating: identical layout for every region (RG-C5).
          The inline chapter-close auto-dismiss timer in OoReiExperience is
          RETAINED as an accessibility fallback — OoReiChapterClose also has
          its own 4000ms fallback, and calls onConfirmSeal/onDismiss directly.
          The auto-dismiss timer in OoReiExperience now acts as an outer safety
          net (it calls dismissChapterClose which is idempotent). */}
      {pendingChapterClose !== null && (
        <OoReiChapterClose
          event={pendingChapterClose}
          sealedSpiritCount={sealedSpiritCount}
          activeAllyKanji={activeAllyKanji}
          onConfirmSeal={confirmSeal}
          onDismiss={dismissChapterClose}
          onChooseAlly={chooseAlly}
          nextRegionVistaSrc={nextRegionForChapterClose?.vistaSrc ?? null}
          nextRegionId={nextRegionForChapterClose?.id ?? null}
          nextRegionGoalStatement={nextRegionForChapterClose?.goalStatement ?? null}
          reducedMotion={prefersReducedMotion}
        />
      )}

      {/* ── z-50: Myth map takeover (absolute child of canvas shell) ─────────
          Full-canvas overlay. Sits above HUD (z-50 > z-4 HUD band).
          Below receipt z-5.5 and cinematic z-5 when closed (mapOpen=false → null).
          OoReiMapScreen renders null when !open && !mounted. */}
      <OoReiMapScreen
        open={mapOpen}
        sealedSpiritCount={sealedSpiritCount}
        onClose={closeMap}
        reducedMotion={prefersReducedMotion}
      />

      {/* ── z-40: Warden's Path rewards ladder (D.1 / M2) ─────────────────────
          The progression payoff view the Warden Rank chip opens (NOT the map):
          every rank's claimable soulbound reward + the player's standing.
          Display-only this slice; claim->mint is a later on-chain slice. */}
      {showRewards && (
        <OoReiWardenRewardsPanel
          rank={wardenRank}
          lifetimeSealPoints={lifetimeSealPoints}
          lifetimeSeals={sealedSpiritCount}
          lifetimeRegionsCleared={regionState.clearedCount}
          onClose={() => setShowRewards(false)}
        />
      )}

      {/* ── z-45: Warden Rank-up celebration moment (D.1 / M2) ─────────────────
          Fires once when a rank threshold is crossed (rankUpTier). RG-C5: timings
          are module-const, byte-identical for every rank. EV-neutral. Tap opens
          the Warden's Path. Auto-dismisses; clears rankUpTier. */}
      {rankUpTier !== null && (
        <OoReiRankUpBanner
          tier={rankUpTier}
          reducedMotion={prefersReducedMotion}
          onDismiss={clearRankUp}
          onViewRewards={() => { clearRankUp(); setShowRewards(true) }}
        />
      )}

      {/* ── z-5: Cinematic overlay — Azuki-register big moment system ──────────
          OoReiCinematicOverlay renders above ALL other layers (z-5).
          Fires for win tiers 'big' (10x+) and 'mega' (50x+), plus
          spirit-bonus-trigger and spirit-bonus-finale.
          ZERO cyan. ZERO particles. Composition sweep is the motion.
          RG-C5: overlay durations are module-const — never streak/session scaled.
          RG-C1: tier is null on loss phases — overlay never mounts.
          pointerEvents: none — all HUD controls remain accessible under it. */}
      <OoReiCinematicOverlay
        tier={cinematicTier}
        onComplete={handleCinematicComplete}
        onImpactHoldStart={handleCinematicImpactHoldStart}
        winMultiplierBps={cinematicMultiplierBps}
        activeRegionId={activeRegionForBanner?.region.id ?? null}
      />

      {/* ── z-6: Spirit Sealing mini-game — the interactive bonus peak ──────────
          Replaces the passive free-spin reveal. Three ofuda the player taps to
          seal the spirit; the pre-rolled bonus total resolves as they do. The
          provider owns the total (headless, RTP-identical) + all timers; this
          overlay only renders the ritual and emits onSeal. EV-invariant (RG-C3),
          zero cyan, no particles. */}
      {phase.kind === 'spirit-sealing-active' && (
        <OoReiSpiritSealing
          bonusTotalWinLamports={phase.bonusTotalWinLamports}
          fragments={phase.fragments}
          presentationOrder={phase.presentationOrder}
          sealedScrolls={phase.sealedScrolls}
          currentSpiritIndex={currentSpiritIndex}
          activeRegionId={activeRegionForBanner?.region.id ?? null}
          reducedMotion={prefersReducedMotion}
          onSeal={sealScroll}
        />
      )}

      {/* ── z-60: Coachmark overlay — in-canvas spotlight + call-out card ─────────
          Renders when pendingCoachmarkId is non-null and player has not yet seen
          the flow. The live game stays visible behind the scrim.
          Brand: washi-paper card (rgba(240,232,212,0.92)), Noto Serif JP title,
          Geist Mono body. ZERO cyan. Amber/vermillion/cream only.
          prefers-reduced-motion: cards and scrim appear instantly (no opacity fade).
          Pass 5 (2026-05-29): Design Bible Part 3 §§3.1-3.4. */}
      {activeCoachmark !== null && (
        <CoachmarkOverlay
          screen={activeCoachmark}
          prefersReducedMotion={prefersReducedMotion}
          railClearancePx={coachmarkClearancePx(layoutTier)}
          onCta={() => {
            if (activeCoachmark.ctaOpensMap) {
              // Step 3: dismiss coachmark AND open the map.
              setPendingCoachmarkId(null)
              // If this is the last step, mark as seen.
              const idx = OO_REI_ONBOARDING_SCREENS.findIndex((s) => s.id === activeCoachmark.id)
              if (idx >= OO_REI_ONBOARDING_SCREENS.length - 1) markOoReiOnboardingSeen()
              openMap()
            } else {
              advanceCoachmarkRef.current(activeCoachmark.id)
            }
          }}
          onSkip={dismissCoachmarks}
        />
      )}

      {/* CSS keyframe for talisman flutter (injected once) */}
      <style>{TALISMAN_FLUTTER_KEYFRAME}</style>
    </div>
  )
}

// ─── ReiGlassBoxSeal — Glass Box ledger seal sub-component ───────────────────

/**
 * Ledger seal — the provably-fair Glass Box trust surface for OO-REI.
 *
 * Composition-designer spec 2026-05-28: the Glass Box is embedded as a
 * "ledger seal" inside the altar scroll. It lives below the second
 * brushstroke divider. Chrome: neutral cream text on altar-paper ground.
 * No cyan anywhere (brand rule: anime-cinematic palette = zero cyan).
 *
 * Behaviour mirrors OO-BLOOM v1 GlassBoxReceipt:
 *   - Mounts in "verifying…" state  (satisfies assertGlassBoxOnSettled §1)
 *   - Resolves to "verified"        (v1 always passes — no real VRF yet)
 *   - "view receipt ↓" toggle expands inline drawer  (satisfies §2)
 *   - Drawer shows session seed hex in <code>        (satisfies §3)
 *   - No modal/dialog opened                         (satisfies §4)
 *
 * Domain C: presentation only.
 */
function ReiGlassBoxSeal({
  sessionSeedHex,
}: {
  readonly sessionSeedHex: string
}): ReactElement {
  const [verifying, setVerifying] = useState(true)
  const [expanded, setExpanded] = useState(false)

  // Simulate async verification — resolves in one microtask tick (v1).
  // v2 will perform the actual VRF re-derivation here.
  useEffect(() => {
    let cancelled = false
    setVerifying(true)
    Promise.resolve().then(() => {
      if (!cancelled) setVerifying(false)
    })
    return () => {
      cancelled = true
    }
  }, [sessionSeedHex])

  return (
    <div style={glassBoxSealWrapStyle} aria-label="Glass Box receipt">
      <div style={glassBoxSealRowStyle}>
        <span style={glassBoxSealStatusStyle}>
          {verifying ? 'verifying…' : '✓ verified'}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="oo-rei-glass-box-drawer"
          style={glassBoxSealToggleStyle}
        >
          {expanded ? 'hide receipt ↑' : 'view receipt ↓'}
        </button>
      </div>
      {expanded && (
        <div id="oo-rei-glass-box-drawer" style={glassBoxDrawerStyle}>
          <p style={glassBoxDrawerTextStyle}>
            session seed{' '}
            <code style={glassBoxHexStyle}>{sessionSeedHex}</code>
            {' · '}
            v1 deterministic rng
          </p>
        </div>
      )}
    </div>
  )
}

// ─── CoachmarkOverlay sub-component ──────────────────────────────────────────

/**
 * CoachmarkOverlay — washi-paper call-out card positioned over the live canvas.
 *
 * Visual grammar (Design Bible Part 3 §3.2):
 *   - Full-canvas scrim: box-shadow technique (0 0 0 9999px rgba(26,22,18,0.65))
 *     on the spotlit element creates the spotlight hole without a DOM scrim div.
 *     The scrim IS the spotlight border — no separate overlay element needed.
 *   - Spotlit element: gets position:relative + box-shadow to cut the hole.
 *   - Call-out card: washi-paper background (rgba(240,232,212,0.92)), amber border,
 *     vermillion arrow, Noto Serif JP kanji + Geist Mono body.
 *   - SKIP →: lower-right corner, Geist Mono 11px, muted cream.
 *
 * Since we are using an inline-style React component (no CSS classes), the
 * spotlight is implemented as a separate full-canvas scrim div with a cut-out
 * via CSS clip-path or simply by rendering the spotlit element at a higher z-index
 * with the box-shadow technique described above.
 *
 * Implementation: we render a full-canvas scrim div at z-59 (dark overlay), then
 * position the call-out card at z-60. The spotlit element receives an in-component
 * ref via data-testid targeting — but since refs across child components are not
 * practical here, we use a positioned indicator arrow instead (the spotlight is
 * purely visual via the scrim, arrow points to the region).
 *
 * Brand: ZERO cyan. Amber (#d4892a/#f4a73e), cream (#e8dfc8/#f0e8d4), vermillion (#c0392b).
 * prefers-reduced-motion: opacity transitions are instant (duration: 0).
 *
 * Domain C: presentation only. No financial math. No session/streak reads.
 */

interface CoachmarkOverlayProps {
  readonly screen: import('./ooReiOnboarding').OnboardingScreen
  readonly prefersReducedMotion: boolean
  readonly onCta: () => void
  readonly onSkip: () => void
  /**
   * Clearance in px above the rail — replaces the hardcoded 220px.
   * Computed as: railHeight + SP[12] (responsive-interface-plan 2026-05-31).
   * Default 220 for backwards compatibility when not provided.
   */
  readonly railClearancePx?: number
}

// A frozen snapshot of the target element's geometry, in shell-local px
// (relative to the absolutely-positioned overlay container, i.e. the shell).
interface FrozenTargetRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

// Card width used for placement math (matches the rendered card max-width).
const COACHMARK_CARD_W = 280 as const
// Gap between the card edge and the target element.
const COACHMARK_CARD_GAP = 18 as const
// Connector line color — thin cream hairline (brand: cream, NO cyan).
const COACHMARK_CONNECTOR = 'rgba(232,223,200,0.45)' as const

/**
 * Measure the coachmark target once and FREEZE it.
 *
 * The old implementation centred every card and recomputed nothing useful per
 * render, so step 2 ('封') pointed at the viewport centre — at nothing — and the
 * mount-before-layout race made it flicker. This hook reads the anchored
 * element's getBoundingClientRect() in a useLayoutEffect (after the DOM is laid
 * out, before paint), converts it to shell-local coordinates, and stores it in
 * state ONCE per target. It is NOT recomputed every render (that was the
 * flicker). Returns null when the anchor is unknown or the element is absent →
 * the caller falls back to a centred card with no connector.
 */
function useFrozenTargetRect(
  anchor: string | null,
  shellEl: HTMLDivElement | null,
): FrozenTargetRect | null {
  const [rect, setRect] = useState<FrozenTargetRect | null>(null)

  useLayoutEffect(() => {
    // Reset when the target changes so a stale rect never lingers across steps.
    setRect(null)
    if (anchor === null || shellEl === null) return

    const el = shellEl.querySelector<HTMLElement>(
      `[data-oo-rei-coachmark-target="${anchor}"]`,
    )
    if (el === null) return

    const elBox = el.getBoundingClientRect()
    const shellBox = shellEl.getBoundingClientRect()
    if (elBox.width === 0 && elBox.height === 0) return // not laid out yet

    // Freeze in shell-local coordinates so the connector + card stay pinned to
    // the gauge regardless of where the shell sits in the viewport.
    setRect({
      left: elBox.left - shellBox.left,
      top: elBox.top - shellBox.top,
      width: elBox.width,
      height: elBox.height,
    })
    // anchor identity is the only dependency — we deliberately do NOT re-measure
    // on every render (that recompute IS the flicker the task calls out).
  }, [anchor, shellEl])

  return rect
}

function CoachmarkOverlay({
  screen,
  prefersReducedMotion,
  onCta,
  onSkip,
  railClearancePx = 220,
}: CoachmarkOverlayProps): ReactElement {
  // The overlay container is the positioning context for the frozen rect.
  const shellRef = useRef<HTMLDivElement | null>(null)
  const [shellEl, setShellEl] = useState<HTMLDivElement | null>(null)
  // Promote the ref to state once mounted so the measuring hook re-runs against
  // a real element (refs do not trigger effects). setState here is in an effect,
  // never in render — no setState-in-render.
  useLayoutEffect(() => {
    setShellEl(shellRef.current)
  }, [])

  const anchor = OO_REI_COACHMARK_ANCHOR[screen.targetRegion]
  const target = useFrozenTargetRect(anchor, shellEl)

  // Fade-in for the card (skipped when prefers-reduced-motion → instant).
  const fadeStyle: CSSProperties = prefersReducedMotion
    ? {}
    : {
        animation: 'coachmarkFadeIn 200ms cubic-bezier(0.2, 0, 0, 1) both',
      }

  // ── Card placement ────────────────────────────────────────────────────────
  // With a frozen target: place the card adjacent to it (to the right of a
  // left-edge element like the gauge, otherwise centred horizontally and below
  // a top element / above a bottom element). Without a target: centre, no line.
  let cardPositionStyle: CSSProperties
  // Connector endpoints in shell-local px (card anchor → target anchor).
  let connector: { x1: number; y1: number; x2: number; y2: number } | null = null

  if (target !== null && shellEl !== null) {
    const shellW = shellEl.clientWidth
    const shellH = shellEl.clientHeight
    const targetCx = target.left + target.width / 2
    const targetCy = target.top + target.height / 2
    // Left-edge target (gauge sits at the far left): card to its RIGHT.
    const isLeftEdge = target.left < shellW * 0.25

    if (isLeftEdge) {
      const cardLeft = Math.min(
        target.left + target.width + COACHMARK_CARD_GAP,
        shellW - COACHMARK_CARD_W - 12,
      )
      // Vertically centre the card on the target, clamped into the shell.
      const cardTop = Math.max(72, Math.min(targetCy - 56, shellH - 160))
      cardPositionStyle = { left: `${cardLeft}px`, top: `${cardTop}px` }
      // Line from the card's left edge to the target's right edge.
      connector = {
        x1: cardLeft,
        y1: cardTop + 28,
        x2: target.left + target.width,
        y2: targetCy,
      }
    } else {
      // Top-half target → card below it; bottom-half target → card above it.
      const below = targetCy < shellH * 0.5
      const cardCx = Math.max(
        COACHMARK_CARD_W / 2 + 12,
        Math.min(targetCx, shellW - COACHMARK_CARD_W / 2 - 12),
      )
      const cardTop = below
        ? target.top + target.height + COACHMARK_CARD_GAP
        : Math.max(72, target.top - COACHMARK_CARD_GAP - 132)
      cardPositionStyle = {
        left: `${cardCx}px`,
        top: `${cardTop}px`,
        transform: 'translateX(-50%)',
      }
      connector = {
        x1: cardCx,
        y1: below ? cardTop : cardTop + 132,
        x2: targetCx,
        y2: below ? target.top + target.height : target.top,
      }
    }
  } else {
    // Fallback: centred card, NO connector (no dangling arrow at empty space).
    cardPositionStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  return (
    // Overlay container — inset:0 over the shell so its local coordinate space
    // is identical to the shell's. The frozen rect (measured shell-local) maps
    // 1:1 to absolute children + the connector SVG here.
    <div
      ref={shellRef}
      style={{ position: 'absolute', inset: 0, zIndex: 59, pointerEvents: 'none' }}
    >
      {/* Coachmark keyframe — scoped to this render */}
      <style>{`
        @keyframes coachmarkFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes coachmarkFadeIn {
            from { opacity: 1; }
            to   { opacity: 1; }
          }
        }
      `}</style>

      {/* Full-canvas scrim — dims everything except the spotlit region.
          z-59: above cinematic overlay (z-5), below the call-out card (z-60).
          Pointer-events on the scrim are 'none' so the game stays playable.
          Interaction is only on the card buttons. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 59,
          background: 'rgba(26,22,18,0.65)',
          pointerEvents: 'none',
          ...fadeStyle,
        }}
      />

      {/* Connector — thin cream hairline + small dot from the card to the frozen
          target so the card visibly POINTS at the gauge. Only drawn when a real
          target rect was frozen (no dangling line at empty space otherwise). */}
      {connector !== null && (
        <svg
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 60,
            pointerEvents: 'none',
            overflow: 'visible',
            ...fadeStyle,
          }}
        >
          <line
            x1={connector.x1}
            y1={connector.y1}
            x2={connector.x2}
            y2={connector.y2}
            stroke={COACHMARK_CONNECTOR}
            strokeWidth={1}
          />
          <circle cx={connector.x2} cy={connector.y2} r={3} fill={COACHMARK_CONNECTOR} />
        </svg>
      )}

      {/* Washi-paper call-out card — z-60, positioned per target region. */}
      <div
        role="dialog"
        aria-label={`Tutorial: ${screen.body}`}
        aria-modal="false"
        style={{
          position: 'absolute',
          zIndex: 60,
          width: 'min(280px, calc(100% - 32px))',
          ...cardPositionStyle,
          background: 'rgba(240,232,212,0.92)',
          border: '1px solid rgba(212,137,42,0.45)',
          borderRadius: '3px',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'all',
          boxShadow: '0 4px 24px rgba(0,0,0,0.40)',
          ...fadeStyle,
        }}
      >
        {/* Kanji accent — Noto Serif JP, world layer */}
        {screen.title !== '' && (
          <span style={{
            fontFamily: '"Noto Serif JP", "Yu Mincho", serif',
            fontWeight: 700,
            fontSize: '20px',
            color: 'rgba(212,137,42,0.75)',
            lineHeight: 1,
          }}>
            {screen.title}
          </span>
        )}

        {/* Instructional body — Geist Mono, UI layer */}
        <p style={{
          fontFamily: '"Geist Mono", ui-monospace, monospace',
          fontSize: '12px',
          lineHeight: 1.55,
          color: '#1a1612',
          margin: 0,
        }}>
          {screen.body}
        </p>

        {/* CTA button */}
        <button
          type="button"
          onClick={onCta}
          style={{
            alignSelf: 'flex-start',
            fontFamily: '"Geist Mono", ui-monospace, monospace',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: '#1a1612',
            background: 'linear-gradient(180deg, #f4a73e 0%, #d4892a 100%)',
            border: 'none',
            borderRadius: '2px',
            padding: '6px 12px',
            cursor: 'pointer',
            // Level 1 press-ack sub-100ms (GC1)
            transition: 'transform 80ms cubic-bezier(0.2, 0, 0, 1)',
          }}
          onPointerDown={(e) => {
            if (!prefersReducedMotion) {
              ;(e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'
            }
          }}
          onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
          onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
        >
          {screen.ctaLabel}
        </button>
      </div>

      {/* SKIP → affordance — lower-right of viewport, above the HUD */}
      <button
        type="button"
        onClick={onSkip}
        aria-label="Skip tutorial"
        style={{
          position: 'absolute',
          zIndex: 60,
          bottom: `${railClearancePx}px`,
          right: '16px',
          fontFamily: '"Geist Mono", ui-monospace, monospace',
          fontSize: '11px',
          letterSpacing: '0.16em',
          color: 'rgba(232,223,200,0.55)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          pointerEvents: 'all',
          padding: '4px 0',
          // Level 1 press-ack
          transition: 'transform 80ms cubic-bezier(0.2, 0, 0, 1)',
        }}
        onPointerDown={(e) => {
          if (!prefersReducedMotion) {
            ;(e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'
          }
        }}
        onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
        onPointerCancel={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
      >
        SKIP →
      </button>
    </div>
  )
}

// ─── Styles (Anime Cinematic palette — no cyan) ───────────────────────────────

const shellStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  // 100% of parent (platform main) so bottom-anchored controls stay above the
  // platform's p-6 padding. 100svh was overflowing into the padded gutter,
  // pushing the action bar below the viewport.
  height: '100%',
  minHeight: 500,
  // overflow: 'clip' (NOT 'hidden') — clips identically but creates NO scroll
  // container. A decorative child that extends past the edge (the ARASHI dragon
  // coiling off-frame at narrow widths) can never turn the shell into a
  // scrollable box and shift the whole HUD by scrollLeft. 'hidden' allowed a
  // programmatic scrollLeft (scroll-anchoring) that shifted header/rail by -16px
  // at 390/412 — the responsive-harness `no-left-clip` regression. 'clip' is the
  // structural guarantee the HUD stays pinned to the shell origin.
  overflow: 'clip',
  background: T.bgCanvas,
  // #4 FIX: OO-REI register bans Geist Sans on display/narrative text.
  // Shell default font is Noto Serif JP; Geist Mono is applied explicitly
  // to number/label surfaces (hudStatValueStyle, etc.) via their own styles.
  fontFamily: T.fontKanji,
}

// Blueprint 2026-05-30 §2 Component 7: borderRadius 8→3 (talisman-plaque material),
// color dimmer amber (nav control, not CTA). Font size is bumped inline in JSX below.
const backControlStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  left: 12,
  zIndex: 6,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px 5px 7px',
  borderRadius: 3,
  background: 'rgba(14, 11, 7, 0.72)',
  border: '1px solid rgba(212, 137, 42, 0.40)',
  color: 'rgba(244,167,62,0.80)',
  cursor: 'pointer',
  pointerEvents: 'auto',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
  appearance: 'none',
  WebkitAppearance: 'none',
}

const hudStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  // width: '100%' asserted so left:'50%' on win-reveal panel resolves relative
  // to the shell, not an ambiguous containing block. Fixes centering regression.
  width: '100%',
  zIndex: 4,
  display: 'flex',
  flexDirection: 'column',
  pointerEvents: 'none', // Most HUD is non-interactive; buttons override
}

/** Spirit-bonus curtain — full-canvas painted overlay during the 800ms
    spirit-bonus-entry phase. Painted shadowy spirit + amber flame curtains
    carry the world-shift moment. Z-3.5 (above canvas+characters, below HUD).
    Fade timing is handled by inline opacity + this CSS transition. */
const spiritCurtainStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 3,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center',
  transition: `opacity ${CURTAIN_FADE_IN_MS}ms ease-out`,
  pointerEvents: 'none',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px 0',
  pointerEvents: 'none',
}

const headerTitleGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  // Left clearance: LOBBY button is position:absolute, top:8, left:12.
  // Its right edge reaches ~88-91px. Add 96px margin so the title group
  // never occupies the same horizontal band as the LOBBY button.
  marginLeft: 96,
}

/**
 * Mobile (≤480px) title group — condensed left margin.
 * On mobile the LOBBY button (left:12, ~79px wide) + warden compact chip
 * (right:8, 130px wide) are both absolute positioned at top:8. The header
 * title group sits between them. To center the wordmark visually, use a
 * smaller marginLeft (same as LOBBY clearance but scaled to mobile).
 * The 巻 button in headerMetaStyle provides the right balance point.
 * NO marginRight: that would push it left; the headerStyle justifyContent
 * space-between naturally positions the meta to the right of the title group.
 */
const headerTitleGroupMobileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  // Mobile LOBBY button right edge ≈ 12+7+~17+5+~38+10 = ~89px. Use 92px margin.
  marginLeft: 92,
}

/**
 * Mobile 巻 info button — slightly smaller than desktop (32px vs 36px)
 * so it fits in the compressed mobile header without adding width pressure.
 * Accessible: 32px < 44px touch target minimum BUT this is inside the header
 * which is pointer-events:none; the button overrides pointer-events:all.
 * 32×32px is acceptable for a secondary info control (not a primary action).
 */
const infoButtonMobileStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  // 44x44 minimum touch target (GC7 / RG-C8). Was 32px — failed the a11y floor.
  width: 44,
  height: 44,
  background: 'none',
  border: `1px solid rgba(212, 137, 42, 0.35)`,
  borderRadius: 3,
  padding: 0,
  cursor: 'pointer',
  pointerEvents: 'all',
  flexShrink: 0,
}

// "THE MYTH OF" eyebrow — Geist Mono, quiet label register above the name.
const gameTitleEyebrowStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(9, 12),
  fontWeight: 500,
  letterSpacing: '0.30em',
  color: 'rgba(232,223,200,0.62)',
  textTransform: 'uppercase' as const,
  lineHeight: 1,
}

// Row holding the REI mark and its 神話 kanji subtitle on one baseline.
const gameTitleLockupRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 7,
}

// "REI" — the short mark, Noto Serif JP display register (weight 900).
const gameTitleStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: fluid(22, 30),
  fontWeight: 900,
  letterSpacing: '0.10em',
  color: T.talismanPaper,
  lineHeight: 1,
}

// 神話 ("shinwa", divine legend) — amber kanji subtitle, Noto Serif JP.
const gameTitleSubtitleStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: fluid(12, 16),
  fontWeight: 700,
  letterSpacing: '0.08em',
  color: T.amberAccent,
  lineHeight: 1,
}

/** Amber separator — amber economy job 1 (header separator) */
const amberSeparatorStyle: CSSProperties = {
  height: 1,
  width: '100%',
  background: T.amberAccent,
}

const headerMetaStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
}

// Base chip style shared between RTP and 20-LINES pill
const rtpChipBaseStyle: CSSProperties = {
  fontFamily: T.fontMono,
  color: T.textMuted,
  border: `1px solid ${T.borderSubtle}`,
  borderRadius: 2,
  background: 'rgba(26,22,18,0.6)',
}

/** RTP chip — §4.4 minimum readable size: 12px, padding 3px 8px */
const rtpChipStyle: CSSProperties = {
  ...rtpChipBaseStyle,
  fontSize: fluid(12, 14),
  letterSpacing: '0.08em',
  padding: '3px 8px',
}

/**
 * RTP chip — in-game variant (non-lobby phases).
 * #8 FIX: RTP must be continuously visible across all phases (regulatory).
 * Same content as rtpChipStyle but 50% opacity so it recedes during active
 * gameplay without competing with the HUD readouts for visual hierarchy.
 * Color, font, border all inherited from rtpChipBaseStyle.
 */
const rtpChipInGameStyle: CSSProperties = {
  ...rtpChipBaseStyle,
  fontSize: fluid(12, 14),
  letterSpacing: '0.08em',
  padding: '3px 8px',
  opacity: 0.50,
}

/** "20 LINES" pill — §4.4 minimum readable size: 13px, padding 3px 10px, tracking 0.10em */
const linesPillStyle: CSSProperties = {
  ...rtpChipBaseStyle,
  fontSize: fluid(12, 15),
  letterSpacing: '0.10em',
  padding: '3px 10px',
  textTransform: 'uppercase' as const,
}

// Top info bar styles REMOVED (cohesion rebuild 2026-05-28).
// WAGER / WIN / RTP / SPIRIT SEALS now in the integrated bottom HUD band.

/**
 * B.3 cohesive scene character hide wrapper (2026-05-31).
 * Applied to the div wrapping OoReiCharacterLayer when a cohesive scene is
 * active. The character layers are HIDDEN (opacity:0, pointer-events:none)
 * because Rei and the spirit are already embedded in the scene image.
 * The DOM subtree is retained so a region change instantly restores the
 * old path without re-mounting. Revert: remove hasCohesiveScene guard in
 * OoReiExperience to restore separate-layer behaviour for all regions.
 * Only transform and opacity are used (no layout properties). Zero cyan.
 */
const cohesiveSceneCharacterHideStyle: CSSProperties = {
  opacity: 0,
  pointerEvents: 'none',
  // Instant hide (no fade): the scene is already loaded at this point.
  // A fade would produce a ghost double-image as the scene fades in and
  // the character layers fade out at different rates. Snap is correct here.
  transition: 'none',
} as const

const spiritBonusBarStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 16px',
  background: 'rgba(26,22,18,0.85)',
  borderBottom: `1px solid ${T.borderAmber}`,
  pointerEvents: 'none',
}

const spiritBonusLabelStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(11, 14),
  color: T.talismanPaper,
  letterSpacing: '0.1em',
}

const spiritBonusTotalStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(14, 18),
  fontWeight: 700,
  color: T.talismanGlow,
  letterSpacing: '0.05em',
}

// FREE SEALS lead label — muted Geist Mono so the count is the hero.
const spiritBonusLabelLeadStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: T.textMuted,
  textTransform: 'uppercase',
}

// FREE SEALS remaining count — the focus during the bonus (amber, bold).
const spiritBonusCountStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(15, 20),
  fontWeight: 800,
  color: T.talismanGlow,
  letterSpacing: '0.02em',
}

// "/ total" denominator — demoted cream so the bonus run reads as bounded.
const spiritBonusOfTotalStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(11, 14),
  fontWeight: 600,
  color: T.textMuted,
  letterSpacing: '0.02em',
}

// ─── Screen-reader-only Spirit Bonus announcement (display only) ─────────────
// The visual Spirit Bonus tracker is now the canvas-native Living Spirit Header
// (drawn inside OoReiSlotCanvas as part of the board frame). This visually
// hidden span preserves the polite live-region announcement the removed DOM
// marquee carried — present in the accessibility tree, invisible on screen.
const srOnlyStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

// ─── Next-unlock hint (region grind target — display only) ───────────────────
// A small calm "next region" line, anchored just under the region banner. Tells
// the player WHAT they grind toward without chase pressure (RG §7). Carries no
// economic value. Stone-cream type on dark glass; ZERO cyan.
const nextUnlockHintStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 4,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 9px',
  borderRadius: 2,
  background: 'rgba(20,16,12,0.66)',
  border: '1px solid rgba(200,184,144,0.18)',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  backdropFilter: 'blur(3px)',
  WebkitBackdropFilter: 'blur(3px)',
}

const nextUnlockLabelStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 8,
  fontWeight: 600,
  letterSpacing: '0.16em',
  color: 'rgba(232,223,200,0.50)',
  textTransform: 'uppercase',
  lineHeight: 1,
}

const nextUnlockKanjiStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: 12,
  fontWeight: 700,
  color: 'rgba(244,167,62,0.78)',
  lineHeight: 1,
}

const nextUnlockNameStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.10em',
  color: 'rgba(232,223,200,0.78)',
  textTransform: 'uppercase',
  lineHeight: 1,
}

// ─── Altar panel background (shared by HUD band + hotzone cards) ─────────────
// The three-layer painted altar background. Preserves Tim's "great PLACE WAGER
// art" verbatim — now as the permanent HUD band surface rather than a modal.
//
// P0-1 FIX 2026-05-29: MUST be a single-line string with NO leading/trailing
// newlines and NO internal newlines. When React serialises this as an inline
// style backgroundImage value, any embedded newline is passed verbatim to the
// browser which SILENTLY DROPS the entire background-image property. Collapsing
// to one logical line with ', ' separators (CSS multi-value syntax) is the only
// correct form for inline styles.
const ALTAR_BG_IMAGE = "linear-gradient(135deg, rgba(14, 10, 6, 0.78) 0%, rgba(14, 10, 6, 0.55) 28%, rgba(14, 10, 6, 0) 55%), radial-gradient(ellipse at center, rgba(18, 13, 9, 0.85) 0%, rgba(18, 13, 9, 0.68) 55%, rgba(18, 13, 9, 0.22) 88%, rgba(18, 13, 9, 0) 100%), url('/assets/generated/oo-rei/altar-panel-bg.jpg')"
const ALTAR_BG_SIZE = 'cover, cover, cover' as const
const ALTAR_BG_POS = 'center, center, center' as const
const ALTAR_BG_REPEAT = 'no-repeat, no-repeat, no-repeat' as const

// ─── Integrated bottom HUD band — 3-zone horizontal layout ───────────────────

/**
 * HUD band outer container — 3-zone horizontal layout.
 * Layout spec 2026-05-29: LEFT stat 2x2 / CENTER stepper + CTA / RIGHT AWAKEN+CASHOUT.
 * Height: 200px desktop / 84px tablet / 190px mobile. Painted altar surface. Always visible.
 */
/**
 * Amber filament line — 2px full-width gradient strip at band top.
 * Replaces the former 1px border. Amber economy job 1 (lacquer trim).
 * linear-gradient fades transparent → amber peak → transparent.
 */
const AMBER_FILAMENT_LINE = `linear-gradient(90deg, transparent 0%, #d4892a 20%, #f4a73e 50%, #d4892a 80%, transparent 100%)`

// HUD DECK surface — A1 (cohesive composition 2026-05-31):
// Replace the warm orange-wood deck-panel-bg-v2.jpg with a DARK WET-STONE surface.
// Rationale: the warm wood was the single worst material disconnect — it pulled the
// HUD into a different room from the cool-stone ritual scene above it. The new
// dark charcoal-stone base registers as the floor of the same ritual site, the same
// material as the sealing dais. The stone-cream 1px top border replaces the gold
// filament line (which read as a warm ornament). Amber remains as accent only (earned).
//
// Material recipe: rgba(34,28,22,0.97) — dark charcoal with a hint of warm stone.
// No warm wood, no orange grain, no cedar. The base IS the palette token T.bgCanvas
// at #1a1612, one step lighter (#221c16 equivalent) for the surface feel.
// No new image asset required. The CSS fallback is sufficient (spec §6 "B2 optional").
const HUD_DECK_BG = 'none' as const  // no background-image — color only (no warm wood)
const HUD_DECK_SIZE = 'auto' as const
const HUD_DECK_POS = 'center' as const
const HUD_DECK_REPEAT = 'no-repeat' as const

// ─── Integrated HUD material textures ────────────────────────────────────────
//
// REMOVED 2026-05-30 (Tim 2nd rejection — "really bad"):
//   WASHI_STAT_BG_LAYER (washi-stat-backing.png) — avg pixel rgb(220,211,186),
//   a pale cream card that reads as plopped UI boxes on the dark lacquer deck.
//   Stat readouts now sit directly on the deck, grouped by 1px ink hairlines.
//
//   SEAL_MOUNT_BG_LAYER (seal-grid-ink-mount.png) — avg pixel rgb(192,183,170),
//   same pale cream box problem for the seal medallion column.
//
// KEPT:
//   WASHI_PLAQUE_BG_LAYER — the BET plaque recess is dark (near-1.0 opacity
//   gradient above it), so the grain reads as carved-wood texture, not a pale box.
//   OFUDA_BUTTON_BG_LAYER — amber gradient sits fully above, texture is invisible.
//
// Spec §4.1: washi backing for BET plaque face (dark recess — grain barely visible)
const WASHI_PLAQUE_BG_LAYER = "url('/assets/generated/oo-rei/hud/washi-plaque-backing.png')" as const
// Spec §4.3: ofuda paper texture under the amber gradient on the CTA button
const OFUDA_BUTTON_BG_LAYER = "url('/assets/generated/oo-rei/hud/ofuda-button-texture.png')" as const

function hudBandOuterStyle(hudH: number): CSSProperties {
  return {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: hudH,
    zIndex: 4,
    // A1 (cohesive composition 2026-05-31): dark wet-stone surface.
    // rgba(34,28,22,0.97) — dark charcoal with a whisper of warm stone (not orange wood).
    // Matches the cool-stone register of the ritual scene and the sealing dais above.
    // The warm wood deck-panel-bg-v2.jpg and amber filament line are retired.
    // Stone-cream top separator (rgba(200,184,144,0.22)) replaces the warm gold line.
    backgroundColor: 'rgba(34,28,22,0.97)',
    // Stone-cream 1px top border: matches the gridBorder token (C.gridBorder).
    // Reads as the top edge of the stone floor altar surface, not a warm ornament.
    backgroundImage: 'none',
    // Inner shadow: seated into canvas from above (overcast key), not a warm bevel.
    boxShadow: 'inset 0 1px 0 rgba(200,184,144,0.22), inset 0 12px 32px rgba(0,0,0,0.45), inset 0 -8px 22px rgba(0,0,0,0.48)',
    overflow: 'visible',
    pointerEvents: 'all',
  }
}

/**
 * 5-col desktop zones flex row.
 * maxWidth 1120 + margin auto: at 1440px viewport → 160px warm deck visible each side.
 * At 1024px → 80px each side. Both read as "instrument deck with stage presence".
 * Removed the old maxWidth:760 cramp that Tim called "floating pieces".
 */
const hudBandZonesStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  height: '100%',
  maxWidth: 1120,
  margin: '0 auto',
  padding: '12px 16px 14px', // Pass 3: +2px top/bottom — the band seats more open on the deck
  gap: 0,
}

/**
 * Mobile 2-layer zones column (spec A.3 2026-05-29 rev).
 * Layer 1: full-width dominant CAST bar (58px + 4px marginTop = 62px).
 * Layer 2: secondary row — stats / wager plaque / awaken+cashout (96px).
 * Total: 158px of the 194px band (below 36px seal strip).
 * Secondary row increased 80→96px: holds two 44px buttons (AWAKEN + CASH OUT)
 * with gap:4 (44+4+44=92px) inside 92px inner area (96-2-2). Zero overflow. RG-C8.
 */
const hudMobileZonesColStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: 158,
  width: '100%',
}

/**
 * Layer 1: dominant CAST bar — spans full band width minus 8px gutters.
 * Spec: ~377px wide at 393px viewport. Primary action, unmissable.
 */
const hudMobileCastBarStyle: CSSProperties = {
  width: 'calc(100% - 16px)',
  height: 58,
  marginTop: 4,
  marginLeft: 8,
  marginRight: 8,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

/**
 * Dominant mobile CTA button — full bar width, 52px height.
 * Larger font (16px) and height than the desktop CTA, communicating PRIMARY action.
 * RG-C8: 52px >> 44px touch target floor. No resting shadow (mobile performance).
 */
const hudMobileCtaDominantStyle: CSSProperties = {
  width: '100%',
  height: 52,
  minHeight: 44,
  flexShrink: 0,
  padding: '0 12px',
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: '0.14em',
  color: '#1a1612',
  background: `linear-gradient(180deg, #f4a73e 0%, #d4892a 60%, #a0651e 100%)`,
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0,
}

/**
 * Layer 2: secondary row — stats / wager plaque / awaken+cashout.
 * Height: 96px (increased from 80px). Inner content = 96-2-2=92px.
 * Right column: two 44px buttons + gap:4 = 92px — exact fit with zero overflow.
 * 3-col: stats (flex-1) / wager (100px) / right (72px).
 */
const hudMobileSecondaryRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  justifyContent: 'space-between',
  height: 96,
  padding: '2px 8px 2px',
  gap: 6,
}

/**
 * COL-A outer wrapper — column flex that stacks the stat pair row + Glass Box chip.
 * flex:1 absorbs remaining space (same as old hudMobileSecondaryStatColStyle).
 * The inner row (hudMobileSecondaryStatColStyle) carries the stat pair; the Glass
 * Box sits as a second child below it. This prevents the chip from appearing as a
 * 3rd horizontal item in the stat row, which was causing it to overlap the BET plaque.
 */
const hudMobileStatColOuterStyle: CSSProperties = {
  flex: 1,
  minWidth: 80,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'center',
  height: '100%',
  boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.50), inset -2px 0 0 rgba(200,184,144,0.09)',
  paddingRight: 4,
  marginRight: 2,
  overflow: 'hidden',
}

/**
 * Glass Box chip wrapper — sits BELOW the stat pair in the mobile stat column.
 * width:100% fills the column. padding:0 — the chip's own padding is sufficient.
 * overflow:hidden prevents any internal text from bleeding out of the column.
 */
const hudMobileGlassBoxWrapStyle: CSSProperties = {
  width: '100%',
  overflow: 'hidden',
  flexShrink: 0,
}

/** Secondary stats inner row — the horizontal BALANCE | WIN pair.
 *  No longer has flex:1 or height:'100%' — it is a child of the outer column. */
const hudMobileSecondaryStatColStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  width: '100%',
}

/**
 * 44px touch wrapper for secondary controls (AWAKEN / CASH OUT / wager plaque).
 * minHeight 44 — RG-C8 touch target floor.
 * Inside the right column: height expands to fill the column half (space-between).
 * Visible button inside is 34px; the extra padding is the invisible touch extension.
 */
const hudMobileSecondaryTouchWrapStyle: CSSProperties = {
  minHeight: 44,
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

/** Right column: AWAKEN + CASH OUT stacked, 80px wide (was 72px, §4.14).
 * §4.14 (2026-05-29): +8px → 80px. CASH OUT label "CASH OUT" at 11px Geist Mono needs
 * ~68px text width; 80-4(paddingLeft)=76px content area. Sufficient at any wager value.
 * Direct children are the two 44px buttons — no intermediate touch-wrapper divs.
 * Parent row uses alignItems:'stretch' so this column fills the row's inner height (92px).
 * gap:4 + space-between: top button at top, bottom button at bottom, 0px dead zone.
 * 44+4+44=92px = exact fit with row inner height 92px. Zero overflow, zero overlap.
 * paddingLeft:4 kept for the carved-groove visual. Buttons use width:'100%'
 * to fill the content area (80-4=76px), preventing right-edge clip. */
const hudMobileSecondaryRightColStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'space-between',
  width: 80,
  flexShrink: 0,
  boxShadow: 'inset 2px 0 0 rgba(0,0,0,0.60), inset 3px 0 0 rgba(200,184,144,0.12), inset 4px 0 0 rgba(0,0,0,0.20)',
  paddingLeft: 4,
  gap: 4,
}

/**
 * Altar mark kanji (desktop only) — static carved texture behind the CTA well.
 * The kanji 霊 at low opacity reads as the altar surface being marked.
 * NOT animated (RG-safe: static texture, not a live element).
 * zIndex: -1 within the relative-positioned center column.
 */
// §4.5 (2026-05-29): altar mark upgraded 48px→100px, opacity 0.07→0.05.
// At 100px the carved mark reads as a real altar inscription behind the CTA.
// At 48px it disappears. Opacity reduced to compensate for the larger surface area.
const hudAltarMarkStyle: CSSProperties = {
  position: 'absolute' as const,
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  fontFamily: '"Noto Serif JP", "Yu Mincho", serif',
  fontSize: 100,
  fontWeight: 400,
  color: '#e8dfc8',
  opacity: 0.05,
  lineHeight: 1,
  pointerEvents: 'none' as const,
  userSelect: 'none' as const,
  zIndex: 0,
}

// ─── TABLET TIER HUD STYLES (481–900px, 84px single row) ────────────────────
//
// Zero fixed-px column widths. All 4 columns use flex + min-width guards.
// At 481px: STAT-PAIR 130 + WAGER 110 + CAST flex(77) + RIGHT 132 + pad 32 = 481. Zero overflow.
// At 900px: same outer columns, CAST flex absorbs 496px — ideal.
//
// Spec 2026-05-29: replaces the absent tablet tier that caused 5-col overflow/overlap
// at 481–900px (zero-px flex-1 center, CAST clipping off right edge).

/**
 * Tablet single-row container (84px, full band height).
 * All columns flex-row, no maxWidth centering needed at tablet range.
 */
const hudTabletBandZonesStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  height: '100%',
  padding: '0 16px',
  gap: 6,
}

/**
 * Tablet STAT-PAIR: WAGER + WIN in a horizontal pair with carved divider.
 * min-width 110 / max 150. No SESSION or SEALS — space saving for this tier.
 * flexShrink:1 lets it compress below 110px at very narrow band widths.
 */
// §4.15 (2026-05-29): fixed 120px eliminates compression unpredictability at 481–900px.
const hudTabletStatPairStyle: CSSProperties = {
  flex: '0 0 120px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 0,
  boxShadow: 'inset -1px 0 0 rgba(0,0,0,0.50), inset -2px 0 0 rgba(200,184,144,0.09)',
  paddingRight: 8,
  marginRight: 4,
  overflow: 'hidden' as const,
}

/**
 * Tablet CENTER CTA column: flex-1 absorbs remainder.
 * min-width 0 + overflow:hidden prevents overflow at narrow band widths.
 * The CTA button uses width:min(180px,100%) so it never exceeds the column.
 */
const hudTabletCenterStyle: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden' as const,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
}

/**
 * Tablet RIGHT column: 120px fixed — AWAKEN (top) + CASH OUT (bottom).
 * §4.15 (2026-05-29): -12px from 132px, buttons 108px wide.
 * Left carved-groove divider mirrors desktop COL-5 style.
 */
const hudTabletRightStyle: CSSProperties = {
  flex: '0 0 120px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px',
  boxShadow: 'inset 1px 0 0 rgba(0,0,0,0.50), inset 2px 0 0 rgba(200,184,144,0.09)',
}

/**
 * Mobile full-width seal strip — Layer 1 of the mobile band (36px).
 * Shows seals / talisman state in a compact horizontal row above the 3-col zone.
 */
const hudMobileSealStripStyle: CSSProperties = {
  height: 36,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '0 12px',
  borderBottom: '1px solid rgba(200,184,144,0.10)',
  flexShrink: 0,
}

/**
 * COL-2 (desktop only): Seal medallion column — 136px wide (was 160px, §4.9).
 * 3-layer routed-groove right divider (spec A.6):
 *   Layer 1: 2px hard shadow
 *   Layer 2: 3px cream highlight
 *   Layer 3: 4px secondary shadow
 * Sumi-e ink-mount field (§4.2): ink-brush backing for the 2x2 medallion grid.
 * backgroundImage composites the mount field behind any medallion content.
 */
const hudSealColStyle: CSSProperties = {
  width: 136,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 8px 8px 16px', // left 12→16: region seal content pushed into its own space, off COL-1
  // 2026-05-30: no seal-mount PNG (pale cream box removed). Clean lacquer deck surface.
  boxShadow: 'inset -2px 0 0 rgba(0,0,0,0.60), inset -3px 0 0 rgba(200,184,144,0.12), inset -4px 0 0 rgba(0,0,0,0.20)',
}

/** State A: vertical stack (ghosted medallion + prompt) in COL-2 */
const hudSealColEmptyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}

/** State B: 2×2 grid in COL-2 — up to 4 earned ally medallions */
const hudSealColGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px 12px',
  alignItems: 'center',
  justifyItems: 'center',
}

/** "+N more" overflow button in COL-2 */
const hudSealColMoreStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: 10,
  color: '#d4892a',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  letterSpacing: '0.08em',
  textAlign: 'center' as const,
  padding: '2px 0',
}

/**
 * COL-1 (desktop only, NEW POSITION after 2026-05-30 reorder): Wager plaque column container.
 * Was COL-4 (right of CTA). Now COL-1 (leftmost) — BET input is first in reading order.
 * Groove direction flipped: was LEFT-groove (inset 2px 0), now RIGHT-groove (inset -2px 0)
 * because it is the first column (nothing to its left; COL-2 seals is to its right).
 * Width kept 120px to match original, close to original hudLeftZoneStyle 156px reduced size.
 */
const hudWagerColStyle: CSSProperties = {
  position: 'relative' as const, // needed for 朱印 dot absolute positioning
  // 120->140px: BET column gets extra breathing room; at 1280w the prior 120px
  // left only ~4px clearance from the warm-deck boundary.
  width: 140,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px 12px',
  // RIGHT groove (was left-groove before column reorder — mirrors COL-2 right divider style)
  boxShadow: 'inset -2px 0 0 rgba(0,0,0,0.60), inset -3px 0 0 rgba(200,184,144,0.12), inset -4px 0 0 rgba(0,0,0,0.20)',
}

/**
 * Wager plaque — Ofuda (御札) instrument plate aesthetic.
 * Desktop: 112×64px column layout. Mobile: full-width 36px horizontal.
 * Dark walnut grain gradient + amber lacquer border + routed inner shadow.
 * Corner decorations (賭 kanji, ◉ seal) applied via ::before/::after equivalents
 * in the JSX (absolutepositioned spans within the button, hidden on mobile).
 * "Open" state: amber border brightens + glow box-shadow.
 * Disabled: opacity 0.45.
 */
function hudWagerPlaqueStyle(mobile: boolean, isOpen: boolean, isDisabled: boolean): CSSProperties {
  return {
    position: 'relative' as const,
    width: mobile ? '100%' : 112,
    height: mobile ? 36 : 64,
    // Tim 2026-05-30: the controls "look bolted on." Re-art as a ROUTED RECESS
    // pressed into the lacquered deck — the wood IS the frame. Darker resting
    // surface, barely-there groove rim (not an amber bezel), deep inner shadow so
    // it reads as carved-in. Amber rim only appears when open (the chip tray lit).
    // Washi backing (§4.1): bottommost layer — warm paper grain under the dark lacquer gradient.
    // The dark gradient sits above at near-1.0 opacity so the washi reads as a faint warm texture.
    // Only on desktop (not mobile) to keep the performance budget manageable.
    backgroundImage: mobile ? undefined
      : isOpen
        ? `linear-gradient(160deg, rgba(58,40,18,0.92) 0%, rgba(34,22,10,0.96) 45%, rgba(24,14,6,0.97) 100%), ${WASHI_PLAQUE_BG_LAYER}`
        : `linear-gradient(160deg, rgba(28,18,8,0.94) 0%, rgba(18,11,4,0.96) 50%, rgba(14,8,2,0.98) 100%), ${WASHI_PLAQUE_BG_LAYER}`,
    backgroundSize: mobile ? undefined : 'cover, cover',
    backgroundPosition: mobile ? undefined : 'center, center',
    backgroundRepeat: mobile ? undefined : 'no-repeat, no-repeat',
    background: mobile
      ? (isOpen
        ? 'linear-gradient(160deg, rgba(58,40,18,0.96) 0%, rgba(34,22,10,0.98) 45%, rgba(24,14,6,0.99) 100%)'
        : 'linear-gradient(160deg, rgba(28,18,8,0.98) 0%, rgba(18,11,4,0.99) 50%, rgba(14,8,2,1.0) 100%)')
      : undefined,
    border: isOpen
      ? '1px solid rgba(212,137,42,0.55)'
      : '1px solid rgba(120,95,55,0.30)', // faint groove rim, not a bezel
    borderRadius: 3,
    boxShadow: isOpen
      ? 'inset 0 2px 10px rgba(0,0,0,0.80), inset 0 -1px 0 rgba(200,160,80,0.12), 0 1px 0 rgba(200,160,80,0.10)'
      : 'inset 0 2px 12px rgba(0,0,0,0.90), inset 0 1px 0 rgba(0,0,0,0.70)', // deep pressed recess
    cursor: isDisabled ? 'default' : 'pointer',
    display: 'flex',
    flexDirection: mobile ? 'row' as const : 'column' as const,
    alignItems: 'center',
    justifyContent: mobile ? 'space-between' as const : 'center' as const,
    gap: mobile ? 0 : 5,
    padding: mobile ? '0 10px' : '8px 10px',
    opacity: isDisabled ? 0.45 : 1,
    pointerEvents: isDisabled ? 'none' as const : 'all' as const,
    flexShrink: 0,
    overflow: 'hidden' as const,
  }
}

/** "BET" eyebrow label inside the plaque (Blueprint 2026-05-30 §2: renamed from "WAGER") */
const hudWagerPlaqueLabelStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: fluid(10, 13),
  fontWeight: 600,
  letterSpacing: '0.18em',
  color: 'rgba(232,223,200,0.55)',
  textTransform: 'uppercase' as const,
}

/** Value readout inside plaque — 18px (Pass 3): subordinate to the 22px WIN stat
 *  so hierarchy reads WIN (outcome) > WAGER (decision), and the value breathes
 *  inside the 64px plaque without touching the label/hint. */
const hudWagerPlaqueValueStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: fluid(17, 22),
  fontWeight: 700,
  letterSpacing: '0.02em',
  color: '#e8dfc8',
  lineHeight: 1,
}

/** Value readout inside plaque — mobile 16px horizontal variant */
const hudWagerPlaqueValueMobileStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: fluid(15, 19),
  fontWeight: 700,
  letterSpacing: '0.02em',
  color: '#e8dfc8',
  lineHeight: 1,
}

/** "TAP TO CHANGE" hint — desktop only, shown on hover via opacity transition */
const hudWagerPlaqueHintStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: fluid(8, 10),
  fontWeight: 500,
  letterSpacing: '0.14em',
  color: 'rgba(212,137,42,0.55)',
  textTransform: 'uppercase' as const,
  // opacity toggled inline; transition applied via inline style
}

/**
 * COL-1 / COL-A — stats column.
 * Desktop 5-col: 180px (was 124px — spacious redesign 2026-05-29).
 * Mobile 3-col: 100px.
 * Carved-groove right divider unchanged.
 */
function hudLeftZoneStyle(mobile: boolean): CSSProperties {
  return {
    // 210px desktop: sized to contain "FREE SEALS" label without overflow.
    // "FREE SEALS" in Geist Mono 11px measures ~101px. Each secondary cell is
    // 210/2=105px, minus 8px left + 8px right padding = 89px content — enough.
    // Receipt accrual row is width:100% + text-overflow:ellipsis on the text line
    // so it cannot bleed past the zone. No overflow:hidden — that was the bad band-aid
    // that clipped "FREE SEALS" to "FREE S". Zone width is the correct fix.
    width: mobile ? 90 : 210,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    // 3-layer routed-groove right divider
    boxShadow: 'inset -2px 0 0 rgba(0,0,0,0.60), inset -3px 0 0 rgba(200,184,144,0.12), inset -4px 0 0 rgba(0,0,0,0.20)',
    padding: mobile ? '6px 6px' : '8px 8px',
  }
}

/** 2x2 grid container inside LEFT zone */
const hudStatGridStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  gap: 0,
}

const hudStatRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1,
}

// §4.8 (2026-05-29): split into two named variants with visual hierarchy.
// PRIMARY (WAGER + WIN row): slightly elevated — the decision and outcome data.
// SECONDARY (SESSION + FREE SEALS row): recedes — contextual, not urgent.
// The original single `hudStatCellStyle` is preserved as the PRIMARY variant
// so the existing JSX that references it (tablet/mobile tiers) continues working.
const hudStatCellStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  // 2026-05-30: no card background — type on deck directly.
  gap: 5,
  padding: '10px 8px',
  background: 'transparent',
  borderRadius: 3,
}

// PRIMARY stat cell — WIN row (desktop COL-4 top row, new position after 2026-05-30 reorder)
// 2026-05-30 restraint pass: no washi backing. Type sits directly on the dark lacquer deck.
// A single top hairline (box-shadow) separates this cell from the band top edge.
// The pale cream backing (avg rgb(220,211,186)) read as a plopped UI card — removed.
const hudStatCellPrimaryStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  padding: '16px 8px', // breathing room inside the 200px desktop band
  background: 'transparent',
  borderRadius: 3,
}

// SECONDARY stat cell — SESSION + FREE SEALS row (desktop COL-4 bottom row, new position)
// 2026-05-30 restraint pass: no washi backing. Type directly on the deck. Recedes
// through font-size + opacity on the value, not through a pale card lift.
const hudStatCellSecondaryStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  // gap 5->3: label and value sit closer — SESSION/FREE SEALS read as a unit.
  gap: 3,
  // padding 8->6px top: tighter secondary row so cells don't float.
  padding: '6px 8px',
  background: 'transparent',
  borderRadius: 3,
}

// SECONDARY stat value — dimmer + smaller so it recedes behind WAGER/WIN
const hudStatValueSecondaryStyle: CSSProperties = {
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: fluid(14, 18),
  fontWeight: 700,
  color: 'rgba(232,223,200,0.55)',
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap' as const,
}

// §4.6 (2026-05-29): stat label floor raised 9→11px, letterSpacing 0.16em→0.14em.
// At 9px labels are below legible threshold at arm's length (phone or monitor).
/** Desktop stat label: 11px minimum readable floor, letterSpacing 0.14em */
const hudStatLabelStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(11, 14),
  fontWeight: 600,
  letterSpacing: '0.14em',
  color: 'rgba(232, 223, 200, 0.60)',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
}

// §4.6: mobile label also raised to 11px floor
const hudStatLabelMobileStyle: CSSProperties = {
  ...hudStatLabelStyle,
  fontSize: fluid(11, 13),
  letterSpacing: '0.14em',
}

/** Desktop stat value: 22px (§4.4 minimum readable size), weight 700 */
const hudStatValueStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(20, 26),
  fontWeight: 700,
  color: T.talismanPaper,
  letterSpacing: '0.02em',
  whiteSpace: 'nowrap' as const,
}

// §4.7 (2026-05-29): mobile stat value floor raised 12→14px
const hudStatValueMobileStyle: CSSProperties = {
  ...hudStatValueStyle,
  fontSize: fluid(14, 18),
}

const hudStatRowDividerStyle: CSSProperties = {
  height: 1,
  background: 'rgba(200, 184, 144, 0.12)',
  width: '100%',
}

const hudStatColDividerStyle: CSSProperties = {
  width: 1,
  height: '100%',
  background: 'rgba(200, 184, 144, 0.12)',
  flexShrink: 0,
  alignSelf: 'stretch',
}

/**
 * COL-3 center: flex 1 (remainder) — CAST CTA + altar mark + context line (desktop).
 * position: relative so the altar-mark kanji can be absolute-positioned inside.
 * No dividers on left or right — CAST is the focal point.
 */
const hudCenterZoneStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  position: 'relative' as const,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  // +8px top padding vs prior spec (was 6px): gives TOTAL BET line visual
  // breathing room below the amber filament (RG-C5: no session-scaling).
  padding: '14px 16px 10px',
  gap: 6,
}

/**
 * COL-5 / COL-C: AWAKEN (top) + CASH OUT (bottom).
 * Desktop: 120px wide (was 96px), buttons 100px wide (was 76px).
 * Mobile: 80px wide, buttons 72px (existing 44px height retained).
 * justifyContent: space-between — AWAKEN top-anchored, CASH OUT bottom-anchored.
 * The gap between them (76px at 200px band) makes each button legible as distinct action.
 */
function hudRightZoneStyle(mobile: boolean): CSSProperties {
  return {
    width: mobile ? 80 : 120,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Desktop: top 16px (was 8px) pushes AWAKEN away from amber filament;
    // bottom 12px (was implicit 8px) keeps CASH OUT off the band floor.
    // Mobile padding unchanged. RG-C5: values are module-level consts, not scaled.
    padding: mobile ? '6px 4px' : '16px 10px 12px',
    // 3-layer routed-groove left divider
    boxShadow: 'inset 2px 0 0 rgba(0,0,0,0.60), inset 3px 0 0 rgba(200,184,144,0.12), inset 4px 0 0 rgba(0,0,0,0.20)',
  }
}

// ── Wager stepper ──────────────────────────────────────────────────────────────

function hudWagerStepperStyle(disabled: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    opacity: disabled ? 0.45 : 1,
    pointerEvents: disabled ? 'none' : 'all',
  }
}

const hudStepperButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: T.fontMono,
  fontSize: 16,
  fontWeight: 700,
  color: T.textMuted,
  background: 'linear-gradient(180deg, rgba(60, 50, 36, 0.85) 0%, rgba(36, 30, 22, 0.92) 100%)',
  border: `1px solid ${T.borderSubtle}`,
  borderRadius: 3,
  cursor: 'pointer',
  lineHeight: 1,
}

const hudStepperValueStyle: CSSProperties = {
  minWidth: 56,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: T.fontMono,
  fontSize: 13,
  fontWeight: 700,
  color: T.talismanPaper,
  background: 'none',
  border: `1px solid ${T.borderSubtle}`,
  borderRadius: 3,
  cursor: 'pointer',
  padding: '0 6px',
  letterSpacing: '0.02em',
}

const hudStepperValueActiveStyle: CSSProperties = {
  border: `1px solid rgba(212, 137, 42, 0.55)`,
}

function hudChipTrayStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute' as const,
    // bottom 38 clears the new context row below the stepper (spec CONTROL DECK v2)
    bottom: 38,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 5,
    backgroundImage: ALTAR_BG_IMAGE,
    backgroundSize: ALTAR_BG_SIZE,
    backgroundPosition: ALTAR_BG_POS,
    backgroundRepeat: ALTAR_BG_REPEAT,
    border: `1px solid rgba(200, 184, 144, 0.22)`,
    borderRadius: 4,
    padding: '6px',
    minWidth: mobile ? 200 : 240,
  }
}

const hudChipTrayInnerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 4,
  justifyContent: 'center',
}

// Chip buttons (for tray)
const hudChipStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  fontWeight: 600,
  color: T.textMuted,
  background: 'linear-gradient(180deg, rgba(60, 50, 36, 0.85) 0%, rgba(36, 30, 22, 0.92) 100%)',
  borderStyle: 'solid',
  borderWidth: 1,
  borderColor: T.borderSubtle,
  borderRadius: 3,
  padding: '5px 8px',
  cursor: 'pointer',
  transition: 'border-color 150ms cubic-bezier(0.2,0,0,1), box-shadow 150ms cubic-bezier(0.2,0,0,1)',
  whiteSpace: 'nowrap' as const,
}

const hudChipActiveStyle: CSSProperties = {
  borderColor: T.amberAccent,
  color: T.talismanPaper,
  boxShadow: `inset 0 0 0 1px rgba(212,137,42,0.20), 0 0 8px rgba(212,137,42,0.30)`,
}

// Spirit bonus status row (in CENTER zone during bonus)
const hudBonusStatusStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
}

const hudBonusSealsStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(11, 14),
  color: T.talismanPaper,
  letterSpacing: '0.1em',
}

const hudBonusTotalStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(13, 17),
  fontWeight: 700,
  color: T.talismanGlow,
  letterSpacing: '0.04em',
}

// ── Context row (Row 2 in the TWO-ROW center console) ─────────────────────────

/** Context line wrapper — sits below the stepper, above the CTA well */
const hudContextRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  minHeight: 16,
  width: '100%',
}

// §4.18 (2026-05-29): context text reads as altar engraving — amber 55%, 10px, 0.14em tracking.
/** CASTING... / TOTAL BET text in the context line */
const hudContextTextStyle: CSSProperties = {
  fontFamily: T.fontMono,
  // floor 10->11px, cap 13->14px: legible at arm's length without competing with CTA.
  fontSize: fluid(11, 14),
  // 0.14->0.12em: fractionally tighter to fill the new larger size without widening.
  letterSpacing: '0.12em',
  // 0.55->0.65: more visible; still recedes behind the CAST CTA (amber economy).
  color: 'rgba(212, 137, 42, 0.65)',
  whiteSpace: 'nowrap' as const,
}

/**
 * Spirit-form ambient glyph — static, low opacity, NOT animated.
 * Sits between context line and CTA well as carved-altar texture.
 * 0=none, 1=霊 0.18, 2=気 0.22, 3=魂 0.28, 4=神 0.35.
 * RG-safe: no animation, no flicker, purely ambient material.
 */
const SPIRIT_FORM_GLYPHS: Record<number, string> = {
  0: '',
  1: '霊',
  2: '気',
  3: '魂',
  4: '神',
}
const SPIRIT_FORM_GLYPH_OPACITY: Record<number, number> = {
  0: 0,
  1: 0.18,
  2: 0.22,
  3: 0.28,
  4: 0.35,
}

/** Spirit-form ambient glyph style — static only, no animation (RG-safe) */
const hudSpiritFormGlyphStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: 18,
  fontWeight: 700,
  color: T.talismanPaper,
  lineHeight: 1,
  pointerEvents: 'none' as const,
  userSelect: 'none' as const,
  // opacity applied inline per form index
}

// ── CTA button — fixed width, proper touch target ─────────────────────────────

/**
 * CTA well — recessed seat that the CAST button sits in.
 * padding '6px 8px' (v3: lifts button off floor ~16-22px gap from band bottom).
 * background rgba(0,0,0,0.20), borderRadius 6, inset shadow.
 * Reads as the button being routed into the altar deck surface.
 */
// §4.11 (2026-05-29): well now takes full width of center column and caps at 480px
// so the CAST button centers properly at wide desktop viewports.
const hudCtaWellStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.20)',
  borderRadius: 6,
  boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.55)',
  padding: '4px 8px',
  flexShrink: 0,
  width: '100%',
  maxWidth: 480,
}

/**
 * CAST A SEAL CTA: 220×58px desktop (was 196×50px), 100%×52px mobile.
 * minHeight 44 (mobile RG-C8 touch target).
 * Mobile: width 100% fills COL-B minus padding — more touch area than fixed 172px.
 * Amber gradient identical all phases (RG-C5). No lantern images.
 */
// §4.11 (2026-05-29): desktop CTA upgraded:
//   width: 'min(320px, calc(100% - 32px))' — responsive, fills larger center column
//   letterSpacing: '0.18em' — reads as carved inscription at 200px band height
//   fontSize: 16 — parity with mobile dominant button
function hudCtaStyle(mobile: boolean): CSSProperties {
  return {
    // Pass 3 composition: CTA is the focal spine. Widen to fill the center zone
    // (380 / -16px gutters) and raise desktop height 58→72 so CAST AGAIN reads as
    // unmistakably dominant over the flanking 120px columns (not one of five tiles).
    width: mobile ? '100%' : 'min(380px, calc(100% - 16px))',
    height: mobile ? 52 : 72,
    minHeight: 44,
    flexShrink: 0,
    padding: '0 16px',
    fontFamily: T.fontMono,
    fontSize: mobile ? 12 : 16,
    fontWeight: 800,
    letterSpacing: mobile ? '0.14em' : '0.18em',
    color: T.bgCanvas,
    // Ofuda paper texture (§4.3): warm washi grain composited under the amber gradient.
    // The amber gradient sits above (near-full opacity) so the paper reads as authentic
    // ritual material grain, not as a visible texture change. Desktop only (mobile keeps
    // the simple gradient for performance — thumb-zone fidelity unaffected).
    backgroundImage: mobile
      ? `linear-gradient(180deg, ${T.talismanGlow} 0%, ${T.amberAccent} 60%, #a0651e 100%)`
      : `linear-gradient(180deg, ${T.talismanGlow} 0%, ${T.amberAccent} 60%, #a0651e 100%), ${OFUDA_BUTTON_BG_LAYER}`,
    backgroundSize: mobile ? undefined : 'cover, cover',
    backgroundPosition: mobile ? undefined : 'center, center',
    backgroundRepeat: mobile ? undefined : 'no-repeat, no-repeat',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  }
}

const hudCtaDisabledStyle: CSSProperties = {
  opacity: 0.5,
  cursor: 'default',
}

// Lantern icons flanking the CTA label
const hudCtaLanternStyle: CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  width: 18,
  height: 18,
  pointerEvents: 'none',
}

// ── Compact settled strip (spec D / State A) ─────────────────────────────────

// Blueprint 2026-05-30 §2 Component 1: two-line column stack so the
// receipt chip never clips. Was single-row (caused "ceipt" clip at 412px).
const hudSettledSummaryStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  width: '100%',
}

function hudSettledOutcomeStyle(totalWin: bigint, wager: bigint): CSSProperties {
  const color = totalWin >= wager
    ? T.talismanGlow
    : totalWin > 0n
      ? T.textMuted
      : 'rgba(232, 223, 200, 0.38)'
  return {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.10em',
    color,
    whiteSpace: 'nowrap' as const,
  }
}

const hudSettledValueStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(13, 17),
  fontWeight: 700,
  color: T.talismanPaper,
  whiteSpace: 'nowrap' as const,
}

const hudSettledSealsStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(11, 14),
  color: T.amberAccent,
  whiteSpace: 'nowrap' as const,
}

// Blueprint 2026-05-30 §2 Component 1: amber chip, not underlined text link.
// The "view receipt" link was clipping to "ceipt" in the single-row flex.
// Rebuilt as a nowrap amber plaque chip — label is "RECEIPT 符", always visible.
const hudReceiptViewLabelStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(11, 13),
  fontWeight: 500,
  color: 'rgba(212,137,42,0.70)',
  background: 'rgba(212,137,42,0.08)',
  border: '1px solid rgba(212,137,42,0.25)',
  borderRadius: 2,
  cursor: 'pointer',
  letterSpacing: '0.10em',
  padding: '2px 8px',
  whiteSpace: 'nowrap' as const,
  textDecoration: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
}

// ── AWAKEN + CASH OUT (RIGHT zone) ────────────────────────────────────────────

/**
 * TALISMAN AWAKEN — 52px desktop (was 44px), 44px mobile (RG-C8 touch floor).
 * Desktop: 100px wide (was 76px). Mobile: 72px wide.
 * Spec 2026-05-29: larger + label rework (11px label, 13px kanji, 9px cost).
 */
// Blueprint 2026-05-30 §2 Component 6: AWAKEN demoted to ghost modifier.
// Subordinate to CASH OUT (which is also ghost, but brighter). Neither competes
// with the primary amber-filled CTA. AWAKEN is the lowest-hierarchy control
// in the band. hudTalismanAwakenActiveStyle (opacity: 0.7) used when triggered.
function hudTalismanAwakenStyle(mobile: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    width: mobile ? 72 : 100,
    height: mobile ? 44 : 44,
    minHeight: 44,
    fontFamily: T.fontMono,
    fontSize: mobile ? 9 : 11,
    // Ghost modifier: transparent fill, faint amber hairline, deeply subordinate.
    color: 'rgba(212,137,42,0.45)',
    background: 'transparent',
    border: '1px solid rgba(90,68,38,0.25)',
    borderRadius: 2,
    boxShadow: 'none',
    cursor: 'pointer',
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap' as const,
    opacity: 0.55,
  }
}

const hudTalismanAwakenActiveStyle: CSSProperties = {
  borderColor: T.amberAccent,
  color: T.talismanPaper,
  opacity: 0.7,
  cursor: 'default',
}

const hudAwakenKanjiStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontWeight: 700,
  fontSize: 13,
  color: T.amberAccent,
}

// Blueprint 2026-05-30 §2 Component 3: desktop cost line raised 9→10px for legibility.
// Mobile AWAKEN buttons do not render this span (no cost clutter at 9px in 80px column).
const hudAwakenCostStyle: CSSProperties = {
  fontSize: 10,
  color: T.amberAccent,
  opacity: 0.90,
}

/**
 * CASH OUT — cream-parchment distinct surface. 2026-05-30 integrated-HUD spec §2.7.
 * Semantically distinct from AWAKEN (ghost amber hairline) and the CTA (solid amber fill).
 * CASH OUT = "safe exit" talisman-paper register: pale parchment fill + cream border.
 * The pale parchment surface signals a separate category (session end) without competing
 * with the primary CTA amber.
 * HARD RULE: never compound two actions in one CTA label (no "&").
 * RG-C8: always visible, never disabled.
 * Dimensions unchanged: 52px desktop / 44px mobile; 100px desktop / 72px mobile width.
 */
function hudCashOutStyle(mobile: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: mobile ? 72 : 100,
    height: mobile ? 44 : 52,
    minHeight: 44,
    fontFamily: T.fontMono,
    fontSize: mobile ? 11 : 13,
    fontWeight: 600,
    letterSpacing: '0.14em',
    // Cream-parchment safe-exit surface: pale talisman-paper fill + cream hairline border.
    // Full opacity on text (was 0.60) — the "safe exit" action is always legible.
    // Background: rgba(232,223,200,0.08) = pale parchment tint over the deck wood grain.
    color: T.talismanPaper,
    background: 'rgba(232,223,200,0.08)',
    border: '1px solid rgba(232,223,200,0.32)',
    borderRadius: 3,
    opacity: 0.88,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    boxShadow: 'none',
  }
}

// ─── Hot-zone card factory (in-scene overlays that never touch the HUD band) ─

/**
 * Win reveal centered style — spec B 2026-05-29 rev2 (calligraphy-dominant).
 * Vertically and horizontally CENTERED in the playfield zone above the HUD band.
 * z-index 5: above HUD band (z-4), below cinematic (z-5).
 * NOT pinned to bottom. NO backdrop-filter (must not obscure grid calligraphy).
 * NO paper background (calligraphy PNG is the visual base). NO border.
 * The dark vignette scrim is via boxShadow only.
 *
 * Centering: the outer container spans the full shell EXCEPT the HUD band,
 * then uses display:flex + align/justify:center so the win panel sits exactly
 * in the middle of the visible playfield — not the full shell.
 * Pass 1 fix: replaces top:50% translateY(-50%) which was anchored on full
 * shell height, placing the panel above the true playfield center.
 */
function winRevealCenteredStyle(hudH: number, _mobile: boolean): CSSProperties {
  return {
    // Outer container: spans the full playfield above the HUD band.
    // display:flex + center alignment places the inner panel at true playfield center.
    // Pass 1 (2026-05-29): replaces the old top:50% / translateY(-50%) anchor that
    // was relative to the full shell height, not the visible playfield height.
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: hudH,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // No visual decoration on the container — decoration lives on the inner panel
    background: 'none',
    border: 'none',
    backdropFilter: 'none',
    borderRadius: 0,
    boxShadow: 'none',
    overflow: 'visible',
    zIndex: 5,
    pointerEvents: 'none',
    padding: 0,
  }
}

/**
 * Win reveal inner panel — the constrained content box that sits at the flex
 * center of winRevealCenteredStyle's full-playfield container.
 * Pass 2 (2026-05-29): dark lacquer talisman-paper surface replaces the floating
 * no-background box. The calligraphy PNG now bleeds over a dark lacquer ground,
 * not over the live reel grid. Amber border + double depth shadow.
 * RG-C5: identical surface for all win tiers. Only the calligraphy content differs.
 * Anti-slop: only `background`, `border`, `borderRadius`, `boxShadow`, `transform`,
 * `opacity` animated — no layout properties.
 */
const winRevealInnerStyle: CSSProperties = {
  position: 'relative' as const,
  width: 'calc(100% - 32px)',
  maxWidth: 340,
  minHeight: 140,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  // Tim 2026-05-30: "i dont like that we used a background to fix our readability
  // issue." The dark lacquer panel is GONE — the win number now reads by its own
  // bold white + thick black ink outline (see winAmountBannerStyle), sitting
  // directly on the calligraphy brushstroke, exactly like the target (image 69).
  background: 'none',
  border: 'none',
  borderRadius: 0,
  boxShadow: 'none',
  overflow: 'visible' as const,
  zIndex: 5,
  pointerEvents: 'none' as const,
}

/** Calligraphy PNG overlay — absolute fill behind the win number.
 *  Bleeds slightly outside the container for fullness.
 *  amber aura via filter drop-shadow. pointer-events: none.
 *  Animation: ooReiKanjiBloom (240ms ease-out, scale 0.85→1.0, blur 4px→0).
 */
const winCalligraphyStyle: CSSProperties = {
  position: 'absolute' as const,
  inset: -12,
  width: 'calc(100% + 24px)',
  height: 'calc(100% + 24px)',
  objectFit: 'contain' as const,
  // opacity applied inline per tier
  pointerEvents: 'none' as const,
  filter: 'drop-shadow(0 0 24px rgba(212,137,42,0.40))',
}

/**
 * Win number in Yuji Syuku brush-mincho — white with dark ink outline.
 * This is the "Japanese slot win banner" treatment: white text + 2px dark stroke
 * separates the number from the calligraphy. textShadow grounds it.
 * Desktop: 56px. Mobile: 48px. Both use WebkitTextStroke for the ink outline.
 * RG-C5: identical styles for all win tiers. Only the NUMBER differs.
 */
const winAmountBannerStyle: CSSProperties = {
  position: 'relative' as const,
  zIndex: 2,
  // ON-BRAND Japanese serif for the win number (Tim 2026-05-30: "using other fonts
  // than our japanese font is totally not on brand"). Noto Serif JP ships a REAL
  // weight 900 — unlike single-weight Yuji Syuku (which faux-bolds ugly under the
  // stroke) — so it stays chunky + legible while matching the multiplier's serif.
  // The thick black ink outline remains the readability mechanism (no dark panel).
  fontFamily: '"Noto Serif JP", "Yu Mincho", serif',
  fontSize: 60,
  fontWeight: 900,
  color: '#ffffff',
  // 5px ink stroke fills the glyph body; the 8-direction hard offset shadow locks
  // a clean black perimeter at every cardinal + diagonal so it reads on any ground.
  WebkitTextStroke: '5px #0a0604',
  textShadow:
    '-3px -3px 0 #0a0604, 3px -3px 0 #0a0604, -3px 3px 0 #0a0604, 3px 3px 0 #0a0604, ' +
    '-4px 0 0 #0a0604, 4px 0 0 #0a0604, 0 -4px 0 #0a0604, 0 4px 0 #0a0604, ' +
    '0 4px 16px rgba(0,0,0,0.55)',
  letterSpacing: '-0.01em',
  lineHeight: 1,
  textAlign: 'center' as const,
  paintOrder: 'stroke fill' as const, // stroke UNDER fill so the white face stays crisp
}

const winAmountMobileStyle: CSSProperties = {
  ...winAmountBannerStyle,
  fontSize: 48,
}

/** Tier English label — Geist Mono, muted cream, below the number */
const winTierLabelStyle: CSSProperties = {
  position: 'relative' as const,
  zIndex: 2,
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontSize: fluid(13, 16),
  fontWeight: 700,
  letterSpacing: '0.22em',
  // Tim 2026-06-05 #140: "SEALED" was a faint 0.75-cream with no shadow, so it
  // washed out over the brushstroke + number = unreadable. Now solid amber, bold,
  // with a hard dark shadow so it reads crisply over the busy calligraphy. The
  // marginTop lifts it clear of the InkNumber so they never overlap.
  color: '#f4a73e',
  textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.75)',
  marginTop: 4,
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
}

/**
 * Hotzone card for spirit-entry / spirit-bonus-end overlays.
 * Pinned above HUD band.
 */
function hotzoneCardStyle(hudH: number): CSSProperties {
  return {
    position: 'absolute',
    bottom: hudH + 8,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'calc(100% - 32px)',
    maxWidth: 440,
    pointerEvents: 'all',
    padding: '16px 20px',
    backgroundImage: ALTAR_BG_IMAGE,
    backgroundSize: ALTAR_BG_SIZE,
    backgroundPosition: ALTAR_BG_POS,
    backgroundRepeat: ALTAR_BG_REPEAT,
    borderRadius: 4,
  }
}

// Hotzone card layout variants (flex column shapes, applied via spread)
const bonusTriggerLayoutStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}

const winRevealLayoutStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}

const spiritEntryLayoutStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}

const spiritBonusEndLayoutStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
}

// ── Receipt bottom sheet (spec D / State B) ────────────────────────────────

/** Scrim behind the receipt sheet — tap outside to dismiss */
const receiptSheetScrimStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 6,
  background: 'rgba(14, 10, 6, 0.45)',
  cursor: 'pointer',
}

/**
 * Receipt sheet — bottom sheet above HUD band.
 * position:absolute; bottom=hudBandHeight; height min(70vh, 520px); z-index 7.
 * NOT covering top 30% of viewport.
 */
function receiptSheetStyle(hudH: number): CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: hudH,
    height: `min(70vh, 520px)`,
    zIndex: 7,
    backgroundImage: ALTAR_BG_IMAGE,
    backgroundSize: ALTAR_BG_SIZE,
    backgroundPosition: ALTAR_BG_POS,
    backgroundRepeat: ALTAR_BG_REPEAT,
    borderRadius: '8px 8px 0 0',
    border: `1px solid rgba(200, 184, 144, 0.22)`,
    borderBottom: 'none',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    pointerEvents: 'all',
  }
}

const receiptSheetHandleStyle: CSSProperties = {
  width: 36,
  height: 4,
  borderRadius: 2,
  background: 'rgba(200, 184, 144, 0.30)',
  margin: '8px auto 4px',
  cursor: 'pointer',
  flexShrink: 0,
}

const receiptSheetBrushTopStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: 14,
  margin: '2px 0',
  objectFit: 'contain',
  opacity: 0.62,
  pointerEvents: 'none',
  flexShrink: 0,
}

const receiptSheetBodyStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto' as const,
  padding: '8px 20px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

// ─── Lobby surface ────────────────────────────────────────────────────────────
// Tim 2026-06-01 "fix the lobby - REI looks bad": Rei is now the enlarged hero
// on the left (OoReiCharacterLayer isLobby). The narrative card + CTA live in
// her RIGHT-side negative space, NOT centred over the open sea. The surface is a
// flex column (card on top, standalone amber CTA below). Eye path: Rei face
// (upper-left) → body → card (centre-right) → CTA.
//
// Desktop/tablet: anchored to the right of Rei (left:44% right:8%), aligned to
// the bottom of the hot-zone above the rail. Mobile: tighter (left:40% right:4%).
// alignItems:stretch so the CTA spans the column width below the card.

// CENTERED at the bottom of the frame (Tim 2026-06-01 "why is everything off
// centered?"). The right-shoved card read as lopsided; a centered narrative
// panel + CTA under the scene is balanced. Rei remains the hero on the left —
// her FACE is upper-left, the card is bottom-centre, so they never collide.
const lobbySurfaceStyle: CSSProperties = {
  position: 'absolute',
  bottom: 44,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 'min(540px, 56vw)',
  pointerEvents: 'all',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  alignItems: 'stretch',
}

// Mobile: centered, near-full width at the very bottom.
const lobbySurfaceMobileStyle: CSSProperties = {
  ...lobbySurfaceStyle,
  bottom: 24,
  width: 'min(360px, 88vw)',
}

// Inner narrative card — keeps the altar-panel ground so the copy reads as
// inscribed on a shrine plaque rather than floating over the storm.
const lobbyCardStyle: CSSProperties = {
  padding: '20px 22px 18px',
  backgroundImage: ALTAR_BG_IMAGE,
  backgroundSize: ALTAR_BG_SIZE,
  backgroundPosition: ALTAR_BG_POS,
  backgroundRepeat: ALTAR_BG_REPEAT,
  borderRadius: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'flex-start',
  textAlign: 'left',
}

const lobbyTaglineStyle: CSSProperties = {
  margin: 0,
  // #4 FIX: narrative/display text uses Noto Serif JP, not Geist Sans.
  fontFamily: T.fontKanji,
  fontSize: fluid(13, 16),
  lineHeight: 1.5,
  color: T.textPrimary,
  // Left-aligned now that the card sits in Rei's right-side negative space.
  textAlign: 'left',
}

const lobbySubtitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: T.fontMono,
  fontSize: fluid(11, 13),
  color: T.textMuted,
  letterSpacing: '0.08em',
  textAlign: 'left',
}

/** CTA kanji bracket — flanks "CAST A SEAL" text with seal-script glyphs.
    霊 = rei (spirit), 符 = fu (talisman/seal). Painted in dark canvas color
    so they read as embossed on the amber button. */
const ctaKanjiStyle: CSSProperties = {
  display: 'inline-block',
  fontFamily: T.fontKanji,
  fontWeight: 700,
  fontSize: 16,
  margin: '0 10px',
  verticalAlign: 'middle',
  opacity: 0.85,
}

// ─── Lobby CTA ────────────────────────────────────────────────────────────────

/** Primary CTA for lobby — amber painted lacquer surface. */
const ctaButtonStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  padding: '14px 48px',
  fontFamily: T.fontMono,
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: '0.14em',
  color: T.bgCanvas,
  background: `linear-gradient(180deg, ${T.talismanGlow} 0%, ${T.amberAccent} 60%, #a0651e 100%)`,
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  transition: 'filter 150ms, transform 80ms',
}

// winRevealBarStyle replaced by hotzoneCardStyle(hudBandHeight) + winRevealLayoutStyle.
const _winRevealBarStyle_UNUSED: CSSProperties = {
  display: 'none',
}

const winLabelStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(11, 14),
  letterSpacing: '0.16em',
  color: T.textMuted,
}

const winAmountStyle: CSSProperties = {
  fontFamily: T.fontMono,
  // v3: 36->32 + textShadow glow (contained in text, not a background field — geometric containment)
  fontSize: 32,
  fontWeight: 800,
  color: T.talismanGlow,
  letterSpacing: '-0.02em',
  textShadow: '0 0 24px rgba(244,167,62,0.45)',
}

const spiritTriggerLabelStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: fluid(12, 15),
  letterSpacing: '0.14em',
  color: T.amberAccent,
  textTransform: 'uppercase' as const,
}

// bonusTriggerBarStyle replaced by hotzoneCardStyle(hudBandHeight) + bonusTriggerLayoutStyle.
const bonusTriggerKanjiStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: 32,
  fontWeight: 700,
  color: T.talismanGlow,
  letterSpacing: '0.08em',
  lineHeight: 1,
}
const bonusTriggerHeadlineStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 16,
  fontWeight: 800,
  color: T.talismanPaper,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
}
const bonusTriggerMechanicStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  color: T.textMuted,
  letterSpacing: '0.10em',
}
const bonusTriggerWinStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 22,
  fontWeight: 800,
  color: T.talismanGlow,
  letterSpacing: '-0.01em',
  marginTop: 2,
}

// spiritEntryBarStyle replaced by hotzoneCardStyle + spiritEntryLayoutStyle.
const spiritEntryKanjiStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: 26,
  fontWeight: 700,
  color: T.talismanGlow,
  letterSpacing: '0.08em',
  lineHeight: 1,
}
const spiritEntryHeadlineStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 14,
  fontWeight: 800,
  color: T.talismanPaper,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
}
const spiritEntryAwardStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  color: T.amberAccent,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
}

// receiptCardStyle replaced by receiptHotzoneStyle(hudBandHeight).

/** Receipt title row with painted talisman icon — receipt reads as a
    paper ledger scroll unfurled on the altar (composition-designer §3). */
const receiptTitleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
const receiptTitleTalismanStyle: CSSProperties = {
  width: 24,
  height: 24,
  opacity: 0.85,
  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
}

/* Title style + readable text-shadow so the cream header stands clear of
   the painted maple leaves bleeding in from the upper corner. */
const receiptTitleStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 13,
  fontWeight: 700,
  textShadow: '0 1px 3px rgba(0, 0, 0, 0.85)',
  color: T.talismanPaper,
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
}

const receiptDividerStyle: CSSProperties = {
  height: 1,
  background: T.borderSubtle,
  margin: '2px 0',
}

/** Receipt divider — painted brushstroke replacing the 1px CSS hairline.
    Art-director 2026-05-28: the receipt is a paper ledger scroll on the
    altar, so its dividers are calligraphy brushstrokes (sumi-e) not
    flat hairlines. The PNG is monochrome ink-wash on transparent; we
    let it inherit its native color and shrink to a sub-row band. */
const receiptBrushDividerStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  height: 14,
  margin: '2px 0',
  objectFit: 'contain',
  opacity: 0.78,
  pointerEvents: 'none',
}

const receiptRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
}

const receiptLabelStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  fontWeight: 600,
  color: 'rgba(232, 223, 200, 0.85)', // brighter cream — readable on the painted wood
  letterSpacing: '0.08em',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.7)',
}

const receiptValueStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 14,
  fontWeight: 700,
  color: T.textPrimary,
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.75)',
}

// ── Glass Box ledger seal styles ─────────────────────────────────────────────

/** Wrap: inset hairline on the altar-paper ground, 4px radius — reads as
    a stamped seal compartment on the scroll, not a floating card. */
const glassBoxSealWrapStyle: CSSProperties = {
  borderRadius: 4,
  // Reduced padding vs original ('8px 10px 6px'): needs to fit in the narrow
  // mobile stat column (flex:1, minWidth:80). The chip row itself is compact
  // (10px Geist Mono text), so 4px vertical / 6px horizontal is sufficient.
  padding: '4px 6px',
  background: 'rgba(26, 22, 18, 0.55)',
  boxShadow: `inset 0 0 0 1px rgba(232, 223, 200, 0.14)`,
  overflow: 'hidden',
}

/** Status + toggle in a single flex row — compact, does not fight the
    receipt rows above it for visual weight. minWidth:0 ensures the row
    respects parent overflow:hidden (prevents bleeding out of the mobile
    stat column which has a fixed flex width). */
const glassBoxSealRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minWidth: 0,
  width: '100%',
  gap: 4,
}

/** "verifying…" / "✓ verified" — warm cream, Geist Mono, small. No amber
    (amber is reserved for the 4-job economy).
    nowrap + flexShrink:0 so it never collapses into ellipsis. */
const glassBoxSealStatusStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  letterSpacing: '0.10em',
  color: T.talismanPaper,
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
}

/** "view receipt ↓" / "hide receipt ↑" toggle button — ghost text,
    pointer cursor, no visible border (the seal wrap already provides chrome).
    minWidth:0 + overflow:hidden prevents the text from blowing out the column. */
const glassBoxSealToggleStyle: CSSProperties = {
  appearance: 'none' as const,
  background: 'none',
  border: 'none',
  padding: 0,
  fontFamily: T.fontMono,
  fontSize: 9,
  color: T.textMuted,
  cursor: 'pointer',
  letterSpacing: '0.04em',
  pointerEvents: 'all',
  minWidth: 0,
  flexShrink: 1,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden' as const,
  textOverflow: 'ellipsis' as const,
}

/** Expanded inline drawer — no modal, no portal, inline only. */
const glassBoxDrawerStyle: CSSProperties = {
  marginTop: 6,
  paddingTop: 6,
  borderTop: `1px solid ${T.borderSubtle}`,
}

/** Provenance copy — small, muted, cream. Noto Serif JP per QA #4 (no Geist Sans on narrative text). */
const glassBoxDrawerTextStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: 10,
  color: T.textMuted,
  margin: 0,
  lineHeight: 1.5,
}

/** Hex code inline element — Geist Mono, cream, no background chrome. */
const glassBoxHexStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  color: T.talismanPaper,
  letterSpacing: '0.06em',
}

// spinningBarStyle removed — spinning indicator is now the HUD band CTA "CASTING..." state.
// spiritBonusEndStyle removed — spirit-bonus-end uses hotzoneCardStyle + spiritBonusEndLayoutStyle.

const spiritBonusEndTitleStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  letterSpacing: '0.16em',
  color: T.textMuted,
}

const spiritBonusEndAmountStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 32,
  fontWeight: 800,
  color: T.talismanGlow,
}

const endBonusButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 16,
  right: 16,
  fontFamily: T.fontMono,
  fontSize: 10,
  letterSpacing: '0.1em',
  color: T.textMuted,
  background: 'rgba(26,22,18,0.8)',
  border: `1px solid ${T.borderSubtle}`,
  borderRadius: 3,
  padding: '6px 10px',
  cursor: 'pointer',
  pointerEvents: 'all',
  zIndex: 5,
}

// ─── INFO button (header, amber scroll glyph) ────────────────────────────────

/** INFO button — amber 巻 (scroll/volume) glyph in the header right zone.
 *  §4.4: width 36, height 36, glyph 20px. Amber register, no cyan. */
const infoButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  // 44x44 minimum touch target (GC7 / RG-C8). Was 36px — failed the a11y floor.
  width: 44,
  height: 44,
  background: 'none',
  border: `1px solid rgba(212, 137, 42, 0.40)`,
  borderRadius: 3,
  padding: 0,
  cursor: 'pointer',
  pointerEvents: 'all',
  flexShrink: 0,
}

const infoButtonGlyphStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: 20,
  fontWeight: 700,
  color: T.amberAccent,
  lineHeight: 1,
}

// ─── INFO / Paytable overlay styles ──────────────────────────────────────────

/** Scrim behind the info panel — dims the grid, tap to dismiss. */
const infoScrimStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 6,
  background: 'rgba(14, 10, 6, 0.62)',
  cursor: 'pointer',
}

/** Info panel container — talisman-paper/hinoki material, absolute child of shell. */
const infoPanelStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 7,
  top: 56,
  left: 8,
  right: 8,
  maxWidth: 480,
  marginLeft: 'auto',
  marginRight: 'auto',
  maxHeight: 'calc(100% - 112px)',
  display: 'flex',
  flexDirection: 'column',
  backgroundImage: ALTAR_BG_IMAGE,
  backgroundSize: ALTAR_BG_SIZE,
  backgroundPosition: ALTAR_BG_POS,
  backgroundRepeat: ALTAR_BG_REPEAT,
  borderRadius: 4,
  border: `1px solid rgba(200, 184, 144, 0.22)`,
  overflow: 'hidden',
}

const infoPanelHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px 8px',
  borderBottom: `1px solid rgba(200, 184, 144, 0.15)`,
  flexShrink: 0,
}

const infoPanelTitleKanjiStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: 18,
  fontWeight: 700,
  color: T.amberAccent,
  lineHeight: 1,
}

const infoPanelTitleStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.16em',
  color: T.talismanPaper,
  flex: 1,
}

const infoPanelCloseStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '2px 6px',
  fontFamily: T.fontMono,
  fontSize: 16,
  color: T.textMuted,
  cursor: 'pointer',
  lineHeight: 1,
  pointerEvents: 'all',
}

const infoScrollBodyStyle: CSSProperties = {
  overflowY: 'auto' as const,
  padding: '12px 14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const infoSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const infoSectionHeadStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.18em',
  color: T.amberAccent,
  textTransform: 'uppercase' as const,
}

const infoBodyStyle: CSSProperties = {
  margin: 0,
  fontFamily: T.fontKanji, // QA #4: Noto Serif JP on paytable body — no Geist Sans
  fontSize: 12,
  lineHeight: 1.55,
  color: T.textPrimary,
}

const infoDividerStyle: CSSProperties = {
  height: 1,
  background: 'rgba(200, 184, 144, 0.12)',
}

/** 4-column CSS grid: symbol name + 3-of-kind + 4-of-kind + 5-of-kind */
const infoPaytableGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr 1fr 1fr',
  gap: '3px 8px',
  marginTop: 2,
}

const infoPaytableHeadStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  color: 'rgba(232, 223, 200, 0.42)',
  textTransform: 'uppercase' as const,
  paddingBottom: 2,
}

const infoPaytableSymStyle: CSSProperties = {
  fontFamily: T.fontKanji, // QA #4: Noto Serif JP on paytable symbol names — no Geist Sans
  fontSize: 11,
  color: T.talismanPaper,
}

const infoPaytableValStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  fontWeight: 600,
  color: T.textMuted,
}

const infoPaytableValAmberStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  fontWeight: 700,
  color: T.talismanGlow,
}

// ─── Active-spirits panel (Row 3 — center zone) ───────────────────────────────

/** Row 3 wrapper — sits between context line and CTA well */
const hudSpiritsRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  // minHeight 36: fits 34px mobile medallion circles with 1px breathing room each side.
  // (Desktop circles are 40px; 36px minHeight allows them to bleed 2px which is fine
  // since space-between distributes available height on desktop 176px band.)
  // Reduced from 48 to prevent 4px vertical overflow on 160px mobile band with 4-row
  // center stack (stepper 28 + context 16 + spirits 36 + CTA well 60 = 140px < 148px).
  minHeight: 26,
  gap: 6,
}

/** State A: no seals — pursued-spirit medallion + "SEALING <NAME>" on ONE row.
    Horizontal (was column) so the empty state is a single compact line that never
    collides with the CAST well below it (Tim image 37). */
const hudSpiritsEmptyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}

/** Medallion strip: horizontal row of circles */
const hudMedallionStripStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  justifyContent: 'center',
}

/** Column wrapper for State B (medallion strip + name labels) */
const hudSpiritsRowColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  width: '100%',
}

/**
 * UNINSCRIBED CARVED STONE SEAL (State A) — waiting for inscription.
 * Rough stone-seal appearance: dark stone gradient + faint crosshatch.
 * Much more evocative than hollow CSS circles — reads as blank shrine seals.
 * MEDALLION SPEC: 40px desktop / 34px mobile per compose spec.
 */
function hudSpiritUninscribedSealStyle(mobile: boolean): CSSProperties {
  const sz = mobile ? 34 : 40
  return {
    width: sz,
    height: sz,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 40% 35%, rgba(90,79,45,0.45), rgba(42,34,22,0.78))',
    border: '1px solid rgba(200,184,144,0.18)',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }
}

/** Faint waiting-inscription glyph inside empty seal — decorative, aria-hidden */
const hudSpiritUninscribedGlyphStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 11,
  fontWeight: 400,
  color: 'rgba(232,223,200,0.15)',
  lineHeight: 1,
  pointerEvents: 'none' as const,
  userSelect: 'none' as const,
}

/**
 * CRAFTED ALLY MEDALLION CIRCLE (State B) — sealed spirit with identity.
 * Deep shrine-wood interior + amber carved-frame ring.
 * MEDALLION SPEC: 40px desktop / 34px mobile.
 */
function hudSpiritMedallionCircleStyle(mobile: boolean): CSSProperties {
  const sz = mobile ? 34 : 40
  return {
    width: sz,
    height: sz,
    borderRadius: '50%',
    background: 'radial-gradient(circle at 40% 30%, rgba(78,58,28,0.90), rgba(26,20,12,0.95))',
    border: '1px solid rgba(212,137,42,0.55)',
    boxShadow: '0 0 0 2px rgba(212,137,42,0.12), inset 0 1px 3px rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
    position: 'relative' as const,
  }
}

/**
 * Spirit identity kanji inside the medallion — Noto Serif JP, amber.
 * 18px desktop / 15px mobile per readability spec. Weight 700.
 */
function hudSpiritMedallionKanjiStyle(mobile: boolean): CSSProperties {
  return {
    fontFamily: T.fontKanji,
    fontSize: mobile ? 15 : 18,
    fontWeight: 700,
    color: T.talismanGlow,
    lineHeight: 1,
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  }
}

/** Sealed-spirit completion dot — tiny vermillion mark bottom-right of ring */
const hudSpiritSealedDotStyle: CSSProperties = {
  position: 'absolute' as const,
  bottom: 0,
  right: 0,
  fontSize: 10,
  lineHeight: 1,
  color: '#c0392b',
  pointerEvents: 'none' as const,
  userSelect: 'none' as const,
}

/**
 * Spirit name sub-label — Geist Mono 6px, desktop only (omit on mobile).
 * Decorative: aria-hidden="true" on the element. Width nowrap.
 */
const hudSpiritNameLabelStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 6,
  letterSpacing: '0.12em',
  color: 'rgba(232,223,200,0.55)',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
  whiteSpace: 'nowrap' as const,
}

/** "SEAL YOUR FIRST SPIRIT" prompt (State A) — below the 3 uninscribed seals */
// READABILITY FIX: raised from 7px to 8px, opacity from 0.38 to 0.45
const hudSpiritsPromptStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.14em',
  color: 'rgba(232,223,200,0.60)',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
}

/** State B: sealed spirits horizontal medallion strip (inside column wrapper) */
const hudSpiritsSealedStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 8,
}

// DEPRECATED style references kept to avoid lint "unused variable" errors.
// These 22px disc styles have been superseded by hudSpiritMedallionCircleStyle
// and hudSpiritMedallionKanjiStyle (40px/34px crafted medallions per spec).
/** @deprecated — use hudSpiritMedallionCircleStyle */
const hudSpiritGlyphCircleStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
  border: `1px solid rgba(212,137,42,0.55)`,
  background: 'rgba(212,137,42,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
}

/** @deprecated — use hudSpiritMedallionKanjiStyle */
const hudSpiritGlyphCharStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: 13,
  fontWeight: 700,
  color: T.amberAccent,
  lineHeight: 1,
  userSelect: 'none' as const,
  pointerEvents: 'none' as const,
}

/** "+N more" button when sealed count > 3 — taps openSealCollection */
const hudSpiritsMoreStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  color: T.amberAccent,
  whiteSpace: 'nowrap' as const,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0 2px',
  letterSpacing: '0.08em',
}

/**
 * Factual narrative tooltip — appears above the glyph circle on press/tap.
 * Shows "SPIRITNAME · Spirit Ally · form N" — NARRATIVE NOT ECONOMIC.
 * Auto-dismisses after SPIRIT_GLYPH_TOOLTIP_DWELL_MS (2000ms).
 * RG-safe: no monetary or probability content.
 */
const hudGlyphTooltipStyle: CSSProperties = {
  position: 'absolute' as const,
  bottom: 28,
  left: '50%',
  transform: 'translateX(-50%)',
  background: 'rgba(14,10,6,0.90)',
  border: `1px solid rgba(212,137,42,0.35)`,
  borderRadius: 3,
  padding: '4px 8px',
  zIndex: 8,
  whiteSpace: 'nowrap' as const,
  pointerEvents: 'none' as const,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const hudGlyphTooltipNameStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.14em',
  color: T.amberAccent,
}

const hudGlyphTooltipDescStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  color: 'rgba(232,223,200,0.70)',
  letterSpacing: '0.06em',
}

/** State C: TALISMAN AWOKEN chip */
const hudTalismanAwokenChipStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  background: 'rgba(212,137,42,0.18)',
  border: `1px solid rgba(212,137,42,0.45)`,
  borderRadius: 3,
  padding: '3px 8px',
}

const hudTalismanAwokenKanjiStyle: CSSProperties = {
  fontFamily: T.fontKanji,
  fontSize: 12,
  fontWeight: 700,
  color: T.amberAccent,
  lineHeight: 1,
}

const hudTalismanAwokenTextStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  letterSpacing: '0.14em',
  color: T.talismanGlow,
  whiteSpace: 'nowrap' as const,
}

// ─── Water-art wager region (resting thumbnail + bloom overlay) ───────────────

/**
 * Water-art wager thumbnail — resting state.
 * Positioned absolute in the center zone, right side, near CTA-well height.
 * 64x48 desktop / 52x40 mobile.
 * Background: water-art-panel.jpg with radial+linear amber CSS-gradient fallback.
 * Slow ambient waterBreath: opacity 0.95->1.0 over WATER_BREATH_DURATION_MS (CSS animation).
 * Reduced-motion: static opacity, no animation.
 */
function waterArtPanelStyle(mobile: boolean): CSSProperties {
  return {
    position: 'absolute' as const,
    right: 8,
    bottom: 4,
    width: mobile ? 52 : 64,
    height: mobile ? 40 : 48,
    backgroundImage: `radial-gradient(ellipse at center, rgba(212,137,42,0.22) 0%, rgba(18,13,9,0.85) 80%), linear-gradient(180deg, rgba(18,13,9,0.65) 0%, rgba(26,22,18,0.80) 100%), url('/assets/generated/oo-rei/water-art-panel.jpg')`,
    backgroundSize: 'cover, cover, cover',
    backgroundPosition: 'center, center, center',
    backgroundRepeat: 'no-repeat, no-repeat, no-repeat',
    borderRadius: 3,
    border: `1px solid rgba(200,184,144,0.22)`,
    cursor: 'pointer',
    // waterBreath animation applied via CSS keyframe (injected in TALISMAN_FLUTTER_KEYFRAME)
    animation: 'waterBreath 3000ms ease-in-out infinite alternate',
    flexShrink: 0,
  }
}

/** Scrim behind the wager bloom panel */
/**
 * Wager popover scrim — lighter than the old full-canvas scrim so the game
 * stays visible behind the control. Tap outside to dismiss.
 */
const wagerBloomScrimStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 6,
  background: 'rgba(0,0,0,0.30)',
  cursor: 'pointer',
}

/**
 * Wager popover panel — compact popover anchored ABOVE the wager plaque button.
 *
 * Replaces the old full-canvas takeover (top:64, bottom:hudH). The new panel is
 * position:absolute, bottom = hudH + 8px gap, horizontally centred via left/transform.
 * Width: min(260px, calc(100vw - 32px)) so it stays within the viewport on mobile.
 * Height: auto (content-driven), max-height 240px with scroll fallback.
 *
 * Enter animation: scaleY(0.88)→1.0 + opacity 0→1 over 200ms, origin bottom center.
 * Reduced-motion: instant (animation:none).
 */
function wagerBloomPanelStyle(
  hudH: number,
  reducedMotion: boolean,
  anchor: { left: number; width: number; shellWidth: number } | null,
): CSSProperties {
  const PANEL_W = 260
  const MARGIN = 12
  // Anchored: bloom from the BET plaque (left-aligned to it), clamped so the
  // panel never overruns the shell's right edge. Fallback (no measurement yet):
  // centred, as before. transformOrigin sits at the plaque so the scaleY grow
  // reads as rising out of the chip.
  const placement: CSSProperties = anchor
    ? {
        left: Math.round(
          Math.max(
            MARGIN,
            Math.min(anchor.left, anchor.shellWidth - PANEL_W - MARGIN),
          ),
        ),
        transformOrigin: 'bottom left',
      }
    : {
        left: '50%',
        transform: 'translateX(-50%)',
        transformOrigin: 'bottom center',
      }
  return {
    position: 'absolute' as const,
    ...placement,
    bottom: hudH + 8,
    width: `min(${PANEL_W}px, calc(100vw - 32px))`,
    maxHeight: 240,
    overflowY: 'auto' as const,
    zIndex: 7,
    // Ofuda-register dark walnut base + faint sumi-e texture overlay
    backgroundImage: `linear-gradient(180deg, rgba(34,22,10,0.98) 0%, rgba(24,14,6,0.99) 100%), url('/assets/generated/oo-rei/water-art-panel.jpg')`,
    backgroundSize: 'cover, cover',
    backgroundPosition: 'center, center',
    backgroundBlendMode: 'normal, luminosity' as const,
    backgroundRepeat: 'no-repeat, no-repeat',
    border: '1px solid rgba(212,137,42,0.45)',
    borderRadius: 6,
    // Shadow casts downward (panel opens upward from the plaque)
    boxShadow: '0 -4px 24px rgba(0,0,0,0.72), 0 0 0 1px rgba(212,137,42,0.18)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 0,
    padding: '10px',
    animation: reducedMotion
      ? 'none'
      : `wagerBloomEnter ${WATER_BLOOM_ENTER_MS}ms cubic-bezier(0, 0, 0.25, 1) forwards`,
    // transformOrigin is set per-placement above (bottom-left when anchored to
    // the BET plaque, bottom-centre in the centred fallback).
  }
}

const wagerBloomHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
}

const wagerBloomTitleStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.18em',
  color: T.talismanPaper,
}

const wagerBloomCloseStyle: CSSProperties = {
  fontFamily: T.fontMono,
  fontSize: 14,
  color: 'rgba(232,223,200,0.45)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  lineHeight: 1,
  padding: '0 4px',
}

/** 2-col chip grid (compact popover, all viewport widths) */
function wagerBloomChipGridStyle(_mobile: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 6,
  }
}

/**
 * Wager chip — Kirifuda (切符) token slip aesthetic.
 * 44px height (RG-C8 touch target). Left vermillion edge = folded paper cut mark.
 * Active: amber replaces vermillion, amber border glow.
 */
const wagerBloomChipStyle: CSSProperties = {
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: T.fontMono,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'rgba(232,223,200,0.85)',
  background: 'linear-gradient(160deg, rgba(48,34,16,0.92) 0%, rgba(28,18,8,0.96) 100%)',
  border: `1px solid rgba(200,184,144,0.22)`,
  // Left vermillion edge — folded paper cut mark
  borderLeft: '2px solid rgba(180,40,30,0.45)',
  borderRadius: 3,
  cursor: 'pointer',
}

/** Active chip: amber replaces vermillion edge; amber border + glow */
const wagerBloomChipActiveStyle: CSSProperties = {
  border: `1px solid rgba(212,137,42,0.70)`,
  borderLeft: '2px solid rgba(212,137,42,0.65)',
  color: '#f4a73e',
  boxShadow: `inset 0 0 0 1px rgba(212,137,42,0.20), 0 0 10px rgba(212,137,42,0.30)`,
}

// ─── CSS keyframes ────────────────────────────────────────────────────────────

// MED fix 2026-05-28: @media (prefers-reduced-motion: reduce) overrides freeze
// all animations so users who have requested reduced motion are not subjected
// to the sway / flutter / pulse loops.
//
// CTA hover CSS class: the amber rim intensification + scale are handled via
// inline style (driven by ctaHovered/ctaPressed state) so they work without
// a class-name system. The CSS here provides the reduced-motion override
// for the transition property, ensuring the transform is instant under
// prefers-reduced-motion even if JS mis-fires.
const TALISMAN_FLUTTER_KEYFRAME = `
@keyframes talismanFlutter {
  from { transform: rotate(-4deg); }
  to   { transform: rotate(4deg); }
}
@keyframes spinningPulse {
  from { opacity: 0.4; }
  to   { opacity: 0.9; }
}
@keyframes waterBreath {
  from { opacity: 0.95; }
  to   { opacity: 1.0; }
}
@keyframes wagerBloomEnter {
  from { opacity: 0; transform: scaleY(0.92); }
  to   { opacity: 1; transform: scaleY(1.0); }
}
@media (prefers-reduced-motion: reduce) {
  @keyframes talismanFlutter {
    from, to { transform: none; }
  }
  @keyframes spinningPulse {
    from, to { opacity: 0.65; }
  }
  @keyframes waterBreath {
    from, to { opacity: 1.0; }
  }
  @keyframes wagerBloomEnter {
    from, to { opacity: 1; transform: none; }
  }
  /* CTA hover: suppress all transitions for reduced-motion users.
     The hover state still applies the amber filter (opacity-only signal)
     but the scale + box-shadow transition is instant → no motion. */
  button[data-oo-rei-cta] {
    transition: filter 0ms !important;
  }
}
`

// Suppress lint for styles kept as reference constants for future iterations.
void spiritTriggerLabelStyle
void receiptDividerStyle
void _winRevealBarStyle_UNUSED
void endBonusButtonStyle    // kept as reference — RG-C8 now served by HUD band CTA
void spiritBonusEndTitleStyle
void spiritBonusEndAmountStyle
// v3 style objects preserved as reference (old chip tray deprecated in favour of bloom):
void hudChipTrayStyle
void hudChipTrayInnerStyle
void hudChipStyle
void hudChipActiveStyle
// v3 spirit-form glyph ABSORBED into spirits panel Row 3:
void hudSpiritFormGlyphStyle
void SPIRIT_FORM_GLYPH_OPACITY
// v4 deprecated medallion styles (22px discs replaced by 40px/34px crafted medallions):
void hudSpiritGlyphCircleStyle
void hudSpiritGlyphCharStyle
void hudSpiritsSealedStyle
// v5 timing consts referenced via CSS keyframes string (not JS calls) or kept for ref:
void STEPPER_HOVER_MS
void STEPPER_PRESS_MS   // kept for ref — DOM stepper retired; logic handlers still use it
void WATER_BLOOM_EXIT_MS
void WATER_BREATH_DURATION_MS
// v5 retired style functions (wager plaque replaces stepper DOM; water-art panel removed):
void hudWagerStepperStyle
void hudStepperButtonStyle
void hudStepperValueStyle
void hudStepperValueActiveStyle
void waterArtPanelStyle
void hudCtaLanternStyle  // lantern imgs removed from CAST button per spec 2026-05-29
// win-panel number styles superseded by InkNumber (ooReiInkNumber shared module):
void winAmountBannerStyle
void winAmountMobileStyle
// SEAL_REVEAL_MS is forwarded to OoReiSealReceipt as dwellMs prop (spec B).

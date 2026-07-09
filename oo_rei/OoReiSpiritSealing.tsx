'use client'

/**
 * OoReiSpiritSealing — the interactive Spirit Sealing mini-game (the bonus peak).
 *
 * The "new category" beat: instead of passively watching free spins, the player
 * is the WARDEN. Three ofuda scrolls — fragments of the broken spirit — appear;
 * the player taps each to press it into the ground, and the spirit's domain
 * element erupts from that spot. When all three are sealed, the bonus total
 * resolves. The player authors the reveal CHOREOGRAPHY (which scroll first);
 * the math authors the OUTCOME (the sum is pre-rolled and EV-invariant — see
 * partitionBonusTotal in ooReiMath). Agency without consequence — RG-C3 safe.
 *
 * Domain C: presentation only. It receives the pre-rolled fragments + the
 * partition already computed by the Domain A layer and emits `onSeal(index)` on
 * tap. It owns ZERO financial math and ZERO state transitions (the provider owns
 * the state machine + every timer, including the idle auto-seal). It owns only
 * the authored CSS keyframes + one-shot SVG element eruptions.
 *
 * Brand register: Anime Cinematic. ZERO cyan. Amber economy. No particles —
 * every element eruption is a single authored SVG path on a timed reveal.
 * RG-C5: all durations are module-consts from ooReiSignatures, identical for a
 * tiny bonus and a huge one. RG-C1: a small/zero total is revealed factually,
 * never dramatised as a loss.
 */

import { type CSSProperties, type ReactElement, useCallback, useMemo, useState } from 'react'

// ─── Fluid type scale ─────────────────────────────────────────────────────────
function fluid(minPx: number, maxPx: number): string {
  const slope = ((maxPx - minPx) / (1600 - 320)) * 100
  const intercept = minPx - slope * (320 / 100)
  return `clamp(${minPx}px, ${intercept.toFixed(2)}px + ${slope.toFixed(3)}vw, ${maxPx}px)`
}

import {
  ELEMENT_ERUPTION_MS,
  OFUDA_DROP_MS,
  OFUDA_DROP_STAGGER_MS,
  OFUDA_GLOW_PERIOD_MS,
  OFUDA_PLANT_MS,
  SEALING_ENTRY_FADE_MS,
  SEALING_SPIRIT_DISSOLVE_MS,
} from './ooReiSignatures'
import { formatUsdcCompact } from './ooReiMath'
import { regionSpiritCutoutForRegion } from './ooReiMythRegions'
import { SPIRIT_PROCESSION } from './ooReiSpiritEvolution'

// ─── Palette (Anime Cinematic — amber economy, NO cyan) ──────────────────────
const C = {
  veil: 'rgba(10, 7, 4, 0.92)',
  scrollParchment: 'linear-gradient(168deg, #e4c98f 0%, #cda85f 46%, #b1843a 100%)',
  scrollEdge: 'rgba(120, 78, 28, 0.85)',
  scrollKanji: '#7a1f12', // vermillion sumi-e
  amber: '#f4a73e',
  amberBright: '#ffc44d',
  amberDim: 'rgba(244, 167, 62, 0.55)',
  cream: '#e8dfc8',
  creamMuted: 'rgba(232, 223, 200, 0.62)',
  planted: 'rgba(40, 27, 13, 0.55)',
  fontMono: '"Geist Mono", ui-monospace, monospace',
  // Noto Serif JP — brand display register for kanji glyphs (the three sealing
  // arts and the 封印 header). Geist Mono stays for numbers + Latin labels.
  fontKanji: '"Noto Serif JP", "Yu Mincho", serif',
} as const

// The three sealing arts — one distinct ofuda per scroll POSITION (0/1/2).
// Differentiation is purely narrative: each scroll carries its own kanji and a
// three-word English sub-label naming the art. The outcome is EV-invariant
// across all three (the partition model maps position → fragment elsewhere), so
// WHICH scroll the player presses first never changes the payout. Per the
// Myth-of-REI elevation blueprint §1 (scroll differentiation).
const SEALING_ARTS: ReadonlyArray<{ kanji: string; label: string }> = [
  { kanji: '言', label: 'Call by name' },   // the first art: voice before ink
  { kanji: '印', label: 'Mark the seal' },  // the second art: the drawn talisman
  { kanji: '閉', label: 'Close the gate' }, // the third art: the final binding
] as const

// The five spirit domain elements, chosen by spirit index % 5. Each is a single
// authored SVG one-shot — never a particle emitter.
type ElementKind = 'storm' | 'tide' | 'ember' | 'mist' | 'shadow'
const ELEMENT_BY_INDEX: readonly ElementKind[] = ['storm', 'tide', 'ember', 'mist', 'shadow']

interface OoReiSpiritSealingProps {
  /** Pre-rolled bonus total (lamports) — the sum the three fragments resolve to. */
  readonly bonusTotalWinLamports: bigint
  /** Canonical [a,b,c] from partitionBonusTotal (sum === total). */
  readonly fragments: readonly [bigint, bigint, bigint]
  /** Which fragment sits on which scroll position (presentation permutation). */
  readonly presentationOrder: readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]
  /** Scroll POSITIONS the player has sealed, in tap order. */
  readonly sealedScrolls: ReadonlyArray<0 | 1 | 2>
  /** Current spirit being sealed (themes the kanji + element). */
  readonly currentSpiritIndex: number
  /**
   * Active region id (A.2) — selects the spirit cutout that looms behind the
   * scrolls and dissolves on full seal. Null → no figure (pre-region /
   * all-cleared). Display-only; never reaches any monetary path.
   */
  readonly activeRegionId: string | null
  /** prefers-reduced-motion → no drop/plant/erupt animation; instant states. */
  readonly reducedMotion: boolean
  /** Emit a tap on scroll position i. The provider's sealScroll handles it. */
  readonly onSeal: (index: 0 | 1 | 2) => void
}

const SCROLL_POSITIONS: ReadonlyArray<0 | 1 | 2> = [0, 1, 2]

export function OoReiSpiritSealing({
  bonusTotalWinLamports,
  fragments,
  presentationOrder,
  sealedScrolls,
  currentSpiritIndex,
  activeRegionId,
  reducedMotion,
  onSeal,
}: OoReiSpiritSealingProps): ReactElement {
  const safeIdx = Math.max(0, Math.min(SPIRIT_PROCESSION.length - 1, currentSpiritIndex))
  const spirit = SPIRIT_PROCESSION[safeIdx]
  const spiritName = spirit?.nameEn ?? 'the spirit'
  const element = ELEMENT_BY_INDEX[safeIdx % ELEMENT_BY_INDEX.length] ?? 'storm'

  // A.2 — the active region's spirit cutout looms behind the scrolls. Null →
  // no figure (honest fallback). Display-only; identical to the duel opponent.
  const spiritCutoutSrc = useMemo(
    () => (activeRegionId ? regionSpiritCutoutForRegion(activeRegionId) : null),
    [activeRegionId],
  )

  const allSealed = sealedScrolls.length >= 3
  const sealedSet = useMemo(() => new Set(sealedScrolls), [sealedScrolls])

  // Track whether the player has made their first tap. Once they do, the
  // "TAP TO SEAL" affordance disappears (the mechanic is understood).
  // Pure local presentation state -- never reaches any financial path.
  const [hasPlayerTapped, setHasPlayerTapped] = useState(false)

  const handleSeal = useCallback(
    (pos: 0 | 1 | 2) => {
      if (!hasPlayerTapped) setHasPlayerTapped(true)
      onSeal(pos)
    },
    [hasPlayerTapped, onSeal],
  )

  return (
    <div
      style={veilStyle(reducedMotion)}
      role="dialog"
      aria-label={`The Sealing ritual. Sealing ${spiritName}. ${sealedScrolls.length} of 3 seals pressed.`}
      data-testid="oo-rei-spirit-sealing"
      data-sealed={sealedScrolls.length}
    >
      {/* keyframes — authored, single-path, no particle emitters */}
      <style>{SEALING_KEYFRAMES}</style>

      {/* A.2 — the active region's spirit looms BEHIND the scrolls while sealing,
          then dissolves upward once all three seals are pressed (mirrors the duel's
          FACE-OFF→SEAL loom/dissolve grammar). zIndex:0 + the content rows at
          zIndex:1 keep it behind the scrolls; pointerEvents:none so it never blocks
          a seal tap. Null region → no figure. The img is a real cutout (A.1) but a
          missing file 404s silently (aria-hidden, no layout break). */}
      {spiritCutoutSrc !== null && (
        <div style={spiritFigureWrapStyle} aria-hidden="true">
          <img
            src={spiritCutoutSrc}
            alt=""
            draggable={false}
            style={spiritFigureImgStyle(allSealed, reducedMotion)}
          />
        </div>
      )}

      {/* Mythic-climax header: THE SEALING · 封印 + the choose-a-scroll primer.
          Per the elevation blueprint §1 (spirit-sealing as mythic climax). */}
      <div style={titleRowStyle}>
        <span style={titleKanjiStyle} aria-hidden="true">封印</span>
        <span style={titleLabelStyle}>
          {allSealed ? 'SEALED' : 'THE SEALING'}
        </span>
      </div>
      <p style={sealingPrimerStyle}>
        {allSealed
          ? 'Sealed. The land quiets. One spirit bound. The island remembers.'
          : 'Choose a scroll. Bind the spirit to the land.'}
      </p>

      <div style={scrollClusterStyle}>
        {SCROLL_POSITIONS.map((pos) => {
          const isSealed = sealedSet.has(pos)
          const fragment = fragments[presentationOrder[pos]] ?? 0n
          // Next-to-seal: the lowest unsealed position pulses as the ready target.
          const isReady = !isSealed && !allSealed
          // Each scroll POSITION carries its own sealing art (kanji + label).
          // Narrative only — EV-invariant across all three positions.
          const art = SEALING_ARTS[pos] ?? SEALING_ARTS[0]!
          return (
            <button
              key={pos}
              type="button"
              style={scrollButtonStyle(pos, isSealed, isReady, reducedMotion)}
              onPointerDown={isSealed ? undefined : () => handleSeal(pos)}
              disabled={isSealed}
              aria-label={isSealed ? `${art.label} pressed` : `Press the seal: ${art.label}`}
              data-testid={`oo-rei-seal-scroll-${pos}`}
              data-sealed={isSealed}
            >
              {isSealed ? (
                <>
                  <ElementEruption kind={element} reducedMotion={reducedMotion} />
                  <span style={scrollFragmentStyle} data-testid={`oo-rei-seal-fragment-${pos}`}>
                    {formatUsdcCompact(fragment)}
                  </span>
                </>
              ) : (
                <span style={scrollKanjiClusterStyle}>
                  <span style={scrollKanjiStyle} aria-hidden="true">{art.kanji}</span>
                  <span style={scrollArtLabelStyle}>{art.label}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* "TAP TO SEAL" affordance -- fades out after the player's first tap.
          Confirms there are tappable targets before the long idle timer fires.
          Amber Geist Mono, letter-spaced, per brand register.
          prefers-reduced-motion: transition:none (opacity only, no movement).
          RG-C5: visibility depends only on hasPlayerTapped + allSealed, never
          on win magnitude or session state. */}
      <p
        aria-hidden={hasPlayerTapped || allSealed}
        style={tapAffordanceStyle(hasPlayerTapped || allSealed, reducedMotion)}
      >
        TAP TO SEAL
      </p>

      {/* Resolved total — appears once all three are sealed. The MAGNITUDE lives
          here in the number, never in louder/longer fanfare (RG-C5). */}
      <div style={totalRowStyle(allSealed, reducedMotion)}>
        <span style={totalLabelStyle}>SPIRIT SEALED</span>
        <span style={totalValueStyle} data-testid="oo-rei-sealing-total">
          {formatUsdcCompact(bonusTotalWinLamports)}
        </span>
      </div>
    </div>
  )
}

// ─── Authored element eruptions (one-shot SVG, never particles) ──────────────

function ElementEruption({ kind, reducedMotion }: { kind: ElementKind; reducedMotion: boolean }): ReactElement {
  const anim = reducedMotion ? 'none' : `ooReiEruptDraw ${ELEMENT_ERUPTION_MS}ms cubic-bezier(0,0,0.25,1) forwards`
  const common: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  }
  // Each path is drawn once via stroke-dashoffset (or opacity for blooms).
  switch (kind) {
    case 'storm':
      return (
        <svg viewBox="0 0 64 96" style={common} aria-hidden="true">
          <path d="M40 8 L26 46 L38 46 L22 88" fill="none" stroke={C.amberBright} strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 200, strokeDashoffset: reducedMotion ? 0 : 200, animation: anim }} />
        </svg>
      )
    case 'tide':
      return (
        <svg viewBox="0 0 64 96" style={common} aria-hidden="true">
          <path d="M4 60 Q18 44 32 60 T60 60" fill="none" stroke={C.amber} strokeWidth="3"
            strokeLinecap="round"
            style={{ strokeDasharray: 160, strokeDashoffset: reducedMotion ? 0 : 160, animation: anim }} />
        </svg>
      )
    case 'ember':
      return (
        <svg viewBox="0 0 64 96" style={common} aria-hidden="true">
          <path d="M32 86 C18 64 30 52 32 30 C40 52 50 64 32 86 Z" fill="none" stroke={C.amberBright} strokeWidth="3"
            strokeLinejoin="round"
            style={{ strokeDasharray: 220, strokeDashoffset: reducedMotion ? 0 : 220, animation: anim }} />
        </svg>
      )
    case 'mist':
      return (
        <svg viewBox="0 0 64 96" style={common} aria-hidden="true">
          <circle cx="32" cy="48" r="22" fill="none" stroke={C.amberDim} strokeWidth="3"
            style={{ strokeDasharray: 160, strokeDashoffset: reducedMotion ? 0 : 160, animation: anim }} />
        </svg>
      )
    case 'shadow':
    default:
      return (
        <svg viewBox="0 0 64 96" style={common} aria-hidden="true">
          <circle cx="32" cy="48" r="20" fill="rgba(40,20,8,0.0)" stroke={C.amber} strokeWidth="2"
            style={{ transformOrigin: 'center', animation: reducedMotion ? 'none' : `ooReiEruptBloom ${ELEMENT_ERUPTION_MS}ms cubic-bezier(0,0,0.25,1) forwards` }} />
        </svg>
      )
  }
}

// ─── Keyframes (module-const string; durations come from props/consts) ───────
const SEALING_KEYFRAMES = `
@keyframes ooReiOfudaGlow {
  0%, 100% { box-shadow: 0 0 0 1px rgba(244,167,62,0.35), 0 0 10px rgba(244,167,62,0.18); }
  50%      { box-shadow: 0 0 0 1px rgba(255,196,77,0.65), 0 0 18px rgba(255,196,77,0.34); }
}
@keyframes ooReiOfudaDrop {
  0%   { transform: translateY(-44px) rotate(-3deg); opacity: 0; }
  100% { transform: translateY(0) rotate(0deg); opacity: 1; }
}
@keyframes ooReiOfudaPlant {
  0%   { transform: translateY(0) scale(1); }
  100% { transform: translateY(6px) scale(0.97); }
}
@keyframes ooReiEruptDraw {
  0%   { stroke-dashoffset: var(--dash, 200); opacity: 0.2; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}
@keyframes ooReiEruptBloom {
  0%   { transform: scale(0.2); opacity: 0.1; }
  100% { transform: scale(1); opacity: 0.85; }
}
@keyframes ooReiTotalRise {
  0%   { transform: translateY(8px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  [data-testid="oo-rei-spirit-sealing"] * { animation: none !important; }
}
`

// ─── Styles ──────────────────────────────────────────────────────────────────

function veilStyle(_reduced: boolean): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    zIndex: 6,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(14px, 4vh, 34px)',
    background: `radial-gradient(120% 90% at 50% 42%, rgba(20,13,6,0.78) 0%, ${C.veil} 72%)`,
    // The veil itself blocks the reels; interactive children re-enable pointer events.
    pointerEvents: 'all',
  }
}

// ─── Region spirit figure (A.2) ──────────────────────────────────────────────
// The active region's spirit looms BEHIND the scrolls and dissolves upward once
// all three are sealed. zIndex:0 here + zIndex:1 on the content rows below keeps
// it behind the ritual; pointerEvents:none so the seal buttons stay tappable.
// Zero cyan (neutral-black drop-shadow only). Timing is a pure function of the
// `allSealed` boolean — no clock, no amount, no tier (RG-C5).
const spiritFigureWrapStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  overflow: 'hidden',
  pointerEvents: 'none',
}

function spiritFigureImgStyle(allSealed: boolean, reduced: boolean): CSSProperties {
  return {
    height: '76%',
    width: 'auto',
    maxWidth: '92%',
    objectFit: 'contain',
    marginTop: '4%',
    filter: 'drop-shadow(0 14px 44px rgba(0,0,0,0.62))',
    userSelect: 'none',
    // Loom while sealing (0.82), dissolve up + fade when all three land (0.45).
    opacity: allSealed ? 0.45 : 0.82,
    transform: reduced
      ? 'none'
      : allSealed
        ? 'translateY(-8%) scale(1.05)'
        : 'translateY(0) scale(1)',
    transition: reduced
      ? 'none'
      : `opacity ${SEALING_ENTRY_FADE_MS}ms ease-out, transform ${SEALING_SPIRIT_DISSOLVE_MS}ms cubic-bezier(0.16,0.84,0.28,1)`,
  }
}

const titleRowStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
}
const titleKanjiStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: 'clamp(28px, 7vw, 44px)',
  fontWeight: 900,
  color: C.amber,
  lineHeight: 1,
  textShadow: '0 2px 12px rgba(244,167,62,0.35)',
}
const titleLabelStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(11, 15),
  letterSpacing: '0.32em',
  color: C.creamMuted,
  textTransform: 'uppercase',
}
// Choose-a-scroll primer line beneath the header (middle-dot-friendly, terse).
const sealingPrimerStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  margin: 0,
  fontFamily: C.fontMono,
  fontSize: fluid(12, 15),
  letterSpacing: '0.04em',
  color: C.creamMuted,
  textAlign: 'center',
  maxWidth: 320,
}

const scrollClusterStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'clamp(12px, 4vw, 28px)',
}

function scrollButtonStyle(
  pos: 0 | 1 | 2,
  isSealed: boolean,
  isReady: boolean,
  reduced: boolean,
): CSSProperties {
  const dropDelay = pos * OFUDA_DROP_STAGGER_MS
  return {
    position: 'relative',
    width: 'clamp(64px, 22vw, 92px)',
    height: 'clamp(96px, 33vw, 138px)',
    borderRadius: 5,
    border: `1px solid ${C.scrollEdge}`,
    background: isSealed ? C.planted : C.scrollParchment,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: isSealed ? 'default' : 'pointer',
    padding: 0,
    overflow: 'hidden',
    pointerEvents: isSealed ? 'none' : 'all',
    // Translate a planted scroll slightly down; drop-in on mount.
    animation: reduced
      ? 'none'
      : isSealed
        ? `ooReiOfudaPlant ${OFUDA_PLANT_MS}ms cubic-bezier(0,0,0.25,1) forwards`
        : `ooReiOfudaDrop ${OFUDA_DROP_MS}ms cubic-bezier(0,0,0.25,1) ${dropDelay}ms both${isReady ? `, ooReiOfudaGlow ${OFUDA_GLOW_PERIOD_MS}ms ease-in-out infinite` : ''}`,
    boxShadow: isSealed
      ? 'inset 0 2px 10px rgba(0,0,0,0.55)'
      : '0 6px 18px rgba(0,0,0,0.45)',
    transition: reduced ? 'none' : 'transform 80ms cubic-bezier(0.2,0,0,1)',
  }
}

// Per-scroll kanji + art-label stack (the sealing-art name beneath the glyph).
const scrollKanjiClusterStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  pointerEvents: 'none',
}
const scrollKanjiStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: 'clamp(26px, 8vw, 40px)',
  fontWeight: 900,
  color: C.scrollKanji,
  lineHeight: 1,
}
// Three-word English sub-label naming the sealing art (Geist Mono label register).
const scrollArtLabelStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(10, 12),
  fontWeight: 500,
  letterSpacing: '0.06em',
  color: 'rgba(122, 31, 18, 0.82)',
  textAlign: 'center',
  lineHeight: 1.1,
  maxWidth: '90%',
}
const scrollFragmentStyle: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  fontFamily: C.fontMono,
  fontSize: 'clamp(13px, 4vw, 17px)',
  fontWeight: 700,
  color: C.amberBright,
  textShadow: '0 1px 4px rgba(0,0,0,0.8)',
}

// "TAP TO SEAL" affordance label -- shown until the player's first tap.
// prefers-reduced-motion path: transition:none; opacity still toggles.
// Only `opacity` and `transform` animated (brand rules).
function tapAffordanceStyle(hidden: boolean, reduced: boolean): CSSProperties {
  return {
    position: 'relative',
    zIndex: 1,
    margin: 0,
    fontFamily: C.fontMono,
    fontSize: fluid(11, 13),
    fontWeight: 600,
    letterSpacing: '0.3em',
    color: C.amberBright,
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
    opacity: hidden ? 0 : 1,
    pointerEvents: 'none',
    transition: reduced ? 'none' : 'opacity 400ms ease-out',
    // No ambient pulse on chrome (DLv2 P10): the label's presence IS the signal.
    // The opacity transition handles fade-in on appear + fade-out after first tap.
  }
}

function totalRowStyle(visible: boolean, reduced: boolean): CSSProperties {
  return {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    minHeight: 56,
    opacity: visible ? 1 : 0,
    animation: visible && !reduced ? `ooReiTotalRise 260ms cubic-bezier(0,0,0.25,1) both` : 'none',
  }
}
const totalLabelStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(11, 14),
  letterSpacing: '0.3em',
  color: C.amberDim,
  textTransform: 'uppercase',
}
const totalValueStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: 'clamp(30px, 9vw, 46px)',
  fontWeight: 800,
  color: C.amberBright,
  lineHeight: 1,
  textShadow: '0 2px 16px rgba(244,167,62,0.4)',
}

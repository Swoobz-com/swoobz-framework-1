'use client'

/**
 * OoReiChapterClose — three-beat participatory chapter-close overlay.
 *
 * Fires post-settle when a region clears (pendingChapterClose !== null).
 * The player DOES something: taps the hovering hanko stamp to cast the final
 * seal (outcome-neutral, carries zero USDC, zero economic framing).
 *
 * Beat sequence:
 *   Phase A — Seal Ceremony: kanji + stamp, player taps (or auto-dismiss fires).
 *   Phase B — Vista Breath: sealed region's vista fills canvas for 300ms hold.
 *   Phase C — New Region Reveal: next region vista + ally choice cards.
 *
 * RG fence:
 *   RG-C1: fires ONLY post-settle (provider guarantees this via pendingChapterClose shape).
 *   RG-C5: ALL timing constants are module-level as const.
 *   Zero win vocabulary, zero USDC, zero economic framing throughout.
 *   The seal gesture is purely ceremonial — outcome pre-determined before the tap.
 *
 * Brand: amber/cream/vermillion, ZERO cyan, Noto Serif JP + Geist Mono.
 * Anti-slop: zero particles, zero confetti. The stamp impact IS the celebration.
 * Press-ack on the stamp: 80ms scale(0.96) — GC1 sub-100ms ack.
 * prefers-reduced-motion: all transitions collapse to instant.
 */

import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'

// ─── Fluid type scale ─────────────────────────────────────────────────────────
function fluid(minPx: number, maxPx: number): string {
  const slope = ((maxPx - minPx) / (1600 - 320)) * 100
  const intercept = minPx - slope * (320 / 100)
  return `clamp(${minPx}px, ${intercept.toFixed(2)}px + ${slope.toFixed(3)}vw, ${maxPx}px)`
}

import type { ChapterCloseEvent } from './ooReiProvider'
import { ARCHETYPE_CONFIGS, getAllyRoster, type RegionArchetype } from './ooReiRegionArchetypes'

// ─── Brand fonts (OO-REI register) ────────────────────────────────────────────
// The Japanese serif is the brand voice: ALL display + narrative text uses it.
// Geist Mono is reserved for numbers + tiny technical labels ONLY. No Latin sans.
const OO_REI_KANJI = '"Noto Serif JP", "Yu Mincho", serif' as const
const OO_REI_MONO = '"Geist Mono", ui-monospace, monospace' as const

// ─── Timing constants (RG-C5 module-const — never runtime-mutated) ────────────

/** Auto-dismiss timer for the chapter-close overlay (accessibility fallback). */
const CHAPTER_CLOSE_DISMISS_MS = 4000 as const

/** Scale + opacity animation duration when the hanko stamp impacts (ms). */
const SEAL_STAMP_IMPACT_MS = 200 as const

/** Hold duration after stamp impact before the next chapter-close beat begins (ms). */
const SEAL_STAMP_HOLD_MS = 600 as const

/** Vista-breath hold duration (Phase B) — no new constant needed per spec: 300ms. */
const VISTA_BREATH_HOLD_MS = 300 as const

/** New region reveal fade-in duration (Phase C). */
const REGION_REVEAL_FADE_MS = 400 as const

/** Ally auto-select timer — LONG AFK/accessibility fallback ONLY (ms).
 *  The perk choice waits for the player (Tim 2026-05-30: didn't want it auto-
 *  completing). This fires only if the player walks away — a 20s safety so the
 *  game can't soft-lock — auto-selecting the first ally. RG-C5: module-const,
 *  identical every region, never sequenced by session value. (In the playground
 *  the whole sequence auto-PLAYS; in the real game the player taps to choose.) */
const ALLY_AUTO_SELECT_MS = 20000 as const

/** Breathing period for the hovering stamp (0.08Hz = 12500ms — spec SEAL_STAMP_BREATHE_MS). */
const SEAL_STAMP_BREATHE_MS = 12500 as const

/** Backdrop ambient skin transition when a new region becomes active (ms). */
const REGION_AMBIENT_TRANSITION_MS = 3000 as const  // consumed by caller via onDismiss timing

// ─── Spirit-ally choices ──────────────────────────────────────────────────────
// Three allies — one per EV-neutral archetype (SURGE / FORGE / DRIFT) — offered
// on EVERY region clear, THEMED to the region being entered (Tim 2026-05-30:
// allies should differ per unlocked area). The roster is resolved at render time
// from the next region's id via getAllyRoster(); the PERK math is the archetype,
// so cash RTP is unaffected (96%) by any choice — the perk reaches no payout path.

/**
 * Responsive chooser layout (Tim 2026-05-30): MOBILE stacks the cards TOP→DOWN
 * (each card a portrait-left / text-right row); DESKTOP lays them LEFT→RIGHT
 * (each card a portrait-top / text-below column). One module-const stylesheet —
 * injected once with the overlay, no runtime/session-derived values (RG-C5).
 */
// CONTAINER query (not @media): the playground device-preview shrinks the game
// CONTAINER, not the viewport, so a viewport @media never fired in the 390px frame
// (Tim 2026-05-30: "mobile shows 3 left to right"). Keying off the overlay's own
// width via container-query makes it correct in BOTH the preview and on real phones.
const ALLY_GRID_CSS = `
.oo-rei-ally-cq{container-type:inline-size;}
.oo-rei-ally-grid{display:flex;flex-direction:column;gap:10px;width:100%;max-width:360px;}
.oo-rei-ally-card{display:flex;flex-direction:row;align-items:center;gap:12px;width:100%;padding:10px;border-radius:5px;text-align:left;}
.oo-rei-ally-portrait{width:60px;height:80px;flex:0 0 auto;object-fit:cover;object-position:top center;border-radius:3px;}
.oo-rei-ally-text{display:block;min-width:0;text-align:left;}
@container (min-width:560px){
  .oo-rei-ally-grid{flex-direction:row;max-width:620px;gap:14px;align-items:stretch;}
  .oo-rei-ally-card{flex-direction:column;align-items:center;gap:8px;flex:1 1 0;padding:14px 12px 16px;text-align:center;}
  .oo-rei-ally-portrait{width:100%;height:158px;}
  .oo-rei-ally-text{text-align:center;}
}
@media (prefers-reduced-motion: reduce){
  .oo-rei-ally-card{transition:none !important;}
}
`

// ─── Phase type ───────────────────────────────────────────────────────────────

type ChapterPhase = 'seal-ceremony' | 'vista-breath' | 'region-reveal' | 'done'

// ─── Props ────────────────────────────────────────────────────────────────────

interface OoReiChapterCloseProps {
  /** The pending chapter-close event from the provider. */
  readonly event: ChapterCloseEvent
  /** How many spirits have been sealed AFTER this seal (provider's sealedSpiritCount). */
  readonly sealedSpiritCount: number
  /** Current active ally kanji (may be null — shown as watermark context in Phase C). */
  readonly activeAllyKanji: string | null
  /** Calls controller.confirmSeal() — advances beyond the stamp tap. */
  readonly onConfirmSeal: () => void
  /** Calls controller.dismissChapterClose() — fully dismisses and returns to game. */
  readonly onDismiss: () => void
  /** Calls controller.chooseAlly(archetype) — sets the region's EV-neutral perk. */
  readonly onChooseAlly: (archetype: RegionArchetype) => void
  /** Vista src for the NEXT region (Phase C background). Null if no next region. */
  readonly nextRegionVistaSrc: string | null
  /** Id of the NEXT region — resolves its themed ally roster. Null if none. */
  readonly nextRegionId: string | null
  /** Goal statement for the NEXT region (Phase C copy). Null if none. */
  readonly nextRegionGoalStatement: string | null
  /** prefers-reduced-motion flag from the parent. */
  readonly reducedMotion: boolean
  /**
   * DEV-ONLY — called each time the internal chapter phase advances.
   * Used by the animation playground to drive the phase HUD overlay.
   * Safe to pass in production (no-ops when undefined). Purely observational.
   * Phase values: 'seal-ceremony' | 'vista-breath' | 'region-reveal' | 'done'
   */
  readonly onPhaseChange?: (phase: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OoReiChapterClose({
  event,
  sealedSpiritCount,
  activeAllyKanji: _activeAllyKanji,
  onConfirmSeal,
  onDismiss,
  onChooseAlly,
  nextRegionVistaSrc,
  nextRegionId,
  nextRegionGoalStatement,
  reducedMotion,
  onPhaseChange,
}: OoReiChapterCloseProps) {
  // Themed ally trio for the region being entered (stable const reference per id).
  const roster = getAllyRoster(nextRegionId ?? '')
  const rosterRef = useRef(roster)
  rosterRef.current = roster
  const [phase, setPhase] = useState<ChapterPhase>('seal-ceremony')
  const [stampImpacted, setStampImpacted] = useState(false)
  const [selectedAllyKey, setSelectedAllyKey] = useState<RegionArchetype | null>(null)
  // Mirror of selectedAllyKey so the auto-select timer can resolve the chosen
  // ally WITHOUT calling the parent's onChooseAlly from inside a setState updater
  // (that was a setState-in-render violation — it updated the parent during React's
  // render phase and was the root of the chapter-progression flicker). Refs are
  // safe to write during render.
  const selectedAllyRef = useRef<RegionArchetype | null>(null)
  selectedAllyRef.current = selectedAllyKey

  // Timers — all stored in refs to cancel on unmount.
  const autoAllyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseBTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseCTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fullDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sealed region's vista — used as the seal-ceremony backdrop (Phase A) so it is
  // not a black void (Tim 2026-05-30: "the background should be here already").
  const sealedVistaSrc = vistaForSealedRegion(event.sealedRegionNameEN)

  // Preload every image the overlay will show (sealed vista + next vista + the
  // ally portraits) on mount, so no phase pops in mid-reveal (Tim 2026-05-30:
  // "buggin quite a bit with loading images, backgrounds, the allies"). new Image()
  // warms the browser cache while the seal-ceremony beat plays.
  useEffect(() => {
    const urls = [sealedVistaSrc]
    if (nextRegionVistaSrc) urls.push(nextRegionVistaSrc)
    for (const a of roster) urls.push(a.portraitSrc)
    const imgs = urls.map((u) => {
      const img = new Image()
      img.src = u
      return img
    })
    return () => { for (const img of imgs) img.src = '' }
  }, [sealedVistaSrc, nextRegionVistaSrc, roster])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (autoAllyTimerRef.current) clearTimeout(autoAllyTimerRef.current)
      if (phaseBTimerRef.current) clearTimeout(phaseBTimerRef.current)
      if (phaseCTimerRef.current) clearTimeout(phaseCTimerRef.current)
      if (fullDismissTimerRef.current) clearTimeout(fullDismissTimerRef.current)
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current)
    }
  }, [])

  // ── Auto-dismiss (accessibility fallback) ────────────────────────────────
  // Fires CHAPTER_CLOSE_DISMISS_MS after mount if the player does not tap.
  // The ritual outcome is identical whether tapped or auto-dismissed (RG-safe).
  useEffect(() => {
    autoDismissTimerRef.current = setTimeout(() => {
      if (phase === 'seal-ceremony' && !stampImpacted) {
        handleSealTap()
      }
    }, CHAPTER_CLOSE_DISMISS_MS)
    return () => {
      if (autoDismissTimerRef.current) clearTimeout(autoDismissTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Advance phases after stamp impact ────────────────────────────────────
  const advanceAfterImpact = useCallback(() => {
    // Phase B: vista breath
    phaseBTimerRef.current = setTimeout(() => {
      setPhase('vista-breath')
      onPhaseChange?.('vista-breath')
      // Phase C: region reveal after vista breath hold
      phaseCTimerRef.current = setTimeout(() => {
        setPhase('region-reveal')
        onPhaseChange?.('region-reveal')
        // Auto-select the default ally (SURGE) only as an AFK fallback if the
        // player never engages. Resolve from the ref (latest selection), set
        // state with a PURE updater, then notify the parent OUTSIDE the updater
        // — never call a parent setter inside setState's updater (setState-in-
        // render → chapter flicker, the 2026-05-30 bug).
        autoAllyTimerRef.current = setTimeout(() => {
          const fallback = rosterRef.current[0]?.archetype ?? 'SURGE'
          const chosen = selectedAllyRef.current ?? fallback
          setSelectedAllyKey((prev) => prev ?? fallback)
          onChooseAlly(chosen)
        }, ALLY_AUTO_SELECT_MS)
        // Full dismiss after the ally-choice window closes.
        const dismissDelay = ALLY_AUTO_SELECT_MS + 600
        fullDismissTimerRef.current = setTimeout(() => {
          setPhase('done')
          onPhaseChange?.('done')
          onDismiss()
        }, dismissDelay)
      }, VISTA_BREATH_HOLD_MS)
    }, SEAL_STAMP_HOLD_MS)
  }, [onChooseAlly, onDismiss, onPhaseChange])

  // Notify initial phase on mount (seal-ceremony is the starting phase)
  // Using a ref-based effect so it fires exactly once on mount.
  const onPhaseChangeRef = useRef(onPhaseChange)
  onPhaseChangeRef.current = onPhaseChange
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional mount-only
  useEffect(() => { onPhaseChangeRef.current?.('seal-ceremony') }, [])

  // ── Stamp tap handler ─────────────────────────────────────────────────────
  const handleSealTap = useCallback(() => {
    if (stampImpacted) return
    setStampImpacted(true)
    onConfirmSeal()
    advanceAfterImpact()
  }, [stampImpacted, onConfirmSeal, advanceAfterImpact])

  // ── Ally selection ────────────────────────────────────────────────────────
  const handleChooseAlly = useCallback((archetype: RegionArchetype) => {
    if (autoAllyTimerRef.current) clearTimeout(autoAllyTimerRef.current)
    setSelectedAllyKey(archetype)
    onChooseAlly(archetype)
    // Dismiss shortly after selection — give the chosen-card confirm a beat.
    if (fullDismissTimerRef.current) clearTimeout(fullDismissTimerRef.current)
    fullDismissTimerRef.current = setTimeout(() => {
      setPhase('done')
      onDismiss()
    }, 900)
  }, [onChooseAlly, onDismiss])

  if (phase === 'done') return null

  // ── Transition durations (collapse to 0 on reduced-motion) ───────────────
  const fadeDuration = reducedMotion ? 0 : 260
  const stampTransDuration = reducedMotion ? 0 : SEAL_STAMP_IMPACT_MS
  const revealFadeDuration = reducedMotion ? 0 : REGION_REVEAL_FADE_MS
  const breatheDuration = reducedMotion ? 0 : SEAL_STAMP_BREATHE_MS

  return (
    <>
      {/* CSS keyframes for stamp breathing + entry animation — injected once. */}
      <style>{`
        @keyframes ooReiSealEntry {
          from { opacity: 0; transform: translateY(-10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)      scale(1.0); }
        }
        @keyframes ooReiSealBreath {
          0%, 100% { transform: scale(0.96); }
          50%       { transform: scale(1.04); }
        }
        @keyframes ooReiSealReveal {
          from { opacity: 0; transform: scale(1.04); }
          to   { opacity: 1; transform: scale(1.0); }
        }
        @keyframes ooReiVistaBreath {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes ooReiSealEntry   { from { opacity: 1; } to { opacity: 1; } }
          @keyframes ooReiSealBreath  { 0%, 100% { transform: none; } }
          @keyframes ooReiSealReveal  { from { opacity: 1; } to { opacity: 1; } }
          @keyframes ooReiVistaBreath { from { opacity: 1; } to { opacity: 1; } }
        }
      `}</style>

      {/* Full-canvas dark scrim — live game visible behind at reduced opacity */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 52,
          background: 'rgba(26,22,18,0.78)',
          pointerEvents: 'none',
          transition: reducedMotion ? 'none' : `opacity ${fadeDuration}ms cubic-bezier(0,0,0.25,1)`,
        }}
      />

      {/* ── Phase A: Seal Ceremony ──────────────────────────────────────── */}
      {phase === 'seal-ceremony' && (
        <div
          role="status"
          aria-live="polite"
          aria-label={`Region sealed: ${event.sealedRegionNameEN}. Tap to complete the seal.`}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 53,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            pointerEvents: 'none',
            // Sealed region's vista as the backdrop (was a black void before).
            backgroundImage: `url('${sealedVistaSrc}')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 35%',
            animation: reducedMotion ? undefined : `ooReiSealEntry ${fadeDuration}ms cubic-bezier(0,0,0.25,1) both`,
          }}
        >
          {/* Vignette over the sealed vista — keeps the kanji + stamp legible. */}
          <div aria-hidden="true" style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(20,16,12,0.80) 0%, rgba(20,16,12,0.48) 35%, rgba(20,16,12,0.62) 65%, rgba(20,16,12,0.88) 100%)',
            pointerEvents: 'none',
          }} />

          {/* Sealed region kanji — 56px Noto Serif JP, amber */}
          <div style={{
            fontFamily: '"Noto Serif JP", "Yu Mincho", serif',
            fontWeight: 700,
            fontSize: 'clamp(40px, 8vw, 56px)',
            color: '#f4a73e',
            lineHeight: 1,
            letterSpacing: 0,
            textAlign: 'center',
          }}>
            {event.sealedRegionNameJP}
          </div>

          {/* "封印 [SPIRIT NAME] · [REGION EN] SEALED" label */}
          <div style={{
            fontFamily: '"Geist Mono", ui-monospace, monospace',
            fontSize: fluid(11, 14),
            letterSpacing: '0.22em',
            color: 'rgba(232,223,200,0.82)',
            textTransform: 'uppercase' as const,
            textAlign: 'center',
          }}>
            封印 · {event.sealedRegionNameEN} SEALED
          </div>

          {/* Hovering hanko stamp — DOM-authored, per spec: CSS border, kanji 封 */}
          <button
            type="button"
            aria-label="Tap to cast the final seal"
            style={{
              pointerEvents: 'all',
              width: 80,
              height: 80,
              border: '2px solid #c0392b',
              borderRadius: '2px',
              background: 'rgba(26,22,18,0.70)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              // Breathing animation when not yet impacted
              animation: !stampImpacted && !reducedMotion
                ? `ooReiSealBreath ${breatheDuration}ms ease-in-out infinite`
                : undefined,
              // Impact: scale 1.2 → 1.0, opacity 0 → 1 handled via transition
              transition: reducedMotion
                ? 'none'
                : `transform ${stampTransDuration}ms cubic-bezier(0.2,0,0,1), opacity ${stampTransDuration}ms ease`,
              transform: stampImpacted ? 'scale(1.0)' : undefined,
              opacity: stampImpacted ? 1 : 0.80,
              // Press-ack: handled via onPointerDown inline
              marginTop: '8px',
            }}
            onPointerDown={(e) => {
              if (!reducedMotion) {
                ;(e.currentTarget as HTMLElement).style.transform = 'scale(0.96)'
              }
              handleSealTap()
            }}
            onPointerUp={(e) => {
              ;(e.currentTarget as HTMLElement).style.transform = ''
            }}
            onPointerCancel={(e) => {
              ;(e.currentTarget as HTMLElement).style.transform = ''
            }}
          >
            <span style={{
              fontFamily: '"Noto Serif JP", "Yu Mincho", serif',
              fontSize: 32,
              fontWeight: 700,
              color: '#c0392b',
              lineHeight: 1,
              userSelect: 'none',
              pointerEvents: 'none',
            }}>
              封
            </span>
          </button>

          {/* Tap prompt — Geist Mono, muted cream */}
          {!stampImpacted && (
            <div style={{
              fontFamily: '"Geist Mono", ui-monospace, monospace',
              fontSize: fluid(10, 13),
              letterSpacing: '0.18em',
              color: 'rgba(232,223,200,0.50)',
              textTransform: 'uppercase' as const,
            }}>
              TAP TO SEAL
            </div>
          )}
        </div>
      )}

      {/* ── Phase B: Vista Breath ───────────────────────────────────────── */}
      {phase === 'vista-breath' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 53,
            backgroundImage: event ? `url('${vistaForSealedRegion(event.sealedRegionNameEN)}')` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center 35%',
            pointerEvents: 'none',
            animation: reducedMotion ? undefined : `ooReiVistaBreath ${fadeDuration}ms cubic-bezier(0,0,0.25,1) both`,
          }}
        />
      )}

      {/* ── Phase C: New Region Reveal ──────────────────────────────────── */}
      {phase === 'region-reveal' && event.nextRegionNameEN !== null && (
        <div
          role="status"
          aria-live="polite"
          aria-label={`New region revealed: ${event.nextRegionNameEN ?? ''}. Choose a spirit ally for its perk.`}
          className="oo-rei-ally-cq"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 53,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'clamp(14px, 3vh, 24px)',
            padding: 'clamp(20px, 5vh, 56px) 16px',
            // Next region vista as background
            backgroundImage: nextRegionVistaSrc
              ? `url('${nextRegionVistaSrc}')`
              : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center 35%',
            pointerEvents: 'none',
            animation: reducedMotion ? undefined : `ooReiSealReveal ${revealFadeDuration}ms cubic-bezier(0,0,0.25,1) both`,
          }}
        >
          {/* Full-height vignette so the centred content stays legible over the vista */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(20,16,12,0.78) 0%, rgba(20,16,12,0.42) 28%, rgba(20,16,12,0.52) 58%, rgba(20,16,12,0.90) 100%)',
            pointerEvents: 'none',
          }} />

          {/* Responsive layout styles: mobile = cards stacked top→down; desktop = left→right */}
          <style>{ALLY_GRID_CSS}</style>

          {/* Region header — compact */}
          <div style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            textAlign: 'center',
            padding: '0 16px',
          }}>
            <div style={{
              fontFamily: '"Noto Serif JP", "Yu Mincho", serif',
              fontWeight: 700,
              fontSize: 'clamp(20px, 4.5vw, 28px)',
              color: '#f4a73e',
              lineHeight: 1,
            }}>
              {event.nextRegionNameJP}
            </div>
            <div style={{
              fontFamily: '"Geist Mono", ui-monospace, monospace',
              fontSize: fluid(11, 14),
              letterSpacing: '0.18em',
              color: '#e8dfc8',
              textTransform: 'uppercase' as const,
            }}>
              {event.nextRegionNameEN}
            </div>
          </div>

          {/* Spirit Ally chooser — 3 perked options (one per EV-neutral archetype) */}
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              pointerEvents: 'auto',
            }}
          >
            <div style={{
              textAlign: 'center',
              fontFamily: '"Geist Mono", ui-monospace, monospace',
              fontSize: fluid(11, 14),
              letterSpacing: '0.2em',
              color: 'rgba(244,167,62,0.9)',
              textTransform: 'uppercase' as const,
            }}>
              CHOOSE YOUR SPIRIT ALLY
            </div>
            <div style={{
              textAlign: 'center',
              fontFamily: '"Geist Mono", ui-monospace, monospace',
              fontSize: fluid(10, 13),
              letterSpacing: '0.1em',
              color: 'rgba(232,223,200,0.55)',
              textTransform: 'uppercase' as const,
              marginTop: '-4px',
            }}>
              Each grants a perk for this region
            </div>

            <div className="oo-rei-ally-grid">
              {roster.map((ally) => {
                const isSelected = selectedAllyKey === ally.archetype
                const perkSummary = ARCHETYPE_CONFIGS[ally.archetype].perkSummary
                return (
                  <button
                    key={ally.archetype}
                    type="button"
                    className="oo-rei-ally-card"
                    aria-pressed={isSelected}
                    aria-label={`Choose ${ally.name} the ${ally.title}. Perk: ${perkSummary}.`}
                    style={{
                      background: isSelected ? `${ally.accentHex}26` : 'rgba(18,15,12,0.74)',
                      border: `1.5px solid ${isSelected ? ally.accentHex : 'rgba(232,223,200,0.16)'}`,
                      boxShadow: isSelected
                        ? `0 0 0 1px ${ally.accentHex}55, 0 8px 26px rgba(0,0,0,0.5)`
                        : '0 4px 16px rgba(0,0,0,0.4)',
                      backdropFilter: 'blur(5px)',
                      WebkitBackdropFilter: 'blur(5px)',
                      cursor: 'pointer',
                      transition: reducedMotion
                        ? 'none'
                        : 'transform 80ms cubic-bezier(0.2,0,0,1), border-color 140ms ease, background 140ms ease, box-shadow 140ms ease',
                    }}
                    onPointerDown={(e) => {
                      if (!reducedMotion) {
                        ;(e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'
                      }
                    }}
                    onPointerUp={(e) => {
                      ;(e.currentTarget as HTMLElement).style.transform = ''
                      handleChooseAlly(ally.archetype)
                    }}
                    onPointerCancel={(e) => {
                      ;(e.currentTarget as HTMLElement).style.transform = ''
                    }}
                  >
                    <img
                      className="oo-rei-ally-portrait"
                      src={ally.portraitSrc}
                      alt=""
                      draggable={false}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    />
                    <div className="oo-rei-ally-text">
                      <div style={{
                        fontFamily: OO_REI_KANJI,
                        fontSize: fluid(15, 18),
                        fontWeight: 700,
                        color: ally.accentHex,
                        lineHeight: 1.05,
                        userSelect: 'none',
                      }}>
                        {ally.name}
                      </div>
                      <div style={{
                        fontFamily: OO_REI_MONO,
                        fontSize: fluid(10, 12),
                        letterSpacing: '0.12em',
                        color: 'rgba(232,223,200,0.62)',
                        textTransform: 'uppercase' as const,
                        userSelect: 'none',
                      }}>
                        {ally.title}
                      </div>
                      <div style={{
                        display: 'inline-block',
                        marginTop: 4,
                        fontFamily: OO_REI_MONO,
                        fontSize: fluid(10, 13),
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        color: ally.accentHex,
                        border: `1px solid ${ally.accentHex}66`,
                        borderRadius: 3,
                        padding: '2px 6px',
                        textTransform: 'uppercase' as const,
                        userSelect: 'none',
                      }}>
                        {perkSummary}
                      </div>
                      <div style={{
                        fontFamily: OO_REI_KANJI,
                        fontStyle: 'italic',
                        fontSize: fluid(11, 14),
                        lineHeight: 1.45,
                        color: 'rgba(232,223,200,0.74)',
                        marginTop: 5,
                        userSelect: 'none',
                      }}>
                        {ally.tagline}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Helper — vista src for the sealed region (Phase B look-back) ─────────────
// Maps region nameEN → its vista path (same as MYTH_REGIONS.vistaSrc).
// Inlined here to avoid a circular import of the full MYTH_REGIONS array.
// Only authored regions can fire a chapter-close (regions 1-5).
function vistaForSealedRegion(nameEN: string): string {
  const slug = nameEN.toLowerCase().replace(/\s+/g, '-')
  return `/assets/generated/oo-rei/myth/region-${slug}.jpg`
}

export const REGION_AMBIENT_TRANSITION_MS_EXPORT = REGION_AMBIENT_TRANSITION_MS

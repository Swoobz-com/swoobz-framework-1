'use client'

/**
 * ooReiInkNumber — shared ink-register win-number treatment for OO-REI.
 *
 * Single source for:
 *   - INK_NUMBER_TEXT_SHADOW   (amber hairline + warm cast shadow + diffuse wash)
 *   - WIN_NUMBER_FONT_FAMILY   (Noto Serif JP weight 900 — brand-mandated face)
 *   - INK_FILTER_SVG_DEFS      (zero-size aria-hidden SVG, filter id="oo-rei-ink-rough")
 *   - InkNumber component      (ink-wash plate + inked digit span)
 *
 * Consumed by:
 *   - OoReiCinematicOverlay.tsx  (pull-out multiplier figure)
 *   - OoReiExperience.tsx        (in-canvas win-reveal panel number)
 *
 * Brand register: ink-black #1a0f06 fill, amber hairline highlight (-1px -1px),
 * warm cast shadow, SVG feTurbulence micro-roughness. Zero cyan. No WebkitTextStroke
 * white outline. Dark-glass ink-wash plate provides legibility ground.
 *
 * RG-C5: all values are module-level constants — never scaled per session or win magnitude.
 * Reduced-motion: SVG filter is a static paint quality (not a keyframe). The
 *   ooReiMultiplierReveal animation is gated by the prefersReducedMotion prop.
 *
 * Domain C: presentation only. No financial math.
 */

import { type CSSProperties, type ReactElement } from 'react'

// ─── Font ─────────────────────────────────────────────────────────────────────

/**
 * Display font for OO-REI win numbers.
 * Noto Serif JP weight 900 — ships a REAL weight 900 unlike single-weight Yuji Syuku
 * (which faux-bolded and scattered glyphs at large sizes). Brand-mandated CJK serif.
 * BRAND_KIT §6 + feedback-oo-rei-japanese-font-register: Geist Sans banned on display.
 */
export const WIN_NUMBER_FONT_FAMILY = `"Noto Serif JP", "Yu Mincho", serif` as const

// ─── Text shadow (ink register) ───────────────────────────────────────────────

/**
 * Ink-register text-shadow for win number figures.
 * Replaces the white-outlined casino number with an inked-brush treatment:
 *   - amber hairline (-1px -1px): key-light catching the raised ink bead (upper-left)
 *   - warm catch light ( 0  -1px): secondary catch
 *   - short warm cast shadow (1px 2px): ground contact
 *   - wide diffuse wash (0 4px 18px): ink bleed into the paper ground
 *   - outer amber glow (0 0 22px): warm aura, not a neon ring
 * Zero cyan. No hard outline ring.
 * RG-C5: module-level constant — never scaled per session or win magnitude.
 */
// Tim 2026-06-01: the win number read as "black text on a black background" —
// the old ink-black fill + amber hairline assumed a LIGHT ground. On the dark
// overlay it vanished. The digit is now a warm gold-cream fill (set at the call
// site) lifted off the dark by a DARK stroke-shadow (multi-offset near-black)
// plus a warm amber glow. Reads high-contrast on any dark scene. Zero cyan.
export const INK_NUMBER_TEXT_SHADOW: string =
  ` 0    0   2px rgba(8,5,2,0.95), ` +
  ` 1px  1px 0   rgba(8,5,2,0.92), ` +
  `-1px -1px 0   rgba(8,5,2,0.78), ` +
  ` 0    3px 14px rgba(8,5,2,0.80), ` +
  ` 0    0   26px rgba(244,167,62,0.50)`

// ─── SVG filter defs ──────────────────────────────────────────────────────────

/**
 * SVG filter defs — ink-rough displacement filter.
 * Inject once per render tree as an aria-hidden zero-size SVG via dangerouslySetInnerHTML.
 * The component that injects this must be present in the same React render tree as any
 * InkNumber that references it (filter id="oo-rei-ink-rough").
 *
 * feTurbulence seed=7: fixed seed = identical roughness every render (RG-C5 static).
 * feDisplacementMap scale=3: 3px max displacement — ink tooth without legibility loss.
 *
 * Reduced-motion note: this is a static paint quality filter (not a motion keyframe).
 * The roughness does not animate; no reduced-motion override is needed here.
 */
export const INK_FILTER_SVG_DEFS: string =
  `<svg width="0" height="0" aria-hidden="true" focusable="false" ` +
  `style="position:absolute;pointer-events:none;overflow:hidden">` +
  `<defs><filter id="oo-rei-ink-rough" x="-4%" y="-4%" width="108%" height="108%" ` +
  `color-interpolation-filters="sRGB">` +
  `<feTurbulence type="fractalNoise" baseFrequency="0.04 0.06" numOctaves="3" seed="7" result="noise"/>` +
  `<feDisplacementMap in="SourceGraphic" in2="noise" scale="3" ` +
  `xChannelSelector="R" yChannelSelector="G" result="roughened"/>` +
  `</filter></defs></svg>`

// ─── Component ────────────────────────────────────────────────────────────────

export interface InkNumberProps {
  /** Formatted display string (e.g. "2.50x", "$4.20"). */
  readonly value: string
  /** Font size in px (desktop). Mobile callers should pass a reduced px. */
  readonly fontPx: number
  /**
   * GOOD tier whisper mode: reduces the plate max-opacity because the
   * brushstroke-amber.png calligraphy already provides a warm ground.
   * false (default) = full 0.72 plate for legibility over duel/reel art.
   */
  readonly isWhisperBeat: boolean
  /**
   * When true the reveal animation (ooReiMultiplierReveal) is suppressed
   * so the number snaps into view without motion (OS prefers-reduced-motion).
   */
  readonly prefersReducedMotion: boolean
  /**
   * Accessible label for screen readers (e.g. "Win: 2.50 USDC").
   * The visible digit span is aria-hidden; this label is on the wrapper.
   */
  readonly ariaLabel: string
  /**
   * Duration (ms) of the ooReiMultiplierReveal fade-in keyframe.
   * RG-C5: callers must pass a module-level const — never a runtime-scaled value.
   */
  readonly revealMs: number
}

/**
 * InkNumber — win value rendered as calligraphic ink-black digit.
 *
 * Composition:
 *   1. Outer wrapper — carries the ooReiMultiplierReveal fade-in animation.
 *   2. Ink-wash plate (aria-hidden span) — brushed horizontal sweep gradient,
 *      blurred 3px, provides a soft dark ground for legibility without a panel.
 *   3. Inked digit span — ink-black #1a0f06 fill, INK_NUMBER_TEXT_SHADOW amber
 *      hairline + diffuse cast, SVG feTurbulence filter via url(#oo-rei-ink-rough).
 *
 * The SVG filter must be present in the same render tree; inject INK_FILTER_SVG_DEFS
 * once via dangerouslySetInnerHTML near the component usage site.
 */
export function InkNumber({
  value,
  fontPx,
  isWhisperBeat,
  prefersReducedMotion,
  ariaLabel,
  revealMs,
}: InkNumberProps): ReactElement {
  // GOOD tier (isWhisperBeat): plate max-opacity 0.50 — calligraphy ground is warm.
  // Other tiers: 0.72 — full plate for legibility over reel art or duel scene.
  const plateMaxOpacity = isWhisperBeat ? 0.50 : 0.72

  const inkWashPlate: CSSProperties = {
    position: 'absolute',
    inset: '-8% -14px',
    background: `linear-gradient(
      100deg,
      rgba(10,6,2,0.0)                          0%,
      rgba(10,6,2,${(plateMaxOpacity * 0.76).toFixed(2)}) 18%,
      rgba(10,6,2,${plateMaxOpacity.toFixed(2)}) 35%,
      rgba(10,6,2,${(plateMaxOpacity * 0.94).toFixed(2)}) 65%,
      rgba(10,6,2,${(plateMaxOpacity * 0.58).toFixed(2)}) 82%,
      rgba(10,6,2,0.0)                          100%
    )`,
    borderRadius: '2px 3px 4px 1px',
    zIndex: 0,
    pointerEvents: 'none',
    // blur(3px) softens the edge to paper-bleed — not a box-shadow.
    // Applied at composite time: sub-ms cost, not per-frame.
    filter: 'blur(3px)',
  }

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-block',
        textAlign: 'center',
        lineHeight: 1.1,
        marginTop: 0,
        zIndex: 2,
        animationName: prefersReducedMotion ? 'none' : 'ooReiMultiplierReveal',
        animationDuration: `${revealMs}ms`,
        animationTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
        animationFillMode: 'both',
      }}
      aria-label={ariaLabel}
    >
      {/* Ink-wash backing plate — aria-hidden, zero content */}
      <span aria-hidden="true" style={inkWashPlate} />
      {/* Inked digit */}
      <span
        aria-hidden="true"
        style={{
          position: 'relative',
          zIndex: 1,
          fontFamily: WIN_NUMBER_FONT_FAMILY,
          fontSize: fontPx,
          fontWeight: 900,
          letterSpacing: '0.02em',
          // Tabular figures so the centered win number doesn't shift width as it
          // counts up (autisk fix — proportional serif digits jittered).
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum"',
          // Warm gold-cream so the win figure reads bright on the dark overlay
          // (Tim 2026-06-01 "black text on black background"). Dark stroke-shadow
          // (INK_NUMBER_TEXT_SHADOW) carries the legibility; amber glow the warmth.
          color: '#f6d690',
          textShadow: INK_NUMBER_TEXT_SHADOW,
          // SVG feTurbulence micro-roughness — static paint quality, not an animation.
          // References the #oo-rei-ink-rough filter injected via INK_FILTER_SVG_DEFS.
          filter: 'url(#oo-rei-ink-rough)',
          display: 'block',
        }}
      >
        {value}
      </span>
    </span>
  )
}

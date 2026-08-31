'use client'

/**
 * Swoobz Originals — BET CONSOLE (shared)
 * ------------------------------------------------------------------------
 * ONE betting surface every Original uses, so a player learns the flow once
 * (Pulse, OO-Fisher, Rug or Riches, OO-Rei) and it works everywhere. The
 * STRUCTURE + INTERACTION + CLARITY are universal; the MATERIAL + accents are
 * skinned per game via the `theme` prop, so it always reads as PART of that
 * game's scene — a seated instrument panel, not a floating web form.
 *
 * Clarity contract (what makes it easy to understand):
 *   1. One big, unmissable wager amount + quick-pick chips.
 *   2. A live "TO WIN" line — you see what you're playing for BEFORE you commit.
 *   3. Game-specific choices sit in one obvious place (the `children` slot);
 *      advanced/optional controls hide behind a single OPTIONS drawer.
 *   4. ONE dominant commit button — the only full-accent element on the panel.
 *
 * The panel MOUNTS to the bottom of the game canvas (top corners rounded,
 * bottom flush) so it reads as the scene's lower control plinth. Opaque, not
 * glass — it has authority over the scene, it doesn't bleed it.
 */

import { Fragment, useState, type CSSProperties, type ReactNode } from 'react'

/** The skin each game passes. Every game's inline `T` token object satisfies
 *  this shape — map its colours in one place per game. */
export interface BetConsoleTheme {
  fontMono: string
  fontBody: string
  /** Panel surface — a subtle top→bottom gradient (lighter top catches light). */
  surfaceTop: string
  surfaceBottom: string
  /** Top hairline + its inner glow — the material tie to the scene (gold bars,
   *  brass rail, etc.). This is the single edge that seats the panel. */
  trim: string
  trimGlow: string
  /** Engraved section-label colour (gold/brass placard on the plate). */
  label: string
  textPrimary: string
  textMuted: string
  textDim: string
  /** Opt-in (2026-07-06, WCAG AA fix) — overrides the `hint` slot's text
   *  color when a game needs it brighter than `textDim` (the header `hint`
   *  is the only teaching line for a fresh player in some games, so
   *  `textDim`'s deliberately-quiet 40% opacity can fail 4.5:1 body-text
   *  contrast there even though `textDim` is fine for the many other
   *  genuinely-secondary micro-labels it drives elsewhere). DEFAULTS to
   *  `undefined` -> falls back to `textDim`, so every existing theme
   *  (Pulse / OO-Fisher / OO-Rei, none of which pass `hint` today) renders
   *  byte-identical. Scoped this way instead of brightening `textDim`
   *  itself, which is reused by `toWinLabel`/`balanceLabel` below and would
   *  ripple into surfaces this fix isn't about. */
  hintColor?: string
  /** The single CTA fill + the ink drawn on it. */
  accentSolid: string
  accentInk: string
  /** Soft accent for a SELECTED chip (outlined, not full-fill — never competes
   *  with the CTA). */
  accentSoftBg: string
  accentSoftBorder: string
  accentText: string
  /** Money / reward colour (the TO-WIN + balance value). */
  money: string
  danger: string
  /** Top-corner radius (bottom is always flush = 0). */
  radius: number
}

export interface BetConsoleProps {
  theme: BetConsoleTheme
  /** Small placard label, e.g. "SET YOUR PLAY". */
  eyebrow: string
  hint?: string
  /** Opt-in panel-surface width override. DEFAULTS to 460 (unchanged for
   *  every existing caller — Pulse / OO-Fisher / OO-Rei never pass this).
   *  Pass a wider value (e.g. a board-region width or '100%') ONLY when the
   *  console sits under a full-width board and should read as one
   *  continuous unit with it, instead of self-centering as a narrow card.
   *  See RUG OR RICHES bet-entry call site (2026-07-03 board/console width
   *  mismatch fix). */
  maxWidth?: number | string
  /** Opt-in interior layout switch. DEFAULTS to `false` (unchanged for every
   *  existing caller — Pulse / OO-Fisher / OO-Rei never pass this, and the
   *  RUG OR RICHES other 3 phases don't need it either). Only meaningful
   *  alongside a wide `maxWidth` (e.g. `'100%'`): instead of the 720-cap
   *  single vertical stack (`innerContent`), renders a 3-column body row
   *  (wager | game-specific slot | TO WIN) plus a full-width footer/options
   *  band below it, so a wide panel reads as a real horizontal instrument
   *  band instead of one narrow centered column with dead margins either
   *  side. See RUG OR RICHES bet-entry column layout (2026-07-03). */
  columns?: boolean
  wagerLabel?: string
  /** The animated amount node (each game passes its own count-roll component). */
  wagerDisplay: ReactNode
  onStepDown: () => void
  onStepUp: () => void
  presets: readonly { label: string; value: bigint }[]
  /** Current wager, to light the matching chip. */
  activeWager: bigint
  onPreset: (value: bigint) => void
  /** Opt-in: suppress the wager stepper + preset-chip row entirely. DEFAULTS
   *  to false — every existing caller (Pulse / OO-Fisher / OO-Rei, and this
   *  game's own mobile bet-entry) renders byte-identical. Pass `true` ONLY
   *  when a sibling panel already owns the ONE canonical wager control and
   *  this console would otherwise duplicate it (RUG OR RICHES desktop
   *  control-column CTA panel — the wager already lives in the separate
   *  "INZET" panel beside it). The wager props above are still required/
   *  still passed by the caller (they keep driving that sibling panel); this
   *  flag only hides THIS render's own copy of the control. */
  hideWager?: boolean
  /** The clarity centrepiece — what the player is playing for. */
  toWin?: { label: string; value: string; sub?: string }
  /** Always-visible game-specific choices (world tabs, auto-cashout, gear …). */
  children?: ReactNode
  /** Advanced/optional controls, hidden behind the OPTIONS drawer. */
  options?: ReactNode
  optionsLabel?: string
  balanceLabel?: string
  /** Opt-in (2026-07-06) — when omitted, the footer balance block is not
   *  rendered at all (Rug or Riches mobile shows balance ONLY in the Z1
   *  topbar). Every other caller keeps passing it → byte-identical. */
  balanceValue?: string
  onCancel?: () => void
  cancelLabel?: string
  commitLabel: string
  onCommit: () => void
  commitDisabled?: boolean
  disabledLabel?: string
}

export function BetConsole({
  theme: t,
  eyebrow,
  hint,
  maxWidth = 460,
  columns = false,
  wagerLabel = 'YOUR BET',
  wagerDisplay,
  onStepDown,
  onStepUp,
  presets,
  activeWager,
  onPreset,
  hideWager = false,
  toWin,
  children,
  options,
  optionsLabel = 'OPTIONS',
  balanceLabel = 'BALANCE',
  balanceValue,
  onCancel,
  cancelLabel = 'cancel',
  commitLabel,
  onCommit,
  commitDisabled = false,
  disabledLabel,
}: BetConsoleProps): ReactNode {
  const [showOptions, setShowOptions] = useState(false)
  const s = makeStyles(t)
  // Additive override — every existing caller omits `maxWidth` so `s.panel`'s
  // own 460 default renders byte-identical; only a caller that explicitly
  // passes a wider value changes this.
  const isWidePanel = maxWidth !== 460
  const panelStyle: CSSProperties = isWidePanel ? { ...s.panel, maxWidth } : s.panel
  // When the SURFACE spans a wide board width, the interactive content
  // (wager window, chip row, mode slot, TO WIN, footer) stays capped at a
  // readable width and centers inside the wide plinth — otherwise a flex
  // column just stretches sparse blocks into a hollow gap (the banned
  // anti-pattern). 720 matches this exact content block's own established
  // width elsewhere in this game (the retired `overlayPanel` under-tray,
  // "needs room for the wager hero + chip rail + grid selector … in a
  // single horizontal band"). Default (460) case renders NO wrapper div at
  // all — `Fragment` — so the DOM/behaviour is untouched for every other
  // caller.
  const Wrap = isWidePanel ? 'div' : Fragment
  const wrapProps = isWidePanel ? { style: s.innerContent } : {}

  return (
    <div style={panelStyle} data-testid="bet-console">
      {/* Placard header — the panel announces itself as an order ticket. */}
      <div style={s.header}>
        <span style={s.eyebrow}>{eyebrow}</span>
        {hint && <span style={s.hint}>{hint}</span>}
      </div>

      {columns ? (
        <>
          {/* Wide-panel 3-column body row (2026-07-03) — wager | game-specific
              slot | TO WIN, side by side, so a full-width panel reads as one
              continuous instrument band instead of a narrow centered stack
              with dead margins either side. Only taken when a caller opts in
              via `columns`; every other caller keeps the single-stack `Wrap`
              path below untouched. */}
          <div style={s.columnsRow}>
            {!hideWager && (
              <div style={s.columnWager}>
                {/* Wager — the dominant number, in a recessed counter window. */}
                <div style={s.wagerBlock}>
                  <span style={s.sectionLabel}>{wagerLabel}</span>
                  <div style={s.wagerWindow}>
                    {/* WCAG 2.5.5 touch-target fix (2026-07-07) — see s.stepBtnHit
                        comment below for the hit-area-expansion rationale. */}
                    <button type="button" onClick={onStepDown} style={s.stepBtnHit} aria-label="Decrease bet">
                      <span style={s.stepBtn} aria-hidden="true">−</span>
                    </button>
                    <div style={s.wagerValue}>{wagerDisplay}</div>
                    <button type="button" onClick={onStepUp} style={s.stepBtnHit} aria-label="Increase bet">
                      <span style={s.stepBtn} aria-hidden="true">+</span>
                    </button>
                  </div>
                  <div style={s.chipRow}>
                    {presets.map((p) => {
                      const on = activeWager === p.value
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => onPreset(p.value)}
                          style={on ? s.chipOn : s.chip}
                          aria-pressed={on}
                        >
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            <div style={s.columnSlot}>
              {/* Game-specific choices (world select, auto-cashout, gear …). */}
              {children && <div style={s.slot}>{children}</div>}
              {/* TO WIN REGROUP (2026-07-03, VBG Finding #4) — the clarity line
                  used to live in its own 3rd column (`columnToWin`), where a
                  flex-column with no alignItems defaulted to `stretch` and
                  ballooned the pill to the full column width, reading as a
                  hollow floating card centered far-right. It's now a SIBLING
                  block under the world-pick cards inside the SAME column
                  (`columnSlot`, now the LAST column) — grouped under what it's
                  the payoff FOR, and `alignSelf:'flex-start'` on the element
                  itself (NOT on columnSlot, which must keep default stretch
                  for the world-card grid) keeps the pill content-sized. */}
              {toWin && (
                <div style={{ ...s.toWin, alignSelf: 'flex-start' }}>
                  <span style={s.toWinLabel}>{toWin.label}</span>
                  <span style={s.toWinValue}>{toWin.value}</span>
                  {toWin.sub && <span style={s.toWinSub}>{toWin.sub}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Progressive OPTIONS drawer — advanced controls stay out of the way.
              Full-width sibling below the column row, not a 4th column. */}
          {options && showOptions && <div style={s.optionsDrawer}>{options}</div>}

          {/* Footer — balance, optional OPTIONS toggle, cancel, and the ONE
              CTA. Full-width sibling — its existing space-between/flex-wrap
              now spreads BALANCE-left / SEND IT-right across the whole panel. */}
          <div style={s.footer}>
            {balanceValue && (
              <div style={s.balance}>
                <span style={s.balanceLabel}>{balanceLabel}</span>
                <span style={s.balanceValue}>{balanceValue}</span>
              </div>
            )}
            <div style={s.footerActions}>
              {options && (
                <button
                  type="button"
                  onClick={() => setShowOptions((v) => !v)}
                  style={showOptions ? s.optionsPillOn : s.optionsPill}
                  aria-expanded={showOptions}
                >
                  {optionsLabel} <span style={{ ...s.chevron, transform: showOptions ? 'rotate(180deg)' : 'none' }}>▾</span>
                </button>
              )}
              {onCancel && (
                <button type="button" onClick={onCancel} style={s.cancel}>
                  {cancelLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onCommit}
                disabled={commitDisabled}
                style={commitDisabled ? s.commitOff : s.commit}
              >
                {commitDisabled ? (disabledLabel ?? commitLabel) : commitLabel}
              </button>
            </div>
          </div>
        </>
      ) : (
        <Wrap {...wrapProps}>
          {/* Wager — the dominant number, in a recessed counter window.
              Suppressed entirely when `hideWager` (see prop doc above). */}
          {!hideWager && (
            <div style={s.wagerBlock}>
              <span style={s.sectionLabel}>{wagerLabel}</span>
              <div style={s.wagerWindow}>
                {/* WCAG 2.5.5 touch-target fix (2026-07-07) — see s.stepBtnHit
                    comment below for the hit-area-expansion rationale. */}
                <button type="button" onClick={onStepDown} style={s.stepBtnHit} aria-label="Decrease bet">
                  <span style={s.stepBtn} aria-hidden="true">−</span>
                </button>
                <div style={s.wagerValue}>{wagerDisplay}</div>
                <button type="button" onClick={onStepUp} style={s.stepBtnHit} aria-label="Increase bet">
                  <span style={s.stepBtn} aria-hidden="true">+</span>
                </button>
              </div>
              <div style={s.chipRow}>
                {presets.map((p) => {
                  const on = activeWager === p.value
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => onPreset(p.value)}
                      style={on ? s.chipOn : s.chip}
                      aria-pressed={on}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Game-specific choices (world select, auto-cashout, gear …). */}
          {children && <div style={s.slot}>{children}</div>}

          {/* TO WIN — the clarity line: what you're playing for, before you commit. */}
          {toWin && (
            <div style={s.toWin}>
              <span style={s.toWinLabel}>{toWin.label}</span>
              <span style={s.toWinValue}>{toWin.value}</span>
              {toWin.sub && <span style={s.toWinSub}>{toWin.sub}</span>}
            </div>
          )}

          {/* Progressive OPTIONS drawer — advanced controls stay out of the way. */}
          {options && showOptions && <div style={s.optionsDrawer}>{options}</div>}

          {/* Footer — balance, optional OPTIONS toggle, cancel, and the ONE CTA. */}
          <div style={s.footer}>
            {balanceValue && (
              <div style={s.balance}>
                <span style={s.balanceLabel}>{balanceLabel}</span>
                <span style={s.balanceValue}>{balanceValue}</span>
              </div>
            )}
            <div style={s.footerActions}>
              {options && (
                <button
                  type="button"
                  onClick={() => setShowOptions((v) => !v)}
                  style={showOptions ? s.optionsPillOn : s.optionsPill}
                  aria-expanded={showOptions}
                >
                  {optionsLabel} <span style={{ ...s.chevron, transform: showOptions ? 'rotate(180deg)' : 'none' }}>▾</span>
                </button>
              )}
              {onCancel && (
                <button type="button" onClick={onCancel} style={s.cancel}>
                  {cancelLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onCommit}
                disabled={commitDisabled}
                style={commitDisabled ? s.commitOff : s.commit}
              >
                {commitDisabled ? (disabledLabel ?? commitLabel) : commitLabel}
              </button>
            </div>
          </div>
        </Wrap>
      )}
    </div>
  )
}

function makeStyles(t: BetConsoleTheme): Record<string, CSSProperties> {
  const mono = t.fontMono
  return {
    // Opaque, seated instrument panel — top corners rounded, bottom flush.
    panel: {
      position: 'relative',
      width: '100%',
      maxWidth: 460,
      margin: '0 auto',
      // width includes the padding — without this the panel renders 32px
      // wider than a bounded sidebar and clips at the right edge.
      boxSizing: 'border-box',
      background: `linear-gradient(180deg, ${t.surfaceTop} 0%, ${t.surfaceBottom} 100%)`,
      borderTop: `1px solid ${t.trim}`,
      borderLeft: '1px solid rgba(255,255,255,0.05)',
      borderRight: '1px solid rgba(255,255,255,0.05)',
      borderBottom: 'none',
      borderRadius: `${t.radius}px ${t.radius}px 0 0`,
      padding: '14px 16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      boxShadow: `0 -12px 40px rgba(0,0,0,0.6), inset 0 1px 0 ${t.trimGlow}`,
      pointerEvents: 'auto',
      // WCAG touch-target fix (2026-07-07) — belt-and-braces alongside the
      // per-control touchAction below: the browser computes the EFFECTIVE
      // touch-action of a touched element as the intersection of its own
      // value and every ancestor's, so setting it here too guarantees no
      // double-tap-zoom / 300ms tap delay anywhere inside this panel even
      // for a future control that forgets to set it itself.
      touchAction: 'manipulation',
    },
    // Wide-panel-only wrapper (see `isWidePanel` above) — keeps the
    // interactive content block at a readable width, centered inside a wide
    // plinth. Never rendered for the default 460 caller (Fragment instead).
    innerContent: {
      width: '100%',
      maxWidth: 720,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    },
    // Wide-panel `columns` body row (2026-07-03) — only rendered when a
    // caller opts in via `columns`. Three flex-column wrappers around the
    // EXISTING wagerBlock/slot/toWin blocks (no duplicated content), divided
    // by the same borderLeft/paddingLeft idiom already proven elsewhere in
    // this game's 3-column bottom-bar (see VaultExperience Lobby/Playing/
    // Settled `isWide` columns).
    // gap:32 == vault's `VBG.gap` (VaultExperience.tsx) — this file cannot
    // import that shared const (BetConsole has no vault import), so the
    // literal is hardcoded here; keep it numerically identical if VBG ever
    // changes. This is what makes the BetEntry columns row match the
    // gutter width of the other 3 bottom-bar phases (2026-07-03 VBG pass).
    columnsRow: { display: 'flex', width: '100%', alignItems: 'stretch', gap: 32 },
    // VBG col1 — top-aligned (no justifyContent:'center'; `alignItems:
    // 'stretch'` on columnsRow keeps the divider full-height). Trailing
    // hairline == VBG.divider/dividerInset hardcoded (see columnsRow comment).
    columnWager: {
      display: 'flex',
      flexDirection: 'column',
      flex: '1 1 0%',
      minWidth: 0,
      borderRight: '1px solid rgba(255,255,255,0.07)', // == VBG.divider
      paddingRight: 16, // == VBG.dividerInset
    },
    // VBG col2 (LAST) — wager 1 | (world cards -> RUGS tuner -> TO WIN) 2.4.
    // TO WIN REGROUP (2026-07-03, Finding #4): the world-pick cards
    // (`children`/`s.slot`) and the TO WIN pill are now SIBLINGS inside this
    // one column (see the JSX below) instead of TO WIN owning its own 3rd
    // column — gap:12 seats them as a related group. This is now the LAST
    // column of the row, so it carries NO trailing border (VBG grammar:
    // only non-last columns get the divider). No justifyContent:'center'
    // (top-align); default `stretch` cross-axis is kept (NOT `alignItems`
    // here) so the world-card grid still fills the column width — the
    // TO WIN pill opts OUT of stretch individually via its own
    // `alignSelf:'flex-start'` (see JSX), not by fighting this column's
    // cross-axis default.
    columnSlot: {
      display: 'flex',
      flexDirection: 'column',
      flex: '2.4 1 0%',
      minWidth: 0,
      gap: 12,
    },
    header: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    eyebrow: { fontFamily: mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.24em', color: t.label },
    // WCAG AA fix (2026-07-06, jesse fresh-player comprehension gate,
    // task_category vault-splash-removal-followup): was fontSize 10 +
    // `t.textDim` (rgba white 0.40 for vault) = 3.73:1 composited contrast,
    // below the 4.5:1 body-text floor, while being the ONLY inline teaching
    // of the core loop on mobile bet-entry. Bumped to 12px (still normal,
    // not "large text", so still needs 4.5:1 — the size bump alone doesn't
    // fix contrast) and `t.hintColor ?? t.textDim` so a game can opt into a
    // brighter color without changing `textDim`'s other jobs. Safe to bump
    // globally: no existing caller (Pulse/OO-Fisher/OO-Rei) passes `hint` at
    // all today, so this is a zero-diff change for them and a WCAG-correct
    // default for any future adopter.
    hint: { fontFamily: mono, fontSize: 12, letterSpacing: '0.04em', color: t.hintColor ?? t.textDim },
    sectionLabel: { fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.24em', color: t.label },

    wagerBlock: { display: 'flex', flexDirection: 'column', gap: 8 },
    // Recessed counter window — reads as a machined display, not a form input.
    wagerWindow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '9px 12px',
      background: 'rgba(0,0,0,0.30)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10,
      boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.45)',
    },
    // WCAG 2.5.5 touch-target fix (2026-07-07, QA sweep fix #6 of 7) — the
    // stepper was a 34x34 button, below the >=44x44 AA-friendly minimum.
    // Ballooning the VISIBLE swatch to 44x44 would look like an oversized
    // blob around a tiny -/+ glyph, so instead the hit area is expanded via
    // a wrapper: `stepBtnHit` is the REAL <button> (44x44, invisible,
    // borderless) and this `stepBtn` style is now applied to an inner
    // <span> that renders the exact original 34x34 swatch centered inside
    // it — pixel-identical visual, desktop density preserved, only the
    // tappable region grows. `pointerEvents` stays default (auto isn't
    // needed — the span has no own listener, clicks bubble to the button).
    stepBtn: {
      width: 34,
      height: 34,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(255,255,255,0.05)',
      color: t.textPrimary,
      fontFamily: mono,
      fontSize: 20,
      lineHeight: '1',
    },
    // The real, invisible, 44x44 hit target (see comment above). Zero
    // padding/border/background of its own — box-sizing doesn't matter
    // here since there's no padding to conflict with the width/height.
    stepBtnHit: {
      width: 44,
      height: 44,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      margin: 0,
      background: 'transparent',
      border: 'none',
      cursor: 'pointer',
      touchAction: 'manipulation',
    },
    wagerValue: {
      flex: 1,
      textAlign: 'center',
      fontFamily: mono,
      fontSize: 26,
      fontWeight: 800,
      color: t.textPrimary,
      fontVariantNumeric: 'tabular-nums',
    },
    chipRow: { display: 'flex', gap: 6 },
    // WCAG 2.5.5 touch-target fix (2026-07-07) — was `padding:'7px 0'` only
    // (~28px tall). minHeight + border-box guarantees >=44px on the full
    // visible pill (unlike the icon-only stepper, the whole chip surface IS
    // its own affordance, so growing it reads as a normal touch-friendly
    // quick-bet chip, not "ballooned chrome"). flex centering keeps the
    // label centered in the taller box regardless of font metrics.
    chip: {
      flex: 1,
      minHeight: 44,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '7px 0',
      borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.10)',
      background: 'rgba(255,255,255,0.03)',
      color: t.textMuted,
      fontFamily: mono,
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      touchAction: 'manipulation',
    },
    chipOn: {
      flex: 1,
      minHeight: 44,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '7px 0',
      borderRadius: 8,
      border: `1px solid ${t.accentSoftBorder}`,
      background: t.accentSoftBg,
      color: t.accentText,
      fontFamily: mono,
      fontSize: 12,
      fontWeight: 800,
      cursor: 'pointer',
      touchAction: 'manipulation',
    },

    slot: { display: 'flex', flexDirection: 'column', gap: 8 },

    // The clarity line.
    toWin: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      padding: '9px 12px',
      borderRadius: 10,
      background: 'rgba(0,0,0,0.22)',
      border: '1px solid rgba(255,255,255,0.05)',
    },
    toWinLabel: { fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: t.textDim },
    toWinValue: { fontFamily: mono, fontSize: 15, fontWeight: 800, color: t.money, fontVariantNumeric: 'tabular-nums' },
    toWinSub: { marginLeft: 'auto', fontFamily: mono, fontSize: 11, color: t.textMuted },

    optionsDrawer: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 10,
      background: 'rgba(0,0,0,0.20)',
      border: '1px solid rgba(255,255,255,0.05)',
    },

    footer: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 2,
      // In a narrow sidebar the actions wrap onto their own full-width row
      // instead of squeezing the CTA off the edge.
      flexWrap: 'wrap',
    },
    balance: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 },
    balanceLabel: { fontFamily: mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', color: t.textDim },
    balanceValue: { fontFamily: mono, fontSize: 13, fontWeight: 700, color: t.money, fontVariantNumeric: 'tabular-nums' },
    footerActions: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flex: '1 1 auto',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
    },
    // WCAG 2.5.5 touch-target fix (2026-07-07) — was ~28px tall (padding
    // '8px 12px' + 10px text). minHeight + border-box brings the full pill
    // to >=44px; existing `alignItems:'center'` re-centers the label/chevron
    // in the taller box, so this is a height-only change (width was already
    // comfortably >44px from the label + padding).
    optionsPill: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 44,
      boxSizing: 'border-box',
      padding: '8px 12px',
      borderRadius: 999,
      border: '1px solid rgba(255,255,255,0.10)',
      background: 'rgba(255,255,255,0.05)',
      color: t.textMuted,
      fontFamily: mono,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.12em',
      cursor: 'pointer',
      touchAction: 'manipulation',
    },
    optionsPillOn: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 44,
      boxSizing: 'border-box',
      padding: '8px 12px',
      borderRadius: 999,
      border: `1px solid ${t.accentSoftBorder}`,
      background: t.accentSoftBg,
      color: t.money,
      fontFamily: mono,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.12em',
      cursor: 'pointer',
      touchAction: 'manipulation',
    },
    chevron: { display: 'inline-block', fontSize: 9, transition: 'transform 200ms ease' },
    // WCAG 2.5.5 touch-target fix (2026-07-07) — was ~29px tall. This
    // control has NO background/border of its own (`transparent`/`none`),
    // so growing its box to 44px is a PURE hit-area expansion with zero
    // visible change — the ideal case the fix brief calls for.
    cancel: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      boxSizing: 'border-box',
      background: 'transparent',
      border: 'none',
      color: t.textDim,
      fontFamily: mono,
      fontSize: 11,
      letterSpacing: '0.06em',
      cursor: 'pointer',
      padding: '8px 6px',
      touchAction: 'manipulation',
    },
    // The ONE full-accent element on the panel.
    // WCAG 2.5.5 touch-target fix (2026-07-07) — was ~43px tall (borderline
    // under the 44px floor); minHeight+border-box guarantees the floor is
    // met with a negligible (<1px) visual change.
    commit: {
      flex: 1,
      minWidth: 150,
      minHeight: 44,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '13px 18px',
      borderRadius: 10,
      border: 'none',
      background: t.accentSolid,
      color: t.accentInk,
      fontFamily: mono,
      fontSize: 14,
      fontWeight: 800,
      letterSpacing: '0.06em',
      cursor: 'pointer',
      boxShadow: `0 0 16px ${t.accentSoftBg}`,
      touchAction: 'manipulation',
    },
    commitOff: {
      flex: 1,
      minWidth: 150,
      minHeight: 44,
      boxSizing: 'border-box',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '13px 18px',
      borderRadius: 10,
      border: '1px solid rgba(255,255,255,0.10)',
      background: 'rgba(255,255,255,0.04)',
      color: t.textDim,
      fontFamily: mono,
      fontSize: 14,
      fontWeight: 700,
      letterSpacing: '0.06em',
      cursor: 'not-allowed',
      touchAction: 'manipulation',
    },
  }
}

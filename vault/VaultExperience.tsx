'use client'

/**
 * VaultExperience — the player surface for Vault.
 *
 * RG-C STRUCTURAL ENFORCEMENT AUDIT (VAULT-CRAFT-SPEC.md §17):
 * ------------------------------------------------------------
 * RG-C3 (no near-miss amplification):
 *   • `MineHitOverlay` props ONLY accept `mineTileIdx` + `revealedTiles`.
 *     There is no `wouldHaveBeenSafe` field on this component — the type
 *     system structurally forbids the leak.
 *   • The Settlement Glass Box receipt displays the mine bitmap as a COUNT
 *     ("X mines hidden in the cleared portion"), never as a tile-by-tile
 *     counterfactual layout.
 *   • The render of the `mine-hit` and `settled` (loss) phases shows ONLY
 *     the mine tile + the player's reveal trace. The canvas's render
 *     contract has no symbol for `drawHiddenSafeTile`.
 *
 * RG-C5 (no frequency-scaled fanfare): audio fns in vaultAudio.ts accept
 *   NO streak parameter. The brand watermark pulse magnitude is a constant.
 *
 * RG-C6 (cash-out always reachable): the cash-out button lives in the
 *   `actionBar` during ALL `playing` frames. It is sized large,
 *   bottom-right of the action bar (player's read-direction exit). The
 *   action bar seats in-flow inside the cabinet's bounded `controlPanel`
 *   (below the board — nothing floats over the canvas); the layout is
 *   invariant across the `playing` phase.
 *
 * RG-C8 (safety tools surface): the auto-pick toggle is rendered in
 *   bet-entry today, disabled with a TUNE marker. The visible surface
 *   shows the max-session-loss field + cool-off threshold + the 60s
 *   mandatory pause promise + the 1.5s inter-round delay promise. The
 *   safety surface ships now even when the feature ships dark.
 *
 * Brand register: degen-crypto, funny-but-honest. Explainer copy: "APE IN.
 * DODGE THE RUG." / "crack open the vault's compartments to pump your
 * multiplier." LOBBY-SPLASH REMOVAL (2026-07-06): there is no separate lobby
 * screen any more — the game lands directly on bet-entry ("PICK YOUR
 * WORLD"), and this explainer is relocated into the bet-entry surface itself
 * (mobile: BetConsole's eyebrow/hint slot; desktop: a compact intro row atop
 * the control column's world-picker — see `BetEntryControlColumn`). The
 * story everywhere: sealed vault compartments you crack open — coins pump,
 * rugs end it. No escalating tone, no chase pressure.
 *
 * Domain C: presentation only.
 */
import {
  type CSSProperties,
  type ReactElement,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSwoobzAudio } from '../_shared/audio'
import { BetConsole, type BetConsoleTheme } from '../_shared/BetConsole/BetConsole'
import { HelpButton, OnboardingOverlay, useOnboardingState } from '../_shared/onboarding'
import { vaultOnboarding } from '../_shared/onboarding/games/vault-onboarding'
import { VaultGridCanvas, getModeBackdrop } from './VaultGridCanvas'
import { AUDIO_MANIFEST, playTumblerClick } from './vaultAudio'
import {
  evaluateRhythmTick,
  type RhythmTick,
  rhythmBadgeLabel,
  degenRugNudge,
  settlementEyebrow,
  settlementNarrative,
  targetLockNarrative,
} from './vaultCopy'
import {
  AUTOPICK_COOLOFF_DEFAULT,
  DEFAULT_GRID_SIZE,
  DEFAULT_MINE_COUNT,
  formatMultiplier,
  formatPoints,
  formatUsdc,
  MIN_WAGER_LAMPORTS_DEFAULT,
  modeParams,
  multiplierAfterSafeTiles,
  ONE_X_BPS,
  pointsForBet,
  settlePayout,
  type VaultMode,
} from './vaultMath'
import {
  MAX_HISTORY,
  useVaultController,
  type VaultController,
  type VaultHistoryRow,
  type VaultOutcome,
  type VaultPhase,
} from './vaultProvider'
import { vaultLedger, type ModeBest } from './vaultLedger'

const T = {
  fontMono: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
  fontBody: 'var(--font-family-body, "Geist", system-ui, sans-serif)',
  bgCanvas: '#03070d',
  bgSurface: '#050b13',
  bgRaised: '#08111a',
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderDefault: 'rgba(255, 255, 255, 0.12)',
  textPrimary: '#f4f6fa',
  textMuted: 'rgba(255, 255, 255, 0.62)',
  textDim: 'rgba(255, 255, 255, 0.40)',
  // RUG OR RICHES drops cyan for a candle-chart accent economy (brand call,
  // RUG-OR-RICHES-THEME-BIBLE §brand-register). Green = pump/active, gold =
  // bag/reward, red = rug/loss. No cyan in any UI/control surface. ONE
  // documented exception: the ALTSEASON world backdrop's volt-electric
  // atmosphere (its world identity, per the taste-guardian altseason brief) —
  // scenery only, never a control or readout colour.
  accent: '#22D37D', // readable pump green for text
  accentSolid: '#00E676', // button / chip fill
  accentMuted: 'rgba(0, 230, 118, 0.32)',
  accentInk: '#04130b', // dark ink on green fill
  bag: '#FFC53D', // gold — the bag / reward accent
  danger: '#FF4D4D', // rug red
}

// Vault skin for the shared BetConsole — brushed steel + gold instrument trim
// (ties to the vault gold-bar walls) + the single pump-green commit CTA.
const vaultBetTheme: BetConsoleTheme = {
  fontMono: T.fontMono,
  fontBody: T.fontBody,
  surfaceTop: '#1B2330',
  surfaceBottom: '#090F18',
  trim: 'rgba(255, 197, 61, 0.32)',
  trimGlow: 'rgba(255, 197, 61, 0.10)',
  label: 'rgba(255, 197, 61, 0.82)',
  textPrimary: T.textPrimary,
  textMuted: T.textMuted,
  textDim: T.textDim,
  // WCAG AA fix (2026-07-06) — the mobile BetConsole `hint` line is the
  // ONLY inline teaching of the rug/cash-out loop for a fresh player since
  // the lobby splash was removed; `textDim` (0.40 opacity) measured 3.73:1,
  // below AA. `textMuted` (0.62 opacity, an existing vetted vault token
  // already used for other body copy in this game) composites to ~6.9:1
  // against the console's lightest panel stop (`surfaceTop` #1B2330, the
  // worst-case position since the header sits near the top of the
  // gradient) — comfortably clears 4.5:1 with margin. Scoped to this one
  // slot via `hintColor` (see BetConsoleTheme) rather than raising
  // `textDim` itself, which stays 0.40 for the console's other genuinely-
  // secondary labels (`toWinLabel`/`balanceLabel`) unaffected by this fix.
  hintColor: T.textMuted,
  accentSolid: T.accentSolid,
  accentInk: T.accentInk,
  accentSoftBg: 'rgba(0, 230, 118, 0.12)',
  accentSoftBorder: 'rgba(0, 230, 118, 0.38)',
  accentText: T.accent,
  money: T.bag,
  danger: T.danger,
  radius: 12,
}

// VAULT BOTTOM-BAR GRAMMAR (VBG) — the ONE shared composition system every
// isWide bottom-bar phase (Lobby / Playing / Settled) + the BetEntry
// BetConsole `columns` branch draws from, so the four phases read as ONE
// instrument, not four ad-hoc layouts (2026-07-03 definitive composition
// pass). barPadding/gap are the outer row's padding + inter-column gutter;
// divider is the hairline drawn on the TRAILING edge of every non-last
// column; dividerInset (= gap / 2) is the padding that centers that
// hairline inside the gutter. BetConsole.tsx CANNOT import this (shared
// file, no vault import) — it hardcodes the identical literals with a
// comment cross-referencing VBG.
const VBG = {
  barPadding: '22px 32px 26px',
  gap: 32,
  divider: '1px solid rgba(255,255,255,0.07)',
  dividerInset: 16, // = gap / 2, hairline centered in the gutter
} as const

// CHROME — opaque corner icons, a DISTINCT register from the transparent
// GLASS gutter cards. Reuses the proven VaultBoardRebet steel-blue + gold-
// rivet material (NOT a new flat casino-button look) — thin-line glyphs
// only (1.5-2px stroke, never filled).
const CHROME = {
  size: 36,
  edgeOffset: 16,
  stackGap: 8,
  background: 'linear-gradient(180deg, rgb(27,35,48) 0%, rgb(9,15,24) 100%)',
  border: '1px solid rgba(255,197,61,0.32)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 20px rgba(0,0,0,0.45)',
  zIndex: 6,
} as const

// ═══════════════════════════════════════════════════════════════════════════
// GUTTER-CARD SYSTEM (restored 2026-07-05, revert of the 2026-07-05 CSS-grid
// chassis refactor — reconstructed from documentation/run-logs, see
// VAULT-REVERT-SPEC.md) — the desktop (isWide) cabinet is a VERTICAL FLEX
// COLUMN; these are `position:absolute` sibling cards mounted INSIDE
// `vault-canvas-shell`, anchored off the board's own LIVE-MEASURED edges
// (VaultGridCanvas's `onBoardLayout`) rather than the shell's static edge —
// this is what keeps the gutter cards a constant ~32px off the actual grid
// tiles on every viewport instead of drifting/overlapping at a crossover
// width. Mobile (<960, `!isWide`) never mounts any of this — the stacked
// PhaseSurface panel below the board is untouched.
// ─────────────────────────────────────────────────────────────────────────

// VAULT-PLATE — the ONE opaque control-column card material (2026-07-06,
// unified-plate-material fix). Root cause (taste-guardian + end-to-end-
// cohesion-reviewer, converged): once the per-world backdrop photo went
// full-bleed behind the whole shell, GLASS's translucent fill + 14px blur +
// a 30px black drop-halo + a 26px black inset vignette stopped reading as
// "glass over art" and started reading as a disconnected BLACK RECTANGLE
// stamped on the scene ("je ziet de zwarte randen van elke paneel"). This
// is the OPPOSITE of reopening transparency — every plate is now FULLY
// OPAQUE (reuses the exact steel gradient `actionBar`/`settledPanel` already
// use — one fill, no new hue), the halo is replaced by a TIGHT contact
// shadow, and the 4 competing border recipes (worldCard white / GLASS gold
// 0.16 / GLASS_CTA gold 0.24 / CHROME-actionBar gold 0.32) collapse to ONE
// muted-gold hairline. `--vault-plate-highlight` is a CSS custom property
// set once per render on the shell root (`pageStyle`, from the active
// world's own `MODE_CARDS[...].accent`) so every plate's inset top
// highlight picks up a faint (~7-10%) wash of its own world's ambient light
// without prop-drilling `state.mode` through every card call site — falls
// back to a neutral white hairline before the first paint sets the var.
const VAULT_PLATE_FILL = 'linear-gradient(180deg, #1B2330 0%, #090F18 100%)'
const VAULT_PLATE_BORDER = 'rgba(255,197,61,0.26)' // outer-tier hairline (0.24-0.28 band); STATE (selected) keeps its own brighter per-world accent, untouched
const VAULT_PLATE_RADIUS = 12
const VAULT_PLATE_SHADOW =
  'inset 0 1px 0 var(--vault-plate-highlight, rgba(255,255,255,0.07)), inset 0 -1px 0 rgba(0,0,0,0.32), 0 3px 8px rgba(0,0,0,0.30)'
// RUGS-STEPPER CONTRAST FIX (2026-07-06, WCAG re-audit) — `rugsTuner` sat on
// the shared `VAULT_PLATE_FILL` gradient's LIGHTER top stop (#1B2330), which
// dropped every metric in that row 5-10% below its hard-won floor (label
// 7.58->7.19, unit 7.64->6.86, per-tap hint 9.39->8.43, stepValue 17.07->
// 15.32, step-button border 4.57->4.11). A dedicated flat, fully-opaque
// near-black fill — one shade darker than the gradient's own #090F18 dark
// stop, same blue-black steel family, no new hue — restores headroom on
// every one of those five metrics without touching the shared border/
// radius/shadow any other plate uses (only THIS one row's fill deviates).
const RUGS_TUNER_FILL = '#060A11'

// SCENE EDGE-SCRIM (rugsui fix-spec §1, 2026-07-06) — the shell-wide
// `sceneBackdropLayer` photo wash (see below) is a UNIFORM per-world alpha
// over the whole art; once panels went full-bleed transparent-over-art there
// was nothing guaranteeing contrast specifically under the busy edges (gold
// bars, coin piles) where the control column + topbar/statusbar text sit.
// This is a SECOND, edge-focused layer painted on top of that wash: darkens
// the left edge + the control-column side + both horizontal edges while
// leaving the 18-60% MIDDLE band clear so the board keeps full art contrast
// (spec: "the board owns the light"). Values map 1:1 to the fix-spec's
// literal stops/alphas — only the near-black hex is swapped for the
// existing vault dark-canvas token (`T.bgCanvas` #03070d, already the base
// of every other scrim wash in this file) instead of the mockup's raw
// rgba(12,17,14,*), per the "reuse the existing brand near-black" rule.
const VAULT_SCRIM_EDGE_H =
  'linear-gradient(90deg, rgba(3,7,13,0.55) 0%, rgba(3,7,13,0) 18%, rgba(3,7,13,0) 60%, rgba(3,7,13,0.88) 78%, rgba(3,7,13,0.95) 100%)'
// Bottom fade (70px tall) — guarantees contrast under the statusbar zone.
// `T.bgCanvas`-based, transparent -> 90% per spec.
const VAULT_SCRIM_BOTTOM = 'linear-gradient(180deg, rgba(3,7,13,0), rgba(3,7,13,0.9))'

// GLASS — every gutter card (`gutterCard`/`gutterCardCta` build from this),
// the BetEntry "HOW IT WORKS" chip, etc. Opaque VAULT-PLATE fill, no blur.
const GLASS = {
  background: VAULT_PLATE_FILL,
  border: `1px solid ${VAULT_PLATE_BORDER}`,
  borderRadius: VAULT_PLATE_RADIUS,
  boxShadow: VAULT_PLATE_SHADOW,
} as const

// GLASS_CTA — a denser fork of GLASS for the card holding the PRIMARY
// action (ape in / send it / bet again). SAME opaque family + SAME border/
// radius/shadow (gold intensity is reserved for STATE, not for "is this the
// CTA card") — the only difference is a slightly lighter top stop so the
// primary-action card still reads as a distinguishable sibling. The action
// BUTTON inside always uses the opaque commitButton/primaryButton/
// settledBetAgain style as the legibility floor — never a glass button.
const GLASS_CTA = {
  ...GLASS,
  background: 'linear-gradient(180deg, #212B3C 0%, #0D131C 100%)',
} as const

// GUTTER — the base anchor token for the session-pulse / settled-receipt
// cards (Lobby/Playing/Settled), seated low enough to clear the corner-
// chrome help icon at the shortest shell height (1440x900) while still
// clearing the ingot-band-start fraction at the tallest required shell
// (1920x1080) — see run-20260703T113802Z-game-art-director.md for the
// original topOffset:80->400 derivation. DO NOT move topOffset — taste-locked.
const GUTTER = { edgeOffset: 20, topOffset: 400, maxWidth: 200, zIndex: 4 } as const

// BETENTRY_GUTTER — the near-top anchor token, originally forked for the
// BetEntry console cards and later reused verbatim (same 72/260 pair) for
// every phase's own near-top hero/status/actions/result group (Lobby,
// Playing, Settled) — see run-20260703T124223Z-game-art-director.md +
// run-20260703T131213Z-game-designer.md. `interCardGap` is the vertical
// gap between stacked cards in one gutter stack.
const BETENTRY_GUTTER = { edgeOffset: 20, topOffset: 72, maxWidth: 260, zIndex: 4, interCardGap: 12 } as const

// BETENTRY_PANEL_GAP — the single board-edge anchor gap shared by BOTH the
// @72 (BETENTRY_GUTTER) and @400 (GUTTER) stacks (confirmed identical, ~32px,
// by the 2026-07-04 FIX-A board-anchor generalization pass) — the fixed
// distance kept between a gutter stack's near edge and the board's own
// LIVE-MEASURED edge (VaultGridCanvas's onBoardLayout), on every viewport.
const BETENTRY_PANEL_GAP = 32

// BETENTRY_RIGHTCOL_GAP_COMPACT — the tighter inter-card gap used ONLY by
// BetEntry's consolidated right column (PICK YOUR WORLD -> YOUR BET ->
// SEND IT, all 3 cards in one stack) so the 3-card column fits comfortably
// under the board at every viewport (vault-betentry-rightcol-migration).
const BETENTRY_RIGHTCOL_GAP_COMPACT = 8

// ═══════════════════════════════════════════════════════════════════════════
// FIXED 5-ZONE CSS-GRID CHASSIS (2026-07-06, round 2 — the previous
// 2026-07-05 grid chassis was fully deleted after 2 jesse blockers: a
// duplicate bet stepper in BetEntry, and the SEND IT CTA landing below the
// fold because the right column had to MATCH the board's height via a
// floating anchored card. This rebuild is a REAL CSS Grid (not absolute
// overlay cards): TOPBAR (56px) / HUD-ZONE (72px, board-width, sits directly
// above the board) / BOARD (auto-height, sized by VaultGridCanvas's own
// `boardHeightCss`) / CONTROL COLUMN (320px, spans the HUD+BOARD rows so it
// gets the SAME generous vertical budget the board gets — this is what keeps
// the CTA off the floor) / STATUSBAR (40px). Desktop-only (`isWide`) — the
// mobile stacked chassis (`PhaseSurface`) is completely untouched.
// ─────────────────────────────────────────────────────────────────────────
const GRID_CTRL_WIDTH = 320
const GRID_TOPBAR_H = 56
// HUD-ZONE fixed height — the layout-spec / README Z2 single fixed band (64px)
// held IDENTICAL across Ready/Live/Result so the board Y never shifts between
// phases (hard guardrail 5). Ready's 32px content is vertically centered in it.
const GRID_HUD_H = 64
const GRID_STATUS_H = 40
// Spacing scale (8 / 12 / 16 / 24). GRID_GAP = the outer 4-row grid's
// row-gap (topbar/hud/board/status) — board-Y is recomputed from this value
// (see the vh-budget comment below), so it stays load-bearing/untouched.
// GRID_GUTTER = the board↔control-column gutter (24).
const GRID_GAP = 12
// CONTROL_COL_CARD_GAP — the vertical rhythm BETWEEN the stacked cards
// inside the 320px control column only (2026-07-06, unified-plate-material
// fix, gap-rhythm item). Deliberately its OWN token, decoupled from
// `GRID_GAP` above: `GRID_GAP` also drives the outer grid's row-gap (which
// the board-Y vh-budget math depends on), so reusing it here would risk
// shifting board-Y. This only tightens `desktopGridControl`'s own `gap`
// (12 -> 10) so the now-visible backdrop gaps between cards read as one
// intentional console rhythm, not ragged spacing — a pure decrease, so the
// column only gets SHORTER, never pushing the CTA further down.
const CONTROL_COL_CARD_GAP = 10
const GRID_GUTTER = 24

/** Board-edge-relative layout fed up from VaultGridCanvas's onBoardLayout. */
interface VaultBoardLayoutState {
  boardPanelLeftX: number
  boardPanelRightX: number
  boardShellWidth: number
  boardShellHeight: number
  gridTile: number
  gridGap: number
}

/**
 * Anchors a LEFT-gutter stack's `right` edge `BETENTRY_PANEL_GAP` px outside
 * the board's own live-measured LEFT edge (so the stack hugs the board
 * regardless of the stack's own rendered width) — generalized (2026-07-04
 * FIX-A) so every left stack (base GUTTER @400 or BETENTRY_GUTTER @72) uses
 * the SAME mechanism; `baseStyle` carries `top`/`position`/`gap` etc, this
 * fn only overrides `right`/`maxWidth`. Falls back to the fixed
 * GUTTER.edgeOffset before the first live measurement arrives (initial
 * paint), matching the pre-anchor system's static edge as a safe default.
 */
function gutterBoardAnchorLeftStyle(
  boardLayout: VaultBoardLayoutState | null,
  baseStyle: CSSProperties,
  maxWidthCap: number,
): CSSProperties {
  if (!boardLayout) {
    return { ...baseStyle, right: GUTTER.edgeOffset, maxWidth: maxWidthCap }
  }
  const right = Math.max(
    GUTTER.edgeOffset,
    boardLayout.boardShellWidth - boardLayout.boardPanelLeftX + BETENTRY_PANEL_GAP,
  )
  return { ...baseStyle, right, maxWidth: maxWidthCap }
}

/** RIGHT-gutter twin of `gutterBoardAnchorLeftStyle` — see its header comment. */
function gutterBoardAnchorRightStyle(
  boardLayout: VaultBoardLayoutState | null,
  baseStyle: CSSProperties,
  maxWidthCap: number,
): CSSProperties {
  if (!boardLayout) {
    return { ...baseStyle, left: GUTTER.edgeOffset, maxWidth: maxWidthCap }
  }
  const left = boardLayout.boardPanelRightX + BETENTRY_PANEL_GAP
  return { ...baseStyle, left, maxWidth: maxWidthCap }
}

// Designed hero sprite for the loss "moment to live" (the rug-pull).
const RUG_HERO_IMG = '/assets/generated/rug-or-riches/tile-rug.png'

const WAGER_PRESETS: readonly { label: string; value: bigint }[] = [
  { label: '1', value: 1_000_000n },
  { label: '5', value: 5_000_000n },
  { label: '10', value: 10_000_000n },
  { label: '25', value: 25_000_000n },
  { label: '50', value: 50_000_000n },
]

// ─── Wager stepper (identical pattern to Pulse + OO-Fisher) ───────────────────
// Adaptive step so the −/+ buttons feel right across the whole range, and a
// smooth count-roll on the value. Module-const (RG-C5 safe).
function wagerStepLamports(w: bigint): bigint {
  const usd = w / 1_000_000n
  if (w < 1_000_000n) return 100_000n // < 1 USDC   → 0.10
  if (usd < 5n) return 250_000n // < 5 USDC   → 0.25
  if (usd < 10n) return 500_000n // < 10 USDC  → 0.50
  if (usd < 25n) return 1_000_000n // < 25 USDC  → 1
  if (usd < 50n) return 2_500_000n // < 50 USDC  → 2.50
  if (usd < 100n) return 5_000_000n // < 100 USDC → 5
  if (usd < 250n) return 10_000_000n // < 250 USDC → 10
  return 25_000_000n // ≥ 250 USDC → 25
}
function stepWagerUp(w: bigint): bigint {
  const step = wagerStepLamports(w)
  return (w / step + 1n) * step
}
function stepWagerDown(w: bigint): bigint {
  const step = wagerStepLamports(w)
  const base = (w / step) * step
  return w % step === 0n ? base - step : base // setWager clamps to MIN
}

const AMOUNT_ROLL_MS = 260

/** A USDC amount that eases to its new value when `lamports` changes. Snaps
 *  instantly under prefers-reduced-motion. */
function AnimatedUsdc({
  lamports,
  style,
}: {
  readonly lamports: bigint
  readonly style?: CSSProperties
}): ReactElement {
  const target = Number(lamports) / 1_000_000
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = displayRef.current
    const to = target
    if (reduce || Math.abs(to - from) < 0.005) {
      displayRef.current = to
      setDisplay(to)
      return
    }
    let raf = 0
    const start = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / AMOUNT_ROLL_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      const val = from + (to - from) * eased
      displayRef.current = val
      setDisplay(val)
      if (t < 1) raf = requestAnimationFrame(step)
      else {
        displayRef.current = to
        setDisplay(to)
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return (
    <span style={style}>
      {display.toFixed(2)} <span style={{ opacity: 0.6 }}>USDC</span>
    </span>
  )
}

// Session baseline — hoisted to module scope so both the header SessionMeta
// chip AND the sidebar SidebarPulseStrip fill-module (Part 2/3 of the panel-
// hollowness fix) compute the identical figure from the identical constant.
const SESSION_START_LAMPORTS = 1_000_000_000n

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent): void => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

export function VaultExperience(): ReactElement {
  const controller = useVaultController()
  const reducedMotion = useReducedMotion()
  const { state } = controller
  const onboarding = useOnboardingState(vaultOnboarding.gameId)
  // Kenney CC0 sample manifest; WebAudio synthesis fallback in vaultAudio.ts.
  useSwoobzAudio(AUDIO_MANIFEST)

  // ── Rhythm tracking (perfect-tumbler visual celebration) ─────────────────
  // RG-C5 STRUCTURAL: rhythm state is PURELY COSMETIC. The on-chain math
  // (cumulativeMultiplierBps) is unchanged. The rhythm badge surfaces only
  // when the player taps in tempo AND the cumulative bps clears the
  // economic-stake floor in `vaultCopy.evaluateRhythmTick`. Inputs are
  // timestamps + an economic value (cumulative bps); no session-rounds, no
  // per-tile escalation by index. The 'rhythm' vs 'perfect' tier is decided
  // purely by the within-round in-rhythm CHAIN LENGTH (chain 3-4 = 'rhythm',
  // chain >= 5 = 'perfect'); the cumulative multiplier value only gates
  // whether any badge shows at all (RHYTHM_MIN_CUMULATIVE_BPS floor), it no
  // longer selects the tier. Chain resets to 1 every round; the math itself
  // never ramps with rhythm.
  const lastSafeRevealAtRef = useRef<number>(0)
  const rhythmChainRef = useRef<number>(0)
  const lastRevealedCountRef = useRef<number>(0)
  const [rhythmTick, setRhythmTick] = useState<RhythmTick>({ chain: 0, badge: null })
  // Self-contained HOW-TO overlay (the shared onboarding shim is a no-op in this
  // export, so the "?" opens this instead — jesse fix: nothing explained the
  // meta systems). Covers the loop, gauge, play styles, points, MOON.
  const [showInfo, setShowInfo] = useState(false)

  // Desktop split-panel (Stake-Mines pattern): on wide viewports the control
  // panel seats as a RIGHT SIDEBAR beside the board instead of below it —
  // otherwise the board floats tiny in a huge void and the controls stretch
  // absurdly wide (the exact "doesn't come together" desktop failure).
  const [isWide, setIsWide] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 960,
  )
  useEffect(() => {
    const onResize = (): void => setIsWide(window.innerWidth >= 960)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // GUTTER-CARD SYSTEM (restored 2026-07-05): the desktop chassis is a
  // vertical flex column; the gutter cards are `position:absolute` siblings
  // of the board mounted inside `vault-canvas-shell`, board-edge-anchored via
  // `boardLayout` — fed live by VaultGridCanvas's `onBoardLayout` callback
  // (the grid panel's own measured left/right edges + the shell's own
  // width/height). `boardShellRef` stays a plain ref on the canvas-shell div.
  const boardShellRef = useRef<HTMLDivElement>(null)
  const [boardLayout, setBoardLayout] = useState<VaultBoardLayoutState | null>(null)
  // Auto-dismiss the rhythm badge after a short window so it never lingers
  // into the next round / cash-out screen. Module-const window — RG-C5.
  const RHYTHM_BADGE_VISIBLE_MS = 1_400
  useEffect(() => {
    if (rhythmTick.badge === null) return
    const t = setTimeout(() => setRhythmTick({ chain: 0, badge: null }), RHYTHM_BADGE_VISIBLE_MS)
    return () => clearTimeout(t)
  }, [rhythmTick])

  // Reset rhythm state on round restart (bet-entry phase).
  useEffect(() => {
    if (state.phase.kind === 'bet-entry') {
      lastSafeRevealAtRef.current = 0
      rhythmChainRef.current = 0
      lastRevealedCountRef.current = 0
      setRhythmTick({ chain: 0, badge: null })
    }
  }, [state.phase.kind])

  // ── Personal-best ledger (ITEM 1) ─────────────────────────────────────────
  // Fold each SETTLED outcome into the per-world localStorage ledger exactly
  // once. Dedup keyed on the round-id hex (unique per round) so React
  // StrictMode's double-invoke can't double-count. RG-C5: the ledger only
  // RECORDS the outcome; it feeds no animation timing/amplitude and is
  // surfaced ONLY on the mode-select screen (never during play / settlement).
  const lastRecordedRoundRef = useRef<string | null>(null)
  useEffect(() => {
    if (state.phase.kind !== 'settled') return
    const outcome = state.phase.outcome
    if (lastRecordedRoundRef.current === outcome.roundIdHex) return
    lastRecordedRoundRef.current = outcome.roundIdHex
    vaultLedger.update(outcome)
  }, [state.phase])

  // Observe reveal-trace growth, evaluate the rhythm tick. The provider
  // already gates safe reveals (mines never enter `revealedTiles`); the
  // experience layer reads the trace length and the cumulative bps to
  // surface the cosmetic badge. The on-chain math is untouched.
  useEffect(() => {
    if (state.phase.kind !== 'playing') return
    const revealed = state.revealedTiles.length
    if (revealed <= lastRevealedCountRef.current) {
      lastRevealedCountRef.current = revealed
      return
    }
    lastRevealedCountRef.current = revealed
    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
    const tick = evaluateRhythmTick(
      lastSafeRevealAtRef.current,
      now,
      rhythmChainRef.current,
      state.cumulativeMultiplierBps,
    )
    rhythmChainRef.current = tick.chain
    lastSafeRevealAtRef.current = now
    if (tick.badge !== null) {
      // Higher cosmetic celebration for the 'perfect' tier. Both branches
      // are zero-param, identical envelope per tier — RG-C5 safe.
      playTumblerClick()
      setRhythmTick(tick)
    }
  }, [state.revealedTiles, state.cumulativeMultiplierBps, state.phase.kind])

  const phaseLabel = useMemo(() => {
    switch (state.phase.kind) {
      case 'bet-entry':
        return 'BET ENTRY'
      case 'playing':
        return 'PUMPING'
      case 'mine-hit':
        return 'RUGGED'
      case 'settling':
        return 'SETTLING'
      case 'settled':
        return state.phase.outcome.won ? 'SETTLED · WIN' : 'SETTLED · LOSS'
    }
  }, [state.phase])

  const roundIdLabel = `R${String(state.history.length + 1).padStart(4, '0')}`
  const sessionDelta = state.balanceLamports - SESSION_START_LAMPORTS
  const sessionRounds = state.history.length

  const centeredCardPhase = state.phase.kind === 'bet-entry'
  // FIX #2 (2026-07-07 mobile HUD/board overlap) — `roundLive` hoisted to
  // this scope (previously only computed locally inside `DesktopChassis`)
  // so the mobile branch can gate its own new HUD band + the shared
  // `domHudActive` prop on the same three "round is live" phases.
  const roundLive =
    state.phase.kind === 'playing' || state.phase.kind === 'mine-hit' || state.phase.kind === 'settling'
  const bottomBarPhase = roundLive || state.phase.kind === 'settled'

  // For the canvas. RG-C3: only revealedTiles + (single) mineHitTileIdx
  // travel to the canvas. The full bitmap never goes.
  const mineHitTileIdx =
    state.phase.kind === 'mine-hit'
      ? state.phase.mineTileIdx
      : state.phase.kind === 'settled' && state.phase.outcome.mineTileIdx !== null
        ? state.phase.outcome.mineTileIdx
        : null

  const totalTiles = state.gridSize * state.gridSize
  // SAFE tiles remaining (excludes the rugs) — "tiles left" used to count the
  // rugs too, hiding how much safe ground was actually left (jesse fix).
  const safeLeft = Math.max(0, totalTiles - state.mineCount - state.revealedTiles.length)

  // ── Shared BET AGAIN handler + guard (RG-C5 anti-drift) ──────────────────
  // ONE closure + ONE boolean, used by the settled control column's BET
  // AGAIN (mobile `settledNext`/`settledNextTop`, desktop
  // `SettledControlColumn`/`SettledNextBetCard`) — the ONLY BET AGAIN home
  // now that the near-board `VaultBoardRebet` duplicate CTA is removed
  // (rugsui fix-spec §4, 2026-07-06). No `won` branch here; the guard is
  // purely a balance check, identical on win and loss.
  const insufficient = state.wagerLamports > state.balanceLamports
  const handleBetAgain = (): void => {
    controller.placeBet().catch(() => undefined)
  }
  // "bet again · same trail" preset (2026-07-02) — places the SAME single
  // bet as handleBetAgain, then loads the last committed trail back into the
  // PLANNING state only (reuseLastTrail never auto-runs, never sets
  // autoActive). Exactly ONE placeBet() per click. Settled-panel only (see
  // Settlement's `canReuseTrail` gate).
  const handleBetAgainSamePattern = (): void => {
    controller.placeBet().then(() => controller.reuseLastTrail()).catch(() => undefined)
  }

  // ── Settled receipt state — LIFTED from Settlement (VAULT SIDE-MARGIN
  // CHROME, 2026-07-03) ─────────────────────────────────────────────────
  // The new right-gutter Card C (the collapsed verified-receipt chip) mounts
  // as a sibling of the canvas inside `vault-canvas-shell`, while the
  // EXPANDED full seed/hash receipt list stays a full-width reveal in the
  // bottom bar (Settlement) — never grows inside the floating card (that
  // would recreate the banned height-matching column). Two DOM subtrees
  // sharing ONE `expanded` boolean + ONE verify result means the state can't
  // live locally inside Settlement any more; it's lifted here and threaded
  // down to both. `settledOutcomeForVerify` is a NEW object reference each
  // settle (vaultProvider mints a fresh outcome per round), so keying the
  // effect on it resets `receiptExpanded`/`verifyState` exactly once per
  // settle — the same reset that used to happen "for free" when Settlement
  // unmounted/remounted between rounds.
  const settledOutcomeForVerify = state.phase.kind === 'settled' ? state.phase.outcome : null
  const [receiptExpanded, setReceiptExpanded] = useState(false)
  const [verifyState, setVerifyState] = useState<'verifying' | 'matched' | 'mismatched'>(
    'verifying',
  )
  useEffect(() => {
    if (!settledOutcomeForVerify) return
    let cancelled = false
    setVerifyState('verifying')
    setReceiptExpanded(false)
    void verifyMineBitmap(settledOutcomeForVerify).then((matches) => {
      if (cancelled) return
      setVerifyState(matches ? 'matched' : 'mismatched')
    })
    return () => {
      cancelled = true
    }
  }, [settledOutcomeForVerify])

  // PER-WORLD VAULT-PLATE TOP-HIGHLIGHT (2026-07-06, unified-plate-material
  // fix, item 7) — a CSS custom property set once per render on the shell
  // root so every nested GLASS/GLASS_CTA plate's inset top highlight
  // (`VAULT_PLATE_SHADOW`'s `var(--vault-plate-highlight, ...)` stop) picks
  // up a faint wash of the ACTIVE world's own accent, reusing the exact
  // `MODE_CARDS[...].accent` hex `VaultCornerChrome` already reads (see its
  // `${currentMode.accent}66` border, ~L4302) instead of prop-drilling
  // `state.mode` through every gutterCard/gutterCardCta call site. Kept
  // SUBTLE per taste-guardian's restraint note — Altseason's bright volt
  // backdrop needs the most lift (~10%); Bluechips/Shitcoin stay minimal
  // (~7%) so gold-hairline borders (not per-world hue) stay the dominant
  // read. Border/fill stay uniform across worlds — only this one highlight
  // stop varies.
  const plateAccentHex = MODE_CARDS.find((c) => c.mode === state.mode)?.accent ?? T.textPrimary
  const plateAccentAlphaHex = state.mode === 'altseason' ? '1a' : '12'
  const plateAccentVars = {
    '--vault-plate-highlight': `${plateAccentHex}${plateAccentAlphaHex}`,
  } as unknown as CSSProperties

  // ── Responsive chassis (composition-designer spec, Part 3/4d) ────────────
  // Mobile: cabinet = column (board on top, control panel below). Desktop:
  // cabinet = row (board left, control panel as a 380px RIGHT SIDEBAR with a
  // gold divider), and the whole page is capped + centered so nothing
  // stretches across an ultrawide monitor.
  // Resolution/viewport fix: the shell had no vertical-centering strategy, so
  // on large/ultrawide desktop viewports (e.g. 1920×1080) the header+cabinet+
  // footer block — capped at maxWidth 1240 / boardHeightCss ≤680px — just
  // top-aligned, leaving the ENTIRE remainder of the viewport a dead void
  // below the footer (the rugriches3.jpg case). `minHeight: 100dvh` +
  // `justifyContent: 'center'` on this flex column centers the whole block
  // vertically, matching the Aviator/Stake-Mines "letterboxed game panel"
  // convention (symmetric bezel, not a lopsided void). On short content this
  // is a no-op below viewport height.
  // SAFE-CENTERING FIX (2026-07-07, autisk Pixel-7 re-sweep): on mobile the
  // board + the new mobile HUD band can push content to ~981px, taller than
  // the Pixel 7's 915px viewport. `justifyContent: 'center'` on an OVERFLOWING
  // flex column centers the overflow symmetrically — pushing ~40% of the
  // header (title/phase/round-id) ABOVE y=0, where no scroll can reach it.
  // Desktop never overflows past its own `minHeight: 100dvh` in practice, so
  // it keeps plain `justifyContent: 'center'` unchanged. Mobile instead stays
  // `flex-start` on THIS outer shell and centers via `margin-block: auto` on
  // the inner content-stack wrapper (see `mobileContentStackStyle` below) —
  // auto margins center a flex item only when there IS free space and
  // collapse to 0 once the item overflows, so short content still centers
  // and tall content pins to the top and scrolls, reachable end to end.
  const pageStyle: CSSProperties = {
    ...styles.page,
    width: '100%',
    // Ultrawide scale-up follow-up: the old fixed 1240 cap left ~27%
    // symmetric top/bottom letterbox at 1920×1080+ even after the
    // vertical-centering fix (the cabinet itself stayed a small island).
    // A viewport-relative clamp lets the cabinet grow WITH the screen —
    // capped at 1680 so it never over-stretches on 2560+ ultrawide — while
    // 92vw keeps a proportional bezel at in-between widths (e.g. 1440).
    // Below the 960 `isWide` breakpoint this is untouched (mobile stays 640).
    maxWidth: isWide ? 'min(1680px, 92vw)' : 640,
    margin: '0 auto',
    // Bottom padding trimmed to 6 on isWide to absorb the +45px board growth
    // from the 89vh raise (keeps scrollHeight ≤900 at 1440×900, +4px margin)
    // without shrinking the fitted BetEntry right-column.
    padding: isWide ? '10px 16px 6px' : '10px 16px 28px',
    boxSizing: 'border-box',
    minHeight: '100dvh',
    // Mobile: `flex-start` + the content-stack wrapper's `margin-block: auto`
    // (safe-centering, see comment above). Desktop (isWide) unchanged.
    justifyContent: isWide ? 'center' : 'flex-start',
    // autisk 2026-07-04 (defect #5): PLAYING/SETTLED added +16px over the clean
    // 900px lobby (the header tape's phase status wraps +7px, the footer gains
    // the "OPEN · N of M safe compartments" status line +13px) → scrollHeight
    // 916 > 900 forced a vertical scrollbar, which (once shown) also induced a
    // horizontal one (cascade: cw 1425 < sw 1440). Tighten the inter-section
    // gap on desktop from 16 to 8 (2 gaps → −16px) so every phase fits the
    // viewport height. Lobby stays comfortably clean; BetEntry (already the
    // tightest phase at 89vh board + 6px pad) only gains headroom. Mobile keeps
    // 16 (it scrolls top-down by design — see the taller bottom padding above).
    gap: isWide ? 8 : (styles.page.gap as number),
    // autisk 2026-07-04 (defect #4): the app-root wrappers size to the FULL
    // viewport width (390) not the scrollbar-reduced content width (375), so
    // once a vertical scrollbar appears their right edge (390) sits 15px past
    // clientWidth → a phantom horizontal scrollbar that clips the top-bar
    // "…USDC" and the board's right column. Clamp this column's own overflow;
    // the html/body/#root clamp is injected globally just below (a <style> in
    // this same file) since those nodes live outside this component's JSX.
    overflowX: 'hidden',
  }
  // BOTTOM-BAR PIVOT (2026-07-03, Tim: "verplaats het hele blok rechterkant
  // met take profit naar de onderkant"): the desktop right-sidebar forced
  // the panel to MATCH THE BOARD'S HEIGHT (row cabinet + `align-items:
  // stretch` + `boardHeightCss`), which is exactly the mechanism that kept
  // reopening a growing empty gap every time the board grew (ultrawide,
  // tall viewports). A full-width bar UNDER the board sizes to its own
  // content and structurally cannot inherit that gap — it never reads the
  // board's height at all. Cabinet is now ALWAYS a column (desktop matches
  // mobile's board-on-top / panel-below stacking); `boardHeightCss` below is
  // untouched — it drives the canvas's own height via ResizeObserver and is
  // orthogonal to the cabinet's stacking direction.
  const cabinetStyle: CSSProperties = {
    ...styles.roundCard,
    flexDirection: 'column',
  }
  const boardStyle: CSSProperties = { ...styles.boardRegion }
  // Mobile shares the same shell-wide backdrop-photo fix as the desktop grid
  // (doortrekken-de-achtergrond, 2026-07-06) — `cabinetStyle` (`roundCard`)
  // is already `position:'relative'` and stacks board-on-top/panel-below in
  // one flex column, so the same absolute inset:0 layer + zIndex:1 on its
  // flex children is enough; no separate mobile-only seam existed beyond
  // "canvas painted the photo, the panel below never saw it" — same cause,
  // same fix, same `getModeBackdrop` source of truth.
  const mobileBackdrop = getModeBackdrop(state.mode)
  // Mobile-only bottom panel — the desktop (isWide) chassis never mounts
  // this; its controls live entirely in the gutter cards mounted alongside
  // the canvas (see canvasShellChildren below).
  const panelStyle: CSSProperties = { ...styles.controlPanel }
  // SAFE-CENTERING content-stack wrapper (2026-07-07, mobile only) — houses
  // the header tape + cabinet + footer as ONE flex item inside `pageStyle`'s
  // now-`flex-start` mobile shell. `margin-block: auto` centers this item
  // when it's shorter than the viewport and collapses to 0 once it overflows
  // (per the CSS auto-margin-on-flex-item spec), so the header never gets
  // pushed above the reachable scroll area on tall content (Pixel 7). Not
  // used by the isWide/DesktopChassis branch — desktop keeps the plain
  // `justifyContent: 'center'` shell above, unchanged.
  const mobileContentStackStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minHeight: 0,
    gap: styles.page.gap as number,
    marginBlock: 'auto',
  }

  // ONE source of the canvas + its cosmetic overlays, shared by the desktop
  // grid board-column and the mobile stacked layout below — avoids keeping
  // two near-identical VaultGridCanvas JSX blocks in sync by hand.
  const canvasShellChildren = (
    <>
      {/* Backdrop history: photoreal 3D room renders were tried and
          reverted (they read as Frankenstein next to the flat-cartoon
          coins/ape). The current per-world backdrops are FLAT cartoon
          poster-illustrations in the same ink-outline register as the
          coins, drawn by the canvas behind a light scrim — cohesive, not
          a raster-over-procedural clash. Canvas owns the whole scene. */}
      <VaultGridCanvas
        mode={state.mode}
        gridSize={state.gridSize}
        mineCount={state.mineCount}
        revealedTiles={state.revealedTiles}
        mineHitTileIdx={mineHitTileIdx}
        revealedMoonTileIdx={state.revealedMoonTileIdx}
        cumulativeMultiplierBps={state.cumulativeMultiplierBps}
        previousCumulativeMultiplierBps={state.previousCumulativeMultiplierBps}
        houseEdgeBps={modeParams(state.mode).houseEdgeBps}
        wagerLamports={state.wagerLamports}
        phase={state.phase.kind}
        trailMode={state.trailMode}
        trail={state.trail}
        onTileReveal={(idx) => controller.revealTile(idx)}
        onTileTrail={(idx) => controller.toggleTrailTile(idx)}
        onTilePaint={(idx) => controller.addTrailTile(idx)}
        reducedMotion={reducedMotion}
        // FIXED 5-ZONE GRID CHASSIS (2026-07-06): the board is now one row of
        // a real CSS grid (topbar 56 / hud-zone 72 / board auto / statusbar
        // 40, +3 row-gaps of GRID_GAP), so its vh budget is recomputed from
        // the old header+footer chassis (84vh, ~90px fixed overhead) down to
        // leave room for the new fixed rows (~204px overhead) while staying
        // well under 900px viewport height (0 page scroll, verified live).
        // FIX 6 (2026-07-07, consolidated fix pass, MOBILE-ONLY): the
        // bet-entry-phase board is a NON-INTERACTIVE preview (lobby is
        // removed, bet-entry IS the landing phase) — at the shared mobile
        // default (`min(58vh,500px)`, VaultGridCanvas's own fallback below)
        // it stacked with the world-picker card-size bump and pushed SEND IT
        // 287px (Pixel7) / 344px (iPhone14Pro) below the fold on every first
        // landing. Reduced height ONLY for `!isWide && bet-entry` — every
        // other mobile phase (playing/etc.) and ALL of desktop (`isWide`
        // branch above, the 183/210 board-Y anchor) are untouched.
        // FIX #3 (2026-07-07, mobile settled fold fix) — same board-shrink
        // mechanism, reused for the SETTLED phase only: the settled screen's
        // BET AGAIN CTA (bottom of `PhaseSurface`) measured 11-68px below the
        // fold because the settled board rendered at the same full
        // `min(58vh,500px)` height as `playing`. Shrinking ONLY `!isWide &&
        // settled` (playing/mine-hit/settling untouched, so the live board
        // never resizes mid-round) reclaims height for BET AGAIN to clear
        // the fold on both Pixel 7 and iPhone 14 Pro.
        // FIX #3 ROUND 2 (2026-07-07, chrome-expanded small-viewport
        // re-measure) — two independent mobile-touch-qa passes agreed the
        // first round's `min(40vh, 340px)` cap still left BET AGAIN at
        // `rect.bottom` ≈826px: 85px below the fold on the REALISTIC
        // first-load iPhone 14 Pro viewport (usable ≈741px, browser chrome
        // still expanded) and ~2px below on Pixel 7 (usable ≈824px). Root
        // cause: plain `vh` resolves against the LARGE viewport (chrome
        // retracted) even while chrome is actually showing, so the settled
        // board rendered taller than the real available space. Switched to
        // `svh` (small-viewport unit — guaranteed available height with
        // chrome expanded, matches the shell's existing `100dvh`/`88dvh`
        // usage elsewhere in this file) AND dropped the cap from 340px to
        // 236px (-104px), which is the ~101px BET AGAIN needs to clear the
        // iPhone 14 Pro fold with margin to spare. On the binding iPhone 14
        // Pro viewport (741px usable) this resolves to 30svh=222.3px (under
        // the 236px cap, still >=200px so the board stays readable) — a
        // ~104-118px reduction from the prior settled board height,
        // depending on how much of the old 340px cap vs 40vh term was
        // actually binding. Scoped to `!isWide && settled` only: playing/
        // mine-hit/settling (unchanged, live board never resizes mid-round)
        // and desktop (`isWide` branch above, untouched) are both
        // unaffected. Orthogonal to FIX #2's HUD-band-to-first-tile gap —
        // that gap is real-DOM flex spacing between the `mobileHudBand` row
        // and this canvas element, not derived from this canvas's own
        // height, so it stays positive regardless of this prop's value.
        // FIX 2 (2026-07-09, mobile-touch-qa follow-up round) — FIX #6's
        // `min(16vh,150px)` cleared the fold on Pixel 7 but iPhone 14 Pro
        // (852 tall, narrower than Pixel 7's 915) still measured SEND IT
        // 11.3px below the fold at first paint. iPhone 14 Pro's absolute
        // vh budget is smaller while the header/footer/BetConsole content
        // above/around it is fixed-px, so it needs a bit more trim than
        // Pixel 7 does. Reused the SAME mechanism (bet-entry-preview-board
        // height, `!isWide && bet-entry` only — every other mobile phase
        // and all of desktop untouched) and tightened it further:
        // 16vh/150px -> 13vh/125px. Trims ~25px on iPhone 14 Pro (852*0.03
        // = 25.6px) and ~27px on Pixel 7 (915*0.03 = 27.5px) — both devices
        // still land comfortably >=100px tall for this non-interactive
        // preview board.
        boardHeightCss={
          isWide
            ? 'min(70vh, 800px)'
            : state.phase.kind === 'bet-entry'
              ? 'min(13vh, 125px)'
              : state.phase.kind === 'settled'
                ? 'min(30svh, 236px)'
                : undefined
        }
        isWide={isWide}
        // domHudActive=isWide (2026-07-06) EXTENDED (2026-07-07, FIX #2) —
        // desktop already renders the multiplier/rug-risk/win-banner as REAL
        // DOM elements in the HUD-zone row above the board (suppressing the
        // canvas's own drawHeroPnl/drawPumpGauge/drawNextPayoff/drawBottomHint
        // text so nothing double-renders). Mobile now does the SAME for its
        // own "round is live" + "settled" phases (`bottomBarPhase`, see the
        // new `mobileHudBand` mounted in the mobile branch below) — the
        // canvas no longer draws PUMP/BAG/RUG-RISK text into a percentage-
        // reserved top band at all for those phases, which is what let the
        // SHITCOIN 7×7 board's taller HUD text clip into its own top safe
        // row (the % reserve sized for 5×5 wasn't enough at every grid size).
        // `computeGridLayout`'s `minimalBands` branch (keyed off this same
        // prop) also kicks in for mobile now, so the grid itself gets the
        // same thin real-DOM-HUD-aware reserve desktop already uses. Mobile
        // bet-entry (`!bottomBarPhase`) is UNCHANGED — its small
        // non-interactive preview board never drew HUD text to begin with.
        domHudActive={isWide || bottomBarPhase}
        onBoardLayout={setBoardLayout}
      />
      {/* PERFECT-TUMBLER rhythm badge — cosmetic only. Surfaces during
          `playing` when the rhythm-tick evaluator returns a non-null
          tier. Auto-dismisses after RHYTHM_BADGE_VISIBLE_MS. RG-C5
          enforced via vaultCopy.evaluateRhythmTick's pure-function
          signature — see vaultCopy.ts header. */}
      {state.phase.kind === 'playing' && rhythmTick.badge !== null && (
        <RhythmBadge tier={rhythmTick.badge} reducedMotion={reducedMotion} />
      )}
      {/* BIG center-screen reveal — fires on every settle. Single
          moment-to-live, narrative headline + outsized multiplier.
          RG-C5: amplitude is identical regardless of outcome class;
          only color + copy bucket shift. */}
      {state.phase.kind === 'settled' && (
        <>
          {/* MOBILE OVERLAP FIX (2026-07-07, autisk Pixel-7 re-sweep): the
              hero headline visually overlapped/bisected the
              `SettledBoardCaption` pill for ~2s while the mobile settlement
              panel slides up (duplicate copy, cut in two). Mirrors the
              existing `suppressSettledCaption`/canvas `drawBottomHint`
              mobile-suppression pattern (VaultGridCanvas.tsx) — the DOM
              `SettledBoardCaption` already owns this "N safes / result" job
              on mobile, so the bigger narrative headline is suppressed there
              too rather than repositioned. Desktop (isWide) is unchanged —
              it has the horizontal room for both. */}
          {isWide && (
            <VaultHeroOverlay outcome={state.phase.outcome} reducedMotion={reducedMotion} />
          )}
          {/* ONE-CTA FIX (rugsui fix-spec §4, 2026-07-06) — `VaultBoardRebet`
              (the near-board floating BET AGAIN pill) is REMOVED. It was
              added 2026-07-02 to solve a real problem: the sidebar CTA sat
              ~750px away in a far-right panel while the eye was pinned to
              board-center on settle. That problem no longer exists — the
              2026-07-06 FIXED 5-ZONE GRID CHASSIS rebuild seats
              `SettledControlColumn`'s BET AGAIN in the SAME row as the
              HUD-zone/board (a 320px column immediately beside them, not a
              tall far-right sidebar measured against board-bottom), so the
              original horizontal-distance rationale is moot. Verified live
              (see run notes) that the control-column CTA stays above the
              fold at 1440x900 / 1920x1080 desktop and Pixel 7 / iPhone 14
              Pro mobile (mobile's `Settlement`'s own `nextTier` sits
              directly under the board in normal flow, not far away either)
              before this removal shipped — two CTAs on the settled screen is
              the exact "two BET AGAIN buttons" bug the spec calls out.
              `VaultBoardRebet`/its styles/keyframe are deleted below (no
              inert-but-defined leftover — this one renders real DOM, unlike
              the harmless-unused VaultGutterCards precedent). The board-
              width safes-opened/multiplier caption that used to compete for
              this same visual real estate is now `SettledBoardCaption`
              (spec §5), a small pill-bg strip instead of a CTA. */}
          <SettledBoardCaption outcome={state.phase.outcome} />
        </>
      )}
      <VaultCornerChrome
        isWide={isWide}
        controller={controller}
        phaseKind={state.phase.kind}
        onHelp={() => setShowInfo(true)}
      />
      {/* GUTTER-CARD SYSTEM REMOVED (2026-07-06, FIXED 5-ZONE GRID CHASSIS
          rebuild) — `VaultGutterCards`/`BetEntryGutterCards` (position:
          absolute board-anchored cards) are superseded by the HUD-ZONE +
          CONTROL COLUMN grid cells rendered by `DesktopChassis` below (see
          the main return JSX). The two components are left defined but
          unused (harmless — noUnusedLocals is off in tsconfig.check.json)
          rather than deleted, since several of their sub-components
          (PlayingActionsCard, SettledNextBetCard, SettledReceiptCard,
          SidebarPulseStrip, gutterBoardAnchor*Style) are still reused by the
          new control-column components. */}
    </>
  )

  // FIXED 5-ZONE GRID CHASSIS (2026-07-06) — desktop (isWide) ONLY. Mobile
  // (<960) renders the ORIGINAL headerTape / cabinetStyle+PhaseSurface /
  // gameFooter markup below, byte-identical to before this rebuild.
  if (isWide) {
    return (
      <div style={{ ...pageStyle, ...plateAccentVars }}>
        <DesktopChassis
          controller={controller}
          boardLayout={boardLayout}
          insufficient={insufficient}
          onBetAgain={handleBetAgain}
          onBetAgainSamePattern={handleBetAgainSamePattern}
          verifyState={verifyState}
          receiptExpanded={receiptExpanded}
          onToggleReceipt={() => setReceiptExpanded((v) => !v)}
          canvasShellChildren={canvasShellChildren}
          boardShellRef={boardShellRef}
          phaseLabel={phaseLabel}
          roundIdLabel={roundIdLabel}
          sessionRounds={sessionRounds}
          sessionDelta={sessionDelta}
          safeLeft={safeLeft}
        />
        <style>{shakeKeyframes}</style>
        <OnboardingOverlay
          sequence={vaultOnboarding}
          visible={onboarding.visible}
          onComplete={onboarding.markSeen}
          onDismiss={onboarding.markSeen}
        />
        {showInfo && <VaultInfoOverlay onClose={() => setShowInfo(false)} />}
      </div>
    )
  }

  return (
    <div style={{ ...pageStyle, ...plateAccentVars }}>
      {/* SAFE-CENTERING content-stack wrapper (2026-07-07, FIX A) — see
          `mobileContentStackStyle` above. Wraps ONLY the visible header +
          cabinet + footer stack; the overlays below (OnboardingOverlay,
          VaultInfoOverlay, the shakeKeyframes <style> tag) stay siblings of
          this wrapper since they're fixed/absolute-positioned and don't
          participate in shell centering. */}
      <div style={mobileContentStackStyle}>
      {/* Header tape — mirror Pulse §2. Mono caps meta; the separator + the
          highlight token run in the game's pump-green (this game's candle
          economy deliberately has NO cyan). MOBILE ONLY as of the 2026-07-06
          grid-chassis rebuild (isWide branches to <DesktopChassis> above) —
          this markup is byte-identical to before that rebuild. */}
      <div style={styles.headerTape}>
        <span style={styles.tapeBrand}>RUG OR RICHES</span>
        <HelpButton onClick={() => setShowInfo(true)} gameLabel={vaultOnboarding.gameLabel} />
        <span style={styles.tapeMeta}>{phaseLabel}</span>
        <span style={styles.tapeMeta}>{roundIdLabel}</span>
        <span style={styles.tapeSeparator} aria-hidden="true" />
        <span style={styles.tapeTime}>SAFE{safeLeft === 1 ? '' : 'S'} LEFT {safeLeft.toString().padStart(2, '0')}</span>
        {state.phase.kind === 'playing' && (
          <span style={styles.liveBadge}>
            {/* Inline animation must be gated off reducedMotion in JS — a CSS
                media query can't touch an inline `animation` (autisk fix). */}
            <span style={reducedMotion ? { ...styles.liveDot, animation: 'none' } : styles.liveDot} />
            LIVE
          </span>
        )}
        {/* Session "recents" chip — the header is its ONE home (restored);
            the bottom gameFooter strip below carries HistoryStrip only, no
            duplicate copy. */}
        <SessionMeta rounds={sessionRounds} deltaLamports={sessionDelta} />
        <span style={styles.tapeBalance}>
          BALANCE · <span style={styles.tapeBalanceValue}>{formatUsdc(state.balanceLamports)}</span>
        </span>
      </div>

      {/* Round card — single continuous game stage. Mobile-only stacked
          cabinet (board on top, PhaseSurface panel below). */}
      <div style={cabinetStyle}>
        <div
          aria-hidden="true"
          data-testid="vault-grid-backdrop"
          style={{
            ...styles.sceneBackdropLayer,
            backgroundImage: `linear-gradient(rgba(3,7,13,${mobileBackdrop.scrim}), rgba(3,7,13,${mobileBackdrop.scrim})), url(${mobileBackdrop.backdrop})`,
          }}
        />
        {/* SCENE EDGE-SCRIM (rugsui fix-spec §1) — mobile shares the exact
            same edge-darken + bottom-fade layer as desktop (see
            DesktopChassis for the full rationale); the mobile cabinet is
            already `position:'relative'` (`cabinetStyle`/`roundCard`), so the
            same `inset:0` overlay applies unchanged. */}
        <div aria-hidden="true" data-testid="vault-scene-edge-scrim" style={styles.sceneEdgeScrimLayer} />
        {/* MOBILE HUD BAND (FIX #2, 2026-07-07) — real DOM row reserved
            ABOVE the canvas, board-width-anchored via the same live-measured
            `boardLayout` the desktop HUD-ZONE bar uses, so it sits flush
            above the actual grid tiles rather than the full cabinet width.
            Mounted only for `bottomBarPhase` (playing/mine-hit/settling/
            settled) — bet-entry's small non-interactive preview board never
            drew HUD text and stays untouched. See `domHudActive` on the
            shared canvas above for the matching canvas-side suppression. */}
        {bottomBarPhase && (
          <div
            style={{
              ...styles.mobileHudBand,
              ...(boardLayout
                ? {
                    marginLeft: boardLayout.boardPanelLeftX,
                    width: Math.max(0, boardLayout.boardPanelRightX - boardLayout.boardPanelLeftX),
                  }
                : { width: '100%' }),
            }}
            data-testid="vault-mobile-hud-band"
          >
            <div
              style={{
                ...styles.mobileHudBandInner,
                ...(state.phase.kind === 'settled' ? settledHudBarTint(state.phase.outcome.won) : null),
              }}
              data-testid={state.phase.kind === 'settled' ? 'vault-settled-banner' : 'vault-grid-hud-inner'}
            >
              {roundLive && <MobileHudPlayingStats controller={controller} />}
              {state.phase.kind === 'settled' && <MobileHudSettledBanner outcome={state.phase.outcome} />}
            </div>
          </div>
        )}
        <div style={boardStyle} data-testid="vault-canvas-shell" ref={boardShellRef}>
          {canvasShellChildren}
        </div>
        <div style={panelStyle} aria-live="polite">
          <PhaseSurface
            controller={controller}
            isWide={isWide}
            insufficient={insufficient}
            onBetAgain={handleBetAgain}
            onBetAgainSamePattern={handleBetAgainSamePattern}
            verifyState={verifyState}
            receiptExpanded={receiptExpanded}
            onToggleReceipt={() => setReceiptExpanded((v) => !v)}
          />
        </div>
      </div>
      {/* Below-cabinet strip: recent-rounds HistoryStrip + status caption,
          on every viewport. */}
      <div style={styles.gameFooter}>
          {state.phase.kind === 'playing' && (
            <span style={styles.gameFooterStatus}>
              <span style={styles.gameFooterStatusMain}>OPEN</span>
              <span style={styles.gameFooterStatusMuted}>
                {state.revealedTiles.length} of {totalTiles - state.mineCount} safe compartments ·{' '}
                {state.trailMode
                  ? 'plan a path, then GO · a rug ends the round'
                  : 'every safe crack pumps free · a rug costs your bet'}
              </span>
            </span>
          )}
          <HistoryStrip rows={state.history} />
          <span className="sr-only" aria-live="polite">
            {state.phase.kind === 'playing'
              ? `Cumulative multiplier ${formatMultiplier(state.cumulativeMultiplierBps)}`
              : ''}
          </span>
      </div>
      </div>
      <style>{shakeKeyframes}</style>
      <OnboardingOverlay
        sequence={vaultOnboarding}
        visible={onboarding.visible}
        onComplete={onboarding.markSeen}
        onDismiss={onboarding.markSeen}
      />
      {showInfo && <VaultInfoOverlay onClose={() => setShowInfo(false)} />}
    </div>
  )
}


// ─── HOW TO PLAY overlay ─────────────────────────────────────────────────────
// Self-contained rules panel (the shared onboarding shim ships empty). One
// scroll: the loop, the RUG RISK gauge, the two play styles, points, MOON, RTP.
function VaultInfoOverlay({ onClose }: { readonly onClose: () => void }): ReactElement {
  return (
    <div
      style={styles.infoScrim}
      role="dialog"
      aria-modal="true"
      aria-label="How to play Rug or Riches"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div style={styles.infoPanel}>
        <div style={styles.infoHeader}>
          <span style={styles.infoTitle}>HOW TO PLAY</span>
          <button type="button" onClick={onClose} style={styles.infoClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div style={styles.infoBody}>
          <p style={styles.infoLead}>
            Crack open the vault&apos;s sealed compartments to pump your multiplier. Safe ones hold
            coins that grow your bag, but some hide
            <strong style={{ color: T.danger }}> rugs</strong>. Hit one and you lose your bet, so
            <strong style={{ color: T.bag }}> take profit</strong> before you do.
          </p>

          <span style={styles.infoHead}>THE READOUTS</span>
          <p style={styles.infoText}>
            <strong>PUMP ×</strong> · your current multiplier. <strong>BAG</strong> · what you cash
            out right now. <strong>RUGS</strong> / <strong>SAFE LEFT</strong> · how many rugs are
            hidden vs safe compartments remaining. <strong style={{ color: T.danger }}>RUG RISK %</strong> ·
            the chance your next tap is a rug; it reddens as it climbs.
          </p>

          <span style={styles.infoHead}>TWO WAYS TO PLAY</span>
          <p style={styles.infoText}>
            <strong>MANUAL</strong> · classic: crack compartments one at a time, take profit
            whenever.
            <br />
            <strong>TRAIL</strong> · plan ahead: switch to TRAIL, then <em>hold &amp; drag</em> across
            compartments to draw a path. Hit <strong>GO</strong> and it auto-opens your path in order; clear
            the whole path and you keep going. Plan another trail or take profit when you&apos;re
            ready. A single rug on the path ends the round.
          </p>

          <span style={styles.infoHead}>SET A TARGET (optional)</span>
          <p style={styles.infoText}>
            <strong style={{ color: T.bag }}>EXIT AT ×</strong> · pick a target multiplier and the
            vault auto-banks for you on the first safe tap that reaches <em>or passes</em> it (set
            2× and a tap that lands 2.27× cashes out there). Leave it <strong>OFF</strong> to decide
            by hand.
          </p>

          <span style={styles.infoHead}>PICK YOUR WORLD</span>
          <p style={styles.infoText}>
            <strong>BLUECHIPS</strong> (3 rugs) and <strong>ALTSEASON</strong> (5 rugs) pay back
            ~97% over time. <strong>SHITCOIN</strong> (24 rugs) is wilder, with bigger pumps and a hidden{' '}
            <strong style={{ color: T.bag }}>MOON</strong> payout, but a lower ~93.5% payback.
            (“RTP” = how much is paid back to players over time; the rest is the house edge.)
          </p>

          <span style={styles.infoHead}>MOON &amp; POINTS</span>
          <p style={styles.infoText}>
            <strong style={{ color: T.bag }}>MOON</strong> · in SHITCOIN one hidden compartment holds the MOON;
            reveal it on a winning round for a cash bonus on top. <strong>Ownership points</strong> ·
            a loyalty reward you earn every round, win or lose (1.5× on a loss). They don’t affect
            payouts.
          </p>

          <span style={styles.infoHead}>PROVABLY FAIR</span>
          <p style={styles.infoText}>
            The rugs are fixed by a random seed the moment you bet. Nothing shifts based on where you
            tap. Every settled round shows a Glass Box receipt so you can verify it.
          </p>
        </div>

        <button type="button" onClick={onClose} style={styles.infoGotIt}>
          got it →
        </button>
      </div>
    </div>
  )
}

// ─── Header session-meta chip ──────────────────────────────────────────────

function SessionMeta({
  rounds,
  deltaLamports,
}: {
  rounds: number
  deltaLamports: bigint
}): ReactElement {
  if (rounds === 0) return <></>
  const positive = deltaLamports >= 0n
  const abs = deltaLamports < 0n ? -deltaLamports : deltaLamports
  const sign = positive ? '+' : '-'
  return (
    <span
      style={{
        ...styles.tapeMeta,
        color: positive ? T.accent : T.danger,
        marginLeft: 6,
      }}
      aria-label={`Session: ${rounds} rounds, ${positive ? 'plus' : 'minus'} ${formatUsdc(abs)}`}
    >
      SESSION · {rounds} {rounds === 1 ? 'ROUND' : 'ROUNDS'} · {sign}
      {formatUsdc(abs)}
    </span>
  )
}

// ─── Phase-keyed inner surface ─────────────────────────────────────────────

// PhaseSurface is MOBILE-ONLY — VaultExperience's desktop (isWide) chassis
// renders the gutter cards (VaultGutterCards / BetEntryGutterCards) instead
// and never mounts this component. `isWide` is always `false` at this
// component's one remaining call site; kept as an explicit param (rather
// than hard-coded) only so `Lobby`/`BetEntry`/`Playing`/`Settlement` keep
// their existing `isWide` prop contract unchanged.
function PhaseSurface({
  controller,
  isWide,
  insufficient,
  onBetAgain,
  onBetAgainSamePattern,
  verifyState,
  receiptExpanded,
  onToggleReceipt,
}: {
  controller: VaultController
  isWide: boolean
  // Shared BET AGAIN guard/handler — threaded through only for the
  // 'settled' case (Settlement), same closure/boolean VaultExperience
  // defines once and passes to every BET AGAIN call site (the ONLY one now
  // that the near-board VaultBoardRebet duplicate is removed).
  insufficient: boolean
  onBetAgain: () => void
  /** "bet again · same trail" preset (2026-07-02) — Settlement-only. */
  onBetAgainSamePattern: () => void
  // Settled receipt state — LIFTED to VaultExperience so the desktop control
  // column's Verified/receipt panel and this mobile full-width expanded
  // reveal share ONE boolean/verify result. Settlement-only, threaded
  // through for the same reason as insufficient/onBetAgain.
  verifyState: 'verifying' | 'matched' | 'mismatched'
  receiptExpanded: boolean
  onToggleReceipt: () => void
}): ReactElement | null {
  const { state } = controller
  switch (state.phase.kind) {
    case 'bet-entry':
      return <BetEntry controller={controller} isWide={isWide} />
    case 'playing':
      return <Playing controller={controller} isWide={isWide} />
    case 'mine-hit':
      return <MineHitActionBar mineTileIdx={state.phase.mineTileIdx} />
    case 'settling':
      return <Settling />
    case 'settled':
      return (
        <Settlement
          controller={controller}
          outcome={state.phase.outcome}
          isWide={isWide}
          insufficient={insufficient}
          onBetAgain={onBetAgain}
          onBetAgainSamePattern={onBetAgainSamePattern}
          verifyState={verifyState}
          expanded={receiptExpanded}
          onToggleExpanded={onToggleReceipt}
        />
      )
  }
}

// ─── Bet entry ─────────────────────────────────────────────────────────────

function BetEntry({
  controller,
  isWide,
  stacked,
  hideWager,
  hideModeSelector,
}: {
  controller: VaultController
  isWide: boolean
  /** LEGACY (2026-07-05 grid-chassis revert) — additive, optional, default
   *  falsy: when true, stacks the PICK YOUR WORLD mode cards 1-column (via
   *  ModeSelector's existing `stacked` prop). No live call site passes this
   *  any more (the desktop CSS-grid control column that used it was reverted
   *  back to the gutter-card system) — kept inert/harmless rather than
   *  removed, per the revert's backward-compat constraint. The one remaining
   *  call site (`Playing`'s sibling `<BetEntry controller isWide={false} />`
   *  in PhaseSurface) never passes it — byte-identical mobile render. */
  stacked?: boolean
  /** LEGACY (2026-07-05 grid-chassis revert) — additive, optional, default
   *  falsy: suppresses this console's OWN wager stepper + preset chips
   *  (threaded straight to `BetConsole`'s `hideWager`). No live call site
   *  passes this any more — the desktop control column that needed it (to
   *  avoid a duplicate wager stepper next to the separate "INZET" panel) was
   *  reverted along with the grid chassis. Kept inert/harmless rather than
   *  removed — `BetConsole.hideWager` stays backward-compatible for
   *  Pulse/OO-Fisher/OO-Rei regardless. */
  hideWager?: boolean
  /** LEGACY (2026-07-05 grid-chassis revert) — additive, optional, default
   *  falsy: omits the "PICK YOUR WORLD" `<ModeSelector>` from this console's
   *  children. No live call site passes this any more (the board-column
   *  worldpicker panel it fed was reverted along with the grid chassis; the
   *  desktop gutter's own BetEntryGutterCards renders `<ModeSelector
   *  stacked />` directly instead). Kept inert/harmless rather than removed. */
  hideModeSelector?: boolean
}): ReactElement {
  const { state } = controller
  const insufficient = state.wagerLamports > state.balanceLamports

  // TO WIN — the clarity line: the max pump you could clear this world at this
  // bet (clear the whole board), so the reward is visible before committing.
  const { houseEdgeBps } = modeParams(state.mode)
  const totalTiles = state.gridSize * state.gridSize
  const maxSafe = Math.max(1, totalTiles - state.mineCount)
  const maxBps = multiplierAfterSafeTiles({
    totalTiles,
    mineCount: state.mineCount,
    safeCount: maxSafe,
    houseEdgeBps,
  })
  const maxPayout = settlePayout(state.wagerLamports, maxBps)

  return (
    <BetConsole
      theme={vaultBetTheme}
      // BetEntry board/console width mismatch fix (2026-07-03): the shared
      // BetConsole panel self-caps at 460px + self-centers by default (used
      // as-is by Pulse/OO-Fisher/OO-Rei's sidebar-width consoles). Rug or
      // Riches now seats it under a FULL-WIDTH board (BOTTOM-BAR PIVOT), so
      // the narrow centered 460 card read as detached/unfinished next to the
      // full-width board above it. `maxWidth="100%"` lets the panel SURFACE
      // fill `controlPanel`'s full width (= boardRegion's width, both
      // `width:'100%'` of the same `cabinetStyle` column) so the seam is
      // continuous; BetConsole's own `isWidePanel` branch keeps the
      // interactive content capped/centered at 720 so it doesn't stretch
      // into a hollow gap.
      maxWidth="100%"
      // Below 960 (`isWide=false`) this renders `false`, so BetConsole takes
      // its unchanged 720-cap single-stack path — mobile is untouched.
      columns={isWide}
      // LOBBY-SPLASH REMOVAL (2026-07-06) — this eyebrow/hint pair is now the
      // ONLY first-time explainer a fresh mobile player gets (the old
      // stand-alone "APE IN. DODGE THE RUG." lobby splash is gone; the game
      // lands straight here). Relocated verbatim register, condensed into
      // this existing slot rather than adding a new DOM row (spec option A —
      // compact always-visible intro, per game-designer ruling 2026-07-06).
      eyebrow="APE IN. DODGE THE RUG."
      hint="crack compartments to pump your multiplier · one rug ends it · cash out first"
      wagerLabel="YOUR BET"
      wagerDisplay={<AnimatedUsdc lamports={state.wagerLamports} style={styles.consoleWagerValue} />}
      onStepDown={() => controller.setWager(stepWagerDown(state.wagerLamports))}
      onStepUp={() => controller.setWager(stepWagerUp(state.wagerLamports))}
      presets={WAGER_PRESETS}
      activeWager={state.wagerLamports}
      onPreset={(v) => controller.setWager(v)}
      hideWager={hideWager}
      toWin={{ label: 'TO WIN', value: `up to ${formatMultiplier(maxBps)}`, sub: `max ${formatUsdc(maxPayout)}` }}
      // AUTO-EXIT relocated to the gear corner-chrome icon on desktop
      // (VaultCornerChrome, top-left, bet-entry-only) — VAULT SIDE-MARGIN
      // CHROME, 2026-07-03. That icon is `isWide`-gated (mobile <960 renders
      // no new corner-chrome DOM), so mobile keeps the ORIGINAL footer
      // "AUTO-EXIT ▾" pill here, unchanged, so the control stays reachable
      // on the primary surface. `options`/`optionsLabel` omitted entirely on
      // desktop (`undefined` — BetConsole's `options && (...)` gate hides
      // the pill) so the control has exactly ONE home per viewport.
      options={!isWide ? <ExitAtSelector controller={controller} /> : undefined}
      optionsLabel="AUTO-EXIT"
      // BLOCKER 1 (2026-07-06) — no footer balance line on mobile bet-entry;
      // balance lives ONLY in the Z1 topbar tape (desktop already matches).
      // `balanceValue` is now opt-in on BetConsole, so omitting it drops the
      // block entirely (other games still pass it → unchanged).
      // `onCancel` OMITTED (LOBBY-SPLASH REMOVAL, 2026-07-06): there is no
      // lobby to cancel BACK to any more — bet-entry is the resting state.
      // `onCancel` is an optional, render-gated prop on BetConsole
      // (`onCancel && (...)`), so simply not passing it cleanly drops the
      // "cancel" footer link rather than wiring a dead handler.
      commitLabel="SEND IT →"
      onCommit={() => {
        controller.placeBet().catch(() => undefined)
      }}
      commitDisabled={insufficient}
      disabledLabel="not enough bag"
    >
      {/* Pick your world (each locks grid + rug band + house edge). Omitted
          when `hideModeSelector` — it renders as its own board-column panel
          instead (see prop doc above, Defect 2). */}
      {!hideModeSelector && <ModeSelector controller={controller} stacked={stacked} />}
    </BetConsole>
  )
}

// ─── Mode selector — pick your degen world ─────────────────────────────────

const MODE_CARDS: readonly {
  mode: VaultMode
  name: string
  tier: string
  grid: string
  /** Grid side length (5 or 7) — totalTiles = gridSize². Read by the uniform
   *  world-card to compute per-world max-multiplier + risk% from the real math. */
  gridSize: number
  /** Glyph for the card's icon tile (◆ Bluechips · ▲ Altseason · ☠ Shitcoin). */
  icon: string
  rugs: number
  risk: number
  rtp: string
  /** GRIDV2 WORLD-PICKER MOCKUP-PARITY (2026-07-06, round 4) — `newui1.jpg`
   *  consolidates rugs+grid+RTP onto ONE stats line ("3 RUGS · 5×5 · RTP
   *  97%"), a shorter form than the full `rtp` string ("RTP 97% · edge 3%")
   *  used by the non-stacked 3-across mobile card. Additive field, only read
   *  by the `stacked` desktop branch below — mobile stays byte-identical. */
  rtpShort: string
  tagline: string
  accent: string
}[] = [
  // `accent` drives the SELECTED world-card control surfaces (border / icon /
  // title / MAX) — so it must stay on the sanctioned `T` control palette
  // (green = active, gold = reward). The reserved electric #00FF7F stays a
  // SCENERY-only colour (altseason backdrop), never a readout; the amber
  // #FFB000 is replaced by the sanctioned gold token. (P4, 2026-07-06.)
  { mode: 'bluechips', name: 'BLUECHIPS', tier: 'NORMAL', grid: '5×5', gridSize: 5, icon: '◆', rugs: 3, risk: 1, rtp: 'RTP 97% · edge 3%', rtpShort: 'RTP 97%', tagline: 'sensible. still a rug waiting to happen.', accent: T.accentSolid },
  { mode: 'altseason', name: 'ALTSEASON', tier: 'HARD', grid: '5×5', gridSize: 5, icon: '▲', rugs: 5, risk: 2, rtp: 'RTP 97% · edge 3%', rtpShort: 'RTP 97%', tagline: 'alts pumping. some go to zero.', accent: T.accent },
  { mode: 'shitcoin', name: 'SHITCOIN', tier: 'CRAZY', grid: '7×7', gridSize: 7, icon: '☠', rugs: 24, risk: 3, rtp: 'RTP 93.5% · edge 6.5%', rtpShort: 'RTP 93.5%', tagline: 'full degen. find the MOON or get rekt.', accent: T.bag },
]

/** Tier-badge palette reused by the uniform world card's tier pill —
 *  NORMAL = pump-green, HARD = neutral grey, CRAZY = rug-red-tinted. No new
 *  color tokens (all drawn from the `T` accent economy). */
function tierPillColors(tier: string): { color: string; bg: string; border: string } {
  if (tier === 'NORMAL') return { color: T.accent, bg: 'rgba(0,230,118,0.12)', border: 'rgba(0,230,118,0.42)' }
  if (tier === 'CRAZY') return { color: T.danger, bg: 'rgba(255,77,77,0.12)', border: 'rgba(255,77,77,0.42)' }
  return { color: T.textMuted, bg: 'rgba(255,255,255,0.06)', border: T.borderDefault }
}

function ModeSelector({
  controller,
  stacked,
}: {
  controller: VaultController
  /** BETENTRY GUTTER REWORK (2026-07-03+1) — when true, stacks the 3 mode
   *  cards 1-column (via the scoped `.vault-gutter-mode-row` class ADDED
   *  alongside the base `.vault-mode-row`, not a fork of this component's
   *  logic/state) for the narrow 260px right gutter card. Omitted (default
   *  falsy) for every other caller — byte-identical 3-across behaviour.
   *  RIGHT-COLUMN CONSOLIDATION (2026-07-03+3) also gates the compaction
   *  overrides below (`modeBlock`/`modeRow`/`modeCard` gap+padding) on this
   *  SAME flag and threads it into `RugsTuner`'s sibling `compact` prop —
   *  the only caller with `stacked` true is BetEntryGutterCards, so the
   *  L1172 mobile `<ModeSelector controller={controller} />` call (no
   *  `stacked`) renders byte-identical to before this rework. */
  stacked?: boolean
}): ReactElement {
  const { state } = controller
  // ITEM 1: per-world personal bests, read once on mount from the localStorage
  // ledger. PB is shown ONLY here on the mode-select screen (RG-C5 — never
  // during play / settlement). Read lazily so SSR/no-window degrades to empty.
  const [bests] = useState<Partial<Record<VaultMode, ModeBest>>>(() => {
    const m: Partial<Record<VaultMode, ModeBest>> = {}
    for (const c of MODE_CARDS) m[c.mode] = vaultLedger.get(c.mode)
    return m
  })
  // RIGHT-COLUMN CONSOLIDATION (2026-07-03+3) compaction — gated on the SAME
  // `stacked` flag as the CSS class above, applied as inline overrides (NOT
  // base-object edits) since `modeBlock`/`modeRow` are the same objects the
  // non-`stacked` mobile caller (`BetEntry`, L1250) reads; that caller's
  // `stacked` is always falsy so its render is untouched.
  // GRIDV2 WORLD-PICKER MOCKUP-PARITY FIX (2026-07-06, round 4 — supersedes
  // round 3's stretch-to-fill). Tim rejected round 3 live, verbatim: "het
  // moet echt gevuld zijn ik zie nu dat je ze gewoon verplaatst hebt kan je
  // dit optimaliseren tot... precies zoals in de foto newui1" — round 3's
  // `flex:1, minHeight:0` + `alignContent:'space-between'` grew the gaps
  // BETWEEN the 3 world rows as viewport height grew (88px@900 ->
  // 152px@1118px) and called that "filled". Spreading gaps apart IS the
  // anti-pattern, not a fix. Reverted to FIXED, tight `gap`s — unconditional
  // on viewport height — matching `input/newui1.jpg`'s proportions. The
  // block reads dense now because the CARDS themselves changed (see the
  // `stacked` branch inside `MODE_CARDS.map` below: selected world = a real
  // bordered card with a 3rd content line for the BEST pill; unselected
  // worlds = plain 2-line rows, no card chrome), not because of stretched
  // whitespace. The genuine tall-viewport surplus this leaves is absorbed
  // OUTSIDE this component entirely, as ONE deliberate band below the whole
  // control column — see `desktopGridControl`'s `alignSelf: 'start'`
  // (styles, below) — never as internal gap-stretch again.
  // MOBILE-PARITY REBUILD (2026-07-06, round 2) — the uniform world-card
  // anatomy now renders on EVERY viewport (the `stacked` CARD fork is gone,
  // see `MODE_CARDS.map` below), so the block/row spacing + the 1-column row
  // class are unconditional too: desktop is byte-identical (it was already
  // gap:8 + `vault-gutter-mode-row`); mobile gains the same dense 1-column
  // uniform cards instead of the old 3-across anatomy.
  const modeBlockStyle = { ...styles.modeBlock, gap: 8 }
  const modeRowStyle = { ...styles.modeRow, gap: 8 }
  // Header status (P3) — the old "n/3" read as multi-select PROGRESS and the
  // mobile "more rugs · bigger pumps" tagline is README-banned. Now a single
  // clear single-select cue: "CHOOSE ONE" (or "CUSTOM" once the RUGS tuner is
  // moved off the selected world's preset). Config-screen only, both anatomies.
  const selIdx = MODE_CARDS.findIndex((c) => c.mode === state.mode)
  const selCard = selIdx >= 0 ? MODE_CARDS[selIdx] : undefined
  const isCustom = !!selCard && state.mineCount !== selCard.rugs
  const worldCounter = isCustom ? 'CUSTOM' : 'CHOOSE ONE'
  return (
    <div style={modeBlockStyle}>
      <div style={styles.gridHeader}>
        <span style={styles.gridLabel}>PICK YOUR WORLD</span>
        <span style={styles.gridStatus}>{worldCounter}</span>
      </div>
      <div
        className="vault-mode-row vault-gutter-mode-row"
        style={modeRowStyle}
      >
        {MODE_CARDS.map((c) => {
          const selected = state.mode === c.mode
          // UNIFORM WORLD CARD (2026-07-06, round 2 mobile-parity rebuild —
          // now UNCONDITIONAL, the `stacked` CARD fork is gone). ALL THREE
          // worlds render as full, identically-structured cards on EVERY
          // viewport (flat siblings, no wrapper box): icon tile · title + tier
          // pill · meta line (N rugs · grid, plus a gold BEST badge on EVERY
          // world that has a real vaultLedger record) · right-aligned
          // max-multiplier anchor · labelled bottom risk bar. Selection
          // changes ONLY border/tint/icon-color — never card-vs-row.
          // Max-multiplier + risk% come from the REAL per-world math
          // (multiplierAfterSafeTiles), never mockup literals. Mobile inherits
          // this same anatomy (dropping the old 3-dot meter / RTP jargon /
          // per-world tagline) — the mobile SHELL (stacked chassis) is
          // untouched, only the card body changed.
          const best = bests[c.mode]
          const hasBest = !!best && best.bestMultiplierBps > ONE_X_BPS
          const totalTiles = c.gridSize * c.gridSize
          const rugs = selected ? state.mineCount : c.rugs
          const houseEdgeBps = modeParams(c.mode).houseEdgeBps
          const worldMaxBps = multiplierAfterSafeTiles({
            totalTiles,
            mineCount: rugs,
            safeCount: Math.max(1, totalTiles - rugs),
            houseEdgeBps,
          })
          const riskPct = Math.round((rugs / totalTiles) * 100)
          const tp = tierPillColors(c.tier)
          const ac = c.accent
          return (
            <button
              key={c.mode}
              type="button"
              className="vault-world-card vault-press"
              onClick={() => controller.setMode(c.mode)}
              aria-pressed={selected}
              data-testid={`vault-world-card-${c.mode}`}
              style={
                selected
                  ? {
                      ...styles.worldCard,
                      borderColor: `${ac}88`,
                      background: `linear-gradient(180deg, ${ac}22, rgba(255,255,255,0.02))`,
                      boxShadow: `0 0 18px ${ac}1f, inset 0 1px 0 rgba(255,255,255,0.05)`,
                    }
                  : styles.worldCard
              }
            >
              <span
                style={{
                  ...styles.worldIconTile,
                  ...(selected ? { background: `${ac}22`, color: ac } : null),
                }}
                aria-hidden="true"
              >
                {c.icon}
              </span>
              <span style={styles.worldBody}>
                <span style={styles.worldTitleRow}>
                  <span style={{ ...styles.worldTitle, color: selected ? ac : T.textPrimary }}>{c.name}</span>
                  <span style={{ ...styles.worldTierPill, color: tp.color, background: tp.bg, borderColor: tp.border }}>
                    {c.tier}
                  </span>
                </span>
                <span style={styles.worldMeta}>
                  {/* P3 — clearer "N rugs · grid" wording (was the terse
                      "N/total" that read as a fraction). FIX 5 (2026-07-07,
                      consolidated fix pass): `rtpShort` was defined (see its
                      own doc comment above, "consolidates rugs+grid+RTP onto
                      ONE stats line") but never actually rendered here — the
                      only live RTP disclosure was one click deep in HOW TO
                      PLAY. Restored to the card face. */}
                  <span>
                    {rugs} rug{rugs === 1 ? '' : 's'} · {c.grid} · {c.rtpShort}
                  </span>
                  {/* BEST badge — gold, on EVERY world with a real cashed
                      record (RG-C5: config screen only). No record → no
                      badge, never faked. */}
                  {hasBest && (
                    <span style={styles.worldMetaBest}>
                      <span style={styles.worldMetaBestLabel}>BEST</span> {formatMultiplier(best!.bestMultiplierBps)}
                    </span>
                  )}
                </span>
              </span>
              <span style={styles.worldMaxAnchor}>
                <span style={{ ...styles.worldMaxValue, color: selected ? ac : T.textPrimary }}>
                  {formatMultiplier(worldMaxBps)}
                </span>
                <span style={styles.worldMaxLabel}>MAX</span>
              </span>
              {/* P2 — labelled rug-risk bar (fill = rugs÷tiles, T.danger). The
                  tiny "RISK" cue + a taller/more-opaque track make the danger
                  channel legible on its own, not a faint hairline. */}
              <span style={styles.worldRiskLabel} aria-hidden="true">
                RISK
              </span>
              <span style={styles.worldRiskBar}>
                <span style={{ ...styles.worldRiskFill, width: `${riskPct}%` }} />
              </span>
            </button>
          )
        })}
      </div>
      <RugsTuner controller={controller} compact={stacked} />
    </div>
  )
}

// ─── Rugs tuner (ITEM 4) — custom rug counts for BLUECHIPS + ALTSEASON ──────

/**
 * Per-mode "RUGS" stepper. Rendered OUTSIDE the mode-card <button>s (nested
 * buttons are invalid DOM) as a row beneath the world picker. Only BLUECHIPS
 * and ALTSEASON are tunable — SHITCOIN stays fixed at its default (its 24-rug
 * board IS its identity). The count is clamped to a sane per-mode band AND to
 * the global [1, totalTiles-1] safety rail. Because ITEM 4 threads the real
 * `state.mineCount` into `generateRoundSecrets`, this stepper is now
 * economically live (not cosmetic): the round, the ladder, the settle AND the
 * Glass Box receipt all use the value shown here.
 */
const RUG_BANDS: Partial<Record<VaultMode, { min: number; max: number }>> = {
  bluechips: { min: 1, max: 10 },
  altseason: { min: 3, max: 18 },
}

function RugsTuner({
  controller,
  compact,
}: {
  controller: VaultController
  /** RIGHT-COLUMN CONSOLIDATION (2026-07-03+3) — sibling of ModeSelector's
   *  `stacked` prop, threaded straight from it at the one call site that
   *  passes `stacked` (BetEntryGutterCards' <ModeSelector stacked>). Tightens
   *  `styles.rugsTuner`'s padding/gap via an inline override (base object
   *  left untouched — RugsTuner has only the one call site inside
   *  ModeSelector, but the override pattern still matches the rest of this
   *  compaction pass for consistency/reviewability). Omitted (falsy) for the
   *  mobile, non-stacked ModeSelector caller — byte-identical there. */
  compact?: boolean
}): ReactElement | null {
  const { state } = controller
  const band = RUG_BANDS[state.mode]
  // SHITCOIN (or any non-tunable mode) shows nothing — fixed by design.
  if (!band) return null
  const totalTiles = state.gridSize * state.gridSize
  const min = Math.max(1, band.min)
  const max = Math.min(band.max, totalTiles - 1)
  const count = state.mineCount
  const edgeBps = modeParams(state.mode).houseEdgeBps
  // Live first-tap multiplier — the number that visibly changes as you add rugs
  // (more rugs → each safe tap pays more). RTP is edge-fixed, so the payout-per-
  // tap curve is the honest live readout.
  const firstTapBps = multiplierAfterSafeTiles({
    totalTiles,
    mineCount: count,
    safeCount: 1,
    houseEdgeBps: edgeBps,
  })
  const setCount = (next: number): void => {
    controller.setMineCount(Math.max(min, Math.min(max, next)))
  }
  return (
    <div style={compact ? { ...styles.rugsTuner, padding: '5px 8px', gap: 2 } : styles.rugsTuner}>
      <div style={styles.rugsTunerHead}>
        <span style={styles.rugsTunerLabel}>RUGS</span>
        <span style={styles.rugsTunerHint}>
          per tap starts {formatMultiplier(firstTapBps)} · {totalTiles - count} safe
        </span>
      </div>
      <div style={styles.rugsStepper}>
        <button
          type="button"
          onClick={() => setCount(count - 1)}
          disabled={count <= min}
          style={count <= min ? styles.rugsStepBtnHitDisabled : styles.rugsStepBtnHit}
          aria-label="Fewer rugs"
        >
          <span style={count <= min ? styles.rugsStepBtnDisabled : styles.rugsStepBtn} aria-hidden="true">
            −
          </span>
        </button>
        <span style={styles.rugsStepValue}>
          {count} <span style={styles.rugsStepValueUnit}>rug{count === 1 ? '' : 's'}</span>
        </span>
        <button
          type="button"
          onClick={() => setCount(count + 1)}
          disabled={count >= max}
          style={count >= max ? styles.rugsStepBtnHitDisabled : styles.rugsStepBtnHit}
          aria-label="More rugs"
        >
          <span style={count >= max ? styles.rugsStepBtnDisabled : styles.rugsStepBtn} aria-hidden="true">
            +
          </span>
        </button>
      </div>
    </div>
  )
}

// ─── Exit-at selector (ITEM 3) — target-lock / auto-cash rule ──────────────

/** Auto-cash presets. All ≥ 1.20× (the provider's TARGET_MIN_BPS floor). */
const EXIT_PRESETS: readonly { label: string; value: bigint }[] = [
  { label: '1.5×', value: 15_000n },
  { label: '2×', value: 20_000n },
  { label: '3×', value: 30_000n },
  { label: '5×', value: 50_000n },
]

/**
 * "EXIT AT ×" chip row. Sets a per-round auto-cash target — the round banks
 * itself the moment the pump reaches it, via the identical settle path as a
 * manual TAKE PROFIT (RG-C5). OFF clears the rule. Usable in bet-entry AND
 * live during a round (same component, same handler).
 */
function ExitAtSelector({ controller }: { controller: VaultController }): ReactElement {
  const { state } = controller
  const active = state.targetMultiplierBps
  return (
    <div style={styles.exitBlock}>
      <div style={styles.gridHeader}>
        <span style={styles.gridLabel}>EXIT AT ×</span>
        <span style={styles.exitHint}>auto-bank when the pump hits it</span>
      </div>
      <div style={styles.exitRow}>
        <button
          type="button"
          onClick={() => controller.setTarget(null)}
          aria-pressed={active === null}
          style={active === null ? styles.exitChipSelected : styles.exitChip}
        >
          OFF
        </button>
        {EXIT_PRESETS.map((p) => {
          const selected = active === p.value
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => controller.setTarget(p.value)}
              aria-pressed={selected}
              style={selected ? styles.exitChipSelected : styles.exitChip}
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Auto-pick safety surface — RG-C8 structural plant ─────────────────────

function AutopickSafetySurface({ controller }: { controller: VaultController }): ReactElement {
  // V1: auto-pick is disabled (the toggle is a no-op). The safety promises
  // ship today so the player sees the RG-C8 surface even when the feature
  // is dark. Per VAULT-CRAFT-SPEC §7.2 / §17.
  void controller
  return (
    <div style={styles.autopickBlock}>
      <div style={styles.autopickHeader}>
        <span style={styles.autopickLabel}>AUTO-PICK</span>
        <span style={styles.autopickStatus}>PHASE 2</span>
      </div>
      <p style={styles.autopickCopy}>
        when auto-pick ships: max session loss is required (no default), cool-off after{' '}
        {AUTOPICK_COOLOFF_DEFAULT} losses triggers a 60s mandatory pause, and inter-round delay
        stays at 1.5s minimum.
      </p>
      <button
        type="button"
        onClick={controller.toggleAutopick}
        disabled
        style={styles.autopickButton}
        title="Auto-pick coming in Phase 2 · TUNE-AUTOPICK"
      >
        enable auto-pick (phase 2)
      </button>
    </div>
  )
}

// ─── Playing action bar (cash-out is always reachable — RG-C6) ────────────

function Playing({
  controller,
  isWide,
}: {
  controller: VaultController
  isWide: boolean
}): ReactElement {
  const { state } = controller
  const potentialPayout = settlePayout(state.wagerLamports, state.cumulativeMultiplierBps)
  const canCashOut = state.revealedTiles.length > 0
  // Decision-pressure styling:
  //   • mul > 1.5x → cash-out button enters the "dramatic" register (larger
  //     font + breathing glow). This is the "lock it in" moment the
  //     decision-per-tap mechanic dramatises.
  //   • mul ≥ 1.0x but ≤ 1.5x → standard reachable register.
  // RG-C5 SAFE: the trigger is the CURRENT multiplier (an economic value),
  // not the streak length. A 1.6x reached on the first reveal (mineCount 24)
  // shows the same dramatic style as 1.6x reached on the 18th reveal.
  const dramatic = state.cumulativeMultiplierBps > 15_000n
  // RG-C6 STRUCTURAL: this layout is invariant during `playing`. The cash-out
  // button is rendered unconditionally in `actionBarRight`, sized large, in
  // the player's thumb-zone exit corner. The button is `disabled` until ≥1
  // safe reveal exists (you cannot cash out at 1.00x; nothing to take), but
  // it is ALWAYS RENDERED, never hidden. Audit: the `actionBarRight` slot
  // contains a single button reference; there is no conditional that swaps
  // it out for another element during `playing`. The `dramatic` styling
  // adjustment changes APPEARANCE (size/glow), never REACHABILITY — the
  // button stays in the same DOM position with the same handler.
  const buttonStyle = !canCashOut
    ? styles.cashOutButtonDisabled
    : dramatic
      ? styles.cashOutButtonDramatic
      : styles.cashOutButton

  // ── TRAIL (path betting) UI state ──────────────────────────────────────
  const running = state.autoActive
  // A trail is "pending" once you've painted one (hold/drag) but not yet run it.
  const trailPending = state.trail.length > 0 && !running
  // BUG FIX (2026-07-02, swoobz-game-flow-qa long-trail blank-screen crash):
  // `state.trail` is NOT shrunk as the cascade consumes it — it only clears
  // in one shot on full completion (vaultProvider.ts's TRAIL setInterval
  // driver) — so `revealedTiles` and `trail` OVERLAP mid-cascade. Naively
  // summing their lengths double-counts already-revealed trail tiles.
  // (1) De-dupe: count revealed tiles plus only the PLANNED trail tiles not
  //     already revealed, instead of the raw union-unsafe sum.
  // (2) Fail-closed: clamp to the exact bound vaultMath.ts's own throw
  //     condition enforces (`safeCount + mineCount > totalTiles`), mirroring
  //     the invariant directly so this preview can never hit that throw —
  //     structurally safe rather than reactively catching it. Chosen over a
  //     try/catch (the sibling fail-closed pattern in vaultProvider.ts's
  //     `revealTile()`) because this is a pure render-time derivation with
  //     no natural "last valid value" to fall back to without adding a ref
  //     just to hold one; the clamp needs no extra state and is provably
  //     correct for every input, not just the cases exercised so far.
  const trailTotalTiles = state.gridSize * state.gridSize
  const trailMaxSafeTiles = trailTotalTiles - state.mineCount
  const revealedForTrail = new Set(state.revealedTiles)
  const distinctPlannedSafeCount =
    state.revealedTiles.length +
    state.trail.filter((tileIdx) => !revealedForTrail.has(tileIdx)).length
  const trailSafeCount = Math.min(distinctPlannedSafeCount, trailMaxSafeTiles)
  const trailTargetBps =
    state.trail.length > 0
      ? multiplierAfterSafeTiles({
          totalTiles: trailTotalTiles,
          mineCount: state.mineCount,
          // include any already-open tiles — the trail reveals ON TOP of
          // them, so the final multiplier is for (revealed + remaining-
          // trail) DISTINCT safe tiles, clamped to the board's safe-tile
          // ceiling (see comment above).
          safeCount: trailSafeCount,
          houseEdgeBps: modeParams(state.mode).houseEdgeBps,
        })
      : ONE_X_BPS
  const trailTargetPayout = settlePayout(state.wagerLamports, trailTargetBps)
  const trailCount = state.trail.length
  const subText = running
    ? 'running your trail · one rug ends it…'
    : trailPending
      ? `${trailCount} tile${trailCount === 1 ? '' : 's'} set · GO reveals them all (a rug ends it) · tap to adjust`
      : state.trailMode
        ? 'hold + drag over tiles to plan a path · then GO'
        : 'crack a compartment open · or take profit'

  // BOTTOM-BAR PIVOT (2026-07-03) — desktop 3-column bottom bar: status/stats
  // | session pulse | actions (CLEAR+pace+GO, or MANUAL|TRAIL+TAKE PROFIT).
  const actionBarStyle: CSSProperties = {
    ...styles.actionBar,
    ...(isWide ? { flexDirection: 'row', alignItems: 'stretch', padding: VBG.barPadding, gap: VBG.gap } : null),
  }
  const actionBarLeftStyle: CSSProperties = {
    ...styles.actionBarLeft,
    // VBG col1 — top-aligned, trailing hairline (see Lobby's `lobbyHeroStyle`
    // comment for the shared divider grammar).
    ...(isWide
      ? { flex: '1.3 1 0%', minWidth: 0, borderRight: VBG.divider, paddingRight: VBG.dividerInset }
      : null),
  }
  const actionBarRightStyle: CSSProperties = {
    ...styles.actionBarRight,
    // VBG col3 (LAST) — top-aligned, no border (only col1/col2 carry the
    // trailing hairline in the VBG grammar).
    ...(isWide ? { flex: '1.2 1 0%', minWidth: 0 } : null),
  }

  return (
    <div className="vault-actionbar" style={actionBarStyle}>
      <div style={actionBarLeftStyle}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: trailPending ? T.bag : T.accent }}>
            {running
              ? 'RUNNING TRAIL'
              : trailPending
                ? 'TRAIL READY'
                : state.trailMode
                  ? 'PLAN YOUR TRAIL'
                  : 'PUMPING'}
          </span>
          <span style={styles.actionBarSub}>{subText}</span>
        </div>
        <div style={styles.actionBarInfo}>
          <Stat
            label="Pump"
            value={formatMultiplier(state.cumulativeMultiplierBps)}
            valueColor={state.cumulativeMultiplierBps > ONE_X_BPS ? T.accent : T.textPrimary}
            emphasis
          />
          <Stat label="Bag now" value={formatUsdc(potentialPayout)} valueColor={T.bag} emphasis />
          {/* Persistent risk readout — the rug count was invisible during play,
              so the danger of the next tap was unreadable (jesse fix). */}
          <Stat label="Rugs" value={`${state.mineCount}`} valueColor={T.danger} />
          {/* ITEM 3 — live target-lock chip so the auto-cash rule is always
              visible while it's armed. Tappable OFF-ramp lives in the toggle. */}
          {state.targetMultiplierBps !== null && (
            <button
              type="button"
              onClick={() => controller.setTarget(null)}
              style={styles.exitLiveChip}
              aria-label={`Auto-exit armed at ${formatMultiplier(state.targetMultiplierBps)} · tap to disable`}
            >
              <span style={styles.exitLiveDot} aria-hidden="true" />
              EXIT @ {formatMultiplier(state.targetMultiplierBps)}
            </button>
          )}
        </div>
      </div>
      {/* Bottom-bar middle "pulseColumn" REMOVED (2026-07-03, VAULT
          SIDE-MARGIN CHROME) — SidebarPulseStrip now lives in the
          left-gutter Card A instead, so this bar is lighter: status/stats |
          actions — two columns. Divider grammar holds automatically:
          `actionBarLeftStyle` keeps its trailing hairline (now the row's
          only non-last column), `actionBarRightStyle` (last) stays clean. */}
      <div className="vault-actionbar-actions" style={actionBarRightStyle}>
        {trailPending ? (
          <>
            {/* A trail is painted (hold/drag) — clear it, or GO run it. */}
            <button
              type="button"
              onClick={controller.clearTrail}
              style={styles.autoButton}
              aria-label="Clear the trail"
            >
              ✕ CLEAR
            </button>
            {/* reveal pace — staggered (default) vs instant. TRAIL-only,
                mirrors the MANUAL/TRAIL segmented toggle's click pattern
                (tap the inactive tab to flip). Presentation-pacing only —
                no payout/EV change either way. */}
            {state.trailMode && (
              <div style={styles.pacePillWrap}>
                <span style={styles.pacePillLabel}>reveal pace</span>
                <div style={styles.pacePillGroup} role="group" aria-label="Reveal pace">
                  <button
                    type="button"
                    onClick={() => state.revealPace !== 'staggered' && controller.toggleRevealPace()}
                    aria-pressed={state.revealPace === 'staggered'}
                    style={
                      state.revealPace === 'staggered' ? styles.pacePillActive : styles.pacePillInactive
                    }
                  >
                    staggered
                  </button>
                  <button
                    type="button"
                    onClick={() => state.revealPace !== 'instant' && controller.toggleRevealPace()}
                    aria-pressed={state.revealPace === 'instant'}
                    style={
                      state.revealPace === 'instant' ? styles.pacePillActive : styles.pacePillInactive
                    }
                  >
                    instant
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={controller.runTrail}
              aria-label={`Run your trail of ${state.trail.length} tiles for ${formatUsdc(trailTargetPayout)}`}
              style={styles.cashOutButton}
            >
              <span style={styles.cashOutLabel}>{`GO ▶ ${state.trail.length}`}</span>
              <span style={styles.cashOutSub}>
                {`${formatUsdc(trailTargetPayout)} · ${formatMultiplier(trailTargetBps)}`}
              </span>
            </button>
          </>
        ) : (
          <>
            {/* STOP while running; else a MANUAL | TRAIL play-style toggle. */}
            {running ? (
              <button
                type="button"
                onClick={controller.toggleAuto}
                aria-pressed
                aria-label="Stop the trail"
                style={styles.autoButtonActive}
              >
                STOP ⚡
              </button>
            ) : (
              <div style={styles.modeToggle} role="group" aria-label="Play style">
                <button
                  type="button"
                  onClick={() => state.trailMode && controller.toggleTrailMode()}
                  aria-pressed={!state.trailMode}
                  style={!state.trailMode ? styles.modeToggleActive : styles.modeToggleInactive}
                >
                  MANUAL
                </button>
                <button
                  type="button"
                  onClick={() => !state.trailMode && controller.toggleTrailMode()}
                  aria-pressed={state.trailMode}
                  style={state.trailMode ? styles.modeToggleActive : styles.modeToggleInactive}
                >
                  TRAIL
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={controller.cashOut}
              disabled={!canCashOut}
              aria-label={`Take profit ${formatUsdc(potentialPayout)} at ${formatMultiplier(state.cumulativeMultiplierBps)}`}
              // RG-C6 audit: the same DOM button, same onClick handler, same slot.
              // The style branch only changes visuals. No alternate-component swap.
              style={buttonStyle}
              className={
                dramatic ? 'vault-cashout-dramatic vault-press' : 'vault-press'
              }
            >
              <span style={dramatic ? styles.cashOutLabelDramatic : styles.cashOutLabel}>
                {canCashOut ? 'TAKE PROFIT' : 'take profit'}
              </span>
              <span style={styles.cashOutSub}>
                {canCashOut
                  ? `${formatUsdc(potentialPayout)} · ${formatMultiplier(state.cumulativeMultiplierBps)}`
                  : 'crack one open first'}
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Mine-hit action bar (brief informational state) ──────────────────────

/**
 * RG-C3 STRUCTURAL: this component accepts ONLY `mineTileIdx`. There is
 * intentionally NO `mineBitmap`, NO `revealedTiles`, NO `hiddenMineCount`
 * prop. The type system makes a near-miss surface impossible here. The
 * mine reveal is a single factual sentence — the player tapped this tile,
 * it was a mine, round closed.
 *
 * The settled receipt (which IS allowed to surface the post-round audit)
 * receives different props.
 */
interface MineHitActionBarProps {
  mineTileIdx: number
}

function MineHitActionBar({ mineTileIdx }: MineHitActionBarProps): ReactElement {
  return (
    <div style={styles.actionBar} aria-live="assertive">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: T.danger }}>RUGGED</span>
          <span style={styles.actionBarSub}>compartment {mineTileIdx + 1} hid a rug: settling</span>
        </div>
      </div>
      <div style={styles.actionBarRight}>
        <span className="vault-spinner" style={styles.spinner} aria-hidden="true" />
      </div>
    </div>
  )
}

// ─── Settling (transient) ──────────────────────────────────────────────────

function Settling(): ReactElement {
  return (
    <div style={styles.actionBar} aria-live="assertive">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={styles.actionBarEyebrow}>SETTLING</span>
          <span style={styles.actionBarSub}>verifying the round seed on-chain</span>
        </div>
      </div>
      <div style={styles.actionBarRight}>
        <span className="vault-spinner" style={styles.spinner} aria-hidden="true" />
      </div>
    </div>
  )
}

// ─── Settlement (Glass Box) ────────────────────────────────────────────────

interface SettlementProps {
  controller: VaultController
  outcome: VaultOutcome
  isWide: boolean
  // Shared with every other BET AGAIN call site — see VaultExperience's
  // header comment where these are defined. Do NOT recompute a local copy
  // here; that reopened the exact drift risk this extraction closes.
  insufficient: boolean
  onBetAgain: () => void
  /**
   * "bet again · same trail" preset (2026-07-02) — places ONE bet, then
   * loads the last committed trail back into planning (no auto-run). See
   * the `nextTier` render below for the gating condition (`canReuseTrail`).
   */
  onBetAgainSamePattern: () => void
  // Settled receipt state — LIFTED to VaultExperience (VAULT SIDE-MARGIN
  // CHROME, 2026-07-03). Was local useState here; now shared with the
  // right-gutter Card C (the collapsed verified-receipt chip, mounted as a
  // canvas-shell sibling) via the SAME boolean/verify result, threaded
  // through PhaseSurface. See VaultExperience's own header comment where
  // these are defined for the full rationale.
  verifyState: 'verifying' | 'matched' | 'mismatched'
  expanded: boolean
  onToggleExpanded: () => void
}

function Settlement({
  controller,
  outcome,
  isWide,
  insufficient,
  onBetAgain,
  onBetAgainSamePattern,
  verifyState,
  expanded,
  onToggleExpanded,
}: SettlementProps): ReactElement {
  const { state } = controller
  const won = outcome.won
  const headlineBps = outcome.finalMultiplierBps
  const deltaLamports = won ? outcome.payoutLamports - outcome.wagerLamports : outcome.wagerLamports
  const deltaSign = won ? '+' : '-'
  const pointsEarned = pointsForBet(outcome.wagerLamports, won)
  const pointsMultLabel = won ? '1.0x on the win' : '1.5x loss-amplified'

  // RG-C3 POST-SETTLEMENT AUDIT RENDER: the receipt expresses the hidden
  // mine count as a single number ("X mines stayed sealed"), NEVER as a
  // tile-by-tile counterfactual layout. The mineBitmap is iterated to
  // produce a count only.
  const totalMines = outcome.mineBitmap.filter((b) => b).length
  const revealedMines = outcome.mineTileIdx !== null ? 1 : 0
  const sealedMines = totalMines - revealedMines

  // BOTTOM-BAR PIVOT (2026-07-03) — desktop 3-column bottom bar: RESULT |
  // META+TREND | NEXT BET+links. Mobile is unchanged (single stacked panel,
  // DOM order RESULT → META → NEXT → links, byte-identical to before).
  const settledPanelStyle: CSSProperties = {
    ...styles.settledPanel,
    ...(isWide ? { flexDirection: 'row', alignItems: 'stretch', padding: VBG.barPadding, gap: VBG.gap } : null),
  }
  const resultTierStyle: CSSProperties = {
    ...styles.settledResult,
    // VBG col1 — top-aligned, trailing hairline (shared divider grammar,
    // see Lobby's `lobbyHeroStyle` comment).
    ...(isWide
      ? { flex: '1.4 1 0%', minWidth: 0, borderRight: VBG.divider, paddingRight: VBG.dividerInset }
      : null),
  }
  // Tier 1 — the RESULT: what happened, big and clear.
  const resultTier = (
    <div style={resultTierStyle}>
      <span style={{ ...styles.settledEyebrow, color: won ? T.accent : T.danger }}>
        {settlementEyebrow(won)}
      </span>
      <span style={{ ...styles.settledNarrative, color: won ? T.accent : T.danger }}>
        {won
          ? outcome.cashedViaTarget
            ? targetLockNarrative(headlineBps)
            : settlementNarrative(headlineBps, won)
          : degenRugNudge(outcome.wagerLamports + BigInt(outcome.revealedTiles.length))}
      </span>
      <div style={styles.settledResultRow}>
        <span style={{ ...styles.settledResultBig, color: won ? T.accent : T.danger }}>
          {won ? formatMultiplier(headlineBps) : 'BUST'}
        </span>
        <span style={{ ...styles.settledResultDelta, color: won ? T.accent : T.danger }}>
          {deltaSign}
          {formatUsdc(deltaLamports)}
        </span>
        <span style={styles.settledResultCtx}>
          {won
            ? `${outcome.revealedTiles.length} pumped`
            : `${outcome.revealedTiles.length} before the rug`}
        </span>
      </div>
    </div>
  )

  // Tier 2 — quiet meta strip (points · MOON · fairness). Dim + separated
  // so it never competes with the result or the next-bet CTA. On desktop
  // this now opens its OWN column (settledColMeta) rather than continuing
  // the vertical stack under RESULT, so the old separating hairline (which
  // belonged to the stacked layout) is dropped for isWide only.
  const metaTierStyle: CSSProperties = {
    ...styles.settledMeta,
    ...(isWide ? { borderTop: 'none', paddingTop: 0 } : null),
  }
  const metaTier = (
    <div style={metaTierStyle}>
      <span style={styles.settledPointsValue}>+{formatPoints(pointsEarned)}</span>
      <span style={styles.settledMetaDim}>pts · {pointsMultLabel}</span>
      {outcome.moonPayoutLamports > 0n && (
        <span style={{ ...styles.settledMetaDim, color: '#FFB000' }}>
          · 🌙 +{formatUsdc(outcome.moonPayoutLamports)}
        </span>
      )}
      <span style={styles.settledMetaSpacer} />
      {/* The "✓ verified" chip + "view receipt ↓" toggle MOVED to the
          right-gutter Card C (VaultGutterCards, mounted as a canvas-shell
          sibling) — VAULT SIDE-MARGIN CHROME, 2026-07-03 — but ONLY on
          isWide (the gutters are `isWide`-gated, mobile <960 renders no new
          gutter DOM per spec). Mobile keeps the ORIGINAL inline chip+toggle
          here, byte-identical to before, so the receipt stays reachable on
          the primary surface. */}
      {!isWide && verifyState === 'matched' && (
        <>
          <span style={styles.settledVerifyChip}>
            <span aria-hidden="true">✓</span> verified
          </span>
          <button
            type="button"
            className="vault-receipt-toggle"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-controls="vault-settled-receipt"
            style={styles.settledVerifyToggle}
          >
            {expanded ? 'hide receipt ↑' : 'view receipt ↓'}
          </button>
        </>
      )}
      {verifyState === 'verifying' && <span style={styles.settledVerifyText}>verifying…</span>}
      {verifyState === 'mismatched' && (
        <span style={styles.settlementVerifyMismatch}>⚠ mismatch · recheck seed</span>
      )}
    </div>
  )

  // SESSION PULSE (SidebarPulseStrip) — moved OUT of the Lobby/Playing bottom
  // bars entirely as of VAULT SIDE-MARGIN CHROME (2026-07-03): it now lives
  // in the LEFT-gutter Card A (VaultGutterCards), shown whenever
  // phase.kind !== 'settled'. It was already absent from the Settled panel
  // (2026-07-02 removal, see prior history). SESSION TREND
  // (`SessionTrendSpark`) ALSO relocated — it now lives in the RIGHT-gutter
  // Card B, settled-only, same >=2-round / <MAX_HISTORY gate as before; the
  // settled panel no longer renders it directly (see `settledColMeta` below —
  // `sparkTier`/`settledPulseFill` are retired).

  // "bet again · same trail" preset (2026-07-02) — only offered when the
  // player actually committed a trail last round (via runTrail()) AND the
  // board hasn't changed shape since (tile indices don't map across grid
  // sizes). Reads straight off provider state; no extra prop needed.
  const canReuseTrail = state.lastTrail.length > 0 && state.lastTrailGridSize === state.gridSize

  // FIX 3 (2026-07-04) — Tim-approved: BET AGAIN follows the loss color
  // state on the settled screen instead of staying pump-green on a rug,
  // "for parity" across mobile + desktop (explicit brief instruction — the
  // rest of this same panel already commits fully to the red register on a
  // loss via `won ? T.accent : T.danger`, resultTier/metaTier above). Reuses
  // the EXISTING T.danger token, no new color, no timer/animation.
  const betAgainStyle: CSSProperties = {
    ...(insufficient ? styles.settledBetAgainDisabled : styles.settledBetAgain),
    flex: 1,
    ...(won || insufficient ? null : { background: T.danger }),
  }

  // Tier 3 — NEXT ROUND: a compact wager nudge + the single BET AGAIN CTA,
  // in the bet-console material, plus an optional SECOND full-width row (the
  // "bet again · same trail" preset) directly beneath it. Full control via
  // "change mode". BET AGAIN reachability fix (2026-07-02): on desktop this
  // tier now renders directly under Tier 1 RESULT (see the `isWide` branch
  // in the return below), so it uses `settledNextTop` (no `margin-top:
  // auto`) instead of `settledNext`. Mobile keeps the original `settledNext`
  // style + position. Both style objects are now COLUMN containers (one
  // fixed row + one optional row) instead of a single row — the row's own
  // layout moved to the new `settledNextRow` style so the outer
  // `settledNext`/`settledNextTop` element (and its border-top / margin-top:
  // auto bottom-pin job) stays the exact same DOM node it always was.
  const nextTier = (
    <div style={isWide ? styles.settledNextTop : styles.settledNext}>
      <div style={styles.settledNextRow}>
        <div style={styles.settledNextWager}>
          <span style={styles.settledWagerLabel}>NEXT BET</span>
          <div style={styles.settledWagerWindow}>
            <button
              type="button"
              onClick={() => controller.setWager(stepWagerDown(state.wagerLamports))}
              style={styles.settledStepBtn}
              aria-label="Decrease next bet"
            >
              −
            </button>
            <AnimatedUsdc lamports={state.wagerLamports} style={styles.consoleWagerValue} />
            <button
              type="button"
              onClick={() => controller.setWager(stepWagerUp(state.wagerLamports))}
              style={styles.settledStepBtn}
              aria-label="Increase next bet"
            >
              +
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onBetAgain}
          disabled={insufficient}
          className="vault-press"
          style={betAgainStyle}
          aria-label={`Bet again, ${formatUsdc(state.wagerLamports)}`}
        >
          bet again →
        </button>
      </div>
      {canReuseTrail && (
        <button
          type="button"
          onClick={onBetAgainSamePattern}
          disabled={insufficient}
          className="vault-press"
          style={settledSecondaryOutlineStyle(won, insufficient)}
          aria-label={`Bet again with the same trail pattern, ${formatUsdc(state.wagerLamports)}`}
        >
          bet again · same trail →
        </button>
      )}
    </div>
  )

  // BOTTOM-BAR PIVOT (2026-07-03): `settledLinksBottom` (the old desktop
  // margin-top:auto bottom-pin variant) is retired — the panel no longer
  // stretches to board height, so plain `settledLinks` is correct on every
  // viewport now.
  const linksTier = (
    <div style={styles.settledLinks}>
      <button type="button" onClick={controller.acknowledgeSettlement} style={styles.settledChangeButton}>
        new setup ↗
      </button>
      <button
        type="button"
        onClick={() => shareVaultResult(won, headlineBps, deltaLamports, outcome)}
        style={styles.settledShareButton}
        aria-label="Share this result"
      >
        share ↗
      </button>
    </div>
  )

  return (
    <div
      style={settledPanelStyle}
      data-testid="vault-settledpanel"
      aria-live="polite"
      aria-label={
        won
          ? `Took profit at ${formatMultiplier(headlineBps)}, won ${formatUsdc(deltaLamports)}`
          : `Rugged at ${formatMultiplier(headlineBps)}, lost ${formatUsdc(deltaLamports)}`
      }
    >
      {resultTier}
      {isWide ? (
        <>
          {/* BOTTOM-BAR PIVOT (2026-07-03): the settled panel is now 3
              side-by-side columns — RESULT (above, Kol1) | META+TREND (Kol2)
              | NEXT BET+links (Kol3) — instead of a single stacked column
              stretched to board height. Kol2 groups the quiet meta strip
              with the SESSION TREND fill module; Kol3 groups the NEXT BET
              CTA(s) with the footer links, so BET AGAIN still opens its own
              column right next to RESULT (shortest reach from "what
              happened" to "go again"), same reachability intent as before,
              now expressed as a column instead of a top-of-stack reorder. */}
          <div style={styles.settledColMeta}>
            {metaTier}
          </div>
          <div style={styles.settledColNext}>
            {nextTier}
            {linksTier}
          </div>
        </>
      ) : (
        <>
          {/* Mobile — RESULT → META → NEXT ROUND (bottom-pinned via
              settledNext's margin-top:auto, inert on mobile per that style's
              own comment) → LINKS. Byte-identical DOM order to before the
              BOTTOM-BAR PIVOT — this branch is untouched. */}
          {metaTier}
          {nextTier}
          {linksTier}
        </>
      )}
      {/* ITEM 2 — SESSION ARC. When the history buffer fills (MAX_HISTORY),
          surface a single non-blocking natural-close beat: a compact session
          summary + CLOSE THE VAULT. NOT a modal — "bet again" above stays fully
          live, so a player who wants to keep going has zero friction. Kept in
          the green/red/gold economy (no cyan). RG-C5: no celebration envelope
          here — it's a quiet ledger readout, identical regardless of session. */}
      {state.history.length >= MAX_HISTORY && (
        <SessionSummaryBeat controller={controller} />
      )}
      {insufficient && (
        <span style={{ ...styles.settlementHelp, gridColumn: '1 / -1' }}>
          balance below {formatUsdc(state.wagerLamports)}, lower your wager to continue.
        </span>
      )}
      {expanded && verifyState === 'matched' && (
        <div id="vault-settled-receipt" style={{ ...styles.settledReceipt, gridColumn: '1 / -1' }}>
          <p style={styles.settledReceiptSummary}>
            derived from <code style={styles.settlementHex}>{shortHex(outcome.serverSeedHex)}</code>{' '}
            seed + <code style={styles.settlementHex}>{shortHex(outcome.serverSeedHashHex)}</code>{' '}
            commitment
          </p>
          <dl style={styles.settlementReceiptRows}>
            <Row label="round id" value={outcome.roundIdHex} />
            <Row label="server seed hash" value={outcome.serverSeedHashHex} />
            <Row label="server seed" value={outcome.serverSeedHex} />
            {/* FIX #7 (2026-07-07) — "mixer" row REMOVED. `outcome.mixerHex` is
                sha256('swoobz-originals-vault-v1-mock'), a CONSTANT identical
                every round; it plays zero role in the real mine derivation or
                client verification (both key off the hardcoded 'VAULTILE' tag,
                vaultProvider.ts lines 340/398, verify call below) — showing it
                on a fairness/provable-fairness surface was misleading. */}
            <Row label="grid" value={`${outcome.gridSize}×${outcome.gridSize}`} />
            <Row label="rugs" value={String(outcome.mineCount)} />
            <Row label="safe tiles revealed" value={String(outcome.revealedTiles.length)} />
            <Row label="reveal trace" value={outcome.revealedTiles.join(' → ')} />
            {/* RG-C3 STRUCTURAL: hidden rug count as a single number, NEVER
                as a tile-by-tile layout. The full bitmap is in the audit
                record for the verifier, but the human-readable receipt
                expresses it as "X rugs stayed sealed." (terminology unified to
                "rug" — jesse fix) */}
            <Row
              label="rugs that stayed sealed"
              value={`${sealedMines} of ${outcome.mineCount}`}
            />
            {outcome.mineTileIdx !== null && (
              <Row label="rug struck" value={`tile ${outcome.mineTileIdx + 1}`} />
            )}
          </dl>
        </div>
      )}
    </div>
  )
}

// ─── Session summary beat (ITEM 2 — natural close at the history cap) ──────

/**
 * A compact, NON-BLOCKING session-arc beat. Renders inline in the settled
 * surface once history hits MAX_HISTORY. Reads the session's history rows for
 * best multiplier, win/loss tally and net P&L, and offers CLOSE THE VAULT
 * beside the (still-live) bet-again. Green/gold/red economy only.
 */
function SessionSummaryBeat({ controller }: { controller: VaultController }): ReactElement {
  const { state } = controller
  const rows = state.history
  let bestBps = 0n
  let won = 0
  let lost = 0
  let netLamports = 0n
  for (const r of rows) {
    if (r.won) {
      won += 1
      if (r.finalMultiplierBps > bestBps) bestBps = r.finalMultiplierBps
    } else {
      lost += 1
    }
    netLamports += r.payoutLamports - r.wagerLamports
  }
  const netPositive = netLamports >= 0n
  const netColor = netPositive ? T.accent : T.danger
  const netSign = netPositive ? '+' : '-'
  const netAbs = netPositive ? netLamports : -netLamports

  return (
    <div style={{ ...styles.sessionBeat, gridColumn: '1 / -1' }} aria-live="polite">
      <div style={styles.sessionBeatLead}>
        <span style={styles.sessionBeatEyebrow}>SESSION FULL · {rows.length} ROUNDS</span>
        <span style={styles.sessionBeatHint}>a clean stopping point · or keep going</span>
      </div>
      <div style={styles.sessionBeatStats}>
        <div style={styles.sessionStat}>
          <span style={styles.sessionStatLabel}>BEST</span>
          <span style={{ ...styles.sessionStatValue, color: T.bag }}>
            {bestBps > ONE_X_BPS ? formatMultiplier(bestBps) : '–'}
          </span>
        </div>
        <div style={styles.sessionStat}>
          <span style={styles.sessionStatLabel}>WON · LOST</span>
          <span style={styles.sessionStatValue}>
            <span style={{ color: T.accent }}>{won}</span>
            <span style={{ color: T.textDim }}> · </span>
            <span style={{ color: T.danger }}>{lost}</span>
          </span>
        </div>
        <div style={styles.sessionStat}>
          <span style={styles.sessionStatLabel}>NET</span>
          <span style={{ ...styles.sessionStatValue, color: netColor }}>
            {netSign}
            {formatUsdc(netAbs)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={controller.closeVault}
        style={styles.closeVaultButton}
        aria-label="Close the vault and start a fresh session"
      >
        CLOSE THE VAULT ↺
      </button>
    </div>
  )
}

// ─── Verify helper (Glass Box auto-verify on settled mount) ────────────────

/**
 * Re-derive the mine bitmap from the revealed server seed and confirm it
 * matches the outcome's bitmap. Same Fisher-Yates as `vaultProvider`'s
 * `deriveMineBitmap`, run client-side as the trust attestation.
 */
async function verifyMineBitmap(outcome: VaultOutcome): Promise<boolean> {
  const serverSeed = hexToBytes(outcome.serverSeedHex)
  if (serverSeed.length !== 32) return false
  const totalTiles = outcome.gridSize * outcome.gridSize
  const mixerTag = new TextEncoder().encode('VAULTILE')

  const positions = new Array<number>(totalTiles)
  for (let i = 0; i < totalTiles; i++) positions[i] = i
  for (let step = 0; step < totalTiles; step++) {
    const stepBuf = new Uint8Array(8)
    let v = BigInt(step)
    for (let i = 0; i < 8; i++) {
      ;(stepBuf as Uint8Array)[i] = Number(v & 0xffn)
      v >>= 8n
    }
    const concat = new Uint8Array(serverSeed.length + mixerTag.length + 8)
    concat.set(serverSeed, 0)
    concat.set(mixerTag, serverSeed.length)
    concat.set(stepBuf, serverSeed.length + mixerTag.length)
    const hashBuf = await crypto.subtle.digest('SHA-256', concat)
    const hash = new Uint8Array(hashBuf)
    let raw = 0n
    for (let i = 0; i < 8; i++) raw |= BigInt(hash[i]!) << BigInt(8 * i)
    const remaining = BigInt(totalTiles - step)
    const swapOffset = Number(raw % remaining)
    const swapIndex = step + swapOffset
    const tmp = positions[step]!
    positions[step] = positions[swapIndex]!
    positions[swapIndex] = tmp
  }
  const derived = new Array<boolean>(totalTiles).fill(false)
  for (let i = 0; i < outcome.mineCount; i++) {
    derived[positions[i]!] = true
  }
  for (let i = 0; i < totalTiles; i++) {
    if (derived[i] !== outcome.mineBitmap[i]) return false
  }
  return true
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('odd-length hex')
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    ;(out as Uint8Array)[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16)
  }
  return out
}

function shortHex(hex: string): string {
  if (hex.length <= 22) return hex
  return `${hex.slice(0, 10)}…${hex.slice(-10)}`
}

// ─── Share intent (text+link) ──────────────────────────────────────────────

function shareVaultResult(
  won: boolean,
  headlineBps: bigint,
  deltaLamports: bigint,
  outcome: VaultOutcome,
): void {
  // Share text — evocative, player-voice, factual. Carries the per-round
  // position (X of Y safe tiles tapped) so the share reads as a discipline
  // moment, not a casino brag. Brand register: "quiet expert at the table."
  // RG-C2: share intent ONLY surfaces on a confirmed cash-out (won === true);
  // a lost round shares a neutral "opening another" line, never a near-miss.
  const mult = formatMultiplier(headlineBps)
  const safeTilesTapped = outcome.revealedTiles.length
  const totalSafe = outcome.gridSize * outcome.gridSize - outcome.mineCount
  const amount = formatUsdc(deltaLamports)
  const text = won
    ? `Locked in ${mult} on Rug or Riches · ${safeTilesTapped} of ${totalSafe} compartments cracked (+${amount}). provably fair. swoobz.com/originals/vault`
    : `vault closed at ${mult} · opening another. swoobz.com/originals/vault`
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    navigator.share({ text }).catch(() => openTwitterIntent(text))
  } else {
    openTwitterIntent(text)
  }
}

function openTwitterIntent(text: string): void {
  if (typeof window === 'undefined') return
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

// ─── History strip ─────────────────────────────────────────────────────────

function HistoryStrip({
  rows,
}: {
  rows: { finalMultiplierBps: bigint; won: boolean }[]
}): ReactElement {
  if (rows.length === 0) return <></>
  const visible = rows.slice(0, 14)
  return (
    <div style={styles.historyStrip} aria-label="recent rounds">
      <span style={styles.historyLabel}>recent</span>
      {visible.map((r, i) => {
        const ageAlpha = 1 - (i / Math.max(1, visible.length)) * 0.5
        const accentTint = `rgba(0, 230, 118, ${0.18 * ageAlpha})`
        const accentBorder = `rgba(0, 230, 118, ${0.32 * ageAlpha})`
        const lossTint = `rgba(255, 255, 255, ${0.04 * ageAlpha})`
        return (
          <span
            key={i}
            style={{
              ...styles.historyChip,
              background: r.won ? accentTint : lossTint,
              // Loss carries NO green/positive signal — red BUST mark, not the
              // pre-rug multiplier (mirrors the settlement honesty). jesse nit.
              color: r.won ? T.accent : `rgba(255, 77, 77, ${0.7 * ageAlpha})`,
              borderColor: r.won ? accentBorder : T.borderSubtle,
              opacity: ageAlpha,
            }}
            title={
              r.won
                ? `cashed out at ${formatMultiplier(r.finalMultiplierBps)}`
                : `vault closed, busted`
            }
          >
            {i === 0 && (
              <span
                style={{ ...styles.historyTick, background: r.won ? T.accentSolid : T.danger }}
                aria-label="most recent"
              />
            )}
            {r.won ? formatMultiplier(r.finalMultiplierBps) : '✗'}
          </span>
        )
      })}
    </div>
  )
}

// ─── Sidebar pulse strip — the composed FILL module for the desktop sidebar ─
//
// PANEL-HOLLOWNESS FIX (Tim: right sidebar "ziet er niet uit / komt niet
// mooi samen" — RUGGED/settled panel dead-void, PUMPING mid-panel gap). The
// prior approach gave `controlCard` / `actionBar` / `settledPanel` a
// `flex: 1` + `justifyContent: 'space-evenly'` treatment to "fill the
// sidebar" — on a tall board column that just stretches 2-3 sparse content
// blocks across the full height with big EMPTY gaps between them. That IS
// the hollow look (composition-designer anti-pattern: stretched whitespace
// is not composition).
//
// This component is the real fill: a bounded, framed "console module" (own
// background/border/padding, like a physical instrument gauge inset into the
// panel) that reads as intentional at any height it's given, rather than raw
// background showing through. It's a compact SESSION DASHBOARD — a 3-up
// stat row (BEST · WON-LOST · NET, reusing the exact `sessionStat` visual
// language already shipped in SessionSummaryBeat, so this doesn't invent a
// new material) top-anchored under the module label, plus a rug-trail of
// recent round chips (same chip visual language as the footer HistoryStrip —
// no new color, no new material). Showing real stat labels even at zero
// rounds ("—" placeholders, not an apologetic empty sentence) keeps the
// module reading as a genuine dashboard on the very first round of a fresh
// session — the exact moment Tim's reference screenshots (R0001/R0002)
// caught the hollow panel. Desktop sidebar ONLY (isWide) — every call site
// gates it off on mobile, where the panel already stacks tight with no
// spare height to fill.
//
// RG-C5: pure post-hoc readout of already-settled economic totals — same
// inputs as the header's SessionMeta chip + the existing SessionSummaryBeat
// stat block. No per-tap escalation, no streak-scaled styling/size/color,
// no "you're due" or loss-chasing copy.
function SidebarPulseStrip({
  history,
  balanceLamports,
}: {
  history: { finalMultiplierBps: bigint; won: boolean }[]
  balanceLamports: bigint
}): ReactElement {
  const rounds = history.length
  const deltaLamports = balanceLamports - SESSION_START_LAMPORTS
  const positive = deltaLamports >= 0n
  const abs = positive ? deltaLamports : -deltaLamports
  let bestBps = 0n
  let won = 0
  let lost = 0
  for (const r of history) {
    if (r.won) {
      won += 1
      if (r.finalMultiplierBps > bestBps) bestBps = r.finalMultiplierBps
    } else {
      lost += 1
    }
  }
  return (
    <div style={styles.sidebarPulse}>
      <div style={styles.sidebarPulseHead}>
        <span style={styles.sidebarPulseLabel}>SESSION PULSE</span>
        {rounds > 0 && (
          <span style={{ ...styles.sidebarPulseNet, color: positive ? T.accent : T.danger }}>
            {positive ? '+' : '-'}
            {formatUsdc(abs)} · {rounds} {rounds === 1 ? 'round' : 'rounds'}
          </span>
        )}
      </div>
      <div style={styles.sessionBeatStats}>
        <div style={styles.sessionStat}>
          <span style={styles.sessionStatLabel}>BEST</span>
          <span style={{ ...styles.sessionStatValue, color: T.bag }}>
            {bestBps > ONE_X_BPS ? formatMultiplier(bestBps) : '–'}
          </span>
        </div>
        <div style={styles.sessionStat}>
          <span style={styles.sessionStatLabel}>WON · LOST</span>
          <span style={styles.sessionStatValue}>
            <span style={{ color: won > 0 ? T.accent : T.textDim }}>{won}</span>
            <span style={{ color: T.textDim }}> · </span>
            <span style={{ color: lost > 0 ? T.danger : T.textDim }}>{lost}</span>
          </span>
        </div>
        <div style={styles.sessionStat}>
          <span style={styles.sessionStatLabel}>NET</span>
          <span style={{ ...styles.sessionStatValue, color: rounds > 0 ? (positive ? T.accent : T.danger) : T.textDim }}>
            {rounds > 0 ? `${positive ? '+' : '-'}${formatUsdc(abs)}` : '–'}
          </span>
        </div>
      </div>
      {rounds === 0 ? (
        <span style={styles.sidebarPulseEmpty}>
          no rounds yet this session · crack the first compartment to start the tape.
        </span>
      ) : (
        <div style={styles.sidebarPulseTrail} aria-hidden="true">
          {history.slice(0, 10).map((r, i) => (
            <span
              key={i}
              style={{
                ...styles.historyChip,
                background: r.won ? 'rgba(0, 230, 118, 0.14)' : 'rgba(255,255,255,0.04)',
                color: r.won ? T.accent : 'rgba(255, 77, 77, 0.7)',
                borderColor: r.won ? 'rgba(0, 230, 118, 0.28)' : T.borderSubtle,
              }}
            >
              {r.won ? formatMultiplier(r.finalMultiplierBps) : '✗'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * SessionTrendSpark — static cumulative-P&L sparkline for the settled
 * sidebar. Purely a retrospective readout of state.history (same data
 * source as SidebarPulseStrip/SessionSummaryBeat) — no new mechanic, no
 * animation, identical structure regardless of up/down trend (only the
 * accent/danger color token differs by sign). >=2 rounds to draw a line.
 */
function SessionTrendSpark({
  history,
}: {
  history: Pick<VaultHistoryRow, 'payoutLamports' | 'wagerLamports'>[]
}): ReactElement | null {
  if (history.length < 2) return null
  const chronological = history.slice().reverse()
  let cursor = 0n
  const points: bigint[] = []
  for (const r of chronological) {
    cursor += r.payoutLamports - r.wagerLamports
    points.push(cursor)
  }
  let maxAbs = 1n
  let extreme = points[0]!
  for (const v of points) {
    const a = v >= 0n ? v : -v
    if (a > maxAbs) maxAbs = a
    if (a >= (extreme >= 0n ? extreme : -extreme)) extreme = v
  }
  const W = 240
  const H = 48
  const baseline = H / 2
  const amp = H / 2 - 4
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W
    const y = baseline - (Number(v) / Number(maxAbs)) * amp
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const final = points[points.length - 1]!
  const lineColor = final >= 0n ? T.accent : T.danger
  const areaPath = `M0,${baseline} L${coords.join(' L')} L${W},${baseline} Z`
  const extremePositive = extreme >= 0n
  const extremeAbs = extremePositive ? extreme : -extreme
  return (
    <div style={styles.sessionSpark} aria-hidden="true">
      <div style={styles.sessionSparkHead}>
        <span style={styles.sessionSparkLabel}>SESSION TREND</span>
        <span style={{ ...styles.sessionSparkExtreme, color: extremePositive ? T.accent : T.danger }}>
          {extremePositive ? 'peak +' : 'trough -'}
          {formatUsdc(extremeAbs)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={styles.sessionSparkPlot} preserveAspectRatio="none">
        <line x1={0} y1={baseline} x2={W} y2={baseline} stroke={T.borderSubtle} strokeWidth={1} strokeDasharray="2,3" />
        <path d={areaPath} fill={lineColor} fillOpacity={0.12} stroke="none" />
        <polyline points={coords.join(' ')} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  )
}

// ─── Vault hero overlay — BIG center-screen reveal on settle ──────────────

/**
 * VaultHeroOverlay — the "moment to live" on every settle.
 *
 * Mounts inside the canvas shell when phase transitions to `settled`. A
 * full-canvas backdrop fades in, the vault-door SVG bounce-scales into
 * frame, and a narrative headline + outsized multiplier reveal below it.
 *
 * RG-C5 STRUCTURAL: amplitude (size, blur, anim duration) is module-const.
 * The ONLY signals that vary between rounds are:
 *   • Outcome class (won vs lost) → color bucket (accent vs danger)
 *   • Cumulative multiplier band  → narrative bucket (HUGE/SOLID/TIGHT/LOSS)
 * Both gating signals are economic (or binary outcome). No streak length,
 * no session-rounds, no per-tile escalation reaches this surface.
 *
 * RG-C3: the overlay carries NO information about unrevealed tiles. The
 * only mine reference is `outcome.mineTileIdx`, which is the tile the
 * player ACTUALLY clicked (already public). No counterfactual layout.
 *
 * Auto-dismisses in HERO_VISIBLE_MS so it never blocks the Glass Box
 * receipt the player needs to inspect / share.
 */
const HERO_VISIBLE_MS = 2_000

function VaultHeroOverlay({
  outcome,
  reducedMotion,
}: {
  outcome: VaultOutcome
  reducedMotion: boolean
}): ReactElement | null {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    setVisible(true)
    const t = setTimeout(() => setVisible(false), HERO_VISIBLE_MS)
    return () => clearTimeout(t)
  }, [outcome])
  if (!visible) return null

  const won = outcome.won
  // Win → the vault-themed narrative; loss → a rotating degen culture nudge
  // (same per-round seed as the receipt).
  const narrative = won
    ? outcome.cashedViaTarget
      ? targetLockNarrative(outcome.finalMultiplierBps)
      : settlementNarrative(outcome.finalMultiplierBps, won)
    : degenRugNudge(outcome.wagerLamports + BigInt(outcome.revealedTiles.length))
  const eyebrow = settlementEyebrow(won)
  const accentColor = won ? T.accent : T.danger
  const accentRgb = won ? '0, 230, 118' : '255, 77, 77'
  const mult = formatMultiplier(outcome.finalMultiplierBps)

  // Designed hero sprite — a gold hoard on a win, the rug-pull on a loss.
  // Real illustrated assets, not a procedural door. RG-C5: same sprite per
  // outcome class every settle; nothing scales with streak.
  // Win hero = the secured bag (coin hoard + gem); loss = the rug pull.
  const heroImg = won ? '/assets/generated/rug-or-riches/loot-4.png' : RUG_HERO_IMG
  const heroFishSize = 230

  return (
    <div
      style={{
        ...styles.heroOverlay,
        // Disable the enter animation when reduced motion is set.
        animation: reducedMotion
          ? 'none'
          : 'vault-hero-enter 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
      }}
      data-testid="vault-hero-overlay"
      role="dialog"
      aria-modal="false"
      aria-label={
        won
          ? `Took profit at ${mult}: ${narrative}`
          : `Rugged, lost ${formatUsdc(outcome.wagerLamports)}: ${narrative}`
      }
    >
      <div
        style={{
          ...styles.heroBackdrop,
          background: `radial-gradient(ellipse 65% 55% at 50% 50%, rgba(${accentRgb}, 0.18), rgba(3, 7, 13, 0.85))`,
        }}
        aria-hidden="true"
      />
      <div
        style={{
          ...styles.heroFishWrap,
          animation: reducedMotion
            ? 'none'
            : 'vault-hero-door 1100ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: canvas-overlay sprite, not content */}
        <img
          src={heroImg}
          width={heroFishSize}
          height={heroFishSize}
          alt=""
          aria-hidden="true"
          style={{
            width: heroFishSize,
            height: heroFishSize,
            objectFit: 'contain',
            filter: `drop-shadow(0 8px 24px rgba(${accentRgb}, 0.55))`,
          }}
        />
      </div>
      <div
        style={{
          ...styles.heroLabelStack,
          animation: reducedMotion
            ? 'none'
            : 'vault-hero-label 700ms cubic-bezier(0.2, 0.8, 0.2, 1) 180ms both',
        }}
      >
        <span style={{ ...styles.heroEyebrow, color: accentColor }}>{eyebrow}</span>
        <span style={{ ...styles.heroTitle, color: accentColor }}>{narrative.toUpperCase()}</span>
        <div style={styles.heroNumberRow}>
          {/* Win → the multiplier; loss → the loss amount, never a positive
              x-value (which reads as "broke even"). jesse honesty fix. */}
          <span style={{ ...styles.heroMult, color: accentColor }}>
            {won ? mult : `−${formatUsdc(outcome.wagerLamports)}`}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Board caption strip — settled-only, safes-opened + result ────────────

/**
 * SettledBoardCaption — replaces the removed `VaultBoardRebet` near-board CTA
 * (rugsui fix-spec §4: "one CTA only", the near-board pill was a SECOND BET
 * AGAIN duplicating `SettledControlColumn`'s). This is NOT a CTA — a small
 * read-only pill strip under the board, RG-C3-safe count-only copy ("N SAFES
 * OPENED · PAID OUT AT Xx" / "N SAFES OPENED · RUGGED"), per fix-spec §5. On
 * its own `settledBoardCaption` pill bg so it stays legible over the
 * full-bleed art regardless of world. Renders on both mobile and desktop —
 * position:absolute within `boardRegion` (already `position:relative`), so
 * it never affects the canvas's own measured rect / board-Y.
 */
function SettledBoardCaption({ outcome }: { outcome: VaultOutcome }): ReactElement {
  const safeCount = outcome.revealedTiles.length
  const safeWord = `SAFE${safeCount === 1 ? '' : 'S'} OPENED`
  const text = outcome.won
    ? `${safeCount} ${safeWord} · PAID OUT AT ${formatMultiplier(outcome.finalMultiplierBps)}`
    : `${safeCount} ${safeWord} · RUGGED`
  return (
    <div style={styles.settledBoardCaption} data-testid="vault-settled-board-caption" aria-hidden="true">
      {text}
    </div>
  )
}

// ─── Rhythm badge — cosmetic "perfect tumbler" celebration ────────────────

/**
 * RhythmBadge — surfaces during `playing` when the rhythm-tick evaluator
 * returns a non-null tier. Display only. The on-chain math is untouched.
 *
 * RG-C5 STRUCTURAL: receives ONLY a tier ('rhythm' | 'perfect'). The tier
 * is computed in vaultCopy.evaluateRhythmTick from timestamps + cumulative
 * BPS — never from streak length or session-rounds.
 *
 * REDUCED-MOTION FIX (2026-07-07, autisk Pixel-7 re-sweep): the entrance
 * animation was unconditional, unlike every sibling animated element in
 * this file (`liveDot`, `VaultHeroOverlay`'s enter/door/label animations).
 * Mirrors the SAME inline-override pattern used for `liveDot` just above —
 * `reducedMotion` swaps the animation to `'none'` (instant/opacity-only via
 * the base style's non-animation properties) without touching tier logic
 * or the RHYTHM_BADGE_VISIBLE_MS/evaluateRhythmTick timing (RG-C5).
 */
function RhythmBadge({
  tier,
  reducedMotion,
}: {
  tier: 'rhythm' | 'perfect'
  reducedMotion: boolean
}): ReactElement {
  const label = rhythmBadgeLabel(tier)
  const baseStyle = tier === 'perfect' ? styles.rhythmBadgePerfect : styles.rhythmBadgeRhythm
  return (
    <div
      style={reducedMotion ? { ...baseStyle, animation: 'none' } : baseStyle}
      data-testid="vault-rhythm-badge"
      data-tier={tier}
      aria-live="polite"
    >
      <span style={styles.rhythmBadgeDot} aria-hidden="true" />
      <span style={styles.rhythmBadgeLabel}>{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// GUTTER-CARD COMPONENTS (restored 2026-07-05) — reconstructed from
// documentation/run-logs per VAULT-REVERT-SPEC.md, since no verbatim source
// of any *GutterCards body survived the 2026-07-05 grid-chassis refactor.
// Every color token / style object / sub-component reused is the SAME one
// the grid chassis also reused (SidebarPulseStrip, SessionTrendSpark, Row/
// ReceiptRowStacked, Stat, PrimaryButton, the cash-out/bet-again/mode-toggle
// handlers + styles) — desktop-only DOM structure, no new visual language.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Playing gutter cards (LEFT status @72 / RIGHT actions @72) ───────────
function PlayingStatusCard({ controller }: { controller: VaultController }): ReactElement {
  const { state } = controller
  const potentialPayout = settlePayout(state.wagerLamports, state.cumulativeMultiplierBps)
  const running = state.autoActive
  const trailPending = state.trail.length > 0 && !running
  const subText = running
    ? 'running your trail · one rug ends it…'
    : trailPending
      ? `${state.trail.length} tile${state.trail.length === 1 ? '' : 's'} set · GO reveals them all (a rug ends it) · tap to adjust`
      : state.trailMode
        ? 'hold + drag over tiles to plan a path · then GO'
        : 'crack a compartment open · or take profit'
  return (
    <div style={styles.gutterCard}>
      <span style={{ ...styles.actionBarEyebrow, color: trailPending ? T.bag : T.accent }}>
        {running ? 'RUNNING TRAIL' : trailPending ? 'TRAIL READY' : state.trailMode ? 'PLAN YOUR TRAIL' : 'PUMPING'}
      </span>
      <span style={styles.actionBarSub}>{subText}</span>
      <div style={styles.actionBarInfo}>
        <Stat
          label="Pump"
          value={formatMultiplier(state.cumulativeMultiplierBps)}
          valueColor={state.cumulativeMultiplierBps > ONE_X_BPS ? T.accent : T.textPrimary}
          emphasis
        />
        <Stat label="Bag now" value={formatUsdc(potentialPayout)} valueColor={T.bag} emphasis />
        <Stat label="Rugs" value={`${state.mineCount}`} valueColor={T.danger} />
      </div>
      {state.targetMultiplierBps !== null && (
        <button
          type="button"
          onClick={() => controller.setTarget(null)}
          style={styles.exitLiveChip}
          aria-label={`Auto-exit armed at ${formatMultiplier(state.targetMultiplierBps)} · tap to disable`}
        >
          <span style={styles.exitLiveDot} aria-hidden="true" />
          EXIT @ {formatMultiplier(state.targetMultiplierBps)}
        </button>
      )}
    </div>
  )
}

function PlayingActionsCard({ controller }: { controller: VaultController }): ReactElement {
  const { state } = controller
  const potentialPayout = settlePayout(state.wagerLamports, state.cumulativeMultiplierBps)
  const canCashOut = state.revealedTiles.length > 0
  const dramatic = state.cumulativeMultiplierBps > 15_000n
  const buttonStyle = !canCashOut
    ? styles.cashOutButtonDisabled
    : dramatic
      ? styles.cashOutButtonDramatic
      : styles.cashOutButton
  const running = state.autoActive
  const trailPending = state.trail.length > 0 && !running
  return (
    <div style={styles.gutterCardCta}>
      {trailPending ? (
        <>
          <button
            type="button"
            onClick={controller.clearTrail}
            style={{ ...styles.autoButton, width: '100%' }}
            aria-label="Clear the trail"
          >
            ✕ CLEAR
          </button>
          <button
            type="button"
            onClick={controller.runTrail}
            style={{ ...styles.cashOutButton, width: '100%' }}
            aria-label={`Run your trail of ${state.trail.length} tiles for ${formatUsdc(potentialPayout)}`}
          >
            <span style={styles.cashOutLabel}>{`GO ▶ ${state.trail.length}`}</span>
            <span style={styles.cashOutSub}>
              {`${formatUsdc(potentialPayout)} · ${formatMultiplier(state.cumulativeMultiplierBps)}`}
            </span>
          </button>
        </>
      ) : running ? (
        <button
          type="button"
          onClick={controller.toggleAuto}
          aria-pressed
          aria-label="Stop the trail"
          style={{ ...styles.autoButtonActive, width: '100%' }}
        >
          STOP ⚡
        </button>
      ) : (
        <div style={styles.modeToggle} role="group" aria-label="Play style">
          <button
            type="button"
            onClick={() => state.trailMode && controller.toggleTrailMode()}
            aria-pressed={!state.trailMode}
            style={!state.trailMode ? styles.modeToggleActive : styles.modeToggleInactive}
          >
            MANUAL
          </button>
          <button
            type="button"
            onClick={() => !state.trailMode && controller.toggleTrailMode()}
            aria-pressed={state.trailMode}
            style={state.trailMode ? styles.modeToggleActive : styles.modeToggleInactive}
          >
            TRAIL
          </button>
        </div>
      )}
      {/* RG-C6 STRUCTURAL: always rendered, same handler/slot — only the
          disabled/dramatic style branch varies with the economic state. */}
      <button
        type="button"
        onClick={controller.cashOut}
        disabled={!canCashOut}
        style={{ ...buttonStyle, width: '100%' }}
        className={dramatic ? 'vault-cashout-dramatic vault-press' : 'vault-press'}
        aria-label={`Take profit ${formatUsdc(potentialPayout)} at ${formatMultiplier(state.cumulativeMultiplierBps)}`}
      >
        <span style={dramatic ? styles.cashOutLabelDramatic : styles.cashOutLabel}>
          {canCashOut ? 'TAKE PROFIT' : 'take profit'}
        </span>
        <span style={styles.cashOutSub}>
          {canCashOut
            ? `${formatUsdc(potentialPayout)} · ${formatMultiplier(state.cumulativeMultiplierBps)}`
            : 'crack one open first'}
        </span>
      </button>
    </div>
  )
}

// ─── Settled gutter cards (LEFT result+meta @72 / RIGHT next-bet @72, THEN
//     a SECOND right-gutter group @400 — receipt+trend — layered ABOVE the
//     existing @400 anchor rather than merged into one stack: one combined
//     @400 stack would overflow the ~702px shell at 1440x900). ────────────
function SettledResultCard({ outcome }: { outcome: VaultOutcome }): ReactElement {
  const won = outcome.won
  const headlineBps = outcome.finalMultiplierBps
  const deltaLamports = won ? outcome.payoutLamports - outcome.wagerLamports : outcome.wagerLamports
  const deltaSign = won ? '+' : '-'
  return (
    <div style={styles.gutterCard} data-testid="vault-settled-result">
      <span style={{ ...styles.settledEyebrow, color: won ? T.accent : T.danger }}>
        {settlementEyebrow(won)}
      </span>
      <span style={{ ...styles.settledNarrative, color: won ? T.accent : T.danger }}>
        {won
          ? outcome.cashedViaTarget
            ? targetLockNarrative(headlineBps)
            : settlementNarrative(headlineBps, won)
          : degenRugNudge(outcome.wagerLamports + BigInt(outcome.revealedTiles.length))}
      </span>
      <div style={styles.settledResultRow}>
        <span style={{ ...styles.settledResultBig, color: won ? T.accent : T.danger }}>
          {won ? formatMultiplier(headlineBps) : 'BUST'}
        </span>
        <span style={{ ...styles.settledResultDelta, color: won ? T.accent : T.danger }}>
          {deltaSign}
          {formatUsdc(deltaLamports)}
        </span>
      </div>
      {/* Restacked to its own line (not `settledResultRow`'s baseline-flex
          3-up) — a `marginLeft:'auto'` row-of-3 doesn't fit a ~230px column
          (same class of fix as `gutterToWin`, precedented 2026-07-03). */}
      <span style={styles.settledResultCtx}>
        {won ? `${outcome.revealedTiles.length} pumped` : `${outcome.revealedTiles.length} before the rug`}
      </span>
    </div>
  )
}

function SettledMetaCard({ outcome }: { outcome: VaultOutcome }): ReactElement {
  const pointsEarned = pointsForBet(outcome.wagerLamports, outcome.won)
  const pointsMultLabel = outcome.won ? '1.0x on the win' : '1.5x loss-amplified'
  return (
    <div style={styles.gutterCard} data-testid="vault-settled-meta">
      <span style={styles.ctlLabel}>SESSION META</span>
      <span style={styles.settledPointsValue}>+{formatPoints(pointsEarned)}</span>
      <span style={styles.settledMetaDim}>pts · {pointsMultLabel}</span>
      {outcome.moonPayoutLamports > 0n && (
        <span style={{ ...styles.settledMetaDim, color: '#FFB000' }}>
          · 🌙 +{formatUsdc(outcome.moonPayoutLamports)}
        </span>
      )}
    </div>
  )
}

function SettledNextBetCard({
  controller,
  insufficient,
  onBetAgain,
  onBetAgainSamePattern,
  outcome,
  compactSecondary,
}: {
  controller: VaultController
  insufficient: boolean
  onBetAgain: () => void
  onBetAgainSamePattern: () => void
  outcome: VaultOutcome
  /** Desktop (isWide) chassis only — renders the SECONDARY "bet again · same
   *  trail" button at the layout-spec's 36px height (radius 8). Omitted/false
   *  everywhere else so the MOBILE render keeps its 44px minimum touch target
   *  (WCAG 2.5.5) — the two heights are a deliberate desktop/mobile split. */
  compactSecondary?: boolean
}): ReactElement {
  const { state } = controller
  const canReuseTrail = state.lastTrail.length > 0 && state.lastTrailGridSize === state.gridSize
  // FIX 3 (2026-07-04, preserved): BET AGAIN follows the loss color state
  // (flat T.danger instead of the green gradient) — same rule the near-board
  // VaultBoardRebet CTA and the rest of this settled surface already commit
  // to (`won ? T.accent : T.danger`).
  const betAgainStyle: CSSProperties = {
    ...(insufficient ? styles.settledBetAgainDisabled : styles.settledBetAgain),
    width: '100%',
    ...(outcome.won || insufficient ? null : { background: T.danger }),
  }
  return (
    <div style={styles.gutterCardCta} data-testid="vault-settled-next">
      <span style={styles.ctlLabel}>NEXT BET</span>
      <div style={styles.settledWagerWindow}>
        <button
          type="button"
          onClick={() => controller.setWager(stepWagerDown(state.wagerLamports))}
          style={styles.settledStepBtn}
          aria-label="Decrease next bet"
        >
          −
        </button>
        {/* DEFECT-2 fix (2026-07-05, game-art-director): the shared border-
            box fix on `gutterCardCta` shrank this card's true content box
            (it used to be ~30px wider due to the content-box overflow bug),
            so the un-touched `consoleWagerValue` size (26px) no longer fits
            the ~106-120px stepper slot on one line and wraps "1.00"/"USDC".
            Call-site-only override (BetEntry's own `consoleWagerValue` use
            is untouched) — sized to the measured live slot with margin. */}
        <AnimatedUsdc
          lamports={state.wagerLamports}
          style={{ ...styles.consoleWagerValue, fontSize: 20, whiteSpace: 'nowrap' }}
        />
        <button
          type="button"
          onClick={() => controller.setWager(stepWagerUp(state.wagerLamports))}
          style={styles.settledStepBtn}
          aria-label="Increase next bet"
        >
          +
        </button>
      </div>
      <button
        type="button"
        onClick={onBetAgain}
        disabled={insufficient}
        className="vault-press"
        style={betAgainStyle}
        data-testid="vault-settled-betagain"
        aria-label={`Bet again, ${formatUsdc(state.wagerLamports)}`}
      >
        bet again →
      </button>
      {canReuseTrail && (
        <button
          type="button"
          onClick={onBetAgainSamePattern}
          disabled={insufficient}
          className="vault-press"
          style={{ ...settledSecondaryOutlineStyle(outcome.won, insufficient, compactSecondary), width: '100%' }}
          aria-label={`Bet again with the same trail pattern, ${formatUsdc(state.wagerLamports)}`}
        >
          bet again · same trail →
        </button>
      )}
      {/* FIX 2 (2026-07-04, preserved): "new setup ↗" — do NOT reintroduce
          "change mode". `settledChangeButton` style/arrow untouched. */}
      <div style={styles.settledLinks}>
        <button type="button" onClick={controller.acknowledgeSettlement} style={styles.settledChangeButton}>
          new setup ↗
        </button>
        <button
          type="button"
          onClick={() =>
            shareVaultResult(
              outcome.won,
              outcome.finalMultiplierBps,
              outcome.won ? outcome.payoutLamports - outcome.wagerLamports : outcome.wagerLamports,
              outcome,
            )
          }
          style={styles.settledShareButton}
          aria-label="Share this result"
        >
          share ↗
        </button>
      </div>
    </div>
  )
}

function SettledReceiptCard({
  outcome,
  verifyState,
  receiptExpanded,
  onToggleReceipt,
  history,
}: {
  outcome: VaultOutcome
  verifyState: 'verifying' | 'matched' | 'mismatched'
  receiptExpanded: boolean
  onToggleReceipt: () => void
  history: VaultHistoryRow[]
}): ReactElement {
  const totalMines = outcome.mineBitmap.filter((b) => b).length
  const revealedMines = outcome.mineTileIdx !== null ? 1 : 0
  const sealedMines = totalMines - revealedMines
  return (
    <div style={styles.gutterCard} data-testid="vault-settled-receipt-card">
      <span style={styles.ctlLabel}>VERIFIED</span>
      {verifyState === 'matched' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <span style={styles.settledVerifyChip}>
            <span aria-hidden="true">✓</span> verified
          </span>
          {/* DEFECT-2 fix (2026-07-05, game-art-director): same border-box
              side-effect as the NEXT BET stepper above — this receipt-card
              row now only has ~88-92px left for the toggle once the
              "✓ verified" chip takes its share of the 200px GUTTER-cap card,
              so the untouched `settledVerifyToggle` (10px font, 0.14em
              tracking, 11px pill padding) wraps to 2 lines. Call-site-only
              override (the mobile `!isWide` toggle at the top of this file
              keeps the base `settledVerifyToggle` byte-identical, font size
              UNCHANGED at 10px) — tighter tracking + a small pill-padding
              trim + a tighter row gap buys back single-line fit with
              margin, verified live against the measured row width. */}
          <button
            type="button"
            className="vault-receipt-toggle"
            onClick={onToggleReceipt}
            aria-expanded={receiptExpanded}
            aria-controls="vault-gutter-settled-receipt"
            style={{ ...styles.settledVerifyToggle, letterSpacing: '0.02em', padding: '4px 4px', whiteSpace: 'nowrap' }}
          >
            {receiptExpanded ? 'hide receipt ↑' : 'view receipt ↓'}
          </button>
        </div>
      )}
      {verifyState === 'verifying' && <span style={styles.settledVerifyText}>verifying…</span>}
      {verifyState === 'mismatched' && (
        <span style={styles.settlementVerifyMismatch}>⚠ mismatch · recheck seed</span>
      )}
      {receiptExpanded && verifyState === 'matched' && (
        <div id="vault-gutter-settled-receipt" style={styles.ctlReceiptBody}>
          <dl style={styles.settlementReceiptRowsStacked}>
            <ReceiptRowStacked label="round id" value={outcome.roundIdHex} />
            <ReceiptRowStacked label="server seed hash" value={outcome.serverSeedHashHex} />
            <ReceiptRowStacked label="server seed" value={outcome.serverSeedHex} />
            {/* FIX #7 (2026-07-07) — "mixer" row REMOVED, see the identical
                comment on the desktop `Row` receipt above. */}
            <ReceiptRowStacked label="grid" value={`${outcome.gridSize}×${outcome.gridSize}`} />
            <ReceiptRowStacked label="rugs" value={String(outcome.mineCount)} />
            <ReceiptRowStacked label="safe tiles revealed" value={String(outcome.revealedTiles.length)} />
            <ReceiptRowStacked label="reveal trace" value={outcome.revealedTiles.join(' → ')} />
            <ReceiptRowStacked label="rugs that stayed sealed" value={`${sealedMines} of ${outcome.mineCount}`} />
            {outcome.mineTileIdx !== null && (
              <ReceiptRowStacked label="rug struck" value={`tile ${outcome.mineTileIdx + 1}`} />
            )}
          </dl>
        </div>
      )}
      {history.length >= 2 && <SessionTrendSpark history={history} />}
    </div>
  )
}

// ─── VaultGutterCards — Lobby / Playing / Settled (base GUTTER @400 Card A +
//     per-phase BETENTRY_GUTTER @72 hero/status/result group). Bet-entry is
//     handled entirely by BetEntryGutterCards below; mine-hit/settling are
//     brief transitional beats and mount no gutter chrome (out of scope,
//     per the original per-phase placement decision). ───────────────────────
function VaultGutterCards({
  controller,
  boardLayout,
  insufficient,
  onBetAgain,
  onBetAgainSamePattern,
  verifyState,
  receiptExpanded,
  onToggleReceipt,
}: {
  controller: VaultController
  boardLayout: VaultBoardLayoutState | null
  insufficient: boolean
  onBetAgain: () => void
  onBetAgainSamePattern: () => void
  verifyState: 'verifying' | 'matched' | 'mismatched'
  receiptExpanded: boolean
  onToggleReceipt: () => void
}): ReactElement | null {
  const { state } = controller
  const phaseKind = state.phase.kind
  if (phaseKind === 'bet-entry' || phaseKind === 'mine-hit' || phaseKind === 'settling') return null

  // FIX 1 (2026-07-04, PRESERVED): single LEFT instance, hide-until-data, NO
  // right-gutter mirror. Lobby + Playing share Card A; Settled never shows
  // it (its own RESULT/META @72 group occupies the left gutter instead).
  const showA = phaseKind !== 'settled' && state.history.length > 0

  const top72Left = gutterBoardAnchorLeftStyle(boardLayout, styles.betentryGutterLeftStack, BETENTRY_GUTTER.maxWidth)
  const top72Right = gutterBoardAnchorRightStyle(boardLayout, styles.betentryGutterRightStack, BETENTRY_GUTTER.maxWidth)
  const top400Left = gutterBoardAnchorLeftStyle(boardLayout, styles.gutterLeftStack, GUTTER.maxWidth)
  const top400Right = gutterBoardAnchorRightStyle(boardLayout, styles.gutterRightStack, GUTTER.maxWidth)

  // PLAYING_HUD_CLEARANCE_PX (2026-07-05, game-art-director DEFECT-1 fix) —
  // the canvas draws its own RUG RISK gauge + "IF NEXT IS SAFE -> Nx / bag"
  // preview in the SAME top-right corner (18px-98px canvas-local, cleared
  // horizontally of the world-glance globe via VaultGridCanvas's
  // hudRightInset=60, but NOT cleared vertically of this stack's own
  // BETENTRY_GUTTER.topOffset=72) — jesse caught the canvas text rendering
  // partially BEHIND the top72Right actions card (and, on the left, the
  // equivalent status card sits directly under the hero readout too, though
  // that one is masked by the pre-existing subtitle-suppression, defect #2).
  // A call-site-only nudge (NOT a change to BETENTRY_GUTTER/GUTTER — those
  // stay verbatim for Lobby/BetEntry/Settled, none of which render this
  // canvas HUD block) pushes JUST Playing's own top72 stacks down past the
  // HUD's ~98px-tall footprint, matching the pre-refactor layout (verified
  // live: both Playing cards sat ~104px canvas-local, not 72, in the
  // shots-fabi0704-fix1fix2 baseline) with a small safety margin.
  const PLAYING_HUD_CLEARANCE_PX = 40
  const playingTop72Left: CSSProperties = {
    ...top72Left,
    top: (typeof top72Left.top === 'number' ? top72Left.top : BETENTRY_GUTTER.topOffset) + PLAYING_HUD_CLEARANCE_PX,
  }
  const playingTop72Right: CSSProperties = {
    ...top72Right,
    top: (typeof top72Right.top === 'number' ? top72Right.top : BETENTRY_GUTTER.topOffset) + PLAYING_HUD_CLEARANCE_PX,
  }

  return (
    <>
      {phaseKind === 'playing' && (
        <>
          <div style={playingTop72Left} data-testid="vault-playing-left">
            <PlayingStatusCard controller={controller} />
          </div>
          <div style={playingTop72Right} data-testid="vault-playing-right">
            <PlayingActionsCard controller={controller} />
          </div>
        </>
      )}
      {phaseKind === 'settled' && (
        <>
          <div style={top72Left} data-testid="vault-settled-left">
            <SettledResultCard outcome={state.phase.outcome} />
            <SettledMetaCard outcome={state.phase.outcome} />
          </div>
          <div style={top72Right} data-testid="vault-settled-right">
            <SettledNextBetCard
              controller={controller}
              insufficient={insufficient}
              onBetAgain={onBetAgain}
              onBetAgainSamePattern={onBetAgainSamePattern}
              outcome={state.phase.outcome}
            />
          </div>
          {/* SECOND right-gutter group, @400 — layered ABOVE the SAME anchor
              Lobby/Playing's Card A uses, NOT merged with the @72 group above
              (one combined @400 stack would overflow the ~702px shell at
              1440x900 — game-designer 2026-07-03 arithmetic). */}
          <div style={top400Right} data-testid="vault-gutter-right">
            <SettledReceiptCard
              outcome={state.phase.outcome}
              verifyState={verifyState}
              receiptExpanded={receiptExpanded}
              onToggleReceipt={onToggleReceipt}
              history={state.history}
            />
          </div>
        </>
      )}
      {showA && (
        <div style={top400Left} data-testid="vault-gutter-left">
          <div style={styles.gutterCard} data-testid="vault-gutter-card-a">
            <SidebarPulseStrip history={state.history} balanceLamports={state.balanceLamports} />
          </div>
        </div>
      )}
    </>
  )
}

// ─── BetEntryGutterCards — right-column CONSOLIDATED (2026-07-03 final
//     state, vault-betentry-rightcol-migration): everything moved into ONE
//     right stack (PICK YOUR WORLD -> YOUR BET -> SEND IT); the left gutter
//     goes deliberately EMPTY (no filler) — kept only as a testid anchor,
//     per Tim's explicit "no filler" call. ─────────────────────────────────
function BetEntryGutterCards({
  controller,
  boardLayout,
}: {
  controller: VaultController
  boardLayout: VaultBoardLayoutState | null
}): ReactElement {
  const { state } = controller
  const insufficient = state.wagerLamports > state.balanceLamports
  const { houseEdgeBps } = modeParams(state.mode)
  const totalTiles = state.gridSize * state.gridSize
  const maxSafe = Math.max(1, totalTiles - state.mineCount)
  const maxBps = multiplierAfterSafeTiles({
    totalTiles,
    mineCount: state.mineCount,
    safeCount: maxSafe,
    houseEdgeBps,
  })
  const maxPayout = settlePayout(state.wagerLamports, maxBps)

  const leftStyle = gutterBoardAnchorLeftStyle(boardLayout, styles.betentryGutterLeftStack, BETENTRY_GUTTER.maxWidth)
  // Safety net (not present historically, added defensively on revert): at
  // the extreme narrow edge of the isWide breakpoint (~960-1024px) the
  // reconstructed card padding/gaps are prose-derived estimates, not the
  // historical exact values, and the 3-card column can run slightly taller
  // than the shell's own height there. Rather than risk silently CLIPPING
  // content (the shell's `overflow:hidden`), cap this stack's own height to
  // the shell's remaining vertical budget and let it scroll internally —
  // confirmed a no-op at the two REQUIRED viewports (1440x900, 1920x1080).
  // NOTE (2026-07-05): tried forcing a determinate width here (both a
  // hand-derived `boardShellWidth` calc and a `left`+`right` CSS-constraint
  // approach) to stop the shrink-to-fit box's width from tracking its own
  // children's intrinsic content size — confirmed LIVE that this stack's
  // actual containing block is the narrow `vault-canvas-shell` (886px at
  // 1000px viewport, not the wider viewport itself), so any width pinned to
  // "shell room right of the board" measured ~150px, MORE cramped than the
  // natural shrink-to-fit result (~180-226px) the design already tolerates
  // by floating past the shell's own edge into the page's outer margin.
  // Reverted — shrink-to-fit + `maxWidth` (unchanged from before this fix)
  // stays the better-tested behavior. The actual overflow fix is the
  // `boxSizing:'border-box'` on `gutterCard`/`gutterCardCta` below (kills
  // the 30px card-vs-parent mismatch); the remaining vertical-fit work is
  // the scoped compaction below (padding/gap/font on this call site only —
  // `compactWagerValue`/`compactStepBtn` etc.), tuned against LIVE
  // measurements at each required width since this stack's shrink-to-fit
  // width shifts slightly with its own content (verified stable at
  // 1000/1440/1920 with the values landed here).
  const rightStyle: CSSProperties = {
    ...gutterBoardAnchorRightStyle(boardLayout, styles.betentryGutterRightStackCompact, BETENTRY_GUTTER.maxWidth),
    // Explicit PX cap (not a CSS %, which wouldn't resolve — the shell's own
    // height is content-sized/'auto', not a declared length) derived from
    // the SAME live measurement the horizontal anchor uses.
    maxHeight: boardLayout ? boardLayout.boardShellHeight - BETENTRY_GUTTER.topOffset - 16 : undefined,
    overflowY: 'auto',
    pointerEvents: 'auto',
  }

  // Right-column consolidation (2026-07-03) compaction — call-site override
  // ONLY on these 3 BetEntry cards (base gutterCard/gutterCardCta untouched,
  // shared by every other phase's gutter card): 3 cards + ModeSelector's own
  // 3-mode-card block + RugsTuner otherwise overflow the ~684px vertical
  // budget between topOffset:72 and the shell's own bottom edge (the shell's
  // `overflow:hidden` would silently clip the SEND IT button) — tightened
  // padding/gap buys back exactly that room, same fix-class as the prior
  // vault-betentry-rightcol-migration compaction.
  const compactCard: CSSProperties = { ...styles.gutterCard, padding: '8px 12px 10px', gap: 4 }
  const compactCardCta: CSSProperties = { ...styles.gutterCardCta, padding: '8px 12px 10px', gap: 4 }
  // BETENTRY VERTICAL-FIT FIX (2026-07-05) — the shared `settledStepBtn`
  // (44x44, the Settled-phase bet-again touch target) + `consoleWagerValue`
  // (26px numeral) left NO room for "1.00 USDC" inside this card's narrow
  // content width, forcing a 2nd line ("1.00" / "USDC") that alone blew the
  // vertical budget at every required width. Both are scoped call-site
  // overrides (same pattern as `compactCard` above) — `settledStepBtn`/
  // `consoleWagerValue` stay byte-identical for the Settled phase's own
  // stepper, mobile, and every other caller; this desktop-only bet-entry
  // gutter card is the ONLY place these shrink. (44px is a MOBILE touch-
  // target minimum — mobile-touch-qa 2026-07-02 finding — BetEntryGutterCards
  // never renders on mobile, so shrinking it here doesn't touch that a11y
  // floor.) `whiteSpace:'nowrap'` on the value stops it from wrapping once
  // it fits; `nowrap` is safe here because the compaction below guarantees
  // enough room for it at every required width (1000/1440/1920 — verified
  // live, see run notes).
  const compactWagerValue: CSSProperties = { ...styles.consoleWagerValue, fontSize: 15, whiteSpace: 'nowrap' }
  const compactStepBtn: CSSProperties = { ...styles.settledStepBtn, width: 28, height: 28, fontSize: 14 }

  return (
    <>
      <div style={leftStyle} data-testid="vault-betentry-left" />
      <div style={rightStyle} data-testid="vault-betentry-right">
        <div style={compactCard} data-testid="vault-betentry-world">
          <ModeSelector controller={controller} stacked />
          <div style={{ ...styles.gutterToWin, paddingTop: 3, gap: 1 }}>
            <span style={styles.ctlLabel}>TO WIN</span>
            <span style={styles.gridStatus}>
              up to {formatMultiplier(maxBps)} · max {formatUsdc(maxPayout)}
            </span>
          </div>
        </div>
        <div style={compactCard} data-testid="vault-betentry-yourbet">
          <span style={styles.ctlLabel}>YOUR BET</span>
          <div style={{ ...styles.settledWagerWindow, padding: '4px 6px', gap: 4 }}>
            <button
              type="button"
              onClick={() => controller.setWager(stepWagerDown(state.wagerLamports))}
              style={compactStepBtn}
              aria-label="Decrease wager"
            >
              −
            </button>
            <AnimatedUsdc lamports={state.wagerLamports} style={compactWagerValue} />
            <button
              type="button"
              onClick={() => controller.setWager(stepWagerUp(state.wagerLamports))}
              style={compactStepBtn}
              aria-label="Increase wager"
            >
              +
            </button>
          </div>
          <div style={styles.gutterChipRow}>
            {WAGER_PRESETS.map((p) => {
              const selected = state.wagerLamports === p.value
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => controller.setWager(p.value)}
                  style={selected ? styles.gutterChipOn : styles.gutterChip}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>
        <div style={compactCardCta} data-testid="vault-betentry-confirm">
          <span style={{ ...styles.ctlLabel, letterSpacing: '0.1em' }}>
            BALANCE · {formatUsdc(state.balanceLamports)}
          </span>
          <button
            type="button"
            onClick={() => controller.placeBet().catch(() => undefined)}
            disabled={insufficient}
            style={{ ...(insufficient ? styles.commitButtonDisabled : styles.commitButton), width: '100%' }}
          >
            {insufficient ? 'not enough bag' : 'SEND IT →'}
          </button>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// FIXED 5-ZONE GRID CHASSIS (2026-07-06) — the desktop-only (isWide) chassis.
// A real CSS Grid, NOT position:absolute overlay cards (that was the whole
// point of this rebuild): TOPBAR / HUD-ZONE / BOARD / CONTROL COLUMN /
// STATUSBAR. Geometry is IDENTICAL across Lobby/BetEntry/Playing/Settled —
// every phase renders the same 5 grid areas, only the CONTENT inside HUD-ZONE
// and CONTROL COLUMN switches on `phase.kind`. See GRID_* constants above for
// the fixed row/column sizes that make this true.
// ═══════════════════════════════════════════════════════════════════════════

function DesktopChassis({
  controller,
  boardLayout,
  insufficient,
  onBetAgain,
  onBetAgainSamePattern,
  verifyState,
  receiptExpanded,
  onToggleReceipt,
  canvasShellChildren,
  boardShellRef,
  phaseLabel,
  roundIdLabel,
  sessionRounds,
  sessionDelta,
  safeLeft,
}: {
  controller: VaultController
  boardLayout: VaultBoardLayoutState | null
  insufficient: boolean
  onBetAgain: () => void
  onBetAgainSamePattern: () => void
  verifyState: 'verifying' | 'matched' | 'mismatched'
  receiptExpanded: boolean
  onToggleReceipt: () => void
  canvasShellChildren: ReactElement
  boardShellRef: RefObject<HTMLDivElement | null>
  phaseLabel: string
  roundIdLabel: string
  sessionRounds: number
  sessionDelta: bigint
  safeLeft: number
}): ReactElement {
  const { state } = controller
  const phaseKind = state.phase.kind
  const roundLive =
    phaseKind === 'playing' || phaseKind === 'mine-hit' || phaseKind === 'settling'

  // HUD-ZONE width/offset — EXACTLY the board's own live-measured width (per
  // `boardLayout`, fed by VaultGridCanvas's onBoardLayout), so the zone
  // visually sits flush above the actual grid tiles, not the wider letterboxed
  // shell. Falls back to full-width until the first measurement lands.
  const hudInnerStyle: CSSProperties = boardLayout
    ? {
        marginLeft: boardLayout.boardPanelLeftX,
        width: Math.max(0, boardLayout.boardPanelRightX - boardLayout.boardPanelLeftX),
      }
    : { width: '100%' }

  // Shell-wide per-world backdrop photo (doortrekken-de-achtergrond fix,
  // 2026-07-06) — reads the SAME `getModeBackdrop(mode)` source of truth
  // VaultGridCanvas.tsx uses for its own fallback gating, so the three PNGs
  // + their scrim values live in exactly one place. One `background`
  // shorthand carries both the scrim wash AND the cover-fit photo, so this
  // is the single paint of the art for the whole shell.
  const currentBackdrop = getModeBackdrop(state.mode)

  return (
    <div style={styles.desktopGrid} data-testid="vault-grid-mainGrid">
      <div
        aria-hidden="true"
        data-testid="vault-grid-backdrop"
        style={{
          ...styles.sceneBackdropLayer,
          backgroundImage: `linear-gradient(rgba(3,7,13,${currentBackdrop.scrim}), rgba(3,7,13,${currentBackdrop.scrim})), url(${currentBackdrop.backdrop})`,
        }}
      />
      {/* SCENE EDGE-SCRIM (rugsui fix-spec §1, 2026-07-06) — a second layer
          on top of the shell-wide backdrop photo, darkening the left/right
          edges (control-column side hardest) while leaving the 18-60%
          middle band clear so the board keeps full art contrast. Same
          `zIndex: 0` as `sceneBackdropLayer` above, later in DOM order so it
          paints on top of it; every real UI zone (topbar/hud/board/control/
          status) is `zIndex: 1` and unaffected. */}
      <div aria-hidden="true" data-testid="vault-scene-edge-scrim" style={styles.sceneEdgeScrimLayer} />
      <DesktopTopBar
        phaseLabel={phaseLabel}
        roundIdLabel={roundIdLabel}
        sessionRounds={sessionRounds}
        sessionDelta={sessionDelta}
        balanceLamports={state.balanceLamports}
      />

      <div style={styles.desktopGridHud} data-testid="DesktopHudRow">
        <div
          style={{
            ...styles.desktopGridHudBar,
            ...hudInnerStyle,
            // WIN-BANNER TINT (rugsui fix-spec §3) — the HUD-ZONE bar already
            // sits at board-width, above the board, at the fixed GRID_HUD_H
            // row (see `hudInnerStyle`/grid rows above) — board-Y is
            // untouched by this, only the FILL/BORDER swap in on settle.
            ...(phaseKind === 'settled'
              ? settledHudBarTint(state.phase.outcome.won)
              : null),
          }}
          data-testid={phaseKind === 'settled' ? 'vault-settled-banner' : 'vault-grid-hud-inner'}
        >
          {phaseKind === 'bet-entry' && (
            <HudWorldInfo mode={state.mode} gridSize={state.gridSize} mineCount={state.mineCount} />
          )}
          {roundLive && <HudPlayingStats controller={controller} />}
          {phaseKind === 'settled' && <HudSettledBanner outcome={state.phase.outcome} />}
        </div>
      </div>

      <div
        style={{ ...styles.boardRegion, gridArea: 'board', alignSelf: 'start', width: '100%' }}
        data-testid="vault-canvas-shell"
        // Drawn-grid geometry proof surface — the canvas locks the 5×5 board to
        // the layout-spec's fixed 96px tile / 16px gap (→ 544px grid, 592px
        // plate); expose them here so the numbers are DOM-measurable even though
        // the grid itself is canvas-drawn.
        data-grid-full={boardLayout ? Math.round(boardLayout.boardPanelRightX - boardLayout.boardPanelLeftX) : undefined}
        data-grid-tile={boardLayout ? Math.round(boardLayout.gridTile) : undefined}
        data-grid-gap={boardLayout ? Math.round(boardLayout.gridGap) : undefined}
        data-grid-plate={boardLayout ? Math.round(boardLayout.boardPanelRightX - boardLayout.boardPanelLeftX + 48) : undefined}
        ref={boardShellRef}
      >
        {canvasShellChildren}
      </div>

      <div style={styles.desktopGridControl} data-testid="DesktopControlColumn">
        {phaseKind === 'bet-entry' && <BetEntryControlColumn controller={controller} />}
        {roundLive && <PlayingControlColumn controller={controller} />}
        {phaseKind === 'settled' && (
          <SettledControlColumn
            controller={controller}
            insufficient={insufficient}
            onBetAgain={onBetAgain}
            onBetAgainSamePattern={onBetAgainSamePattern}
            verifyState={verifyState}
            receiptExpanded={receiptExpanded}
            onToggleReceipt={onToggleReceipt}
          />
        )}
      </div>

      <DesktopStatusBar controller={controller} safeLeft={safeLeft} />
    </div>
  )
}

// ─── TOPBAR (zone 1, 56px, full width) ─────────────────────────────────────
function DesktopTopBar({
  phaseLabel,
  roundIdLabel,
  sessionRounds,
  sessionDelta,
  balanceLamports,
}: {
  phaseLabel: string
  roundIdLabel: string
  sessionRounds: number
  sessionDelta: bigint
  balanceLamports: bigint
}): ReactElement {
  return (
    <div style={styles.desktopGridTopBar} data-testid="vault-grid-topbar">
      <span style={styles.desktopGridTopBarLeft}>
        RUG OR RICHES {roundIdLabel} · {phaseLabel}
      </span>
      <SessionMeta rounds={sessionRounds} deltaLamports={sessionDelta} />
      <span style={styles.desktopGridTopBarRight}>
        BALANCE · <span style={styles.tapeBalanceValue}>{formatUsdc(balanceLamports)}</span>
      </span>
    </div>
  )
}

// ─── STATUSBAR (zone 5, 40px, full width) ──────────────────────────────────
function DesktopStatusBar({
  controller,
  safeLeft,
}: {
  controller: VaultController
  safeLeft: number
}): ReactElement {
  const { state } = controller
  const phaseKind = state.phase.kind
  const totalTiles = state.gridSize * state.gridSize
  let leftText = ''
  if (phaseKind === 'bet-entry') {
    leftText = `SAFE${safeLeft === 1 ? '' : 'S'} LEFT ${safeLeft.toString().padStart(2, '0')}`
  } else if (phaseKind === 'playing' || phaseKind === 'mine-hit' || phaseKind === 'settling') {
    leftText = `OPEN ${state.revealedTiles.length} of ${totalTiles - state.mineCount} · ${
      state.trailMode
        ? 'plan a path, then GO · a rug ends the round'
        : 'every safe crack pumps free · a rug costs your bet'
    }`
  } else if (phaseKind === 'settled') {
    leftText = state.phase.outcome.won
      ? 'ROUND SETTLED · BET AGAIN TO CONTINUE'
      : 'RUGGED · BET AGAIN TO CONTINUE'
  }
  return (
    <div style={styles.desktopGridStatusBar} data-testid="vault-grid-status">
      <span style={styles.desktopGridStatusBarLeft}>{leftText}</span>
      <HistoryStrip rows={state.history} />
      <span className="sr-only" aria-live="polite">
        {phaseKind === 'playing'
          ? `Cumulative multiplier ${formatMultiplier(state.cumulativeMultiplierBps)}`
          : ''}
      </span>
    </div>
  )
}

// ─── HUD-ZONE content (zone 2, board-width, sits directly above the board) ─

function HudWorldInfo({
  mode,
  gridSize,
  mineCount,
}: {
  mode: VaultMode
  gridSize: number
  mineCount: number
}): ReactElement {
  const card = MODE_CARDS.find((c) => c.mode === mode)
  const houseEdgeBps = modeParams(mode).houseEdgeBps
  const firstTapBps = multiplierAfterSafeTiles({
    totalTiles: gridSize * gridSize,
    mineCount,
    safeCount: 1,
    houseEdgeBps,
  })
  return (
    <>
      <span style={styles.desktopGridHudLeft}>
        {card?.name ?? mode.toUpperCase()} · {gridSize}×{gridSize}
      </span>
      <span style={styles.desktopGridHudRight}>
        {mineCount} RUG{mineCount === 1 ? '' : 'S'} · FIRST TAP {formatMultiplier(firstTapBps)}
      </span>
    </>
  )
}

// SETTLED-BANNER FILL (rugsui fix-spec §3) — win/loss variant of the
// HUD-ZONE bar. No pre-existing green/red-tinted OPAQUE plate token to reuse
// (`VAULT_PLATE_FILL` is the blue-steel/gold family — wrong hue for an
// outcome banner), so this is a new pair of tokens, built with the SAME
// opaque top-lighter/bottom-darker 180deg gradient construction
// `VAULT_PLATE_FILL` uses, just re-hued to the game's EXISTING win/loss
// accent tokens (`T.accent` #22D37D green / `T.danger` #FF4D4D red) rather
// than the mockup's raw literals (`rgba(18,36,26,.95)` / `#21d07a`) — the
// border directly reuses `T.accent`/`T.danger`, satisfying the "reuse the
// existing win/accent-green token" instruction. Delta vs. the mockup: hue
// tuned to vault's own established green/red family, alpha kept at the
// spec's 0.95 (near-opaque, matching every other VAULT-PLATE surface).
const SETTLED_BANNER_FILL_WIN = 'linear-gradient(180deg, rgba(24,54,38,0.95) 0%, rgba(8,20,14,0.95) 100%)'
const SETTLED_BANNER_FILL_LOSS = 'linear-gradient(180deg, rgba(54,24,24,0.95) 0%, rgba(20,8,8,0.95) 100%)'
function settledHudBarTint(won: boolean): CSSProperties {
  return {
    background: won ? SETTLED_BANNER_FILL_WIN : SETTLED_BANNER_FILL_LOSS,
    border: `1px solid ${won ? T.accent : T.danger}`,
  }
}

function HudPlayingStats({ controller }: { controller: VaultController }): ReactElement {
  const { state } = controller
  const potentialPayout = settlePayout(state.wagerLamports, state.cumulativeMultiplierBps)
  const totalTiles = state.gridSize * state.gridSize
  const tilesLeft = totalTiles - state.revealedTiles.length
  const rugRisk = tilesLeft > 0 ? state.mineCount / tilesLeft : 0
  return (
    <>
      {/* BLOCKER 2 (2026-07-06) — the live PUMP multiplier is the HERO: the
          largest live text on screen (44px), in pump-green, with the running
          BAG small beside it. Sits inside the fixed 64px HUD zone, so it never
          moves board-Y or pushes the CTA below the fold. */}
      <span style={styles.hudHeroLeft} data-testid="vault-hud-pump-hero">
        <span style={styles.hudHeroMult} data-testid="vault-hud-pump-value">
          {formatMultiplier(state.cumulativeMultiplierBps)}
        </span>
        <span style={styles.hudHeroMeta}>
          <span style={styles.hudHeroKicker}>PUMP</span>
          <span style={styles.hudHeroBag}>BAG {formatUsdc(potentialPayout)}</span>
        </span>
      </span>
      <span
        style={{
          ...styles.desktopGridHudRight,
          color: rugRisk > 0.5 ? T.danger : styles.desktopGridHudRight.color,
        }}
      >
        RUG RISK {Math.round(rugRisk * 100)}%
      </span>
    </>
  )
}

function HudSettledBanner({ outcome }: { outcome: VaultOutcome }): ReactElement {
  const won = outcome.won
  const delta = won ? outcome.payoutLamports - outcome.wagerLamports : outcome.wagerLamports
  const color = won ? T.accent : T.danger
  return (
    <>
      {/* BLOCKER 2 — Result phase mirrors the hero hierarchy: the settled
          multiplier (or BUST) is the big number, the outcome word its kicker. */}
      <span style={styles.hudHeroLeft} data-testid="vault-hud-pump-hero">
        <span style={{ ...styles.hudHeroMult, color }} data-testid="vault-hud-pump-value">
          {won ? formatMultiplier(outcome.finalMultiplierBps) : 'BUST'}
        </span>
        <span style={styles.hudHeroMeta}>
          <span style={{ ...styles.hudHeroKicker, color }}>{won ? 'SECURED THE BAG' : 'RUGGED'}</span>
        </span>
      </span>
      <span style={{ ...styles.desktopGridHudRight, color }}>
        {won ? '+' : '-'}
        {formatUsdc(delta)}
      </span>
    </>
  )
}

// ─── MOBILE HUD BAND content (FIX #2, 2026-07-07) ──────────────────────────
// Compact twins of `HudPlayingStats`/`HudSettledBanner` above, sized for the
// narrower mobile board width (down to ~270px at SHITCOIN 7×7 on Pixel 7)
// rather than reusing the desktop 44px hero numeral, which doesn't fit
// beside the "RUG RISK NN%" caption at that width. Deliberately separate
// components (not a shared `compact` prop on the desktop ones) so this
// mobile-only tuning can never regress the taste-approved desktop HUD-ZONE.

function MobileHudPlayingStats({ controller }: { controller: VaultController }): ReactElement {
  const { state } = controller
  const potentialPayout = settlePayout(state.wagerLamports, state.cumulativeMultiplierBps)
  const totalTiles = state.gridSize * state.gridSize
  const tilesLeft = totalTiles - state.revealedTiles.length
  const rugRisk = tilesLeft > 0 ? state.mineCount / tilesLeft : 0
  return (
    <>
      <span style={styles.mobileHudHeroLeft} data-testid="vault-hud-pump-hero">
        <span style={styles.mobileHudHeroMult} data-testid="vault-hud-pump-value">
          {formatMultiplier(state.cumulativeMultiplierBps)}
        </span>
        <span style={styles.mobileHudHeroMeta}>
          <span style={styles.mobileHudHeroKicker}>PUMP</span>
          <span style={styles.mobileHudHeroBag}>BAG {formatUsdc(potentialPayout)}</span>
        </span>
      </span>
      <span
        style={{
          ...styles.mobileHudRight,
          color: rugRisk > 0.5 ? T.danger : styles.mobileHudRight.color,
        }}
      >
        RUG RISK {Math.round(rugRisk * 100)}%
      </span>
    </>
  )
}

function MobileHudSettledBanner({ outcome }: { outcome: VaultOutcome }): ReactElement {
  const won = outcome.won
  const delta = won ? outcome.payoutLamports - outcome.wagerLamports : outcome.wagerLamports
  const color = won ? T.accent : T.danger
  return (
    <>
      <span style={styles.mobileHudHeroLeft} data-testid="vault-hud-pump-hero">
        <span style={{ ...styles.mobileHudHeroMult, color }} data-testid="vault-hud-pump-value">
          {won ? formatMultiplier(outcome.finalMultiplierBps) : 'BUST'}
        </span>
        <span style={styles.mobileHudHeroMeta}>
          <span style={{ ...styles.mobileHudHeroKicker, color }}>{won ? 'SECURED THE BAG' : 'RUGGED'}</span>
        </span>
      </span>
      <span style={{ ...styles.mobileHudRight, color }}>
        {won ? '+' : '-'}
        {formatUsdc(delta)}
      </span>
    </>
  )
}

// ─── CONTROL COLUMN content (zone 4, 320px, spans HUD-ZONE + BOARD rows) ───

// SAME-TRAIL secondary-outline style (rugsui fix-spec §2) — one helper
// shared by BOTH the mobile `Settlement` and desktop `SettledNextBetCard`
// call sites so the win/loss + compact-height branches can't drift apart
// (same pattern as `settledHudBarTint` above). `compact` = desktop's 36px/
// radius-8 layout-spec height (see `compactSecondary` prop doc).
function settledSecondaryOutlineStyle(won: boolean, insufficient: boolean, compact?: boolean): CSSProperties {
  if (insufficient) return styles.settledBetAgainSameTrailDisabled
  return {
    ...styles.settledBetAgainSameTrail,
    ...(won ? null : { background: 'rgba(255,77,77,0.12)', color: T.danger, border: '1px solid rgba(255,77,77,0.38)' }),
    ...(compact ? { minHeight: 36, height: 36, borderRadius: 8 } : null),
  }
}

/** MANUAL | TRAIL segmented toggle, extracted so Settled's control column can
 *  offer it too (previously only Playing's `PlayingActionsCard` rendered it —
 *  Settled had no way to switch play style before the next round). */
function PlayStyleToggle({ controller }: { controller: VaultController }): ReactElement {
  const { state } = controller
  return (
    <div style={styles.modeToggle} role="group" aria-label="Play style">
      <button
        type="button"
        onClick={() => state.trailMode && controller.toggleTrailMode()}
        aria-pressed={!state.trailMode}
        style={!state.trailMode ? styles.modeToggleActive : styles.modeToggleInactive}
      >
        MANUAL
      </button>
      <button
        type="button"
        onClick={() => !state.trailMode && controller.toggleTrailMode()}
        aria-pressed={state.trailMode}
        style={state.trailMode ? styles.modeToggleActive : styles.modeToggleInactive}
      >
        TRAIL
      </button>
    </div>
  )
}

/** BetEntry's control column — the ONLY phase that renders the world-picker
 *  (guardrail: world-picker absent in Playing/Settled) and the ONLY
 *  interactive (unlocked) bet stepper for this phase (guardrail: exactly one
 *  bet stepper on screen). Content is the same math/JSX BetEntryGutterCards
 *  used to render, just in normal document flow instead of an absolute
 *  board-anchored card. */
function BetEntryControlColumn({ controller }: { controller: VaultController }): ReactElement {
  const { state } = controller
  const insufficient = state.wagerLamports > state.balanceLamports
  const { houseEdgeBps } = modeParams(state.mode)
  const totalTiles = state.gridSize * state.gridSize
  const maxSafe = Math.max(1, totalTiles - state.mineCount)
  const maxBps = multiplierAfterSafeTiles({
    totalTiles,
    mineCount: state.mineCount,
    safeCount: maxSafe,
    houseEdgeBps,
  })
  const maxPayout = settlePayout(state.wagerLamports, maxBps)
  // LAYOUT-SPEC CONTROL COLUMN (2026-07-06) — flat, unwrapped world picker
  // (P1: label + 3 uniform cards + RUGS tuner, all flat siblings, NO outer
  // card/border around the group), a bordered YOUR BET panel (P3, 16px pad),
  // a BARE `TO WIN` row (P4, not a boxed panel), and a BARE `SEND IT` CTA (P5,
  // no surrounding box and NO balance line above it — balance lives only in
  // the Z1 topbar). One spacing scale (12px inter-panel via the column's own
  // `gap`; 16px inside the bet panel).
  const betPanel: CSSProperties = { ...styles.gutterCard, borderRadius: 12, padding: 16, gap: 8 }
  // P1 (2026-07-06) — panel VALUE at the spec §0 hierarchy size (20px, was 16).
  const wagerValue: CSSProperties = { ...styles.consoleWagerValue, fontSize: 20, whiteSpace: 'nowrap' }
  const stepBtn: CSSProperties = { ...styles.settledStepBtn, width: 32, height: 32, fontSize: 15 }
  return (
    <>
      {/* LOBBY-SPLASH REMOVAL (2026-07-06, Tim — "direct naar de pick your
          world") — compact always-visible intro, the ONLY replacement for
          the old stand-alone Lobby splash's "APE IN. DODGE THE RUG."
          explainer. This is the highest-risk addition to this column (5+
          prior rounds fixing CTA-below-fold — see `desktopGridControl`'s own
          comment). HIERARCHY FOLLOW-UP (2026-07-06, jesse fresh-player
          comprehension gate) — the original bare-row treatment read as the
          weakest-hierarchy element on screen and let a player skip it
          entirely; promoted to a bordered "HOW IT WORKS" chip (same
          gutterCard/GLASS material as the YOUR BET panel below) so this is
          now the FIRST framed element a fresh player reads, ahead of the
          world-picker — still condensed to protect the CTA-below-fold
          budget. Re-verified live that SEND IT stays above the fold at
          1440×900 and 1920×1080 with the taller chip present (see run
          report). */}
      <div style={styles.betEntryIntro} data-testid="vault-ctl-intro">
        <span style={styles.betEntryIntroLabel}>HOW IT WORKS</span>
        <span style={styles.betEntryIntroLine}>
          <strong style={styles.betEntryIntroStrong}>APE IN. DODGE THE RUG.</strong> crack
          compartments to pump your multiplier · one rug ends it · cash out first.
        </span>
      </div>
      <div style={styles.betEntryPicker} data-testid="vault-board-worldpicker">
        <ModeSelector controller={controller} stacked />
      </div>
      <div style={betPanel} data-testid="vault-ctl-wager">
        <span style={styles.ctlLabel}>YOUR BET</span>
        <div style={styles.settledWagerWindow}>
          <button
            type="button"
            onClick={() => controller.setWager(stepWagerDown(state.wagerLamports))}
            style={stepBtn}
            aria-label="Decrease wager"
          >
            −
          </button>
          <AnimatedUsdc lamports={state.wagerLamports} style={wagerValue} />
          <button
            type="button"
            onClick={() => controller.setWager(stepWagerUp(state.wagerLamports))}
            style={stepBtn}
            aria-label="Increase wager"
          >
            +
          </button>
        </div>
        <div style={styles.gutterChipRow}>
          {WAGER_PRESETS.map((p) => {
            const selected = state.wagerLamports === p.value
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => controller.setWager(p.value)}
                style={selected ? styles.gutterChipOn : styles.gutterChip}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>
      {/* P4 — bare TO WIN row (not a boxed panel). */}
      <div style={styles.betEntryToWinRow} data-testid="vault-ctl-towin">
        <span style={styles.ctlLabel}>TO WIN</span>
        <span style={styles.betEntryToWinValue}>
          up to {formatMultiplier(maxBps)} · max {formatUsdc(maxPayout)}
        </span>
      </div>
      {/* P5 — bare SEND IT CTA (no box, no balance line above it). */}
      <div style={styles.betEntryCta} data-testid="vault-ctl-cta">
        <button
          type="button"
          onClick={() => controller.placeBet().catch(() => undefined)}
          disabled={insufficient}
          style={{ ...(insufficient ? styles.commitButtonDisabled : styles.commitButton), width: '100%' }}
        >
          {insufficient ? 'not enough bag' : 'SEND IT →'}
        </button>
      </div>
    </>
  )
}

/** Playing's control column — the bet stays VISIBLE but LOCKED (dimmed, both
 *  step buttons disabled) — never hidden, never a 2nd interactive stepper.
 *  `PlayingActionsCard` (reused verbatim) carries the MANUAL/TRAIL toggle +
 *  the GO/TAKE PROFIT primary action; PUMP/BAG/RUG RISK now live in the
 *  HUD-ZONE above the board instead of duplicating here. */
function PlayingControlColumn({ controller }: { controller: VaultController }): ReactElement {
  const { state } = controller
  const hasPath = state.trail.length > 0
  const hasSession = state.history.length > 0
  // GRIDV2 SESSION-PULSE MOCKUP-PARITY FIX (2026-07-06, round 4 — supersedes
  // round 3). Round 3 gave each trailing card `flex:1, minHeight:0` (PATH
  // additionally `justifyContent:'center'`) so it grew to consume its share
  // of the leftover board-height — for SESSIE that meant SidebarPulseStrip's
  // OWN stat rows spread apart via `sidebarPulse`'s `space-between`, the same
  // "spread it apart and call it filled" anti-pattern Tim rejected on the
  // world-picker block. Reverted: both cards are content-sized again. The
  // tall-viewport surplus is absorbed OUTSIDE the whole control column
  // instead — see `desktopGridControl`'s `alignSelf: 'start'` (styles) — the
  // column is allowed to sit shorter than the board rather than stretching
  // any of its own content apart to reach board-bottom.
  return (
    <>
      {/* WCAG AA FIX (2026-07-06, a11y re-audit) — `opacity: 0.55` used to sit
       *  on the WHOLE card, compounding onto the caption's own `textMuted`
       *  (62%-alpha) to ~34% effective alpha (3.69:1, below the 4.5:1 floor)
       *  and onto the wager readout's `USDC` suffix (its own extra 0.6
       *  opacity) to ~3.45:1. Neither the caption nor the locked wager VALUE
       *  is a disabled control — only the two stepper buttons are — so the
       *  dimming now lives ONLY on those two `disabled` buttons. The
       *  "locked" affordance stays fully communicated by the BET · LOCKED
       *  label text plus the visibly dimmed, `disabled`-attributed steppers. */}
      {/* FIX 4 (2026-07-07, consolidated fix pass) — the label below read
          "INZET · VERGRENDELD", an accidental Dutch transcription introduced
          by the WCAG AA fix above (this game's UI is English throughout).
          Restored to "BET · LOCKED". The two aria-labels also dropped their
          em-dash for the Swoobz no-em-dash copy register. */}
      <div style={styles.gutterCard} data-testid="vault-ctl-wager-locked">
        <span style={styles.ctlLabel}>BET · LOCKED</span>
        <div style={styles.settledWagerWindow}>
          <button
            type="button"
            disabled
            style={{ ...styles.settledStepBtn, opacity: 0.55 }}
            aria-label="Bet locked, decrease disabled"
          >
            −
          </button>
          <AnimatedUsdc lamports={state.wagerLamports} style={{ ...styles.consoleWagerValue, fontSize: 20 }} />
          <button
            type="button"
            disabled
            style={{ ...styles.settledStepBtn, opacity: 0.55 }}
            aria-label="Bet locked, increase disabled"
          >
            +
          </button>
        </div>
      </div>
      <div data-testid="vault-ctl-cta">
        <PlayingActionsCard controller={controller} />
      </div>
      <div style={styles.gutterTrailingGroup} data-testid="vault-ctl-trailing">
        {hasPath && (
          <div style={styles.gutterCard} data-testid="vault-ctl-path">
            <span style={styles.ctlLabel}>
              PATH {state.trail.length} TILE{state.trail.length === 1 ? '' : 'S'} · RUGS {state.mineCount}
            </span>
          </div>
        )}
        {hasSession && (
          <div style={styles.gutterCard} data-testid="vault-ctl-session">
            <SidebarPulseStrip history={state.history} balanceLamports={state.balanceLamports} />
          </div>
        )}
      </div>
    </>
  )
}

/** Settled's control column — the bet stepper is NORMAL again (ready for the
 *  next round, not locked). `SettledNextBetCard` (reused verbatim) carries
 *  the stepper + BET AGAIN (same CTA slot as SEND IT/GO) + "same trail" +
 *  new-setup/share links; `SettledReceiptCard` (reused verbatim) carries the
 *  VERIFIED chip + one-click receipt + the VERLOOP (SessionTrendSpark)
 *  sparkline. */
function SettledControlColumn({
  controller,
  insufficient,
  onBetAgain,
  onBetAgainSamePattern,
  verifyState,
  receiptExpanded,
  onToggleReceipt,
}: {
  controller: VaultController
  insufficient: boolean
  onBetAgain: () => void
  onBetAgainSamePattern: () => void
  verifyState: 'verifying' | 'matched' | 'mismatched'
  receiptExpanded: boolean
  onToggleReceipt: () => void
}): ReactElement | null {
  const { state } = controller
  if (state.phase.kind !== 'settled') return null
  const outcome = state.phase.outcome
  const hasSession = state.history.length > 0
  // FIX 1 (2026-07-07, consolidated fix pass): desktop's GRIDV2 rebuild of
  // the settled control column never carried over the SESSION META
  // (ownership-points) row that the mobile `Settlement` component renders
  // at ~L2159-2168 — Tim's named loss-friction UX, silently absent on BOTH
  // desktop widths, win and loss. Same pointsForBet/formatPoints/
  // pointsMultLabel pattern as mobile, NOT a resurrection of the dead
  // `SettledMetaCard`/`VaultGutterCards` path.
  const ctlPointsEarned = pointsForBet(outcome.wagerLamports, outcome.won)
  const ctlPointsMultLabel = outcome.won ? '1.0x on the win' : '1.5x loss-amplified'
  // GRIDV2 SESSION-PULSE MOCKUP-PARITY FIX (2026-07-06, round 4 — supersedes
  // round 3). Round 3 grew SESSIE (`flex:1, minHeight:0`) and had
  // SidebarPulseStrip spread its OWN stat rows apart (`sidebarPulse`'s
  // `space-between`) to consume the leftover board-height — the same
  // "spread it apart and call it filled" anti-pattern Tim rejected on the
  // world-picker block. Reverted: content-sized again. The tall-viewport
  // surplus is absorbed OUTSIDE the whole control column instead — see
  // `desktopGridControl`'s `alignSelf: 'start'` (styles) — the column is
  // allowed to sit shorter than the board rather than stretching any of its
  // own content apart to reach board-bottom. `SettledReceiptCard` stays
  // content-sized directly below it (tight gap), unchanged.
  return (
    <>
      <div style={styles.gutterCard} data-testid="vault-ctl-style">
        <span style={styles.ctlLabel}>PLAY STYLE</span>
        <PlayStyleToggle controller={controller} />
      </div>
      <div style={styles.gutterCard} data-testid="vault-ctl-meta">
        <span style={styles.ctlLabel}>SESSION META</span>
        <span style={styles.settledPointsValue}>+{formatPoints(ctlPointsEarned)}</span>
        <span style={styles.settledMetaDim}>pts · {ctlPointsMultLabel}</span>
        {outcome.moonPayoutLamports > 0n && (
          <span style={{ ...styles.settledMetaDim, color: '#FFB000' }}>
            · 🌙 +{formatUsdc(outcome.moonPayoutLamports)}
          </span>
        )}
      </div>
      <div data-testid="vault-ctl-cta">
        <SettledNextBetCard
          controller={controller}
          insufficient={insufficient}
          onBetAgain={onBetAgain}
          onBetAgainSamePattern={onBetAgainSamePattern}
          outcome={outcome}
          compactSecondary
        />
      </div>
      <div style={styles.gutterTrailingGroup} data-testid="vault-ctl-trailing">
        {hasSession && (
          <div style={styles.gutterCard} data-testid="vault-ctl-session">
            <SidebarPulseStrip history={state.history} balanceLamports={state.balanceLamports} />
          </div>
        )}
        <div data-testid="vault-ctl-receipt">
          <SettledReceiptCard
            outcome={outcome}
            verifyState={verifyState}
            receiptExpanded={receiptExpanded}
            onToggleReceipt={onToggleReceipt}
            history={state.history}
          />
        </div>
      </div>
    </>
  )
}

// ─── Corner chrome — gear / world glance / help ────────────────────────────

/** Thin-line (1.6px stroke) gear glyph — CHROME material forbids filled
 *  icons. currentColor so the button's own `color` sets the tint. */
function GearGlyph(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3v2.4M12 18.6V21M21 12h-2.4M5.4 12H3M18.02 5.98l-1.7 1.7M7.68 16.32l-1.7 1.7M18.02 18.02l-1.7-1.7M7.68 7.68l-1.7-1.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Thin-line globe glyph for the world/mode glance shortcut. */
function WorldGlyph(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.6 12h16.8" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 3.6c2.6 2.3 4 5.2 4 8.4s-1.4 6.1-4 8.4c-2.6-2.3-4-5.2-4-8.4s1.4-6.1 4-8.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  )
}

/**
 * VaultCornerChrome — the approved NoLimit-clean corner-icon layout, folded
 * into this SAME build per Tim's ask (2026-07-03). Reuses the proven
 * VaultBoardRebet steel+gold-rivet material (CHROME token) — NOT a new flat
 * casino-button look — with thin-line glyphs only. Mounts as a sibling of
 * VaultGridCanvas inside `vault-canvas-shell`. Mobile (<960) renders
 * nothing.
 *
 * - Gear (top-left): BET-ENTRY ONLY. Toggles a small popover hosting the
 *   EXISTING `ExitAtSelector` (AUTO-EXIT) control — unchanged handler
 *   (`controller.setTarget`). The old "AUTO-EXIT ▾" footer pill is removed
 *   from BetConsole's options row (BetEntry() no longer passes
 *   `options`/`optionsLabel`) so the control has ONE home.
 * - World/mode glance (top-right): ALL phases. PURELY read-only display —
 *   shows the current world's name initial + a border tint in its accent
 *   color. LOBBY-SPLASH REMOVAL (2026-07-06): this used to be a clickable
 *   shortcut wired to `controller.openBetEntry`, guarded to a no-op unless
 *   `phase.kind === 'lobby'` — since there is no lobby phase to jump to any
 *   more (bet-entry IS the landing phase), the click affordance had no
 *   remaining purpose, so it is now a non-interactive `<div>` (no onClick, no
 *   hover/active chrome) rather than a button that silently does nothing.
 *   Actual mode change still requires ModeSelector + SEND IT in bet-entry.
 * - Help (bottom-left, lower slot): relocated off the header tape,
 *   reskinned to CHROME. The shared onboarding shim's own `<HelpButton>`
 *   (a plain 30px white-border circle used by Pulse/OO-Fisher too) is left
 *   completely untouched — this renders vault's OWN styled button calling
 *   the same `onHelp` handler instead.
 * - Sound (bottom-left, upper slot): DEFERRED, deliberately omitted. No
 *   mute/audio-enabled state or handler exists ANYWHERE in this codebase
 *   (`originals/_shared/audio`, vaultAudio.ts, or VaultExperience itself)
 *   to wire a toggle to — inventing one would ship a bare no-op button,
 *   which the brief explicitly forbids. Flagged in the build report; needs
 *   an audio-handler built first.
 */
function VaultCornerChrome({
  isWide,
  controller,
  phaseKind,
  onHelp,
}: {
  isWide: boolean
  controller: VaultController
  phaseKind: VaultPhase['kind']
  onHelp: () => void
}): ReactElement | null {
  const { state } = controller
  const [gearOpen, setGearOpen] = useState(false)
  useEffect(() => {
    if (phaseKind !== 'bet-entry') setGearOpen(false)
  }, [phaseKind])
  if (!isWide) return null
  const currentMode = MODE_CARDS.find((c) => c.mode === state.mode)
  return (
    <>
      {phaseKind === 'bet-entry' && (
        <div style={styles.cornerTopLeft} data-testid="vault-corner-gear">
          <button
            type="button"
            className="vault-corner-btn"
            style={styles.cornerIconBtn}
            onClick={() => setGearOpen((v) => !v)}
            aria-expanded={gearOpen}
            aria-label="Auto-exit settings"
          >
            <GearGlyph />
          </button>
          {gearOpen && (
            <div style={styles.cornerGearPopover} data-testid="vault-corner-gear-popover">
              <ExitAtSelector controller={controller} />
            </div>
          )}
        </div>
      )}
      {currentMode && (
        // Non-interactive display badge (LOBBY-SPLASH REMOVAL, 2026-07-06) —
        // see the header comment above. No onClick, no `vault-corner-btn`
        // hover/active affordance (that class is reserved for the genuinely
        // clickable gear/help buttons either side of this one).
        <div
          style={{ ...styles.cornerTopRight, border: `1px solid ${currentMode.accent}66` }}
          role="img"
          aria-label={`Current world: ${currentMode.name}`}
          data-testid="vault-corner-world"
        >
          <WorldGlyph />
        </div>
      )}
      <button
        type="button"
        className="vault-corner-btn"
        style={styles.cornerHelp}
        onClick={onHelp}
        aria-label={`Help: ${vaultOnboarding.gameLabel}`}
        data-testid="vault-corner-help"
      >
        ?
      </button>
    </>
  )
}

// ─── Small primitives ─────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }): ReactElement {
  const display = value.length > 30 ? `${value.slice(0, 12)}…${value.slice(-10)}` : value
  return (
    <>
      <dt style={styles.rowLabel}>{label}</dt>
      <dd style={styles.rowValue} title={value}>
        {display}
      </dd>
    </>
  )
}

// ReceiptRowStacked — LOOP 3 (2026-07-04, DEFECT 1 fix). Desktop-gutter-
// receipt-ONLY sibling of `Row`. `Row`'s `rowValue` style relies on a two-
// column `auto 1fr` grid (`settlementReceiptRows`) to sit beside its label —
// at this card's 200px `GUTTER.maxWidth` cap the longest label ("safe tiles
// revealed") ate the whole row, leaving the value column 0px wide (verified
// live: `getComputedStyle(dl).gridTemplateColumns === "158px 0px"`, every
// `<dd>` `getBoundingClientRect().width===0`) — full hex was reachable only
// via the hover-only `title` attr, invisible to sighted players. This row
// renders label ABOVE value (paired with `settlementReceiptRowsStacked`'s
// single-column grid) with the FULL untruncated value, wrapping inside the
// card (`overflowWrap`/`wordBreak`) instead of `Row`'s ellipsis-truncate —
// width-robust at 200px or narrower. `Row` itself is UNCHANGED (mobile
// `Settlement()` keeps calling it, byte-identical truncation behavior).
function ReceiptRowStacked({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <>
      <dt style={styles.rowLabelStacked}>{label}</dt>
      <dd style={styles.rowValueStacked} title={value}>
        {value}
      </dd>
    </>
  )
}

function Stat({
  label,
  value,
  valueColor,
  emphasis,
}: {
  label: string
  value: string
  valueColor?: string
  emphasis?: boolean
}): ReactElement {
  return (
    <div style={styles.statBlock}>
      <span style={styles.statLabel}>{label}</span>
      <span
        style={{
          ...styles.statValue,
          color: valueColor ?? T.textPrimary,
          fontSize: emphasis ? 22 : 18,
        }}
      >
        {value}
      </span>
    </div>
  )
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={disabled ? styles.primaryButtonDisabled : styles.primaryButton}
    >
      {children}
    </button>
  )
}

// ─── Default-config + unused-marker hygiene ────────────────────────────────
// Reference the imports the module relies on so a TypeScript "unused" warning
// from a defensive import does not flag during transient edits. Specifically,
// `DEFAULT_GRID_SIZE` + `DEFAULT_MINE_COUNT` are used by the controller's
// initial state but the experience module imports them for type-symbol parity.
void DEFAULT_GRID_SIZE
void DEFAULT_MINE_COUNT

// ─── Styles + keyframes ────────────────────────────────────────────────────

const shakeKeyframes = `
/* autisk 2026-07-04 (defect #4) — kill mobile phantom horizontal scroll. The
   app-root wrappers (html/body/#root) size to the full viewport width (390),
   so once a vertical scrollbar appears their content extends 15px past the
   scrollbar-reduced clientWidth (375) → a horizontal scrollbar that clips the
   top-bar balance and the board's right column. Clamping overflow-x on the
   document roots removes the phantom scroll at its source (these nodes live
   outside VaultExperience's JSX, so they're reached via this global sheet
   rather than an inline style). max-width:100% stops any 100vw-style child
   from re-introducing it. Desktop is unaffected (its content never exceeds the
   viewport width once the vertical fit in defect #5 lands). */
html, body { overflow-x: hidden; max-width: 100%; }
/* World cards: 3-across, always — BOTTOM-BAR PIVOT (2026-07-03) removed the
   old min-width:960px override that forced 1-column mode cards to fit the
   old 380-440px right sidebar. BetConsole's bet-entry step now reclaims its
   native full-width 3-across layout under the board on every viewport. */
.vault-mode-row { grid-template-columns: repeat(3, minmax(0, 1fr)); }
/* BETENTRY GUTTER REWORK (2026-07-03+1) — PICK YOUR WORLD stacks 1-column
   inside the narrow (260px) right gutter card (see ModeSelector's stacked
   prop + BetEntryGutterCards below). The base 3-across .vault-mode-row
   rule above stays untouched for every other caller (mobile <960 bottom-bar
   BetConsole). Same specificity (single class selector) — CSS source order
   (this rule comes AFTER .vault-mode-row above) makes it win whenever a
   caller applies BOTH classes together. */
.vault-gutter-mode-row { grid-template-columns: 1fr; }
/* Uniform world card (P1a) hover — default→hover raises the border only
   (selected state's accent border/tint wins via its inline style). */
.vault-world-card { transition: border-color 120ms ease, background 120ms ease; }
.vault-world-card:hover { border-color: rgba(255,255,255,0.24); }
@media (prefers-reduced-motion: reduce) { .vault-world-card { transition: none; } }
/* BOTTOM-BAR PIVOT (2026-07-03): the old min-width:960px board-height-match
   rule (.vault-actionbar { flex: 1 1 auto } + a bottom margin-top:auto
   pin on the action row) is REMOVED — that was the live desktop
   stretch-to-board-height mechanism that kept reopening a growing empty gap.
   The bottom bar now sizes to its own content on every viewport; TAKE
   PROFIT/GO sit at the natural bottom of their own column instead of being
   pinned via a stretched parent. See PhaseSurface's Lobby/Playing/Settled
   column layout for the replacement (a full-width row, sized to content). */
/* Press feedback for the tension-anchor buttons (cash-out) — the button
   answers the finger the moment it lands. Transform-only; fixed depth. */
.vault-press { transition: transform 90ms ease; }
.vault-press:active:not(:disabled) { transform: scale(0.96); }
@media (prefers-reduced-motion: reduce) { .vault-press { transition: none; } }
/* Receipt toggle — hover/press affordance so it reads as clickable. */
.vault-receipt-toggle { transition: background 120ms ease, border-color 120ms ease, transform 90ms ease; }
.vault-receipt-toggle:hover { background: rgba(0, 230, 118, 0.22) !important; border-color: rgba(0, 230, 118, 0.85) !important; }
.vault-receipt-toggle:active { transform: scale(0.96); }
@media (prefers-reduced-motion: reduce) { .vault-receipt-toggle { transition: none; } }
/* Corner chrome icons (gear/world/help) — hover halo + press feedback so
   they read as clickable instruments, not static rivets. VAULT SIDE-MARGIN
   CHROME, 2026-07-03. */
.vault-corner-btn { transition: border-color 120ms ease, box-shadow 120ms ease, transform 90ms ease; }
.vault-corner-btn:hover { border-color: rgba(255,197,61,0.55); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,197,61,0.12); }
.vault-corner-btn:active { transform: scale(0.94); }
@media (prefers-reduced-motion: reduce) { .vault-corner-btn { transition: none; } }
@keyframes vault-card-enter {
  0%   { opacity: 0; transform: translate3d(0, 6px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0,   0); }
}
@keyframes vault-live-heartbeat {
  0%, 100% { transform: scale(1);   opacity: 1;   }
  50%      { transform: scale(1.4); opacity: 0.55; }
}
/*
  RG-C5 NOTE on .vault-cashout-dramatic:
  The breathing-glow keyframe duration (1.6s) is a CSS-level constant. It
  does NOT scale with streak length, session-round count, or any
  frequency-tracking value. The "dramatic" register is gated by the
  CURRENT multiplier (an economic value) — a 1.6x reached on the first
  reveal pulses at the same rate as a 1.6x reached on the 18th reveal.
*/
@keyframes vault-cashout-breath {
  0%, 100% {
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.30),
      inset 0 -2px 0 rgba(0,0,0,0.20),
      0 0 24px rgba(0,230,118,0.24);
  }
  50% {
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.30),
      inset 0 -2px 0 rgba(0,0,0,0.20),
      0 0 40px rgba(0,230,118,0.48);
  }
}
.vault-cashout-dramatic {
  animation: vault-cashout-breath 1.6s ease-in-out infinite;
}
.pulse-wager-input::-webkit-outer-spin-button,
.pulse-wager-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.pulse-wager-input {
  appearance: textfield;
}
.pulse-wager-input::selection {
  background: rgba(0, 230, 118, 0.30);
  color: #ffffff;
}
.pulse-wager-input:focus {
  outline: none;
}
.pulse-wager-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 230, 118, 0.65);
  border-radius: 6px;
}
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
/*
  BIG center-screen reveal — RG-C5 SAFE: timings + amplitudes are module-const.
  The hero overlay fires on every settle (won OR lost). Amplitude is identical
  regardless of outcome class; only color + copy bucket shift via the React
  layer. No streak parameter reaches these keyframes.
*/
@keyframes vault-hero-enter {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes vault-hero-door {
  0%   { opacity: 0; transform: scale(0.65) rotate(-12deg); }
  55%  { opacity: 1; transform: scale(1.10) rotate(0deg); }
  100% { opacity: 1; transform: scale(1.00) rotate(0deg); }
}
@keyframes vault-hero-label {
  0%   { opacity: 0; transform: translate3d(0, 12px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
/*
  Rhythm badge — cosmetic celebration during 'playing'. Module-const enter
  animation, RG-C5 SAFE — fires every time the rhythm-tick evaluator surfaces
  a non-null tier. Two fixed tiers (rhythm / perfect); no continuous escalation.
*/
@keyframes vault-rhythm-badge-enter {
  0%   { opacity: 0; transform: translate3d(-50%, -8px, 0) scale(0.92); }
  100% { opacity: 1; transform: translate3d(-50%, 0,   0) scale(1.00); }
}
/*
  Mobile sizing — Pixel 7 / iPhone 12 viewports. The canvas shell collapses
  user-select for the entire game area so tap-and-hold on tile faces never
  triggers an iOS text selection. The header tape font ramps down + the
  hero-overlay typography clamps so the SVG door + headline both fit a
  390-414px viewport without truncation.
*/
@media (max-width: 480px) {
  .vault-hero-title { font-size: 22px !important; }
  .vault-hero-mult  { font-size: 26px !important; }
  .vault-hero-door-svg { width: 160px !important; height: 160px !important; }
}
.vault-spinner { animation: vault-spin 0.8s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .vault-card-enter { animation: none; }
  .vault-cashout-dramatic { animation: none; }
  .vault-spinner { animation: none; }
}
`

const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: T.fontBody,
    color: T.textPrimary,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  headerTape: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
    padding: '2px 0 14px',
    borderBottom: `1px solid ${T.borderSubtle}`,
  },
  tapeBrand: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.32em',
    textTransform: 'uppercase',
    color: T.textPrimary,
  },
  tapeMeta: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  tapeSeparator: {
    display: 'inline-block',
    width: 32,
    height: 1,
    background: T.accentSolid,
  },
  tapeTime: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.accent,
    fontVariantNumeric: 'tabular-nums',
  },
  liveBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 8px',
    border: `1px solid ${T.accentMuted}`,
    borderRadius: 4,
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.24em',
    color: T.accent,
    fontWeight: 600,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: T.accentSolid,
    boxShadow: `0 0 8px ${T.accentSolid}`,
    animation: 'vault-live-heartbeat 1.6s ease-in-out infinite',
  },
  tapeBalance: {
    marginLeft: 'auto',
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  tapeBalanceValue: {
    fontFamily: T.fontMono,
    color: T.accent,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.10em',
  },
  // The framed CABINET — the whole game reads as one contained unit (the
  // Stake-Mines / Bonanza box). The board clips flush to the frame (padding 0
  // + overflow hidden); controls seat in a bounded panel BELOW the board, so
  // nothing floats or looks cropped.
  roundCard: {
    position: 'relative',
    background: `
      radial-gradient(ellipse 50% 60% at 18% 50%, rgba(0,230,118,0.06), transparent 55%),
      radial-gradient(ellipse 50% 60% at 82% 50%, rgba(0,230,118,0.04), transparent 55%),
      linear-gradient(180deg, #050b13, #03070d)
    `,
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 20,
    padding: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    isolation: 'isolate',
    // TIGHT CONTACT SHADOW (2026-07-06, unified-plate-material fix) — was a
    // 64px-blur/28px-offset black halo, the same drop-halo family the
    // control-column plates carried; swapped for the same tight-contact
    // token so the shell frame doesn't reintroduce a halo at the canvas
    // edge. Radius (20) is a deliberately distinct register — untouched.
    boxShadow: 'inset 0 0 0 1px rgba(0,230,118,0.06), 0 4px 12px rgba(0,0,0,0.32)',
  },
  // Board region — holds ONLY the canvas + cosmetic overlays (no controls).
  // `zIndex: 1` seats this ABOVE the shell-wide `sceneBackdropLayer` (zIndex
  // 0) that now paints the per-world photo continuously behind board +
  // control column (doortrekken-de-achtergrond fix, 2026-07-06) — CSS Grid
  // and Flexbox both apply z-index to items as if position:relative, so this
  // alone is enough to guarantee stacking order regardless of DOM position.
  boardRegion: {
    position: 'relative',
    width: '100%',
    flexShrink: 0,
    overflow: 'hidden',
    zIndex: 1,
    // Whole board area unselectable; interactive children opt back in.
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  },
  // Bounded control panel — bet-entry / playing HUD / settled seat here in
  // normal flow (a real section of the cabinet, not a floating overlay).
  // `zIndex: 1` — see `boardRegion` note above (mobile's flex-stacked cabinet
  // needs the same explicit stacking as the desktop grid).
  controlPanel: {
    flexShrink: 0,
    width: '100%',
    zIndex: 1,
  },
  // MOBILE HUD BAND (FIX #2, 2026-07-07 mobile HUD/board overlap fix) — a
  // real DOM row seated ABOVE the canvas, board-width-anchored via the same
  // live-measured `boardLayout` the desktop HUD-ZONE bar uses (see
  // `hudInnerStyle` in `DesktopChassis`). Mobile previously relied on the
  // CANVAS drawing its own PUMP/BAG/RUG-RISK text inside a percentage-
  // reserved top band (`computeGridLayout`'s non-minimal ~15% portrait
  // reserve); at SHITCOIN's 7×7 grid that reserve wasn't tall enough for the
  // full 3-line HUD text stack and the bottom line clipped into the top
  // safe row. This band owns that space OUTSIDE the canvas entirely (see
  // `domHudActive={isWide || bottomBarPhase}` at the shared canvas call
  // site), so the overlap is now structurally impossible at any grid size.
  // Reuses the SAME translucent `rgba(9,15,24,0.55)` fill as the desktop
  // HUD-ZONE bar (`desktopGridHudBar`) so it reads as part of the scene
  // (the shared per-world backdrop shows through), never a sterile grey gap.
  mobileHudBand: {
    display: 'flex',
    alignItems: 'stretch',
    flexShrink: 0,
    marginBottom: 8,
    zIndex: 1,
    minWidth: 0,
  },
  mobileHudBandInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
    minHeight: 52,
    padding: '8px 12px',
    background: 'rgba(9,15,24,0.55)',
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    boxSizing: 'border-box',
    minWidth: 0,
  },
  mobileHudHeroLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    overflow: 'hidden',
  },
  mobileHudHeroMult: {
    fontFamily: T.fontMono,
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '-0.01em',
    color: T.accent,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  mobileHudHeroMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  mobileHudHeroKicker: {
    fontFamily: T.fontMono,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: T.textMuted,
    whiteSpace: 'nowrap',
  },
  mobileHudHeroBag: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.01em',
    color: T.bag,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  mobileHudRight: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.03em',
    color: T.textMuted,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    textAlign: 'right',
  },
  // Shell-wide per-world backdrop photo — the single DOM layer that replaces
  // the old canvas-only `ctx.drawImage(backdrop,...)` draw (moved out of
  // VaultGridCanvas.tsx, 2026-07-06 doortrekken-de-achtergrond fix). Painted
  // as the FIRST child of both the desktop grid (`desktopGrid`) and the
  // mobile cabinet (`roundCard`/`cabinetStyle`) — both containers are already
  // `position:'relative'`, so `inset:0` spans the WHOLE shell (board + gutter
  // + control column on desktop; board + panel on mobile), removing the hard
  // seam at the board's right edge. `backgroundImage` is set per-call-site to
  // a stacked `linear-gradient(scrim, scrim), url(photo)` — one background
  // layer carries both the cover-fit photo AND its per-world scrim wash, so
  // there is exactly one paint of the art with exactly one scrim applied.
  sceneBackdropLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  // SCENE EDGE-SCRIM (rugsui fix-spec §1) — mounted as the NEXT sibling
  // right after `sceneBackdropLayer` (same `zIndex: 0`, later in DOM order,
  // so it paints ON TOP of the photo+wash but still UNDER every zIndex:1 UI
  // layer). Two background layers in one element: the bottom-fade image is
  // listed FIRST (top of the paint stack) and pinned to a 70px band at the
  // bottom via `backgroundSize`/`backgroundPosition`; the edge-darken
  // horizontal gradient is listed second and covers the full box. Never
  // blurs the art — darken-only, exactly per spec.
  sceneEdgeScrimLayer: {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
    backgroundImage: `${VAULT_SCRIM_BOTTOM}, ${VAULT_SCRIM_EDGE_H}`,
    backgroundSize: '100% 70px, 100% 100%',
    backgroundPosition: 'bottom, top',
    backgroundRepeat: 'no-repeat, no-repeat',
  },
  canvasOverlayCenter: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    padding: 24,
    // VAULT-ART-DIRECTION-SPEC-2026-05-27 §7: canvas is at zIndex 1 over the
    // AI backdrop (zIndex 0). UI overlays must stack ABOVE the canvas — bump
    // to zIndex 2 to restore visibility + clickability of bet-entry, mine-hit,
    // and settlement surfaces.
    zIndex: 2,
  },
  // Tim 2026-05-26 SCENE-REBUILD: the embedded under-tray. Bottom-anchored,
  // full-width within the canvas (with margin to clear the titanium wall
  // panels). pointerEvents: 'none' on the wrapper so the canvas above stays
  // tappable. The inner overlayPanel re-enables pointer events.
  canvasOverlayUnderTray: {
    position: 'absolute',
    left: '11%',
    right: '11%',
    bottom: 16,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    pointerEvents: 'none',
    maxWidth: 'calc(100% - 32px)',
    // Stack above the procedural canvas (zIndex 1) so bet-entry remains
    // visible + clickable after the AI-backdrop integration landed.
    zIndex: 2,
  },
  canvasOverlayBottom: {
    // Corner-anchored BOTTOM-RIGHT (chassis fix 2026-05-25). The "VAULT
    // OPEN · reveal another tile · LOCK IT IN" panel was a wide bar
    // covering the bottom row of gem tiles. Now a corner pill so the
    // gem grid is fully visible at all times.
    position: 'absolute',
    right: 16,
    bottom: 16,
    display: 'flex',
    justifyContent: 'flex-end',
    pointerEvents: 'none',
    maxWidth: 'calc(100% - 32px)',
    // Stack above the procedural canvas (zIndex 1) so the action bar is
    // visible + clickable after the AI-backdrop integration landed.
    zIndex: 2,
  },
  overlayPanel: {
    pointerEvents: 'auto',
    // SCENE-REBUILD: the under-tray spans the full plinth width (within
    // the titanium wall panels). Bet-entry needs room for the wager hero +
    // chip rail + grid selector + mine slider in a single horizontal band.
    width: '100%',
    maxWidth: 720,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  actionBarPanel: {
    pointerEvents: 'auto',
    width: '100%',
    maxWidth: 280,
  },
  gameFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    // autisk 2026-07-04 (defect #5): trimmed 14 → 6 so the PLAYING footer's
    // extra status line ("OPEN · N of M safe compartments") clears the viewport
    // height with margin to spare (paired with the −16px page-gap tighten).
    paddingTop: 6,
    flexWrap: 'wrap',
  },
  gameFooterStatus: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
  },
  gameFooterStatusMain: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textPrimary,
  },
  gameFooterStatusMuted: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: T.textMuted, // was textDim (0.40) — unreadable on the dark page
  },
  betHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 2,
  },
  betEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textPrimary,
  },
  betHint: {
    fontFamily: T.fontBody,
    fontSize: 11,
    color: T.textMuted,
  },
  wagerBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  wagerLabel: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.16em',
    color: T.textMuted,
    textTransform: 'uppercase',
  },
  settledWagerEditor: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 10,
  },
  settledWagerLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.16em',
    color: T.textMuted,
    textTransform: 'uppercase',
  },
  wagerStepper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '6px 8px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
  },
  wagerStepBtn: {
    width: 44,
    height: 44,
    minWidth: 44,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,230,118,0.12)',
    color: '#00E676',
    border: '1px solid rgba(0,230,118,0.35)',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  wagerStepperValue: {
    flex: 1,
    textAlign: 'center',
    fontFamily: T.fontMono,
    fontSize: 26,
    fontWeight: 800,
    color: T.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
  },
  // The wager numeral inside the shared BetConsole's recessed counter window.
  consoleWagerValue: {
    fontFamily: T.fontMono,
    fontSize: 26,
    fontWeight: 800,
    color: T.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
  },
  wagerGroup: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    padding: '4px 0 8px',
    // Soft glow under the number instead of a hard rule — feels lit, not boxed.
    background:
      'radial-gradient(ellipse 60% 40% at 50% 120%, rgba(0, 230, 118, 0.12), rgba(0,0,0,0))',
  },
  wagerCurrency: {
    fontFamily: T.fontMono,
    fontSize: 26,
    fontWeight: 700,
    color: T.accent,
  },
  wagerHero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  wagerEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  wagerAmountInput: {
    fontFamily: T.fontMono,
    fontSize: 46,
    fontWeight: 800,
    color: T.textPrimary,
    background: 'transparent',
    border: 'none',
    textAlign: 'center',
    width: 'auto',
    minWidth: 60,
    maxWidth: 180,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  wagerAmountUnit: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textMuted,
    alignSelf: 'flex-end',
    paddingBottom: 8,
  },
  quickPickRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
  },
  quickPick: {
    padding: '9px 4px',
    background: 'rgba(255, 255, 255, 0.05)',
    color: T.textMuted,
    border: 'none',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.06em',
    cursor: 'pointer',
  },
  quickPickSelected: {
    padding: '9px 4px',
    background: T.accentSolid,
    color: T.accentInk,
    border: 'none',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
    cursor: 'pointer',
  },
  quickPickDisabled: {
    padding: '8px 4px',
    background: 'rgba(255, 255, 255, 0.02)',
    color: T.textDim,
    border: `1px dashed ${T.borderSubtle}`,
    borderRadius: 6,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.06em',
    cursor: 'not-allowed',
    opacity: 0.55,
  },
  // Inline "preview" marker on a chip that's enabled but not yet on-chain.
  // Cool-on-cool (no warm-cyan violation). The chip itself stays in its
  // normal/selected style; the marker is small text inside it.
  gridPreviewBadge: {
    display: 'inline-block',
    marginLeft: 6,
    padding: '0 4px',
    fontFamily: T.fontMono,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: T.textMuted,
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 3,
    verticalAlign: 'middle',
  },
  gridBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  modeBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  // Columns live in the `.vault-mode-row` class (media query: 3-across on
  // mobile, STACKED in the ≥960px desktop sidebar where 3 don't fit).
  modeRow: {
    display: 'grid',
    gap: 8,
  },
  modeCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    padding: '11px 11px 12px',
    border: 'none',
    borderRadius: 11,
    cursor: 'pointer',
    textAlign: 'left',
    minHeight: 92,
  },
  // GRIDV2 WORLD-PICKER MOCKUP-PARITY FIX (2026-07-06, round 4) — the
  // `stacked` desktop branch's asymmetric card treatment (`input/newui1.jpg`):
  // the SELECTED world is a real card (tinted bg via inline `background`,
  // colored border via inline `borderColor` — both from `c.accent`, no new
  // colors), the UNSELECTED worlds are plain rows. Both share the SAME
  // border width/radius/padding-left so nothing shifts horizontally when the
  // selection changes — only the border's opacity/color and the vertical
  // padding (selected gets the extra BEST-pill line) differ.
  // WORLD-PICKER CARD-SIZE BUMP (2026-07-06, round 5) — Tim, on
  // `beetje strechen.jpg` (ALTSEASON selected): "waarom zijn de game mode
  // blokken nu zo klein kan je ze iets groter stretchen". Growing the CARDS'
  // OWN size (padding + type), NOT the gaps between them — round-3's
  // gap-stretch anti-pattern stays permanently off the table (see the
  // `modeRowStyle`/`modeBlockStyle` comment above: gap:6 / gap:8 are FROZEN).
  // Left padding kept IDENTICAL (14px) between selected/plain so nothing
  // shifts horizontally when the selection changes (round-4 invariant).
  modeCardStackedSelected: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '13px 14px 14px',
    border: '1px solid transparent',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
  },
  modeCardStackedPlain: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '9px 14px',
    border: '1px solid transparent',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    background: 'transparent',
  },
  modeCardTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 6,
  },
  // modeName/modeTier/modeRugCount/modeBestValue base fontSizes stay at their
  // ORIGINAL values below (byte-identical for the mobile `modeCard` 3-across
  // branch, which is width-constrained at 320px and already right at its
  // text-overflow limit — a baseline check found "BLUECHIPSNORMAL" etc.
  // already overflowing its 79px column at these original sizes, so bumping
  // the shared token would make mobile strictly worse). The round-5 type
  // bump for the desktop `stacked` card is applied as an inline `fontSize`
  // override at the `stacked` JSX call sites only (see MODE_CARDS.map
  // above) — mobile keeps these exact numbers untouched.
  modeName: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.04em',
  },
  modeTier: {
    fontFamily: T.fontMono,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.18em',
  },
  modeRiskRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  modeRiskDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  modeRugCount: {
    fontFamily: T.fontMono,
    fontSize: 9.5,
    color: T.textMuted,
    letterSpacing: '0.03em',
    marginLeft: 4,
  },
  modeTagline: {
    fontFamily: T.fontBody,
    fontSize: 10.5,
    lineHeight: 1.3,
    color: T.textMuted,
  },
  // ITEM 1 — YOUR BEST chip on a mode card (gold / bag economy).
  modeBestChip: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 5,
    marginTop: 2,
    padding: '3px 7px',
    alignSelf: 'flex-start',
    background: 'rgba(255, 197, 61, 0.12)',
    border: '1px solid rgba(255, 197, 61, 0.34)',
    borderRadius: 999,
  },
  modeBestLabel: {
    fontFamily: T.fontMono,
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.bag,
  },
  modeBestValue: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 800,
    color: T.bag,
    fontVariantNumeric: 'tabular-nums',
  },
  // ─── UNIFORM WORLD CARD (P1a) — layout-spec rebuild ──────────────────────
  // Every world is this same card (flat sibling, no wrapper). radius 12, 1px
  // border, semi-transparent dark fill; selection recolours border/tint/icon
  // only. `paddingBottom` leaves room for the absolute risk bar at the edge.
  worldCard: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '10px 12px 14px',
    borderRadius: 12,
    // Longhand border (P5) — the selected-state override sets `borderColor`
    // only, so the base MUST NOT use the `border` shorthand or React warns
    // about mixing shorthand + non-shorthand on the same node.
    borderWidth: 1,
    borderStyle: 'solid',
    // UNIFIED VAULT-PLATE BORDER (2026-07-06) — was `T.borderDefault` (white
    // 0.12), one of 4 competing border families the taste-guardian +
    // cohesion-reviewer both flagged. Retired to the same muted-gold hairline
    // every other control-column plate now uses. The SELECTED override below
    // (`borderColor: ${ac}88`) is STATE, not this base — untouched.
    borderColor: VAULT_PLATE_BORDER,
    // WCAG RE-AUDIT FIX (2026-07-06) — this base fill was left translucent
    // (`rgba(255,255,255,0.03)`) when only the border was unified last
    // round, so on the un-selected 2-of-3 world cards the `worldMaxLabel`
    // "MAX" caption composited against whatever `sceneBackdropLayer` photo
    // is currently showing through — 4.30-4.38:1 (fails AA) whenever
    // ALTSEASON is the active/brightest world. Opaque `VAULT_PLATE_FILL`
    // (the same plate every other control-column card now uses) makes this
    // card's text contrast world-independent by construction — no live
    // probe can regress it again. The SELECTED-state override two lines
    // below (`background: linear-gradient(180deg, ${ac}22, ...)`) is the
    // STATE signal and stays exactly as-is; only this un-selected base fill
    // went opaque.
    background: VAULT_PLATE_FILL,
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
  },
  worldIconTile: {
    width: 34,
    height: 34,
    borderRadius: 8,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    fontFamily: T.fontMono,
    lineHeight: 1,
    background: 'rgba(255,255,255,0.05)',
    color: T.textMuted,
  },
  worldBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  worldTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  worldTitle: {
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
  },
  worldTierPill: {
    fontFamily: T.fontMono,
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 999,
    // Longhand (P5) — `borderColor` is set per-tier inline, so avoid the
    // shorthand/longhand mix warning here too.
    borderWidth: 1,
    borderStyle: 'solid',
    flexShrink: 0,
    lineHeight: 1,
  },
  worldMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: T.fontMono,
    fontSize: 10.5,
    color: T.textMuted,
    letterSpacing: '0.02em',
    minWidth: 0,
  },
  worldMetaBest: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 3,
    padding: '1px 6px',
    borderRadius: 999,
    background: 'rgba(255,197,61,0.12)',
    border: '1px solid rgba(255,197,61,0.34)',
    color: T.bag,
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.04em',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  worldMetaBestLabel: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.14em',
  },
  worldMaxAnchor: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 1,
    textAlign: 'right',
  },
  worldMaxValue: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  // WCAG RE-AUDIT FIX (2026-07-06) — was `T.textDim`; combined with the
  // `worldCard` fill going opaque above, this "MAX" caption's contrast is
  // now world-independent (see that comment for the full diagnosis).
  worldMaxLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.14em',
    color: T.textMuted,
  },
  // P2 (2026-07-06) — the risk channel now carries a "RISK" micro-cue AND a
  // taller (4px), more-opaque danger-tinted track so a new player reads it as
  // risk without a legend. Bar starts after the label (left: 42).
  worldRiskLabel: {
    position: 'absolute',
    left: 12,
    bottom: 4,
    fontFamily: T.fontMono,
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: '0.12em',
    lineHeight: 1,
    color: 'rgba(255,77,77,0.78)',
  },
  worldRiskBar: {
    position: 'absolute',
    left: 42,
    right: 12,
    bottom: 5,
    height: 4,
    borderRadius: 2,
    background: 'rgba(255,77,77,0.16)',
    overflow: 'hidden',
  },
  worldRiskFill: {
    display: 'block',
    height: '100%',
    background: T.danger,
    boxShadow: '0 0 6px rgba(255,77,77,0.5)',
  },
  // HIERARCHY FIX (2026-07-06, jesse fresh-player comprehension gate,
  // task_category vault-splash-removal-followup) — the original "bare row"
  // treatment (11px, no border, no label) read as the WEAKEST-hierarchy
  // element on the whole screen, sitting under the loud green world-card
  // multipliers + the bright SEND IT CTA, so a player could hit SEND IT
  // without ever registering the rug/cash-out loop. Promoted to a bordered
  // "HOW IT WORKS" chip reusing the SAME `gutterCard`/GLASS material as the
  // "YOUR BET" panel directly below it (twin-card rhythm, not a one-off
  // treatment) — this is now the FIRST framed element a fresh player reads
  // in the column, ahead of the (flat) world-picker. Still bare-row-cheap
  // relative to a full card (tighter padding/gap) to protect the column's
  // documented CTA-below-fold budget — re-measured live at 1440x900 and
  // 1920x1080 with this chip present (see run report).
  betEntryIntro: {
    // Same GLASS material `gutterCard` builds from (module const, safe to
    // reference here — `styles.gutterCard` is NOT, since this object
    // literal can't self-reference during its own initialization; see
    // `betPanel`'s local-const `...styles.gutterCard` spread in
    // `BetEntryControlColumn` for the pattern used post-construction).
    ...GLASS,
    display: 'flex',
    flexDirection: 'column',
    pointerEvents: 'auto',
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 12,
    padding: '12px 14px 13px',
    gap: 6,
  },
  betEntryIntroLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    // T.accent (pump green), not T.textDim/ctlLabel's usual 40% — this
    // label is the discoverability anchor for the ONLY forced teaching
    // content in the column, so it gets the same "read me" weight as the
    // game's own active-state green rather than a quiet section caption.
    color: T.accent,
  },
  betEntryIntroLine: {
    fontFamily: T.fontBody,
    fontSize: 12, // was 11 — matches the established `ctlHint` body-copy size
    lineHeight: 1.4,
    color: T.textMuted,
  },
  betEntryIntroStrong: {
    fontFamily: T.fontMono,
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: T.textPrimary,
  },
  // ─── BetEntry control-column layout primitives (layout-spec) ─────────────
  // Flat, unwrapped picker group (P1) — no border/bg; the 3 world cards are
  // the only chrome, as flat siblings.
  betEntryPicker: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    boxSizing: 'border-box',
  },
  // Bare TO WIN row (P4) — a single row, not a boxed panel.
  betEntryToWinRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
    padding: '0 4px',
  },
  betEntryToWinValue: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: T.accent,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  // Bare CTA wrapper (P5) — just the button, no surrounding card, no balance
  // line (balance is Z1 only).
  betEntryCta: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
  },
  // ITEM 4 — RUGS tuner row (BLUECHIPS / ALTSEASON only).
  // LEGIBILITY FIX (2026-07-06, verifier-loop iter 2, autisk checkpoint 3) —
  // the old `rgba(255,255,255,0.03)` wash was a near-invisible highlight that
  // relied entirely on the parent `gutterCard`/GLASS backing for contrast.
  // That worked when the control column sat over flat-dark, but now the
  // shell-wide per-world backdrop photo (see `sceneBackdropLayer` above)
  // shows through GLASS's own translucency, so this ONE sub-row (nested a
  // level deeper than the world-cards/YOUR BET text, which use fully-opaque
  // T.textPrimary) dropped below WCAG AA on the brightest world (BLUECHIPS
  // gold). Fix: give the row its OWN near-opaque dark fill, reusing the
  // exact vault-steel dark-stop RGB triple `(9,15,24)` GLASS/GLASS_CTA are
  // built from (same register, no new hue) at a flat 0.92 alpha — dark
  // enough that residual backdrop bleed-through is negligible regardless of
  // world. Border bumped to match `T.borderDefault` (the hairline token the
  // sibling `worldCard` already uses), not a new value.
  // UNIFIED VAULT-PLATE MATERIAL (2026-07-06) — was a bespoke near-opaque
  // 0.92-alpha fill (its own one-off WCAG fix) + a white 0.12 border, one of
  // the 4 competing border families flagged by taste-guardian +
  // cohesion-reviewer. Border + radius are now the SAME gold hairline +
  // radius-12 every other control-column plate uses (untouched by the fix
  // below — only the fill changed).
  // RUGS-STEPPER CONTRAST FIX (2026-07-06, WCAG re-audit) — the shared
  // `VAULT_PLATE_FILL` gradient's top stop is lighter than this row needs;
  // see `RUGS_TUNER_FILL`'s definition above for the full diagnosis. A
  // dedicated flat, fully-opaque fill (still the same steel-dark family,
  // just one dedicated shade darker) restores every metric in this row to
  // at least its prior hard-won floor while every OTHER plate keeps the
  // shared gradient exactly as landed last round.
  // COHESION FIX (2026-07-06, autisk nitpick) — this was the only
  // control-column plate with no `boxShadow`, so it read flat/matte next to
  // its molded siblings. Adding the shared `VAULT_PLATE_SHADOW` (inset
  // top-highlight hairline + outer contact shadow) makes it read as the same
  // molded plate, just seated a touch deeper — the darker `RUGS_TUNER_FILL`
  // stays untouched, and neither shadow layer sits over the label/value text
  // (top-highlight is a 1px edge, contact shadow is outside the card), so
  // the hard-won text contrast on this row is unaffected.
  rugsTuner: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '9px 10px',
    background: RUGS_TUNER_FILL,
    border: `1px solid ${VAULT_PLATE_BORDER}`,
    borderRadius: VAULT_PLATE_RADIUS,
    boxShadow: VAULT_PLATE_SHADOW,
  },
  rugsTunerHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  rugsTunerLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    // LEGIBILITY FIX (2026-07-06) — `T.textDim` is a 40%-alpha white; even
    // against a fully-opaque black backing that caps out around 3.7:1,
    // structurally short of the 4.5:1 AA floor no matter how dark the row's
    // own background gets. `T.textMuted` (62%-alpha, the same token
    // `ctlLabel`/`pacePillInactive` already use for muted-but-legible
    // captions elsewhere in this file) clears AA against the new
    // near-opaque `rugsTuner` background with margin.
    color: T.textMuted,
  },
  rugsTunerHint: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.accent,
    letterSpacing: '0.04em',
    fontVariantNumeric: 'tabular-nums',
  },
  rugsStepper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  // WCAG 2.5.5 touch-target fix (2026-07-09, vault-native mine-count stepper
  // — the shared BetConsole's own stepper was already fixed on 2026-07-07,
  // this is the vault-owned lookalike control that fix didn't cover). Same
  // idiom as BetConsole's `stepBtn`/`stepBtnHit` pair: this style is now the
  // VISIBLE swatch only (unchanged 40x40, unchanged fill/border/radius —
  // byte-identical to the pre-fix values), rendered on an inner <span>
  // centered inside a new invisible 44x44 `rugsStepBtnHit` wrapper <button>
  // that carries the real interactive surface (cursor/touchAction moved
  // there). Visible appearance is pixel-identical; only the tappable region
  // grows.
  rugsStepBtn: {
    width: 40,
    height: 40,
    minWidth: 40,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    // LEGIBILITY FIX (2026-07-06) — the 12%-alpha fill barely differed in
    // luminance from the row's own (now much darker) background, so the
    // button's edge only read via its border; that border's old 35% alpha
    // also fell short of the ≥3:1 UI-component-contrast floor against the
    // new dark row bg. Both bumped (fill 0.12->0.18, border 0.35->0.85,
    // same `T.danger` red hue, no new color) so the stepper button clearly
    // delimits itself as a discrete control.
    background: 'rgba(255, 77, 77, 0.18)',
    color: T.danger,
    border: '1px solid rgba(255, 77, 77, 0.85)',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1,
  },
  rugsStepBtnDisabled: {
    width: 40,
    height: 40,
    minWidth: 40,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.03)',
    color: T.textDim,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1,
    opacity: 0.5,
  },
  // The real, invisible, 44x44 hit target (see comment above `rugsStepBtn`).
  // Zero padding/border/background of its own — mirrors BetConsole's
  // `stepBtnHit`. `touchAction:'manipulation'` lives here (the real
  // <button>), not on the inner visual span.
  rugsStepBtnHit: {
    width: 44,
    height: 44,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  rugsStepBtnHitDisabled: {
    width: 44,
    height: 44,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'not-allowed',
    touchAction: 'manipulation',
  },
  rugsStepValue: {
    flex: 1,
    textAlign: 'center',
    fontFamily: T.fontMono,
    fontSize: 20,
    fontWeight: 800,
    color: T.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
  },
  rugsStepValueUnit: {
    fontSize: 11,
    fontWeight: 600,
    // LEGIBILITY FIX (2026-07-06) — same `T.textDim`-caps-under-AA issue as
    // `rugsTunerLabel` above; the numeral it sits beside now clears easily,
    // so the unit suffix shouldn't be the one weak link. `T.textMuted`.
    color: T.textMuted,
    letterSpacing: '0.08em',
  },
  // ITEM 3 — EXIT AT selector (bet-entry) + live chip (playing).
  exitBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  exitHint: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.bag,
    letterSpacing: '0.04em',
  },
  exitRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
  },
  exitChip: {
    padding: '9px 4px',
    background: 'rgba(255, 255, 255, 0.05)',
    color: T.textMuted,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  exitChipSelected: {
    padding: '9px 4px',
    background: 'rgba(255, 197, 61, 0.16)',
    color: T.bag,
    border: '1px solid rgba(255, 197, 61, 0.55)',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  exitLiveChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    background: 'rgba(255, 197, 61, 0.12)',
    color: T.bag,
    border: '1px solid rgba(255, 197, 61, 0.42)',
    borderRadius: 999,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  exitLiveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: T.bag,
    flexShrink: 0,
  },
  gridHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  gridStatus: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.accent,
    letterSpacing: '0.08em',
  },
  mineBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  mineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mineLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  mineStatus: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.accent,
    letterSpacing: '0.08em',
  },
  mineSlider: {
    width: '100%',
    accentColor: T.accentSolid,
  },
  autopickBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    background: 'rgba(255, 255, 255, 0.02)',
    border: `1px dashed ${T.borderSubtle}`,
    borderRadius: 8,
  },
  autopickHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autopickLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  autopickStatus: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.accent,
    letterSpacing: '0.16em',
  },
  autopickCopy: {
    fontFamily: T.fontBody,
    fontSize: 11,
    color: T.textMuted,
    margin: 0,
    lineHeight: 1.5,
  },
  autopickButton: {
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.04)',
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 6,
    color: T.textDim,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  betFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingTop: 4,
  },
  betFooterStats: {
    display: 'flex',
    gap: 18,
  },
  betFooterStat: {
    display: 'flex',
    flexDirection: 'column',
  },
  betFooterStatLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  betFooterStatValue: {
    fontFamily: T.fontMono,
    fontSize: 12,
    color: T.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  betFooterActions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  linkButton: {
    background: 'transparent',
    border: 'none',
    color: T.textMuted,
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    padding: '6px 4px',
  },
  commitButton: {
    // Primary CTA — layout-spec height 44px (radius 8). Flex-centered so the
    // fixed height holds regardless of label.
    height: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 30px',
    background: `linear-gradient(180deg, ${T.accentSolid}, #00a85a)`,
    color: T.accentInk,
    border: 'none',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -2px 0 rgba(0,0,0,0.20), 0 0 24px rgba(0,230,118,0.3)',
  },
  commitButtonDisabled: {
    // Same 44px footprint as the enabled CTA so the slot never shifts.
    height: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 20px',
    background: 'rgba(94, 234, 212, 0.08)',
    color: T.textMuted,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
  },
  // PrimaryButton is the Lobby's sole CTA, sitting after the (now
  // content-sized) SidebarPulseStrip inside `controlCard` (`flex: 1`,
  // `justifyContent: 'flex-start'`). `margin-top: auto` pulls any genuine
  // leftover board-height into the gap ABOVE this button instead of letting
  // the pulse-strip card stretch to absorb it (panel-inside-void fix,
  // 2026-07-02).
  primaryButton: {
    // Lobby primary CTA — layout-spec height 44px (radius 8).
    height: 44,
    minHeight: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 24px',
    background: `linear-gradient(180deg, ${T.accentSolid}, #00a85a)`,
    color: T.accentInk,
    border: 'none',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -2px 0 rgba(0,0,0,0.20)',
    marginTop: 'auto',
  },
  primaryButtonDisabled: {
    padding: '14px 24px',
    background: 'rgba(94, 234, 212, 0.08)',
    color: T.textMuted,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
    marginTop: 'auto',
  },
  // Corner pill — playing / mine-hit / settling / settled (chassis fix
  // 2026-05-25). Vertical stack so the panel stays ≤ 280 px wide and the
  // gem grid bottom row stays visible.
  // Playing / mine-hit / settling HUD — a grounded steel panel seated in the
  // control-panel (matches the bet-console + settled panel material, no glass).
  // UNIFIED VAULT-PLATE MATERIAL (2026-07-06, mobile action bar) — stays
  // OPAQUE (correct, untouched), but the old gold-TOP/white-SIDES border
  // split (one of the 4 competing border families) is retired to ONE gold
  // hairline on every visible edge, and the hard art->black seam at the top
  // edge is softened with an upward-cast contact shadow (the bar now reads
  // as receding under the scene instead of clipping it) instead of the flat
  // single-value inset glow it had before.
  actionBar: {
    position: 'relative',
    background: 'linear-gradient(180deg, #1B2330 0%, #090F18 100%)',
    borderTop: `1px solid ${VAULT_PLATE_BORDER}`,
    borderLeft: `1px solid ${VAULT_PLATE_BORDER}`,
    borderRight: `1px solid ${VAULT_PLATE_BORDER}`,
    borderBottom: 'none',
    borderRadius: '12px 12px 0 0',
    boxShadow: '0 -16px 24px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,197,61,0.10)',
    padding: '12px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 88,
    // BOTTOM-BAR PIVOT (2026-07-03): `flex: 1` (fill the sidebar column to
    // board height) is REMOVED — this is now a full-width bar under the
    // board, sized to its own content on every viewport. TAKE PROFIT sits
    // at the natural bottom of its own column (actionBarRight) instead of
    // being pinned via a stretched parent. See the Playing() render's
    // isWide column layout for the desktop composition.
    justifyContent: 'flex-start',
  },
  // ── Settled surface — one clean steel panel matching the BetConsole, tiered
  //    RESULT → quiet meta → NEXT ROUND so it "comes together" (no more dense
  //    two-column form). Mounts flush to the canvas floor like the bet console.
  // UNIFIED VAULT-PLATE MATERIAL (2026-07-06, mobile settled bar) — same
  // fix as `actionBar` above: one gold hairline on every visible edge
  // (was gold-top/white-sides), upward-cast contact shadow softening the
  // art->black top seam instead of the old flat single-value inset glow.
  settledPanel: {
    position: 'relative',
    background: 'linear-gradient(180deg, #1B2330 0%, #090F18 100%)',
    borderTop: `1px solid ${VAULT_PLATE_BORDER}`,
    borderLeft: `1px solid ${VAULT_PLATE_BORDER}`,
    borderRight: `1px solid ${VAULT_PLATE_BORDER}`,
    borderBottom: 'none',
    borderRadius: '12px 12px 0 0',
    padding: '14px 16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 11,
    // BOTTOM-BAR PIVOT (2026-07-03): `flex: 1` (grow to board height) is
    // REMOVED — this is now a full-width bar under the board, sized to its
    // own content on every viewport. RESULT / META+TREND / NEXT BET+links
    // are now 3 side-by-side columns on desktop (see Settlement()'s isWide
    // render — resultTier / settledColMeta / settledColNext) instead of a
    // single stacked column stretched to board height.
    justifyContent: 'flex-start',
    // Was a 40px/0.6 halo (bigger than actionBar's own pre-fix value) —
    // matched to the SAME upward-cast softening token as `actionBar` so the
    // two mobile bars read as one consistent material, not two recipes.
    boxShadow: '0 -16px 24px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,197,61,0.10)',
  },
  settledResult: { display: 'flex', flexDirection: 'column', gap: 6 },
  settledEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
  },
  settledNarrative: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.02em',
  },
  settledResultRow: { display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 2 },
  settledResultBig: {
    fontFamily: T.fontMono,
    fontSize: 30,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  settledResultDelta: {
    fontFamily: T.fontMono,
    fontSize: 15,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  settledResultCtx: { marginLeft: 'auto', fontFamily: T.fontMono, fontSize: 11, color: T.textMuted },
  settledMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 9,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    fontFamily: T.fontMono,
    fontSize: 11,
  },
  settledMetaDim: { color: T.textMuted, fontSize: 10, letterSpacing: '0.02em' },
  settledMetaSpacer: { flex: 1 },
  // Tier 3 (NEXT BET + bet-again CTA(s)), MOBILE ONLY as of the BET AGAIN
  // reachability fix (2026-07-02) — desktop now uses `settledNextTop`
  // below. `margin-top: auto` here pulls any genuine leftover board-height
  // into the gap ABOVE this row instead of letting the (now content-sized)
  // SidebarPulseStrip module stretch to absorb it — pins the bet-again CTA
  // to the same reachable bottom corner every render (RG-C6), mirroring
  // `.vault-actionbar-actions` in the Playing panel (panel-inside-void fix,
  // 2026-07-02). On mobile the parent isn't a full-height flex column (see
  // `settledPanel`'s own comment) so `margin-top: auto` is inert there —
  // kept only so the mobile render path stays byte-identical to before.
  // COLUMN as of the "bet again · same trail" preset (2026-07-02) — this is
  // still the SAME outer DOM node (border-top + margin-top:auto unchanged),
  // it just now stacks the fixed row (`settledNextRow`) above an optional
  // second full-width CTA instead of being the row itself.
  settledNext: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingTop: 9,
    borderTop: '1px solid rgba(255,255,255,0.06)',
    marginTop: 'auto',
  },
  // Tier 3 (NEXT BET + bet-again CTA(s)), DESKTOP ONLY (BET AGAIN reachability
  // fix, 2026-07-02): identical visual treatment to `settledNext` but WITHOUT
  // `margin-top: auto` — on desktop this tier now renders directly under
  // Tier 1 RESULT (top of the sidebar), so it must NOT try to pin itself to
  // the bottom. COLUMN as of the "bet again · same trail"
  // preset (2026-07-02) — see `settledNext`'s comment above.
  settledNextTop: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingTop: 9,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  // The fixed first row inside `settledNext`/`settledNextTop` — the wager
  // stepper + primary "bet again →" CTA, side by side. Carries the ROW
  // layout that `settledNext`/`settledNextTop` used to carry directly
  // (2026-07-02, "bet again · same trail" preset) — extracted so those two
  // outer styles could become COLUMN containers without touching their own
  // identity (border-top / margin-top:auto / DOM position all unchanged).
  settledNextRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
  },
  // `settledPulseFill` (the SessionTrendSpark fill-module wrapper nested in
  // `settledColMeta`) is RETIRED as of VAULT SIDE-MARGIN CHROME (2026-07-03)
  // — SessionTrendSpark moved to the right-gutter Card B (VaultGutterCards).
  // BOTTOM-BAR PIVOT (2026-07-03) column wrappers — Settled's 3-column
  // bottom bar is RESULT | META+TREND | NEXT BET+links (desktop only; see
  // Settlement()'s isWide render). Both are new grouping wrappers around
  // already-existing tiers — no tier's own internal JSX/handler changed.
  // VBG col2 — top-aligned, trailing hairline (see `pulseColumn`'s comment —
  // same flipped-to-borderRight divider grammar).
  settledColMeta: {
    flex: '1 1 0%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    borderRight: '1px solid rgba(255,255,255,0.07)', // VBG.divider
    paddingRight: 16, // VBG.dividerInset
  },
  // VBG col3 (LAST) — top-aligned, no trailing border (last column in the
  // VBG grammar carries no divider).
  settledColNext: {
    flex: '1.15 1 0%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  settledNextWager: { display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 },
  settledWagerWindow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    background: 'rgba(0,0,0,0.30)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 9,
    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.45)',
  },
  // Tap target raised 30x30 -> 44x44 (was below the 44px Apple / 48dp
  // Material touch minimum, mobile-touch-qa 2026-07-02 finding). Padding
  // absorbs the extra box so the +/- glyph itself doesn't blow up visually.
  settledStepBtn: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)',
    color: T.textPrimary,
    fontFamily: T.fontMono,
    fontSize: 18,
    lineHeight: '1',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation',
  },
  // Side-by-side NEW SETUP / SHARE row (rugsui fix-spec §2/§4 column-order:
  // "NEW SETUP · SHARE (side by side)"). Was `justifyContent:'flex-end'` +
  // shrink-to-fit bare links; now an even 2-up row (both buttons carry their
  // own `flex: 1`) matching the mockup.
  settledLinks: { display: 'flex', gap: 8, alignItems: 'center' },
  // `settledLinksBottom` (the old desktop `margin-top:auto` bottom-pin
  // variant) is RETIRED as of the BOTTOM-BAR PIVOT (2026-07-03) — the
  // panel no longer stretches to board height, so there is no leftover
  // height left to pin against. Both `isWide` and mobile now use the same
  // plain `settledLinks` (see `linksTier` in Settlement()).
  // Desktop-only column wrappers for the bottom-bar's grammar (Playing /
  // Settled share it — see each render's isWide branch). `pulseColumn` (the
  // former Lobby/Playing shared session-pulse middle column) is RETIRED as of
  // VAULT SIDE-MARGIN CHROME (2026-07-03) — SidebarPulseStrip moved to the
  // left-gutter Card A. The Lobby-only `lobbyCtaColumn` variant is REMOVED
  // (LOBBY-SPLASH REMOVAL, 2026-07-06) along with the Lobby component itself;
  // `settledColMeta` / `settledColNext` remain the Settled-only column
  // wrappers.
  actionBarLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  actionBarHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  actionBarEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    fontWeight: 700,
    color: T.textPrimary,
  },
  actionBarSub: {
    fontFamily: T.fontBody,
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)', // raised from 0.62 — legibility (user)
    lineHeight: 1.4,
  },
  actionBarInfo: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 18,
    flexWrap: 'wrap',
  },
  actionBarMultiplier: {
    fontFamily: T.fontMono,
    fontSize: 30,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  actionBarDelta: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  actionBarFootnote: {
    margin: 0,
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textMuted,
  },
  actionBarRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    minWidth: 0,
  },
  // RG-C6 STRUCTURAL: cashOutButton is the load-bearing "always reachable"
  // element. Min size + bottom-right placement is fixed across the
  // `playing` phase. The disabled variant (no safe tiles yet) is shown in
  // the same slot — the button is NEVER conditionally removed from the DOM.
  cashOutButton: {
    padding: '14px 24px',
    background: `linear-gradient(180deg, ${T.accentSolid}, #00a85a)`,
    color: T.accentInk,
    border: 'none',
    borderRadius: 10,
    fontFamily: T.fontMono,
    minWidth: 200,
    cursor: 'pointer',
    touchAction: 'manipulation',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -2px 0 rgba(0,0,0,0.20)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  // AUTO ⚡ — speed toggle. Gold (bag) register so it reads as a degen power
  // button distinct from the green take-profit.
  autoButton: {
    padding: '10px 16px',
    background: 'rgba(255,197,61,0.12)',
    color: T.bag,
    border: `1px solid ${T.bag}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.14em',
    cursor: 'pointer',
  },
  // MANUAL | TRAIL segmented toggle
  modeToggle: {
    display: 'inline-flex',
    padding: 3,
    gap: 3,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
  },
  modeToggleActive: {
    minHeight: 44,
    padding: '0 14px',
    background: 'rgba(0,230,118,0.16)',
    color: '#00E676',
    border: '1px solid rgba(0,230,118,0.5)',
    borderRadius: 9,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  modeToggleInactive: {
    minHeight: 44,
    padding: '0 14px',
    background: 'transparent',
    color: T.textMuted,
    border: '1px solid transparent',
    borderRadius: 9,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  // reveal pace — staggered | instant (TRAIL only, session-persistent option).
  // Same segmented-pill FAMILY as modeToggle above (identical wrapper
  // background/border/radius); active tab uses the gold "bag" register
  // already established by AUTO ⚡ (speed = gold in this palette), never a
  // new color. No cyan.
  pacePillWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  pacePillLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: T.textMuted,
    textTransform: 'lowercase',
  },
  pacePillGroup: {
    display: 'inline-flex',
    padding: 3,
    gap: 3,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 12,
  },
  pacePillActive: {
    minHeight: 36,
    padding: '0 12px',
    background: 'rgba(255,197,61,0.16)',
    color: T.bag,
    border: '1px solid rgba(255,197,61,0.5)',
    borderRadius: 9,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.04em',
    textTransform: 'lowercase',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  pacePillInactive: {
    minHeight: 36,
    padding: '0 12px',
    background: 'transparent',
    color: T.textMuted,
    border: '1px solid transparent',
    borderRadius: 9,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'lowercase',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  // HOW TO PLAY overlay
  infoScrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 120,
    background: 'rgba(3,7,13,0.82)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  infoPanel: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '88dvh',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(180deg, #0b1420, #070d15)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 18,
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  infoHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  infoTitle: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.22em',
    color: T.textPrimary,
  },
  infoClose: {
    width: 44,
    height: 44,
    minWidth: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.05)',
    color: T.textMuted,
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    fontSize: 16,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  infoBody: {
    padding: '16px 18px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  infoLead: {
    fontFamily: T.fontBody,
    fontSize: 14,
    lineHeight: 1.5,
    color: T.textPrimary,
    margin: '0 0 8px',
  },
  infoHead: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.18em',
    color: T.accent,
    marginTop: 10,
  },
  infoText: {
    fontFamily: T.fontBody,
    fontSize: 13,
    lineHeight: 1.55,
    color: T.textMuted,
    margin: '2px 0 0',
  },
  infoGotIt: {
    margin: 16,
    padding: '14px 24px',
    background: `linear-gradient(180deg, ${T.accentSolid}, #00a85a)`,
    color: '#04140b',
    border: 'none',
    borderRadius: 12,
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  autoButtonActive: {
    padding: '10px 16px',
    background: T.bag,
    color: '#1a1208',
    border: `1px solid ${T.bag}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.14em',
    cursor: 'pointer',
    boxShadow: '0 0 22px rgba(255,197,61,0.4)',
  },
  // Dramatic register — kicks in when cumulative multiplier > 1.5x. Same
  // DOM slot, same handler, same RG-C6 reachability invariant; only the
  // visual register changes to dramatise the "lock it in" decision.
  // The breathing-glow keyframe lives in `shakeKeyframes` and references
  // the `.vault-cashout-dramatic` className applied above.
  cashOutButtonDramatic: {
    padding: '18px 28px',
    background: `linear-gradient(180deg, ${T.accentSolid}, #00a85a)`,
    color: T.accentInk,
    border: 'none',
    borderRadius: 12,
    fontFamily: T.fontMono,
    minWidth: 240,
    cursor: 'pointer',
    touchAction: 'manipulation',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -2px 0 rgba(0,0,0,0.20), 0 0 32px rgba(0,230,118,0.32)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  cashOutLabelDramatic: {
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
  },
  cashOutButtonDisabled: {
    padding: '14px 24px',
    background: 'rgba(94, 234, 212, 0.08)',
    color: T.textMuted,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    minWidth: 200,
    cursor: 'not-allowed',
    touchAction: 'manipulation',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  cashOutLabel: {
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  cashOutSub: {
    fontSize: 10,
    letterSpacing: '0.10em',
    fontVariantNumeric: 'tabular-nums',
  },
  spinner: {
    display: 'inline-block',
    width: 20,
    height: 20,
    border: `2px solid ${T.borderSubtle}`,
    borderTopColor: T.accentSolid,
    borderRadius: '50%',
    // Animation lives on the `.vault-spinner` CLASS (see <style> block) so the
    // prefers-reduced-motion media query can disable it — an inline `animation`
    // can't be overridden by CSS (autisk fix).
  },
  settledBetAgain: {
    padding: '14px 24px',
    minHeight: 44, // touch-target floor (Apple HIG 44pt) — was 43px unrounded, mobile-touch-qa nit
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(180deg, ${T.accentSolid}, #00a85a)`,
    color: T.accentInk,
    border: 'none',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -2px 0 rgba(0,0,0,0.20)',
    touchAction: 'manipulation',
  },
  settledBetAgainDisabled: {
    padding: '14px 24px',
    minHeight: 44, // matches settledBetAgain — same shared style family, same touch-target fix
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(94, 234, 212, 0.08)',
    color: T.textMuted,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
    touchAction: 'manipulation',
  },
  // "bet again · same trail" preset (2026-07-02). OUTLINE treatment
  // (rugsui fix-spec §2/§4, 2026-07-06 — was a filled green gradient
  // matching the primary CTA, which blurred the primary/secondary
  // hierarchy the mockup draws sharply). `background`/`border` reuse the
  // EXISTING soft-accent tokens `vaultBetTheme.accentSoftBg`/
  // `accentSoftBorder` (rgba(0,230,118,0.12)/(0.38)) rather than inventing a
  // new pair — same "outline buttons on art also get the panel bg" rule as
  // every other secondary control here. Loss-state override lives in
  // `settledSecondaryOutlineStyle` below (call-site only, mirrors the FIX 3
  // pattern the primary CTA already uses).
  settledBetAgainSameTrail: {
    padding: '11px 20px',
    minHeight: 44,
    boxSizing: 'border-box',
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 230, 118, 0.12)',
    color: T.accent,
    border: '1px solid rgba(0, 230, 118, 0.38)',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    touchAction: 'manipulation',
  },
  settledBetAgainSameTrailDisabled: {
    padding: '11px 20px',
    minHeight: 44, // matches settledBetAgainSameTrail — same shared style family, same touch-target fix
    boxSizing: 'border-box',
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(94, 234, 212, 0.08)',
    color: T.textMuted,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
    touchAction: 'manipulation',
  },
  settledSecondaryActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  // ITEM 2 — session-arc beat (non-blocking inline strip, gold/green/red).
  sessionBeat: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
    marginTop: 10,
    padding: '11px 14px',
    background: 'linear-gradient(180deg, rgba(255,197,61,0.08), rgba(255,255,255,0.015))',
    border: '1px solid rgba(255,197,61,0.28)',
    borderRadius: 12,
  },
  sessionBeatLead: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 150,
    flex: '1 1 auto',
  },
  sessionBeatEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.bag,
  },
  sessionBeatHint: {
    fontFamily: T.fontBody,
    fontSize: 11,
    color: T.textMuted,
  },
  sessionBeatStats: {
    display: 'flex',
    alignItems: 'center',
    gap: 18,
  },
  sessionStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sessionStatLabel: {
    fontFamily: T.fontMono,
    fontSize: 8.5,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  sessionStatValue: {
    fontFamily: T.fontMono,
    fontSize: 15,
    fontWeight: 800,
    color: T.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  closeVaultButton: {
    padding: '11px 18px',
    background: 'rgba(255,197,61,0.14)',
    color: T.bag,
    border: '1px solid rgba(255,197,61,0.5)',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  settledChangeLink: {
    background: 'transparent',
    border: 'none',
    padding: '6px 4px',
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.textMuted,
    cursor: 'pointer',
  },
  // "change mode" SECONDARY-BUTTON promotion (2026-07-04, holistic-audit
  // FIX 4). Tim: "change mode" read as a bare text link easy to overlook
  // next to the filled BET AGAIN CTAs. This gives it a real ghost/outline
  // button surface — visible hairline border (T.borderDefault), a dim
  // non-transparent dark-glass fill, the same 10px radius + mono/uppercase
  // grammar as the settled button family, and the 44px touch-target floor —
  // WITHOUT a filled accent gradient, so BET AGAIN stays the unambiguous
  // primary action. `settledChangeLink` above is left untouched (unused by
  // "change mode" now, kept in case a bare-link treatment is needed
  // elsewhere). `flex: 1` (rugsui fix-spec §2, 2026-07-06) so this and
  // `settledShareButton` sit as an even side-by-side pair per `settledLinks`
  // below, instead of shrink-to-fit text sizes.
  settledChangeButton: {
    padding: '11px 20px',
    minHeight: 44, // matches the settled button family's touch-target floor
    boxSizing: 'border-box',
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.05)',
    color: T.textPrimary,
    border: `1px solid ${T.borderDefault}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700, // a touch lighter than the primary CTA's 800 — secondary in the hierarchy
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    touchAction: 'manipulation',
  },
  // "share" — PROMOTED from a bare transparent text link to a real
  // outline/ghost button (rugsui fix-spec §2: "outline buttons on top of
  // art also get the panel bg" — a transparent link disappears over bright
  // gold-bar art). Same surface as `settledChangeButton` (panel bg +
  // hairline border + 10px radius + 44px floor + `flex: 1`), only the text
  // color stays the win-accent green so it still reads as the "share your
  // result" action rather than a neutral secondary.
  settledShareButton: {
    padding: '11px 20px',
    minHeight: 44,
    boxSizing: 'border-box',
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${T.borderDefault}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.accent,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    touchAction: 'manipulation',
  },
  settledPointsValue: {
    color: T.textPrimary,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  settledPointsLabel: {
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    fontSize: 10,
  },
  settledPointsMult: {
    color: T.textMuted,
    fontStyle: 'italic',
  },
  settledVerifyChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    color: T.accent,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    fontSize: 10,
  },
  settledVerifyToggle: {
    // A bordered accent pill so it reads unmistakably as a CLICKABLE control
    // (was flat muted text that looked like the label beside it).
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    background: 'rgba(0, 230, 118, 0.12)',
    border: '1px solid rgba(0, 230, 118, 0.5)',
    borderRadius: 999,
    padding: '4px 11px',
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: T.accent,
    cursor: 'pointer',
    boxShadow: '0 1px 8px rgba(0, 230, 118, 0.18)',
  },
  settledVerifyText: {
    color: T.textMuted,
    fontStyle: 'italic',
  },
  settlementVerifyMismatch: {
    color: T.danger,
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
  settledReceipt: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingTop: 10,
    borderTop: `1px solid ${T.borderSubtle}`,
  },
  settledReceiptSummary: {
    margin: 0,
    fontFamily: T.fontBody,
    fontSize: 11,
    color: T.textMuted,
    lineHeight: 1.55,
  },
  settlementHex: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.textPrimary,
    background: 'rgba(255,255,255,0.04)',
    padding: '1px 4px',
    borderRadius: 3,
    fontVariantNumeric: 'tabular-nums',
  },
  settlementReceiptRows: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: 12,
    rowGap: 3,
    margin: 0,
  },
  settlementHelp: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.danger,
    letterSpacing: '0.06em',
  },
  rowLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  rowValue: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textPrimary,
    margin: 0,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // LOOP 3 (2026-07-04, DEFECT 1 fix) — desktop-gutter-receipt-ONLY stacked
  // variant of `settlementReceiptRows`/`rowLabel`/`rowValue` (see
  // `ReceiptRowStacked`'s header comment for the full diagnosis). A grid
  // with a SINGLE column naturally stacks each `<dt>`/`<dd>` fragment onto
  // its own row (label, then value, then the next label...) — no `auto 1fr`
  // column split to starve at a 200px cap. Mobile `Settlement()` keeps using
  // `settlementReceiptRows`/`rowLabel`/`rowValue` unchanged.
  settlementReceiptRowsStacked: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    rowGap: 8,
    margin: 0,
  },
  rowLabelStacked: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  rowValueStacked: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textPrimary,
    margin: '2px 0 0',
    fontVariantNumeric: 'tabular-nums',
    // The 64-char hex values must WRAP inside the card, never clip —
    // width-robust at 200px or narrower (the DEFECT 1 fix; `rowValue`
    // above is left with its `overflow:hidden`/`textOverflow:ellipsis`
    // pairing, still correct for mobile Settlement()'s wider layout).
    overflowWrap: 'anywhere',
    wordBreak: 'break-all',
  },
  statBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  statLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  statValue: {
    fontFamily: T.fontMono,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  historyStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  historyLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textMuted,
    marginRight: 4,
  },
  historyChip: {
    padding: '4px 8px',
    border: '1px solid transparent',
    borderRadius: 12,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.04em',
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  },
  historyTick: {
    display: 'inline-block',
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: T.accentSolid,
  },
  // ── Sidebar pulse strip (desktop-only panel fill module) ──────────────────
  // A bounded "console module" — a visibly inset background + hairline gold-
  // tinted border + padding, matching the same material weight as the
  // settledWagerWindow gauge — so it reads as a designed instrument readout.
  // PANEL-INSIDE-VOID FIX (visual-regression PARTIAL, 2026-07-02): this used
  // to carry `flex: 1`, which made it unconditionally absorb 100% of the
  // parent panel's leftover height (the parent panels are themselves
  // `flex: 1` to match board height) — verified live at 65-75% blank INSIDE
  // this card even after 6 rounds. `flex: 1` here just moved the void from
  // "on the page" to "inside a bordered card". Sized to CONTENT now
  // (no flex) — label → 3-stat row → rug-trail, each at its natural size, so
  // the module reads as a deliberately-sized instrument readout, not a
  // stretched one. BOTTOM-BAR PIVOT (2026-07-03): the parent panels
  // (controlCard/actionBar) no longer stretch to board height at all — this
  // module now renders inside its own dedicated column (`pulseColumn`,
  // middle of the 3-column bottom bar) on desktop, so there is no leftover
  // height to absorb any more.
  // VAULT SIDE-MARGIN CHROME (2026-07-03): SidebarPulseStrip's ONLY call
  // site is now the left-gutter Card A (VaultGutterCards) — the Lobby/
  // Playing `pulseColumn` bottom-bar slots that used to render it are
  // deleted (that's the "lighter bottom bar" Tim asked for). The card's own
  // opaque background/border/boxShadow/padding/radius are REMOVED here —
  // the wrapping GLASS gutter card now supplies the (translucent) material,
  // so this style is content-layout only.
  // GRIDV2 SESSION-PULSE MOCKUP-PARITY FIX (2026-07-06, round 4 — supersedes
  // round 3). Round 3 re-added `flex:1` + `justifyContent:'space-between'`
  // so growth spread the 3 real rows (head -> BEST/WON·LOST/NET stat row ->
  // rug-trail chips) apart to fill leftover board-height — Tim rejected that
  // exact "spread it apart and call it filled" pattern live, verbatim, on the
  // world-picker block ("het moet echt gevuld zijn ik zie nu dat je ze
  // gewoon verplaatst hebt"). Back to content-sized (no `flex`, no
  // `space-between`): label -> 3-stat row -> rug-trail, each at its natural
  // size, fixed `gap`. The tall-viewport surplus this card no longer eats is
  // absorbed OUTSIDE the whole control column — see `desktopGridControl`'s
  // `alignSelf: 'start'` (below) — never as internal gap/row-stretch again.
  sidebarPulse: {
    minHeight: 64,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  // SESSION TREND sparkline. VAULT SIDE-MARGIN CHROME (2026-07-03): ONLY
  // call site is now the right-gutter Card B — own opaque shell removed
  // (see `sidebarPulse` comment, same reasoning) since the GLASS gutter
  // card supplies the material.
  sessionSpark: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  sessionSparkHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sessionSparkLabel: {
    fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: '0.24em',
    textTransform: 'uppercase', color: T.textMuted,
  },
  sessionSparkExtreme: { fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  // width:'100%' + height:'auto' (was a fixed 56px) so the SVG scales INTO
  // the narrower ~172px-wide gutter card instead of assuming the old wider
  // sidebar column — viewBox (already present on the <svg>, see
  // SessionTrendSpark) + preserveAspectRatio="none" mean the browser derives
  // height from width * (48/240) once only width is pinned.
  sessionSparkPlot: { width: '100%', height: 'auto', display: 'block' },
  sidebarPulseHead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  sidebarPulseLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  sidebarPulseNet: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
  },
  sidebarPulseTrail: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  sidebarPulseEmpty: {
    fontFamily: T.fontBody,
    fontSize: 11,
    color: T.textMuted,
    lineHeight: 1.4,
  },
  // ── Vault hero overlay (BIG center-screen reveal on settle) ──────────────
  // RG-C5: amplitude (size, blur, anim duration) is module-const. The hero
  // overlay fires identically on every settle; only the color bucket + copy
  // bucket shift via the React layer based on outcome class + multiplier
  // band. No streak parameter reaches these styles.
  heroOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 12,
  },
  heroBackdrop: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  heroFishWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroLabelStack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '14px 28px',
    background: 'rgba(3, 7, 13, 0.55)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: 14,
    border: '1px solid rgba(255, 255, 255, 0.10)',
    position: 'relative',
    zIndex: 1,
  },
  heroEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.36em',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontFamily: T.fontMono,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    textShadow: '0 0 20px currentColor',
    textAlign: 'center',
  },
  heroNumberRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 4,
  },
  heroMult: {
    fontFamily: T.fontMono,
    fontSize: 32,
    fontWeight: 900,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
    textShadow: '0 0 18px currentColor',
  },
  // ── Settled board caption (rugsui fix-spec §5) ───────────────────────────
  // Replaces the removed near-board BET AGAIN (VaultBoardRebet) at this same
  // bottom-of-board slot with a read-only pill strip. `rgba(12,17,14,.75)`
  // mockup literal mapped to the vault dark-canvas token (`T.bgCanvas`
  // #03070d family) for cross-scrim consistency. zIndex 13 matches the old
  // slot (above VaultHeroOverlay's zIndex 12, so it stays visible once the
  // hero moment fades at HERO_VISIBLE_MS).
  settledBoardCaption: {
    position: 'absolute',
    left: '50%',
    bottom: 16,
    transform: 'translateX(-50%)',
    zIndex: 13,
    pointerEvents: 'none',
    background: 'rgba(3,7,13,0.75)',
    border: `1px solid ${T.borderDefault}`,
    borderRadius: 999,
    padding: '4px 14px',
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.08em',
    color: T.textMuted,
    whiteSpace: 'nowrap',
    maxWidth: '92%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // ── Rhythm badge (cosmetic "perfect tumbler" celebration) ────────────────
  // Module-const amplitude. Two fixed tiers (rhythm / perfect); only color +
  // copy bucket shift. No continuous escalation. The badge auto-dismisses
  // via state timer in VaultExperience.
  rhythmBadgeRhythm: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'rgba(0, 230, 118, 0.10)',
    border: `1px solid ${T.accentMuted}`,
    borderRadius: 999,
    pointerEvents: 'none',
    zIndex: 11,
    animation: 'vault-rhythm-badge-enter 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
  },
  rhythmBadgePerfect: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    background: 'rgba(0, 230, 118, 0.16)',
    border: `1px solid ${T.accentSolid}`,
    borderRadius: 999,
    boxShadow: '0 0 24px rgba(0,230,118,0.36)',
    pointerEvents: 'none',
    zIndex: 11,
    animation: 'vault-rhythm-badge-enter 240ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
  },
  rhythmBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: T.accentSolid,
    boxShadow: `0 0 8px ${T.accentSolid}`,
  },
  rhythmBadgeLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.32em',
    textTransform: 'uppercase',
    color: T.accent,
  },

  // Opaque corner icon chrome — steel-blue + gold-rivet (CHROME token),
  // DISTINCT register from the translucent GLASS gutter cards. Thin-line
  // glyphs only (see GearGlyph/WorldGlyph).
  cornerIconBtn: {
    width: CHROME.size,
    height: CHROME.size,
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: CHROME.background,
    border: CHROME.border,
    boxShadow: CHROME.boxShadow,
    color: 'rgba(244,246,250,0.82)',
    cursor: 'pointer',
    padding: 0,
  },
  cornerTopLeft: {
    position: 'absolute',
    top: CHROME.edgeOffset,
    left: CHROME.edgeOffset,
    zIndex: CHROME.zIndex,
  },
  // World/mode glance — same material as `cornerIconBtn`, but its own style
  // object since the call site overrides `border` per-mode-accent.
  // LOBBY-SPLASH REMOVAL (2026-07-06): non-interactive display badge —
  // `cursor: 'default'` (was 'pointer'), no hover/active chrome.
  cornerTopRight: {
    position: 'absolute',
    top: CHROME.edgeOffset,
    right: CHROME.edgeOffset,
    zIndex: CHROME.zIndex,
    width: CHROME.size,
    height: CHROME.size,
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: CHROME.background,
    boxShadow: CHROME.boxShadow,
    color: 'rgba(244,246,250,0.82)',
    cursor: 'default',
    padding: 0,
  },
  cornerHelp: {
    position: 'absolute',
    bottom: CHROME.edgeOffset,
    left: CHROME.edgeOffset,
    zIndex: CHROME.zIndex,
    width: CHROME.size,
    height: CHROME.size,
    borderRadius: 10,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: CHROME.background,
    border: CHROME.border,
    boxShadow: CHROME.boxShadow,
    color: 'rgba(244,246,250,0.82)',
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    padding: 0,
  },
  cornerGearPopover: {
    position: 'absolute',
    top: CHROME.size + CHROME.stackGap,
    left: 0,
    minWidth: 220,
    background: CHROME.background,
    border: CHROME.border,
    borderRadius: 12,
    boxShadow: CHROME.boxShadow,
    padding: '12px 14px',
    zIndex: CHROME.zIndex,
  },

  // ── GUTTER-CARD SYSTEM (restored 2026-07-05) — the translucent glass
  // cards mounted beside the board (position:absolute siblings inside
  // `vault-canvas-shell`). No new color tokens beyond GLASS/GLASS_CTA — the
  // small labels reuse `ctlLabel`/`ctlHint`/`ctlReceiptBody` below, which
  // outlived the grid-chassis refactor as generic reusable primitives. ─────
  // WCAG RE-AUDIT FIX (2026-07-06) — was `T.textDim` (40%-alpha white), the
  // same structural ~4.0:1-ceiling-on-near-black issue already fixed for
  // `rugsTunerLabel`/`rugsStepValueUnit` but never generalized here. Measured
  // YOUR BET 3.87 / PLAY STYLE 3.86 / NEXT BET 3.72 / VERIFIED 3.94 — all
  // below the 4.5:1 AA floor on all 3 worlds. `T.textMuted` (62%-alpha, the
  // token every other fixed caption in this file now uses) clears AA with
  // margin. Every OTHER caption-style label still on `T.textDim` inside the
  // control column / gutter-card / settled-receipt panel family was swept to
  // the same token in this pass (betHint, wagerLabel, settledWagerLabel,
  // wagerEyebrow, wagerAmountUnit, gridPreviewBadge, modeTagline, gridLabel,
  // mineLabel, autopickLabel, betFooterStatLabel, settledResultCtx,
  // settledMetaDim, pacePillLabel, sessionStatLabel, settledPointsMult,
  // settledVerifyText, rowLabel, rowLabelStacked, statLabel, historyLabel,
  // sessionSparkLabel, sidebarPulseLabel, sidebarPulseEmpty, worldMaxLabel).
  // Left UNCHANGED on purpose: disabled-control text (`quickPickDisabled`,
  // `rugsStepBtnDisabled`, `autopickButton`'s not-allowed state) — WCAG
  // exempts inactive-component text, and the dim tone is the intentional
  // disabled signal; and the game-board HUD zone (`hudHeroKicker`,
  // `desktopGridHudRight`) — a different surface (over the board, not a
  // control-column plate) outside this pass's scope.
  ctlLabel: {
    fontFamily: T.fontMono,
    fontSize: 11, // P1 (2026-07-06) — panel LABEL at spec §0 hierarchy (was 10)
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  ctlHint: {
    fontFamily: T.fontBody,
    fontSize: 12,
    color: T.textMuted,
    lineHeight: 1.4,
  },
  // Verified/receipt card's expanded body — bounded + scrollable so a long
  // receipt can never clip against the narrow 200px gutter card.
  ctlReceiptBody: {
    maxHeight: 240,
    overflowY: 'auto',
    paddingRight: 2,
  },
  // Shared translucent card wrapper — GLASS/GLASS_CTA material, sized to its
  // own content (never stretched). `gutterCardCta` fork holds the primary
  // action; the button inside always keeps its own opaque style regardless.
  gutterCard: {
    ...GLASS,
    padding: '14px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    pointerEvents: 'auto',
    width: '100%',
    // BETENTRY GUTTER OVERFLOW FIX (2026-07-05, autisk-revert-0705 diagnosis):
    // `width:'100%'` resolved against this card's own content box (the
    // default `content-box` model) meant the card's PADDING + BORDER were
    // added ON TOP of the already-100%-wide content box, so every card
    // rendered ~30px wider than its `vault-betentry-right` parent (measured
    // 290px actual vs 260px maxWidth cap) — the parent's `overflowY:'auto'`
    // silently promoted that into a second, horizontal scrollbar that clipped
    // the right-aligned tier badges (NORMAL/HARD/CRAZY) and stole width back
    // via its own scrollbar gutter. `border-box` makes `width:100%` mean the
    // TOTAL box (border-box) matches the parent exactly, eliminating the
    // phantom horizontal overflow at its source. Purely a box-model fix — no
    // GLASS background/border/shadow/blur value touched.
    boxSizing: 'border-box',
  },
  gutterCardCta: {
    ...GLASS_CTA,
    padding: '14px 16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    width: '100%',
  },
  // GRIDV2 SESSION-PULSE MOCKUP-PARITY FIX (2026-07-06, round 4 — supersedes
  // round 3). Round 3 had this wrapper AND each present trailing card
  // (`vault-ctl-path`/`vault-ctl-session`) carry `flex:1` so they grew to
  // consume `desktopGridControl`'s leftover board-height (SESSIE additionally
  // spreading its own stat rows via `sidebarPulse`'s `space-between`) — the
  // same "spread it apart and call it filled" anti-pattern Tim rejected on
  // the world-picker block. Reverted to content-sized (no `flex`) — PATH/
  // SESSIE sit at their natural size with a tight fixed `gap` between them.
  // `desktopGridControl` no longer stretches this whole column to board
  // height either (see its `alignSelf: 'start'`, below) — the genuine
  // tall-viewport surplus is now a single deliberate band below the whole
  // column, not distributed piecemeal through nested flex-grows.
  gutterTrailingGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  // Base GUTTER stacks (topOffset:400, maxWidth:200) — Card A (Lobby/
  // Playing session pulse) / the settled receipt+trend group. `left`/`right`
  // are overridden per-render by `gutterBoardAnchorLeftStyle`/
  // `gutterBoardAnchorRightStyle` (board-edge-anchored); the values here are
  // the pre-measurement fallback only.
  gutterLeftStack: {
    position: 'absolute',
    top: GUTTER.topOffset,
    right: GUTTER.edgeOffset,
    maxWidth: GUTTER.maxWidth,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    zIndex: GUTTER.zIndex,
    pointerEvents: 'none', // children (gutterCard) opt back in
  },
  gutterRightStack: {
    position: 'absolute',
    top: GUTTER.topOffset,
    left: GUTTER.edgeOffset,
    maxWidth: GUTTER.maxWidth,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    zIndex: GUTTER.zIndex,
    pointerEvents: 'none',
  },
  // BETENTRY_GUTTER stacks (topOffset:72, maxWidth:260) — reused verbatim by
  // every phase's own near-top hero/status/actions/result group (Lobby,
  // Playing, Settled), not just BetEntry.
  betentryGutterLeftStack: {
    position: 'absolute',
    top: BETENTRY_GUTTER.topOffset,
    right: BETENTRY_GUTTER.edgeOffset,
    maxWidth: BETENTRY_GUTTER.maxWidth,
    display: 'flex',
    flexDirection: 'column',
    gap: BETENTRY_GUTTER.interCardGap,
    zIndex: BETENTRY_GUTTER.zIndex,
    pointerEvents: 'none',
  },
  betentryGutterRightStack: {
    position: 'absolute',
    top: BETENTRY_GUTTER.topOffset,
    left: BETENTRY_GUTTER.edgeOffset,
    maxWidth: BETENTRY_GUTTER.maxWidth,
    display: 'flex',
    flexDirection: 'column',
    gap: BETENTRY_GUTTER.interCardGap,
    zIndex: BETENTRY_GUTTER.zIndex,
    pointerEvents: 'none',
  },
  // BetEntry's own right stack — same anchor, tighter inter-card gap (3
  // cards: PICK YOUR WORLD -> YOUR BET -> SEND IT consolidated into one
  // column, vault-betentry-rightcol-migration).
  betentryGutterRightStackCompact: {
    position: 'absolute',
    top: BETENTRY_GUTTER.topOffset,
    left: BETENTRY_GUTTER.edgeOffset,
    maxWidth: BETENTRY_GUTTER.maxWidth,
    display: 'flex',
    flexDirection: 'column',
    gap: BETENTRY_RIGHTCOL_GAP_COMPACT,
    zIndex: BETENTRY_GUTTER.zIndex,
    pointerEvents: 'none',
  },
  // "TO WIN" clarity line inside BetEntry's world card (below RugsTuner).
  gutterToWin: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    paddingTop: 6,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  gutterChipRow: {
    display: 'flex',
    gap: 8, // BLOCKER 3 (2026-07-06) — on the 8/12/16/24 spacing scale (was 6)
    flexWrap: 'wrap',
  },
  gutterChip: {
    padding: '7px 10px',
    background: 'rgba(255,255,255,0.05)',
    color: T.textMuted,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  gutterChipOn: {
    padding: '7px 10px',
    background: 'rgba(0,230,118,0.16)',
    color: T.accent,
    border: '1px solid rgba(0,230,118,0.5)',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },

  // ── FIXED 5-ZONE GRID CHASSIS (2026-07-06, desktop `isWide` only) ────────
  // Real CSS Grid — TOPBAR / HUD-ZONE / BOARD / CONTROL COLUMN / STATUSBAR.
  // `desktopGrid*` prefix used throughout to avoid any name collision with
  // the pre-existing `grid*` tokens (gridHeader/gridLabel/gridStatus etc.,
  // which belong to ModeSelector's "PICK YOUR WORLD" header and are unrelated).
  desktopGrid: {
    display: 'grid',
    width: '100%',
    boxSizing: 'border-box',
    // `position: 'relative'` makes this the containing block for the
    // shell-wide `sceneBackdropLayer` child (absolute, inset:0) — the
    // gridTemplate* tokens below (structural spec) are UNTOUCHED by this.
    position: 'relative',
    gridTemplateColumns: `1fr ${GRID_CTRL_WIDTH}px`,
    gridTemplateRows: `${GRID_TOPBAR_H}px ${GRID_HUD_H}px auto ${GRID_STATUS_H}px`,
    gridTemplateAreas: '"topbar topbar" "hud control" "board control" "status status"',
    // board↔control gutter = 24 (spacing scale); inter-row gap = 12.
    columnGap: GRID_GUTTER,
    rowGap: GRID_GAP,
  },
  // `zIndex: 1` — stacks above the sceneBackdropLayer (zIndex 0); see the
  // boardRegion comment for why an explicit z-index is sufficient here.
  desktopGridTopBar: {
    gridArea: 'topbar',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    minWidth: 0,
    zIndex: 1,
    borderBottom: `1px solid ${T.borderSubtle}`,
  },
  desktopGridTopBarLeft: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: T.textPrimary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  desktopGridTopBarRight: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.textMuted,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  // HUD-ZONE (zone 2) — a fixed GRID_HUD_H row; the inner bar is sized to the
  // board's own live-measured width (see `hudInnerStyle` in DesktopChassis).
  desktopGridHud: {
    gridArea: 'hud',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    zIndex: 1,
  },
  desktopGridHudBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    height: '100%',
    padding: '0 16px',
    background: 'rgba(9,15,24,0.55)',
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    boxSizing: 'border-box',
    minWidth: 0,
  },
  desktopGridHudLeft: {
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: T.textPrimary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  // BLOCKER 2 (2026-07-06) — the live PUMP-multiplier HERO cluster. The 44px
  // numeral is the single largest live text element on screen; it sits inside
  // the fixed 64px HUD row (`GRID_HUD_H`), so it changes nothing about board-Y
  // or the CTA fold. BAG rides small beside it under a "PUMP" kicker.
  hudHeroLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    overflow: 'hidden',
  },
  hudHeroMult: {
    fontFamily: T.fontMono,
    fontSize: 44,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '-0.01em',
    color: T.accent,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  hudHeroMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  hudHeroKicker: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    // FIX 3 (2026-07-07, consolidated fix pass) — was `T.textDim`; measured
    // ~4.4-4.5:1 in SHITCOIN over the full-bleed backdrop, below the same
    // AA floor already swept everywhere else in this file (2026-07-06
    // WCAG re-audit, see the GUTTER-CARD SYSTEM comment above). `T.textMuted`
    // clears AA with margin in all 3 worlds.
    color: T.textMuted,
    whiteSpace: 'nowrap',
  },
  hudHeroBag: {
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
    color: T.bag,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  desktopGridHudRight: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.06em',
    // FIX 3 (2026-07-07, consolidated fix pass) — was `T.textDim`; the
    // "RUGS · FIRST TAP" / "RUG RISK N%" captions measured borderline
    // ~4.4-4.5:1 in SHITCOIN over the full-bleed backdrop. `T.textMuted`.
    color: T.textMuted,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  // CONTROL COLUMN (zone 4) — spans the HUD-ZONE + BOARD rows.
  // GRIDV2 TALL-VIEWPORT SURPLUS FIX (2026-07-06, round 4). Grid default
  // `align-items: stretch` used to force this column to the board's full
  // combined height, which is what created the genuine leftover height every
  // prior round (1-3) kept trying to fill FROM THE INSIDE — a spacer
  // (round 1/2, rejected: relocated the void) or stretched internal cards/
  // gaps (round 3, rejected live by Tim: "je ze gewoon verplaatst hebt", the
  // world-picker gaps grew 88px@900 -> 152px@1118). `alignSelf: 'start'`
  // stops the forced stretch at the SOURCE: this column now sizes to its own
  // CONTENT (worldpicker/wager/CTA or lobby/playing/settled's own cards, all
  // content-sized again — see their own comments) and simply sits SHORTER
  // than the board on tall viewports, top-pinned inside its combined grid
  // area. The leftover height becomes one honest blank band below the
  // column (next to the board, above the status bar) — a single deliberate
  // region, never internal gap-stretch. Tim explicitly OK'd the column not
  // reaching board-bottom, as long as nothing inside it gets stretched to
  // fake reaching it. `overflowY:'auto'` stays as a non-visible safety net
  // (verified live it never actually needs to scroll at the required
  // viewports — guardrail 2); it matters even less now that content is
  // shorter, not stretched.
  desktopGridControl: {
    gridArea: 'control',
    display: 'flex',
    flexDirection: 'column',
    gap: CONTROL_COL_CARD_GAP,
    minWidth: 0,
    width: GRID_CTRL_WIDTH,
    boxSizing: 'border-box',
    overflowY: 'auto',
    alignSelf: 'start',
    zIndex: 1,
  },
  desktopGridStatusBar: {
    gridArea: 'status',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
    gap: 16,
    minWidth: 0,
    borderTop: `1px solid ${T.borderSubtle}`,
  },
  desktopGridStatusBarLeft: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: T.textMuted,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
}

// Augment keyframes with the spinner animation. Inline so all the
// motion is consolidated near the rest of the surface's styles.
const _spinnerKeyframes = `
@keyframes vault-spin {
  to { transform: rotate(360deg); }
}
`
;(function injectSpinnerKeyframes(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('vault-spinner-keyframes')) return
  const styleEl = document.createElement('style')
  styleEl.id = 'vault-spinner-keyframes'
  styleEl.textContent = _spinnerKeyframes
  document.head.appendChild(styleEl)
})()

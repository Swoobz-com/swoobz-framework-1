'use client'

/**
 * OoFisherExperience — the player surface for OO-Fisher.
 *
 * The catalogue's first GRINDING-loop game. Three nested loops:
 *   1. Per-cast (15-45s): hold→cast→line→bite→reel→catch
 *   2. Per-trip (3-10 casts, ~3-8 min): wager → N casts → settle → claim
 *   3. Meta (weeks of play): currency → upgrades → unlocks deeper water + rarer fish
 *
 * RG-C STRUCTURAL ENFORCEMENT AUDIT:
 *   - RG-C5: Catch fanfare audio + visual chord is IDENTICAL across rarities.
 *     Only the sprite COLOR differs (read from RARITY_VISUALS[rarity].rgb).
 *     Audio functions in ooFisherAudio.ts take ZERO state-dependent params.
 *     Trip-multiplier hard cap MAX_TRIP_MULTIPLIER_BPS = 100_000n (10.00x)
 *     is enforced inside ooFisherMath.tripMultiplier — cannot be raised at
 *     runtime.
 *   - RG-C8: Cash-out is reachable from `casting` and `between-casts`
 *     sub-phases. The action-bar surface unconditionally mounts the
 *     cash-out button in those phases (see CastingActionBar / BetweenCastsActionBar).
 *
 * Brand register: quiet expert at the table. Lobby copy: "Cast off. Reel
 * in. Upgrade your gear." Between casts: "you caught a [rarity] [color]fin"
 * NOT "WIN!". No casino vocab, no escalating tone, no predictive copy.
 *
 * Domain C: presentation only. Math + state machine live in
 * ooFisherProvider + ooFisherMath.
 */
import { type CSSProperties, type ReactElement, useEffect, useMemo, useRef, useState } from 'react'

import { useSwoobzAudio, useSwoobzMusic } from '../_shared/audio'
import { HelpButton, OnboardingOverlay, useOnboardingState } from '../_shared/onboarding'
import { ooFisherOnboarding } from '../_shared/onboarding/games/oo-fisher-onboarding'
import { OoFisherReelingOverlay } from './OoFisherReelingOverlay'
import { OoFisherSceneSurface } from './OoFisherSceneSurface'
import { OoFisherUpgradePanel } from './OoFisherUpgradePanel'
import { useOoFisher } from './onChainOoFisherProvider'
import { AUDIO_MANIFEST, MUSIC_OO_FISHER_THEME } from './ooFisherAudio'
import { cosmeticById } from './ooFisherCosmetics'
import { useFisherCosmetics } from './useFisherCosmetics'
import {
  castPowerToDepth,
  castsPerTrip,
  type DepthTier,
  depthRarityBand,
  type FishRarity,
  formatDepth,
  formatHouseEdge,
  formatMultiplier,
  formatPoints,
  formatRtp,
  formatScales,
  formatTier,
  formatUsdc,
  type GearTier,
  maxDepthByBoat,
  ONE_X_BPS,
  payoutForCatch,
  pointsForBet,
  publishedFisherRtp,
  RARITY_VISUALS,
  upgradeCost,
} from './ooFisherMath'
import {
  FISH_ON_WINDOW_MS,
  type OoFisherController,
  type TripActiveSub,
  type TripOutcome,
} from './ooFisherProvider'

// ─── Theme tokens (mirror Pulse / Vault) ──────────────────────────────────

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
  accent: '#00D0DE',
  accentSolid: '#00F0FF',
  accentMuted: 'rgba(0, 208, 222, 0.32)',
  accentInk: '#001a1f',
  danger: '#f87171',
  warning: '#f5c25b',
}

// ─── Wood-plaque shared style token ──────────────────────────────────────
//
// Tim 2026-05-26 EMBEDDED HUD REBUILD: canonical chrome for every boat-
// mounted instrument plaque. IDENTICAL to the cornerStatusCard grammar.
// Extract once, applied 7+ times across all in-canvas HUD surfaces.
//
// WARM+CYAN ban enforced structurally:
//   - background = warm cedar gradient (woodPlaqueChrome.background)
//   - label text = cream rgba(255, 232, 188, 0.78) — NEVER cyan
//   - value text = brass #ffd27a — NEVER cyan
//   - cyan is ONLY permitted as a 1px outline on the CASH OUT chest rim
//     (job 3 of the 4-cyan economy) when enabled. That 1px stroke sits on
//     the brass border — not painted text on wood ground.
const woodPlaqueBackground =
  'linear-gradient(180deg, rgba(140, 92, 52, 0.94) 0%, rgba(108, 70, 40, 0.94) 50%, rgba(86, 54, 30, 0.94) 100%),' +
  ' repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 7px)'
const woodPlaqueBorder = '2px solid #d4a04a'
const woodPlaqueBoxShadow =
  '0 12px 28px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 222, 158, 0.45), inset 0 -2px 4px rgba(0, 0, 0, 0.4)'
// Cream label (eyebrow) and brass value used on every plaque
const PLAQUE_LABEL_COLOR = 'rgba(255, 232, 188, 0.78)'
const PLAQUE_VALUE_COLOR = '#ffd27a'
// Divider — brass fade
const PLAQUE_DIVIDER_BG =
  'linear-gradient(180deg, rgba(212, 160, 74, 0.0), rgba(212, 160, 74, 0.55), rgba(212, 160, 74, 0.0))'

// Tim 2026-05-25 IN-CANVAS HUD MIGRATION — first-session ghost prompt
// persistence key. Set to '1' the first time the player reaches the
// between-casts surface so the prompt never re-appears.
const GHOST_PROMPT_STORAGE_KEY = 'swoobz.oo-fisher.ghost-prompt-seen.v1'

const WAGER_PRESETS: ReadonlyArray<{ readonly label: string; readonly value: bigint }> = [
  { label: '1', value: 1_000_000n },
  { label: '5', value: 5_000_000n },
  { label: '10', value: 10_000_000n },
  { label: '25', value: 25_000_000n },
  { label: '50', value: 50_000_000n },
]

// ─── Inline wager editor helpers (Pulse-style) ───────────────────────────────
// Adaptive step: small near the floor, larger as the stake grows, always snaps
// to a round value (0.10 → 0.20, never 0.10 → 5.10).
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

// Smooth count-roll when the amount switches (the Stormforge-style value tween).
// Module-const duration (RG-C5 SAFE). The allowed score-tick juice, no particles.
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

// ─── Catch overlay routing (Tim 2026-05-26 ALL-FISH HERO) ────────────────
//
// HISTORY:
//   BEFORE: every catch mounted BOTH inline pill AND BigCatchHero (Tim
//   playtest "double popup" bug).
//   2026-05-25 BUG-4 FIX: split into pill (common/uncommon/rare) vs hero
//   (epic/legendary/mythic) — mutually exclusive.
//   2026-05-26 (Tim images 124/125): "It needs this big unlock in the
//   center of the screen with the fish. Not in some bad small UI at the
//   bottom." → ALL rarities now route through BigCatchHero. The inline
//   transom-caught surface is retired; the hero is the canonical CAUGHT
//   surface for every rarity.
//
// RG-C5 SAFE: BigCatchHero uses a MODULE-CONST fish size, a MODULE-CONST
// CATCH_HERO_DURATION_MS, and a zero-param `playCatchFanfare()` upstream.
// Only the COLOR tint (per RARITY_VISUALS) differs across rarities. No
// streak / progression / multiplier value modulates visual or audio
// amplitude. The "all rarities" routing makes the surface UNIFORM across
// outcomes — strictly less amplitude variation than the prior split, so
// this strengthens RG-C5 compliance.
//
// Invariant the Playwright test enforces: after a catch resolves to the
// `caught` sub-phase, `oo-fisher-big-catch-hero` is mounted. The transom
// surface NEVER renders for caught (only for junk / missed / snap).
const BIG_CATCH_TIERS: ReadonlySet<FishRarity> = new Set<FishRarity>([
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
])

function isBigCatch(rarity: FishRarity): boolean {
  return BIG_CATCH_TIERS.has(rarity)
}

// Tim 2026-05-26 image 133/142 — narrative settlement headlines.
// Module-const thresholds + variant pools keep RG-C5 strict: amplitude is
// identical, only the copy varies. Variant within a bucket is selected by
// `tripMultiplierBps % N` so the same outcome always reads the same line.
const HUGE_TRIP_BPS = 30_000n // ≥3.00× — exceptional
const SOLID_TRIP_BPS = 15_000n // ≥1.50× — solid win
const HUGE_TRIP_NARRATIVES = ['huge trip!', 'monster haul', 'fish were biting'] as const
const SOLID_TRIP_NARRATIVES = [
  'a proper haul',
  'you read the water',
  'rod earned its keep',
] as const
const BREAKEVEN_TRIP_NARRATIVES = ["you'll take it", 'just enough', 'kept it dry'] as const
const LOSS_TRIP_NARRATIVES = [
  'better luck next trip',
  'water won this one',
  'the fish were sleeping',
  'rod earned its rest',
] as const
function settlementNarrative(multiplierBps: bigint, won: boolean): string {
  const pool: readonly string[] = !won
    ? LOSS_TRIP_NARRATIVES
    : multiplierBps >= HUGE_TRIP_BPS
      ? HUGE_TRIP_NARRATIVES
      : multiplierBps >= SOLID_TRIP_BPS
        ? SOLID_TRIP_NARRATIVES
        : BREAKEVEN_TRIP_NARRATIVES
  // bigint → safe index via mod with positive coercion
  const len = BigInt(pool.length)
  const raw = multiplierBps < 0n ? -multiplierBps : multiplierBps
  const idx = Number(raw % len)
  return pool[idx]!
}

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

// ─── Top-level component ──────────────────────────────────────────────────

export function OoFisherExperience(): ReactElement {
  // Feature-flagged: `NEXT_PUBLIC_OO_FISHER_ONCHAIN === 'true'` swaps in the
  // on-chain wrapper. Default (unset) returns the local mock controller, so
  // all existing tests + the default playthrough remain unchanged.
  const controller = useOoFisher()
  const reducedMotion = useReducedMotion()
  const { state } = controller
  // Cosmetics / EV-neutral perks (bought with scales; presentation only).
  const cosmetics = useFisherCosmetics(controller.spendScales)
  const onboarding = useOnboardingState(ooFisherOnboarding.gameId)
  // Self-contained HOW-TO overlay (the shared onboarding shim is a no-op here).
  const [showInfo, setShowInfo] = useState(false)
  // Kenney CC0 sample manifest; WebAudio synthesis fallback in ooFisherAudio.ts.
  useSwoobzAudio(AUDIO_MANIFEST)

  // Lakeside ambient theme — "Lazy Day v0_9" by FoxSynergy (CC-BY 3.0)
  // loaded via Howler through `useSwoobzMusic`. Amplitude pinned at
  // module-const `MUSIC_VOLUME = 0.35`, fade durations module-const.
  // Gated on first user gesture (browser autoplay policy). Honors
  // prefers-reduced-motion as the motion-equivalent rule for audio.
  // Attribution on /credits — warm-register pairing with the wood +
  // brass + sunset OO-Fisher world.
  useSwoobzMusic(MUSIC_OO_FISHER_THEME, { reducedMotion })

  const phaseLabel = useMemo(() => {
    switch (state.phase.kind) {
      case 'lobby':
        return 'READY'
      case 'bet-entry':
        return 'BET ENTRY'
      case 'trip-active': {
        switch (state.phase.sub.kind) {
          case 'casting':
            return 'CASTING'
          case 'line-out':
            return 'LINE OUT'
          case 'fish-on':
            return 'FISH ON'
          case 'reeling':
            return 'REELING'
          case 'caught':
            return 'CAUGHT'
          case 'junk-caught':
            return 'JUNK'
          case 'snap':
            return 'SNAP'
          case 'missed':
            return 'ESCAPED'
          case 'between-casts':
            return 'BETWEEN CASTS'
        }
        return 'TRIP'
      }
      case 'trip-settled':
        return state.phase.outcome.netLamports >= 0n ? 'TRIP SETTLED · WIN' : 'TRIP SETTLED · LOSS'
      case 'upgrade-modal':
        return 'UPGRADES'
    }
  }, [state.phase])

  const tripIdLabel = `T${String(state.history.length + 1).padStart(4, '0')}`
  const SESSION_START_LAMPORTS = 1_000_000_000n
  const sessionDelta = state.balanceLamports - SESSION_START_LAMPORTS
  const sessionRounds = state.history.length

  const isTripActive = state.phase.kind === 'trip-active'
  const isReeling = isTripActive && state.phase.sub.kind === 'reeling'
  const isBetweenCasts =
    isTripActive && state.phase.kind === 'trip-active' && state.phase.sub.kind === 'between-casts'
  const isCasting =
    isTripActive && state.phase.kind === 'trip-active' && state.phase.sub.kind === 'casting'
  const isLineOut =
    isTripActive && state.phase.kind === 'trip-active' && state.phase.sub.kind === 'line-out'
  const isFishOn =
    isTripActive && state.phase.kind === 'trip-active' && state.phase.sub.kind === 'fish-on'
  const isCaught =
    isTripActive && state.phase.kind === 'trip-active' && state.phase.sub.kind === 'caught'
  const isJunkCaught =
    isTripActive && state.phase.kind === 'trip-active' && state.phase.sub.kind === 'junk-caught'
  const isSnap =
    isTripActive && state.phase.kind === 'trip-active' && state.phase.sub.kind === 'snap'
  const isMissed =
    isTripActive && state.phase.kind === 'trip-active' && state.phase.sub.kind === 'missed'

  // Phase routing — center vs bottom overlay.
  // Tim 2026-05-26 image 126: trip-settled was falling through to the
  // below-canvas DOM strip (cool-glass) instead of rendering INSIDE canvas
  // over the scene. Settlement card joins lobby + bet-entry as a centered
  // in-canvas overlay. The bottomBarSlot is suppressed for trip-settled
  // too so the page chrome stays clean.
  const centeredCardPhase =
    state.phase.kind === 'lobby' ||
    state.phase.kind === 'bet-entry' ||
    state.phase.kind === 'trip-settled'
  const bottomBarPhase = state.phase.kind === 'trip-active'
  // Tim 2026-05-26 EMBEDDED HUD REBUILD: ALL trip-active sub-phases now live
  // INSIDE the canvas as boat-anatomical wood plaques. The bottom slot still
  // mounts (collapsed) so geometric layout invariants and testid contracts hold.
  // Reeling has its own canvas overlay. FishOn uses existing FishOnRarityReveal.
  // RG-C5 SAFE: routing decision only — no per-state escalation of timing/audio.
  const inCanvasActionPhase =
    isCasting ||
    isBetweenCasts ||
    isLineOut ||
    isFishOn ||
    isCaught ||
    isJunkCaught ||
    isSnap ||
    isMissed

  // Recent catch rarity for the canvas celebration.
  const recentCatchRarity: FishRarity | null =
    isTripActive && state.phase.sub.kind === 'caught' ? state.phase.sub.rarity : null

  // Compute canvas-phase string for the canvas prop. Map the new
  // junk-caught / snap sub-phases to the existing canvas states so the
  // 3D scene doesn't need to know about loss-side outcomes:
  //   - junk-caught reuses 'caught' (a small fish jumps, just dimmer)
  //   - snap        reuses 'missed' (line snap ripple already exists)
  const canvasPhase =
    state.phase.kind === 'trip-active'
      ? state.phase.sub.kind === 'junk-caught'
        ? 'caught'
        : state.phase.sub.kind === 'snap'
          ? 'missed'
          : state.phase.sub.kind
      : state.phase.kind === 'trip-settled'
        ? 'trip-settled'
        : state.phase.kind === 'upgrade-modal'
          ? 'upgrade-modal'
          : (state.phase.kind as 'lobby' | 'bet-entry')

  // Tim 2026-05-24 Layer 1: only NORMAL catches count toward the "fish
  // landed" display so JUNK / SNAP aren't celebrated as successes in the
  // top-line counter. The trip-receipt + history still records them.
  const tripCatchCount = state.tripCatches.filter((c) => c.result === 'normal').length
  const castsRemaining =
    state.phase.kind === 'trip-active'
      ? Math.max(
          0,
          state.maxCasts -
            state.currentCastIndex -
            (state.phase.sub.kind === 'caught' ||
            state.phase.sub.kind === 'missed' ||
            state.phase.sub.kind === 'junk-caught' ||
            state.phase.sub.kind === 'snap'
              ? 1
              : 0),
        )
      : state.maxCasts

  // Tim 2026-05-25 IN-CANVAS HUD MIGRATION — first-session ghost prompt.
  // Shows a one-time "tap & hold any tile to cast" hint over the canvas
  // during the FIRST between-casts surface a player reaches. Backed by
  // localStorage so the prompt never re-appears for returning players.
  // RG-C5 SAFE: the dismissal is a structural flip (seen / not seen),
  // not a per-state escalation; the prompt visuals are module-const.
  //
  // Taste-guardian 2026-05-26 Flag 1: the cyan tap-hold ring continued
  // mounting on every between-casts surface (even after the player had
  // already used the mechanic + dismissed the prompt), turning the ring
  // into a permanent ambient cyan pulse loop. Now the ring is gated by
  // `tapHoldTeachingActive` — it shows ONLY during the first-session
  // teaching window. Once dismissed (or storage marks seen=1 on mount),
  // the ring is suppressed for the entire session and all future ones.
  const [ghostPromptVisible, setGhostPromptVisible] = useState(false)
  const [tapHoldTeachingActive, setTapHoldTeachingActive] = useState(false)
  const ghostPromptArmedRef = useRef(false)
  useEffect(() => {
    if (!isBetweenCasts) return
    if (ghostPromptArmedRef.current) return
    ghostPromptArmedRef.current = true
    if (typeof window === 'undefined') return
    try {
      const seen = window.localStorage.getItem(GHOST_PROMPT_STORAGE_KEY)
      if (seen === '1') return
      setGhostPromptVisible(true)
      setTapHoldTeachingActive(true)
    } catch {
      // localStorage unavailable — just show it once per session
      setGhostPromptVisible(true)
      setTapHoldTeachingActive(true)
    }
  }, [isBetweenCasts])
  const dismissGhostPrompt = useMemo(
    () => () => {
      setGhostPromptVisible(false)
      setTapHoldTeachingActive(false)
      if (typeof window === 'undefined') return
      try {
        window.localStorage.setItem(GHOST_PROMPT_STORAGE_KEY, '1')
      } catch {
        // ignore
      }
    },
    [],
  )

  // Track reeling elapsed time for the overlay progress bar.
  const [reelElapsedMs, setReelElapsedMs] = useState(0)
  useEffect(() => {
    if (!isReeling) {
      setReelElapsedMs(0)
      return
    }
    const startedAt = state.reelStartedMs
    if (startedAt === null) return
    const id = setInterval(() => {
      setReelElapsedMs(performance.now() - startedAt)
    }, 50)
    return () => clearInterval(id)
  }, [isReeling, state.reelStartedMs])

  return (
    <div style={styles.page} data-testid="oo-fisher-root">
      {/* ── Header tape (mirror Pulse / Vault) ──────────────────────── */}
      <div style={styles.headerTape}>
        <span style={styles.tapeBrand}>OO-FISHER</span>
        <HelpButton onClick={() => setShowInfo(true)} gameLabel={ooFisherOnboarding.gameLabel} />
        <span style={styles.tapeMeta} data-testid="oo-fisher-phase-label">
          {phaseLabel}
        </span>
        <span style={styles.tapeMeta}>{tripIdLabel}</span>
        <span style={styles.tapeSeparator} aria-hidden="true" />
        <span style={styles.tapeTime}>
          DEPTH {state.currentDepth !== null ? formatDepth(state.currentDepth) : '--'}
        </span>
        {isTripActive && (
          <span style={styles.liveBadge}>
            <span style={styles.liveDot} />
            LIVE
          </span>
        )}
        <SessionMeta rounds={sessionRounds} deltaLamports={sessionDelta} />
        {/* Two money pools, now disambiguated by purpose (jesse clarity fix):
            STASH funds gear upgrades, BALANCE funds trips. */}
        <span style={styles.stashBadge}>
          STASH
          <span style={{ fontSize: 10 }}> · gear</span> ·{' '}
          <span style={styles.stashValue}>{formatScales(state.metaCurrencyLamports)} scales</span>
        </span>
        <span style={styles.tapeBalance}>
          BALANCE
          <span style={{ fontSize: 10 }}> · trips</span> ·{' '}
          <span style={styles.tapeBalanceValue}>{formatUsdc(state.balanceLamports)}</span>
        </span>
      </div>

      {/*
       * ── Round card ──────────────────────────────────────────────────
       *
       * Layout fix (Tim playtest 2026-05-23): the action bar previously
       * rendered as an absolute overlay anchored at the bottom of the
       * canvas, which covered the boat / rod / fishing scene exactly the
       * same way the OO-BURST action bar covered the discs. Pattern A:
       * the action bar is now a flex SIBLING of the canvas shell, sitting
       * in normal document flow BELOW the scene. The full water column +
       * boat + rod + birds + clouds + sun glare stay visible at all times
       * during a trip. The POWER meter remains painted INSIDE the canvas
       * (on the deck rail) where it belongs.
       *
       * The centered overlay (lobby + bet-entry) is still an absolute
       * scrim because no canvas hit-regions are live in those phases.
       */}
      <div style={styles.roundCard}>
        <div style={styles.canvasShell} data-testid="oo-fisher-canvas-shell">
          <OoFisherSceneSurface
            phase={canvasPhase}
            castPower={state.castPower}
            currentDepth={state.currentDepth}
            recentCatchRarity={recentCatchRarity}
            loadout={state.loadout}
            reducedMotion={reducedMotion}
            tripCatchCount={tripCatchCount}
            castsRemaining={castsRemaining}
            targetTileIndex={state.targetTileIndex}
            onTileClick={controller.setTargetTile}
            // Tim 2026-05-24 OO-FISHER L3 — direct-manipulation cast.
            // PointerDown on a hex starts the cast ramp at that hex.
            // PointerUp releases (launches if power above threshold).
            // The big HOLD-TO-CAST button stays mounted for accessibility.
            onHexPointerDown={controller.startHexCharge}
            onHexPointerUp={controller.releaseHexCharge}
          />

          {/* Tim 2026-05-26 FIX 3 — UNIFIED TOP-RIGHT HUD PLAQUE.
              Replaces both the old cornerStatusCard (POWER/CATCHES/CASTS LEFT)
              and the old InCanvasBetweenCastsPlaque (TRIP MULT/CASH OUT AT/CAUGHT).
              ONE combined plaque at top-right holds all 5 metrics in a compact
              vertical stack. Fogo-style info cluster reference image 111.
              Wood+brass register. ZERO cyan on wood (warm+cyan strict ban). */}
          {isTripActive && (
            <InCanvasTopRightPlaque
              tripCatches={state.tripCatches}
              currentCastIndex={state.currentCastIndex}
              maxCasts={state.maxCasts}
              wagerLamports={state.wagerLamports}
              castsRemaining={castsRemaining}
              tripCatchCount={tripCatchCount}
              castPower={state.castPower}
              isCasting={isCasting}
            />
          )}

          {/*
            Depth-label rail — left side of the canvas overlay. Lists the
            5 depth bands and the rarity tiers that live at each. Lets a
            new player UNDERSTAND what "deeper = rarer" actually means
            without having to play 50 trips to discover it (Tim playtest
            2026-05-24). The rail dims out the bands the boat can't reach
            (RG-C5 SAFE: read from `maxDepthByBoat`, never from streak).
          */}
          {isTripActive && (
            <DepthLabelRail
              boat={state.loadout.boat}
              currentDepth={state.currentDepth}
              castPowerPreviewDepth={
                state.phase.kind === 'trip-active' &&
                state.phase.sub.kind === 'casting' &&
                state.castPower > 0
                  ? castPowerToDepth(state.castPower, state.loadout.boat)
                  : null
              }
            />
          )}

          {/*
            Cast-power preview — center-bottom of the canvas overlay,
            ONLY while the player is charging the cast. Tells them which
            DEPTH they're aiming at AND the expected rarity band. This
            is the "before you release" affordance Tim flagged as missing.
          */}
          {isTripActive &&
            state.phase.kind === 'trip-active' &&
            state.phase.sub.kind === 'casting' &&
            state.castPower > 0 && (
              <CastPowerPreview power={state.castPower} boat={state.loadout.boat} />
            )}

          {/*
            Tim 2026-05-25 IN-CANVAS HUD MIGRATION — Part 1 (discoverability).
            During BETWEEN CASTS, render a tap-and-hold affordance ring +
            ghost-prompt text directly inside the canvas. The ring pulses
            softly on a module-const 3000ms cycle (RG-C5: NOT escalated per
            streak / per cash-out value) and the prompt fades in/out so a
            first-session player understands the hex tap-and-hold mechanic
            without having to read the help overlay or hit the bottom button.

            The affordance is pointer-events: none so it never blocks the
            real hex hit-region.
          */}
          {isBetweenCasts && (
            <TapAndHoldAffordance
              ghostPromptVisible={ghostPromptVisible}
              teachingActive={tapHoldTeachingActive}
              onGhostPromptDismiss={dismissGhostPrompt}
            />
          )}

          {/*
            Tim 2026-05-26 EMBEDDED HUD REBUILD — Part 2a (BETWEEN CASTS plaque).
            RETIRED: replaced by InCanvasTopRightPlaque (the unified 5-metric
            top-right plaque) which already shows TRIP MULT / CASH OUT AT /
            CAUGHT / CASTS LEFT / POWER in one combined plaque.
            InCanvasBetweenCastsPlaque function kept as dead code (minimum-diff)
            but its JSX mount is removed to eliminate the duplicate HUD.
            The testid "oo-fisher-action-bar-between-casts" is now served by
            InCanvasTopRightPlaque below for Playwright contract continuity.
          */}

          {/*
            Tim 2026-05-25 IN-CANVAS HUD MIGRATION — Part 2b (CASH OUT chest).
            The bottom CASH OUT TRIP button migrates INSIDE the canvas as a
            themed brass-rim wooden chest at the stern of the boat (bottom-
            right of canvas). Tap-and-hold to "open" the chest cashes out.
            Carries the existing data-testid="oo-fisher-cash-out-trip".
          */}
          {isBetweenCasts && <InCanvasCashOutChest controller={controller} />}

          {/*
            Tim 2026-05-25 IN-CANVAS HUD MIGRATION — Part 2c (CASTING controls).
            The bottom CASTING action bar (POWER readout + HOLD-TO-CAST
            button + cash-out link) migrates INSIDE the canvas as a compact
            deck-switch panel anchored at canvas bottom-center. The hex
            tap-and-hold remains the primary cast gesture; this is the
            accessible fallback that keeps the testid contract.
          */}
          {isCasting && <InCanvasCastingControls controller={controller} />}

          {/*
            Tim 2026-05-26 EMBEDDED HUD REBUILD — LINE OUT bow placard.
            Replaces the below-canvas LineOutActionBar DOM strip with a
            wood-plaque instrument on the bow.
          */}
          {isLineOut && <InCanvasLineOutPlacard />}

          {/*
            Tim 2026-05-26 EMBEDDED HUD REBUILD — FISH ON bow placard.
            In-canvas wood-plaque carrying the live countdown. Preserves
            the `oo-fisher-action-bar-fish-on` and
            `oo-fisher-fish-on-countdown` testid contracts for Playwright.
          */}
          {isFishOn && <InCanvasFishOnPlacard fishOnStartedMs={state.fishOnStartedMs} />}

          {/*
            Tim 2026-05-26 EMBEDDED HUD REBUILD — transom display board.
            CAUGHT / JUNK / MISSED / SNAP all use the same sliding transom
            board. Slides in from the bottom edge, holds, then the provider
            auto-advances. No celebration register on loss outcomes (RG-C1).
          */}
          {(isCaught || isJunkCaught || isMissed || isSnap) &&
            isTripActive &&
            state.phase.kind === 'trip-active' && (
              <InCanvasTransomBoard
                sub={state.phase.sub}
                bait={state.loadout.bait}
                wagerLamports={state.wagerLamports}
                maxCasts={state.maxCasts}
                castIndex={state.currentCastIndex}
              />
            )}

          {/*
            Tim 2026-05-24 IN-SCENE POWER GAUGE — DOM probe.
            The actual visual gauge is rendered IN the 3D canvas
            (BoatPowerGauge component, world-space billboarded next to
            the boat). Playwright can't easily query inside the WebGL
            canvas, so we mirror the gauge's visibility + power level
            in a DOM probe element. Tests assert on this probe to
            verify the in-scene HUD is wired:
              - data-testid="oo-fisher-in-scene-power-gauge"
              - data-power={castPower} (mirrors the 3D bar's fill level)
              - data-visible={isCharging ? 'true' : 'false'}
            Visually hidden (sr-only) so the player sees only the 3D gauge.
          */}
          <div
            data-testid="oo-fisher-in-scene-power-gauge"
            data-visible={
              isTripActive &&
              state.phase.kind === 'trip-active' &&
              state.phase.sub.kind === 'casting' &&
              state.castPower > 0
                ? 'true'
                : 'false'
            }
            data-power={state.castPower.toString()}
            aria-hidden="true"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              clipPath: 'inset(50%)',
              whiteSpace: 'nowrap',
              border: 0,
              padding: 0,
              margin: -1,
            }}
          />

          {/*
            FISH-ON rarity reveal — center overlay during fish-on, BEFORE
            the reeling minigame mounts. Tells the player WHICH tier is
            on the line so they understand the stakes. The rarity here is
            the actual rarity that will be resolved (the seed is already
            derived) so this is the truthful pre-reveal.
          */}
          {isTripActive &&
            state.phase.kind === 'trip-active' &&
            state.phase.sub.kind === 'fish-on' && <FishOnRarityReveal />}

          {/*
            CATCH celebration — inline above the action bar.

            Tim 2026-05-26 EMBEDDED HUD REBUILD: CatchCelebration (the old
            floating glass-card inline pill) is retired for everyday catches
            (common / uncommon / rare). The InCanvasTransomBoard now handles
            these with fish silhouette + species name + multiplier on the boat
            transom. Epic+ still routes to BigCatchHero below.

            RG-C5: shape, timing, and audio remain identical across rarities
            — the split is a routing decision, not an escalation of intensity.
          */}

          {/*
            Tim 2026-05-24 OO-FISHER playtest L6 — BIG CATCH HERO MOMENT.

            Full-canvas overlay with a large fish silhouette + rarity tier
            name + multiplier hit + particle burst. Plays for the full
            CATCH_HERO_DURATION_MS window (1500ms) before auto-advance.

            RG-C5 STRUCTURAL: particle COUNT and animation TIMING are
            module-const — identical regardless of rarity. Only the COLOR
            differs (read from RARITY_VISUALS). Audio is the existing
            `playCatchFanfare()` (zero-param) fired upstream in the
            provider. Same chord every rarity.

            Tim feedback: "it is not clear what fish you got, it needs to
            be like big in screen like a moment to live."

            Tim 2026-05-25 BUG-4 fix: hero now mounts ONLY for big-tier
            catches (epic / legendary / mythic). The inline pill above
            covers the everyday-tier catches. Exactly one of the two
            overlays is on-screen at any moment — never both.
          */}
          {isTripActive &&
            state.phase.kind === 'trip-active' &&
            state.phase.sub.kind === 'caught' &&
            isBigCatch(state.phase.sub.rarity) && (
              <BigCatchHero
                rarity={state.phase.sub.rarity}
                bait={state.loadout.bait}
                wagerLamports={state.wagerLamports}
                maxCasts={state.maxCasts}
                celebrationColor={(() => {
                  const skin = cosmeticById(cosmetics.equipped.celebration)
                  return skin && skin.celebration !== 'classic' ? skin.swatch : null
                })()}
              />
            )}

          {/*
            Tim 2026-05-26 EMBEDDED HUD REBUILD: MissFeedback (center-canvas
            glass overlay) retired — the InCanvasTransomBoard at the boat
            transom now carries the MISSED educational message inline with the
            boat anatomy. No center-canvas overlay needed.
          */}

          {/* Reeling overlay (in-canvas) — only during reeling sub-phase */}
          {isReeling && state.reelParams && (
            <OoFisherReelingOverlay
              tension={state.reelTension}
              params={state.reelParams}
              elapsedMs={reelElapsedMs}
              onTap={controller.reelTap}
            />
          )}

          {centeredCardPhase && (
            <div
              style={{
                ...styles.canvasOverlayCenter,
                // 35% backdrop dim so the form card reads cleanly over the 3D scene.
                // The scene continues rendering behind — player sees the fishing
                // backdrop, not a black void (Tim image 115 fix 2026-05-26).
                background: 'rgba(3, 7, 13, 0.45)',
              }}
              aria-live="polite"
            >
              <div
                style={{
                  ...styles.overlayPanel,
                  // Tim 2026-05-26 image 126: TripSettlement card needs more
                  // width than bet-entry's 380px max — it has 3-column layout
                  // (mult + delta + CTAs). Bump to 720px for settled phase
                  // so TRIP LANDED card reads correctly when embedded over
                  // the canvas instead of overflowing or wrapping awkwardly.
                  width:
                    state.phase.kind === 'trip-settled' ? 'min(720px, 100%)' : 'min(380px, 100%)',
                }}
                data-testid="oo-fisher-bet-entry-card"
              >
                <PhaseSurface controller={controller} />
              </div>
            </div>
          )}
        </div>

        {/*
         * Action bar slot — sibling of the canvas, NOT an overlay.
         * Geometric test in oo-fisher.spec.ts mirrors the OO-BURST gate:
         * actionBarBox.y must be >= canvasBox.bottom.
         */}
        {bottomBarPhase && !isReeling && (
          <div
            style={inCanvasActionPhase ? styles.bottomBarSlotCollapsed : styles.bottomBarSlot}
            data-testid="oo-fisher-action-bar-slot"
            data-in-canvas={inCanvasActionPhase ? 'true' : 'false'}
            aria-live="polite"
          >
            {/*
              Tim 2026-05-25 IN-CANVAS HUD MIGRATION: during casting +
              between-casts the bottom slot is intentionally empty — the
              action surface lives INSIDE the canvas. The slot wrapper
              still mounts so the geometric layout invariant
              (actionBarBox.y >= canvasBox.bottom) is preserved AND
              integration tests that query for [data-testid="oo-fisher-
              action-bar-slot"] keep finding it.
            */}
            {!inCanvasActionPhase && (
              <div style={styles.actionBarPanel}>
                <PhaseSurface controller={controller} />
              </div>
            )}
          </div>
        )}

        {/* Footer strip — TRIP IN PROGRESS text removed 2026-05-26.
            The in-canvas top-right plaque (InCanvasTopRightPlaque) now carries
            CAUGHT / CASTS LEFT counts inline with the 3D scene. The page-footer
            duplicate "TRIP IN PROGRESS" copy was visually redundant and added
            an extra DOM element below the full-screen canvas. GlassBoxReceipt
            and HistoryStrip remain (settle + session history, no trip status). */}
        <div style={styles.gameFooter}>
          {state.phase.kind === 'trip-settled' && <GlassBoxReceipt controller={controller} />}
          <HistoryStrip rows={state.history} />
        </div>
      </div>

      {/* Upgrade modal overlay */}
      {state.phase.kind === 'upgrade-modal' && (
        <OoFisherUpgradePanel
          loadout={state.loadout}
          currencyLamports={state.metaCurrencyLamports}
          onPurchase={controller.purchaseUpgrade}
          onClose={controller.closeUpgradeModal}
          cosmetics={cosmetics}
        />
      )}

      <style>{KEYFRAMES}</style>
      <OnboardingOverlay
        sequence={ooFisherOnboarding}
        visible={onboarding.visible}
        onComplete={onboarding.markSeen}
        onDismiss={onboarding.markSeen}
      />
      {showInfo && <OoFisherInfoOverlay onClose={() => setShowInfo(false)} />}
    </div>
  )
}

// ─── HOW TO PLAY overlay ─────────────────────────────────────────────────────
function OoFisherInfoOverlay({ onClose }: { readonly onClose: () => void }): ReactElement {
  const brass = '#ffd27a'
  return (
    <div
      style={infoStyles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label="How to play OO-Fisher"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div style={infoStyles.panel}>
        <div style={infoStyles.header}>
          <span style={infoStyles.title}>HOW TO PLAY</span>
          <button type="button" onClick={onClose} style={infoStyles.close} aria-label="Close">
            ✕
          </button>
        </div>
        <div style={infoStyles.body}>
          <p style={infoStyles.lead}>
            Set a wager and start a fishing trip. Each trip gives you a few{' '}
            <strong style={{ color: brass }}>casts</strong>. Every fish you land builds your{' '}
            <strong style={{ color: brass }}>TRIP HAUL</strong> — a multiplier. Cash out your haul
            (× your wager) whenever you like.
          </p>

          <span style={infoStyles.head}>CAST &amp; REEL</span>
          <p style={infoStyles.text}>
            Tap and <em>hold</em> a water tile to charge your cast — more power reaches{' '}
            <strong>deeper water</strong>, where the fish are rarer and bigger. Then reel: tap to
            keep the marker in the <strong style={{ color: '#7CFC9A' }}>green</strong>. Nail the{' '}
            <strong style={{ color: brass }}>dead-center “perfect”</strong> band for a rarity boost.
          </p>

          <span style={infoStyles.head}>YOUR TRIP HAUL</span>
          <p style={infoStyles.text}>
            The haul is the average value of your casts, spread over the whole trip — so it only ever{' '}
            <strong>builds up, never drops</strong>. A miss just adds nothing. Below ×1.00 means
            you’re under your stake; cash out above it to profit. Use all your casts for the full
            haul, or bank early.
          </p>

          <span style={infoStyles.head}>SCALES &amp; GEAR</span>
          <p style={infoStyles.text}>
            Every catch also earns <strong style={{ color: brass }}>scales</strong> — a gear-credit,
            NOT your money. Spend scales on gear: a better <strong>rod</strong> (more casts),{' '}
            <strong>boat</strong> (deeper water), <strong>bait</strong> (rarer fish). Gear changes
            your variety and thrill, not your odds — it never adds an edge.
          </p>

          <span style={infoStyles.head}>FAIR &amp; PAYBACK</span>
          <p style={infoStyles.text}>
            OO-Fisher pays back ~96% over time (the rest is the house edge), the same for every
            loadout. Each settled trip shows a Glass Box receipt so you can verify the catches were
            fixed by the seed.
          </p>
        </div>
        <button type="button" onClick={onClose} style={infoStyles.gotIt}>
          got it →
        </button>
      </div>
    </div>
  )
}

const infoStyles: Record<string, CSSProperties> = {
  scrim: {
    position: 'fixed',
    inset: 0,
    zIndex: 120,
    background: 'rgba(10, 6, 3, 0.82)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  panel: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '88dvh',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(180deg, #1c130a, #120c06)',
    border: '1px solid rgba(184, 137, 92, 0.35)',
    borderRadius: 18,
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    borderBottom: '1px solid rgba(184, 137, 92, 0.28)',
  },
  title: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.22em',
    color: '#ffe8bc',
  },
  close: {
    width: 44,
    height: 44,
    minWidth: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.05)',
    color: T.textMuted,
    border: '1px solid rgba(184, 137, 92, 0.35)',
    borderRadius: 10,
    fontSize: 16,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  body: {
    padding: '16px 18px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  lead: {
    fontFamily: T.fontBody,
    fontSize: 14,
    lineHeight: 1.5,
    color: T.textPrimary,
    margin: '0 0 8px',
  },
  head: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.18em',
    color: '#ffd27a',
    marginTop: 10,
  },
  text: {
    fontFamily: T.fontBody,
    fontSize: 13,
    lineHeight: 1.55,
    color: T.textMuted,
    margin: '2px 0 0',
  },
  gotIt: {
    margin: 16,
    padding: '14px 24px',
    background: 'linear-gradient(180deg, #ffd27a, #c89148)',
    color: '#2a1a08',
    border: 'none',
    borderRadius: 12,
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
}

// ─── SessionMeta chip (mirror Pulse / Vault) ──────────────────────────────

function SessionMeta({
  rounds,
  deltaLamports,
}: {
  readonly rounds: number
  readonly deltaLamports: bigint
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
      aria-label={`Session: ${rounds} trips, ${positive ? 'plus' : 'minus'} ${formatUsdc(abs)}`}
    >
      SESSION · {rounds} {rounds === 1 ? 'TRIP' : 'TRIPS'} · {sign}
      {formatUsdc(abs)}
    </span>
  )
}

// ─── Phase-keyed inner surface ────────────────────────────────────────────

function PhaseSurface({ controller }: { readonly controller: OoFisherController }): ReactElement {
  const { state } = controller
  switch (state.phase.kind) {
    case 'lobby':
      return <Lobby controller={controller} />
    case 'bet-entry':
      return <BetEntry controller={controller} />
    case 'trip-active': {
      switch (state.phase.sub.kind) {
        case 'casting':
          return <CastingActionBar controller={controller} />
        case 'line-out':
          return <LineOutActionBar />
        case 'fish-on':
          return <FishOnActionBar fishOnStartedMs={state.fishOnStartedMs} />
        case 'reeling':
          // Reeling has its own overlay — no action bar needed.
          return <></>
        case 'caught':
          return (
            <CaughtActionBar
              rarity={state.phase.sub.kind === 'caught' ? state.phase.sub.rarity : 'common'}
            />
          )
        case 'junk-caught':
          return <JunkCaughtActionBar />
        case 'snap':
          return <SnapActionBar />
        case 'missed':
          return <MissedActionBar />
        case 'between-casts':
          return <BetweenCastsActionBar controller={controller} />
      }
      return <></>
    }
    case 'trip-settled':
      return <TripSettlement controller={controller} outcome={state.phase.outcome} />
    case 'upgrade-modal':
      return <></>
  }
}

// ─── Lobby ────────────────────────────────────────────────────────────────

function Lobby({ controller }: { readonly controller: OoFisherController }): ReactElement {
  const { state } = controller
  // Tim 2026-05-24 Layer 1: surface the published RTP + house edge so
  // the player sees the casino-honest math BEFORE wagering. Brand
  // register: "quiet expert at the table" — no competitor publishes
  // their RTP this prominently.
  const rtp = useMemo(() => publishedFisherRtp(), [])
  return (
    <div style={styles.controlCard}>
      <div style={styles.lobbyHero}>
        <span style={styles.lobbyTitle}>CAST OFF</span>
        <span style={styles.lobbyTagline}>
          go on a fishing trip — every fish adds to your haul, so more casts means a bigger haul.
          your haul only goes up. some casts come back empty (they just add nothing). cash out your
          haul any time.
        </span>
        <span style={styles.lobbyFootnote}>
          your gear: {formatTier(state.loadout.rod)} rod · {formatTier(state.loadout.boat)} boat ·{' '}
          {formatTier(state.loadout.bait)} bait
        </span>
      </div>
      {/* Published RTP chip — the disclosure surface (Tim 2026-05-24). */}
      <div style={styles.rtpChip} data-testid="oo-fisher-published-rtp">
        <span style={styles.rtpChipLabel}>PUBLISHED RTP</span>
        <span style={styles.rtpChipValue}>{formatRtp(rtp.rtp)}</span>
        <span style={styles.rtpChipSep} aria-hidden="true">
          ·
        </span>
        <span style={styles.rtpChipEdge}>house edge {formatHouseEdge(rtp.houseEdge)}</span>
        <span style={styles.rtpChipFoot}>most casinos hide this number. we publish it.</span>
      </div>
      <PrimaryButton onClick={controller.openBetEntry} testId="oo-fisher-place-wager">
        place a wager →
      </PrimaryButton>
      <SecondaryButton onClick={controller.openUpgradeModal}>
        upgrade gear · {formatScales(state.metaCurrencyLamports)} scales
      </SecondaryButton>
    </div>
  )
}

// ─── Bet entry ────────────────────────────────────────────────────────────

function BetEntry({ controller }: { readonly controller: OoFisherController }): ReactElement {
  const { state } = controller
  const insufficient = state.wagerLamports > state.balanceLamports
  const tripCastsAllowed = castsPerTrip(state.loadout.rod)
  const maxDepth = maxDepthByBoat(state.loadout.boat)
  return (
    <div style={styles.controlCard}>
      <div style={styles.wagerHero}>
        <span style={styles.wagerEyebrow}>YOUR WAGER</span>
        <input
          id="oo-fisher-wager-input"
          className="oo-fisher-wager-input"
          type="number"
          min={0.1}
          step={1}
          // Display: bigint → number is safe here since balance/wager are
          // bounded well below MAX_SAFE_INTEGER (1_000_000_000 lamports tops).
          value={Number(state.wagerLamports) / 1_000_000}
          onChange={(e) => {
            // Tim 2026-05-26 frontend audit H-2 fix: avoid IEEE 754 float
            // multiplication on the wager-to-lamports conversion. Parse the
            // typed string directly into a (whole, frac) bigint pair so the
            // entry-point produces an exact lamport count without going
            // through float * 1_000_000.
            const raw = e.target.value.trim()
            const match = /^(\d*)(?:\.(\d{1,6}))?$/.exec(raw)
            if (match === null) return
            const wholeStr = match[1] === '' ? '0' : (match[1] ?? '0')
            const fracStr = (match[2] ?? '').padEnd(6, '0')
            try {
              const lamports = BigInt(wholeStr) * 1_000_000n + BigInt(fracStr)
              controller.setWager(lamports)
            } catch {
              // Malformed input — ignore; the input keeps its prior value.
            }
          }}
          style={styles.wagerAmountInput}
          aria-label="Wager amount in USDC"
        />
        <span style={styles.wagerAmountUnit}>USDC</span>
      </div>

      <div style={styles.quickPickRow}>
        {WAGER_PRESETS.map((p) => {
          const selected = state.wagerLamports === p.value
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => controller.setWager(p.value)}
              style={selected ? styles.quickPickSelected : styles.quickPick}
              aria-pressed={selected}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div style={styles.gearSummaryBlock}>
        <div style={styles.gearSummaryHeader}>
          <span style={styles.gearSummaryLabel}>YOUR LOADOUT</span>
          <button type="button" onClick={controller.openUpgradeModal} style={styles.linkButton}>
            upgrade →
          </button>
        </div>
        <div style={styles.gearSummaryRow}>
          <GearTierChip label="ROD" tier={state.loadout.rod} sub={`${tripCastsAllowed} casts`} />
          <GearTierChip label="BOAT" tier={state.loadout.boat} sub={`depth ${maxDepth}`} />
          <GearTierChip
            label="BAIT"
            tier={state.loadout.bait}
            sub={`+${['bronze', 'silver', 'gold', 'platinum', 'mythic'].indexOf(state.loadout.bait) * 5}% value`}
          />
        </div>
      </div>

      <div style={styles.betFooter}>
        <div style={styles.betFooterStats}>
          <div style={styles.betFooterStat}>
            <span style={styles.betFooterStatLabel}>BALANCE</span>
            <span style={styles.betFooterStatValue}>{formatUsdc(state.balanceLamports)}</span>
          </div>
          <div style={styles.betFooterStat}>
            <span style={styles.betFooterStatLabel}>MAX WIN</span>
            <span style={styles.betFooterStatValue}>10× wager</span>
          </div>
        </div>
        <div style={styles.betFooterActions}>
          <button type="button" onClick={controller.closeBetEntry} style={styles.linkButton}>
            cancel
          </button>
          <button
            type="button"
            onClick={() => {
              controller.startTrip().catch(() => undefined)
            }}
            disabled={insufficient}
            style={insufficient ? styles.commitButtonDisabled : styles.commitButton}
            aria-label={`Start trip with ${formatUsdc(state.wagerLamports)} wager`}
            data-testid="oo-fisher-start-trip"
          >
            start trip →
          </button>
        </div>
      </div>
    </div>
  )
}

function GearTierChip({
  label,
  tier,
  sub,
}: {
  readonly label: string
  readonly tier: GearTier
  readonly sub: string
}): ReactElement {
  return (
    <div style={styles.gearChip}>
      <span style={styles.gearChipLabel}>{label}</span>
      <span style={styles.gearChipTier}>{formatTier(tier)}</span>
      <span style={styles.gearChipSub}>{sub}</span>
    </div>
  )
}

// ─── Casting action bar (RG-C8 cash-out available here) ──────────────────

function CastingActionBar({
  controller,
}: {
  readonly controller: OoFisherController
}): ReactElement {
  const { state } = controller
  const canCashOut = state.tripCatches.length > 0
  const power = state.castPower
  const isHolding = power > 0
  return (
    <div style={styles.actionBar} data-testid="oo-fisher-action-bar-casting">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: T.accent }}>CASTING</span>
          <span style={styles.actionBarSub}>
            {isHolding ? 'release to launch the lure' : 'hold the cast button to charge power'}
          </span>
        </div>
        <div style={styles.actionBarInfo}>
          <Stat
            label="Power"
            value={power.toString().padStart(2, '0')}
            emphasis
            testId="oo-fisher-power-value"
          />
          <Stat label="Cast" value={`${state.currentCastIndex + 1} / ${state.maxCasts}`} />
          <Stat label="Caught" value={state.tripCatches.length.toString().padStart(2, '0')} />
        </div>
      </div>
      <div style={styles.actionBarRight}>
        <CastButton controller={controller} />
        {canCashOut && (
          <button
            type="button"
            onClick={controller.cashOutTrip}
            style={styles.cashOutLink}
            aria-label="Cash out the trip"
          >
            cash out trip · {state.tripCatches.length} caught
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * The CAST button — press-and-hold UX. Pointer-down starts charging,
 * pointer-up triggers the launch. RG-C5 SAFE: the only state the button
 * passes to the audio layer is the current power level (a true per-event
 * physical value), via `playPowerCharge(power/100)` inside the controller's
 * setCastPower path.
 *
 * IMPLEMENTATION NOTE — the ramp interval reads the controller callbacks
 * via a ref instead of capturing them in the effect closure. The controller
 * memo from `useOoFisherController` produces a new object reference on
 * every state change (its `useMemo` deps include `state`), so capturing
 * `controller` in the effect's dep array would clear & restart the
 * setInterval on every tick and freeze the power at 1. The ref pattern
 * lets us depend only on `holding` while still calling the latest
 * controller methods. data-testid hooks expose the live POWER value for
 * the Playwright smoke test.
 */
function CastButton({ controller }: { readonly controller: OoFisherController }): ReactElement {
  const [holding, setHolding] = useState(false)
  // The controller is unstable across renders; the interval must read the
  // latest callbacks via a ref to avoid re-creating the interval every tick.
  const controllerRef = useRef(controller)
  useEffect(() => {
    controllerRef.current = controller
  }, [controller])

  // Hold ramp: 0 → 100 over ~1.0s, controlled by a local interval. The
  // effect intentionally depends ONLY on `holding` so re-renders triggered
  // by `setCastPower` cannot reset `startedAt`.
  useEffect(() => {
    if (!holding) return
    const startedAt = performance.now()
    const id = setInterval(() => {
      const elapsed = performance.now() - startedAt
      // 1.0s to full power, then cap at 100.
      const power = Math.min(100, Math.floor((elapsed / 1000) * 100))
      controllerRef.current.setCastPower(power)
    }, 16)
    return () => clearInterval(id)
  }, [holding])

  const handleDown = (): void => {
    setHolding(true)
    controllerRef.current.setCastPower(1) // tick out of 0 immediately for haptic feel
  }
  const handleUp = (): void => {
    if (!holding) return
    setHolding(false)
    controllerRef.current.launchCast().catch(() => undefined)
  }
  return (
    <button
      type="button"
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={(e) => {
        if (holding) handleUp()
        void e
      }}
      style={holding ? styles.castButtonActive : styles.castButton}
      aria-label="Hold to charge cast power, release to launch"
      data-testid="oo-fisher-cast-button"
      data-holding={holding ? 'true' : 'false'}
    >
      <span style={styles.castButtonLabel}>{holding ? 'release' : 'hold to cast'}</span>
      <span style={styles.castButtonSub}>charge → depth</span>
    </button>
  )
}

// ─── In-canvas HUD migration (Tim 2026-05-25) ────────────────────────────

/**
 * TapAndHoldAffordance — softly pulsing cyan ring + ghost prompt that tells
 * the player "tap and hold any tile to cast" without forcing them to read
 * the help overlay. The ring's pulse is module-const (RG-C5 SAFE: NOT
 * escalated per streak / per cash-out value).
 */
function TapAndHoldAffordance({
  ghostPromptVisible,
  teachingActive,
  onGhostPromptDismiss,
}: {
  readonly ghostPromptVisible: boolean
  readonly teachingActive: boolean
  readonly onGhostPromptDismiss: () => void
}): ReactElement {
  useEffect(() => {
    if (!ghostPromptVisible) return
    const id = setTimeout(() => {
      onGhostPromptDismiss()
    }, 6000)
    return () => clearTimeout(id)
  }, [ghostPromptVisible, onGhostPromptDismiss])
  return (
    <>
      {/* Cohesion review 2026-05-26 Note 1 fix: ring + caption only render
          during the first-session teaching window. Once dismissed (or on a
          returning player whose localStorage already has seen=1), the
          continuous cyan pulse loop is suppressed — `motion = zero` between
          casts per OO-FISHER-GAME-FEEL-BEATS §7. */}
      {teachingActive && (
        <>
          <div
            style={styles.tapHoldRing}
            aria-hidden="true"
            data-testid="oo-fisher-tap-hold-ring"
          />
          <div style={styles.tapHoldCaption} aria-hidden="true">
            tap &amp; hold any tile to cast
          </div>
        </>
      )}
      {/* Persistent (static, no pulse) affordance for returning players so the
          "cast again" move never relies on memory — jesse clarity fix. The
          animated ring stays gated to the first session (no ambient pulse). */}
      {!teachingActive && !ghostPromptVisible && (
        <div
          style={{ ...styles.tapHoldCaption, color: 'rgba(255, 232, 188, 0.55)', fontSize: 9 }}
          aria-hidden="true"
        >
          tap a tile to cast again
        </div>
      )}
      {ghostPromptVisible && (
        <button
          type="button"
          onClick={onGhostPromptDismiss}
          style={styles.ghostPrompt}
          data-testid="oo-fisher-ghost-prompt"
          aria-label="Dismiss tap-and-hold tutorial"
        >
          <span style={styles.ghostPromptEyebrow}>NEW MECHANIC</span>
          <span style={styles.ghostPromptTitle}>tap &amp; hold any water tile</span>
          <span style={styles.ghostPromptBody}>
            charge the cast, release to launch. deeper hexes = rarer fish.
          </span>
          <span style={styles.ghostPromptDismiss}>got it ↵</span>
        </button>
      )}
    </>
  )
}

/**
 * InCanvasTopRightPlaque — Tim 2026-05-26 EMBEDDED HUD REBUILD (unified).
 *
 * Replaces BOTH the old cornerStatusCard (POWER / CATCHES / CASTS LEFT)
 * AND the old InCanvasBetweenCastsPlaque (TRIP MULT / CASH OUT AT / CAUGHT).
 * ONE combined plaque at canvas top-right carries all 5 metrics in a compact
 * vertical stack. Fogo-style info cluster (reference image 111).
 *
 * Wood+brass register. ZERO cyan on wood (warm+cyan strict ban 2026-05-26).
 *   - Background: warm cedar gradient (woodPlaqueBackground const)
 *   - Labels: cream rgba(255, 232, 188, 0.78)  — NEVER cyan
 *   - Values: brass #ffd27a                    — NEVER cyan
 *   - Dividers: brass-gradient hairlines        — NEVER cyan
 *
 * Carries `oo-fisher-action-bar-between-casts` testid so existing Playwright
 * contracts that probed InCanvasBetweenCastsPlaque still resolve.
 *
 * RG-C5 SAFE: all values read directly from state — no streak, session, or
 * multiplier scaling alters the plaque appearance or animation.
 * pointerEvents: 'none' — never blocks 3D scene hit-regions.
 */
function InCanvasTopRightPlaque({
  tripCatches,
  currentCastIndex,
  maxCasts,
  wagerLamports,
  castsRemaining,
  tripCatchCount,
  castPower,
  isCasting,
}: {
  readonly tripCatches: ReadonlyArray<{ readonly effectiveBps: bigint }>
  readonly currentCastIndex: number
  readonly maxCasts: number
  readonly wagerLamports: bigint
  readonly castsRemaining: number
  readonly tripCatchCount: number
  readonly castPower: number
  readonly isCasting: boolean
}): ReactElement {
  // Trip-multiplier "haul" preview: the haul is spread over the FULL trip
  // (maxCasts), so it only ever RISES as you fish and matches the settle math.
  // A weak/early cash-out never inflates it; casting again never lowers it.
  const tripPreviewBps = useMemo(() => {
    // Empty haul = 0.00× (not 1.00×): the haul builds UP from zero so it never
    // appears to "drop" on the first catch. (jesse fix.)
    if (tripCatches.length === 0) return 0n
    let sum = 0n
    for (const c of tripCatches) {
      if (c.effectiveBps >= 0n) sum += c.effectiveBps
    }
    const raw = sum / BigInt(Math.max(1, maxCasts)) // floor — house-favored
    const cap = 100_000n // 10.00x hard cap (RG-C5)
    return raw > cap ? cap : raw
  }, [tripCatches, maxCasts])

  const potentialPayout = (wagerLamports * tripPreviewBps) / ONE_X_BPS
  // Breakeven anchor (jesse clarity fix): a "multiplier" that reads below ×1.00
  // means you're UNDER your stake. Color it red so the player instantly reads
  // up/down vs their bet, instead of assuming a multiplier only goes up.
  const belowBreakeven = potentialPayout < wagerLamports

  return (
    <div
      style={styles.inCanvasTopRightPlaque}
      data-testid="oo-fisher-action-bar-between-casts"
      aria-live="polite"
      aria-label="Trip status"
    >
      {/* Row 1: TRIP HAUL — builds up across the trip's casts, only ever rises. */}
      <div style={styles.inCanvasTopRightRow}>
        <span style={styles.inCanvasTopRightLabel}>
          TRIP HAUL
          <span style={{ display: 'block', fontSize: 10, opacity: 0.8, letterSpacing: '0.04em' }}>
            builds each cast · {Math.min(currentCastIndex, maxCasts)} of {maxCasts}
          </span>
        </span>
        <span
          style={
            // Red only once you have a catch but are still under breakeven —
            // the empty 0.00× start is neutral, not an "error" red (jesse).
            tripCatchCount > 0 && tripPreviewBps < ONE_X_BPS
              ? { ...styles.inCanvasTopRightValue, color: T.danger }
              : styles.inCanvasTopRightValue
          }
        >
          {formatMultiplier(tripPreviewBps)}
        </span>
      </div>
      <div style={styles.inCanvasTopRightDivider} aria-hidden="true" />
      {/* Row 2: CASH OUT AT (red when below the staked wager, after first catch) */}
      <div style={styles.inCanvasTopRightRow}>
        <span style={styles.inCanvasTopRightLabel}>
          CASH OUT AT
          <span style={{ display: 'block', fontSize: 10, opacity: 0.75, letterSpacing: '0.04em' }}>
            staked {formatUsdc(wagerLamports)}
          </span>
        </span>
        <span
          style={
            tripCatchCount > 0 && belowBreakeven
              ? { ...styles.inCanvasTopRightValue, color: T.danger }
              : styles.inCanvasTopRightValue
          }
        >
          {formatUsdc(potentialPayout)}
        </span>
      </div>
      <div style={styles.inCanvasTopRightDivider} aria-hidden="true" />
      {/* Row 3: CAUGHT */}
      <div style={styles.inCanvasTopRightRow}>
        <span style={styles.inCanvasTopRightLabel}>CAUGHT</span>
        <span style={styles.inCanvasTopRightValue}>
          {tripCatchCount.toString().padStart(2, '0')}
        </span>
      </div>
      <div style={styles.inCanvasTopRightDivider} aria-hidden="true" />
      {/* Row 4: CASTS LEFT */}
      <div style={styles.inCanvasTopRightRow}>
        <span style={styles.inCanvasTopRightLabel}>CASTS LEFT</span>
        <span style={styles.inCanvasTopRightValue}>
          {castsRemaining.toString().padStart(2, '0')}
        </span>
      </div>
      {/* Row 5: POWER — only while charging cast (isCasting) */}
      {isCasting && (
        <>
          <div style={styles.inCanvasTopRightDivider} aria-hidden="true" />
          <div style={styles.inCanvasTopRightRow}>
            <span style={styles.inCanvasTopRightLabel}>POWER</span>
            {/* game-flow QA 2026-05-26 HIGH fix: testid removed here.
                `data-testid="oo-fisher-power-value"` belongs to the
                canonical InCanvasCastingControls cast surface, NOT this
                display-only top-right row. Two simultaneous nodes during
                isCasting cause Playwright .first() non-determinism. */}
            <span style={styles.inCanvasTopRightValue}>
              {castPower.toString().padStart(3, '0')}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * InCanvasBetweenCastsPlaque — Tim 2026-05-26 EMBEDDED HUD REBUILD.
 * Small wood-plaque cluster on the port-side gunwale (bottom-left of canvas).
 * Three brass-rim mini-readouts in a row: TRIP MULT / CASH OUT AT / CAUGHT.
 * Each ~80px wide. Cream labels, brass values. NO cyan on plaque ground.
 * Carries the `oo-fisher-action-bar-between-casts` testid so existing
 * Playwright contracts that probe for it still resolve.
 */
function InCanvasBetweenCastsPlaque({
  controller,
}: {
  readonly controller: OoFisherController
}): ReactElement {
  const { state } = controller
  const tripPreviewBps = useMemo(() => {
    if (state.tripCatches.length === 0) return 0n
    let sum = 0n
    for (const c of state.tripCatches) {
      if (c.effectiveBps >= 0n) sum += c.effectiveBps
    }
    const raw = sum / BigInt(Math.max(1, state.maxCasts)) // maxCasts → only rises
    const cap = 100_000n
    return raw > cap ? cap : raw
  }, [state.tripCatches, state.maxCasts])
  const potentialPayout = (state.wagerLamports * tripPreviewBps) / ONE_X_BPS
  const belowBreakeven = potentialPayout < state.wagerLamports
  return (
    <div
      style={styles.inCanvasBetweenCastsPlaque}
      data-testid="oo-fisher-action-bar-between-casts"
      aria-live="polite"
    >
      <div style={styles.inCanvasPlaqueRows}>
        <div style={styles.inCanvasPlaqueRow}>
          <span style={styles.inCanvasPlaqueLabel}>TRIP MULT</span>
          <span
            style={
              tripPreviewBps < ONE_X_BPS
                ? { ...styles.inCanvasPlaqueValueBrass, color: T.danger }
                : styles.inCanvasPlaqueValueBrass
            }
          >
            {formatMultiplier(tripPreviewBps)}
          </span>
        </div>
        <div style={styles.inCanvasPlaqueDivider} aria-hidden="true" />
        <div style={styles.inCanvasPlaqueRow}>
          <span style={styles.inCanvasPlaqueLabel}>CASH OUT AT</span>
          <span
            style={
              belowBreakeven
                ? { ...styles.inCanvasPlaqueValueBrass, color: T.danger }
                : styles.inCanvasPlaqueValueBrass
            }
          >
            {formatUsdc(potentialPayout)}
          </span>
        </div>
        <div style={styles.inCanvasPlaqueDivider} aria-hidden="true" />
        <div style={styles.inCanvasPlaqueRow}>
          <span style={styles.inCanvasPlaqueLabel}>CAUGHT</span>
          <span style={styles.inCanvasPlaqueValueBrass}>
            {state.tripCatches.length.toString().padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * InCanvasCashOutChest — Tim 2026-05-26 EMBEDDED HUD REBUILD.
 * Small wood-plaque chest at the stern-starboard (bottom-right), ~120px wide.
 * Wood ground, brass-stud border, cream labels, brass value.
 * Enabled: 1px cyan hairline outline (cyan job 3 — 4-cyan economy: legal on
 *   brass rim, NOT painted text on wood).
 * Disabled: brass-only border, dimmed opacity.
 * Carries the existing `oo-fisher-cash-out-trip` testid.
 */
function InCanvasCashOutChest({
  controller,
}: {
  readonly controller: OoFisherController
}): ReactElement {
  const { state } = controller
  const canCashOut = state.tripCatches.length > 0
  // HAUL preview = haul spread over the FULL trip (maxCasts), matching the
  // settle math + the top-right plaque. Divides by maxCasts (not casts-so-far)
  // so the CASH OUT value the player taps is the real, monotonic, never-drops
  // number — this is THE button, the old currentCastIndex divisor here was the
  // exact 3.1→1.3 bug the player saw.
  const tripPreviewBps = useMemo(() => {
    if (state.tripCatches.length === 0) return 0n
    let sum = 0n
    for (const c of state.tripCatches) {
      if (c.effectiveBps >= 0n) sum += c.effectiveBps
    }
    const raw = sum / BigInt(Math.max(1, state.maxCasts))
    const cap = 100_000n
    return raw > cap ? cap : raw
  }, [state.tripCatches, state.maxCasts])
  const potentialPayout = (state.wagerLamports * tripPreviewBps) / ONE_X_BPS
  return (
    <button
      type="button"
      onClick={controller.cashOutTrip}
      disabled={!canCashOut}
      style={canCashOut ? styles.inCanvasCashOutChest : styles.inCanvasCashOutChestDisabled}
      aria-label={`Cash out trip · ${formatUsdc(potentialPayout)}`}
      data-testid="oo-fisher-cash-out-trip"
    >
      <span style={styles.inCanvasCashOutChestEyebrow}>CASH OUT</span>
      <span
        style={
          canCashOut ? styles.inCanvasCashOutChestValue : styles.inCanvasCashOutChestValueDisabled
        }
      >
        {canCashOut ? formatUsdc(potentialPayout) : '·'}
      </span>
      <span style={styles.inCanvasCashOutChestHint}>
        {canCashOut ? 'open the chest' : 'catch first'}
      </span>
    </button>
  )
}

/**
 * InCanvasCastingControls — Tim 2026-05-26 EMBEDDED HUD REBUILD.
 * Small wood-plaque panel at the boat bow-center (bottom-center), ~140px wide.
 * Wood ground, brass-stud border, cream labels, brass power value.
 * The HOLD-TO-CAST button is a cyan interactive leaf (legal: separate surface
 *   from wood ground). The hex tap-and-hold remains the primary cast gesture;
 *   this panel is the accessible fallback that preserves testid contracts:
 *   `oo-fisher-action-bar-casting`, `oo-fisher-cast-button`, `oo-fisher-power-value`.
 */
function InCanvasCastingControls({
  controller,
}: {
  readonly controller: OoFisherController
}): ReactElement {
  const { state } = controller
  const canCashOut = state.tripCatches.length > 0
  const power = state.castPower
  const isHolding = power > 0
  return (
    <div
      style={styles.inCanvasCastingControls}
      data-testid="oo-fisher-action-bar-casting"
      aria-live="polite"
    >
      <div style={styles.inCanvasCastingHeader}>
        <span style={styles.inCanvasCastingEyebrow}>CASTING</span>
        <span style={styles.inCanvasCastingSub}>
          {isHolding
            ? 'release to launch the lure'
            : 'tap & hold a tile — or use the deck switch below'}
        </span>
      </div>
      <div style={styles.inCanvasCastingInfo}>
        <span style={styles.inCanvasCastingPowerLabel}>POWER</span>
        <span style={styles.inCanvasCastingPowerValue} data-testid="oo-fisher-power-value">
          {power.toString().padStart(2, '0')}
        </span>
        <span style={styles.inCanvasCastingMetaSep} aria-hidden="true">
          ·
        </span>
        <span style={styles.inCanvasCastingMeta}>
          {state.currentCastIndex + 1} / {state.maxCasts}
        </span>
      </div>
      <div style={styles.inCanvasCastingButtonRow}>
        <CastButton controller={controller} />
        {canCashOut && (
          <button
            type="button"
            onClick={controller.cashOutTrip}
            style={styles.inCanvasCastingCashOutLink}
            aria-label="Cash out the trip"
          >
            cash out · {state.tripCatches.length} caught
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Tim 2026-05-26 EMBEDDED HUD REBUILD — new in-canvas components ──────

/**
 * InCanvasLineOutPlacard — small wood-plaque at the bow showing LINE OUT
 * status. Replaces the below-canvas LineOutActionBar. The spinner cue moves
 * to a small brass needle that sweeps while the lure descends.
 * Carries the `oo-fisher-action-bar-line-out` testid.
 */
function InCanvasLineOutPlacard(): ReactElement {
  return (
    <div
      style={styles.inCanvasLineOutPlacard}
      aria-live="polite"
      data-testid="oo-fisher-action-bar-line-out"
    >
      <span style={styles.inCanvasSmallPlaqueEyebrow}>LINE OUT</span>
      <span style={styles.inCanvasSmallPlaqueValue}>
        <span style={styles.inCanvasBrassSpinnerWrap} aria-hidden="true">
          <span style={styles.inCanvasBrassSpinner} />
        </span>
      </span>
      <span style={styles.inCanvasSmallPlaqueSub}>lure descending</span>
    </div>
  )
}

/**
 * InCanvasFishOnPlacard — small wood-plaque at the bow showing FISH ON
 * status with a live countdown. Replaces the below-canvas FishOnActionBar
 * while preserving the `oo-fisher-action-bar-fish-on` and
 * `oo-fisher-fish-on-countdown` testid contracts.
 */
function InCanvasFishOnPlacard({
  fishOnStartedMs,
}: {
  readonly fishOnStartedMs: number | null
}): ReactElement {
  const [remainingMs, setRemainingMs] = useState(FISH_ON_WINDOW_MS)
  useEffect(() => {
    if (fishOnStartedMs === null) {
      setRemainingMs(FISH_ON_WINDOW_MS)
      return
    }
    const tick = (): void => {
      const elapsed = performance.now() - fishOnStartedMs
      const remaining = Math.max(0, FISH_ON_WINDOW_MS - elapsed)
      setRemainingMs(remaining)
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [fishOnStartedMs])
  const remainingSec = (Math.ceil(remainingMs / 100) / 10).toFixed(1)
  return (
    <div
      style={styles.inCanvasLineOutPlacard}
      aria-live="assertive"
      data-testid="oo-fisher-action-bar-fish-on"
    >
      <span style={styles.inCanvasSmallPlaqueEyebrow}>FISH ON</span>
      <span
        style={styles.inCanvasFishOnCountdown}
        data-testid="oo-fisher-fish-on-countdown"
        aria-label={`reeling in ${remainingSec} seconds`}
      >
        {remainingSec}s
      </span>
      <span style={styles.inCanvasSmallPlaqueSub}>reel in</span>
    </div>
  )
}

/**
 * InCanvasTransomBoard — slides up from the bottom edge of the canvas for
 * loss-adjacent sub-phases (JUNK / MISSED / SNAP) only. Holds for the
 * provider's auto-advance window then slides off.
 *
 * CAUGHT (all rarities) is routed to BigCatchHero (full-canvas, center)
 * since Tim 2026-05-26. This surface is informational only — no
 * celebratory register (RG-C1 compliance: zero juice on loss state).
 *
 * Visual grammar: wood-plaque chrome (warm cedar + brass-stud border).
 */
// Tim 2026-05-26 image 142 — fun loss-copy variants. Each loss outcome
// has 4 module-const flavor lines; the cast index picks one
// deterministically (`castIndex % N`). RG-C5 SAFE: every variant is the
// same visual+audio amplitude — only the words change. No tier/streak/
// session value alters which variant fires.
const MISS_HEADLINES = [
  'LINE CAME BACK EMPTY',
  'YOUR LINE GOT STUCK',
  'THE FISH WERE SLEEPING',
  'WIND CARRIED THE LURE',
] as const
const MISS_SUBLINES = [
  'no catch. cast burned. on to the next.',
  'snagged on a log. nothing biting. shake it off.',
  'not their hour. try a different depth.',
  'whiffed the rhythm. one less cast in the trip.',
] as const
const JUNK_HEADLINES = [
  'JUNK · ×0.30',
  'JUNK · ×0.30 BOOT HAUL',
  'JUNK · ×0.30 NOT THE PRIZE',
  'JUNK · ×0.30 SMALL FRY',
] as const
const JUNK_SUBLINES = [
  'boot · minnow · weed. on to the next.',
  'reeled up an old boot. on to the next.',
  'tin can full of nothing. on to the next.',
  'a minnow no one wants. on to the next.',
] as const
const SNAP_HEADLINES = [
  'LINE SNAPPED · ×0.00',
  'YOU FELL OFF THE BOAT · ×0.00',
  'ROD BROKE CLEAN · ×0.00',
  'FISH GOT AWAY · ×0.00',
] as const
const SNAP_SUBLINES = [
  'it fought back too hard. on to the next.',
  'lost your footing on the wet deck. shake it off.',
  'whatever that was, it was too much. on to the next.',
  'whole spool gone. one less story to tell.',
] as const

function pickVariant<T>(list: readonly T[], castIndex: number): T {
  const idx = ((castIndex % list.length) + list.length) % list.length
  return list[idx]!
}

function InCanvasTransomBoard({
  sub,
  castIndex,
}: {
  readonly sub: TripActiveSub
  readonly bait: GearTier
  readonly wagerLamports: bigint
  readonly maxCasts: number
  readonly castIndex: number
}): ReactElement {
  if (sub.kind !== 'junk-caught' && sub.kind !== 'missed' && sub.kind !== 'snap') {
    return <></>
  }

  if (sub.kind === 'junk-caught') {
    return (
      <div
        style={styles.inCanvasTransomBoard}
        data-testid="oo-fisher-action-bar-junk"
        aria-live="polite"
      >
        <div style={styles.transomTextStack}>
          <span style={styles.transomEyebrow}>{pickVariant(JUNK_HEADLINES, castIndex)}</span>
          <span style={styles.transomSub}>{pickVariant(JUNK_SUBLINES, castIndex)}</span>
        </div>
      </div>
    )
  }

  if (sub.kind === 'missed') {
    return (
      <div
        style={styles.inCanvasTransomBoard}
        data-testid="oo-fisher-action-bar-missed"
        aria-live="polite"
      >
        <div style={styles.transomTextStack}>
          <span style={styles.transomEyebrow}>{pickVariant(MISS_HEADLINES, castIndex)}</span>
          <span style={styles.transomSub}>{pickVariant(MISS_SUBLINES, castIndex)}</span>
        </div>
      </div>
    )
  }

  // snap
  return (
    <div
      style={styles.inCanvasTransomBoard}
      data-testid="oo-fisher-action-bar-snap"
      aria-live="polite"
    >
      <div style={styles.transomTextStack}>
        <span style={styles.transomEyebrow}>{pickVariant(SNAP_HEADLINES, castIndex)}</span>
        <span style={styles.transomSub}>{pickVariant(SNAP_SUBLINES, castIndex)}</span>
      </div>
    </div>
  )
}

/**
 * OoFisherFishSilhouette — small 2D SVG fish silhouette used on the transom
 * display board for CAUGHT readouts. Color-tinted by rarity (same SVG path,
 * only fill color changes — RG-C5 SAFE: no size escalation, no animation).
 */
function OoFisherFishSilhouette({
  color,
  size,
}: {
  readonly color: string
  readonly size: number
}): ReactElement {
  const h = Math.round(size * 0.6)
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 200 120"
      aria-hidden="true"
      style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
    >
      {/* Fish body */}
      <ellipse cx="90" cy="60" rx="68" ry="34" fill={color} opacity="0.90" />
      {/* Tail */}
      <polygon points="158,60 192,30 192,90" fill={color} opacity="0.82" />
      {/* Dorsal fin */}
      <polygon points="80,28 110,28 95,8" fill={color} opacity="0.68" />
      {/* Ventral fin */}
      <polygon points="80,92 110,92 95,112" fill={color} opacity="0.68" />
      {/* Eye */}
      <circle cx="46" cy="56" r="6" fill="#03070d" />
      <circle cx="44" cy="54" r="2" fill="#f4f6fa" />
      {/* Gill */}
      <path
        d="M 64 40 Q 60 60 64 80"
        fill="none"
        stroke="#03070d"
        strokeWidth="1.5"
        strokeOpacity="0.45"
      />
    </svg>
  )
}

// ─── Transient action bars ───────────────────────────────────────────────

function LineOutActionBar(): ReactElement {
  return (
    <div style={styles.actionBar} aria-live="polite" data-testid="oo-fisher-action-bar-line-out">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: T.accent }}>LINE OUT</span>
          <span style={styles.actionBarSub}>lure descending. watch the bobber</span>
        </div>
      </div>
      <div style={styles.actionBarRight}>
        <span style={styles.spinner} aria-hidden="true" />
      </div>
    </div>
  )
}

/**
 * FISH-ON action bar — bobber dip beat between the bite and the reeling
 * minigame. Renders a visible countdown so new players understand a new
 * surface is incoming (Tim playthrough 2026-05-23: the previous static
 * "reeling in 0.4s" copy gave no feedback that the timer was alive, which
 * compounded the soft-lock confusion).
 *
 * data-testid="oo-fisher-action-bar-fish-on" lets the auto-resolve
 * Playwright spec assert the bar mounts AND unmounts within the window.
 */
function FishOnActionBar({
  fishOnStartedMs,
}: {
  readonly fishOnStartedMs: number | null
}): ReactElement {
  // Live countdown — refresh at 10Hz, which is granular enough for a
  // tenths-of-a-second readout without burning frames.
  const [remainingMs, setRemainingMs] = useState(FISH_ON_WINDOW_MS)
  useEffect(() => {
    if (fishOnStartedMs === null) {
      setRemainingMs(FISH_ON_WINDOW_MS)
      return
    }
    const tick = (): void => {
      const elapsed = performance.now() - fishOnStartedMs
      const remaining = Math.max(0, FISH_ON_WINDOW_MS - elapsed)
      setRemainingMs(remaining)
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [fishOnStartedMs])

  const remainingSec = (Math.ceil(remainingMs / 100) / 10).toFixed(1)
  return (
    <div style={styles.actionBar} aria-live="assertive" data-testid="oo-fisher-action-bar-fish-on">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: T.accent }}>FISH ON</span>
          <span style={styles.actionBarSub}>
            bobber dipping. reeling in{' '}
            <span
              data-testid="oo-fisher-fish-on-countdown"
              style={{
                fontFamily: T.fontMono,
                color: T.accentSolid,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {remainingSec}s
            </span>
          </span>
        </div>
      </div>
      <div style={styles.actionBarRight}>
        <span style={styles.spinner} aria-hidden="true" />
      </div>
    </div>
  )
}

function CaughtActionBar({ rarity }: { readonly rarity: FishRarity }): ReactElement {
  const v = RARITY_VISUALS[rarity]
  return (
    <div style={styles.actionBar} aria-live="assertive" data-testid="oo-fisher-action-bar-caught">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: v.hex }}>
            CAUGHT · {v.label.toUpperCase()}
          </span>
          <span style={styles.actionBarSub}>
            you caught a {v.label.toLowerCase()} {colorName(rarity)}fin
          </span>
        </div>
      </div>
      <div style={styles.actionBarRight}>
        <span style={{ ...styles.fishBadge, color: v.hex, borderColor: v.hex }}>{v.label}</span>
      </div>
    </div>
  )
}

function MissedActionBar(): ReactElement {
  return (
    <div style={styles.actionBar} aria-live="polite" data-testid="oo-fisher-action-bar-missed">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: T.warning }}>LINE CAME BACK EMPTY</span>
          <span style={styles.actionBarSub}>no catch. cast burned. on to the next.</span>
        </div>
      </div>
    </div>
  )
}

// Tim 2026-05-24 Layer 1 — junk catch (boot / minnow / seaweed at ×0.30).
function JunkCaughtActionBar(): ReactElement {
  return (
    <div style={styles.actionBar} aria-live="polite" data-testid="oo-fisher-action-bar-junk">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: T.warning }}>JUNK · ×0.30</span>
          <span style={styles.actionBarSub}>
            boot · minnow · weed. small return, big lesson. on to the next.
          </span>
        </div>
      </div>
    </div>
  )
}

// Tim 2026-05-24 Layer 1 — line snap (fish fought back, broke the line).
function SnapActionBar(): ReactElement {
  return (
    <div style={styles.actionBar} aria-live="polite" data-testid="oo-fisher-action-bar-snap">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: T.danger }}>LINE SNAPPED · ×0.00</span>
          <span style={styles.actionBarSub}>
            it fought back too hard. cast burned. on to the next.
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── In-canvas clarity overlays (Tim playtest 2026-05-24) ─────────────────

/**
 * Depth-label rail — a vertical strip on the LEFT of the canvas listing
 * the 5 depth bands and which rarity tiers live at each. Helps a new
 * player understand the "deeper = rarer" rule without trial and error.
 *
 * The active band (the one the cast is currently aimed at, or the one
 * the player's boat-tier just opened) is highlighted in cyan. Bands
 * the boat can't reach are dimmed so the player understands the BOAT
 * upgrade unlocks deeper bands.
 *
 * RG-C5 SAFE: the rarity labels come from a MODULE CONSTANT
 * (DEPTH_RARITY_WEIGHTS via `depthRarityBand`), never from streak length.
 * The component never animates a "you almost got mythic!" pulse.
 */
function DepthLabelRail({
  boat,
  currentDepth,
  castPowerPreviewDepth,
}: {
  readonly boat: GearTier
  readonly currentDepth: DepthTier | null
  readonly castPowerPreviewDepth: DepthTier | null
}): ReactElement {
  const maxDepth = maxDepthByBoat(boat)
  const activeDepth = castPowerPreviewDepth ?? currentDepth
  // List from shallow (D-1) at top to deep (D-5) at bottom — matches the
  // visual ordering of the water canvas (sky on top, deep blue bottom).
  const rows: ReadonlyArray<DepthTier> = [1, 2, 3, 4, 5]
  return (
    <div
      style={styles.depthRail}
      data-testid="oo-fisher-depth-rail"
      aria-label="depth bands and rarity tiers"
    >
      <span style={styles.depthRailHeader}>DEPTH BANDS</span>
      {rows.map((d) => {
        const reachable = d <= maxDepth
        const isActive = activeDepth === d
        const band = depthRarityBand(d)
        const rowStyle: CSSProperties = {
          ...styles.depthRailRow,
          ...(isActive ? styles.depthRailRowActive : {}),
          ...(reachable ? {} : styles.depthRailRowLocked),
        }
        return (
          <div key={d} style={rowStyle}>
            <span style={isActive ? styles.depthRailLabelActive : styles.depthRailLabel}>
              {formatDepth(d)}
            </span>
            <span style={isActive ? styles.depthRailBandActive : styles.depthRailBand}>
              {reachable ? band : 'boat locked'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Cast-power preview — a chip at the bottom-center of the canvas that
 * shows the player WHICH DEPTH BAND their current power-charge is aimed
 * at, BEFORE they release. Tim playtest 2026-05-24: this is the
 * "before you release" affordance that was missing.
 */
function CastPowerPreview({
  power,
  boat,
}: {
  readonly power: number
  readonly boat: GearTier
}): ReactElement {
  const depth = castPowerToDepth(power, boat)
  const band = depthRarityBand(depth)
  return (
    <div style={styles.castPreview} data-testid="oo-fisher-cast-preview" aria-live="polite">
      <span style={styles.castPreviewEyebrow}>POWER {power.toString().padStart(2, '0')}</span>
      <span style={styles.castPreviewArrow}>→</span>
      <span style={styles.castPreviewDepth}>DEPTH {depth}</span>
      <span style={styles.castPreviewSep} aria-hidden="true">
        ·
      </span>
      <span style={styles.castPreviewBand}>expected: {band}</span>
    </div>
  )
}

/**
 * FISH-ON rarity reveal — a single line of glass copy across the canvas
 * during the fish-on beat. Communicates the stakes WITHOUT spoiling the
 * outcome (the catch still depends on tap rhythm). The rarity is
 * already deterministic at this point in the provider (server seed +
 * depth weights resolved), so this is the truth, not a hint.
 *
 * Note: at the moment the provider does NOT carry the resolved rarity
 * into the fish-on sub. To stay defensive (Domain B-style) and not
 * couple to provider internals, this overlay shows a generic
 * tier-aware prompt ("ready to reel"). When the provider exposes the
 * rarity, this can swap to the named tier. The instructional value of
 * "tap rhythmically inside the zone" is the load-bearing element.
 */
function FishOnRarityReveal(): ReactElement {
  return (
    <div style={styles.fishOnReveal} data-testid="oo-fisher-fish-on-reveal" aria-live="assertive">
      <span style={styles.fishOnRevealEyebrow}>FISH ON</span>
      <span style={styles.fishOnRevealLine}>tap rhythmically inside the green zone</span>
    </div>
  )
}

/**
 * Catch celebration — inline above the action bar (NOT a banner, per
 * Tim brand standard). Shows the rarity tier name + the per-catch
 * payout into the trip pot. Same shape regardless of rarity (RG-C5);
 * only color + numbers vary.
 */
function CatchCelebration({
  rarity,
  bait,
  wagerLamports,
  maxCasts,
}: {
  readonly rarity: FishRarity
  readonly bait: GearTier
  readonly wagerLamports: bigint
  readonly maxCasts: number
}): ReactElement {
  const v = RARITY_VISUALS[rarity]
  // The catch's per-cast contribution to the trip multiplier (BPS).
  // Divisor is `maxCasts` because the trip averages catch values across
  // all attempted casts (see `tripMultiplier`). This is the actual
  // BPS this single catch will inject into the final trip.mult.
  const perCatchBps = payoutForCatch(rarity, bait)
  const wagerContribution =
    maxCasts > 0 ? (wagerLamports * perCatchBps) / (ONE_X_BPS * BigInt(maxCasts)) : 0n
  // Multiplier label — round to ×N.N for display
  const multWhole = perCatchBps / ONE_X_BPS
  const multFrac = (perCatchBps % ONE_X_BPS) / 1000n
  const multLabel = `×${multWhole}.${multFrac}`
  return (
    <div
      style={{
        ...styles.catchCelebration,
        borderColor: v.hex,
        background: `rgba(${v.rgb}, 0.08)`,
      }}
      data-testid="oo-fisher-catch-celebration"
      aria-live="assertive"
    >
      <span style={{ ...styles.catchCelebrationEyebrow, color: v.hex }}>
        CAUGHT · {v.label.toUpperCase()} {colorName(rarity).toUpperCase()}FIN
      </span>
      <span style={styles.catchCelebrationDetail}>
        <span style={{ ...styles.catchCelebrationMult, color: v.hex }}>{multLabel}</span>
        <span style={styles.catchCelebrationSep} aria-hidden="true">
          ·
        </span>
        <span style={styles.catchCelebrationContrib}>
          +{formatUsdc(wagerContribution)} into trip pot
        </span>
      </span>
    </div>
  )
}

/**
 * Tim 2026-05-24 OO-FISHER playtest L6 — BIG CATCH HERO MOMENT.
 *
 * Full-canvas overlay shown when the player CATCHES a normal-tier fish.
 * Renders a large stylized fish silhouette (sized to tier — but the
 * MOTION and PARTICLE COUNT are RG-C5 module-const so only the COLOR
 * differs across rarities).
 *
 * Layout:
 *   - Backdrop scrim (dark, 78% opacity, dismissible on click)
 *   - Big fish silhouette (200-340px wide, scaled by rarity tier)
 *   - Rarity tier name in large hero typography ("EPIC TIGERFIN")
 *   - Multiplier hit (×8.0)
 *   - Wager contribution to trip pot
 *   - Particle burst (12 dots, identical count + animation across rarities)
 *
 * Duration: CATCH_HERO_DURATION_MS (1500ms) — provider auto-advances
 * after that window. The overlay auto-dismisses on click for accessibility.
 */
function BigCatchHero({
  rarity,
  bait,
  wagerLamports,
  maxCasts,
  celebrationColor = null,
}: {
  readonly rarity: FishRarity
  readonly bait: GearTier
  readonly wagerLamports: bigint
  readonly maxCasts: number
  /** Equipped celebration-skin color (null = classic rarity-tinted wash). */
  readonly celebrationColor?: string | null
}): ReactElement {
  const v = RARITY_VISUALS[rarity]
  const perCatchBps = payoutForCatch(rarity, bait)
  // What this catch ADDS to the trip haul (= its value spread over the trip's
  // casts), clamped to the 10× trip cap so the hero never promises more than
  // the haul can reach. 2 decimals to match the plaque exactly. jesse/autisk fix.
  const HAUL_CAP_BPS = 100_000n
  const haulDeltaRaw = maxCasts > 0 ? perCatchBps / BigInt(maxCasts) : perCatchBps
  const haulDeltaBps = haulDeltaRaw > HAUL_CAP_BPS ? HAUL_CAP_BPS : haulDeltaRaw
  const incWhole = haulDeltaBps / ONE_X_BPS
  const incFrac = ((haulDeltaBps % ONE_X_BPS) / 100n).toString().padStart(2, '0')
  const haulDeltaLabel = `+${incWhole}.${incFrac}×`

  // Fish silhouette size — module-const, identical across all rarities
  // (RG-C5 structural: same visual amplitude regardless of payout/streak;
  // only the color tint per `v.hex` differs). Tim 2026-05-26 taste-guardian
  // rejected the previous rarityIdx-scaled `fishSize` formula as visual
  // amplitude escalation.
  const CATCH_HERO_FISH_SIZE = 220

  return (
    <div
      style={styles.heroOverlay}
      data-testid="oo-fisher-big-catch-hero"
      role="dialog"
      aria-modal="false"
      aria-label={`You caught a ${v.label.toLowerCase()} ${colorName(rarity)}fin`}
    >
      <div
        style={{
          ...styles.heroBackdrop,
          // Celebration-skin: an equipped skin recolors the catch wash; classic
          // (null) keeps the rarity tint. The fish stays rarity-colored so the
          // rarity is still readable. EV-neutral cosmetic.
          background: celebrationColor
            ? `radial-gradient(ellipse 65% 55% at 50% 50%, ${celebrationColor}33, rgba(3, 7, 13, 0.85))`
            : `radial-gradient(ellipse 65% 55% at 50% 50%, rgba(${v.rgb}, 0.18), rgba(3, 7, 13, 0.85))`,
        }}
        aria-hidden="true"
      />
      {/* Particle emitter DELETED (Tim 2026-05-26 taste-guardian REJECT-1).
          The existing `oo-fisher-hero-fish` scale-bounce on the fish SVG
          (lines below) delivers the hit-stop kinetic confirmation. The
          rarity-tinted `drop-shadow` on the fish silhouette is the only
          per-rarity visual variable. */}
      {/* Big fish silhouette — module-const size, tinted with rarity color. */}
      <div style={styles.heroFishWrap}>
        <svg
          width={CATCH_HERO_FISH_SIZE}
          height={CATCH_HERO_FISH_SIZE * 0.6}
          viewBox="0 0 200 120"
          style={{
            filter: `drop-shadow(0 0 24px ${v.hex})`,
          }}
          aria-hidden="true"
        >
          {/* Fish body — elongated ellipse */}
          <ellipse cx="90" cy="60" rx="68" ry="34" fill={v.hex} opacity="0.92" />
          {/* Fish tail — triangle on the right (downstream) */}
          <polygon points="158,60 192,30 192,90" fill={v.hex} opacity="0.85" />
          {/* Top fin */}
          <polygon points="80,28 110,28 95,8" fill={v.hex} opacity="0.7" />
          {/* Bottom fin */}
          <polygon points="80,92 110,92 95,112" fill={v.hex} opacity="0.7" />
          {/* Eye — bright dot */}
          <circle cx="46" cy="56" r="6" fill="#03070d" />
          <circle cx="44" cy="54" r="2" fill="#f4f6fa" />
          {/* Gill stripe */}
          <path
            d="M 64 40 Q 60 60 64 80"
            fill="none"
            stroke="#03070d"
            strokeWidth="1.5"
            strokeOpacity="0.5"
          />
        </svg>
      </div>
      {/* Hero typography stack */}
      <div style={styles.heroLabelStack}>
        <span style={styles.heroEyebrow}>CAUGHT</span>
        <span style={{ ...styles.heroTitle, color: v.hex }}>
          {v.label.toUpperCase()} {colorName(rarity).toUpperCase()}FIN
        </span>
        <div style={styles.heroNumberRow}>
          <span style={{ ...styles.heroMult, color: v.hex }}>{haulDeltaLabel}</span>
          <span style={styles.heroContrib}>&nbsp;added to your haul</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Miss feedback — calm 600ms educational message. Tells the player WHY
 * they missed without escalating the loss. RG-C5 SAFE.
 */
function MissFeedback(): ReactElement {
  return (
    <div style={styles.missFeedback} data-testid="oo-fisher-miss-feedback" aria-live="polite">
      <span style={styles.missFeedbackEyebrow}>FISH ESCAPED</span>
      <span style={styles.missFeedbackHint}>tap rhythmically next time. too slow let it go</span>
    </div>
  )
}

function BetweenCastsActionBar({
  controller,
}: {
  readonly controller: OoFisherController
}): ReactElement {
  const { state } = controller
  const canCashOut = state.tripCatches.length > 0
  // testID used by the Playwright spec to assert this surface is reachable.
  // Live trip multiplier preview — uses per-cast effectiveBps so JUNK
  // (0.30×) + SNAP (0.00×) entries flow through the formula correctly.
  const tripPreviewBps = useMemo(() => {
    if (state.tripCatches.length === 0) return 0n
    let sum = 0n
    for (const c of state.tripCatches) {
      if (c.effectiveBps >= 0n) sum += c.effectiveBps
    }
    const raw = sum / BigInt(Math.max(1, state.maxCasts)) // maxCasts → only rises
    const cap = 100_000n
    return raw > cap ? cap : raw
  }, [state.tripCatches, state.maxCasts])
  const potentialPayout = (state.wagerLamports * tripPreviewBps) / ONE_X_BPS
  return (
    <div style={styles.actionBar} data-testid="oo-fisher-action-bar-between-casts">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={{ ...styles.actionBarEyebrow, color: T.accent }}>BETWEEN CASTS</span>
          <span style={styles.actionBarSub}>cast again or lock in the trip</span>
        </div>
        <div style={styles.actionBarInfo}>
          <Stat
            label="Trip mult"
            value={formatMultiplier(tripPreviewBps)}
            emphasis
            valueColor={T.accent}
          />
          <Stat label="Cash out at" value={formatUsdc(potentialPayout)} valueColor={T.accent} />
          <Stat label="Caught" value={state.tripCatches.length.toString().padStart(2, '0')} />
        </div>
      </div>
      <div style={styles.actionBarRight}>
        <CastButton controller={controller} />
        <button
          type="button"
          onClick={controller.cashOutTrip}
          disabled={!canCashOut}
          style={canCashOut ? styles.cashOutTripButton : styles.cashOutTripButtonDisabled}
          aria-label={`Cash out trip · ${formatUsdc(potentialPayout)}`}
          data-testid="oo-fisher-cash-out-trip"
        >
          cash out trip
        </button>
      </div>
    </div>
  )
}

// ─── Settlement ──────────────────────────────────────────────────────────

function TripSettlement({
  controller,
  outcome,
}: {
  readonly controller: OoFisherController
  readonly outcome: TripOutcome
}): ReactElement {
  const { state } = controller
  const won = outcome.netLamports >= 0n
  const deltaLamports = outcome.netLamports < 0n ? -outcome.netLamports : outcome.netLamports
  const deltaSign = won ? '+' : '-'
  const pointsEarned = pointsForBet(outcome.wagerLamports, won)
  const pointsMultLabel = won ? '1.0x on the win' : '1.5x loss-amplified'
  // STASH earned this trip = sum of every catch's gear-credit (jesse fix: make
  // the meta-fuel's earning path visible at settle).
  const stashEarned = outcome.catches.reduce((sum, c) => sum + c.currencyLamports, 0n)
  const insufficient = state.wagerLamports > state.balanceLamports
  const [expanded, setExpanded] = useState(false)
  // Tim 2026-05-26 image 133 — narrative settlement headline. Module-const
  // thresholds + identical visual amplitude regardless of outcome. RG-C5
  // SAFE: the threshold buckets are FIXED set membership, not a curve.
  const narrative = settlementNarrative(outcome.tripMultiplierBps, won)
  return (
    <div style={styles.tripSettledCard} aria-live="polite">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={styles.tripSettledEyebrow}>{won ? 'TRIP LANDED' : 'TRIP CLOSED'}</span>
          <span style={styles.tripSettledHeadline}>{narrative}</span>
          <span style={styles.tripSettledSub}>
            {outcome.castsLanded} of {outcome.castsAttempted} casts caught a fish
          </span>
        </div>
        <div style={styles.actionBarInfo}>
          {/* Multiplier is brass-on-wood for wins (engraved-brass register),
              danger-coral for losses (semantic signal). RG-C5: amplitude is
              identical regardless of multiplier magnitude — only color shifts
              with binary won/lost. */}
          <span style={{ ...styles.actionBarMultiplier, color: won ? '#ffd27a' : T.danger }}>
            {formatMultiplier(outcome.tripMultiplierBps)}
          </span>
          <span style={{ ...styles.actionBarDelta, color: won ? '#ffd27a' : T.danger }}>
            {deltaSign}
            {formatUsdc(deltaLamports)}
          </span>
        </div>
        <p style={styles.actionBarFootnote}>
          <span style={styles.settledPointsValue}>+{formatPoints(pointsEarned)}</span>
          <span style={styles.settledPointsLabel}>ownership points</span>
          <span style={styles.settledPointsMult}>· {pointsMultLabel}</span>
          {stashEarned > 0n && (
            <span style={{ ...styles.settledPointsMult, color: '#ffd27a' }}>
              · +{formatScales(stashEarned)} scales (gear stash)
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={styles.settledVerifyToggle}
            aria-expanded={expanded}
          >
            {expanded ? 'hide receipt ↑' : 'view receipt ↓'}
          </button>
        </p>
      </div>
      <div style={styles.actionBarRight}>
        {/* Inline next-trip wager editor (Pulse-style) — set the stake right
            here, no detour back to the full bet-entry screen. */}
        <div style={styles.settledWagerAdjust}>
          <span style={styles.settledWagerAdjustLabel}>NEXT TRIP WAGER</span>
          <div style={styles.settledPresetRow}>
            {WAGER_PRESETS.map((p) => {
              const active = state.wagerLamports === p.value
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => controller.setWager(p.value)}
                  style={active ? styles.settledPresetChipActive : styles.settledPresetChip}
                  aria-label={`Set next wager to ${p.label} USDC`}
                  aria-pressed={active}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <div style={styles.settledWagerStepper}>
            <button
              type="button"
              onClick={() => controller.setWager(stepWagerDown(state.wagerLamports))}
              style={styles.wagerStepBtn}
              aria-label="Decrease next wager"
            >
              −
            </button>
            <AnimatedUsdc lamports={state.wagerLamports} style={styles.settledWagerValue} />
            <button
              type="button"
              onClick={() => controller.setWager(stepWagerUp(state.wagerLamports))}
              style={styles.wagerStepBtn}
              aria-label="Increase next wager"
            >
              +
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            controller.startTrip().catch(() => undefined)
          }}
          disabled={insufficient}
          style={insufficient ? styles.settledBetAgainDisabled : styles.settledBetAgain}
          aria-label={`Start a new trip, wager ${formatUsdc(state.wagerLamports)}`}
        >
          another trip →
        </button>
        {/* "change wager" detour removed (Pulse parity) — the wager is now fully
            editable inline above (presets + stepper), so the only remaining
            secondary action is gear upgrades. */}
        <div style={styles.settledSecondaryActions}>
          <button
            type="button"
            onClick={controller.openUpgradeModal}
            style={styles.settledUpgradeLink}
          >
            upgrade gear ↗
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ ...styles.settledReceipt, gridColumn: '1 / -1' }}>
          <p style={styles.settledReceiptSummary}>
            derived from <code style={styles.settlementHex}>{shortHex(outcome.serverSeedHex)}</code>{' '}
            seed + <code style={styles.settlementHex}>{shortHex(outcome.serverSeedHashHex)}</code>{' '}
            commitment
          </p>
          <dl style={styles.settlementReceiptRows}>
            <Row label="trip id" value={outcome.tripIdHex} />
            <Row label="server seed hash" value={outcome.serverSeedHashHex} />
            <Row label="server seed" value={outcome.serverSeedHex} />
            <Row label="mixer" value={outcome.mixerHex} />
            <Row
              label="loadout"
              value={`${formatTier(outcome.loadout.rod)} rod · ${formatTier(outcome.loadout.boat)} boat · ${formatTier(outcome.loadout.bait)} bait`}
            />
            <Row
              label="casts"
              value={`${outcome.castsLanded} of ${outcome.castsAttempted} landed`}
            />
            <Row label="trip mult" value={formatMultiplier(outcome.tripMultiplierBps)} />
            <Row label="payout" value={formatUsdc(outcome.payoutLamports)} />
          </dl>
          {/* Catch log */}
          <div style={styles.catchLogBlock}>
            <span style={styles.catchLogHeader}>CATCH LOG</span>
            <div style={styles.catchLogRows}>
              {outcome.catches.map((c, i) => {
                // Tim 2026-05-24 Layer 1: junk + snap entries reuse the
                // 'common' rarity placeholder. Distinguish them in the
                // receipt with labels + colors that match the action-bar
                // copy. Normal entries use the rarity color from
                // RARITY_VISUALS.
                let label: string
                let color: string
                if (c.result === 'junk') {
                  label = 'JUNK'
                  color = T.warning
                } else if (c.result === 'snap') {
                  label = 'SNAP'
                  color = T.danger
                } else {
                  const v = RARITY_VISUALS[c.rarity]
                  label = v.label
                  color = v.hex
                }
                return (
                  <div key={i} style={styles.catchLogRow}>
                    <span style={{ ...styles.catchLogRarity, color, borderColor: color }}>
                      {label}
                    </span>
                    <span style={styles.catchLogMeta}>
                      cast {c.castIndex + 1} · {formatDepth(c.depth)}
                    </span>
                    <span style={styles.catchLogSeed}>
                      <code>0x{c.castSeedHex}</code>
                    </span>
                  </div>
                )
              })}
              {outcome.catches.length === 0 && (
                <span style={styles.catchLogEmpty}>no fish landed this trip. skunked</span>
              )}
            </div>
          </div>
        </div>
      )}
      {insufficient && (
        <span style={{ ...styles.settlementHelp, gridColumn: '1 / -1' }}>
          balance below {formatUsdc(state.wagerLamports)}. Lower your wager to continue.
        </span>
      )}
    </div>
  )
}

// ─── Glass Box receipt (auto-verify on settled) ──────────────────────────
//
// Parity with oo-burst / oo-spike / oo-tile / oo-climb / oo-bloom: the
// moment the trip settles, re-derive the per-cast seed chain from the
// published server seed and compare against the recorded `castSeedHex`
// values bit-for-bit. No click required — the proof "is right there" in
// the action bar. The receipt drawer expands inline (NOT a modal — Tim's
// brand standard).
function GlassBoxReceipt({
  controller,
}: {
  readonly controller: OoFisherController
}): ReactElement {
  const { state } = controller
  const [verified, setVerified] = useState<ReadonlyArray<string> | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const outcome = state.phase.kind === 'trip-settled' ? state.phase.outcome : null

  useEffect(() => {
    if (!outcome) {
      setVerified(null)
      setExpanded(false)
      return
    }
    let cancelled = false
    setVerifying(true)
    setVerified(null)
    controller
      .reverifyCastSeeds(outcome.serverSeedHex, outcome.castsAttempted)
      .then((seq) => {
        if (!cancelled) setVerified(seq)
      })
      .catch(() => {
        if (!cancelled) setVerified(null)
      })
      .finally(() => {
        if (!cancelled) setVerifying(false)
      })
    return () => {
      cancelled = true
    }
  }, [outcome, controller])

  if (!outcome) return <></>

  // Match the recorded cast seed for every catch against the re-derived
  // sequence. The recorded `castSeedHex` is `raw.toString(16).padStart(8,
  // '0')` (8 chars). Every catch must align with the seed at its
  // `castIndex` for the chain to verify.
  const matches =
    verified !== null && outcome.catches.every((c) => verified[c.castIndex] === c.castSeedHex)

  return (
    <div style={styles.glassBox} aria-label="Glass Box receipt">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={styles.glassBoxToggle}
        data-testid="oo-fisher-glass-box-toggle"
      >
        <span style={styles.glassBoxToggleLabel}>
          {verifying
            ? 'verifying…'
            : matches
              ? '✓ glass box verified'
              : verified !== null
                ? '⚠ verification mismatch'
                : 'glass box'}
        </span>
        <span style={styles.glassBoxToggleHint}>
          {expanded ? 'hide receipt ↑' : 'view receipt ↓'}
        </span>
      </button>
      {expanded && (
        <div style={styles.glassBoxBody}>
          <p style={styles.glassBoxSummary}>
            cast seeds derived from{' '}
            <code style={styles.glassBoxHex}>{shortHex(outcome.serverSeedHex)}</code> server seed +{' '}
            <code style={styles.glassBoxHex}>{shortHex(outcome.serverSeedHashHex)}</code> commitment
          </p>
          <div style={styles.glassBoxSection}>
            <span style={styles.glassBoxSectionLabel}>CAST SEED CHAIN</span>
            <div style={styles.sequenceRow}>
              {outcome.catches.length === 0 ? (
                <span style={styles.sequenceEmpty}>no fish landed this trip</span>
              ) : (
                outcome.catches.map((c) => {
                  const expected = verified?.[c.castIndex] ?? null
                  const ok = expected !== null && expected === c.castSeedHex
                  return (
                    <span
                      key={c.castIndex}
                      style={ok ? styles.castSeedChipOk : styles.castSeedChipMiss}
                      title={
                        ok
                          ? `cast ${c.castIndex + 1} · seed ${c.castSeedHex} verified`
                          : `cast ${c.castIndex + 1} · seed ${c.castSeedHex} mismatch`
                      }
                    >
                      #{c.castIndex + 1} · 0x{c.castSeedHex.slice(0, 4)}
                    </span>
                  )
                })
              )}
            </div>
          </div>
          <dl style={styles.receiptRowsGrid}>
            <Row label="trip id" value={outcome.tripIdHex} />
            <Row label="server seed hash" value={outcome.serverSeedHashHex} />
            <Row label="server seed" value={outcome.serverSeedHex} />
            <Row label="mixer" value={outcome.mixerHex} />
            <Row
              label="loadout"
              value={`${formatTier(outcome.loadout.rod)} rod · ${formatTier(outcome.loadout.boat)} boat · ${formatTier(outcome.loadout.bait)} bait`}
            />
            <Row
              label="casts"
              value={`${outcome.castsLanded} of ${outcome.castsAttempted} landed`}
            />
            <Row label="trip mult" value={formatMultiplier(outcome.tripMultiplierBps)} />
            <Row label="payout" value={formatUsdc(outcome.payoutLamports)} />
          </dl>
        </div>
      )}
    </div>
  )
}

// ─── History strip ────────────────────────────────────────────────────────

function HistoryStrip({
  rows,
}: {
  readonly rows: ReadonlyArray<{ tripMultiplierBps: bigint; netLamports: bigint }>
}): ReactElement {
  if (rows.length === 0) return <></>
  const visible = rows.slice(0, 14)
  return (
    <div style={styles.historyStrip} aria-label="recent trips">
      <span style={styles.historyLabel}>recent</span>
      {visible.map((r, i) => {
        const won = r.netLamports >= 0n
        const ageAlpha = 1 - (i / Math.max(1, visible.length)) * 0.5
        const accentTint = `rgba(0, 240, 255, ${0.18 * ageAlpha})`
        const accentBorder = `rgba(0, 240, 255, ${0.32 * ageAlpha})`
        const lossTint = `rgba(255, 255, 255, ${0.04 * ageAlpha})`
        return (
          <span
            key={i}
            style={{
              ...styles.historyChip,
              background: won ? accentTint : lossTint,
              color: won ? T.accent : T.textMuted,
              borderColor: won ? accentBorder : T.borderSubtle,
              opacity: ageAlpha,
            }}
            title={
              won
                ? `trip ${formatMultiplier(r.tripMultiplierBps)}`
                : `trip closed ${formatMultiplier(r.tripMultiplierBps)}`
            }
          >
            {i === 0 && <span style={styles.historyTick} aria-label="most recent" />}
            {formatMultiplier(r.tripMultiplierBps)}
          </span>
        )
      })}
    </div>
  )
}

// ─── Small primitives ────────────────────────────────────────────────────

function Row({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
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

function Stat({
  label,
  value,
  valueColor,
  emphasis,
  testId,
}: {
  readonly label: string
  readonly value: string
  readonly valueColor?: string
  readonly emphasis?: boolean
  readonly testId?: string
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
        data-testid={testId}
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
  testId,
}: {
  readonly onClick: () => void
  readonly disabled?: boolean
  readonly children: React.ReactNode
  readonly testId?: string
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={disabled ? styles.primaryButtonDisabled : styles.primaryButton}
      data-testid={testId}
    >
      {children}
    </button>
  )
}

function SecondaryButton({
  onClick,
  children,
}: {
  readonly onClick: () => void
  readonly children: React.ReactNode
}): ReactElement {
  return (
    <button type="button" onClick={onClick} style={styles.secondaryButton}>
      {children}
    </button>
  )
}

function shortHex(hex: string): string {
  if (hex.length <= 22) return hex
  return `${hex.slice(0, 10)}…${hex.slice(-10)}`
}

function colorName(rarity: FishRarity): string {
  switch (rarity) {
    case 'common':
      return 'silver'
    case 'uncommon':
      return 'cyan'
    case 'rare':
      return 'mint'
    case 'epic':
      return 'violet'
    case 'legendary':
      return 'amber'
    case 'mythic':
      return 'coral'
  }
}

// ─── Keyframes + spinner ─────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes oo-fisher-card-enter {
  0%   { opacity: 0; transform: translate3d(0, 6px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0,   0); }
}
@keyframes oo-fisher-live-heartbeat {
  0%, 100% { transform: scale(1);   opacity: 1;   }
  50%      { transform: scale(1.4); opacity: 0.55; }
}
@keyframes oo-fisher-spin {
  to { transform: rotate(360deg); }
}
/* L6 BIG CATCH HERO animations — RG-C5 SAFE: timings + counts are module-const */
@keyframes oo-fisher-hero-enter {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes oo-fisher-hero-fish {
  0%   { opacity: 0; transform: scale(0.65); }
  50%  { opacity: 1; transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1.0); }
}
@keyframes oo-fisher-hero-label {
  0%   { opacity: 0; transform: translate3d(0, 12px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
/* oo-fisher-hero-particle keyframe DELETED — Tim 2026-05-26 taste-guardian
   REJECT-1: particle emitter banned. Hit-stop on oo-fisher-hero-fish
   scale-bounce remains as the kinetic catch confirmation. */
/* Tim 2026-05-26 EMBEDDED HUD REBUILD — transom board slide-in.
   Module-const 180ms — RG-C5 SAFE: identical timing for CAUGHT/JUNK/MISSED/SNAP.
   Slides up from y=100% to y=0. Only transform + opacity animated (layout ban). */
@keyframes oo-fisher-transom-enter {
  0%   { opacity: 0; transform: translateX(-50%) translateY(20px); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0); }
}
/* IN-CANVAS HUD MIGRATION (Tim 2026-05-25). Module-const timing — RG-C5 SAFE.
   tap-hold-pulse: soft cyan halo breathing 3000ms loop (NEVER escalated per
   streak / per cash-out value). ghost-prompt-enter: 320ms fade-up on first
   appearance only (dismissed on click or 6s auto). */
@keyframes oo-fisher-tap-hold-pulse {
  0%, 100% { transform: translateX(-50%) scale(1.0); opacity: 0.55; }
  50%      { transform: translateX(-50%) scale(1.08); opacity: 1.0; }
}
@keyframes oo-fisher-ghost-prompt-enter {
  0%   { opacity: 0; transform: translateX(-50%) translateY(8px); }
  100% { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes oo-fisher-upgrade-achieve {
  0%   { opacity: 0; transform: scale(0.94); }
  18%  { opacity: 1; transform: scale(1.04); }
  35%  { transform: scale(1.0); }
  82%  { opacity: 1; transform: scale(1.0); }
  100% { opacity: 0; transform: scale(0.98); }
}
.oo-fisher-wager-input::-webkit-outer-spin-button,
.oo-fisher-wager-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.oo-fisher-wager-input {
  appearance: textfield;
}
.oo-fisher-wager-input::selection {
  background: rgba(0, 240, 255, 0.30);
  color: #ffffff;
}
.oo-fisher-wager-input:focus {
  outline: none;
}
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
@media (prefers-reduced-motion: reduce) {
  .oo-fisher-card-enter { animation: none; }
}
@media (prefers-reduced-motion: reduce) {
  /* Tim 2026-05-26 EMBEDDED HUD REBUILD — transom board + ghost prompt
     reduced-motion fallback: disable slide-in animations. The boards
     appear instantly (no transform/opacity transition). */
  * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
`

// ─── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: T.fontBody,
    color: T.textPrimary,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    // FIX 2 (2026-05-26): page fills the viewport so roundCard + canvasShell
    // can flex upward to fill the remaining height. On mobile this uses
    // 100dvh (dynamic viewport height) to account for browser chrome.
    minHeight: '100dvh',
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
    animation: 'oo-fisher-live-heartbeat 1.6s ease-in-out infinite',
  },
  stashBadge: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  stashValue: {
    fontFamily: T.fontMono,
    color: '#ffd27a', // canonical brass (was T.warning #f5c25b — mismatched the rest)
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.10em',
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
  // Tim 2026-05-26 taste-guardian REJECT-3: deleted ambient cyan radial
  // gradients on the roundCard background. The 4-cyan-economy is reserved
  // for named jobs (header separator, leading anchor, featured chip, CTA
  // rim). A background card ambient glow is not one of them.
  //
  // FIX 2 (2026-05-26): roundCard is now a flex column that fills the
  // available viewport height. The page is `100dvh - headerHeight` which
  // the outer layout handles; the roundCard fills whatever remains in
  // normal document flow. canvasShell uses `flex: 1; min-height: 0` so
  // the 3D scene div can fill upward rather than being constrained to 480px.
  roundCard: {
    position: 'relative',
    background: 'linear-gradient(180deg, #050b13, #03070d)',
    border: `1px solid ${T.borderDefault}`,
    borderRadius: 18,
    padding: 20,
    isolation: 'isolate',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    // Fill remaining viewport: the `page` flex container (flex-direction: column)
    // gives roundCard all the remaining space after the header tape and gaps.
    flex: 1,
    minHeight: 340,
  },
  canvasShell: {
    // Tim 2026-05-26 (image 123 root-cause v4): definite CSS-only height
    // via calc(). R3F's useMeasure returns 0 at mount inside flex parents
    // before layout settles → WebGL locks at fallback size → CSS gradient
    // bleeds through. Definite calc() height bypasses flex-timing entirely.
    position: 'relative',
    height: 'calc(100dvh - 204px)',
    minHeight: 480,
    width: '100%',
    // Tim 2026-05-26 image 141 follow-up: tap-and-hold on desktop kept
    // auto-selecting the wood-plaque copy because every pointerdown on
    // a non-input element triggers a drag-select on the nearest text.
    // Suppress at the canvas-shell level so the WHOLE game area is
    // unselectable; interactive children (buttons, inputs) inherit-back
    // via `user-select: auto` where needed.
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  },
  // Tim 2026-05-25 IN-CANVAS HUD pivot: the corner status card is now
  // themed as a WOODEN PLAQUE with a brass-stud border, evoking the
  // boat's gunwale carpentry. Same in-scene position (top-right) but
  // wrapped in river/boat register: warm wood grain background,
  // brass-colored value text, rope-twist top edge. POWER / CATCHES /
  // CASTS LEFT still read as compact metrics — just themed, not
  // restyled as generic UI chips. Per Tim's pivot: "all the game
  // controls should be inside the game hud, in the style of the game."
  // Tim 2026-05-26 image 143 — mobile HUD sizing: bumped padding + base
  // font sizes so the corner plaque fills mobile viewports proportionally.
  // Desktop reads only slightly bigger; mobile reads correctly.
  cornerStatusCard: {
    position: 'absolute',
    top: 16,
    right: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    padding: '14px 22px',
    // Wood grain via layered linear gradients — warm cedar tones with
    // diagonal grain stripes, then a darker shadow band at the bottom
    // for the "plaque hanging on rope" cue.
    background:
      'linear-gradient(180deg, rgba(140, 92, 52, 0.94) 0%, rgba(108, 70, 40, 0.94) 50%, rgba(86, 54, 30, 0.94) 100%),' +
      ' repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 7px)',
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    // Brass-studded border: amber outer + dark inner rim for raised feel.
    border: '2px solid #d4a04a',
    boxShadow:
      '0 12px 28px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 222, 158, 0.45), inset 0 -2px 4px rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    pointerEvents: 'none',
    zIndex: 5,
  },
  cornerStatusRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
  },
  cornerStatusLabel: {
    fontFamily: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.20em',
    textTransform: 'uppercase',
    color: 'rgba(255, 232, 188, 0.82)',
    lineHeight: 1.2,
  },
  cornerStatusValue: {
    fontFamily: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '0.06em',
    // Brass-amber value text — engraved-on-wood look. The text-shadow
    // is the "etched" cue.
    color: '#ffd27a',
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
    lineHeight: 1.0,
  },
  cornerStatusDivider: {
    width: 2,
    height: 28,
    // Brass-stud divider matches the border palette.
    background:
      'linear-gradient(180deg, rgba(212, 160, 74, 0.0), rgba(212, 160, 74, 0.55), rgba(212, 160, 74, 0.0))',
  },
  // ─── Depth-label rail (Layer 2, Tim 2026-05-24) ──────────────────────
  // Vertical strip on the left side of the canvas. Sticks under the
  // corner status card. Pointer-events disabled so it never blocks tile
  // clicks. Module-const styling — no per-tier or per-rarity escalation.
  depthRail: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 240,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '14px 18px',
    background: 'rgba(3, 7, 13, 0.55)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.10)',
    borderRadius: 12,
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
    pointerEvents: 'none',
    zIndex: 5,
  },
  depthRailHeader: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.55)',
    marginBottom: 6,
  },
  depthRailRow: {
    display: 'grid',
    gridTemplateColumns: '40px 1fr',
    alignItems: 'baseline',
    columnGap: 8,
    padding: '4px 6px',
    borderRadius: 6,
    background: 'transparent',
    transition: 'background 120ms ease-out',
  },
  // Tim 2026-05-26 taste-guardian REJECT-3: depth-rail active row tint
  // migrated cyan → brass. Cyan reserved for the 4 declared economy jobs
  // (header separator / LIVE pill / leading anchor / CTA rim). The active
  // depth band is a thematic boat-instrument signal, brass-tinted.
  depthRailRowActive: {
    background: 'rgba(212, 160, 74, 0.18)',
  },
  depthRailRowLocked: {
    opacity: 0.35,
  },
  depthRailLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.10em',
    color: 'rgba(255, 255, 255, 0.60)',
    fontVariantNumeric: 'tabular-nums',
  },
  depthRailLabelActive: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.10em',
    // Tim 2026-05-26 taste-guardian REJECT-3: brass label, not cyan.
    color: '#ffd27a',
    fontVariantNumeric: 'tabular-nums',
  },
  depthRailBand: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: 'rgba(255, 255, 255, 0.55)',
  },
  depthRailBandActive: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: '#f4f6fa',
  },
  // ─── Cast-power preview chip (Layer 2) ───────────────────────────────
  castPreview: {
    position: 'absolute',
    bottom: 18,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '10px 16px',
    background: 'rgba(3, 7, 13, 0.70)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: `1px solid ${T.accentMuted}`,
    borderRadius: 10,
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
    pointerEvents: 'none',
    zIndex: 6,
    fontFamily: T.fontMono,
  },
  castPreviewEyebrow: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.20em',
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.62)',
    fontVariantNumeric: 'tabular-nums',
  },
  castPreviewArrow: {
    fontSize: 12,
    color: T.accent,
    fontWeight: 700,
  },
  castPreviewDepth: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.accentSolid,
  },
  castPreviewSep: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.40)',
  },
  castPreviewBand: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: 'rgba(255, 255, 255, 0.78)',
    textTransform: 'lowercase',
  },
  // ─── FISH-ON rarity reveal banner (Layer 2) ──────────────────────────
  // Wood-themed FISH ON badge — warm cedar plaque with brass border + cream
  // copy, matching the rest of the in-canvas HUD grammar. Tim 2026-05-26
  // image 130: was dark glass + cyan, violated cohesion.
  fishOnReveal: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '14px 22px',
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: woodPlaqueBorder,
    borderRadius: 12,
    boxShadow: woodPlaqueBoxShadow,
    pointerEvents: 'none',
    zIndex: 7,
  },
  fishOnRevealEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.30em',
    textTransform: 'uppercase',
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
  },
  fishOnRevealLine: {
    fontFamily: T.fontBody,
    fontSize: 12,
    fontWeight: 600,
    color: PLAQUE_LABEL_COLOR,
  },
  // ─── Catch celebration (Layer 2 - inline above action bar) ───────────
  catchCelebration: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '16px 24px',
    background: 'rgba(3, 7, 13, 0.78)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid',
    borderRadius: 14,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
    pointerEvents: 'none',
    zIndex: 8,
    minWidth: 260,
  },
  catchCelebrationEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.26em',
    textTransform: 'uppercase',
  },
  catchCelebrationDetail: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  catchCelebrationMult: {
    fontFamily: T.fontMono,
    fontSize: 20,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  catchCelebrationSep: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.40)',
  },
  catchCelebrationContrib: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: '0.04em',
  },
  // ─── Miss feedback (Layer 3) ─────────────────────────────────────────
  missFeedback: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '14px 22px',
    background: 'rgba(3, 7, 13, 0.78)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: `1px solid ${T.borderDefault}`,
    borderRadius: 12,
    boxShadow: '0 14px 40px rgba(0, 0, 0, 0.50)',
    pointerEvents: 'none',
    zIndex: 7,
  },
  missFeedbackEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    color: T.warning,
  },
  missFeedbackHint: {
    fontFamily: T.fontBody,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.62)',
    fontStyle: 'italic',
  },
  // ─── L6: BIG CATCH HERO (Tim 2026-05-24 "moment to live") ────────────
  // Full-canvas overlay with fish silhouette + tier name + multiplier.
  // RG-C5 SAFE: timings + particle count are module-const, only colors
  // differ per rarity.
  heroOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 12,
    animation: 'oo-fisher-hero-enter 280ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
  },
  heroBackdrop: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  // heroParticleField + heroParticle DELETED — Tim 2026-05-26 taste-guardian
  // REJECT-1: particle emitter banned. Hit-stop on heroFishWrap scale-bounce
  // is the only kinetic catch confirmation.
  heroFishWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'oo-fisher-hero-fish 1100ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
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
    animation: 'oo-fisher-hero-label 700ms cubic-bezier(0.2, 0.8, 0.2, 1) 180ms both',
  },
  heroEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.36em',
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.72)',
  },
  heroTitle: {
    fontFamily: T.fontMono,
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    textShadow: '0 0 20px currentColor',
  },
  heroNumberRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 4,
  },
  heroMult: {
    fontFamily: T.fontMono,
    fontSize: 28,
    fontWeight: 900,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  heroSep: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.40)',
  },
  heroContrib: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 700,
    color: '#f4f6fa',
    letterSpacing: '0.04em',
  },
  canvasOverlayCenter: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    padding: 24,
  },
  // Action bar slot — sibling of the canvas, NOT an overlay. The boat,
  // rod, fishing line, water column, sun, birds and clouds must all be
  // visible BEFORE the action bar begins. Sits in normal document flow
  // below the canvas so nothing overlaps the fishing scene. Mirrors the
  // OO-BURST fix (Tim playtest 2026-05-22).
  bottomBarSlot: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
  },
  // Tim 2026-05-25 IN-CANVAS HUD MIGRATION: during casting + between-casts
  // the bottom slot collapses to a hairline so the canvas owns the visual
  // field, but the wrapper still mounts so geometry tests + DOM queries
  // continue to resolve.
  bottomBarSlotCollapsed: {
    display: 'flex',
    justifyContent: 'center',
    width: '100%',
    height: 1,
    minHeight: 1,
    overflow: 'hidden',
    pointerEvents: 'none',
    opacity: 0,
  },
  // ─── IN-CANVAS HUD MIGRATION styles (Tim 2026-05-25) ─────────────────
  // Tap-and-hold affordance ring — sits over the boat / forward water
  // region. Soft cyan halo, module-const pulse (RG-C5 SAFE). pointer-events
  // none so it never blocks hex hit-regions underneath.
  tapHoldRing: {
    position: 'absolute',
    bottom: 110,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 120,
    height: 120,
    borderRadius: '50%',
    border: `1.5px solid ${T.accentMuted}`,
    boxShadow: `0 0 24px ${T.accentMuted}, inset 0 0 12px rgba(0, 240, 255, 0.18)`,
    pointerEvents: 'none',
    zIndex: 6,
    animation: 'oo-fisher-tap-hold-pulse 3000ms ease-in-out infinite',
  },
  tapHoldCaption: {
    position: 'absolute',
    bottom: 92,
    left: '50%',
    transform: 'translateX(-50%)',
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.20em',
    textTransform: 'uppercase',
    color: 'rgba(255, 232, 188, 0.78)',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.60)',
    pointerEvents: 'none',
    zIndex: 6,
    whiteSpace: 'nowrap',
  },
  // First-session ghost prompt — fades in, dismissible. Module-const
  // timing (RG-C5 SAFE): 320ms fade, dismissed on click or 6s auto.
  ghostPrompt: {
    position: 'absolute',
    bottom: 240,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '14px 22px',
    background: 'linear-gradient(180deg, rgba(8, 14, 22, 0.94) 0%, rgba(3, 7, 13, 0.90) 100%)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(122, 133, 144, 0.55)',
    borderRadius: 10,
    boxShadow: '0 18px 44px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    cursor: 'pointer',
    pointerEvents: 'auto',
    zIndex: 9,
    minWidth: 240,
    animation: 'oo-fisher-ghost-prompt-enter 320ms ease-out both',
    fontFamily: T.fontMono,
  },
  ghostPromptEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    color: T.accent,
  },
  ghostPromptTitle: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: '#ffd27a',
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
  },
  ghostPromptBody: {
    fontFamily: T.fontBody,
    fontSize: 11,
    color: 'rgba(255, 232, 188, 0.78)',
    textAlign: 'center',
    lineHeight: 1.4,
    maxWidth: 280,
  },
  ghostPromptDismiss: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255, 232, 188, 0.55)',
    marginTop: 4,
  },
  // BETWEEN CASTS in-canvas plaque — Tim 2026-05-26 EMBEDDED HUD REBUILD:
  // reverted to wood-plaque grammar (warm cedar + brass-stud border),
  // matching the cornerStatusCard exactly.
  // Repositioned to port-side gunwale (bottom-left), no longer full-width.
  // Three mini-readouts in a row, each ~80px wide.
  // WARM+CYAN BAN: all text uses cream/brass palette — zero cyan on wood.
  inCanvasBetweenCastsPlaque: {
    position: 'absolute',
    bottom: 88,
    left: 12,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    padding: '10px 14px',
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    border: woodPlaqueBorder,
    boxShadow: woodPlaqueBoxShadow,
    borderRadius: 8,
    pointerEvents: 'none',
    zIndex: 7,
    boxSizing: 'border-box',
    maxWidth: 260,
  },
  inCanvasPlaqueHeader: {
    display: 'none', // removed — eyebrow is now embedded in each mini-readout row
  },
  inCanvasPlaqueEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    // Cream-on-wood — NO cyan on wood surface
    color: PLAQUE_LABEL_COLOR,
    lineHeight: 1.2,
  },
  inCanvasPlaqueSub: {
    display: 'none', // sub-header removed in favour of compact row labels
  },
  inCanvasPlaqueRows: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
  },
  inCanvasPlaqueRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    minWidth: 72,
    padding: '0 8px',
  },
  inCanvasPlaqueLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    // Cream-on-wood — warm+cyan ban
    color: PLAQUE_LABEL_COLOR,
    lineHeight: 1.2,
  },
  // Brass value text — engraved-on-wood look. No cyan on wood ground.
  // (Stale `inCanvasPlaqueValueCyan` key deleted 2026-05-26 per cohesion
  // review Note 1 — misleading name, identical brass color, unused in JSX.)
  inCanvasPlaqueValueBrass: {
    fontFamily: T.fontMono,
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.0,
  },
  inCanvasPlaqueDivider: {
    width: 2,
    height: 28,
    // Brass-stud divider — matches the cornerStatusCard grammar
    background: PLAQUE_DIVIDER_BG,
    flexShrink: 0,
  },
  // ─── InCanvasTopRightPlaque (Tim 2026-05-26 unified HUD plaque) ──────────
  // Replaces cornerStatusCard + InCanvasBetweenCastsPlaque.
  // Vertical stack of 4-5 rows at canvas top-right.
  // Wood+brass register. ZERO cyan on wood (warm+cyan strict ban).
  inCanvasTopRightPlaque: {
    position: 'absolute',
    top: 12,
    right: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
    padding: '10px 14px',
    // Wood grain via layered linear gradients — warm cedar + grain stripes.
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    // Brass-studded border: amber outer + dark inner rim.
    border: woodPlaqueBorder,
    boxShadow: woodPlaqueBoxShadow,
    borderRadius: 8,
    pointerEvents: 'none',
    zIndex: 7,
    // ~180-200px max per brief ("no callout boxes wider than 140px" applies
    // to popups; plaque/status card cap is 200px per existing cornerStatusCard).
    minWidth: 140,
    maxWidth: 200,
  } as CSSProperties,
  inCanvasTopRightRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '4px 0',
  } as CSSProperties,
  inCanvasTopRightLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    // Cream-on-wood — NEVER cyan (warm+cyan strict ban)
    color: PLAQUE_LABEL_COLOR,
    lineHeight: 1.2,
    flexShrink: 0,
  },
  inCanvasTopRightValue: {
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.04em',
    // Brass-amber — NEVER cyan (warm+cyan strict ban)
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
    fontVariantNumeric: 'tabular-nums' as const,
    lineHeight: 1.0,
    textAlign: 'right' as const,
  },
  inCanvasTopRightDivider: {
    height: 1,
    background: PLAQUE_DIVIDER_BG,
    margin: '2px 0',
  } as CSSProperties,
  // CASH OUT chest — Tim 2026-05-26 EMBEDDED HUD REBUILD:
  // Wood-plaque grammar (warm cedar + brass-stud border).
  // Stern-starboard position (bottom-right), ~120px wide.
  // Enabled: 1px cyan outline on brass border rim (cyan job 3 — 4-cyan
  //   economy: legal because the 1px stroke sits on the brass rim, not
  //   painted text ON the wood ground).
  // Disabled: brass-only border, dimmed opacity.
  // WARM+CYAN BAN: eyebrow + value text use cream/brass — never cyan text.
  inCanvasCashOutChest: {
    position: 'absolute',
    bottom: 'calc(12px + env(safe-area-inset-bottom))',
    right: 12,
    touchAction: 'manipulation',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '10px 14px',
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    // Tim 2026-05-26 verbatim: "i still see cyan outline on the wooden
    // theme - this is a violation." The 1px cyan rim outline + 14px cyan
    // glow shadow are DELETED. Strict warm+cyan ban: NO cyan touches wood,
    // not even as outline or shadow glow. Chest reads in pure brass+wood
    // register. Cyan job 4 (CTA) reassigned to chassis START TRIP /
    // ANOTHER TRIP buttons (lobby + settled phases, cool surfaces).
    border: woodPlaqueBorder,
    boxShadow: woodPlaqueBoxShadow,
    borderRadius: 8,
    cursor: 'pointer',
    pointerEvents: 'auto',
    zIndex: 8,
    fontFamily: T.fontMono,
    minWidth: 100,
    maxWidth: 130,
    boxSizing: 'border-box',
  },
  inCanvasCashOutChestDisabled: {
    position: 'absolute',
    bottom: 'calc(12px + env(safe-area-inset-bottom))',
    right: 12,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '10px 14px',
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    border: '2px solid rgba(180, 130, 60, 0.50)',
    boxShadow: '0 8px 18px rgba(0, 0, 0, 0.45)',
    borderRadius: 8,
    cursor: 'not-allowed',
    pointerEvents: 'auto',
    zIndex: 8,
    fontFamily: T.fontMono,
    minWidth: 100,
    maxWidth: 130,
    opacity: 0.6,
    boxSizing: 'border-box',
  },
  inCanvasCashOutChestEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    // Cream-on-wood — NO cyan text on wood
    color: PLAQUE_LABEL_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
  },
  inCanvasCashOutChestValue: {
    fontFamily: T.fontMono,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    // Brass value — engraved-on-wood look
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.0,
  },
  inCanvasCashOutChestValueDisabled: {
    fontFamily: T.fontMono,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: 'rgba(255, 232, 188, 0.35)',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.0,
  },
  inCanvasCashOutChestHint: {
    fontFamily: T.fontMono,
    fontSize: 8,
    fontWeight: 600,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: PLAQUE_LABEL_COLOR,
    opacity: 0.72,
  },
  // CASTING in-canvas controls — Tim 2026-05-26 EMBEDDED HUD REBUILD:
  // Wood-plaque grammar (warm cedar + brass-stud border).
  // Bow-center position (bottom-center), ~140px wide.
  // HOLD button (cyan) is legal here because it's the CastButton's
  // cyan fill surface — a separate interactive leaf, NOT text on wood ground.
  // WARM+CYAN BAN: eyebrow + sub + power label text use cream/brass only.
  // Tim 2026-05-26 image 137: previous casting plaque was "way too small to
  // read". Doubled the footprint — wider, bigger POWER readout, more breathing
  // room. Still wood-themed and embedded at the bottom-center of the canvas.
  inCanvasCastingControls: {
    position: 'absolute',
    bottom: 18,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: '20px 28px',
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    border: woodPlaqueBorder,
    boxShadow: woodPlaqueBoxShadow,
    borderRadius: 10,
    pointerEvents: 'none',
    zIndex: 7,
    alignItems: 'center',
    minWidth: 240,
    maxWidth: 320,
    boxSizing: 'border-box',
    whiteSpace: 'nowrap',
  },
  inCanvasCastingHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  inCanvasCastingEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.30em',
    textTransform: 'uppercase',
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
  },
  inCanvasCastingSub: {
    fontFamily: T.fontBody,
    fontSize: 11,
    color: 'rgba(255, 232, 188, 0.78)',
    textAlign: 'center',
    whiteSpace: 'normal',
    maxWidth: 280,
    lineHeight: 1.35,
  },
  inCanvasCastingInfo: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  inCanvasCastingPowerLabel: {
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: PLAQUE_LABEL_COLOR,
    opacity: 0.82,
  },
  inCanvasCastingPowerValue: {
    fontFamily: T.fontMono,
    fontSize: 32,
    fontWeight: 900,
    fontVariantNumeric: 'tabular-nums',
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 210, 122, 0.32)',
    lineHeight: 1.0,
  },
  inCanvasCastingMetaSep: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: 'rgba(212, 160, 74, 0.40)',
  },
  inCanvasCastingMeta: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.10em',
    color: 'rgba(255, 232, 188, 0.88)',
    fontVariantNumeric: 'tabular-nums',
  },
  inCanvasCastingButtonRow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    pointerEvents: 'auto',
    width: '100%',
    maxWidth: '100%',
    // Override the CastButton's hardcoded min-width: 200 so it can shrink to
    // fit the canvas-shell width on narrow viewports (Tim 2026-05-25 layout
    // fix — the sidebar intercepts clicks if the button overflows).
    overflow: 'hidden',
  },
  inCanvasCastingCashOutLink: {
    background: 'transparent',
    border: 'none',
    padding: '4px 6px',
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(255, 232, 188, 0.65)',
    cursor: 'pointer',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  // ─── Tim 2026-05-26 EMBEDDED HUD REBUILD — new in-canvas styles ─────────

  // LINE OUT bow placard — small wood-plaque on the bow (~100px wide)
  // Replaces the below-canvas LineOutActionBar DOM strip.
  inCanvasLineOutPlacard: {
    position: 'absolute',
    bottom: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '10px 14px',
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    border: woodPlaqueBorder,
    boxShadow: woodPlaqueBoxShadow,
    borderRadius: 8,
    pointerEvents: 'none',
    zIndex: 7,
    minWidth: 90,
    maxWidth: 110,
    boxSizing: 'border-box',
  },
  // Small plaque eyebrow — shared for LINE OUT placard
  inCanvasSmallPlaqueEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: PLAQUE_LABEL_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
  },
  inCanvasSmallPlaqueValue: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 20,
  },
  inCanvasSmallPlaqueSub: {
    fontFamily: T.fontBody,
    fontSize: 9,
    color: 'rgba(255, 232, 188, 0.62)',
    textAlign: 'center',
  },
  // Fish-on countdown value — brass engraved numeral on wood plaque
  inCanvasFishOnCountdown: {
    fontFamily: T.fontMono,
    fontSize: 18,
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums',
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
    lineHeight: 1.0,
    letterSpacing: '-0.01em',
  },
  // Brass spinner (replaces the cool-steel spinner for the wood plaque)
  inCanvasBrassSpinnerWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inCanvasBrassSpinner: {
    display: 'inline-block',
    width: 16,
    height: 16,
    border: '2px solid rgba(212, 160, 74, 0.35)',
    borderTopColor: PLAQUE_VALUE_COLOR,
    borderRadius: '50%',
    animation: 'oo-fisher-spin 0.8s linear infinite',
  },

  // Transom display board — slides up from canvas bottom edge for
  // CAUGHT / JUNK / MISSED / SNAP. ~200px wide × 64px tall.
  // Wood-plaque chrome, boat-anatomical anchor (transom = boat bottom).
  // NO celebration register on JUNK / MISSED / SNAP (RG-C1).
  // Tim 2026-05-26 — wide wood-plaque board for junk / miss / snap. Image 138
  // pass 1 fixed the size; Tim image 141 follow-up: "stuck to the bottom of
  // the game screen" → lifted off the bottom edge so it floats above the
  // boat as a proper sliding placard, not a glued-on chrome strip. Switched
  // to fully rounded corners since the rim no longer kisses the canvas edge.
  inCanvasTransomBoard: {
    position: 'absolute',
    bottom: 28,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: '22px 30px',
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    border: woodPlaqueBorder,
    boxShadow: woodPlaqueBoxShadow,
    borderRadius: 12,
    pointerEvents: 'none',
    zIndex: 9,
    minWidth: 380,
    maxWidth: 480,
    boxSizing: 'border-box',
    animation: 'oo-fisher-transom-enter 180ms cubic-bezier(0.2, 0, 0, 1) both',
  },
  transomFishWrap: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
  transomTextStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
  },
  transomEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
    lineHeight: 1.2,
  },
  transomSpecies: {
    fontFamily: T.fontMono,
    fontSize: 18,
    fontWeight: 900,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    lineHeight: 1.2,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.5)',
  },
  transomSub: {
    fontFamily: T.fontBody,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: PLAQUE_LABEL_COLOR,
    lineHeight: 1.35,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.5)',
  },

  // POINTER-EVENTS CHASSIS (Option A — 2026-05-25 mobile-chrome fix):
  // Wrapper panels are `pointer-events: none` so dead space inside the
  // overlay never occludes the fishing canvas (boat, rod, line). Leaf
  // interactive children re-enable `pointer-events: auto` explicitly.
  overlayPanel: {
    pointerEvents: 'none',
    width: 'min(380px, 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  actionBarPanel: {
    pointerEvents: 'none',
    width: '100%',
    maxWidth: 920,
  },
  gameFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    paddingTop: 14,
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
    fontSize: 10,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.textDim,
  },
  // Tim 2026-05-26 images 118/119/121: controlCard (used by Lobby +
  // BetEntry + TripSettlement card bodies) migrated cool dark-glass + cyan
  // hairline → wood-plaque grammar to match the rest of the in-canvas HUD.
  // Inherits the cornerStatusCard register: warm cedar gradient + brass-
  // stud border + cream/brass text. Cyan stays OFF the wood per strict
  // ban — `PrimaryButton` (cyan) is a separate leaf element NOT painted
  // text on this surface.
  // Tim 2026-05-26 image 140: more breathing room — bumped padding 22→30
  // and gap 14→20 so YOUR WAGER / chip row / loadout block / footer each
  // get their own air.
  controlCard: {
    pointerEvents: 'none',
    position: 'relative',
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: woodPlaqueBorder,
    borderRadius: 12,
    padding: 30,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    boxShadow: woodPlaqueBoxShadow,
    animation: 'oo-fisher-card-enter 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
  },
  lobbyHero: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  // Tim 2026-05-26 image 118 wood-theme migration: text colors re-tuned
  // for warm cedar ground. Cream eyebrow + soft cream body + brass value
  // numerals. NO cyan on any text within the wood card (strict ban).
  lobbyTitle: {
    fontFamily: T.fontMono,
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: PLAQUE_VALUE_COLOR, // brass-cream
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.5)',
  },
  lobbyTagline: {
    fontFamily: T.fontBody,
    fontSize: 13,
    color: 'rgba(255, 232, 188, 0.78)', // cream on wood
    lineHeight: 1.5,
  },
  lobbyFootnote: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: 'rgba(255, 232, 188, 0.55)', // dim cream
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    marginTop: 6,
  },
  // RTP disclosure chip on wood — cool dark-glass inset reads as a brass-
  // rim instrument plate set INTO the wood panel. Cyan RTP value lives
  // here on the cool-glass inset (legal — chip body is cool, not wood).
  rtpChip: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '12px 18px',
    border: '1px solid rgba(184, 137, 92, 0.55)', // brass rim
    borderRadius: 8,
    background: 'rgba(8, 14, 22, 0.78)', // cool dark-glass inset
  },
  rtpChipLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.30em',
    textTransform: 'uppercase',
    color: 'rgba(255, 232, 188, 0.78)',
  },
  rtpChipValue: {
    fontFamily: T.fontMono,
    fontSize: 26,
    fontWeight: 800,
    // Tim 2026-05-26 image 135: cyan-on-dark-inset-inside-wood-card was
    // still read as "cyan in wood" by Tim. The cool-inset exception is
    // closed. RTP value migrates to brass — engraved-brass numeral on
    // the dark glass inset, which itself sits on warm cedar.
    color: '#ffd27a',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.01em',
    textShadow: '0 0 12px rgba(255, 210, 122, 0.32)',
  },
  rtpChipSep: {
    display: 'none',
  },
  rtpChipEdge: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: 'rgba(255, 232, 188, 0.88)',
    letterSpacing: '0.06em',
  },
  rtpChipFoot: {
    fontFamily: T.fontBody,
    fontSize: 11,
    color: 'rgba(255, 232, 188, 0.55)',
    fontStyle: 'italic',
    marginTop: 2,
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
    color: T.textDim,
  },
  wagerAmountInput: {
    // pointer-events: auto re-enables focus / keyboard input even though the
    // parent controlCard + overlayPanel have pointer-events: none (those are
    // set so dead space in the overlay doesn't block the 3D scene hit-regions).
    pointerEvents: 'auto',
    fontFamily: T.fontMono,
    fontSize: 44,
    fontWeight: 800,
    // Warm brass hero (was cool #f4f6fa) — the focal number was the only
    // cool-palette element on the warm wood card. (artotty cohesion fix.)
    color: '#ffe8bc',
    background: 'transparent',
    border: 'none',
    textAlign: 'center',
    width: '100%',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.02em',
  },
  wagerAmountUnit: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textDim,
  },
  quickPickRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
  },
  settledWagerAdjust: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    marginBottom: 8,
    // The settled card is pointerEvents:none; opt this editor (+ its children)
    // back in or the chips/stepper are dead. (QA blocker fix.)
    pointerEvents: 'auto',
  },
  settledWagerAdjustLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'rgba(255, 232, 188, 0.62)',
    textAlign: 'center',
  },
  settledPresetRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 6,
  },
  settledPresetChip: {
    minHeight: 44,
    pointerEvents: 'auto',
    background: 'rgba(48, 28, 14, 0.45)',
    color: 'rgba(255, 232, 188, 0.78)',
    border: '1px solid rgba(184, 137, 92, 0.42)',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    touchAction: 'manipulation',
    fontVariantNumeric: 'tabular-nums',
  },
  settledPresetChipActive: {
    minHeight: 44,
    pointerEvents: 'auto',
    background: 'linear-gradient(180deg, #f0c674, #c89148)',
    color: '#2a1a08',
    border: '1px solid #d4a04a',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
    touchAction: 'manipulation',
    fontVariantNumeric: 'tabular-nums',
    boxShadow: 'inset 0 1px 0 rgba(255,232,188,0.55), inset 0 -1px 0 rgba(86,54,30,0.40)',
  },
  settledWagerStepper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  settledWagerValue: {
    fontFamily: T.fontMono,
    fontSize: 21,
    fontWeight: 800,
    color: '#ffe8bc',
    fontVariantNumeric: 'tabular-nums',
    minWidth: 104,
    textAlign: 'center',
  },
  wagerStepBtn: {
    width: 44,
    height: 44,
    pointerEvents: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(48, 28, 14, 0.55)',
    color: '#ffd27a',
    border: '1px solid rgba(184, 137, 92, 0.5)',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  quickPick: {
    pointerEvents: 'auto',
    padding: '8px 4px',
    minHeight: 44,
    touchAction: 'manipulation',
    // Tim 2026-05-26 image 136: wager denomination chips on a wood card —
    // unselected = cream-outlined wood, selected = brass fill on walnut ink.
    background: 'rgba(48, 28, 14, 0.45)',
    color: 'rgba(255, 232, 188, 0.78)',
    border: '1px solid rgba(184, 137, 92, 0.42)',
    borderRadius: 6,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.06em',
    cursor: 'pointer',
  },
  quickPickSelected: {
    pointerEvents: 'auto',
    padding: '8px 4px',
    minHeight: 44,
    touchAction: 'manipulation',
    background: 'linear-gradient(180deg, #f0c674, #c89148)',
    color: '#2a1a08',
    border: '1px solid #d4a04a',
    borderRadius: 6,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,232,188,0.55), inset 0 -1px 0 rgba(86,54,30,0.40)',
  },
  gearSummaryBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    background: 'rgba(48, 28, 14, 0.32)',
    border: '1px solid rgba(184, 137, 92, 0.32)',
    borderRadius: 8,
  },
  gearSummaryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gearSummaryLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textDim,
  },
  gearSummaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
  },
  // Tim 2026-05-26 image 136 — gear chips on wood: walnut inset, cream
  // tier label, brass sub-annotation (was cyan, banned on wood).
  gearChip: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '8px 10px',
    background: 'rgba(48, 28, 14, 0.45)',
    border: '1px solid rgba(184, 137, 92, 0.42)',
    borderRadius: 6,
  },
  gearChipLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255, 232, 188, 0.62)',
  },
  gearChipTier: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 700,
    color: 'rgba(255, 232, 188, 0.94)',
  },
  gearChipSub: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: '#ffd27a',
    letterSpacing: '0.06em',
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
    color: T.textDim,
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
    pointerEvents: 'auto',
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
    pointerEvents: 'auto',
    padding: '12px 20px',
    minHeight: 44,
    touchAction: 'manipulation',
    // START TRIP CTA — brass-on-wood per Tim 2026-05-26 image 136.
    background: 'linear-gradient(180deg, #f0c674, #c89148)',
    color: '#2a1a08',
    border: '1px solid #d4a04a',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow:
      'inset 0 1px 0 rgba(255,232,188,0.55), inset 0 -2px 0 rgba(86,54,30,0.40), 0 6px 14px rgba(0,0,0,0.35)',
  },
  commitButtonDisabled: {
    pointerEvents: 'auto',
    padding: '12px 20px',
    background: 'rgba(140, 92, 52, 0.22)',
    color: 'rgba(255, 232, 188, 0.45)',
    border: '1px solid rgba(184, 137, 92, 0.32)',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
  },
  // Tim 2026-05-26 images 135/136/139 — primary CTAs on wood cards migrate
  // from cyan to brass. The cool-inset exception is closed. The CTA is now
  // brushed-brass with a deep walnut ink for contrast — reads as "engraved
  // brass plate riveted to the wood card".
  primaryButton: {
    pointerEvents: 'auto',
    padding: '14px 24px',
    minHeight: 44,
    touchAction: 'manipulation',
    background: 'linear-gradient(180deg, #f0c674, #c89148)',
    color: '#2a1a08',
    border: '1px solid #d4a04a',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow:
      'inset 0 1px 0 rgba(255,232,188,0.55), inset 0 -2px 0 rgba(86,54,30,0.40), 0 6px 14px rgba(0,0,0,0.35)',
  },
  primaryButtonDisabled: {
    pointerEvents: 'auto',
    padding: '14px 24px',
    background: 'rgba(140, 92, 52, 0.22)',
    color: 'rgba(255, 232, 188, 0.45)',
    border: '1px solid rgba(184, 137, 92, 0.32)',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
  },
  secondaryButton: {
    pointerEvents: 'auto',
    padding: '12px 20px',
    background: 'transparent',
    color: T.textPrimary,
    border: `1px solid ${T.borderDefault}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  // Bottom action bar — used for the active trip + settlement
  actionBar: {
    // Decorative chrome only — `pointer-events: none`. Leaf interactive
    // children re-enable `pointer-events: auto` explicitly above.
    pointerEvents: 'none',
    position: 'relative',
    background: `linear-gradient(180deg, rgba(8, 14, 22, 0.82), rgba(3, 7, 13, 0.76))`,
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: `1px solid rgba(0, 240, 255, 0.14)`,
    borderRadius: 14,
    padding: '14px 20px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: 28,
    alignItems: 'center',
    minHeight: 96,
    boxShadow: '0 18px 50px rgba(0, 0, 0, 0.45)',
  },
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
    fontSize: 12,
    color: T.textMuted,
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
    minWidth: 200,
  },
  // Tim 2026-05-26 image 128 — the giant cyan "HOLD TO CAST" CTA on the
  // wood plaque looked ugly and competed with the hex tap-and-hold gesture
  // which is the canonical cast surface. Restyled to a slim brass-rim
  // wood pill — present (so the accessibility-fallback + testid contracts
  // hold), but visually subordinate. The verb stays "hold to cast" so
  // copy is unambiguous when the player does invoke this fallback.
  castButton: {
    pointerEvents: 'auto',
    padding: '6px 12px',
    minHeight: 44,
    background: 'linear-gradient(180deg, rgba(140,92,52,0.92), rgba(86,54,30,0.92))',
    color: 'rgba(255, 232, 188, 0.94)',
    border: '1px solid rgba(212, 160, 74, 0.55)',
    borderRadius: 6,
    fontFamily: T.fontMono,
    minWidth: 0,
    width: '100%',
    maxWidth: 140,
    cursor: 'pointer',
    boxShadow: 'inset 0 1px 0 rgba(255,222,158,0.30), inset 0 -1px 0 rgba(0,0,0,0.30)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  castButtonActive: {
    pointerEvents: 'auto',
    padding: '6px 12px',
    minHeight: 44,
    background: 'linear-gradient(180deg, rgba(170,112,62,0.96), rgba(108,70,40,0.96))',
    color: '#ffd27a',
    border: '1px solid #d4a04a',
    borderRadius: 6,
    fontFamily: T.fontMono,
    minWidth: 0,
    width: '100%',
    maxWidth: 140,
    cursor: 'pointer',
    boxShadow:
      'inset 0 1px 0 rgba(255,222,158,0.45), inset 0 -1px 0 rgba(0,0,0,0.30), 0 0 14px rgba(212,160,74,0.32)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transform: 'scale(0.98)',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  castButtonLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  castButtonSub: {
    // legacy sub-label retired — the small brass pill no longer carries
    // dual-line copy. Kept as an empty style stub so the JSX span keeps
    // an inert layout slot (zero height) and tests that look up the
    // structure still find a stable DOM.
    display: 'none',
  },
  cashOutLink: {
    pointerEvents: 'auto',
    background: 'transparent',
    border: 'none',
    padding: '6px 4px',
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: T.textMuted,
    cursor: 'pointer',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  cashOutTripButton: {
    pointerEvents: 'auto',
    padding: '12px 16px',
    background: 'transparent',
    color: T.accent,
    border: `1px solid ${T.accentMuted}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  cashOutTripButtonDisabled: {
    pointerEvents: 'auto',
    padding: '12px 16px',
    background: 'transparent',
    color: T.textDim,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
  },
  spinner: {
    display: 'inline-block',
    width: 20,
    height: 20,
    border: `2px solid ${T.borderSubtle}`,
    borderTopColor: T.accentSolid,
    borderRadius: '50%',
    animation: 'oo-fisher-spin 0.8s linear infinite',
  },
  fishBadge: {
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.20em',
    textTransform: 'uppercase',
    padding: '8px 14px',
    border: '1px solid',
    borderRadius: 8,
    background: 'transparent',
  },
  // ── TRIP LANDED settlement card (wood-theme, Tim 2026-05-26 image 133) ──
  // Replaces the legacy dark-glass `actionBar` for trip-settled. Same shape
  // (grid layout, footnote, expand-receipt) — wood-plaque chrome carries
  // cohesion. Narrative headline sits between the eyebrow and casts-summary.
  tripSettledCard: {
    pointerEvents: 'none',
    position: 'relative',
    background: woodPlaqueBackground,
    backgroundBlendMode: 'multiply, normal',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: woodPlaqueBorder,
    borderRadius: 14,
    padding: '14px 20px',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: 28,
    alignItems: 'center',
    minHeight: 96,
    boxShadow: woodPlaqueBoxShadow,
  },
  tripSettledEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    fontWeight: 700,
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6)',
  },
  tripSettledHeadline: {
    fontFamily: T.fontMono,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '0.02em',
    color: PLAQUE_VALUE_COLOR,
    textShadow: '0 1px 0 rgba(0, 0, 0, 0.6), 0 0 16px rgba(255, 210, 122, 0.30)',
    marginTop: 2,
    lineHeight: 1.15,
  },
  tripSettledSub: {
    fontFamily: T.fontBody,
    fontSize: 12,
    color: PLAQUE_LABEL_COLOR,
    lineHeight: 1.4,
    marginTop: 4,
  },
  settledBetAgain: {
    pointerEvents: 'auto',
    padding: '14px 24px',
    minHeight: 44,
    touchAction: 'manipulation',
    background: 'linear-gradient(180deg, #f0c674, #c89148)',
    color: '#2a1a08',
    border: '1px solid #d4a04a',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow:
      'inset 0 1px 0 rgba(255,232,188,0.55), inset 0 -2px 0 rgba(86,54,30,0.40), 0 6px 14px rgba(0,0,0,0.35)',
  },
  settledBetAgainDisabled: {
    pointerEvents: 'auto',
    padding: '14px 24px',
    background: 'rgba(140, 92, 52, 0.22)',
    color: 'rgba(255, 232, 188, 0.45)',
    border: '1px solid rgba(184, 137, 92, 0.32)',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
  },
  settledSecondaryActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  settledUpgradeLink: {
    pointerEvents: 'auto',
    background: 'transparent',
    border: 'none',
    padding: '6px 4px',
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    // Brass-cream link on wood — Tim 2026-05-26 no-cyan-on-wood.
    color: '#ffd27a',
    cursor: 'pointer',
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
    color: T.textDim,
    fontStyle: 'italic',
  },
  settledVerifyToggle: {
    pointerEvents: 'auto',
    background: 'transparent',
    border: 'none',
    padding: '2px 0',
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.textMuted,
    cursor: 'pointer',
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
  catchLogBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingTop: 6,
  },
  catchLogHeader: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textDim,
  },
  catchLogRows: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  catchLogRow: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    columnGap: 12,
    alignItems: 'center',
  },
  catchLogRarity: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    padding: '2px 8px',
    border: '1px solid',
    borderRadius: 3,
  },
  catchLogMeta: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.textMuted,
    letterSpacing: '0.10em',
  },
  catchLogSeed: {
    fontFamily: T.fontMono,
    fontSize: 9,
    color: T.textDim,
  },
  catchLogEmpty: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textDim,
    fontStyle: 'italic',
  },
  rowLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.textDim,
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
    color: T.textDim,
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
    color: T.textDim,
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
  // ─── Glass Box (auto-verify chip + inline receipt drawer) ──────────────
  // Mirrors oo-spike / oo-burst / oo-tile / oo-climb. Lowercase label,
  // accent color, hint text on the right side. Drawer expands inline below
  // — NOT a modal (per brand standards).
  glassBox: {
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
  },
  glassBoxToggle: {
    pointerEvents: 'auto',
    appearance: 'none',
    background: 'none',
    border: 'none',
    color: T.textPrimary,
    cursor: 'pointer',
    padding: '10px 14px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: T.fontBody,
  },
  glassBoxToggleLabel: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.accent,
  },
  glassBoxToggleHint: {
    fontFamily: T.fontBody,
    fontSize: 12,
    color: T.textMuted,
  },
  glassBoxBody: {
    padding: '0 14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  glassBoxSummary: {
    fontFamily: T.fontBody,
    fontSize: 12,
    color: T.textMuted,
    margin: 0,
  },
  glassBoxHex: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textPrimary,
    background: 'rgba(255,255,255,0.04)',
    padding: '2px 6px',
    borderRadius: 4,
  },
  glassBoxSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  glassBoxSectionLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textDim,
  },
  sequenceRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  sequenceEmpty: {
    fontFamily: T.fontBody,
    fontSize: 12,
    color: T.textDim,
    fontStyle: 'italic',
  },
  castSeedChipOk: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 6px',
    border: '1px solid rgba(0,240,255,0.4)',
    borderRadius: 4,
    color: T.accent,
    background: 'rgba(0,240,255,0.08)',
  },
  castSeedChipMiss: {
    fontFamily: T.fontMono,
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 6px',
    border: '1px solid rgba(248,113,113,0.55)',
    borderRadius: 4,
    color: T.danger,
    background: 'rgba(248,113,113,0.08)',
  },
  receiptRowsGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '4px 12px',
    margin: 0,
    fontFamily: T.fontMono,
    fontSize: 11,
  },
}

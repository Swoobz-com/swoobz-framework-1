'use client'

/**
 * The Pulse player experience.
 *
 * Brand register: `branding/BRAND_KIT.md` §1.3–§1.5 — "the quiet expert at
 * the table." Precision · transparency · warmth · ownership · calm. The
 * Pulse curve is the brand's literal heartbeat. Layout, palette, and copy
 * mirror the research fixture at
 * `packages/design-system/preview/__concepts/swoobz-originals/Pulse/
 * PulseRoundActive.fixture.tsx` (D7, 2026-05-15).
 *
 * Domain C: presentation only. Curve and payout math live in `pulseMath.ts`
 * (mirror of `programs/originals-pulse/src/curve.rs`); state lives in
 * `pulseProvider.ts`; the Glass Box verify widget re-derives the on-chain
 * crash point bit for bit from the seed.
 */
import { useRouter } from 'next/navigation'
import { type CSSProperties, type ReactElement, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isSampleLoaded, useSwoobzAudio, useSwoobzMusic } from '../_shared/audio'
import { HelpButton, OnboardingOverlay, useOnboardingState } from '../_shared/onboarding'
import { pulseOnboarding } from '../_shared/onboarding/games/pulse-onboarding'
import { PulseCurveCanvas } from './PulseCurveCanvas'
import { PulseRankUpBanner } from './PulseRankUpBanner'
import { PulseSafetyPanel } from './PulseSafetyPanel'
import { PULSE_SCENE_KEYFRAMES, PulseSceneBackdrop } from './PulseSceneBackdrop'
import { PulseUnlockShowcase } from './PulseUnlockShowcase'
import { AUDIO_MANIFEST, MUSIC_PULSE_THEME } from './pulseAudio'
import { pulseCosmeticById } from './pulseCosmetics'
import { HAPTIC_PRESS_MS, safeVibrate } from './pulseHaptics'
import {
  currentMultiplierBps,
  formatMultiplier,
  formatOddsPct,
  formatPoints,
  formatUsdc,
  isPerfectHit,
  nearestPerfectMilestoneBps,
  nextVitalsTargetBps,
  ONE_X_BPS,
  pointsForBet,
  settlementNarrative,
  settlePayout,
  survivalOddsBps,
} from './pulseMath'
import { MIN_WAGER, usePulseController } from './pulseProvider'
import { computePulseRank, detectPulseRankUp, type PulseRankTier } from './pulseRank'
import { startPulseTheme, stopPulseTheme } from './pulseTheme'

/**
 * Convert a CSS hex color (#RRGGBB or #RGB) to an "R,G,B" triplet string
 * suitable for use in `rgba(...)` canvas calls.
 * Returns null if the hex is malformed (fall back to default).
 * Pure, deterministic, no I/O.
 */
function hexToRgbTriplet(hex: string): string | null {
  const clean = hex.replace('#', '')
  let r: number, g: number, b: number
  if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16)
    g = parseInt(clean.slice(2, 4), 16)
    b = parseInt(clean.slice(4, 6), 16)
  } else if (clean.length === 3) {
    r = parseInt(clean[0]! + clean[0]!, 16)
    g = parseInt(clean[1]! + clean[1]!, 16)
    b = parseInt(clean[2]! + clean[2]!, 16)
  } else {
    return null
  }
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return `${r},${g},${b}`
}

// ── Color: SWOOBZ-DESIGN-SYSTEM.md accent-API (supersedes the old DLv2 cyan
// economy). volt #00F0FF = primary/live; cyan #29E6FF = calmer readout accent
// (OLED-safe small text); blood #FF4135 = danger/bust; bg ink/coal/slate;
// hairline = white-alpha. Keep accent restraint (one accent reads as featured);
// values now come from the accent-API tokens below.
const T = {
  fontMono: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
  fontBody: 'var(--font-family-body, "Geist", system-ui, sans-serif)',
  bgCanvas: '#07080C', // DS ink — deepest canvas floor
  bgSurface: '#0D0F15', // DS coal — raised surface
  bgRaised: '#161A23', // DS slate — elevated panel chrome
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderDefault: 'rgba(255, 255, 255, 0.12)',
  textPrimary: '#F2F3EF', // DS bone — off-white body text
  textMuted: '#98A1B3', // DS fog — muted/secondary text
  textDim: 'rgba(255, 255, 255, 0.62)', // A11Y — was 0.40 (failed 4.5:1 on dark plates)
  // Swoobz accent-API tokens (LAB theme).
  accent: '#29E6FF', // DS cyan — calmer-than-volt readout accent (OLED-safe small text; #00D0DE deleted)
  accentSolid: '#00F0FF', // DS volt — primary live accent
  accentMuted: 'rgba(0, 240, 255, 0.28)', // volt @ luminance-preserving alpha
  accentInk: '#07080C', // DS ink — dark text-on-cyan for the filled chip
  danger: '#FF4135', // DS blood — danger / loss / bust
}

// Presets show as bare numbers — the wager unit is set once by the hero
// row above; repeating "USDC" on every chip is the AI-form tell the redesign
// strips. Five values per row, exactly the grid width, no wrap.
const WAGER_PRESETS = [
  { label: '5', value: 5_000_000n },
  { label: '10', value: 10_000_000n },
  { label: '25', value: 25_000_000n },
  { label: '50', value: 50_000_000n },
  { label: '100', value: 100_000_000n },
]
// Inline next-bet stepper on the settled card — lets the player resize the bet
// without routing through the full "change wager" screen. The step is ADAPTIVE
// (small near the floor, larger as the stake grows) and snaps to a round value,
// so the first step off the 0.10 minimum is 0.20 — not a jarring 5.10 jump.
function wagerStepLamports(w: bigint): bigint {
  const usd = w / 1_000_000n
  if (w < 1_000_000n) return 100_000n // < 1 USDC   → 0.10 steps
  if (usd < 5n) return 250_000n // < 5 USDC   → 0.25 steps
  if (usd < 10n) return 500_000n // < 10 USDC  → 0.50 steps
  if (usd < 25n) return 1_000_000n // < 25 USDC  → 1 step
  if (usd < 50n) return 2_500_000n // < 50 USDC  → 2.50 steps
  if (usd < 100n) return 5_000_000n // < 100 USDC → 5 steps
  if (usd < 250n) return 10_000_000n // < 250 USDC → 10 steps
  return 25_000_000n // ≥ 250 USDC → 25 steps
}
/** Next round wager up from `w` (snaps to the step grid). */
function stepWagerUp(w: bigint): bigint {
  const step = wagerStepLamports(w)
  return (w / step + 1n) * step
}
/** Next round wager down from `w` (snaps to the step grid; setWager clamps to MIN). */
function stepWagerDown(w: bigint): bigint {
  const step = wagerStepLamports(w)
  const base = (w / step) * step
  return w % step === 0n ? base - step : base
}

// Smooth count-roll when the amount switches (the Stormforge-style value tween).
// Module-const duration (RG-C5 SAFE — identical for every amount, every player).
// This is the allowed "score-tick chunked counting" juice, not a particle effect.
const AMOUNT_ROLL_MS = 260

/** A USDC amount that eases to its new value when `lamports` changes. Snaps
 *  instantly under prefers-reduced-motion or the in-app reduce-motion toggle. */
function AnimatedUsdc({
  lamports,
  style,
}: {
  lamports: bigint
  style?: CSSProperties
}): ReactElement {
  const target = Number(lamports) / 1_000_000
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        window.localStorage.getItem('swoobz-pulse-reduce-motion') === '1')
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
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
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

// Base 4 auto-cashout presets. extraPresetSlots (0/1/2) appended at runtime
// from the player's rank. The extra slots are blank (null target) so the
// player authors the value — EV-identical to a manual cashout at the same
// multiplier (agency, not advantage). The label shows "—" until set.
const AUTO_PRESETS_BASE = [
  { label: 'off', value: null as bigint | null },
  { label: '1.20x', value: 12_000n },
  { label: '1.50x', value: 15_000n },
  { label: '2.00x', value: 20_000n },
  { label: '3.00x', value: 30_000n },
]
// Blank extra slots unlocked by rank (shown as "—" until player sets them).
// The player would configure these through a custom input in a follow-on slice;
// for now they appear as "custom" chips, demonstrating the slot exists.
const EXTRA_PRESET_BLANK = { label: '·', value: null as bigint | null }
function buildAutoPresets(extraSlots: number) {
  const extras = Array.from({ length: Math.min(extraSlots, 2) }, () => EXTRA_PRESET_BLANK)
  return [...AUTO_PRESETS_BASE, ...extras]
}

// Layout-invariant export — consumed by `PulseExperience.layout.test.tsx`.
// Tim 2026-05-27 FIX 3: settlement card moved to BOTTOM-RIGHT so it no longer
// occludes the ghost-trajectory marker (which lives in the upper portion of
// the canvas after a cash-out). The cash-out "would-have-crashed" dotted line
// is a critical learning moment — it must not be hidden behind the settlement
// card. The `edge` + `offset` values mirror exactly what
// `styles.canvasOverlayBottom` applies.
export const PULSE_ACTION_OVERLAY_ANCHOR = {
  edge: 'bottom' as const,
  offset: 16,
} as const

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent): void => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

export function PulseExperience(): ReactElement {
  const controller = usePulseController()
  const osReducedMotion = useReducedMotion()
  const { state } = controller
  const router = useRouter()
  const onboarding = useOnboardingState(pulseOnboarding.gameId)
  // Self-contained HOW-TO overlay (the shared onboarding shim is a no-op in this
  // export, so the "?" opens this instead).
  const [showInfo, setShowInfo] = useState(false)
  // ── Safer-play surface (RG-C8) ──────────────────────────────────────────
  const [safetyOpen, setSafetyOpen] = useState(false)
  // In-app reduce-motion override, OR'd with the OS media query so a player can
  // calm the game without leaving to change system settings. Persisted.
  const [userReduceMotion, setUserReduceMotion] = useState(false)
  // Self-imposed session wager cap (USDC whole units), null = no cap. Persisted.
  const [wagerCapUsd, setWagerCapUsd] = useState<number | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setUserReduceMotion(window.localStorage.getItem('swoobz-pulse-reduce-motion') === '1')
      const cap = window.localStorage.getItem('swoobz-pulse-wager-cap')
      setWagerCapUsd(cap ? Number(cap) : null)
    } catch {
      // storage disabled — defaults stand
    }
  }, [])
  const reducedMotion = osReducedMotion || userReduceMotion
  const toggleReduceMotion = (): void => {
    setUserReduceMotion((v) => {
      const next = !v
      try {
        window.localStorage.setItem('swoobz-pulse-reduce-motion', next ? '1' : '0')
      } catch {
        // degrade gracefully
      }
      return next
    })
  }
  // Cap cycles through OFF → 25 → 50 → 100 → 250 → OFF.
  const cycleWagerCap = (): void => {
    setWagerCapUsd((c) => {
      const ladder: (number | null)[] = [null, 25, 50, 100, 250]
      const idx = ladder.findIndex((x) => x === c)
      const next = ladder[(idx + 1) % ladder.length] ?? null
      try {
        if (next === null) window.localStorage.removeItem('swoobz-pulse-wager-cap')
        else window.localStorage.setItem('swoobz-pulse-wager-cap', String(next))
      } catch {
        // degrade gracefully
      }
      return next
    })
  }
  // Central enforcement: whenever the live wager exceeds the active cap, clamp it
  // down — covers every UI that can raise the wager (presets, stepper, input).
  useEffect(() => {
    if (wagerCapUsd === null) return
    const capLamports = BigInt(wagerCapUsd) * 1_000_000n
    if (state.wagerLamports > capLamports) controller.setWager(capLamports)
  }, [wagerCapUsd, state.wagerLamports, controller])
  const takeABreak = (): void => {
    setSafetyOpen(false)
    if (state.phase.kind === 'settled') controller.acknowledgeSettlement()
    if (state.phase.kind === 'bet-entry') controller.closeBetEntry()
    router.push('/originals')
  }
  // Engagement layer (S4): rank chip + unlock showcase overlay.
  // Rank is derived from ROUNDS PLAYED (Tim correction #1) — not wager volume.
  const [showcaseOpen, setShowcaseOpen] = useState(false)
  const operatorRank = computePulseRank(state.lifetimeRoundsPlayed)
  const hasRounds = state.lifetimeRoundsPlayed > 0n
  // Rank-up banner (S5): fire ONCE on a rounds threshold crossing during settle.
  const [rankUpTier, setRankUpTier] = useState<PulseRankTier | null>(null)
  const prevRoundsRef = useRef(state.lifetimeRoundsPlayed)
  useEffect(() => {
    const prev = prevRoundsRef.current
    const next = state.lifetimeRoundsPlayed
    if (next > prev && state.phase.kind === 'settled') {
      const up = detectPulseRankUp(prev, next)
      if (up) setRankUpTier(up)
    }
    prevRoundsRef.current = next
  }, [state.lifetimeRoundsPlayed, state.phase.kind])

  // Trace skin → RGB triplet for PulseCurveCanvas (Tim correction #2 wiring).
  const traceSkinRgb = useMemo(() => {
    if (!state.equippedTraceSkinId) return null
    const skin = pulseCosmeticById(state.equippedTraceSkinId)
    if (!skin?.swatch) return null
    return hexToRgbTriplet(skin.swatch)
  }, [state.equippedTraceSkinId])

  // Ambient track source — swaps useSwoobzMusic when a track is equipped.
  const equippedTrack = useMemo(() => {
    if (!state.equippedAmbientTrackId) return MUSIC_PULSE_THEME
    const track = pulseCosmeticById(state.equippedAmbientTrackId)
    if (!track?.assetPath) return MUSIC_PULSE_THEME
    return { id: track.id, sources: [track.assetPath] }
  }, [state.equippedAmbientTrackId])
  // Kenney CC0 sample manifest; WebAudio synthesis fallback in pulseAudio.ts.
  useSwoobzAudio(AUDIO_MANIFEST)

  // Quantum-Lab ambient theme.
  //
  // PRIMARY: "Pondering the Cosmos" by Ruskerdax (CC0) loaded via Howler
  // through `useSwoobzMusic` — amplitude pinned at module-const
  // `MUSIC_VOLUME = 0.35`, fade durations module-const. Gated on first
  // user gesture (browser autoplay policy).
  //
  // FALLBACK: pulseTheme.ts WebAudio synth (pad + arp) at module-const
  // 0.18. Fires only after a 1500ms grace window if the sample has not
  // loaded (dev environments before assets are copied, or network
  // failures in production).
  //
  // Honors prefers-reduced-motion as the motion-equivalent rule for audio.
  // equippedTrack swaps to the player's chosen ambient track (Tim correction #2).
  useSwoobzMusic(equippedTrack, { reducedMotion })
  useEffect(() => {
    if (reducedMotion) return
    const id = window.setTimeout(() => {
      if (!isSampleLoaded(equippedTrack.id)) {
        startPulseTheme()
      }
    }, 1500)
    return () => {
      window.clearTimeout(id)
      stopPulseTheme()
    }
    // equippedTrack in deps so the synth fallback re-evaluates when the player
    // swaps ambient tracks mid-session (was a stale closure on [reducedMotion]).
  }, [reducedMotion, equippedTrack])

  const liveMultiplierBps = useMemo(() => {
    if (state.phase.kind !== 'round-active' || !state.roundActiveSlot) return ONE_X_BPS
    return currentMultiplierBps(state.roundActiveSlot, state.currentSlot)
  }, [state.phase.kind, state.roundActiveSlot, state.currentSlot])

  const phaseLabel =
    state.phase.kind === 'lobby'
      ? 'READY'
      : state.phase.kind === 'bet-entry'
        ? 'BET ENTRY'
        : state.phase.kind === 'round-active'
          ? 'ROUND ACTIVE'
          : state.phase.kind === 'settling'
            ? 'SETTLING'
            : state.phase.outcome.won
              ? 'SETTLED · WIN'
              : 'SETTLED · CRASHED'

  const isRoundActive = state.phase.kind === 'round-active'
  // Lobby + bet-entry float over the canvas as a centered overlay, per
  // player feedback "we can just center it in the game right." Brand §1.4
  // One cohesive architecture across every phase: canvas always full-width,
  // controls overlay INSIDE the canvas. Position varies by phase:
  // - centered: setup phases (lobby / bet-entry) — canvas is idle, the
  //   card owns the stage
  // - bottom action bar: gameplay phases (round-active / settling /
  //   settled) — CASH OUT and BET AGAIN occupy the same physical region
  //   so muscle memory carries between act-now decisions (UX audit
  //   2026-05-21: every dominant crash UI places action controls at the
  //   bottom, never in a corner)
  // - no secondary panels in-canvas during gameplay — the curve owns the
  //   stage; ambient social signal (cohort feed) was removed because it
  //   occluded the curve in the upper-right when the multiplier climbed
  const centeredCardPhase = state.phase.kind === 'lobby' || state.phase.kind === 'bet-entry'
  const bottomBarPhase =
    state.phase.kind === 'round-active' ||
    state.phase.kind === 'settling' ||
    state.phase.kind === 'settled'
  const slotsElapsed =
    state.roundActiveSlot && state.currentSlot >= state.roundActiveSlot
      ? Number(state.currentSlot - state.roundActiveSlot)
      : 0

  const roundIdLabel = `R${String(controller.state.history.length + 1).padStart(4, '0')}`
  // Session P&L for RG visibility (NN/g Heuristic #1 + the cooling-tap
  // pattern). Lets the player see their cumulative position at a glance so
  // they're never deep-in-the-hole without realising. Computed off the
  // session-start balance, which is `INITIAL_BALANCE` from the provider.
  const SESSION_START_LAMPORTS = 1_000_000_000n
  const sessionDeltaLamports = state.balanceLamports - SESSION_START_LAMPORTS
  const sessionRounds = state.history.length
  // Settled-outcome props for the canvas. The canvas needs both the crash
  // point (for the CRASHED stamp / the "would-have-crashed" ghost) and the
  // cash-out point (for the freeze + WIN stamp on a winning round).
  const settled = state.phase.kind === 'settled' ? state.phase.outcome : null
  const cashedOut = settled?.won ?? false
  const crashed = settled !== null && !settled.won
  const crashedBps = settled ? settled.crashBps : null
  const settledCrashSlot = settled ? settled.crashSlot : null
  const cashedOutAtBps = settled?.cashedOutAtBps ?? null
  const cashedOutAtSlot = settled?.cashedOutAtSlot ?? null

  return (
    <div style={styles.page}>
      {/* DLv2 §2 cinematic header tape: mono-caps meta, ONE cyan 32px
          separator, ONE cyan-tinted highlight. The single accent moment of
          the eyebrow zone. */}
      <div className="pulse-header-tape" style={styles.headerTape}>
        {/* Back-to-catalogue control — Pulse ships isolated (immersive route,
            no platform shell), so it owns the exit. Top-left, first in the
            tape. */}
        <button
          type="button"
          onClick={() => router.push('/originals')}
          aria-label="Leave the game and return to the Originals catalogue"
          className="pulse-pressable"
          style={styles.backControl}
        >
          <span aria-hidden="true">‹</span> LOBBY
        </button>
        <span style={styles.tapeBrand}>PULSE</span>
        <HelpButton onClick={() => setShowInfo(true)} gameLabel={pulseOnboarding.gameLabel} />
        <button
          type="button"
          className="pulse-pressable"
          onClick={() => setSafetyOpen(true)}
          style={styles.safetyButton}
          aria-label="Safer play tools"
          title="Safer play"
        >
          <span aria-hidden="true">🛡</span>
        </button>
        <span style={styles.tapeMeta}>{phaseLabel}</span>
        <span style={styles.tapeMeta}>{roundIdLabel}</span>
        <span className="pulse-tape-separator" style={styles.tapeSeparator} aria-hidden="true" />
        <span className="pulse-tape-time" style={styles.tapeTime}>
          SLOT {slotsElapsed.toString().padStart(3, '0')}
        </span>
        {isRoundActive && (
          <span style={styles.liveBadge}>
            <span style={styles.liveDot} />
            LIVE
          </span>
        )}
        {/* Running session win/loss intentionally NOT shown in the always-on
            header — a constant P&L readout reads as confronting and can nudge
            chasing. The reality check (rounds + net position) lives on-demand in
            the Safer-Play panel (🛡) instead. */}
        {/* Operator rank chip — identity readout (rank title + lifetime rounds),
            opens the unlock showcase. NO in-round progress arc (proximity-to-next
            is a crash-RG dark pattern; progress lives in the player-initiated
            showcase). Shown from round ZERO so a brand-new player can see there
            IS a ladder to climb (grinding-QA H-1 fix). */}
        <button
          type="button"
          className="pulse-pressable"
          onClick={() => setShowcaseOpen(true)}
          style={styles.rankChip}
          aria-label={
            hasRounds
              ? `Operator rank ${operatorRank.tier.titleLab}, ${state.lifetimeRoundsPlayed.toString()} rounds played. Open rewards.`
              : 'Operator rank: not started. Open rewards to see the ladder.'
          }
        >
          <span className="pulse-rank-chip-title" style={styles.rankChipTitle}>
            {operatorRank.tier.titleLab}
          </span>
          <span className="pulse-rank-chip-signals" style={styles.rankChipSignals}>
            {hasRounds ? `${state.lifetimeRoundsPlayed.toString()} RDS` : 'TAP ↗'}
          </span>
        </button>
        <span style={styles.tapeBalance}>
          BALANCE · <span style={styles.tapeBalanceValue}>{formatUsdc(state.balanceLamports)}</span>
        </span>
      </div>

      {/* The round card — one continuous game stage. Canvas always spans
          the full width; the contextual control card lives as an absolute
          overlay INSIDE the canvas. Setup phases (lobby / bet-entry) get
          the centred overlay; game phases (round-active / settling /
          settled) get the top-right HUD. No layout shifts between states
          — only the overlay POSITION varies, not the canvas dimensions. */}
      <div style={styles.roundCard}>
        <div
          style={{
            ...styles.canvasShell,
            // Bezel frame cosmetic — applied as a CSS box-shadow + border when
            // equipped. This is the concrete HUD wiring: equipping the bezel
            // ACTUALLY changes the visual chrome around the canvas.
            ...(state.equippedHudBezel
              ? {
                  boxShadow:
                    'inset 0 0 0 2px rgba(41,230,255,0.55), inset 0 0 0 4px rgba(41,230,255,0.15), 0 0 24px rgba(41,230,255,0.12)',
                  border: '1px solid rgba(41,230,255,0.35)',
                }
              : undefined),
          }}
          data-testid="pulse-canvas-shell"
          data-bezel={state.equippedHudBezel ? 'on' : 'off'}
          className={
            state.phase.kind === 'settled' && state.phase.outcome.won
              ? 'pulse-cashout-celebrate'
              : state.phase.kind === 'settled' && !state.phase.outcome.won
                ? 'pulse-crash-shake'
                : undefined
          }
        >
          <PulseCurveCanvas
            roundActiveSlot={state.roundActiveSlot}
            authoritativeSlot={state.currentSlot}
            crashed={crashed}
            cashedOut={cashedOut}
            cashedOutAtBps={cashedOutAtBps}
            cashedOutAtSlot={cashedOutAtSlot}
            crashBps={crashedBps}
            crashSlot={settledCrashSlot}
            reducedMotion={reducedMotion}
            traceSkinRgb={traceSkinRgb}
          />
          {/* Quantum-observatory scene chrome — instrument plate frame,
              corner rivets, right-rail milestone etchings, ambient
              scanner line. Sits BETWEEN the curve canvas and the
              control overlays so the curve breathes underneath the
              chrome and the controls anchor ON the chrome. SCENE-
              REBUILD-CAMPAIGN-2026-05-26 §scene. */}
          <PulseSceneBackdrop
            reducedMotion={reducedMotion}
            roundActiveSlot={state.roundActiveSlot}
          />
          {centeredCardPhase && (
            <div
              className="pulse-overlay-center"
              style={styles.canvasOverlayCenter}
              aria-live="polite"
            >
              <div style={styles.overlayPanel}>
                <PhaseSurface controller={controller} liveMultiplierBps={liveMultiplierBps} />
              </div>
            </div>
          )}
          {bottomBarPhase && (
            <div
              className="pulse-overlay-bottom"
              style={styles.canvasOverlayBottom}
              aria-live="polite"
            >
              <div className="pulse-action-bar-panel" style={styles.actionBarPanel}>
                <PhaseSurface controller={controller} liveMultiplierBps={liveMultiplierBps} />
              </div>
            </div>
          )}
          {/* Cohort feed removed from the gameplay phases — it occluded the
              curve when the multiplier climbed into the upper-right zone,
              and competed with the player's attention during the cash-out
              decision (Tim 2026-05-21). The cohort signal lives on in
              session telemetry but is no longer rendered in-canvas. */}
          {/* Unlock showcase (S3) — an in-stage overlay opened from the rank
              chip. Displays the rank ladder / collection / record. Honest:
              shows EARNED/NEXT/locked, never fakes a mint. */}
          {/* Portaled to document.body so the fixed-position veil resolves
              against the true viewport, not the canvasShell (which receives
              transform keyframes from the crash-shake / cashout-celebrate
              classes that would otherwise trap a fixed child). This is what
              makes the engagement layer visible + scrollable on a 412px phone
              instead of clipped to the short canvas. */}
          {showcaseOpen &&
            typeof document !== 'undefined' &&
            createPortal(
              <PulseUnlockShowcase
                lifetimeSignals={state.lifetimeOwnershipPoints}
                lifetimeRounds={state.lifetimeRoundsPlayed}
                equippedTraceSkinId={state.equippedTraceSkinId}
                equippedAmbientTrackId={state.equippedAmbientTrackId}
                equippedHudBezel={state.equippedHudBezel}
                onEquip={controller.equipCosmetic}
                onUnequip={controller.unequipCosmetic}
                onClose={() => setShowcaseOpen(false)}
                reducedMotion={reducedMotion}
                history={state.history}
              />,
              document.body,
            )}
          {/* Rank-up banner (S5) — fires once on a threshold crossing, RG-C5
              byte-identical across ranks. Hidden while the showcase is open. */}
          {rankUpTier && !showcaseOpen && (
            <PulseRankUpBanner
              tier={rankUpTier}
              onDismiss={() => setRankUpTier(null)}
              onOpenShowcase={() => {
                setRankUpTier(null)
                setShowcaseOpen(true)
              }}
              reducedMotion={reducedMotion}
            />
          )}
        </div>
        {/* Below-canvas slim strip: RECENT chronology + optional status
            caption. Single line, low ink, never competing with the canvas. */}
        <div style={styles.gameFooter}>
          {isRoundActive && (
            <span style={styles.gameFooterStatus}>
              <span style={styles.gameFooterStatusMain}>CLIMBING</span>
              <span style={styles.gameFooterStatusMuted}>
                {slotsElapsed} SLOTS · CRASH POINT REVEALED AT SETTLEMENT
              </span>
            </span>
          )}
          <HistoryStrip rows={state.history} />
          <span className="sr-only" aria-live="polite">
            {formatMultiplier(liveMultiplierBps)}
          </span>
        </div>
      </div>
      <style>
        {shakeKeyframes}
        {PULSE_SCENE_KEYFRAMES}
      </style>
      <OnboardingOverlay
        sequence={pulseOnboarding}
        visible={onboarding.visible}
        onComplete={onboarding.markSeen}
        onDismiss={onboarding.markSeen}
      />
      <PulseSafetyPanel
        open={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        reduceMotion={userReduceMotion}
        onToggleReduceMotion={toggleReduceMotion}
        sessionRounds={sessionRounds}
        sessionNet={formatUsdc(sessionDeltaLamports < 0n ? -sessionDeltaLamports : sessionDeltaLamports)}
        sessionDown={sessionDeltaLamports < 0n}
        wagerCapUsd={wagerCapUsd}
        onCycleWagerCap={cycleWagerCap}
        onTakeABreak={takeABreak}
      />
      {showInfo && <PulseInfoOverlay onClose={() => setShowInfo(false)} />}
    </div>
  )
}

// ─── HOW TO PLAY overlay ─────────────────────────────────────────────────────
function PulseInfoOverlay({ onClose }: { readonly onClose: () => void }): ReactElement {
  return (
    <div
      style={infoStyles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label="How to play Pulse"
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
            Place a bet and the <strong style={{ color: T.accentSolid }}>PULSE</strong> starts
            climbing a multiplier. <strong style={{ color: T.accentSolid }}>CASH OUT</strong> before
            it <strong style={{ color: T.danger }}>crashes</strong> (flatlines) to win{' '}
            multiplier × your bet. Wait too long and it crashes first — you lose the bet.
          </p>

          <span style={infoStyles.head}>THE MOMENT</span>
          <p style={infoStyles.text}>
            The longer you hold, the higher the multiplier — and the bigger the risk it flatlines.
            The crash point is fixed by a random seed the instant you bet; it is hidden until it
            happens, so nothing reacts to how long you wait. It’s pure nerve: cash out early for a
            small sure win, or ride it for more.
          </p>

          <span style={infoStyles.head}>AUTO CASH-OUT</span>
          <p style={infoStyles.text}>
            Set a target multiplier and Pulse banks it for you automatically the moment it’s reached
            — handy if you can’t watch every beat. It pays exactly the same as cashing out by hand at
            that multiplier (agency, not an edge).
          </p>

          <span style={infoStyles.head}>SURVIVAL ODDS</span>
          <p style={infoStyles.text}>
            The readout shows your live chance of surviving to the next level, so the risk is always
            on the table — no hidden math.
          </p>

          <span style={infoStyles.head}>FAIR &amp; PAYBACK</span>
          <p style={infoStyles.text}>
            Pulse pays back ~95.5% over time (the rest is the house edge). Every settled round shows a
            Glass Box receipt with the seed, so you can verify the crash point was fixed before you
            played.
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
    background: 'rgba(7, 8, 12, 0.82)',
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
    background: 'linear-gradient(180deg, #0d1017, #07080c)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 18,
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  title: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.22em',
    color: T.textPrimary,
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
    border: '1px solid rgba(255,255,255,0.10)',
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
    color: T.accent,
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
    background: 'linear-gradient(180deg, #00F0FF, #00b8c4)',
    color: '#04121a',
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

function PhaseSurface({
  controller,
  liveMultiplierBps,
}: {
  controller: ReturnType<typeof usePulseController>
  liveMultiplierBps: bigint
}): ReactElement {
  const { state } = controller
  switch (state.phase.kind) {
    case 'lobby':
      return <Lobby controller={controller} />
    case 'bet-entry':
      return <BetEntry controller={controller} />
    case 'round-active':
      return <RoundActive controller={controller} liveMultiplierBps={liveMultiplierBps} />
    case 'settling':
      return <Settling controller={controller} />
    case 'settled':
      return <Settlement controller={controller} />
  }
}

function Lobby({
  controller,
}: {
  controller: ReturnType<typeof usePulseController>
}): ReactElement {
  // Brand §1.3 — "quiet expert at the table." The lobby is one sentence
  // of intent, one action. The explainer paragraph belonged to a help
  // tooltip, not the surface. Glass Box is the verifier; the lobby
  // doesn't need to plead the case.
  return (
    <div style={styles.controlCard}>
      <div style={styles.lobbyHero}>
        <span style={styles.lobbyTitle}>ENTER THE CURVE</span>
        <span style={styles.lobbyTagline}>commit, climb, cash out before it crashes.</span>
      </div>
      {/* RTP disclosure surface — brand register: quiet expert at the table,
       *  honesty differentiator vs the rest of the casino industry. HOUSE_EDGE_BPS
       *  = 450n (pulseMath.ts) → RTP 95.5% · house edge 4.5%. We publish the
       *  number; the industry hides theirs. */}
      <div style={styles.rtpDisclosure} data-testid="pulse-rtp-disclosure">
        <div style={styles.rtpDisclosureRow}>
          <span style={styles.rtpDisclosureLabel}>RTP</span>
          <span style={styles.rtpDisclosureValue}>95.5%</span>
        </div>
        <div style={styles.rtpDisclosureRow}>
          <span style={styles.rtpDisclosureLabel}>HOUSE EDGE</span>
          <span style={styles.rtpDisclosureValueMuted}>4.5%</span>
        </div>
        <p style={styles.rtpDisclosureFootnote}>
          house edge applied to every curve · verifiable in the Glass Box receipt after each round.
          most casinos hide this number.
        </p>
      </div>
      <PrimaryButton onClick={controller.openBetEntry} primaryLabel="Place a wager">
        place a wager →
      </PrimaryButton>
    </div>
  )
}

function BetEntry({
  controller,
}: {
  controller: ReturnType<typeof usePulseController>
}): ReactElement {
  const { state } = controller
  const insufficient = state.wagerLamports > state.balanceLamports
  const autoEnabled = state.autoCashoutBps !== null
  // Auto-presets grow with rank: +1 slot at rank 3, +2 at rank 9. The extra
  // slots are blank until the player sets them — EV-identical by construction.
  const autoPresets = buildAutoPresets(state.extraPresetSlots)
  return (
    <div style={styles.controlCard}>
      {/* Hero — the wager IS the focal point. Vertically stacked + centered
          so the digits dominate exactly like the in-canvas hero multiplier.
          Native spinner buttons stripped (CSS at the bottom of this file)
          so the number reads as a precision instrument, not a form field. */}
      <div style={styles.wagerHero}>
        <span style={styles.wagerEyebrow}>YOUR WAGER</span>
        <input
          id="wager-input"
          className="pulse-wager-input"
          type="number"
          min={0.1}
          step={1}
          value={Number(state.wagerLamports) / 1_000_000}
          onChange={(e) => {
            const usd = Number(e.target.value)
            if (Number.isFinite(usd) && usd >= 0) {
              controller.setWager(BigInt(Math.floor(usd * 1_000_000)))
            }
          }}
          style={styles.wagerAmountInput}
          aria-label="Wager amount in USDC"
        />
        <span style={styles.wagerAmountUnit}>USDC</span>
      </div>

      {/* Quick picks — five-column grid, sized so chips never wrap. The
          selected chip is the single cyan-fill moment per DLv2 §5 / §8 job 3
          (this surface's filled featured slot). */}
      <div style={styles.quickPickRow}>
        {WAGER_PRESETS.map((p) => {
          const selected = state.wagerLamports === p.value
          return (
            <button
              key={p.label}
              type="button"
              className="pulse-pressable"
              onClick={() => controller.setWager(p.value)}
              style={selected ? styles.quickPickSelected : styles.quickPick}
              aria-pressed={selected}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Auto cash-out — the status reads at a glance, the multiplier picker
          is below. No explainer copy — the label + status carries it. */}
      <div style={styles.autoBlock}>
        <div style={styles.autoHeader}>
          <span style={styles.autoLabel}>AUTO CASH-OUT</span>
          <span
            style={{
              ...styles.autoStatus,
              color: autoEnabled ? T.accent : T.textDim,
            }}
          >
            {autoEnabled ? formatMultiplier(state.autoCashoutBps!) : 'OFF'}
          </span>
        </div>
        <div style={styles.quickPickRow}>
          {autoPresets.map((p, i) => {
            const selected = state.autoCashoutBps === p.value && p.value !== null
            // Use index as key since blank extra slots share the same label "—".
            return (
              <button
                key={`${p.label}-${i}`}
                type="button"
                className="pulse-pressable"
                onClick={() => controller.setAutoCashout(p.value)}
                style={selected ? styles.quickPickSelected : styles.quickPick}
                aria-pressed={selected}
                aria-label={
                  p.value === null && p.label === '·'
                    ? 'Blank preset slot (unlocked by rank)'
                    : p.label
                }
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer — balance reads as quiet metadata, two columns instead of a
          dot-separator string (AI-tell). CTA is "COMMIT →" with the amount
          already in the hero above — no overflow, no redundant repetition. */}
      <div style={styles.betFooter}>
        <div style={styles.betFooterStats}>
          <div style={styles.betFooterStat}>
            <span style={styles.betFooterStatLabel}>BALANCE</span>
            <span style={styles.betFooterStatValue}>{formatUsdc(state.balanceLamports)}</span>
          </div>
          <div style={styles.betFooterStat}>
            <span style={styles.betFooterStatLabel}>MIN</span>
            <span style={styles.betFooterStatValue}>{formatUsdc(MIN_WAGER)}</span>
          </div>
          {/* RTP disclosure at the commit moment (casino-fairness H-1): the
              house edge is shown before the player locks in, not just in lobby. */}
          <div style={styles.betFooterStat} data-testid="pulse-rtp-disclosure-betentry">
            <span style={styles.betFooterStatLabel}>RTP · EDGE</span>
            <span style={styles.betFooterStatValue}>95.5% · 4.5%</span>
          </div>
        </div>
        <div style={styles.betFooterActions}>
          <button type="button" onClick={controller.closeBetEntry} style={styles.linkButton}>
            cancel
          </button>
          <button
            type="button"
            className="pulse-pressable"
            onClick={() => {
              controller.placeBet().catch(() => undefined)
            }}
            disabled={insufficient}
            style={insufficient ? styles.commitButtonDisabled : styles.commitButton}
            aria-label={`Commit ${formatUsdc(state.wagerLamports)} wager`}
          >
            commit →
          </button>
        </div>
      </div>
    </div>
  )
}

function RoundActive({
  controller,
  liveMultiplierBps,
}: {
  controller: ReturnType<typeof usePulseController>
  liveMultiplierBps: bigint
}): ReactElement {
  const { state } = controller
  const potential = settlePayout(state.wagerLamports, liveMultiplierBps)
  // Perfect-hit live indicator. Module-const milestone set + band (RG-C5
  // SAFE — same milestones every round). When the curve is inside a band,
  // the player sees a "PERFECT WINDOW" eyebrow flash + the cash-out chest
  // brightens. Cashing out NOW lands the 1.05-1.15× ramp baked into the
  // outcome's payout.
  const inPerfectWindow = isPerfectHit(liveMultiplierBps)
  const nearestMilestone = nearestPerfectMilestoneBps(liveMultiplierBps)
  // Signature "Vitals" instrument: the HONEST conditional odds the live curve
  // reaches the next target (m / T). Display-only, EV-neutral — radical
  // transparency, the "most casinos hide this number" brand made literal.
  const vitalsTarget = nextVitalsTargetBps(liveMultiplierBps)
  const vitalsOdds = vitalsTarget !== null ? survivalOddsBps(liveMultiplierBps, vitalsTarget) : null
  // Bottom action bar: wager + auto-cashout state on the left, the BIG
  // CASH OUT button on the right where the player's read/finger exits.
  // Per UX audit 2026-05-21: the CASH OUT is the genre's defining moment;
  // it lives bottom-right inside the canvas across all action phases so
  // muscle memory carries from CASH OUT → BET AGAIN without re-orienting.
  return (
    <div className="pulse-action-bar" style={styles.actionBar}>
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span
            style={{
              ...styles.actionBarEyebrow,
              color: T.accent,
            }}
          >
            {inPerfectWindow ? 'PERFECT WINDOW' : 'ROUND ACTIVE'}
          </span>
          <span style={styles.actionBarSub}>
            {inPerfectWindow && nearestMilestone !== null
              ? `within range of ${formatMultiplier(nearestMilestone)} · your call`
              : 'live round · crash point unrevealed'}
          </span>
        </div>
        <div style={styles.actionBarInfo}>
          <Stat label="Your wager" value={formatUsdc(state.wagerLamports)} />
          <Stat label="Cash out at" value={formatUsdc(potential)} valueColor={T.accent} emphasis />
          {vitalsTarget !== null && vitalsOdds !== null && (
            <Stat
              label={`Holds to ${formatMultiplier(vitalsTarget)}`}
              value={formatOddsPct(vitalsOdds)}
              valueColor={T.textMuted}
            />
          )}
          {state.autoCashoutBps !== null && (
            <Stat
              label="Auto"
              value={formatMultiplier(state.autoCashoutBps)}
              valueColor={T.accent}
            />
          )}
        </div>
        {/* PULSE-ART-DIRECTION-2026-05-25 §3.4 — in-canvas commit-reveal
            hash audit readout. The pre-published server-seed-hash is the
            literal "exposed engine" of BRAND_KIT §1.4 glass-box
            transparency; surfaced HERE from round-active forward so the
            player sees the commitment before they cash out, not buried
            in a "view receipt" expansion after the round. */}
        {state.liveAudit && <AuditReadout audit={state.liveAudit} verified={false} />}
      </div>
      <div style={styles.actionBarRight}>
        <button
          type="button"
          // Press-ack haptic at physical contact (8ms, RG-C5 const) so the
          // player FEELS the tap land — closes the dead-tap gap before the
          // outcome. Haptic ONLY: cashOut still dispatches on onClick so a
          // scroll-cancel can never fire an accidental cash-out (crash-genre
          // hazard). touch-action:manipulation removes the 300ms tap delay.
          onPointerDown={() => safeVibrate(HAPTIC_PRESS_MS)}
          onClick={controller.cashOut}
          aria-label={`Cash out at ${formatMultiplier(liveMultiplierBps)} for ${formatUsdc(potential)}${
            inPerfectWindow ? ' (perfect window)' : ''
          }`}
          className="pulse-cash-out-button"
          style={inPerfectWindow ? styles.cashOutButtonPerfect : styles.cashOutButton}
        >
          <span style={styles.cashOutLabel}>
            {inPerfectWindow ? 'Cash out · PERFECT' : 'Cash out'}
          </span>
          <span style={styles.cashOutSub}>
            {formatUsdc(potential)} at {formatMultiplier(liveMultiplierBps)}
          </span>
        </button>
      </div>
    </div>
  )
}

/**
 * PULSE-ART-DIRECTION-2026-05-25 §3.4 — the in-canvas commit-reveal
 * hash audit readout, rendered inside the bottom action bar. This is
 * the literal "glass-box transparency as an in-scene instrument
 * readout" — pre-published server-seed-hash + chain-root + round-id
 * surfaced from round-active forward, with the revealed server-seed
 * + a verify chip slotting in at settle.
 *
 * Typography: Geist Mono 10px mono-caps tabular-nums; hex strings
 * shortened to 6+6 so the row stays compact on a 393px-wide mobile
 * viewport.
 */
function AuditReadout({
  audit,
  verified,
}: {
  audit: { serverSeedHashHex: string; clientSeedChainRootHex: string; roundIdHex: string }
  verified: boolean
}): ReactElement {
  return (
    <div style={styles.auditReadout} aria-label="Glass Box commit-reveal audit">
      <span style={styles.auditRow}>
        <span style={styles.auditLabel}>HASH</span>
        <code style={styles.auditValue}>{shortAuditHex(audit.serverSeedHashHex)}</code>
      </span>
      <span style={styles.auditRow}>
        <span style={styles.auditLabel}>CHAIN</span>
        <code style={styles.auditValue}>{shortAuditHex(audit.clientSeedChainRootHex)}</code>
      </span>
      <span style={styles.auditRow}>
        <span style={styles.auditLabel}>ROUND</span>
        <code style={styles.auditValue}>{shortAuditHex(audit.roundIdHex)}</code>
      </span>
      {verified && (
        <span style={styles.auditVerifyChip} aria-label="commitment verified">
          <span aria-hidden="true">✓</span> verified
        </span>
      )}
    </div>
  )
}

function shortAuditHex(hex: string): string {
  if (hex.length <= 14) return hex
  return `${hex.slice(0, 6)}…${hex.slice(-6)}`
}

function Settling({
  controller,
}: {
  controller: ReturnType<typeof usePulseController>
}): ReactElement {
  // Bottom action bar with verifying spinner — same position as the CASH
  // OUT was a moment ago, so the player's eye doesn't have to re-orient
  // during the brief verify gap. The audit panel persists so the player
  // sees the same hash commitment through the settle gap.
  const { state } = controller
  return (
    <div className="pulse-action-bar" style={styles.actionBar} aria-live="assertive">
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span style={styles.actionBarEyebrow}>SETTLING</span>
          <span style={styles.actionBarSub}>verifying the round seed on-chain</span>
        </div>
        {state.liveAudit && <AuditReadout audit={state.liveAudit} verified={false} />}
      </div>
      <div style={styles.actionBarRight}>
        <span style={styles.spinner} aria-hidden="true" />
      </div>
    </div>
  )
}

function Settlement({
  controller,
}: {
  controller: ReturnType<typeof usePulseController>
}): ReactElement {
  // Settled card — lives in the SAME top-right HUD slot as Lobby / BetEntry /
  // RoundActive cards. One persistent card position across the entire game
  // lifecycle (Tim 2026-05-21: stop the UI from changing between states).
  // Vertical layout matches the other phase cards.
  const { state } = controller
  const [verified, setVerified] = useState<bigint | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const outcome = state.phase.kind === 'settled' ? state.phase.outcome : null
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
      .reverifyCrashBps(
        outcome.serverSeedHex,
        outcome.clientSeedChainRootHex,
        outcome.roundIdHex,
        outcome.mixerHex,
      )
      .then((bps) => {
        if (!cancelled) setVerified(bps)
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
    // Depend on the STABLE reverifyCrashBps callback, not the whole controller
    // object (which is a fresh literal each render → re-verify flicker). H-2 fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, controller.reverifyCrashBps])
  if (!outcome) return <></>
  const won = outcome.won
  const wager = state.wagerLamports
  const insufficient = wager > state.balanceLamports
  const matches = verified !== null && verified === outcome.crashBps
  const headlineBps = won ? (outcome.cashedOutAtBps ?? 10_000n) : outcome.crashBps
  const deltaLamports = won ? outcome.payoutLamports - wager : wager
  const deltaSign = won ? '+' : '−'
  const pointsEarned = pointsForBet(wager, won)
  const pointsMultLabel = won ? '1.0× on the win' : '1.5× loss-amplified'
  // Narrative settlement copy — OO-FISHER bar. Bucketed by outcome
  // magnitude; pickVariant chooses deterministically from the pool so the
  // same outcome always reads the same line. Module-const pools = RG-C5
  // SAFE (identical visual amplitude across buckets; words change, ramp
  // does not).
  const narrative = settlementNarrative(headlineBps, won)
  const isPerfect = won && outcome.perfectMilestoneBps !== null
  // Bottom action bar — same position as the CASH OUT button was a beat
  // ago, so muscle memory carries the player's hand from cash-out tension
  // to bet-again without re-orienting.
  return (
    <div
      className="pulse-action-bar"
      data-testid="pulse-settlement-card"
      style={styles.actionBar}
      aria-live="polite"
      aria-label={
        won
          ? `Cashed out at ${formatMultiplier(headlineBps)}, won ${formatUsdc(deltaLamports)} USDC, verified client-side`
          : `Busted at ${formatMultiplier(headlineBps)}, lost ${formatUsdc(deltaLamports)} USDC, verified client-side`
      }
    >
      <div style={styles.actionBarLeft}>
        <div style={styles.actionBarHeader}>
          <span
            style={{
              ...styles.actionBarEyebrow,
              color: won ? T.accent : T.danger,
            }}
          >
            {isPerfect ? 'PERFECT READ' : won ? 'CASHED OUT' : 'BUSTED'}
          </span>
          <span style={styles.actionBarSub}>{narrative}</span>
        </div>
        <div style={styles.actionBarInfo}>
          <span
            style={{
              ...styles.actionBarMultiplier,
              color: won ? T.accent : T.danger,
            }}
          >
            {formatMultiplier(headlineBps)}
          </span>
          <span
            style={{
              ...styles.actionBarDelta,
              color: won ? T.accent : T.danger,
            }}
          >
            {deltaSign}
            {formatUsdc(deltaLamports)}
          </span>
        </div>
        {/* Perfect-hit bonus made VISIBLE as a payout effect (jesse comprehension
            fix): the player nailed a milestone and a fixed bonus is baked into
            the payout. RG-C5 SAFE — factual, module-const bonus, no escalation. */}
        {isPerfect && outcome.perfectMilestoneBps !== null && (
          <span style={{ ...styles.actionBarSub, color: T.accent }}>
            perfect read · nailed {formatMultiplier(outcome.perfectMilestoneBps)} · +
            {(Number(outcome.perfectBonusBps - ONE_X_BPS) / 100).toFixed(0)}% bonus signals
          </span>
        )}
        {/* PULSE-ART-DIRECTION-2026-05-25 §3.4 — the same in-canvas audit
            readout shown during round-active, now displaying the revealed
            commit + the verify chip after the client-side re-derivation
            matches. The chip is the cyan verify accent (DLv2 §1 P8 job 3
            — recommendation accent, "the proof is here"). */}
        <AuditReadout
          audit={{
            serverSeedHashHex: outcome.serverSeedHashHex,
            clientSeedChainRootHex: outcome.clientSeedChainRootHex,
            roundIdHex: outcome.roundIdHex,
          }}
          verified={matches}
        />
        <p style={styles.actionBarFootnote}>
          <span style={styles.settledPointsValue}>+{formatPoints(pointsEarned)}</span>
          <span style={styles.settledPointsLabel}>ownership points</span>
          <span style={styles.settledPointsMult}>· {pointsMultLabel}</span>
          {verifying && <span style={styles.settledVerifyText}>verifying…</span>}
          {!verifying && matches && (
            <span style={styles.settledVerifyChip}>
              <span aria-hidden="true">✓</span> verified
            </span>
          )}
          {!verifying && verified !== null && !matches && (
            <span style={styles.settlementVerifyMismatch}>
              ⚠ mismatch · re-derived {formatMultiplier(verified)}
            </span>
          )}
          {/* Glass-box receipt is ALWAYS openable — the player's commit-reveal
              seeds are their independent evidence and must never be gated behind
              a passing client-side check (casino-fairness H-2). */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="settled-receipt"
            style={styles.settledVerifyToggle}
          >
            {expanded ? 'hide receipt ↑' : 'view receipt ↓'}
          </button>
        </p>
      </div>
      <div style={styles.actionBarRight}>
        {/* Full inline wager editor — quick presets + fine stepper, right on the
            foreground. No detour to a separate "change wager" screen. */}
        <div style={styles.settledWagerAdjust}>
          <span style={styles.settledWagerAdjustLabel}>NEXT BET</span>
          <div style={styles.settledPresetRow}>
            {WAGER_PRESETS.map((p) => {
              const active = state.wagerLamports === p.value
              return (
                <button
                  key={p.label}
                  type="button"
                  className="pulse-pressable"
                  onClick={() => controller.setWager(p.value)}
                  style={active ? styles.settledPresetChipActive : styles.settledPresetChip}
                  aria-label={`Set next bet to ${p.label} USDC`}
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
              className="pulse-pressable"
              onClick={() => controller.setWager(stepWagerDown(state.wagerLamports))}
              style={styles.wagerStepBtn}
              aria-label="Decrease next bet"
            >
              −
            </button>
            <AnimatedUsdc lamports={state.wagerLamports} style={styles.settledWagerValue} />
            <button
              type="button"
              className="pulse-pressable"
              onClick={() => controller.setWager(stepWagerUp(state.wagerLamports))}
              style={styles.wagerStepBtn}
              aria-label="Increase next bet"
            >
              +
            </button>
          </div>
        </div>
        <button
          type="button"
          className="pulse-pressable"
          onClick={() => {
            controller.placeBet().catch(() => undefined)
          }}
          disabled={insufficient}
          style={insufficient ? styles.settledBetAgainDisabled : styles.settledBetAgain}
          aria-label={`Bet again, ${formatUsdc(wager)}`}
        >
          bet again →
        </button>
        <div style={styles.settledSecondaryActions}>
          <button
            type="button"
            onClick={controller.acknowledgeSettlement}
            style={styles.settledChangeLink}
          >
            auto cash-out
          </button>
          <button
            type="button"
            onClick={() => sharePulseResult(won, headlineBps, deltaLamports)}
            style={styles.settledShareLink}
            aria-label="Share this result"
          >
            share ↗
          </button>
        </div>
      </div>
      {insufficient && (
        <span style={{ ...styles.settlementHelp, gridColumn: '1 / -1' }}>
          balance below {formatUsdc(wager)} — lower your wager to continue.
        </span>
      )}
      {expanded && (
        <div id="settled-receipt" style={{ ...styles.settledReceipt, gridColumn: '1 / -1' }}>
          <p style={styles.settledReceiptSummary}>
            SHA-256(server_seed ‖ chain_root ‖ round_id ‖ mixer) → crash inverse-CDF · house
            edge 4.5% · floor 1.10× · cap 200×
          </p>
          <p style={styles.settledReceiptSummary}>
            derived from <code style={styles.settlementHex}>{shortHex(outcome.serverSeedHex)}</code>{' '}
            seed +{' '}
            <code style={styles.settlementHex}>{shortHex(outcome.clientSeedChainRootHex)}</code>{' '}
            chain root
          </p>
          <dl style={styles.settlementReceiptRows}>
            <Row label="round id" value={outcome.roundIdHex} />
            <Row label="server seed hash" value={outcome.serverSeedHashHex} />
            <Row label="server seed" value={outcome.serverSeedHex} />
            <Row label="chain root" value={outcome.clientSeedChainRootHex} />
            <Row label="mixer" value={outcome.mixerHex} />
          </dl>
        </div>
      )}
    </div>
  )
}

/**
 * The settlement bar — full-width strip directly below the canvas. Shows the
 * outcome summary, the BET AGAIN primary action, and the change-wager
 * escape hatch. Lives where the eye is post-crash / post-cash-out, instead
 * of competing for attention on the right rail.
 */
/** Abbreviate a long hex string as `ccf5ba5006…221de16b50` (first 10 + last 10). */
function shortHex(hex: string): string {
  if (hex.length <= 22) return hex
  return `${hex.slice(0, 10)}…${hex.slice(-10)}`
}

/**
 * Share a Pulse round result. Builds a tweet-ready string + opens the
 * platform's native share sheet (mobile / desktop with Web Share API) or
 * falls back to a Twitter intent. Captures the moment in the player's
 * voice so the share reads as a player share, not a casino brag.
 *
 * The full "action shot with Swoobz logo" capture is a separate roadmap
 * item — this lands the text+link share now so the loop is closed.
 */
function sharePulseResult(won: boolean, headlineBps: bigint, deltaLamports: bigint): void {
  const mult = formatMultiplier(headlineBps)
  const amount = formatUsdc(deltaLamports)
  const text = won
    ? `cashed out at ${mult} on Pulse · +${amount}\nprovably fair, on-chain. swoobz.com/originals/pulse`
    : `pulled ${mult} on Pulse · provably fair, on-chain · swoobz.com/originals/pulse`
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

function HistoryStrip({
  rows,
}: {
  rows: { crashBps: bigint; won: boolean; cashedOutAtBps: bigint | null }[]
}): ReactElement {
  if (rows.length === 0) return <></>
  // Chronology cue: the newest chip carries a leading hairline tick (so the
  // eye knows where to start) and older chips fade by index. RG-C3 safe —
  // win chips keep their cyan accent but the alpha follows their position,
  // so a stale 14.98x can't out-shout the most recent round.
  const visible = rows.slice(0, 14)
  return (
    <div style={styles.historyStrip} aria-label="recent rounds">
      <span style={styles.historyLabel}>recent</span>
      {visible.map((r, i) => {
        const ageAlpha = 1 - (i / Math.max(1, visible.length)) * 0.5
        const accentTint = `rgba(0, 240, 255, ${0.18 * ageAlpha})`
        const accentBorder = `rgba(0, 240, 255, ${0.32 * ageAlpha})`
        const lossTint = `rgba(255, 255, 255, ${0.04 * ageAlpha})`
        return (
          <span
            key={i}
            style={{
              ...styles.historyChip,
              background: r.won ? accentTint : lossTint,
              color: r.won ? T.accent : T.textMuted,
              borderColor: r.won ? accentBorder : T.borderSubtle,
              opacity: ageAlpha,
            }}
            title={
              r.won
                ? `won at ${r.cashedOutAtBps ? formatMultiplier(r.cashedOutAtBps) : '?'} · crashed at ${formatMultiplier(r.crashBps)}`
                : `crashed at ${formatMultiplier(r.crashBps)}`
            }
          >
            {i === 0 && <span style={styles.historyTick} aria-label="most recent" />}
            {formatMultiplier(r.crashBps)}
          </span>
        )
      })}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): ReactElement {
  const display = value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-10)}` : value
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
}: {
  label: string
  value: string
  valueColor?: string
  emphasis?: boolean
}): ReactElement {
  return (
    <div style={styles.statBlock}>
      <span className="pulse-stat-label" style={styles.statLabel}>
        {label}
      </span>
      <span
        className="pulse-stat-value"
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

function Label({
  htmlFor,
  children,
}: {
  htmlFor?: string
  children: React.ReactNode
}): ReactElement {
  return (
    <label htmlFor={htmlFor} style={styles.label}>
      {children}
    </label>
  )
}

function PresetButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={selected ? styles.presetButtonSelected : styles.presetButton}
    >
      {children}
    </button>
  )
}

function PrimaryButton({
  onClick,
  disabled,
  primaryLabel,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  primaryLabel?: string
  children: React.ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      className="pulse-pressable"
      onClick={onClick}
      disabled={disabled}
      aria-label={primaryLabel}
      style={disabled ? styles.primaryButtonDisabled : styles.primaryButton}
    >
      {children}
    </button>
  )
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}): ReactElement {
  return (
    <button
      type="button"
      className="pulse-pressable"
      onClick={onClick}
      style={styles.secondaryButton}
    >
      {children}
    </button>
  )
}

const shakeKeyframes = `
@keyframes pulse-crash-shake-kf {
  0%   { transform: translate3d(0,0,0); }
  10%  { transform: translate3d(-9px,3px,0); }
  22%  { transform: translate3d(7px,-4px,0); }
  35%  { transform: translate3d(-6px,4px,0); }
  48%  { transform: translate3d(5px,-3px,0); }
  62%  { transform: translate3d(-3px,2px,0); }
  76%  { transform: translate3d(2px,-1px,0); }
  100% { transform: translate3d(0,0,0); }
}
.pulse-crash-shake { animation: pulse-crash-shake-kf 520ms ease-out 1; }
@keyframes pulse-cashout-celebrate-kf {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.014); }
  100% { transform: scale(1); }
}
.pulse-cashout-celebrate { animation: pulse-cashout-celebrate-kf 460ms ease-out 1; }
/* DLv2 §10 LIVE pulse exception — only allowed inside the LIVE status pill. */
@keyframes pulse-live-heartbeat {
  0%, 100% { transform: scale(1);   opacity: 1;   }
  50%      { transform: scale(1.4); opacity: 0.55; }
}
/* Phase-transition entrance — the player asked for less "flicker into
   action" when state changes. Card lifts up + fades in over 260ms with
   the Material expressive curve. */
@keyframes pulse-card-enter {
  0%   { opacity: 0; transform: translate3d(0, 6px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0,   0); }
}
/* Mobile HUD bumps — OO-FISHER pattern. On viewports ≤ 480px the action
   bar paddings, label sizes, and value sizes inflate proportionally so the
   pill stays legible on Pixel 7 / iPhone 14. Module-const breakpoint +
   amplitudes (RG-C5 SAFE — structural, not state-driven). */
@media (max-width: 480px) {
  .pulse-action-bar {
    padding: 14px 18px !important;
  }
  .pulse-action-bar-eyebrow {
    font-size: 11px !important;
  }
  .pulse-action-bar-multiplier {
    font-size: 30px !important;
  }
  .pulse-action-bar-delta {
    font-size: 22px !important;
  }
  .pulse-cash-out-button {
    padding: 22px 18px !important;
    font-size: 15px !important;
  }
  .pulse-stat-label {
    font-size: 10px !important;
  }
  .pulse-stat-value {
    font-size: 18px !important;
  }
}
/* Layout reanchor for phones, narrow windows, and small tablets (<=900px):
   collapse the header tape; drop the bet-entry + action bar to full-width
   bottom strips so CASH OUT sits at thumb-center. Desktop (>=901px) keeps the
   compact right-corner card. Wider than the 480px font block above because a
   narrow desktop window or small tablet needs the same reanchor (the 688px
   report fell into this gap). */
@media (max-width: 900px) {
  .pulse-header-tape { gap: 8px !important; }
  .pulse-tape-separator { display: none !important; }
  .pulse-tape-time { display: none !important; }
  .pulse-rank-chip-signals { display: none !important; }
  .pulse-rank-chip-title { max-width: 10ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pulse-overlay-center { align-items: flex-end !important; padding: 0 !important; }
  .pulse-overlay-center > * { width: 100% !important; border-radius: 0 0 14px 14px !important; }
  .pulse-overlay-bottom { left: 0 !important; right: 0 !important; bottom: 0 !important; max-width: 100% !important; }
  .pulse-action-bar-panel { max-width: 100% !important; }
}
/* Strip the native number-input spinner buttons on the wager hero.
   Without this the spinners hijack the visual register and the wager
   reads as a generic form field rather than the in-canvas-twin
   precision instrument the design calls for. WebKit needs pseudo-element
   targeting; Firefox honors appearance:textfield (set inline). */
.pulse-wager-input::-webkit-outer-spin-button,
.pulse-wager-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.pulse-wager-input {
  appearance: textfield;
}
.pulse-wager-input::selection {
  background: rgba(0, 240, 255, 0.30);
  color: #ffffff;
}
/* A11Y — visible focus indicator (bone, never cyan-on-cyan). WCAG 2.4.7. */
.pulse-wager-input:focus-visible,
.pulse-pressable:focus-visible,
.pulse-cash-out-button:focus-visible {
  outline: 3px solid #F2F3EF;
  outline-offset: 3px;
}
/* P0 ship-gate — Input Reactivity (Dim 1). Pure-CSS press-bounce on the
   control family + desktop hover-glow. Compositor-only (transform / filter),
   zero JS, zero re-render. Press amplitudes are fixed here (RG-C5: identical
   on wager 1 and wager 50, never streak-scaled). The cash-out is the crash
   genre's tension anchor, so it gets its own decisive press. :not(:disabled)
   keeps inert controls from acknowledging a press. */
.pulse-cash-out-button { transition: transform 80ms cubic-bezier(0.4,0,0.2,1), filter 120ms ease; touch-action: manipulation; }
.pulse-cash-out-button:active:not(:disabled) { transform: scale(0.97); transition: transform 50ms cubic-bezier(0.4,0,0.2,1); }
.pulse-pressable { transition: transform 80ms cubic-bezier(0.4,0,0.2,1), filter 120ms ease; touch-action: manipulation; }
.pulse-pressable:active:not(:disabled) { transform: scale(0.96); transition: transform 50ms cubic-bezier(0.4,0,0.2,1); }
@media (hover: hover) {
  .pulse-cash-out-button:hover:not(:disabled) { filter: brightness(1.10); }
  .pulse-pressable:hover:not(:disabled) { filter: brightness(1.08); }
}
@media (prefers-reduced-motion: reduce) {
  .pulse-crash-shake, .pulse-cashout-celebrate { animation: none; }
  .pulse-cash-out-button, .pulse-pressable { transition: none; }
  .pulse-cash-out-button:active, .pulse-pressable:active { transform: none; }
  /* Global guard — kills inline-style animations too (liveDot heartbeat,
     card-enter), which a class-scoped rule can't reach. !important beats a
     normal inline style. One-shot anims settle on their end (visible) state. */
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
}
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
`

const styles: Record<string, CSSProperties> = {
  page: {
    fontFamily: T.fontBody,
    color: T.textPrimary,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    // Immersive route: fill the full-viewport shell (PlatformFrame gives the
    // 100dvh constraint) so the game NEVER floats in a sea of dead space.
    // The roundCard below grows (flex:1) to absorb the remaining height.
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
    padding: 'clamp(10px, 2vw, 20px)',
  },
  // Back-to-catalogue control (immersive exit) — dark-glass + cyan hairline,
  // compact so it never competes with the wordmark.
  backControl: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    padding: '6px 12px',
    background: '#161A23',
    border: '1px solid rgba(41, 230, 255, 0.30)',
    borderRadius: 6,
    color: T.textMuted,
    fontFamily: T.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  safetyButton: {
    width: 44,
    height: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: T.textMuted,
    fontSize: 14,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  // Cinematic header tape.
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
  // The one 32px × 1px cyan separator — DLv2 §2 single accent moment.
  tapeSeparator: {
    display: 'inline-block',
    width: 32,
    height: 1,
    background: T.accentSolid,
  },
  // The cyan-tinted time / highlight token, paired with the separator.
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
  // DLv2 §10 LIVE pulse exception — the heartbeat dot is allowed inside a
  // status pill at the header tape, since LIVE is genuine state.
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: T.accentSolid,
    boxShadow: `0 0 8px ${T.accentSolid}`,
    animation: 'pulse-live-heartbeat 1.6s ease-in-out infinite',
  },
  // Operator rank chip — a compact instrument bezel readout in the header
  // tape. Cyan is Pulse's native accent (no warm ground = no warm+cyan
  // conflict). Identity only: rank title + lifetime signals, NO progress arc.
  rankChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    // 44px hit area (Apple HIG / WCAG 2.5.8) — the sole entry to the engagement
    // layer. touch-action removes the 300ms tap delay. The flex-wrap tape
    // self-fits the taller chip.
    minHeight: 44,
    padding: '12px 9px',
    background: '#161A23',
    border: '1px solid rgba(41, 230, 255, 0.38)',
    borderRadius: 6,
    cursor: 'pointer',
    touchAction: 'manipulation',
    fontFamily: T.fontMono,
  },
  rankChipTitle: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.16em',
    color: T.accent,
    textTransform: 'uppercase',
  },
  rankChipSignals: {
    fontSize: 10,
    color: T.textMuted,
    fontVariantNumeric: 'tabular-nums',
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
  roundCard: {
    position: 'relative',
    // PULSE-ART-DIRECTION-2026-05-25 §4: matte stadium-night canvas with NO
    // ambient cyan radial gradients. The 5th-cyan-moment audit removed the
    // two cyan radial "atmosphere" gradients that ran at 18% and 82% — they
    // were a 5th cyan moment (header / trace / verify / CTA already have
    // the 4 jobs) AND the lazy "add atmosphere" pattern taste-guardian
    // Category 4 rejects.
    background: '#0D0F15',
    border: `1px solid ${T.borderDefault}`,
    borderRadius: 18,
    padding: 20,
    isolation: 'isolate',
    // Grow to fill the page's remaining height (after the header tape) so the
    // canvas + curve get the full viewport — no dead space. minHeight:0 lets
    // a flex child shrink below its content size; overflow:hidden keeps the
    // canvas from spawning a scrollbar inside the stage.
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  // The canvas IS the stage. It always spans the full round-card width;
  // every control surface lives as an absolute overlay on top of it. This
  // is the ONE architecture that runs across all phases — no layout shift.
  //
  // OO-FISHER bar: `user-select: none` on the canvas shell so desktop
  // tap-and-hold doesn't auto-select adjacent text during a cash-out
  // double-tap. The audit-readout HEX strings inside the action bar
  // re-enable `user-select: auto` via the dedicated `auditValue` style.
  canvasShell: {
    position: 'relative',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    // Fill the roundCard's remaining height (after the gameFooter strip) so the
    // canvas — `h-full w-full` — gets real vertical space on every device.
    flex: 1,
    minHeight: 0,
  },
  // Lobby / bet-entry overlay — the canvas behind is idle (slow heartbeat),
  // so the card takes the centre stage. The overlay container is full-bleed
  // + flex-centred; the card itself is width-capped via `overlayPanel`.
  canvasOverlayCenter: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    padding: 24,
  },
  // Round-active / settling / settled overlay — the action lives at the
  // BOTTOM of the canvas, where the player's attention naturally lands
  // after watching the curve climb (UX audit 2026-05-21: every dominant
  // crash UI — Aviator, Stake, BC.Game, Spaceman — places the CASH OUT
  // bottom-centre, not in a corner). Cross-phase muscle memory: CASH OUT
  // and BET AGAIN occupy the same physical region so the player's hand
  // never re-orients between act-now decisions.
  canvasOverlayBottom: {
    // Tim 2026-05-26 SCENE REBUILD: originally anchored top-right to share
    // the horizontal band with the live multiplier readout.
    //
    // Tim 2026-05-27 FIX 3: moved to BOTTOM-RIGHT. The ghost-trajectory
    // marker ("WOULD HAVE CRASHED" dotted line + cross icon after a cash-out)
    // lives in the upper portion of the canvas because the crash point is
    // always ABOVE where the player cashed out. The settlement card was
    // partially hiding it in the upper-right. Bottom-right placement gives
    // the ghost trajectory full visibility — it's the critical learning
    // moment that tells the player "you cashed out at the right time."
    //
    // The live multiplier readout (drawn top-left by drawHeroMultiplier) is
    // NOT affected — it lives in the canvas itself, not the overlay.
    //
    // Layout invariant (PulseExperience.layout.test.tsx): card must be in
    // the bottom 60% of the canvas so it cannot occlude the ghost trajectory
    // in the upper zone.
    position: 'absolute',
    right: 16,
    bottom: 16,
    display: 'flex',
    justifyContent: 'flex-end',
    pointerEvents: 'none',
    maxWidth: 'calc(100% - 32px)',
  },
  overlayPanel: {
    pointerEvents: 'auto',
    width: 'min(320px, 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  // Bottom action bar — corner pill (max 280px wide). The CTA (CASH OUT
  // or BET AGAIN) and context info stack vertically so the panel stays
  // narrow and the play surface stays visible.
  actionBarPanel: {
    pointerEvents: 'auto',
    width: '100%',
    maxWidth: 280,
  },
  // Below-canvas slim strip: status caption + chronology. Single horizontal
  // line, low ink. Never the focal point; the canvas always is.
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
  // SettlementBar lives directly below the canvas, in the player's eye-line
  // with the CRASHED / WIN stamp. Same HUD glass treatment as controlCard
  // so the bar reads as a console docked to the canvas, not a separate
  // sheet floating below it.
  // Settled card — uses the same `controlCard` chrome as Lobby / BetEntry /
  // RoundActive (one persistent card position across the entire game
  // lifecycle). The styles below scope its CONTENTS (hero multiplier, points
  // receipt, actions, glass-box verify line) — the card frame itself is
  // already provided by `controlCard`.
  settledHero: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  settledMultiplier: {
    fontFamily: T.fontMono,
    fontSize: 40,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  settledDelta: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
  },
  settledOwnership: {
    margin: 0,
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textMuted,
    letterSpacing: '0.02em',
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
  settledActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  // PULSE-ART-DIRECTION-2026-05-25 §5.1 + §3.5 job 4 — brushed-steel CTA
  // with inset cyan hairline trace. Same bezel register as cash-out +
  // commit so the player's hand carries the same muscle-memory tactile
  // affordance across the entire CASH OUT → BET AGAIN cycle.
  settledBetAgain: {
    padding: '14px 24px',
    background: '#161A23',
    color: T.accent,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: [
      'inset 0 0 0 1px rgba(0, 240, 255, 0.65)',
      'inset 0 1px 0 rgba(244, 246, 250, 0.10)',
    ].join(', '),
  },
  settledBetAgainDisabled: {
    padding: '14px 24px',
    background: 'rgba(41, 230, 255, 0.08)',
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
  },
  settledChangeLink: {
    background: 'transparent',
    border: 'none',
    padding: '10px 8px',
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    touchAction: 'manipulation',
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.textMuted,
    cursor: 'pointer',
    alignSelf: 'center',
  },
  // Secondary actions row under the BET AGAIN button — change wager +
  // share. Two quiet text links, dot-separated visually via gap, both at
  // the same mono-11 register so neither dominates the other.
  settledWagerAdjust: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  settledWagerAdjustLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  settledPresetRow: {
    display: 'flex',
    gap: 6,
    width: '100%',
  },
  settledPresetChip: {
    flex: 1,
    minHeight: 36,
    background: '#161A23',
    color: T.textMuted,
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    touchAction: 'manipulation',
    fontVariantNumeric: 'tabular-nums',
  },
  settledPresetChipActive: {
    flex: 1,
    minHeight: 36,
    background: 'rgba(0,240,255,0.14)',
    color: T.accentSolid,
    border: '1px solid rgba(0,240,255,0.55)',
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    touchAction: 'manipulation',
    fontVariantNumeric: 'tabular-nums',
  },
  settledWagerStepper: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  settledWagerValue: {
    fontFamily: T.fontMono,
    fontSize: 15,
    fontWeight: 700,
    color: T.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    minWidth: 92,
    textAlign: 'center',
  },
  wagerStepBtn: {
    width: 44,
    height: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#161A23',
    color: T.accent,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'pointer',
    touchAction: 'manipulation',
  },
  settledSecondaryActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  settledShareLink: {
    background: 'transparent',
    border: 'none',
    padding: '10px 8px',
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    touchAction: 'manipulation',
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.accent,
    cursor: 'pointer',
  },
  settledVerifyRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 10,
    borderTop: `1px solid ${T.borderSubtle}`,
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.04em',
  },
  settledVerifyText: {
    color: T.textDim,
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
    background: 'transparent',
    border: 'none',
    padding: '10px 6px',
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    touchAction: 'manipulation',
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: T.textMuted,
    cursor: 'pointer',
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
  // PULSE-ART-DIRECTION-2026-05-25 §5.1 — brushed-steel HUD plate bezel.
  // Opaque matte brushed-steel `#161A23`, 1px `rgba(255,255,255,0.12)` border, top-edge
  // light-fill hairline from the simulated top-right ambient (Light 1 in
  // §4.2). The previous glassmorphism (backdropFilter blur + translucent
  // gradient) was the taste-guardian Category 6 "glassmorphism without
  // purpose" anti-pattern. Brushed-steel is the Teenage Engineering OP-1
  // hardware register that BRAND_KIT §5.2 Tactile Futurism calls for.
  controlCard: {
    position: 'relative',
    background: '#161A23',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    // Top-right ambient specular hairline (Light 1) — consistent across
    // every HUD plate in the scene so the player reads them as the same
    // brushed-metal under the same overhead light.
    boxShadow: 'inset 0 1px 0 rgba(244, 246, 250, 0.06), 0 18px 50px rgba(0, 0, 0, 0.45)',
    // DLv2 §10 — motion reserved for state change. 260ms Material expressive.
    animation: 'pulse-card-enter 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
  },
  controlHeader: { display: 'flex', flexDirection: 'column', gap: 3 },
  // PULSE-ART-DIRECTION-2026-05-25 §5.1 — brushed-steel bottom action bar
  // with a single 1px cyan hairline trace at the top edge (DLv2 §1 P8
  // job 4 — the CTA-zone identity accent). Opaque brushed-steel matches
  // the centered card; the cyan hairline tells the player "this bezel is
  // where the action is."
  //
  // Tim 2026-05-25 chassis-pivot occlusion fix: bounded max-height so the
  // bar's actual rendered footprint matches the canvas's
  // `BOTTOM_RESERVED_BAR_PX` reserve — no more drift where audit-readout
  // line-wraps balloon the bar into the hero multiplier zone.
  actionBar: {
    position: 'relative',
    background: '#161A23',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: '12px 14px',
    // Vertical stack (chassis fix 2026-05-25) — corner pill, not a wide
    // grid. Left column (context) sits above the right column (CTA) so
    // the panel can stay ≤ 280 px wide. No height cap — the CTA must
    // always be visible (cash-out is the genre-defining moment).
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minHeight: 96,
    // Cyan top inset hairline removed (Tim 2026-05-25: "AI slop border top").
    // Subtle specular highlight + bottom shadow only.
    boxShadow: ['inset 0 1px 0 rgba(244, 246, 250, 0.04)', '0 18px 50px rgba(0, 0, 0, 0.45)'].join(
      ', ',
    ),
    animation: 'pulse-card-enter 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
  },
  actionBarLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  actionBarRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
  },
  // Eyebrow + sub-text — single inline row to keep the bar compact.
  actionBarHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    flexWrap: 'wrap',
  },
  actionBarEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.22em',
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  actionBarSub: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.textDim,
    letterSpacing: '0.04em',
  },
  // Info row — context info (wager / cash-out target / multiplier / delta).
  actionBarInfo: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 14,
    flexWrap: 'wrap',
  },
  actionBarMultiplier: {
    fontFamily: T.fontMono,
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  // Prize/loss amount — co-headline with the multiplier (Tim 2026-05-21:
  // the share-worthy fact is "+15.52 USDC", make it big enough to read at
  // a glance in screenshots). 26px keeps the multiplier slightly larger
  // as the primary anchor but lets the dollar figure carry near-equal
  // visual weight.
  actionBarDelta: {
    fontFamily: T.fontMono,
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    fontVariantNumeric: 'tabular-nums',
  },
  // Tertiary info line (ownership points, glass-box verify).
  actionBarFootnote: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
    flexWrap: 'wrap',
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textMuted,
    letterSpacing: '0.02em',
    margin: 0,
  },
  // Lobby — one sentence of intent. The mono title + sentence-case tagline
  // mirror the brand-line typography ("quiet expert at the table").
  lobbyHero: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingBottom: 4,
  },
  lobbyTitle: {
    fontFamily: T.fontMono,
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textPrimary,
  },
  lobbyTagline: {
    fontFamily: T.fontBody,
    fontSize: 13,
    color: T.textMuted,
    lineHeight: 1.5,
  },
  rtpDisclosure: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '14px 16px',
    background: 'rgba(0,240,255,0.04)',
    border: `1px solid ${T.accentMuted}`,
    borderRadius: 10,
  },
  rtpDisclosureRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  rtpDisclosureLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.22em',
    color: T.textDim,
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  rtpDisclosureValue: {
    fontFamily: T.fontMono,
    fontSize: 16,
    fontWeight: 800,
    color: T.accent,
  },
  rtpDisclosureValueMuted: {
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 600,
    color: T.textPrimary,
  },
  rtpDisclosureFootnote: {
    fontFamily: T.fontBody,
    fontSize: 11,
    color: T.textMuted,
    margin: '6px 0 0',
    lineHeight: 1.45,
  },
  controlEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.22em',
    color: T.textPrimary,
    fontWeight: 600,
  },
  controlSub: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textMuted,
    letterSpacing: '0.04em',
  },
  bodyCopy: {
    margin: 0,
    fontFamily: T.fontBody,
    fontSize: 13,
    lineHeight: 1.55,
    color: T.textMuted,
  },
  formBlock: { display: 'flex', flexDirection: 'column', gap: 8 },

  // ── Refined BET ENTRY (Awwwards × iGaming merge) ────────────────────
  // The wager IS the hero. Vertically stacked + centered so the digits
  // dominate exactly like the in-canvas hero multiplier — same family,
  // same weight, same letter-spacing. Cyan hairline below + cyan unit
  // label tie this block into the canvas's accent palette so the eye
  // reads them as one continuous instrument.
  wagerHero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
    paddingBottom: 18,
    borderBottom: '1px solid rgba(0, 240, 255, 0.20)',
  },
  wagerEyebrow: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.32em',
    textTransform: 'uppercase',
    color: T.textMuted,
    fontWeight: 600,
  },
  wagerAmountInput: {
    width: '100%',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: T.fontMono,
    fontSize: 56,
    fontWeight: 800,
    color: T.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.03em',
    lineHeight: 1,
    padding: 0,
    textAlign: 'center',
    // Strip native spinners — pseudo-element CSS below in `shakeKeyframes`.
    MozAppearance: 'textfield' as const,
  },
  wagerAmountUnit: {
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.32em',
    textTransform: 'uppercase',
    color: T.accent,
    fontWeight: 600,
  },

  // Quick-pick chip grid — exactly five columns so chips never wrap.
  // Selected chip is the single cyan-fill moment on the surface (DLv2 §5).
  quickPickRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 4,
    // One declaration covers all child chip buttons — removes the 300ms tap
    // delay on the high-frequency wager/auto preset surface.
    touchAction: 'manipulation',
  },
  quickPick: {
    // 44px hit floor (WCAG 2.5.8) — primary bet-config controls, tapped every
    // round; ~29px today causes mis-taps (100 when 50 was meant).
    minHeight: 44,
    padding: '8px 0',
    background: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.04em',
    color: T.textMuted,
    cursor: 'pointer',
    fontVariantNumeric: 'tabular-nums',
    transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
  },
  quickPickSelected: {
    minHeight: 44,
    padding: '8px 0',
    background: 'rgba(0, 240, 255, 0.14)',
    border: `1px solid ${T.accentMuted}`,
    borderRadius: 6,
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.04em',
    color: T.accent,
    cursor: 'pointer',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 700,
  },

  autoBlock: { display: 'flex', flexDirection: 'column', gap: 8 },
  autoHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  autoLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textMuted,
    fontWeight: 600,
  },
  autoStatus: {
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.04em',
  },

  // Footer reads as quiet metadata + ONE loud action. The cancel is a
  // text link, not a competing button — keeps the COMMIT moment singular.
  betFooter: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    paddingTop: 14,
    marginTop: 'auto',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
  // Balance + min as a two-column stat strip (typography hierarchy
  // replacing the previous dot-separator soup).
  betFooterStats: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
  },
  betFooterStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  betFooterStatLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: T.textDim,
    fontWeight: 600,
  },
  betFooterStatValue: {
    fontFamily: T.fontMono,
    fontSize: 12,
    color: T.textPrimary,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
  },
  betFooterActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  linkButton: {
    background: 'transparent',
    border: 'none',
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.textMuted,
    cursor: 'pointer',
    padding: '0 8px',
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    touchAction: 'manipulation',
  },
  // PULSE-ART-DIRECTION-2026-05-25 §5.1 + §3.5 job 4 — brushed-steel CTA
  // with a 1px inset cyan hairline trace + cyan mono-caps text. Same
  // bezel register as the cash-out button so the player's eye reads them
  // as one instrument family.
  commitButton: {
    flex: 1,
    padding: '14px 16px',
    minHeight: 44,
    background: '#161A23',
    color: T.accent,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: [
      'inset 0 0 0 1px rgba(0, 240, 255, 0.65)',
      'inset 0 1px 0 rgba(244, 246, 250, 0.10)',
    ].join(', '),
  },
  commitButtonDisabled: {
    flex: 1,
    padding: '14px 16px',
    background: 'rgba(0, 240, 255, 0.08)',
    color: T.textMuted,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
    fontFamily: T.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
    whiteSpace: 'nowrap',
  },
  label: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  presetRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  presetButton: {
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${T.borderSubtle}`,
    background: 'rgba(255,255,255,0.025)',
    color: T.textMuted,
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  presetButtonSelected: {
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${T.accentMuted}`,
    background: 'rgba(41, 230, 255, 0.16)',
    color: T.accent,
    fontFamily: T.fontMono,
    fontSize: 11,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    fontWeight: 600,
  },
  numberInput: {
    fontFamily: T.fontMono,
    fontSize: 16,
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${T.borderDefault}`,
    background: 'rgba(0,0,0,0.25)',
    color: T.textPrimary,
    width: '100%',
    boxSizing: 'border-box',
    fontVariantNumeric: 'tabular-nums',
  },
  helpText: {
    fontFamily: T.fontMono,
    fontSize: 10,
    color: T.textDim,
    letterSpacing: '0.06em',
  },
  actionRow: { display: 'flex', gap: 8, marginTop: 4 },
  // DLv2 §6 — primary CTA is hairline-cyan-border + transparent fill +
  // mono caps + trailing arrow. The featured chip (filled) is the offer;
  // this CTA confirms intent. The cash-out button takes the filled-cyan
  // treatment (job 3 reassignment per §8 — in round-active there is no
  // featured chip, so the cash-out plays that role).
  primaryButton: {
    flex: 1,
    padding: '14px 18px',
    minHeight: 44,
    background: 'transparent',
    color: T.accent,
    border: `1px solid ${T.accentSolid}`,
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'background 200ms ease, border-color 200ms ease',
  },
  primaryButtonDisabled: {
    flex: 1,
    padding: '14px 18px',
    background: 'transparent',
    color: T.textMuted,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 8,
    fontFamily: T.fontMono,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
  },
  secondaryButton: {
    padding: '14px 16px',
    background: 'rgba(255,255,255,0.025)',
    color: T.textMuted,
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 12,
    fontFamily: T.fontMono,
    fontSize: 12,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  statRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  statBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 12px',
    background: 'rgba(0,0,0,0.30)',
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 10,
  },
  statLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  statValue: {
    fontFamily: T.fontMono,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
  },
  autoNote: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: T.fontMono,
    fontSize: 11,
    padding: '8px 10px',
    borderRadius: 8,
    background: 'rgba(41, 230, 255, 0.06)',
    border: `1px dashed ${T.accentMuted}`,
    color: T.accent,
    letterSpacing: '0.06em',
  },
  autoDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: T.accentSolid,
    boxShadow: `0 0 6px ${T.accentSolid}`,
  },
  // PULSE-ART-DIRECTION-2026-05-25 §5.1 + §3.5 job 4 — brushed-steel CTA
  // with a 1px inset cyan hairline trace + cyan mono-caps text. The
  // previous filled-cyan-gradient was the Pragmatic-Play register (loud
  // confection candy) that BRAND_KIT §1.3 quiet-expert essence rejects.
  // The instrument-bezel register reads as "act on this readout," not
  // "BIG WIN CASINO BUTTON."
  cashOutButton: {
    width: '100%',
    padding: '20px 16px',
    background: '#161A23',
    color: T.accent,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    // Inset cyan hairline (the bezel's own readout glow) + top-right
    // ambient specular for material consistency with the surrounding bar.
    boxShadow: [
      'inset 0 0 0 1px rgba(0, 240, 255, 0.65)',
      'inset 0 1px 0 rgba(244, 246, 250, 0.10)',
    ].join(', '),
  },
  cashOutLabel: { fontSize: 14 },
  cashOutSub: {
    fontSize: 11,
    letterSpacing: '0.12em',
    fontWeight: 600,
    opacity: 0.92,
  },
  settlingRow: { display: 'flex', alignItems: 'center', gap: 12 },
  spinner: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    border: `2px solid ${T.borderDefault}`,
    borderTopColor: T.accent,
    animation: 'pulse-crash-shake-kf 0s, spin 0.8s linear infinite',
  },
  heroOutcome: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '14px 12px',
    background: 'rgba(0,0,0,0.30)',
    border: `1px solid ${T.borderSubtle}`,
    borderRadius: 12,
  },
  heroOutcomeLabel: {
    fontFamily: T.fontMono,
    fontSize: 10,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  heroOutcomeValue: {
    fontFamily: T.fontMono,
    fontSize: 30,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.01em',
    lineHeight: 1,
  },
  heroOutcomeNote: {
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textDim,
    letterSpacing: '0.04em',
  },
  rowLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: T.textMuted,
  },
  rowValue: {
    margin: 0,
    fontFamily: T.fontMono,
    fontSize: 11,
    color: T.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  historyStrip: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  historyLabel: {
    fontFamily: T.fontMono,
    fontSize: 9,
    letterSpacing: '0.20em',
    textTransform: 'uppercase',
    color: T.textDim,
    marginRight: 4,
  },
  historyChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 8px',
    borderRadius: 6,
    fontFamily: T.fontMono,
    fontSize: 11,
    border: `1px solid ${T.borderSubtle}`,
    fontVariantNumeric: 'tabular-nums',
  },
  // Leading hairline tick on the newest chip — silently signals "you are here."
  historyTick: {
    display: 'inline-block',
    width: 2,
    height: 8,
    background: T.accent,
    borderRadius: 1,
  },
  // PULSE-ART-DIRECTION-2026-05-25 §3.4 — the in-canvas commit-reveal hash
  // audit readout strip. Three Geist Mono 10px tabular rows (HASH / CHAIN /
  // ROUND) + the optional verify chip when re-derivation matches at settle.
  // Reads as a clinical-grade instrument readout panel inset into the
  // brushed-steel bottom action bar, not as a popover or modal.
  auditReadout: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 4,
    paddingTop: 6,
    fontFamily: T.fontMono,
    fontVariantNumeric: 'tabular-nums',
  },
  auditRow: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 6,
  },
  auditLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.textDim,
  },
  auditValue: {
    fontSize: 10,
    color: T.textMuted,
    fontFamily: T.fontMono,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.04em',
    background: 'transparent',
    padding: 0,
  },
  // OO-FISHER bar — perfect-window CASH OUT variant. Brighter cyan
  // hairline + brass-tinted accent so the player FEELS the moment without
  // amplitude escalation. Same physical dimensions as the base cashOutButton
  // so the press target doesn't shift (RG-C5 SAFE: structural).
  cashOutButtonPerfect: {
    width: '100%',
    padding: '20px 16px',
    background: '#161A23',
    color: T.accentSolid,
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    fontFamily: T.fontMono,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    // Brighter inset cyan hairline (still inside the 4-cyan economy — this is
    // job 3 reassignment from the base cashOutButton) + warm specular ring.
    boxShadow: [
      'inset 0 0 0 1px rgba(0, 240, 255, 0.95)',
      'inset 0 0 18px rgba(0, 240, 255, 0.18)',
      'inset 0 1px 0 rgba(244, 246, 250, 0.15)',
    ].join(', '),
  },
  // The single cyan verify chip — DLv2 §1 P8 job 3 (recommendation accent).
  // Hairline-bordered, NOT filled, so it stays inside the cyan-economy
  // discipline against the brushed-steel bezel.
  auditVerifyChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: T.accent,
    padding: '2px 8px',
    border: `1px solid ${T.accentSolid}`,
    borderRadius: 4,
  },
}

/**
 * Pulse audio — Howler.js (primary) + Web Audio API (synthesis fallback).
 *
 * PRIMARY: Kenney CC0 samples loaded via `AUDIO_MANIFEST` + `useSwoobzAudio`.
 * FALLBACK: Web Audio API synthesis runs only when Howler has not loaded
 * the sample (e.g. during dev before `copy-kenney-audio.sh` is run).
 *
 * RG-C5 STRUCTURAL: all play functions are ZERO-PARAMETER. All amplitudes
 * are module-level consts. No streak/session/wager state can reach audio
 * dispatch. The Kenney sample volumes in AUDIO_MANIFEST are module-consts,
 * never runtime parameters.
 *
 * Loss state (crash): informational low thud. NOT celebratory. RG-C1.
 */
import { isSfxLoaded, playSfx, type SfxRegistration } from '../_shared/audio'

// ─── Sound IDs (RG-C5 structural — module-level CONSTS, never built) ──────
export const SID_CASH_OUT_WIN = 'pulse-cash-out-win' as const
export const SID_CRASH = 'pulse-crash' as const
export const SID_BET_COMMIT = 'pulse-bet-commit' as const
export const SID_PERFECT_HIT = 'pulse-perfect-hit' as const

// ─── Module-level amplitude constants (RG-C5 structural pins) ─────────────
export const CASH_OUT_VOL = 0.55 as const
export const CRASH_VOL = 0.65 as const
export const BET_COMMIT_VOL = 0.4 as const
export const PERFECT_HIT_VOL = 0.55 as const

// ─── Audio manifest (pass to useSwoobzAudio in PulseExperience) ───────────
// All Kenney CC0 samples; WebAudio synthesis fallback below when a sample
// hasn't loaded (e.g. before `copy-kenney-audio.sh` runs in dev).
export const AUDIO_MANIFEST: ReadonlyArray<SfxRegistration> = [
  {
    id: SID_CASH_OUT_WIN,
    sources: ['/assets/raw/kenney/audio/pulse/impactBell_heavy_000.ogg'],
    volume: CASH_OUT_VOL,
  },
  {
    id: SID_CRASH,
    sources: ['/assets/raw/kenney/audio/pulse/impactMetal_heavy_000.ogg'],
    volume: CRASH_VOL,
  },
  // Bet-commit reuses the heavy-metal sample at a softer volume — the
  // damped attack reads as "locked in" rather than the bright cash-out
  // chime. WebAudio synthesis fallback adds tonal differentiation when the
  // sample is unavailable.
  {
    id: SID_BET_COMMIT,
    sources: ['/assets/raw/kenney/audio/pulse/impactMetal_heavy_000.ogg'],
    volume: BET_COMMIT_VOL,
  },
  // Perfect-hit chime — brighter bell sample (heavy 002, copied per
  // copy-kenney-audio.sh). WebAudio synthesis fallback covers dev environments
  // where the sample hasn't been copied yet.
  {
    id: SID_PERFECT_HIT,
    sources: ['/assets/raw/kenney/audio/pulse/impactBell_heavy_002.ogg'],
    volume: PERFECT_HIT_VOL,
  },
] as const

// ─── WebAudio context (fallback only) ─────────────────────────────────────
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx && ctx.state !== 'closed') return ctx
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

/** Resume the AudioContext under a user gesture. Idempotent. */
export function ensureAudio(): void {
  const a = audio()
  if (!a) return
  if (a.state === 'suspended') void a.resume()
}

/**
 * Shared AudioContext accessor for sibling Pulse audio modules (e.g. the
 * continuous climb voice in `pulseClimbVoice.ts`) so they ride the SAME
 * gesture-resumed context instead of spinning up a second one. Returns null
 * under SSR / when WebAudio is unavailable.
 */
export function getPulseAudioContext(): AudioContext | null {
  return audio()
}

// ─── In-flight SFX tracking (terminal-event silencing) ────────────────────
// PULSE-CRASH-RESIDUE-SILENCE 2026-05-27: tier-tick has a 200ms exponential
// ring-out. If a tick fires within 200ms of a crash, the tail of the climb
// tick smears into the crash thud.
//
// PULSE-SFX-SILENCE-ALL-2026-05-27: on BOTH terminal events (crash AND
// cash-out), ALL in-flight oscillators must be fast-faded so the terminal
// sound plays clean without competing ring-out from prior chimes.
// We track three node Sets here — ticks, perfect-hit chimes, cash-out synth
// notes — and `silenceAllActiveSfx()` fast-fades every Set at once.
type TickNode = { osc: OscillatorNode; gain: GainNode }
const inFlightTicks = new Set<TickNode>()
const inFlightPerfectHits = new Set<TickNode>()
const inFlightCashOutNotes = new Set<TickNode>()

// Module-level const fade durations (RG-C5 STRUCTURAL — never state-driven).
const TICK_TAIL_FADE_S = 0.04 as const
const SFX_TAIL_FADE_S = 0.06 as const // slightly longer for higher-pitched notes

/** Fast-fade a Set of in-flight nodes, then clear the Set.
 *  Shared helper — zero-param to preserve RG-C5 STRUCTURAL invariant. */
function fadeAndClearNodes(nodes: Set<TickNode>, fadeS: number): void {
  const a = audio()
  if (!a) {
    nodes.clear()
    return
  }
  const now = a.currentTime
  for (const node of nodes) {
    try {
      node.gain.gain.cancelScheduledValues(now)
      node.gain.gain.setValueAtTime(node.gain.gain.value, now)
      node.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS)
      node.osc.stop(now + fadeS + 0.005)
    } catch {
      // node already torn down; safe to ignore
    }
  }
  nodes.clear()
}

/**
 * Silence ALL in-flight WebAudio oscillators (tier-ticks, perfect-hit
 * chimes, cash-out synth notes) before a terminal event fires.
 *
 * Called at the TOP of both `playCrash()` and `playCashOutWin()` so the
 * terminal sound plays clean — no competing ring-out from prior chimes.
 * Idempotent. RG-C5 SAFE: zero-param, module-const fade durations.
 *
 * @deprecated previous name `silenceTierTickTail` — renamed here but kept
 * as a re-export below for backward compat with existing tests.
 */
export function silenceAllActiveSfx(): void {
  fadeAndClearNodes(inFlightTicks, TICK_TAIL_FADE_S)
  fadeAndClearNodes(inFlightPerfectHits, SFX_TAIL_FADE_S)
  fadeAndClearNodes(inFlightCashOutNotes, SFX_TAIL_FADE_S)
}

/** @deprecated Use `silenceAllActiveSfx` — kept for backward compat with
 *  existing tests that import this name directly. */
export const silenceTierTickTail = silenceAllActiveSfx

// RG-C5 STRUCTURAL: the milestone tick is a ZERO-PARAM function. Pitch rises
// across a round's milestone crossings via a FIXED module-const frequency table
// + an internal index that `resetMilestoneTicks()` zeroes at every round start.
// No streak / session / tier value can reach this function's signature, so the
// fanfare is byte-identical every round, every player, every session.
const MILESTONE_TICK_FREQS_HZ = [660, 760, 860, 960, 1060, 1160] as const
let milestoneTickIdx = 0

/** Reset the milestone-tick pitch sequence. Called once at every round start. */
export function resetMilestoneTicks(): void {
  milestoneTickIdx = 0
}

/** A short, clean milestone tick. Zero-param (RG-C5). Pitch steps up across the
 *  round's crossings from the fixed table, then resets next round. */
export function playTierTick(): void {
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  const idx = Math.min(milestoneTickIdx, MILESTONE_TICK_FREQS_HZ.length - 1)
  milestoneTickIdx++
  const base = MILESTONE_TICK_FREQS_HZ[idx]!
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(base, now)
  osc.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.06)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
  osc.connect(gain).connect(a.destination)
  const node: TickNode = { osc, gain }
  inFlightTicks.add(node)
  osc.onended = () => {
    inFlightTicks.delete(node)
  }
  osc.start(now)
  osc.stop(now + 0.2)
}

/** The cash-out confirm chime — a rising "won big" cascade. Only fires on a real win.
 *  PULSE-SFX-SILENCE-ALL-2026-05-27: silences all in-flight oscillators first
 *  so the cash-out chime plays clean over no prior ring-out. Same terminal-event
 *  silencing pattern as playCrash(). */
export function playCashOutWin(): void {
  // Silence any in-flight tier-ticks, perfect-hit chimes, or prior synth notes
  // before the cash-out chime fires. RG-C5 SAFE: zero-param, module-const fade.
  silenceAllActiveSfx()
  // Fire the Howler sample (primary path — plays when sample is loaded).
  playSfx(SID_CASH_OUT_WIN)
  // WebAudio synthesis fallback — ALWAYS fires alongside the sample for a
  // layered chime. The synth is lower-amplitude so it enriches rather than
  // doubles the primary sample. Guarantees audible output even when Howler
  // hasn't loaded yet (e.g. dev before copy-kenney-audio.sh runs).
  // RG-C5 STRUCTURAL: all frequencies, timings, and volumes are literals
  // here; no session/streak/wager parameter can vary the shape.
  const a = audio()
  if (!a) return
  const now = a.currentTime
  // Slightly quieter than before so the layering reads as richness not
  // doubling (0.22→0.12, 0.20→0.11, 0.18→0.10, 0.14→0.08).
  for (const [freq, t, vol] of [
    [880, 0, 0.12],
    [1320, 0.05, 0.11],
    [1760, 0.1, 0.1],
    [2640, 0.15, 0.08],
  ] as const) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + t)
    gain.gain.setValueAtTime(0.0001, now + t)
    gain.gain.exponentialRampToValueAtTime(vol, now + t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.8)
    osc.connect(gain).connect(a.destination)
    const node: TickNode = { osc, gain }
    inFlightCashOutNotes.add(node)
    osc.onended = () => {
      inFlightCashOutNotes.delete(node)
    }
    osc.start(now + t)
    osc.stop(now + t + 0.82)
  }
}

/** Crash thud — short, low, informational. No "musical" lift.
 *  PULSE-SFX-SILENCE-ALL-2026-05-27: silences ALL in-flight oscillators
 *  (tier-ticks, perfect-hit chimes, cash-out notes) before the crash fires
 *  so the thud plays clean. Synth fallback ALWAYS fires alongside the Howler
 *  sample for a layered low-thud — guarantees audible output even when the
 *  sample hasn't loaded. */
export function playCrash(): void {
  // Silence all in-flight WebAudio oscillators before the crash thud fires.
  // RG-C5 SAFE: zero-param, module-const fade durations.
  silenceAllActiveSfx()
  // Fire the Howler sample (primary path — plays when sample is loaded).
  playSfx(SID_CRASH)
  // WebAudio synthesis fallback — ALWAYS fires alongside the sample for a
  // layered crash thud (sample = metal hit, synth = sawtooth pitch-drop).
  // Guarantees audible output even when Howler hasn't loaded the sample yet.
  // Synth amplitude is lower so the layering reads as body, not doubling.
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(220, now)
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.32)
  // Lower amplitude (0.18 vs prior 0.32) — sample+synth layer reads as
  // one thud, not two competing sounds.
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
  osc.connect(gain).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.42)
}

/**
 * Bet-commit confirm — a soft mid-frequency thunk at the moment the player
 * locks in their wager and the round starts climbing. Module-const amplitude
 * + zero-param (RG-C5 SAFE).
 */
export function playBetCommit(): void {
  playSfx(SID_BET_COMMIT)
  if (isSfxLoaded(SID_BET_COMMIT)) return
  // WebAudio synthesis fallback — single short tone, no per-state escalation.
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(420, now)
  osc.frequency.exponentialRampToValueAtTime(380, now + 0.12)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
  osc.connect(gain).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.24)
}

/**
 * Perfect-hit chime — a clean, single-shot bell that fires WHEN the player
 * cashes out inside a milestone band (see `perfectHitBonusBps` in
 * `pulseMath.ts`). Module-const amplitude + zero-param (RG-C5 SAFE):
 * the chime shape is identical whether the bonus lands at 1.05× or 1.15×.
 * Only the visible payout multiplier reflects the precision of the read;
 * the audio cue is binary (perfect, or not).
 */
export function playPerfectHit(): void {
  playSfx(SID_PERFECT_HIT)
  if (isSfxLoaded(SID_PERFECT_HIT)) return
  // WebAudio synthesis fallback — a clean two-tone chime, brighter than the
  // standard cash-out so the player hears the precision moment.
  // PULSE-SFX-SILENCE-ALL-2026-05-27: oscillators tracked in
  // `inFlightPerfectHits` so `silenceAllActiveSfx()` can fast-fade them
  // when a crash or cash-out fires (crash trumps everything).
  const a = audio()
  if (!a) return
  const now = a.currentTime
  for (const [freq, t, vol] of [
    [1320, 0, 0.18],
    [1760, 0.05, 0.16],
    [2640, 0.12, 0.1],
  ] as const) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now + t)
    gain.gain.setValueAtTime(0.0001, now + t)
    gain.gain.exponentialRampToValueAtTime(vol, now + t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.55)
    osc.connect(gain).connect(a.destination)
    const node: TickNode = { osc, gain }
    inFlightPerfectHits.add(node)
    osc.onended = () => {
      inFlightPerfectHits.delete(node)
    }
    osc.start(now + t)
    osc.stop(now + t + 0.58)
  }
}

/**
 * The integer multiplier crossings that trigger a tier tick.
 *
 * PULSE-FX-RESTORE-2026-05-27: Re-exported from `pulseProjection.MILESTONE_BPS`
 * so the audio tick thresholds, the backdrop's right-rail pip positions and
 * the Vitest alignment assertion all reference the SAME bps table. Drift is
 * impossible by construction.
 */
export { MILESTONE_BPS as TIER_TICKS_BPS } from './pulseProjection'

// ─── Music manifest (theme track — separate from SFX) ─────────────────────
//
// Pulse theme: "Pondering the Cosmos" by Ruskerdax (CC0).
// Source: opengameart.org/content/pondering-the-cosmos
// Loaded via swoobzMusic.ts, amplitude pinned at module-const MUSIC_VOLUME.
// Falls back to pulseTheme.ts WebAudio synth pad+arp when sample isn't loaded.
import type { MusicRegistration } from '../_shared/audio/swoobzMusic'
export const MUSIC_PULSE_THEME: MusicRegistration = {
  id: 'pulse-theme',
  sources: ['/assets/music/pulse/pondering-the-cosmos.ogg'],
}

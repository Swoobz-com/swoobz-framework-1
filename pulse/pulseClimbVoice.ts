/**
 * pulseClimbVoice — the continuous live-value audio parameter for Pulse
 * (CRASH category aliveness floor, Dimension 5 of the SWOOBZ ALIVENESS
 * STANDARD: "one continuous audio parameter bound to the live round
 * multiplier — the ear tracks the climb without reading the number").
 *
 * A single low-amplitude drone voice (root + fifth, harmonising with the
 * A-minor pad in `pulseTheme.ts`) that plays for the duration of an active
 * round. Its lowpass cutoff OPENS as the multiplier climbs, so the timbre
 * brightens with the curve — a classic "riser". It is layered UNDER whatever
 * music backend is playing (the Howler track OR the synth fallback), so the
 * floor is met every round regardless of which is active — unlike binding a
 * filter to the synth pad alone, which only plays in the fallback case.
 *
 * Pitch is held fixed (consonant with the fixed-key music); only the FILTER
 * CUTOFF tracks the round value. The standard explicitly allows "pitch OR
 * filter cutoff" — cutoff is the musically-safe choice against a fixed key.
 *
 * RG-C5 STRUCTURAL: `startPulseClimbVoice` / `stopPulseClimbVoice` are
 * zero-parameter; amplitude + frequency range are module-level consts;
 * `updatePulseClimbVoice` takes ONLY the live round multiplier — never streak,
 * session, or wager. The cutoff mapping is a pure deterministic function of the
 * current round value, identical for every player and every round.
 *
 * Domain C: presentation only. No game state, no math that feeds a payout,
 * no I/O beyond the WebAudio graph.
 */
import { getPulseAudioContext } from './pulseAudio'

// ─── Module-level constants (RG-C5 structural pins) ─────────────────────────
/** Peak amplitude of the climb voice. Sits well under the music (≈0.35) and
 *  the theme pad (0.18) so it enriches rather than dominates. */
export const CLIMB_VOICE_VOL = 0.05 as const
export const CLIMB_FADE_IN_S = 0.4 as const
/** Short stop fade so a crash cuts the voice cleanly (the "punch"), not a
 *  lingering tail. */
export const CLIMB_FADE_OUT_S = 0.08 as const
/** Drone pitches — A2 root + E3 fifth, the lower two of the pad's stacked
 *  fifths (PAD_FREQS_HZ in pulseTheme.ts), so the voice is consonant. */
export const CLIMB_DRONE_FREQS_HZ = [110, 165] as const
/** Lowpass cutoff range the multiplier sweeps between (Hz). */
export const CLIMB_FILTER_MIN_HZ = 320 as const
export const CLIMB_FILTER_MAX_HZ = 2600 as const
export const CLIMB_FILTER_Q = 1.1 as const
/** The multiplier at which the cutoff reaches CLIMB_FILTER_MAX_HZ. The visual
 *  ceiling is far higher; the ear-mapping saturates here so the common 1–10×
 *  band is the expressive range. Module-const → identical every round. */
export const CLIMB_MUL_CEIL = 10 as const

// ─── State (module-scoped, mirrors pulseTheme.ts pattern) ───────────────────
let oscs: OscillatorNode[] = []
let filter: BiquadFilterNode | null = null
let gain: GainNode | null = null
let playing = false

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Pure mapping from the live round multiplier to the lowpass cutoff (Hz).
 * Exported for unit testing: it is monotonic non-decreasing, clamped to
 * [MIN, MAX], and deterministic (RG-C5 — identical output for identical input,
 * no session/streak/wager term).
 */
export function climbCutoffForMul(mulF: number): number {
  const norm = clamp01(Math.log(Math.max(1, mulF)) / Math.log(CLIMB_MUL_CEIL))
  return CLIMB_FILTER_MIN_HZ + (CLIMB_FILTER_MAX_HZ - CLIMB_FILTER_MIN_HZ) * norm
}

/**
 * Start the climb voice. Zero-param (RG-C5). Idempotent — safe to call every
 * frame; only starts once. No-op under SSR / when WebAudio is unavailable.
 */
export function startPulseClimbVoice(): void {
  if (playing) return
  const a = getPulseAudioContext()
  if (!a) return
  if (a.state === 'suspended') void a.resume()
  const now = a.currentTime

  filter = a.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(CLIMB_FILTER_MIN_HZ, now)
  filter.Q.setValueAtTime(CLIMB_FILTER_Q, now)

  gain = a.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(CLIMB_VOICE_VOL, now + CLIMB_FADE_IN_S)

  filter.connect(gain).connect(a.destination)

  oscs = CLIMB_DRONE_FREQS_HZ.map((freq) => {
    const osc = a.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(freq, now)
    if (filter) osc.connect(filter)
    osc.start(now)
    return osc
  })

  playing = true
}

/**
 * Track the live round multiplier. `mulF` is the CURRENT-ROUND multiplier as a
 * float (1.0 at start, climbing). RG-C5: this is the ONLY input and it is the
 * live round value — never session/streak/wager. No-op before start.
 */
export function updatePulseClimbVoice(mulF: number): void {
  if (!playing) return
  const a = getPulseAudioContext()
  if (!a || !filter) return
  // setValueAtTime (not setTargetAtTime) — one scheduled point per frame keeps
  // the AudioParam queue from accumulating at 60fps.
  filter.frequency.setValueAtTime(climbCutoffForMul(mulF), a.currentTime)
}

/**
 * Fade out + tear down the climb voice. Zero-param (RG-C5). Idempotent — safe
 * to call every idle/frozen frame; only stops once.
 */
export function stopPulseClimbVoice(): void {
  if (!playing) return
  const a = getPulseAudioContext()
  const stoppingOscs = oscs
  const stoppingGain = gain
  const stoppingFilter = filter
  oscs = []
  gain = null
  filter = null
  playing = false
  if (!a || !stoppingGain) return
  const now = a.currentTime
  stoppingGain.gain.cancelScheduledValues(now)
  stoppingGain.gain.setValueAtTime(stoppingGain.gain.value, now)
  stoppingGain.gain.exponentialRampToValueAtTime(0.0001, now + CLIMB_FADE_OUT_S)
  for (const osc of stoppingOscs) {
    try {
      osc.stop(now + CLIMB_FADE_OUT_S + 0.02)
    } catch {
      // already stopped — safe to ignore
    }
  }
  setTimeout(
    () => {
      try {
        stoppingFilter?.disconnect()
      } catch {
        // already disconnected
      }
      try {
        stoppingGain.disconnect()
      } catch {
        // already disconnected
      }
    },
    (CLIMB_FADE_OUT_S + 0.1) * 1000,
  )
}

/** True if the climb voice is currently audible. */
export function isPulseClimbVoicePlaying(): boolean {
  return playing
}

/**
 * ABYSS LINE — WebAudio cues. Zero asset files, pure synthesis.
 *
 * Register: SUNKEN-TREASURE DEEP-WATER — the wreck of the "Golden Sledge" at
 * 3,800m. The existing RG-C5 synthesis is KEPT (a full DSP re-voice was out of
 * scope this round — see build spec §6); it reads cleanly as the abyss register:
 * a low breaker-throw thunk on the commit, a bright coin-clink racing ducat-to-
 * ducat down the claimed line, a dull mine-thud when a cracked ducat busts the
 * dive, and a coin-settle chime as the haul secures. The running ducat-reveal
 * cascade is the hero element; the audio reads as its WEIGHT (pressure, metal),
 * never a slot-machine jingle.
 * Every cue serves one of three beats:
 *   (1) the held breath before throwing the breaker    → playPlungeThunk (via ensureAudio)
 *   (2) the line running ducat-to-ducat                 → playBead (the coin-clink)
 *   (3) the haul settling in                            → playClaim
 * `playBadVein` is the fourth beat: the dull halt when a cracked ducat (a naval
 * mine) ends the run, matched to the cracked-ducat tile art.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  RG-C5 STRUCTURAL ENFORCEMENT (load-bearing, non-negotiable):         ║
 * ║                                                                      ║
 * ║  Every exported cue function is either ZERO-PARAM, or — for          ║
 * ║  `playBead` only — takes a single BOUNDED economic-value delta       ║
 * ║  (`deltaBps`, clamped to BEAD_ECONOMIC_CAP_BPS) that maps ONLY to     ║
 * ║  PITCH. No function reads or accepts a streak length, a session      ║
 * ║  counter, a wager size, or a payout multiple. AMPLITUDE and DURATION ║
 * ║  are module-level `const` for every cue — they cannot be scaled at   ║
 * ║  runtime because there is no parameter through which to scale them.  ║
 * ║  `playClaim` (the gold-settle) is the highest-temptation function    ║
 * ║  in this file — it fires on every win — and it is the one MOST       ║
 * ║  strictly zero-param: it cannot see the payout multiple at all, and  ║
 * ║  its fixed 4-click gold cascade is indexed ONLY by a fixed loop i,   ║
 * ║  never by trail length or payout.                                    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Ambient layer: SKIPPED. This module cannot reach a brand SFX-mute toggle
 * without editing files owned by a parallel agent, and an always-on background
 * bed with no mute path would itself be an anti-slop violation. The scene rests
 * in silence between the four cues below — consistent with the brand's "quiet
 * expert at the table" register. A future pass that also owns the host component
 * can add a muteable faint deep-water ambient bed (a low pressure room-tone with
 * an occasional distant hull-settle / sonar ping) here.
 *
 * AudioContext must be lazy-created from a user gesture (browser policy).
 * `ensureAudio()` is called from exactly one call site in `assayProvider.ts`
 * — the instant the player presses the dive key — so it does double duty as
 * both the (idempotent) context bootstrap AND the plunge-thunk trigger.
 */

let ctx: AudioContext | null = null

export function ensureAudio(): void {
  if (!ctx) {
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
    } catch {
      ctx = null
    }
  }
  if (ctx && ctx.state === 'suspended') void ctx.resume()
  playPlungeThunk()
}

// ─── Low-level synthesis primitives (private — not the RG-C5 surface) ──────
// These are generic DSP helpers, not game-state-aware. Every CALL SITE below
// passes only module-level consts, or (in playBead's case) the single
// bounded-and-clamped pitch value — never a raw streak/session/payout value.

/** A short burst of white noise, freshly rendered per call (cheap at this
 *  event rate — at most a few dozen per round). Feeds the filtered-noise
 *  transient shared by every cue, so the texture reads as physical contact —
 *  a dive-key click, a gold coin-clink attack, a hull-crack — rather than a
 *  soft mallet tap or a pure musical chime. */
function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/** Filtered-noise mechanical transient (sonar ping, coin-clink attack,
 *  hull crack, coin-settle click). Optional `delayS` mirrors `tone`'s own
 *  delay so a click can be scheduled as part of a multi-beat cue (the fixed
 *  gold cascade in `playClaim`); the four legacy call sites omit it and get 0,
 *  byte-unchanged. RG-C5 governs the exported cue signatures, not this private
 *  helper. */
function click(centerHz: number, q: number, gain: number, ms: number, delayS = 0): void {
  if (!ctx) return
  const t = ctx.currentTime + delayS
  const dur = ms / 1000
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, dur + 0.01)
  const filt = ctx.createBiquadFilter()
  filt.type = 'bandpass'
  filt.frequency.value = centerHz
  filt.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filt)
  filt.connect(g)
  g.connect(ctx.destination)
  src.start(t)
  src.stop(t + dur + 0.01)
}

/** A tonal envelope, optionally filtered and optionally delayed (for
 *  multi-beat chords). `freqEnd` !== `freqStart` sweeps the pitch (used for
 *  the dive-key / hollow-thud weight). `filterType` defaults to 'lowpass' —
 *  call sites reach for a resonant 'bandpass' only where a bell ring is wanted
 *  (none here; the coin/bell partials are built additively instead), and a
 *  plain 'lowpass' where a duller, weightier mass-impact colour is wanted (the
 *  dive-key thunk, the hollow bust thud). */
function tone(
  freqStart: number,
  freqEnd: number,
  gain: number,
  ms: number,
  type: OscillatorType,
  opts?: { filterHz?: number; filterQ?: number; filterType?: BiquadFilterType; delayS?: number },
): void {
  if (!ctx) return
  const dur = ms / 1000
  const t = ctx.currentTime + (opts?.delayS ?? 0)
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freqStart, t)
  if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur / 4))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  let out: AudioNode = osc
  if (opts?.filterHz) {
    const filt = ctx.createBiquadFilter()
    filt.type = opts.filterType ?? 'lowpass'
    filt.frequency.value = opts.filterHz
    filt.Q.value = opts.filterQ ?? 0.7
    osc.connect(filt)
    out = filt
  }
  out.connect(g)
  g.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

// ─── Dive-key plunge — feeling 1 ────────────────────────────────────────────
// The held breath resolving into a decisive, weighty DIVE action — a sonar
// ping firing as the hand sweeps to the dive key, immediately followed by the
// heavy seat of a hull breaker dropping home. A soft sonar-ping plus a
// falling-pitch triangle-through-LOWPASS breaker thunk — a dull, solid
// mass-impact colour (steel hull, not spark). Module consts only; zero-param;
// fires once per plunge via ensureAudio().
export const SONAR_PING_HZ = 650 as const
export const SONAR_PING_Q = 0.6 as const
export const SONAR_PING_VOL = 0.16 as const
export const SONAR_PING_MS = 70 as const
export const BREAKER_THUNK_HZ_START = 130 as const
export const BREAKER_THUNK_HZ_END = 48 as const
export const BREAKER_THUNK_VOL = 0.3 as const
export const BREAKER_THUNK_MS = 220 as const
export const BREAKER_THUNK_FILTER_HZ = 180 as const
export const BREAKER_THUNK_FILTER_Q = 0.8 as const
export const BREAKER_THUNK_FILTER_TYPE = 'lowpass' as const
export const BREAKER_THUNK_DELAY_S = 0.03 as const

/** The dive-key plunge — a sonar ping plus a low, falling-pitch breaker
 *  thunk. Zero-param. Identical every plunge regardless of wager size, trail
 *  length chosen, or how the session has gone so far. */
export function playPlungeThunk(): void {
  click(SONAR_PING_HZ, SONAR_PING_Q, SONAR_PING_VOL, SONAR_PING_MS)
  tone(BREAKER_THUNK_HZ_START, BREAKER_THUNK_HZ_END, BREAKER_THUNK_VOL, BREAKER_THUNK_MS, 'triangle', {
    filterHz: BREAKER_THUNK_FILTER_HZ,
    filterQ: BREAKER_THUNK_FILTER_Q,
    filterType: BREAKER_THUNK_FILTER_TYPE,
    delayS: BREAKER_THUNK_DELAY_S,
  })
}

// ─── Per-disc gold coin-clink — feeling 2 ───────────────────────────────────
// The bright ring of a struck gold disc catching the sub-light as it flips open,
// one by one, racing disc-to-disc down the claimed line. A tight coin-land
// click plus a warm, two-partial coin-metal chime — a clean triangle
// fundamental plus a fast-decaying, inharmonically-ratioed upper partial for a
// coin-ring beat — reading as gold landing on the seafloor, never as electricity.
// PITCH nudges with the disc's BOUNDED economic weight (never with streak
// position or trail length) — the pre-existing RG-C5-compliant pattern, kept
// fully intact: the input is clamped to BEAD_ECONOMIC_CAP_BPS before it ever
// touches an oscillator frequency. AMPLITUDE is fixed regardless.
export const BEAD_ECONOMIC_CAP_BPS = 4_000n
export const COIN_LAND_CLICK_HZ = 1_800 as const
export const COIN_LAND_CLICK_Q = 6 as const
export const COIN_LAND_CLICK_VOL = 0.05 as const
export const COIN_LAND_CLICK_MS = 9 as const
export const BEAD_GAIN = 0.065 as const
export const BEAD_MS = 110 as const
export const BEAD_HZ_BASE = 750 as const
export const BEAD_HZ_SPAN = 320 as const
export const BEAD_OVERTONE_RATIO = 2.24 as const // an inharmonic partial, reads as coin/gold rather than a musical octave
export const BEAD_OVERTONE_GAIN_MULT = 0.3 as const
export const BEAD_OVERTONE_MS_MULT = 0.4 as const

/** Current-bead lands on a disc — a struck gold coin catching the sub-light.
 *  Pitch keyed ONLY to the disc's bounded economic weight (higher rung →
 *  higher, brighter coin-pitch), never to streak length or how many discs
 *  have already struck (RG-C5). Amplitude is the fixed BEAD_GAIN const — the
 *  1st chime and the 20th are the same loudness.
 *
 *  The clamp→norm→freq body below is PRESERVED VERBATIM (the RG-C5 pitch-only
 *  mapping); only the timbre consts changed. */
export function playBead(deltaBps: bigint): void {
  const clamped = deltaBps < 0n ? 0n : deltaBps > BEAD_ECONOMIC_CAP_BPS ? BEAD_ECONOMIC_CAP_BPS : deltaBps
  const norm = Number(clamped) / Number(BEAD_ECONOMIC_CAP_BPS)
  const freq = BEAD_HZ_BASE + norm * BEAD_HZ_SPAN
  click(COIN_LAND_CLICK_HZ, COIN_LAND_CLICK_Q, COIN_LAND_CLICK_VOL, COIN_LAND_CLICK_MS)
  tone(freq, freq, BEAD_GAIN, BEAD_MS, 'triangle')
  tone(
    freq * BEAD_OVERTONE_RATIO,
    freq * BEAD_OVERTONE_RATIO,
    BEAD_GAIN * BEAD_OVERTONE_GAIN_MULT,
    BEAD_MS * BEAD_OVERTONE_MS_MULT,
    'sine',
  )
}

// ─── Dart-trap crack — the run halting ──────────────────────────────────────
// Dry, blunt, decisive — a hidden dart-trap disc cracking open dark instead of
// gold (the ember-register `#EF5A3F` beat, matched to the cracked-doubloon tile
// art). A short, dry stone-crack (the disc splitting) plus a low hollow thud
// through a LOWPASS with a fast, hard-stop decay — no ring, no drama, no
// crescendo. Zero-param; identical envelope regardless of how many discs had
// already struck before the trap (RG-C3 — no scaling with revealed count) and
// regardless of wager size.
export const STONE_CRACK_HZ = 500 as const
export const STONE_CRACK_Q = 0.9 as const
export const STONE_CRACK_VOL = 0.26 as const
export const STONE_CRACK_MS = 20 as const
export const HOLLOW_THUD_HZ_START = 110 as const
export const HOLLOW_THUD_HZ_END = 25 as const
export const HOLLOW_THUD_VOL = 0.28 as const
export const HOLLOW_THUD_MS = 150 as const
export const HOLLOW_THUD_FILTER_HZ = 160 as const
export const HOLLOW_THUD_FILTER_Q = 0.7 as const
export const HOLLOW_THUD_FILTER_TYPE = 'lowpass' as const
export const HOLLOW_THUD_DELAY_S = 0.01 as const

/** Dart-trap disc — the run busts, the disc cracks dark. Same dry, blunt
 *  envelope every time; no parameters exist through which a bigger trail or
 *  bigger wager could make this sound louder or longer. */
export function playBadVein(): void {
  click(STONE_CRACK_HZ, STONE_CRACK_Q, STONE_CRACK_VOL, STONE_CRACK_MS)
  tone(HOLLOW_THUD_HZ_START, HOLLOW_THUD_HZ_END, HOLLOW_THUD_VOL, HOLLOW_THUD_MS, 'triangle', {
    filterHz: HOLLOW_THUD_FILTER_HZ,
    filterQ: HOLLOW_THUD_FILTER_Q,
    filterType: HOLLOW_THUD_FILTER_TYPE,
    delayS: HOLLOW_THUD_DELAY_S,
  })
}

// ─── Gold-settle — feeling 3 ────────────────────────────────────────────────
// The claimed gold settling into the hoard: a bright coin-settle click plus a
// fixed 4-click GOLD CASCADE (coins spilling into the pile) plus a warm
// two-note resolve (D4 → G4, octave down from the old pass — a lower, warmer
// "sealed in" gesture) re-timbred as a bright triangle fundamental layered with
// a fast-decaying high sine partial (a coin/bell shimmer). THIS is the
// highest-temptation function in the file — it fires on every proven claim — so
// it is the most strictly zero-param of all: it has no way to see the payout
// multiple, the trail length, or the streak, and the gold cascade below is
// indexed ONLY by a fixed loop i (the click count/HZ/delays are literal module
// consts, NEVER derived from trail/payout). The claim on a 2-disc trail and the
// claim on a full-board trail are bit-identical in amplitude and duration.
export const COIN_SETTLE_CLICK_HZ = 1_600 as const
export const COIN_SETTLE_CLICK_Q = 5 as const
export const COIN_SETTLE_CLICK_VOL = 0.08 as const
export const COIN_SETTLE_CLICK_MS = 12 as const
export const CLAIM_NOTE_VOL = 0.12 as const
export const CLAIM_NOTE_MS = 520 as const
export const CLAIM_SHIMMER_RATIO = 1.5 as const // bright attack partial — the coin/bell shimmer
export const CLAIM_SHIMMER_GAIN_MULT = 0.28 as const
export const CLAIM_SHIMMER_MS = 110 as const
export const CLAIM_NOTES: ReadonlyArray<readonly [freqHz: number, delayS: number]> = [
  [294, 0], // D4 — the gold lands (octave down)
  [392, 0.11], // G4 — resolves up a clean fourth, sealed in
] as const
// Fixed gold-coin cascade — coins spilling into the hoard. Every value is a
// literal module const; the loop is indexed ONLY by the fixed i, NEVER by trail
// length or payout, so total duration + gain envelope are byte-identical for a
// 2-disc claim and a full-board claim.
export const GOLD_CASCADE_CLICK_COUNT = 4 as const
export const GOLD_CASCADE_HZ = [2_200, 1_900, 1_600, 1_300] as const
export const GOLD_CASCADE_Q = 3 as const
export const GOLD_CASCADE_VOL = 0.05 as const
export const GOLD_CASCADE_MS = 40 as const
export const GOLD_CASCADE_DELAYS = [0, 0.05, 0.095, 0.135] as const

/** Claim proven — the whole line cleared, the gold settles into the hoard.
 *  Zero-param. Identical amplitude and duration regardless of the final
 *  multiplier, the wager, or the session's streak — the RG-C5 pin that matters
 *  most, because this is the one function every win passes through. */
export function playClaim(): void {
  click(COIN_SETTLE_CLICK_HZ, COIN_SETTLE_CLICK_Q, COIN_SETTLE_CLICK_VOL, COIN_SETTLE_CLICK_MS)
  // Fixed gold cascade — indexed only by i, never by any round value.
  for (let i = 0; i < GOLD_CASCADE_CLICK_COUNT; i++) {
    click(GOLD_CASCADE_HZ[i]!, GOLD_CASCADE_Q, GOLD_CASCADE_VOL, GOLD_CASCADE_MS, GOLD_CASCADE_DELAYS[i]!)
  }
  for (const [freq, delayS] of CLAIM_NOTES) {
    tone(freq, freq, CLAIM_NOTE_VOL, CLAIM_NOTE_MS, 'triangle', { delayS })
    tone(freq * CLAIM_SHIMMER_RATIO, freq * CLAIM_SHIMMER_RATIO, CLAIM_NOTE_VOL * CLAIM_SHIMMER_GAIN_MULT, CLAIM_SHIMMER_MS, 'sine', {
      delayS,
    })
  }
}

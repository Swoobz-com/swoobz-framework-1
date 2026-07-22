/**
 * AUTOMAT — WebAudio cues. Zero asset files, pure synthesis.
 *
 * Register: LATE-NIGHT ARCADE VENDING MACHINE — porcelain body, cyan neon,
 * physical machinery. Every cue reads as MECHANISM (coin drop, coil motor,
 * cardboard pack landing in a steel tray), never a slot-machine jingle.
 * The four beats:
 *   (1) coin into the slot (the buy)          → ensureAudio (playCoinInsert)
 *   (2) coil turns, a pack drops in the tray  → playVendPack
 *   (3) a GOLD pack drops                     → playGoldPack (outcome-CLASS cue)
 *   (4) the tray is served (settle)           → playTrayServed
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  RG-C5 STRUCTURAL ENFORCEMENT (load-bearing, non-negotiable):        ║
 * ║  Every exported cue is ZERO-PARAM. No function reads or accepts a    ║
 * ║  streak length, session counter, wager size, pack count, or payout   ║
 * ║  multiple. AMPLITUDE and DURATION are module-level consts — there is ║
 * ║  no parameter through which to scale them. `playGoldPack` differs    ║
 * ║  from `playVendPack` by OUTCOME CLASS only (gold vs standard — like  ║
 * ║  vault's rug vs safe): it is identical for a 5× gold and a 100×      ║
 * ║  gold. `playTrayServed` fires on every settle and cannot see the     ║
 * ║  payout at all.                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * AudioContext is lazy-created from a user gesture (browser policy):
 * `ensureAudio()` is called from exactly one site in `vendingProvider.ts` —
 * the instant the player presses VEND — so it doubles as the (idempotent)
 * context bootstrap AND the coin-insert cue.
 */

let ctx: AudioContext | null = null

// ── Module-const timings/levels (RG-C5: the ONLY tuning surface) ────────────
const COIN_CLICK_HZ = 2_600
const COIN_CLICK_MS = 45
const COIN_THUNK_HZ_START = 190
const COIN_THUNK_HZ_END = 70
const COIN_THUNK_MS = 130
const COIN_VOL = 0.16

const COIL_WHIRR_HZ = 340
const COIL_WHIRR_MS = 210
const COIL_VOL = 0.05
const DROP_THUD_HZ_START = 150
const DROP_THUD_HZ_END = 55
const DROP_THUD_MS = 120
const DROP_VOL = 0.14
const DROP_DELAY_S = 0.2

const GOLD_CHIME_HZS = [1_318.5, 1_661.2, 1_975.5] as const // E6 · G#6 · B6, fixed triad
const GOLD_CHIME_STEP_S = 0.07
const GOLD_CHIME_MS = 340
const GOLD_VOL = 0.075

const SERVE_CLICK_HZ = 1_900
const SERVE_CLICK_MS = 50
const SERVE_TONE_HZ = 660
const SERVE_TONE_MS = 260
const SERVE_VOL = 0.09

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
  playCoinInsert()
}

// ── Private synthesis primitives (not the RG-C5 surface; call sites pass
//    module consts only) ─────────────────────────────────────────────────────

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/** Filtered-noise mechanical transient (coin click, coil whirr, tray click). */
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

/** Tonal envelope with optional pitch sweep (pack thud weight, serve tone). */
function tone(
  freqStart: number,
  freqEnd: number,
  gain: number,
  ms: number,
  delayS = 0,
  type: OscillatorType = 'sine',
): void {
  if (!ctx) return
  const t = ctx.currentTime + delayS
  const dur = ms / 1000
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freqStart, t)
  if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.01)
}

// ── The four cues (RG-C5 surface: all zero-param) ───────────────────────────

/** Coin into the slot: bright click + low body thunk. Fires once per buy. */
export function playCoinInsert(): void {
  click(COIN_CLICK_HZ, 6, COIN_VOL, COIN_CLICK_MS)
  tone(COIN_THUNK_HZ_START, COIN_THUNK_HZ_END, COIN_VOL, COIN_THUNK_MS, 0.05)
}

/** Standard pack vend: coil motor whirr, then the cardboard tray thud. */
export function playVendPack(): void {
  click(COIL_WHIRR_HZ, 1.4, COIL_VOL, COIL_WHIRR_MS)
  tone(DROP_THUD_HZ_START, DROP_THUD_HZ_END, DROP_VOL, DROP_THUD_MS, DROP_DELAY_S)
}

/** GOLD pack vend: same mechanism + a fixed 3-note chime. Outcome-class cue —
 *  byte-identical for every gold value (5× or 100×). */
export function playGoldPack(): void {
  click(COIL_WHIRR_HZ, 1.4, COIL_VOL, COIL_WHIRR_MS)
  tone(DROP_THUD_HZ_START, DROP_THUD_HZ_END, DROP_VOL, DROP_THUD_MS, DROP_DELAY_S)
  // Fixed triad, indexed only by the fixed loop i — never by value/count.
  for (let i = 0; i < GOLD_CHIME_HZS.length; i++) {
    tone(GOLD_CHIME_HZS[i]!, GOLD_CHIME_HZS[i]!, GOLD_VOL, GOLD_CHIME_MS, DROP_DELAY_S + 0.1 + i * GOLD_CHIME_STEP_S, 'triangle')
  }
}

/** Tray served (settle). Fires on EVERY settle, identical for any total. */
export function playTrayServed(): void {
  click(SERVE_CLICK_HZ, 5, SERVE_VOL, SERVE_CLICK_MS)
  tone(SERVE_TONE_HZ, SERVE_TONE_HZ, SERVE_VOL, SERVE_TONE_MS, 0.06, 'triangle')
}

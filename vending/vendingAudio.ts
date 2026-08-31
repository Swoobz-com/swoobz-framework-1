/**
 * AUTOMAT — WebAudio cues. Zero asset files, pure synthesis.
 *
 * Register: LATE-NIGHT ARCADE VENDING MACHINE — porcelain body, cyan neon,
 * physical machinery. Every cue reads as MECHANISM (coin drop, coil motor,
 * cardboard pack landing in a steel tray), never a slot-machine jingle.
 * The four VEND beats:
 *   (1) coin into the slot (the buy)          → ensureAudio (playCoinInsert)
 *   (2) coil turns, a pack drops in the tray  → playVendPack
 *   (3) a GOLD pack drops                     → playGoldPack (outcome-CLASS cue)
 *   (4) the tray is served (settle)           → playTrayServed
 *
 * The five RIP beats (F5, feedback 2026-08-31 "flat and simple"). These serve
 * the cutscene, whose choreography is class-keyed, so the cues are too:
 *   (5) the anticipation hold before the peel → playBuildTick (fixed pitch,
 *       fires a FIXED number of times per rip, identical every rip)
 *   (6) the foil lip tears open               → playRipOpen
 *   (7) an EMPTY card lands                   → playDudSettle   (class: empty)
 *   (8) a paying non-gold card lands          → playStandardSettle
 *       (class: common/rare — a 1.2x and a 9.9x get the SAME two notes)
 *   (9) the rip closes on a NET LOSS          → playLossClose (neutral, no
 *       "you lost" sting; net win is already carried by the settle cues)
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
 * ║                                                                      ║
 * ║  The 2026-08-31 additions hold the SAME line. `playBuildTick` is a   ║
 * ║  fixed pitch at a fixed level fired a fixed number of times — it     ║
 * ║  cannot rise, and it fires BEFORE any card is face-up, so it is not  ║
 * ║  even outcome-aware. `playDudSettle` / `playStandardSettle` /        ║
 * ║  `playGoldPack` are the three OUTCOME-CLASS settle cues: which one   ║
 * ║  fires is decided by the card's class alone, and every card of a     ║
 * ║  class sounds byte-identical regardless of its multiple.             ║
 * ║  `playLossClose` is keyed to net-loss-vs-net-win, the same RG-C2     ║
 * ║  class line the NET figure is styled on, and is deliberately         ║
 * ║  NEUTRAL — a mechanism closing, never a punishment sting.            ║
 * ║  Nothing here reads a streak, a session counter or a balance.        ║
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

// ── Rip-cutscene cues (F5). Same rule: consts only, no parameters. ──────────
// Anticipation tick: ONE fixed pitch at ONE fixed level. The cutscene fires it
// a fixed number of times per rip; it never climbs and never speeds up.
const BUILD_TICK_HZ = 1_480
const BUILD_TICK_Q = 9
const BUILD_TICK_MS = 26
const BUILD_TICK_VOL = 0.05

// Foil tear: a bright broadband rasp that falls into a paper-body rustle.
const RIP_TEAR_HZ = 3_050
const RIP_TEAR_Q = 0.75
const RIP_TEAR_MS = 230
const RIP_TEAR_VOL = 0.1
const RIP_BODY_HZ = 1_250
const RIP_BODY_Q = 0.9
const RIP_BODY_MS = 170
const RIP_BODY_VOL = 0.065
const RIP_BODY_DELAY_S = 0.07

// EMPTY card landing: a dead cardboard thud, no tone tail.
const DUD_THUD_HZ_START = 124
const DUD_THUD_HZ_END = 48
const DUD_THUD_MS = 155
const DUD_THUD_VOL = 0.105
const DUD_TAP_HZ = 320
const DUD_TAP_Q = 2
const DUD_TAP_MS = 34
const DUD_TAP_VOL = 0.05

// Paying non-gold card landing: a modest two-note lift. Deliberately quieter
// and shorter than the gold triad so the classes stay distinguishable by
// CHARACTER, never by loudness-scaled-to-value.
const STD_CHIME_HZS = [880, 1_174.7] as const // A5 · D6, fixed pair
const STD_CHIME_STEP_S = 0.055
const STD_CHIME_MS = 185
const STD_CHIME_VOL = 0.05

// Net-loss close: the machine shutting its tray. Neutral by design.
const LOSS_CLICK_HZ = 880
const LOSS_CLICK_Q = 3
const LOSS_CLICK_MS = 70
const LOSS_CLICK_VOL = 0.07
const LOSS_TONE_HZ_START = 300
const LOSS_TONE_HZ_END = 215
const LOSS_TONE_MS = 190
const LOSS_TONE_VOL = 0.055
const LOSS_TONE_DELAY_S = 0.05

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

// ── The five rip cues (RG-C5 surface: all zero-param) ───────────────────────

/** Anticipation tick during the pre-peel hold. Fixed pitch, fixed level. The
 *  call site fires it a fixed number of times at a fixed spacing, so the whole
 *  build-up is byte-identical on every rip and carries NO outcome tell. */
export function playBuildTick(): void {
  click(BUILD_TICK_HZ, BUILD_TICK_Q, BUILD_TICK_VOL, BUILD_TICK_MS)
}

/** The foil lip tearing open. Fires once per rip, before anything is known. */
export function playRipOpen(): void {
  click(RIP_TEAR_HZ, RIP_TEAR_Q, RIP_TEAR_VOL, RIP_TEAR_MS)
  click(RIP_BODY_HZ, RIP_BODY_Q, RIP_BODY_VOL, RIP_BODY_MS, RIP_BODY_DELAY_S)
}

/** An EMPTY card landing: cardboard thud. Outcome-CLASS cue (empty), identical
 *  for every empty card there has ever been. */
export function playDudSettle(): void {
  click(DUD_TAP_HZ, DUD_TAP_Q, DUD_TAP_VOL, DUD_TAP_MS)
  tone(DUD_THUD_HZ_START, DUD_THUD_HZ_END, DUD_THUD_VOL, DUD_THUD_MS, 0.02)
}

/** A paying non-gold card landing: a modest fixed two-note lift. Outcome-CLASS
 *  cue — a 1.2× and a 9.9× produce exactly these two notes at this one level. */
export function playStandardSettle(): void {
  // Fixed pair, indexed only by the fixed loop i — never by value/count.
  for (let i = 0; i < STD_CHIME_HZS.length; i++) {
    tone(STD_CHIME_HZS[i]!, STD_CHIME_HZS[i]!, STD_CHIME_VOL, STD_CHIME_MS, i * STD_CHIME_STEP_S, 'triangle')
  }
}

/** The rip closing on a NET LOSS. Neutral mechanism close (tray shutting) —
 *  never a punishment sting. Keyed to the net-loss CLASS only. */
export function playLossClose(): void {
  click(LOSS_CLICK_HZ, LOSS_CLICK_Q, LOSS_CLICK_VOL, LOSS_CLICK_MS)
  tone(LOSS_TONE_HZ_START, LOSS_TONE_HZ_END, LOSS_TONE_VOL, LOSS_TONE_MS, LOSS_TONE_DELAY_S)
}

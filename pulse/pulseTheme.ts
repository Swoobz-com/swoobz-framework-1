/**
 * Pulse Quantum-Lab Ambient Theme — Web Audio procedural synth.
 *
 * Aesthetic register: Tron Legacy / Blade Runner 2049 / SpaceX command room.
 * Dark synth pad + slow cyan arpeggio + subtle reverb. Premium, calm,
 * "trading desk serious" — never carnival/slot.
 *
 * Musical structure (RG-C5 STRUCTURAL — every const is module-level so the
 * theme is byte-identical for every player, every round; no streak / wager
 * / session state ever reaches the audio graph):
 *   - Key: A natural minor (A2 / E3 / A3 stacked drone pad)
 *   - Tempo: 30 BPM (one arp note per ~2s — slow, contemplative)
 *   - Pad: 3-oscillator triad (sine root + triangle 5th + triangle 8va) for
 *     dark, glassy harmonic floor
 *   - Arpeggio: A minor pentatonic, 8-note pattern over 16s, triangle
 *     pluck envelope (fast attack, exponential decay)
 *   - Loop: 16s — pattern wraps seamlessly because phase is computed from
 *     `arpScheduledUntil` modulo loop length
 *
 * Browser autoplay: `startPulseTheme()` must be called from a user-gesture
 * handler (pointerdown / keydown). It returns silently under SSR or when
 * AudioContext can't be created. `stopPulseTheme()` fades out and cleans up.
 *
 * RG-C5 STRUCTURAL: master gain + note schedule + arp pattern are all
 * module-level consts. No streak/session/wager state reaches the theme.
 */

// ─── Module-level constants (RG-C5 structural pins) ─────────────────────────
export const THEME_MASTER_VOL = 0.18 as const
export const THEME_FADE_IN_MS = 1200 as const
export const THEME_FADE_OUT_MS = 600 as const
export const THEME_LOOP_DURATION_S = 16 as const

// Cool synth scale — A natural minor in low octaves for the pad
// + middle octave for the arpeggio. Picked for cyber-noir mood.
export const PAD_FREQS_HZ = [110, 165, 220] as const
// ^ A2 (root) + E3 (perfect 5th) + A3 (octave)
export const ARP_FREQS_HZ = [220, 261.63, 329.63, 392, 523.25] as const
// ^ A3, C4, E4, G4, C5 — A-minor pentatonic ascending

// Arpeggio note pattern (indices into ARP_FREQS_HZ). 8 notes over 16s
// = 2.0s per note. A → E → G → C → G → E → C → A descent-and-return.
export const ARP_PATTERN = [0, 2, 3, 4, 3, 2, 1, 0] as const

// ─── State (mutable, intentionally scoped to module) ────────────────────────
let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let padOscs: OscillatorNode[] = []
let padGain: GainNode | null = null
let arpScheduledUntil = 0
let arpTimer: number | null = null
let playing = false

function ensureCtx(): AudioContext | null {
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

/**
 * Start the theme. Must be called from a user-gesture handler (browser
 * autoplay policy). Idempotent — safe to call multiple times; only starts
 * once. Silently no-ops under SSR / when AudioContext is unavailable.
 */
export function startPulseTheme(): void {
  if (playing) return
  const a = ensureCtx()
  if (!a) return
  if (a.state === 'suspended') {
    void a.resume()
  }

  // Master gain w/ fade-in
  masterGain = a.createGain()
  masterGain.gain.setValueAtTime(0.0001, a.currentTime)
  masterGain.gain.exponentialRampToValueAtTime(
    THEME_MASTER_VOL,
    a.currentTime + THEME_FADE_IN_MS / 1000,
  )
  masterGain.connect(a.destination)

  // Pad chord — 3 oscillators (sine root + triangle 5th + triangle 8va)
  padGain = a.createGain()
  padGain.gain.setValueAtTime(0.65, a.currentTime)
  padGain.connect(masterGain)
  padOscs = PAD_FREQS_HZ.map((freq, i) => {
    const osc = a.createOscillator()
    osc.type = i === 0 ? 'sine' : 'triangle'
    osc.frequency.setValueAtTime(freq, a.currentTime)
    osc.detune.setValueAtTime(0, a.currentTime)
    if (padGain) osc.connect(padGain)
    osc.start(a.currentTime)
    return osc
  })

  // Arpeggio scheduler — look-ahead window of 4s, refreshed every 1s.
  arpScheduledUntil = a.currentTime
  scheduleArpAhead()
  arpTimer = window.setInterval(scheduleArpAhead, 1000) as unknown as number

  playing = true
}

function scheduleArpAhead(): void {
  const a = ctx
  if (!a || !masterGain) return
  const noteDuration = THEME_LOOP_DURATION_S / ARP_PATTERN.length
  const lookAhead = 4
  while (arpScheduledUntil < a.currentTime + lookAhead) {
    const patternIdx = Math.floor((arpScheduledUntil / noteDuration) % ARP_PATTERN.length)
    const noteIdx = ARP_PATTERN[patternIdx] ?? 0
    const freq = ARP_FREQS_HZ[noteIdx] ?? ARP_FREQS_HZ[0]
    playArpNote(a, masterGain, freq, arpScheduledUntil, noteDuration)
    arpScheduledUntil += noteDuration
  }
}

function playArpNote(
  a: AudioContext,
  out: GainNode,
  freq: number,
  when: number,
  dur: number,
): void {
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, when)
  // Pluck envelope: fast attack, exponential decay. Peak amplitude is a
  // module-level constant (0.18) — never modulated by game state.
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(0.18, when + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur * 0.95)
  osc.connect(gain).connect(out)
  osc.start(when)
  osc.stop(when + dur)
}

/**
 * Fade out and stop the theme. Idempotent. Cleans up all oscillators and
 * disconnects from `destination` after the fade completes.
 */
export function stopPulseTheme(): void {
  if (!playing) return
  const a = ctx
  if (!a || !masterGain) {
    playing = false
    return
  }
  const now = a.currentTime
  masterGain.gain.cancelScheduledValues(now)
  masterGain.gain.setValueAtTime(masterGain.gain.value, now)
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + THEME_FADE_OUT_MS / 1000)
  const oscsToStop = padOscs
  const gainToDisconnect = masterGain
  setTimeout(() => {
    for (const osc of oscsToStop) {
      try {
        osc.stop()
      } catch {
        // Already stopped — safe to ignore.
      }
    }
    try {
      gainToDisconnect.disconnect()
    } catch {
      // Already disconnected — safe to ignore.
    }
  }, THEME_FADE_OUT_MS + 50)
  padOscs = []
  masterGain = null
  padGain = null
  if (arpTimer !== null) {
    window.clearInterval(arpTimer)
    arpTimer = null
  }
  playing = false
}

/** True if the theme is currently audible. */
export function isPulseThemePlaying(): boolean {
  return playing
}

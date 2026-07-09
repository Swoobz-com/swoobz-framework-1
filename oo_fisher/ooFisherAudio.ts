/**
 * OO-Fisher audio — synthesized via Web Audio API. Zero asset files.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  RG-C5 HARD CONSTRAINT (load-bearing for this game):                 ║
 * ║                                                                      ║
 * ║  The CATCH chord is IDENTICAL across all six rarity tiers.           ║
 * ║  The catch sound for a Common is bit-identical to a Mythic.          ║
 * ║  The TRIP-END chord is IDENTICAL whether the trip multiplier is      ║
 * ║  1.10x or 10.00x.                                                    ║
 * ║                                                                      ║
 * ║  Every audio function takes ZERO state-dependent parameters by       ║
 * ║  design. The type system structurally forbids a future contributor   ║
 * ║  from passing a rarity or multiplier into a fanfare function.        ║
 * ║                                                                      ║
 * ║  Only the SPRITE differs across rarities (color). The audio is the   ║
 * ║  same. This is non-negotiable per                                    ║
 * ║  `research/originals-game-craft/AUTONOMOUS-FUN-GOAL-2026-05-22.md`   ║
 * ║  and matches the OO-Burst + Daily Dial precedent.                    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * AudioContext must be lazy-created from a user gesture (browser policy);
 * `ensureAudio()` is called from the first user click in the provider.
 *
 * The register stays calm: OO-Fisher is a meditative grinding loop, not a
 * slot. The catch chord is bright and warm but quiet (peak 0.18). The
 * cast / reel / upgrade sounds are functional confirmations, not arousal
 * triggers.
 */
import {
  isSfxLoaded,
  type MusicRegistration,
  playSfx,
  type SfxRegistration,
} from '../_shared/audio'

/**
 * OO-Fisher ambient theme — "Lazy Day v0_9" by FoxSynergy (CC-BY 3.0).
 * Source: https://opengameart.org/content/lazy-day
 * Attribution required on /credits page.
 *
 * Warm-register acoustic loop (plucked string + flute + xylophone) for
 * the wood + brass + sunset OO-Fisher world. Encoded as OGG Vorbis q3
 * at 44.1kHz with a 50ms fade-in, trimmed to 240s.
 *
 * RG-C5: volume controlled by MUSIC_VOLUME=0.35 as const in swoobzMusic.ts.
 * No volume field on this registration — structural enforcement.
 */
export const MUSIC_OO_FISHER_THEME: MusicRegistration = {
  id: 'oo-fisher-theme',
  sources: ['/assets/music/oo_fisher/lazy-day.ogg'],
} as const

// ─── Sound IDs (RG-C5 structural — module-level CONSTS) ───────────────────
export const SID_CAST_LAUNCH = 'oo-fisher-cast-launch' as const
export const SID_FISH_BITE = 'oo-fisher-fish-bite' as const
export const SID_REEL_TAP = 'oo-fisher-reel-tap' as const
export const SID_CATCH_FANFARE = 'oo-fisher-catch-fanfare' as const
export const SID_LINE_SNAP = 'oo-fisher-line-snap' as const
export const SID_TRIP_END_FANFARE = 'oo-fisher-trip-end-fanfare' as const
export const SID_UPGRADE_PURCHASE = 'oo-fisher-upgrade-purchase' as const

// ─── Module-level amplitude constants (RG-C5 structural pins) ─────────────
export const CAST_LAUNCH_VOL = 0.45 as const
export const FISH_BITE_VOL = 0.5 as const
export const REEL_TAP_VOL = 0.35 as const
export const CATCH_FANFARE_VOL = 0.55 as const
export const LINE_SNAP_VOL = 0.4 as const
export const TRIP_END_FANFARE_VOL = 0.55 as const
export const UPGRADE_PURCHASE_VOL = 0.55 as const

// ─── Audio manifest ───────────────────────────────────────────────────────
export const AUDIO_MANIFEST: ReadonlyArray<SfxRegistration> = [
  {
    id: SID_CAST_LAUNCH,
    sources: ['/assets/raw/kenney/audio/oo-fisher/drip1.ogg'],
    volume: CAST_LAUNCH_VOL,
  },
  {
    id: SID_FISH_BITE,
    sources: ['/assets/raw/kenney/audio/oo-fisher/sinkWater1.ogg'],
    volume: FISH_BITE_VOL,
  },
  {
    id: SID_REEL_TAP,
    sources: ['/assets/raw/kenney/audio/oo-fisher/tick_002.ogg'],
    volume: REEL_TAP_VOL,
  },
  {
    id: SID_CATCH_FANFARE,
    sources: ['/assets/raw/kenney/audio/oo-fisher/impactBell_heavy_000.ogg'],
    volume: CATCH_FANFARE_VOL,
  },
  {
    id: SID_LINE_SNAP,
    sources: ['/assets/raw/kenney/audio/oo-fisher/impactMetal_light_000.ogg'],
    volume: LINE_SNAP_VOL,
  },
  {
    id: SID_TRIP_END_FANFARE,
    sources: ['/assets/raw/kenney/audio/oo-fisher/jingles-saxophone_05.ogg'],
    volume: TRIP_END_FANFARE_VOL,
  },
  {
    id: SID_UPGRADE_PURCHASE,
    sources: ['/assets/raw/kenney/audio/oo-fisher/impactBell_heavy_002.ogg'],
    volume: UPGRADE_PURCHASE_VOL,
  },
] as const

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

// ─── Module-level audio constants (RG-C5 structural pins) ─────────────────
// These constants describe each audio event and are exported so any test
// can pin the structural invariant: durations + peaks are MODULE constants,
// not per-rarity / per-multiplier parameters.

export const CAST_LAUNCH_DURATION_MS = 220
export const REEL_TAP_DURATION_MS = 90
export const FISH_BITE_DURATION_MS = 140
export const CATCH_FANFARE_DURATION_MS = 620
export const LINE_SNAP_DURATION_MS = 320
export const TRIP_END_FANFARE_DURATION_MS = 700
export const UPGRADE_PURCHASE_DURATION_MS = 480

/**
 * The CAST LAUNCH tone. Fires when the player releases the cast button and
 * the line launches. Zero parameters. Brief whoosh — sub-200ms.
 */
export function playCastLaunch(): void {
  playSfx(SID_CAST_LAUNCH)
  if (isSfxLoaded(SID_CAST_LAUNCH)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(220, now)
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.2)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.1, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)
  osc.connect(gain).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.24)
}

/**
 * The FISH BITE tick. Fires the instant a fish bites the lure. Short, sharp,
 * informational — the bobber dip is the visual partner. Zero parameters.
 */
export function playFishBite(): void {
  playSfx(SID_FISH_BITE)
  if (isSfxLoaded(SID_FISH_BITE)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(660, now + 0.12)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)
  osc.connect(gain).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.15)
}

/**
 * The REEL TAP tone. Fires on each reel-rhythm tap during the reeling
 * minigame. Quiet, percussive — the player should hear the rhythm. Zero
 * parameters; the pitch is identical at every tap.
 */
export function playReelTap(): void {
  playSfx(SID_REEL_TAP)
  if (isSfxLoaded(SID_REEL_TAP)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(660, now)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
  osc.connect(gain).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.09)
}

/**
 * The CATCH FANFARE chord. Fires on every successful catch — IDENTICAL
 * across all six rarity tiers. Zero parameters. RG-C5 structural.
 *
 * Three-note open major chord (C5, E5, G5) — bright and warm without
 * escalating. The chord MUST NOT have a rarity-keyed pitch ramp or layer
 * stack. Any future code that conditions the chord on rarity is a bug.
 */
export function playCatchFanfare(): void {
  playSfx(SID_CATCH_FANFARE)
  if (isSfxLoaded(SID_CATCH_FANFARE)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  // C5, E5, G5 — open major triad. Identical every catch.
  const notes: ReadonlyArray<readonly [number, number]> = [
    [523, 0.18],
    [659, 0.14],
    [784, 0.12],
  ]
  for (const [freq, peakGain] of notes) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
    osc.connect(gain).connect(a.destination)
    osc.start(now)
    osc.stop(now + 0.62)
  }
}

/**
 * The LINE SNAP / FISH ESCAPE tone. Fires when the reeling minigame fails
 * (tension out of zone too long). Informational, NOT punitive. Zero
 * parameters; the loss sound never gets louder or longer.
 */
export function playLineSnap(): void {
  playSfx(SID_LINE_SNAP)
  if (isSfxLoaded(SID_LINE_SNAP)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(196, now)
  osc.frequency.exponentialRampToValueAtTime(98, now + 0.3)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)
  osc.connect(gain).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.34)
}

/**
 * The TRIP-END FANFARE chord. Fires once when the trip settles. IDENTICAL
 * regardless of trip multiplier (1.10x or 10.00x sounds the same). Zero
 * parameters. RG-C5 structural.
 *
 * Two-note descending major third (E5 → C5) — settled, calm resolution. Same
 * notes as Pulse's cash-out chime but at a lower peak so it lives under
 * back-to-back trip starts cleanly.
 */
export function playTripEndFanfare(): void {
  playSfx(SID_TRIP_END_FANFARE)
  if (isSfxLoaded(SID_TRIP_END_FANFARE)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const notes: ReadonlyArray<readonly [number, number, number]> = [
    [659, 0, 0.18],
    [523, 0.1, 0.14],
  ]
  for (const [freq, delay, peakGain] of notes) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + delay)
    gain.gain.setValueAtTime(0.0001, now + delay)
    gain.gain.exponentialRampToValueAtTime(peakGain, now + delay + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.6)
    osc.connect(gain).connect(a.destination)
    osc.start(now + delay)
    osc.stop(now + delay + 0.62)
  }
}

/**
 * The UPGRADE PURCHASE confirmation chime. Fires once when the player buys
 * any upgrade. IDENTICAL across all three trees (rod / boat / bait) and all
 * five tiers (Bronze → Mythic). Zero parameters.
 *
 * Two-note ascending major fifth (C5 → G5) — a satisfying "lift" without
 * escalating. The upgrade chime is the same whether you bought Silver or
 * Mythic; the visible gear morph carries the tier signal, not the audio.
 */
export function playUpgradePurchase(): void {
  playSfx(SID_UPGRADE_PURCHASE)
  if (isSfxLoaded(SID_UPGRADE_PURCHASE)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const notes: ReadonlyArray<readonly [number, number, number]> = [
    [523, 0, 0.14],
    [784, 0.08, 0.16],
  ]
  for (const [freq, delay, peakGain] of notes) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now + delay)
    gain.gain.setValueAtTime(0.0001, now + delay)
    gain.gain.exponentialRampToValueAtTime(peakGain, now + delay + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.44)
    osc.connect(gain).connect(a.destination)
    osc.start(now + delay)
    osc.stop(now + delay + 0.46)
  }
}

/**
 * The POWER METER CHARGE tone. A subtle pitch rise while the player holds
 * the cast button. Rate-limited internally so frequent re-charges don't
 * stack.
 *
 * Takes a SINGLE technical parameter: `chargeFraction` (0-1, where 0 = no
 * charge, 1 = full power). This is a TRUE per-event physical signal (the
 * power meter's CURRENT state), NOT a session/streak counter — RG-C5 SAFE.
 * The pitch maps directly to the power level the player is about to release.
 */
let lastPowerChargeMs = 0
const POWER_CHARGE_RATE_LIMIT_MS = 70

export function playPowerCharge(chargeFraction: number): void {
  if (!Number.isFinite(chargeFraction)) return
  const a = audio()
  if (!a) return
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (nowMs - lastPowerChargeMs < POWER_CHARGE_RATE_LIMIT_MS) return
  lastPowerChargeMs = nowMs
  const now = a.currentTime
  const clamped = Math.min(1, Math.max(0, chargeFraction))
  const freq = 300 + clamped * 400 // 300 Hz at zero charge → 700 Hz at full
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, now)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.04, now + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
  osc.connect(gain).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.08)
}

'use client'

/**
 * OO-REI audio — RG-C5 structural enforcement.
 *
 * Platform pattern: Howler.js via _shared/audio + WebAudio synth fallback.
 *
 * RG-C5 STRUCTURAL ENFORCEMENT:
 *  All play* functions take ZERO state-dependent parameters.
 *  All amplitude constants are MODULE-LEVEL `as const` with literal types.
 *  BIG_WIN_VOLUME: 0.55 = SPIRIT_BONUS_VOLUME — type literal enforces identity.
 *  WIN_HIT_VOLUME: 0.55 = FANFARE_VOLUME — identical amplitude for all win sizes.
 *  CASHOUT_VOLUME: 0.55 = FANFARE_VOLUME — structural.
 *  The fanfare cannot escalate. Encoded in the type system.
 *
 * Audio register: Anime Cinematic / spiritual
 *  Ambient     — spirit-paddy-dusk track (useSwoobzMusic; ASSET_STUB)
 *  Spin launch — wooden swoosh + shrine-bell strike
 *  Reel tick   — wooden tablet knock × 5 (provider-driven at REEL_STOP_INTERVAL_MS)
 *  Win hit     — amber bell glissando (WIN_HIT_VOLUME = FANFARE_VOLUME, always identical)
 *  Big win     — low taiko body + temple gong (BIG_WIN_VOLUME === FANFARE_VOLUME)
 *  Spirit bonus — whispered kaze into temple bells cascade
 *  Cash out    — brass-on-stone ledger-close bong
 *  Chip select — quiet paper rustle (micro, CHIP_SELECT_VOLUME = 0.3)
 *
 * ASSET_STUB: paths below use nearest-character Kenney samples.
 *  Dedicated oo-rei assets should replace ASSET_STUB paths before launch.
 *  Synth fallback fires when Howler hasn't loaded the sample yet.
 *
 * Back-compat exports kept for provider:
 *  playReelStop, playWinSettle — aliases for provider import names
 *  preloadOoReiAudio           — no-op (useSwoobzAudio in Experience loads)
 *  ensureAudio                 — resumes WebAudio ctx
 *  startAmbientRain            — no-op (useSwoobzMusic handles ambient)
 *  stopAmbientRain             — no-op
 *
 * RG-C1: playSettlement() (no-win path) = playChipSelect().
 *  Neutral confirmation, zero celebratory weight.
 */

import { useUserSettings } from '@/lib/userSettings/userSettingsStore'
import {
  isSfxLoaded,
  type MusicRegistration,
  playSfx,
  type SfxRegistration,
} from '../_shared/audio'

// ─── Volume constants (module-level literal-typed — RG-C5) ───────────────────

/** Ambient layer ceiling (music controlled by MUSIC_VOLUME = 0.35 in swoobzMusic). */
export const AMBIENT_RAIN_VOLUME = 0.2 as const

/** Win / fanfare peak. Identical for ALL win sizes. Core RG-C5 pin. */
export const FANFARE_VOLUME = 0.55 as const

/** Reel tick knock peak (micro-interaction, lower than state-transition). */
export const REEL_STOP_VOLUME = 0.45 as const

/** Structural identity: reel tick === reel stop. */
export const REEL_TICK_VOLUME: 0.45 = REEL_STOP_VOLUME

/** Spin launch peak. */
export const SPIN_LAUNCH_VOLUME = 0.5 as const

/** Spirit bonus peak. Identical to big-win — structural RG-C5. */
export const SPIRIT_BONUS_VOLUME = 0.55 as const

/** RG-C5: big-win amplitude === spirit-bonus amplitude. Different waveform, same volume. */
export const BIG_WIN_VOLUME: 0.55 = SPIRIT_BONUS_VOLUME

/** RG-C5: win-hit amplitude === fanfare ceiling. Identical across all win sizes. */
export const WIN_HIT_VOLUME: 0.55 = FANFARE_VOLUME

/** RG-C5: cash-out amplitude === fanfare ceiling. */
export const CASHOUT_VOLUME: 0.55 = FANFARE_VOLUME

/** Micro-interaction volume — chip select is quieter than state-transition SFX. */
export const CHIP_SELECT_VOLUME = 0.3 as const

/** Music ceiling per brand register §7. See swoobzMusic.ts MUSIC_VOLUME. */
export const MUSIC_VOLUME = 0.35 as const

// ─── Timing constants (module-level — RG-C5) ─────────────────────────────────

/** Reel stop interval (ms). Provider fires 5 knocks at this cadence. */
export const REEL_STOP_INTERVAL_MS = 80 as const

/** Reel tick visual cadence (ms) — matches DECEL_STAGGER_MS in OoReiSlotCanvas. */
export const REEL_TICK_INTERVAL_MS = 200 as const

/** Spin duration estimate (ms) for UI sync. */
export const SPIN_DURATION_MS = 2500 as const

/** Win settle hold (ms). */
export const WIN_SETTLE_MS = 600 as const

/** Spirit bonus entry transition (ms). */
export const SPIRIT_BONUS_ENTRY_MS = 800 as const

/** Settlement receipt display minimum (ms). */
export const SETTLEMENT_MIN_MS = 1200 as const

// ─── Sound IDs (module-level string literals — RG-C5) ────────────────────────

export const SID_SPIN_LAUNCH = 'oo-rei-spin-launch' as const
export const SID_REEL_TICK = 'oo-rei-reel-tick' as const
export const SID_WIN_HIT = 'oo-rei-win-hit' as const
export const SID_BIG_WIN = 'oo-rei-big-win' as const
export const SID_SPIRIT_BONUS = 'oo-rei-spirit-bonus' as const
export const SID_CASHOUT = 'oo-rei-cashout' as const
export const SID_CHIP_SELECT = 'oo-rei-chip-select' as const

// ─── Music registration ───────────────────────────────────────────────────────

/**
 * OO-REI ambient theme. Wire via useSwoobzMusic(MUSIC_OO_REI_THEME, ...) in Experience.
 * ASSET_STUB: /assets/music/oo_rei/spirit-paddy-dusk.ogg pending dedicated CC0 track.
 * No volume field — MUSIC_VOLUME = 0.35 in swoobzMusic.ts is the sole amplitude ceiling.
 */
export const MUSIC_OO_REI_THEME: MusicRegistration = {
  id: 'oo-rei-theme',
  sources: ['/assets/music/oo_rei/spirit-paddy-dusk.ogg'],
}

// ─── Howler manifest ──────────────────────────────────────────────────────────

/**
 * Pass to useSwoobzAudio(AUDIO_MANIFEST) in OoReiExperience on mount.
 * ASSET_STUB comments mark paths needing dedicated oo-rei assets before launch.
 * Synth fallbacks fire if Howler hasn't loaded the sample yet.
 */
export const AUDIO_MANIFEST: ReadonlyArray<SfxRegistration> = [
  {
    id: SID_SPIN_LAUNCH,
    sources: ['/assets/raw/kenney/audio/oo-climb/woosh2.ogg'], // ASSET_STUB — needs taiko+paper-rustle
    volume: SPIN_LAUNCH_VOLUME,
  },
  {
    id: SID_REEL_TICK,
    sources: ['/assets/raw/kenney/audio/ladder/impactPlank_medium_000.ogg'], // wooden tablet knock
    volume: REEL_TICK_VOLUME,
  },
  {
    id: SID_WIN_HIT,
    sources: ['/assets/raw/kenney/audio/pulse/impactBell_heavy_000.ogg'], // amber bell
    volume: WIN_HIT_VOLUME,
  },
  {
    id: SID_BIG_WIN,
    sources: ['/assets/raw/kenney/audio/oo-bloom/lowFrequency_explosion_000.ogg'], // taiko low body
    volume: BIG_WIN_VOLUME,
  },
  {
    id: SID_SPIRIT_BONUS,
    sources: ['/assets/raw/kenney/audio/oo-bloom/impactBell_heavy_002.ogg'], // temple bells cascade
    volume: SPIRIT_BONUS_VOLUME,
  },
  {
    id: SID_CASHOUT,
    sources: ['/assets/raw/kenney/audio/convoy/bong_001.ogg'], // brass-on-stone ledger-close bong
    volume: CASHOUT_VOLUME,
  },
  {
    id: SID_CHIP_SELECT,
    sources: ['/assets/raw/kenney/audio/oo-dailies/select_001.ogg'], // quiet paper rustle
    volume: CHIP_SELECT_VOLUME,
  },
] as const

// ─── WebAudio context (synth fallback engine) ─────────────────────────────────

let _ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (_ctx && _ctx.state !== 'closed') return _ctx
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    _ctx = new Ctor()
  } catch {
    _ctx = null
  }
  return _ctx
}

/** User SFX volume scalar. Reads personal pref. RG-C5 safe — user pref only. */
function userSfxScalar(): number {
  if (typeof window === 'undefined') return 1
  try {
    const s = useUserSettings.getState()
    if (s.masterMuted) return 0
    return typeof s.sfxVolume === 'number' ? Math.max(0, Math.min(1, s.sfxVolume)) : 1
  } catch {
    return 1
  }
}

// ─── Lifecycle helpers ────────────────────────────────────────────────────────

/** Resume WebAudio ctx under user gesture. Called by provider on first tap. Idempotent. */
export function ensureAudio(): void {
  const a = audio()
  if (!a) return
  if (a.state === 'suspended') void a.resume()
}

/** No-op. Retained for provider back-compat. Howler preloads via useSwoobzAudio. */
export function preloadOoReiAudio(): void { /* intentional no-op */ }

/** No-op. Ambient now handled by useSwoobzMusic(MUSIC_OO_REI_THEME) in Experience. */
export function startAmbientRain(): void { /* replaced by useSwoobzMusic */ }

/** No-op. Ambient now handled by useSwoobzMusic. */
export function stopAmbientRain(): void { /* replaced by useSwoobzMusic */ }

// ─── Zero-parameter SFX functions (RG-C5 structural) ─────────────────────────

/** Spin launch: wooden swoosh + shrine-bell strike. ~200ms. */
export function playSpinLaunch(): void {
  playSfx(SID_SPIN_LAUNCH)
  if (isSfxLoaded(SID_SPIN_LAUNCH)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(60, now)
  osc.frequency.exponentialRampToValueAtTime(280, now + 0.18)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(SPIN_LAUNCH_VOLUME * 0.7 * s, now + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
  osc.connect(g).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.22)
  const bell = a.createOscillator()
  const bg = a.createGain()
  bell.type = 'sine'
  bell.frequency.setValueAtTime(880, now + 0.02)
  bg.gain.setValueAtTime(0.0001, now + 0.02)
  bg.gain.exponentialRampToValueAtTime(SPIN_LAUNCH_VOLUME * 0.45 * s, now + 0.03)
  bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
  bell.connect(bg).connect(a.destination)
  bell.start(now + 0.02)
  bell.stop(now + 0.14)
}

/** Reel tick: wooden tablet knock. Called ×5 by provider at REEL_STOP_INTERVAL_MS cadence. */
export function playReelTick(): void {
  playSfx(SID_REEL_TICK)
  if (isSfxLoaded(SID_REEL_TICK)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(220, now)
  osc.frequency.exponentialRampToValueAtTime(160, now + 0.06)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(REEL_TICK_VOLUME * 0.8 * s, now + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
  osc.connect(g).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.09)
}

/** Back-compat alias: provider imports playReelStop. */
export const playReelStop = playReelTick

/**
 * Win hit: amber bell glissando, 3 ascending partials, ~500ms.
 * WIN_HIT_VOLUME: 0.55 = FANFARE_VOLUME. Identical amplitude on every win. RG-C5.
 */
export function playWinHit(): void {
  playSfx(SID_WIN_HIT)
  if (isSfxLoaded(SID_WIN_HIT)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  const winHitPartials: Array<[number, number, number]> = [
    [660, 0.0, WIN_HIT_VOLUME * 0.35 * s],
    [880, 0.06, WIN_HIT_VOLUME * 0.30 * s],
    [1320, 0.12, WIN_HIT_VOLUME * 0.25 * s],
  ]
  for (const [freq, t, vol] of winHitPartials) {
    const osc = a.createOscillator()
    const g2 = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + t)
    g2.gain.setValueAtTime(0.0001, now + t)
    g2.gain.exponentialRampToValueAtTime(vol, now + t + 0.01)
    g2.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.5)
    osc.connect(g2).connect(a.destination)
    osc.start(now + t)
    osc.stop(now + t + 0.52)
  }
}

/** Back-compat alias: provider imports playWinSettle. */
export const playWinSettle = playWinHit

/**
 * Big win: low taiko body + temple gong (richer, lower-frequency, longer tail).
 * BIG_WIN_VOLUME: 0.55 = SPIRIT_BONUS_VOLUME. SAME amplitude as win hit. RG-C5.
 * Waveform character differs (lower freq + longer decay) — not the amplitude.
 */
export function playBigWin(): void {
  playSfx(SID_BIG_WIN)
  if (isSfxLoaded(SID_BIG_WIN)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  const taiko = a.createOscillator()
  const tg = a.createGain()
  taiko.type = 'sine'
  taiko.frequency.setValueAtTime(60, now)
  taiko.frequency.exponentialRampToValueAtTime(90, now + 0.04)
  tg.gain.setValueAtTime(0.0001, now)
  tg.gain.exponentialRampToValueAtTime(BIG_WIN_VOLUME * 0.6 * s, now + 0.008)
  tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
  taiko.connect(tg).connect(a.destination)
  taiko.start(now)
  taiko.stop(now + 0.62)
  const gong = a.createOscillator()
  const gg = a.createGain()
  gong.type = 'triangle'
  gong.frequency.setValueAtTime(440, now + 0.02)
  gg.gain.setValueAtTime(0.0001, now + 0.02)
  gg.gain.exponentialRampToValueAtTime(BIG_WIN_VOLUME * 0.35 * s, now + 0.03)
  gg.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
  gong.connect(gg).connect(a.destination)
  gong.start(now + 0.02)
  gong.stop(now + 0.92)
}

/** Spirit bonus: 4-note ascending temple bells cascade, ~700ms. */
export function playSpiritBonus(): void {
  playSfx(SID_SPIRIT_BONUS)
  if (isSfxLoaded(SID_SPIRIT_BONUS)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  const spiritBonusCascade: Array<[number, number, number]> = [
    [660, 0.0, SPIRIT_BONUS_VOLUME * 0.27 * s],
    [880, 0.08, SPIRIT_BONUS_VOLUME * 0.31 * s],
    [1320, 0.16, SPIRIT_BONUS_VOLUME * 0.34 * s],
    [1980, 0.24, SPIRIT_BONUS_VOLUME * 0.38 * s],
  ]
  for (const [freq, t, vol] of spiritBonusCascade) {
    const osc = a.createOscillator()
    const g2 = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + t)
    g2.gain.setValueAtTime(0.0001, now + t)
    g2.gain.exponentialRampToValueAtTime(vol, now + t + 0.012)
    g2.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.7)
    osc.connect(g2).connect(a.destination)
    osc.start(now + t)
    osc.stop(now + t + 0.72)
  }
}

/**
 * Cash out: brass-on-stone ledger-close bong, ~400ms.
 * CASHOUT_VOLUME: 0.55 = FANFARE_VOLUME. RG-C5.
 */
export function playCashOut(): void {
  playSfx(SID_CASHOUT)
  if (isSfxLoaded(SID_CASHOUT)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(320, now)
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.1)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(CASHOUT_VOLUME * 0.55 * s, now + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)
  osc.connect(g).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.42)
}

/**
 * Chip select: quiet paper-rustle micro-interaction, ~60ms.
 * CHIP_SELECT_VOLUME = 0.3 — lower than state-transition SFX.
 * NO audio on hover (hover is visual-only per anti-slop fence).
 */
export function playChipSelect(): void {
  playSfx(SID_CHIP_SELECT)
  if (isSfxLoaded(SID_CHIP_SELECT)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1400, now)
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.05)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(CHIP_SELECT_VOLUME * 0.6 * s, now + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
  osc.connect(g).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.07)
}

/**
 * Settlement (no-win outcome): neutral confirmation, zero celebratory weight.
 * RG-C1: no celebratory audio on loss. Maps to playChipSelect (soft, low-volume).
 * Back-compat: provider imports playSettlement for the no-win settled path.
 */
export function playSettlement(): void {
  playChipSelect()
}

// ─── Per-spin win-reveal choreography SFX (RG-C5 structural — all zero-param) ─
//
// These two functions fire at the sequenced beat positions in the win-reveal
// choreography (LAND → GAP → LIGHT MATCHES → DRAW LINE). Both are zero-param
// per RG-C5 structural rule: no tier, no wager, no streak — always identical.
// Volumes are below FANFARE_VOLUME (they are micro-beats, not the celebration).

/** Volume pin: win-symbol-light chime — below fanfare ceiling. RG-C5 structural. */
export const WIN_SYMBOL_LIGHT_VOLUME = 0.38 as const

/** Volume pin: payline-draw brush sweep — below fanfare ceiling. RG-C5 structural. */
export const PAYLINE_DRAW_VOLUME = 0.35 as const

/** Sound ID: win symbol light — koto shimmer chime. */
export const SID_WIN_SYMBOL_LIGHT = 'oo-rei-win-symbol-light' as const

/** Sound ID: payline draw — soft brush sweep. */
export const SID_PAYLINE_DRAW = 'oo-rei-payline-draw' as const

/**
 * Win symbol light: single short koto-shimmer chime, ~180ms.
 * Fires once per winning cell as it illuminates in sequence.
 * WIN_SYMBOL_LIGHT_VOLUME = 0.38 — below FANFARE_VOLUME = 0.55.
 * IDENTICAL every time — no per-symbol, no per-tier variation. RG-C5.
 * Synth fallback: triangle oscillator 1100 → 980 Hz, ~180ms.
 * Zero parameters — RG-C5 structural.
 */
export function playWinSymbolLight(): void {
  playSfx(SID_WIN_SYMBOL_LIGHT)
  if (isSfxLoaded(SID_WIN_SYMBOL_LIGHT)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(1100, now)
  osc.frequency.exponentialRampToValueAtTime(980, now + 0.14)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(WIN_SYMBOL_LIGHT_VOLUME * 0.7 * s, now + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
  osc.connect(g).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.20)
}

/**
 * Payline draw: soft brush-sweep sound, ~280ms.
 * Fires once as the amber trace draws across the winning cells.
 * PAYLINE_DRAW_VOLUME = 0.35 — below FANFARE_VOLUME = 0.55.
 * Synth fallback: sawtooth 2800 → 700 Hz, ~280ms.
 * Zero parameters — RG-C5 structural.
 */
export function playPaylineDraw(): void {
  playSfx(SID_PAYLINE_DRAW)
  if (isSfxLoaded(SID_PAYLINE_DRAW)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  const osc = a.createOscillator()
  const g = a.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(2800, now)
  osc.frequency.exponentialRampToValueAtTime(700, now + 0.24)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(PAYLINE_DRAW_VOLUME * 0.55 * s, now + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)
  osc.connect(g).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.30)
}

// ─── Cinematic overlay audio (RG-C5 structural — all zero-param) ─────────────
//
// All four cinematic SFX fire at exactly FANFARE_VOLUME = 0.55.
// The WAVEFORM CHARACTER differs per tier but the amplitude is structurally
// identical. This is the RG-C5 enforcement: no escalating fanfare.
//
// RG-C5 structural test in ooReiAudio.test.ts verifies:
//   BIG_WIN_CINEMATIC_VOLUME === FANFARE_VOLUME
//   MEGA_WIN_CINEMATIC_VOLUME === FANFARE_VOLUME
//   SPIRIT_BONUS_TRIGGER_VOLUME === FANFARE_VOLUME
//   SPIRIT_BONUS_FINALE_VOLUME === FANFARE_VOLUME

/** RG-C5 pin: big-win cinematic amplitude === fanfare ceiling. Type-literal enforced. */
export const BIG_WIN_CINEMATIC_VOLUME: 0.55 = FANFARE_VOLUME

/** RG-C5 pin: mega-win cinematic amplitude === fanfare ceiling. Same amplitude, richer waveform. */
export const MEGA_WIN_CINEMATIC_VOLUME: 0.55 = FANFARE_VOLUME

/** RG-C5 pin: spirit bonus trigger cinematic === fanfare ceiling. */
export const SPIRIT_BONUS_TRIGGER_VOLUME: 0.55 = FANFARE_VOLUME

/** RG-C5 pin: spirit bonus finale cinematic === fanfare ceiling. */
export const SPIRIT_BONUS_FINALE_VOLUME: 0.55 = FANFARE_VOLUME

/**
 * BIG WIN cinematic SFX — "Spirit Stirs".
 * Vermillion taiko drum strike + temple gong + sumi-e brush sweep.
 * Amplitude: FANFARE_VOLUME. Duration: ~1500ms.
 * Zero parameters — RG-C5 structural.
 */
export function playBigWinCinematic(): void {
  // Use existing SID_BIG_WIN sample if loaded (taiko body); synth fallback below.
  playSfx(SID_BIG_WIN)
  if (isSfxLoaded(SID_BIG_WIN)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  // Taiko body thud
  const taiko = a.createOscillator()
  const tg = a.createGain()
  taiko.type = 'sine'
  taiko.frequency.setValueAtTime(55, now)
  taiko.frequency.exponentialRampToValueAtTime(80, now + 0.05)
  tg.gain.setValueAtTime(0.0001, now)
  tg.gain.exponentialRampToValueAtTime(BIG_WIN_CINEMATIC_VOLUME * 0.65 * s, now + 0.008)
  tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.7)
  taiko.connect(tg).connect(a.destination)
  taiko.start(now)
  taiko.stop(now + 0.72)
  // Temple gong shimmer
  const gong = a.createOscillator()
  const gg = a.createGain()
  gong.type = 'triangle'
  gong.frequency.setValueAtTime(440, now + 0.04)
  gg.gain.setValueAtTime(0.0001, now + 0.04)
  gg.gain.exponentialRampToValueAtTime(BIG_WIN_CINEMATIC_VOLUME * 0.38 * s, now + 0.06)
  gg.gain.exponentialRampToValueAtTime(0.0001, now + 1.4)
  gong.connect(gg).connect(a.destination)
  gong.start(now + 0.04)
  gong.stop(now + 1.42)
  // Brush sweep (high-frequency noise burst)
  const noise = a.createOscillator()
  const ng = a.createGain()
  noise.type = 'sawtooth'
  noise.frequency.setValueAtTime(2200, now + 0.1)
  noise.frequency.exponentialRampToValueAtTime(800, now + 0.4)
  ng.gain.setValueAtTime(0.0001, now + 0.1)
  ng.gain.exponentialRampToValueAtTime(BIG_WIN_CINEMATIC_VOLUME * 0.18 * s, now + 0.12)
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.45)
  noise.connect(ng).connect(a.destination)
  noise.start(now + 0.1)
  noise.stop(now + 0.47)
}

/**
 * MEGA WIN cinematic SFX — "Monster Clash".
 * Layered taiko + temple bell + single Rei voice syllable (synth approximation).
 * Amplitude: FANFARE_VOLUME. Same ceiling as BIG WIN. RG-C5.
 * Waveform character: lower freq, longer decay, layered — not louder.
 * Zero parameters — RG-C5 structural.
 */
export function playMegaWinCinematic(): void {
  playSfx(SID_BIG_WIN) // Best available sample stub
  if (isSfxLoaded(SID_BIG_WIN)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  // Deep taiko body
  const taiko = a.createOscillator()
  const tg = a.createGain()
  taiko.type = 'sine'
  taiko.frequency.setValueAtTime(40, now)
  taiko.frequency.exponentialRampToValueAtTime(65, now + 0.06)
  tg.gain.setValueAtTime(0.0001, now)
  tg.gain.exponentialRampToValueAtTime(MEGA_WIN_CINEMATIC_VOLUME * 0.7 * s, now + 0.01)
  tg.gain.exponentialRampToValueAtTime(0.0001, now + 1.0)
  taiko.connect(tg).connect(a.destination)
  taiko.start(now)
  taiko.stop(now + 1.02)
  // Temple bell (longer tail than big win)
  const bell = a.createOscillator()
  const bg = a.createGain()
  bell.type = 'triangle'
  bell.frequency.setValueAtTime(330, now + 0.06)
  bg.gain.setValueAtTime(0.0001, now + 0.06)
  bg.gain.exponentialRampToValueAtTime(MEGA_WIN_CINEMATIC_VOLUME * 0.40 * s, now + 0.08)
  bg.gain.exponentialRampToValueAtTime(0.0001, now + 2.4)
  bell.connect(bg).connect(a.destination)
  bell.start(now + 0.06)
  bell.stop(now + 2.42)
  // Voice syllable "Ya!" synth approximation — short formant burst at 0.3s
  const voice = a.createOscillator()
  const vg = a.createGain()
  voice.type = 'sawtooth'
  voice.frequency.setValueAtTime(250, now + 0.28)
  voice.frequency.exponentialRampToValueAtTime(200, now + 0.38)
  vg.gain.setValueAtTime(0.0001, now + 0.28)
  vg.gain.exponentialRampToValueAtTime(MEGA_WIN_CINEMATIC_VOLUME * 0.22 * s, now + 0.30)
  vg.gain.exponentialRampToValueAtTime(0.0001, now + 0.40)
  voice.connect(vg).connect(a.destination)
  voice.start(now + 0.28)
  voice.stop(now + 0.42)
}

/**
 * SPIRIT BONUS TRIGGER cinematic SFX — "Awakening".
 * Whispered kaze breath + escalating temple-bell strike + final chord.
 * Amplitude: FANFARE_VOLUME. Same ceiling as win SFX. RG-C5.
 * Zero parameters — RG-C5 structural.
 */
export function playSpiritBonusTrigger(): void {
  playSfx(SID_SPIRIT_BONUS) // Best available sample stub
  if (isSfxLoaded(SID_SPIRIT_BONUS)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  // Kaze breath (wind noise approximation)
  const wind = a.createOscillator()
  const wg = a.createGain()
  wind.type = 'sawtooth'
  wind.frequency.setValueAtTime(1800, now)
  wind.frequency.exponentialRampToValueAtTime(600, now + 0.5)
  wg.gain.setValueAtTime(0.0001, now)
  wg.gain.exponentialRampToValueAtTime(SPIRIT_BONUS_TRIGGER_VOLUME * 0.12 * s, now + 0.05)
  wg.gain.exponentialRampToValueAtTime(0.0001, now + 0.55)
  wind.connect(wg).connect(a.destination)
  wind.start(now)
  wind.stop(now + 0.57)
  // Ascending temple bells (reuse spirit bonus cascade, spread wider)
  const spiritCascade: Array<[number, number, number]> = [
    [440, 0.15, SPIRIT_BONUS_TRIGGER_VOLUME * 0.25 * s],
    [660, 0.28, SPIRIT_BONUS_TRIGGER_VOLUME * 0.30 * s],
    [880, 0.42, SPIRIT_BONUS_TRIGGER_VOLUME * 0.35 * s],
    [1320, 0.58, SPIRIT_BONUS_TRIGGER_VOLUME * 0.40 * s],
  ]
  for (const [freq, t, vol] of spiritCascade) {
    const osc = a.createOscillator()
    const g2 = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + t)
    g2.gain.setValueAtTime(0.0001, now + t)
    g2.gain.exponentialRampToValueAtTime(vol, now + t + 0.014)
    g2.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.85)
    osc.connect(g2).connect(a.destination)
    osc.start(now + t)
    osc.stop(now + t + 0.87)
  }
  // Final chord at 1.0s
  const chordFreqs = [220, 330, 440]
  for (const freq of chordFreqs) {
    const osc = a.createOscillator()
    const g3 = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + 1.0)
    g3.gain.setValueAtTime(0.0001, now + 1.0)
    g3.gain.exponentialRampToValueAtTime(SPIRIT_BONUS_TRIGGER_VOLUME * 0.28 * s, now + 1.02)
    g3.gain.exponentialRampToValueAtTime(0.0001, now + 1.5)
    osc.connect(g3).connect(a.destination)
    osc.start(now + 1.0)
    osc.stop(now + 1.52)
  }
}

/**
 * SPIRIT BONUS FINALE cinematic SFX — "Spirit Bows".
 * Single deep temple bell + sustained low chord + soft kaze.
 * Amplitude: FANFARE_VOLUME. Same ceiling as all win SFX. RG-C5.
 * Zero parameters — RG-C5 structural.
 */
export function playSpiritBonusFinale(): void {
  playSfx(SID_SPIRIT_BONUS) // Best available sample stub
  if (isSfxLoaded(SID_SPIRIT_BONUS)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const s = userSfxScalar()
  // Deep temple bell — single strike, long tail
  const bell = a.createOscillator()
  const bg = a.createGain()
  bell.type = 'triangle'
  bell.frequency.setValueAtTime(180, now)
  bg.gain.setValueAtTime(0.0001, now)
  bg.gain.exponentialRampToValueAtTime(SPIRIT_BONUS_FINALE_VOLUME * 0.55 * s, now + 0.012)
  bg.gain.exponentialRampToValueAtTime(0.0001, now + 1.8)
  bell.connect(bg).connect(a.destination)
  bell.start(now)
  bell.stop(now + 1.82)
  // Sustained low chord (resolution/closing)
  const chordFinale: Array<[number, number]> = [
    [110, SPIRIT_BONUS_FINALE_VOLUME * 0.22 * s],
    [165, SPIRIT_BONUS_FINALE_VOLUME * 0.18 * s],
    [220, SPIRIT_BONUS_FINALE_VOLUME * 0.14 * s],
  ]
  for (const [freq, vol] of chordFinale) {
    const osc = a.createOscillator()
    const g2 = a.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now + 0.1)
    g2.gain.setValueAtTime(0.0001, now + 0.1)
    g2.gain.exponentialRampToValueAtTime(vol, now + 0.14)
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 2.0)
    osc.connect(g2).connect(a.destination)
    osc.start(now + 0.1)
    osc.stop(now + 2.02)
  }
  // Soft kaze tail
  const kaze = a.createOscillator()
  const kg = a.createGain()
  kaze.type = 'sawtooth'
  kaze.frequency.setValueAtTime(900, now + 1.2)
  kaze.frequency.exponentialRampToValueAtTime(400, now + 1.9)
  kg.gain.setValueAtTime(0.0001, now + 1.2)
  kg.gain.exponentialRampToValueAtTime(SPIRIT_BONUS_FINALE_VOLUME * 0.08 * s, now + 1.3)
  kg.gain.exponentialRampToValueAtTime(0.0001, now + 1.95)
  kaze.connect(kg).connect(a.destination)
  kaze.start(now + 1.2)
  kaze.stop(now + 1.97)
}

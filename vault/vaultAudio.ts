/**
 * Vault audio — Web Audio API, zero asset files.
 *
 * RG-C5 STRUCTURAL ENFORCEMENT (VAULT-CRAFT-SPEC.md §6, load-bearing):
 * --------------------------------------------------------------------
 * Every audio function in this module accepts AT MOST a BPS delta (a real
 * economic value). NONE accept a streak count, a session-length parameter,
 * a consecutive-safes counter, or any other state-dependent quantity. The
 * type system makes the violation impossible. A reviewer who finds a sound
 * call site reading streak state and routing it into this module fails the
 * review at the function signature.
 *
 * Why: Mines is genre-canon for streak-scaled audio escalation ("the 22nd
 * safe sounds louder than the 1st"). That's the RG-C5 trap. Vault's audio
 * volume/pitch/fanfare scales with the per-tile multiplier delta only.
 * Day-1 tile 1 at 1.04x and day-365 tile 22 at 1.04x are bit-identical.
 *
 * Brand register: "quiet expert at the table." Tones are calm, factual,
 * brief. The mine-hit tone is informational, never punishing — same audio
 * envelope every round per RG-C3 (no escalating-loss amplification).
 *
 * AudioContext is lazy-created from a user gesture (browser policy);
 * `ensureAudio()` runs on the first interaction in `vaultProvider`.
 */
import { isSfxLoaded, playSfx, type SfxRegistration } from '../_shared/audio'

// ─── Sound IDs (RG-C5 structural — module-level CONSTS) ───────────────────
export const SID_MINE_HIT = 'vault-mine-hit' as const
export const SID_CASH_OUT_WIN = 'vault-cash-out-win' as const
export const SID_SPIN_READY = 'vault-spin-ready' as const

// ─── Module-level amplitude constants (RG-C5 structural pins) ─────────────
export const MINE_HIT_VOL = 0.55 as const
export const CASH_OUT_WIN_VOL = 0.55 as const
export const SPIN_READY_VOL = 0.4 as const

// ─── Audio manifest ───────────────────────────────────────────────────────
export const AUDIO_MANIFEST: ReadonlyArray<SfxRegistration> = [
  {
    id: SID_MINE_HIT,
    sources: ['/assets/raw/kenney/audio/vault/impactMetal_heavy_000.ogg'],
    volume: MINE_HIT_VOL,
  },
  {
    id: SID_CASH_OUT_WIN,
    sources: ['/assets/raw/kenney/audio/vault/impactBell_heavy_002.ogg'],
    volume: CASH_OUT_WIN_VOL,
  },
  {
    id: SID_SPIN_READY,
    sources: ['/assets/raw/kenney/audio/vault/tick_002.ogg'],
    volume: SPIN_READY_VOL,
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

// Compartment-open "tick/pump" tuning — module-level consts (RG-C5 pins).
// The tick is a fixed mechanical transient (the latch releasing); it never
// varies with the delta. Only the pump note's PITCH nudges with the
// per-tile economic delta — its AMPLITUDE is the fixed const below.
const TILE_TICK_HZ = 1_500
const TILE_TICK_VOL = 0.09
const TILE_PUMP_DELAY_S = 0.012
const TILE_PUMP_VOL = 0.16

/**
 * Safe tile reveal confirm — the "compartment-open tick/pump." Two discrete
 * beats: a short mechanical latch-tick (the sealed door releasing), then a
 * rising pump note (the green candle-economy tell). Pitch of the pump note
 * varies SLIGHTLY with the per-tile multiplier delta (a real economic
 * signal) — never with how many safes the player has chained; the tick is
 * completely fixed.
 *
 * RG-C5: the ONLY parameter is the per-tile delta in BPS. There is no
 * streak param, and there cannot be one — the type system forbids it.
 * TILE_TICK_VOL and TILE_PUMP_VOL are module-level consts: the delta can
 * only nudge pitch, never loudness, so day-1 tile 1 and day-365 tile 22
 * are bit-identical in amplitude.
 *
 * @param multiplierDeltaBps The per-tile multiplier delta in BPS. E.g.,
 *   if cumulative climbs from 1.10x (11_000) to 1.21x (12_100), delta is
 *   1_100. Clamped internally so a single tile cannot drive an escalating
 *   sonic effect.
 */
export function playTileRevealConfirm(multiplierDeltaBps: bigint): void {
  const a = audio()
  if (!a) return
  const now = a.currentTime
  // Map BPS delta to a small pitch nudge in [0, 200] Hz. Cap aggressively
  // so even an extreme tile (mine-count 1, end-of-grid) lands inside the
  // same audio register. The whole point of RG-C5 is that the SOUND DOES
  // NOT CHANGE across game-state contexts — pitch nudge is informational
  // delta only.
  const deltaNumber = multiplierDeltaBps > 5_000n ? 5_000 : Number(multiplierDeltaBps)
  const safeDelta = deltaNumber < 0 ? 0 : deltaNumber
  const pitchBoost = (safeDelta / 5_000) * 80 // 0..80 Hz
  const base = 740 + pitchBoost

  // ── Latch tick — the compartment door releasing. Fixed pitch + volume
  // (TILE_TICK_HZ / TILE_TICK_VOL), completely untouched by the delta. ──
  const tick = a.createOscillator()
  const tickGain = a.createGain()
  tick.type = 'square'
  tick.frequency.setValueAtTime(TILE_TICK_HZ, now)
  tickGain.gain.setValueAtTime(0.0001, now)
  tickGain.gain.exponentialRampToValueAtTime(TILE_TICK_VOL, now + 0.002)
  tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02)
  tick.connect(tickGain).connect(a.destination)
  tick.start(now)
  tick.stop(now + 0.024)

  // ── Pump note — the rising green-candle tell. Pitch nudges with the
  // per-tile delta; amplitude is the fixed TILE_PUMP_VOL const (RG-C5). ──
  const pumpStart = now + TILE_PUMP_DELAY_S
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(base, pumpStart)
  osc.frequency.exponentialRampToValueAtTime(base * 1.18, pumpStart + 0.05)
  gain.gain.setValueAtTime(0.0001, pumpStart)
  gain.gain.exponentialRampToValueAtTime(TILE_PUMP_VOL, pumpStart + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, pumpStart + 0.15)
  osc.connect(gain).connect(a.destination)
  osc.start(pumpStart)
  osc.stop(pumpStart + 0.18)
}

// Rug-pull "floor drops out" tuning — module-level consts (RG-C5 pins).
// A fixed SNAP transient (two detuned overtones) plus a fixed low plunge.
// Funny-but-honest degen register, not a punishing crash sound.
const MINE_SNAP_OVERTONES = [
  [980, 0.05],
  [640, 0.035],
] as const
const MINE_DROP_DELAY_S = 0.01

/**
 * Mine-hit informational tone — the "rug pull." Same envelope on every
 * mine hit, regardless of how many safe reveals preceded it or how much
 * was riding on the round. Two fixed beats: a sharp SNAP (the rug yanked
 * out) immediately followed by a low plunge (the floor dropping out) —
 * impactful and honest, not punishing, not escalating.
 *
 * RG-C3 STRUCTURAL: no parameters. A call site cannot tell this function
 * "the player had 22 safes before this mine." The same audio plays on a
 * tile-1 mine and a tile-22 mine. No streak-scaled fanfare, no
 * counterfactual amplification. RG-C5: MINE_SNAP_OVERTONES and every
 * envelope value below are module-level consts — identical regardless of
 * loss size, streak, or session length.
 *
 * Register: short, low, calm-after-the-snap. Not punishing. Reads as "the
 * round closed," not as "you lost."
 */
export function playMineHit(): void {
  playSfx(SID_MINE_HIT)
  if (isSfxLoaded(SID_MINE_HIT)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  // ── SNAP — the rug yanked out from under the tile. Two short detuned
  // square-wave overtones, fixed frequency/volume (never scaled). ──
  for (const [freq, vol] of MINE_SNAP_OVERTONES) {
    const snap = a.createOscillator()
    const snapGain = a.createGain()
    snap.type = 'square'
    snap.frequency.setValueAtTime(freq, now)
    snapGain.gain.setValueAtTime(0.0001, now)
    snapGain.gain.exponentialRampToValueAtTime(vol, now + 0.002)
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.024)
    snap.connect(snapGain).connect(a.destination)
    snap.start(now)
    snap.stop(now + 0.03)
  }
  // ── DROP — the floor giving way. Same low sine plunge as before, just
  // seated a hair after the SNAP so the two beats read as one event. ──
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(260, now + MINE_DROP_DELAY_S)
  osc.frequency.exponentialRampToValueAtTime(140, now + MINE_DROP_DELAY_S + 0.22)
  gain.gain.setValueAtTime(0.0001, now + MINE_DROP_DELAY_S)
  gain.gain.exponentialRampToValueAtTime(0.24, now + MINE_DROP_DELAY_S + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + MINE_DROP_DELAY_S + 0.28)
  osc.connect(gain).connect(a.destination)
  osc.start(now + MINE_DROP_DELAY_S)
  osc.stop(now + MINE_DROP_DELAY_S + 0.3)
}

/**
 * Cash-out confirm chime. Fires only on a confirmed cash-out (RG-C2 — no
 * celebration on losses). Three-overtone warm ding, same as Pulse for
 * cross-Original brand cohesion. No streak param; the chime is identical
 * on the player's first and 100th cash-out.
 */
export function playCashOutWin(): void {
  playSfx(SID_CASH_OUT_WIN)
  if (isSfxLoaded(SID_CASH_OUT_WIN)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  for (const [freq, t, vol] of [
    [880, 0, 0.2],
    [1320, 0.04, 0.16],
    [1760, 0.08, 0.12],
  ] as const) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + t)
    gain.gain.setValueAtTime(0.0001, now + t)
    gain.gain.exponentialRampToValueAtTime(vol, now + t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.6)
    osc.connect(gain).connect(a.destination)
    osc.start(now + t)
    osc.stop(now + t + 0.62)
  }
}

/**
 * Dial-tick — brief mechanical tick heard as the player approaches the
 * tile (pointer-down telegraph). Zero-param. Same tick every press.
 *
 * RG-C5 STRUCTURAL: no parameters. Identical tick on tile-1 press and
 * tile-22 press. The tick is informational ("you're touching the dial"),
 * never amplified by streak length or cumulative multiplier.
 */
export function playDialTick(): void {
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'square'
  osc.frequency.setValueAtTime(1_200, now)
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.025)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.06, now + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
  osc.connect(gain).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.06)
}

/**
 * Tumbler-click — sharp short metallic click when a tumbler falls (the
 * cosmetic "perfect rhythm" reveal). Zero-param.
 *
 * RG-C5 STRUCTURAL: no parameters. The click fires at one of two fixed
 * pitches based on a CALLER-SUPPLIED boolean for the "peak" tier, which
 * is itself derived from the cumulative multiplier band — NOT a streak
 * count. (Two fixed pitches, no continuous escalation.)
 */
export function playTumblerClick(): void {
  const a = audio()
  if (!a) return
  const now = a.currentTime
  // Two-osc detuned click for the metallic edge.
  for (const [freq, t, vol] of [
    [1_600, 0, 0.1],
    [2_400, 0.012, 0.07],
  ] as const) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(freq, now + t)
    gain.gain.setValueAtTime(0.0001, now + t)
    gain.gain.exponentialRampToValueAtTime(vol, now + t + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.07)
    osc.connect(gain).connect(a.destination)
    osc.start(now + t)
    osc.stop(now + t + 0.08)
  }
}

// "Bag secured" coin-cascade tuning for playSafeOpen — module-level consts
// (RG-C5 pins). Three short, bright triangle pings layered after the door
// chime so the sting reads as coins landing in the bag: a register clearly
// brighter/faster than the door-arc chime, the mid pump tick, and the low
// rug-pull hit. Restrained (triangle, not square/saw) — no arcade "ka-ching."
const SAFE_OPEN_COIN_PINGS = [
  [1_900, 0.2, 0.07],
  [2_300, 0.235, 0.055],
  [2_700, 0.27, 0.045],
] as const

/**
 * Safe-open — the "BAG SECURED" sting, fired only on a confirmed cash-out
 * (manual TAKE PROFIT or the auto target-lock rule — identical settle path,
 * identical envelope). Three layers: a low bolt-retract thunk (the door
 * releasing), a three-overtone door-arc chime (institutional brass), then a
 * bright coin-cascade (the gold/bag register) — so this sting reads
 * distinctly different from the mid-range pump tick
 * (`playTileRevealConfirm`) and the low, snap-then-drop rug-pull hit
 * (`playMineHit`). Zero-param.
 *
 * RG-C2: celebration on a confirmed cash-out only. Never on a loss.
 * RG-C5: identical on every cash-out regardless of bag size, multiplier,
 * or streak — every frequency/volume/timing below is a module-level const;
 * this function takes no wager/payout/streak parameter, so it structurally
 * cannot scale.
 */
export function playSafeOpen(): void {
  const a = audio()
  if (!a) return
  const now = a.currentTime
  // Low bolt-retract thunk (the bolts pulling back into the door body).
  const bolt = a.createOscillator()
  const boltGain = a.createGain()
  bolt.type = 'sine'
  bolt.frequency.setValueAtTime(140, now)
  bolt.frequency.exponentialRampToValueAtTime(80, now + 0.18)
  boltGain.gain.setValueAtTime(0.0001, now)
  boltGain.gain.exponentialRampToValueAtTime(0.18, now + 0.01)
  boltGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)
  bolt.connect(boltGain).connect(a.destination)
  bolt.start(now)
  bolt.stop(now + 0.34)
  // Three-overtone door-arc chime — institutional brass register.
  for (const [freq, t, vol] of [
    [560, 0.08, 0.14],
    [840, 0.12, 0.11],
    [1_120, 0.16, 0.08],
  ] as const) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + t)
    gain.gain.setValueAtTime(0.0001, now + t)
    gain.gain.exponentialRampToValueAtTime(vol, now + t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.5)
    osc.connect(gain).connect(a.destination)
    osc.start(now + t)
    osc.stop(now + t + 0.55)
  }
  // Coin-cascade — the "bag secured" tell. Fixed frequencies/timings/
  // volumes; no relation to bag size, multiplier, or streak (RG-C5).
  for (const [freq, t, vol] of SAFE_OPEN_COIN_PINGS) {
    const osc = a.createOscillator()
    const gain = a.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + t)
    gain.gain.setValueAtTime(0.0001, now + t)
    gain.gain.exponentialRampToValueAtTime(vol, now + t + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.09)
    osc.connect(gain).connect(a.destination)
    osc.start(now + t)
    osc.stop(now + t + 0.1)
  }
}

/**
 * Safe-locked — dull latch-refuse on a mine-hit (the door rejected the
 * combination). Same envelope as the mine-hit tone but with a low bolt
 * THUD on top so it reads as "the door slammed shut." Zero-param.
 *
 * RG-C3: identical envelope on every mine hit, regardless of how many
 * safe reveals preceded it. RG-C5 by construction.
 */
export function playSafeLocked(): void {
  const a = audio()
  if (!a) return
  const now = a.currentTime
  // Dull low thud (the bolts driving back into the lock).
  const thud = a.createOscillator()
  const thudGain = a.createGain()
  thud.type = 'sine'
  thud.frequency.setValueAtTime(90, now)
  thud.frequency.exponentialRampToValueAtTime(55, now + 0.22)
  thudGain.gain.setValueAtTime(0.0001, now)
  thudGain.gain.exponentialRampToValueAtTime(0.26, now + 0.008)
  thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36)
  thud.connect(thudGain).connect(a.destination)
  thud.start(now)
  thud.stop(now + 0.38)
}

/**
 * Auto-pick spin-ready tone — calm, brief, informational. Phase-2 stub
 * (auto-pick is disabled in V1 per the RG-C8 surface visibility spec)
 * but the tone signature is in place so the call site never has to take
 * a streak parameter when Phase 2 wires it.
 *
 * RG-C5: no parameters. Identical tone on every auto-pick prep.
 */
export function playSpinReady(): void {
  playSfx(SID_SPIN_READY)
  if (isSfxLoaded(SID_SPIN_READY)) return
  const a = audio()
  if (!a) return
  const now = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(540, now)
  osc.frequency.linearRampToValueAtTime(720, now + 0.12)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.1, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
  osc.connect(gain).connect(a.destination)
  osc.start(now)
  osc.stop(now + 0.22)
}

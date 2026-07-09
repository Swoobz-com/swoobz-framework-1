/**
 * Pulse provider: a deterministic, mockable game-state machine that drives
 * the player UI. The provider exposes a slot clock, the round state, and the
 * player's bet/settlement state. Game-time advances via `requestAnimationFrame`
 * in the curve canvas (which calls `tickToSlot`); React state updates are
 * scoped to *discrete* UI moments (phase transitions, multiplier text every
 * few frames), not every frame.
 *
 * V1 is mock-driven: the round lifecycle plays out client-side. The provider
 * shape is intentionally identical to the future on-chain wiring so that
 * swapping the data source is a one-file change. The Glass Box verify widget
 * already exercises the real on-chain crash derivation client-side via
 * `pulseMath.deriveCrashBps`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
// Audio: ensureAudio + playBetCommit are dispatched here (provider owns the
// bet-commit moment). Crash + cashout audio is dispatched from
// PulseCurveCanvas.tsx's `justCrashed` / `justCashedOut` useLayoutEffect
// branches, which fire exactly once per state transition (not every render).
// Dispatching here AND in the canvas caused a double-dispatch race where
// `silenceTierTickTail()` could fire before the canvas's crash osc had a
// chance to start, smearing the thud. PULSE-AUDIO-REG1-2026-05-27.
import { ensureAudio, playBetCommit } from './pulseAudio'
import { ownedPulseCosmetics, pulseCosmeticById } from './pulseCosmetics'
import {
  crashSlot as crashSlotFn,
  currentMultiplierBps,
  deriveCrashBps,
  HOUSE_EDGE_BPS,
  isPerfectHit,
  MAX_CRASH_BPS,
  MOCK_MAX_CRASH_BPS,
  MOCK_MIN_CRASH_BPS,
  nearestPerfectMilestoneBps,
  ONE_X_BPS,
  perfectHitBonusBps,
  pointsForBet,
  SLOT_DURATION_MS,
  settlePayout,
} from './pulseMath'
import { accumulatePoints, accumulateRoundsPlayed } from './pulseOwnershipPoints'
import { computePulseRank } from './pulseRank'

export type PulsePhase =
  | { kind: 'lobby' }
  | { kind: 'bet-entry' }
  | { kind: 'round-active' }
  | { kind: 'settling' }
  | { kind: 'settled'; outcome: PulseOutcome }

export interface PulseOutcome {
  won: boolean
  cashedOutAtBps: bigint | null
  /** Absolute slot the cash-out fired at; populated only on a win. */
  cashedOutAtSlot: bigint | null
  crashBps: bigint
  crashSlot: bigint
  payoutLamports: bigint
  /**
   * Perfect-hit milestone the player landed inside, in bps. `null` if not in
   * a milestone band. Surfaces the "PERFECT" status to the UI + drives the
   * 1.05-1.15× ramp baked into `payoutLamports`.
   *
   * RG-C5 SAFE: this field is a snapshot of `nearestPerfectMilestoneBps` at
   * the moment of cash-out — pure function of the live multiplier. No streak
   * state, no session state.
   */
  perfectMilestoneBps: bigint | null
  /** Perfect-hit bonus multiplier in bps (10_000n if not perfect). */
  perfectBonusBps: bigint
  /** A hex string of the revealed server seed, surfaced to the verify widget. */
  serverSeedHex: string
  /** A hex string of the committed server-seed hash. */
  serverSeedHashHex: string
  /** The 8-byte LE round id, hex. */
  roundIdHex: string
  /** A hex string of the chain-root that mixed in the player's client seed. */
  clientSeedChainRootHex: string
  /** A hex string of the mixer (program-id, in production). */
  mixerHex: string
}

export interface PulseState {
  phase: PulsePhase
  /** USDC lamports, 6-decimal. */
  balanceLamports: bigint
  /** Player's chosen wager for the current round. */
  wagerLamports: bigint
  /** Optional auto-cashout target in bps; null = manual only. */
  autoCashoutBps: bigint | null
  /** The slot the curve activated (round start). null in lobby/bet-entry. */
  roundActiveSlot: bigint | null
  /** Off-chain slot clock; only the canvas reads this every frame. */
  currentSlot: bigint
  /** Recent round outcomes (most recent first), capped. */
  history: PulseHistoryRow[]
  /**
   * The audit commitment for the live round — surfaced as the always-visible
   * in-canvas commit-reveal hash readout per PULSE-ART-DIRECTION-2026-05-25
   * §3.4 "glass-box transparency as an in-scene instrument readout." The
   * server-seed-hash + chain-root are pre-published BEFORE the round starts
   * climbing, so the player can see the commitment in the audit panel from
   * bet-entry forward. Null in lobby; populated from `round-active` onward;
   * cleared back to null on `acknowledgeSettlement`.
   */
  liveAudit: PulseLiveAudit | null
  /**
   * LEDGER B — The player's lifetime ownership points ("signals"). Wager-
   * volume-indexed at 1.0x win / 1.5x loss (the Ownership Engine display
   * differentiator). NEVER drives rank thresholds — display only.
   * Persisted to localStorage; authoritative ledger is @swoobz/points (S0).
   */
  lifetimeOwnershipPoints: bigint
  /**
   * LEDGER A — Lifetime rounds played. Every round = +1 regardless of wager.
   * This is what drives the Operator Rank thresholds (Tim correction #1 fix).
   * Persisted to localStorage.
   */
  lifetimeRoundsPlayed: bigint
  /**
   * Equipped trace skin cosmetic ID, or null (default cyan).
   * When set, PulseCurveCanvas uses this skin's swatch as the stroke color.
   * Persisted to localStorage. Only skins the player has unlocked are valid.
   */
  equippedTraceSkinId: string | null
  /**
   * Equipped ambient track cosmetic ID, or null (default "Vitals Idle").
   * When set, useSwoobzMusic plays this track's assetPath.
   * Persisted to localStorage. Only tracks the player has unlocked are valid.
   */
  equippedAmbientTrackId: string | null
  /**
   * Whether the Instrument Bezel Frame is equipped (true) or not.
   * Requires rank 6 (the bezel unlocks at rank 6 — hud-frame cosmetic).
   * When true, the canvas shell gets data-bezel="on" + a CSS frame.
   * Persisted to localStorage.
   */
  equippedHudBezel: boolean
  /**
   * Number of extra auto-cashout preset slots earned. Derived from rank at
   * settle time — never stored independently (computed from lifetimeRoundsPlayed).
   * 0 extra = 4 default presets; 1 extra (rank 3) = 5th slot; 2 extra (rank 9) = 6th slot.
   */
  extraPresetSlots: number
}

export interface PulseLiveAudit {
  /** Server-seed commitment — the bound the operator is honouring. */
  serverSeedHashHex: string
  /** Player's per-round client-seed-chain-root, mixed in. */
  clientSeedChainRootHex: string
  /** Round id, hex (8-byte LE). */
  roundIdHex: string
}

export interface PulseHistoryRow {
  crashBps: bigint
  won: boolean
  cashedOutAtBps: bigint | null
}

interface RoundSecrets {
  serverSeed: Uint8Array
  serverSeedHash: Uint8Array
  chainRoot: Uint8Array
  mixer: Uint8Array
  roundId: bigint
  crashBps: bigint
  crashSlotValue: bigint
}

const INITIAL_BALANCE = 1_000_000_000n // 1000 USDC
const DEFAULT_WAGER = 10_000_000n // 10 USDC
export const MIN_WAGER = 100_000n // 0.10 USDC
const MAX_HISTORY = 20

const STARTING_SLOT = 1_000n

// ─── Progression economy persistence (vertical-slice localStorage) ───────────
// Both counters persist across sessions and NEVER reset.
// Cosmetic equip choices also persist. Authoritative ledger: @swoobz/points (S0).
const LIFETIME_SIGNALS_KEY = 'swoobz-pulse-lifetime-signals'
const LIFETIME_ROUNDS_KEY = 'swoobz-pulse-lifetime-rounds'
const EQUIPPED_TRACE_KEY = 'swoobz-pulse-equipped-trace'
const EQUIPPED_TRACK_KEY = 'swoobz-pulse-equipped-track'
const EQUIPPED_BEZEL_KEY = 'swoobz-pulse-equipped-bezel'

function loadLifetimeSignals(): bigint {
  if (typeof window === 'undefined') return 0n
  try {
    const raw = window.localStorage.getItem(LIFETIME_SIGNALS_KEY)
    if (!raw) return 0n
    const v = BigInt(raw)
    return v > 0n ? v : 0n
  } catch {
    return 0n
  }
}

function persistLifetimeSignals(value: bigint): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LIFETIME_SIGNALS_KEY, value.toString())
  } catch {
    // quota exceeded / storage disabled — degrades gracefully
  }
}

function loadLifetimeRounds(): bigint {
  if (typeof window === 'undefined') return 0n
  try {
    const raw = window.localStorage.getItem(LIFETIME_ROUNDS_KEY)
    if (!raw) return 0n
    const v = BigInt(raw)
    return v > 0n ? v : 0n
  } catch {
    return 0n
  }
}

function persistLifetimeRounds(value: bigint): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LIFETIME_ROUNDS_KEY, value.toString())
  } catch {
    // quota exceeded / storage disabled — degrades gracefully
  }
}

function loadEquippedTrace(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(EQUIPPED_TRACE_KEY) ?? null
  } catch {
    return null
  }
}

function persistEquippedTrace(id: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (id === null) {
      window.localStorage.removeItem(EQUIPPED_TRACE_KEY)
    } else {
      window.localStorage.setItem(EQUIPPED_TRACE_KEY, id)
    }
  } catch {
    // degrades gracefully
  }
}

function loadEquippedTrack(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(EQUIPPED_TRACK_KEY) ?? null
  } catch {
    return null
  }
}

function persistEquippedTrack(id: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (id === null) {
      window.localStorage.removeItem(EQUIPPED_TRACK_KEY)
    } else {
      window.localStorage.setItem(EQUIPPED_TRACK_KEY, id)
    }
  } catch {
    // degrades gracefully
  }
}

function loadEquippedBezel(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(EQUIPPED_BEZEL_KEY) === '1'
  } catch {
    return false
  }
}

function persistEquippedBezel(value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (value) {
      window.localStorage.setItem(EQUIPPED_BEZEL_KEY, '1')
    } else {
      window.localStorage.removeItem(EQUIPPED_BEZEL_KEY)
    }
  } catch {
    // degrades gracefully
  }
}

/**
 * Extra preset slots unlocked by rank. Derived from ranks 3 and 9.
 * Deterministic — pure function of rank index.
 */
function extraPresetSlotsForRank(rankIndex: number): number {
  if (rankIndex >= 9) return 2 // 5th + 6th slot
  if (rankIndex >= 3) return 1 // 5th slot
  return 0
}

/**
 * Warm-up gap between the round becoming active and the slot clock starting
 * to tick. Anticipation beat — gives the eye time to lock onto the curve
 * before it climbs. The canvas detects the same window via its own intro
 * tracker. Aviator-genre intro is ~600–900ms.
 */
export const ROUND_START_DELAY_MS = 750

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, '0')
  return hex
}

async function sha256(parts: Uint8Array[]): Promise<Uint8Array> {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const buf = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    buf.set(p, offset)
    offset += p.length
  }
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return new Uint8Array(digest)
}

function u64Le(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let v = value
  for (let i = 0; i < 8; i++) {
    // i is bounded to [0,8); the assignment is in-range.
    ;(out as Uint8Array)[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

async function generateRoundSecrets(roundId: bigint, clientSeed: bigint): Promise<RoundSecrets> {
  const serverSeed = crypto.getRandomValues(new Uint8Array(32))
  const serverSeedHash = await sha256([serverSeed])
  // Chain root starts at zero, folds in this round's client seed.
  const chainRoot = await sha256([new Uint8Array(32), u64Le(clientSeed)])
  // Mixer is a stable 32-byte domain separator. In production it is the program
  // id; in the mock it's a SHA of a literal so the verify widget stays
  // deterministic and the field still reads as opaque entropy.
  const mixer = await sha256([new TextEncoder().encode('swoobz-originals-pulse-v1-mock')])
  const outcomeWord = await sha256([serverSeed, chainRoot, u64Le(roundId), mixer])
  // Demo applies a 200x cap so the heavy inverse-CDF tail can't strand the
  // player in a 60+ s round, and a 1.10x floor so a literal 1.00x rug-pull
  // never happens. The verify widget recomputes with the same bounds so
  // verification matches bit for bit.
  const crashBps = deriveCrashBps(
    outcomeWord,
    HOUSE_EDGE_BPS,
    MOCK_MAX_CRASH_BPS,
    MOCK_MIN_CRASH_BPS,
  )
  const crashSlotValue = crashSlotFn(STARTING_SLOT, crashBps)
  return { serverSeed, serverSeedHash, chainRoot, mixer, roundId, crashBps, crashSlotValue }
}

export interface PulseController {
  state: PulseState
  /** Enter bet-entry from the lobby. */
  openBetEntry: () => void
  /** Cancel bet entry and return to the lobby. */
  closeBetEntry: () => void
  /** Update the in-progress wager (slip-stable across phase changes). */
  setWager: (lamports: bigint) => void
  /** Update the in-progress auto-cashout target in bps, or clear it. */
  setAutoCashout: (bps: bigint | null) => void
  /** Place the bet and transition into the active round. */
  placeBet: () => Promise<void>
  /** Cash out at the current slot's multiplier. */
  cashOut: () => void
  /** Advance the off-chain slot clock; the canvas calls this every frame. */
  tickToSlot: (slot: bigint) => void
  /** Return to the lobby after a settled round. */
  acknowledgeSettlement: () => void
  /** Re-derive the crash bps from the outcome (the Glass Box verify path). */
  reverifyCrashBps: (
    serverSeedHex: string,
    chainRootHex: string,
    roundIdHex: string,
    mixerHex: string,
  ) => Promise<bigint>
  /**
   * Equip a cosmetic by ID. Validates the player owns it (rank check).
   * Persists to localStorage immediately.
   * - trace-skin: swaps the curve stroke color in PulseCurveCanvas.
   * - ambient-track: swaps the background music track.
   * - hud-frame (bezel): equip/unequip the canvas bezel.
   * - tape-ledger: no explicit equip — auto-shown at rank 2.
   */
  equipCosmetic: (cosmeticId: string) => void
  /** Unequip a cosmetic, reverting to the default for its category. */
  unequipCosmetic: (cosmeticId: string) => void
}

/**
 * The off-chain timing model. Real time runs at 1 slot ≈ 400ms; the controller
 * starts a `setInterval(slotDurationMs)` while the round is active so the slot
 * clock advances even if the canvas hasn't rendered yet. The canvas separately
 * computes a fractional slot for smooth between-tick interpolation.
 */
export function usePulseController(): PulseController {
  const [state, setState] = useState<PulseState>(() => ({
    phase: { kind: 'lobby' },
    balanceLamports: INITIAL_BALANCE,
    wagerLamports: DEFAULT_WAGER,
    autoCashoutBps: null,
    roundActiveSlot: null,
    currentSlot: STARTING_SLOT,
    history: [],
    liveAudit: null,
    // All progression fields loaded from localStorage in a mount effect
    // (NOT the initializer) to avoid SSR/client hydration mismatch.
    lifetimeOwnershipPoints: 0n,
    lifetimeRoundsPlayed: 0n,
    equippedTraceSkinId: null,
    equippedAmbientTrackId: null,
    equippedHudBezel: false,
    extraPresetSlots: 0,
  }))
  const secretsRef = useRef<RoundSecrets | null>(null)
  const roundIdRef = useRef<bigint>(1n)
  const slotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (slotIntervalRef.current) clearInterval(slotIntervalRef.current)
    }
  }, [])

  // Load all persisted progression fields after mount (client-only) to avoid
  // SSR/client hydration mismatch — SSR has no localStorage.
  useEffect(() => {
    const signals = loadLifetimeSignals()
    const rounds = loadLifetimeRounds()
    const traceSkin = loadEquippedTrace()
    const track = loadEquippedTrack()
    const bezel = loadEquippedBezel()
    const rankIndex = computePulseRank(rounds).tier.index
    const extraSlots = extraPresetSlotsForRank(rankIndex)
    setState((s) => ({
      ...s,
      lifetimeOwnershipPoints: signals > 0n ? signals : s.lifetimeOwnershipPoints,
      lifetimeRoundsPlayed: rounds > 0n ? rounds : s.lifetimeRoundsPlayed,
      equippedTraceSkinId: traceSkin,
      equippedAmbientTrackId: track,
      equippedHudBezel: bezel,
      extraPresetSlots: extraSlots,
    }))
  }, [])

  const openBetEntry = useCallback(() => {
    setState((s) => (s.phase.kind === 'lobby' ? { ...s, phase: { kind: 'bet-entry' } } : s))
  }, [])

  const closeBetEntry = useCallback(() => {
    setState((s) => (s.phase.kind === 'bet-entry' ? { ...s, phase: { kind: 'lobby' } } : s))
  }, [])

  const setWager = useCallback((lamports: bigint) => {
    setState((s) => {
      if (lamports < MIN_WAGER) return { ...s, wagerLamports: MIN_WAGER }
      if (lamports > s.balanceLamports) return { ...s, wagerLamports: s.balanceLamports }
      return { ...s, wagerLamports: lamports }
    })
  }, [])

  const setAutoCashout = useCallback((bps: bigint | null) => {
    setState((s) => ({ ...s, autoCashoutBps: bps }))
  }, [])

  const settleAt = useCallback(
    (cashOutSlot: bigint | null, cashedOutAtBps: bigint | null) => {
      const secrets = secretsRef.current
      if (!secrets) return
      const won = cashOutSlot !== null && cashOutSlot < secrets.crashSlotValue
      // Perfect-hit detection: only on a winning cash-out, and only when the
      // cashed-out multiplier sits inside a milestone band. The bonus ramps
      // 1.05-1.15× toward dead-center (pulseMath::perfectHitBonusBps); the
      // ramp is module-const + zero session state (RG-C5 SAFE).
      const perfectMilestoneBps =
        won && cashedOutAtBps !== null ? nearestPerfectMilestoneBps(cashedOutAtBps) : null
      const perfectBonusBps =
        won && cashedOutAtBps !== null ? perfectHitBonusBps(cashedOutAtBps) : ONE_X_BPS
      // Perfect-hit is EV-NEUTRAL: it never touches the cash payout. A payout
      // multiplier pushed milestone-targeting RTP above 100% (casino-fairness
      // C-1, 2026-06-29). The reward is now paid in ownership points + the
      // celebration, so the money game stays a clean 95.5% RTP at every cash-out.
      const payoutLamports =
        won && cashedOutAtBps !== null ? settlePayout(currentStateWager(), cashedOutAtBps) : 0n
      const outcome: PulseOutcome = {
        won,
        cashedOutAtBps: won ? cashedOutAtBps : null,
        cashedOutAtSlot: won ? cashOutSlot : null,
        crashBps: secrets.crashBps,
        crashSlot: secrets.crashSlotValue,
        payoutLamports,
        perfectMilestoneBps,
        perfectBonusBps,
        serverSeedHex: toHex(secrets.serverSeed),
        serverSeedHashHex: toHex(secrets.serverSeedHash),
        roundIdHex: toHex(u64Le(secrets.roundId)),
        clientSeedChainRootHex: toHex(secrets.chainRoot),
        mixerHex: toHex(secrets.mixer),
      }
      // LEDGER B — ownership points accrue from WAGER VOLUME at 1.0x/1.5x
      // (display differentiator; does NOT drive rank).
      const baseSignals = accumulatePoints(
        stateRef.current.lifetimeOwnershipPoints,
        currentStateWager(),
        won,
      )
      // Perfect-hit reward (EV-NEUTRAL): bonus ownership points scaled by how
      // centered the read was (perfectBonusBps 1.05–1.15×). Points are not money,
      // so RTP is untouched — this is the skill-ceiling payoff, paid in signals.
      const perfectBonusPoints =
        perfectMilestoneBps !== null
          ? (pointsForBet(currentStateWager(), won) * (perfectBonusBps - ONE_X_BPS)) / ONE_X_BPS
          : 0n
      const newLifetimeSignals = baseSignals + perfectBonusPoints
      persistLifetimeSignals(newLifetimeSignals)

      // LEDGER A — rounds played increments by exactly 1, regardless of wager
      // (Tim correction #1: wager-neutral rank progression).
      const newLifetimeRounds = accumulateRoundsPlayed(stateRef.current.lifetimeRoundsPlayed)
      persistLifetimeRounds(newLifetimeRounds)

      // Recompute extra preset slots from the NEW rank (may have just ranked up).
      const newRankIndex = computePulseRank(newLifetimeRounds).tier.index
      const newExtraSlots = extraPresetSlotsForRank(newRankIndex)
      // Audio (crash + cashout) is dispatched from PulseCurveCanvas.tsx's
      // `justCrashed` / `justCashedOut` useLayoutEffect branches — those
      // branches fire exactly once per state transition and are co-located
      // with the visual crash/cashout moment. Dispatching here as well was
      // causing a double-dispatch. PULSE-AUDIO-REG1-2026-05-27.
      setState((s) => ({
        ...s,
        phase: { kind: 'settled', outcome },
        balanceLamports: s.balanceLamports + payoutLamports,
        lifetimeOwnershipPoints: newLifetimeSignals,
        lifetimeRoundsPlayed: newLifetimeRounds,
        extraPresetSlots: newExtraSlots,
        // Keep `roundActiveSlot` populated through the settled phase so the
        // canvas can keep rendering the frozen crash scene (debris, CRASHED
        // stamp, BUST AT X.XXx). Clearing it now would short-circuit the
        // canvas back to the "place a wager" idle screen, hiding the entire
        // crash moment. Cleared on `acknowledgeSettlement` instead.
        history: [
          {
            crashBps: secrets.crashBps,
            won,
            cashedOutAtBps: outcome.cashedOutAtBps,
          },
          ...s.history,
        ].slice(0, MAX_HISTORY),
      }))
      if (slotIntervalRef.current) {
        clearInterval(slotIntervalRef.current)
        slotIntervalRef.current = null
      }
    },
    // `currentStateWager` is a stable closure; reading state directly here is
    // intentional to keep the callback stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Reads the wager from the latest state via a ref-like indirection. The
  // closure above uses this; defined outside React state to stay stable.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  function currentStateWager(): bigint {
    return stateRef.current.wagerLamports
  }

  const placeBet = useCallback(async () => {
    // Accept from bet-entry (first bet) AND from settled (one-tap replay).
    if (state.phase.kind !== 'bet-entry' && state.phase.kind !== 'settled') return
    if (state.wagerLamports > state.balanceLamports) return
    // First user gesture in the round — initialise audio so tier ticks can fire.
    ensureAudio()
    // Bet-commit confirm sound — fires on the locked-in moment, BEFORE the
    // curve starts climbing. Zero-param + module-const (RG-C5 SAFE).
    playBetCommit()
    // Clear any lingering slot interval from a previous round so a fast
    // replay can't run two clocks at once.
    if (slotIntervalRef.current) {
      clearInterval(slotIntervalRef.current)
      slotIntervalRef.current = null
    }
    const roundId = roundIdRef.current
    roundIdRef.current = roundId + 1n
    // Player-chosen client seed: a per-round random 64-bit value.
    const clientSeedBuf = crypto.getRandomValues(new Uint8Array(8))
    let clientSeed = 0n
    for (let i = 0; i < 8; i++) clientSeed |= BigInt(clientSeedBuf[i]!) << BigInt(8 * i)
    const secrets = await generateRoundSecrets(roundId, clientSeed)
    secretsRef.current = secrets
    setState((s) => ({
      ...s,
      phase: { kind: 'round-active' },
      balanceLamports: s.balanceLamports - s.wagerLamports,
      roundActiveSlot: STARTING_SLOT,
      currentSlot: STARTING_SLOT,
      // Surface the audit commitment for the in-canvas Glass-Box readout
      // per PULSE-ART-DIRECTION-2026-05-25 §3.4. The hash + chain-root are
      // published BEFORE the curve climbs so the player can verify the
      // commitment in the audit panel from round-active forward.
      liveAudit: {
        serverSeedHashHex: toHex(secrets.serverSeedHash),
        clientSeedChainRootHex: toHex(secrets.chainRoot),
        roundIdHex: toHex(u64Le(secrets.roundId)),
      },
    }))
    // Brief warm-up gap so the eye can lock on before the curve climbs. The
    // canvas's wall-clock interpolator detects this same window and holds
    // the head at 1.00x with a "ROUND STARTING" overlay; the on-chain slot
    // clock starts ticking only when the gap ends. Aviator-class intro.
    const startTickingAt = performance.now() + ROUND_START_DELAY_MS
    slotIntervalRef.current = setInterval(() => {
      if (performance.now() < startTickingAt) return // warm-up gate
      // Side-effects (settleAt, clearInterval) MUST live outside the state
      // updater. React Strict Mode runs updaters twice in dev — scheduling
      // settle inside the updater fires it twice, doubling history rows.
      const s = stateRef.current
      if (s.phase.kind !== 'round-active' || !s.roundActiveSlot) return
      const nextSlot = s.currentSlot + 1n
      const target = s.autoCashoutBps
      let settle: { slot: bigint | null; bps: bigint | null } | null = null
      if (target !== null) {
        const curMul = currentMultiplierBps(s.roundActiveSlot, nextSlot)
        if (curMul >= target && nextSlot < secrets.crashSlotValue) {
          settle = { slot: nextSlot, bps: target }
        }
      }
      if (nextSlot >= secrets.crashSlotValue) {
        settle = { slot: null, bps: null }
      }
      setState((cur) =>
        cur.phase.kind === 'round-active' && cur.currentSlot < nextSlot
          ? { ...cur, currentSlot: nextSlot }
          : cur,
      )
      if (settle) {
        if (slotIntervalRef.current) {
          clearInterval(slotIntervalRef.current)
          slotIntervalRef.current = null
        }
        settleAt(settle.slot, settle.bps)
      }
    }, Number(SLOT_DURATION_MS))
  }, [state.balanceLamports, state.phase.kind, state.wagerLamports, settleAt])

  const cashOut = useCallback(() => {
    // Side-effects (settleAt) live outside the updater — Strict Mode would
    // double-fire them otherwise. See the interval handler above.
    const s = stateRef.current
    if (s.phase.kind !== 'round-active' || !s.roundActiveSlot) return
    const cashoutBps = currentMultiplierBps(s.roundActiveSlot, s.currentSlot)
    setState((cur) =>
      cur.phase.kind === 'round-active' ? { ...cur, phase: { kind: 'settling' } } : cur,
    )
    settleAt(s.currentSlot, cashoutBps)
  }, [settleAt])

  const tickToSlot = useCallback((slot: bigint) => {
    setState((s) => (slot > s.currentSlot ? { ...s, currentSlot: slot } : s))
  }, [])

  const acknowledgeSettlement = useCallback(() => {
    // CHANGE WAGER from the settled state lands on bet-entry, NOT lobby —
    // the player explicitly wants to adjust the wager amount for the next
    // round, not re-enter the lobby (Tim 2026-05-21: the previous
    // lobby-routing reset the wager card and felt like a hard reset).
    setState((s) =>
      s.phase.kind === 'settled'
        ? {
            ...s,
            phase: { kind: 'bet-entry' },
            roundActiveSlot: null,
            currentSlot: STARTING_SLOT,
            liveAudit: null,
          }
        : s,
    )
    secretsRef.current = null
  }, [])

  // ── Cosmetic equip / unequip ─────────────────────────────────────────────
  const equipCosmetic = useCallback((cosmeticId: string) => {
    setState((s) => {
      // Guard: can only equip cosmetics the player has unlocked (rank check).
      const rankIndex = computePulseRank(s.lifetimeRoundsPlayed).tier.index
      const owned = ownedPulseCosmetics(rankIndex)
      if (!owned.some((c) => c.id === cosmeticId)) return s // not unlocked yet
      const item = pulseCosmeticById(cosmeticId)
      if (!item) return s
      if (item.category === 'trace-skin') {
        persistEquippedTrace(cosmeticId)
        return { ...s, equippedTraceSkinId: cosmeticId }
      }
      if (item.category === 'ambient-track') {
        persistEquippedTrack(cosmeticId)
        return { ...s, equippedAmbientTrackId: cosmeticId }
      }
      if (item.category === 'hud-frame') {
        persistEquippedBezel(true)
        return { ...s, equippedHudBezel: true }
      }
      // tape-ledger: auto-shown at rank 2, no explicit equip needed.
      return s
    })
  }, [])

  const unequipCosmetic = useCallback((cosmeticId: string) => {
    setState((s) => {
      const item = pulseCosmeticById(cosmeticId)
      if (!item) return s
      if (item.category === 'trace-skin') {
        persistEquippedTrace(null)
        return { ...s, equippedTraceSkinId: null }
      }
      if (item.category === 'ambient-track') {
        persistEquippedTrack(null)
        return { ...s, equippedAmbientTrackId: null }
      }
      if (item.category === 'hud-frame') {
        persistEquippedBezel(false)
        return { ...s, equippedHudBezel: false }
      }
      return s
    })
  }, [])

  const reverifyCrashBps = useCallback(
    async (
      serverSeedHex: string,
      chainRootHex: string,
      roundIdHex: string,
      mixerHex: string,
    ): Promise<bigint> => {
      function fromHex(hex: string): Uint8Array {
        if (hex.length % 2 !== 0) throw new Error('odd-length hex')
        const out = new Uint8Array(hex.length / 2)
        for (let i = 0; i < out.length; i++) {
          ;(out as Uint8Array)[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16)
        }
        return out
      }
      const serverSeed = fromHex(serverSeedHex)
      const chainRoot = fromHex(chainRootHex)
      const roundIdBytes = fromHex(roundIdHex)
      const mixer = fromHex(mixerHex)
      const outcomeWord = await sha256([serverSeed, chainRoot, roundIdBytes, mixer])
      // Recompute with the same floor + ceiling the mock generated under.
      return deriveCrashBps(outcomeWord, HOUSE_EDGE_BPS, MOCK_MAX_CRASH_BPS, MOCK_MIN_CRASH_BPS)
    },
    [],
  )

  return {
    state,
    openBetEntry,
    closeBetEntry,
    setWager,
    setAutoCashout,
    placeBet,
    cashOut,
    tickToSlot,
    acknowledgeSettlement,
    reverifyCrashBps,
    equipCosmetic,
    unequipCosmetic,
  }
}

export { HOUSE_EDGE_BPS, MAX_CRASH_BPS, ONE_X_BPS, SLOT_DURATION_MS }

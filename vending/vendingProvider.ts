/**
 * AUTOMAT — provider (deterministic, mockable game-state machine).
 *
 * Structure follows `originals/assay/assayProvider.ts` (round lifecycle,
 * seed-committed derivation, staggered/instant reveal driver, mock balance)
 * but the MECHANIC is a multi-unit vend: the player buys `packCount` (1..10)
 * packs at `wagerPerPackLamports` each in ONE purchase; the machine vends the
 * packs one-by-one (staggered) or all at once (instant). Each pack resolves
 * independently through the SINGLE weighted prize table in `vendingMath.ts`.
 *
 * Domain B (controller) consuming Domain A (`vendingMath.ts`). All payout math
 * routes through `settlePackPayout` (per-pack floor) there.
 *
 * RG-C3: the full pack contents are derived at buy time and live ONLY on the
 * secrets ref. UI-visible state (`dispensed`) only ever contains packs that
 * have ALREADY been vended — there is no look-ahead surface. The complete roll
 * list appears only in the settled outcome (Glass Box certificate).
 *
 * RG note (precedent: vault's "auto-repeat" refusal): there is NO auto-vend /
 * repeat loop. Every purchase requires an explicit VEND press; `ensureAudio()`
 * (the coin-insert) fires on that gesture.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ensureAudio, playGoldPack, playTrayServed, playVendPack } from './vendingAudio'
import {
  aggregateMultiplierBps,
  DEFAULT_TIER,
  MAX_PACKS,
  MIN_PACKS,
  PACK_MAX_MULTIPLIER_BPS_BY_TIER,
  rollToPrize,
  settlePackPayout,
  WEIGHT_TOTAL,
} from './vendingMath'
import type { PackClass, VendingTierId } from './vendingMath'

export type { PackClass, VendingTierId }

/** Display names per difficulty tier — the machines on the turntable. Keyed
 *  by the INTERNAL id (fairness domain-separation keys off the id, never the
 *  label). */
export const TIER_DISPLAY_LABEL: Readonly<Record<VendingTierId, string>> = {
  easy: 'EASY · TIDE',
  medium: 'MEDIUM · STORM',
  hard: 'HARD · OBSIDIAN',
}

// ─── Phase model ────────────────────────────────────────────────────────────

export type VendingPhase =
  /** Bet entry: machine idle, price/quantity editable. */
  | { kind: 'ready' }
  /** Purchase committed; the machine is vending pack-by-pack. */
  | { kind: 'vending' }
  | { kind: 'settled'; outcome: VendingOutcome }

/** One vended pack (also the Glass Box per-pack verification row). */
export interface PackResult {
  /** 0-based vend order. The fairness derivation is keyed on this index. */
  packIndex: number
  /** The uniform roll ∈ [0, WEIGHT_TOTAL) this pack drew (receipt shows it). */
  roll: bigint
  /** Stable prize id from the table (receipt re-derives roll → id). */
  prizeId: string
  cls: PackClass
  multiplierBps: bigint
  /** floor(wagerPerPack × multiplierBps / 10000) — Domain A per-pack floor. */
  payoutLamports: bigint
}

export interface VendingOutcome {
  /** True when the tray returned anything at all (totalPayout > 0). */
  won: boolean
  /** Difficulty tier that PRODUCED this receipt (frozen at vend time — a
   *  post-settle tier switch can never rewrite it). Part of the fairness
   *  re-derivation input: rolls are domain-separated per tier. */
  tier: VendingTierId
  tierLabel: string
  wagerPerPackLamports: bigint
  packCount: number
  totalWagerLamports: bigint
  totalPayoutLamports: bigint
  /** Display-only aggregate: floor(totalPayout·10000/totalWager). */
  aggregateBps: bigint
  goldCount: number
  /** Every vended pack in order — the receipt's re-derivation table. */
  packs: PackResult[]
  serverSeedHex: string
  serverSeedHashHex: string
  roundIdHex: string
}

export interface VendingHistoryRow {
  packCount: number
  totalWagerLamports: bigint
  totalPayoutLamports: bigint
  aggregateBps: bigint
  goldCount: number
  won: boolean
}

export interface VendingState {
  phase: VendingPhase
  balanceLamports: bigint
  /** The machine the player has ARMED on the turntable. Drives the NEXT vend's
   *  table + max win. Switchable only while NOT vending. */
  selectedTier: VendingTierId
  /** The tier LOCKED at vend time. The reveal + settlement read THIS (never
   *  selectedTier), so a mid-round switch can't rewrite the live round. */
  committedTier: VendingTierId
  /** Price of ONE pack. Total cost = wagerPerPack × packCount. */
  wagerPerPackLamports: bigint
  /** Packs in this purchase (1..MAX_PACKS). "Buy 10 at the same time." */
  packCount: number
  /** Commit hash of the CURRENT round's server seed, set the moment the vend
   *  is committed (before any reveal) — the player-visible Glass Box commit.
   *  The seed itself stays secret until the settled receipt. */
  committedSeedHashHex: string | null
  /** Packs vended SO FAR this round, in vend order (never look-ahead). */
  dispensed: PackResult[]
  /** Running tray total in lamports (sums dispensed payouts). Display. */
  trayLamports: bigint
  /** Reveal pacing. 'staggered' (pack-by-pack) or 'instant' (one batch). */
  revealPace: 'staggered' | 'instant'
  history: VendingHistoryRow[]
}

interface RoundSecrets {
  serverSeed: Uint8Array
  serverSeedHash: Uint8Array
  roundId: bigint
  /** All pack results, precomputed at buy. UI state never reads ahead of the
   *  vend cursor (RG-C3); the full list surfaces only in the outcome. */
  packs: PackResult[]
}

const INITIAL_BALANCE = 1_000_000_000n // 1000 USDC
const DEFAULT_WAGER = 1_000_000n // 1 USDC per pack
const MIN_WAGER = 100_000n // 0.10 USDC
export const MAX_HISTORY = 20

/** Per-pack vend cadence (staggered). Module const (RG-C5) — identical every
 *  round; the canvas choreographs coil-turn → drop → tray inside this window. */
export const VEND_STEP_MS = 820
/** Read-hold after the LAST pack before the settled overlay. */
const SETTLE_HOLD_MS = 1_000
/** Hold before settle on the instant pace (one batch → brief read). */
const INSTANT_HOLD_MS = 700

function makeInitialState(): VendingState {
  return {
    phase: { kind: 'ready' },
    balanceLamports: INITIAL_BALANCE,
    selectedTier: DEFAULT_TIER,
    committedTier: DEFAULT_TIER,
    wagerPerPackLamports: DEFAULT_WAGER,
    packCount: 3,
    committedSeedHashHex: null,
    dispensed: [],
    trayLamports: 0n,
    revealPace: 'staggered',
    history: [],
  }
}

// ─── Provably-fair roll derivation (sha256, committed seed) ─────────────────

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, '0')
  return hex
}

async function sha256(parts: Uint8Array[]): Promise<Uint8Array> {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const buf = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    buf.set(p, off)
    off += p.length
  }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
}

function u64Le(v: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let x = v
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn)
    x >>= 8n
  }
  return out
}

const U64_SPAN = 1n << 64n
/** Largest multiple of WEIGHT_TOTAL ≤ 2^64 — rejection-sampling bound that
 *  makes the roll EXACTLY uniform over [0, WEIGHT_TOTAL) (no modulo bias). */
const ROLL_ACCEPT_LIMIT = U64_SPAN - (U64_SPAN % WEIGHT_TOTAL)

/**
 * Deterministically derive pack `packIndex`'s roll from the committed seed,
 * DOMAIN-SEPARATED per tier (same seed on two tiers → independent rolls):
 * draw u64 = SHA-256(seed ‖ "VENDPACK:<tier>" ‖ u64Le(packIndex) ‖ u64Le(attempt))
 * [first 8 bytes, LE]; reject u64 ≥ ROLL_ACCEPT_LIMIT (P ≈ 2.6e-15) and redraw
 * with attempt+1; else roll = u64 mod WEIGHT_TOTAL. The Glass Box certificate
 * re-runs this exact function to verify each vended pack.
 */
export async function derivePackRoll(
  serverSeed: Uint8Array,
  packIndex: number,
  tier: VendingTierId = DEFAULT_TIER,
): Promise<bigint> {
  const tag = new TextEncoder().encode(`VENDPACK:${tier}`)
  for (let attempt = 0n; ; attempt++) {
    const hash = await sha256([serverSeed, tag, u64Le(BigInt(packIndex)), u64Le(attempt)])
    let raw = 0n
    for (let i = 0; i < 8; i++) raw |= BigInt(hash[i]!) << BigInt(8 * i)
    if (raw < ROLL_ACCEPT_LIMIT) return raw % WEIGHT_TOTAL
  }
}

async function generateRoundSecrets(
  roundId: bigint,
  packCount: number,
  wagerPerPackLamports: bigint,
  tier: VendingTierId,
): Promise<RoundSecrets> {
  const serverSeed = crypto.getRandomValues(new Uint8Array(32))
  const serverSeedHash = await sha256([serverSeed])
  const packs: PackResult[] = []
  for (let i = 0; i < packCount; i++) {
    const roll = await derivePackRoll(serverSeed, i, tier)
    const prize = rollToPrize(roll, tier)
    packs.push({
      packIndex: i,
      roll,
      prizeId: prize.id,
      cls: prize.cls,
      multiplierBps: prize.multiplierBps,
      payoutLamports: settlePackPayout(wagerPerPackLamports, prize.multiplierBps),
    })
  }
  return { serverSeed, serverSeedHash, roundId, packs }
}

/** Arm a tier — pure reducer (unit-provable). NO-OP mid-vend: a running round
 *  keeps its committedTier; in ready/settled it updates selectedTier only. */
export function armTierReducer(s: VendingState, id: VendingTierId): VendingState {
  if (s.phase.kind === 'vending') return s
  return s.selectedTier === id ? s : { ...s, selectedTier: id }
}

// ─── Pure reducers (unit-provable — see vendingProvider.test.ts) ────────────

/** Clamp + set the per-pack wager. Editable only while NOT vending. */
export function wagerReducer(s: VendingState, lamports: bigint): VendingState {
  if (s.phase.kind === 'vending') return s
  let next = lamports
  if (next < MIN_WAGER) next = MIN_WAGER
  if (next > s.balanceLamports) next = s.balanceLamports
  return next === s.wagerPerPackLamports ? s : { ...s, wagerPerPackLamports: next }
}

/** Clamp + set the pack count (1..MAX_PACKS). Editable only while NOT vending. */
export function packCountReducer(s: VendingState, count: number): VendingState {
  if (s.phase.kind === 'vending') return s
  if (!Number.isInteger(count)) return s
  const next = Math.min(MAX_PACKS, Math.max(MIN_PACKS, count))
  return next === s.packCount ? s : { ...s, packCount: next }
}

// ─── Controller ─────────────────────────────────────────────────────────────

export interface VendingController {
  state: VendingState
  /** Ready + valid count + affordable total. */
  readonly canVend: boolean
  /** wagerPerPack × packCount — the purchase price of this vend. */
  readonly totalCostLamports: bigint
  /** packCount × floor(wagerPerPack × tierMax) — the ARMED tier's max win. */
  readonly maxWinLamports: bigint
  /** Arm a machine on the turntable. No-op mid-vend. */
  setTier: (id: VendingTierId) => void
  setWager: (lamports: bigint) => void
  setPackCount: (count: number) => void
  toggleRevealPace: () => void
  /** Commit the purchase: deduct total, derive the packs, start vending. */
  vendPacks: () => Promise<void>
  /** Mid-vend skip: flush all remaining packs in one batch and settle (the
   *  VEND button becomes this while vending). Reveal-pace shortcut only —
   *  outcomes were fixed at commit; no math is touched. */
  skipReveal: () => void
  /** From settled → ready (price/count persist for a manual re-vend). */
  acknowledgeSettlement: () => void
  closeSession: () => void
}

export function useVendingController(): VendingController {
  const [state, setState] = useState<VendingState>(makeInitialState)
  const secretsRef = useRef<RoundSecrets | null>(null)
  const roundIdRef = useRef<bigint>(1n)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const setTier = useCallback((id: VendingTierId) => {
    setState((s) => armTierReducer(s, id))
  }, [])

  const setWager = useCallback((lamports: bigint) => {
    setState((s) => wagerReducer(s, lamports))
  }, [])

  const setPackCount = useCallback((count: number) => {
    setState((s) => packCountReducer(s, count))
  }, [])

  const toggleRevealPace = useCallback(() => {
    setState((s) =>
      s.phase.kind !== 'vending'
        ? { ...s, revealPace: s.revealPace === 'staggered' ? 'instant' : 'staggered' }
        : s,
    )
  }, [])

  // Settlement — reads the full precomputed pack list from secrets.
  const settle = useCallback(() => {
    const secrets = secretsRef.current
    if (!secrets) return
    const s = stateRef.current
    if (s.phase.kind !== 'vending') return
    const totalWager = s.wagerPerPackLamports * BigInt(secrets.packs.length)
    let totalPayout = 0n
    let goldCount = 0
    for (const p of secrets.packs) {
      totalPayout += p.payoutLamports
      if (p.cls === 'gold') goldCount++
    }
    const outcome: VendingOutcome = {
      won: totalPayout > 0n,
      tier: s.committedTier,
      tierLabel: TIER_DISPLAY_LABEL[s.committedTier],
      wagerPerPackLamports: s.wagerPerPackLamports,
      packCount: secrets.packs.length,
      totalWagerLamports: totalWager,
      totalPayoutLamports: totalPayout,
      aggregateBps: aggregateMultiplierBps(totalWager, totalPayout),
      goldCount,
      packs: secrets.packs.map((p) => ({ ...p })),
      serverSeedHex: toHex(secrets.serverSeed),
      serverSeedHashHex: toHex(secrets.serverSeedHash),
      roundIdHex: toHex(u64Le(secrets.roundId)),
    }
    playTrayServed()
    setState((cur) => ({
      ...cur,
      phase: { kind: 'settled', outcome },
      balanceLamports: cur.balanceLamports + totalPayout,
      history: [
        {
          packCount: outcome.packCount,
          totalWagerLamports: totalWager,
          totalPayoutLamports: totalPayout,
          aggregateBps: outcome.aggregateBps,
          goldCount,
          won: outcome.won,
        },
        ...cur.history,
      ].slice(0, MAX_HISTORY),
    }))
  }, [])

  // VEND: validate, commit the seed, deduct the WHOLE purchase, start vending.
  const vendPacks = useCallback(async () => {
    const s = stateRef.current
    if (s.phase.kind !== 'ready') return
    if (s.packCount < MIN_PACKS || s.packCount > MAX_PACKS) return
    const totalCost = s.wagerPerPackLamports * BigInt(s.packCount)
    if (totalCost <= 0n || totalCost > s.balanceLamports) return
    ensureAudio()
    const roundId = roundIdRef.current
    roundIdRef.current = roundId + 1n
    // Freeze the armed tier for the whole round: rolls are derived with it
    // and settlement reads committedTier — a later switch can't touch this.
    const armedTier = s.selectedTier
    const secrets = await generateRoundSecrets(roundId, s.packCount, s.wagerPerPackLamports, armedTier)
    secretsRef.current = secrets
    setState((cur) => ({
      ...cur,
      phase: { kind: 'vending' },
      balanceLamports: cur.balanceLamports - totalCost,
      committedTier: armedTier,
      committedSeedHashHex: toHex(secrets.serverSeedHash),
      dispensed: [],
      trayLamports: 0n,
    }))
  }, [])

  const skipReveal = useCallback(() => {
    const secrets = secretsRef.current
    const s = stateRef.current
    if (!secrets || s.phase.kind !== 'vending') return
    if (s.dispensed.length >= secrets.packs.length) return
    let tray = 0n
    for (const p of secrets.packs) tray += p.payoutLamports
    const remaining = secrets.packs.slice(s.dispensed.length)
    if (remaining.some((p) => p.cls === 'gold')) playGoldPack()
    else playVendPack()
    setState((cur) =>
      cur.phase.kind === 'vending'
        ? { ...cur, dispensed: secrets.packs.map((p) => ({ ...p })), trayLamports: tray }
        : cur,
    )
    setTimeout(() => settle(), INSTANT_HOLD_MS)
  }, [settle])

  const acknowledgeSettlement = useCallback(() => {
    setState((cur) =>
      cur.phase.kind === 'settled'
        ? { ...cur, phase: { kind: 'ready' }, dispensed: [], trayLamports: 0n }
        : cur,
    )
    secretsRef.current = null
  }, [])

  const closeSession = useCallback(() => {
    secretsRef.current = null
    setState(makeInitialState())
  }, [])

  // ── Vend driver ───────────────────────────────────────────────────────────
  // While `vending`, move packs from secrets to `dispensed` in order.
  // STAGGERED vends one pack per VEND_STEP_MS (the first lands after one full
  // step, so the coil-turn choreography has its window); INSTANT commits the
  // whole batch in one setState. Audio cue per pack is class-keyed (RG-C5:
  // both cues zero-param; gold ≠ standard is outcome CLASS, not value).
  useEffect(() => {
    if (state.phase.kind !== 'vending') return
    const secrets = secretsRef.current
    if (!secrets) return

    if (state.revealPace === 'instant') {
      let tray = 0n
      for (const p of secrets.packs) tray += p.payoutLamports
      if (secrets.packs.some((p) => p.cls === 'gold')) playGoldPack()
      else playVendPack()
      setState((cur) =>
        cur.phase.kind === 'vending'
          ? { ...cur, dispensed: secrets.packs.map((p) => ({ ...p })), trayLamports: tray }
          : cur,
      )
      const t = setTimeout(() => settle(), INSTANT_HOLD_MS)
      return () => clearTimeout(t)
    }

    // STAGGERED vend.
    const id = setInterval(() => {
      const s = stateRef.current
      if (s.phase.kind !== 'vending') {
        clearInterval(id)
        return
      }
      const idx = s.dispensed.length
      if (idx >= secrets.packs.length) {
        clearInterval(id)
        return
      }
      const pack = secrets.packs[idx]!
      if (pack.cls === 'gold') playGoldPack()
      else playVendPack()
      setState((cur) =>
        cur.phase.kind === 'vending'
          ? {
              ...cur,
              dispensed: [...cur.dispensed, { ...pack }],
              trayLamports: cur.trayLamports + pack.payoutLamports,
            }
          : cur,
      )
      if (idx + 1 >= secrets.packs.length) {
        clearInterval(id)
        setTimeout(() => settle(), SETTLE_HOLD_MS)
      }
    }, VEND_STEP_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase.kind, settle])

  const totalCostLamports = state.wagerPerPackLamports * BigInt(state.packCount)
  const maxWinLamports =
    BigInt(state.packCount) *
    settlePackPayout(state.wagerPerPackLamports, PACK_MAX_MULTIPLIER_BPS_BY_TIER[state.selectedTier])
  const canVend =
    state.phase.kind === 'ready' &&
    state.packCount >= MIN_PACKS &&
    state.packCount <= MAX_PACKS &&
    totalCostLamports > 0n &&
    totalCostLamports <= state.balanceLamports

  return useMemo<VendingController>(
    () => ({
      state,
      canVend,
      totalCostLamports,
      maxWinLamports,
      setTier,
      setWager,
      setPackCount,
      toggleRevealPace,
      vendPacks,
      skipReveal,
      acknowledgeSettlement,
      closeSession,
    }),
    [
      state,
      canVend,
      totalCostLamports,
      maxWinLamports,
      setTier,
      setWager,
      setPackCount,
      toggleRevealPace,
      vendPacks,
      skipReveal,
      acknowledgeSettlement,
      closeSession,
    ],
  )
}

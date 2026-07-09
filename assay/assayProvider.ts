/**
 * The Assay Line — provider (deterministic, mockable game-state machine).
 *
 * Structure lifted from `originals/vault/vaultProvider.ts` (round lifecycle
 * planning→commit→reveal→settle, seed-committed bad-vein bitmap via Fisher-Yates,
 * staggered/instant cascade, "assay again · same claim-line" preset) but the
 * MECHANIC is different: this is a FORCED-COMPLETION trail game. The player
 * pre-selects the whole claim-line during `planning`, plunges the current-key
 * ONCE (`plungeKey`), and the current runs the committed trail bead-to-bead. A
 * single bad vein in the committed trail busts the run.
 *
 * Domain B (controller) consuming Domain A (`assayMath.ts`). All payout math
 * routes through the single-final-floor ladder there.
 *
 * RG-C3: the bad-vein bitmap is generated at commit and lives ONLY on the
 * secrets ref. It is NEVER spread into UI-visible state during `assaying`; the
 * board only knows which of the player's OWN committed tiles have been revealed
 * so far. The full bitmap surfaces only in the settled outcome (Glass Box
 * certificate), as an audit record.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ensureAudio, playBadVein, playBead, playClaim } from './assayAudio'
import {
  coinDeltaBps,
  coinLadderBps,
  DEFAULT_TIER,
  GRID_DIM,
  MAX_TRAIL,
  MIN_TRAIL,
  ONE_X_BPS,
  settlePayout,
  TIER_MAX_MULTIPLE_BPS,
  TIERS,
  TOTAL_TILES,
} from './assayMath'
import type { TierId } from './assayMath'

// Re-export the tier-id union so the render layer can wire to a single contract
// surface (provider) — the actual enum still lives in assayMath (Domain A).
export type { TierId }

/**
 * Human-readable VAULT-FLOOR names for each difficulty tier — the single source
 * the render layer (Glass Box certificate + rail) prints. Keyed by the INTERNAL
 * tier id, which never changes (fairness re-derivation + seed domain-separation
 * key off the id, not the label). Aztec chamber rename (cohesion T1, 2026-07-04):
 * the depth tiers DISPLAY as the theme bible's chamber names — the internal ids
 * (`lean`/`standard`/`flooded`) and all math are untouched; only the labels moved
 * (the `flooded` id still DISPLAYS its deepest chamber, now "Flooded Crypt").
 *
 * The certificate must read the tier from the SETTLED outcome (`outcome.tier` /
 * the frozen `outcome.tierLabel`), never from the live `state.selectedTier`, so a
 * post-settle rail tap can't rewrite the just-issued receipt (fairness HIGH #8).
 */
export const TIER_DISPLAY_LABEL: Readonly<Record<TierId, string>> = {
  lean: 'REEF SHELF',
  standard: 'MIDNIGHT ZONE',
  flooded: 'HADAL TRENCH',
}

// ─── Phase model ────────────────────────────────────────────────────────────

export type AssayPhase =
  | { kind: 'lobby' }
  /** Planning: the ore-board is interactive, the player paints the claim-line.
   *  This is the bet-entry phase — nothing is committed yet. */
  | { kind: 'planning' }
  /** The current-key is plunged; the current runs the committed trail. */
  | { kind: 'assaying' }
  /** Terminal sub-state: the current hit a bad vein. Carries only the vein tile
   *  and (via state) the safe nubs already collected. No look-ahead field. */
  | { kind: 'bad-vein'; veinTileIdx: number }
  | { kind: 'settling' }
  | { kind: 'settled'; outcome: AssayOutcome }

export interface AssayOutcome {
  won: boolean
  wagerLamports: bigint
  /** Payout in USDC lamports (0 on a bust). wager × T(L) on a proven claim. */
  payoutLamports: bigint
  /** Final ladder multiplier reached, in bps (T(L) on a win, the value at the
   *  bust point on a loss — informational only, pays 0). */
  finalMultiplierBps: bigint
  /** The committed claim-line, in reveal order (factual trace). */
  committedTrail: number[]
  /** Safe nubs actually revealed, in reveal order. */
  revealedSafe: number[]
  /** Tile index of the bad vein that busted the run; null on a proven claim. */
  veinTileIdx: number | null
  gridDim: number
  /** Difficulty tier this round was armed at (drives bombCount + which GOLDEN
   *  ladder settled). Part of the provably-fair re-derivation input alongside
   *  the seed — the bad-vein layout is domain-separated per tier. */
  tier: TierId
  /** The VAULT-FLOOR display name of the tier that PRODUCED this receipt, frozen
   *  at settle time from `committedTier`. Baked into the immutable outcome so the
   *  Glass Box certificate reads a locked string — a post-settle rail tap re-arms
   *  `selectedTier` but can never rewrite this label (fairness HIGH #8). Equals
   *  `TIER_DISPLAY_LABEL[tier]`. */
  tierLabel: string
  bombCount: number
  /** Full bad-vein bitmap — exposed ONLY here, for the Glass Box certificate's
   *  provably-fair re-derivation. Rendered as a COUNT, never a tile-by-tile
   *  counterfactual overlay (RG-C3). */
  bombBitmap: boolean[]
  serverSeedHex: string
  serverSeedHashHex: string
  roundIdHex: string
}

export interface AssayHistoryRow {
  finalMultiplierBps: bigint
  won: boolean
  payoutLamports: bigint
  wagerLamports: bigint
  trailLength: number
  /** Safe ore-nubs actually revealed (claimed) on this line — equals trailLength
   *  on a proven claim, fewer on a bust (the nubs collected before the bad vein).
   *  Feeds the descriptive SESSION-coverage stat (cumulative tiles claimed).
   *  Descriptive only — never a goal/pressure counter (RG-C5). */
  revealedSafeCount: number
}

export interface AssayState {
  phase: AssayPhase
  balanceLamports: bigint
  wagerLamports: bigint
  /** The difficulty tier the player has ARMED. Drives the next plunged round's
   *  bombCount + GOLDEN ladder + max-multiple. Changeable only while NOT mid-
   *  flight; a round already running keeps `committedTier`. Default 'standard'. */
  selectedTier: TierId
  /** The tier LOCKED at plunge time. The cascade, tally and settlement all read
   *  THIS (never `selectedTier`), so a mid-round tier change can't rewrite the
   *  live round. Equals `selectedTier` at the moment the current-key is plunged. */
  committedTier: TierId
  /** The pending claim-line the player is painting (planning phase). Ordered. */
  trail: number[]
  /** The claim-line locked at plunge time (reveal order). */
  committedTrail: number[]
  /** Safe nubs revealed so far during the cascade (reveal order). */
  revealedSafe: number[]
  /** Running tally multiplier in bps = T(revealedSafe.length). Sums to T(L). */
  tallyBps: bigint
  /** The gold-weight the most-recent nub flew into the tally, in bps (coin-fly
   *  animation value). Economic value only — never a streak count (RG-C5). */
  lastDeltaBps: bigint
  /** Reveal pacing. 'staggered' (bead-to-bead cascade) or 'instant' (one frame). */
  revealPace: 'staggered' | 'instant'
  /** "assay again · same claim-line" preset. Persists across rounds. */
  lastTrail: number[]
  history: AssayHistoryRow[]
}

interface RoundSecrets {
  serverSeed: Uint8Array
  serverSeedHash: Uint8Array
  roundId: bigint
  bombBitmap: boolean[]
}

const INITIAL_BALANCE = 1_000_000_000n // 1000 USDC
const DEFAULT_WAGER = 1_000_000n // 1 USDC
const MIN_WAGER = 100_000n // 0.10 USDC
export const MAX_HISTORY = 20

/** Bead-to-bead cascade pace (game-designer note: 90ms/tile). Module const
 *  (RG-C5) — identical every round, never derived from streak/session. */
const CASCADE_INTERVAL_MS = 90
/** Bad-vein read-hold before the settlement overlay (must exceed the snap FX). */
const BAD_VEIN_HOLD_MS = 720

function makeInitialState(): AssayState {
  return {
    phase: { kind: 'lobby' },
    balanceLamports: INITIAL_BALANCE,
    wagerLamports: DEFAULT_WAGER,
    selectedTier: DEFAULT_TIER,
    committedTier: DEFAULT_TIER,
    trail: [],
    committedTrail: [],
    revealedSafe: [],
    tallyBps: 0n,
    lastDeltaBps: 0n,
    revealPace: 'staggered',
    lastTrail: [],
    history: [],
  }
}

// ─── Fisher-Yates bad-vein derivation (mirror of vault's, sha256-seeded) ────

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

/**
 * Deterministically derive the bad-vein bitmap from the committed seed via
 * Fisher-Yates — same algorithm the Glass Box certificate re-runs to verify.
 * `bombCount` bad veins are placed among `totalTiles`.
 *
 * The chosen difficulty tier is FOLDED into the hash domain-separation tag
 * (`ASSAYVEIN:<tierId>`), so (seed, tier) → board is a clean deterministic
 * derivation: the same seed on two different tiers yields independent layouts
 * (not nested subsets), while (same seed, same tier) always reproduces the
 * exact board — the seed+tier reproducibility fairness requirement.
 */
export async function deriveBombBitmap(
  serverSeed: Uint8Array,
  totalTiles: number,
  bombCount: number,
  tierId: TierId,
): Promise<boolean[]> {
  const tag = new TextEncoder().encode(`ASSAYVEIN:${tierId}`)
  const bitmap = new Array<boolean>(totalTiles).fill(false)
  const positions = new Array<number>(totalTiles)
  for (let i = 0; i < totalTiles; i++) positions[i] = i
  for (let step = 0; step < totalTiles; step++) {
    const hash = await sha256([serverSeed, tag, u64Le(BigInt(step))])
    let raw = 0n
    for (let i = 0; i < 8; i++) raw |= BigInt(hash[i]!) << BigInt(8 * i)
    const remaining = BigInt(totalTiles - step)
    const swap = step + Number(raw % remaining)
    const tmp = positions[step]!
    positions[step] = positions[swap]!
    positions[swap] = tmp
  }
  for (let i = 0; i < bombCount; i++) bitmap[positions[i]!] = true
  return bitmap
}

async function generateRoundSecrets(roundId: bigint, tierId: TierId): Promise<RoundSecrets> {
  const serverSeed = crypto.getRandomValues(new Uint8Array(32))
  const serverSeedHash = await sha256([serverSeed])
  // Seed the board with the ARMED tier's bad-vein count, tier-domain-separated.
  const bombBitmap = await deriveBombBitmap(serverSeed, TOTAL_TILES, TIERS[tierId].bombCount, tierId)
  return { serverSeed, serverSeedHash, roundId, bombBitmap }
}

// ─── Controller ─────────────────────────────────────────────────────────────

export interface AssayController {
  state: AssayState
  /** Number of playable safe tiles the current claim-line needs to reach GO. */
  readonly canPlunge: boolean
  /** The armed tier's max multiple T(MAX_TRAIL) in bps — the "up to Nx" the UI
   *  shows for the current selection (`state.selectedTier`). */
  readonly selectedTierMaxMultipleBps: bigint
  /** Arm a difficulty tier. Takes effect on the NEXT plunged round only; a round
   *  already in flight keeps its committed tier. No-op while assaying/settling. */
  setSelectedTier: (id: TierId) => void
  openPlanning: () => void
  closePlanning: () => void
  setWager: (lamports: bigint) => void
  /** Toggle a tile in the claim-line (tap). No-op once beyond MAX_TRAIL. */
  toggleTrailTile: (tileIdx: number) => void
  /** Append a tile if absent (drag-paint — add-only). */
  addTrailTile: (tileIdx: number) => void
  clearTrail: () => void
  toggleRevealPace: () => void
  /** "assay again · same claim-line" — repaint the last committed trail. */
  reuseLastTrail: () => void
  /** Plunge the brass current-key: commit the claim-line and run the cascade. */
  plungeKey: () => Promise<void>
  acknowledgeSettlement: () => void
  /** "same line" — from the settled screen, re-arm the SAME committed claim-line
   *  (settled → planning with `trail = lastTrail`) so the player can replay the
   *  exact route in one tap. */
  reDiveSameLine: () => void
  closeSession: () => void
}

/**
 * Pure reducer for arming a difficulty tier — extracted from `setSelectedTier`
 * so the settled-tier-LOCK is unit-provable (see assayProvider.test.ts).
 *
 * Invariants:
 *  - Mid-flight (`assaying` | `bad-vein` | `settling`) it is a NO-OP: a running
 *    round keeps its `committedTier`, so the board + ladder can't shift under the
 *    player.
 *  - In lobby / planning / SETTLED it updates `selectedTier` ONLY (drives the
 *    NEXT plunge). It NEVER touches `committedTier` and NEVER touches
 *    `phase.outcome`, so tapping the VAULT FLOOR rail on the settled screen
 *    re-arms the next round without rewriting the just-issued Glass Box receipt
 *    (fairness HIGH #8 — settled receipt is locked to the tier that produced it).
 */
export function armTierReducer(s: AssayState, id: TierId): AssayState {
  if (s.phase.kind === 'assaying' || s.phase.kind === 'bad-vein' || s.phase.kind === 'settling') {
    return s
  }
  return s.selectedTier === id ? s : { ...s, selectedTier: id }
}

export function useAssayController(): AssayController {
  const [state, setState] = useState<AssayState>(makeInitialState)
  const secretsRef = useRef<RoundSecrets | null>(null)
  const roundIdRef = useRef<bigint>(1n)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const openPlanning = useCallback(() => {
    setState((s) => (s.phase.kind === 'lobby' ? { ...s, phase: { kind: 'planning' } } : s))
  }, [])

  const closePlanning = useCallback(() => {
    setState((s) => (s.phase.kind === 'planning' ? { ...s, phase: { kind: 'lobby' }, trail: [] } : s))
  }, [])

  const setSelectedTier = useCallback((id: TierId) => {
    setState((s) => armTierReducer(s, id))
  }, [])

  const setWager = useCallback((lamports: bigint) => {
    setState((s) => {
      if (lamports < MIN_WAGER) return { ...s, wagerLamports: MIN_WAGER }
      if (lamports > s.balanceLamports) return { ...s, wagerLamports: s.balanceLamports }
      return { ...s, wagerLamports: lamports }
    })
  }, [])

  const toggleTrailTile = useCallback((tileIdx: number) => {
    setState((s) => {
      if (s.phase.kind !== 'planning') return s
      if (tileIdx < 0 || tileIdx >= TOTAL_TILES) return s
      const at = s.trail.indexOf(tileIdx)
      if (at >= 0) return { ...s, trail: s.trail.filter((t) => t !== tileIdx) }
      if (s.trail.length >= MAX_TRAIL) return s // exposure cap
      return { ...s, trail: [...s.trail, tileIdx] }
    })
  }, [])

  const addTrailTile = useCallback((tileIdx: number) => {
    setState((s) => {
      if (s.phase.kind !== 'planning') return s
      if (tileIdx < 0 || tileIdx >= TOTAL_TILES) return s
      if (s.trail.includes(tileIdx) || s.trail.length >= MAX_TRAIL) return s
      return { ...s, trail: [...s.trail, tileIdx] }
    })
  }, [])

  const clearTrail = useCallback(() => {
    setState((s) => (s.phase.kind === 'planning' ? { ...s, trail: [] } : s))
  }, [])

  const toggleRevealPace = useCallback(() => {
    setState((s) =>
      s.phase.kind === 'planning' || s.phase.kind === 'lobby'
        ? { ...s, revealPace: s.revealPace === 'staggered' ? 'instant' : 'staggered' }
        : s,
    )
  }, [])

  const reuseLastTrail = useCallback(() => {
    setState((s) =>
      s.phase.kind === 'planning' && s.lastTrail.length >= MIN_TRAIL
        ? { ...s, trail: [...s.lastTrail] }
        : s,
    )
  }, [])

  // Settlement — single source for both bust and proven-claim.
  const settle = useCallback((won: boolean, veinTileIdx: number | null) => {
    const secrets = secretsRef.current
    if (!secrets) return
    const s = stateRef.current
    const tier = TIERS[s.committedTier]
    const safe = tier.safeTiles
    const L = s.revealedSafe.length
    const finalBps = won ? coinLadderBps(s.committedTrail.length, safe) : coinLadderBps(L, safe)
    const payoutLamports = won
      ? settlePayout(s.wagerLamports, coinLadderBps(s.committedTrail.length, safe))
      : 0n
    const outcome: AssayOutcome = {
      won,
      wagerLamports: s.wagerLamports,
      payoutLamports,
      finalMultiplierBps: finalBps,
      committedTrail: [...s.committedTrail],
      revealedSafe: [...s.revealedSafe],
      veinTileIdx,
      gridDim: GRID_DIM,
      // Tier + its display label are frozen from committedTier (the tier that
      // PRODUCED this receipt). Neither reads selectedTier, so re-arming the rail
      // on the settled screen can't desync the certificate (fairness HIGH #8).
      tier: s.committedTier,
      tierLabel: TIER_DISPLAY_LABEL[s.committedTier],
      bombCount: tier.bombCount,
      bombBitmap: [...secrets.bombBitmap],
      serverSeedHex: toHex(secrets.serverSeed),
      serverSeedHashHex: toHex(secrets.serverSeedHash),
      roundIdHex: toHex(u64Le(secrets.roundId)),
    }
    if (won) playClaim()
    else playBadVein()
    setState((cur) => ({
      ...cur,
      phase: { kind: 'settled', outcome },
      balanceLamports: cur.balanceLamports + payoutLamports,
      history: [
        {
          finalMultiplierBps: finalBps,
          won,
          payoutLamports,
          wagerLamports: cur.wagerLamports,
          trailLength: cur.committedTrail.length,
          // Nubs claimed this line = safe reveals (L). On a win L == trailLength;
          // on a bust it's the nubs collected before the bad vein.
          revealedSafeCount: L,
        },
        ...cur.history,
      ].slice(0, MAX_HISTORY),
    }))
  }, [])

  // Plunge the current-key: validate, commit the seed, deduct wager, run cascade.
  const plungeKey = useCallback(async () => {
    const s = stateRef.current
    if (s.phase.kind !== 'planning') return
    if (s.trail.length < MIN_TRAIL || s.trail.length > MAX_TRAIL) return
    if (s.wagerLamports > s.balanceLamports) return
    ensureAudio()
    const roundId = roundIdRef.current
    roundIdRef.current = roundId + 1n
    // Freeze the armed tier for the whole round: the board is seeded with it and
    // the cascade/settlement read `committedTier`, so a later selection change
    // can't affect this in-flight round.
    const armedTier = s.selectedTier
    const secrets = await generateRoundSecrets(roundId, armedTier)
    secretsRef.current = secrets
    const committed = [...s.trail]
    setState((cur) => ({
      ...cur,
      phase: { kind: 'assaying' },
      balanceLamports: cur.balanceLamports - cur.wagerLamports,
      committedTier: armedTier,
      committedTrail: committed,
      lastTrail: committed,
      trail: [],
      revealedSafe: [],
      tallyBps: 0n,
      lastDeltaBps: 0n,
    }))
  }, [])

  const acknowledgeSettlement = useCallback(() => {
    setState((cur) =>
      cur.phase.kind === 'settled'
        ? {
            ...cur,
            phase: { kind: 'planning' },
            committedTrail: [],
            revealedSafe: [],
            tallyBps: 0n,
            lastDeltaBps: 0n,
          }
        : cur,
    )
    secretsRef.current = null
  }, [])

  const reDiveSameLine = useCallback(() => {
    setState((cur) =>
      cur.phase.kind === 'settled' && cur.lastTrail.length >= MIN_TRAIL
        ? {
            ...cur,
            phase: { kind: 'planning' },
            committedTrail: [],
            revealedSafe: [],
            tallyBps: 0n,
            lastDeltaBps: 0n,
            // Re-arm the exact route just run (all-or-nothing replay of the same line).
            trail: [...cur.lastTrail],
          }
        : cur,
    )
    secretsRef.current = null
  }, [])

  const closeSession = useCallback(() => {
    secretsRef.current = null
    setState(makeInitialState())
  }, [])

  // ── Cascade driver ────────────────────────────────────────────────────────
  // While `assaying`, reveal committed-trail tiles in order. STAGGERED reveals
  // one bead per CASCADE_INTERVAL_MS; INSTANT commits the whole trail in one
  // batch (single setState) on entry. A bad vein halts the cascade at that tile
  // (RG-C3: later tiles are simply never processed — no look-ahead leak).
  useEffect(() => {
    if (state.phase.kind !== 'assaying') return
    const secrets = secretsRef.current
    if (!secrets) return

    // Helper: process the k-th (0-based revealed index) committed tile. Returns
    // 'vein' | 'safe' | 'done'. Reads/writes via functional setState.
    const revealOne = (): 'vein' | 'safe' | 'done' => {
      const s = stateRef.current
      if (s.phase.kind !== 'assaying') return 'done'
      const idx = s.revealedSafe.length // next reveal position within trail
      if (idx >= s.committedTrail.length) return 'done'
      const tile = s.committedTrail[idx]!
      if (secrets.bombBitmap[tile] ?? false) {
        setState((cur) =>
          cur.phase.kind === 'assaying'
            ? { ...cur, phase: { kind: 'bad-vein', veinTileIdx: tile } }
            : cur,
        )
        return 'vein'
      }
      const safe = TIERS[s.committedTier].safeTiles
      const k = idx + 1 // 1-based nub index
      const nextTallyBps = coinLadderBps(k, safe)
      // Flying coin value: nub 1 establishes the base (T(1)); later nubs carry
      // their delta T(k)-T(k-1). Sum over the trail == T(L). Economic value only.
      const flyBps = k === 1 ? coinLadderBps(1, safe) : coinDeltaBps(k, safe)
      playBead(flyBps)
      setState((cur) =>
        cur.phase.kind === 'assaying'
          ? {
              ...cur,
              revealedSafe: [...cur.revealedSafe, tile],
              tallyBps: nextTallyBps,
              lastDeltaBps: flyBps,
            }
          : cur,
      )
      return 'safe'
    }

    if (state.revealPace === 'instant') {
      // One-shot: walk the whole trail synchronously, stop at first vein.
      const s = stateRef.current
      const safe = TIERS[s.committedTier].safeTiles
      const safeTiles: number[] = []
      let vein: number | null = null
      for (const tile of s.committedTrail) {
        if (secrets.bombBitmap[tile] ?? false) {
          vein = tile
          break
        }
        safeTiles.push(tile)
      }
      const k = safeTiles.length
      const flyBps = k === 0 ? 0n : k === 1 ? coinLadderBps(1, safe) : coinDeltaBps(k, safe)
      if (k > 0) playBead(flyBps)
      setState((cur) =>
        cur.phase.kind === 'assaying'
          ? {
              ...cur,
              revealedSafe: safeTiles,
              tallyBps: k > 0 ? coinLadderBps(k, safe) : 0n,
              lastDeltaBps: flyBps,
              ...(vein !== null ? { phase: { kind: 'bad-vein', veinTileIdx: vein } as AssayPhase } : {}),
            }
          : cur,
      )
      if (vein !== null) {
        const hit = vein
        setTimeout(() => settle(false, hit), BAD_VEIN_HOLD_MS)
      } else {
        setTimeout(() => settle(true, null), 260)
      }
      return
    }

    // STAGGERED cascade.
    const id = setInterval(() => {
      const r = revealOne()
      if (r === 'vein') {
        clearInterval(id)
        const veinTile = (stateRef.current.phase.kind === 'bad-vein'
          ? stateRef.current.phase.veinTileIdx
          : null)
        setTimeout(() => settle(false, veinTile), BAD_VEIN_HOLD_MS)
      } else if (r === 'done') {
        clearInterval(id)
        setTimeout(() => settle(true, null), 260)
      }
    }, CASCADE_INTERVAL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase.kind, settle])

  const trailLen = state.trail.length
  const canPlunge =
    state.phase.kind === 'planning' &&
    trailLen >= MIN_TRAIL &&
    trailLen <= MAX_TRAIL &&
    state.wagerLamports <= state.balanceLamports
  const selectedTierMaxMultipleBps = TIER_MAX_MULTIPLE_BPS[state.selectedTier]

  return useMemo<AssayController>(
    () => ({
      state,
      canPlunge,
      selectedTierMaxMultipleBps,
      setSelectedTier,
      openPlanning,
      closePlanning,
      setWager,
      toggleTrailTile,
      addTrailTile,
      clearTrail,
      toggleRevealPace,
      reuseLastTrail,
      plungeKey,
      acknowledgeSettlement,
      reDiveSameLine,
      closeSession,
    }),
    [
      state,
      canPlunge,
      selectedTierMaxMultipleBps,
      setSelectedTier,
      openPlanning,
      closePlanning,
      setWager,
      toggleTrailTile,
      addTrailTile,
      clearTrail,
      toggleRevealPace,
      reuseLastTrail,
      plungeKey,
      acknowledgeSettlement,
      reDiveSameLine,
      closeSession,
    ],
  )
}

/** Live cash preview: wager × current tally, floored. Pure Domain-A read. */
export function tallyLamports(wagerLamports: bigint, tallyBps: bigint): bigint {
  if (tallyBps <= 0n) return 0n
  return (wagerLamports * tallyBps) / ONE_X_BPS
}

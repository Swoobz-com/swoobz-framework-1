'use client'

/**
 * OO-Fisher provider — deterministic, mockable game-state machine for the
 * player UI. V1 frontend-only: per-cast RNG is commit-reveal locally; the
 * meta state (currency + upgrades) is LocalStorage-backed so the GRINDING
 * loop is visible across sessions.
 *
 * Three nested loops, all driven by this controller:
 *   1. Per-cast loop: lobby → bet-entry → casting → line-out → fish-on →
 *      reeling → caught (or escaped) → next-cast-or-settle
 *   2. Per-trip loop: place wager → N casts → settle → claim → upgrade-or-restart
 *   3. Meta loop: catches yield currency → currency buys upgrades →
 *      upgrades unlock new depth tiers + rod / bait benefits
 *
 * Domain B (controller) consuming Domain A (math). All financial math lives
 * in `ooFisherMath.ts`. The provider holds the state machine + the seeded
 * RNG bridge.
 *
 * RG-C5 STRUCTURAL: the provider never passes a streak / session length
 * value into audio/visual signature functions. Every audio function in
 * `ooFisherAudio.ts` takes zero state-dependent parameters by signature.
 *
 * RG-C8 STRUCTURAL: cash-out is always available between casts. The phase
 * machine permits the `cashOut` transition from `between-casts` AND from
 * `casting` (idle, before the cast launches) — the action bar surface
 * keeps the cash-out button mounted in those phases.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  ensureAudio,
  playCastLaunch,
  playCatchFanfare,
  playFishBite,
  playLineSnap,
  playReelTap,
  playTripEndFanfare,
  playUpgradePurchase,
} from './ooFisherAudio'
import {
  applyBaitWeights,
  castPowerToDepth,
  castsPerTrip,
  currencyForCatch,
  DEPTH_RARITY_WEIGHTS,
  type DepthTier,
  effectiveTargetZone,
  evaluateCastOutcome,
  type FishRarity,
  formatMetaCurrency,
  formatMetaLoadout,
  type GearLoadout,
  type GearTier,
  JUNK_CATCH_BPS,
  nextTier,
  ONE_X_BPS,
  parseMetaCurrency,
  parseMetaLoadout,
  payoutForCatch,
  type ReelingParams,
  reelingParamsForRod,
  STARTING_LOADOUT,
  STORAGE_KEY_CURRENCY,
  STORAGE_KEY_UPGRADES,
  tripMultiplierFromEntries,
  tripPayoutLamports,
  type UpgradeTree,
  upgradeCost,
} from './ooFisherMath'

// ─── Phase model ───────────────────────────────────────────────────────────

/**
 * The phase machine. Each kind drives a distinct render surface.
 *
 *   lobby      → start screen ("CAST OFF")
 *   bet-entry  → wager + gear summary, COMMIT to start trip
 *   trip-active → trip in progress; nested per-cast sub-states below
 *   trip-settled → trip ended (cash-out OR exhausted casts); claim view
 *   upgrade-modal → upgrade tree shown over the lobby
 *
 * Per-cast sub-states (only valid inside trip-active):
 *   casting     → idle, awaiting cast power; player holds cast button
 *   line-out    → lure descending, no fish yet
 *   fish-on     → bobber dipped, fish has bitten, reeling minigame begins
 *   reeling     → active reeling minigame
 *   caught      → fish caught, brief celebration before next cast
 *   missed      → fish escaped (line snap or fish-on timeout); brief beat
 *   between-casts → between casts in the trip; cash-out is available
 */
export type OoFisherPhase =
  | { kind: 'lobby' }
  | { kind: 'bet-entry' }
  | { kind: 'trip-active'; sub: TripActiveSub }
  | { kind: 'trip-settled'; outcome: TripOutcome }
  | { kind: 'upgrade-modal' }

export type TripActiveSub =
  | { kind: 'casting' }
  | { kind: 'line-out' }
  | { kind: 'fish-on' }
  | { kind: 'reeling' }
  | { kind: 'caught'; rarity: FishRarity }
  | { kind: 'junk-caught' }
  | { kind: 'missed' }
  | { kind: 'snap' }
  | { kind: 'between-casts' }

// ─── Outcome / catch types ─────────────────────────────────────────────────

/**
 * Per-cast result kind. Mirrors `CastOutcomeKind` from the math module but
 * also includes 'normal' as the catch-success path (which carries a
 * resolved rarity). Used by the trip receipt + Glass Box re-derive.
 */
export type CastResultKind = 'normal' | 'junk' | 'snap' | 'miss'

export interface CatchEntry {
  readonly castIndex: number
  readonly depth: DepthTier
  /**
   * For 'normal' results, the picked rarity tier. For junk/snap/miss the
   * rarity is conceptually N/A but we still record one for legacy display
   * paths (e.g. catch celebration). The settlement uses `result` +
   * `effectiveBps` for actual payout math.
   */
  readonly rarity: FishRarity
  /** Bait tier active at the moment of catch (captured for the receipt). */
  readonly bait: GearTier
  /** Currency earned for this catch (USDC lamports). 0 for non-normal outcomes. */
  readonly currencyLamports: bigint
  /** Cast seed (8 hex chars) for the Glass Box verify path. */
  readonly castSeedHex: string
  /**
   * Result kind (Layer 1 loss mechanics, Tim 2026-05-24). NORMAL is a
   * successful rarity catch; JUNK is a boot/minnow at ×0.3; SNAP is the
   * line breaking at ×0.0; MISS is the swing-and-miss at ×0.0.
   * Misses do NOT create an entry — they're tracked via `castsAttempted`
   * minus `tripCatches.length`. Junk/snap DO create entries so the trip
   * receipt has a row for each cast that resolved.
   */
  readonly result: Exclude<CastResultKind, 'miss'>
  /**
   * Effective BPS contribution from this cast (post-bait, pre-cap). Used
   * by the settlement summation. Equals 0n for snap, 3_000n for junk,
   * `payoutForCatch(rarity, bait)` for normal — modulated by the perfect-
   * hit bonus (Tim 2026-05-26 image 142) if the player landed dead-center.
   */
  readonly effectiveBps: bigint
  /**
   * Perfect-hit bonus applied to this catch, in BPS over 10_000.
   *   10_000n = no bonus (1.00×)
   *   10_500n = edge of perfect band  (1.05×)
   *   11_500n = exact zone center     (1.15×)
   * Always 10_000n for non-normal outcomes (snap / junk).
   * Tim 2026-05-26: "1.05-1.15x depending on how centered you are, just a
   * little bit to get that euphoria". RG-C5 SAFE: the ramp is a fixed
   * module-const formula on (finalTension, zone.center); no streak /
   * session / multiplier value modulates it.
   */
  readonly perfectBonusBps: bigint
}

export interface TripOutcome {
  readonly wagerLamports: bigint
  readonly castsAttempted: number
  readonly castsLanded: number
  readonly catches: ReadonlyArray<CatchEntry>
  readonly tripMultiplierBps: bigint
  readonly payoutLamports: bigint
  /** Net delta (payout - wager). Negative on losses. */
  readonly netLamports: bigint
  readonly serverSeedHex: string
  readonly serverSeedHashHex: string
  readonly tripIdHex: string
  readonly mixerHex: string
  readonly loadout: GearLoadout
}

export interface TripHistoryRow {
  readonly tripMultiplierBps: bigint
  readonly wagerLamports: bigint
  readonly netLamports: bigint
  readonly castsLanded: number
}

// ─── State shape ───────────────────────────────────────────────────────────

export interface OoFisherState {
  readonly phase: OoFisherPhase
  /** Wager balance (USDC lamports) — the player's spendable balance. */
  readonly balanceLamports: bigint
  /** Per-trip wager (USDC lamports). */
  readonly wagerLamports: bigint
  /** Meta currency (USDC lamports) — earned in-game, spent on upgrades.
   *  Persisted to LocalStorage. */
  readonly metaCurrencyLamports: bigint
  /** Current gear loadout. Persisted to LocalStorage. */
  readonly loadout: GearLoadout
  /** Current trip's catches (during trip-active). */
  readonly tripCatches: ReadonlyArray<CatchEntry>
  /** Current cast index within the trip (0-based; reaches castsPerTrip(rod)). */
  readonly currentCastIndex: number
  /** Max casts this trip (set when trip starts based on rod tier). */
  readonly maxCasts: number
  /** Current cast power (0-100, integer). 0 unless `casting`. */
  readonly castPower: number
  /** Current cast depth tier (1-5), set when cast launches. */
  readonly currentDepth: DepthTier | null
  /** Current reeling tension (0-100), updated by tap + drift. */
  readonly reelTension: number
  /** Current reeling params (set at fish-on based on rod tier). */
  readonly reelParams: ReelingParams | null
  /** Reeling start ms (performance.now() epoch) — null outside reeling. */
  readonly reelStartedMs: number | null
  /**
   * Fish-on display start ms (performance.now() epoch) — null outside the
   * `fish-on` sub-phase. Drives the visible countdown in the action bar
   * AND the useEffect that auto-transitions FISH-ON → reeling. Lifting
   * this into render-observable state is what fixes the soft-lock bug
   * (Tim playthrough 2026-05-23): the previous implementation relied on a
   * setTimeout nested inside another setTimeout, which dead-wired in
   * production-build StrictMode timing windows. Effect-driven transitions
   * keyed on phase.sub.kind survive React 19 concurrent rendering.
   */
  readonly fishOnStartedMs: number | null
  /**
   * Line-out start ms (performance.now() epoch) — null outside the
   * `line-out` sub-phase. Stamped at launchCast(). Drives the useEffect
   * that auto-transitions LINE-OUT → fish-on after `biteDelayMs`. THIRD
   * OCCURRENCE wiring fix (Tim QA 2026-05-25): the previous implementation
   * scheduled the bite-delay transition via a raw setTimeout inside
   * launchCast(). When microtask + commit batching delayed React from
   * running the line-out commit, the setTimeout would fire its guarded
   * callback while stateRef.current still showed `casting`, the guard
   * would early-return, and the entire cast pipeline would wedge on
   * line-out forever. Effect-keyed transitions (same pattern that fixed
   * occurrences #1 and #2) survive React 19 concurrent rendering because
   * the effect runs only AFTER React commits the line-out state.
   */
  readonly lineOutStartedMs: number | null
  /**
   * Per-cast bite delay in ms — null outside the `line-out` sub-phase.
   * Computed deterministically from the cast seed at launch time (600 +
   * (castSeed % 1200)) so the Glass Box re-derive can reproduce it. The
   * line-out → fish-on effect uses this as its setTimeout window.
   */
  readonly biteDelayMs: number | null
  /**
   * Miss-display start ms (performance.now() epoch) — null outside the
   * `missed` and `snap` sub-phases. Stamped at the moment the miss/snap
   * is recorded. Drives the useEffect that auto-advances the player from
   * `missed`/`snap` to `between-casts` (or `trip-settled`) after the
   * configured message window. Replaces the nested setTimeout chain in
   * the MISS / SNAP paths that suffered the same wedge as the bite-delay
   * timer (see comment on `lineOutStartedMs`).
   */
  readonly outcomeMessageStartedMs: number | null
  /**
   * Outcome-message window in ms — null outside `missed`, `snap`,
   * `junk-caught`, `caught` sub-phases. Stamped together with
   * `outcomeMessageStartedMs`. The advance effect reads this to choose
   * the right window per outcome (MISS / SNAP / JUNK / CATCH).
   */
  readonly outcomeMessageWindowMs: number | null
  /**
   * Settle-request timestamp (performance.now() epoch) — null unless a
   * trip-settle is queued for the next React commit. Stamped by:
   *   - `advanceAfterCast` when the trip exhausts its cast budget
   *     (replaces the previous `setTimeout(() => settleTrip(false), 0)`
   *     chain which could be cancelled by React 19 concurrent re-render
   *     between the setState commit and the timer fire — the FOURTH
   *     occurrence of the wiring-stall bug class). The settle effect
   *     keyed on `pendingSettleRequestedMs` reads the stamp and dispatches
   *     `settleTrip(false)` after React has committed the prior state.
   * Always reset to null in the same commit as `phase: trip-settled` so
   * the effect runs exactly once per settle.
   */
  readonly pendingSettleRequestedMs: number | null
  /**
   * Currently targeted hex tile on the 3D water grid (0-based linear index
   * into the hex grid). The 3D scene reads this to highlight the active
   * fishing spot in red, and the boat orients its rod toward it. Used only
   * by the OoFisher3DScene; the 2D fallback ignores it. Null when no tile
   * is targeted (lobby / bet-entry / after settle).
   */
  readonly targetTileIndex: number | null
  /** Trip-level history (most recent first, capped). */
  readonly history: ReadonlyArray<TripHistoryRow>
}

const INITIAL_BALANCE = 1_000_000_000n // 1000 USDC
const DEFAULT_WAGER = 1_000_000n // 1 USDC per trip
const MIN_WAGER = 100_000n // 0.10 USDC floor
const MAX_HISTORY = 20

/**
 * Fish-on display window in ms — the bobber-dip beat before the reeling
 * minigame starts. The auto-transition fires AT this exact ms, so the
 * countdown shown in the action bar is the real ground truth.
 *
 * Exported so the experience module can render a visible countdown
 * ("REELING IN 1.4s → 1.0s → 0.5s → !"). The bug a new player hits is
 * not knowing they need to do anything — the visible countdown is the
 * affordance that tells them the next surface is incoming.
 */
export const FISH_ON_WINDOW_MS = 1400 // 1.4s — long enough to read the prompt

/**
 * Tim 2026-05-24 OO-FISHER playtest L5 — slow outcome messages.
 *
 * Previously miss/snap/junk messages flashed at 600-900ms which was too
 * fast to read. Tim feedback: "When you dont catch a fish the message
 * goes super fast, you cannot read it."
 *
 * New windows:
 *   - MISS:        2200ms — "LINE CAME BACK EMPTY · no catch · cast burned"
 *   - SNAP:        2200ms — "LINE SNAPPED · fish fought back"
 *   - JUNK:        2500ms — longer because shows fish silhouette + tier label
 *   - NORMAL CATCH:1500ms — hero moment + auto-advance (Layer 6)
 *
 * All values are MODULE CONST per RG-C5 — no streak/rarity scaling.
 */
export const MISS_MESSAGE_DURATION_MS = 2200
export const SNAP_MESSAGE_DURATION_MS = 2200
export const JUNK_MESSAGE_DURATION_MS = 2500
export const CATCH_HERO_DURATION_MS = 1500

// Tim 2026-05-26 image 142 — PERFECT-HIT bonus. The reeling minigame's
// inner band (half-width PERFECT_BAND_HALF_WIDTH tension units around the
// zone center) is the "skill ceiling" surface. Landing the final tension
// inside this band scales the catch's effectiveBps by a 1.05× to 1.15×
// ramp — the closer to dead-center, the higher the bonus.
//   distance = abs(finalTension - zone.center)  in [0, PERFECT_BAND_HALF_WIDTH]
//   ratio    = (PERFECT_BAND_HALF_WIDTH - distance) / PERFECT_BAND_HALF_WIDTH
//   bonus    = PERFECT_BONUS_MIN_BPS + (ratio * (MAX - MIN))
// RG-C5 SAFE: the formula is module-const, deterministic from the player's
// final tension. No streak / session / multiplier value enters it. The
// catch's payoutForCatch(rarity, bait) base stays untouched — only the
// per-catch effectiveBps is scaled.
export const PERFECT_BAND_HALF_WIDTH = 5n
export const PERFECT_BONUS_MIN_BPS = 10_500n // 1.05× at edge of perfect band
export const PERFECT_BONUS_MAX_BPS = 11_500n // 1.15× at dead-center
const PERFECT_BONUS_BPS_SPREAD = PERFECT_BONUS_MAX_BPS - PERFECT_BONUS_MIN_BPS // 1_000n

/**
 * Compute the perfect-hit bonus in BPS for a given (finalTension,
 * zoneCenter) pair. Returns 10_000n (no bonus, 1.00×) when the tension is
 * outside the perfect band. Pure function — RG-C5 SAFE.
 */
export function computePerfectBonusBps(finalTension: number, zoneCenter: number): bigint {
  const distance = Math.abs(finalTension - zoneCenter)
  // Outside the perfect band → no bonus (multiplier identity).
  if (distance > Number(PERFECT_BAND_HALF_WIDTH)) return 10_000n
  // Round distance to an integer for deterministic bigint math (the
  // tension marker UI rounds to 0..100 integers anyway).
  const distanceN = BigInt(Math.min(Math.max(0, Math.round(distance)), Number(PERFECT_BAND_HALF_WIDTH)))
  const within = PERFECT_BAND_HALF_WIDTH - distanceN
  // Floor-division — house never rounds in the player's favor.
  return PERFECT_BONUS_MIN_BPS + (PERFECT_BONUS_BPS_SPREAD * within) / PERFECT_BAND_HALF_WIDTH
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0')
  }
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
    ;(out as Uint8Array)[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

/**
 * Derive a per-cast 32-bit seed deterministically from the trip's server
 * seed + cast index. Mirrors the Vault Fisher-Yates entropy chain — once
 * the on-chain wiring lands, the same function ports without change.
 */
async function deriveCastSeed(serverSeed: Uint8Array, castIndex: number): Promise<number> {
  const tag = new TextEncoder().encode('OOFISHCAST')
  const hash = await sha256([serverSeed, tag, u64Le(BigInt(castIndex))])
  let raw = 0
  for (let i = 0; i < 4; i++) {
    raw = (raw << 8) | (hash[i] ?? 0)
  }
  // Coerce to unsigned 32-bit positive integer.
  return raw >>> 0
}

interface TripSecrets {
  readonly serverSeed: Uint8Array
  readonly serverSeedHash: Uint8Array
  readonly mixer: Uint8Array
  readonly tripId: bigint
  readonly loadoutSnapshot: GearLoadout
}

/**
 * Per-cast resolved outcome, computed at `launchCast()` time and held
 * between launch and reel-resolution so the resolveCatch path knows
 * which payout to record. The outcome is decided AT LAUNCH (so the
 * Glass Box re-derive proves the player's tap-rhythm didn't influence
 * the actual rarity choice — the math is independent of input timing).
 * The reel minigame still gates whether the player LANDS the outcome:
 *  - NORMAL outcome + good reel  → recorded as 'normal' at picked rarity
 *  - NORMAL outcome + bad reel   → demoted to 'snap' (fish escaped)
 *  - JUNK outcome + good reel    → recorded as 'junk' (×0.30)
 *  - JUNK outcome + bad reel     → demoted to 'snap' (line broke)
 *  - SNAP outcome (deterministic)→ recorded as 'snap' immediately
 *  - MISS outcome (deterministic)→ recorded as 'miss' immediately,
 *    no bite, no reel, advances after a brief "empty" beat
 */
interface ResolvedCastOutcome {
  readonly kind: 'miss' | 'snap' | 'junk' | 'normal'
  readonly rarity: FishRarity | null
  readonly effectiveBps: bigint
  readonly castSeedHex: string
  readonly castPower: number
}

async function generateTripSecrets(tripId: bigint, loadout: GearLoadout): Promise<TripSecrets> {
  const serverSeed = crypto.getRandomValues(new Uint8Array(32))
  const serverSeedHash = await sha256([serverSeed])
  const mixer = await sha256([new TextEncoder().encode('swoobz-originals-oo-fisher-v1-mock')])
  return {
    serverSeed,
    serverSeedHash,
    mixer,
    tripId,
    loadoutSnapshot: loadout,
  }
}

// ─── LocalStorage round-trip ──────────────────────────────────────────────

function readPersistedCurrency(): bigint {
  if (typeof window === 'undefined') return 0n
  try {
    return parseMetaCurrency(window.localStorage.getItem(STORAGE_KEY_CURRENCY))
  } catch {
    return 0n
  }
}

function readPersistedLoadout(): GearLoadout {
  if (typeof window === 'undefined') return STARTING_LOADOUT
  try {
    return parseMetaLoadout(window.localStorage.getItem(STORAGE_KEY_UPGRADES))
  } catch {
    return STARTING_LOADOUT
  }
}

function writePersistedCurrency(lamports: bigint): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY_CURRENCY, formatMetaCurrency(lamports))
  } catch {
    // Silent — storage may be unavailable (private mode); the in-memory
    // state stays consistent for the session.
  }
}

function writePersistedLoadout(loadout: GearLoadout): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY_UPGRADES, formatMetaLoadout(loadout))
  } catch {
    // Silent — see writePersistedCurrency.
  }
}

// ─── Controller interface ─────────────────────────────────────────────────

export interface OoFisherController {
  readonly state: OoFisherState
  /** Enter bet-entry from lobby. */
  readonly openBetEntry: () => void
  /** Cancel bet-entry, return to lobby. */
  readonly closeBetEntry: () => void
  /** Update wager (slip-stable). */
  readonly setWager: (lamports: bigint) => void
  /** Place wager, start a new trip (resets cast index, catches). */
  readonly startTrip: () => Promise<void>
  /** Update the cast power while the player holds the cast button (0-100). */
  readonly setCastPower: (power: number) => void
  /** Launch the cast at the current power. Transitions casting → line-out. */
  readonly launchCast: () => Promise<void>
  /** Player tap during the reeling minigame — nudges tension. */
  readonly reelTap: () => void
  /**
   * Set the player's targeted hex tile on the 3D water grid. The 3D scene
   * calls this when the player clicks a hex. Pass `null` to clear the
   * target. No-op when not in `casting` sub-phase (you can only retarget
   * before launching a cast).
   */
  readonly setTargetTile: (index: number | null) => void
  /**
   * Tim 2026-05-24 OO-FISHER L3 — direct-manipulation cast.
   * Start charging cast power on a specific hex (pointerDown on the tile).
   * Selects the tile as target AND starts the power ramp internally. No-op
   * if not in `casting` sub-phase or already charging. Idempotent: calling
   * twice without a release returns the existing ramp.
   */
  readonly startHexCharge: (index: number) => void
  /**
   * Tim 2026-05-24 OO-FISHER L3 — release / launch the cast that was
   * started via startHexCharge. If power > min threshold, launches; else
   * cancels the charge and returns to idle. Always safe to call.
   */
  readonly releaseHexCharge: () => void
  /** Cash out the current trip (between casts). Transitions to trip-settled. */
  readonly cashOutTrip: () => void
  /** Acknowledge trip-settled, return to bet-entry with same wager. */
  readonly acknowledgeSettlement: () => void
  /** Open the upgrade modal (from lobby or bet-entry). */
  readonly openUpgradeModal: () => void
  /** Close the upgrade modal. */
  readonly closeUpgradeModal: () => void
  /** Purchase an upgrade on a given tree. Returns true if the purchase succeeded. */
  readonly purchaseUpgrade: (tree: UpgradeTree) => boolean
  /** Spend STASH (scales) on an EV-neutral cosmetic/perk. Returns true on success. */
  readonly spendScales: (amountLamports: bigint) => boolean
  /**
   * Glass Box re-derive: recompute the per-cast seed chain client-side
   * from the published server seed (hex) and the number of casts. The
   * Glass Box widget compares the returned hex array against the
   * outcome's `catches[i].castSeedHex` to prove the catches the player
   * saw were determined by the seed chain (not server-side post-hoc
   * fabrication). Same shape as oo-burst / oo-spike / oo-tile / oo-climb.
   */
  readonly reverifyCastSeeds: (
    serverSeedHex: string,
    castCount: number,
  ) => Promise<ReadonlyArray<string>>
}

// ─── Hook ─────────────────────────────────────────────────────────────────

const REELING_TICK_MS = 50 // 20Hz drift tick

/**
 * The single controller hook for OO-Fisher.
 *
 * Reads persisted meta state on first mount (LocalStorage). The state
 * machine is fully client-side for V1; the future on-chain swap replaces
 * the secrets ref + seeded RNG with a CPI call.
 */
export function useOoFisherController(): OoFisherController {
  const [state, setState] = useState<OoFisherState>(() => ({
    phase: { kind: 'lobby' },
    balanceLamports: INITIAL_BALANCE,
    wagerLamports: DEFAULT_WAGER,
    metaCurrencyLamports: 0n, // hydrated by effect
    loadout: STARTING_LOADOUT, // hydrated by effect
    tripCatches: [],
    currentCastIndex: 0,
    maxCasts: castsPerTrip(STARTING_LOADOUT.rod),
    castPower: 0,
    currentDepth: null,
    reelTension: 0,
    reelParams: null,
    reelStartedMs: null,
    fishOnStartedMs: null,
    lineOutStartedMs: null,
    biteDelayMs: null,
    outcomeMessageStartedMs: null,
    outcomeMessageWindowMs: null,
    pendingSettleRequestedMs: null,
    targetTileIndex: null,
    history: [],
  }))
  const secretsRef = useRef<TripSecrets | null>(null)
  const tripIdRef = useRef<bigint>(1n)
  // Holds the resolved outcome between `launchCast()` and the eventual
  // resolveCatch / snap / miss transition. Computed once at launch so
  // the Glass Box re-derive can prove the outcome was determined by
  // (server seed, cast index, power) — NOT by the player's tap rhythm.
  const currentCastOutcomeRef = useRef<ResolvedCastOutcome | null>(null)
  // Tim 2026-05-26 image 142 — perfect-hit bonus stashed at reel-completion
  // and read in resolveCatch. Default 10_000n = identity (no bonus, 1.00×).
  const perfectBonusBpsRef = useRef<bigint>(10_000n)
  // FOURTH-OCCURRENCE FIX (Tim QA 2026-05-25 oo-fisher auto-settle stall):
  // Latch that flips to true when EITHER `cashOutTrip` OR the trip-
  // exhaustion path in `advanceAfterCast` has committed to settling the
  // current trip. The pending-settle effect (keyed on
  // `pendingSettleRequestedMs`) reads this latch via `settleTrip` to
  // guarantee at-most-once settlement even if React 19 concurrent
  // rendering re-runs the effect between the stamp and the dispatch.
  // Reset to false on `acknowledgeSettlement` so the next trip can settle.
  const settleScheduledRef = useRef<boolean>(false)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Hydrate persisted meta state on first mount.
  useEffect(() => {
    const persistedCurrency = readPersistedCurrency()
    const persistedLoadout = readPersistedLoadout()
    setState((s) => ({
      ...s,
      metaCurrencyLamports: persistedCurrency,
      loadout: persistedLoadout,
      maxCasts: castsPerTrip(persistedLoadout.rod),
    }))
  }, [])

  // ─── Trip lifecycle ──────────────────────────────────────────────────────

  const openBetEntry = useCallback(() => {
    setState((s) =>
      s.phase.kind === 'lobby' || s.phase.kind === 'trip-settled'
        ? { ...s, phase: { kind: 'bet-entry' } }
        : s,
    )
  }, [])

  const closeBetEntry = useCallback(() => {
    setState((s) => (s.phase.kind === 'bet-entry' ? { ...s, phase: { kind: 'lobby' } } : s))
  }, [])

  const setWager = useCallback((lamports: bigint) => {
    setState((s) => {
      if (lamports < MIN_WAGER) return { ...s, wagerLamports: MIN_WAGER }
      if (lamports > s.balanceLamports) {
        return { ...s, wagerLamports: s.balanceLamports }
      }
      return { ...s, wagerLamports: lamports }
    })
  }, [])

  const settleTrip = useCallback((cashOutEarly: boolean) => {
    const s = stateRef.current
    const secrets = secretsRef.current
    if (!secrets) return
    if (s.phase.kind !== 'trip-active') return
    // FOURTH-OCCURRENCE FIX: at-most-once latch. The pending-settle
    // effect and the synchronous `cashOutTrip` path both call us; the
    // latch guarantees that even if React 19 concurrent rendering re-
    // dispatches the effect (or the player double-taps cash-out before
    // React commits the prior phase change), we still only ever record
    // one settlement, one history row, one balance credit. Reset to
    // false in `acknowledgeSettlement` when the next trip can start.
    if (settleScheduledRef.current) return
    settleScheduledRef.current = true
    const castsAttempted = cashOutEarly ? s.currentCastIndex : s.maxCasts
    // The multiplier ALWAYS spreads the haul over the full trip's casts
    // (`maxCasts`), never casts-so-far, so it can only RISE as you fish — a
    // weak/early cash-out can never inflate it, and casting again never lowers
    // it (jesse "building haul" fix 2026-06-30). This also matches the published
    // Monte-Carlo (which divides by maxCasts) and removes the old hidden
    // early-cash-out edge — house-favored, RTP-safe.
    //
    // MISS outcomes contribute 0 to the numerator; SNAP 0n; JUNK JUNK_CATCH_BPS;
    // NORMAL the bait-scaled BPS recorded at resolve time. Caps at 10×.
    const tripBps = tripMultiplierFromEntries(
      s.tripCatches.map((c) => ({ effectiveBps: c.effectiveBps })),
      Math.max(1, s.maxCasts),
    )
    const payoutLamports = tripPayoutLamports(s.wagerLamports, tripBps)
    const netLamports = payoutLamports - s.wagerLamports
    const outcome: TripOutcome = {
      wagerLamports: s.wagerLamports,
      castsAttempted,
      castsLanded: s.tripCatches.length,
      catches: s.tripCatches,
      tripMultiplierBps: tripBps,
      payoutLamports,
      netLamports,
      serverSeedHex: toHex(secrets.serverSeed),
      serverSeedHashHex: toHex(secrets.serverSeedHash),
      tripIdHex: toHex(u64Le(secrets.tripId)),
      mixerHex: toHex(secrets.mixer),
      loadout: secrets.loadoutSnapshot,
    }
    playTripEndFanfare()
    setState((cur) => ({
      ...cur,
      phase: { kind: 'trip-settled', outcome },
      balanceLamports: cur.balanceLamports + payoutLamports,
      // FOURTH-OCCURRENCE FIX: clear every per-cast timestamp so the
      // line-out / fish-on / outcome-message / pending-settle effects
      // can't re-fire a stale callback against the settled phase. Each
      // effect already guards with `phase.kind !== 'trip-active'` but
      // clearing the deps is belt-and-suspenders: it forces the effects
      // to re-run their cleanup and clear any pending setTimeout that
      // was scheduled before the cash-out / auto-settle dispatch landed.
      reelTension: 0,
      reelParams: null,
      reelStartedMs: null,
      fishOnStartedMs: null,
      lineOutStartedMs: null,
      biteDelayMs: null,
      outcomeMessageStartedMs: null,
      outcomeMessageWindowMs: null,
      pendingSettleRequestedMs: null,
      history: [
        {
          tripMultiplierBps: tripBps,
          wagerLamports: cur.wagerLamports,
          netLamports,
          castsLanded: cur.tripCatches.length,
        },
        ...cur.history,
      ].slice(0, MAX_HISTORY),
    }))
  }, [])

  const startTrip = useCallback(async () => {
    const s = stateRef.current
    if (s.phase.kind !== 'bet-entry' && s.phase.kind !== 'trip-settled') return
    if (s.wagerLamports > s.balanceLamports) return
    ensureAudio()
    const tripId = tripIdRef.current
    tripIdRef.current = tripId + 1n
    const secrets = await generateTripSecrets(tripId, s.loadout)
    secretsRef.current = secrets
    // FOURTH-OCCURRENCE FIX: reset the settle latch so the new trip
    // can settle. Also covers the trip-settled → start-trip fast path
    // where the player taps "another trip →" without going through
    // `acknowledgeSettlement`.
    settleScheduledRef.current = false
    setState((cur) => ({
      ...cur,
      phase: { kind: 'trip-active', sub: { kind: 'casting' } },
      balanceLamports: cur.balanceLamports - cur.wagerLamports,
      tripCatches: [],
      currentCastIndex: 0,
      maxCasts: castsPerTrip(cur.loadout.rod),
      castPower: 0,
      currentDepth: null,
      reelTension: 0,
      reelParams: null,
      reelStartedMs: null,
      fishOnStartedMs: null,
      lineOutStartedMs: null,
      biteDelayMs: null,
      outcomeMessageStartedMs: null,
      outcomeMessageWindowMs: null,
      pendingSettleRequestedMs: null,
      // Pre-select the center tile so the boat has a default target on
      // trip start. The 3D scene treats null as "no highlight, default
      // forward cast". This gives a stable visual anchor immediately.
      targetTileIndex: null,
    }))
  }, [])

  // ─── Per-cast lifecycle ──────────────────────────────────────────────────

  const setTargetTile = useCallback((index: number | null) => {
    setState((s) => {
      // Only allow retargeting during the `casting` sub-phase. Once the
      // cast launches, the line is committed and the tile is locked.
      if (s.phase.kind !== 'trip-active') return s
      if (s.phase.sub.kind !== 'casting') return s
      if (s.targetTileIndex === index) return s
      return { ...s, targetTileIndex: index }
    })
  }, [])

  // ─── L3 (direct-manipulation cast) charge ramp ────────────────────────
  // Internal interval that ramps cast power 0 → 100 over ~1.0s while the
  // player holds on a hex. Stops on releaseHexCharge() and on phase change.
  // Stored as a ref so React rerenders don't restart the ramp.
  const chargeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chargeStartedAtRef = useRef<number | null>(null)

  const stopChargeInterval = useCallback(() => {
    if (chargeIntervalRef.current !== null) {
      clearInterval(chargeIntervalRef.current)
      chargeIntervalRef.current = null
    }
    chargeStartedAtRef.current = null
  }, [])

  const setCastPower = useCallback((power: number) => {
    if (!Number.isFinite(power)) return
    const clamped = power < 0 ? 0 : power > 100 ? 100 : Math.floor(power)
    setState((s) => {
      if (s.phase.kind !== 'trip-active') return s
      if (s.phase.sub.kind !== 'casting') return s
      if (s.castPower === clamped) return s
      return { ...s, castPower: clamped }
    })
  }, [])

  const launchCast = useCallback(async () => {
    const s = stateRef.current
    if (s.phase.kind !== 'trip-active') return
    if (s.phase.sub.kind !== 'casting') return
    if (s.castPower < 5) return // Too weak; ignore (player let go too early)
    const secrets = secretsRef.current
    if (!secrets) return
    const power = s.castPower
    const depth = castPowerToDepth(power, s.loadout.boat)
    playCastLaunch()
    // Immediately enter line-out so the UI swaps to the "lure descending"
    // surface — the player gets instant feedback. We re-set the bite-delay
    // stamp once the async outcome resolves below.
    setState((cur) => ({
      ...cur,
      phase: { kind: 'trip-active', sub: { kind: 'line-out' } },
      currentDepth: depth,
    }))

    // ─── Compute the cast outcome NOW (Layer 1 loss mechanics 2026-05-24) ──
    //
    // The outcome is decided at launch from (serverSeed, castIndex, power)
    // via the depth-weighted rarity table. The reel minigame can later
    // demote a NORMAL/JUNK outcome to SNAP (player fluffed the rhythm)
    // but cannot upgrade or alter the deterministic miss/snap/junk roll.
    // This means a player can SEE a deterministic chain of outcomes via
    // Glass Box — the math is provably independent of tap timing.
    const castSeed = await deriveCastSeed(secrets.serverSeed, s.currentCastIndex)
    const depthWeights = DEPTH_RARITY_WEIGHTS[depth]
    const shiftedWeights = applyBaitWeights(depthWeights, s.loadout.bait)
    const outcome = evaluateCastOutcome(castSeed, power, shiftedWeights)
    const resolved: ResolvedCastOutcome = {
      kind: outcome.kind,
      rarity: outcome.rarity,
      // NORMAL: scale BPS by bait at this point (mirror of payoutForCatch).
      // JUNK / SNAP / MISS: take the constant BPS directly.
      effectiveBps:
        outcome.kind === 'normal' && outcome.rarity !== null
          ? payoutForCatch(outcome.rarity, s.loadout.bait)
          : outcome.effectiveBps,
      castSeedHex: castSeed.toString(16).padStart(8, '0'),
      castPower: power,
    }
    currentCastOutcomeRef.current = resolved

    // ─── Stamp the line-out + bite delay so the effect schedules the bite ──
    //
    // THIRD-OCCURRENCE FIX (Tim QA 2026-05-25): the bite-delay is now
    // driven by an effect keyed on `lineOutStartedMs` instead of a raw
    // setTimeout scheduled inside launchCast(). When microtask + commit
    // batching delays React from running the line-out commit, the
    // previous setTimeout could fire its guarded callback while
    // stateRef.current still showed `casting`, the guard would
    // early-return, and the entire cast pipeline would wedge on line-out
    // forever. Reproduced by the ooFisherProvider.test.tsx regression
    // suite with fake timers (vitest's advanceTimersByTime collapsed the
    // microtask window the old code depended on). Effects survive
    // concurrent rendering because they run AFTER React commits the new
    // state.
    //
    // MISS path: use a fixed short bite delay (800ms) — the cast
    // resolves directly to `missed` via the effect, no fish-on, no
    // reeling. The outcome-message effect then carries us through the
    // readable miss window. This replaces the nested setTimeout chain
    // that was the second hot-spot for the wiring stall class.
    const biteDelayForCast =
      resolved.kind === 'miss' ? 800 : 600 + (castSeed % 1200)
    if (resolved.kind === 'miss') {
      playLineSnap()
    }
    setState((cur) => {
      // Guard against the player having cashed out (or otherwise left
      // trip-active) during the async crypto digest. The cash-out path
      // would have already settled the trip — overwriting state here
      // would re-wedge the controller in line-out.
      if (cur.phase.kind !== 'trip-active') return cur
      if (cur.phase.sub.kind !== 'line-out') return cur
      return {
        ...cur,
        lineOutStartedMs: performance.now(),
        biteDelayMs: biteDelayForCast,
      }
    })
  }, [])

  // ─── LINE-OUT → fish-on (or → missed) effect ──────────────────────────────
  //
  // Effect-keyed transition that replaces the raw setTimeout in launchCast.
  // Keyed on `lineOutStartedMs` so it runs exactly once per cast, and
  // exactly once after React commits the line-out state. The setTimeout
  // window is `biteDelayMs`. Cleanup clears the pending timer if the
  // effect re-runs (next cast, cash-out, unmount) so a stale timer can
  // never fire against a torn-down trip.
  useEffect(() => {
    if (state.lineOutStartedMs === null) return
    if (state.biteDelayMs === null) return
    if (state.phase.kind !== 'trip-active') return
    if (state.phase.sub.kind !== 'line-out') return
    const id = setTimeout(() => {
      const cur = stateRef.current
      if (cur.phase.kind !== 'trip-active') return
      if (cur.phase.sub.kind !== 'line-out') return
      const resolved = currentCastOutcomeRef.current
      // MISS resolution — outcome is recorded as a miss entry-less cast.
      // The outcome-message effect then carries us to between-casts.
      if (resolved !== null && resolved.kind === 'miss') {
        setState((s2) => ({
          ...s2,
          phase: { kind: 'trip-active', sub: { kind: 'missed' } },
          reelTension: 0,
          reelParams: null,
          reelStartedMs: null,
          fishOnStartedMs: null,
          lineOutStartedMs: null,
          biteDelayMs: null,
          outcomeMessageStartedMs: performance.now(),
          outcomeMessageWindowMs: MISS_MESSAGE_DURATION_MS,
        }))
        return
      }
      // NORMAL / JUNK / SNAP — bite registers, fish-on begins.
      playFishBite()
      const reelParams = reelingParamsForRod(cur.loadout.rod)
      setState((s2) => ({
        ...s2,
        phase: { kind: 'trip-active', sub: { kind: 'fish-on' } },
        reelTension: reelParams.targetCenter,
        reelParams,
        // Stamp the FISH-ON start so the auto-transition effect and the
        // visible countdown both read the same source of truth.
        fishOnStartedMs: performance.now(),
        lineOutStartedMs: null,
        biteDelayMs: null,
      }))
    }, state.biteDelayMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lineOutStartedMs])

  // ─── Tim 2026-05-24 OO-FISHER L3 — direct-manipulation cast handlers ─
  //
  // startHexCharge: pointerDown on a hex. Sets the target tile + starts a
  // 1.0s ramp from 0 → 100 cast power. Uses the same time-based formula as
  // CastButton so the two input methods are identical from the math's POV.
  // Idempotent: re-calling while a ramp is active just retargets the tile.
  //
  // Tim 2026-05-25 BUG-2/3 fix: previously gated on `phase.sub.kind ===
  // 'casting'` only, which left two broken UX moments:
  //   - Bug 2 (post-catch soft-lock): after the player catches a fish, the
  //     provider transitions to `between-casts`. Clicking-and-holding on a
  //     hex did NOTHING because the guard rejected the non-`casting`
  //     sub-kind. Player had to manually click HOLD-TO-CAST to bootstrap.
  //   - Bug 3 (initial soft-lock): the first-frame sub-phase after
  //     `startTrip` IS `casting`, so technically Bug 3 would have worked
  //     — BUT the same gate also rejected if the player clicked during
  //     the brief `between-casts` beat after a missed cast etc. Tim's
  //     screenshot shows the symptom: hex unresponsive until the bottom
  //     button is clicked once.
  //
  // FIX: allow startHexCharge to fire on EITHER `casting` OR
  // `between-casts`. When we land in `between-casts`, we auto-transition
  // to `casting` first (mirrors the existing `setCastPowerWrapped` →
  // `beginNextCast` pattern at L1155+ which does the same dance for the
  // cast-button hold path). After the transition the ramp starts as
  // normal. Both input paths are now identical: any HOLD on the cast
  // surface (button OR hex) opens the next cast and ramps power.
  const startHexCharge = useCallback(
    (index: number) => {
      const s = stateRef.current
      if (s.phase.kind !== 'trip-active') return
      // Reject all sub-phases except the two cast-opening surfaces.
      if (s.phase.sub.kind !== 'casting' && s.phase.sub.kind !== 'between-casts') return
      // BUG-2 FIX: if we're sitting on `between-casts` (post-catch idle),
      // auto-transition to `casting` so the ramp can proceed. Same
      // atomic dance as `setCastPowerWrapped` for the bottom-button path.
      if (s.phase.sub.kind === 'between-casts') {
        setState((cur) => {
          if (cur.phase.kind !== 'trip-active') return cur
          if (cur.phase.sub.kind !== 'between-casts') return cur
          return {
            ...cur,
            phase: { kind: 'trip-active', sub: { kind: 'casting' } },
            castPower: 0,
            // Also pin the target tile in the same React commit so the
            // 3D scene paints it red immediately.
            targetTileIndex: index,
          }
        })
      } else {
        // Already in `casting` — just update the target (player can drag
        // finger between hexes).
        setState((cur) => {
          if (cur.targetTileIndex === index) return cur
          if (cur.phase.kind !== 'trip-active' || cur.phase.sub.kind !== 'casting') return cur
          return { ...cur, targetTileIndex: index }
        })
      }
      // Already ramping? Don't restart — just keep going.
      if (chargeIntervalRef.current !== null) return
      ensureAudio()
      chargeStartedAtRef.current = performance.now()
      // Tick out of 0 immediately for haptic feel.
      setCastPower(1)
      chargeIntervalRef.current = setInterval(() => {
        const startedAt = chargeStartedAtRef.current
        if (startedAt === null) return
        const cur = stateRef.current
        // Bail if phase changed under us. Accept both `casting` and the
        // brief `between-casts` window because BUG-2 FIX above transitions
        // synchronously via setState but `stateRef.current` lags by one
        // useEffect cycle — without `between-casts` in this guard the
        // first tick after a post-catch hex hold would stop the ramp
        // prematurely (stateRef still shows the old sub-kind).
        if (cur.phase.kind !== 'trip-active') {
          stopChargeInterval()
          return
        }
        if (cur.phase.sub.kind !== 'casting' && cur.phase.sub.kind !== 'between-casts') {
          stopChargeInterval()
          return
        }
        const elapsed = performance.now() - startedAt
        const power = Math.min(100, Math.floor((elapsed / 1000) * 100))
        setCastPower(power)
      }, 16)
    },
    [setCastPower, stopChargeInterval],
  )

  // releaseHexCharge: pointerUp anywhere. Stops the ramp and launches if
  // power is above the minimum threshold (launchCast guards internally).
  // Defensive: always stops the interval so we don't leak a timer.
  const releaseHexCharge = useCallback(() => {
    const wasRamping = chargeIntervalRef.current !== null
    stopChargeInterval()
    if (!wasRamping) return
    const s = stateRef.current
    if (s.phase.kind !== 'trip-active') return
    if (s.phase.sub.kind !== 'casting') return
    void launchCast()
  }, [stopChargeInterval, launchCast])

  // Cleanup the charge interval on unmount so we don't leak timers across
  // hot-reload boundaries.
  useEffect(() => {
    return () => {
      stopChargeInterval()
    }
  }, [stopChargeInterval])

  // ─── FISH-ON → reeling auto-transition (Tim playthrough 2026-05-23) ─────
  //
  // ROOT CAUSE OF SOFT-LOCK: the previous implementation scheduled the
  // FISH-ON → reeling transition via a setTimeout NESTED inside the bite-
  // delay setTimeout. That callback then read `stateRef.current` which is
  // updated by an effect — but the inner setTimeout's 400ms window could
  // fire before React committed the line-out → fish-on update in
  // production-build StrictMode timing windows, leaving `c2.phase.sub.kind
  // !== 'fish-on'` and early-returning. Result: game stuck on FISH-ON
  // forever, no reeling overlay, full soft-lock. Two consecutive audit
  // runs hung at this exact line.
  //
  // FIX: same useRef-driven effect pattern that fixed the cast-button
  // regression and that already powers the reeling drift loop. The effect
  // depends ONLY on `fishOnStartedMs` (which is set the moment fish-on
  // enters), not on the phase object. A single setTimeout is scheduled on
  // mount, cleared on phase-change. No nested timers. No stale closures.
  useEffect(() => {
    if (state.fishOnStartedMs === null) return
    if (state.phase.kind !== 'trip-active') return
    if (state.phase.sub.kind !== 'fish-on') return
    const id = setTimeout(() => {
      const cur = stateRef.current
      if (cur.phase.kind !== 'trip-active') return
      if (cur.phase.sub.kind !== 'fish-on') return
      setState((s) => ({
        ...s,
        phase: { kind: 'trip-active', sub: { kind: 'reeling' } },
        reelStartedMs: performance.now(),
        fishOnStartedMs: null,
      }))
    }, FISH_ON_WINDOW_MS)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.fishOnStartedMs])

  // ─── Reeling minigame: drift tick + tap nudge ────────────────────────────

  useEffect(() => {
    if (state.phase.kind !== 'trip-active') return
    if (state.phase.sub.kind !== 'reeling') return
    if (!state.reelParams || state.reelStartedMs === null) return
    // Drift loop — tension drops at driftPerSecond. Player taps to push it
    // back up. If tension exits [minTension, maxTension] OR the timer
    // expires while tension is outside the target zone, the fish escapes.
    const id = setInterval(() => {
      const cur = stateRef.current
      if (cur.phase.kind !== 'trip-active') return
      if (cur.phase.sub.kind !== 'reeling') return
      if (!cur.reelParams || cur.reelStartedMs === null) return
      const params = cur.reelParams
      const elapsedMs = performance.now() - cur.reelStartedMs
      const driftPerTick = (params.driftPerSecond * REELING_TICK_MS) / 1000
      const nextTension = cur.reelTension - driftPerTick
      // Snap check — tension out of safe band. Record a SNAP entry so
      // the trip receipt has a row for this cast (Layer 1 loss
      // mechanics). The cast still consumed wager budget; the player
      // sees this in the divisor at settlement.
      if (nextTension < params.minTension || nextTension > params.maxTension) {
        playLineSnap()
        const resolved = currentCastOutcomeRef.current
        setState((s) => {
          const entry: CatchEntry | null =
            resolved !== null && cur.currentDepth !== null
              ? {
                  castIndex: s.currentCastIndex,
                  depth: cur.currentDepth,
                  rarity: 'common',
                  bait: s.loadout.bait,
                  currencyLamports: 0n,
                  castSeedHex: resolved.castSeedHex,
                  result: 'snap',
                  effectiveBps: 0n,
                  perfectBonusBps: 10_000n,
                }
              : null
          const updated: OoFisherState = {
            ...s,
            phase: { kind: 'trip-active', sub: { kind: 'snap' } },
            tripCatches: entry !== null ? [...s.tripCatches, entry] : s.tripCatches,
            reelTension: 0,
            reelParams: null,
            reelStartedMs: null,
            fishOnStartedMs: null,
            // L5: slow the snap message so it's readable (Tim 2026-05-24).
            // THIRD-OCCURRENCE FIX: stamp the message window on the same
            // commit as the sub-phase change. The outcome-message effect
            // (keyed on outcomeMessageStartedMs) carries us to advance.
            outcomeMessageStartedMs: performance.now(),
            outcomeMessageWindowMs: SNAP_MESSAGE_DURATION_MS,
          }
          return updated
        })
        return
      }
      // Timer expiry check: if elapsed > duration, the fish escapes if
      // current tension is outside the zone, or is caught if inside.
      // Tim 2026-05-24 OO-FISHER L4: use the MOVING zone center (shared
      // with the overlay) so the player sees the same zone the math reads.
      if (elapsedMs >= params.durationMs) {
        const zone = effectiveTargetZone(elapsedMs, params)
        const lo = zone.center - zone.halfWidth
        const hi = zone.center + zone.halfWidth
        const inside = nextTension >= lo && nextTension <= hi
        if (inside) {
          // Tim 2026-05-26 image 142 — compute the perfect-hit bonus from
          // the final tension vs zone center. Stash on the ref so
          // resolveCatch can apply it deterministically.
          perfectBonusBpsRef.current = computePerfectBonusBps(nextTension, zone.center)
          void resolveCatch()
        } else {
          playLineSnap()
          const resolved = currentCastOutcomeRef.current
          setState((s) => {
            const entry: CatchEntry | null =
              resolved !== null && cur.currentDepth !== null
                ? {
                    castIndex: s.currentCastIndex,
                    depth: cur.currentDepth,
                    rarity: 'common',
                    bait: s.loadout.bait,
                    currencyLamports: 0n,
                    castSeedHex: resolved.castSeedHex,
                    result: 'snap',
                    effectiveBps: 0n,
                    perfectBonusBps: 10_000n,
                  }
                : null
            return {
              ...s,
              phase: { kind: 'trip-active', sub: { kind: 'snap' } },
              tripCatches: entry !== null ? [...s.tripCatches, entry] : s.tripCatches,
              reelTension: 0,
              reelParams: null,
              reelStartedMs: null,
              fishOnStartedMs: null,
              // L5: slow the snap message so it's readable (Tim 2026-05-24).
              // THIRD-OCCURRENCE FIX: see snap-from-drift comment above.
              outcomeMessageStartedMs: performance.now(),
              outcomeMessageWindowMs: SNAP_MESSAGE_DURATION_MS,
            }
          })
        }
        return
      }
      // Normal drift tick.
      setState((s) => ({ ...s, reelTension: nextTension }))
    }, REELING_TICK_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.phase.kind,
    state.phase.kind === 'trip-active' ? state.phase.sub.kind : null,
    state.reelStartedMs,
  ])

  const reelTap = useCallback(() => {
    const s = stateRef.current
    if (s.phase.kind !== 'trip-active') return
    if (s.phase.sub.kind !== 'reeling') return
    if (!s.reelParams) return
    const params = s.reelParams
    playReelTap()
    setState((cur) => {
      if (cur.phase.kind !== 'trip-active') return cur
      if (cur.phase.sub.kind !== 'reeling') return cur
      if (!cur.reelParams) return cur
      const next = Math.min(
        params.maxTension,
        Math.max(params.minTension, cur.reelTension + params.tapNudge),
      )
      return { ...cur, reelTension: next }
    })
  }, [])

  // ─── Catch resolution ───────────────────────────────────────────────────

  const resolveCatch = useCallback(async (): Promise<void> => {
    const s = stateRef.current
    if (s.phase.kind !== 'trip-active') return
    const secrets = secretsRef.current
    if (!secrets) return
    if (s.currentDepth === null) return
    // Use the resolved outcome computed at launchCast() — DO NOT re-roll.
    // The math is independent of the player's tap rhythm; the reel
    // minigame gates whether the player LANDS the rolled outcome.
    const resolved = currentCastOutcomeRef.current
    if (!resolved) return

    // SNAP outcome at launch — shouldn't reach resolveCatch (the reel
    // would have demoted us) but defend anyway: record as snap entry.
    if (resolved.kind === 'snap') {
      const snapEntry: CatchEntry = {
        castIndex: s.currentCastIndex,
        depth: s.currentDepth,
        rarity: 'common', // placeholder for display; not used in payout
        bait: s.loadout.bait,
        currencyLamports: 0n,
        castSeedHex: resolved.castSeedHex,
        result: 'snap',
        effectiveBps: 0n,
        perfectBonusBps: 10_000n,
      }
      playLineSnap()
      setState((cur) => ({
        ...cur,
        phase: { kind: 'trip-active', sub: { kind: 'snap' } },
        tripCatches: [...cur.tripCatches, snapEntry],
        reelTension: 0,
        reelParams: null,
        reelStartedMs: null,
        fishOnStartedMs: null,
        // L5: slow the snap message so it's readable (Tim 2026-05-24).
        // THIRD-OCCURRENCE FIX: stamp message window on same commit.
        outcomeMessageStartedMs: performance.now(),
        outcomeMessageWindowMs: SNAP_MESSAGE_DURATION_MS,
      }))
      return
    }

    // JUNK outcome — caught a boot/seaweed/minnow at ×0.30. Record the
    // entry, play a muted catch sound (re-use catch fanfare per RG-C5 —
    // SAME signature across all rarities/outcomes), and show the
    // junk-caught sub-phase. Currency earn is half a common's value so
    // the player sees a small grind nudge but feels the loss.
    if (resolved.kind === 'junk') {
      const junkCurrency = currencyForCatch('common', s.loadout.bait) / 2n
      const junkEntry: CatchEntry = {
        castIndex: s.currentCastIndex,
        depth: s.currentDepth,
        rarity: 'common', // placeholder; junk has no rarity tier
        bait: s.loadout.bait,
        currencyLamports: junkCurrency,
        castSeedHex: resolved.castSeedHex,
        result: 'junk',
        effectiveBps: JUNK_CATCH_BPS,
        perfectBonusBps: 10_000n,
      }
      playCatchFanfare()
      setState((cur) => {
        const nextCurrency = cur.metaCurrencyLamports + junkEntry.currencyLamports
        writePersistedCurrency(nextCurrency)
        return {
          ...cur,
          phase: { kind: 'trip-active', sub: { kind: 'junk-caught' } },
          tripCatches: [...cur.tripCatches, junkEntry],
          metaCurrencyLamports: nextCurrency,
          reelTension: 0,
          reelParams: null,
          reelStartedMs: null,
          fishOnStartedMs: null,
          // L5: slow the junk message so it's readable (Tim 2026-05-24).
          // THIRD-OCCURRENCE FIX: stamp message window on same commit.
          outcomeMessageStartedMs: performance.now(),
          outcomeMessageWindowMs: JUNK_MESSAGE_DURATION_MS,
        }
      })
      return
    }

    // NORMAL outcome — record the rarity catch.
    if (resolved.rarity === null) {
      // Defensive — shouldn't happen since launchCast guarantees it for
      // normal outcomes. Treat as miss to be safe.
      setState((cur) => ({
        ...cur,
        phase: { kind: 'trip-active', sub: { kind: 'missed' } },
        reelTension: 0,
        reelParams: null,
        reelStartedMs: null,
        fishOnStartedMs: null,
        // L5: slow the miss message so it's readable (Tim 2026-05-24).
        // THIRD-OCCURRENCE FIX: stamp message window on same commit.
        outcomeMessageStartedMs: performance.now(),
        outcomeMessageWindowMs: MISS_MESSAGE_DURATION_MS,
      }))
      return
    }
    const rarity = resolved.rarity
    // Perfect-hit bonus is EV-NEUTRAL (casino-fairness fix, 2026-06-30): it does
    // NOT boost the cash payout. A payout multiplier pushed milestone-targeting
    // RTP above 100% (the same edge Pulse had). The reward is now paid in STASH
    // (gear-upgrade credit, not wagerable cash), so the money game's RTP is
    // untouched. The ref still resets to identity each cast.
    const perfectBonusBps = perfectBonusBpsRef.current
    perfectBonusBpsRef.current = 10_000n
    const boostedBps = resolved.effectiveBps // cash payout — no perfect boost
    // Perfect read → extra gear STASH, scaled by how centered the reel was.
    const baseCurrency = currencyForCatch(rarity, s.loadout.bait)
    const perfectCurrency = (baseCurrency * perfectBonusBps) / 10_000n
    const catchEntry: CatchEntry = {
      castIndex: s.currentCastIndex,
      depth: s.currentDepth,
      rarity,
      bait: s.loadout.bait,
      currencyLamports: perfectCurrency,
      castSeedHex: resolved.castSeedHex,
      result: 'normal',
      effectiveBps: boostedBps,
      perfectBonusBps,
    }
    playCatchFanfare()
    // Apply currency earn + persist to LocalStorage so the GRIND signal is
    // visible across sessions.
    setState((cur) => {
      const nextCurrency = cur.metaCurrencyLamports + catchEntry.currencyLamports
      writePersistedCurrency(nextCurrency)
      return {
        ...cur,
        phase: { kind: 'trip-active', sub: { kind: 'caught', rarity } },
        tripCatches: [...cur.tripCatches, catchEntry],
        metaCurrencyLamports: nextCurrency,
        reelTension: 0,
        reelParams: null,
        reelStartedMs: null,
        fishOnStartedMs: null,
        // L6: Hero catch celebration (Tim 2026-05-24) — full-screen
        // "moment to live" before advancing. Duration is module-const
        // per RG-C5; identical regardless of rarity. THIRD-OCCURRENCE
        // FIX: stamp message window on same commit; advance handled by
        // outcome-message effect.
        outcomeMessageStartedMs: performance.now(),
        outcomeMessageWindowMs: CATCH_HERO_DURATION_MS,
      }
    })
  }, [])

  /**
   * Advance after a cast resolves (catch or miss). If there are casts left,
   * transition to `between-casts` so the player can decide to cast again
   * or cash out. Otherwise, settle the trip.
   */
  const advanceAfterCast = useCallback(
    (_landed: boolean) => {
      const s = stateRef.current
      if (s.phase.kind !== 'trip-active') return
      const nextCastIndex = s.currentCastIndex + 1
      if (nextCastIndex >= s.maxCasts) {
        // Trip exhausted — queue the auto-settle via a state-timestamp
        // stamp. The pending-settle effect (keyed on
        // `pendingSettleRequestedMs`) dispatches `settleTrip(false)` on
        // the next React commit, replacing the previous
        // `setTimeout(() => settleTrip(false), 0)` chain which could be
        // cancelled by React 19 concurrent rendering between the
        // setState commit and the timer fire (FOURTH-OCCURRENCE wiring
        // stall — Tim QA 2026-05-25 oo-fisher auto-settle audit).
        setState((cur) => ({
          ...cur,
          currentCastIndex: nextCastIndex,
          outcomeMessageStartedMs: null,
          outcomeMessageWindowMs: null,
          pendingSettleRequestedMs: performance.now(),
        }))
        return
      }
      setState((cur) => ({
        ...cur,
        phase: { kind: 'trip-active', sub: { kind: 'between-casts' } },
        currentCastIndex: nextCastIndex,
        castPower: 0,
        currentDepth: null,
        reelTension: 0,
        reelParams: null,
        reelStartedMs: null,
        fishOnStartedMs: null,
        outcomeMessageStartedMs: null,
        outcomeMessageWindowMs: null,
      }))
    },
    // No deps — only reads `stateRef.current` and dispatches setState.
    // `settleTrip` is now triggered via the pending-settle effect, not
    // called directly here.
    [],
  )

  // ─── OUTCOME-MESSAGE → advance effect (THIRD-OCCURRENCE FIX) ──────────────
  //
  // Effect-keyed transition that replaces every `setTimeout(() =>
  // advanceAfterCast(...), DURATION_MS)` call across the snap / junk /
  // catch / miss code paths. Keyed on `outcomeMessageStartedMs` so it
  // runs exactly once per outcome and exactly after React commits the
  // outcome state. Cleanup clears the pending timer on next outcome,
  // cash-out, or unmount — so a stale timer cannot fire against a torn-
  // down trip and overwrite a settled phase.
  //
  // The advance is determined by sub-kind: caught/junk → landed=true,
  // missed/snap → landed=false. The `_landed` parameter on
  // advanceAfterCast is currently a no-op (kept for future hooks) so
  // either value is safe; we pass the semantically correct one.
  useEffect(() => {
    if (state.outcomeMessageStartedMs === null) return
    if (state.outcomeMessageWindowMs === null) return
    if (state.phase.kind !== 'trip-active') return
    const sub = state.phase.sub.kind
    const isOutcomeSub =
      sub === 'snap' ||
      sub === 'missed' ||
      sub === 'junk-caught' ||
      sub === 'caught'
    if (!isOutcomeSub) return
    const landed = sub === 'caught' || sub === 'junk-caught'
    const id = setTimeout(() => {
      const cur = stateRef.current
      if (cur.phase.kind !== 'trip-active') return
      const curSub = cur.phase.sub.kind
      // Re-check we're still in the same outcome sub-phase — a cash-out
      // (or any other unexpected transition) since the timer was
      // scheduled would have changed it.
      if (
        curSub !== 'snap' &&
        curSub !== 'missed' &&
        curSub !== 'junk-caught' &&
        curSub !== 'caught'
      ) {
        return
      }
      advanceAfterCast(landed)
    }, state.outcomeMessageWindowMs)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.outcomeMessageStartedMs])

  // ─── PENDING-SETTLE → settleTrip effect (FOURTH-OCCURRENCE FIX) ──────────
  //
  // Effect-keyed transition that replaces the `setTimeout(() =>
  // settleTrip(false), 0)` call inside `advanceAfterCast`'s exhaustion
  // branch. Keyed on `pendingSettleRequestedMs` so it runs exactly once
  // per stamp and exactly after React commits the bumped
  // `currentCastIndex`. The setTimeout(..., 0) chain was the FOURTH
  // wiring-stall hot-spot: in React 19 concurrent rendering the timer
  // could fire while `stateRef.current` still showed the prior outcome
  // sub-phase (because the bump-currentCastIndex setState hadn't yet
  // committed). `settleTrip` would then early-return on its phase guard
  // and the trip would wedge in the outcome sub-phase forever.
  //
  // Effects run AFTER React commits the new state, so by the time this
  // fires, `stateRef.current` reflects the bumped index. `settleTrip`
  // also carries an at-most-once latch (`settleScheduledRef`) so even
  // a double-stamp (e.g. concurrent cash-out + auto-settle) only ever
  // produces one trip-settled commit.
  useEffect(() => {
    if (state.pendingSettleRequestedMs === null) return
    if (state.phase.kind !== 'trip-active') return
    // Dispatch on the next microtask so the commit that stamped us has
    // fully landed in `stateRef.current` before settleTrip reads it.
    // Effects already run after commit, but yielding one microtask is
    // belt-and-suspenders for any nested batched-update edge case.
    void Promise.resolve().then(() => {
      const cur = stateRef.current
      if (cur.phase.kind !== 'trip-active') return
      if (cur.pendingSettleRequestedMs === null) return
      settleTrip(false)
    })
    // No cleanup needed — settleTrip's latch ensures at-most-once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingSettleRequestedMs])

  // Transition from between-casts → casting when the player initiates the
  // next cast. Exposed via the `setCastPower` API: any non-zero power
  // implicitly opens a new cast.
  // The controller exposes a dedicated `beginNextCast` for clarity.
  const beginNextCast = useCallback(() => {
    const s = stateRef.current
    if (s.phase.kind !== 'trip-active') return
    if (s.phase.sub.kind !== 'between-casts') return
    setState((cur) => ({
      ...cur,
      phase: { kind: 'trip-active', sub: { kind: 'casting' } },
      castPower: 0,
    }))
  }, [])

  // Override `setCastPower` so it implicitly transitions from between-casts
  // to casting (the player pressing-and-holding the cast button is the
  // single gesture for both intents).
  const setCastPowerWrapped = useCallback(
    (power: number) => {
      const s = stateRef.current
      if (s.phase.kind === 'trip-active' && s.phase.sub.kind === 'between-casts') {
        beginNextCast()
      }
      setCastPower(power)
    },
    [beginNextCast, setCastPower],
  )

  // ─── Trip cash-out (RG-C8 always-available) ─────────────────────────────

  const cashOutTrip = useCallback(() => {
    const s = stateRef.current
    if (s.phase.kind !== 'trip-active') return
    // Allowed sub-kinds: 'casting' (idle), 'between-casts'. Mid-reel cash-out
    // is NOT allowed — the player committed to the bite and must resolve it.
    // This is documented in the action-bar copy.
    if (s.phase.sub.kind !== 'casting' && s.phase.sub.kind !== 'between-casts') {
      return
    }
    // FOURTH-OCCURRENCE FIX: idempotent dispatch. If a settle is already
    // queued (auto-settle path or a double-tap on cash-out), the
    // `settleScheduledRef` latch in `settleTrip` collapses the second
    // call to a no-op. We still attempt the direct dispatch so the
    // synchronous click → setState commit path is preserved (lower
    // perceived latency vs. waiting for the pending-settle effect).
    settleTrip(true)
  }, [settleTrip])

  // ─── Settlement ack ──────────────────────────────────────────────────────

  const acknowledgeSettlement = useCallback(() => {
    setState((s) =>
      s.phase.kind === 'trip-settled'
        ? {
            ...s,
            phase: { kind: 'bet-entry' },
            tripCatches: [],
            currentCastIndex: 0,
            castPower: 0,
            currentDepth: null,
            reelTension: 0,
            reelParams: null,
            reelStartedMs: null,
            fishOnStartedMs: null,
            lineOutStartedMs: null,
            biteDelayMs: null,
            outcomeMessageStartedMs: null,
            outcomeMessageWindowMs: null,
            pendingSettleRequestedMs: null,
          }
        : s,
    )
    secretsRef.current = null
    settleScheduledRef.current = false
  }, [])

  // ─── Upgrade modal ──────────────────────────────────────────────────────

  const openUpgradeModal = useCallback(() => {
    setState((s) =>
      s.phase.kind === 'lobby' || s.phase.kind === 'bet-entry' || s.phase.kind === 'trip-settled'
        ? { ...s, phase: { kind: 'upgrade-modal' } }
        : s,
    )
  }, [])

  const closeUpgradeModal = useCallback(() => {
    setState((s) => (s.phase.kind === 'upgrade-modal' ? { ...s, phase: { kind: 'lobby' } } : s))
  }, [])

  const purchaseUpgrade = useCallback((tree: UpgradeTree): boolean => {
    // Tim 2026-05-26 frontend audit H-1 fix (double-purchase race): the
    // cost guard MUST operate on the committed React state, not on a stale
    // closure snapshot of `stateRef.current`. Two synchronous clicks
    // (faster than a React commit cycle) used to both pass the pre-check,
    // both compute the same `nextCurrency`, and the second setState would
    // overwrite the first with the un-deducted value — letting the player
    // upgrade twice for one cost. Fix: move the guard + deduction inside
    // the functional `setState((cur) => …)` callback so both runs see the
    // already-deducted balance. localStorage persistence moves to an
    // effect keyed on the committed values (see writePersistedCurrency /
    // writePersistedLoadout effect below).
    const s = stateRef.current
    if (s.phase.kind === 'trip-active') return false
    // Cheap upfront affordability check for click feedback only — the
    // authoritative deduction happens inside setState.
    const previewCurrent = s.loadout[tree]
    const previewNext = nextTier(previewCurrent)
    if (previewNext === null) return false
    if (s.metaCurrencyLamports < upgradeCost(previewCurrent)) return false

    let committed = false
    setState((cur) => {
      if (cur.phase.kind === 'trip-active') return cur
      const current = cur.loadout[tree]
      const next = nextTier(current)
      if (next === null) return cur
      const cost = upgradeCost(current)
      if (cur.metaCurrencyLamports < cost) return cur
      committed = true
      const nextLoadout: GearLoadout = { ...cur.loadout, [tree]: next }
      const nextCurrency = cur.metaCurrencyLamports - cost
      // Persist inside the functional updater — same pattern used by the
      // catch / junk paths (lines ~1297, ~1358) so localStorage tracks the
      // single committed state per commit. NEVER moves to a pre-setState
      // line (that was the original H-1 / M-4 bug surface).
      writePersistedCurrency(nextCurrency)
      writePersistedLoadout(nextLoadout)
      return {
        ...cur,
        loadout: nextLoadout,
        metaCurrencyLamports: nextCurrency,
        maxCasts: castsPerTrip(nextLoadout.rod),
      }
    })
    if (committed) {
      ensureAudio()
      playUpgradePurchase()
    }
    return committed
  }, [])

  // Spend STASH (scales) on a cosmetic / EV-neutral perk. Deducts metaCurrency
  // if affordable and persists. Returns true on success. EV-NEUTRAL by design —
  // this only moves gear-credit, never the wager balance or any odds, so it
  // cannot affect RTP. Cosmetic ownership itself lives in the UI layer.
  const spendScales = useCallback((amountLamports: bigint): boolean => {
    if (amountLamports <= 0n) return false
    if (stateRef.current.metaCurrencyLamports < amountLamports) return false
    let committed = false
    setState((cur) => {
      if (cur.metaCurrencyLamports < amountLamports) return cur
      committed = true
      const nextCurrency = cur.metaCurrencyLamports - amountLamports
      writePersistedCurrency(nextCurrency)
      return { ...cur, metaCurrencyLamports: nextCurrency }
    })
    if (committed) {
      ensureAudio()
      playUpgradePurchase()
    }
    return committed
  }, [])

  // ─── Glass Box re-derive ────────────────────────────────────────────────
  //
  // The trip's per-cast seeds are derived deterministically from
  // `(serverSeed, 'OOFISHCAST', castIndex)` via SHA-256. The Glass Box
  // widget re-runs the same derivation client-side from the published
  // hex-encoded serverSeed and compares each derived seed against the
  // outcome's recorded `castSeedHex`. Bit-for-bit equality proves the
  // catches the player saw were determined by the seed chain.
  const reverifyCastSeeds = useCallback(
    async (serverSeedHex: string, castCount: number): Promise<ReadonlyArray<string>> => {
      function fromHex(hex: string): Uint8Array {
        if (hex.length % 2 !== 0) throw new Error('odd-length hex')
        const out = new Uint8Array(hex.length / 2)
        for (let i = 0; i < out.length; i++) {
          out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16)
        }
        return out
      }
      if (castCount < 0 || !Number.isInteger(castCount)) return []
      const serverSeed = fromHex(serverSeedHex)
      const out: string[] = []
      for (let i = 0; i < castCount; i++) {
        const raw = await deriveCastSeed(serverSeed, i)
        // 32-bit unsigned to fixed-width hex, matching the outcome
        // recorder which stores `raw.toString(16).padStart(8, '0')` per
        // CatchEntry.castSeedHex.
        out.push(raw.toString(16).padStart(8, '0'))
      }
      return out
    },
    [],
  )

  // ─── Return memoized controller ─────────────────────────────────────────

  return useMemo<OoFisherController>(
    () => ({
      state,
      openBetEntry,
      closeBetEntry,
      setWager,
      startTrip,
      setCastPower: setCastPowerWrapped,
      launchCast,
      reelTap,
      setTargetTile,
      startHexCharge,
      releaseHexCharge,
      cashOutTrip,
      acknowledgeSettlement,
      openUpgradeModal,
      closeUpgradeModal,
      purchaseUpgrade,
      spendScales,
      reverifyCastSeeds,
    }),
    [
      state,
      openBetEntry,
      closeBetEntry,
      setWager,
      startTrip,
      setCastPowerWrapped,
      launchCast,
      reelTap,
      setTargetTile,
      startHexCharge,
      releaseHexCharge,
      cashOutTrip,
      acknowledgeSettlement,
      openUpgradeModal,
      closeUpgradeModal,
      purchaseUpgrade,
      spendScales,
      reverifyCastSeeds,
    ],
  )
}

// Re-export math constants the experience module uses for typing.
export type { DepthTier, FishRarity, GearLoadout, GearTier, UpgradeTree }
export { ONE_X_BPS }

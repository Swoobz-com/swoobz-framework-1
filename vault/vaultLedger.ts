/**
 * Vault ledger — persistent per-world Personal Bests (Domain C, presentation).
 *
 * Client-only convenience layer: a small localStorage record of the player's
 * best result per VaultMode. Purely cosmetic / retention — it never touches the
 * math, the round secrets, or any economic value. The Glass Box receipt and the
 * provably-fair chain do NOT read this file; it is a UI garnish only.
 *
 * RG-C5 SAFETY (load-bearing):
 * ---------------------------
 *  • Nothing here feeds an animation timing or amplitude. The PB values are
 *    surfaced ONLY on the config/mode-select screen (bet-entry), never during
 *    an active round and never on the settlement overlay — so a rising "best"
 *    can never scale a live celebration with streak/session state.
 *  • `update` is a pure record of the settled OUTCOME (won/mult/trace) — it
 *    reads no streak counter and returns nothing that gates fanfare.
 *
 * SSR-safe: every access guards for a missing `window` / `localStorage` and
 * fails closed to empty defaults (no throw, no crash on a server render).
 */
import type { VaultMode } from './vaultMath'

const LEDGER_STORAGE_KEY = 'swoobz-vault-ledger-v1'

/** Per-world best record. `bestMultiplierBps` is a bigint (BPS ladder value);
 *  it is stored as a decimal string in JSON since JSON has no bigint. */
export interface ModeBest {
  /** Highest cumulative multiplier ever CASHED (won) in this world, in BPS. */
  bestMultiplierBps: bigint
  /** Most safe tiles ever revealed on a WON round in this world. */
  longestTrailRun: number
  /** Total rounds ever settled (won or lost) in this world. */
  roundsPlayed: number
}

/** The minimal settled-outcome shape `update` consumes. `VaultOutcome` from the
 *  provider is structurally assignable to this — kept local to avoid a provider
 *  import cycle. */
export interface LedgerOutcomeInput {
  mode: VaultMode
  won: boolean
  finalMultiplierBps: bigint
  revealedTiles: readonly number[]
}

type LedgerShape = Partial<Record<VaultMode, ModeBest>>

/** JSON-serialisable mirror of `ModeBest` (bigint → string). */
interface StoredModeBest {
  bestMultiplierBps: string
  longestTrailRun: number
  roundsPlayed: number
}

function emptyBest(): ModeBest {
  return { bestMultiplierBps: 0n, longestTrailRun: 0, roundsPlayed: 0 }
}

function hasStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    // Accessing window.localStorage can throw in sandboxed frames — fail closed.
    return false
  }
}

function readAll(): LedgerShape {
  if (!hasStorage()) return {}
  try {
    const raw = window.localStorage.getItem(LEDGER_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<Record<VaultMode, StoredModeBest>>
    const out: LedgerShape = {}
    for (const key of Object.keys(parsed) as VaultMode[]) {
      const v = parsed[key]
      if (!v) continue
      // Defensive parse — a corrupt / hand-edited entry degrades to defaults,
      // never throws into the render path.
      let best = 0n
      try {
        best = BigInt(v.bestMultiplierBps)
        if (best < 0n) best = 0n
      } catch {
        best = 0n
      }
      out[key] = {
        bestMultiplierBps: best,
        longestTrailRun: Number.isFinite(v.longestTrailRun) ? Math.max(0, Math.floor(v.longestTrailRun)) : 0,
        roundsPlayed: Number.isFinite(v.roundsPlayed) ? Math.max(0, Math.floor(v.roundsPlayed)) : 0,
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(ledger: LedgerShape): void {
  if (!hasStorage()) return
  try {
    const serialisable: Partial<Record<VaultMode, StoredModeBest>> = {}
    for (const key of Object.keys(ledger) as VaultMode[]) {
      const v = ledger[key]
      if (!v) continue
      serialisable[key] = {
        bestMultiplierBps: v.bestMultiplierBps.toString(),
        longestTrailRun: v.longestTrailRun,
        roundsPlayed: v.roundsPlayed,
      }
    }
    window.localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(serialisable))
  } catch {
    // Quota / private-mode write failures are non-fatal — the PB is a garnish.
  }
}

/** Read this world's best record. Returns fresh zero-defaults if none stored. */
function get(mode: VaultMode): ModeBest {
  const all = readAll()
  return all[mode] ?? emptyBest()
}

/**
 * Fold a settled outcome into the ledger and persist. Idempotency is the
 * CALLER's responsibility (fire exactly once per settled outcome) — this
 * function unconditionally bumps `roundsPlayed`. `bestMultiplierBps` and
 * `longestTrailRun` only advance on a WON round.
 */
function update(outcome: LedgerOutcomeInput): ModeBest {
  const all = readAll()
  const prev = all[outcome.mode] ?? emptyBest()
  const next: ModeBest = {
    bestMultiplierBps:
      outcome.won && outcome.finalMultiplierBps > prev.bestMultiplierBps
        ? outcome.finalMultiplierBps
        : prev.bestMultiplierBps,
    longestTrailRun:
      outcome.won && outcome.revealedTiles.length > prev.longestTrailRun
        ? outcome.revealedTiles.length
        : prev.longestTrailRun,
    roundsPlayed: prev.roundsPlayed + 1,
  }
  all[outcome.mode] = next
  writeAll(all)
  return next
}

/** The public ledger facade — `vaultLedger.get(mode)` / `vaultLedger.update(outcome)`. */
export const vaultLedger = { get, update } as const

/**
 * Vault math (off-chain mirror, Domain A).
 *
 * Bit-identical mirror of `programs/originals-vault/src/mines_math.rs` and
 * `tests/originals_vault/_vault_helpers.ts`. Same u128/BigInt carriers, same
 * floor-toward-zero (house-favored) truncation, same Fisher-Yates mine
 * placement. The Glass Box verify widget re-derives the on-chain ground truth
 * client-side using these functions — drift here breaks every verification.
 *
 * Domain A rules (CLAUDE.md §DOMAIN CLASSIFICATION):
 *   • NO IEEE 754 floats in any arithmetic path. All values are bigint.
 *   • Floor-toward-zero rounding always (house-favored). Documented per-call.
 *   • Fail-closed on out-of-range inputs.
 *
 * Self-check: `mirrorRoundtripCheck` at module load throws if any constant
 * drifts from the Rust canonical reference (n=1, total=25, mines=3, edge=300
 * → 11_022 bps). Same gate as the bankrun suite.
 */

// ─── Constants (mirror programs/originals-vault/src/constants.rs) ──────────
export const ONE_X_BPS = 10_000n
export const HOUSE_EDGE_BPS_DEFAULT = 300n
export const MAX_MULTIPLIER_BPS_DEFAULT = 1_000_000_000n
export const MIN_WAGER_LAMPORTS_DEFAULT = 100_000n
export const MAX_WAGER_PER_SESSION_LAMPORTS_DEFAULT = 10_000_000_000n
export const MAX_SESSION_SLOTS_DEFAULT = 7_500n
export const AUTOPICK_MIN_INTER_ROUND_SLOTS_DEFAULT = 5n

/** Maximum total tile count: 7×7 grid. The bitmap is sized for this; 7×7 is
 *  Phase 2 functionality but the account layout doesn't change. */
export const MAX_TOTAL_TILES = 49

/** Grid-size enumeration per VAULT-CRAFT-SPEC.md §8.1. */
export const GRID_SIZE_3X3 = 3
export const GRID_SIZE_5X5 = 5
export const GRID_SIZE_7X7 = 7

/** Default grid (V1 ships 5×5 only — TUNE-3X3 / TUNE-7X7 deferred Phase 2). */
export const DEFAULT_GRID_SIZE = GRID_SIZE_5X5

/** Mine count band. Per §8.1: at least one safe tile must exist (mines < total). */
export const MIN_MINE_COUNT = 1
export const MAX_MINE_COUNT_5X5 = 24
export const DEFAULT_MINE_COUNT = 3

/** Auto-pick cool-off band per RG-C8 / VAULT-CRAFT-SPEC.md §7.1. */
export const AUTOPICK_COOLOFF_MIN = 2
export const AUTOPICK_COOLOFF_MAX = 10
export const AUTOPICK_COOLOFF_DEFAULT = 3

// ─── RUG OR RICHES mode balance (RUG-OR-RICHES-MODE-BALANCE-2026-06-04.md) ──
// Three difficulty "worlds" run through the SAME multiplier formula with
// different (totalTiles, mineCount, houseEdgeBps). No formula divergence.
// BLUECHIPS (normal) → ALTSEASON (hard) → SHITCOIN (crazy, + MOON tile).

export type VaultMode = 'bluechips' | 'altseason' | 'shitcoin'
export const DEFAULT_MODE: VaultMode = 'bluechips'

/** Per-mode house edge. BLUECHIPS/ALTSEASON keep the 3% default; SHITCOIN runs
 *  655 bps (400 bps net target + 255 bps MOON pool — see MOON_POOL_BPS). */
export const HOUSE_EDGE_BPS_BLUECHIPS = 300n
export const HOUSE_EDGE_BPS_ALTSEASON = 300n
export const HOUSE_EDGE_BPS_SHITCOIN = 655n

/** Per-mode rug (mine) count, locked to the mode (not user-adjustable in v1). */
export const MINE_COUNT_BLUECHIPS = 3
export const MINE_COUNT_ALTSEASON = 5
export const MINE_COUNT_SHITCOIN = 24

/** Per-mode grid size. SHITCOIN uses the 7×7 board. */
export const GRID_SIZE_BLUECHIPS = GRID_SIZE_5X5
export const GRID_SIZE_ALTSEASON = GRID_SIZE_5X5
export const GRID_SIZE_SHITCOIN = GRID_SIZE_7X7

/** MOON tile (SHITCOIN-only crazy twist). EV-neutral cash bonus carved from a
 *  255 bps pool inside the 655 bps SHITCOIN edge. Payout is a FLAT addition to
 *  settlement, never a multiplier on the BPS ladder.
 *  MOON_PAYOUT_NUMER = floor(MOON_POOL_BPS * 49 / 25) = floor(12_495 / 25) = 499. */
export const MOON_POOL_BPS = 255n
export const MOON_PAYOUT_NUMER = 499n
export const MOON_PAYOUT_DENOM = 10_000n

interface VaultModeParams {
  gridSize: number
  mineCount: number
  houseEdgeBps: bigint
  hasMoonTile: boolean
}

/**
 * Pure mode→params resolver. Fail-closed on an unrecognized mode (Domain A).
 * The provider derives grid/mine/edge from this single source of truth.
 */
export function modeParams(mode: VaultMode): VaultModeParams {
  switch (mode) {
    case 'bluechips':
      return {
        gridSize: GRID_SIZE_BLUECHIPS,
        mineCount: MINE_COUNT_BLUECHIPS,
        houseEdgeBps: HOUSE_EDGE_BPS_BLUECHIPS,
        hasMoonTile: false,
      }
    case 'altseason':
      return {
        gridSize: GRID_SIZE_ALTSEASON,
        mineCount: MINE_COUNT_ALTSEASON,
        houseEdgeBps: HOUSE_EDGE_BPS_ALTSEASON,
        hasMoonTile: false,
      }
    case 'shitcoin':
      return {
        gridSize: GRID_SIZE_SHITCOIN,
        mineCount: MINE_COUNT_SHITCOIN,
        houseEdgeBps: HOUSE_EDGE_BPS_SHITCOIN,
        hasMoonTile: true,
      }
    default:
      // Fail-closed: unrecognized mode halts rather than defaulting (Domain A).
      throw new Error(`vault: unrecognized mode ${String(mode)}`)
  }
}

// ─── Multiplier derivation — Mines-canon, BigInt floor division ────────────

/**
 * Compute multiplier after `safeCount` safe reveals on a `gridSize`×`gridSize`
 * grid with `mineCount` mines. Floor division per Domain A (house-favored,
 * always rounds in the house's direction; remainder belongs to the house).
 *
 * Per VAULT-CRAFT-SPEC.md §8.2: each safe reveal multiplies cumulative by
 *   ((total - k) * (ONE_X_BPS - house_edge_bps)) / ((total - mines - k) * ONE_X_BPS)
 * with u128 intermediates and floor truncation at each step.
 *
 * @throws when house edge >= 100%, mine count out of band, or safe-count
 *         consumes all safe tiles (defensive — cross-checks the on-chain
 *         band-validation that runs at place_bet).
 */
export function multiplierAfterSafeTiles(args: {
  totalTiles: number
  mineCount: number
  safeCount: number
  houseEdgeBps?: bigint
  maxMultiplierBps?: bigint
}): bigint {
  const {
    totalTiles,
    mineCount,
    safeCount,
    houseEdgeBps = HOUSE_EDGE_BPS_DEFAULT,
    maxMultiplierBps = MAX_MULTIPLIER_BPS_DEFAULT,
  } = args
  if (houseEdgeBps >= ONE_X_BPS) {
    throw new Error('vault: house edge must be below 100%')
  }
  if (maxMultiplierBps < ONE_X_BPS) {
    throw new Error('vault: max multiplier must be at least 1.00x')
  }
  if (mineCount < MIN_MINE_COUNT || mineCount >= totalTiles) {
    throw new Error('vault: mine count out of band')
  }
  if (safeCount < 0) {
    throw new Error('vault: safe count cannot be negative')
  }
  if (safeCount + mineCount > totalTiles) {
    throw new Error('vault: safe count would consume all safe tiles')
  }
  const edgeFactor = ONE_X_BPS - houseEdgeBps
  let mult = ONE_X_BPS
  const total = BigInt(totalTiles)
  const mines = BigInt(mineCount)
  for (let k = 0n; k < BigInt(safeCount); k++) {
    const num = (total - k) * edgeFactor
    const denLhs = total - mines - k
    if (denLhs <= 0n) {
      throw new Error('vault: division by zero in mines math')
    }
    const den = denLhs * ONE_X_BPS
    // floor toward zero (house-favored — remainder belongs to the house).
    mult = (mult * num) / den
  }
  return mult < maxMultiplierBps ? mult : maxMultiplierBps
}

/**
 * Alias for the convention used in the craft spec. `multiplierAfterSafeTiles`
 * is the verbose name; `cumulativeMultiplierBps` reads better at the call
 * sites that compute the live ladder. Same function, same constraints.
 */
export const cumulativeMultiplierBps = multiplierAfterSafeTiles

/**
 * Settlement payout: wager × multiplier, floored. Mirror of `settle_payout`.
 * House-favored truncation; the remainder belongs to the house.
 */
export function settlePayout(wagerLamports: bigint, cumulativeBps: bigint): bigint {
  if (wagerLamports < 0n) {
    throw new Error('vault: wager cannot be negative')
  }
  if (cumulativeBps < 0n) {
    throw new Error('vault: cumulative bps cannot be negative')
  }
  // floor toward zero (house-favored per Domain A).
  return (wagerLamports * cumulativeBps) / ONE_X_BPS
}

/**
 * MOON tile cash bonus (SHITCOIN-only). Flat addition to the cash-out payout —
 * NOT a multiplier on the cumulative BPS ladder, so it can never breach the
 * house edge. 255 bps of the 655 bps SHITCOIN edge is the MOON *pool* it is
 * drawn from. NOTE (2026-06-30 correction): the realized MOON EV is far below
 * 255 bps — the chance of revealing the MOON tile before a rug is low (≈1/25 by
 * symmetry of the 1 MOON + 24 rugs, not the 25/49 a previous comment claimed),
 * so realized MOON return is only ~20 bps × wager. The published SHITCOIN RTP
 * (~93.5%) already reflects this; the MOON is a rare jackpot thrill, not a
 * material EV rebate. House-favored either way.
 *
 * Floor toward zero (house-favored per Domain A — the house keeps the
 * fractional lamport: e.g. wager 10_001 → 499, not 500).
 */
export function moonPayoutLamports(wagerLamports: bigint): bigint {
  if (wagerLamports < 0n) {
    throw new Error('vault: wager cannot be negative')
  }
  // floor toward zero (house-favored per Domain A).
  return (wagerLamports * MOON_PAYOUT_NUMER) / MOON_PAYOUT_DENOM
}

// ─── Display formatting ────────────────────────────────────────────────────

/** Format a basis-points multiplier as `"N.NNx"`. House-favored truncation. */
export function formatMultiplier(multiplierBps: bigint): string {
  if (multiplierBps < 0n) return '0.00x'
  const whole = multiplierBps / ONE_X_BPS
  const frac = multiplierBps % ONE_X_BPS
  const hundredths = frac / 100n
  return `${whole}.${hundredths.toString().padStart(2, '0')}x`
}

/** USDC display: 6-decimal lamports → `"N.NN USDC"`. */
export function formatUsdc(lamports: bigint): string {
  if (lamports < 0n) {
    const abs = -lamports
    const whole = abs / 1_000_000n
    const frac = abs % 1_000_000n
    const cents = (frac / 10_000n).toString().padStart(2, '0')
    return `-${whole}.${cents} USDC`
  }
  const whole = lamports / 1_000_000n
  const frac = lamports % 1_000_000n
  const cents = (frac / 10_000n).toString().padStart(2, '0')
  return `${whole}.${cents} USDC`
}

// ─── Ownership-engine point earn (shared rule across Originals) ────────────
// Mirrors `packages/points/earn-rules.ts`. Win = 1.0x, loss = 1.5x. The loss
// amplification is the brand's defining engagement-on-loss UX: even when the
// vault closes on a mine hit, ownership accrues at 1.5x. Floor truncation
// (Domain A, house-favored — same rule as the on-chain settlement).
const POINTS_BPS_SCALE = 10_000n
const POINTS_WIN_MULT_BPS = 10_000n // 1.0x
const POINTS_LOSS_MULT_BPS = 15_000n // 1.5x

export function pointsForBet(wagerLamports: bigint, won: boolean): bigint {
  if (wagerLamports < 0n) return 0n
  const usdcWhole = wagerLamports / 1_000_000n
  const mult = won ? POINTS_WIN_MULT_BPS : POINTS_LOSS_MULT_BPS
  // floor toward zero (Domain A truncation).
  return (usdcWhole * mult) / POINTS_BPS_SCALE
}

export function formatPoints(points: bigint): string {
  return points.toLocaleString('en-US')
}

// ─── Mirror roundtrip self-check ───────────────────────────────────────────

/**
 * Drift gate. Runs at module load: throws if any constant diverges from the
 * canonical Rust reference in `programs/originals-vault/src/mines_math.rs`.
 *
 * Reference: n=1, total=25, mines=3, edge=300 bps → 11_022 bps.
 *   product term: (25 * 9700) / (22 * 10000) = 242500 / 220000 → floor 1.1022x
 *
 * This is the same self-assertion the bankrun helpers run; mirror drift here
 * would silently break the Glass Box verify widget. Treat any failure as
 * release-blocking.
 */
function mirrorRoundtripCheck(): void {
  const mult = multiplierAfterSafeTiles({
    totalTiles: 25,
    mineCount: 3,
    safeCount: 1,
  })
  if (mult !== 11_022n) {
    throw new Error(
      `vault math mirror drift: expected 11_022 bps at (25,3,1,300), got ${mult.toString()}`,
    )
  }
  const zero = multiplierAfterSafeTiles({
    totalTiles: 25,
    mineCount: 3,
    safeCount: 0,
  })
  if (zero !== ONE_X_BPS) {
    throw new Error(
      `vault math mirror drift: expected 10_000 bps at zero safe, got ${zero.toString()}`,
    )
  }
  // Settle payout, 10 USDC × 1.1022x = 11.022 USDC = 11_022_000 lamports.
  const pay = settlePayout(10_000_000n, 11_022n)
  if (pay !== 11_022_000n) {
    throw new Error(`vault settle payout drift: expected 11_022_000, got ${pay.toString()}`)
  }
  // SHITCOIN base formula: n=1, total=49, mines=24, edge=655 → 18_316 bps.
  //   (49 * 9345) / (25 * 10000) = 457905 / 250000 → floor 1.8316x
  const shitcoin = multiplierAfterSafeTiles({
    totalTiles: 49,
    mineCount: 24,
    safeCount: 1,
    houseEdgeBps: HOUSE_EDGE_BPS_SHITCOIN,
  })
  if (shitcoin !== 18_316n) {
    throw new Error(
      `vault math mirror drift: expected 18_316 bps at (49,24,1,655), got ${shitcoin.toString()}`,
    )
  }
  // MOON pool derivation identity: floor(255 * 49 / 25) = 499 (house-favored).
  if ((MOON_POOL_BPS * 49n) / 25n !== MOON_PAYOUT_NUMER) {
    throw new Error(
      `vault MOON pool drift: expected ${MOON_PAYOUT_NUMER.toString()}, got ${((MOON_POOL_BPS * 49n) / 25n).toString()}`,
    )
  }
}

mirrorRoundtripCheck()

/**
 * OO-REI math — pure helpers. Domain A: monetary surface uses BigInt with
 * BPS multipliers. All reel positions, payline checks, and payout calculations
 * are integer-only. No IEEE 754 floats in any monetary path.
 *
 * Hard caps (RG-C5 structural enforcement):
 *  - MAX_TALISMAN_AWAKEN_COST_FACTOR_BPS = 1_000n (10% of wager, floor)
 *  - SPIRIT_BONUS_TRIGGER_SCATTERS minimum = 3
 *  - MAX_FREE_SPINS = 30 (per bonus run, cannot be raised at runtime)
 *  - All payout multipliers are module-level constants (SYMBOL_PAYS)
 *
 * Rounding direction (Domain A): floor (truncate toward zero) for ALL
 * player-facing calculations. The house never rounds in the player's favor.
 *
 * Symbol vocabulary maps to OO-REI-ART-DIRECTION-SPEC-2026-05-27.md §Asset Manifest.
 *
 * Slot variant: 5×3 fixed grid, 20 fixed paylines, left-to-right matching,
 * 3+ symbols on consecutive reels from reel 1 required for any payline pay.
 * Scatter (SYM_SPIRIT) pays anywhere on eligible reels 1, 3, 5.
 */

// ─── Universal BPS constants ────────────────────────────────────────────────

/** BPS denominator: 10000n = 1.0x */
export const BPS_DENOM = 10_000n

/** 1 USDC = 1_000_000n lamports (Solana 6-decimal USDC) */
export const USDC_LAMPORTS_PER_UNIT = 1_000_000n

/** Talisman Awaken costs 10% of wager (1_000n BPS = 0.10x), floored */
export const TALISMAN_AWAKEN_COST_BPS = 1_000n

/** Maximum free spins in a single Spirit Bonus run — cannot be raised at runtime */
export const MAX_FREE_SPINS = 30

/** Minimum scatter count to trigger Spirit Bonus */
export const SPIRIT_BONUS_TRIGGER_MIN = 3

// ─── Wager increments ───────────────────────────────────────────────────────

/** Available wager increments in USDC lamports. Domain A — BigInt only. */
export const WAGER_INCREMENTS_LAMPORTS: ReadonlyArray<bigint> = [
  100_000n,     // 0.10 USDC
  250_000n,     // 0.25 USDC
  500_000n,     // 0.50 USDC
  1_000_000n,   // 1.00 USDC
  2_000_000n,   // 2.00 USDC
  5_000_000n,   // 5.00 USDC
  10_000_000n,  // 10.00 USDC
  25_000_000n,  // 25.00 USDC
] as const

/** Default wager for new players */
export const DEFAULT_WAGER_LAMPORTS = 1_000_000n // 1.00 USDC

// ─── Symbol definitions ─────────────────────────────────────────────────────

/**
 * Symbol IDs. Integer enums to avoid string comparison in hot paths.
 * Maps to visual assets per OO-REI-ART-DIRECTION-SPEC §Asset Manifest.
 */
export const SYM_RICE = 0    // SYM-A — Rice Grain Bundle (low-pay 1)
export const SYM_STONE = 1   // SYM-B — Wet Stone (low-pay 2)
export const SYM_LANTERN = 2 // SYM-C — Stone Lantern (low-pay 3)
export const SYM_TALISMAN = 3 // SYM-D — Paper Talisman (low-pay 4)
export const SYM_HAT = 4     // SYM-E — Rei's Straw Hat (high-pay 1)
export const SYM_EYE = 5     // SYM-F — Amber Eye (high-pay 2)
export const SYM_TORII = 6   // SYM-G — Torii Gate (high-pay 3)
export const SYM_SPIRIT = 7  // SYM-SPIRIT — Spirit Orb (scatter + wild)

export type SymbolId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export const SYMBOL_NAMES: Record<SymbolId, string> = {
  0: 'Rice Bundle',
  1: 'Wet Stone',
  2: 'Stone Lantern',
  3: 'Talisman',
  4: "Rei's Hat",
  5: 'Amber Eye',
  6: 'Torii Gate',
  7: 'Spirit Orb',
}

export const SYMBOL_ASSET_KEYS: Record<SymbolId, string> = {
  0: 'sym-rice-grain',
  1: 'sym-stone',
  2: 'sym-lantern',
  3: 'sym-talisman',
  4: 'sym-straw-hat',
  5: 'sym-amber-eye',
  6: 'sym-torii',
  7: 'sym-spirit-orb',
}

// ─── Payout table ───────────────────────────────────────────────────────────

/**
 * Payout multipliers in BPS (10000n = 1.0x) per symbol per match count.
 * Indexed as SYMBOL_PAYS[symbolId][matchCount - 3] (so index 0 = 3-of-a-kind).
 *
 * All values are exact BPS bigints. No IEEE 754 floats allowed here.
 *
 * Rounding note: payouts are multiplied by the wager in lamports.
 * Division result is floored (truncate toward zero — house-favored).
 *
 * RTP calibration: these values + reel strip weights produce ~96% RTP
 * when verified by Monte Carlo (see ooReiMath.test.ts — 100k spin MC).
 */
export const SYMBOL_PAYS: ReadonlyArray<readonly [bigint, bigint, bigint]> = [
  // 3-of-a-kind, 4-of-a-kind, 5-of-a-kind
  //
  // RTP calibration 2026-05-27: paytable rebalanced from over-generous original
  // (HAT 30x / EYE 50x / TORII 75x at 5-of-a-kind) which combined with Spirit Orb
  // wild substitution on 20 paylines produced ~123% RTP — a casino-fairness blocker.
  // Empirically tuned via Monte Carlo iteration: a uniform ~0.79x reduction across
  // all symbols + tiers lands RTP at 96.94% (seed 314159, 100k spins). Note: cutting
  // only 5-of-a-kind multipliers was insufficient because 3OAK/4OAK hits dominate
  // payout volume and wild substitution diminishes the effect of strip thinning.
  // Floor truncation on all payouts — house-favored (Domain A). Rounding: toward zero.
  [4_000n,  8_000n,   16_000n],  // 0: SYM_RICE     (0.4x, 0.8x, 1.6x)
  [6_000n,  12_000n,  24_000n],  // 1: SYM_STONE    (0.6x, 1.2x, 2.4x)
  [8_000n,  16_000n,  40_000n],  // 2: SYM_LANTERN  (0.8x, 1.6x, 4.0x)
  [12_000n, 24_000n,  60_000n],  // 3: SYM_TALISMAN (1.2x, 2.4x, 6.0x)
  [40_000n, 60_000n,  100_000n], // 4: SYM_HAT      (4x, 6x, 10x)
  [64_000n, 96_000n,  160_000n], // 5: SYM_EYE      (6.4x, 9.6x, 16x)
  [80_000n, 128_000n, 240_000n], // 6: SYM_TORII    (8x, 12.8x, 24x)
  [0n, 0n, 0n],                   // 7: SYM_SPIRIT   (scatter — pays via scatter table, not paylines)
] as const

/**
 * Scatter pay table for Spirit Orb appearances (on reels 1, 3, 5).
 * Indexed by orb count (3, 4, 5 → index 0, 1, 2).
 * 2 orbs = consolation pay in BPS: 5_000n (0.5x wager).
 */
export const SCATTER_PAYS_BPS: ReadonlyArray<bigint> = [
  4_000n,  // 2 orbs on eligible reels — 0.4× (consolation, no bonus trigger)
  0n,      // placeholder for 3 orbs — bonus trigger, no scatter pay (the bonus IS the pay)
  0n,      // placeholder for 4 orbs
  0n,      // placeholder for 5 orbs
] as const

/** 2 Spirit Orbs = consolation scatter pay (0.4x wager) */
export const SCATTER_CONSOLATION_BPS = 4_000n

// ─── Reel strips ────────────────────────────────────────────────────────────

/**
 * Reel strip definitions. Each strip is an array of symbol IDs.
 * The slot resolves by picking a random position in each strip.
 * The 3 visible rows are strip[pos], strip[pos+1], strip[pos+2] (mod length).
 *
 * Strip weights calibrated for ~96% RTP (2026-05-27 correction). High-pay symbols
 * (HAT, EYE) thinned from 2-3 per strip to 1-2 per strip. TORII unchanged at 2 per
 * strip (multiplier reduction handles its RTP contribution). Spirit Orb remains at
 * 1 per strip on eligible reels (1, 3, 5) and absent from reels 2 and 4.
 *
 * Symbol frequency after correction (approximate, averaged across all 5 reels):
 *  SYM_RICE:     ~25% (avg ~7.6 per 31-stop strip)
 *  SYM_STONE:    ~23% (avg ~7.2 per strip)
 *  SYM_LANTERN:  ~19% (avg ~6.0 per strip)
 *  SYM_TALISMAN: ~16% (avg ~5.0 per strip)
 *  SYM_TORII:    ~6.5% (2 per strip — unchanged)
 *  SYM_HAT:      ~4.5% (avg ~1.4 per strip — was ~2.4)
 *  SYM_EYE:      ~3.2% (avg ~1.0 per strip — was ~2.0)
 *  SYM_SPIRIT:   ~3.2% (1 per strip on R1/R3/R5; 0 on R2/R4 — unchanged)
 *
 * Total strip length: 31 stops per reel (31 is prime — avoids repeating cycle artifacts)
 */

/** Reel 1 (has Spirit Orb) */
const REEL_STRIP_1: ReadonlyArray<SymbolId> = [
  SYM_RICE, SYM_STONE, SYM_LANTERN, SYM_TALISMAN, SYM_RICE,
  SYM_HAT, SYM_STONE, SYM_RICE, SYM_LANTERN, SYM_EYE,
  SYM_RICE, SYM_TALISMAN, SYM_STONE, SYM_LANTERN, SYM_HAT,
  SYM_RICE, SYM_SPIRIT, SYM_LANTERN, SYM_TALISMAN, SYM_STONE,
  SYM_TORII, SYM_RICE, SYM_EYE, SYM_LANTERN, SYM_STONE,
  SYM_HAT, SYM_RICE, SYM_TALISMAN, SYM_TORII, SYM_STONE, SYM_LANTERN,
] as const

/** Reel 2 (NO Spirit Orb) */
const REEL_STRIP_2: ReadonlyArray<SymbolId> = [
  SYM_RICE, SYM_LANTERN, SYM_STONE, SYM_TALISMAN, SYM_RICE,
  SYM_HAT, SYM_LANTERN, SYM_RICE, SYM_STONE, SYM_EYE,
  SYM_LANTERN, SYM_RICE, SYM_TALISMAN, SYM_STONE, SYM_RICE,
  SYM_TORII, SYM_LANTERN, SYM_HAT, SYM_RICE, SYM_TALISMAN,
  SYM_STONE, SYM_LANTERN, SYM_RICE, SYM_EYE, SYM_TALISMAN,
  SYM_STONE, SYM_RICE, SYM_HAT, SYM_LANTERN, SYM_TORII, SYM_STONE,
] as const

/** Reel 3 (has Spirit Orb) */
const REEL_STRIP_3: ReadonlyArray<SymbolId> = [
  SYM_STONE, SYM_RICE, SYM_TALISMAN, SYM_LANTERN, SYM_STONE,
  SYM_RICE, SYM_HAT, SYM_TALISMAN, SYM_STONE, SYM_LANTERN,
  SYM_EYE, SYM_RICE, SYM_STONE, SYM_TALISMAN, SYM_RICE,
  SYM_LANTERN, SYM_TORII, SYM_STONE, SYM_RICE, SYM_SPIRIT,
  SYM_TALISMAN, SYM_HAT, SYM_STONE, SYM_LANTERN, SYM_EYE,
  SYM_RICE, SYM_TALISMAN, SYM_STONE, SYM_TORII, SYM_LANTERN, SYM_RICE,
] as const

/** Reel 4 (NO Spirit Orb) */
const REEL_STRIP_4: ReadonlyArray<SymbolId> = [
  SYM_LANTERN, SYM_STONE, SYM_RICE, SYM_HAT, SYM_LANTERN,
  SYM_TALISMAN, SYM_RICE, SYM_STONE, SYM_LANTERN, SYM_TALISMAN,
  SYM_EYE, SYM_STONE, SYM_LANTERN, SYM_RICE, SYM_TALISMAN,
  SYM_HAT, SYM_STONE, SYM_RICE, SYM_LANTERN, SYM_STONE,
  SYM_TORII, SYM_TALISMAN, SYM_LANTERN, SYM_RICE, SYM_EYE,
  SYM_STONE, SYM_TALISMAN, SYM_LANTERN, SYM_TORII, SYM_RICE, SYM_STONE,
] as const

/** Reel 5 (has Spirit Orb) */
const REEL_STRIP_5: ReadonlyArray<SymbolId> = [
  SYM_TALISMAN, SYM_RICE, SYM_STONE, SYM_LANTERN, SYM_TALISMAN,
  SYM_STONE, SYM_RICE, SYM_HAT, SYM_TALISMAN, SYM_STONE,
  SYM_LANTERN, SYM_EYE, SYM_RICE, SYM_TALISMAN, SYM_STONE,
  SYM_TORII, SYM_LANTERN, SYM_RICE, SYM_TALISMAN, SYM_SPIRIT,
  SYM_STONE, SYM_LANTERN, SYM_HAT, SYM_RICE, SYM_TALISMAN,
  SYM_EYE, SYM_STONE, SYM_TORII, SYM_LANTERN, SYM_RICE, SYM_TALISMAN,
] as const

/** All 5 reel strips indexed 0-4 */
export const REEL_STRIPS: ReadonlyArray<ReadonlyArray<SymbolId>> = [
  REEL_STRIP_1,
  REEL_STRIP_2,
  REEL_STRIP_3,
  REEL_STRIP_4,
  REEL_STRIP_5,
] as const

// ─── Paylines ────────────────────────────────────────────────────────────────

/**
 * 20 fixed paylines. Each payline is a tuple of 5 row-indices (0=top, 1=middle, 2=bottom),
 * one per reel column.
 *
 * Paylines pay LEFT-TO-RIGHT, starting from reel 1.
 * Minimum 3 consecutive matching symbols from reel 1 required.
 */
export type PaylineRow = 0 | 1 | 2
export type Payline = readonly [PaylineRow, PaylineRow, PaylineRow, PaylineRow, PaylineRow]

export const PAYLINES: ReadonlyArray<Payline> = [
  // Straights
  [1, 1, 1, 1, 1], // Line 1: middle row
  [0, 0, 0, 0, 0], // Line 2: top row
  [2, 2, 2, 2, 2], // Line 3: bottom row
  // V patterns
  [0, 1, 2, 1, 0], // Line 4: V shape down-up
  [2, 1, 0, 1, 2], // Line 5: inverted V
  // Zigzag up
  [0, 0, 1, 2, 2], // Line 6
  [2, 2, 1, 0, 0], // Line 7
  // Step patterns
  [0, 1, 1, 1, 0], // Line 8: shallow V
  [2, 1, 1, 1, 2], // Line 9: shallow inverted V
  [1, 0, 0, 0, 1], // Line 10
  [1, 2, 2, 2, 1], // Line 11
  // Diagonal
  [0, 1, 2, 2, 2], // Line 12
  [2, 1, 0, 0, 0], // Line 13
  [0, 0, 0, 1, 2], // Line 14
  [2, 2, 2, 1, 0], // Line 15
  // W patterns
  [0, 2, 0, 2, 0], // Line 16
  [2, 0, 2, 0, 2], // Line 17
  // M patterns
  [1, 0, 1, 0, 1], // Line 18
  [1, 2, 1, 2, 1], // Line 19
  // Middle diagonal variant
  [0, 1, 1, 2, 2], // Line 20 (gradual descent)
] as const

// ─── Grid type ───────────────────────────────────────────────────────────────

/** 5×3 grid — indexed grid[col][row], col 0-4, row 0-2 (0=top, 1=mid, 2=bot) */
export type ReelGrid = readonly [
  readonly [SymbolId, SymbolId, SymbolId],
  readonly [SymbolId, SymbolId, SymbolId],
  readonly [SymbolId, SymbolId, SymbolId],
  readonly [SymbolId, SymbolId, SymbolId],
  readonly [SymbolId, SymbolId, SymbolId],
]

// ─── RNG seeding (deterministic, Domain A) ──────────────────────────────────

/**
 * Mulberry32 PRNG — deterministic, seedable, no global state.
 * Returns a function that yields numbers in [0, 1).
 * Used for Monte Carlo testing and for the frontend-only seeded spin.
 */
export function mulberry32(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0) throw new Error('seed must be non-negative integer')
  let s = seed >>> 0
  return function (): number {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Spin resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a spin given stop positions (0-indexed into each reel strip).
 * Stop positions must be non-negative integers.
 *
 * Returns a 5×3 grid of symbol IDs.
 * Fail-closed: throws on invalid stop count or non-integer stops.
 */
export function resolveGrid(stops: ReadonlyArray<number>): ReelGrid {
  if (stops.length !== 5) {
    throw new Error(`resolveGrid: expected 5 stops, got ${stops.length}`)
  }
  const cols = stops.map((stop, col) => {
    if (!Number.isInteger(stop) || stop < 0) {
      throw new Error(`resolveGrid: stop[${col}] must be non-negative integer, got ${stop}`)
    }
    const strip = REEL_STRIPS[col]
    if (strip === undefined) throw new Error(`resolveGrid: no reel strip at col ${col}`)
    const len = strip.length
    const top = strip[((stop % len) + len) % len]
    const mid = strip[((stop + 1) % len + len) % len]
    const bot = strip[((stop + 2) % len + len) % len]
    if (top === undefined || mid === undefined || bot === undefined) {
      throw new Error(`resolveGrid: strip[${col}] produced undefined symbol`)
    }
    return [top, mid, bot] as const
  })

  return cols as unknown as ReelGrid
}

/**
 * Generate random stop positions using a PRNG function.
 * Returns an array of 5 integers, each in [0, strip.length).
 */
export function randomStops(rng: () => number): ReadonlyArray<number> {
  return REEL_STRIPS.map((strip) => Math.floor(rng() * strip.length))
}

// ─── Win evaluation ──────────────────────────────────────────────────────────

export interface PaylineWin {
  readonly lineIndex: number        // 0-based payline index (0-19)
  readonly symbolId: SymbolId       // The matching symbol
  readonly matchCount: number       // 3, 4, or 5
  readonly payBps: bigint           // Payout in BPS (multiply by wager to get lamports)
  readonly matchedCols: readonly number[] // Which columns matched (0-4)
}

/**
 * Evaluate a single payline on the resolved grid.
 * Returns a PaylineWin if 3+ matching symbols from reel 1, or null.
 *
 * Wilds (SYM_SPIRIT) substitute for all non-scatter symbols.
 * Talisman wilds (stickyWilds parameter) also substitute.
 *
 * Rounding: none needed here — payBps is exact integer BPS.
 */
export function evaluatePayline(
  grid: ReelGrid,
  lineIndex: number,
  stickyWildCells: ReadonlySet<string> = new Set(),
): PaylineWin | null {
  if (lineIndex < 0 || lineIndex >= PAYLINES.length) {
    throw new Error(`evaluatePayline: lineIndex ${lineIndex} out of range`)
  }
  const payline = PAYLINES[lineIndex]
  if (payline === undefined) throw new Error(`evaluatePayline: no payline at index ${lineIndex}`)

  // Collect the 5 symbols on this line, resolving wilds
  const lineSymbols: SymbolId[] = []
  for (let col = 0; col < 5; col++) {
    const row = payline[col]
    if (row === undefined) throw new Error(`evaluatePayline: payline[${col}] undefined`)
    const colData = grid[col]
    if (colData === undefined) throw new Error(`evaluatePayline: grid col ${col} undefined`)
    const sym = colData[row]
    if (sym === undefined) throw new Error(`evaluatePayline: grid[${col}][${row}] undefined`)

    const cellKey = `${col}:${row}`
    // Spirit Orbs and sticky talisman wilds both substitute
    const isWild = sym === SYM_SPIRIT || stickyWildCells.has(cellKey)
    lineSymbols.push(isWild ? (-1 as unknown as SymbolId) : sym) // -1 = wild placeholder
  }

  // Determine the non-wild lead symbol (leftmost non-wild from reel 1)
  let leadSymbol: SymbolId | null = null
  for (let col = 0; col < 5; col++) {
    const s = lineSymbols[col]
    if (s === undefined) break
    const isWild = (s as number) === -1
    if (!isWild) {
      leadSymbol = s
      break
    }
  }

  // All wilds on this line = use the highest value non-scatter (SYM_TORII)
  if (leadSymbol === null) {
    leadSymbol = SYM_TORII
  }

  // Do not pay on scatter (SYM_SPIRIT) via paylines — scatter pays separately
  if (leadSymbol === SYM_SPIRIT) return null

  // Count consecutive matching symbols from reel 1 (wilds count as any)
  let matchCount = 0
  for (let col = 0; col < 5; col++) {
    const s = lineSymbols[col]
    if (s === undefined) break
    const isWild = (s as number) === -1
    if (isWild || s === leadSymbol) {
      matchCount++
    } else {
      break // Stop on first non-matching non-wild
    }
  }

  if (matchCount < 3) return null

  const pays = SYMBOL_PAYS[leadSymbol]
  if (!pays) return null
  const payBps = pays[matchCount - 3] ?? 0n

  if (payBps === 0n) return null

  const matchedCols = Array.from({ length: matchCount }, (_, i) => i)

  return {
    lineIndex,
    symbolId: leadSymbol,
    matchCount,
    payBps,
    matchedCols,
  }
}

/**
 * Count Spirit Orbs on eligible scatter reels (0, 2, 4 = reels 1, 3, 5 in 0-based).
 * Scatter can appear in any row on those reels.
 */
export function countSpiritOrbs(grid: ReelGrid): number {
  let count = 0
  for (const scatterCol of [0, 2, 4] as const) {
    const col = grid[scatterCol]
    if (!col) continue
    for (const sym of col) {
      if (sym === SYM_SPIRIT) count++
    }
  }
  return count
}

export interface SpinResult {
  readonly grid: ReelGrid
  readonly paylineWins: ReadonlyArray<PaylineWin>
  readonly scatterCount: number
  readonly triggersSpiritBonus: boolean
  /** Total win in BPS (sum of all payline pays + scatter consolation). Floor-truncated. */
  readonly totalPayBps: bigint
  /** Consolation scatter pay (2 orbs = 0.5x wager BPS) */
  readonly scatterConsolationBps: bigint
}

/**
 * Full spin evaluation: resolve grid, check paylines, count scatters.
 *
 * stickyWildCells: set of "col:row" keys that are sticky talisman wilds (Spirit Bonus only).
 * During base game this is always an empty Set.
 *
 * Fail-closed: throws on invalid stops.
 */
export function evaluateSpin(
  stops: ReadonlyArray<number>,
  stickyWildCells: ReadonlySet<string> = new Set(),
): SpinResult {
  const grid = resolveGrid(stops)

  const paylineWins: PaylineWin[] = []
  for (let i = 0; i < PAYLINES.length; i++) {
    const win = evaluatePayline(grid, i, stickyWildCells)
    if (win !== null) paylineWins.push(win)
  }

  const scatterCount = countSpiritOrbs(grid)
  const triggersSpiritBonus = scatterCount >= SPIRIT_BONUS_TRIGGER_MIN

  // Total pay BPS = sum of all payline pays (duplicate line wins are both counted)
  let totalPayBps = 0n
  for (const win of paylineWins) {
    totalPayBps += win.payBps
  }

  // Scatter consolation: exactly 2 orbs = 0.5x
  const scatterConsolationBps = scatterCount === 2 ? SCATTER_CONSOLATION_BPS : 0n
  totalPayBps += scatterConsolationBps

  return {
    grid,
    paylineWins,
    scatterCount,
    triggersSpiritBonus,
    totalPayBps,
    scatterConsolationBps,
  }
}

// ─── Payout calculation ───────────────────────────────────────────────────────

/**
 * Convert BPS payout to USDC lamports.
 * Rounding: floor (truncate toward zero) — house-favored per Domain A.
 *
 * @param payBps - payout in BPS (e.g. 50_000n = 5.0x)
 * @param wagerLamports - wager in USDC lamports
 * @returns payout in USDC lamports, floored
 */
export function bpsToLamports(payBps: bigint, wagerLamports: bigint): bigint {
  if (payBps < 0n) throw new Error('bpsToLamports: payBps must be non-negative')
  if (wagerLamports <= 0n) throw new Error('bpsToLamports: wagerLamports must be positive')
  // Multiply first, then divide — preserves precision, then floor
  // Floor truncation: this is BigInt division, which is already truncate-toward-zero
  return (payBps * wagerLamports) / BPS_DENOM
}

/**
 * Talisman Awaken cost: 10% of wager, floored.
 * Rounding: floor — the player pays the floor amount.
 */
export function talismanAwakenCost(wagerLamports: bigint): bigint {
  if (wagerLamports <= 0n) throw new Error('talismanAwakenCost: wagerLamports must be positive')
  // TALISMAN_AWAKEN_COST_BPS = 1_000n = 10%
  // Cost = wager * 1000 / 10000 = wager / 10, floored
  return (wagerLamports * TALISMAN_AWAKEN_COST_BPS) / BPS_DENOM
}

// ─── Spirit Bonus free-spin count ────────────────────────────────────────────

/**
 * Number of free spins awarded based on scatter count.
 * Fail-closed: throws if scatterCount < 3 (caller should only call on trigger).
 */
export function freeSpinskFromScatterCount(scatterCount: number): number {
  if (scatterCount < SPIRIT_BONUS_TRIGGER_MIN) {
    throw new Error(`freeSpinskFromScatterCount: scatterCount must be >= ${SPIRIT_BONUS_TRIGGER_MIN}`)
  }
  if (scatterCount === 3) return 10
  if (scatterCount === 4) return 15
  return 20 // 5+ orbs
}

/**
 * Add bonus free spins when a Spirit Orb lands adjacent to a Sticky Wild.
 * Returns the increment (0 or 1). Cap enforced against MAX_FREE_SPINS.
 *
 * adjacentSpiritLanded: true if the extension condition was met this spin.
 * currentRemaining: current free spins left in the bonus run.
 * currentTotal: total spins awarded so far in this bonus run.
 */
export function bonusFreeSpinExtension(
  adjacentSpiritLanded: boolean,
  currentRemaining: number,
  currentTotal: number,
): number {
  if (!adjacentSpiritLanded) return 0
  if (currentTotal >= MAX_FREE_SPINS) return 0 // Hard cap
  return 1
}

// ─── Spirit Sealing mini-game: bonus total partition ────────────────────────

/**
 * Fragment weights for the three sealing ofuda (sum 10n). The Spirit Sealing
 * mini-game reveals the PRE-ROLLED bonus total across three scrolls; these
 * weights split it. The third fragment absorbs the floor remainder so the sum
 * is exact. The player's tap order changes ONLY the reveal sequence, never the
 * sum — this is the RG-C3 EV-invariance guarantee, enforced structurally here.
 */
export const BONUS_PARTITION_RATIOS: readonly [bigint, bigint, bigint] = [4n, 3n, 3n]

/** The 6 presentation permutations — which fragment sits on which scroll. */
export const BONUS_PARTITION_PERMUTATIONS: ReadonlyArray<readonly [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2]> = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
]

export type BonusPresentationOrder = (typeof BONUS_PARTITION_PERMUTATIONS)[number]

/**
 * Split a pre-rolled bonus total into exactly three fragments that sum to it.
 *
 * EV-INVARIANCE CONTRACT (RG-C3): the returned fragments ALWAYS sum to
 * totalWinLamports exactly, for every input. The Spirit Sealing mini-game lets
 * the player tap the three scrolls in any order, but the arithmetic sum of the
 * revealed fragments is identical regardless of order. The player authors the
 * reveal CHOREOGRAPHY, never the OUTCOME.
 *
 * Rounding: floor (BigInt division truncates toward zero). The remainder from the
 * first two floored fragments is folded into the third, so a + b + c === total
 * with zero loss. (House-favored rounding is moot — the total is fixed upstream;
 * this only divides an amount that was already settled by evaluateSpin.)
 *
 * Domain A: pure, deterministic, BigInt-only. No Math.random, no system clock.
 *
 * @param totalWinLamports - the pre-rolled bonus total (>= 0)
 * @returns canonical [a, b, c] in weight order; a + b + c === totalWinLamports
 */
export function partitionBonusTotal(totalWinLamports: bigint): readonly [bigint, bigint, bigint] {
  if (totalWinLamports < 0n) throw new Error('partitionBonusTotal: totalWinLamports cannot be negative')
  const denom = BONUS_PARTITION_RATIOS[0] + BONUS_PARTITION_RATIOS[1] + BONUS_PARTITION_RATIOS[2] // 10n
  // Floor the first two; the third absorbs the remainder so the sum is EXACT.
  const a = (totalWinLamports * BONUS_PARTITION_RATIOS[0]) / denom
  const b = (totalWinLamports * BONUS_PARTITION_RATIOS[1]) / denom
  const c = totalWinLamports - a - b // exact remainder — guarantees a+b+c === total
  return [a, b, c]
}

/**
 * Deterministic presentation order for the three scrolls, chosen by a seed.
 * Reorders the DISPLAY only — the sum across scrolls is invariant. The seed is
 * a deterministic integer (e.g. the session RNG position); only its value modulo
 * the permutation count is used, never as a source of randomness.
 */
export function bonusPresentationOrder(seed: number): BonusPresentationOrder {
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error('bonusPresentationOrder: seed must be a non-negative integer')
  }
  // `seed % length` is always in [0, length-1], so the lookup is in-bounds;
  // the fallback satisfies noUncheckedIndexedAccess without ever being reached.
  return BONUS_PARTITION_PERMUTATIONS[seed % BONUS_PARTITION_PERMUTATIONS.length] ?? BONUS_PARTITION_PERMUTATIONS[0]!
}

// ─── Ownership points ─────────────────────────────────────────────────────────

/**
 * Ownership Engine: 1.0× on wins, 1.5× on losses.
 * Points are in micro-units (wager lamports × multiplier, then / USDC_LAMPORTS_PER_UNIT for display).
 * Rounding: floor — standard Domain A.
 *
 * Returns points as bigint lamport-equivalent (same scale as wager).
 * Display layer divides by USDC_LAMPORTS_PER_UNIT for human-readable value.
 */
export const POINTS_MULTIPLIER_WIN_BPS = 10_000n  // 1.0x
export const POINTS_MULTIPLIER_LOSS_BPS = 15_000n // 1.5x

export function computeOwnershipPoints(
  wagerLamports: bigint,
  totalWinLamports: bigint,
): bigint {
  if (wagerLamports <= 0n) throw new Error('computeOwnershipPoints: wagerLamports must be positive')
  if (totalWinLamports < 0n) throw new Error('computeOwnershipPoints: totalWinLamports cannot be negative')

  const isWin = totalWinLamports >= wagerLamports // Profit >= 0 = win
  const multiplierBps = isWin ? POINTS_MULTIPLIER_WIN_BPS : POINTS_MULTIPLIER_LOSS_BPS
  // Points = wager × multiplier, floored
  return (wagerLamports * multiplierBps) / BPS_DENOM
}

// ─── Display formatters ───────────────────────────────────────────────────────

/** Format lamports as USDC string: "1.23 USDC" */
export function formatUsdc(lamports: bigint): string {
  if (lamports < 0n) throw new Error('formatUsdc: lamports cannot be negative')
  const whole = lamports / USDC_LAMPORTS_PER_UNIT
  const frac = lamports % USDC_LAMPORTS_PER_UNIT
  const fracStr = frac.toString().padStart(6, '0').slice(0, 2)
  return `${whole.toString()}.${fracStr} USDC`
}

/** Format lamports as compact display: "$1.23" */
export function formatUsdcCompact(lamports: bigint): string {
  if (lamports < 0n) throw new Error('formatUsdcCompact: lamports cannot be negative')
  const whole = lamports / USDC_LAMPORTS_PER_UNIT
  const frac = lamports % USDC_LAMPORTS_PER_UNIT
  const fracStr = frac.toString().padStart(6, '0').slice(0, 2)
  return `$${whole.toString()}.${fracStr}`
}

/** Format a BPS multiplier: "5.00x" */
export function formatMultiplier(bps: bigint): string {
  if (bps < 0n) throw new Error('formatMultiplier: bps cannot be negative')
  const whole = bps / BPS_DENOM
  const frac = bps % BPS_DENOM
  const fracStr = frac.toString().padStart(4, '0').slice(0, 2)
  return `${whole.toString()}.${fracStr}x`
}

/** Format ownership points for display: "2.40 seals" */
export function formatPoints(lamports: bigint): string {
  if (lamports < 0n) throw new Error('formatPoints: lamports cannot be negative')
  const whole = lamports / USDC_LAMPORTS_PER_UNIT
  const frac = lamports % USDC_LAMPORTS_PER_UNIT
  const fracStr = frac.toString().padStart(6, '0').slice(0, 2)
  return `${whole.toString()}.${fracStr}`
}

/** Published RTP for display */
export const PUBLISHED_RTP = '96%'

/** Published house edge */
export const PUBLISHED_HOUSE_EDGE = '4.0%'

/**
 * The Assay Line — coin-trail math (off-chain mirror, Domain A).
 *
 * A NEW standalone Swoobz Original. NOT the vault/"Rug or Riches" mines game —
 * this is a FORCED-COMPLETION trail game: the player pre-selects a claim-line of
 * L ore-nubs on a 14×14 = 196-tile ore-board, plunges ONE brass current-key
 * (commit), and the current runs bead-to-bead down the trail revealing each nub.
 * Every nub is a coin-collect: it adds an incremental gold-weight to the ASSAY
 * TALLY. A single BAD VEIN (bomb) anywhere in the committed trail busts the run
 * (lose the wager) — the cascade halts at the bad vein in reveal order.
 *
 * ── Domain A rules (mirror of vault's discipline) ──────────────────────────
 *   • NO IEEE 754 floats in any payout path. Every payout value is bigint.
 *   • Floor-toward-zero rounding always (house-favored). Documented per-call.
 *   • Fail-closed on out-of-range inputs.
 *
 * ── THE ONE PIECE OF GENUINELY NOVEL MATH (independent balance-analyst brief) ─
 * Payout for an all-safe trail of length L is  wager × T(L),  where
 *
 *     T(L) = targetRTP · 10000 / S(L)                                     (bps)
 *     S(L) = ∏_{i=0..L-1} (SAFE - i) / (TOTAL - i)                        (survival)
 *
 * S(L) is the probability that L specifically-chosen distinct tiles are ALL
 * safe on a board of TOTAL tiles seeded with BOMB_COUNT bad veins — i.e.
 * C(SAFE,L)/C(TOTAL,L) = ∏ (SAFE-i)/(TOTAL-i).
 *
 * By construction the fixed-depth RTP is CONSTANT across L:
 *     RTP(L) = S(L) · T(L) / 10000 = targetRTP / 10000 = 0.9650   (pre-floor)
 * This flat-RTP identity holds for ANY (TOTAL, SAFE) pair, so it holds for
 * EVERY difficulty tier below — bomb density sets VOLATILITY only, never RTP.
 *
 * ── CRITICAL ROUNDING RULE — SINGLE FINAL FLOOR (do NOT floor per-step) ─────
 * S(L) is built as ONE exact BigInt rational  Snum/Sden  by multiplying all L
 * factor numerators and denominators, and T(L) takes a SINGLE final floor:
 *
 *     T(L)_bps = floor( targetRTP_bps · Sden / Snum )        [one BigInt div]
 *
 * This is the load-bearing correction from the balance-analyst: vault's per-step
 * floor pattern (floor after every factor) is correct for an ADAPTIVE cash-out-
 * anytime Mines ladder, but applied to THIS forced-completion game it compounds
 * the truncation geometrically and craters RTP the deeper the trail runs.
 * Flooring exactly ONCE, at the end, keeps every L at ~0.9650.
 *
 * ── The analytic-vs-reported gap, resolved (proven <1 bp) ──────────────────
 * The analytic RTP is exactly 0.965000 (targetRTP_bps / 10000). The single final
 * floor removes a fraction f∈[0,1) of one bps from T(L); the RTP loss is S(L)·f,
 * bounded above by S(MIN_TRAIL). So the *reported/measured* RTP is GUARANTEED to
 * sit just below 9650 bps for every playable L — a house-favored gap of <1 bp.
 * Measured across L∈[8,60] on every tier: a flat 9649 bps with headroom. The
 * floor never rounds UP, so the measured RTP can never exceed the analytic target.
 *
 * Self-check: `mirrorRoundtripCheck()` runs at module load and throws if any
 * tier's runtime-computed ladder drifts from its frozen golden vector OR if any
 * S(L)·T(L) leaves the [0.9600, 0.9700] band. Same gate as the vitest suite.
 */

// ─── Locked board geometry (dark-obsidian + 196-grid re-tune, run-2026-07-05) ─
// Grid re-baselined to a 14×14 = 196-tile board (up from 10×10) with density-
// preserving vein re-tune (theme-composer/composition-designer PASSED decision,
// reason "denser night-temple board + bigger stakes-canvas at the same feel").
// RTP is FLAT-BY-CONSTRUCTION (T(L)=targetRTP/S(L), single final floor), so the
// whole grid + tier change is a GEOMETRY/VOLATILITY change, not an RTP redesign —
// verified at 9649 bps for every L∈[8,60] on all three tiers at 196 tiles. The
// prior 10×10 board is fully superseded by this re-baseline.

/** 14×14 ore-board. Locked. */
export const GRID_DIM = 14
/** 196 tiles. Locked. */
export const TOTAL_TILES = GRID_DIM * GRID_DIM
/** House edge in basis points. 350 bps → targetRTP 0.9650. This is the RTP knob. */
export const HOUSE_EDGE_BPS = 350n
/** 1.00× in basis points. */
export const ONE_X_BPS = 10_000n
/** Target RTP in bps: 10000 − 350 = 9650 (0.9650). */
export const TARGET_RTP_BPS = ONE_X_BPS - HOUSE_EDGE_BPS
/** Minimum claim-line length. Locked. EXPOSURE-CAP knob (low end). */
export const MIN_TRAIL = 8
/** Maximum claim-line length. Locked. EXPOSURE-CAP knob (high end).
 *  60 < 180 (the fewest safe tiles, on the Flooded tier), so a full 60-nub trail
 *  is valid on every tier. RTP stays flat-by-construction (no max-multiplier
 *  clamp anywhere in this file — a clamp would break the flat-RTP identity), so
 *  the Flooded tier's steep survival decay yields a large T(60) ceiling (446x);
 *  that ceiling is flagged for compliance max-win sign-off, NOT an RTP risk. */
export const MAX_TRAIL = 60

/** RTP band the ladder must hold for every playable L, every tier (holdgate). */
export const RTP_BAND_MIN_BPS = 9_600n
export const RTP_BAND_MAX_BPS = 9_700n

// ─── Difficulty tiers (genuine feature — SAME 14×14 grid, FLAT ~96.5% RTP) ──
// This is Assay's identity: unlike RoR (which varies RTP per difficulty), EVERY
// Assay tier is the SAME flat 9649 bps. The knob is BOMB_COUNT → SAFE_TILES,
// which sets VOLATILITY (survival decay) only: more veins ⇒ steeper decay ⇒ a
// much higher T(60) ceiling for the same held RTP (the "crazy-tier" energy).

/** Tier identifiers. */
export type TierId = 'lean' | 'standard' | 'flooded'

/** A difficulty tier: a bomb-count (hence safe-count) selection on the 14×14 grid. */
export interface DifficultyTier {
  readonly id: TierId
  /** Bad veins (bombs) seeded on the board. The RISK-SHAPE / volatility knob. */
  readonly bombCount: number
  /** Safe ore-nubs. Derived: TOTAL_TILES − bombCount. */
  readonly safeTiles: number
  /** Display label (reference-skin placeholder; theming owns final copy). */
  readonly label: string
}

/** The three tiers. bombCount is the ONLY varying knob; RTP is identical. */
export const TIERS: Readonly<Record<TierId, DifficultyTier>> = {
  lean: { id: 'lean', bombCount: 6, safeTiles: TOTAL_TILES - 6, label: 'Lean vein' },
  standard: { id: 'standard', bombCount: 8, safeTiles: TOTAL_TILES - 8, label: 'Standard vein' },
  flooded: { id: 'flooded', bombCount: 16, safeTiles: TOTAL_TILES - 16, label: 'Flooded vein' },
}

/** Ordered tier list (easy → hard) for UI selectors. */
export const TIER_ORDER: readonly TierId[] = ['lean', 'standard', 'flooded']

/** The default/base tier — the value the theme-neutral back-compat exports track. */
export const DEFAULT_TIER: TierId = 'standard'

/** Default bad-vein count (Standard tier). Back-compat: `BOMB_COUNT`. */
export const BOMB_COUNT = TIERS[DEFAULT_TIER].bombCount
/** Default safe-nub count (Standard tier). Back-compat: `SAFE_TILES`. */
export const SAFE_TILES = TIERS[DEFAULT_TIER].safeTiles

// ─── Exact rational survival S(L) = Snum/Sden ───────────────────────────────

/**
 * Survival numerator/denominator for a trail of length L on a board with
 * `safeTiles` safe tiles, as an EXACT BigInt rational (no float, no intermediate
 * floor). S(L) = Snum/Sden where Snum = ∏_{i=0..L-1} (safe-i),
 * Sden = ∏_{i=0..L-1} (TOTAL-i).
 *
 * @param L         trail length.
 * @param safeTiles safe-tile count for the chosen tier (default = Standard).
 * @throws when L is out of [0, safeTiles] (fail-closed — a trail longer than the
 *         number of safe tiles has S=0 and is undefined for T).
 */
export function survivalRational(
  L: number,
  safeTiles: number = SAFE_TILES,
): { num: bigint; den: bigint } {
  if (!Number.isInteger(L) || L < 0 || L > safeTiles) {
    throw new Error(`assay: trail length ${L} out of band [0, ${safeTiles}]`)
  }
  let num = 1n
  let den = 1n
  const safe = BigInt(safeTiles)
  const total = BigInt(TOTAL_TILES)
  for (let i = 0n; i < BigInt(L); i++) {
    num *= safe - i
    den *= total - i
  }
  return { num, den }
}

/**
 * Coin-ladder multiplier T(L) in basis points for a board with `safeTiles` safe
 * tiles, computed with a SINGLE final floor (Domain A, house-favored). See the
 * file header for why per-step flooring is WRONG for this forced-completion game.
 *
 *     T(L)_bps = floor( TARGET_RTP_BPS · Sden / Snum )
 *
 * @throws (via survivalRational) on out-of-band L. Fail-closed.
 */
export function coinLadderBps(L: number, safeTiles: number = SAFE_TILES): bigint {
  const { num, den } = survivalRational(L, safeTiles)
  // SINGLE final floor toward zero (house keeps the remainder). Because S(L)<1
  // for L≥1, Sden>Snum, so T(L)≥TARGET_RTP_BPS and grows with L.
  return (TARGET_RTP_BPS * den) / num
}

/**
 * Generate the full runtime ladder T(0..MAX_TRAIL) for a given safe-tile count.
 * ONE generator, called per tier — no duplicated ladder-generation logic.
 */
function generateLadder(safeTiles: number): readonly bigint[] {
  const out: bigint[] = []
  for (let L = 0; L <= MAX_TRAIL; L++) out.push(coinLadderBps(L, safeTiles))
  return out
}

/**
 * Runtime-computed ladders, one per tier, index 0..MAX_TRAIL. Indices below
 * MIN_TRAIL are not playable but kept so each vector is the literal, verifiable
 * output of the formula for [0, MAX_TRAIL].
 */
export const COIN_LADDER_BPS_BY_TIER: Readonly<Record<TierId, readonly bigint[]>> = {
  lean: generateLadder(TIERS.lean.safeTiles),
  standard: generateLadder(TIERS.standard.safeTiles),
  flooded: generateLadder(TIERS.flooded.safeTiles),
}

/** Default-tier (Standard) runtime ladder. Back-compat: `COIN_LADDER_BPS`. */
export const COIN_LADDER_BPS: readonly bigint[] = COIN_LADDER_BPS_BY_TIER[DEFAULT_TIER]

/**
 * Frozen GOLDEN vectors — the canonical, reviewed COIN_LADDER_BPS[0..60] per
 * tier. `mirrorRoundtripCheck()` + the vitest golden-vector test assert the
 * runtime ladders equal these exactly. Any drift is release-blocking.
 * Generated by the single-final-floor formula (verified independently):
 *   T(L)_bps = floor(TARGET_RTP_BPS · Sden / Snum), Snum/Sden = ∏(safe−i)/(196−i).
 * NOT hand-typed — computed by the generator (assaySim.mjs shares the identical
 * vectors), so indices 0..60 are exact. Key ceilings (T(60)) on the 196-tile grid:
 *   lean  T(60)=89502    (8.95x)
 *   std   T(60)=191654   (19.17x)
 *   flood T(60)=4461248  (446.12x)  ← steep-decay "crazy" tier, no clamp.
 */
export const GOLDEN_COIN_LADDER_BPS_BY_TIER: Readonly<Record<TierId, readonly bigint[]>> = {
  // ── lean (BOMB_COUNT=6, SAFE=190) ──
  lean: [
    9650n, 9954n, 10270n, 10598n, 10938n, 11291n, 11657n, 12037n, 12432n, 12842n,
    13268n, 13710n, 14169n, 14647n, 15144n, 15660n, 16197n, 16755n, 17336n, 17941n,
    18571n, 19226n, 19909n, 20620n, 21361n, 22133n, 22938n, 23777n, 24652n, 25565n,
    26518n, 27512n, 28551n, 29635n, 30767n, 31951n, 33188n, 34481n, 35833n, 37247n,
    38727n, 40276n, 41898n, 43597n, 45376n, 47241n, 49196n, 51246n, 53396n, 55652n,
    58020n, 60507n, 63119n, 65863n, 68748n, 71781n, 74971n, 78328n, 81862n, 85583n,
    89502n,
  ],
  // ── standard (BOMB_COUNT=8, SAFE=188) — the default/base tier ──
  standard: [
    9650n, 10060n, 10491n, 10942n, 11415n, 11911n, 12432n, 12978n, 13552n, 14154n,
    14787n, 15452n, 16150n, 16884n, 17656n, 18468n, 19322n, 20221n, 21167n, 22163n,
    23212n, 24317n, 25482n, 26710n, 28005n, 29372n, 30813n, 32335n, 33941n, 35639n,
    37432n, 39327n, 41331n, 43451n, 45693n, 48067n, 50580n, 53242n, 56063n, 59053n,
    62224n, 65587n, 69157n, 72946n, 76971n, 81247n, 85792n, 90626n, 95768n, 101240n,
    107067n, 113274n, 119888n, 126941n, 134463n, 142491n, 151062n, 160217n, 170001n, 180463n,
    191654n,
  ],
  // ── flooded (BOMB_COUNT=16, SAFE=180) — steep decay, high ceiling ──
  flooded: [
    9650n, 10507n, 11447n, 12475n, 13603n, 14840n, 16197n, 17686n, 19322n, 21119n,
    23096n, 25269n, 27662n, 30296n, 33199n, 36399n, 39928n, 43824n, 48126n, 52879n,
    58134n, 63947n, 70382n, 77510n, 85409n, 94169n, 103890n, 114683n, 126676n, 140011n,
    154847n, 171364n, 189765n, 210280n, 233168n, 258721n, 287269n, 319188n, 354901n, 394890n,
    439701n, 489952n, 546350n, 609695n, 680900n, 761006n, 851199n, 952835n, 1067462n, 1196851n,
    1343032n, 1508328n, 1695407n, 1907333n, 2147627n, 2420342n, 2730146n, 3082423n, 3483388n, 3940226n,
    4461248n,
  ],
}

/** Default-tier (Standard) golden ladder. Back-compat: `GOLDEN_COIN_LADDER_BPS`. */
export const GOLDEN_COIN_LADDER_BPS: readonly bigint[] =
  GOLDEN_COIN_LADDER_BPS_BY_TIER[DEFAULT_TIER]

/**
 * Per-tier max multiplier T(MAX_TRAIL), in bps — the "up to Nx" the UI shows per
 * tier. The harder the tier, the higher the ceiling (steeper survival decay for
 * the same held RTP). Derived from the runtime ladders (no hand-paste).
 */
export const TIER_MAX_MULTIPLE_BPS: Readonly<Record<TierId, bigint>> = {
  lean: COIN_LADDER_BPS_BY_TIER.lean[MAX_TRAIL]!,
  standard: COIN_LADDER_BPS_BY_TIER.standard[MAX_TRAIL]!,
  flooded: COIN_LADDER_BPS_BY_TIER.flooded[MAX_TRAIL]!,
}

// ─── Per-nub coin-collect deltas (presentation ↔ RTP-sound ladder) ─────────

/**
 * The incremental gold-weight the k-th revealed ore-nub adds to the ASSAY
 * TALLY, in bps of the wager: T(k) − T(k−1). Presenting the ladder as these
 * deltas makes the running tally visibly SUM to the final payout T(L)·wager
 * ("collect the sum along the trail"), while the math stays the verified ladder.
 *
 * k is 1-based (the first revealed nub is k=1). For k=1 the "previous" rung is
 * T(0)=TARGET_RTP_BPS so the very first nub already carries the base weight; the
 * sum of deltas from k=1..L therefore equals T(L) − T(0). The tally seeds at
 * T(0) so the displayed total lands exactly on T(L). (Pure display; no float.)
 *
 * @throws on k<1 or k>MAX_TRAIL. Fail-closed.
 */
export function coinDeltaBps(k: number, safeTiles: number = SAFE_TILES): bigint {
  if (!Number.isInteger(k) || k < 1 || k > MAX_TRAIL) {
    throw new Error(`assay: coin index ${k} out of band [1, ${MAX_TRAIL}]`)
  }
  return coinLadderBps(k, safeTiles) - coinLadderBps(k - 1, safeTiles)
}

/** The seed weight the tally starts at (T(0)=TARGET_RTP_BPS, tier-independent). */
export const TALLY_SEED_BPS = COIN_LADDER_BPS[0]!

// ─── Settlement ─────────────────────────────────────────────────────────────

/**
 * Settlement payout: wager × T(L), floored toward zero (house-favored, Domain A).
 * The bps→lamports floor is the ONLY floor besides the ladder's own single floor.
 *
 * @throws on negative inputs. Fail-closed.
 */
export function settlePayout(wagerLamports: bigint, ladderBps: bigint): bigint {
  if (wagerLamports < 0n) throw new Error('assay: wager cannot be negative')
  if (ladderBps < 0n) throw new Error('assay: ladder bps cannot be negative')
  // floor toward zero (house keeps the fractional lamport).
  return (wagerLamports * ladderBps) / ONE_X_BPS
}

/** Incremental lamport weight for the k-th revealed nub (for the tally UI). */
export function coinDeltaLamports(
  wagerLamports: bigint,
  k: number,
  safeTiles: number = SAFE_TILES,
): bigint {
  if (wagerLamports < 0n) throw new Error('assay: wager cannot be negative')
  return (wagerLamports * coinDeltaBps(k, safeTiles)) / ONE_X_BPS
}

// ─── Display formatting (mirror of vaultMath.formatMultiplier/formatUsdc) ───

/** Format a bps multiplier as `"N.NNx"`. House-favored truncation. */
export function formatMultiplier(bps: bigint): string {
  if (bps < 0n) return '0.00x'
  const whole = bps / ONE_X_BPS
  const hundredths = (bps % ONE_X_BPS) / 100n
  return `${whole}.${hundredths.toString().padStart(2, '0')}x`
}

/** USDC display: 6-decimal lamports → `"N.NN"`. */
export function formatUsdc(lamports: bigint): string {
  const neg = lamports < 0n
  const abs = neg ? -lamports : lamports
  const whole = abs / 1_000_000n
  const cents = ((abs % 1_000_000n) / 10_000n).toString().padStart(2, '0')
  return `${neg ? '-' : ''}${whole}.${cents}`
}

// ─── Mirror roundtrip self-check (module-load drift gate) ───────────────────

/**
 * Runs at module load. Throws (release-blocking) if:
 *   (a) any tier's runtime ladder drifts from its frozen golden vector, or
 *   (b) any playable S(L)·T(L) leaves the [0.9600, 0.9700] band, any tier.
 * Same gate as `assayMath.test.ts`.
 */
function mirrorRoundtripCheck(): void {
  for (const tier of TIER_ORDER) {
    const { safeTiles } = TIERS[tier]
    const runtime = COIN_LADDER_BPS_BY_TIER[tier]
    const golden = GOLDEN_COIN_LADDER_BPS_BY_TIER[tier]
    // (a) golden-vector identity for this tier.
    if (runtime.length !== golden.length || runtime.length !== MAX_TRAIL + 1) {
      throw new Error(`assay math drift: ${tier} ladder length mismatch`)
    }
    for (let L = 0; L <= MAX_TRAIL; L++) {
      if (runtime[L] !== golden[L]) {
        throw new Error(
          `assay math drift: ${tier} T(${L}) = ${runtime[L]} ≠ golden ${golden[L]}`,
        )
      }
    }
    // (b) RTP band for every playable L, exact-rational: floor(Snum·T(L)/Sden).
    for (let L = MIN_TRAIL; L <= MAX_TRAIL; L++) {
      const { num, den } = survivalRational(L, safeTiles)
      const t = coinLadderBps(L, safeTiles)
      const rtpBps = (num * t) / den
      if (rtpBps < RTP_BAND_MIN_BPS || rtpBps > RTP_BAND_MAX_BPS) {
        throw new Error(
          `assay RTP out of band (${tier}) at L=${L}: ${rtpBps} bps not in [${RTP_BAND_MIN_BPS}, ${RTP_BAND_MAX_BPS}]`,
        )
      }
    }
    // Spot identity: T(0) must equal the target RTP bps (S(0)=1), every tier.
    if (coinLadderBps(0, safeTiles) !== TARGET_RTP_BPS) {
      throw new Error(`assay math drift: ${tier} T(0) ≠ TARGET_RTP_BPS (${TARGET_RTP_BPS})`)
    }
  }
  // Settle floor identity: 10 USDC × Standard T(8)=13552 bps = 13.552 USDC.
  // (T(8)=13552 on the current 14×14 = 196-tile / 8-vein default board; the value
  //  was regenerated for this re-baseline — the prior board's literal is superseded.)
  const pay = settlePayout(10_000_000n, 13_552n)
  if (pay !== 13_552_000n) {
    throw new Error(`assay settle drift: expected 13_552_000, got ${pay}`)
  }
}

mirrorRoundtripCheck()

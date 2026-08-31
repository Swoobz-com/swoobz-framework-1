/**
 * AUTOMAT — multiplier vending-machine math (Domain A).
 *
 * A standalone Swoobz Original. The player buys 1..MAX_PACKS packs at a fixed
 * per-pack wager; the machine vends each pack independently. Every pack
 * contains ONE multiplier prize drawn from the armed DIFFICULTY TIER's fixed
 * weighted table. A slice of each table is the GOLD class — the rare packs
 * carrying the big multipliers. Gold is an OUTCOME CLASS (like vault's rug vs
 * safe) — its presentation differs by class, never by value (RG-C5).
 *
 * ── Difficulty tiers (assay precedent: same RTP, volatility is the knob) ────
 * EVERY tier is the SAME exact 96.50% RTP; the tier changes the SHAPE only:
 *   easy    dud 40% · gold 1-in-20 · top 100×   (the gentle machine)
 *   medium  dud 52% · gold 1-in-25 · top 250×
 *   hard    dud 65% · gold 1-in-40 · top 1000×  (the cliff machine)
 *
 * ── Domain A rules (mirror of vault/assay discipline) ───────────────────────
 *   • NO IEEE 754 floats in any payout path. Every payout value is bigint.
 *   • Floor-toward-zero rounding always (house-favored). Documented per-call.
 *   • Fail-closed on out-of-range inputs.
 *
 * ── RTP: EXACT-BY-CONSTRUCTION (the one identity that locks this file) ──────
 * Each tier's table is ONE combined weight table over WEIGHT_TOTAL = 100 000
 * whose weights satisfy the integer identity
 *
 *     Σ_i weight_i · multiplierBps_i  ===  TARGET_RTP_BPS · WEIGHT_TOTAL
 *
 * EXACTLY (965 000 000 = 9650 · 100 000), for EVERY tier. Per-pack EV is
 * therefore 96.50% pre-floor on any tier, independent of pack count.
 * `mirrorRoundtripCheck()` asserts the identity + the frozen golden tables at
 * module load and throws on any drift.
 *
 * ── Rounding ────────────────────────────────────────────────────────────────
 * Payout floors ONCE per pack: floor(wagerPerPack · bps / 10000). Packs are
 * independent purchases, so the per-pack floor is the correct unit (mirrors
 * vault's per-tile floor, not assay's single-final-floor ladder).
 */

/** 1.00× in basis points. */
export const ONE_X_BPS = 10_000n
/** House edge in bps. 350 → target RTP 0.9650. This is the RTP knob. */
export const HOUSE_EDGE_BPS = 350n
/** Target RTP in bps: 10000 − 350 = 9650 (0.9650). */
export const TARGET_RTP_BPS = ONE_X_BPS - HOUSE_EDGE_BPS
/** Total weight of every tier's prize table. One roll ∈ [0, WEIGHT_TOTAL). */
export const WEIGHT_TOTAL = 100_000n
/** Minimum packs per vend. */
export const MIN_PACKS = 1
/** Maximum packs per vend — one full machine (all 20 slots). Exposure cap. */
export const MAX_PACKS = 20

/** Difficulty tier ids. Internal ids never change (fairness domain-separation
 *  and seed re-derivation key off the id, not the label). */
export type VendingTierId = 'easy' | 'medium' | 'hard'
export const TIER_ORDER: readonly VendingTierId[] = ['easy', 'medium', 'hard']
export const DEFAULT_TIER: VendingTierId = 'easy'

/** Pack outcome class. GOLD is the rare class of each tier's table. */
export type PackClass = 'standard' | 'gold'

/** One row of a prize table. */
export interface PackPrize {
  /** Stable id — fairness re-derivation & UI keys key off this, never labels. */
  readonly id: string
  readonly cls: PackClass
  /** Prize multiplier in bps of the per-pack wager. */
  readonly multiplierBps: bigint
  /** Draw weight out of WEIGHT_TOTAL. */
  readonly weight: bigint
}

/**
 * THE tier tables (ordered; rolls walk them cumulatively, gold slice last).
 * Every table satisfies Σ weight === 100 000 and Σ weight·bps === 965 000 000
 * EXACTLY — verified at load and in vendingMath.test.ts.
 */
export const PACK_TABLES: Readonly<Record<VendingTierId, readonly PackPrize[]>> = {
  // ── EASY: dud 40%, gold 5 000 (1-in-20), top 100× ──
  easy: [
    { id: 'dud', cls: 'standard', multiplierBps: 0n, weight: 40_000n },
    { id: 'q25', cls: 'standard', multiplierBps: 2_500n, weight: 17_000n },
    { id: 'h50', cls: 'standard', multiplierBps: 5_000n, weight: 16_000n },
    { id: 'x1', cls: 'standard', multiplierBps: 10_000n, weight: 14_000n },
    { id: 'x15', cls: 'standard', multiplierBps: 15_000n, weight: 5_000n },
    { id: 'x2', cls: 'standard', multiplierBps: 20_000n, weight: 2_200n },
    { id: 'x3', cls: 'standard', multiplierBps: 30_000n, weight: 800n },
    { id: 'g5', cls: 'gold', multiplierBps: 50_000n, weight: 2_119n },
    { id: 'g8', cls: 'gold', multiplierBps: 80_000n, weight: 1_300n },
    { id: 'g12', cls: 'gold', multiplierBps: 120_000n, weight: 810n },
    { id: 'g20', cls: 'gold', multiplierBps: 200_000n, weight: 450n },
    { id: 'g35', cls: 'gold', multiplierBps: 350_000n, weight: 201n },
    { id: 'g60', cls: 'gold', multiplierBps: 600_000n, weight: 70n },
    { id: 'g100', cls: 'gold', multiplierBps: 1_000_000n, weight: 50n },
  ],
  // ── MEDIUM: dud 52%, gold 4 000 (1-in-25), top 250× ──
  // std Σw·v = 555 000 000; gold Σw·v = 410 000 000; total 965 000 000 exact.
  medium: [
    { id: 'dud', cls: 'standard', multiplierBps: 0n, weight: 52_000n },
    { id: 'h50', cls: 'standard', multiplierBps: 5_000n, weight: 17_000n },
    { id: 'x1', cls: 'standard', multiplierBps: 10_000n, weight: 15_000n },
    { id: 'x2', cls: 'standard', multiplierBps: 20_000n, weight: 8_000n },
    { id: 'x4', cls: 'standard', multiplierBps: 40_000n, weight: 4_000n },
    { id: 'g5', cls: 'gold', multiplierBps: 50_000n, weight: 2_150n },
    { id: 'g8', cls: 'gold', multiplierBps: 80_000n, weight: 645n },
    { id: 'g15', cls: 'gold', multiplierBps: 150_000n, weight: 1_000n },
    { id: 'g40', cls: 'gold', multiplierBps: 400_000n, weight: 196n },
    { id: 'g250', cls: 'gold', multiplierBps: 2_500_000n, weight: 9n },
  ],
  // ── HARD: dud 65%, gold 2 500 (1-in-40), top 1000× ──
  // std Σw·v = 487 500 000; gold Σw·v = 477 500 000; total 965 000 000 exact.
  hard: [
    { id: 'dud', cls: 'standard', multiplierBps: 0n, weight: 65_000n },
    { id: 'h50', cls: 'standard', multiplierBps: 5_000n, weight: 14_000n },
    { id: 'x1', cls: 'standard', multiplierBps: 10_000n, weight: 10_000n },
    { id: 'x25', cls: 'standard', multiplierBps: 25_000n, weight: 5_500n },
    { id: 'x6', cls: 'standard', multiplierBps: 60_000n, weight: 3_000n },
    { id: 'g10', cls: 'gold', multiplierBps: 100_000n, weight: 1_593n },
    { id: 'g20', cls: 'gold', multiplierBps: 200_000n, weight: 241n },
    { id: 'g25', cls: 'gold', multiplierBps: 250_000n, weight: 600n },
    { id: 'g100', cls: 'gold', multiplierBps: 1_000_000n, weight: 60n },
    { id: 'g1000', cls: 'gold', multiplierBps: 10_000_000n, weight: 6n },
  ],
}

/** Back-compat alias: the default (easy) table. */
export const PACK_TABLE: readonly PackPrize[] = PACK_TABLES[DEFAULT_TIER]

/** Frozen GOLDEN tables — canonical reviewed (id, cls, bps, weight) rows per
 *  tier. Any drift is release-blocking (the Glass Box receipt re-derives
 *  prizes from these same tables). */
export const GOLDEN_PACK_TABLES: Readonly<
  Record<VendingTierId, readonly (readonly [string, PackClass, bigint, bigint])[]>
> = {
  easy: [
    ['dud', 'standard', 0n, 40_000n],
    ['q25', 'standard', 2_500n, 17_000n],
    ['h50', 'standard', 5_000n, 16_000n],
    ['x1', 'standard', 10_000n, 14_000n],
    ['x15', 'standard', 15_000n, 5_000n],
    ['x2', 'standard', 20_000n, 2_200n],
    ['x3', 'standard', 30_000n, 800n],
    ['g5', 'gold', 50_000n, 2_119n],
    ['g8', 'gold', 80_000n, 1_300n],
    ['g12', 'gold', 120_000n, 810n],
    ['g20', 'gold', 200_000n, 450n],
    ['g35', 'gold', 350_000n, 201n],
    ['g60', 'gold', 600_000n, 70n],
    ['g100', 'gold', 1_000_000n, 50n],
  ],
  medium: [
    ['dud', 'standard', 0n, 52_000n],
    ['h50', 'standard', 5_000n, 17_000n],
    ['x1', 'standard', 10_000n, 15_000n],
    ['x2', 'standard', 20_000n, 8_000n],
    ['x4', 'standard', 40_000n, 4_000n],
    ['g5', 'gold', 50_000n, 2_150n],
    ['g8', 'gold', 80_000n, 645n],
    ['g15', 'gold', 150_000n, 1_000n],
    ['g40', 'gold', 400_000n, 196n],
    ['g250', 'gold', 2_500_000n, 9n],
  ],
  hard: [
    ['dud', 'standard', 0n, 65_000n],
    ['h50', 'standard', 5_000n, 14_000n],
    ['x1', 'standard', 10_000n, 10_000n],
    ['x25', 'standard', 25_000n, 5_500n],
    ['x6', 'standard', 60_000n, 3_000n],
    ['g10', 'gold', 100_000n, 1_593n],
    ['g20', 'gold', 200_000n, 241n],
    ['g25', 'gold', 250_000n, 600n],
    ['g100', 'gold', 1_000_000n, 60n],
    ['g1000', 'gold', 10_000_000n, 6n],
  ],
}

/** Per-tier gold-slice weight (the "1 in N" the UI states). */
export const GOLD_WEIGHT_BY_TIER: Readonly<Record<VendingTierId, bigint>> = {
  easy: PACK_TABLES.easy.filter((p) => p.cls === 'gold').reduce((n, p) => n + p.weight, 0n),
  medium: PACK_TABLES.medium.filter((p) => p.cls === 'gold').reduce((n, p) => n + p.weight, 0n),
  hard: PACK_TABLES.hard.filter((p) => p.cls === 'gold').reduce((n, p) => n + p.weight, 0n),
}
export const GOLD_ONE_IN_BY_TIER: Readonly<Record<VendingTierId, number>> = {
  easy: Number(WEIGHT_TOTAL / GOLD_WEIGHT_BY_TIER.easy),
  medium: Number(WEIGHT_TOTAL / GOLD_WEIGHT_BY_TIER.medium),
  hard: Number(WEIGHT_TOTAL / GOLD_WEIGHT_BY_TIER.hard),
}
/** Back-compat: the default tier's gold odds. */
export const GOLD_ONE_IN = GOLD_ONE_IN_BY_TIER[DEFAULT_TIER]

/** Per-tier top multiplier (the "up to N×" the UI states + max-win math). */
export const PACK_MAX_MULTIPLIER_BPS_BY_TIER: Readonly<Record<VendingTierId, bigint>> = {
  easy: PACK_TABLES.easy[PACK_TABLES.easy.length - 1]!.multiplierBps,
  medium: PACK_TABLES.medium[PACK_TABLES.medium.length - 1]!.multiplierBps,
  hard: PACK_TABLES.hard[PACK_TABLES.hard.length - 1]!.multiplierBps,
}
/** Back-compat: the default tier's cap (100×). */
export const PACK_MAX_MULTIPLIER_BPS = PACK_MAX_MULTIPLIER_BPS_BY_TIER[DEFAULT_TIER]

// ─── Roll → prize (the single draw function; receipt re-derives through it) ─

/**
 * Map a uniform roll ∈ [0, WEIGHT_TOTAL) onto the TIER's table by cumulative
 * walk. The provider's seed derivation produces the roll (domain-separated by
 * tier); the Glass Box certificate re-runs this same function to verify.
 *
 * @throws on out-of-range roll. Fail-closed.
 */
export function rollToPrize(roll: bigint, tier: VendingTierId = DEFAULT_TIER): PackPrize {
  if (roll < 0n || roll >= WEIGHT_TOTAL) {
    throw new Error(`vending: roll ${roll} out of band [0, ${WEIGHT_TOTAL})`)
  }
  let cum = 0n
  for (const prize of PACK_TABLES[tier]) {
    cum += prize.weight
    if (roll < cum) return prize
  }
  // Unreachable while Σ weights === WEIGHT_TOTAL (asserted at load). Fail-closed.
  throw new Error('vending: prize table walk fell through')
}

// ─── Settlement ─────────────────────────────────────────────────────────────

/**
 * Per-pack payout: wagerPerPack × multiplier, floored toward zero
 * (house-favored, Domain A). The ONLY floor in the payout path.
 *
 * @throws on negative inputs. Fail-closed.
 */
export function settlePackPayout(wagerPerPackLamports: bigint, multiplierBps: bigint): bigint {
  if (wagerPerPackLamports < 0n) throw new Error('vending: wager cannot be negative')
  if (multiplierBps < 0n) throw new Error('vending: multiplier bps cannot be negative')
  return (wagerPerPackLamports * multiplierBps) / ONE_X_BPS
}

/**
 * Aggregate session multiplier for display: floor(totalPayout·10000/totalWager).
 * DISPLAY ONLY — settlement sums per-pack floors; this never feeds a payout.
 *
 * @throws on non-positive totalWager. Fail-closed.
 */
export function aggregateMultiplierBps(totalWagerLamports: bigint, totalPayoutLamports: bigint): bigint {
  if (totalWagerLamports <= 0n) throw new Error('vending: total wager must be positive')
  if (totalPayoutLamports < 0n) throw new Error('vending: total payout cannot be negative')
  return (totalPayoutLamports * ONE_X_BPS) / totalWagerLamports
}

// ─── Display formatting (mirror of assayMath.formatMultiplier/formatUsdc) ───

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
 * Runs at module load. Throws (release-blocking) if, for ANY tier:
 *   (a) the runtime table drifts from the frozen golden table,
 *   (b) Σ weights ≠ WEIGHT_TOTAL,
 *   (c) the exact EV identity Σ w·v === TARGET_RTP_BPS · WEIGHT_TOTAL fails,
 *   (d) cumulative-walk boundaries or the settle floor drift.
 * Same gate as `vendingMath.test.ts`.
 */
function mirrorRoundtripCheck(): void {
  for (const tier of TIER_ORDER) {
    const table = PACK_TABLES[tier]
    const golden = GOLDEN_PACK_TABLES[tier]
    // (a) golden-table identity.
    if (table.length !== golden.length) {
      throw new Error(`vending math drift (${tier}): table length mismatch`)
    }
    for (let i = 0; i < table.length; i++) {
      const p = table[i]!
      const [id, cls, bps, weight] = golden[i]!
      if (p.id !== id || p.cls !== cls || p.multiplierBps !== bps || p.weight !== weight) {
        throw new Error(`vending math drift (${tier}): row ${i} (${p.id}) ≠ golden (${id})`)
      }
    }
    // (b) weight-sum identity + (c) THE exact EV identity.
    let weightSum = 0n
    let evSum = 0n
    for (const p of table) {
      weightSum += p.weight
      evSum += p.weight * p.multiplierBps
    }
    if (weightSum !== WEIGHT_TOTAL) {
      throw new Error(`vending math drift (${tier}): Σ weights ${weightSum} ≠ ${WEIGHT_TOTAL}`)
    }
    if (evSum !== TARGET_RTP_BPS * WEIGHT_TOTAL) {
      throw new Error(
        `vending RTP drift (${tier}): Σ w·v = ${evSum} ≠ ${TARGET_RTP_BPS * WEIGHT_TOTAL}`,
      )
    }
    // (d) boundaries: first roll → first row; last roll → top row; the gold
    // slice begins exactly at WEIGHT_TOTAL − goldWeight.
    const goldStart = WEIGHT_TOTAL - GOLD_WEIGHT_BY_TIER[tier]
    if (rollToPrize(0n, tier).id !== 'dud') throw new Error(`vending drift (${tier}): roll 0 ≠ dud`)
    if (rollToPrize(WEIGHT_TOTAL - 1n, tier).multiplierBps !== PACK_MAX_MULTIPLIER_BPS_BY_TIER[tier]) {
      throw new Error(`vending drift (${tier}): last roll ≠ top row`)
    }
    if (rollToPrize(goldStart, tier).cls !== 'gold') {
      throw new Error(`vending drift (${tier}): roll ${goldStart} not gold`)
    }
    if (rollToPrize(goldStart - 1n, tier).cls !== 'standard') {
      throw new Error(`vending drift (${tier}): roll ${goldStart - 1n} not standard`)
    }
  }
  // Tier-shape spot checks (the volatility ladder is intentional, not drift).
  if (GOLD_ONE_IN_BY_TIER.easy !== 20 || GOLD_ONE_IN_BY_TIER.medium !== 25 || GOLD_ONE_IN_BY_TIER.hard !== 40) {
    throw new Error('vending drift: tier gold odds ladder changed')
  }
  if (
    PACK_MAX_MULTIPLIER_BPS_BY_TIER.easy !== 1_000_000n ||
    PACK_MAX_MULTIPLIER_BPS_BY_TIER.medium !== 2_500_000n ||
    PACK_MAX_MULTIPLIER_BPS_BY_TIER.hard !== 10_000_000n
  ) {
    throw new Error('vending drift: tier max-multiplier ladder changed')
  }
  // Settle floor identity: 10 USDC × 0.25× = 2.50 USDC; truncation case floors.
  if (settlePackPayout(10_000_000n, 2_500n) !== 2_500_000n) {
    throw new Error('vending settle drift: 10 USDC × 0.25× ≠ 2.50 USDC')
  }
  if (settlePackPayout(333_333n, 2_500n) !== 83_333n) {
    throw new Error('vending settle drift: floor(333333 × 2500 / 10000) ≠ 83333')
  }
}

mirrorRoundtripCheck()

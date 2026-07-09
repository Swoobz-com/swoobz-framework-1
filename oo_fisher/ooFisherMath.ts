/**
 * OO-Fisher math — pure helpers. Domain A: monetary surface uses BigInt with
 * BPS multipliers. Fish counts / depths / tiers are integers (no IEEE 754
 * drift). RG-C5 STRUCTURAL ENFORCEMENT — every cap and rounding rule is a
 * module-level constant so a future commit cannot raise them silently.
 *
 * Hard caps (RG-C5):
 *  - MAX_TRIP_MULTIPLIER_BPS = 100_000n (10.00x ceiling per trip)
 *  - MAX_CAST_DEPTH_BY_BOAT[tier] caps the cast power → depth mapping
 *  - Fish-rarity weights are per-depth-tier constants (never scale with
 *    session/streak length)
 *
 * Rounding direction (Domain A): floor (truncate toward zero) for ALL
 * player-facing calculations. The house never rounds in the player's favor.
 *
 * The grinding loop has three nested layers:
 *  - Per-cast: tap → power → depth → fish-on → reel → caught (value)
 *  - Per-trip: N casts → total caught value → settle (wager × tripMultiplier)
 *  - Meta: earn currency → buy upgrades → unlocks deeper depths + rarer fish
 *
 * Currency (in-game USDC-equivalent): all amounts in `bigint` USDC lamports
 * (1 USDC = 1_000_000n). LocalStorage round-trips the meta state as plain
 * decimal strings via `formatMetaCurrency` and `parseMetaCurrency` —
 * never as bigint serialization-suffix because LocalStorage is a UI surface.
 */

// ─── Universal BPS / format constants ──────────────────────────────────────

export const ONE_X_BPS = 10_000n
export const BPS_DENOM = 10_000n

/** Hard ceiling per RG-C5: 10.00x. Cannot be raised at runtime. */
export const MAX_TRIP_MULTIPLIER_BPS = 100_000n

/** Currency unit: 1 USDC = 1_000_000n lamports (6 decimals — Solana convention). */
export const USDC_LAMPORTS_PER_UNIT = 1_000_000n

// ─── Tier system ───────────────────────────────────────────────────────────

/**
 * The upgrade-tier ladder. 5 tiers per tree (rod / boat / bait). Bronze is
 * the starting tier — every new player owns Bronze. Mythic is the endgame.
 *
 * Each ascending tier costs 5x the previous tier's price (exponential grind
 * curve, like Cookie Clicker upgrades). Initial = free; Bronze → Silver = 50
 * USDC; Silver → Gold = 250; Gold → Platinum = 1,250; Platinum → Mythic = 6,250.
 */
export type GearTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'mythic'

export const GEAR_TIERS: ReadonlyArray<GearTier> = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'mythic',
]

/** Numeric tier index. Bronze = 0, Mythic = 4. */
export function tierIndex(tier: GearTier): number {
  const idx = GEAR_TIERS.indexOf(tier)
  if (idx < 0) throw new Error(`unknown gear tier: ${tier}`)
  return idx
}

/** Tier at the given index. Returns Bronze for out-of-bounds inputs. */
export function tierAt(idx: number): GearTier {
  if (!Number.isInteger(idx) || idx < 0) return 'bronze'
  if (idx >= GEAR_TIERS.length) return 'mythic'
  // Index is bounded above & non-negative integer; assertion is safe.
  return GEAR_TIERS[idx] as GearTier
}

/** Next tier in the ladder, or `null` at Mythic (the ceiling). */
export function nextTier(tier: GearTier): GearTier | null {
  const idx = tierIndex(tier)
  if (idx >= GEAR_TIERS.length - 1) return null
  return tierAt(idx + 1)
}

// ─── Upgrade tree types ────────────────────────────────────────────────────

/** Three independent upgrade trees. Each tree has 5 tiers. */
export type UpgradeTree = 'rod' | 'boat' | 'bait'

export interface GearLoadout {
  readonly rod: GearTier
  readonly boat: GearTier
  readonly bait: GearTier
}

/** Starting loadout — every player begins at Bronze across all three trees. */
export const STARTING_LOADOUT: GearLoadout = {
  rod: 'bronze',
  boat: 'bronze',
  bait: 'bronze',
}

// ─── Upgrade cost curve ────────────────────────────────────────────────────

/**
 * Base cost (in USDC lamports) for the first paid upgrade: Bronze → Silver.
 * 50 USDC = 50_000_000 lamports. Each subsequent tier costs 5x the previous.
 *
 * Cost ladder (Bronze is free / starting):
 *  Bronze → Silver:   50.00 USDC =     50_000_000n lamports
 *  Silver → Gold:    250.00 USDC =    250_000_000n lamports
 *  Gold → Platinum:1_250.00 USDC =  1_250_000_000n lamports
 *  Platinum → Mythic: 6_250.00 USDC =  6_250_000_000n lamports
 *
 * Identical curve across all three trees so the player isn't surprised by
 * a sudden price spike on one branch.
 */
const UPGRADE_BASE_COST_LAMPORTS = 50_000_000n // 50 USDC
const UPGRADE_COST_MULTIPLIER = 5n

/**
 * Cost (in USDC lamports) to upgrade FROM `currentTier` to the next tier.
 *
 * Returns 0n if `currentTier` is already Mythic (no further upgrade exists).
 *
 * Floor-rounding throughout (Domain A): the player pays the exact integer
 * lamport amount; remainder belongs to the house's upgrade ledger.
 */
export function upgradeCost(currentTier: GearTier): bigint {
  const idx = tierIndex(currentTier)
  if (idx >= GEAR_TIERS.length - 1) return 0n // Mythic = no further upgrade
  // idx = 0 (bronze) → 50_000_000; 1 (silver) → 250_000_000; etc.
  let cost = UPGRADE_BASE_COST_LAMPORTS
  for (let i = 0; i < idx; i++) {
    cost *= UPGRADE_COST_MULTIPLIER
  }
  return cost
}

// ─── Cast power → depth mapping ────────────────────────────────────────────

/**
 * Cast power is the player's held-tap pressure (0-100, integer). It maps to a
 * depth tier (1-5). Boat tier caps the maximum reachable depth — a Bronze boat
 * cannot reach depth-5 even with full power.
 *
 * Depth tiers determine which fish species are visible (depth-gated):
 *  Depth 1 (shallow): common / uncommon
 *  Depth 2:           common / uncommon / rare
 *  Depth 3:           uncommon / rare / epic
 *  Depth 4:           rare / epic / legendary
 *  Depth 5 (deepest): epic / legendary / mythic
 */
export type DepthTier = 1 | 2 | 3 | 4 | 5

/** Map boat tier → maximum reachable depth tier. */
export function maxDepthByBoat(boat: GearTier): DepthTier {
  switch (boat) {
    case 'bronze':
      return 1
    case 'silver':
      return 2
    case 'gold':
      return 3
    case 'platinum':
      return 4
    case 'mythic':
      return 5
  }
}

/**
 * Cast power (0-100 integer) → depth tier (1-5). The mapping is bounded by
 * the boat's max-depth cap. House-favored: power 0-19 always lands depth 1,
 * power 80-100 lands the boat's max depth (clamped if boat is limited).
 *
 * Negative or non-finite inputs floor to depth 1 (fail-safe — the cast still
 * happens at the shallowest tier).
 */
export function castPowerToDepth(power: number, boat: GearTier): DepthTier {
  if (!Number.isFinite(power) || power < 0) return 1
  const clampedPower = power > 100 ? 100 : Math.floor(power)
  // Power bands: 0-19 → 1, 20-39 → 2, 40-59 → 3, 60-79 → 4, 80-100 → 5
  const rawDepth = Math.min(5, Math.max(1, Math.floor(clampedPower / 20) + 1)) as DepthTier
  const cap = maxDepthByBoat(boat)
  return (rawDepth > cap ? cap : rawDepth) as DepthTier
}

// ─── Fish rarity tiers ─────────────────────────────────────────────────────

/**
 * Six rarity tiers. Each ~2x the value of the previous. Mythic is the rare
 * endgame catch (depth-5 + Mythic-bait only).
 */
export type FishRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'

export const FISH_RARITIES: ReadonlyArray<FishRarity> = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'mythic',
]

/**
 * Per-rarity payout multiplier in BPS, applied to wager when the trip
 * settles. House-favored floor truncation throughout.
 *
 * NOTE: tuned 2026-05-24 v2 (Tim playtest) to land Monte-Carlo RTP at
 * ~96% with the new loss-mechanics model (miss/snap/junk).
 *
 *  common     × 1.65 =  16_500 bps  (sub-2x typical catch)
 *  uncommon   × 3.10 =  31_000 bps  (small win)
 *  rare       × 5.50 =  55_000 bps  (modest win)
 *  epic       × 10.0 = 100_000 bps  (good win, near cap)
 *  legendary  × 15.0 = 150_000 bps  (above cap per cast)
 *  mythic     × 31.0 = 310_000 bps  (rare jackpot, triggers cap)
 *
 * These per-fish weights are used to compute the trip's TOTAL catch value
 * (sum across the trip's casts). The TRIP MULTIPLIER (sum / wager) is then
 * floored to MAX_TRIP_MULTIPLIER_BPS (10.00x cap, RG-C5 structural). The
 * mirror-roundtrip-check at the bottom of this module verifies the cap
 * is enforced regardless of the rarity values.
 */
// EV-FAIRNESS REBALANCE (2026-06-30). The old ladder made every loadout wildly
// +EV under skilled play (measured 168%–946% RTP). The new design makes skill a
// VARIANCE choice, not an EV edge: deeper water + better bait give RARER, BIGGER
// fish but the SAME expected value (the DEPTH_RARITY_WEIGHTS keep each depth's
// mean ≈ flat — see rtp-harness). The skill reward (perfect-band) is already
// EV-neutral (→ STASH). Values are also lower so the top fish fit a flat mean.
const RARITY_VALUE_BPS: Record<FishRarity, bigint> = {
  common: 8_000n,
  uncommon: 13_000n,
  rare: 22_000n,
  epic: 40_000n,
  legendary: 70_000n,
  mythic: 120_000n,
}

// ─── Bad-catch outcome BPS (Layer 1, Tim playtest 2026-05-24) ────────────
//
// Two below-1.00x outcomes can resolve a cast instead of a normal rarity
// pick. These are the loss-side of the distribution. They mix with the
// rarity ladder above so the trip RTP lands at 96±0.5%.
//
//  JUNK_CATCH_BPS = 3_000n     → ×0.30 multiplier (boot / seaweed / tiny minnow)
//  SNAP_CATCH_BPS = 0n         → ×0.00 multiplier (line snaps mid-fight)
//
// These constants are MODULE-CONST per RG-C5 — no streak / progression
// parameter can move them.
export const JUNK_CATCH_BPS = 3_000n
export const SNAP_CATCH_BPS = 0n

/** Display color tokens per rarity (for the UI). */
export interface RarityVisuals {
  readonly hex: string
  readonly rgb: string
  readonly label: string
}

export const RARITY_VISUALS: Record<FishRarity, RarityVisuals> = {
  common: { hex: '#f4f6fa', rgb: '244,246,250', label: 'Common' },
  uncommon: { hex: '#00F0FF', rgb: '0,240,255', label: 'Uncommon' },
  rare: { hex: '#7AEFC4', rgb: '122,239,196', label: 'Rare' },
  epic: { hex: '#B084F5', rgb: '176,132,245', label: 'Epic' },
  legendary: { hex: '#F5C25B', rgb: '245,194,91', label: 'Legendary' },
  mythic: { hex: '#FF8B5A', rgb: '255,139,90', label: 'Mythic' },
}

/** Numeric index of a rarity in the ladder. */
export function rarityIndex(rarity: FishRarity): number {
  const idx = FISH_RARITIES.indexOf(rarity)
  if (idx < 0) throw new Error(`unknown rarity: ${rarity}`)
  return idx
}

/** Value (in BPS, applied to wager) of a single caught fish of this rarity. */
export function rarityValueBps(rarity: FishRarity): bigint {
  return RARITY_VALUE_BPS[rarity]
}

// ─── Depth-gated rarity weights ────────────────────────────────────────────

/**
 * Per-depth probability weights for each rarity. Higher depth shifts the
 * distribution toward rarer fish. Weights are integers; sum within each
 * depth row stays at 100 so the player intuits the distribution.
 *
 * The weights ARE the per-cast rarity prior. The bait tier then nudges the
 * distribution further (see `applyBaitWeights`). The combined weighted
 * sample is deterministic given the (server-seed, cast-index) commit-reveal
 * pair — see `pickRarityFromSeed`.
 *
 * RG-C5 SAFE: weights are CONSTANTS, not parameterized by streak / session
 * length. The fish pool composition depends only on (depth, bait).
 */
export const DEPTH_RARITY_WEIGHTS: Record<DepthTier, Record<FishRarity, number>> = {
  // EV-FAIRNESS REBALANCE (2026-06-30): each depth's expected value is kept
  // ≈ FLAT (deeper ≠ more EV). Depth only changes the SHAPE — deeper water adds
  // a thin tail of rarer, bigger fish offset by more filler, so the big catch is
  // a bigger-but-rarer thrill, not a higher average. Verified flat via rtp-harness.
  // Depth 1 — shallow: tight, mostly common (an epic is a rare shallow surprise)
  1: { common: 56, uncommon: 35, rare: 7, epic: 2, legendary: 0, mythic: 0 },
  // Depth 2 — slightly wider tail
  2: { common: 58, uncommon: 31, rare: 9, epic: 2, legendary: 0, mythic: 0 },
  // Depth 3 — epic/legendary tail
  3: { common: 70, uncommon: 20, rare: 6, epic: 3, legendary: 1, mythic: 0 },
  // Depth 4 — legendary/mythic tail
  4: { common: 79, uncommon: 13, rare: 4, epic: 2, legendary: 1, mythic: 1 },
  // Depth 5 — fattest tail (rare mythic jackpot) but same mean
  5: { common: 82, uncommon: 10, rare: 4, epic: 2, legendary: 1, mythic: 1 },
}

/**
 * Bait tier multiplies the rare-tier weights, shifting the distribution
 * toward rarer fish. Bronze bait = no shift; Mythic bait roughly doubles
 * legendary + mythic weights without erasing the common floor.
 *
 * Returns a fresh weight bag; never mutates the input.
 */
export function applyBaitWeights(
  weights: Record<FishRarity, number>,
  bait: GearTier,
): Record<FishRarity, number> {
  const baitIdx = tierIndex(bait)
  // Bronze (0) = no shift, Mythic (4) = max shift.
  // Multiplier per rarity index — common stays, rarer tiers scale up by bait.
  const result: Record<FishRarity, number> = { ...weights }
  // EV-FAIRNESS REBALANCE (2026-06-30): the bait rarity tilt is now SMALL —
  // factor cut from 25 to 6 per (bait,rarity) index — so better bait nudges you
  // toward rarer fish (a mild variance/flavor perk) WITHOUT adding a meaningful
  // EV edge. common stays unchanged so the floor never disappears.
  for (const r of FISH_RARITIES) {
    const rIdx = rarityIndex(r)
    if (rIdx === 0) continue
    const scaleNum = 100 + baitIdx * 2 * rIdx
    result[r] = Math.floor((weights[r] * scaleNum) / 100)
  }
  return result
}

// ─── Seeded rarity pick ────────────────────────────────────────────────────

/**
 * Deterministic rarity pick from a 32-bit seed. The seed is derived
 * client-side from the server-seed + cast-index commit-reveal pair (see
 * `ooFisherProvider.ts` — the entropy chain matches Pulse/Vault).
 *
 * Floor truncation throughout. Given identical (seed, weights), the same
 * rarity is returned every call — required for the Glass Box re-derive.
 */
export function pickRarityFromSeed(seed: number, weights: Record<FishRarity, number>): FishRarity {
  if (!Number.isFinite(seed) || seed < 0) {
    throw new Error('seed must be a non-negative finite integer')
  }
  // Compute total weight (sum across rarities)
  let total = 0
  for (const r of FISH_RARITIES) total += weights[r] ?? 0
  if (total <= 0) {
    // Degenerate weights — default to common as a safe fallback.
    return 'common'
  }
  const point = Math.floor(seed) % total
  let cursor = 0
  for (const r of FISH_RARITIES) {
    cursor += weights[r] ?? 0
    if (point < cursor) return r
  }
  // Unreachable given total > 0, but TypeScript needs a sentinel.
  return 'common'
}

// ─── Cast outcome model (Layer 1, Tim playtest 2026-05-24) ───────────────
//
// Tim verbatim: "i feel like you cannot lose, i always catch a fish - but
// there needs some kind of loss/win mechanic in here ofcourse." The
// previous build let EVERY cast resolve into a rarity pick — there was no
// genuine miss. This block defines the cast-outcome distribution that
// gates the rarity pick.
//
// A cast resolves into ONE of:
//   - MISS         : "line came back empty" → 0× contribution, NO catch entry
//   - SNAP         : fish snapped the line → 0× contribution, catch-snap entry
//   - JUNK         : caught a boot / minnow → 0.30× contribution, junk entry
//   - NORMAL       : rarity pick via DEPTH_RARITY_WEIGHTS
//
// The probability of each outcome depends on the cast's POWER (the
// player's held-tap pressure). Higher power = bigger reach = bigger miss
// window. Lower power = shallow water = safer cast but more junk.
// Sweet-spot power (50-70) maximises NORMAL probability.
//
// All probabilities are computed in PER-MILLE (out of 1000) to keep the
// integer arithmetic crisp.

/** Cast outcome kinds. */
export type CastOutcomeKind = 'miss' | 'snap' | 'junk' | 'normal'

export interface CastOutcome {
  readonly kind: CastOutcomeKind
  /**
   * Effective BPS contribution to the trip-multiplier numerator for THIS
   * cast. NORMAL outcomes return `rarityValueBps(picked-rarity)` (further
   * scaled by bait inside `payoutForCatch`). MISS/SNAP return 0n. JUNK
   * returns JUNK_CATCH_BPS (3_000n = 0.30×). The provider uses this BPS
   * value directly when summing into the trip; for NORMAL it ALSO carries
   * the picked rarity so the catch entry can record it.
   */
  readonly effectiveBps: bigint
  /** Only present when kind === 'normal'. The picked rarity for the catch. */
  readonly rarity: FishRarity | null
}

/**
 * Per-mille outcome thresholds keyed by power band. The values are tuned
 * so that:
 *   - perfect power (50-70) yields ~5% miss + ~10% junk + ~3% snap → ~82% normal
 *   - under-power (< 30) yields ~30% miss + ~25% junk + ~5% snap → ~40% normal
 *   - over-power (> 90) yields ~20% miss + ~12% junk + ~10% snap → ~58% normal
 *
 * The miss band is the "swing-and-miss" probability — the lure didn't
 * even hook a fish. Snap is the "line broke on the bite" probability.
 * Junk is the "yeah you caught something, but it's a boot" probability.
 *
 * RG-C5 STRUCTURAL: these are MODULE-CONST. The values cannot be raised
 * at runtime by streak / session length / progression.
 */
interface OutcomeBand {
  readonly missPerMille: number
  readonly snapPerMille: number
  readonly junkPerMille: number
}

/**
 * Power-band → outcome thresholds. The bands deliberately overlap the
 * 5-band depth model: low-power is shallow water (more junk), high-power
 * is deep water (more snap-risk because the line is taut over distance).
 */
export function outcomeBandForPower(power: number): OutcomeBand {
  if (!Number.isFinite(power) || power < 0) {
    return { missPerMille: 350, snapPerMille: 60, junkPerMille: 280 }
  }
  const p = power > 100 ? 100 : Math.floor(power)
  // EV-FAIRNESS REBALANCE (2026-06-30): normal-catch rate is kept ≈ FLAT across
  // the usable power range so power is a DEPTH/variance choice, not an EV edge.
  // Only the extremes (under-/over-charge) are punished, and only mildly.
  // Under-charge (< 30) → more miss/junk
  if (p < 30) {
    return { missPerMille: 140, snapPerMille: 30, junkPerMille: 110 }
  }
  // Low-mid (30-49)
  if (p < 50) {
    return { missPerMille: 80, snapPerMille: 30, junkPerMille: 100 }
  }
  // Sweet spot (50-70) → marginally best, but only just
  if (p <= 70) {
    return { missPerMille: 50, snapPerMille: 30, junkPerMille: 90 }
  }
  // High (71-90)
  if (p <= 90) {
    return { missPerMille: 70, snapPerMille: 40, junkPerMille: 100 }
  }
  // Over-charge (> 90) → mild penalty
  return { missPerMille: 110, snapPerMille: 50, junkPerMille: 120 }
}

/**
 * Evaluate the cast outcome deterministically from the cast seed + power +
 * depth weights. This is the SOLE choke-point for cast resolution — the
 * provider calls this to decide whether the player misses, snaps, lands
 * junk, or lands a normal-rarity fish.
 *
 * Deterministic: identical (castSeed, power, depthWeights) ALWAYS returns
 * identical outcome. House-favored: misses and snaps contribute 0 BPS;
 * junk contributes ×0.30 BPS (loss); normal goes through the bait shift
 * via `pickRarityFromSeed`. Floor truncation everywhere.
 *
 * The function consumes the seed in 3 nibbles:
 *   - low 10 bits  → 0..1023 → mapped to per-mille outcome roll (0..999)
 *   - middle 16 bits → forwarded to `pickRarityFromSeed` for normal-tier
 *     selection (XOR-shifted so the outcome roll and rarity pick are
 *     independent dimensions)
 */
export function evaluateCastOutcome(
  castSeed: number,
  power: number,
  depthWeights: Record<FishRarity, number>,
): CastOutcome {
  if (!Number.isFinite(castSeed) || castSeed < 0) {
    throw new Error('castSeed must be a non-negative finite integer')
  }
  const seed = Math.floor(castSeed) >>> 0
  const band = outcomeBandForPower(power)

  // Roll the outcome: low 10 bits → 0..999 (per-mille).
  const roll = seed % 1000
  // Cumulative ordering: miss < snap < junk < normal.
  const missEnd = band.missPerMille
  const snapEnd = missEnd + band.snapPerMille
  const junkEnd = snapEnd + band.junkPerMille
  if (roll < missEnd) {
    return { kind: 'miss', effectiveBps: 0n, rarity: null }
  }
  if (roll < snapEnd) {
    return { kind: 'snap', effectiveBps: SNAP_CATCH_BPS, rarity: null }
  }
  if (roll < junkEnd) {
    return { kind: 'junk', effectiveBps: JUNK_CATCH_BPS, rarity: null }
  }
  // NORMAL — derive rarity using a different nibble of the seed so the
  // outcome roll and rarity pick are independent. XOR-shift the high bits
  // down and mask so we re-use the same `pickRarityFromSeed` contract.
  const raritySeed = ((seed >>> 10) ^ (seed << 5)) >>> 0
  const rarity = pickRarityFromSeed(raritySeed, depthWeights)
  return { kind: 'normal', effectiveBps: rarityValueBps(rarity), rarity }
}

// ─── Casts per trip — bounded by rod tier ──────────────────────────────────

/**
 * Number of casts allowed per trip, gated by rod tier.
 *  Bronze   → 3 casts
 *  Silver   → 5 casts
 *  Gold     → 7 casts
 *  Platinum → 9 casts
 *  Mythic   → 10 casts (hard cap)
 */
export function castsPerTrip(rod: GearTier): number {
  switch (rod) {
    case 'bronze':
      return 3
    case 'silver':
      return 5
    case 'gold':
      return 7
    case 'platinum':
      return 9
    case 'mythic':
      return 10
  }
}

// ─── Reeling minigame parameters ───────────────────────────────────────────

/**
 * Reeling minigame: player taps to nudge a tension marker into the target
 * zone. Rod tier shrinks the target zone slightly (skill curve) — but the
 * SUCCESS feedback (caught fish) is identical across rod tiers. Only the
 * difficulty changes, never the fanfare (RG-C5).
 */
export interface ReelingParams {
  /** Target zone center on the tension bar (0-100). */
  readonly targetCenter: number
  /** Half-width of the target zone (0-50). */
  readonly targetHalfWidth: number
  /** Tension drift per second (units per second). */
  readonly driftPerSecond: number
  /** Tension nudge per tap (positive units toward upper bound). */
  readonly tapNudge: number
  /** Max tension before line snaps (loss). */
  readonly maxTension: number
  /** Min tension before fish escapes (loss). */
  readonly minTension: number
  /** Duration of the reeling minigame (ms). */
  readonly durationMs: number
}

/**
 * Reeling parameters per rod tier. Higher tier = wider target zone +
 * slightly more forgiving drift. The fanfare on success is IDENTICAL.
 */
export function reelingParamsForRod(rod: GearTier): ReelingParams {
  // Universal: tension bar 0-100, target around 50.
  // Half-width shrinks as the rod tier rises — Mythic rod has the WIDEST
  // target (skill bonus), Bronze has the narrowest.
  // (Rationale: upgrading the rod makes the minigame more rewarding, not
  // harder — the player can lean into the grind without snapping lines.)
  const idx = tierIndex(rod)
  const targetHalfWidth = 12 + idx * 3 // 12,15,18,21,24
  const tapNudge = 4 // identical per tap regardless of rod
  const driftPerSecond = 18 // identical drift downward
  const durationMs = 5000 + idx * 500 // 5.0s → 7.0s reel window
  return {
    targetCenter: 50,
    targetHalfWidth,
    driftPerSecond,
    tapNudge,
    maxTension: 100,
    minTension: 0,
    durationMs,
  }
}

/** True when the tension is inside the rod's target zone. */
export function isInTargetZone(tension: number, params: ReelingParams): boolean {
  if (!Number.isFinite(tension)) return false
  const lo = params.targetCenter - params.targetHalfWidth
  const hi = params.targetCenter + params.targetHalfWidth
  return tension >= lo && tension <= hi
}

// ─── Tim 2026-05-24 OO-FISHER L4 — moving target zone ────────────────────
//
// The target zone center oscillates over time during the reeling minigame,
// adding skill depth beyond rhythmic tapping. The player has to chase the
// zone as it shifts.
//
// IMPORTANT: this function is shared by the visible overlay AND the
// provider's drift loop so they ALWAYS agree on where the zone is. The
// offset is a pure function of elapsedMs — no time / random state — so
// the player's visible zone matches the math's zone bit-for-bit.
//
// Oscillation:
//   - amplitude: ±10 units (zone shifts ±10 around the base center=50)
//   - period:    ~2.0s (one full oscillation, slow enough to chase)
//   - smooth sine wave (no jitter, no instant snaps)
//
// RG-C5 SAFE: amplitude + period are MODULE CONSTANTS. No streak or
// rarity parameter can scale these.
export const TARGET_ZONE_OSCILLATION_AMPLITUDE = 10 // ±10 units around base center
export const TARGET_ZONE_OSCILLATION_PERIOD_MS = 2000 // 2.0s full cycle

/**
 * Compute the effective target-zone center at the given elapsed reel time.
 * Returns the moving center; the overlay AND the provider drift loop must
 * call this with the same elapsedMs to agree on what's inside the zone.
 */
export function oscillatingTargetCenter(elapsedMs: number, baseParams: ReelingParams): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return baseParams.targetCenter
  const phase = (elapsedMs / TARGET_ZONE_OSCILLATION_PERIOD_MS) * Math.PI * 2
  const offset = Math.sin(phase) * TARGET_ZONE_OSCILLATION_AMPLITUDE
  // Clamp so the zone never leaves [halfWidth, 100 - halfWidth].
  const clamped = Math.max(
    baseParams.targetHalfWidth,
    Math.min(100 - baseParams.targetHalfWidth, baseParams.targetCenter + offset),
  )
  return clamped
}

/**
 * Returns the effective target zone (center + halfWidth) at the given
 * elapsed reel time. The half-width is unchanged from baseParams — only
 * the center moves. Helper so the overlay and the provider both read the
 * same shape.
 */
export interface EffectiveTargetZone {
  readonly center: number
  readonly halfWidth: number
}

export function effectiveTargetZone(
  elapsedMs: number,
  baseParams: ReelingParams,
): EffectiveTargetZone {
  return {
    center: oscillatingTargetCenter(elapsedMs, baseParams),
    halfWidth: baseParams.targetHalfWidth,
  }
}

// ─── Per-cast payout calculation ───────────────────────────────────────────

/**
 * Computed catch result — the value (in BPS contribution to trip multiplier)
 * of a single caught fish. Internally:
 *   value_bps = rarityValueBps(rarity) * baitBonusBps(bait) / ONE_X_BPS
 * Floor truncation (Domain A); the house keeps the remainder.
 *
 * The bait tier provides a small per-catch BPS bonus (5% per tier above
 * Bronze) — so a Mythic-bait catch yields 1.20x the raw rarity value.
 */
export function payoutForCatch(rarity: FishRarity, _bait: GearTier): bigint {
  // EV-FAIRNESS REBALANCE (2026-06-30): bait NO LONGER multiplies catch value.
  // Bait is now a VARIANCE/flavor upgrade only — it shifts DEPTH_RARITY_WEIGHTS
  // toward rarer fish (via applyBaitWeights) so you hook big fish more often, but
  // it adds no expected-value edge. `_bait` kept for call-site compatibility.
  return rarityValueBps(rarity)
}

/**
 * Settle the entire trip: given the array of caught fish (rarities + bait),
 * compute the trip multiplier in BPS, FLOORED at MAX_TRIP_MULTIPLIER_BPS.
 *
 * Trip multiplier = sum(payoutForCatch) / casts (so a Common-only Bronze
 * trip averages 1.00x; legendary catches drive trips toward the 10x cap).
 *
 * The divisor is `castsAttempted` (NOT castsLanded) so the player can't
 * game the formula by abandoning a trip mid-way — every cast counts toward
 * the divisor, even misses (which contribute 0 to the numerator).
 *
 * Floor truncation; the house keeps the remainder per Domain A.
 *
 * BACK-COMPAT: this signature pre-dates the Layer 1 loss-mechanics rebuild
 * (Tim 2026-05-24) and only handles NORMAL catches. The provider now uses
 * `tripMultiplierFromEntries` below, which accepts pre-evaluated BPS so
 * MISS/SNAP/JUNK entries flow through correctly. This function is kept
 * for the legacy test suite and any back-compat consumers.
 */
export function tripMultiplier(
  catches: ReadonlyArray<{ readonly rarity: FishRarity; readonly bait: GearTier }>,
  castsAttempted: number,
): bigint {
  if (!Number.isInteger(castsAttempted) || castsAttempted <= 0) return ONE_X_BPS
  let sum = 0n
  for (const c of catches) {
    sum += payoutForCatch(c.rarity, c.bait)
  }
  // Floor toward zero (house-favored).
  const raw = sum / BigInt(castsAttempted)
  // RG-C5 STRUCTURAL: hard cap at MAX_TRIP_MULTIPLIER_BPS (10.00x). Cannot
  // be raised at runtime. A Mythic-only trip would otherwise overflow this.
  return raw > MAX_TRIP_MULTIPLIER_BPS ? MAX_TRIP_MULTIPLIER_BPS : raw
}

/**
 * Variant of `tripMultiplier` that accepts pre-evaluated BPS entries. The
 * provider records the BPS contribution for EVERY cast outcome (including
 * MISS = 0n, SNAP = 0n, JUNK = 3_000n) so the trip multiplier reflects
 * the real per-cast distribution rather than only the rarity ladder.
 *
 * `castsAttempted` is the divisor — every cast counts, NOT just the
 * landed ones. A trip with 3 misses out of 3 casts → 0× multiplier
 * (the "skunked" outcome).
 *
 * Bait scaling for NORMAL entries is applied by the caller via
 * `payoutForCatch`; junk/snap entries are NOT bait-scaled (a boot is a
 * boot regardless of which bait you used). House-favored floor truncation
 * throughout; hard cap at MAX_TRIP_MULTIPLIER_BPS.
 */
export function tripMultiplierFromEntries(
  entries: ReadonlyArray<{ readonly effectiveBps: bigint }>,
  castsAttempted: number,
): bigint {
  if (!Number.isInteger(castsAttempted) || castsAttempted <= 0) return ONE_X_BPS
  let sum = 0n
  for (const e of entries) {
    if (e.effectiveBps < 0n) continue // defensive — never count negative
    sum += e.effectiveBps
  }
  // Floor toward zero (house-favored).
  const raw = sum / BigInt(castsAttempted)
  // RG-C5 STRUCTURAL: hard cap at MAX_TRIP_MULTIPLIER_BPS (10.00x).
  return raw > MAX_TRIP_MULTIPLIER_BPS ? MAX_TRIP_MULTIPLIER_BPS : raw
}

/**
 * Settle payout — wager × tripMultiplier, floored. Mirror of Pulse / Vault.
 *
 * Floor truncation (Domain A, house-favored). Negative wager is rejected.
 */
export function tripPayoutLamports(wagerLamports: bigint, tripMultBps: bigint): bigint {
  if (wagerLamports < 0n) throw new Error('wager must be non-negative')
  if (tripMultBps < 0n) throw new Error('trip multiplier must be non-negative')
  if (wagerLamports === 0n) return 0n
  // House-favored truncation; remainder belongs to the house.
  return (wagerLamports * tripMultBps) / ONE_X_BPS
}

// ─── Currency earn from a single catch (the GRINDING signal) ──────────────

/**
 * Per-catch in-game currency earn (in USDC lamports), independent of trip
 * settlement. This is the GRIND signal: the LocalStorage currency counter
 * ratchets visibly every catch so the meta-loop feels rewarding.
 *
 * Earn amount = rarityValueBps × 100 lamports/bp (1 USDC = 1_000_000 lamports
 * = 10_000 bps × 100 lamports/bp).
 *  Common    →  100_000 lamports (0.10 USDC)
 *  Uncommon  →  200_000 lamports (0.20 USDC)
 *  Rare      →  400_000 lamports (0.40 USDC)
 *  Epic      →  800_000 lamports (0.80 USDC)
 *  Legendary →1_600_000 lamports (1.60 USDC)
 *  Mythic    →5_000_000 lamports (5.00 USDC)
 *
 * Bait tier provides a flat per-catch bonus (5% per tier above Bronze) so
 * the meta-loop visibly rewards bait upgrades.
 *
 * Floor truncation throughout (Domain A).
 */
const LAMPORTS_PER_BPS = 100n

export function currencyForCatch(rarity: FishRarity, bait: GearTier): bigint {
  const raw = rarityValueBps(rarity) * LAMPORTS_PER_BPS
  const baitIdx = tierIndex(bait)
  const baitMultiplier = 100n + BigInt(baitIdx) * 5n
  // Floor toward zero — house-favored truncation.
  return (raw * baitMultiplier) / 100n
}

// ─── Ownership-engine points (shared rule across Originals) ───────────────

const POINTS_BPS_SCALE = 10_000n
const POINTS_WIN_MULT_BPS = 10_000n
const POINTS_LOSS_MULT_BPS = 15_000n

/**
 * Mirror of `packages/points/earn-rules.ts`. Win = 1.0x, loss = 1.5x.
 * Floor truncation (Domain A, house-favored).
 */
export function pointsForBet(wagerLamports: bigint, won: boolean): bigint {
  if (wagerLamports < 0n) return 0n
  const usdcWhole = wagerLamports / USDC_LAMPORTS_PER_UNIT
  const mult = won ? POINTS_WIN_MULT_BPS : POINTS_LOSS_MULT_BPS
  return (usdcWhole * mult) / POINTS_BPS_SCALE
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
    const whole = abs / USDC_LAMPORTS_PER_UNIT
    const frac = abs % USDC_LAMPORTS_PER_UNIT
    const cents = (frac / 10_000n).toString().padStart(2, '0')
    return `-${whole}.${cents} USDC`
  }
  const whole = lamports / USDC_LAMPORTS_PER_UNIT
  const frac = lamports % USDC_LAMPORTS_PER_UNIT
  const cents = (frac / 10_000n).toString().padStart(2, '0')
  return `${whole}.${cents} USDC`
}

/** Compact USDC (no unit suffix) — used in the meta-currency header. */
export function formatUsdcCompact(lamports: bigint): string {
  if (lamports < 0n) return formatUsdcCompact(-lamports).replace(/^/, '-')
  const whole = lamports / USDC_LAMPORTS_PER_UNIT
  const frac = lamports % USDC_LAMPORTS_PER_UNIT
  const cents = (frac / 10_000n).toString().padStart(2, '0')
  return `${whole}.${cents}`
}

/**
 * STASH is a meta gear-credit, NOT money — it's earned per catch and only spent
 * on gear. To stop players reading it as their wager balance, it's displayed in
 * "scales" (thematic fish-scale unit), decoupled from USDC. Internal storage
 * stays in lamports; 1 scale = 0.10 USDC of stash value. Floor toward zero.
 */
const STASH_LAMPORTS_PER_SCALE = 100_000n
export function formatScales(lamports: bigint): string {
  const n = (lamports < 0n ? -lamports : lamports) / STASH_LAMPORTS_PER_SCALE
  const sign = lamports < 0n ? '-' : ''
  return `${sign}${n.toLocaleString('en-US')}`
}

export function formatPoints(points: bigint): string {
  return points.toLocaleString('en-US')
}

/** Format a depth tier as `"D-N"` for the heads-up display. */
export function formatDepth(depth: DepthTier): string {
  return `D-${depth}`
}

/**
 * Human-readable rarity band a player can expect at a given depth. This
 * derives directly from `DEPTH_RARITY_WEIGHTS` — the band is built from
 * the rarities that have a non-zero weight at that depth, listed from
 * most-common to most-rare. Used by the in-canvas depth-label rail and
 * the cast-power preview so the player knows BEFORE they release what
 * they're aiming for.
 *
 * Examples (canonical bag, see DEPTH_RARITY_WEIGHTS):
 *   D-1 → "mostly COMMON"
 *   D-2 → "COMMON + UNCOMMON + RARE"
 *   D-3 → "UNCOMMON + RARE (EPIC rare)"
 *   D-4 → "RARE + EPIC (LEGENDARY rare)"
 *   D-5 → "EPIC + LEGENDARY (MYTHIC rare)"
 *
 * RG-C5 SAFE: derived from CONSTANT weight tables, never from streak
 * length or session state.
 */
export function depthRarityBand(depth: DepthTier): string {
  const weights = DEPTH_RARITY_WEIGHTS[depth]
  const sorted = FISH_RARITIES.filter((r) => (weights[r] ?? 0) > 0).sort(
    (a, b) => (weights[b] ?? 0) - (weights[a] ?? 0),
  )
  if (sorted.length === 0) return 'no fish'
  // Format: split into "primary band" (weight ≥ 15) vs "rare tail" (< 15)
  const primary = sorted.filter((r) => (weights[r] ?? 0) >= 15)
  const tail = sorted.filter((r) => (weights[r] ?? 0) < 15 && (weights[r] ?? 0) > 0)
  const primaryStr = primary.map((r) => RARITY_VISUALS[r].label.toUpperCase()).join(' + ')
  if (tail.length === 0) {
    return primary.length === 1 ? `mostly ${primaryStr}` : primaryStr
  }
  const tailStr = tail.map((r) => RARITY_VISUALS[r].label.toUpperCase()).join(' / ')
  return `${primaryStr} (${tailStr} rare)`
}

/** Format a gear tier as title-case display. */
export function formatTier(tier: GearTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

// ─── LocalStorage meta-state codec ─────────────────────────────────────────

/**
 * The persisted meta state. Schema is versioned so future migrations can be
 * detected (V2 might add a 4th upgrade tree, e.g. tackle-box).
 *
 * Persistence format (LocalStorage):
 *  - `swoobz-oo-fisher-currency`: decimal string of lamports (no marker
 *    suffix because LocalStorage is a UI surface, not a database outbox).
 *  - `swoobz-oo-fisher-upgrades`: JSON `{ v: 1, rod: 'gold', boat: 'silver',
 *    bait: 'bronze' }`.
 */
export interface PersistedMeta {
  readonly v: 1
  readonly rod: GearTier
  readonly boat: GearTier
  readonly bait: GearTier
}

export const STORAGE_KEY_CURRENCY = 'swoobz-oo-fisher-currency'
export const STORAGE_KEY_UPGRADES = 'swoobz-oo-fisher-upgrades'

/** Serialize meta-currency for LocalStorage. */
export function formatMetaCurrency(lamports: bigint): string {
  if (lamports < 0n) return '0'
  return lamports.toString()
}

/**
 * Parse meta-currency from LocalStorage. Defensive — any malformed input
 * resolves to 0n (the safe default; player loses nothing because the value
 * was already corrupted).
 */
export function parseMetaCurrency(raw: string | null): bigint {
  if (raw === null) return 0n
  if (!/^[0-9]+$/.test(raw)) return 0n
  try {
    return BigInt(raw)
  } catch {
    return 0n
  }
}

/** Serialize meta-loadout for LocalStorage. */
export function formatMetaLoadout(loadout: GearLoadout): string {
  const payload: PersistedMeta = {
    v: 1,
    rod: loadout.rod,
    boat: loadout.boat,
    bait: loadout.bait,
  }
  return JSON.stringify(payload)
}

/**
 * Parse meta-loadout from LocalStorage. Defensive — any malformed input
 * resolves to STARTING_LOADOUT.
 */
export function parseMetaLoadout(raw: string | null): GearLoadout {
  if (raw === null) return STARTING_LOADOUT
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isPersistedMeta(parsed)) return STARTING_LOADOUT
    return {
      rod: parsed.rod,
      boat: parsed.boat,
      bait: parsed.bait,
    }
  } catch {
    return STARTING_LOADOUT
  }
}

function isPersistedMeta(value: unknown): value is PersistedMeta {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v.v !== 1) return false
  if (typeof v.rod !== 'string' || !GEAR_TIERS.includes(v.rod as GearTier)) {
    return false
  }
  if (typeof v.boat !== 'string' || !GEAR_TIERS.includes(v.boat as GearTier)) {
    return false
  }
  if (typeof v.bait !== 'string' || !GEAR_TIERS.includes(v.bait as GearTier)) {
    return false
  }
  return true
}

// ─── Mirror roundtrip self-check ───────────────────────────────────────────

// ─── Monte Carlo RTP simulator (Layer 1 disclosure, Tim 2026-05-24) ──────
//
// Simulates `iterations` trips for a representative player and returns the
// observed RTP / mean trip multiplier. Used to:
//   1. Verify at module-load time that RTP < 100% (RTP_DRIFT_GATE).
//   2. Power the lobby card / Glass Box "Published RTP" disclosure.
//
// Player model — calibrated to land RTP ≈ 96%:
//   - Bronze rod (3 casts/trip) + Bronze boat + Bronze bait (entry tier)
//   - Power sampled per cast from a normal-ish distribution centered on 60
//     with σ ≈ 18 (most casts in the sweet spot, some outliers)
//   - Reeling minigame success modelled as a 60% catch-completion rate
//     (the player still needs to land the tap-rhythm; missing the reel
//     converts a would-be normal outcome into a SNAP)
//
// Deterministic per (seed, iterations). Bounded iterations: caller caps.
//
// The lookup we care about: `mean(payout) / mean(wager)`. The wager is
// normalized to 1 USDC per trip so the RTP ratio is dimensionless.

export interface FisherRtpResult {
  readonly iterations: number
  /** Mean trip multiplier in BPS across all sims. */
  readonly meanTripMultiplierBps: number
  /** Median trip multiplier (BPS) — distribution sanity. */
  readonly medianTripMultiplierBps: number
  /** Fraction of trips that returned >= 1.00x payout. */
  readonly payoutRate: number
  /** RTP in [0, 1]. 0.96 means 96%. */
  readonly rtp: number
  /** House edge = 1 - RTP. */
  readonly houseEdge: number
  /** Fraction of TRIPS that ended with at least one MISS outcome. */
  readonly missRate: number
  /** Fraction of TRIPS that ended with at least one SNAP outcome. */
  readonly snapRate: number
  /** Fraction of TRIPS that ended with at least one JUNK outcome. */
  readonly junkRate: number
  /** Fraction of TRIPS that ended skunked (0 catches across all casts). */
  readonly skunkRate: number
}

/**
 * Internal RNG — same LCG-style integer hash used by `pickRarityFromSeed`.
 * Pure function; no allocations per call.
 */
function nextSimSeed(prev: number, salt: number): number {
  let s = (prev ^ (salt * 0x9e3779b9)) >>> 0
  s = ((s + 0x7f4a7c15) ^ (s >>> 16)) >>> 0
  s = Math.imul(s, 0x85ebca6b) >>> 0
  s = (s ^ (s >>> 13)) >>> 0
  s = Math.imul(s, 0xc2b2ae35) >>> 0
  return (s ^ (s >>> 16)) >>> 0
}

/**
 * Sample a power value from a roughly normal distribution centered on 60
 * with sigma ≈ 18 via two-sample-mean. Bounded to [0, 100].
 */
function samplePower(seedU32: number): number {
  // Two uniform samples in [0..1) averaged → approximate normal.
  const u1 = ((seedU32 & 0xffff) / 0xffff)
  const u2 = (((seedU32 >>> 16) & 0xffff) / 0xffff)
  const avg = (u1 + u2) / 2 // mean 0.5, sigma ≈ 0.20
  // Scale to mean 60, ±~36 spread, then clamp.
  const power = Math.round(60 + (avg - 0.5) * 72)
  if (power < 0) return 0
  if (power > 100) return 100
  return power
}

/**
 * Simulate a single trip for the player model. Returns the trip multiplier
 * in BPS, plus per-trip outcome flags.
 */
function simulateSingleTrip(
  startSeed: number,
  rod: GearTier,
  boat: GearTier,
  bait: GearTier,
): {
  multiplierBps: bigint
  catches: number
  missCount: number
  snapCount: number
  junkCount: number
} {
  const casts = castsPerTrip(rod)
  const entries: { effectiveBps: bigint }[] = []
  let seed = startSeed >>> 0
  let missCount = 0
  let snapCount = 0
  let junkCount = 0
  let catches = 0
  // Reeling success rate — a typical player resolves ~62% of normal casts
  // into landed catches. The remainder convert into a SNAP (line lost
  // during the reel). The miss/junk per-cast outcome already accounts for
  // the swing-and-miss case BEFORE the reel; this models the in-reel
  // failure where the fish bit but the player let it escape.
  // EV-FAIRNESS REBALANCE (2026-06-30): raised from 0.62 so reeling is a
  // forgiving variance step, not a big EV gap between sharks and casuals. The
  // real reeling minigame is widened to match (reelingParamsForRod). Reel SKILL
  // still pays off via the EV-neutral perfect-band STASH bonus.
  const REEL_SUCCESS_RATE = 0.98
  for (let i = 0; i < casts; i += 1) {
    seed = nextSimSeed(seed, i + 1)
    const power = samplePower(seed)
    const depth = castPowerToDepth(power, boat)
    const depthWeights = DEPTH_RARITY_WEIGHTS[depth]
    const shiftedWeights = applyBaitWeights(depthWeights, bait)
    const outcome = evaluateCastOutcome(seed, power, shiftedWeights)
    if (outcome.kind === 'miss') {
      missCount += 1
      entries.push({ effectiveBps: 0n })
      continue
    }
    if (outcome.kind === 'snap') {
      snapCount += 1
      entries.push({ effectiveBps: 0n })
      continue
    }
    if (outcome.kind === 'junk') {
      junkCount += 1
      entries.push({ effectiveBps: JUNK_CATCH_BPS })
      catches += 1
      continue
    }
    // NORMAL — gate by the reel-success roll. If the player flubs the
    // reel, treat the cast as a SNAP for payout purposes.
    seed = nextSimSeed(seed, i * 7 + 31)
    const reelRoll = ((seed >>> 8) & 0xffff) / 0xffff
    if (reelRoll > REEL_SUCCESS_RATE) {
      snapCount += 1
      entries.push({ effectiveBps: 0n })
      continue
    }
    // Apply the bait scaling via `payoutForCatch` so the simulator agrees
    // with production. The rarity is guaranteed non-null for NORMAL.
    if (outcome.rarity === null) {
      entries.push({ effectiveBps: 0n })
      continue
    }
    entries.push({ effectiveBps: payoutForCatch(outcome.rarity, bait) })
    catches += 1
  }
  return {
    multiplierBps: tripMultiplierFromEntries(entries, casts),
    catches,
    missCount,
    snapCount,
    junkCount,
  }
}

/**
 * Run `iterations` simulated trips and return the aggregated RTP /
 * variance breakdown. Bounded to 100_000 to keep CPU usable in the
 * browser (the typical iteration count is 4-10k for the published RTP).
 *
 * NB: simulates the BASELINE player (Bronze across all three trees). The
 * tier system only REDUCES the house edge from this baseline (per the
 * casino-RTP-discipline rule), so the published RTP is the floor a new
 * player sees on day one.
 */
export function simulateFisherRtp(
  startingSeed: number,
  iterations: number,
): FisherRtpResult {
  if (!Number.isInteger(iterations) || iterations <= 0 || iterations > 100_000) {
    throw new Error('iterations must be a positive integer up to 100_000')
  }
  const wager = 1_000_000n // 1 USDC; cancels in the ratio.
  const multipliers: number[] = []
  let totalWager = 0n
  let totalPayout = 0n
  let payoutHits = 0
  let tripsWithMiss = 0
  let tripsWithSnap = 0
  let tripsWithJunk = 0
  let skunkTrips = 0
  let seed = (startingSeed >>> 0) || 0xc0ffee
  for (let i = 0; i < iterations; i += 1) {
    seed = nextSimSeed(seed, i + 1)
    const trip = simulateSingleTrip(seed, 'bronze', 'bronze', 'bronze')
    const mult = trip.multiplierBps
    multipliers.push(Number(mult))
    totalWager += wager
    const payout = tripPayoutLamports(wager, mult)
    totalPayout += payout
    if (payout >= wager) payoutHits += 1
    if (trip.missCount > 0) tripsWithMiss += 1
    if (trip.snapCount > 0) tripsWithSnap += 1
    if (trip.junkCount > 0) tripsWithJunk += 1
    if (trip.catches === 0) skunkTrips += 1
  }
  multipliers.sort((a, b) => a - b)
  const meanBps =
    multipliers.reduce((acc, m) => acc + m, 0) / multipliers.length
  const medianBps = multipliers[Math.floor(multipliers.length / 2)] ?? 0
  // RTP = total returned / total wagered. Scale up to preserve precision.
  const rtpScaled = (totalPayout * 1_000_000n) / totalWager
  const rtp = Number(rtpScaled) / 1_000_000
  return {
    iterations,
    meanTripMultiplierBps: meanBps,
    medianTripMultiplierBps: medianBps,
    payoutRate: payoutHits / iterations,
    rtp,
    houseEdge: 1 - rtp,
    missRate: tripsWithMiss / iterations,
    snapRate: tripsWithSnap / iterations,
    junkRate: tripsWithJunk / iterations,
    skunkRate: skunkTrips / iterations,
  }
}

/**
 * Canonical published RTP for OO-FISHER. Computed once at first call via
 * the Monte Carlo simulator with a fixed seed + iteration count so every
 * player sees the same disclosed number. Brand-register honest disclosure.
 *
 * The fixed seed (1) + iteration count (5_000) keep the value stable
 * across builds. Increasing iteration count would tighten the estimate
 * but the marginal gain past ~5k is small (CLT plateau).
 */
const FISHER_RTP_SEED = 1
const FISHER_RTP_ITERATIONS = 5_000
let cachedFisherRtp: FisherRtpResult | null = null
export function publishedFisherRtp(): FisherRtpResult {
  if (cachedFisherRtp !== null) return cachedFisherRtp
  cachedFisherRtp = simulateFisherRtp(FISHER_RTP_SEED, FISHER_RTP_ITERATIONS)
  return cachedFisherRtp
}

/** Format RTP as `"96.5%"`. Rounds to one decimal. */
export function formatRtp(rtp: number): string {
  if (!Number.isFinite(rtp) || rtp < 0) return '--'
  return `${(rtp * 100).toFixed(1)}%`
}

/** Format house edge as `"3.5%"`. Negative edge would be player-edge — banned. */
export function formatHouseEdge(edge: number): string {
  if (!Number.isFinite(edge)) return '--'
  if (edge < 0) return `+${Math.abs(edge * 100).toFixed(1)}% (player edge)`
  return `${(edge * 100).toFixed(1)}%`
}

/**
 * Drift gate. Runs at module load: throws if any constant diverges from the
 * canonical reference values. Same gate as the Vault `mirrorRoundtripCheck`
 * — if any constant is silently raised in the future, the module fails to
 * load instead of silently producing inflated payouts.
 */
function mirrorRoundtripCheck(): void {
  // Hard cap check
  const cap: bigint = MAX_TRIP_MULTIPLIER_BPS
  if (cap !== 100_000n) {
    throw new Error(`oo-fisher trip cap drift: expected 100_000, got ${cap.toString()}`)
  }
  // Rarity value ladder check (2026-06-30 EV-fairness rebalance)
  if (RARITY_VALUE_BPS.mythic !== 120_000n) {
    throw new Error(
      `oo-fisher mythic value drift: expected 120_000, got ${RARITY_VALUE_BPS.mythic.toString()}`,
    )
  }
  // Upgrade cost curve check: Bronze → Silver = 50 USDC
  if (upgradeCost('bronze') !== 50_000_000n) {
    throw new Error(
      `oo-fisher bronze cost drift: expected 50_000_000, got ${upgradeCost('bronze').toString()}`,
    )
  }
  if (upgradeCost('platinum') !== 6_250_000_000n) {
    throw new Error(
      `oo-fisher platinum cost drift: expected 6_250_000_000, got ${upgradeCost('platinum').toString()}`,
    )
  }
  if (upgradeCost('mythic') !== 0n) {
    throw new Error(
      `oo-fisher mythic ceiling drift: expected 0 upgrade cost, got ${upgradeCost('mythic').toString()}`,
    )
  }
  // Trip multiplier cap check: all-mythic, 1 cast (max wager scenario)
  const allMythic = tripMultiplier([{ rarity: 'mythic', bait: 'mythic' }], 1)
  if (allMythic !== MAX_TRIP_MULTIPLIER_BPS) {
    throw new Error(
      `oo-fisher trip cap not enforced: ${allMythic.toString()} != ${MAX_TRIP_MULTIPLIER_BPS.toString()}`,
    )
  }
  // Casts-per-trip ladder check
  if (castsPerTrip('bronze') !== 3) {
    throw new Error('oo-fisher casts-per-trip drift at bronze')
  }
  if (castsPerTrip('mythic') !== 10) {
    throw new Error('oo-fisher casts-per-trip drift at mythic')
  }
  // Cast-power mapping check
  if (castPowerToDepth(50, 'mythic') !== 3) {
    throw new Error('oo-fisher cast-depth mapping drift at power=50 mythic-boat')
  }
  if (castPowerToDepth(95, 'bronze') !== 1) {
    throw new Error('oo-fisher boat cap drift at power=95 bronze-boat')
  }
}

mirrorRoundtripCheck()

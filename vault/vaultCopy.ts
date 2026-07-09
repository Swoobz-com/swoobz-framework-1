/**
 * Vault narrative + rhythm helpers — Domain C (presentation only).
 *
 * Brand register: RUG OR RICHES speaks DEGEN-CRYPTO — meme-literate,
 * punchy, funny-but-honest ("WE ARE SO BACK", "aped to the moon", "you've
 * been FTX'd"). The world story: crack open a crypto vault's sealed
 * compartments; coins pump the bag, rugs end the round. Never institutional,
 * never predatory chase-pressure. The vocabulary lives in this
 * module so the surface stays consistent across lobby + settlement + share.
 *
 * RG-C5 STRUCTURAL ENFORCEMENT (mirror of OoFisher pattern):
 * ---------------------------------------------------------
 * Variant selection within a bucket is deterministic — keyed off the
 * final multiplier BPS only (`finalMultiplierBps % N`). No randomness,
 * no streak parameter, no session-rounds input. Day-1 outcome (won,
 * 4_320 bps) reads the same line as day-365 outcome (won, 4_320 bps).
 *
 * RHYTHM TRACKING:
 * ----------------
 * The "perfect tumbler" rhythm celebration is a PURELY VISUAL feedback
 * loop. The on-chain math is FIXED (vaultMath.cumulativeMultiplierBps).
 * The rhythm window does NOT modify any economic value. It surfaces a
 * "perfect tumbler" / "in the groove" badge + tumbler-click sound on the
 * Nth consecutive in-rhythm tap. The 1.05-1.15× language in the campaign
 * spec maps to the CUMULATIVE multiplier band where the rhythm bucket
 * activates — not a payout modifier.
 *
 * Domain C: presentation only. Pure functions. No mutation, no I/O.
 */

import { ONE_X_BPS } from './vaultMath'

// ─── Narrative settlement headlines ────────────────────────────────────────

/** ≥ 3.00× — exceptional crack. The safe "sang open". */
const HUGE_VAULT_BPS = 30_000n
/** ≥ 1.50× — solid crack. Clean turn. */
const SOLID_VAULT_BPS = 15_000n

/** Huge — generational pump. Diamond hands paid. */
export const HUGE_VAULT_NARRATIVES: ReadonlyArray<string> = [
  'WE ARE SO BACK',
  'diamond hands paid off',
  'generational pump',
  'aped to the moon',
] as const

/** Solid — secured a real bag. */
export const SOLID_VAULT_NARRATIVES: ReadonlyArray<string> = [
  'secured the bag',
  'took profit clean',
  'green candles only',
  "didn't get greedy",
] as const

/** Tight — small bag, still a bag. */
export const TIGHT_VAULT_NARRATIVES: ReadonlyArray<string> = [
  'scraped some green',
  'small bag, still a bag',
  "you'll take it",
  'paper-handed, but up',
] as const

/** Loss — rugged. */
export const LOSS_VAULT_NARRATIVES: ReadonlyArray<string> = [
  'rugged',
  'floor fell out',
  'ngmi this time',
  'got rekt',
] as const

/**
 * Degen loss-flavor nudges — the funny crypto-culture gut-punch shown under
 * "RUGGED" on a loss. In-group humour, never predatory: no "run it back", no
 * escalation. RG-C5: deterministic by `seed % pool.length`, identical for the
 * same seed every render. The seed is a per-round value (wager + pumps) so the
 * line varies round to round but is reproducible.
 */
export const DEGEN_RUG_NUDGES: ReadonlyArray<string> = [
  "you've been FTX'd",
  'bought Luna at the top',
  'exit liquidity, anon',
  'rugged harder than Terra',
  'got SBF’d',
  'down horrendous',
  'should’ve taken profit',
  'paper hands, paper bag',
  'this is not financial advice',
  'wen recovery',
  'diamond hands, zero balance',
  'aped in, got rugged',
] as const

/** Pick a degen rug nudge deterministically from a per-round seed (RG-C5). */
export function degenRugNudge(seed: bigint): string {
  const len = BigInt(DEGEN_RUG_NUDGES.length)
  if (len === 0n) return ''
  const raw = seed < 0n ? -seed : seed
  return DEGEN_RUG_NUDGES[Number(raw % len)] ?? ''
}

/**
 * Return the narrative settlement headline for a vault round.
 *
 * Buckets:
 *   - won && multiplier ≥ HUGE_VAULT_BPS → HUGE pool
 *   - won && multiplier ≥ SOLID_VAULT_BPS → SOLID pool
 *   - won (anything else) → TIGHT pool
 *   - !won → LOSS pool
 *
 * Variant within a bucket: deterministic by `multiplierBps % pool.length`.
 * Day-1 outcome at (won, 4_320 bps) reads identically to day-365 outcome
 * at (won, 4_320 bps). RG-C5 by construction.
 */
export function settlementNarrative(multiplierBps: bigint, won: boolean): string {
  const pool: ReadonlyArray<string> = !won
    ? LOSS_VAULT_NARRATIVES
    : multiplierBps >= HUGE_VAULT_BPS
      ? HUGE_VAULT_NARRATIVES
      : multiplierBps >= SOLID_VAULT_BPS
        ? SOLID_VAULT_NARRATIVES
        : TIGHT_VAULT_NARRATIVES
  const len = BigInt(pool.length)
  if (len === 0n) return ''
  const raw = multiplierBps < 0n ? -multiplierBps : multiplierBps
  const idx = Number(raw % len)
  // pool is non-empty (len > 0); idx in [0, len). Guard nullishly to keep
  // the lint clean — the empty-string return is structurally unreachable.
  return pool[idx] ?? ''
}

/**
 * Eyebrow line above the narrative — discipline / institutional register.
 * Identical phrasing per outcome class (no per-round variation; RG-C5 safe).
 */
export function settlementEyebrow(won: boolean): string {
  return won ? 'TAKE PROFIT' : 'RUGGED'
}

// ─── Target-lock / auto-cash headlines (ITEM 3) ─────────────────────────────

/**
 * Headline pool shown when a WIN was banked by the player's target-lock rule
 * rather than a manual tap. The register is discipline/intent — the player set
 * an exit and it hit. RG-C5: variant is deterministic by `finalMultiplierBps %
 * pool.length`; there is NO streak/session input, and this only swaps a COPY
 * line — the celebration envelope is identical to a manual cash-out.
 */
export const TARGET_LOCK_NARRATIVES: ReadonlyArray<string> = [
  'TARGET LOCKED IN',
  'DISCIPLINE PAID',
  'exit hit, no greed',
  'set it and banked it',
] as const

/** Pick a target-lock headline deterministically from the final multiplier. */
export function targetLockNarrative(multiplierBps: bigint): string {
  const len = BigInt(TARGET_LOCK_NARRATIVES.length)
  if (len === 0n) return ''
  const raw = multiplierBps < 0n ? -multiplierBps : multiplierBps
  return TARGET_LOCK_NARRATIVES[Number(raw % len)] ?? ''
}

// ─── Rhythm tracking (perfect-tumbler visual celebration) ──────────────────

/**
 * Window in milliseconds between two consecutive safe reveals for the
 * second reveal to count as "in rhythm". The vault metaphor: safe-crackers
 * develop a tempo on a real combination dial. When the player taps the
 * next tile within this window, the rhythm continues.
 *
 * Module-level constant — RG-C5 structural: not a parameter, not session
 * state. Day-1 player rhythm window === day-365 player rhythm window.
 */
export const RHYTHM_WINDOW_MS = 1_400

/**
 * Minimum cumulative multiplier required for a "perfect tumbler" badge.
 * The badge is purely visual; the on-chain math is unchanged. The badge
 * activates only once the round has built genuine economic stake (so it
 * doesn't fire on a rhythm of two near-zero-delta clicks).
 *
 * 10_500 BPS = 1.05× cumulative — matches the campaign's 1.05-1.15×
 * "perfect-hit ramp" range, reinterpreted as the band where the rhythm
 * celebration TIER activates. The math itself never ramps; only the
 * cosmetic badge tier shifts.
 */
export const RHYTHM_MIN_CUMULATIVE_BPS = 10_500n

/**
 * Tier band: at >= this BPS, the rhythm badge upgrades from "in rhythm"
 * to "perfect tumbler" (the 1.15× edge of the campaign band). Cosmetic
 * only.
 */
export const RHYTHM_PEAK_CUMULATIVE_BPS = 11_500n

/**
 * Minimum consecutive in-rhythm safe reveals before the badge surfaces.
 * 3 = "three quick in-rhythm taps" — enough to feel like a deliberate
 * pattern, not an accident.
 */
export const RHYTHM_MIN_CHAIN = 3

/**
 * Result of a rhythm-tick evaluation.
 *
 * `chain` is the new consecutive-in-rhythm count.
 * `badge` is the cosmetic tier to display: null (no badge), 'rhythm'
 *   (in-rhythm chain but pre-peak), or 'perfect' (peak band reached).
 */
export interface RhythmTick {
  readonly chain: number
  readonly badge: 'rhythm' | 'perfect' | null
}

/**
 * Evaluate a rhythm tick. Pure function — given the previous reveal time,
 * the current reveal time, the previous chain count, and the round's
 * current cumulative multiplier, return the new chain count and the
 * cosmetic badge tier.
 *
 * RG-C5 SAFE: inputs are timestamps + an economic value (cumulative bps).
 * No streak length, no session-rounds, no per-tile escalation by index.
 * The badge tier is bucketed by the CURRENT cumulative multiplier (an
 * economic signal), not by how many tiles preceded.
 *
 * @param previousRevealAt Timestamp of the prior safe reveal (ms). Pass
 *   0 for "no prior reveal" (resets chain).
 * @param now Timestamp of THIS reveal (ms).
 * @param previousChain Consecutive in-rhythm count BEFORE this reveal.
 * @param cumulativeBps Cumulative multiplier AFTER this reveal, in BPS.
 * @returns The updated chain count + badge tier to display.
 */
export function evaluateRhythmTick(
  previousRevealAt: number,
  now: number,
  previousChain: number,
  cumulativeBps: bigint,
): RhythmTick {
  // No prior reveal — chain resets to 1 (this reveal itself).
  if (previousRevealAt <= 0) {
    return { chain: 1, badge: null }
  }
  const elapsed = now - previousRevealAt
  // Out of window — chain resets to 1.
  if (elapsed < 0 || elapsed > RHYTHM_WINDOW_MS) {
    return { chain: 1, badge: null }
  }
  const chain = previousChain + 1
  // Below the minimum chain length — no badge yet.
  if (chain < RHYTHM_MIN_CHAIN) {
    return { chain, badge: null }
  }
  // Below the minimum cumulative-multiplier band — no badge (RG-C0:
  // celebration only when there is genuine economic stake on the table).
  if (cumulativeBps < RHYTHM_MIN_CUMULATIVE_BPS) {
    return { chain, badge: null }
  }
  // Peak band — "perfect tumbler" tier.
  if (cumulativeBps >= RHYTHM_PEAK_CUMULATIVE_BPS) {
    return { chain, badge: 'perfect' }
  }
  // Mid band — "in rhythm" tier.
  return { chain, badge: 'rhythm' }
}

/**
 * Map the rhythm-badge tier to its display label. Module-const lookup —
 * RG-C5 safe (no per-state escalation).
 */
export function rhythmBadgeLabel(badge: RhythmTick['badge']): string {
  switch (badge) {
    // Reworded off "PERFECT PUMP" (jesse fix): it's a purely cosmetic tempo
    // flair and must NOT read as a multiplier/payout bonus or reuse "pump"
    // (which already means the multiplier). Pure style, no EV.
    case 'perfect':
      return 'CLEAN TEMPO'
    case 'rhythm':
      return 'IN RHYTHM'
    case null:
      return ''
  }
}

// ─── Self-check (drift gate) ───────────────────────────────────────────────

/**
 * Drift gate that runs at module load. Throws on any divergence between
 * the canonical settlement-narrative buckets and the band thresholds.
 * Cheap; runs once per process. Mirrors the vaultMath roundtrip pattern.
 */
function narrativeDriftCheck(): void {
  // 1× win (10_000 bps) → tight pool. 1× < 1.50×, so TIGHT.
  const tight = settlementNarrative(ONE_X_BPS, true)
  if (!TIGHT_VAULT_NARRATIVES.includes(tight)) {
    throw new Error('vaultCopy: 1× win must read from TIGHT pool')
  }
  // 1.50× win → solid pool.
  const solid = settlementNarrative(SOLID_VAULT_BPS, true)
  if (!SOLID_VAULT_NARRATIVES.includes(solid)) {
    throw new Error('vaultCopy: 1.50× win must read from SOLID pool')
  }
  // 3.00× win → huge pool.
  const huge = settlementNarrative(HUGE_VAULT_BPS, true)
  if (!HUGE_VAULT_NARRATIVES.includes(huge)) {
    throw new Error('vaultCopy: 3.00× win must read from HUGE pool')
  }
  // Any loss → loss pool.
  const loss = settlementNarrative(50_000n, false)
  if (!LOSS_VAULT_NARRATIVES.includes(loss)) {
    throw new Error('vaultCopy: loss must read from LOSS pool regardless of multiplier')
  }
  // Determinism: same inputs → same output (idempotency check).
  if (settlementNarrative(SOLID_VAULT_BPS, true) !== solid) {
    throw new Error('vaultCopy: settlementNarrative is not deterministic')
  }
}

narrativeDriftCheck()

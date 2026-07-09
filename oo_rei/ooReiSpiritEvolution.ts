/**
 * ooReiSpiritEvolution.ts — Spirit Evolution gauge math (Domain A).
 *
 * The Spirit Evolution mechanic is a permanent visible prize-meter — the Spirit
 * Gauge — that fills with the spirit-seal ownership points ALREADY accrued by
 * computeOwnershipPoints (in ooReiMath.ts). As the gauge crosses four named
 * thresholds, the looming spirit figure behind the grid visibly transforms
 * across four forms: Dormant → Stirring → Manifest → Radiant → Transcendent.
 *
 * RTP-NEUTRALITY (see spec §12): this mechanic introduces NO new payout path.
 * It consumes ownership points that were already computed every settled spin. It
 * does not credit the player's USDC balance, does not modify totalWinLamports,
 * and does not modify totalPayBps. The published 96% RTP is unchanged.
 *
 * Domain A discipline:
 *   - All accumulation arithmetic is BigInt (no IEEE-754 in any math path).
 *   - Floor truncation, always toward zero, house-favored.
 *   - Fail-closed: negative inputs throw, they are never defaulted away.
 *   - Deterministic: identical inputs produce identical output across any number
 *     of executions (pure functions, no Date.now / Math.random / I/O).
 *
 * The ONLY function that produces a `number` is spiritGaugeFillRatio — and that
 * is a DISPLAY value (Domain C presentation), explicitly never fed back into any
 * financial or accumulation path. The integer division floors first; the Number
 * cast is presentation-only.
 *
 * Pacing calibration (2026-05-29 redesign):
 * The gauge cap is now WAGER-RELATIVE, not lamport-absolute. This normalises
 * cycle duration across all wager tiers so a $25 player and a $1 player both
 * traverse ~160-200 spins per gauge cycle.
 *
 * Reference: OO-REI-PROGRESSION-MAP-REDESIGN-2026-05-29.md §Part 1.
 *
 * SOLANA-BLUETEAM DOMAIN A REVIEW REQUIRED:
 *   - SPIRIT_GAUGE_CAP_LAMPORTS removed (was 250_000_000n, wager-absolute).
 *   - SPIRIT_GAUGE_CYCLES_SPINS_TARGET added (spin-count target, wager-agnostic).
 *   - computeSpiritFormThresholds(gaugeCap) added (derives 25/50/75/100% per wager).
 *   - advanceSpiritGauge, spiritGaugeFillRatio, currentSpiritForm all gain gaugeCap param.
 *   - No new payout path. BigInt throughout. Floor truncation house-favored.
 *   - Carry-forward remainder logic unchanged — only the cap derivation is new.
 *   - Determinism verified by test suite (100 identical calls, identical output).
 */

/**
 * Target spin count per gauge cycle at median hit rate.
 * Calibration: 160 spins × 1.25x avg accrual = 200 spins actual median range.
 * (50% win at 1.0x + 50% loss at 1.5x = 1.25x avg accrual per spin.)
 *
 * At any wager tier, gaugeCap = wagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET).
 * This makes cycle duration wager-agnostic: a $1 player and a $25 player both
 * traverse ~160-200 spins per gauge cycle.
 *
 * RTP-NEUTRAL: gauge introduces no new payout path. This constant controls
 * pacing only. No balance_ledger, no totalWinLamports, no totalPayBps.
 * Domain A discipline: BigInt arithmetic throughout; floor truncation.
 * Rounding direction: floor. Remainder carries forward after reset (unchanged).
 *
 * Post-launch tuning lever: if first-session data shows arc is too long, increase
 * toward 200 (one constant, one commit, all wager tiers adjust simultaneously).
 * If too short, reduce toward 120.
 */
export const SPIRIT_GAUGE_CYCLES_SPINS_TARGET = 160 as const

/**
 * Compute the four named form thresholds from a dynamic gauge cap.
 * Returns [25%, 50%, 75%, 100%] of cap as absolute BigInt lamports.
 * Floor truncation throughout, house-favored.
 * Index 0 = Stirring (25%), 1 = Manifest (50%), 2 = Radiant (75%), 3 = Transcendent (100%).
 *
 * Fail-closed: throws if gaugeCap <= 0 (a zero-wager gauge is an accumulation-
 * poisoning vector — never default it to a safe value).
 *
 * @param gaugeCap — wagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET)
 */
export function computeSpiritFormThresholds(
  gaugeCap: bigint,
): readonly [bigint, bigint, bigint, bigint] {
  if (gaugeCap <= 0n) throw new Error('computeSpiritFormThresholds: gaugeCap <= 0')
  // Floor division, house-favored. Rounding direction: floor.
  return [
    gaugeCap / 4n,           // 25% — Stirring
    gaugeCap / 2n,           // 50% — Manifest
    (gaugeCap * 3n) / 4n,    // 75% — Radiant
    gaugeCap,                // 100% — Transcendent (triggers reset)
  ] as const
}

/** Discrete spirit form index. 0 = Dormant … 4 = Transcendent (reset climax). */
export type SpiritFormIndex = 0 | 1 | 2 | 3 | 4

/**
 * Result of advancing the gauge by one settled spin's ownership points.
 *
 * @property newLamports  — the new cumulative gauge accumulation (0..gaugeCap-1 after a
 *                          reset; 0..rawTotal otherwise). Always >= 0n.
 * @property formReached  — the form index newly crossed this spin, or null if no
 *                          threshold was crossed. 4 means the Transcendent reset
 *                          climax fired.
 * @property didReset      — true iff the gauge hit/exceeded gaugeCap and rolled over.
 */
export interface AdvanceSpiritGaugeResult {
  readonly newLamports: bigint
  readonly formReached: SpiritFormIndex | null
  readonly didReset: boolean
}

/**
 * Advance the spirit gauge by one spin's ownership points.
 * Returns the new cumulative lamports and whether a form change fired.
 *
 * Fail-closed: throws on negative inputs or gaugeCap <= 0 (Domain A — never
 * default a bad input to a "safe" value; a defaulted negative is an
 * accumulation-poisoning vector).
 * Rounding: floor. BigInt subtraction/comparison is exact — house-favored.
 *
 * @param currentLamports  — current gauge accumulation (0..gaugeCap-1)
 * @param ownershipPoints  — points earned this spin (from computeOwnershipPoints)
 * @param gaugeCap         — wagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET)
 */
export function advanceSpiritGauge(
  currentLamports: bigint,
  ownershipPoints: bigint,
  gaugeCap: bigint,
): AdvanceSpiritGaugeResult {
  if (currentLamports < 0n) {
    throw new Error('advanceSpiritGauge: currentLamports < 0')
  }
  if (ownershipPoints < 0n) {
    throw new Error('advanceSpiritGauge: ownershipPoints < 0')
  }
  if (gaugeCap <= 0n) {
    throw new Error('advanceSpiritGauge: gaugeCap <= 0')
  }

  const rawTotal = currentLamports + ownershipPoints

  // Check for reset (Transcendent threshold). At-or-over gaugeCap rolls the cycle.
  if (rawTotal >= gaugeCap) {
    // Carry-forward: the remainder past the cap stays in the next cycle so the
    // accumulation is conserved exactly. Dropping it would be a player-disfavoring
    // rounding error — banned. rawTotal >= gaugeCap, so the subtraction is always
    // >= 0n (no negative, no float).
    // Rounding direction: floor (house-favored — remainder not refunded).
    const remainder = rawTotal - gaugeCap
    return { newLamports: remainder, formReached: 4, didReset: true }
  }

  // Derive thresholds from the dynamic cap. Floor division, house-favored.
  const thresholds = computeSpiritFormThresholds(gaugeCap)

  // Check for intermediate form changes. Scan thresholds from highest to lowest
  // so a single spin that vaults multiple thresholds reports the HIGHEST form
  // reached (the form the gauge now sits in), not an intermediate one.
  for (let i = thresholds.length - 1; i >= 0; i--) {
    const threshold = thresholds[i]
    if (threshold === undefined) continue
    if (rawTotal >= threshold && currentLamports < threshold) {
      return { newLamports: rawTotal, formReached: (i + 1) as SpiritFormIndex, didReset: false }
    }
  }

  return { newLamports: rawTotal, formReached: null, didReset: false }
}

/**
 * Compute the fill ratio for display (0.0 to 1.0 as a display-layer number).
 *
 * DOMAIN C ONLY. This function produces a display float — never feed into
 * financial or accumulation math. Rounding: floor on the bigint division; the
 * Number cast is presentation-only. Negative input clamps to 0 (display-safe,
 * never throws — the gauge UI must always render something).
 *
 * @param currentLamports — current gauge lamports
 * @param gaugeCap        — wagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET)
 */
export function spiritGaugeFillRatio(currentLamports: bigint, gaugeCap: bigint): number {
  if (currentLamports < 0n) return 0
  if (gaugeCap <= 0n) return 0
  if (currentLamports >= gaugeCap) return 1
  // Integer division first (floor, house-favored), then Number cast for display.
  // 10_000n granularity gives 0.01% display resolution — ample for a 16px rail.
  return Number((currentLamports * 10_000n) / gaugeCap) / 10_000
}

/**
 * Derive the current spirit form index from cumulative lamports.
 * Pure function — deterministic. Scans thresholds high→low.
 *
 * Negative input clamps to Form 0 (display-safe). Note this is a derivation
 * helper for display; the canonical form transition signal comes from
 * advanceSpiritGauge.formReached.
 *
 * @param currentLamports — current gauge lamports
 * @param gaugeCap        — wagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET)
 */
export function currentSpiritForm(currentLamports: bigint, gaugeCap: bigint): SpiritFormIndex {
  if (currentLamports < 0n) return 0
  if (gaugeCap <= 0n) return 0
  const thresholds = computeSpiritFormThresholds(gaugeCap)
  if (currentLamports >= thresholds[3]) return 4
  if (currentLamports >= thresholds[2]) return 3
  if (currentLamports >= thresholds[1]) return 2
  if (currentLamports >= thresholds[0]) return 1
  return 0
}

// ─── Spirit Procession — the 10-spirit seal-quest roster (Domain C metadata) ──
//
// SPIRIT_PROCESSION is a readonly, RTP-neutral display array. Each entry carries
// only narrative / display metadata: kanji glyph, English name, domain.
// NO financial value, NO payout, NO RTP path.
//
// Authored spirits 1-5. Spirits 6-10 are hidden placeholders (unlocked in future
// content passes). The index into SPIRIT_PROCESSION is:
//   currentSpiritIndex = sealedSpiritCount % SPIRIT_PROCESSION.length
//
// Domain C: consumed exclusively by display components (OoReiSpiritGauge,
// OoReiSealCollection, OoReiSealReceipt). Zero cross-over with financial paths.

export interface SpiritEntry {
  /** Single-kanji glyph displayed prominently in the gauge quest header. */
  readonly kanji: string
  /** English name displayed in MONO CAPS below the kanji. */
  readonly nameEn: string
  /** Thematic domain: nature category of the spirit's power. */
  readonly domain: string
  /** Whether this spirit has been authored (true) or is a hidden placeholder (false). */
  readonly authored: boolean
}

/**
 * The ordered procession of 10 spirits REI must seal.
 * Cycles: after spirit 10 the sequence restarts at spirit 1.
 * Spirits 1-5 are authored. Spirits 6-10 are '?' placeholders.
 *
 * This array is frozen. Adding a new spirit requires a code commit
 * (ensures authored content, not runtime-generated).
 */
export const SPIRIT_PROCESSION: ReadonlyArray<SpiritEntry> = [
  { kanji: '嵐', nameEn: 'ARASHI', domain: 'Storm',   authored: true  }, // 1
  { kanji: '潮', nameEn: 'SHIO',   domain: 'Tide',    authored: true  }, // 2
  { kanji: '炎', nameEn: 'HOMURA', domain: 'Ember',   authored: true  }, // 3
  { kanji: '霧', nameEn: 'KIRI',   domain: 'Mist',    authored: true  }, // 4
  { kanji: '影', nameEn: 'KAGE',   domain: 'Shadow',  authored: true  }, // 5
  { kanji: '?',  nameEn: '?????',  domain: 'Unknown', authored: false }, // 6
  { kanji: '?',  nameEn: '?????',  domain: 'Unknown', authored: false }, // 7
  { kanji: '?',  nameEn: '?????',  domain: 'Unknown', authored: false }, // 8
  { kanji: '?',  nameEn: '?????',  domain: 'Unknown', authored: false }, // 9
  { kanji: '?',  nameEn: '?????',  domain: 'Unknown', authored: false }, // 10
] as const

// ─── Form vocabulary (presentation labels — Domain C consumes these) ─────────
//
// Spec §5: the four spirit forms. Index 0..4. These are display strings only;
// they carry no financial meaning. The kanji glyph is the color-independent
// label so the gauge is never encoded by color alone (WCAG 1.4.1).

/** Single-kanji glyph per form. 眠 蠢 顕 光 封 — index 0..4. */
export const SPIRIT_FORM_KANJI: readonly [string, string, string, string, string] = [
  '眠', // Form 0 — Dormant (Nemuri)
  '蠢', // Form 1 — Stirring (Ugomeku)
  '顕', // Form 2 — Manifest (Arawareru)
  '光', // Form 3 — Radiant (Hikari)
  '封', // Form 4 — Sealing (Fuuin)
] as const

/** Romanised / English form name per index 0..4. */
export const SPIRIT_FORM_NAME: readonly [string, string, string, string, string] = [
  'DORMANT',
  'STIRRING',
  'MANIFEST',
  'RADIANT',
  'SEALING',
] as const

/**
 * Spirit-figure opacity per form (spec §5 table).
 * The looming spirit behind the grid grows more present as the gauge climbs.
 * Form 0 0.12 → Form 1 0.28 → Form 2 0.50 → Form 3 0.70 → Form 4 full (1.0).
 *
 * Module-level `as const`: these are presentation constants, not runtime-scaled.
 */
export const SPIRIT_FORM_OPACITY: readonly [number, number, number, number, number] = [
  // 2026-06-02 (Tim "make the spirit more present"): Form 0 raised 0.32 → 0.60.
  // This gauge ramp now feeds TWO consumers (RG-C5: form-driven, never wager/
  // streak/session):
  //   • the IN-BOARD canvas dragon presence (base-game board phases) — see
  //     OoReiSlotCanvas SLOT_DRAGON_FLOOR_ALPHA + RAMP_ALPHA × this value, so the
  //     in-board dragon GROWS with the gauge while staying bold at the Form 0 floor.
  //   • the DOM z-1 spirit during the Spirit Bonus (the canvas band collapses
  //     there, so the DOM spirit carries the bonus presence).
  // The lobby uses its OWN fixed presence (OO_REI_LOBBY_SPIRIT_OPACITY) and does
  // NOT read this ramp — the lobby is intentionally isolated from the in-game
  // treatment. The escalation ramp to 1.0 is preserved (monotonic).
  0.6,  // Form 0 — Dormant (a present looming presence — not a faint wash)
  0.72, // Form 1 — Stirring
  0.82, // Form 2 — Manifest
  0.92, // Form 3 — Radiant
  1.0,  // Form 4 — Transcendent (full, brief cinematic before reset)
] as const

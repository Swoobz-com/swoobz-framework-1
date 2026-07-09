'use client'

/**
 * OO-REI provider — state machine for the OO-REI slot game.
 *
 * Domain B (controller) consuming Domain A (ooReiMath).
 * All financial math lives in ooReiMath.ts.
 *
 * Phase machine:
 *   lobby → bet-entry → spinning → settling → win-reveal →
 *   spirit-check → [spirit-bonus | settled]
 *
 * During Spirit Bonus:
 *   spirit-bonus-entry → free-spinning → free-settling → (loop or spirit-bonus-end)
 *   → settled
 *
 * RG-C5 STRUCTURAL: the provider never passes streak/session/wager into
 * audio functions. All play* functions take zero state-dependent parameters.
 *
 * RG-C8 STRUCTURAL: cash-out is available in lobby, bet-entry, and settled.
 * During Spirit Bonus, endBonus() is always available (cashes out the bonus).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ensureAudio,
  playReelStop,
  playSettlement,
  playSpiritBonus,
  playSpinLaunch,
  playWinSettle,
  preloadOoReiAudio,
  REEL_STOP_INTERVAL_MS,
  SPIN_DURATION_MS,
} from './ooReiAudio'
import {
  type BonusPresentationOrder,
  bonusPresentationOrder,
  bpsToLamports,
  computeOwnershipPoints,
  DEFAULT_WAGER_LAMPORTS,
  evaluateSpin,
  freeSpinskFromScatterCount,
  mulberry32,
  partitionBonusTotal,
  type PaylineWin,
  type ReelGrid,
  randomStops,
  WAGER_INCREMENTS_LAMPORTS,
} from './ooReiMath'
import {
  deriveRegionState,
  type MythRegionDerivation,
} from './ooReiMythRegions'
import {
  type BackdropState,
  type CharacterPose,
  OFUDA_AUTO_SEAL_MS,
  SEALING_COMPLETE_DELAY_MS,
  SEALING_ENTRY_FADE_MS,
  REEL_SETTLE_TO_REVEAL_MS,
  SEALING_RESULT_HOLD_MS,
  SPIRIT_BONUS_ENTRY_MS,
  SPIN_DURATION_MS as SIG_SPIN_MS,
  WIN_REVEAL_MS as SIG_WIN_REVEAL_MS,
} from './ooReiSignatures'
import {
  advanceSpiritGauge,
  currentSpiritForm,
  SPIRIT_GAUGE_CYCLES_SPINS_TARGET,
  SPIRIT_PROCESSION,
  type SpiritFormIndex,
} from './ooReiSpiritEvolution'
import {
  applyArchetypeGaugeFill,
  applyArchetypePoints,
  ARCHETYPE_CONFIGS,
  getArchetypeConfig,
  type RegionArchetype,
} from './ooReiRegionArchetypes'
import {
  computeWardenRank,
  computeWardenSealAccrual,
  detectRankUp,
  type WardenRankState,
  type WardenRankTier,
} from './ooReiWardenRank'

// ─── Phase definitions ────────────────────────────────────────────────────────

export type OoReiPhase =
  | { kind: 'lobby' }
  | { kind: 'bet-entry' }
  | { kind: 'spinning' }
  | { kind: 'settling' }
  | {
      kind: 'win-reveal'
      paylineWins: ReadonlyArray<PaylineWin>
      totalWinLamports: bigint
      scatterCount: number
    }
  | { kind: 'spirit-bonus-entry'; freeSpinsAwarded: number }
  | {
      kind: 'free-spinning'
      spinsRemaining: number
      spinsTotal: number
      bonusTotalWinLamports: bigint
      stickyWildCells: Set<string>
    }
  | {
      kind: 'free-settling'
      paylineWins: ReadonlyArray<PaylineWin>
      spinsRemaining: number
      spinWinLamports: bigint
      bonusTotalWinLamports: bigint
      stickyWildCells: Set<string>
    }
  | {
      kind: 'spirit-bonus-end'
      bonusTotalWinLamports: bigint
    }
  // ─── Spirit Sealing mini-game (OoReiSpiritSealing) — replaces the passive
  //     free-spin reveal with an interactive sealing ritual. The total is
  //     pre-rolled (computed headlessly, identical RNG draws → identical RTP);
  //     the player taps three ofuda to REVEAL it. EV-invariant (RG-C3).
  | { kind: 'spirit-sealing-entry'; bonusTotalWinLamports: bigint }
  | {
      kind: 'spirit-sealing-active'
      bonusTotalWinLamports: bigint
      fragments: readonly [bigint, bigint, bigint]
      presentationOrder: BonusPresentationOrder
      sealedScrolls: ReadonlyArray<0 | 1 | 2>
      finalGrid: ReelGrid
      seedHex: string
    }
  | { kind: 'spirit-sealing-end'; bonusTotalWinLamports: bigint; finalGrid: ReelGrid; seedHex: string }
  | {
      kind: 'settled'
      totalWinLamports: bigint
      paylineWins: ReadonlyArray<PaylineWin>
      ownershipPoints: bigint
      grid: ReelGrid
      /**
       * Session seed hex — a stable per-session hex derived from the RNG seed.
       * v1 (demo): generated from Date.now() + random and prefixed `sim-` to mark
       * it as a simulation seed, NOT a commit-reveal VRF attestation. v2 will be
       * the VRF server seed. Used by the Glass Box ledger seal to display
       * provenance. Format: `sim-XXXXXXXX` (8 lowercase hex chars after the prefix).
       */
      sessionSeedHex: string
    }

// ─── Seal receipt data (Glass Box provability — Domain C display) ────────────

/**
 * Data bundle captured at each Transcendent gauge reset (one seal sealed).
 * Displayed once in OoReiSealReceipt. RG-C1: factual, not celebratory.
 * No financial fields — ownership points are accrual-tracking only.
 */
export interface SealReceiptData {
  /** Which spirit was just sealed (index into SPIRIT_PROCESSION). */
  readonly spiritIndex: number
  /** How many spins made up this cycle. */
  readonly cycleSpins: number
  /** Total ownership-lamports accumulated in this cycle. */
  readonly cycleOwnershipPoints: bigint
  /** Wager lamports that was active (for the recap line). */
  readonly wagerLamports: bigint
  /** Session seed hex for provability line. */
  readonly sessionSeedHex: string
  /** Win-count in this cycle (factual — "N wins 1.0x"). */
  readonly cycleWinCount: number
  /** Loss-count in this cycle (factual — "M losses 1.5x"). */
  readonly cycleLossCount: number
  /** Cumulative sealed count after this seal (1-based display). */
  readonly totalSealedCount: number
}

// ─── Chapter-close event (Myth layer — no financial state) ───────────────────

/**
 * Fired AFTER settle (RG-C1) when sealedSpiritCount crosses a region boundary.
 * Carries only narrative data — ZERO USDC, ZERO economic framing.
 * The Experience shows the "封印 · REGION SEALED" beat and the next region
 * name, then auto-dismisses via CHAPTER_CLOSE_DISMISS_MS.
 *
 * RG boundaries hard-enforced by shape:
 *   - No financial fields (no lamports, no multiplier, no "win" vocabulary).
 *   - Fires AFTER settle — never before or during a spin (RG-C1).
 *   - Non-escalating: shape is identical for every region (RG-C5).
 */
export interface ChapterCloseEvent {
  /** Region that was just sealed (slug id). */
  readonly sealedRegionId: string
  /** Display name JP of the sealed region, e.g. '嵐岸'. */
  readonly sealedRegionNameJP: string
  /** Display name EN of the sealed region, e.g. 'STORM COAST'. */
  readonly sealedRegionNameEN: string
  /** Display name JP of the newly revealed region (next active), or null
   *  if all 10 regions are now cleared (myth cycle complete). */
  readonly nextRegionNameJP: string | null
  /** Display name EN of the newly revealed region, or null when cycle complete. */
  readonly nextRegionNameEN: string | null
  /**
   * Always true for v1 authored regions.
   * A false value would suppress the tap-ritual and fall back to auto-dismiss.
   * Reserved for future use; always set to true in the current provider logic.
   * RG-safe: the gesture is purely ceremonial — outcome is pre-determined before
   * the gesture fires (Transcendent reset already committed).
   */
  readonly requiresPlayerSeal: boolean
}

// ─── Controller interface ─────────────────────────────────────────────────────

export interface OoReiController {
  // Current state
  readonly phase: OoReiPhase
  readonly wagerLamports: bigint
  readonly grid: ReelGrid | null
  /**
   * The EXACT integer stop indices passed to evaluateSpin() for the last spin.
   * `grid[col][r] === REEL_STRIPS[col][(lastSpinStops[col] + r) % len]` by
   * resolveGrid's definition.
   *
   * Wire-up note: pass this as the `settledStops` prop on OoReiSlotCanvas to
   * enable the authoritative decel-target path (display == settlement BY
   * CONSTRUCTION, no reverse-search). Without this prop, OoReiSlotCanvas falls
   * back to a reverse-search that is empirically correct but structurally weaker.
   *
   * Populated on spin() and _executeFreeSpinIfActive(). Null on initial mount
   * and after cashOut().
   */
  readonly lastSpinStops: ReadonlyArray<number> | null
  readonly talismanAwakenActive: boolean
  readonly backdropState: BackdropState
  readonly characterPose: CharacterPose

  // Spirit Evolution gauge (session-scoped; resets on cashOut).
  // RTP-neutral: consumes ownershipPoints already computed by the math layer.
  /** Cumulative ownership-lamports in the current gauge cycle (0..gaugeCap-1). */
  readonly spiritGaugeLamports: bigint
  /**
   * Dynamic gauge cap for the current wager.
   * = wagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET).
   * Exposed so Domain C display components call spiritGaugeFillRatio(spiritGaugeLamports, gaugeCap)
   * correctly without re-deriving the cap themselves.
   * Recomputed whenever wagerLamports changes.
   */
  readonly gaugeCap: bigint
  /** Current spirit form index (0 Dormant .. 4 Transcendent). */
  readonly spiritFormIndex: SpiritFormIndex
  /** Form index newly reached this spin (signals the Experience to fire the
   *  form-change cinematic), or null when no transition is pending. */
  readonly pendingSpiritFormEvent: SpiritFormIndex | null

  // ── Seal-quest counters (RTP-neutral, engagement-only) ──────────────────
  // These are pure quest counters — no financial write, no balance_ledger.
  // sealedSpiritCount persists in-memory for the session (v1).
  // On each Transcendent gauge reset (didReset), sealedSpiritCount increments
  // and per-cycle counters reset. Domain C display components consume these.

  /** How many spirits REI has sealed this session (increments on each
   *  Transcendent gauge reset). Session-scoped in-memory only (v1). */
  readonly sealedSpiritCount: number
  /** Index of the current spirit in SPIRIT_PROCESSION (= sealedSpiritCount % 10). */
  readonly currentSpiritIndex: number
  /** Spin count accumulated in the current gauge cycle (resets on Transcendent). */
  readonly spinCountThisCycle: number
  /** Total ownership-lamports accumulated in the current gauge cycle.
   *  Resets on Transcendent. Used by the Glass Box seal receipt. */
  readonly cycleOwnershipPointsTotal: bigint

  /**
   * Pending seal event: set when a Transcendent reset fires, cleared after
   * the receipt is dismissed. The UI shows the OoReiSealReceipt once per seal.
   * Contains the cycle receipt data for the Glass Box display.
   * null when no seal event is pending.
   *
   * RG-C1: the receipt is FACTUAL (spins, ownership points, provability line).
   * The vocabulary is NARRATIVE ("封印 / SEAL COMPLETE"), not "BIG WIN".
   */
  readonly pendingSealEvent: SealReceiptData | null

  // ── Myth-of-REI map layer (Domain B/C — ZERO financial state) ────────────

  /** Derived full region state for the current sealedSpiritCount. Pure derivation. */
  readonly regionState: MythRegionDerivation
  /** Whether the full-canvas Myth map overlay is open. */
  readonly mapOpen: boolean
  /** Open the Myth map screen. */
  readonly openMap: () => void
  /** Close the Myth map screen. */
  readonly closeMap: () => void
  /**
   * Pending chapter-close event: set when sealedSpiritCount crosses a region
   * boundary (one region just cleared → next revealed). Consumed by Experience
   * to show the "封印 · REGION SEALED" narrative beat AFTER settle (RG-C1).
   * Cleared by dismissChapterClose(). null when no event is pending.
   *
   * RG boundaries: no USDC, no economic framing, fires post-settle, identical
   * shape for every region, auto-dismissed on a module-const timer.
   */
  readonly pendingChapterClose: ChapterCloseEvent | null
  /** Dismiss the pending chapter-close event (called after auto-dismiss timer). */
  readonly dismissChapterClose: () => void
  /**
   * Call when the player taps the seal-ritual stamp, or when auto-dismiss fires.
   * Clears pendingChapterClose. The Experience uses this to advance the
   * chapter-close sequence to the next beat.
   * If pendingChapterClose is null, this is a no-op.
   */
  readonly confirmSeal: () => void

  // ── Spirit Ally (perked companion — Domain B, EV-NEUTRAL) ───────────────────
  /**
   * Session-scoped active ally kanji (the chosen archetype's bonus spirit).
   * Null before first region-clear or after cashOut(). Display-only — shown as
   * an 8%-opacity watermark on the game backdrop.
   */
  readonly activeAllyKanji: string | null
  /**
   * The player's chosen ally archetype (SURGE / FORGE / DRIFT) for the current
   * region, or null before the first choice / after cashOut(). Drives the
   * EV-NEUTRAL perk applied in applyOwnershipToGauge (seal yield + gauge fill).
   * Cash RTP is unaffected — see ooReiRegionArchetypes invariant.
   */
  readonly activeAllyArchetype: RegionArchetype | null
  /**
   * Call when the player selects a spirit ally from the chapter-close choice
   * cards. Sets the active archetype perk + backdrop-watermark kanji.
   * FAIL-CLOSED: throws on an unknown archetype key (no silent default perk).
   * EV-neutral: scales only the seal-ledger + spirit-gauge layers, never cash.
   */
  readonly chooseAlly: (archetype: RegionArchetype) => void

  /**
   * Warden Rank (D.1): the player's progression rank, derived from LIFETIME
   * ownership points (the seals accrued every spin). Display-only, EV-neutral —
   * a rank never changes payout/odds. Climbs on wins AND losses.
   */
  readonly wardenRank: WardenRankState
  /** Lifetime ownership points (raw units) feeding the Warden Rank. Display-only. */
  readonly lifetimeSealPoints: bigint
  /** Newly-reached rank when a spin crossed a threshold, else null. */
  readonly rankUpTier: WardenRankTier | null
  /** Clears rankUpTier after the rank-up celebration has played. */
  readonly clearRankUp: () => void

  // Actions
  readonly goToBetEntry: () => void
  readonly setWager: (lamports: bigint) => void
  readonly activateTalismanAwaken: () => void
  readonly spin: () => void
  /** Spirit Sealing mini-game: seal scroll position 0/1/2 (display-only, EV-invariant). */
  readonly sealScroll: (index: 0 | 1 | 2) => void
  readonly endBonus: () => void  // RG-C8: always available during bonus
  readonly cashOut: () => void   // RG-C8: navigate away / end session
  readonly dismissReceipt: () => void
  /** Clear the pending form event after the Experience has fired its cinematic. */
  readonly clearSpiritFormEvent: () => void
  /** Dismiss the pending seal receipt (called by OoReiSealReceipt on dismiss). */
  readonly dismissSealReceipt: () => void
}

// ─── RNG state (deterministic, seeded per session) ────────────────────────────

function createSessionRng(): { rng: () => number; seedHex: string } {
  // FAIL-CLOSED (Domain A): this client-side, Date.now()-derived PRNG is a
  // demo-only seed source. It is NOT a VRF and MUST NEVER drive a real-money
  // wager. A production build that reaches this path is a structural fairness
  // defect — surface it loudly rather than silently shipping spoofable outcomes.
  // A production version wires the Solana commit-reveal VRF server seed instead.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'OO-REI createSessionRng: client-side Date.now() seeding is demo-only and ' +
        'must not run in production. Wire the VRF commit-reveal server seed before ' +
        'enabling any real-money wager path.',
    )
  }
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0
  // `sim-` prefix marks the provenance honestly wherever the Glass Box renders
  // this value: it is a simulation client seed, not a commit-reveal VRF
  // attestation. Never present it as equivalent to provably-fair proof (H-5).
  const seedHex = `sim-${seed.toString(16).padStart(8, '0')}`
  return { rng: mulberry32(seed), seedHex }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useOoRei(): OoReiController {
  // DIRECT PLAY (Tim 2026-06-03 "i dont even think we need a lobby, it breaks the
  // flow of direct play"): the game opens DIRECTLY on the playable board (bet-entry)
  // — no lobby gate, no floating lobby characters. The board's CAST A SEAL CTA is
  // the spin trigger and unlocks audio on first press (browser autoplay gesture),
  // so nothing is lost vs the old lobby CTA. goToBetEntry only setPhase'd bet-entry,
  // so starting here is equivalent + skips the intermediary screen.
  const [phase, setPhase] = useState<OoReiPhase>({ kind: 'bet-entry' })
  const [wagerLamports, setWagerLamports] = useState<bigint>(DEFAULT_WAGER_LAMPORTS)
  const [grid, setGrid] = useState<ReelGrid | null>(null)
  const [lastSpinStops, setLastSpinStops] = useState<ReadonlyArray<number> | null>(null)
  const [talismanAwakenActive, setTalismanAwakenActive] = useState(false)
  // 'lobby' is the default idle storm-vista backdrop (also used in-game on resets,
  // not a lobby-only state) — correct opening backdrop for direct play.
  const [backdropState, setBackdropState] = useState<BackdropState>('lobby')
  const [characterPose, setCharacterPose] = useState<CharacterPose>('profile')

  // ── Spirit Evolution gauge state (Domain B controller) ─────────────────────
  // RTP-NEUTRAL: this consumes ownershipPoints already computed by the math
  // layer; it does not create or pay out any new value (spec §12).
  // The gauge accumulation lives in a ref (gaugeRef) because it is mutated from
  // inside setTimeout closures that would otherwise capture a stale React state
  // value across rapid CAST AGAIN spins. The React state mirrors the ref for
  // render; the ref is the canonical accumulator.
  const [spiritGaugeLamports, setSpiritGaugeLamports] = useState<bigint>(0n)
  const [spiritFormIndex, setSpiritFormIndex] = useState<SpiritFormIndex>(0)
  const [pendingSpiritFormEvent, setPendingSpiritFormEvent] =
    useState<SpiritFormIndex | null>(null)
  const gaugeRef = useRef<bigint>(0n)

  // ── Seal-quest counters (RTP-neutral, engagement-only) ──────────────────────
  // All refs (not React state) so mutations inside setTimeout don't capture
  // stale values across rapid CAST AGAIN spins. React state mirrors refs for
  // render. Zero financial writes — pure quest counters.
  const [sealedSpiritCount, setSealedSpiritCount] = useState<number>(0)
  const [currentSpiritIndex, setCurrentSpiritIndex] = useState<number>(0)
  const [spinCountThisCycle, setSpinCountThisCycle] = useState<number>(0)
  const [cycleOwnershipPointsTotal, setCycleOwnershipPointsTotal] = useState<bigint>(0n)
  const [pendingSealEvent, setPendingSealEvent] = useState<SealReceiptData | null>(null)

  // ── Myth-of-REI map layer (Domain B/C — ZERO financial state) ────────────
  // mapOpen drives the full-canvas OoReiMapScreen overlay.
  // regionState is a pure derivation — no new state, just a useMemo over sealedSpiritCount.
  // pendingChapterClose fires once per region-clear event (post-settle, RG-C1).
  const [mapOpen, setMapOpen] = useState<boolean>(false)
  const [pendingChapterClose, setPendingChapterClose] = useState<ChapterCloseEvent | null>(null)

  // ── Spirit Ally (perked companion — Domain B, EV-NEUTRAL) ──────────────────
  // The player picks one of three archetype allies (SURGE / FORGE / DRIFT) on
  // each chapter-close. The chosen archetype scales ONLY the EV-neutral layers:
  //   seal-ledger yield (applyArchetypePoints) and spirit-gauge fill
  //   (applyArchetypeGaugeFill). It NEVER touches the cash path — cash RTP is
  //   96% in every region, structurally (see ooReiRegionArchetypes header).
  // activeAllyArchetype: the chosen archetype key (drives the perk + watermark).
  // activeAllyKanji: the bonusSpirit kanji for the chosen archetype (8% backdrop
  //   watermark — display-only). Both session-scoped; reset on cashOut().
  const [activeAllyKanji, setActiveAllyKanji] = useState<string | null>(null)
  const [activeAllyArchetype, setActiveAllyArchetype] = useState<RegionArchetype | null>(null)
  // Ref mirror so applyOwnershipToGauge (a []-deps callback fired inside settle
  // closures) reads the LATEST chosen archetype without a stale closure.
  const chosenArchetypeRef = useRef<RegionArchetype | null>(null)

  // Per-cycle win/loss tracking (refs: safe inside setTimeout closures)
  const sealedCountRef = useRef<number>(0)
  const spinCountRef = useRef<number>(0)
  const cyclePointsRef = useRef<bigint>(0n)
  const cycleWinCountRef = useRef<number>(0)
  const cycleLossCountRef = useRef<number>(0)

  // ── Warden Rank (D.1): LIFETIME seal-points accumulator ──────────────────────
  // Unlike cyclePointsRef (which resets on each Transcendent reset), this NEVER
  // resets — the Warden Rank only ever climbs. It accumulates the SAME sealPoints
  // the cycle ledger does. Display-only progression currency, EV-neutral.
  const lifetimeSealPointsRef = useRef<bigint>(0n)
  const [lifetimeSealPoints, setLifetimeSealPoints] = useState<bigint>(0n)
  // Newly-reached rank when a spin crosses a threshold (drives the rank-up
  // celebration); null when no rank-up this spin. Cleared by the consumer.
  const [rankUpTier, setRankUpTier] = useState<WardenRankTier | null>(null)

  // Apply one settled spin's ownership points to the gauge.
  // Called from EVERY path that computes ownershipPoints + sets a settled phase.
  // Domain A advanceSpiritGauge does the BigInt floor-truncation + carry-forward.
  // Also advances per-cycle counters (spinCount, ownershipPointsTotal, win/loss).
  const applyOwnershipToGauge = useCallback((
    ownershipPoints: bigint,
    isWin: boolean,
    currentWagerLamports: bigint,
    currentSeedHex: string,
  ) => {
    // ── Apply the chosen ally archetype's EV-NEUTRAL perk ──────────────────
    // The two channels are scaled INDEPENDENTLY from the SAME base points, so
    // each archetype's single non-1.0 multiplier cannot cross-contaminate:
    //   sealPoints  — seal/ownership ledger (SURGE +75% on loss, DRIFT +25% on win)
    //   gaugePoints — spirit-Evolution meter (FORGE +25% fill)
    // Both are floor-truncated BigInt (house-favored) and reach NO cash path,
    // so cash RTP stays 96% by construction (ooReiRegionArchetypes invariant).
    const archetype = chosenArchetypeRef.current === null
      ? null
      : ARCHETYPE_CONFIGS[chosenArchetypeRef.current]
    const sealPoints = applyArchetypePoints(ownershipPoints, archetype, isWin)
    const gaugePoints = applyArchetypeGaugeFill(ownershipPoints, archetype)
    // RANK / LEVEL channel — PARTICIPATION-based, wager-INVARIANT (Tim 2026-06-04:
    // "wagering more must never climb the ladder faster"). A spin advances the
    // Warden ladder by a FLAT per-round amount (1.0 seal win / 1.5 seal loss),
    // independent of wager size. computeWardenSealAccrual takes NO wager param by
    // design. The ally archetype perk still applies (EV-neutral choice) on the
    // FLAT base. The wager-scaled `sealPoints` above remains the SEPARATE
    // ownership economic display (cyclePointsRef) and never feeds rank.
    const rankSealAccrual = applyArchetypePoints(
      computeWardenSealAccrual(isWin),
      archetype,
      isWin,
    )

    // Advance per-cycle counters (refs — safe across setTimeout closures).
    spinCountRef.current += 1
    cyclePointsRef.current += sealPoints
    if (isWin) {
      cycleWinCountRef.current += 1
    } else {
      cycleLossCountRef.current += 1
    }
    setSpinCountThisCycle(spinCountRef.current)
    setCycleOwnershipPointsTotal(cyclePointsRef.current)

    // Warden Rank (D.1): accumulate LIFETIME seals (never resets) + detect a
    // rank-up across the threshold this spin crossed. EV-neutral progression.
    const prevLifetime = lifetimeSealPointsRef.current
    lifetimeSealPointsRef.current = prevLifetime + rankSealAccrual
    setLifetimeSealPoints(lifetimeSealPointsRef.current)
    const rankedUp = detectRankUp(prevLifetime, lifetimeSealPointsRef.current)
    if (rankedUp !== null) setRankUpTier(rankedUp)

    // Derive the dynamic gauge cap from the current wager.
    // Floor division is house-favored throughout (BigInt arithmetic — no IEEE-754).
    // Rounding direction: floor. gaugeCap is wager-relative so a $25 player
    // experiences the same ~160-200 spin cycle as a $1 player (spec §Part 1).
    const gaugeCap = currentWagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET)
    const { newLamports, formReached, didReset } = advanceSpiritGauge(
      gaugeRef.current,
      gaugePoints,
      gaugeCap,
    )
    gaugeRef.current = newLamports
    setSpiritGaugeLamports(newLamports)
    if (formReached !== null) {
      // didReset → Transcendent climax → form resets to Dormant (0).
      // Otherwise the gauge now sits in the form just reached.
      setSpiritFormIndex(didReset ? 0 : formReached)
      setPendingSpiritFormEvent(formReached)

      if (didReset) {
        // A spirit has been sealed. Capture the cycle receipt.
        const prevSealedCount = sealedCountRef.current
        const newSealedCount = prevSealedCount + 1
        const newSpiritIndex = newSealedCount % SPIRIT_PROCESSION.length
        sealedCountRef.current = newSealedCount
        setSealedSpiritCount(newSealedCount)
        setCurrentSpiritIndex(newSpiritIndex)

        // Build the Glass Box receipt for this cycle (factual, RG-C1 safe).
        const receiptData: SealReceiptData = {
          spiritIndex: newSpiritIndex === 0 ? SPIRIT_PROCESSION.length - 1 : newSpiritIndex - 1,
          cycleSpins: spinCountRef.current,
          cycleOwnershipPoints: cyclePointsRef.current,
          wagerLamports: currentWagerLamports,
          sessionSeedHex: currentSeedHex,
          cycleWinCount: cycleWinCountRef.current,
          cycleLossCount: cycleLossCountRef.current,
          totalSealedCount: newSealedCount,
        }
        setPendingSealEvent(receiptData)

        // ── Chapter-close detection (Myth layer — ZERO financial state) ────
        // A region clears when sealedSpiritCount increments across a region
        // boundary: traversalOrder <= newSealedCount && traversalOrder > prevSealedCount.
        // deriveRegionState is pure + deterministic — safe to call from a callback.
        // RG-C1: fires here (after settle), never before/during spin.
        // RG-C5: identical ChapterCloseEvent shape for every region.
        const prevDerivation = deriveRegionState(prevSealedCount)
        const nextDerivation = deriveRegionState(newSealedCount)
        // Find the region that just transitioned from non-cleared to cleared.
        const justCleared = prevDerivation.regions.find(
          (dr) =>
            dr.region.traversalOrder <= newSealedCount &&
            dr.region.traversalOrder > prevSealedCount,
        )
        if (justCleared) {
          // Find the next active region (if any) from the post-seal derivation.
          const nextActive = nextDerivation.regions.find((dr) => dr.state === 'active') ?? null
          const event: ChapterCloseEvent = {
            sealedRegionId: justCleared.region.id,
            sealedRegionNameJP: justCleared.region.nameJP,
            sealedRegionNameEN: justCleared.region.nameEN,
            nextRegionNameJP: nextActive?.region.nameJP ?? null,
            nextRegionNameEN: nextActive?.region.nameEN ?? null,
            // Always true for v1 authored regions. The tap-ritual fires for every seal.
            // Auto-dismiss fires at CHAPTER_CLOSE_DISMISS_MS if player does not tap.
            requiresPlayerSeal: true,
          }
          setPendingChapterClose(event)
        }

        // Reset per-cycle counters for the next cycle.
        spinCountRef.current = 0
        cyclePointsRef.current = 0n
        cycleWinCountRef.current = 0
        cycleLossCountRef.current = 0
        setSpinCountThisCycle(0)
        setCycleOwnershipPointsTotal(0n)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sessionRef = useRef(createSessionRng())
  // Convenience alias — only the rng is called during spin logic
  const rngRef = useRef(sessionRef.current.rng)

  // Pre-load audio on mount
  useEffect(() => {
    preloadOoReiAudio()
  }, [])

  // Dev-only Spirit-gauge injection hook. Lets Playwright drive the gauge to
  // empty / mid / a form-change directly, without 160+ real spins. This sets
  // ONLY the display state (gauge lamports + derived form + optional pending
  // form event). The gaugeCap is derived from the current wagerLamports state.
  // process.env.NODE_ENV is replaced at build time, so this body tree-shakes
  // away in production. Mirrors __ooReiSetCinematicTier.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return undefined
    const w = window as unknown as Record<string, unknown>
    w['__ooReiSetSpiritGauge'] = (lamports: number | bigint, formEvent?: number) => {
      const big = typeof lamports === 'bigint' ? lamports : BigInt(Math.max(0, Math.floor(lamports)))
      const devCap = wagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET)
      gaugeRef.current = big
      setSpiritGaugeLamports(big)
      setSpiritFormIndex(currentSpiritForm(big, devCap))
      if (typeof formEvent === 'number') {
        setPendingSpiritFormEvent(formEvent as SpiritFormIndex)
      }
    }
    // Warden Rank QA: set lifetime seals (display units) to exercise any rank
    // without grinding hundreds of spins. Display-only — never touches money.
    w['__ooReiSetLifetimeSeals'] = (seals: number) => {
      const units = BigInt(Math.max(0, Math.floor(seals))) * 1_000_000n
      const prev = lifetimeSealPointsRef.current
      lifetimeSealPointsRef.current = units
      setLifetimeSealPoints(units)
      const up = detectRankUp(prev, units)
      if (up !== null) setRankUpTier(up)
    }
    return () => {
      delete w['__ooReiSetSpiritGauge']
      delete w['__ooReiSetLifetimeSeals']
    }
  }, [])

  // ─── DEV-ONLY: window.__ooReiGetSettledGrid + window.__ooReiGetPhase ─────────
  // __ooReiGetSettledGrid: returns the ReelGrid the provider settled (5×3 number[][]),
  //   i.e. the grid that was used for settlement/win evaluation.
  //   Null when no spin has settled yet (lobby/spinning/etc).
  //
  // __ooReiGetPhase: returns the current phase kind string so the Playwright
  //   script can gate reads to the 'settling'/'settled' moment.
  //
  // Both hooks reference the React state via a ref to avoid stale closure.
  // Guarded by NODE_ENV !== 'production'; tree-shaken by Next.js in prod builds.
  const gridRef = useRef<typeof grid>(grid)
  gridRef.current = grid
  const phaseRef = useRef<typeof phase>(phase)
  phaseRef.current = phase
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return undefined
    const w = window as unknown as Record<string, unknown>
    w['__ooReiGetSettledGrid'] = (): Array<Array<number>> | null => {
      const g = gridRef.current
      if (!g) return null
      // ReelGrid is a 5-element tuple of [row0, row1, row2] tuples.
      // Convert to plain number[][] for JSON serialisation in Playwright.
      return Array.from({ length: 5 }, (_, col) => {
        const colData = g[col as 0 | 1 | 2 | 3 | 4]
        return colData ? [colData[0], colData[1], colData[2]] : [-1, -1, -1]
      })
    }
    w['__ooReiGetPhase'] = (): string => {
      return phaseRef.current.kind
    }
    // DEV: drive the Spirit Sealing mini-game directly with a chosen total, bypassing
    // the scatter-trigger path. Display-injection only — sets the visual phase with a
    // partitioned pre-rolled total; it NEVER writes a balance or mutates RTP consts.
    w['__ooReiTriggerSpiritSealing'] = (totalWinLamports: number): void => {
      const total = BigInt(Math.max(0, Math.floor(totalWinLamports)))
      setBackdropState('spirit-bonus')
      setCharacterPose('channeling')
      setPhase({
        kind: 'spirit-sealing-active',
        bonusTotalWinLamports: total,
        fragments: partitionBonusTotal(total),
        presentationOrder: bonusPresentationOrder(Number(total % 6n)),
        sealedScrolls: [],
        finalGrid: gridRef.current ?? resolveEmptyGrid(),
        seedHex: sessionRef.current.seedHex,
      })
    }
    return () => {
      delete w['__ooReiGetSettledGrid']
      delete w['__ooReiGetPhase']
      delete w['__ooReiTriggerSpiritSealing']
    }
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────

  const goToBetEntry = useCallback(() => {
    if (phase.kind !== 'lobby') return
    setPhase({ kind: 'bet-entry' })
  }, [phase.kind])

  const setWager = useCallback((lamports: bigint) => {
    // Phase guard: the wager may only change while a spin is NOT in flight.
    // spin() captures wagerLamports in setTimeout closures that resolve
    // 1000-1500ms later; allowing a mid-flight change would let an in-flight
    // settlement use a different wager than was committed, mis-pricing the
    // payout and the ownership-point accrual. Restricting changes to lobby /
    // bet-entry / settled closes that race structurally (Domain A discipline).
    if (
      phase.kind !== 'lobby' &&
      phase.kind !== 'bet-entry' &&
      phase.kind !== 'settled'
    ) return
    if (!WAGER_INCREMENTS_LAMPORTS.includes(lamports)) return

    // No-op guard: only rescale when the wager actually differs. Re-selecting
    // the current chip must not perturb the gauge (idempotent — Domain B).
    const oldWager = wagerLamports
    if (lamports === oldWager) return

    // ── Spirit-gauge fraction preservation (the reset-bug fix) ───────────────
    // The gauge stores an ABSOLUTE accumulation (gaugeRef.current) and the cap
    // is wager-relative (cap = wager * SPIRIT_GAUGE_CYCLES_SPINS_TARGET). When
    // the wager changes, the cap rescales but the stored value does not, so the
    // displayed fill FRACTION (value / cap) jumps — the "progress bar to the
    // next area is gone" bug Tim reported. Rescale the accumulation so the fill
    // fraction is INVARIANT across the wager change:
    //     newGauge / newCap == oldGauge / oldCap
    //   ⇒ newGauge = oldGauge * newWager / oldWager   (the SPINS_TARGET factor
    //     in the cap cancels, so we scale by the wager ratio directly).
    //
    // This touches NO cash path and NO RTP — the gauge is the EV-NEUTRAL
    // progression meter (spec §12). It conserves visible progress, it does not
    // create or pay out value. Rounding direction: floor (BigInt division
    // truncates toward zero), house-favored — a remainder is dropped, never
    // rounded up into the player's favor.
    //
    // Fail-safe: oldWager is always one of WAGER_INCREMENTS_LAMPORTS (all > 0n)
    // and DEFAULT_WAGER_LAMPORTS (> 0n), so the divisor is never 0. The guard
    // is belt-and-braces against a future zero-wager increment.
    if (oldWager > 0n) {
      // Floor division (house-favored): truncate toward zero on the rescale.
      const newGauge = (gaugeRef.current * lamports) / oldWager
      gaugeRef.current = newGauge
      setSpiritGaugeLamports(newGauge)
      // Recompute the displayed form against the NEW cap so the looming-spirit
      // form stays consistent with the preserved fraction (no phantom form jump).
      const newCap = lamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET)
      setSpiritFormIndex(currentSpiritForm(newGauge, newCap))
    }

    setWagerLamports(lamports)
  }, [phase.kind, wagerLamports])

  const activateTalismanAwaken = useCallback(() => {
    // Allow arming AWAKEN in BOTH idle phases — bet-entry AND settled (Tim
    // 2026-06-05: "awaken does not work anymore"). The button stays visible +
    // enabled in 'settled' (the common state after the first spin), but the
    // handler used to early-return there → a dead button. This now mirrors the
    // spin() gate exactly, so the next cast consumes the armed awaken.
    if (phase.kind !== 'bet-entry' && phase.kind !== 'settled') return
    setTalismanAwakenActive(true)
  }, [phase.kind])

  const spin = useCallback(() => {
    if (phase.kind !== 'bet-entry' && phase.kind !== 'settled') return

    ensureAudio()
    playSpinLaunch()

    setTalismanAwakenActive(false)
    setPhase({ kind: 'spinning' })
    setBackdropState('lobby')
    setCharacterPose('profile')

    // Simulate spin async
    const rng = rngRef.current
    const rawStops = randomStops(rng)

    // Pre-commit Talisman Awaken wild positions (if active).
    // In v1: effectiveStops === rawStops. In v2: 2 positions would be pinned to
    // a Talisman symbol stop before the spin resolves.
    const effectiveStops = [...rawStops]
    const seedHex = sessionRef.current.seedHex

    setTimeout(() => {
      // Schedule reel stop sounds staggered across columns
      for (let i = 0; i < 5; i++) {
        setTimeout(() => playReelStop(), i * REEL_STOP_INTERVAL_MS)
      }
    }, SPIN_DURATION_MS - 5 * REEL_STOP_INTERVAL_MS)

    setTimeout(() => {
      const result = evaluateSpin(effectiveStops)
      setGrid(result.grid)
      setLastSpinStops(rawStops)

      const totalWinLamports = bpsToLamports(result.totalPayBps, wagerLamports)

      setPhase({ kind: 'settling' })

      // Wait for the reels to VISUALLY LAND before revealing the win.
      // setGrid (above) kicks the canvas into its staggered quintic decel; the
      // last column finishes ~REEL_LAND_COMPLETE_MS later. Posting the win figure
      // any earlier shows the LAST WIN number while the reels are still spinning
      // (Tim #141, 2026-06-05). REEL_SETTLE_TO_REVEAL_MS = land time + a short beat.
      setTimeout(() => {
        if (result.totalPayBps > 0n) {
          // RG-C1: celebratory chime only on genuine win (return >= wager).
          // Sub-wager consolation returns enter win-reveal for receipt display
          // but must not trigger the amber bell — a net loss is not a celebration.
          // NOTE: the bonus-frame path (line ~406) uses a different gate
          // (`spinWinLamports > 0n`) because no per-spin wager is placed in
          // free spins — that difference is intentional.
          if (totalWinLamports >= wagerLamports) playWinSettle()
          setPhase({
            kind: 'win-reveal',
            paylineWins: result.paylineWins,
            totalWinLamports,
            scatterCount: result.scatterCount,
          })

          // After win-reveal, check for spirit bonus
          setTimeout(() => {
            if (result.triggersSpiritBonus) {
              playSpiritBonus()
              const freeSpins = freeSpinskFromScatterCount(result.scatterCount)
              setPhase({ kind: 'spirit-bonus-entry', freeSpinsAwarded: freeSpins })
              setBackdropState('spirit-bonus')
              setCharacterPose('channeling')

              setTimeout(() => {
                // Compute the bonus total headlessly (identical RNG draws → identical
                // RTP), then enter the interactive Spirit Sealing reveal instead of the
                // passive free-spin loop. The player taps to REVEAL this pre-rolled total.
                const { total: bonusTotal, finalGrid: bonusGrid } = computeBonusHeadless(
                  rngRef.current, wagerLamports, freeSpins, totalWinLamports,
                )
                const bonusSeedHex = sessionRef.current.seedHex
                setPhase({ kind: 'spirit-sealing-entry', bonusTotalWinLamports: bonusTotal })
                setTimeout(() => {
                  setPhase({
                    kind: 'spirit-sealing-active',
                    bonusTotalWinLamports: bonusTotal,
                    fragments: partitionBonusTotal(bonusTotal),
                    presentationOrder: bonusPresentationOrder(Number(bonusTotal % 6n)),
                    sealedScrolls: [],
                    finalGrid: bonusGrid,
                    seedHex: bonusSeedHex,
                  })
                }, SEALING_ENTRY_FADE_MS)
              }, SPIRIT_BONUS_ENTRY_MS)
            } else {
              // Settle normally
              const ownershipPoints = computeOwnershipPoints(wagerLamports, totalWinLamports)
              setPhase({
                kind: 'settled',
                totalWinLamports,
                paylineWins: result.paylineWins,
                ownershipPoints,
                grid: result.grid,
                sessionSeedHex: seedHex,
              })
              // Spirit Evolution: feed the just-computed ownership points into the
              // gauge (RTP-neutral — no new payout). Fires form-change events.
              // isWin MUST match computeOwnershipPoints' definition exactly:
              // a win is a return >= wager. A sub-wager consolation return
              // (totalWinLamports > 0 but < wager) is a NET LOSS and must be
              // counted as a loss in the Glass Box cycle receipt (RG-C1 factual).
              applyOwnershipToGauge(
                ownershipPoints,
                totalWinLamports >= wagerLamports,
                wagerLamports,
                seedHex,
              )
              playSettlement()
            }
          }, SIG_WIN_REVEAL_MS)
        } else {
          // No win — settle directly
          const ownershipPoints = computeOwnershipPoints(wagerLamports, 0n)
          if (result.triggersSpiritBonus) {
            playSpiritBonus()
            const freeSpins = freeSpinskFromScatterCount(result.scatterCount)
            setPhase({ kind: 'spirit-bonus-entry', freeSpinsAwarded: freeSpins })
            setBackdropState('spirit-bonus')
            setCharacterPose('channeling')

            setTimeout(() => {
              // Headless bonus total (RTP-identical) → interactive Spirit Sealing reveal.
              const { total: bonusTotal, finalGrid: bonusGrid } = computeBonusHeadless(
                rngRef.current, wagerLamports, freeSpins, 0n,
              )
              const bonusSeedHex = sessionRef.current.seedHex
              setPhase({ kind: 'spirit-sealing-entry', bonusTotalWinLamports: bonusTotal })
              setTimeout(() => {
                setPhase({
                  kind: 'spirit-sealing-active',
                  bonusTotalWinLamports: bonusTotal,
                  fragments: partitionBonusTotal(bonusTotal),
                  presentationOrder: bonusPresentationOrder(Number(bonusTotal % 6n)),
                  sealedScrolls: [],
                  finalGrid: bonusGrid,
                  seedHex: bonusSeedHex,
                })
              }, SEALING_ENTRY_FADE_MS)
            }, SPIRIT_BONUS_ENTRY_MS)
          } else {
            setPhase({
              kind: 'settled',
              totalWinLamports: 0n,
              paylineWins: [],
              ownershipPoints,
              grid: result.grid,
              sessionSeedHex: seedHex,
            })
            // Spirit Evolution: a loss accrues ownership at 1.5x (loss-amplified),
            // so the gauge fills FASTER on a losing spin — the "losses convert to
            // progress" inversion (spec §1 Dynamics). RTP-neutral.
            // isWin=false — no win lamports in this branch.
            applyOwnershipToGauge(ownershipPoints, false, wagerLamports, seedHex)
            playSettlement()
          }
        }
      }, REEL_SETTLE_TO_REVEAL_MS)
    }, SIG_SPIN_MS)
  }, [phase.kind, wagerLamports, applyOwnershipToGauge])

  // Execute a free spin when in free-spinning phase.
  // Named with underscore prefix: called only via useEffect below.
  const _executeFreeSpinIfActive = useCallback(() => {
    if (phase.kind !== 'free-spinning') return

    const { spinsRemaining, spinsTotal, bonusTotalWinLamports, stickyWildCells } = phase
    if (spinsRemaining <= 0) return

    playSpinLaunch()

    const rng = rngRef.current
    const stops = randomStops(rng)
    const seedHex = sessionRef.current.seedHex

    setTimeout(() => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => playReelStop(), i * REEL_STOP_INTERVAL_MS)
      }
    }, SPIN_DURATION_MS - 5 * REEL_STOP_INTERVAL_MS)

    setTimeout(() => {
      const result = evaluateSpin(stops, stickyWildCells)
      setGrid(result.grid)
      // Keep lastSpinStops current for every free spin so that OoReiSlotCanvas
      // receives the correct authoritative stop indices via the settledStops prop.
      // Without this, lastSpinStops would hold the PREVIOUS base-game stops during
      // the bonus free-spin sequence, causing the authoritative decel path to land
      // on the wrong strip window (display ≠ settlement during bonus rounds).
      setLastSpinStops(stops)

      const spinWinLamports = bpsToLamports(result.totalPayBps, wagerLamports)
      const newBonusTotal = bonusTotalWinLamports + spinWinLamports

      // Update sticky wilds: any SYM_TALISMAN that lands becomes sticky
      const newStickyWilds = new Set(stickyWildCells)
      for (let col = 0; col < 5; col++) {
        const colData = result.grid[col]
        if (!colData) continue
        for (let row = 0; row < 3; row++) {
          if (colData[row] === 3 /* SYM_TALISMAN */) {
            newStickyWilds.add(`${col}:${row}`)
          }
        }
      }

      if (spinWinLamports > 0n) playWinSettle()

      setPhase({
        kind: 'free-settling',
        paylineWins: result.paylineWins,
        spinsRemaining: spinsRemaining - 1,
        spinWinLamports,
        bonusTotalWinLamports: newBonusTotal,
        stickyWildCells: newStickyWilds,
      })

      setTimeout(() => {
        const nextSpins = spinsRemaining - 1
        if (nextSpins > 0) {
          setPhase({
            kind: 'free-spinning',
            spinsRemaining: nextSpins,
            spinsTotal,
            bonusTotalWinLamports: newBonusTotal,
            stickyWildCells: newStickyWilds,
          })
        } else {
          setPhase({ kind: 'spirit-bonus-end', bonusTotalWinLamports: newBonusTotal })
          setTimeout(() => {
            setBackdropState('lobby')
            setCharacterPose('profile')
            const ownershipPoints = computeOwnershipPoints(wagerLamports, newBonusTotal)
            setPhase({
              kind: 'settled',
              totalWinLamports: newBonusTotal,
              paylineWins: [],
              ownershipPoints,
              grid: result.grid,
              sessionSeedHex: seedHex,
            })
            // Spirit Evolution: bonus settlement also feeds the gauge. RTP-neutral.
            // isWin MUST match computeOwnershipPoints (return >= wager). A bonus
            // total below the triggering wager is a net loss for the cycle receipt.
            applyOwnershipToGauge(
              ownershipPoints,
              newBonusTotal >= wagerLamports,
              wagerLamports,
              seedHex,
            )
            playSettlement()
          }, 1500)
        }
      }, SIG_WIN_REVEAL_MS)
    }, SIG_SPIN_MS)
  }, [phase, wagerLamports, applyOwnershipToGauge])

  // Auto-run free spins when in free-spinning phase
  useEffect(() => {
    if (phase.kind === 'free-spinning') {
      const timer = setTimeout(() => _executeFreeSpinIfActive(), 600)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [phase.kind, _executeFreeSpinIfActive])

  // ─── Spirit Sealing mini-game: player taps a scroll to seal it ──────────────
  // Display-only state change: appends the tapped scroll position. The payout was
  // pre-rolled (partitionBonusTotal); tapping NEVER alters the sum (RG-C3).
  const sealScroll = useCallback((index: 0 | 1 | 2) => {
    setPhase((prev) => {
      if (prev.kind !== 'spirit-sealing-active') return prev
      if (prev.sealedScrolls.includes(index)) return prev
      return { ...prev, sealedScrolls: [...prev.sealedScrolls, index] }
    })
  }, [])

  // ─── Spirit Sealing driver: idle auto-seal + resolve + settle ───────────────
  // The provider owns ALL timers (single source of truth, testable). RG-C5: every
  // duration here is a module-const, identical for a tiny bonus and a huge one.
  useEffect(() => {
    if (phase.kind === 'spirit-sealing-active') {
      if (phase.sealedScrolls.length >= 3) {
        // All three sealed → HOLD the resolved "SPIRIT SEALED $X" total inside this
        // phase (the overlay stays mounted) for the full reveal, then settle. The
        // ritual IS the celebration — constant duration regardless of magnitude
        // (RG-C5); the number communicates the magnitude, not a louder finale.
        const { bonusTotalWinLamports, finalGrid, seedHex } = phase
        const t = setTimeout(() => {
          setBackdropState('lobby')
          setCharacterPose('profile')
          const ownershipPoints = computeOwnershipPoints(wagerLamports, bonusTotalWinLamports)
          setPhase({
            kind: 'settled',
            totalWinLamports: bonusTotalWinLamports,
            paylineWins: [],
            ownershipPoints,
            grid: finalGrid,
            sessionSeedHex: seedHex,
          })
          // Spirit Evolution: bonus settlement feeds the gauge (RTP-neutral). isWin
          // matches computeOwnershipPoints (return >= wager) for the factual receipt.
          applyOwnershipToGauge(
            ownershipPoints,
            bonusTotalWinLamports >= wagerLamports,
            wagerLamports,
            seedHex,
          )
          playSettlement()
        }, SEALING_COMPLETE_DELAY_MS + SEALING_RESULT_HOLD_MS)
        return () => clearTimeout(t)
      }
      // Idle auto-seal (accessibility + session dropout): if the warden does not
      // tap within OFUDA_AUTO_SEAL_MS, the remaining scrolls seal themselves. The
      // total is unchanged. Each manual tap resets this idle window.
      const t = setTimeout(() => {
        setPhase((prev) =>
          prev.kind === 'spirit-sealing-active' ? { ...prev, sealedScrolls: [0, 1, 2] } : prev,
        )
      }, OFUDA_AUTO_SEAL_MS)
      return () => clearTimeout(t)
    }
    return undefined
  }, [phase, wagerLamports, applyOwnershipToGauge])

  const endBonus = useCallback(() => {
    // RG-C8: always available during bonus — cash out the current bonus total
    if (
      phase.kind !== 'free-spinning' &&
      phase.kind !== 'free-settling' &&
      phase.kind !== 'spirit-bonus-entry' &&
      phase.kind !== 'spirit-sealing-active' &&
      phase.kind !== 'spirit-sealing-end'
    ) return

    // Sealing phases carry the FULL pre-rolled total — ending early still settles
    // the whole amount (it was determined before the ritual; RG-C3 / Domain A).
    const bonusTotal =
      phase.kind === 'free-spinning' ? phase.bonusTotalWinLamports
      : phase.kind === 'free-settling' ? phase.bonusTotalWinLamports
      : phase.kind === 'spirit-sealing-active' ? phase.bonusTotalWinLamports
      : phase.kind === 'spirit-sealing-end' ? phase.bonusTotalWinLamports
      : 0n

    setBackdropState('lobby')
    setCharacterPose('profile')
    const ownershipPoints = computeOwnershipPoints(wagerLamports, bonusTotal)
    setPhase({
      kind: 'settled',
      totalWinLamports: bonusTotal,
      paylineWins: [],
      ownershipPoints,
      grid: grid ?? resolveEmptyGrid(),
      sessionSeedHex: sessionRef.current.seedHex,
    })
    // Spirit Evolution: ending the bonus early also settles ownership → gauge.
    // isWin MUST match computeOwnershipPoints (return >= wager) so the cycle
    // receipt is factual (RG-C1). A bonus total below the wager is a net loss.
    applyOwnershipToGauge(
      ownershipPoints,
      bonusTotal >= wagerLamports,
      wagerLamports,
      sessionRef.current.seedHex,
    )
    playSettlement()
  }, [phase, wagerLamports, grid, applyOwnershipToGauge])

  const cashOut = useCallback(() => {
    // RG-C8: navigate away. Direct-play (lobby removed 2026-06-03) → return to the
    // playable board (bet-entry) rather than a lobby gate. Backdrop to the idle
    // storm vista ('lobby' = the default idle backdrop, not a lobby-only state).
    setBackdropState('lobby')
    setCharacterPose('profile')
    setPhase({ kind: 'bet-entry' })
    setGrid(null)
    setTalismanAwakenActive(false)
    // Spirit Evolution: the gauge is session-scoped (spec §6.3). Cashing out
    // ends the session, so the gauge resets to Form 0 Dormant.
    gaugeRef.current = 0n
    setSpiritGaugeLamports(0n)
    setSpiritFormIndex(0)
    setPendingSpiritFormEvent(null)
    // Seal quest: reset per-cycle counters on cash out.
    spinCountRef.current = 0
    cyclePointsRef.current = 0n
    cycleWinCountRef.current = 0
    cycleLossCountRef.current = 0
    setSpinCountThisCycle(0)
    setCycleOwnershipPointsTotal(0n)
    setPendingSealEvent(null)
    // Myth map: close the map and clear any pending chapter-close event.
    setMapOpen(false)
    setPendingChapterClose(null)
    // Spirit Ally: reset ally + chosen archetype perk on cash out (session-scoped).
    setActiveAllyKanji(null)
    setActiveAllyArchetype(null)
    chosenArchetypeRef.current = null
  }, [])

  const dismissReceipt = useCallback(() => {
    if (phase.kind !== 'settled') return
    setPhase({ kind: 'bet-entry' })
  }, [phase.kind])

  const clearSpiritFormEvent = useCallback(() => {
    setPendingSpiritFormEvent(null)
  }, [])

  const dismissSealReceipt = useCallback(() => {
    setPendingSealEvent(null)
  }, [])

  // ── Myth map actions (Domain B/C — no financial state) ────────────────────
  const openMap = useCallback(() => {
    setMapOpen(true)
  }, [])

  const closeMap = useCallback(() => {
    setMapOpen(false)
  }, [])

  const dismissChapterClose = useCallback(() => {
    setPendingChapterClose(null)
  }, [])

  // confirmSeal: call when the player taps the seal-ritual stamp OR when
  // auto-dismiss fires. Clears pendingChapterClose. No-op if null.
  // RG-safe: the seal is pre-determined (Transcendent reset already committed
  // by advanceSpiritGauge). The tap gesture is purely ceremonial.
  const confirmSeal = useCallback(() => {
    setPendingChapterClose(null)
  }, [])

  // chooseAlly: set the active ally ARCHETYPE for the next region. EV-neutral —
  // the archetype scales only the seal-ledger + spirit-gauge layers (never cash).
  // FAIL-CLOSED: getArchetypeConfig throws on an unknown key, so a bad value can
  // never silently default to a perk multiplier. Also sets the backdrop-watermark
  // kanji to the archetype's bonus spirit (display-only, 8% opacity).
  const chooseAlly = useCallback((archetype: RegionArchetype) => {
    const cfg = getArchetypeConfig(archetype) // throws on unknown key
    chosenArchetypeRef.current = archetype
    setActiveAllyArchetype(archetype)
    const spirit = SPIRIT_PROCESSION[cfg.bonusSpiritIndex]
    setActiveAllyKanji(spirit ? spirit.kanji : null)
  }, [])

  const clearRankUp = useCallback(() => setRankUpTier(null), [])

  // Warden Rank derived from the lifetime seal-points total (pure, EV-neutral).
  const wardenRank = computeWardenRank(lifetimeSealPoints)

  // ── Myth region derivation (pure — no new state) ──────────────────────────
  // Computed inline rather than in a useMemo to keep the hook's ref structure
  // simple. deriveRegionState is O(10) and alloc-cheap. If the consumer renders
  // frequently and the derivation becomes measurable, add useMemo here.
  const regionState = deriveRegionState(sealedSpiritCount)

  // Derive gaugeCap inline for the return object. wagerLamports is React state,
  // so this re-derives on every render — O(1), always matches the current wager.
  const gaugeCap = wagerLamports * BigInt(SPIRIT_GAUGE_CYCLES_SPINS_TARGET)

  return {
    phase,
    wagerLamports,
    grid,
    lastSpinStops,
    talismanAwakenActive,
    backdropState,
    characterPose,
    spiritGaugeLamports,
    gaugeCap,
    spiritFormIndex,
    pendingSpiritFormEvent,
    sealedSpiritCount,
    currentSpiritIndex,
    spinCountThisCycle,
    cycleOwnershipPointsTotal,
    pendingSealEvent,
    // Myth map layer
    regionState,
    mapOpen,
    openMap,
    closeMap,
    pendingChapterClose,
    dismissChapterClose,
    confirmSeal,
    // Spirit Ally
    activeAllyKanji,
    activeAllyArchetype,
    chooseAlly,
    // Warden Rank (D.1)
    wardenRank,
    lifetimeSealPoints,
    rankUpTier,
    clearRankUp,
    // Actions
    goToBetEntry,
    setWager,
    activateTalismanAwaken,
    spin,
    sealScroll,
    endBonus,
    cashOut,
    dismissReceipt,
    clearSpiritFormEvent,
    dismissSealReceipt,
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Compute the Spirit Bonus total HEADLESSLY — runs the EXACT former free-spin
 * loop math (same randomStops draws, same evaluateSpin, same sticky-wild
 * accumulation, same bpsToLamports) but without animation. Because it consumes
 * the RNG identically to the old animated loop, the RTP is byte-identical — this
 * removes the wait, never the math. The Spirit Sealing mini-game then reveals
 * this pre-rolled total. Domain A: deterministic given the rng state; the loop
 * count is fixed (freeSpins), matching the old loop which never extended.
 */
function computeBonusHeadless(
  rng: () => number,
  wagerLamports: bigint,
  freeSpins: number,
  initialTotal: bigint,
): { total: bigint; finalGrid: ReelGrid } {
  let total = initialTotal
  let sticky = new Set<string>()
  let finalGrid: ReelGrid = resolveEmptyGrid()
  for (let s = 0; s < freeSpins; s++) {
    const stops = randomStops(rng)
    const result = evaluateSpin(stops, sticky)
    finalGrid = result.grid
    total += bpsToLamports(result.totalPayBps, wagerLamports)
    const next = new Set(sticky)
    for (let col = 0; col < 5; col++) {
      const colData = result.grid[col as 0 | 1 | 2 | 3 | 4]
      if (!colData) continue
      for (let row = 0; row < 3; row++) {
        if (colData[row as 0 | 1 | 2] === 3 /* SYM_TALISMAN */) next.add(`${col}:${row}`)
      }
    }
    sticky = next
  }
  return { total, finalGrid }
}

function resolveEmptyGrid(): ReelGrid {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ] as unknown as ReelGrid
}

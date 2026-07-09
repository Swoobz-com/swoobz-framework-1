/**
 * OO-REI animation timing signatures — module-level constants.
 *
 * All animation durations are defined here. The motion-director spec in
 * OO-REI-ART-DIRECTION-SPEC-2026-05-27.md defines what is allowed and
 * what is forbidden. These constants implement the ALLOWED list.
 *
 * RG-C5 STRUCTURAL: these constants cannot be changed at runtime. They
 * are frozen module-level exports. Any change to animation timing requires
 * a code commit.
 *
 * Per Tim verbatim 2026-05-22: "Pulse curve is the gold standard every
 * game inherits" — these timing values mirror the Pulse parity chassis
 * where applicable (SPIN_DURATION_MS, PHASE_FADE_MS, etc.)
 */

/** Reel spin duration: time from spin-launch to last reel column stopping. */
export const SPIN_DURATION_MS = 2500 as const

/** Individual reel stop stagger: each column stops this ms after the previous. */
export const REEL_STOP_STAGGER_MS = 150 as const

/** Easing function label for reel deceleration (cubic-out). */
export const REEL_EASE = 'cubic-out' as const

// ─── Reel-land completion timing (single source of truth) ────────────────────
//
// The instant the provider leaves 'spinning' (isSpinning→false) and sets the
// grid, OoReiSlotCanvas kicks each column into a staggered quintic decel: column
// N begins decel at N×REEL_DECEL_STAGGER_MS and finishes one REEL_DECEL_MS later.
// So the LAST column finishes decel — i.e. the reels have VISUALLY LANDED — at
// REEL_LAND_COMPLETE_MS after the grid is set.
//
// The win-reveal phase (LAST WIN figure + settlement chime) MUST wait until the
// reels have landed, otherwise the number appears while the reels are still
// spinning (Tim #141, 2026-06-05: "the last win is set before the slots are set").
//
// OoReiSlotCanvas.tsx aliases its local DECEL_MS / DECEL_STAGGER_MS / COLS to
// these exports so the two can never drift. RG-C5: module-const, outcome-blind.
export const REEL_DECEL_MS = 900 as const          // per-column decel duration
export const REEL_DECEL_STAGGER_MS = 200 as const  // column N starts N× this after column 0
export const REEL_COLS = 5 as const                // grid columns (mirror of canvas COLS)
/** Wall-clock from grid-set to the last reel column finishing its decel. */
export const REEL_LAND_COMPLETE_MS = (REEL_COLS - 1) * REEL_DECEL_STAGGER_MS + REEL_DECEL_MS // 1700
/**
 * Settle beat after the last reel locks before the win figure reveals.
 * The last column finishes decel at REEL_LAND_COMPLETE_MS (1700) and its 120ms
 * land-pop (SYMBOL_POP_MS) settles by ~1820. This beat clears that with margin so
 * the win number arrives as a distinct "board locked → here is your win" rhythm,
 * never racing the final tile settle (Tim: "no time to digest, stop rushing").
 */
export const SETTLE_REVEAL_BEAT_MS = 220 as const
/**
 * Delay from grid-set (provider leaves 'spinning') to the win-reveal phase.
 * = reels fully landed + a short deliberate beat, so the LAST WIN number and the
 * settlement chime only appear AFTER the tiles have visibly settled (Tim #141).
 */
export const REEL_SETTLE_TO_REVEAL_MS = REEL_LAND_COMPLETE_MS + SETTLE_REVEAL_BEAT_MS // 1840

/** Phase transition fade duration (lobby → bet-entry → active → settled). */
export const PHASE_FADE_MS = 220 as const

/** Win-reveal payline highlight display duration.
 * Bumped 2026-05-28 (game-feel cohesion rebuild): from 2500 to 3000ms.
 * Bumped 2026-05-29 (longer dwell): MEGA_WIN_OVERLAY_MS = 3600ms now exceeds
 * WIN_REVEAL_MS — the overlay is additive (pointerEvents:none, z-5) so it
 * fades out over the settled receipt without blocking any interaction.
 * The good (1400ms) and big (2200ms) tiers have ample margin within 3000ms.
 */
// Bumped 2026-06-02 (Tim "the winning animation should stay on for a bit — we
// are rushing too fast through animations, no time to digest"): 3000 → 4400ms
// so the win figure + banner linger long enough to read before settling. The
// MEGA overlay (3600ms) still sits comfortably within this. RG-C5: tier-agnostic.
export const WIN_REVEAL_MS = 4400 as const

// ─── Win-reveal savor + panel-gate timing (module-const — RG-C5 structural) ──
//
// These constants implement the "build-up / savor" sequence from the game-feel
// spec: the WIN panel NEVER mounts until the canvas trace has fully drawn and
// a brief savor hold has elapsed. All values are module-level `as const` so
// they cannot vary with wager / session / streak state (RG-C5).

/**
 * Explicit draw window for the payline trace animation.
 * The trace segments draw in over this window (per-payline staggered within).
 * Previously the trace activated instantly; this window gives a visible duration.
 * RG-C5: module-const, identical for all tiers and wager sizes.
 */
export const WIN_TRACE_DRAW_DURATION_MS = 500 as const

/**
 * Silence after the trace has fully drawn, before the WIN panel mounts.
 * This is the "all cells glowing, line complete, player reads what connected" beat.
 * Raised to 400ms (was 280ms) per art-director spec 2026-05-29: minimum dwell for
 * the player's eye to register the payline connection before the number appears.
 * RG-C5: module-const, identical for all tiers and wager sizes.
 * The DOM panel NEVER mounts before WIN_SAVOR_HOLD_MS has elapsed from end of trace.
 */
export const WIN_SAVOR_HOLD_MS = 700 as const  // 400 → 700 (Tim 2026-06-02: slow the reveal, let the line register before the number)

/**
 * Per-payline stagger delay within the WIN_TRACE_DRAW_DURATION_MS window.
 * 60ms per payline — lines draw in quick succession, clearly distinguishable.
 * RG-C5: module-const.
 */
export const WIN_TRACE_PER_LINE_STAGGER_MS = 60 as const

// ─── Win-reveal choreography beat timings (module-const — RG-C5 structural) ───
//
// Sequence: LAND → ANTICIPATION GAP → LIGHT MATCHES → DRAW LINE → RESOLVE.
// All values are module-level `as const` so they cannot scale with session /
// streak / wager state (RG-C5). Every spin's win-reveal uses the SAME beats.
// The audio functions that fire at each beat are equally zero-param (RG-C5).
//
// Reference: game-feel-engineer Juice Hierarchy Level 3 + swoobz-sound-immersion
// Beat 2 (the held silence that builds tension between land and celebration).

/**
 * Anticipation gap: silence between the final reel settling and the first
 * winning cell lighting up. Creates the "held breath" tension beat.
 * 200ms — swoobz-sound-immersion Beat 2 reference.
 * RG-C5: identical regardless of wager / session / streak state.
 */
export const WIN_ANTICIPATION_GAP_MS = 200 as const

/**
 * Stagger delay between each successive winning cell lighting up.
 * 80ms per cell — fast enough to read as a sequence, slow enough to be legible.
 * RG-C5: identical regardless of number of winning cells / wager size.
 */
export const WIN_SYMBOL_LIGHT_STAGGER_MS = 80 as const

/**
 * Delay between the last winning cell lighting and the payline trace drawing.
 * Applied AFTER all winning cells have lit (cellCount × WIN_SYMBOL_LIGHT_STAGGER_MS).
 * 80ms — one frame's worth of "all cells glowing before the line connects them".
 * RG-C5: module-const.
 */
export const WIN_LINE_DRAW_DELAY_MS = 80 as const

/** Stone-lift win animation duration (2 stones rise + fade). */
export const STONE_LIFT_MS = 400 as const

/** Stone-lift rise distance in canvas pixels. */
export const STONE_LIFT_PX = 24 as const

/** Spirit figure opacity transition on bonus entry (0 → 0.7). */
export const SPIRIT_BONUS_ENTRY_MS = 800 as const

/** Spirit figure full opacity during bonus. */
export const SPIRIT_LOOM_OPACITY = 0.7 as const

/** Spirit figure base opacity during active base game (hint of presence). */
export const SPIRIT_HINT_OPACITY = 0.12 as const

/** Rei amber-eye pulse duration (single pulse on spin launch, NOT looping). */
export const EYE_PULSE_MS = 400 as const

/** Character crossfade between profile and channeling poses. */
export const CHARACTER_CROSSFADE_MS = 400 as const

/** Talisman ribbon flutter period (CSS rotate cycle) — active phase only. */
export const TALISMAN_FLUTTER_PERIOD_MS = 1200 as const

/** Rain streak re-randomize interval (0.04Hz = 25s period, but 25 is too slow). */
export const RAIN_REDRAW_INTERVAL_MS = 250 as const

/** Spirit-aura rim breathing period (0.04Hz base). Only during Spirit Bonus. */
export const SPIRIT_AURA_PERIOD_MS = 25000 as const // 0.04Hz

/** Bet-entry card fade-in/out duration. */
export const BET_ENTRY_FADE_MS = 220 as const

/** Settlement receipt fade-in duration. */
export const RECEIPT_FADE_MS = 220 as const

/** Win value count-up animation duration. */
export const WIN_COUNTUP_MS = 300 as const

/** Ambient backdrop brightness transition when storm deepens (spin launch). */
export const STORM_DEEPEN_MS = 300 as const

/** How long to show the win result before auto-transitioning to bet-entry. */
export const AUTO_ADVANCE_AFTER_WIN_MS = 2000 as const

/** Maximum reel spin duration before force-stop (safety cap). */
export const MAX_SPIN_MS = 5000 as const

/** Canvas DevicePixelRatio cap. */
export const MAX_DPR = 2 as const

/** rAF target frame budget in ms. */
export const FRAME_BUDGET_MS = 16 as const

/**
 * Spirit Bonus backdrop state.
 * Used by OoReiSceneBackdrop to switch between lobby plate and spirit plate.
 */
export type BackdropState = 'lobby' | 'spirit-bonus'

/**
 * Character pose state.
 * Used by OoReiCharacterLayer to switch between profile and channeling art.
 */
export type CharacterPose = 'profile' | 'channeling'

// ─── Cinematic overlay durations (module-level — RG-C5 structural) ───────────
//
// These are the 4 named tier moments from OO-REI-AZUKI-CINEMATIC-OVERLAYS-2026-05-28.md.
// Module-level `as const` — they cannot be scaled by streak, session, or wager.
// Every Big Win shows the SAME 1500ms overlay; only WHICH tier triggers differs,
// not the amplitude per trigger. (RG-C5: no frequency-scaled fanfare.)

/** BIG WIN cinematic overlay duration — "Spirit Stirs" (8x–19x wager).
 * 2200ms (+47% from 1500ms). Tim 2026-05-29: earned moments need to linger.
 * RG-C5: module-level const — NEVER scaled by win magnitude, session, or streak.
 * Every BIG WIN shows the SAME 2200ms overlay, regardless of exact win amount. */
// 2200→4800 (Tim 2026-05-30: 8x "went by too quickly"). Budget: approach 350 +
// IMPACT-HOLD 1000 (spirit reads) + kinetic 80 + PULL-OUT payoff ~3150 (number
// lingers + counts up) + exit 220. RG-C5: fixed per tier, never scaled by value.
export const BIG_WIN_OVERLAY_MS = 4800 as const

/** MEGA WIN cinematic overlay duration — "Monster Clash" (20x+ wager).
 * 3600ms (+44% from 2500ms). Tim 2026-05-29: earned moments need to linger.
 * RG-C5: module-level const — NEVER scaled by win magnitude, session, or streak.
 * Every MEGA WIN shows the SAME 3600ms overlay, regardless of exact win amount. */
// 3600→7000 (Tim 2026-05-30: a 660x mega "went by in like 3 seconds"). A mega
// demands a scene that BUILDS UP and lingers. Budget: approach 280 + IMPACT-HOLD
// 1700 (the spirit clash is fully legible) + kinetic 80 + PULL-OUT payoff ~4720
// (number counts up + holds) + exit 220. RG-C5: fixed per tier (20x and 660x get
// the identical 7s scene — the NUMBER tells the magnitude, never the duration).
export const MEGA_WIN_OVERLAY_MS = 7000 as const

/** SPIRIT BONUS TRIGGER cinematic overlay duration — "Awakening" (3+ scatters). 1500ms. */
export const SPIRIT_BONUS_TRIGGER_OVERLAY_MS = 2400 as const // 1500→2400: the awakening announce breathes before the sealing ritual

/** SPIRIT BONUS FINALE cinematic overlay duration — "Spirit Bows" (bonus ≥50x wager). 2000ms. */
export const SPIRIT_BONUS_FINALE_MS = 3200 as const // 2000→3200: "Spirit Bows" finale lingers

/** Spirit Bonus finale threshold (BPS). Fires "Spirit Bows" overlay when bonus total >= 50x wager.
 * Gate: (bonusTotalWinLamports * 10_000n) / wagerLamports >= SPIRIT_BONUS_FINALE_THRESHOLD_BPS.
 * Floor truncation, house-favored. Exactly 50.0x fires; 49.9x does not.
 * Domain A: BigInt, module-const, never mutated at runtime. */
export const SPIRIT_BONUS_FINALE_THRESHOLD_BPS = 500_000n as const

// ─── Spirit Sealing mini-game timings (OoReiSpiritSealing) ───────────────────
// The interactive bonus peak: three ofuda scrolls the player taps to seal the
// spirit. ALL module-level `as const`. RG-C5 structural: these durations are
// IDENTICAL for a tiny bonus and a huge one — magnitude is communicated by the
// revealed NUMBER, never by a longer/bigger ritual. Grep audit: `OFUDA_|SEALING_`
// must match ONLY this file (timings) + OoReiSpiritSealing.tsx (keyframe names).
/** Canvas dim-in before the three scrolls drop. */
export const SEALING_ENTRY_FADE_MS = 600 as const
/** Each ofuda scroll's drop-in animation. */
export const OFUDA_DROP_MS = 480 as const
/** Stagger between the three scrolls dropping in. One scroll per beat, legible. */
export const OFUDA_DROP_STAGGER_MS = 240 as const
/** A tapped scroll planting into the ground plane. Long enough to feel deliberate. */
export const OFUDA_PLANT_MS = 520 as const
/** Idle pulse period of an un-sealed scroll's seal-ring glow (authored, single-path). */
export const OFUDA_GLOW_PERIOD_MS = 2800 as const
/** Domain-element eruption from a planted scroll (lightning / wave / flame / mist / shadow). */
export const ELEMENT_ERUPTION_MS = 680 as const
/** A.2 region-spirit figure dissolve-upward duration when all three seals land.
 *  Mirrors the duel's seal-beat transform; module-const so it is identical for a
 *  tiny bonus and a huge one (RG-C5 — magnitude lives in the number, not motion). */
export const SEALING_SPIRIT_DISSOLVE_MS = 1800 as const
/** Delay after the third eruption before the summed total resolves.
 *  Extended so the eruption + spirit dissolve both complete before the number appears. */
export const SEALING_COMPLETE_DELAY_MS = 900 as const
/** How long the resolved total holds on screen before returning to the reels.
 *  Long enough to read + absorb a large win (e.g. 380x). */
export const SEALING_RESULT_HOLD_MS = 3200 as const
/** Idle auto-seal accessibility fallback only -- 30s is not the default flow.
 *  A player who walks away mid-session or has a motor impairment gets auto-completion.
 *  A player actively playing never sees it fire.
 *  RG-C5: identical regardless of win magnitude. */
export const OFUDA_AUTO_SEAL_MS = 30_000 as const
/** Stagger between auto-sealed scrolls when the idle timeout fires. */
export const OFUDA_AUTO_SEAL_STAGGER_MS = 600 as const

/** GOOD WIN cinematic overlay duration — whisper beat (3x–7x wager).
 * 900ms (blueprint fix 2026-05-30): GOOD WIN is a restrained whisper, NOT a full
 * duel. Reserve the full 4800ms/7000ms clash for BIG/MEGA. Canvas stays visible.
 * RG-C5: module-level const — NEVER scaled by win magnitude, session, or streak.
 * Every GOOD WIN shows the SAME 900ms overlay, regardless of exact win amount. */
export const GOOD_WIN_OVERLAY_MS = 900 as const

/** Good-win character crossfade: Rei profile pose shift on good tier win. 200ms. */
export const GOOD_WIN_CHARACTER_SHIFT_MS = 200 as const

/** Recovery breath: minimum ms before next-spin CTA becomes active after settle.
 * Functional pacing beat + RG-safe loop slowdown. Not an animation — it is a CTA gate.
 * RG-C5: module-const, identical on every settled outcome. */
export const RECOVERY_BREATH_MS = 500 as const

// ─── 5-Phase cinematic choreography timing (module-level — RG-C5 structural) ──
//
// These constants drive the APPROACH / IMPACT-HOLD / KINETIC-RELEASE / PULL-OUT /
// EXITING 5-phase sequence in OoReiCinematicOverlay.
// Module-level `as const` — they cannot be scaled by streak, session, or wager.
// Tier distinction is handled by per-tier CLASH_HOLD_MS_* variants below.
//
// Reference: swoobz-cinematic-animation skill §4-phase choreography.
// The MAPPA pull-out-to-multiplier principle: after IMPACT-HOLD, the scene
// pulls out (scale 1.0 → 0.96) to clear center space for the kanji multiplier.
// This is the CORRECT pull-out direction (not the 1.05→1.0 zoom-in that was
// previously in the ENTERING phase).

/** Character approach speed: how fast Rei and spirit slide in from off-screen. */
export const CLASH_APPROACH_MS = 260 as const

/** Impact-hold duration for BIG WIN tier (8x–19x). */
// IMPACT-HOLD = the beat where the dual-character spirit CLASH is on screen and
// must READ (Tim 2026-05-30: "the scene appeared but moved quickly, not knowing
// what kind of spirit i fought or what it did"). 340/400ms was a blink. Held long
// enough now to actually see the spirit + what it did. RG-C5: fixed per tier.
export const CLASH_HOLD_BIG_MS = 1000 as const

/** Impact-hold duration for MEGA WIN tier (20x+). */
export const CLASH_HOLD_MEGA_MS = 1700 as const

/** Impact-hold duration for SPIRIT BONUS TRIGGER tier. */
export const CLASH_HOLD_SPIRIT_TRIGGER_MS = 900 as const

/** Kinetic-release canvas speed-lines draw duration. rAF-driven. */
export const SPEED_LINE_DRAW_MS = 80 as const

/** Kinetic-release speed-lines hold (fully drawn) duration. */
export const SPEED_LINE_HOLD_MS = 260 as const

/** Kanji bloom overshoot rise: scale 0.6 → 1.12. */
export const KANJI_BLOOM_MS = 100 as const

/** Kanji bloom settle: scale 1.12 → 1.0. */
export const KANJI_SETTLE_MS = 120 as const

/** Scene zoom-punch on impact frame. */
export const ZOOM_PUNCH_MS = 120 as const

/**
 * Brushstroke clash-sweep animation duration — the vermillion ink slash that
 * sweeps left-to-right via clip-path during the IMPACT phase.
 *
 * RG-C5 structural: module-level `as const` — this value is IDENTICAL for
 * every clash tier that shows the brushstroke (big / mega / spirit-trigger /
 * spirit-finale / spirit-form-4). Only WHICH tiers show it differs, never
 * the amplitude or duration. NEVER scaled by session / streak / win magnitude.
 */
export const BRUSH_SWEEP_MS = 280 as const

// ─── Hit-stop constants (module-level — RG-C5 structural, auditable via grep) ─
//
// grep -rn 'HIT_STOP_' | grep 'as const'  — should match all 4 entries below.
// Any local file-level hit-stop must import these instead of defining its own.

/** Micro hit-stop: reel column stopping confirmation. ~83ms = 5 frames @ 60fps. */
export const HIT_STOP_MICRO_MS = 83 as const

/** Win hit-stop: canvas win-highlight freeze. */
export const HIT_STOP_WIN_MS = 150 as const

/** Cinematic hit-stop: BIG WIN. */
export const HIT_STOP_CINEMATIC_BIG_MS = 300 as const

/** Cinematic hit-stop: MEGA WIN. */
export const HIT_STOP_CINEMATIC_MEGA_MS = 600 as const

// ─── Authored speed-line geometry (module-const array — never runtime-generated) ─
//
// Each entry: { angleDeg, lengthFactor, weight }
//   angleDeg     — angle in degrees (0 = rightward, 90 = downward)
//   lengthFactor — fraction of half-diagonal to draw (0.4–1.0)
//   weight       — canvas lineWidth
//
// These are AUTHORED coordinates: fixed positions, not stochastic emitters.
// The three-question test (authored, response-driven, one sequence) passes:
//   - Authored: yes (fixed array, not Math.random())
//   - Response-driven: yes (fires only on KINETIC phase transition)
//   - One sequence: yes (one rAF sweep per overlay mount)
//
// 12 lines arranged to suggest radial burst from center (impact frame origin).
// Angles spread around the full 360° with deliberate asymmetry for dynamism.
// Used by OoReiCinematicOverlay during KINETIC-RELEASE beat.

export interface SpeedLineSpec {
  readonly angleDeg: number
  readonly lengthFactor: number
  readonly weight: number
}

export const SPEED_LINES: ReadonlyArray<SpeedLineSpec> = [
  { angleDeg:   0, lengthFactor: 0.85, weight: 2.5 },
  { angleDeg:  28, lengthFactor: 0.70, weight: 1.8 },
  { angleDeg:  55, lengthFactor: 0.60, weight: 1.2 },
  { angleDeg:  88, lengthFactor: 0.75, weight: 2.0 },
  { angleDeg: 118, lengthFactor: 0.55, weight: 1.4 },
  { angleDeg: 148, lengthFactor: 0.80, weight: 2.2 },
  { angleDeg: 180, lengthFactor: 0.90, weight: 2.8 },
  { angleDeg: 208, lengthFactor: 0.65, weight: 1.6 },
  { angleDeg: 235, lengthFactor: 0.58, weight: 1.3 },
  { angleDeg: 270, lengthFactor: 0.78, weight: 2.1 },
  { angleDeg: 305, lengthFactor: 0.62, weight: 1.5 },
  { angleDeg: 332, lengthFactor: 0.82, weight: 2.4 },
] as const

// ─── Spirit Evolution form overlay durations (RG-C5 structural) ──────────────
//
// Spec §8.3. Module-level `as const` — they CANNOT vary with streak / session /
// wager. Every Stirring event shows 1200ms; every Transcendent event shows
// 2000ms. The variation across tiers is *character* (escalating narrative
// weight), NOT *frequency-scaled fanfare* — exactly mirroring the existing
// BIG_WIN (1500ms) vs MEGA_WIN (2500ms) two-constant pattern. The form-change
// overlay is triggered by accumulated ownership-point progress, NOT by the
// win/loss outcome of the current spin (spec §8.4, RG-C1/RG-C2 safe).

/** Spirit Evolution Form 0→1 "Stirring" (揺) overlay duration. 1200ms — brief. */
export const SPIRIT_FORM_1_OVERLAY_MS = 2400 as const

/** Spirit Evolution Form 1→2 "Manifest" (顕) overlay duration. 1500ms — standard. */
export const SPIRIT_FORM_2_OVERLAY_MS = 2700 as const

/** Spirit Evolution Form 2→3 "Radiant" (輝) overlay duration. 1800ms — extended. */
export const SPIRIT_FORM_3_OVERLAY_MS = 3000 as const

/** Spirit Evolution Form 3→4 "Transcendent" (超) overlay duration. 2000ms — climax. */
export const SPIRIT_FORM_4_OVERLAY_MS = 3400 as const

/** Spirit Gauge fill animation duration on settle. 600ms. Fires only on a genuine
 * settled state change (DLv2 principle 10 — motion reserved for state change). */
export const SPIRIT_GAUGE_FILL_MS = 600 as const

/** Spirit form badge crossfade duration when the form kanji swaps. 400ms. */
export const SPIRIT_FORM_BADGE_CROSSFADE_MS = 400 as const

/**
 * Win tier type.
 * Computed from totalWinLamports / wagerLamports via computeWinTier().
 *
 * Unified tier ladder (2026-05-28 cohesion rebuild):
 *   'none'  = win = 0 OR sub-break-even — no feedback (RG-C1 compliant)
 *   'nice'  = >=1.0x wager — canvas 良 banner only, no DOM overlay
 *   'good'  = >=3.0x wager — lightweight DOM overlay (whisper beat)
 *   'big'   = >=8.0x wager — full DOM overlay: Rei + spirit profile
 *   'mega'  = >=20.0x wager — full clash overlay: warrior + clash + shin-sho
 *
 * RG-C1: sub-break-even wins (e.g. 0.4x rice 3oaK) → 'none' (zero celebratory feedback).
 * RG-C5: thresholds are module-level; computeWinTier never receives session/streak data.
 */
export type WinTier = 'none' | 'nice' | 'good' | 'big' | 'mega'

/**
 * All cinematic overlay tier types (win tier + spirit bonus tiers).
 * Used as the `tier` prop on OoReiCinematicOverlay.
 */
export type CinematicTier =
  | WinTier
  | 'spirit-trigger'   // SPIRIT BONUS TRIGGER — "Awakening" (3+ scatters, 1500ms)
  | 'spirit-finale'    // SPIRIT BONUS FINALE — "Spirit Bows" (bonus ≥50x wager, 2000ms)
  // Spirit Evolution form-change moments (spec §8). These are NARRATIVE story
  // beats triggered by accumulated ownership-point progress — NOT by the
  // win/loss outcome of any single spin (RG-C1/RG-C2 safe). They reuse the
  // spirit figure at the form's opacity and carry no currency / win framing.
  | 'spirit-form-1'    // STIRRING (揺) — gauge 25%, 1200ms
  | 'spirit-form-2'    // MANIFEST (顕) — gauge 50%, 1500ms
  | 'spirit-form-3'    // RADIANT (輝) — gauge 75%, 1800ms
  | 'spirit-form-4'    // TRANSCENDENT (超) — gauge 100% → reset, 2000ms climax

// ─── Unified tier threshold constants (module-level — RG-C5 structural) ──────
// True BPS: 10_000n = 1.0x wager. Computed by computeWinTier, read by canvas
// and DOM overlay. One authority — both systems read the same value.
//
// nice  >=10_000n  — 1.0x break-even (sub-break-even = 'none' per RG-C1)
// good  >=30_000n  — 3.0x (first character beat)
// big   >=80_000n  — 8.0x (full spirit overlay; was 10x → lowered to ~1/77 spins)
// mega  >=200_000n — 20.0x (now reachable; observed 20x+ ~0.15% of spins per MC)
export const WIN_TIER_NICE_BPS  =  10_000n as const  // 1.0x
export const WIN_TIER_GOOD_BPS  =  30_000n as const  // 3.0x
export const WIN_TIER_BIG_BPS   =  80_000n as const  // 8.0x
export const WIN_TIER_MEGA_BPS  = 200_000n as const  // 20.0x

/**
 * Compute win tier from lamport amounts — Domain A: BigInt BPS, floor-truncation.
 *
 * RG-C5 structural: this function NEVER receives streak / session / frequency data.
 * Only the true economic ratio (winLamports / wagerLamports) drives the tier.
 *
 * Rounding direction: floor (house-favored). A 19.9x win stays 'big', not 'mega'.
 *
 * RG-C1: sub-break-even wins (< 1.0x, e.g. 0.4x rice 3oaK) return 'none'.
 * The player wagered more than they won — zero celebratory feedback.
 *
 * @param winLamports   — total confirmed win in lamports (bigint, must be ≥ 0)
 * @param wagerLamports — wager amount in lamports (bigint, must be > 0)
 */
export function computeWinTier(winLamports: bigint, wagerLamports: bigint): WinTier {
  if (wagerLamports <= 0n) return 'none'
  if (winLamports <= 0n) return 'none'
  // Multiply by 10_000n before dividing — floor division is house-favored.
  // 10_000n = 1.0x, so WIN_TIER_MEGA_BPS = 200_000n = 20.0x.
  const ratioBps = (winLamports * 10_000n) / wagerLamports // floor truncation — house-favored
  if (ratioBps >= WIN_TIER_MEGA_BPS) return 'mega'   // 20x+
  if (ratioBps >= WIN_TIER_BIG_BPS)  return 'big'    // 8x–19x
  if (ratioBps >= WIN_TIER_GOOD_BPS) return 'good'   // 3x–7x
  if (ratioBps >= WIN_TIER_NICE_BPS) return 'nice'   // 1x–2x (break-even+)
  return 'none'                                       // sub-break-even — RG-C1: silent
}

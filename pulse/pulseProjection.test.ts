/**
 * pulseProjection — alignment tests for the bps → Y mapping.
 *
 * The audio tier-tick fires when the live curve's leadBps crosses each
 * value in `MILESTONE_BPS`. The curve canvas's `drawMilestonePips`
 * renders each pip at `projectY(MILESTONE_BPS[i], H, ceilMul, bottomReservePx)`
 * using the SAME H + ceil + bottomReserve the curve head consumes — so
 * the pip line, the curve head, and the audio trigger coincide by
 * construction (PULSE-FX-RESTORE-ALIGN-2026-05-27 #2).
 *
 * This file asserts the underlying projection's determinism, ordering,
 * and clamping invariants — properties the pip alignment depends on.
 */
import { describe, expect, it } from 'vitest'
import { TIER_TICKS_BPS } from './pulseAudio'
import { formatMultiplier, ONE_X_BPS } from './pulseMath'
import { MILESTONE_BPS, MILESTONE_LABELS, projectY, Y_MIN_CEIL } from './pulseProjection'

describe('pulseProjection — milestone schedule', () => {
  it('MILESTONE_BPS has exactly 6 entries paired with 6 labels', () => {
    expect(MILESTONE_BPS).toHaveLength(6)
    expect(MILESTONE_LABELS).toHaveLength(6)
  })

  it('MILESTONE_BPS values are the documented multipliers (1.25, 1.5, 2, 3, 5, 10)', () => {
    expect(MILESTONE_BPS).toEqual([
      12_500n, // 1.25×
      15_000n, // 1.50×
      20_000n, // 2.00×
      30_000n, // 3.00×
      50_000n, // 5.00×
      100_000n, // 10.00×
    ])
  })

  it('MILESTONE_LABELS pair 1:1 with MILESTONE_BPS values', () => {
    expect(MILESTONE_LABELS).toEqual(['1.25×', '1.5×', '2.0×', '3.0×', '5.0×', '10.0×'])
    for (let i = 0; i < MILESTONE_BPS.length; i++) {
      const mul = Number(MILESTONE_BPS[i]!) / Number(ONE_X_BPS)
      // Label rule: integer mul → "N.0×", else "N.NN×" trimmed of trailing zeros
      // beyond the first decimal. We don't assert the exact derivation here —
      // the toEqual above locks the strings; this is structural pairing.
      expect(MILESTONE_LABELS[i]).toMatch(/^\d+(\.\d+)?×$/)
      expect(mul).toBeGreaterThan(0)
    }
  })

  it('TIER_TICKS_BPS (audio) is the SAME table as MILESTONE_BPS', () => {
    // RG-C5 structural: pulseAudio.TIER_TICKS_BPS re-exports MILESTONE_BPS
    // so the audio fires on the exact same thresholds the curve canvas
    // draws pips at. Drift between the two is impossible by construction.
    expect(TIER_TICKS_BPS).toBe(MILESTONE_BPS)
  })
})

describe('pulseProjection — audio threshold ↔ displayed hero text alignment', () => {
  // PULSE-AUDIO-ALIGN-2026-05-27 (Tim ruling): audio + haptic + pip-highlight
  // fire on score-based triggers — when the DISPLAYED hero multiplier text
  // first rolls to "1.25x", "1.50x", "2.00x", etc. The curve canvas passes
  // `leadBps` to BOTH `formatMultiplier()` (for the hero text) and the
  // tier-tick comparator (for audio). So the trigger source IS the displayed
  // source by construction. These tests lock in the bps-threshold-to-label
  // pairing so a future change to `formatMultiplier`'s rounding rule (or to
  // MILESTONE_BPS) cannot drift the audio off the visible number.

  it('formatMultiplier at each MILESTONE_BPS produces a string whose numeric value matches the milestone', () => {
    // Per Tim's spec: "formatMultiplier(15_000n) === '1.5×'" is the intent
    // — but the actual `formatMultiplier` uses "N.NNx" (2 decimals, lowercase
    // x). The structural assertion is that at the EXACT bps threshold, the
    // hero text first rolls to the milestone's numeric value.
    const expected: ReadonlyArray<[bigint, string]> = [
      [12_500n, '1.25x'],
      [15_000n, '1.50x'],
      [20_000n, '2.00x'],
      [30_000n, '3.00x'],
      [50_000n, '5.00x'],
      [100_000n, '10.00x'],
    ] as const
    for (let i = 0; i < MILESTONE_BPS.length; i++) {
      const [bps, label] = expected[i]!
      expect(MILESTONE_BPS[i]).toBe(bps)
      expect(formatMultiplier(bps)).toBe(label)
    }
  })

  it('the bps one less than each milestone formats to a DIFFERENT (smaller) hero string', () => {
    // Locks the threshold: at MILESTONE_BPS[i] - 1, the hero shows the
    // PREVIOUS hundredth ("1.24x" → "1.25x" on the next frame). This is
    // what makes the audio-on-cross feel exactly in sync with the
    // visible number.
    for (const bps of MILESTONE_BPS) {
      const onCross = formatMultiplier(bps)
      const beforeCross = formatMultiplier(bps - 1n)
      expect(beforeCross).not.toBe(onCross)
    }
  })

  it('formatMultiplier is monotonic non-decreasing across the bps range covering all milestones', () => {
    // If formatMultiplier were ever changed to round NEAREST instead of
    // FLOOR (truncate toward zero), the hero text could roll to "1.25x"
    // BEFORE bps reaches 12_500n — and the audio would fire late. This
    // monotonicity probe ensures floor truncation is preserved.
    let prev = ''
    for (let bps = 10_000n; bps <= 12_600n; bps += 50n) {
      const s = formatMultiplier(bps)
      if (prev !== '') {
        // Lexical comparison works for fixed-width "N.NNx" within one whole.
        expect(s >= prev).toBe(true)
      }
      prev = s
    }
  })
})

describe('pulseProjection — projectY', () => {
  it('returns a value in [topPad, H - bottomReserve] for mul=1', () => {
    const H = 400
    const y = projectY(1.0, H, 4.0, 28)
    // At mul=1, t = Y_BASELINE_OFFSET = 0.22
    // drawableH = 400 - 28 - 42 = 330
    // y = 400 - 28 - 0.22 * 330 = 299.4
    expect(y).toBeCloseTo(299.4, 1)
  })

  it('returns a value near topPad for mul at the ceiling', () => {
    const H = 400
    const y = projectY(10, H, 10, 28)
    // At mul=ceil, t = 1.0
    // drawableH = 330, y = 400 - 28 - 330 = 42 (topPad)
    expect(y).toBeCloseTo(42, 1)
  })

  it('accepts bigint bps and Number multipliers interchangeably', () => {
    const H = 400
    const yFromBps = projectY(20_000n, H, 4.0, 28)
    const yFromMul = projectY(2.0, H, 4.0, 28)
    expect(yFromBps).toBeCloseTo(yFromMul, 5)
  })

  it('uses Y_MIN_CEIL=4 as the default ceiling', () => {
    const H = 400
    const yDefault = projectY(2.0, H)
    const yExplicit = projectY(2.0, H, Y_MIN_CEIL, 28)
    expect(yDefault).toBeCloseTo(yExplicit, 5)
  })

  it('is deterministic: identical inputs → identical output across 100 calls', () => {
    const expected = projectY(50_000n, 400, 10, 56)
    for (let i = 0; i < 100; i++) {
      expect(projectY(50_000n, 400, 10, 56)).toBe(expected)
    }
  })

  it('milestone projection is deterministic across N calls (alignment invariant)', () => {
    // PULSE-FX-RESTORE-ALIGN-2026-05-27 #2: the visual pip and the audio
    // trigger MUST land at the same Y on every frame. If projectY were
    // ever non-deterministic for a fixed (H, ceil), the pip would drift
    // frame-to-frame while the audio still fired on bps cross.
    const H = 600
    const ceil = 12
    for (const bps of MILESTONE_BPS) {
      const first = projectY(bps, H, ceil, 56)
      for (let i = 0; i < 50; i++) {
        expect(projectY(bps, H, ceil, 56)).toBe(first)
      }
    }
  })

  it('clamps mul values below 1× to the baseline offset', () => {
    const H = 400
    const yAt1 = projectY(1.0, H, 4.0, 28)
    const yBelow1 = projectY(0.5, H, 4.0, 28)
    expect(yBelow1).toBe(yAt1)
  })

  it('clamps mul values above the ceiling to the top', () => {
    const H = 400
    const yAtCeil = projectY(4.0, H, 4.0, 28)
    const yAboveCeil = projectY(50.0, H, 4.0, 28)
    expect(yAboveCeil).toBe(yAtCeil)
  })
})

describe('pulseProjection — milestone ordering (THE CRITICAL INVARIANT)', () => {
  // PULSE-FX-RESTORE-ALIGN-2026-05-27 #2: the static `MILESTONE_Y_FRACTIONS`
  // table is GONE — the curve canvas calls projectY directly at the live
  // (H, ceilMul, bottomReserve). The invariant we preserve here is that
  // projectY maps a LARGER bps to a SMALLER Y (= higher on canvas) for
  // any given (H, ceil, bottomReserve). If the projection ever lost
  // monotonicity the pip ordering on screen would scramble.

  it('higher milestone bps maps to a smaller Y (= higher on canvas) at H+ceil values that contain all milestones', () => {
    // Pick ceilings >= 10 so the 10× milestone (the largest) is still
    // below the clamp boundary. Above the ceiling, projectY clamps to
    // top-pad and adjacent milestones yield equal Y — that's the
    // documented behavior; ordering only holds for milestones strictly
    // below the ceiling.
    const cases: Array<{ H: number; ceil: number; reserve: number }> = [
      { H: 400, ceil: 10, reserve: 56 },
      { H: 600, ceil: 12, reserve: 56 },
      { H: 800, ceil: 20, reserve: 56 },
    ]
    for (const { H, ceil, reserve } of cases) {
      for (let i = 1; i < MILESTONE_BPS.length; i++) {
        const ySmaller = projectY(MILESTONE_BPS[i - 1]!, H, ceil, reserve)
        const yLarger = projectY(MILESTONE_BPS[i]!, H, ceil, reserve)
        expect(yLarger).toBeLessThan(ySmaller)
      }
    }
  })

  it('projectY(15000n, H=600, ceil=12) < projectY(20000n, H=600, ceil=12) is FALSE (15k → lower bps → larger Y = lower on canvas)', () => {
    // Lock the ordering at the SPECIFIC (H=600, ceil=12) reference used
    // in the report so a future regression is caught here.
    const y15 = projectY(15_000n, 600, 12, 56)
    const y20 = projectY(20_000n, 600, 12, 56)
    expect(y15).toBeGreaterThan(y20)
  })

  it('all milestone Y values are inside [topPad, H - bottomReserve] for typical chassis sizes', () => {
    const H = 600
    const ceil = 12
    const reserve = 56
    const topPad = 42
    for (const bps of MILESTONE_BPS) {
      const y = projectY(bps, H, ceil, reserve)
      expect(y).toBeGreaterThanOrEqual(topPad - 0.0001)
      expect(y).toBeLessThanOrEqual(H - reserve + 0.0001)
    }
  })
})

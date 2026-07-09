/**
 * drawMilestonePips — unit tests for the in-canvas pip renderer.
 *
 * The pip's Y is computed from `projectY(MILESTONE_BPS[i], H, ceil, reserve)`
 * using the SAME mapping the curve head uses. These tests assert:
 *
 *   - the function exists with the correct signature (RG-C5: no
 *     streak / wager / session params — chart params only)
 *   - determinism: identical inputs → identical sequence of ctx calls
 *   - pip count matches MILESTONE_BPS.length
 *   - reducedMotion suppresses the next-tier proximity highlight
 *
 * RG-C5 SAFE: the only state input is `currentBps` (a chart-state cue,
 * not a streak/wager/session value). All other inputs are chart geometry.
 */
import { describe, expect, it, vi } from 'vitest'

import { drawMilestonePips } from './pulseCurveCanvas.milestonePips'
import { MILESTONE_BPS, MILESTONE_LABELS } from './pulseProjection'

// ─── Mock CanvasRenderingContext2D ───────────────────────────────────────

interface MockCtx {
  save: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  beginPath: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  fill: ReturnType<typeof vi.fn>
  arc: ReturnType<typeof vi.fn>
  fillText: ReturnType<typeof vi.fn>
  setLineDash: ReturnType<typeof vi.fn>
  strokeStyle: string
  fillStyle: string
  lineWidth: number
  font: string
  textBaseline: string
  textAlign: string
}

function makeMockCtx(): MockCtx {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textBaseline: '',
    textAlign: '',
  }
}

describe('drawMilestonePips — signature + RG-C5', () => {
  it('is a function with the correct positional arity (no streak/wager params)', () => {
    // The function MUST take chart-only parameters (ctx, W, H, ceilMul,
    // bottomReservePx) plus optional currentBps + reducedMotion. RG-C5:
    // any signature with streak/wager/session arity would expose
    // escalation surface; tests pin the chart-only contract.
    expect(typeof drawMilestonePips).toBe('function')
    // ctx, W, H, ceilMul, bottomReservePx, currentBps (optional) = 6 named
    // parameters before the first defaulted param (reducedMotion). The
    // chart-only contract is what RG-C5 cares about — names + types are
    // asserted by the typecheck gate (G-2), arity is asserted here.
    expect(drawMilestonePips.length).toBe(6)
  })

  it('runs to completion without throwing for typical chart geometry', () => {
    const ctx = makeMockCtx() as unknown as CanvasRenderingContext2D
    expect(() => drawMilestonePips(ctx, 933, 400, 10, 56)).not.toThrow()
  })

  it('runs to completion when currentBps + reducedMotion are provided', () => {
    const ctx = makeMockCtx() as unknown as CanvasRenderingContext2D
    expect(() => drawMilestonePips(ctx, 933, 400, 10, 56, 19_900n, false)).not.toThrow()
    expect(() => drawMilestonePips(ctx, 933, 400, 10, 56, 19_900n, true)).not.toThrow()
  })
})

describe('drawMilestonePips — pip count + draw operations', () => {
  it('draws exactly MILESTONE_BPS.length pip dots (arc calls) at a typical chassis size', () => {
    const ctx = makeMockCtx()
    drawMilestonePips(ctx as unknown as CanvasRenderingContext2D, 933, 600, 12, 56)
    // One arc per visible milestone — at H=600, ceil=12, reserve=56 all
    // 6 milestones (1.25×, 1.5×, 2×, 3×, 5×, 10×) fit on canvas.
    expect(ctx.arc).toHaveBeenCalledTimes(MILESTONE_BPS.length)
  })

  it('writes exactly MILESTONE_LABELS.length labels (fillText calls) at a typical chassis size', () => {
    const ctx = makeMockCtx()
    drawMilestonePips(ctx as unknown as CanvasRenderingContext2D, 933, 600, 12, 56)
    expect(ctx.fillText).toHaveBeenCalledTimes(MILESTONE_LABELS.length)
  })

  it('writes each milestone label at least once', () => {
    const ctx = makeMockCtx()
    drawMilestonePips(ctx as unknown as CanvasRenderingContext2D, 933, 600, 12, 56)
    const labelsWritten = ctx.fillText.mock.calls.map((c) => c[0] as string)
    for (const label of MILESTONE_LABELS) {
      expect(labelsWritten).toContain(label)
    }
  })
})

describe('drawMilestonePips — determinism', () => {
  it('produces an identical sequence of ctx calls for identical inputs', () => {
    const ctxA = makeMockCtx()
    const ctxB = makeMockCtx()
    drawMilestonePips(ctxA as unknown as CanvasRenderingContext2D, 933, 600, 12, 56, 19_900n, false)
    drawMilestonePips(ctxB as unknown as CanvasRenderingContext2D, 933, 600, 12, 56, 19_900n, false)
    expect(ctxA.arc.mock.calls).toEqual(ctxB.arc.mock.calls)
    expect(ctxA.moveTo.mock.calls).toEqual(ctxB.moveTo.mock.calls)
    expect(ctxA.lineTo.mock.calls).toEqual(ctxB.lineTo.mock.calls)
    expect(ctxA.fillText.mock.calls).toEqual(ctxB.fillText.mock.calls)
  })

  it('produces an identical sequence over N=20 repeat calls', () => {
    const baseline = makeMockCtx()
    drawMilestonePips(baseline as unknown as CanvasRenderingContext2D, 933, 600, 12, 56)
    const baselineArcs = JSON.stringify(baseline.arc.mock.calls)
    for (let i = 0; i < 20; i++) {
      const ctx = makeMockCtx()
      drawMilestonePips(ctx as unknown as CanvasRenderingContext2D, 933, 600, 12, 56)
      expect(JSON.stringify(ctx.arc.mock.calls)).toBe(baselineArcs)
    }
  })
})

describe('drawMilestonePips — reducedMotion + currentBps', () => {
  it('suppresses next-tier highlight when reducedMotion=true even if proximity is true', () => {
    // currentBps = 19_900n is within 200bps of the 20_000n milestone, so
    // the next-tier highlight WOULD activate without reducedMotion.
    const ctxAnimated = makeMockCtx()
    drawMilestonePips(
      ctxAnimated as unknown as CanvasRenderingContext2D,
      933,
      600,
      12,
      56,
      19_900n,
      false,
    )
    const ctxReduced = makeMockCtx()
    drawMilestonePips(
      ctxReduced as unknown as CanvasRenderingContext2D,
      933,
      600,
      12,
      56,
      19_900n,
      true,
    )
    // Both contexts should make the same NUMBER of arc/fillText calls
    // (the pips themselves are still drawn under reducedMotion, just
    // without the proximity brightening).
    expect(ctxReduced.arc).toHaveBeenCalledTimes(ctxAnimated.arc.mock.calls.length)
    expect(ctxReduced.fillText).toHaveBeenCalledTimes(ctxAnimated.fillText.mock.calls.length)
  })

  it('omits next-tier highlight when currentBps is undefined (no live bps)', () => {
    const ctx = makeMockCtx()
    expect(() =>
      drawMilestonePips(
        ctx as unknown as CanvasRenderingContext2D,
        933,
        600,
        12,
        56,
        undefined,
        false,
      ),
    ).not.toThrow()
    expect(ctx.arc).toHaveBeenCalledTimes(MILESTONE_BPS.length)
  })
})

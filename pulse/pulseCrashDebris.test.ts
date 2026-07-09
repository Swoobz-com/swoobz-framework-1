/**
 * pulseCrashDebris — deterministic burst tests.
 *
 * PULSE-FX-RESTORE-2026-05-27 fix 2. Asserts:
 *   - Single-shot: nothing renders before t=0 or after the lifetime.
 *   - Deterministic: same seed → same fragment positions across replays.
 *   - Bounded: exactly CRASH_DEBRIS_COUNT fragments rendered (one arc()
 *     per fragment + a save/restore pair).
 *   - RG-C5 structural: every consumed constant is module-level — no
 *     streak / wager / session parameter on the signature.
 *   - Cool-only palette (no warm tokens — Tim 2026-05-25 hard NO).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  CRASH_DEBRIS_COUNT,
  CRASH_DEBRIS_LIFETIME_MS,
  CRASH_DEBRIS_PALETTE,
  CRASH_DEBRIS_SPEED_PX_PER_MS,
  drawCrashDebris,
  seededRandom,
} from './pulseCrashDebris'

interface FillCall {
  readonly x: number
  readonly y: number
  readonly radius: number
}

interface MockCtxBundle {
  readonly ctx: CanvasRenderingContext2D
  readonly arcs: FillCall[]
  readonly fillStyles: string[]
  readonly counters: { saves: number; restores: number }
}

function makeMockCtx(): MockCtxBundle {
  const arcs: FillCall[] = []
  const fillStyles: string[] = []
  const counters = { saves: 0, restores: 0 }
  let _fillStyle = ''
  // Minimum-viable mock — covers only the API drawCrashDebris uses.
  const ctx = {
    save: vi.fn(() => {
      counters.saves++
    }),
    restore: vi.fn(() => {
      counters.restores++
    }),
    beginPath: vi.fn(),
    arc: vi.fn((x: number, y: number, radius: number) => {
      arcs.push({ x, y, radius })
    }),
    fill: vi.fn(() => {
      fillStyles.push(_fillStyle)
    }),
    get fillStyle(): string {
      return _fillStyle
    },
    set fillStyle(v: string) {
      _fillStyle = v
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, arcs, fillStyles, counters }
}

describe('pulseCrashDebris — module constants (RG-C5 structural)', () => {
  it('CRASH_DEBRIS_COUNT is fixed at 16 (between 12-20 per spec)', () => {
    expect(CRASH_DEBRIS_COUNT).toBe(16)
    expect(CRASH_DEBRIS_COUNT).toBeGreaterThanOrEqual(12)
    expect(CRASH_DEBRIS_COUNT).toBeLessThanOrEqual(20)
  })

  it('CRASH_DEBRIS_LIFETIME_MS is fixed at 700 (≤700 per spec)', () => {
    expect(CRASH_DEBRIS_LIFETIME_MS).toBe(700)
    expect(CRASH_DEBRIS_LIFETIME_MS).toBeLessThanOrEqual(700)
  })

  it('CRASH_DEBRIS_SPEED_PX_PER_MS is fixed at 0.28', () => {
    expect(CRASH_DEBRIS_SPEED_PX_PER_MS).toBe(0.28)
  })

  it('CRASH_DEBRIS_PALETTE is cool-only (cyan + white + crash coral) — no warm tokens', () => {
    expect(CRASH_DEBRIS_PALETTE).toHaveLength(3)
    expect(CRASH_DEBRIS_PALETTE).toEqual([
      'rgba(0,240,255,', // cyan
      'rgba(255,255,255,', // white
      'rgba(255,65,53,', // DS blood crash
    ])
    // Hard NO on gold/brass/amber/parchment per Tim 2026-05-25.
    for (const color of CRASH_DEBRIS_PALETTE) {
      expect(color.toLowerCase()).not.toMatch(/gold|brass|amber|parchment|wood|cream/)
    }
  })
})

describe('pulseCrashDebris — seededRandom (RG-C1 determinism)', () => {
  it('produces the same sequence for the same seed', () => {
    const r1 = seededRandom(42)
    const r2 = seededRandom(42)
    for (let i = 0; i < 20; i++) {
      expect(r1()).toBe(r2())
    }
  })

  it('produces different sequences for different seeds', () => {
    const r1 = seededRandom(42)
    const r2 = seededRandom(43)
    // Not guaranteed by definition, but vanishingly unlikely to collide
    // for the first 10 outputs.
    let diffs = 0
    for (let i = 0; i < 10; i++) {
      if (r1() !== r2()) diffs++
    }
    expect(diffs).toBeGreaterThan(0)
  })

  it('outputs are in [0, 1)', () => {
    const r = seededRandom(12345)
    for (let i = 0; i < 100; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('pulseCrashDebris — drawCrashDebris', () => {
  it('paints nothing before the burst starts (elapsed < 0)', () => {
    const { ctx, arcs } = makeMockCtx()
    drawCrashDebris(ctx, 800, 400, -10, 12345, { x: 200, y: 200 })
    expect(arcs).toHaveLength(0)
  })

  it('paints nothing after the lifetime expires (elapsed >= CRASH_DEBRIS_LIFETIME_MS)', () => {
    const { ctx, arcs } = makeMockCtx()
    drawCrashDebris(ctx, 800, 400, CRASH_DEBRIS_LIFETIME_MS, 12345, { x: 200, y: 200 })
    expect(arcs).toHaveLength(0)
    drawCrashDebris(ctx, 800, 400, 5000, 12345, { x: 200, y: 200 })
    expect(arcs).toHaveLength(0)
  })

  it('paints CRASH_DEBRIS_COUNT fragments at burst start', () => {
    const { ctx, arcs } = makeMockCtx()
    // Use elapsed=1ms so fragments haven't moved off-canvas yet.
    drawCrashDebris(ctx, 800, 400, 1, 12345, { x: 400, y: 200 })
    expect(arcs.length).toBe(CRASH_DEBRIS_COUNT)
  })

  it('is deterministic — same (seed, elapsed, origin) → same arcs across replays', () => {
    const a = makeMockCtx()
    const b = makeMockCtx()
    drawCrashDebris(a.ctx, 800, 400, 200, 99, { x: 400, y: 200 })
    drawCrashDebris(b.ctx, 800, 400, 200, 99, { x: 400, y: 200 })
    expect(a.arcs.length).toBe(b.arcs.length)
    for (let i = 0; i < a.arcs.length; i++) {
      expect(a.arcs[i]!.x).toBe(b.arcs[i]!.x)
      expect(a.arcs[i]!.y).toBe(b.arcs[i]!.y)
      expect(a.arcs[i]!.radius).toBe(b.arcs[i]!.radius)
    }
  })

  it('different seeds produce different fragment layouts', () => {
    const a = makeMockCtx()
    const b = makeMockCtx()
    drawCrashDebris(a.ctx, 800, 400, 100, 1, { x: 400, y: 200 })
    drawCrashDebris(b.ctx, 800, 400, 100, 999, { x: 400, y: 200 })
    // Fragment positions should differ — vanishingly unlikely to match
    let differences = 0
    for (let i = 0; i < Math.min(a.arcs.length, b.arcs.length); i++) {
      if (a.arcs[i]!.x !== b.arcs[i]!.x || a.arcs[i]!.y !== b.arcs[i]!.y) {
        differences++
      }
    }
    expect(differences).toBeGreaterThan(0)
  })

  it('fragments only use the cool-only palette (cyan / white / crash coral)', () => {
    const { ctx, fillStyles } = makeMockCtx()
    drawCrashDebris(ctx, 800, 400, 50, 12345, { x: 400, y: 200 })
    for (const style of fillStyles) {
      const matchesPalette = CRASH_DEBRIS_PALETTE.some((prefix) => style.startsWith(prefix))
      expect(matchesPalette).toBe(true)
    }
  })

  it('save() and restore() are called exactly once (no orphaned canvas state)', () => {
    const ctxObj = makeMockCtx()
    drawCrashDebris(ctxObj.ctx, 800, 400, 100, 12345, { x: 400, y: 200 })
    expect(ctxObj.counters.saves).toBe(1)
    expect(ctxObj.counters.restores).toBe(1)
  })

  it('fragments fade over the lifetime (alpha decreases monotonically)', () => {
    const early = makeMockCtx()
    const late = makeMockCtx()
    drawCrashDebris(early.ctx, 800, 400, 50, 12345, { x: 400, y: 200 })
    drawCrashDebris(late.ctx, 800, 400, 600, 12345, { x: 400, y: 200 })
    // Extract alpha from the last fillStyle of each (format ends with "<alpha>)")
    const earlyAlpha = parseFloat(
      early.fillStyles[0]!.slice(early.fillStyles[0]!.lastIndexOf(',') + 1, -1),
    )
    const lateAlpha = parseFloat(
      late.fillStyles[0]!.slice(late.fillStyles[0]!.lastIndexOf(',') + 1, -1),
    )
    expect(lateAlpha).toBeLessThan(earlyAlpha)
  })

  it('signature accepts ONLY (ctx, W, H, elapsed, seed, origin) — no streak/wager (RG-C5)', () => {
    // Compile-time guarantee — exercised by TypeScript strict mode. This
    // runtime check asserts the function arity (6 positional params).
    expect(drawCrashDebris.length).toBe(6)
  })
})

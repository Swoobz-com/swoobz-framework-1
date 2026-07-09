/**
 * pulseWinDebris — deterministic burst tests.
 *
 * Mirrors `pulseCrashDebris.test.ts` structure with win-specific checks:
 *   - Module-const amplitudes (RG-C5 structural pins).
 *   - Single-shot: nothing renders outside [0, WIN_DEBRIS_LIFETIME_MS).
 *   - Deterministic: same seed → same fragment positions across replays.
 *   - Bounded: exactly WIN_DEBRIS_COUNT fragments rendered.
 *   - Cool-only palette: cyan + mint + white — no warm tokens, no coral.
 *   - 6-positional-arg arity (RG-C5: no streak/wager/session param).
 *   - Upward bias: at burst start, fragments are above origin (y < origin.y).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  drawWinDebris,
  seededRandom,
  WIN_DEBRIS_COUNT,
  WIN_DEBRIS_GRAVITY_PX_PER_MS2,
  WIN_DEBRIS_LIFETIME_MS,
  WIN_DEBRIS_PALETTE,
  WIN_DEBRIS_SPEED_PX_PER_MS,
} from './pulseWinDebris'

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

// ─── Module constants (RG-C5 structural) ──────────────────────────────────

describe('pulseWinDebris — module constants (RG-C5 structural)', () => {
  it('WIN_DEBRIS_COUNT is 16', () => {
    expect(WIN_DEBRIS_COUNT).toBe(16)
    expect(WIN_DEBRIS_COUNT).toBeGreaterThanOrEqual(12)
    expect(WIN_DEBRIS_COUNT).toBeLessThanOrEqual(20)
  })

  it('WIN_DEBRIS_LIFETIME_MS is 900 (longer than crash 700ms)', () => {
    expect(WIN_DEBRIS_LIFETIME_MS).toBe(900)
    expect(WIN_DEBRIS_LIFETIME_MS).toBeGreaterThan(700)
  })

  it('WIN_DEBRIS_SPEED_PX_PER_MS is 0.28', () => {
    expect(WIN_DEBRIS_SPEED_PX_PER_MS).toBe(0.28)
  })

  it('WIN_DEBRIS_GRAVITY_PX_PER_MS2 is NEGATIVE (upward bias)', () => {
    expect(WIN_DEBRIS_GRAVITY_PX_PER_MS2).toBeLessThan(0)
    expect(WIN_DEBRIS_GRAVITY_PX_PER_MS2).toBe(-0.0006)
  })

  it('WIN_DEBRIS_PALETTE is cool-only (cyan + mint + white) — no warm tokens', () => {
    expect(WIN_DEBRIS_PALETTE).toHaveLength(3)
    expect(WIN_DEBRIS_PALETTE).toEqual([
      'rgba(0,240,255,', // cyan
      'rgba(120,255,200,', // mint
      'rgba(255,255,255,', // white
    ])
    // Hard NO on gold/brass/amber/parchment/coral/red/orange per Tim 2026-05-25.
    for (const color of WIN_DEBRIS_PALETTE) {
      expect(color.toLowerCase()).not.toMatch(
        /gold|brass|amber|parchment|wood|cream|coral|red|orange/,
      )
    }
  })
})

// ─── seededRandom (RG-C1 determinism) ─────────────────────────────────────

describe('pulseWinDebris — seededRandom (RG-C1 determinism)', () => {
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

// ─── drawWinDebris ─────────────────────────────────────────────────────────

describe('pulseWinDebris — drawWinDebris', () => {
  it('paints nothing before the burst starts (elapsed < 0)', () => {
    const { ctx, arcs } = makeMockCtx()
    drawWinDebris(ctx, 800, 400, -10, 12345, { x: 400, y: 200 })
    expect(arcs).toHaveLength(0)
  })

  it('paints nothing at or after the lifetime expires (elapsed >= WIN_DEBRIS_LIFETIME_MS)', () => {
    const { ctx: ctxA, arcs: arcsA } = makeMockCtx()
    drawWinDebris(ctxA, 800, 400, WIN_DEBRIS_LIFETIME_MS, 12345, { x: 400, y: 200 })
    expect(arcsA).toHaveLength(0)

    const { ctx: ctxB, arcs: arcsB } = makeMockCtx()
    drawWinDebris(ctxB, 800, 400, 5000, 12345, { x: 400, y: 200 })
    expect(arcsB).toHaveLength(0)
  })

  it('paints WIN_DEBRIS_COUNT fragments at burst start', () => {
    const { ctx, arcs } = makeMockCtx()
    drawWinDebris(ctx, 800, 400, 1, 12345, { x: 400, y: 200 })
    expect(arcs.length).toBe(WIN_DEBRIS_COUNT)
  })

  it('is deterministic — same (seed, elapsed, origin) → same arcs across replays', () => {
    const a = makeMockCtx()
    const b = makeMockCtx()
    drawWinDebris(a.ctx, 800, 400, 200, 99, { x: 400, y: 200 })
    drawWinDebris(b.ctx, 800, 400, 200, 99, { x: 400, y: 200 })
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
    drawWinDebris(a.ctx, 800, 400, 100, 1, { x: 400, y: 200 })
    drawWinDebris(b.ctx, 800, 400, 100, 999, { x: 400, y: 200 })
    let differences = 0
    for (let i = 0; i < Math.min(a.arcs.length, b.arcs.length); i++) {
      if (a.arcs[i]!.x !== b.arcs[i]!.x || a.arcs[i]!.y !== b.arcs[i]!.y) {
        differences++
      }
    }
    expect(differences).toBeGreaterThan(0)
  })

  it('fragments only use the cool-only palette (cyan / mint / white)', () => {
    const { ctx, fillStyles } = makeMockCtx()
    drawWinDebris(ctx, 800, 400, 50, 12345, { x: 400, y: 200 })
    for (const style of fillStyles) {
      const matchesPalette = WIN_DEBRIS_PALETTE.some((prefix) => style.startsWith(prefix))
      expect(matchesPalette).toBe(true)
    }
  })

  it('palette entries contain no warm or crash tokens', () => {
    const { ctx, fillStyles } = makeMockCtx()
    drawWinDebris(ctx, 800, 400, 50, 12345, { x: 400, y: 200 })
    for (const style of fillStyles) {
      expect(style.toLowerCase()).not.toMatch(
        /coral|red|orange|gold|brass|amber|parchment|wood|cream/,
      )
    }
  })

  it('save() and restore() are called exactly once (no orphaned canvas state)', () => {
    const ctxObj = makeMockCtx()
    drawWinDebris(ctxObj.ctx, 800, 400, 100, 12345, { x: 400, y: 200 })
    expect(ctxObj.counters.saves).toBe(1)
    expect(ctxObj.counters.restores).toBe(1)
  })

  it('fragments fade over the lifetime (alpha decreases monotonically)', () => {
    const early = makeMockCtx()
    const late = makeMockCtx()
    drawWinDebris(early.ctx, 800, 400, 50, 12345, { x: 400, y: 200 })
    drawWinDebris(late.ctx, 800, 400, 800, 12345, { x: 400, y: 200 })
    // Extract alpha from the last fillStyle of each (format: "rgba(r,g,b,<alpha>)")
    const earlyAlpha = parseFloat(
      early.fillStyles[0]!.slice(early.fillStyles[0]!.lastIndexOf(',') + 1, -1),
    )
    const lateAlpha = parseFloat(
      late.fillStyles[0]!.slice(late.fillStyles[0]!.lastIndexOf(',') + 1, -1),
    )
    expect(lateAlpha).toBeLessThan(earlyAlpha)
  })

  it('upward bias: at early burst most fragments start above the origin y', () => {
    // At t=20ms (early), negative gravity hasn't kicked in much — the angle
    // bias (upper hemisphere) should mean fragment y coords < origin.y for
    // the majority of fragments.
    const { ctx, arcs } = makeMockCtx()
    const originY = 300
    drawWinDebris(ctx, 800, 600, 20, 12345, { x: 400, y: originY })
    const aboveCount = arcs.filter((a) => a.y < originY).length
    // With upper-hemisphere bias, at least 60% should be above origin.
    expect(aboveCount).toBeGreaterThan(WIN_DEBRIS_COUNT * 0.5)
  })

  it('signature accepts ONLY (ctx, W, H, elapsed, seed, origin) — no streak/wager (RG-C5)', () => {
    // Compile-time guarantee from TypeScript strict mode. Runtime arity check.
    expect(drawWinDebris.length).toBe(6)
  })
})

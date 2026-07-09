/**
 * ooReiLayout.test.ts — unit tests for the responsive-interface-plan layout system.
 *
 * Responsive-interface-plan 2026-05-31 Move 1+2+3+4.
 * Verifies:
 *   - SP token values
 *   - classifyTier thresholds
 *   - ZONE_HEIGHTS per tier
 *   - coachmarkClearancePx derivation
 *   - modalCardWidth tier outputs
 *   - railHeightForTier
 *   - LAYOUT_CONFIG structure validity
 */

import { describe, it, expect } from 'vitest'
import {
  SP,
  classifyTier,
  ZONE_HEIGHTS,
  coachmarkClearancePx,
  modalCardWidth,
  railHeightForTier,
  LAYOUT_CONFIG,
  BP,
  type LayoutTier,
} from './ooReiLayout'

describe('SP (spacing scale)', () => {
  it('has 7 tokens with correct values', () => {
    expect(SP[2]).toBe(2)
    expect(SP[4]).toBe(4)
    expect(SP[8]).toBe(8)
    expect(SP[12]).toBe(12)
    expect(SP[16]).toBe(16)
    expect(SP[24]).toBe(24)
    expect(SP[32]).toBe(32)
  })

  it('tokens are ascending', () => {
    const values = [SP[2], SP[4], SP[8], SP[12], SP[16], SP[24], SP[32]]
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]!)
    }
  })
})

describe('classifyTier', () => {
  it('xs: 0-480', () => {
    expect(classifyTier(0)).toBe('xs')
    expect(classifyTier(320)).toBe('xs')
    expect(classifyTier(480)).toBe('xs')
    expect(classifyTier(390)).toBe('xs')  // iPhone 14 Pro
    expect(classifyTier(412)).toBe('xs')  // Pixel 7
  })

  it('sm: 481-767', () => {
    expect(classifyTier(481)).toBe('sm')
    expect(classifyTier(600)).toBe('sm')
    expect(classifyTier(767)).toBe('sm')
  })

  it('md: 768-1023', () => {
    expect(classifyTier(768)).toBe('md')
    expect(classifyTier(834)).toBe('md')  // iPad Mini
    expect(classifyTier(1023)).toBe('md')
  })

  it('lg: 1024+', () => {
    expect(classifyTier(1024)).toBe('lg')
    expect(classifyTier(1280)).toBe('lg')
    expect(classifyTier(1440)).toBe('lg')
    expect(classifyTier(1920)).toBe('lg')
    expect(classifyTier(2560)).toBe('lg')
  })

  it('respects exact boundary values (xs/sm boundary is 481)', () => {
    expect(classifyTier(BP.SM_MIN - 1)).toBe('xs')
    expect(classifyTier(BP.SM_MIN)).toBe('sm')
    expect(classifyTier(BP.MD_MIN - 1)).toBe('sm')
    expect(classifyTier(BP.MD_MIN)).toBe('md')
    expect(classifyTier(BP.LG_MIN - 1)).toBe('md')
    expect(classifyTier(BP.LG_MIN)).toBe('lg')
  })
})

describe('ZONE_HEIGHTS', () => {
  it('xs and sm have identical zone heights (200px rail)', () => {
    expect(ZONE_HEIGHTS.xs.railH).toBe(200)
    expect(ZONE_HEIGHTS.sm.railH).toBe(200)
    expect(ZONE_HEIGHTS.xs.headerH).toBe(56)
    expect(ZONE_HEIGHTS.sm.headerH).toBe(56)
  })

  it('md uses the 200px 2-row stacked rail (single-row clipped its controls)', () => {
    expect(ZONE_HEIGHTS.md.railH).toBe(200)
    expect(ZONE_HEIGHTS.md.headerH).toBe(60)
  })

  it('lg has 208px rail (single-row, wider)', () => {
    expect(ZONE_HEIGHTS.lg.railH).toBe(208)
    expect(ZONE_HEIGHTS.lg.headerH).toBe(64)
  })

  it('rail heights are all below 30% of typical viewport heights', () => {
    // Chassis rule: rail < 30% vh
    const viewports: Record<LayoutTier, number> = { xs: 844, sm: 800, md: 900, lg: 900 }
    const tiers: LayoutTier[] = ['xs', 'sm', 'md', 'lg']
    for (const tier of tiers) {
      const ratio = ZONE_HEIGHTS[tier].railH / viewports[tier]
      expect(ratio).toBeLessThan(0.30)
    }
  })
})

describe('railHeightForTier', () => {
  it('returns correct rail height for each tier', () => {
    expect(railHeightForTier('xs')).toBe(200)
    expect(railHeightForTier('sm')).toBe(200)
    expect(railHeightForTier('md')).toBe(200)
    expect(railHeightForTier('lg')).toBe(208)
  })
})

describe('coachmarkClearancePx', () => {
  it('equals railH + SP[12] (12px)', () => {
    const tiers: LayoutTier[] = ['xs', 'sm', 'md', 'lg']
    for (const tier of tiers) {
      expect(coachmarkClearancePx(tier)).toBe(ZONE_HEIGHTS[tier].railH + 12)
    }
  })

  it('xs: 200 + 12 = 212 (replaces hardcoded 220px)', () => {
    expect(coachmarkClearancePx('xs')).toBe(212)
  })

  it('lg: 208 + 12 = 220 (matches old hardcoded 220px at desktop)', () => {
    expect(coachmarkClearancePx('lg')).toBe(220)
  })
})

describe('modalCardWidth', () => {
  it('xs/sm use 560px cap with 32px gutters', () => {
    expect(modalCardWidth('xs')).toContain('560px')
    expect(modalCardWidth('xs')).toContain('32px')
    expect(modalCardWidth('sm')).toContain('560px')
  })

  it('md/lg use 640px cap with 64px gutters', () => {
    expect(modalCardWidth('md')).toContain('640px')
    expect(modalCardWidth('lg')).toContain('640px')
  })

  it('all outputs are valid CSS min() expressions', () => {
    const tiers: LayoutTier[] = ['xs', 'sm', 'md', 'lg']
    for (const tier of tiers) {
      const result = modalCardWidth(tier)
      expect(result).toMatch(/^min\(/)
    }
  })
})

describe('LAYOUT_CONFIG', () => {
  it('all four tiers have config', () => {
    const tiers: LayoutTier[] = ['xs', 'sm', 'md', 'lg']
    for (const tier of tiers) {
      expect(LAYOUT_CONFIG[tier]).toBeDefined()
    }
  })

  it('xs/sm use 2-row grid areas', () => {
    expect(LAYOUT_CONFIG.xs.railAreas).toContain('"cast"')
    expect(LAYOUT_CONFIG.xs.railAreas).toContain('"controls"')
    expect(LAYOUT_CONFIG.sm.railAreas).toContain('"cast"')
  })

  it('md uses the 2-row stacked areas (same as sm); only lg is single-row', () => {
    expect(LAYOUT_CONFIG.md.railAreas).toContain('"cast"')
    expect(LAYOUT_CONFIG.md.railAreas).toContain('"controls"')
    expect(LAYOUT_CONFIG.lg.railAreas).toContain('"wager context cast readouts cashout"')
  })

  it('xs hides context column, sm+ shows it', () => {
    expect(LAYOUT_CONFIG.xs.contextVisible).toBe(false)
    expect(LAYOUT_CONFIG.sm.contextVisible).toBe(true)
    expect(LAYOUT_CONFIG.md.contextVisible).toBe(true)
    expect(LAYOUT_CONFIG.lg.contextVisible).toBe(true)
  })

  it('paddingInline uses SP tokens only', () => {
    const validSP = new Set<number>(Object.values(SP))
    const tiers: LayoutTier[] = ['xs', 'sm', 'md', 'lg']
    for (const tier of tiers) {
      expect(validSP.has(LAYOUT_CONFIG[tier].railPxInline)).toBe(true)
    }
  })

  it('cast button heights are >= 44px (RG-C8 touch target floor)', () => {
    const tiers: LayoutTier[] = ['xs', 'sm', 'md', 'lg']
    for (const tier of tiers) {
      expect(LAYOUT_CONFIG[tier].castH).toBeGreaterThanOrEqual(44)
    }
  })

  it('lg has the largest padding (most viewport real estate)', () => {
    expect(LAYOUT_CONFIG.lg.railPxInline).toBeGreaterThan(LAYOUT_CONFIG.md.railPxInline)
    expect(LAYOUT_CONFIG.md.railPxInline).toBeGreaterThan(LAYOUT_CONFIG.xs.railPxInline)
  })
})

describe('BP (breakpoint thresholds)', () => {
  it('SM_MIN is 481', () => { expect(BP.SM_MIN).toBe(481) })
  it('MD_MIN is 768', () => { expect(BP.MD_MIN).toBe(768) })
  it('LG_MIN is 1024', () => { expect(BP.LG_MIN).toBe(1024) })
})

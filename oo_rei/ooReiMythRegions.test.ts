/**
 * ooReiMythRegions.test.ts — adversarial tests for the Myth-of-REI region module.
 *
 * Verifies the PURE region-state derivation over sealedSpiritCount:
 *   - state transitions at counts 0, 1, 5, 9, 10, 11+, and negative/fractional.
 *   - MYTH_REGIONS shape: exactly 10 regions, unique ids, unique traversalOrder,
 *     every vistaSrc resolving to a REAL placed file under public/.
 *   - determinism: 100 identical calls produce byte-identical output.
 *
 * Domain B/C: no math, no clock, no RNG. The vista-resolution test reads the
 * filesystem (test-time only) to ground the "resolves to a placed file" claim in
 * reality rather than asserting against a hard-coded list.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  MYTH_REGIONS,
  REGION_CYCLES_REQUIRED,
  cohesiveScenesForRegion,
  deriveRegionState,
  regionSpiritCutoutForRegion,
  regionSpiritSymbolForRegion,
  regionThemedSymbolsForRegion,
  slotBackdropForRegion,
  type MythRegionState,
} from './ooReiMythRegions'

// public/ root: this file lives at app/player/src/components/originals/oo_rei/.
// Walk up five segments (oo_rei → originals → components → src → app/player).
const PUBLIC_ROOT = join(__dirname, '..', '..', '..', '..', 'public')

/** Map the public-relative vistaSrc onto a real disk path. */
function vistaDiskPath(vistaSrc: string): string {
  return join(PUBLIC_ROOT, vistaSrc.replace(/^\//, ''))
}

/** Collect the derived state for a given region id from a derivation result. */
function stateOf(
  derivation: ReturnType<typeof deriveRegionState>,
  id: string,
): MythRegionState | undefined {
  return derivation.regions.find((entry) => entry.region.id === id)?.state
}

describe('MYTH_REGIONS config', () => {
  it('has exactly 10 regions', () => {
    expect(MYTH_REGIONS).toHaveLength(10)
  })

  it('has unique slug ids', () => {
    const ids = MYTH_REGIONS.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique, contiguous, 1-based traversalOrder', () => {
    const orders = MYTH_REGIONS.map((r) => r.traversalOrder)
    expect(new Set(orders).size).toBe(orders.length)
    expect([...orders].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('has 5 authored regions (1-5) and 5 unauthored cycle-2 regions (6-10)', () => {
    const authored = MYTH_REGIONS.filter((r) => r.authored)
    expect(authored).toHaveLength(5)
    for (const r of authored) {
      expect(r.traversalOrder).toBeLessThanOrEqual(5)
      expect(r.spirit).not.toBeNull()
      expect(r.cyclesRequired).not.toBeNull()
    }
    for (const r of MYTH_REGIONS.filter((x) => !x.authored)) {
      expect(r.traversalOrder).toBeGreaterThanOrEqual(6)
      expect(r.spirit).toBeNull()
      expect(r.cyclesRequired).toBeNull()
      // Honest cartography: no reward teaser, no proximity nudge.
      expect(r.nameEN).toBe('MYTH CYCLE 2. NOT YET AUTHORED')
      expect(r.unlockCondition).toBe('MYTH CYCLE 2. NOT YET AUTHORED')
    }
  })

  it('every vistaSrc resolves to a real placed file under public/', () => {
    for (const region of MYTH_REGIONS) {
      expect(typeof region.vistaSrc).toBe('string')
      expect(region.vistaSrc.length).toBeGreaterThan(0)
      const onDisk = vistaDiskPath(region.vistaSrc)
      expect(existsSync(onDisk), `${region.id} → ${region.vistaSrc} missing on disk`).toBe(true)
    }
  })

  it('every vistaSrc is unique (no two regions share art)', () => {
    const sources = MYTH_REGIONS.map((r) => r.vistaSrc)
    expect(new Set(sources).size).toBe(sources.length)
  })

  it('every region carries a non-empty polygonSvgPath, mythBeat, and lore', () => {
    for (const region of MYTH_REGIONS) {
      expect(region.polygonSvgPath).toMatch(/^M /)
      expect(region.polygonSvgPath).toMatch(/Z$/)
      expect(region.mythBeat.length).toBeGreaterThan(0)
      // lore is non-empty for all regions (authored regions: 2-3 sentence myth
      // passage; cycle-2 regions: short honest placeholder).
      expect(typeof region.lore).toBe('string')
      expect(region.lore.length).toBeGreaterThan(0)
      // No em-dashes in user-facing lore strings.
      expect(region.lore).not.toContain('—')
    }
  })

  it('authored regions carry multi-sentence lore (at least 2 sentences)', () => {
    for (const region of MYTH_REGIONS.filter((r) => r.authored)) {
      // A sentence ends with a period — authored lore should have at least 2.
      const sentenceCount = (region.lore.match(/\./g) ?? []).length
      expect(sentenceCount, `${region.id} lore has too few sentences`).toBeGreaterThanOrEqual(2)
    }
  })

  it('authored regions carry a non-null goalStatement; cycle-2 regions carry null', () => {
    for (const region of MYTH_REGIONS) {
      if (region.authored) {
        expect(region.goalStatement, `${region.id} goalStatement should be non-null`).not.toBeNull()
        expect(typeof region.goalStatement).toBe('string')
        expect((region.goalStatement as string).length).toBeGreaterThan(0)
      } else {
        expect(region.goalStatement, `${region.id} goalStatement should be null`).toBeNull()
      }
    }
  })

  it('REGION_CYCLES_REQUIRED aligns with each authored region cyclesRequired', () => {
    expect(REGION_CYCLES_REQUIRED).toHaveLength(10)
    for (const region of MYTH_REGIONS) {
      expect(REGION_CYCLES_REQUIRED[region.traversalOrder - 1]).toBe(region.cyclesRequired)
    }
  })
})

describe('deriveRegionState — tri-state mapping', () => {
  it('at sealedSpiritCount 0: region 1 active, all others sealed, 0 cleared', () => {
    const result = deriveRegionState(0)
    expect(result.clearedCount).toBe(0)
    expect(result.totalRegions).toBe(10)
    expect(result.currentRegionId).toBe('storm-coast')
    expect(stateOf(result, 'storm-coast')).toBe('active')
    for (const entry of result.regions.filter((e) => e.region.traversalOrder >= 2)) {
      expect(entry.state).toBe('sealed')
    }
  })

  it('at sealedSpiritCount 1: region 1 cleared, region 2 active', () => {
    const result = deriveRegionState(1)
    expect(result.clearedCount).toBe(1)
    expect(stateOf(result, 'storm-coast')).toBe('cleared')
    expect(stateOf(result, 'tide-shore')).toBe('active')
    expect(result.currentRegionId).toBe('tide-shore')
    expect(stateOf(result, 'ember-forge')).toBe('sealed')
  })

  it('at sealedSpiritCount 5: regions 1-5 cleared, region 6 active', () => {
    const result = deriveRegionState(5)
    expect(result.clearedCount).toBe(5)
    expect(result.currentRegionId).toBe('cycle2-bamboo-grove')
    for (const entry of result.regions.filter((e) => e.region.traversalOrder <= 5)) {
      expect(entry.state).toBe('cleared')
    }
    expect(stateOf(result, 'cycle2-bamboo-grove')).toBe('active')
    expect(stateOf(result, 'cycle2-river-delta')).toBe('sealed')
  })

  it('at sealedSpiritCount 9: regions 1-9 cleared, region 10 active', () => {
    const result = deriveRegionState(9)
    expect(result.clearedCount).toBe(9)
    expect(result.currentRegionId).toBe('cycle2-spirit-gate')
    expect(stateOf(result, 'cycle2-spirit-gate')).toBe('active')
    for (const entry of result.regions.filter((e) => e.region.traversalOrder <= 9)) {
      expect(entry.state).toBe('cleared')
    }
  })

  it('at sealedSpiritCount 10: all cleared, no active region', () => {
    const result = deriveRegionState(10)
    expect(result.clearedCount).toBe(10)
    expect(result.currentRegionId).toBe('')
    for (const entry of result.regions) {
      expect(entry.state).toBe('cleared')
    }
  })

  it('at sealedSpiritCount 11+ (overflow): clamped to all cleared, no active', () => {
    for (const count of [11, 50, 1000]) {
      const result = deriveRegionState(count)
      expect(result.clearedCount).toBe(10)
      expect(result.currentRegionId).toBe('')
      expect(result.regions.every((e) => e.state === 'cleared')).toBe(true)
    }
  })

  it('fail-closed on negative input: clamped to 0 (region 1 active)', () => {
    for (const count of [-1, -10, -999]) {
      const result = deriveRegionState(count)
      expect(result.clearedCount).toBe(0)
      expect(result.currentRegionId).toBe('storm-coast')
      expect(stateOf(result, 'storm-coast')).toBe('active')
    }
  })

  it('floors fractional input toward zero before comparison', () => {
    // 1.9 is still "1 spirit sealed" — a partial seal is not a seal.
    const result = deriveRegionState(1.9)
    expect(result.clearedCount).toBe(1)
    expect(result.currentRegionId).toBe('tide-shore')
    // 0.9 is "nothing sealed yet".
    const zeroish = deriveRegionState(0.9)
    expect(zeroish.clearedCount).toBe(0)
    expect(zeroish.currentRegionId).toBe('storm-coast')
  })

  it('fail-closed on non-finite input: clamped to 0', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = deriveRegionState(bad)
      // NaN/Infinity are hostile — treat as nothing sealed (region 1 active).
      // (Positive Infinity floors to nothing-finite, so fail-closed to 0.)
      expect(result.clearedCount).toBe(0)
      expect(result.currentRegionId).toBe('storm-coast')
    }
  })

  it('is monotonic: cleared count never decreases as count rises', () => {
    let prev = -1
    for (let count = 0; count <= 12; count += 1) {
      const cleared = deriveRegionState(count).clearedCount
      expect(cleared).toBeGreaterThanOrEqual(prev)
      prev = cleared
    }
  })

  it('exposes exactly one active region for any in-range count', () => {
    for (let count = 0; count <= 9; count += 1) {
      const actives = deriveRegionState(count).regions.filter((e) => e.state === 'active')
      expect(actives).toHaveLength(1)
    }
  })
})

describe('deriveRegionState — determinism', () => {
  it('produces byte-identical output across 100 identical calls', () => {
    const baseline = JSON.stringify(deriveRegionState(3))
    for (let i = 0; i < 100; i += 1) {
      expect(JSON.stringify(deriveRegionState(3))).toBe(baseline)
    }
  })

  it('is referentially stable for the static region configs', () => {
    const a = deriveRegionState(0)
    const b = deriveRegionState(0)
    // Same frozen config objects are reused — no cloning, no allocation drift.
    expect(a.regions[0]?.region).toBe(b.regions[0]?.region)
    expect(a.regions[0]?.region).toBe(MYTH_REGIONS[0])
  })
})

describe('slotBackdropForRegion — B.1 per-region slot backdrop', () => {
  const CYCLE_1 = ['storm-coast', 'tide-shore', 'ember-forge', 'mist-forest', 'shadow-vale']

  it('resolves a real backdrop file for every cycle-1 region', () => {
    for (const id of CYCLE_1) {
      const src = slotBackdropForRegion(id)
      expect(src).toBe(`/assets/generated/oo-rei/backdrops/region-${id}.jpg`)
      expect(existsSync(join(PUBLIC_ROOT, src as string))).toBe(true)
    }
  })

  it('returns null for cycle-2 regions (paddy fallback) and unknown ids', () => {
    expect(slotBackdropForRegion('cycle2-bamboo-grove')).toBeNull()
    expect(slotBackdropForRegion('cycle2-spirit-gate')).toBeNull()
    expect(slotBackdropForRegion('not-a-region')).toBeNull()
    expect(slotBackdropForRegion('')).toBeNull()
  })

  it('is deterministic across repeated calls', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(slotBackdropForRegion('storm-coast')).toBe(
        '/assets/generated/oo-rei/backdrops/region-storm-coast.jpg',
      )
    }
  })
})

describe('regionSpiritSymbolForRegion — B.2 region spirit slot symbol', () => {
  // Cycle-2 regions inherit a cycle-1 spirit by element — must match the
  // cinematic REGION_SPIRIT_ART mapping so all three spirit surfaces agree.
  const EXPECTED: Record<string, string> = {
    'storm-coast': 'spirit-arashi',
    'tide-shore': 'spirit-shio',
    'ember-forge': 'spirit-homura',
    'mist-forest': 'spirit-kiri',
    'shadow-vale': 'spirit-kage',
    'cycle2-bamboo-grove': 'spirit-kiri',
    'cycle2-river-delta': 'spirit-shio',
    'cycle2-burial-mounds': 'spirit-kage',
    'cycle2-frozen-highland': 'spirit-arashi',
    'cycle2-spirit-gate': 'spirit-homura',
  }

  it('resolves a real spirit-symbol file for every mapped region', () => {
    for (const [id, slug] of Object.entries(EXPECTED)) {
      const src = regionSpiritSymbolForRegion(id)
      expect(src).toBe(`/assets/generated/oo-rei/symbols/${slug}.png`)
      expect(existsSync(join(PUBLIC_ROOT, src as string))).toBe(true)
    }
  })

  it('returns null for unknown ids (keeps default Spirit Orb)', () => {
    expect(regionSpiritSymbolForRegion('not-a-region')).toBeNull()
    expect(regionSpiritSymbolForRegion('')).toBeNull()
  })

  it('is deterministic across repeated calls', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(regionSpiritSymbolForRegion('ember-forge')).toBe(
        '/assets/generated/oo-rei/symbols/spirit-homura.png',
      )
    }
  })
})

describe('regionSpiritCutoutForRegion — A.1 duel + A.2 sealing spirit cutout', () => {
  // The SINGLE SOURCE OF TRUTH shared by the duel + the sealing figure. Must
  // agree on WHICH spirit per region with regionSpiritSymbolForRegion (element
  // identity), and use the cinematic/spirits cutout files.
  // EXPECTED filename per region. ARASHI (storm-coast / cycle2-frozen-highland)
  // uses the COILED-DRAGON board-loom render arashi-coil.png (Azuki/ufotable
  // anime ink+cel, Tim #98, 2026-06-02) with a ?v cache-buster appended in the
  // source map; the test strips the query before the path comparison + existsSync
  // (a URL query is not part of the file path on disk).
  const EXPECTED: Record<string, string> = {
    'storm-coast': 'arashi-storm',
    'tide-shore': 'shio',
    'ember-forge': 'homura',
    'mist-forest': 'kiri',
    'shadow-vale': 'kage',
    'cycle2-bamboo-grove': 'kiri',
    'cycle2-river-delta': 'shio',
    'cycle2-burial-mounds': 'kage',
    'cycle2-frozen-highland': 'arashi-storm',
    'cycle2-spirit-gate': 'homura',
  }

  // Strip a ?query / #fragment so the URL resolves to a real path on disk.
  const stripQuery = (url: string): string => url.split(/[?#]/)[0] ?? url

  it('resolves a real spirit cutout file for every mapped region', () => {
    for (const [id, spirit] of Object.entries(EXPECTED)) {
      const src = regionSpiritCutoutForRegion(id) as string
      const path = stripQuery(src)
      expect(path).toBe(`/assets/generated/oo-rei/cinematic/spirits/${spirit}.png`)
      expect(existsSync(join(PUBLIC_ROOT, path))).toBe(true)
    }
  })

  it('agrees with the reel symbol on WHICH spirit per region (three surfaces agree)', () => {
    for (const id of Object.keys(EXPECTED)) {
      const cutout = stripQuery(regionSpiritCutoutForRegion(id) as string)
      const symbol = regionSpiritSymbolForRegion(id) as string
      // Different artwork files; ARASHI uses variant filenames (loom-v2, head, etc.)
      // so normalise the cutout slug to its base spirit name before comparing to
      // the reel symbol's spirit identity. Strip known variant suffixes first.
      const cutoutSpirit = cutout
        .split('/')
        .pop()
        ?.replace(/[?#].*$/, '') // strip ?v= cache-buster / #fragment first
        .replace('.png', '')
        .replace(/-(loom-v2|head|coil|storm|corner)$/, '')
      const symbolSpirit = symbol.split('/').pop()?.replace('spirit-', '').replace('.png', '')
      expect(cutoutSpirit).toBe(symbolSpirit)
    }
  })

  it('returns null for unknown ids (no figure)', () => {
    expect(regionSpiritCutoutForRegion('not-a-region')).toBeNull()
    expect(regionSpiritCutoutForRegion('')).toBeNull()
  })
})

describe('cohesiveScenesForRegion -- DISABLED 2026-06-01 (separate composed layers)', () => {
  // A full-bleed scene with the figure baked in composes poorly behind the board
  // (Rei shrinks to a lost speck). Rei + the spirit are now SEPARATE composed
  // layers orchestrated WITH the board over the anime-cel vista, so NO region
  // resolves a cohesive scene — every id returns null and the caller uses the
  // vista backdrop + character layers.
  it('returns null for every cycle-1 region (no baked cohesive scene)', () => {
    for (const id of ['storm-coast', 'tide-shore', 'ember-forge', 'mist-forest', 'shadow-vale']) {
      expect(cohesiveScenesForRegion(id)).toBeNull()
    }
  })

  it('returns null for cycle-2 and unknown ids', () => {
    expect(cohesiveScenesForRegion('cycle2-bamboo-grove')).toBeNull()
    expect(cohesiveScenesForRegion('not-a-region')).toBeNull()
    expect(cohesiveScenesForRegion('')).toBeNull()
  })

  it('is deterministic across repeated calls', () => {
    const a = cohesiveScenesForRegion('storm-coast')
    const b = cohesiveScenesForRegion('storm-coast')
    expect(a?.wide).toBe(b?.wide)
    expect(a?.portrait).toBe(b?.portrait)
  })
})

describe('regionThemedSymbolsForRegion -- retired in favour of shared ink symbol set', () => {
  // RETIRED 2026-06-01 (Tim): the per-region Storm Coast base-symbol skins
  // (symbols/storm-coast/sym-*.png) are superseded by a refreshed SHARED ink
  // symbol set wired directly into OoReiSlotCanvas.SYMBOL_PATHS. The themed map
  // is now empty, so EVERY region (including storm-coast) returns null and the
  // canvas renders the shared default set for base symbols 0-6. The premium
  // spirit (SymbolId 7) is unaffected — it stays a per-region swap via
  // regionSpiritSymbolForRegion.
  it('returns null for storm-coast (themed base symbols retired)', () => {
    expect(regionThemedSymbolsForRegion('storm-coast')).toBeNull()
  })

  it('returns null for every other cycle-1 region (canvas uses defaults)', () => {
    for (const id of ['tide-shore', 'ember-forge', 'mist-forest', 'shadow-vale']) {
      expect(regionThemedSymbolsForRegion(id)).toBeNull()
    }
  })

  it('returns null for cycle-2 and unknown ids', () => {
    expect(regionThemedSymbolsForRegion('cycle2-bamboo-grove')).toBeNull()
    expect(regionThemedSymbolsForRegion('not-a-region')).toBeNull()
    expect(regionThemedSymbolsForRegion('')).toBeNull()
  })

  it('is deterministic across repeated calls', () => {
    expect(regionThemedSymbolsForRegion('storm-coast')).toBe(
      regionThemedSymbolsForRegion('storm-coast'),
    )
  })
})

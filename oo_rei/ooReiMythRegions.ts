/**
 * ooReiMythRegions.ts — Myth-of-REI map region configuration + state derivation.
 *
 * THE MYTH (TAMASHII-JIMA / "Soul Island"): REI, last warden, traverses ten
 * elemental territories sealing the broken procession-spirits back into the land.
 * This module is the SEMANTIC grouping layer over the EXISTING `sealedSpiritCount`
 * counter (ooReiProvider) — it introduces NO new game state, NO financial value,
 * and NO new math. A region "clears" purely because the player has accrued enough
 * Transcendent gauge resets (each reset = one sealed spirit) to pass its
 * traversalOrder. The published RTP (96%, LOCKED in ooReiMath.ts) is untouched.
 *
 * DOMAIN B/C discipline:
 *   - PURE module. No I/O, no Date.now(), no Math.random(), no system clock.
 *   - deriveRegionState() is deterministic: identical input → identical output
 *     across any number of calls.
 *   - Fail-closed on hostile input: negative sealedSpiritCount clamps to 0 (the
 *     map can never regress, so a negative is treated as "nothing sealed yet"),
 *     and fractional input is floored toward zero before comparison.
 *   - NO financial arithmetic lives here. The region config carries display
 *     metadata only (names, glyphs, cutout asset paths, vista paths, narrative
 *     beats, colormask colour for pixel hit-testing).
 *
 * RG boundaries (hard — enforced by the SHAPE of this module):
 *   - No pay-to-progress: state is derived solely from sealedSpiritCount.
 *   - No proximity nudge: there is NO "N spins left" field anywhere. The only
 *     factual progress signal is the cleared/active/sealed tri-state.
 *   - Map never regresses: deriveRegionState is monotonic — a higher count can
 *     only add cleared regions, never remove them.
 *   - Honest cartography: hidden cycle-2 regions are labelled
 *     "MYTH CYCLE 2. NOT YET AUTHORED" with no reward teaser.
 *
 * CUTOUT ARCHITECTURE (updated 2026-05-29):
 *   Each authored/cycle-2 region that has a pixel-perfect cutout PNG gets
 *   cutoutSrc set. The cutout is a full-canvas 1024×1024 transparent PNG with
 *   only that region opaque, at position (0,0) — compositing all cutouts at (0,0)
 *   reassembles the island footprint. Borders follow the painted map exactly.
 *
 *   maskColor: the flat hex colour used for this region in the colormask PNG
 *   (tamashii-jima-colormask.png). Used for pointer hit-testing: sample the
 *   colormask pixel under the pointer and snap to the nearest palette entry.
 *
 *   mapCentroid: the centroid of this region in 0..1024 map-pixel space,
 *   derived from the cutout manifest. Used for accurate marker placement on the
 *   SVG overlay (which uses viewBox 0 0 1024 1024 + preserveAspectRatio meet
 *   to match object-fit:contain on the base map img).
 *
 * Source of truth for geometry/order/narrative: the interactive-map spec
 * (Myth-of-REI map task wop2jprij) + OO-REI-MYTH-OF-REI-2026-05-29.md.
 */

/** Discrete region traversal state derived from sealedSpiritCount. */
export type MythRegionState = 'sealed' | 'active' | 'cleared'

/** A point in the 0..1024 map-pixel coordinate space (matches the cutout PNGs). */
export interface MythRegionPoint {
  readonly x: number
  readonly y: number
}

/** Narrative spirit bound to an authored region, or null for unauthored ones. */
export interface MythRegionSpirit {
  /** Romanised name, e.g. 'ARASHI'. */
  readonly name: string
  /** Single-kanji glyph, e.g. '嵐'. */
  readonly kanji: string
}

/** A single myth-region config. Display metadata only — zero financial value. */
export interface MythRegionConfig {
  /** Slug id, unique across the array. */
  readonly id: string
  /** English region name (display). */
  readonly nameEN: string
  /** Japanese region name (display). */
  readonly nameJP: string
  /** Bound spirit, or null for unauthored cycle-2 regions. */
  readonly spirit: MythRegionSpirit | null
  /** 1-based traversal position. Drives clear/active/sealed derivation. */
  readonly traversalOrder: number
  /** Transcendent cycles required to clear, or null when unauthored. */
  readonly cyclesRequired: number | null
  /**
   * Region centroid in 0..1024 map-pixel space (from colormask segmentation).
   * Used for marker placement on the SVG overlay (viewBox 0 0 1024 1024).
   * Null if no cutout exists (tide-shore has no separate colormask region).
   */
  readonly mapCentroid: MythRegionPoint | null
  /**
   * Path to the full-canvas 1024×1024 cutout PNG (relative to /public/).
   * Null if no cutout exists for this region (e.g. tide-shore not segmented).
   */
  readonly cutoutSrc: string | null
  /**
   * Hex colour of this region in tamashii-jima-colormask.png.
   * Null if no colormask entry exists.
   */
  readonly maskColor: string | null
  /** Faint spirit-glyph kanji rendered over the sealed veil. */
  readonly spiritGlyphKanji: string
  /**
   * Hanko-stamp centroid in 0..1024 space.
   * Null if no cutout (tide-shore falls back to mapCentroid offset).
   */
  readonly hankoCentroid: MythRegionPoint | null
  /**
   * Legacy SVG centroid in 0..1000 space (kept for fallback calcs only).
   * Prefer mapCentroid (0..1024) for all rendering.
   * @deprecated use mapCentroid
   */
  readonly centroid: MythRegionPoint
  /**
   * Legacy traced SVG polygon path string (0..1000 space).
   * RETAINED for test compatibility. NOT rendered — the cutout PNGs replace it.
   * @deprecated cutout PNGs + colormask hit-test replace polygon rendering.
   */
  readonly polygonSvgPath: string
  /** Mode-A ambient skin note. Always RTP-NEUTRAL — narrative, not a math var. */
  readonly modeAElevation: string
  /** Real placed vista art path (resolves to a file under public/). */
  readonly vistaSrc: string
  /** Factual unlock condition string (no proximity nudge, no false promise). */
  readonly unlockCondition: string
  /** One observational myth-beat sentence (display). */
  readonly mythBeat: string
  /**
   * 2-3 sentence lore passage for this region (display, authored regions only).
   * Names the spirit's nature, what REI must do to seal it, and a beat of her
   * journey or the land. Tone: quiet, mythic, observational. No em-dashes.
   * No economic or win framing. Cycle-2 regions carry a short honest placeholder.
   */
  readonly lore: string
  /**
   * Short goal statement shown on the ACTIVE region card and in the info panel.
   * Authored as a player-facing imperative: what REI must do to seal this spirit.
   * Factual, narrative — zero economic framing, zero proximity nudge.
   * Null for cycle-2 regions (not yet authored).
   */
  readonly goalStatement: string | null
  /** True for authored regions (1-5), false for cycle-2 silhouettes (6-10). */
  readonly authored: boolean
}

/**
 * Module-const cycles-to-clear per traversal order (1-based index → cycles).
 * Authored regions only; cycle-2 regions are null until authored.
 * Tunable post-launch from first-session data — a code commit, never runtime.
 */
export const REGION_CYCLES_REQUIRED: ReadonlyArray<number | null> = [
  1, // 1 Storm Coast — default start
  1, // 2 Tide Shore
  2, // 3 Ember Forge — heavier mid
  1, // 4 Mist Forest
  2, // 5 Shadow Vale — earned climax
  null, // 6 cycle-2 (unauthored)
  null, // 7 cycle-2 (unauthored)
  null, // 8 cycle-2 (unauthored)
  null, // 9 cycle-2 (unauthored)
  null, // 10 cycle-2 (unauthored)
] as const

/** Honest label for every unauthored cycle-2 region. */
const CYCLE2_LABEL = 'MYTH CYCLE 2. NOT YET AUTHORED' as const
const CYCLE2_UNLOCK = 'MYTH CYCLE 2. NOT YET AUTHORED' as const
const CYCLE2_BEAT = 'The island extends past the known myth. This shore is not yet authored.' as const
const CYCLE2_LORE = 'This shore lies past the known myth. REI has not come here yet.' as const

/**
 * The canonical ten regions of Tamashii-Jima, in traversal order N→E→C→W→S then
 * spiralling out to the unauthored cycle-2 reaches. Regions 1-5 are authored with
 * real vista art; regions 6-10 are honest silhouettes (their vista art is placed
 * and rendered darkened/desaturated as a silhouette, never as a reward teaser).
 *
 * Every vistaSrc resolves to a real file under
 * /public/assets/generated/oo-rei/myth/.
 *
 * cutoutSrc / maskColor / mapCentroid values come from the colormask manifest:
 * /public/assets/generated/oo-rei/myth/cutouts/manifest.json
 */
export const MYTH_REGIONS: ReadonlyArray<MythRegionConfig> = [
  {
    id: 'storm-coast',
    nameEN: 'Storm Coast',
    nameJP: '嵐岸',
    spirit: { name: 'ARASHI', kanji: '嵐' },
    traversalOrder: 1,
    cyclesRequired: 1,
    // Manifest: centroid {x:516, y:169}, color "#7c047c" (purple)
    mapCentroid: { x: 516, y: 169 },
    cutoutSrc: '/assets/generated/oo-rei/myth/cutouts/region-cutout-storm-coast.png',
    maskColor: '#7c047c',
    spiritGlyphKanji: '嵐',
    hankoCentroid: { x: 506, y: 159 },
    // Legacy 0..1000 SVG space (kept for test compat — not rendered)
    centroid: { x: 280, y: 110 },
    polygonSvgPath: 'M 60,20 L 380,15 L 460,80 L 400,175 L 280,200 L 120,185 L 40,120 Z',
    modeAElevation: 'RTP-NEUTRAL. Ambient skin: storm-purple dominant, crash-wave loop. Base region, no modifier.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-storm-coast.jpg',
    unlockCondition: 'Starting region. Always accessible',
    mythBeat: 'The first coast. The spirit of the storm surge waits at the tide line.',
    lore: 'ARASHI is the spirit of the storm surge, older than the island itself, drawn to every shore that breaks. REI must stand at the tide line and call the spirit by its first name, spoken into the wind without flinching. The coast quiets only when the warden does not retreat.',
    goalStatement: 'Call ARASHI by name. Fill the Spirit Gauge once.',
    authored: true,
  },
  {
    id: 'tide-shore',
    nameEN: 'Tide Shore',
    nameJP: '潮浜',
    spirit: { name: 'SHIO', kanji: '潮' },
    traversalOrder: 2,
    cyclesRequired: 1,
    // tide-shore has no separate colormask region — sits between storm-coast &
    // ember-forge. Use an interpolated centroid near top-right.
    mapCentroid: null,
    cutoutSrc: null,
    maskColor: null,
    spiritGlyphKanji: '潮',
    hankoCentroid: null,
    centroid: { x: 720, y: 135 },
    polygonSvgPath: 'M 470,20 L 820,10 L 920,90 L 860,195 L 680,210 L 490,175 L 460,85 Z',
    modeAElevation: 'RTP-NEUTRAL. Ambient skin: teal-grey sea-haze, tide-lap audio. Ownership modifier narrative-only.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-tide-shore.jpg',
    unlockCondition: 'Seal 1 spirit (Storm Coast cleared)',
    mythBeat: 'The tide carries what the storm leaves. SHIO listens from beneath the shallows.',
    lore: 'SHIO moves with the pull of the moon, dissolving into the foam whenever a hand reaches for it. REI must wait at low tide with her seal held open above the water, still enough that the spirit mistakes her for driftwood. The shore gives back what it takes, in time.',
    goalStatement: 'Wait for SHIO at low tide. Fill the Spirit Gauge once.',
    authored: true,
  },
  {
    id: 'ember-forge',
    nameEN: 'Ember Forge',
    nameJP: '炎鍛',
    spirit: { name: 'HOMURA', kanji: '炎' },
    traversalOrder: 3,
    cyclesRequired: 2,
    // Manifest: centroid {x:465, y:405}, color "#15a91b" (green)
    mapCentroid: { x: 465, y: 405 },
    cutoutSrc: '/assets/generated/oo-rei/myth/cutouts/region-cutout-ember-forge.png',
    maskColor: '#15a91b',
    spiritGlyphKanji: '炎',
    hankoCentroid: { x: 455, y: 395 },
    centroid: { x: 700, y: 420 },
    polygonSvgPath: 'M 520,225 L 870,215 L 950,340 L 930,560 L 780,600 L 570,580 L 490,420 L 510,260 Z',
    modeAElevation: 'RTP-NEUTRAL. Ambient skin: deep-orange ember glow, forge-strike percussion. Modifier narrative-only.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-ember-forge.jpg',
    unlockCondition: 'Seal 2 spirits (Storm Coast + Tide Shore cleared)',
    mythBeat: 'The forge holds its breath. HOMURA is the moment before fire.',
    lore: 'HOMURA is not fire but the moment before fire, the held breath inside every furnace that was never let out. REI must press her palm to the forge stone and let the heat pass through her without pulling away, so the spirit understands that its warmth has somewhere to go. The land cools slowly, and is grateful for it.',
    goalStatement: 'Press your palm to the forge. Fill the Spirit Gauge twice.',
    authored: true,
  },
  {
    id: 'mist-forest',
    nameEN: 'Mist Forest',
    nameJP: '霧森',
    spirit: { name: 'KIRI', kanji: '霧' },
    traversalOrder: 4,
    cyclesRequired: 1,
    // Manifest: centroid {x:796, y:386}, color "#0368cb" (blue)
    mapCentroid: { x: 796, y: 386 },
    cutoutSrc: '/assets/generated/oo-rei/myth/cutouts/region-cutout-mist-forest.png',
    maskColor: '#0368cb',
    spiritGlyphKanji: '霧',
    hankoCentroid: { x: 786, y: 376 },
    centroid: { x: 310, y: 450 },
    polygonSvgPath: 'M 60,200 L 380,210 L 480,260 L 480,590 L 360,640 L 150,620 L 50,520 L 45,300 Z',
    modeAElevation: 'RTP-NEUTRAL. Ambient skin: silver-mist desaturation, wind-through-cedar ambient. Modifier narrative-only.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-mist-forest.jpg',
    unlockCondition: 'Seal 3 spirits (Storm Coast + Tide Shore + Ember Forge cleared)',
    mythBeat: 'The forest does not part for the warden. It leans in, and lets her pass.',
    lore: 'KIRI hides the path in fog, not from malice but from a long habit of forgetting where it ends. REI must carry her lantern low and walk without looking for landmarks, trusting the ground underfoot more than the air ahead. The forest remembers every warden who turned back, and keeps a space for the ones who did not.',
    goalStatement: 'Carry the lantern low. Fill the Spirit Gauge once.',
    authored: true,
  },
  {
    id: 'shadow-vale',
    nameEN: 'Shadow Vale',
    nameJP: '影谷',
    spirit: { name: 'KAGE', kanji: '影' },
    traversalOrder: 5,
    cyclesRequired: 2,
    // Manifest: centroid {x:499, y:770}, color "#f78c01" (orange)
    mapCentroid: { x: 499, y: 770 },
    cutoutSrc: '/assets/generated/oo-rei/myth/cutouts/region-cutout-shadow-vale.png',
    maskColor: '#f78c01',
    spiritGlyphKanji: '影',
    hankoCentroid: { x: 489, y: 760 },
    centroid: { x: 490, y: 830 },
    polygonSvgPath: 'M 160,635 L 480,605 L 790,615 L 850,720 L 780,900 L 600,980 L 380,985 L 200,910 L 130,770 Z',
    modeAElevation: 'RTP-NEUTRAL. Ambient skin: near-black charcoal, single-amber lantern, shadow-rustle audio. Modifier narrative-only.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-shadow-vale.jpg',
    unlockCondition: 'Seal 4 spirits (all prior regions cleared)',
    mythBeat: 'The last spirit does not resist. It has waited in the shadow since the first seal broke.',
    lore: 'KAGE is the oldest shadow on Tamashii-Jima, cast before there was anything to cast it. REI must enter the vale without her lantern and let the dark be familiar rather than threatening, sitting with the spirit until it recognises her as the last warden. The valley does not brighten when it is sealed; it simply becomes quiet.',
    goalStatement: 'Enter without the lantern. Fill the Spirit Gauge twice.',
    authored: true,
  },
  {
    id: 'cycle2-bamboo-grove',
    nameEN: CYCLE2_LABEL,
    nameJP: '未解放',
    spirit: null,
    traversalOrder: 6,
    cyclesRequired: null,
    // Manifest: centroid {x:244, y:713}, color "#fb0401" (red)
    mapCentroid: { x: 244, y: 713 },
    cutoutSrc: '/assets/generated/oo-rei/myth/cutouts/region-cutout-cycle2-bamboo-grove.png',
    maskColor: '#fb0401',
    spiritGlyphKanji: '?',
    hankoCentroid: { x: 234, y: 703 },
    centroid: { x: 840, y: 310 },
    polygonSvgPath: 'M 870,205 L 960,200 L 975,360 L 940,420 L 860,360 L 855,250 Z',
    modeAElevation: 'Not applicable. Region not authored.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-bamboo-grove.jpg',
    unlockCondition: CYCLE2_UNLOCK,
    mythBeat: CYCLE2_BEAT,
    lore: CYCLE2_LORE,
    goalStatement: null,
    authored: false,
  },
  {
    id: 'cycle2-river-delta',
    nameEN: CYCLE2_LABEL,
    nameJP: '未解放',
    spirit: null,
    traversalOrder: 7,
    cyclesRequired: null,
    // Manifest: centroid {x:511, y:564}, color "#048783" (teal)
    mapCentroid: { x: 511, y: 564 },
    cutoutSrc: '/assets/generated/oo-rei/myth/cutouts/region-cutout-cycle2-river-delta.png',
    maskColor: '#048783',
    spiritGlyphKanji: '?',
    hankoCentroid: { x: 501, y: 554 },
    centroid: { x: 900, y: 650 },
    polygonSvgPath: 'M 860,610 L 960,600 L 980,760 L 920,800 L 850,730 L 845,650 Z',
    modeAElevation: 'Not applicable. Region not authored.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-river-delta.jpg',
    unlockCondition: CYCLE2_UNLOCK,
    mythBeat: CYCLE2_BEAT,
    lore: CYCLE2_LORE,
    goalStatement: null,
    authored: false,
  },
  {
    id: 'cycle2-burial-mounds',
    nameEN: CYCLE2_LABEL,
    nameJP: '未解放',
    spirit: null,
    traversalOrder: 8,
    cyclesRequired: null,
    // Manifest: centroid {x:741, y:686}, color "#fdf701" (yellow)
    mapCentroid: { x: 741, y: 686 },
    cutoutSrc: '/assets/generated/oo-rei/myth/cutouts/region-cutout-cycle2-burial-mounds.png',
    maskColor: '#fdf701',
    spiritGlyphKanji: '?',
    hankoCentroid: { x: 731, y: 676 },
    centroid: { x: 870, y: 900 },
    polygonSvgPath: 'M 790,910 L 960,820 L 990,950 L 920,995 L 810,990 Z',
    modeAElevation: 'Not applicable. Region not authored.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-burial-mounds.jpg',
    unlockCondition: CYCLE2_UNLOCK,
    mythBeat: CYCLE2_BEAT,
    lore: CYCLE2_LORE,
    goalStatement: null,
    authored: false,
  },
  {
    id: 'cycle2-frozen-highland',
    nameEN: CYCLE2_LABEL,
    nameJP: '未解放',
    spirit: null,
    traversalOrder: 9,
    cyclesRequired: null,
    // Manifest: centroid {x:207, y:446}, color "#353b94" (indigo)
    mapCentroid: { x: 207, y: 446 },
    cutoutSrc: '/assets/generated/oo-rei/myth/cutouts/region-cutout-cycle2-frozen-highland.png',
    maskColor: '#353b94',
    spiritGlyphKanji: '?',
    hankoCentroid: { x: 197, y: 436 },
    centroid: { x: 80, y: 870 },
    polygonSvgPath: 'M 20,770 L 125,760 L 120,910 L 60,985 L 10,950 L 15,820 Z',
    modeAElevation: 'Not applicable. Region not authored.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-frozen-highland.jpg',
    unlockCondition: CYCLE2_UNLOCK,
    mythBeat: CYCLE2_BEAT,
    lore: CYCLE2_LORE,
    goalStatement: null,
    authored: false,
  },
  {
    id: 'cycle2-spirit-gate',
    nameEN: CYCLE2_LABEL,
    nameJP: '未解放',
    spirit: null,
    traversalOrder: 10,
    cyclesRequired: null,
    // Manifest: centroid {x:743, y:848}, color "#d903d9" (magenta)
    mapCentroid: { x: 743, y: 848 },
    cutoutSrc: '/assets/generated/oo-rei/myth/cutouts/region-cutout-cycle2-spirit-gate.png',
    maskColor: '#d903d9',
    spiritGlyphKanji: '?',
    hankoCentroid: { x: 733, y: 838 },
    centroid: { x: 50, y: 550 },
    polygonSvgPath: 'M 10,530 L 40,520 L 42,640 L 12,650 Z',
    modeAElevation: 'Not applicable. Region not authored.',
    vistaSrc: '/assets/generated/oo-rei/myth/region-spirit-gate.jpg',
    unlockCondition: CYCLE2_UNLOCK,
    mythBeat: CYCLE2_BEAT,
    lore: CYCLE2_LORE,
    goalStatement: null,
    authored: false,
  },
] as const

/** One derived region entry: the static config plus its derived runtime state. */
export interface DerivedMythRegion {
  readonly region: MythRegionConfig
  readonly state: MythRegionState
}

/** Full derived map state for the current sealedSpiritCount. */
export interface MythRegionDerivation {
  readonly regions: ReadonlyArray<DerivedMythRegion>
  /** Slug of the single ACTIVE region, or '' if all regions are cleared. */
  readonly currentRegionId: string
  /** Count of regions in 'cleared' state. */
  readonly clearedCount: number
  /** Total region count (= MYTH_REGIONS.length). */
  readonly totalRegions: number
}

/**
 * Derive the per-region tri-state from the player's sealedSpiritCount.
 *
 * Mapping (1-based traversalOrder):
 *   traversalOrder <= sealedSpiritCount      → 'cleared'
 *   traversalOrder === sealedSpiritCount + 1 → 'active'
 *   otherwise                                → 'sealed'
 *
 * PURE + deterministic: no clock, no RNG, no I/O. Identical input → identical
 * output across any number of calls.
 *
 * Fail-closed on hostile input:
 *   - Non-finite or negative input clamps to 0 (the map can NEVER regress, and a
 *     negative seal count is meaningless — treat it as "nothing sealed yet").
 *   - Fractional input is floored toward zero before comparison (a seal is a
 *     discrete count; a partial seal is not a seal).
 *
 * When sealedSpiritCount >= totalRegions, every region is 'cleared' and
 * currentRegionId is '' (no active region remains. The myth cycle is complete).
 */
export function deriveRegionState(sealedSpiritCount: number): MythRegionDerivation {
  // Fail-closed clamp: non-finite or negative → 0. Then floor (discrete count).
  const safeCount =
    Number.isFinite(sealedSpiritCount) && sealedSpiritCount > 0
      ? Math.floor(sealedSpiritCount)
      : 0

  let clearedCount = 0
  let currentRegionId = ''

  const regions: ReadonlyArray<DerivedMythRegion> = MYTH_REGIONS.map((region) => {
    let state: MythRegionState
    if (region.traversalOrder <= safeCount) {
      state = 'cleared'
      clearedCount += 1
    } else if (region.traversalOrder === safeCount + 1) {
      state = 'active'
      currentRegionId = region.id
    } else {
      state = 'sealed'
    }
    return { region, state }
  })

  return {
    regions,
    currentRegionId,
    clearedCount,
    totalRegions: MYTH_REGIONS.length,
  }
}

/**
 * Per-region CLEAN slot backdrop plates (B.1 — "every region changes the
 * background of the actual slot game", Tim 2026-05-30).
 *
 * These are distinct from each region's `vistaSrc`: the vistas are the
 * chapter-close "vista breath" compositions and contain REI in the foreground,
 * so they cannot sit behind the live slot grid (they would duplicate the
 * character layer and clash with the tablets). These plates are character-free
 * landscape paintings, sky-heavy in the upper half with open dark negative
 * space in the lower-center where the reel grid sits — composed the same way as
 * the original `backdrop-paddy-lobby.jpg`.
 *
 * Cycle-1 regions (1-5) have dedicated plates. Cycle-2 regions (6-10) currently
 * resolve to `null` and fall back to the generic paddy-lobby plate until their
 * own clean backdrops are commissioned — an honest fallback, never a wrong
 * region's art. Display-only; every path resolves to a real file under public/.
 * Domain C. Zero cyan (ember-forge is warm by design; OO-REI carries no cyan
 * accent layer, so there is no cyan-on-warm surface to violate).
 */
const REGION_SLOT_BACKDROP: Readonly<Record<string, string>> = {
  'storm-coast': '/assets/generated/oo-rei/backdrops/region-storm-coast.jpg',
  'tide-shore': '/assets/generated/oo-rei/backdrops/region-tide-shore.jpg',
  'ember-forge': '/assets/generated/oo-rei/backdrops/region-ember-forge.jpg',
  'mist-forest': '/assets/generated/oo-rei/backdrops/region-mist-forest.jpg',
  'shadow-vale': '/assets/generated/oo-rei/backdrops/region-shadow-vale.jpg',
} as const

/**
 * Resolve the clean slot backdrop for a region id, or null when the region has
 * no dedicated plate yet (caller falls back to the generic paddy backdrop).
 */
export function slotBackdropForRegion(regionId: string): string | null {
  return REGION_SLOT_BACKDROP[regionId] ?? null
}

/**
 * Per-region SPIRIT slot-symbol art (B.2 — "change tile slots ... add the
 * spirits as theme-bound symbols", Tim 2026-05-30).
 *
 * The premium symbol (SymbolId 7, the Spirit Orb) is RE-SKINNED to the active
 * region's spirit emblem. ARASHI the thunder-dragon in Storm Coast, SHIO the
 * koi in Tide Shore, and so on. This is a PURE ART swap: the symbol id, its
 * paytable (SYMBOL_PAYS[7]) and its reel-strip weight are untouched, so RTP is
 * byte-identical. Only the painted glyph on reels 1/3/5 changes per region.
 *
 * Cycle-2 regions inherit a cycle-1 spirit by element — the SAME mapping as the
 * cinematic REGION_SPIRIT_ART and the archetype map, so the duel spirit, the
 * sealing spirit and the reel spirit always agree within a region.
 * Display-only; every path resolves to a real file under public/. Domain C.
 */
const REGION_SPIRIT_SYMBOL: Readonly<Record<string, string>> = {
  'storm-coast': '/assets/generated/oo-rei/symbols/spirit-arashi.png',
  'tide-shore': '/assets/generated/oo-rei/symbols/spirit-shio.png',
  'ember-forge': '/assets/generated/oo-rei/symbols/spirit-homura.png',
  'mist-forest': '/assets/generated/oo-rei/symbols/spirit-kiri.png',
  'shadow-vale': '/assets/generated/oo-rei/symbols/spirit-kage.png',
  'cycle2-bamboo-grove': '/assets/generated/oo-rei/symbols/spirit-kiri.png',
  'cycle2-river-delta': '/assets/generated/oo-rei/symbols/spirit-shio.png',
  'cycle2-burial-mounds': '/assets/generated/oo-rei/symbols/spirit-kage.png',
  'cycle2-frozen-highland': '/assets/generated/oo-rei/symbols/spirit-arashi.png',
  'cycle2-spirit-gate': '/assets/generated/oo-rei/symbols/spirit-homura.png',
} as const

/**
 * Resolve the region spirit's premium-symbol art, or null to keep the default
 * Spirit Orb (pre-region / unknown id). RTP-neutral cosmetic swap.
 */
export function regionSpiritSymbolForRegion(regionId: string): string | null {
  return REGION_SPIRIT_SYMBOL[regionId] ?? null
}

/**
 * Per-region SPIRIT CUTOUT art — the full transparent figure of each region's
 * great spirit, composited over the cinematic duel (A.1 — looming in faceoff,
 * dissolving in the seal beat) AND behind the Spirit Sealing bonus scrolls
 * (A.2 — looming while sealing, dissolving on full seal).
 *
 * This is the SINGLE SOURCE OF TRUTH for the cutout path: OoReiCinematicOverlay
 * imports `regionSpiritCutoutForRegion` instead of keeping a private map, so the
 * duel spirit and the sealing spirit can never drift.
 *
 * Cycle-2 regions inherit a cycle-1 spirit BY ELEMENT — the SAME mapping as
 * REGION_SPIRIT_SYMBOL (reel) and the archetype map, so the THREE spirit
 * surfaces (duel / reel / sealing) always agree on WHICH spirit per region.
 * (They use different artwork FILES by design — full-body cutout here vs the
 * reel emblem in REGION_SPIRIT_SYMBOL — only the spirit IDENTITY is shared.)
 *
 * Honest-fallback contract: unknown id → null (caller renders no figure). The
 * paths resolve to real files under public/ (cinematic/spirits/*.png). Domain C
 * display-only. Zero cyan.
 */
const SPIRIT_CUTOUT_BASE = '/assets/generated/oo-rei/cinematic/spirits'
// ARASHI uses the HEAD-FORWARD render (Tim #94/#95 depth-weave, 2026-06-02): an
// arashi-coil.png (Tim #98, 2026-06-02): a CLASSIC East-Asian SERPENTINE dragon
// drawn as a clean Azuki/ufotable anime ink+cel illustration — pale silver-white
// scales, gold/amber dorsal mane, amber eye, faint gold lightning. The prior
// arashi-head.png was a glossy photoreal SNARLING HEAD (wrong style, Tim-rejected)
// and arashi-loom-v2.png was a tangled full-body coil. This coiled guardian is
// composed to DRAPE over the board's top-right corner (head upper-left gazing in,
// body sweeping down-right) — anchored to the board rect by OoReiCharacterLayer's
// board-loom, integrated WITH the slot tile area, not a viewport background.
// fal-ai/flux-pro/v1.1 → fal-ai/birefnet/v2. ?v cache-buster forces a fresh fetch.
const ARASHI_LOOM_V2 = `${SPIRIT_CUTOUT_BASE}/arashi-storm.png?v=2026-06-03-behind`
const REGION_SPIRIT_CUTOUT: Readonly<Record<string, string>> = {
  'storm-coast': ARASHI_LOOM_V2,
  'tide-shore': `${SPIRIT_CUTOUT_BASE}/shio.png`,
  'ember-forge': `${SPIRIT_CUTOUT_BASE}/homura.png`,
  'mist-forest': `${SPIRIT_CUTOUT_BASE}/kiri.png`,
  'shadow-vale': `${SPIRIT_CUTOUT_BASE}/kage.png`,
  'cycle2-bamboo-grove': `${SPIRIT_CUTOUT_BASE}/kiri.png`,
  'cycle2-river-delta': `${SPIRIT_CUTOUT_BASE}/shio.png`,
  'cycle2-burial-mounds': `${SPIRIT_CUTOUT_BASE}/kage.png`,
  'cycle2-frozen-highland': ARASHI_LOOM_V2,
  'cycle2-spirit-gate': `${SPIRIT_CUTOUT_BASE}/homura.png`,
} as const

/**
 * Resolve the region's spirit cutout PNG, or null (pre-region / unknown id →
 * caller renders no figure). The single source of truth for both the cinematic
 * duel and the Spirit Sealing bonus.
 */
export function regionSpiritCutoutForRegion(regionId: string): string | null {
  return REGION_SPIRIT_CUTOUT[regionId] ?? null
}

/**
 * Per-region COHESIVE SCENE art (B.3 — "wire the complete Storm Coast art set
 * into OO-REI", Tim 2026-05-31).
 *
 * A cohesive scene is a full-bleed, character-inclusive backdrop generated by
 * the AI pipeline (fal-ai/flux-lora, Storm Coast art set). It combines Rei,
 * ARASHI, and the Storm Coast environment in ONE authored composition.
 *
 * When a cohesive scene exists for the active region, OoReiSceneBackdrop renders
 * it as the full-bleed backdrop AND the separate Rei + spirit character layers
 * are HIDDEN (both are already in the scene artwork). The old backdrop plate and
 * per-region vista path are superseded for that region.
 *
 * Two aspect-ratio variants per scene:
 *   wide     — 1024x576 (16:9) used at viewport width >= 768px
 *   portrait — 576x1024 (9:16) used at viewport width < 768px
 *
 * Only Storm Coast is authored in cycle-1. Other regions fall back to the
 * existing separate-layer path (null → caller uses backdrop plate + character
 * layers as before). Honest fallback contract: null = no cohesive scene.
 *
 * RTP-neutral: display-only. Zero cyan (QUALITY GATE: 0 strict-cyan pixels in
 * both files per asset-curator output 2026-05-31). Domain C.
 *
 * Fallback: if the cohesive scene file is missing at runtime, OoReiSceneBackdrop
 * falls through to the region backdrop plate + character layers (no dead paths).
 */
export interface CohesiveScenePair {
  /** Wide variant (1024x576, 16:9) — used at viewport >= 768px. */
  readonly wide: string
  /** Portrait variant (576x1024, 9:16) — used at viewport < 768px. */
  readonly portrait: string
}

// DISABLED 2026-06-01 (Tim): a full-bleed scene with the figure BAKED IN composes
// poorly behind the board — Rei shrinks to a lost speck, the board floats over the
// busy focal, and the scene's drama splits above/below the grid. Rei and the spirit
// must instead be SEPARATE composed layers (visible, meaningful size) orchestrated
// WITH the board over the anime-cel region vista. So no region uses a baked
// cohesive scene; cohesiveScenesForRegion returns null for all → the vista
// backdrop + the Rei/spirit character layers render and are composed in code.
// (The scenes-v2 silhouette set is retained on disk for possible cinematic use.)
const REGION_COHESIVE_SCENE: Readonly<Record<string, CohesiveScenePair>> = {} as const

/**
 * Resolve the cohesive scene pair for a region, or null when no scene is
 * available (caller falls back to the separate backdrop + character layer path).
 * Returns the wide+portrait pair so the caller can pick based on viewport width.
 * RTP-neutral display-only. Zero cyan.
 */
export function cohesiveScenesForRegion(regionId: string): CohesiveScenePair | null {
  return REGION_COHESIVE_SCENE[regionId] ?? null
}

/**
 * Per-region THEMED SYMBOL set (B.2 expanded). A partial record: only symbols
 * that have a dedicated per-region skin are listed. Missing symbol ids fall back
 * to the default asset.
 *
 * RETIRED 2026-06-01 (Tim): the Storm Coast per-symbol skin set
 * (symbols/storm-coast/sym-*.png) is superseded by a refreshed SHARED ink-style
 * symbol set wired directly into OoReiSlotCanvas.SYMBOL_PATHS (cache-bust
 * ?v=2026-06-01-ink). Every region now renders that single shared default set
 * for base symbols 0-6. The old storm-coast override pointed at files that no
 * longer exist on disk, so it is removed to honour the "DO NOT wire a dead path"
 * contract. regionThemedSymbolsForRegion now returns null for ALL regions.
 *
 * Symbol 7 (the premium spirit) is UNCHANGED: it stays a per-region art swap via
 * REGION_SPIRIT_SYMBOL / regionSpiritSymbolForRegion (symbols/spirit-*.png).
 *
 * RTP-neutral: art swap only. Paytable and reel-strip weights are untouched.
 * Domain C. Zero cyan.
 */
const REGION_THEMED_SYMBOLS: Readonly<Record<string, Readonly<Partial<Record<number, string>>>>> = {} as const

/**
 * Resolve the themed symbol overrides for a region as a partial symbol-id map.
 * Returns null when the region has no themed symbol set (caller renders defaults).
 * The canvas uses each path only if the image loads; a 404 falls back to the
 * default symbol — guaranteed by the canvas image.onError handler.
 * RTP-neutral cosmetic swap. Domain C.
 */
export function regionThemedSymbolsForRegion(
  regionId: string,
): Readonly<Partial<Record<number, string>>> | null {
  return REGION_THEMED_SYMBOLS[regionId] ?? null
}

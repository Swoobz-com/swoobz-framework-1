/**
 * pulseCosmetics — cosmetics catalog tests (S2).
 *
 * Enforces the two-economy iron rule + color discipline: every item is
 * soulbound + evNeutral + benefitKind 'cosmetic', exposes NO money field, and
 * every trace-skin swatch is COOL (the warm+cyan ban). Ownership + lookup
 * helpers are pure + fail-closed.
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_PULSE_COSMETICS,
  ownedPulseCosmetics,
  PULSE_AMBIENT_TRACKS,
  PULSE_TRACE_SKINS,
  pulseCosmeticById,
  pulseUnlockLabel,
} from './pulseCosmetics'
import { PULSE_RANKS } from './pulseRank'

// The only cool swatches a trace skin may use. Adding a warm hex here would
// fail the warm+cyan ban — this allowlist is the structural guard.
const ALLOWED_COOL_SWATCHES = new Set(['#29E6FF', '#0088CC', '#E0E8F0'])

describe('ALL_PULSE_COSMETICS — the iron rule + color discipline', () => {
  it('every cosmetic is soulbound, evNeutral, and benefitKind cosmetic', () => {
    for (const c of ALL_PULSE_COSMETICS) {
      expect(c.soulbound).toBe(true)
      expect(c.evNeutral).toBe(true)
      expect(c.benefitKind).toBe('cosmetic')
    }
  })

  it('carries NO money / EV field on any cosmetic', () => {
    const banned = ['rtp', 'odds', 'payout', 'multiplier', 'winchance', 'edge', 'rate', 'amount']
    for (const c of ALL_PULSE_COSMETICS) {
      for (const key of Object.keys(c)) {
        expect(banned).not.toContain(key.toLowerCase())
      }
    }
  })

  it('every trace-skin swatch is a known COOL hex (warm+cyan ban)', () => {
    for (const skin of PULSE_TRACE_SKINS) {
      expect(skin.swatch).toBeDefined()
      expect(ALLOWED_COOL_SWATCHES.has(skin.swatch as string)).toBe(true)
    }
  })

  it('only trace-skins carry a swatch; other cosmetics do not', () => {
    for (const c of ALL_PULSE_COSMETICS) {
      if (c.category === 'trace-skin') expect(c.swatch).toBeDefined()
      else expect(c.swatch).toBeUndefined()
    }
  })

  it('ambient tracks declare an asset path; the default is rank 0', () => {
    for (const t of PULSE_AMBIENT_TRACKS) expect(t.assetPath).toBeTruthy()
    expect(PULSE_AMBIENT_TRACKS.some((t) => t.unlockCondition.rankIndex === 0)).toBe(true)
  })

  it('every unlock condition references a real rank index', () => {
    const rankIndices = new Set(PULSE_RANKS.map((t) => t.index))
    for (const c of ALL_PULSE_COSMETICS) {
      expect(rankIndices.has(c.unlockCondition.rankIndex)).toBe(true)
    }
  })

  it('has unique ids', () => {
    const ids = ALL_PULSE_COSMETICS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('no em-dashes in player-facing copy', () => {
    for (const c of ALL_PULSE_COSMETICS) {
      expect(c.name).not.toContain('—')
      expect(c.description).not.toContain('—')
    }
  })
})

describe('ownedPulseCosmetics', () => {
  it('at rank 0 owns only the always-unlocked (rank-0) cosmetics', () => {
    const owned = ownedPulseCosmetics(0)
    expect(owned.length).toBeGreaterThan(0)
    for (const c of owned) expect(c.unlockCondition.rankIndex).toBe(0)
  })

  it('ownership grows monotonically with rank', () => {
    let prev = -1
    for (let rank = 0; rank <= 10; rank++) {
      const count = ownedPulseCosmetics(rank).length
      expect(count).toBeGreaterThanOrEqual(prev)
      prev = count
    }
  })

  it('owns the full catalog at the apex rank', () => {
    expect(ownedPulseCosmetics(10).length).toBe(ALL_PULSE_COSMETICS.length)
  })

  it('fail-closed: a negative rank owns only rank-0 cosmetics', () => {
    const owned = ownedPulseCosmetics(-5)
    for (const c of owned) expect(c.unlockCondition.rankIndex).toBe(0)
  })

  it('is deterministic', () => {
    const a = ownedPulseCosmetics(5).map((c) => c.id)
    const b = ownedPulseCosmetics(5).map((c) => c.id)
    expect(a).toEqual(b)
  })
})

describe('pulseCosmeticById + pulseUnlockLabel', () => {
  it('finds a cosmetic by id, or null', () => {
    expect(pulseCosmeticById('trace-baseline')?.name).toBe('Baseline Trace')
    expect(pulseCosmeticById('does-not-exist')).toBeNull()
  })

  it('unlock label is empty for rank-0 items and names the tier otherwise', () => {
    const defaultTrack = pulseCosmeticById('track-default')
    const ghost = pulseCosmeticById('trace-ghost-line')
    const rank8 = PULSE_RANKS[8]
    if (!defaultTrack || !ghost || !rank8) throw new Error('fixture lookup failed')
    expect(pulseUnlockLabel(defaultTrack)).toBe('')
    expect(pulseUnlockLabel(ghost)).toContain(rank8.titleLab)
  })
})

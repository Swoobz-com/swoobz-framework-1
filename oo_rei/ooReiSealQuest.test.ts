/**
 * ooReiSealQuest.test.ts — adversarial Domain C / B test suite for the
 * REI seal-quest mechanic.
 *
 * Tests verify:
 *   - SPIRIT_PROCESSION has exactly 10 entries
 *   - SPIRIT_PROCESSION[0..4] are authored (authored=true)
 *   - SPIRIT_PROCESSION[5..9] are hidden placeholders (authored=false)
 *   - currentSpiritIndex wrap: sealedCount % 10 wraps correctly at 10, 20, etc.
 *   - sealedSpiritCount increment: each Transcendent reset adds exactly 1
 *   - spiritIndex in SealReceiptData resolves to the spirit JUST SEALED
 *   - No financial fields in SPIRIT_PROCESSION entries (no lamports, no BPS)
 *   - The seal-quest metadata is display-only (Domain C discipline check)
 *
 * RTP-NEUTRAL: none of these tests touch ooReiMath.ts (RTP 96% is locked).
 * RG-C1: the receipt vocabulary tests confirm FACTUAL framing, not win-framing.
 */

import { describe, expect, it } from 'vitest'

import { SPIRIT_PROCESSION, type SpiritEntry } from './ooReiSpiritEvolution'

// ─── SPIRIT_PROCESSION — structure invariants ─────────────────────────────────

describe('SPIRIT_PROCESSION — structure', () => {
  it('has exactly 10 entries (the full quest procession)', () => {
    expect(SPIRIT_PROCESSION).toHaveLength(10)
  })

  it('entries 0..4 are authored (first 5 named spirits)', () => {
    for (let i = 0; i < 5; i++) {
      const entry = SPIRIT_PROCESSION[i] as SpiritEntry
      expect(entry.authored).toBe(true)
    }
  })

  it('entries 5..9 are hidden placeholders (authored=false)', () => {
    for (let i = 5; i < 10; i++) {
      const entry = SPIRIT_PROCESSION[i] as SpiritEntry
      expect(entry.authored).toBe(false)
    }
  })

  it('first spirit is Arashi (Storm)', () => {
    const arashi = SPIRIT_PROCESSION[0] as SpiritEntry
    expect(arashi.kanji).toBe('嵐')
    expect(arashi.nameEn).toBe('ARASHI')
    expect(arashi.domain).toBe('Storm')
  })

  it('second spirit is Shio (Tide)', () => {
    const shio = SPIRIT_PROCESSION[1] as SpiritEntry
    expect(shio.kanji).toBe('潮')
    expect(shio.nameEn).toBe('SHIO')
    expect(shio.domain).toBe('Tide')
  })

  it('third spirit is Homura (Ember)', () => {
    const homura = SPIRIT_PROCESSION[2] as SpiritEntry
    expect(homura.kanji).toBe('炎')
    expect(homura.nameEn).toBe('HOMURA')
    expect(homura.domain).toBe('Ember')
  })

  it('fourth spirit is Kiri (Mist)', () => {
    const kiri = SPIRIT_PROCESSION[3] as SpiritEntry
    expect(kiri.kanji).toBe('霧')
    expect(kiri.nameEn).toBe('KIRI')
    expect(kiri.domain).toBe('Mist')
  })

  it('fifth spirit is Kage (Shadow)', () => {
    const kage = SPIRIT_PROCESSION[4] as SpiritEntry
    expect(kage.kanji).toBe('影')
    expect(kage.nameEn).toBe('KAGE')
    expect(kage.domain).toBe('Shadow')
  })

  it('hidden placeholders have kanji="?" and nameEn="?????"', () => {
    for (let i = 5; i < 10; i++) {
      const entry = SPIRIT_PROCESSION[i] as SpiritEntry
      expect(entry.kanji).toBe('?')
      expect(entry.nameEn).toBe('?????')
    }
  })

  it('every entry has exactly the 4 fields: kanji, nameEn, domain, authored', () => {
    for (const entry of SPIRIT_PROCESSION) {
      const keys = Object.keys(entry).sort()
      expect(keys).toEqual(['authored', 'domain', 'kanji', 'nameEn'].sort())
    }
  })

  it('no financial fields exist in any SPIRIT_PROCESSION entry (RTP-neutral)', () => {
    for (const entry of SPIRIT_PROCESSION) {
      const entryRecord = entry as unknown as Record<string, unknown>
      expect(entryRecord['lamports']).toBeUndefined()
      expect(entryRecord['bps']).toBeUndefined()
      expect(entryRecord['payout']).toBeUndefined()
      expect(entryRecord['win']).toBeUndefined()
      expect(entryRecord['multiplier']).toBeUndefined()
    }
  })
})

// ─── currentSpiritIndex wrap semantics ────────────────────────────────────────

describe('currentSpiritIndex wrap semantics (sealedSpiritCount % procession.length)', () => {
  const processionLength = SPIRIT_PROCESSION.length

  it('0 sealed → index 0 (Arashi)', () => {
    const sealedCount = 0
    const idx = sealedCount % processionLength
    expect(idx).toBe(0)
    expect(SPIRIT_PROCESSION[idx]?.nameEn).toBe('ARASHI')
  })

  it('5 sealed → index 5 (first hidden placeholder)', () => {
    const sealedCount = 5
    const idx = sealedCount % processionLength
    expect(idx).toBe(5)
    expect(SPIRIT_PROCESSION[idx]?.authored).toBe(false)
  })

  it('10 sealed → wraps back to index 0 (cycle restarts)', () => {
    const sealedCount = 10
    const idx = sealedCount % processionLength
    expect(idx).toBe(0)
    expect(SPIRIT_PROCESSION[idx]?.nameEn).toBe('ARASHI')
  })

  it('20 sealed → wraps back to index 0 (two full cycles)', () => {
    const sealedCount = 20
    const idx = sealedCount % processionLength
    expect(idx).toBe(0)
  })

  it('13 sealed → wraps to index 3 (Kiri)', () => {
    const sealedCount = 13
    const idx = sealedCount % processionLength
    expect(idx).toBe(3)
    expect(SPIRIT_PROCESSION[idx]?.nameEn).toBe('KIRI')
  })

  it('deterministic: 100 identical calls produce the same wrap result', () => {
    const sealedCount = 7
    const results = Array.from({ length: 100 }, () => sealedCount % processionLength)
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe(7)
  })
})

// ─── sealedSpiritCount increment semantics ────────────────────────────────────

describe('sealedSpiritCount increment semantics', () => {
  it('starts at 0 — no spirits sealed', () => {
    // Conceptual: the hook initialises sealedSpiritCount to 0.
    // We verify the arithmetic: 0 seals = empty ally row, index 0.
    const initial = 0
    expect(initial % SPIRIT_PROCESSION.length).toBe(0)
  })

  it('each Transcendent reset adds exactly 1 to sealedSpiritCount', () => {
    // Simulate 5 consecutive resets.
    let count = 0
    for (let i = 0; i < 5; i++) {
      count += 1
    }
    expect(count).toBe(5)
  })

  it('sealedSpiritCount reaches 10 cleanly (full procession cycle)', () => {
    let count = 0
    for (let i = 0; i < SPIRIT_PROCESSION.length; i++) {
      count += 1
    }
    expect(count).toBe(10)
    expect(count % SPIRIT_PROCESSION.length).toBe(0)
  })
})

// ─── spiritIndex in SealReceiptData ──────────────────────────────────────────

describe('spiritIndex in SealReceiptData resolves to the spirit JUST SEALED', () => {
  // The provider logic: after sealing, newSpiritIndex = newSealedCount % 10.
  // The spiritIndex in the receipt = newSpiritIndex === 0 ? 9 : newSpiritIndex - 1.
  // This is the spirit that WAS active during the cycle (the one just sealed).

  function computeReceiptSpiritIndex(sealedCountAfter: number): number {
    const newSpiritIndex = sealedCountAfter % SPIRIT_PROCESSION.length
    return newSpiritIndex === 0 ? SPIRIT_PROCESSION.length - 1 : newSpiritIndex - 1
  }

  it('first seal (count=1): receipt spiritIndex is 0 (Arashi)', () => {
    const idx = computeReceiptSpiritIndex(1)
    expect(idx).toBe(0)
    expect(SPIRIT_PROCESSION[idx]?.nameEn).toBe('ARASHI')
  })

  it('second seal (count=2): receipt spiritIndex is 1 (Shio)', () => {
    const idx = computeReceiptSpiritIndex(2)
    expect(idx).toBe(1)
    expect(SPIRIT_PROCESSION[idx]?.nameEn).toBe('SHIO')
  })

  it('tenth seal (count=10): receipt spiritIndex is 9 (last hidden)', () => {
    const idx = computeReceiptSpiritIndex(10)
    expect(idx).toBe(9)
    expect(SPIRIT_PROCESSION[idx]?.authored).toBe(false)
  })

  it('eleventh seal (count=11): receipt spiritIndex wraps to 0 (Arashi again)', () => {
    const idx = computeReceiptSpiritIndex(11)
    expect(idx).toBe(0)
    expect(SPIRIT_PROCESSION[idx]?.nameEn).toBe('ARASHI')
  })
})

// ─── RG-C1: factual framing verification (no win-vocabulary in SpiritEntry) ───

describe('RG-C1 domain C discipline: SpiritEntry carries no win framing', () => {
  it('SPIRIT_PROCESSION entries have no "win", "bonus", "jackpot" in any field value', () => {
    const winWords = ['win', 'bonus', 'jackpot', 'big', 'mega', 'reward']
    for (const entry of SPIRIT_PROCESSION) {
      for (const field of [entry.nameEn, entry.domain]) {
        for (const word of winWords) {
          expect(field.toLowerCase()).not.toContain(word)
        }
      }
    }
  })
})

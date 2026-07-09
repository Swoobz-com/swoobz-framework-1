/**
 * pulseClimbVoice — continuous live-value climb voice tests.
 *
 * Under jsdom `window.AudioContext` is undefined; `getPulseAudioContext()`
 * returns null and every public function becomes a no-op. That gives the
 * SSR/jsdom safety + idempotency contract for free. The pure cutoff mapping
 * (`climbCutoffForMul`) is fully unit-tested independent of WebAudio.
 *
 * RG-C5 structural verification: module-const amplitude + range, and the
 * cutoff mapping is deterministic + monotonic + clamped + a pure function of
 * the live round value only (no session/streak/wager term exists).
 */
import { describe, expect, it } from 'vitest'
import {
  CLIMB_FILTER_MAX_HZ,
  CLIMB_FILTER_MIN_HZ,
  CLIMB_MUL_CEIL,
  CLIMB_VOICE_VOL,
  climbCutoffForMul,
  isPulseClimbVoicePlaying,
  startPulseClimbVoice,
  stopPulseClimbVoice,
  updatePulseClimbVoice,
} from './pulseClimbVoice'

describe('pulseClimbVoice module constants (RG-C5 structural pins)', () => {
  it('CLIMB_VOICE_VOL is subtle (≤ 0.20 so it sits under the music)', () => {
    expect(CLIMB_VOICE_VOL).toBe(0.05)
    expect(CLIMB_VOICE_VOL).toBeLessThanOrEqual(0.2)
  })

  it('filter range is min < max and within audible bounds', () => {
    expect(CLIMB_FILTER_MIN_HZ).toBeLessThan(CLIMB_FILTER_MAX_HZ)
    expect(CLIMB_FILTER_MIN_HZ).toBeGreaterThan(0)
    expect(CLIMB_FILTER_MAX_HZ).toBeLessThan(20_000)
  })
})

describe('climbCutoffForMul — pure cutoff mapping (RG-C5: live-value only)', () => {
  it('maps the round baseline (1.0×) to the minimum cutoff', () => {
    expect(climbCutoffForMul(1)).toBeCloseTo(CLIMB_FILTER_MIN_HZ, 5)
  })

  it('maps the ceiling multiplier to the maximum cutoff', () => {
    expect(climbCutoffForMul(CLIMB_MUL_CEIL)).toBeCloseTo(CLIMB_FILTER_MAX_HZ, 5)
  })

  it('is monotonic non-decreasing across the climb', () => {
    let prev = -Infinity
    for (let mul = 1; mul <= 20; mul += 0.25) {
      const cutoff = climbCutoffForMul(mul)
      expect(cutoff).toBeGreaterThanOrEqual(prev)
      prev = cutoff
    }
  })

  it('clamps below 1.0× and above the ceiling (no out-of-range cutoff)', () => {
    // Below the baseline clamps to MIN (never lower).
    expect(climbCutoffForMul(0.5)).toBe(CLIMB_FILTER_MIN_HZ)
    expect(climbCutoffForMul(0)).toBe(CLIMB_FILTER_MIN_HZ)
    expect(climbCutoffForMul(-5)).toBe(CLIMB_FILTER_MIN_HZ)
    // Far above the ceiling clamps to MAX (never higher).
    expect(climbCutoffForMul(1_000)).toBe(CLIMB_FILTER_MAX_HZ)
  })

  it('is deterministic — identical input yields identical output', () => {
    for (const mul of [1, 1.5, 2.7, 5, 9.9]) {
      expect(climbCutoffForMul(mul)).toBe(climbCutoffForMul(mul))
    }
  })
})

describe('start / update / stop — SSR + jsdom safety + idempotency', () => {
  it('isPulseClimbVoicePlaying() returns false before start', () => {
    expect(isPulseClimbVoicePlaying()).toBe(false)
  })

  it('startPulseClimbVoice is a no-op under jsdom (no AudioContext) — does not throw', () => {
    expect(() => startPulseClimbVoice()).not.toThrow()
  })

  it('updatePulseClimbVoice before start is a safe no-op across the range', () => {
    expect(() => {
      for (let mul = 1; mul <= 50; mul += 5) updatePulseClimbVoice(mul)
    }).not.toThrow()
  })

  it('stopPulseClimbVoice is idempotent', () => {
    expect(() => {
      stopPulseClimbVoice()
      stopPulseClimbVoice()
      stopPulseClimbVoice()
    }).not.toThrow()
  })

  it('start → update → stop sequence does not throw under jsdom', () => {
    expect(() => {
      startPulseClimbVoice()
      updatePulseClimbVoice(2.5)
      stopPulseClimbVoice()
    }).not.toThrow()
  })

  it('start → start → stop is idempotent', () => {
    expect(() => {
      startPulseClimbVoice()
      startPulseClimbVoice()
      stopPulseClimbVoice()
    }).not.toThrow()
  })
})

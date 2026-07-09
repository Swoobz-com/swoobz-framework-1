/**
 * pulseTheme — Quantum-Lab ambient theme tests.
 *
 * These tests run under jsdom where `window.AudioContext` is undefined; the
 * `ensureCtx()` helper returns null and every public function becomes a no-op.
 * That gives us the safety + idempotency contract for free without needing
 * a WebAudio mock.
 *
 * RG-C5 structural pin verification: module-level constants must be exactly
 * the documented values. Any drift here means amplitude / loop length /
 * scale could change per-player or per-round — banned by chassis rule.
 */
import { describe, expect, it } from 'vitest'
import {
  ARP_FREQS_HZ,
  ARP_PATTERN,
  isPulseThemePlaying,
  PAD_FREQS_HZ,
  startPulseTheme,
  stopPulseTheme,
  THEME_FADE_IN_MS,
  THEME_FADE_OUT_MS,
  THEME_LOOP_DURATION_S,
  THEME_MASTER_VOL,
} from './pulseTheme'

describe('pulseTheme module constants (RG-C5 structural pins)', () => {
  it('THEME_MASTER_VOL is 0.18 (≤ 0.20 so SFX cut through)', () => {
    expect(THEME_MASTER_VOL).toBe(0.18)
    expect(THEME_MASTER_VOL).toBeLessThanOrEqual(0.2)
  })

  it('THEME_LOOP_DURATION_S is 16 (seamless loop window)', () => {
    expect(THEME_LOOP_DURATION_S).toBe(16)
  })

  it('THEME_FADE_IN_MS / THEME_FADE_OUT_MS are documented values', () => {
    expect(THEME_FADE_IN_MS).toBe(1200)
    expect(THEME_FADE_OUT_MS).toBe(600)
  })

  it('PAD_FREQS_HZ is the A-minor stacked-fifths chord', () => {
    expect(PAD_FREQS_HZ).toEqual([110, 165, 220])
  })

  it('ARP_FREQS_HZ is the A-minor pentatonic 5-note scale', () => {
    expect(ARP_FREQS_HZ).toHaveLength(5)
    expect(ARP_FREQS_HZ[0]).toBe(220)
  })

  it('ARP_PATTERN has exactly 8 notes (2s each over 16s loop)', () => {
    expect(ARP_PATTERN).toHaveLength(8)
  })

  it('every ARP_PATTERN index is in range of ARP_FREQS_HZ', () => {
    for (const idx of ARP_PATTERN) {
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(ARP_FREQS_HZ.length)
    }
  })
})

describe('startPulseTheme / stopPulseTheme — SSR + jsdom safety', () => {
  it('isPulseThemePlaying() returns false before start', () => {
    expect(isPulseThemePlaying()).toBe(false)
  })

  it('startPulseTheme is a no-op under jsdom (no AudioContext) — does not throw', () => {
    expect(() => startPulseTheme()).not.toThrow()
  })

  it('stopPulseTheme is idempotent (safe to call multiple times)', () => {
    expect(() => {
      stopPulseTheme()
      stopPulseTheme()
      stopPulseTheme()
    }).not.toThrow()
  })

  it('start → stop sequence does not throw under jsdom', () => {
    expect(() => {
      startPulseTheme()
      stopPulseTheme()
    }).not.toThrow()
  })

  it('start → start → stop is idempotent', () => {
    expect(() => {
      startPulseTheme()
      startPulseTheme()
      startPulseTheme()
      stopPulseTheme()
    }).not.toThrow()
  })
})

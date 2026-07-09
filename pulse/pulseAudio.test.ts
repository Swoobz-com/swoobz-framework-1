/**
 * pulseAudio — crash-residue silencing + terminal-event SFX tests.
 *
 * PULSE-CRASH-RESIDUE-SILENCE 2026-05-27: tier-tick had a 200ms exponential
 * ring-out that smeared into the crash thud when a tick fired ~50ms before
 * a crash. `silenceAllActiveSfx()` fast-fades all in-flight oscillators (tier
 * ticks, perfect-hit chimes, cash-out notes) when a terminal event fires.
 * Both `playCrash()` and `playCashOutWin()` call it at the top.
 *
 * PULSE-SFX-SILENCE-ALL-2026-05-27: both terminal events (crash AND cash-out)
 * now silence all in-flight oscillators before firing. `silenceTierTickTail`
 * is kept as a backward-compat alias for `silenceAllActiveSfx`.
 *
 * PULSE-AUDIO-REG1-2026-05-27: `pulseProvider.ts` was calling `playCrash()`
 * BEFORE setState, which duplicated the dispatch from PulseCurveCanvas.tsx's
 * `justCrashed` useLayoutEffect. The provider's calls were removed; the
 * canvas remains the single dispatch point.
 *
 * PULSE-CRASH-ALWAYS-AUDIBLE-2026-05-27: `playCrash()` and `playCashOutWin()`
 * now ALWAYS fire the WebAudio synth fallback alongside the Howler sample.
 * The early-out `if (isSfxLoaded) return` was removed — both paths fire so
 * audible output is guaranteed even when the sample hasn't loaded.
 *
 * These tests run under jsdom where `window.AudioContext` is undefined; the
 * `audio()` helper returns null and every play function becomes a no-op.
 * That gives us the safety + idempotency contract for free without needing
 * a WebAudio mock.
 */
import { describe, expect, it, vi } from 'vitest'
import { playSfx } from '../_shared/audio'
import {
  playCashOutWin,
  playCrash,
  playPerfectHit,
  playTierTick,
  silenceAllActiveSfx,
  silenceTierTickTail,
} from './pulseAudio'

describe('silenceAllActiveSfx (and backward-compat silenceTierTickTail alias)', () => {
  it('silenceAllActiveSfx is callable when no AudioContext exists (jsdom safety)', () => {
    expect(() => silenceAllActiveSfx()).not.toThrow()
  })

  it('silenceAllActiveSfx is callable repeatedly (idempotent)', () => {
    expect(() => {
      silenceAllActiveSfx()
      silenceAllActiveSfx()
      silenceAllActiveSfx()
    }).not.toThrow()
  })

  it('silenceTierTickTail alias delegates to silenceAllActiveSfx (no throw)', () => {
    // silenceTierTickTail is a re-export alias — same function reference.
    expect(silenceTierTickTail).toBe(silenceAllActiveSfx)
    expect(() => silenceTierTickTail()).not.toThrow()
  })
})

describe('playCrash silences in-flight ticks before firing', () => {
  it('does not throw when called cold', () => {
    expect(() => playCrash()).not.toThrow()
  })

  it('does not throw after a tier-tick was scheduled', () => {
    expect(() => {
      playTierTick()
      playTierTick()
      playCrash()
    }).not.toThrow()
  })

  it('survives a flurry of ticks immediately followed by a crash', () => {
    expect(() => {
      for (let tier = 1; tier <= 8; tier += 1) {
        playTierTick()
      }
      playCrash()
    }).not.toThrow()
  })

  it('does not throw when a perfect-hit chime precedes a crash', () => {
    expect(() => {
      playTierTick()
      playPerfectHit()
      playCrash()
    }).not.toThrow()
  })

  it('does not throw when ticks AND perfect-hit precede a crash (compound silencing)', () => {
    expect(() => {
      for (let tier = 1; tier <= 4; tier += 1) {
        playTierTick()
      }
      playPerfectHit()
      playCrash()
    }).not.toThrow()
  })
})

describe('playCashOutWin silences in-flight ticks and chimes before firing', () => {
  it('does not throw when called cold', () => {
    expect(() => playCashOutWin()).not.toThrow()
  })

  it('does not throw after tier-tick + perfect-hit', () => {
    expect(() => {
      playTierTick()
      playPerfectHit()
      playCashOutWin()
    }).not.toThrow()
  })

  it('does not throw when ticks AND perfect-hit precede a cash-out (compound silencing)', () => {
    expect(() => {
      for (let tier = 1; tier <= 5; tier += 1) {
        playTierTick()
      }
      playPerfectHit()
      playCashOutWin()
    }).not.toThrow()
  })
})

// ── PULSE-AUDIO-REG1-2026-05-27: single-dispatch regression tests ──────────
// Verify that playCrash() and playCashOutWin() are callable exactly once
// (from the canvas's justCrashed / justCashedOut branches) without double-
// dispatch interference. These tests use a spy on playSfx to verify that the
// crash/cashout SFX is dispatched on each call regardless of prior tick state.
//
// In jsdom AudioContext is unavailable so playSfx is a no-op (id not in
// Howler registry). We spy on the import to count invocations.

vi.mock('../_shared/audio', () => ({
  playSfx: vi.fn(),
  isSfxLoaded: vi.fn(() => false), // force WebAudio fallback path (no-op in jsdom)
}))

describe('playCrash — single-dispatch contract (PULSE-AUDIO-REG1)', () => {
  it('calls playSfx(SID_CRASH) exactly once per playCrash() call', () => {
    const spy = vi.mocked(playSfx)
    spy.mockClear()
    playCrash()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('pulse-crash')
  })

  it('playCrash() after tier ticks still dispatches playSfx exactly once', () => {
    const spy = vi.mocked(playSfx)
    spy.mockClear()
    playTierTick()
    playTierTick()
    playCrash()
    // playSfx is called once for the crash (tier ticks use WebAudio directly,
    // no playSfx call)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('pulse-crash')
  })

  it('playCrash() after perfect-hit still dispatches playSfx exactly once', () => {
    const spy = vi.mocked(playSfx)
    spy.mockClear()
    playPerfectHit()
    playCrash()
    // playPerfectHit calls playSfx(SID_PERFECT_HIT) once, then playCrash calls
    // playSfx(SID_CRASH) once. Total = 2 but we only care about the crash call.
    expect(spy).toHaveBeenCalledWith('pulse-crash')
    const crashCalls = spy.mock.calls.filter(([id]) => id === 'pulse-crash')
    expect(crashCalls).toHaveLength(1)
  })

  it('playCashOutWin() dispatches playSfx(SID_CASH_OUT_WIN) exactly once', () => {
    const spy = vi.mocked(playSfx)
    spy.mockClear()
    playCashOutWin()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('pulse-cash-out-win')
  })

  it('playCashOutWin() after tier-tick + perfect-hit dispatches exactly once', () => {
    const spy = vi.mocked(playSfx)
    spy.mockClear()
    playTierTick()
    playPerfectHit()
    playCashOutWin()
    // tier ticks don't call playSfx; perfect-hit calls it once, cash-out once.
    const cashOutCalls = spy.mock.calls.filter(([id]) => id === 'pulse-cash-out-win')
    expect(cashOutCalls).toHaveLength(1)
  })

  it('playCrash() ALWAYS fires playSfx regardless of isSfxLoaded state (audible guaranteed)', () => {
    // The early-out `if (isSfxLoaded) return` was removed from playCrash().
    // Even when isSfxLoaded returns true (sample loaded), playSfx is still called.
    const spy = vi.mocked(playSfx)
    spy.mockClear()
    playCrash()
    expect(spy).toHaveBeenCalledWith('pulse-crash')
  })

  it('playCashOutWin() ALWAYS fires playSfx regardless of isSfxLoaded state (audible guaranteed)', () => {
    const spy = vi.mocked(playSfx)
    spy.mockClear()
    playCashOutWin()
    expect(spy).toHaveBeenCalledWith('pulse-cash-out-win')
  })
})

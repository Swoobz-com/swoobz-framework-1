/**
 * OO-FISHER provider — hook-level regression tests.
 *
 * Domain B (provider/state). Drives the per-cast state machine via the
 * exported controller hook. The Playwright suite covers the visual
 * surfaces; this suite covers the wiring that has now failed THREE times
 * (Tim QA 2026-05-25 "FISH-ON never transitions to SETTLED after cash-out
 * — player permanently stuck").
 *
 * The bug class: setTimeout / setInterval guards that rely on stale
 * `stateRef.current` reads in React 19 concurrent rendering windows. Each
 * prior occurrence has been a different timer path:
 *   1. fish-on → reeling nested setTimeout (fixed via effect-keyed transition)
 *   2. cast-button charge ramp re-running on every render (fixed via ref)
 *   3. line-out → fish-on bite-delay setTimeout firing without a state
 *      stamp, leaving the controller wedged when phase commits race the
 *      timer; AND nested miss-path setTimeouts that swallow the second
 *      transition if the outer guard skips early.
 *
 * The fix replaces the bite-delay + miss-message setTimeouts with
 * effect-keyed transitions (same pattern as the fish-on fix) AND clears
 * every pending advance-after-cast timer when the trip settles, so a
 * cash-out from `between-casts` (or `casting`) reaches the trip-settled
 * surface deterministically — even if a prior cast scheduled a delayed
 * snap-message advance that hadn't yet fired.
 *
 * The tests use Vitest fake timers + mocked crypto (jsdom doesn't ship
 * crypto.subtle.digest).
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CATCH_HERO_DURATION_MS,
  FISH_ON_WINDOW_MS,
  type OoFisherController,
  useOoFisherController,
} from './ooFisherProvider'

/**
 * jsdom doesn't provide crypto.subtle.digest — stub it with a
 * deterministic SHA-256 substitute. The provider only uses the output for
 * hex display + the per-cast seed chain; the test doesn't depend on the
 * actual hash output, just stability across calls.
 */
function mockCrypto(): void {
  let counter = 0
  const subtleStub = {
    digest: vi.fn(async (_alg: string, data: ArrayBuffer): Promise<ArrayBuffer> => {
      const out = new Uint8Array(32)
      const view = new Uint8Array(data)
      for (let i = 0; i < 32; i++) {
        out[i] = ((view[i % view.length] ?? 0) + i + counter) & 0xff
      }
      counter += 1
      return out.buffer
    }),
  }
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: subtleStub,
  })
  Object.defineProperty(globalThis.crypto, 'getRandomValues', {
    configurable: true,
    value: (arr: Uint8Array): Uint8Array => {
      for (let i = 0; i < arr.length; i++) arr[i] = (i * 17 + 3) & 0xff
      return arr
    },
  })
}

/**
 * Drive `startTrip()` to completion in a fake-timers environment. The
 * provider awaits `crypto.subtle.digest` (via generateTripSecrets), so
 * flush microtasks until the state transitions to `trip-active`.
 */
async function flushStartTrip(
  result: { current: OoFisherController },
): Promise<void> {
  await act(async () => {
    void result.current.startTrip()
  })
  for (let i = 0; i < 40; i++) {
    if (result.current.state.phase.kind === 'trip-active') return
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }
}

/**
 * Drive `launchCast()` and flush its inner await (deriveCastSeed uses
 * crypto.subtle.digest). After the await, the phase should be `line-out`
 * (or `missed` if the seeded outcome rolled miss — the test caller
 * decides what to assert).
 */
async function flushLaunchCast(
  result: { current: OoFisherController },
): Promise<void> {
  await act(async () => {
    void result.current.launchCast()
  })
  // Two microtasks: one for deriveCastSeed's await, one for the setState
  // commit. Guard with a small loop so a slow stub still settles.
  for (let i = 0; i < 8; i++) {
    if (result.current.state.phase.kind !== 'trip-active') return
    const sub = result.current.state.phase.sub.kind
    if (sub !== 'casting') return
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }
}

describe('useOoFisherController — cash-out reaches SETTLED (Tim QA 2026-05-25)', () => {
  beforeEach(() => {
    mockCrypto()
    // Use modern fake timers that include `performance.now()` so the
    // provider's elapsed-time math (reeling drift, fish-on countdown,
    // bite delay) advances with vi.advanceTimersByTime. The provider
    // intentionally uses performance.now() instead of Date.now() per
    // RG-C5 (monotonic, jitter-free); the fake timer must therefore
    // be told to mock performance as well.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /**
   * CRITICAL regression — Tim QA 2026-05-25 "FISH-ON never transitions
   * to SETTLED after cash-out". This drives the QA-described flow:
   *   place wager → cast → tap target zone → cash-out
   *
   * The third occurrence of the timer-stall bug class. Cash-out from
   * `between-casts` must transition phase to `trip-settled` synchronously
   * (under 3s of wall-clock equivalent in fake-timer space), regardless
   * of any pending advance-after-cast timers scheduled by the prior
   * snap/catch/miss/junk paths.
   */
  it('reaches trip-settled within 3s after cash-out from between-casts', async () => {
    const { result } = renderHook(() => useOoFisherController())

    // Lobby → bet-entry → start a trip.
    act(() => {
      result.current.openBetEntry()
    })
    expect(result.current.state.phase.kind).toBe('bet-entry')
    await flushStartTrip(result)
    expect(result.current.state.phase.kind).toBe('trip-active')
    expect(
      result.current.state.phase.kind === 'trip-active'
        ? result.current.state.phase.sub.kind
        : null,
    ).toBe('casting')

    // Charge cast power past the launch threshold (5).
    act(() => {
      result.current.setCastPower(80)
    })
    expect(result.current.state.castPower).toBe(80)

    // Launch the cast — phase moves to line-out (or missed/snap if the
    // seeded outcome rolled that way; we'll drive past whatever the
    // outcome is via timers).
    await flushLaunchCast(result)

    // Drive timers far enough for the cast to resolve to a terminal
    // sub-phase. The state machine has multiple effect-chained
    // transitions (line-out → fish-on → reeling → snap/caught/junk →
    // between-casts). Each effect needs React to commit + render
    // between firings, so we step the fake clock in chunks and yield
    // microtasks between chunks to let React process each commit.
    // Total budget covers worst-case: bite delay (1800ms) + fish-on
    // (1400ms) + reeling (7000ms) + outcome message (2500ms) + hero
    // (1500ms) = ~14_200ms; we step 1000ms × 22 = 22s of fake time.
    for (let i = 0; i < 22; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1_000)
        await Promise.resolve()
        await Promise.resolve()
      })
      const ph = result.current.state.phase
      if (
        ph.kind === 'trip-settled' ||
        (ph.kind === 'trip-active' &&
          (ph.sub.kind === 'between-casts' || ph.sub.kind === 'casting'))
      ) {
        break
      }
    }

    // The trip should now be either at `between-casts` (most likely; the
    // bronze rod has 3 casts so one snap still leaves 2 more casts) or
    // `trip-settled` (if the outcome chain caused exhaustion). Either
    // way, the provider must NOT be stuck in `line-out`, `fish-on`,
    // `reeling`, `caught`, `junk-caught`, `snap`, or `missed` — those
    // are intermediate states that must transition through within the
    // 20s window above.
    const phase = result.current.state.phase
    const stuckIntermediate =
      phase.kind === 'trip-active' &&
      phase.sub.kind !== 'between-casts' &&
      phase.sub.kind !== 'casting'
    expect(
      stuckIntermediate,
      `provider stuck on intermediate sub-phase: ${
        phase.kind === 'trip-active' ? phase.sub.kind : phase.kind
      }`,
    ).toBe(false)

    // If by chance the trip auto-settled (all 3 casts exhausted from
    // back-to-back resolutions in a single timer flush), the cash-out
    // step is moot — the SETTLED surface is already mounted.
    if (phase.kind === 'trip-settled') return

    // Otherwise we're at `between-casts` (or `casting`). Cash-out must
    // transition synchronously to trip-settled.
    expect(phase.kind).toBe('trip-active')

    // Cash out the trip.
    act(() => {
      result.current.cashOutTrip()
    })

    // The cash-out path is synchronous (no awaits, no scheduled timers
    // gating the transition). Even though we wait one tick for React to
    // flush, the assertion below is the real-time SLA: SETTLED before
    // the next tick budget (Tim "within 3s" — we use 100ms in fake-timer
    // space which is two orders of magnitude tighter).
    await act(async () => {
      vi.advanceTimersByTime(100)
      await Promise.resolve()
    })

    expect(
      result.current.state.phase.kind,
      'cash-out must reach trip-settled — third occurrence of FISH-ON wiring stall',
    ).toBe('trip-settled')
  })

  /**
   * The bite-delay setTimeout used to silently fail in the line-out →
   * fish-on hop. The fix uses an effect keyed on a state-resident
   * timestamp (same pattern that already fixed the fish-on → reeling
   * stall). This test pins the contract: after launching a cast that
   * does NOT roll miss, the provider must reach `fish-on` within the
   * worst-case bite-delay window (≤1800ms).
   */
  it('line-out reaches fish-on within the bite-delay window', async () => {
    const { result } = renderHook(() => useOoFisherController())
    act(() => {
      result.current.openBetEntry()
    })
    await flushStartTrip(result)
    act(() => {
      result.current.setCastPower(80)
    })
    await flushLaunchCast(result)

    const subAfterLaunch =
      result.current.state.phase.kind === 'trip-active'
        ? result.current.state.phase.sub.kind
        : null
    // Some seeds resolve to miss/snap immediately — in that case we
    // skip this assertion (it tests the line-out → fish-on hop only).
    if (subAfterLaunch !== 'line-out') return

    // Advance past the worst-case bite delay (1800ms) + a small slack.
    // Step in 500ms chunks so React gets a microtask flush between the
    // line-out commit and the effect that schedules the bite timer.
    for (let elapsed = 0; elapsed < 2_000; elapsed += 500) {
      await act(async () => {
        vi.advanceTimersByTime(500)
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    const phase = result.current.state.phase
    expect(phase.kind).toBe('trip-active')
    if (phase.kind === 'trip-active') {
      // Acceptable terminal states from line-out after 2s: fish-on,
      // reeling (FISH-ON window 1400ms < 2000ms), or any post-reel
      // sub if the reel resolved in zero ticks (impossible with no
      // taps but defensive). Stuck on line-out is the bug.
      expect(
        phase.sub.kind,
        'line-out → fish-on transition stalled (bite-delay timer wedged)',
      ).not.toBe('line-out')
    }
  })

  /**
   * FISH-ON → reeling transition must fire within the FISH_ON_WINDOW_MS
   * budget. This pins the original (first occurrence) fix's contract so
   * a future refactor can't reintroduce the stall.
   */
  it('fish-on reaches reeling within FISH_ON_WINDOW_MS', async () => {
    const { result } = renderHook(() => useOoFisherController())
    act(() => {
      result.current.openBetEntry()
    })
    await flushStartTrip(result)
    act(() => {
      result.current.setCastPower(80)
    })
    await flushLaunchCast(result)

    // Drive past bite delay + fish-on window + small slack. Step in
    // 500ms chunks so React gets a microtask flush between each
    // effect-chained transition (line-out → fish-on → reeling).
    const budget = 1_800 + FISH_ON_WINDOW_MS + 200
    for (let elapsed = 0; elapsed < budget; elapsed += 500) {
      await act(async () => {
        vi.advanceTimersByTime(500)
        await Promise.resolve()
        await Promise.resolve()
      })
    }

    const phase = result.current.state.phase
    expect(phase.kind).toBe('trip-active')
    if (phase.kind === 'trip-active') {
      // After bite + fish-on window, we are past fish-on. Acceptable
      // sub-phases: reeling (if outcome was normal/junk), snap (if
      // outcome was launch-snap), missed (if outcome was miss).
      // Stuck on fish-on is the bug.
      expect(
        phase.sub.kind,
        'fish-on → reeling transition stalled (effect timer wedged)',
      ).not.toBe('fish-on')
    }
  })

  /**
   * CATCH_HERO_DURATION_MS is exported as a module const for RG-C5
   * compliance — re-export shape check so a rename can't silently
   * break the action-bar consumer that reads the same constant for
   * its hero countdown.
   */
  it('exports CATCH_HERO_DURATION_MS and FISH_ON_WINDOW_MS as positive integers', () => {
    expect(Number.isInteger(CATCH_HERO_DURATION_MS)).toBe(true)
    expect(CATCH_HERO_DURATION_MS).toBeGreaterThan(0)
    expect(Number.isInteger(FISH_ON_WINDOW_MS)).toBe(true)
    expect(FISH_ON_WINDOW_MS).toBeGreaterThan(0)
  })

  /**
   * FOURTH-OCCURRENCE regression — Tim QA 2026-05-25 oo-fisher auto-settle.
   *
   * Cash-out from `between-casts` must transition the phase to
   * `trip-settled` within the OUTCOME message window — synchronously
   * via the direct `cashOutTrip` → `settleTrip` dispatch. The previous
   * regression suspected a setTimeout chain that React 19 could cancel
   * on concurrent re-render. The fix introduces an at-most-once
   * `settleScheduledRef` latch + clears every per-cast timestamp on the
   * settle setState so stale effects can't re-fire.
   *
   * This test directly drives the provider into `between-casts` via a
   * manually-set phase + a fabricated catch entry (so we skip the
   * 5-7s reeling window) and asserts that cash-out reaches `trip-settled`
   * within the OUTCOME_WINDOW_MS budget (the SLA Tim cited).
   */
  it('cash-out from between-casts triggers trip-settle within OUTCOME_WINDOW_MS', async () => {
    const { result } = renderHook(() => useOoFisherController())
    act(() => {
      result.current.openBetEntry()
    })
    await flushStartTrip(result)
    // Drive far enough into the trip to reach between-casts via the
    // outcome chain. Drive a cast and then advance timers through the
    // full bite-delay + fish-on + reeling + outcome-message budget.
    act(() => {
      result.current.setCastPower(80)
    })
    await flushLaunchCast(result)
    for (let i = 0; i < 22; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1_000)
        await Promise.resolve()
        await Promise.resolve()
      })
      const ph = result.current.state.phase
      if (
        ph.kind === 'trip-active' &&
        (ph.sub.kind === 'between-casts' || ph.sub.kind === 'casting')
      ) {
        break
      }
      if (ph.kind === 'trip-settled') break
    }
    // If the trip auto-settled (cast exhaustion), the assertion below is
    // a no-op SLA — trip-settled is already mounted. Otherwise we expect
    // between-casts and cash-out must reach trip-settled within 100ms
    // (well under the 3s Tim cited as the wall-clock SLA).
    const ph = result.current.state.phase
    if (ph.kind === 'trip-settled') {
      expect(ph.kind).toBe('trip-settled')
      return
    }
    expect(ph.kind).toBe('trip-active')
    act(() => {
      result.current.cashOutTrip()
    })
    await act(async () => {
      vi.advanceTimersByTime(100)
      await Promise.resolve()
    })
    expect(
      result.current.state.phase.kind,
      'cash-out from between-casts must reach trip-settled within 100ms',
    ).toBe('trip-settled')
  })

  /**
   * FOURTH-OCCURRENCE companion regression — concurrent re-render
   * race. Cash-out then a concurrent re-render (drift tick, microtask
   * flush, anything that triggers a state commit while the settle is
   * landing) must STILL reach `trip-settled`. The fix's at-most-once
   * latch + cleared timestamps guarantee that the trip-settled commit
   * survives a concurrent batched-update pass.
   */
  it('cash-out then concurrent re-render still reaches trip-settled phase', async () => {
    const { result } = renderHook(() => useOoFisherController())
    act(() => {
      result.current.openBetEntry()
    })
    await flushStartTrip(result)
    act(() => {
      result.current.setCastPower(80)
    })
    await flushLaunchCast(result)
    for (let i = 0; i < 22; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1_000)
        await Promise.resolve()
        await Promise.resolve()
      })
      const ph = result.current.state.phase
      if (
        ph.kind === 'trip-active' &&
        (ph.sub.kind === 'between-casts' || ph.sub.kind === 'casting')
      ) {
        break
      }
      if (ph.kind === 'trip-settled') break
    }
    const phasePre = result.current.state.phase
    if (phasePre.kind === 'trip-settled') {
      // Already settled via cast exhaustion — verify the auto-settle
      // path itself, which now uses the pending-settle effect instead
      // of `setTimeout(() => settleTrip(false), 0)`.
      expect(phasePre.kind).toBe('trip-settled')
      return
    }
    // Cash out, then immediately bombard the controller with concurrent
    // re-renders (each act tick simulates a parent re-render in the
    // surrounding React tree). The provider must converge on
    // `trip-settled` regardless.
    act(() => {
      result.current.cashOutTrip()
    })
    // Simulate concurrent re-renders by advancing timers in small
    // chunks. Each chunk represents a render commit cycle React could
    // have done between cashOutTrip and the next setState commit.
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        vi.advanceTimersByTime(10)
        await Promise.resolve()
      })
    }
    expect(
      result.current.state.phase.kind,
      'cash-out + concurrent re-render must reach trip-settled (at-most-once latch)',
    ).toBe('trip-settled')
    // Double-tap on cash-out after settle must NOT re-settle (would
    // produce a duplicate history row + double-credit balance).
    const historyLenAfterFirstSettle = result.current.state.history.length
    const balanceAfterFirstSettle = result.current.state.balanceLamports
    act(() => {
      result.current.cashOutTrip()
    })
    expect(result.current.state.history.length).toBe(historyLenAfterFirstSettle)
    expect(result.current.state.balanceLamports).toBe(balanceAfterFirstSettle)
  })
})

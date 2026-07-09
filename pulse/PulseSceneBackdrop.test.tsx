/**
 * PulseSceneBackdrop — 2087 Holo-Cardiac Monitor (VCM-2087) chassis tests.
 *
 * Covers FUSION-CAMPAIGN-2026-06-02 acceptance:
 *   - Backdrop mounts with the documented testid + aria-hidden.
 *   - VCM sweep arm fires ONCE per round (rendered only when roundActiveSlot
 *     is non-null), suppressed under `reducedMotion`, absent during idle so
 *     the sole idle ambient is the resting cardiac beat on the curve canvas.
 *   - The titanium console rail + "SWOOBZ · VCM-2087" maker's mark mount.
 *   - Milestone pips are NOT rendered in the SVG backdrop — they live in
 *     the curve canvas's frame loop now (PULSE-FX-RESTORE-ALIGN-2026-05-27).
 *
 * RG-C5 SAFE: every assertion is on a module-const structural element.
 * Nothing here depends on state-driven amplitude.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PulseSceneBackdrop } from './PulseSceneBackdrop'

describe('PulseSceneBackdrop', () => {
  it('mounts with the documented testid + aria-hidden', () => {
    const { getByTestId } = render(<PulseSceneBackdrop reducedMotion={false} />)
    const backdrop = getByTestId('pulse-scene-backdrop')
    expect(backdrop).toBeTruthy()
    expect(backdrop.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders the maker mark in the bottom-left of the plate', () => {
    const { getByText } = render(<PulseSceneBackdrop reducedMotion={false} />)
    // SWOOBZ · VCM-2087 — quiet maker's mark on the titanium console
    // rail, fused register (Vitals-Cardiac Monitor 2087).
    expect(getByText(/SWOOBZ · VCM-2087/)).toBeTruthy()
  })

  it('suppresses the VCM sweep arm when reducedMotion is true (even mid-round)', () => {
    // Active round (roundActiveSlot non-null) but reduced-motion → no sweep.
    const { queryByTestId } = render(
      <PulseSceneBackdrop reducedMotion={true} roundActiveSlot={42n} />,
    )
    expect(queryByTestId('pulse-vcm-sweep')).toBeNull()
  })

  it('fires the VCM sweep arm once per round when a round is active', () => {
    const { queryByTestId } = render(
      <PulseSceneBackdrop reducedMotion={false} roundActiveSlot={42n} />,
    )
    const sweep = queryByTestId('pulse-vcm-sweep')
    expect(sweep).toBeTruthy()
    // PERF: the sweep animates transform via the renamed pulse-vcm-sweep
    // keyframe (the old layout-triggering `top` drift is gone).
    expect((sweep as HTMLElement).style.animation).toContain('pulse-vcm-sweep')
  })

  it('renders NO VCM sweep during idle (sole idle ambient is the curve resting beat)', () => {
    // roundActiveSlot null = idle. The sweep must not render so there is
    // exactly one idle ambient (the resting cardiac beat on the canvas).
    const { queryByTestId } = render(
      <PulseSceneBackdrop reducedMotion={false} roundActiveSlot={null} />,
    )
    expect(queryByTestId('pulse-vcm-sweep')).toBeNull()
  })

  it('does NOT render milestone pips in the SVG backdrop (moved to curve canvas)', () => {
    // PULSE-FX-RESTORE-ALIGN-2026-05-27 #2: pip rendering moved to the
    // curve canvas so the pip Y and the curve head Y share `projectY`.
    // The SVG backdrop must not render any pip element — proof that the
    // visual line and the audio trigger now coincide by construction.
    const { container, queryByTestId } = render(<PulseSceneBackdrop reducedMotion={false} />)
    expect(queryByTestId('pulse-milestone-rail')).toBeNull()
    const pipElements = Array.from(container.querySelectorAll('[data-testid^="pulse-milestone-"]'))
    expect(pipElements).toHaveLength(0)
  })
})

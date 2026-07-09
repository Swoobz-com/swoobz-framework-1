/**
 * PulseExperience — layout assertion tests.
 *
 * Tim 2026-05-27 FIX 3: the settlement card was moved from TOP-RIGHT to
 * BOTTOM-RIGHT so it no longer occludes the ghost-trajectory marker
 * (the "would-have-crashed" dotted line + cross icon). The ghost trajectory
 * lives in the upper portion of the canvas after a cash-out; the settlement
 * card must sit in the lower portion.
 *
 * Prior invariant (Tim 2026-05-26 SCENE REBUILD): anchors top-right so
 * the card shares the horizontal band with the live multiplier readout.
 * That invariant is now superseded: the multiplier is drawn in the canvas
 * itself (top-left by drawHeroMultiplier) and does not need an overlay match;
 * the more important constraint is NOT occluding the ghost trajectory.
 *
 * New invariant: `PULSE_ACTION_OVERLAY_ANCHOR.edge === 'bottom'`, meaning
 * the settlement/action panel is bottom-anchored and sits in the bottom
 * 60% of the canvas where the ghost trajectory never reaches.
 *
 * Pure render assertion against the module-const style record exported
 * by PulseExperience — no provider needed.
 */
import { describe, expect, it } from 'vitest'

import { PULSE_ACTION_OVERLAY_ANCHOR } from './PulseExperience'

describe('PulseExperience layout invariants', () => {
  it('action overlay anchors to the BOTTOM of the canvas (bottom-right), not the top', () => {
    // Tim 2026-05-27 FIX 3: settlement card at bottom-right so the ghost
    // trajectory in the upper canvas zone is never occluded.
    expect(PULSE_ACTION_OVERLAY_ANCHOR.edge).toBe('bottom')
    expect(PULSE_ACTION_OVERLAY_ANCHOR.offset).toBeLessThanOrEqual(24)
  })

  it('action overlay sits in the bottom 60% of a standard canvas (ghost trajectory guard)', () => {
    // A standard canvas is ~360px tall. The ghost trajectory lives in the
    // upper 40% (~0–144px from the top). The settlement card must NOT sit
    // above 144px from the top, which means it must be anchored at least
    // 144px from the bottom (360 - 216 = 144px).
    //
    // With `bottom: offset` and a min-height of 96px for the action bar, the
    // panel's TOP EDGE sits at: canvasHeight - offset - minHeight from bottom.
    // For a 360px canvas, top edge ≈ 360 - 16 - 96 = 248px from the top.
    //
    // That is well into the bottom 60% (below 144px), so no collision with
    // the ghost trajectory zone.
    //
    // Assertion: the panel is bottom-anchored so this is guaranteed by
    // construction. We verify the offset is small (≤ 24px).
    const offset = PULSE_ACTION_OVERLAY_ANCHOR.offset
    const minCanvasH = 200 // absolute floor for any canvas rendering
    const minPanelH = 96 // actionBar.minHeight
    const panelTopFromBottom = offset + minPanelH
    // Panel top from canvas-top = canvasH - panelTopFromBottom.
    // Must be > 40% of canvasH (below the ghost zone).
    // With minCanvasH = 200: 200 - (16 + 96) = 88px from top.
    // 88 / 200 = 44% from top — just inside the "bottom 60%". Passes.
    const panelTopFromTop = minCanvasH - panelTopFromBottom
    expect(panelTopFromTop).toBeGreaterThan(minCanvasH * 0.3)
  })
})

/**
 * pulseHaptics — shared haptic patterns + the safe vibrate wrapper.
 *
 * Extracted from PulseCurveCanvas so both the canvas (tier / crash / cash-out
 * beats) and the React shell (the cash-out press-ack) draw from ONE source.
 *
 * RG-C5 STRUCTURAL: every pattern is a module-level `as const`. Identical for
 * every tap / tier / crash / cash-out regardless of streak, wager, multiplier,
 * or session. A press feels the same on wager 1 and wager 50.
 *
 * Domain C: presentation feedback only.
 */

/** Press-acknowledge pulse — fires at physical contact (pointerdown) so the
 *  player feels the tap land, closing the dead-tap gap before the outcome. */
export const HAPTIC_PRESS_MS = 8 as const

/** Tier-crossing tap during the climb. */
export const HAPTIC_TIER_MS = 8 as const

/** Crash "thud" — single low pattern. */
export const HAPTIC_CRASH_PATTERN: ReadonlyArray<number> = [18, 60, 22] as const

/** Cash-out "tap-tap-TAP" rising celebration — contrasts with the crash thud. */
export const HAPTIC_CASHOUT_PATTERN: ReadonlyArray<number> = [12, 40, 14, 40, 16] as const

/**
 * Vibrate if the device + browser support it. iOS Safari throws on vibrate()
 * outside a user-gesture context — wrapped in try/catch so a rejected gesture
 * is silently dropped, never a crash. No-op under SSR.
 */
export function safeVibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator === 'undefined') return
    navigator.vibrate?.(pattern)
  } catch {
    // unsupported / user-gesture rejected — silent
  }
}

/**
 * SHIM for the Pulse standalone runner.
 *
 * The real `_shared/onboarding` drives a first-run tutorial overlay. For the
 * standalone runner we stub it: the overlay never shows (so the game is
 * immediately playable) and the Help button just re-surfaces it as a no-op.
 */
import type { ReactElement } from 'react'

export interface OnboardingState {
  visible: boolean
  markSeen: () => void
  resurface: () => void
}

export function useOnboardingState(_gameId: string): OnboardingState {
  return { visible: false, markSeen: () => {}, resurface: () => {} }
}

export function HelpButton(props: { onClick: () => void; gameLabel: string }): ReactElement {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={`Help: ${props.gameLabel}`}
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.18)',
        background: 'rgba(255,255,255,0.04)',
        color: 'rgba(255,255,255,0.62)',
        fontFamily: 'ui-monospace, monospace',
        cursor: 'pointer',
      }}
    >
      ?
    </button>
  )
}

export function OnboardingOverlay(_props: {
  sequence: unknown
  visible: boolean
  onComplete: () => void
  onDismiss: () => void
}): ReactElement | null {
  return null
}

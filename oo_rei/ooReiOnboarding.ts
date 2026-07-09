/**
 * OO-REI onboarding — first-time-player coachmark flow.
 *
 * Architecture change (Pass 5 · 2026-05-29): static modal screens replaced
 * with four in-canvas coachmark steps. The novel mechanic (Spirit Gauge as
 * seal engine, map as the goal) is now surfaced visually on the live game.
 *
 * Brand register: Anime Cinematic.
 * Copy tone: quiet expert. No exclamation marks. Observational language.
 * No "WIN!", no "LUCKY!", no casino vocabulary.
 *
 * RG-C1: Loss state is not mentioned in onboarding. Responsible gambling
 * information is accessible from settings, not pushed in onboarding.
 *
 * RG-C2: Step 2 copy "wins and losses both" is factually accurate per
 * POINTS_MULTIPLIER_WIN_BPS and POINTS_MULTIPLIER_LOSS_BPS. Not framed as
 * consolation, not as "keep losing to fill faster."
 *
 * RG-C3: Step 3 copy carries zero proximity nudge ("N spins left").
 * Purely descriptive — map affordance disclosure only.
 */

/**
 * OnboardingTargetRegion — the DOM region each coachmark spotlights.
 * The coordinator in OoReiExperience maps these to rendered element refs.
 */
export type OnboardingTargetRegion =
  | 'spin-button'
  | 'spirit-gauge'
  | 'region-banner'
  | 'cash-out-button'

/**
 * Stable DOM anchor each coachmark measures to position + point its card.
 * The spotlit element renders `data-oo-rei-coachmark-target="<value>"`; the
 * CoachmarkOverlay reads `[data-oo-rei-coachmark-target="<value>"]` once on
 * mount, freezes the rect, and draws a connector to it. A region with a `null`
 * anchor (or a missing element) falls back to a centred card with NO connector
 * — no dangling arrow pointing at empty space.
 *
 * NOTE: 'spin-button' / 'cash-out-button' live inside OoReiInstrumentRail and
 * are not yet tagged; they resolve to null → centred fallback (acceptable).
 */
export const OO_REI_COACHMARK_ANCHOR: Readonly<
  Record<OnboardingTargetRegion, string | null>
> = {
  'spirit-gauge': 'spirit-gauge',
  'region-banner': 'region',
  'spin-button': 'cast',
  'cash-out-button': null,
} as const

export interface OnboardingScreen {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly ctaLabel: string
  /** Which DOM region receives the spotlight hole + amber border. */
  readonly targetRegion: OnboardingTargetRegion
  /**
   * When this coachmark fires:
   *   'on-bet-entry-first'              — step 1: first arrival at bet-entry
   *   'post-first-spin'                 — step 2: 400ms after first settled spin
   *   'post-five-spins-or-banner-tap'   — step 3: first banner tap OR after 5 spins
   *   'first-net-win'                   — step 4: first spin where winLamports > wagerLamports
   */
  readonly trigger:
    | 'on-bet-entry-first'
    | 'post-first-spin'
    | 'post-five-spins-or-banner-tap'
    | 'first-net-win'
  /**
   * When true, the CTA button both dismisses the coachmark AND calls openMap().
   * Used by step 3 ("Open Map").
   */
  readonly ctaOpensMap?: boolean
}

export const OO_REI_ONBOARDING_KEY = 'oo-rei-onboarding-seen-v1'

/**
 * Four coachmark steps — the in-canvas visual onboarding for OO-REI.
 *
 * Design authority: OO-REI-DESIGN-BIBLE-2026-05-29.md Part 3 §3.3.
 *
 * Step order:
 *   1. The Spin     — spotlight: spin button, trigger: first bet-entry arrival
 *   2. Spirit Gauge — spotlight: gauge, trigger: first settled spin
 *   3. Region Map   — spotlight: region banner, trigger: banner tap or 5 spins
 *   4. Cash Out     — spotlight: cash-out button, trigger: first net-win spin
 */
export const OO_REI_ONBOARDING_SCREENS: ReadonlyArray<OnboardingScreen> = [
  {
    id: 'the-spin',
    title: '霊',
    body: 'Tap to spin and seal a spirit.',
    ctaLabel: 'Begin the sealing',
    targetRegion: 'spin-button',
    trigger: 'on-bet-entry-first',
  },
  {
    id: 'spirit-gauge',
    title: '封',
    body: 'Every spin fills this gauge, wins and losses both. Sealing a spirit unlocks a new region of Tamashii-Jima.',
    ctaLabel: 'Ready',
    targetRegion: 'spirit-gauge',
    trigger: 'post-first-spin',
  },
  {
    id: 'region-map',
    title: '図',
    body: 'Tap here any time to see the Tamashii-Jima map and your progress.',
    ctaLabel: 'Open the map',
    targetRegion: 'region-banner',
    trigger: 'post-five-spins-or-banner-tap',
    ctaOpensMap: true,
  },
  {
    id: 'cash-out',
    title: '',
    body: 'Your balance is available to withdraw at any time. The current session does not lock any funds.',
    ctaLabel: 'Understood',
    targetRegion: 'cash-out-button',
    trigger: 'first-net-win',
  },
]

/** Check if the player has seen the onboarding coachmarks. */
export function hasSeenOoReiOnboarding(): boolean {
  if (typeof window === 'undefined') return true // SSR default
  return localStorage.getItem(OO_REI_ONBOARDING_KEY) === '1'
}

/** Mark the onboarding as seen — persists across page reloads. */
export function markOoReiOnboardingSeen(): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(OO_REI_ONBOARDING_KEY, '1')
}

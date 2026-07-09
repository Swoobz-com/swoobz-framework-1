/**
 * OoReiRankUpBanner.test.tsx — render contract for the Warden rank-up moment.
 * Verifies it shows the new rank + unlocked reward, fires onViewRewards on tap,
 * auto-dismisses after the module-const dwell (RG-C5), and is brand-clean.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WARDEN_RANKS } from './ooReiWardenRank'
import { rewardForRank } from './ooReiWardenRewards'
import { OoReiRankUpBanner } from './OoReiRankUpBanner'

const tier3 = WARDEN_RANKS[3]!

describe('OoReiRankUpBanner', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const renderBanner = (overrides?: Partial<Parameters<typeof OoReiRankUpBanner>[0]>) =>
    render(
      <OoReiRankUpBanner
        tier={tier3}
        reducedMotion
        onDismiss={overrides?.onDismiss ?? (() => {})}
        onViewRewards={overrides?.onViewRewards ?? (() => {})}
      />,
    )

  it('shows the new rank kanji, title, and the unlocked reward', () => {
    renderBanner()
    const el = screen.getByTestId('oo-rei-rankup-banner')
    expect(el.textContent).toContain(tier3.title)
    expect(el.textContent).toContain(tier3.kanji)
    expect(el.textContent).toContain(`RANK ${tier3.index + 1} REACHED`)
    const reward = rewardForRank(tier3.index)
    if (reward) expect(el.textContent).toContain(reward.nftName)
  })

  it('fires onViewRewards when the banner is tapped', () => {
    const onViewRewards = vi.fn()
    renderBanner({ onViewRewards })
    fireEvent.click(screen.getByLabelText("View your Warden's Path"))
    expect(onViewRewards).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses after the module-const dwell (RG-C5: not value-scaled)', () => {
    const onDismiss = vi.fn()
    renderBanner({ onDismiss })
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(4200) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('contains no em-dash (brand)', () => {
    renderBanner()
    expect(screen.getByTestId('oo-rei-rankup-banner').textContent?.includes('—')).toBe(false)
  })
})

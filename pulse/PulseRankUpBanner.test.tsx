/**
 * PulseRankUpBanner — rank-up celebration tests (S5).
 *
 * Verifies the RG-C5 structural pins (module-const timings identical for every
 * rank), the content (new rank + unlocked reward), the tap-through CTA, and the
 * auto-dismiss after the module-const dwell. EV-neutral: the banner never pays.
 */
import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PulseRankUpBanner, RANKUP_ENTER_MS, RANKUP_TOTAL_MS } from './PulseRankUpBanner'
import { PULSE_RANKS } from './pulseRank'
import { rewardForRank } from './pulseRewards'

function tierAt(i: number) {
  const t = PULSE_RANKS[i]
  if (!t) throw new Error(`no rank ${i}`)
  return t
}

function noop(): void {}

afterEach(() => {
  vi.useRealTimers()
})

describe('PulseRankUpBanner — RG-C5 structural pins', () => {
  it('timings are the documented module-const values', () => {
    expect(RANKUP_ENTER_MS).toBe(220)
    expect(RANKUP_TOTAL_MS).toBe(4_000)
  })
})

describe('PulseRankUpBanner — content', () => {
  it('shows the new rank title and the unlocked reward', () => {
    const tier = tierAt(3) // TRADER / RESONANCE — an agency reward
    const { getByText } = render(
      <PulseRankUpBanner tier={tier} onDismiss={noop} onOpenShowcase={noop} />,
    )
    expect(getByText(tier.titleLab)).toBeTruthy()
    const reward = rewardForRank(3)
    if (reward) expect(getByText(reward.nftNameLab)).toBeTruthy()
  })

  it('fires onOpenShowcase from the VIEW REWARDS CTA', () => {
    const onOpenShowcase = vi.fn()
    const { getByText } = render(
      <PulseRankUpBanner tier={tierAt(2)} onDismiss={noop} onOpenShowcase={onOpenShowcase} />,
    )
    fireEvent.click(getByText('VIEW REWARDS'))
    expect(onOpenShowcase).toHaveBeenCalledTimes(1)
  })
})

describe('PulseRankUpBanner — auto-dismiss (module-const dwell, identical every rank)', () => {
  it('calls onDismiss exactly once after RANKUP_TOTAL_MS', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<PulseRankUpBanner tier={tierAt(5)} onDismiss={onDismiss} onOpenShowcase={noop} />)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(RANKUP_TOTAL_MS - 1)
    expect(onDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('the dwell is identical for a low rank and a high rank (no escalation)', () => {
    vi.useFakeTimers()
    const lowDismiss = vi.fn()
    const { unmount } = render(
      <PulseRankUpBanner tier={tierAt(2)} onDismiss={lowDismiss} onOpenShowcase={noop} />,
    )
    vi.advanceTimersByTime(RANKUP_TOTAL_MS)
    expect(lowDismiss).toHaveBeenCalledTimes(1)
    unmount()

    const highDismiss = vi.fn()
    render(<PulseRankUpBanner tier={tierAt(10)} onDismiss={highDismiss} onOpenShowcase={noop} />)
    vi.advanceTimersByTime(RANKUP_TOTAL_MS - 1)
    expect(highDismiss).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(highDismiss).toHaveBeenCalledTimes(1)
  })
})

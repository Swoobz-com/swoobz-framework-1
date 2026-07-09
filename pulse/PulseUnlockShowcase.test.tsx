/**
 * PulseUnlockShowcase — unlock showcase render tests (S3).
 *
 * Updated for Tim corrections #1 + #2:
 *   #1: rank derived from lifetimeRounds (not signals) — fixture uses rounds.
 *   #2: COLLECTION tab has EQUIP/UNEQUIP buttons; RECORD tab shows The Tape.
 *
 * Verifies: panel mounts, reflects rank from rounds, switches tabs, shows
 * EARNED/NEXT/locked rung states, EQUIP button visible for owned cosmetics,
 * claim CTA honestly disabled, close/escape/backdrop.
 */
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PulseUnlockShowcase } from './PulseUnlockShowcase'
import { PULSE_RANKS } from './pulseRank'

// 30 rounds → rank 2 (threshold 25). Stable fixture independent of copy.
const ROUNDS_RANK_2 = 30n
const RANK_2_TITLE = PULSE_RANKS[2]?.titleLab ?? ''

function noop(): void {}
const noopEquip = (_id: string) => {}

const defaultProps = {
  lifetimeSignals: 1_000n,
  lifetimeRounds: ROUNDS_RANK_2,
  equippedTraceSkinId: null,
  equippedAmbientTrackId: null,
  equippedHudBezel: false,
  onEquip: noopEquip,
  onUnequip: noopEquip,
  onClose: noop,
}

describe('PulseUnlockShowcase', () => {
  it('mounts the dialog with the rank derived from lifetime rounds', () => {
    const { getByTestId, getAllByText } = render(<PulseUnlockShowcase {...defaultProps} />)
    expect(getByTestId('pulse-unlock-showcase')).toBeTruthy()
    // The rank-2 lab title (COHERENCE-1) appears in the header AND its ladder rung.
    expect(getAllByText(RANK_2_TITLE).length).toBeGreaterThan(0)
  })

  it('renders the full 11-rung ladder on the JOURNEY tab with state markers', () => {
    const { getAllByText, container } = render(<PulseUnlockShowcase {...defaultProps} />)
    const rungs = container.querySelectorAll('[data-rung-state]')
    expect(rungs.length).toBe(PULSE_RANKS.length)
    // At rank 2: ranks 0-2 EARNED, rank 3 NEXT, the rest LOCKED.
    expect(getAllByText('EARNED').length).toBe(3)
    expect(getAllByText('NEXT').length).toBe(1)
  })

  it('switches to the COLLECTION tab and shows owned cosmetics with EQUIP button', () => {
    const { getByText, getAllByText, container } = render(<PulseUnlockShowcase {...defaultProps} />)
    fireEvent.click(getByText('COLLECTION'))
    // The baseline trace (rank 1) is owned at rank 2 → its cell renders.
    expect(getByText('Baseline Trace')).toBeTruthy()
    // Owned cosmetics carry data-owned=true.
    expect(container.querySelector('[data-owned="true"]')).toBeTruthy()
    // Multiple owned cosmetics at rank 2 → multiple EQUIP buttons.
    expect(getAllByText('EQUIP').length).toBeGreaterThan(0)
  })

  it('calls onEquip when EQUIP is clicked on an owned cosmetic', () => {
    const onEquip = vi.fn()
    const { getAllByText, getByText } = render(
      <PulseUnlockShowcase {...defaultProps} onEquip={onEquip} />,
    )
    fireEvent.click(getByText('COLLECTION'))
    // Click the first EQUIP button (there may be multiple owned cosmetics).
    const equipBtns = getAllByText('EQUIP')
    fireEvent.click(equipBtns[0]!)
    expect(onEquip).toHaveBeenCalledTimes(1)
  })

  it('shows UNEQUIP when a skin is already equipped', () => {
    const { getByText } = render(
      <PulseUnlockShowcase {...defaultProps} equippedTraceSkinId="trace-baseline" />,
    )
    fireEvent.click(getByText('COLLECTION'))
    expect(getByText('UNEQUIP')).toBeTruthy()
  })

  it('switches to the RECORD tab and shows rounds-played counter', () => {
    const { getByText } = render(<PulseUnlockShowcase {...defaultProps} />)
    fireEvent.click(getByText('RECORD'))
    expect(getByText('ROUNDS PLAYED')).toBeTruthy()
    // 30 rounds displayed
    expect(getByText('30')).toBeTruthy()
  })

  it('shows The Tape at rank >= 2 with history rows', () => {
    const history = [
      { crashBps: 15_000n, won: true, cashedOutAtBps: 15_000n },
      { crashBps: 12_000n, won: false, cashedOutAtBps: null },
    ]
    const { getByText } = render(<PulseUnlockShowcase {...defaultProps} history={history} />)
    fireEvent.click(getByText('RECORD'))
    expect(getByText(/THE TAPE/)).toBeTruthy()
  })

  it('keeps the claim CTA disabled (honest: no mint yet)', () => {
    const { getByText } = render(<PulseUnlockShowcase {...defaultProps} />)
    const claim = getByText('CLAIM REWARDS') as HTMLButtonElement
    expect(claim.disabled).toBe(true)
  })

  it('calls onClose when the close button is pressed', () => {
    const onClose = vi.fn()
    const { getByLabelText } = render(<PulseUnlockShowcase {...defaultProps} onClose={onClose} />)
    fireEvent.click(getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows rank 0 for a player with zero rounds', () => {
    const { getAllByText } = render(<PulseUnlockShowcase {...defaultProps} lifetimeRounds={0n} />)
    const rank0Title = PULSE_RANKS[0]?.titleLab ?? ''
    expect(getAllByText(rank0Title).length).toBeGreaterThan(0)
  })

  it('closes on Escape (a11y: WCAG 2.1.1)', () => {
    const onClose = vi.fn()
    render(<PulseUnlockShowcase {...defaultProps} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on a backdrop tap but NOT on a sheet-internal tap', () => {
    const onClose = vi.fn()
    const { getByTestId, getByText } = render(
      <PulseUnlockShowcase {...defaultProps} onClose={onClose} />,
    )
    // Tapping a control inside the sheet must not close the overlay.
    fireEvent.click(getByText('COLLECTION'))
    expect(onClose).not.toHaveBeenCalled()
    // Tapping the backdrop veil itself closes.
    fireEvent.click(getByTestId('pulse-unlock-showcase'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

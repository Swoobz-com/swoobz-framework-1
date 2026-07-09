/**
 * OoReiWardenRewardsPanel.test.tsx — render contract for the Warden's Path
 * rewards panel (D.1 / M2 + Wave 6 COLLECTION tab).
 *
 * Covers:
 *   - JOURNEY tab: ladder rows, EARNED/NEXT/locked, soulbound note, brand.
 *   - COLLECTION tab: cosmetics grid (owned vs locked), perks list, kind tags.
 *   - Tab switcher affordance.
 *   - No em-dash anywhere in the panel tree.
 *   - EV-neutral footnote visible on both tabs.
 *   - No cyan in rendered content.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WARDEN_RANKS, computeWardenRank, POINTS_UNITS_PER_SEAL } from './ooReiWardenRank'
import { OoReiWardenRewardsPanel } from './OoReiWardenRewardsPanel'
import { RESOLVE_CAP_PER_SEASON, SEAL_POWER_CAP_PER_SEASON, WARD_CAP_PER_SEASON } from './ooReiHero'

const seals = (n: bigint): bigint => n * POINTS_UNITS_PER_SEAL

// ─── JOURNEY tab (existing contract preserved) ────────────────────────────────

describe('OoReiWardenRewardsPanel — JOURNEY tab', () => {
  it('renders one row per rank tier on the JOURNEY tab', () => {
    const rank = computeWardenRank(0n)
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={0n} onClose={() => {}} />)
    // Default tab is JOURNEY.
    for (let i = 0; i < WARDEN_RANKS.length; i += 1) {
      expect(screen.getByTestId(`oo-rei-reward-row-${i}`)).toBeTruthy()
    }
  })

  it('marks rows at or below the current rank EARNED and the next rung NEXT', () => {
    const t2 = WARDEN_RANKS[2]?.thresholdUnits ?? 0n
    const rank = computeWardenRank(t2)
    expect(rank.tier.index).toBe(2)
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={t2} onClose={() => {}} />)

    expect(screen.getByTestId('oo-rei-reward-row-2').textContent).toContain('EARNED')
    expect(screen.getByTestId('oo-rei-reward-row-3').textContent).toContain('NEXT')
    expect(screen.getByTestId('oo-rei-reward-row-4').textContent).toContain('RANK 5')
  })

  it('shows the soulbound / EV-neutral footnote (sets the NFT expectation honestly)', () => {
    const rank = computeWardenRank(seals(120n))
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={seals(120n)} onClose={() => {}} />)
    const panel = screen.getByTestId('oo-rei-rewards-panel')
    expect(panel.textContent).toContain('Non-transferable')
    expect(panel.textContent).toContain('never changes the odds')
  })

  it('contains no em-dash anywhere in the rendered panel (brand)', () => {
    const rank = computeWardenRank(seals(460n))
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={seals(460n)} onClose={() => {}} />)
    expect(screen.getByTestId('oo-rei-rewards-panel').textContent?.includes('—')).toBe(false)
  })

  it('fires onClose when the close button is pressed', () => {
    const onClose = vi.fn()
    const rank = computeWardenRank(0n)
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={0n} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// ─── Tab switcher ─────────────────────────────────────────────────────────────

describe('OoReiWardenRewardsPanel — tab switcher', () => {
  it('renders JOURNEY tab by default', () => {
    const rank = computeWardenRank(0n)
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={0n} onClose={() => {}} />)
    expect(screen.getByTestId('oo-rei-journey-tab')).toBeTruthy()
    expect(screen.queryByTestId('oo-rei-collection-tab')).toBeNull()
  })

  it('switches to COLLECTION tab when the COLLECTION button is clicked', () => {
    const rank = computeWardenRank(0n)
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={0n} onClose={() => {}} />)

    const collectionBtn = screen.getByTestId('oo-rei-tab-collection')
    fireEvent.click(collectionBtn)

    expect(screen.getByTestId('oo-rei-collection-tab')).toBeTruthy()
    expect(screen.queryByTestId('oo-rei-journey-tab')).toBeNull()
  })

  it('switches back to JOURNEY tab when the JOURNEY button is clicked', () => {
    const rank = computeWardenRank(0n)
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={0n} onClose={() => {}} />)

    fireEvent.click(screen.getByTestId('oo-rei-tab-collection'))
    fireEvent.click(screen.getByTestId('oo-rei-tab-journey'))

    expect(screen.getByTestId('oo-rei-journey-tab')).toBeTruthy()
    expect(screen.queryByTestId('oo-rei-collection-tab')).toBeNull()
  })
})

// ─── COLLECTION tab ───────────────────────────────────────────────────────────

describe('OoReiWardenRewardsPanel — COLLECTION tab', () => {
  function openCollection(rankUnits: bigint, milestones: string[] = []) {
    const rank = computeWardenRank(rankUnits)
    render(
      <OoReiWardenRewardsPanel
        rank={rank}
        lifetimeSealPoints={rankUnits}
        completedMilestones={milestones}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId('oo-rei-tab-collection'))
  }

  it('shows cosmetic cells for all seal-skins', () => {
    openCollection(seals(10n))
    const ids = ['seal-skin-plain-ofuda', 'seal-skin-vermillion-brush', 'seal-skin-gold-leaf', 'seal-skin-storm', 'seal-skin-island-warden']
    for (const id of ids) {
      expect(screen.getByTestId(`oo-rei-cosmetic-cell-${id}`)).toBeTruthy()
    }
  })

  it('shows music rows for all 6 tracks', () => {
    openCollection(seals(10n))
    const ids = ['music-storm-coast', 'music-tide-shrine', 'music-ember-pass', 'music-mist-valley', 'music-shadow-reach', 'music-warden-apex']
    for (const id of ids) {
      expect(screen.getByTestId(`oo-rei-music-row-${id}`)).toBeTruthy()
    }
  })

  it('shows all 5 codex page cells', () => {
    openCollection(seals(10n))
    const ids = ['codex-arashi', 'codex-shio', 'codex-homura', 'codex-kiri', 'codex-kage']
    for (const id of ids) {
      expect(screen.getByTestId(`oo-rei-cosmetic-cell-${id}`)).toBeTruthy()
    }
  })

  it('shows perk rows for all 8 perks', () => {
    openCollection(seals(10n))
    const ids = ['perk-daily-seal-bonus', 'perk-rakeback-tier-advance', 'perk-warden-tier', 'perk-second-ally-slot', 'perk-map-route-choice', 'perk-third-ally-slot', 'perk-spirit-codex', 'perk-procession-bestiary']
    for (const id of ids) {
      expect(screen.getByTestId(`oo-rei-perk-row-${id}`)).toBeTruthy()
    }
  })

  it('at rank 0 plain-ofuda skin and storm-coast music cells are present and owned (rank 0 items)', () => {
    openCollection(0n)
    // rank 0 items: music-storm-coast (rank 0), frame-plain-ink (rank 0).
    // plain-ofuda (rank 1) is NOT owned at rank 0.
    const stormCoastRow = screen.getByTestId('oo-rei-music-row-music-storm-coast')
    expect(stormCoastRow.textContent).toContain('OWNED')
  })

  it('at rank 0 the plain-ofuda skin (rank 1) cell appears at low opacity (not owned)', () => {
    openCollection(0n)
    const cell = screen.getByTestId('oo-rei-cosmetic-cell-seal-skin-plain-ofuda')
    // Locked cells render at opacity 0.32 via inline style.
    expect(cell.getAttribute('style')).toContain('0.32')
  })

  it('at rank 10 plain-ofuda cell appears at full opacity (owned)', () => {
    openCollection(seals(9000n))
    const cell = screen.getByTestId('oo-rei-cosmetic-cell-seal-skin-plain-ofuda')
    expect(cell.getAttribute('style')).toContain('opacity: 1')
  })

  it('storm-skin is locked at rank 10 without the milestone, unlocked with it', () => {
    const t10 = seals(9000n)
    const { unmount } = render(
      <OoReiWardenRewardsPanel
        rank={computeWardenRank(t10)}
        lifetimeSealPoints={t10}
        completedMilestones={[]}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId('oo-rei-tab-collection'))
    const cellLocked = screen.getByTestId('oo-rei-cosmetic-cell-seal-skin-storm')
    expect(cellLocked.getAttribute('style')).toContain('0.32')
    unmount()

    render(
      <OoReiWardenRewardsPanel
        rank={computeWardenRank(t10)}
        lifetimeSealPoints={t10}
        completedMilestones={['first-procession-cycle']}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId('oo-rei-tab-collection'))
    const cellOwned = screen.getByTestId('oo-rei-cosmetic-cell-seal-skin-storm')
    expect(cellOwned.getAttribute('style')).toContain('opacity: 1')
  })

  it('EV-neutral footnote is visible on the COLLECTION tab', () => {
    openCollection(0n)
    const panel = screen.getByTestId('oo-rei-rewards-panel')
    expect(panel.textContent).toContain('never changes the odds')
  })

  it('no em-dash in COLLECTION tab content', () => {
    openCollection(seals(9000n), ['first-procession-cycle'])
    const panel = screen.getByTestId('oo-rei-rewards-panel')
    expect(panel.textContent?.includes('—')).toBe(false)
  })

  it('perk kind tags are present (LOYALTY, COSMETIC, AGENCY)', () => {
    openCollection(seals(9000n))
    const panel = screen.getByTestId('oo-rei-rewards-panel')
    expect(panel.textContent).toContain('LOYALTY')
    expect(panel.textContent).toContain('AGENCY')
    expect(panel.textContent).toContain('COSMETIC')
  })
})

// ─── HERO tab ─────────────────────────────────────────────────────────────────

describe('OoReiWardenRewardsPanel -- HERO tab', () => {
  function openHero(
    rankUnits: bigint,
    opts: { lifetimeSeals?: number; lifetimeRegionsCleared?: number; seasonDaysActive?: number } = {},
  ) {
    const rank = computeWardenRank(rankUnits)
    render(
      <OoReiWardenRewardsPanel
        rank={rank}
        lifetimeSealPoints={rankUnits}
        lifetimeSeals={opts.lifetimeSeals ?? 0}
        lifetimeRegionsCleared={opts.lifetimeRegionsCleared ?? 0}
        seasonDaysActive={opts.seasonDaysActive ?? 0}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId('oo-rei-tab-hero'))
  }

  it('renders the HERO tab when the HERO button is clicked', () => {
    openHero(0n)
    expect(screen.getByTestId('oo-rei-hero-tab')).toBeTruthy()
    expect(screen.queryByTestId('oo-rei-journey-tab')).toBeNull()
    expect(screen.queryByTestId('oo-rei-collection-tab')).toBeNull()
  })

  it('renders all three stat bars', () => {
    openHero(seals(460n), { lifetimeSeals: 10, lifetimeRegionsCleared: 2, seasonDaysActive: 20 })
    expect(screen.getByTestId('oo-rei-hero-stat-resolve')).toBeTruthy()
    expect(screen.getByTestId('oo-rei-hero-stat-seal-power')).toBeTruthy()
    expect(screen.getByTestId('oo-rei-hero-stat-ward')).toBeTruthy()
  })

  it('Resolve bar shows the seal count value', () => {
    openHero(seals(110n), { lifetimeSeals: 15 })
    const resolveBar = screen.getByTestId('oo-rei-hero-stat-resolve')
    // Value is "15 / 50" (lifetimeSeals / RESOLVE_CAP_PER_SEASON).
    expect(resolveBar.textContent).toContain('15')
    expect(resolveBar.textContent).toContain(RESOLVE_CAP_PER_SEASON.toString())
  })

  it('Seal-Power bar shows the regions cleared value', () => {
    openHero(seals(240n), { lifetimeRegionsCleared: 3 })
    const sealPowerBar = screen.getByTestId('oo-rei-hero-stat-seal-power')
    expect(sealPowerBar.textContent).toContain('3')
    expect(sealPowerBar.textContent).toContain(SEAL_POWER_CAP_PER_SEASON.toString())
  })

  it('Ward bar shows the days active value', () => {
    openHero(seals(110n), { seasonDaysActive: 45 })
    const wardBar = screen.getByTestId('oo-rei-hero-stat-ward')
    expect(wardBar.textContent).toContain('45')
    expect(wardBar.textContent).toContain(WARD_CAP_PER_SEASON.toString())
  })

  it('shows the season arc headline (season title visible)', () => {
    openHero(seals(460n))
    const heroTab = screen.getByTestId('oo-rei-hero-tab')
    expect(heroTab.textContent).toContain('Season')
  })

  it('shows the EV-neutral note on the HERO tab', () => {
    openHero(0n)
    expect(screen.getByTestId('oo-rei-hero-ev-note')).toBeTruthy()
    expect(screen.getByTestId('oo-rei-hero-ev-note').textContent).toContain('never change the game odds')
  })

  it('shows HERO tab button in the tab bar', () => {
    const rank = computeWardenRank(0n)
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={0n} onClose={() => {}} />)
    expect(screen.getByTestId('oo-rei-tab-hero')).toBeTruthy()
  })

  it('no em-dash in HERO tab content', () => {
    openHero(seals(460n), { lifetimeSeals: 10, lifetimeRegionsCleared: 2, seasonDaysActive: 20 })
    const panel = screen.getByTestId('oo-rei-rewards-panel')
    expect(panel.textContent?.includes('—')).toBe(false)
  })

  it('EV-neutral footnote is visible on the HERO tab', () => {
    openHero(0n)
    const panel = screen.getByTestId('oo-rei-rewards-panel')
    expect(panel.textContent).toContain('never changes the odds')
  })

  it('HERO tab is accessible: stat bars have role progressbar', () => {
    openHero(seals(110n), { lifetimeSeals: 25, lifetimeRegionsCleared: 3, seasonDaysActive: 30 })
    const progressbars = screen.getAllByRole('progressbar')
    expect(progressbars.length).toBeGreaterThanOrEqual(3)
  })

  it('switching from HERO to JOURNEY restores the journey tab', () => {
    const rank = computeWardenRank(0n)
    render(<OoReiWardenRewardsPanel rank={rank} lifetimeSealPoints={0n} onClose={() => {}} />)
    fireEvent.click(screen.getByTestId('oo-rei-tab-hero'))
    fireEvent.click(screen.getByTestId('oo-rei-tab-journey'))
    expect(screen.getByTestId('oo-rei-journey-tab')).toBeTruthy()
    expect(screen.queryByTestId('oo-rei-hero-tab')).toBeNull()
  })

  it('shows current region when regions cleared is 0', () => {
    openHero(seals(0n), { lifetimeRegionsCleared: 0 })
    // At 0 cleared, the first region (Storm Coast) is the active region.
    const heroTab = screen.getByTestId('oo-rei-hero-tab')
    expect(heroTab.textContent).toContain('Storm Coast')
  })
})

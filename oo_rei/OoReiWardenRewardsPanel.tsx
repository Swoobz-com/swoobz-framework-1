'use client'

/**
 * OoReiWardenRewardsPanel — the Warden's Path + The Collection.
 *
 * Two tabs:
 *   JOURNEY  — the rank ladder you grind towards: EARNED / NEXT / locked rungs.
 *   COLLECTION — owned vs locked cosmetics grid + perks list with kind tags.
 *
 * Brand: dark-glass sheet, Noto Serif JP (display) + Geist Mono (labels/numbers),
 * amber accent, ZERO cyan. No em-dashes anywhere. EV-neutral footnote on both tabs.
 *
 * Domain C: presentation only. No money math. No claim/mint (honest: that slice
 * ships separately). Soulbound footnote sets the NFT expectation truthfully.
 */

import { type CSSProperties, type ReactElement, useState } from 'react'

import { formatPoints } from './ooReiMath'
import {
  computeHeroStats,
  seasonHeadline,
  RESOLVE_CAP_PER_SEASON,
  SEAL_POWER_CAP_PER_SEASON,
  WARD_CAP_PER_SEASON,
  type HeroStatsState,
  type HeroStat,
} from './ooReiHero'

// ─── Fluid type scale helper ──────────────────────────────────────────────────
// fluid(minPx, maxPx) returns a CSS clamp() expression anchored at ~1280px viewport.
// Text is capped at minPx on mobile and at maxPx on large screens.
// vw coefficient: (maxPx - minPx) / (1600 - 320) * 100 ≈ linear ramp 320→1600px.
function fluid(minPx: number, maxPx: number): string {
  const slope = ((maxPx - minPx) / (1600 - 320)) * 100
  const intercept = minPx - slope * (320 / 100)
  return `clamp(${minPx}px, ${intercept.toFixed(2)}px + ${slope.toFixed(3)}vw, ${maxPx}px)`
}
import {
  ALL_COSMETICS,
  PERKS,
  ownedCosmetics,
  perksForRank,
  unlockLabel,
  type OoReiCosmeticItem,
} from './ooReiCosmetics'
import type { WardenRankState } from './ooReiWardenRank'
import { type WardenBenefitKind, wardenRewardLadder } from './ooReiWardenRewards'

// ─── Props ────────────────────────────────────────────────────────────────────

interface OoReiWardenRewardsPanelProps {
  readonly rank: WardenRankState
  readonly lifetimeSealPoints: bigint
  /** Milestone ids the player has completed (e.g. ['first-procession-cycle']). */
  readonly completedMilestones?: ReadonlyArray<string>
  /**
   * Lifetime spirits sealed (sealedSpiritCount from ooReiProvider).
   * Used by the HERO tab to compute Resolve stat. EV-neutral engagement signal.
   */
  readonly lifetimeSeals?: number
  /**
   * Lifetime regions cleared (regionState.clearedCount from ooReiProvider).
   * Used by the HERO tab to compute Seal-Power stat. EV-neutral engagement signal.
   */
  readonly lifetimeRegionsCleared?: number
  /**
   * Days active in the current season (progression economy only, not wager-indexed).
   * Used by the HERO tab to compute Ward stat.
   */
  readonly seasonDaysActive?: number
  readonly onClose: () => void
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  veil:        'rgba(8, 6, 4, 0.86)',
  sheet:       'rgba(18, 14, 9, 0.96)',
  rim:         'rgba(212, 137, 42, 0.42)',
  rimFaint:    'rgba(212, 137, 42, 0.18)',
  rowEarned:   'rgba(244, 167, 62, 0.10)',
  rowNext:     'rgba(244, 167, 62, 0.06)',
  rowLocked:   'rgba(232, 223, 200, 0.03)',
  amber:       '#f4a73e',
  amberBright: '#ffc44d',
  cream:       '#e8dfc8',
  creamMuted:  'rgba(232, 223, 200, 0.6)',
  creamFaint:  'rgba(232, 223, 200, 0.32)',
  fontKanji:   '"Noto Serif JP", "Yu Mincho", serif',
  fontMono:    '"Geist Mono", ui-monospace, monospace',
} as const

const BENEFIT_TAG: Readonly<Record<WardenBenefitKind, string>> = {
  loyalty:  'LOYALTY',
  cosmetic: 'COSMETIC',
  agency:   'AGENCY',
} as const

type ActiveTab = 'journey' | 'collection' | 'hero'

// ─── Root component ───────────────────────────────────────────────────────────

export function OoReiWardenRewardsPanel({
  rank,
  lifetimeSealPoints,
  completedMilestones = [],
  lifetimeSeals = 0,
  lifetimeRegionsCleared = 0,
  seasonDaysActive = 0,
  onClose,
}: OoReiWardenRewardsPanelProps): ReactElement {
  const [activeTab, setActiveTab] = useState<ActiveTab>('journey')

  // Hero stats derived from engagement signals only (EV-neutral, Domain C display).
  const heroStats = computeHeroStats({
    lifetimeSeals,
    lifetimeRegionsCleared,
    seasonDaysActive,
    currentRankIndex: rank.tier.index,
    lifetimePointsUnits: lifetimeSealPoints,
  })

  const currentIdx = rank.tier.index
  const progressPct = Number(rank.progressBps) / 100

  return (
    <div style={veilStyle} role="dialog" aria-label="The Warden's Path and Collection" data-testid="oo-rei-rewards-panel">
      <div style={sheetStyle}>

        {/* Header: current standing */}
        <div style={headerStyle}>
          <div style={headerRowStyle}>
            <span style={headerKanjiStyle} aria-hidden="true">{rank.tier.kanji}</span>
            <div style={headerTextStyle}>
              <span style={headerTitleStyle}>THE WARDEN&apos;S PATH</span>
              <span style={headerSubStyle}>
                {rank.tier.title} · {formatPoints(lifetimeSealPoints)} earned
              </span>
            </div>
            <button type="button" style={closeBtnStyle} onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div style={progressTrackStyle}>
            <div style={{ ...progressFillStyle, width: `${progressPct}%` }} />
          </div>
          <span style={progressLabelStyle}>
            {rank.isMaxRank
              ? 'Highest rank reached'
              : `${progressPct.toFixed(0)}% to ${rank.nextTier?.title ?? ''}`}
          </span>
        </div>

        {/* Tab switcher */}
        <div style={tabBarStyle} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'journey'}
            style={tabBtnStyle(activeTab === 'journey')}
            onClick={() => setActiveTab('journey')}
            data-testid="oo-rei-tab-journey"
          >
            JOURNEY
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'collection'}
            style={tabBtnStyle(activeTab === 'collection')}
            onClick={() => setActiveTab('collection')}
            data-testid="oo-rei-tab-collection"
          >
            COLLECTION
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'hero'}
            style={tabBtnStyle(activeTab === 'hero')}
            onClick={() => setActiveTab('hero')}
            data-testid="oo-rei-tab-hero"
          >
            HERO
          </button>
        </div>

        {/* Tab content */}
        {activeTab === 'journey' && <JourneyTab currentIdx={currentIdx} />}
        {activeTab === 'collection' && <CollectionTab currentIdx={currentIdx} completedMilestones={completedMilestones} />}
        {activeTab === 'hero' && <HeroTab heroStats={heroStats} />}

        {/* EV-neutral soulbound footnote — both tabs */}
        <span style={footnoteStyle}>
          Each ofuda is yours alone. Non-transferable. Your rank never changes the odds.
        </span>
      </div>
    </div>
  )
}

// ─── JOURNEY tab ──────────────────────────────────────────────────────────────

function JourneyTab({ currentIdx }: { currentIdx: number }): ReactElement {
  const ladder = wardenRewardLadder()
  return (
    <div style={ladderStyle} data-testid="oo-rei-journey-tab">
      {ladder.map(({ tier, reward }) => {
        const earned  = tier.index <= currentIdx
        const isNext  = tier.index === currentIdx + 1
        const rowBg   = earned ? C.rowEarned : isNext ? C.rowNext : C.rowLocked
        const statusLabel = earned ? 'EARNED' : isNext ? 'NEXT' : `RANK ${tier.index + 1}`
        const statusColor = earned ? C.amberBright : isNext ? C.amber : C.creamFaint
        return (
          <div
            key={tier.index}
            style={{ ...rowStyle, background: rowBg, borderColor: isNext ? C.rim : 'transparent', opacity: earned || isNext ? 1 : 0.62 }}
            data-testid={`oo-rei-reward-row-${tier.index}`}
          >
            <span style={rowKanjiStyle} aria-hidden="true">{reward?.nftKanji ?? tier.kanji}</span>
            <div style={rowBodyStyle}>
              <div style={rowTopStyle}>
                <span style={rowNameStyle}>{reward?.nftName ?? tier.title}</span>
                {reward && <span style={benefitTagStyle}>{BENEFIT_TAG[reward.benefitKind]}</span>}
              </div>
              <span style={rowBenefitStyle}>{reward?.benefitLabel ?? 'The journey begins.'}</span>
            </div>
            <span style={{ ...rowStatusStyle, color: statusColor }}>{statusLabel}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── COLLECTION tab ───────────────────────────────────────────────────────────

function CollectionTab({
  currentIdx,
  completedMilestones,
}: {
  currentIdx: number
  completedMilestones: ReadonlyArray<string>
}): ReactElement {
  const owned = ownedCosmetics(currentIdx, completedMilestones)
  const ownedIds = new Set(owned.map((c) => c.id))
  const unlockedPerks = perksForRank(currentIdx)

  // Group cosmetics by category for display
  const sealSkins  = ALL_COSMETICS.filter((c) => c.category === 'seal-skin')
  const musicTracks = ALL_COSMETICS.filter((c) => c.category === 'music-track')
  const codexPages  = ALL_COSMETICS.filter((c) => c.category === 'codex-page')

  return (
    <div style={collectionScrollStyle} data-testid="oo-rei-collection-tab">

      {/* Seal Skins */}
      <span style={collectionSectionLabelStyle}>SEAL SKINS</span>
      <div style={collectionGridStyle}>
        {sealSkins.map((item) => (
          <CosmeticCell key={item.id} item={item} isOwned={ownedIds.has(item.id)} />
        ))}
      </div>

      {/* Music Tracks */}
      <span style={collectionSectionLabelStyle}>MUSIC TRACKS</span>
      <div style={collectionListStyle}>
        {musicTracks.map((item) => (
          <MusicRow key={item.id} item={item} isOwned={ownedIds.has(item.id)} />
        ))}
      </div>

      {/* Codex Pages */}
      <span style={collectionSectionLabelStyle}>SPIRIT CODEX</span>
      <div style={collectionGridStyle}>
        {codexPages.map((item) => (
          <CosmeticCell key={item.id} item={item} isOwned={ownedIds.has(item.id)} />
        ))}
      </div>

      {/* Perks */}
      <span style={collectionSectionLabelStyle}>PERKS</span>
      <div style={perksListStyle}>
        {PERKS.map((perk) => {
          const unlocked = unlockedPerks.some((p) => p.id === perk.id)
          return (
            <div
              key={perk.id}
              style={{ ...perkRowStyle, opacity: unlocked ? 1 : 0.45 }}
              data-testid={`oo-rei-perk-row-${perk.id}`}
            >
              <span style={perkKanjiStyle} aria-hidden="true">{perk.kanji}</span>
              <div style={perkBodyStyle}>
                <div style={rowTopStyle}>
                  <span style={rowNameStyle}>{perk.name}</span>
                  <span style={benefitTagStyle}>{BENEFIT_TAG[perk.benefitKind]}</span>
                </div>
                <span style={rowBenefitStyle}>{perk.benefitLabel}</span>
              </div>
              <span style={{ ...rowStatusStyle, color: unlocked ? C.amberBright : C.creamFaint }}>
                {unlocked ? 'EARNED' : `RANK ${perk.rankIndex + 1}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── HERO tab ─────────────────────────────────────────────────────────────────

/**
 * HERO tab: Resolve / Seal-Power / Ward as labeled bars + season arc.
 * EV-neutral: all values are engagement-derived display only.
 * No HUD surface -- this panel is already panel-scoped (Tim: keep HUD clean).
 * Brand: Noto Serif JP kanji, Geist Mono numbers, amber fills, dark glass.
 * Zero cyan. No em-dashes.
 */
function HeroTab({ heroStats }: { heroStats: HeroStatsState }): ReactElement {
  const { resolve, sealPower, ward, seasonArc } = heroStats
  const headline = seasonHeadline(seasonArc)

  return (
    <div style={heroScrollStyle} data-testid="oo-rei-hero-tab">

      {/* Season arc header */}
      <div style={heroArcHeaderStyle}>
        <span style={heroArcKanjiStyle} aria-hidden="true">{seasonArc.season.bossKanji}</span>
        <div style={heroArcTextStyle}>
          <span style={heroArcLine1Style}>{headline.line1}</span>
          <span style={heroArcLine2Style}>{headline.line2}</span>
        </div>
      </div>

      {/* Season arc tagline */}
      <span style={heroArcTaglineStyle}>{seasonArc.season.arc}</span>

      {/* Divider */}
      <div style={heroDividerStyle} aria-hidden="true" />

      {/* Stats heading */}
      <span style={heroStatsSectionLabelStyle}>WARDEN ATTRIBUTES</span>

      {/* Three hero stats */}
      <HeroStatBar stat={resolve} testId="oo-rei-hero-stat-resolve" />
      <HeroStatBar stat={sealPower} testId="oo-rei-hero-stat-seal-power" />
      <HeroStatBar stat={ward} testId="oo-rei-hero-stat-ward" />

      {/* Season context: current region */}
      {seasonArc.currentRegion !== null && (
        <div style={heroRegionRowStyle} data-testid="oo-rei-hero-current-region">
          <span style={heroRegionLabelStyle}>TRAVERSING</span>
          <span style={heroRegionValueStyle}>
            {seasonArc.currentRegion.nameJP} {seasonArc.currentRegion.nameEN}
          </span>
        </div>
      )}

      {/* EV-neutral note specific to the HERO tab */}
      <span style={heroEVNoteStyle} data-testid="oo-rei-hero-ev-note">
        These attributes grow from your journey. They never change the game odds.
      </span>
    </div>
  )
}

/** One hero stat bar: kanji glyph + label + value/cap + fill bar. */
function HeroStatBar({ stat, testId }: { stat: HeroStat; testId: string }): ReactElement {
  const fillPct = Number(stat.progressBps) / 100
  const valueLabel = `${stat.value.toString()} / ${stat.cap.toString()}`

  return (
    <div style={heroStatRowStyle} data-testid={testId}>
      {/* Kanji anchor */}
      <span style={heroStatKanjiStyle} aria-hidden="true">{stat.kanji}</span>

      {/* Label + bar + value */}
      <div style={heroStatBodyStyle}>
        <div style={heroStatHeaderRowStyle}>
          <span style={heroStatLabelStyle}>{stat.label}</span>
          <span style={heroStatValueStyle} aria-label={`${stat.label}: ${valueLabel}`}>{valueLabel}</span>
        </div>
        <div style={heroStatTrackStyle} role="progressbar" aria-valuenow={Number(stat.value)} aria-valuemin={0} aria-valuemax={Number(stat.cap)} aria-label={stat.label}>
          <div style={{ ...heroStatFillStyle, width: `${fillPct}%` }} />
        </div>
        <span style={heroStatDescStyle}>{stat.description}</span>
      </div>
    </div>
  )
}

// ─── Cosmetic cell (grid) ─────────────────────────────────────────────────────

function CosmeticCell({ item, isOwned }: { item: OoReiCosmeticItem; isOwned: boolean }): ReactElement {
  const label = isOwned ? '' : unlockLabel(item)
  return (
    <div
      style={{ ...cosmeticCellStyle, opacity: isOwned ? 1 : 0.32 }}
      title={label || item.name}
      aria-label={isOwned ? item.name : label}
      data-testid={`oo-rei-cosmetic-cell-${item.id}`}
    >
      {/* Art preview — lock glyph when locked or asset missing */}
      <div style={cosmeticImgWrapStyle}>
        {isOwned && item.assetPath ? (
          <img
            src={item.assetPath}
            alt={item.name}
            style={cosmeticImgStyle}
            // Graceful fallback: if art not yet generated, show the lock glyph.
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <span style={lockGlyphStyle} aria-hidden="true">封</span>
        )}
      </div>
      {/* Name label */}
      <span style={cosmeticNameStyle}>{item.name}</span>
      {/* Unlock label when locked */}
      {!isOwned && label && (
        <span style={cosmeticLockLabelStyle}>{label}</span>
      )}
    </div>
  )
}

// ─── Music row ────────────────────────────────────────────────────────────────

function MusicRow({ item, isOwned }: { item: OoReiCosmeticItem; isOwned: boolean }): ReactElement {
  const label = isOwned ? '' : unlockLabel(item)
  return (
    <div
      style={{ ...musicRowStyle, opacity: isOwned ? 1 : 0.42 }}
      data-testid={`oo-rei-music-row-${item.id}`}
      aria-label={isOwned ? item.name : label}
    >
      <span style={musicDotStyle} aria-hidden="true">{isOwned ? '●' : '○'}</span>
      <span style={rowNameStyle}>{item.name}</span>
      <span style={benefitTagStyle}>{isOwned ? 'OWNED' : label}</span>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const veilStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'clamp(12px, 4vw, 40px)',
  background: C.veil,
  backdropFilter: 'blur(5px)',
  WebkitBackdropFilter: 'blur(5px)',
  pointerEvents: 'all',
}

const sheetStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  // Panel grows from 440px (mobile cap) up to 680px on wide screens so it
  // doesn't look tiny centered on a 1843px+ display.
  // At 1280px: ~35vw = 448px. At 1728px: ~35vw = 605px. At 2560px: capped at 680px.
  width: 'min(clamp(440px, 38vw, 680px), 94vw)',
  maxHeight: 'clamp(480px, 82vh, 820px)',
  padding: 'clamp(14px, 2.5vw, 28px)',
  borderRadius: 14,
  background: C.sheet,
  border: `1px solid ${C.rim}`,
  boxShadow: '0 18px 60px rgba(0,0,0,0.6)',
  overflow: 'hidden',
}

const headerStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 }
const headerRowStyle: CSSProperties = { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }
const headerKanjiStyle: CSSProperties = { fontFamily: C.fontKanji, fontSize: fluid(28, 40), fontWeight: 700, color: C.amber, lineHeight: 1, textShadow: '0 2px 10px rgba(244,167,62,0.35)' }
const headerTextStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }
const headerTitleStyle: CSSProperties = { fontFamily: C.fontKanji, fontSize: fluid(15, 20), fontWeight: 700, letterSpacing: '0.04em', color: C.cream, lineHeight: 1.1 }
const headerSubStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(11, 13), letterSpacing: '0.06em', color: C.creamMuted }
const closeBtnStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(14, 18), color: C.creamMuted, background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1 }

const progressTrackStyle: CSSProperties = { position: 'relative', width: '100%', height: 4, borderRadius: 2, background: 'rgba(244,167,62,0.18)', overflow: 'hidden' }
const progressFillStyle: CSSProperties = { position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2, background: C.amber, transition: 'width 400ms cubic-bezier(0,0,0.25,1)' }
const progressLabelStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(10, 12), letterSpacing: '0.14em', color: C.creamFaint, textTransform: 'uppercase' }

// Tab bar
const tabBarStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 0,
  borderBottom: `1px solid ${C.rimFaint}`,
}

function tabBtnStyle(active: boolean): CSSProperties {
  return {
    fontFamily: C.fontMono,
    fontSize: fluid(11, 13),
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: active ? C.amber : C.creamFaint,
    background: 'transparent',
    border: 'none',
    borderBottom: active ? `2px solid ${C.amber}` : '2px solid transparent',
    padding: '6px 14px 5px',
    cursor: 'pointer',
    lineHeight: 1,
    textTransform: 'uppercase',
    transition: 'color 120ms, border-color 120ms',
  }
}

// Ladder (Journey tab)
const ladderStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', paddingRight: 4 }

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 11,
  padding: '9px 11px',
  borderRadius: 8,
  border: '1px solid transparent',
}
const rowKanjiStyle: CSSProperties = { fontFamily: C.fontKanji, fontSize: fluid(20, 26), fontWeight: 700, color: C.amber, lineHeight: 1, width: 32, textAlign: 'center', flexShrink: 0 }
const rowBodyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }
const rowTopStyle: CSSProperties = { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }
const rowNameStyle: CSSProperties = { fontFamily: C.fontKanji, fontSize: fluid(13, 16), fontWeight: 700, color: C.cream, lineHeight: 1.15 }
const benefitTagStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(9, 11), letterSpacing: '0.14em', color: C.amber, border: `1px solid ${C.rim}`, borderRadius: 3, padding: '1px 4px', lineHeight: 1.2 }
const rowBenefitStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(11, 13), lineHeight: 1.3, color: C.creamMuted }
const rowStatusStyle: CSSProperties = { fontFamily: C.fontMono, fontSize: fluid(10, 12), fontWeight: 700, letterSpacing: '0.14em', flexShrink: 0 }

// Collection tab scroll container
const collectionScrollStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  overflowY: 'auto',
  paddingRight: 4,
}

const collectionSectionLabelStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(10, 12),
  fontWeight: 700,
  letterSpacing: '0.18em',
  color: C.creamFaint,
  textTransform: 'uppercase',
  paddingTop: 4,
}

const collectionGridStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
}

const collectionListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
}

const perksListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
}

// Cosmetic cell
const cosmeticCellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  width: 72,
  cursor: 'default',
}

const cosmeticImgWrapStyle: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 6,
  background: 'rgba(244,167,62,0.06)',
  border: `1px solid rgba(212,137,42,0.25)`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
}

const cosmeticImgStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 5,
}

const lockGlyphStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: 20,
  fontWeight: 700,
  color: 'rgba(212,137,42,0.30)',
  lineHeight: 1,
}

const cosmeticNameStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(10, 12),
  color: C.creamMuted,
  textAlign: 'center',
  lineHeight: 1.2,
  letterSpacing: '0.04em',
}

const cosmeticLockLabelStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(9, 11),
  color: C.creamFaint,
  textAlign: 'center',
  lineHeight: 1.2,
  letterSpacing: '0.02em',
}

// Music row
const musicRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  padding: '5px 8px',
  borderRadius: 5,
  background: 'rgba(244,167,62,0.03)',
}

const musicDotStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(11, 13),
  color: C.amber,
  flexShrink: 0,
  width: 12,
}

// Perk row
const perkRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  padding: '7px 10px',
  borderRadius: 7,
  background: 'rgba(244,167,62,0.04)',
  border: '1px solid transparent',
}

const perkKanjiStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: fluid(18, 22),
  fontWeight: 700,
  color: C.amber,
  lineHeight: 1,
  width: 24,
  textAlign: 'center',
  flexShrink: 0,
}

const perkBodyStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }

// ─── HERO tab styles ──────────────────────────────────────────────────────────

const heroScrollStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  overflowY: 'auto',
  paddingRight: 4,
}

const heroArcHeaderStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  paddingTop: 4,
}

const heroArcKanjiStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: fluid(36, 52),
  fontWeight: 700,
  color: C.amber,
  lineHeight: 1,
  textShadow: '0 2px 14px rgba(244,167,62,0.32)',
  flexShrink: 0,
}

const heroArcTextStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  flex: 1,
}

const heroArcLine1Style: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: fluid(14, 18),
  fontWeight: 700,
  color: C.cream,
  letterSpacing: '0.04em',
  lineHeight: 1.15,
}

const heroArcLine2Style: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(11, 14),
  fontWeight: 700,
  letterSpacing: '0.10em',
  color: C.amber,
  lineHeight: 1.1,
}

const heroArcTaglineStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: fluid(12, 14),
  fontWeight: 400,
  color: C.creamMuted,
  lineHeight: 1.5,
  letterSpacing: '0.02em',
}

const heroDividerStyle: CSSProperties = {
  width: '100%',
  height: 1,
  background: 'rgba(212,137,42,0.18)',
  borderRadius: 1,
}

const heroStatsSectionLabelStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(10, 12),
  fontWeight: 700,
  letterSpacing: '0.18em',
  color: C.creamFaint,
  textTransform: 'uppercase',
}

const heroStatRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 12,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'rgba(244,167,62,0.05)',
  border: '1px solid rgba(212,137,42,0.14)',
}

const heroStatKanjiStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: fluid(24, 32),
  fontWeight: 700,
  color: C.amber,
  lineHeight: 1,
  width: 36,
  textAlign: 'center',
  flexShrink: 0,
  paddingTop: 2,
  textShadow: '0 1px 8px rgba(244,167,62,0.28)',
}

const heroStatBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  flex: 1,
  minWidth: 0,
}

const heroStatHeaderRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const heroStatLabelStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: fluid(13, 16),
  fontWeight: 700,
  color: C.cream,
  lineHeight: 1.1,
}

const heroStatValueStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(11, 13),
  fontWeight: 700,
  color: C.amber,
  letterSpacing: '0.06em',
  lineHeight: 1,
  flexShrink: 0,
}

const heroStatTrackStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 6,
  borderRadius: 3,
  background: 'rgba(244,167,62,0.14)',
  overflow: 'hidden',
}

const heroStatFillStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  height: '100%',
  borderRadius: 3,
  background: C.amber,
  transition: 'width 400ms cubic-bezier(0,0,0.25,1)',
}

const heroStatDescStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(10, 12),
  color: C.creamFaint,
  lineHeight: 1.3,
  letterSpacing: '0.02em',
}

const heroRegionRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  padding: '6px 10px',
  borderRadius: 6,
  background: 'rgba(244,167,62,0.03)',
}

const heroRegionLabelStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(9, 11),
  fontWeight: 700,
  letterSpacing: '0.16em',
  color: C.creamFaint,
  flexShrink: 0,
}

const heroRegionValueStyle: CSSProperties = {
  fontFamily: C.fontKanji,
  fontSize: fluid(12, 14),
  fontWeight: 700,
  color: C.cream,
  lineHeight: 1.2,
}

const heroEVNoteStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(10, 12),
  lineHeight: 1.4,
  color: C.creamFaint,
  paddingTop: 2,
  borderTop: `1px solid rgba(212,137,42,0.12)`,
  paddingBottom: 2,
}

// ─── Footnote ─────────────────────────────────────────────────────────────────

const footnoteStyle: CSSProperties = {
  fontFamily: C.fontMono,
  fontSize: fluid(10, 12),
  lineHeight: 1.4,
  color: C.creamFaint,
  paddingTop: 2,
}

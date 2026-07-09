'use client'

/**
 * OoFisherUpgradePanel — the upgrade tree UI (rod / boat / bait).
 *
 * Shown as a modal overlay over the lobby. The three trees occupy three
 * vertical columns; each column shows the current tier, the next-tier
 * benefit, and the price. The price column is honest — every cost is
 * visible (RG-C8: no hidden grind), and the player can see at a glance
 * how far they have to go.
 *
 * RG-C5 STRUCTURAL: the purchase-confirm chime is identical across all
 * three trees and all five tiers — see `playUpgradePurchase` in
 * `ooFisherAudio.ts`. The visible sprite morph carries the tier signal.
 *
 * Brand register: quiet expert. No flashing prices, no "MUST UPGRADE NOW"
 * copy. The grind is the verb; the meta-loop is the persistence.
 */
import { type CSSProperties, type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'

import {
  castsPerTrip,
  formatScales,
  formatTier,
  type GearLoadout,
  type GearTier,
  maxDepthByBoat,
  nextTier,
  reelingParamsForRod,
  type UpgradeTree,
  upgradeCost,
} from './ooFisherMath'
import {
  COSMETIC_CATEGORIES,
  type CosmeticItem,
  cosmeticsByCategory,
} from './ooFisherCosmetics'
import type { FisherCosmetics } from './useFisherCosmetics'

// Tim 2026-05-26 image 120 — UPGRADE ACHIEVEMENT MOMENT.
//
// When a purchase resolves successfully, a center-modal celebration card
// overlays the gear grid for UPGRADE_CELEBRATION_MS, calling out which
// tree leveled and the tier transition. RG-C5 STRUCTURAL:
//   - duration is a MODULE-CONST (1500ms) — no scaling by tier rank.
//   - visual amplitude is IDENTICAL across (rod / boat / bait) and across
//     (bronze→silver / silver→gold / etc). The only per-tier-color variable
//     is the static badge tint already shown on the resting OWNED card.
//   - audio is the existing zero-param `playUpgradePurchase()` fired by
//     the provider on commit (same chord every purchase).
const UPGRADE_CELEBRATION_MS = 1500

export interface OoFisherUpgradePanelProps {
  readonly loadout: GearLoadout
  readonly currencyLamports: bigint
  readonly onPurchase: (tree: UpgradeTree) => boolean
  readonly onClose: () => void
  readonly cosmetics: FisherCosmetics
}

// Tim 2026-05-26 image 119 wood-theme migration: upgrade modal migrated
// from cool dark-glass + cyan-accent register to wood-plaque grammar
// matching the in-canvas HUD + lobby cards. The 3 inner gear cards (ROD/
// BOAT/BAIT) keep their cool dark-glass surfaces as instrument-plate
// inserts ON the wood panel (legal: insets are cool, panel is wood — no
// warm+cyan adjacency on a single element). UPGRADE buttons stay cyan
// (separate interactive leaf, not painted text on wood). Tier badges
// already use distinct tier colors (bronze/silver/gold/platinum/mythic).
const TOKENS = {
  fontMono: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
  fontBody: 'var(--font-family-body, "Geist", system-ui, sans-serif)',
  bgDeep: '#03070d',
  // Outer panel = warm cedar gradient (matches woodPlaqueBackground).
  surface:
    'linear-gradient(180deg, rgba(140, 92, 52, 0.94) 0%, rgba(108, 70, 40, 0.94) 50%, rgba(86, 54, 30, 0.94) 100%),' +
    ' repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 7px)',
  // Inner gear cards = cool dark-glass inset (instrument plates on wood).
  surfaceRaised: 'rgba(8, 14, 22, 0.78)',
  borderHairline: 'rgba(184, 137, 92, 0.42)', // brass hairline
  borderSubtle: 'rgba(184, 137, 92, 0.22)', // dim brass
  // Tim 2026-05-26 no-cyan-on-wood: TOKENS.accent re-targeted to brass so
  // any residual reference inherits the wood register. The cyan triad below
  // is intentionally kept as `accentSolid` ONLY (not used in upgrade panel
  // anymore) to ease future audits via grep.
  accent: '#ffd27a',
  accentSolid: '#ffd27a',
  accentInk: '#2a1a08',
  accentMuted: 'rgba(212, 160, 74, 0.32)',
  // Text colors retuned for wood ground.
  text: 'rgba(255, 232, 188, 0.94)', // cream
  textMuted: 'rgba(255, 232, 188, 0.70)',
  textDim: 'rgba(255, 232, 188, 0.50)',
  // Brass numeral color for value text on the wood panel header.
  brass: '#ffd27a',
  danger: '#f87171',
}

// Tier display color — the "tier badge" tints visibly across the ladder so
// the player can read the upgrade-tree progression at a glance.
const TIER_COLORS: Record<GearTier, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#f5c25b',
  platinum: '#e5e4e2',
  mythic: '#FF8B5A',
}

interface TreeRowProps {
  readonly tree: UpgradeTree
  readonly currentTier: GearTier
  readonly currencyLamports: bigint
  readonly onPurchase: (tree: UpgradeTree) => boolean
}

function TreeRow({ tree, currentTier, currencyLamports, onPurchase }: TreeRowProps): ReactElement {
  const next = nextTier(currentTier)
  const cost = upgradeCost(currentTier)
  const canAfford = next !== null && currencyLamports >= cost
  const benefitCopy = describeBenefit(tree, currentTier, next)
  const purpose = describePurpose(tree)
  const beforeAfter = describeBeforeAfter(tree, currentTier, next)
  const treeLabel = treeDisplayLabel(tree)
  return (
    <div style={styles.treeColumn}>
      <div style={styles.treeHeader}>
        <span style={styles.treeIcon} aria-hidden="true">
          {TREE_ICON[tree]}
        </span>
        <span style={styles.treeLabel}>{treeLabel}</span>
      </div>

      {/* Benefit summary header — the player should glance at this and
          immediately know what the tree DOES. Tim playtest 2026-05-24:
          previous copy showed numbers without a verb. */}
      <p style={styles.purposeCopy} data-testid={`oo-fisher-upgrade-purpose-${tree}`}>
        {purpose}
      </p>

      <div style={styles.tierBadgeRow}>
        <span style={styles.currentEyebrow}>OWNED</span>
        <span
          style={{
            ...styles.tierBadge,
            background: `${TIER_COLORS[currentTier]}22`,
            borderColor: `${TIER_COLORS[currentTier]}88`,
            color: TIER_COLORS[currentTier],
          }}
        >
          {formatTier(currentTier)}
        </span>
      </div>

      <p style={styles.benefitCopy}>{benefitCopy}</p>

      {next !== null ? (
        <>
          <div style={styles.nextRow}>
            <span style={styles.nextEyebrow}>NEXT</span>
            <span
              style={{
                ...styles.tierBadgeSmall,
                background: `${TIER_COLORS[next]}22`,
                borderColor: `${TIER_COLORS[next]}66`,
                color: TIER_COLORS[next],
              }}
            >
              {formatTier(next)}
            </span>
          </div>

          {/* Before/After comparison block — two side-by-side stat cards
              that visualize the concrete delta the upgrade buys.
              `current` and `upgraded` are short strings of the form "3
              casts" / "depth 1" / "+0%" so the player can see at a
              glance what they're paying for. */}
          <div style={styles.beforeAfterBlock}>
            <div style={styles.beforeAfterStat}>
              <span style={styles.beforeAfterLabel}>CURRENT</span>
              <span style={styles.beforeAfterValue}>{beforeAfter.current}</span>
            </div>
            <span style={styles.beforeAfterArrow} aria-hidden="true">
              →
            </span>
            <div style={styles.beforeAfterStat}>
              <span style={styles.beforeAfterLabel}>UPGRADED</span>
              <span style={styles.beforeAfterValueHi}>{beforeAfter.upgraded}</span>
            </div>
          </div>

          <div style={styles.costRow}>
            <span style={styles.costLabel}>PRICE</span>
            <span style={canAfford ? styles.costValueOk : styles.costValueShort}>
              {formatScales(cost)} scales
            </span>
          </div>
          <button
            type="button"
            disabled={!canAfford}
            onClick={() => onPurchase(tree)}
            style={canAfford ? styles.buyButton : styles.buyButtonDisabled}
            aria-label={`Upgrade ${treeLabel} to ${formatTier(next)} for ${formatScales(cost)} scales`}
          >
            {canAfford ? 'upgrade →' : 'need more scales'}
          </button>
        </>
      ) : (
        <>
          <div style={styles.maxedBlock}>
            <span style={styles.maxedLabel}>MAX TIER REACHED</span>
            <span style={styles.maxedHint}>this branch is fully upgraded</span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Top-of-column benefit summary. Reads as a verb-first declarative
 * sentence so the player immediately knows the PURPOSE of the tree
 * (Tim playtest 2026-05-24: "what do the upgrades do?").
 *
 * Each string MUST contain the keyword the test asserts on:
 *   rod  → "wider" (also references reel speed)
 *   boat → "deeper"
 *   bait → "tilt"
 */
function describePurpose(tree: UpgradeTree): string {
  switch (tree) {
    case 'rod':
      return 'ROD increases your max cast power and adds wider reel-zone windows for fewer misses.'
    case 'boat':
      return 'BOAT unlocks deeper water where rarer fish live.'
    case 'bait':
      return 'BAIT shifts the rarity tilt toward better fish tiers.'
  }
}

/**
 * Before/after concrete-number preview for the NEXT tier purchase.
 * Returns short strings (≤ 10 chars each) so the side-by-side cards
 * read at a glance.
 *
 *   rod  → "3 casts" → "5 casts" + the reel-zone width nudge
 *   boat → "depth 1" → "depth 2"
 *   bait → "+0%" → "+5%" (catch value bonus)
 *
 * When `next === null` the function returns the already-maxed state.
 */
function describeBeforeAfter(
  tree: UpgradeTree,
  current: GearTier,
  next: GearTier | null,
): { readonly current: string; readonly upgraded: string } {
  if (next === null) {
    switch (tree) {
      case 'rod':
        return { current: `${castsPerTrip(current)} casts`, upgraded: 'MAX' }
      case 'boat':
        return { current: `depth ${maxDepthByBoat(current)}`, upgraded: 'MAX' }
      case 'bait': {
        const idx = ['bronze', 'silver', 'gold', 'platinum', 'mythic'].indexOf(current)
        return { current: `+${idx * 5}%`, upgraded: 'MAX' }
      }
    }
  }
  switch (tree) {
    case 'rod': {
      const c = castsPerTrip(current)
      const n = castsPerTrip(next)
      return { current: `${c} casts`, upgraded: `${n} casts` }
    }
    case 'boat': {
      const c = maxDepthByBoat(current)
      const n = maxDepthByBoat(next)
      return { current: `depth ${c}`, upgraded: `depth ${n}` }
    }
    case 'bait': {
      const cur = ['bronze', 'silver', 'gold', 'platinum', 'mythic'].indexOf(current)
      const nxt = ['bronze', 'silver', 'gold', 'platinum', 'mythic'].indexOf(next)
      return { current: `+${cur * 5}%`, upgraded: `+${nxt * 5}%` }
    }
  }
}

const TREE_ICON: Record<UpgradeTree, string> = {
  rod: '⌖',
  boat: '⛵',
  bait: '✦',
}

function treeDisplayLabel(tree: UpgradeTree): string {
  switch (tree) {
    case 'rod':
      return 'Rod'
    case 'boat':
      return 'Boat'
    case 'bait':
      return 'Bait'
  }
}

function describeBenefit(tree: UpgradeTree, current: GearTier, next: GearTier | null): string {
  if (next === null) {
    switch (tree) {
      case 'rod':
        return `${castsPerTrip(current)} casts per trip · widest reel zone`
      case 'boat':
        return `depth ${maxDepthByBoat(current)} access · deepest waters unlocked`
      case 'bait':
        return 'rare distribution maxed · +20% catch value'
    }
  }
  switch (tree) {
    case 'rod': {
      const currCasts = castsPerTrip(current)
      const nextCasts = castsPerTrip(next)
      const currZone = reelingParamsForRod(current).targetHalfWidth * 2
      const nextZone = reelingParamsForRod(next).targetHalfWidth * 2
      return `${currCasts} casts → ${nextCasts} per trip · reel zone ${currZone} → ${nextZone}`
    }
    case 'boat': {
      const currDepth = maxDepthByBoat(current)
      const nextDepth = maxDepthByBoat(next)
      return `depth ${currDepth} → ${nextDepth} access · deeper water = rarer fish`
    }
    case 'bait': {
      // Bait bonus = 5% per tier — described as numeric so the grind is honest.
      const tierIdxCur = ['bronze', 'silver', 'gold', 'platinum', 'mythic'].indexOf(current)
      const tierIdxNext = ['bronze', 'silver', 'gold', 'platinum', 'mythic'].indexOf(next)
      const curBonus = tierIdxCur * 5
      const nextBonus = tierIdxNext * 5
      return `catch value +${curBonus}% → +${nextBonus}% · rare-fish weight shifts up`
    }
  }
}

interface AchievementState {
  readonly tree: UpgradeTree
  readonly fromTier: GearTier
  readonly toTier: GearTier
}

// ─── Cosmetics & EV-neutral perk shop ────────────────────────────────────────

function CosmeticChip({
  item,
  cosmetics,
  currencyLamports,
}: {
  readonly item: CosmeticItem
  readonly cosmetics: FisherCosmetics
  readonly currencyLamports: bigint
}): ReactElement {
  const owned = cosmetics.owned.has(item.id) || item.isDefault === true
  const equippable = item.category !== 'perk'
  const equipped = equippable && cosmetics.equipped[item.category] === item.id
  const affordable = currencyLamports >= item.priceLamports

  let stateLabel: string
  if (equipped) stateLabel = 'EQUIPPED'
  else if (owned && equippable) stateLabel = 'EQUIP'
  else if (owned) stateLabel = 'OWNED'
  else stateLabel = `${item.priceScales.toLocaleString('en-US')} scales`

  const lockedUnaffordable = !owned && !affordable
  const ownedPerk = owned && !equippable // nothing to do on click
  const handleClick = (): void => {
    if (!owned) cosmetics.buy(item.id)
    else if (equippable && !equipped) cosmetics.equip(item.id)
  }

  const baseStyle = equipped ? styles.cosmeticChipEquipped : styles.cosmeticChip
  const chipStyle = lockedUnaffordable
    ? { ...baseStyle, opacity: 0.5, cursor: 'not-allowed' as const }
    : ownedPerk
      ? { ...baseStyle, cursor: 'default' as const }
      : baseStyle

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={lockedUnaffordable || ownedPerk}
      style={chipStyle}
      aria-pressed={equipped}
      aria-label={`${item.name} — ${item.blurb} — ${stateLabel}`}
      title={item.blurb}
    >
      <span
        style={{
          ...styles.cosmeticSwatch,
          // 'No Flag' swatch: a legible light/dark diagonal hatch (not two
          // near-blacks) so it reads as "none", not a flat dark square.
          background:
            item.swatch === 'transparent'
              ? 'repeating-linear-gradient(45deg,#6a543c,#6a543c 3px,#2a1f16 3px,#2a1f16 6px)'
              : item.swatch,
        }}
        aria-hidden="true"
      />
      <span style={equipped ? { ...styles.cosmeticName, color: '#2a1a08' } : styles.cosmeticName}>
        {item.name}
      </span>
      <span
        style={{
          ...styles.cosmeticState,
          color: equipped
            ? '#2a1a08'
            : owned
              ? '#ffd27a'
              : affordable
                ? 'rgba(255,232,188,0.78)'
                : '#e8897e', // lighter danger — readable on the dark chip
        }}
      >
        {stateLabel}
      </span>
    </button>
  )
}

function CosmeticsShop({
  cosmetics,
  currencyLamports,
}: {
  readonly cosmetics: FisherCosmetics
  readonly currencyLamports: bigint
}): ReactElement {
  return (
    <div style={styles.cosmeticsSection}>
      <div style={styles.cosmeticsHeader}>
        <span style={styles.panelEyebrow}>COSMETICS &amp; PERKS</span>
        <span style={styles.cosmeticsSub}>customise your rig — never changes the odds</span>
      </div>
      {COSMETIC_CATEGORIES.map(({ key, label }) => (
        <div key={key} style={styles.cosmeticCatBlock}>
          <span style={styles.cosmeticCatLabel}>{label}</span>
          <div style={styles.cosmeticGrid}>
            {cosmeticsByCategory(key).map((c) => (
              <CosmeticChip
                key={c.id}
                item={c}
                cosmetics={cosmetics}
                currencyLamports={currencyLamports}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function OoFisherUpgradePanel(props: OoFisherUpgradePanelProps): ReactElement {
  const { loadout, currencyLamports, onPurchase, onClose, cosmetics } = props
  const totalSpendableCopy = useMemo(() => `${formatScales(currencyLamports)} scales`, [currencyLamports])

  // Tim image 120 — capture the most-recent successful purchase to drive
  // the center-modal celebration card. Cleared by a module-const timer.
  const [achievement, setAchievement] = useState<AchievementState | null>(null)

  const handlePurchase = useCallback(
    (tree: UpgradeTree): boolean => {
      const fromTier = loadout[tree]
      const toTier = nextTier(fromTier)
      const ok = onPurchase(tree)
      if (ok && toTier !== null) {
        setAchievement({ tree, fromTier, toTier })
      }
      return ok
    },
    [loadout, onPurchase],
  )

  useEffect(() => {
    if (achievement === null) return undefined
    const t = window.setTimeout(() => setAchievement(null), UPGRADE_CELEBRATION_MS)
    return () => window.clearTimeout(t)
  }, [achievement])

  return (
    <div
      style={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade panel"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onClose()
        }
      }}
      tabIndex={-1}
    >
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <div style={styles.panelHeaderLeft}>
            <span style={styles.panelEyebrow}>UPGRADES</span>
            <span style={styles.panelTitle}>Spend your stash on gear</span>
          </div>
          <div style={styles.panelHeaderRight}>
            <span style={styles.stashEyebrow}>STASH</span>
            <span style={styles.stashValue}>{totalSpendableCopy}</span>
            <button type="button" onClick={onClose} style={styles.closeButton} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <p style={styles.panelHint}>
          Spend earned currency on three trees: ROD (faster reel + wider window), BOAT (deeper
          water = rarer fish), BAIT (rarity tilt). Each tier is 5× the last. Upgrades persist
          across sessions.
        </p>

        <div style={styles.treeRow}>
          <TreeRow
            tree="rod"
            currentTier={loadout.rod}
            currencyLamports={currencyLamports}
            onPurchase={handlePurchase}
          />
          <TreeRow
            tree="boat"
            currentTier={loadout.boat}
            currencyLamports={currencyLamports}
            onPurchase={handlePurchase}
          />
          <TreeRow
            tree="bait"
            currentTier={loadout.bait}
            currencyLamports={currencyLamports}
            onPurchase={handlePurchase}
          />
        </div>

        <CosmeticsShop cosmetics={cosmetics} currencyLamports={currencyLamports} />

        <div style={styles.panelFooter}>
          <button type="button" onClick={onClose} style={styles.doneButton}>
            done
          </button>
        </div>

        {achievement !== null && <UpgradeAchievement achievement={achievement} />}
      </div>
    </div>
  )
}

/**
 * UpgradeAchievement — center-panel celebration card that surfaces a
 * successful purchase. Wood-plaque grammar matches the surrounding panel;
 * brass accents call out the tier transition. Auto-dismisses on the
 * UPGRADE_CELEBRATION_MS timer set by the parent.
 *
 * RG-C5: visual amplitude is identical for every (tree, fromTier→toTier).
 * Only the static tier-color chips differ, sourced from the same
 * `TIER_COLORS` map the resting OWNED badges already use.
 */
function UpgradeAchievement({ achievement }: { readonly achievement: AchievementState }): ReactElement {
  const { tree, fromTier, toTier } = achievement
  const treeLabel = treeDisplayLabel(tree)
  const treeIcon = TREE_ICON[tree]
  return (
    <div
      style={styles.achievementOverlay}
      data-testid="oo-fisher-upgrade-achievement"
      role="status"
      aria-live="assertive"
      aria-label={`${treeLabel} upgraded to ${formatTier(toTier)}`}
    >
      <div style={styles.achievementCard}>
        <span style={styles.achievementEyebrow}>GEAR UPGRADED</span>
        <div style={styles.achievementTreeRow}>
          <span style={styles.achievementIcon} aria-hidden="true">
            {treeIcon}
          </span>
          <span style={styles.achievementTreeLabel}>{treeLabel}</span>
        </div>
        <div style={styles.achievementTransition}>
          <span
            style={{
              ...styles.achievementTierChip,
              background: `${TIER_COLORS[fromTier]}22`,
              borderColor: `${TIER_COLORS[fromTier]}88`,
              color: TIER_COLORS[fromTier],
            }}
          >
            {formatTier(fromTier)}
          </span>
          <span style={styles.achievementArrow} aria-hidden="true">
            →
          </span>
          <span
            style={{
              ...styles.achievementTierChipHi,
              background: `${TIER_COLORS[toTier]}33`,
              borderColor: TIER_COLORS[toTier],
              color: TIER_COLORS[toTier],
            }}
          >
            {formatTier(toTier)}
          </span>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  scrim: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(3, 7, 13, 0.84)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    position: 'relative',
    width: 'min(1040px, 100%)',
    maxHeight: '92dvh', // dvh so the done button isn't clipped under mobile chrome
    overflow: 'auto',
    background: TOKENS.surface,
    backgroundBlendMode: 'multiply, normal',
    border: '2px solid #d4a04a', // brass-stud border
    borderRadius: 12,
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    boxShadow:
      '0 30px 80px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 222, 158, 0.45), inset 0 -2px 4px rgba(0, 0, 0, 0.4)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    paddingBottom: 14,
    borderBottom: `1px solid ${TOKENS.borderSubtle}`,
  },
  panelHeaderLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  panelHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  panelEyebrow: {
    fontFamily: TOKENS.fontMono,
    fontSize: 11,
    letterSpacing: '0.30em',
    textTransform: 'uppercase',
    color: TOKENS.brass,
    fontWeight: 700,
  },
  panelTitle: {
    fontFamily: TOKENS.fontBody,
    fontSize: 18,
    fontWeight: 700,
    color: TOKENS.text,
    letterSpacing: '-0.01em',
  },
  panelHint: {
    fontFamily: TOKENS.fontBody,
    fontSize: 12,
    color: TOKENS.textMuted,
    margin: 0,
    lineHeight: 1.55,
  },
  stashEyebrow: {
    fontFamily: TOKENS.fontMono,
    fontSize: 10,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: TOKENS.textDim,
  },
  stashValue: {
    fontFamily: TOKENS.fontMono,
    fontSize: 16,
    fontWeight: 700,
    color: TOKENS.brass,
    fontVariantNumeric: 'tabular-nums',
  },
  closeButton: {
    background: 'transparent',
    border: `1px solid ${TOKENS.borderSubtle}`,
    color: TOKENS.textMuted,
    width: 44,
    height: 44,
    borderRadius: 8,
    cursor: 'pointer',
    touchAction: 'manipulation',
    fontFamily: TOKENS.fontMono,
    fontSize: 14,
  },
  treeRow: {
    display: 'grid',
    // auto-fit so mobile (393px) gets a single readable column instead of 3
    // crushed 112px columns; desktop still shows all three side by side.
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 14,
  },
  cosmeticsSection: {
    marginTop: 18,
    paddingTop: 14,
    borderTop: '1px solid rgba(184, 137, 92, 0.28)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cosmeticsHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  cosmeticsSub: {
    fontFamily: 'var(--font-family-body, "Geist", system-ui, sans-serif)',
    fontSize: 11,
    color: 'rgba(255, 232, 188, 0.55)',
  },
  cosmeticCatBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  cosmeticCatLabel: {
    fontFamily: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
    fontSize: 9,
    letterSpacing: '0.2em',
    color: 'rgba(255, 232, 188, 0.5)',
  },
  cosmeticGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
    gap: 8,
  },
  cosmeticChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    padding: '8px 10px',
    background: 'rgba(48, 28, 14, 0.45)',
    border: '1px solid rgba(184, 137, 92, 0.42)',
    borderRadius: 8,
    cursor: 'pointer',
    touchAction: 'manipulation',
    textAlign: 'left',
  },
  cosmeticChipEquipped: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    padding: '8px 10px',
    background: 'linear-gradient(180deg, #f0c674, #c89148)',
    border: '1px solid #d4a04a',
    borderRadius: 8,
    cursor: 'pointer',
    touchAction: 'manipulation',
    textAlign: 'left',
    boxShadow: 'inset 0 1px 0 rgba(255,232,188,0.55), inset 0 -1px 0 rgba(86,54,30,0.40)',
  },
  cosmeticSwatch: {
    width: 18,
    height: 18,
    borderRadius: 4,
    flexShrink: 0,
    border: '1px solid rgba(0,0,0,0.35)',
  },
  cosmeticName: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-family-body, "Geist", system-ui, sans-serif)',
    fontSize: 11,
    fontWeight: 600,
    color: '#ffe8bc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cosmeticState: {
    fontFamily: 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.08em',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  treeColumn: {
    background: TOKENS.surfaceRaised,
    border: `1px solid ${TOKENS.borderHairline}`,
    borderRadius: 14,
    padding: '18px 18px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  treeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  treeIcon: {
    fontSize: 22,
    color: TOKENS.brass,
  },
  treeLabel: {
    fontFamily: TOKENS.fontMono,
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: TOKENS.text,
  },
  tierBadgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  currentEyebrow: {
    fontFamily: TOKENS.fontMono,
    fontSize: 9,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: TOKENS.textDim,
  },
  tierBadge: {
    padding: '4px 10px',
    border: '1px solid',
    borderRadius: 4,
    fontFamily: TOKENS.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  tierBadgeSmall: {
    padding: '3px 8px',
    border: '1px solid',
    borderRadius: 4,
    fontFamily: TOKENS.fontMono,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  // Tree-purpose summary at the top of each column. The verb the player
  // reads BEFORE they look at the cost/tier. Cyan accent so it stands
  // out from the secondary body copy below. Tim playtest 2026-05-24.
  purposeCopy: {
    margin: '4px 0 0',
    fontFamily: TOKENS.fontBody,
    fontSize: 12,
    fontWeight: 600,
    color: TOKENS.text,
    lineHeight: 1.5,
    minHeight: 56,
  },
  benefitCopy: {
    margin: 0,
    fontFamily: TOKENS.fontBody,
    fontSize: 11,
    color: TOKENS.textMuted,
    lineHeight: 1.5,
    minHeight: 32,
  },
  // Before/after comparison block — concrete numeric preview the player
  // can scan at a glance. Sits below the NEXT tier badge, above the
  // cost row.
  beforeAfterBlock: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    // brass-tinted warm inset, replacing cyan-tinted background
    background: 'rgba(212, 160, 74, 0.06)',
    border: `1px solid ${TOKENS.borderSubtle}`,
    borderRadius: 8,
  },
  beforeAfterStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    alignItems: 'center',
  },
  beforeAfterLabel: {
    fontFamily: TOKENS.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.20em',
    textTransform: 'uppercase',
    color: TOKENS.textDim,
  },
  beforeAfterValue: {
    fontFamily: TOKENS.fontMono,
    fontSize: 13,
    fontWeight: 700,
    color: TOKENS.textMuted,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.06em',
  },
  beforeAfterValueHi: {
    fontFamily: TOKENS.fontMono,
    fontSize: 13,
    fontWeight: 800,
    color: TOKENS.brass,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.06em',
  },
  beforeAfterArrow: {
    fontFamily: TOKENS.fontMono,
    fontSize: 14,
    color: TOKENS.brass,
    fontWeight: 700,
  },
  nextRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  nextEyebrow: {
    fontFamily: TOKENS.fontMono,
    fontSize: 9,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: TOKENS.textDim,
  },
  costRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 8,
    borderTop: `1px solid ${TOKENS.borderSubtle}`,
  },
  costLabel: {
    fontFamily: TOKENS.fontMono,
    fontSize: 10,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: TOKENS.textDim,
  },
  costValueOk: {
    fontFamily: TOKENS.fontMono,
    fontSize: 18,
    fontWeight: 800,
    color: TOKENS.brass,
    fontVariantNumeric: 'tabular-nums',
  },
  costValueShort: {
    fontFamily: TOKENS.fontMono,
    fontSize: 18,
    fontWeight: 800,
    color: TOKENS.textMuted,
    fontVariantNumeric: 'tabular-nums',
  },
  // Tim 2026-05-26 no-cyan-on-wood: UPGRADE buy buttons migrated from cyan
  // to brass-on-walnut. The card body is dark inset on wood panel — but
  // since the wood panel frames the whole composition, brass is the
  // correct register here.
  buyButton: {
    padding: '12px 16px',
    background: 'linear-gradient(180deg, #f0c674, #c89148)',
    color: '#2a1a08',
    border: '1px solid #d4a04a',
    borderRadius: 10,
    fontFamily: TOKENS.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow:
      'inset 0 1px 0 rgba(255,232,188,0.55), inset 0 -2px 0 rgba(86,54,30,0.40), 0 6px 14px rgba(0,0,0,0.35)',
  },
  buyButtonDisabled: {
    padding: '12px 16px',
    background: 'rgba(140, 92, 52, 0.22)',
    color: 'rgba(255, 232, 188, 0.45)',
    border: '1px solid rgba(184, 137, 92, 0.32)',
    borderRadius: 10,
    fontFamily: TOKENS.fontMono,
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: 'not-allowed',
  },
  maxedBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    border: `1px dashed ${TOKENS.borderSubtle}`,
    borderRadius: 10,
    background: 'rgba(245, 194, 91, 0.04)',
  },
  maxedLabel: {
    fontFamily: TOKENS.fontMono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: '#f5c25b',
  },
  maxedHint: {
    fontFamily: TOKENS.fontBody,
    fontSize: 11,
    color: TOKENS.textDim,
  },
  panelFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: 10,
    borderTop: `1px solid ${TOKENS.borderSubtle}`,
  },
  doneButton: {
    padding: '12px 24px',
    background: 'transparent',
    border: `1px solid ${TOKENS.borderHairline}`,
    color: TOKENS.text,
    borderRadius: 10,
    fontFamily: TOKENS.fontMono,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  // ── Upgrade achievement overlay ──────────────────────────────────────
  achievementOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(3, 7, 13, 0.62)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    borderRadius: 12,
    pointerEvents: 'none',
    zIndex: 20,
    animation: 'oo-fisher-upgrade-achieve 1500ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
  },
  achievementCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    padding: '28px 44px',
    background: TOKENS.surface,
    backgroundBlendMode: 'multiply, normal',
    border: '2px solid #d4a04a',
    borderRadius: 14,
    boxShadow:
      '0 30px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,222,158,0.55), inset 0 -2px 4px rgba(0,0,0,0.4)',
  },
  achievementEyebrow: {
    fontFamily: TOKENS.fontMono,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.36em',
    textTransform: 'uppercase',
    color: TOKENS.brass,
    textShadow: '0 0 14px rgba(255, 210, 122, 0.55)',
  },
  achievementTreeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  achievementIcon: {
    fontSize: 32,
    lineHeight: 1,
  },
  achievementTreeLabel: {
    fontFamily: TOKENS.fontMono,
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: '0.06em',
    color: TOKENS.text,
    textTransform: 'uppercase',
  },
  achievementTransition: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  achievementTierChip: {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid',
    fontFamily: TOKENS.fontMono,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  achievementTierChipHi: {
    padding: '8px 18px',
    borderRadius: 999,
    border: '2px solid',
    fontFamily: TOKENS.fontMono,
    fontSize: 14,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
  },
  achievementArrow: {
    fontFamily: TOKENS.fontMono,
    fontSize: 18,
    fontWeight: 900,
    color: TOKENS.brass,
  },
}

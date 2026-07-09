'use client'

/**
 * PulseUnlockShowcase — the engagement "what you grind towards" surface (S3).
 *
 * An in-canvas overlay opened from the rank chip, in the VCM-2087 cool-steel
 * console register (obsidian + titanium + cyan, the game's native accent). It
 * is the single most important retention surface: the player SEES the rank
 * ladder, the soulbound reward at each rung, and what they own vs what is left.
 *
 * THREE TABS:
 *   - JOURNEY: the 11-rung ladder, each rung EARNED / NEXT / locked + the
 *     soulbound reward + benefit-kind tag. Progress-to-next is shown HERE ONLY
 *     (this panel is player-initiated + viewed between rounds — pull, not push).
 *     It is NEVER shown on the in-round chip / HUD (crash-RG fence: no in-round
 *     proximity pressure).
 *   - COLLECTION: owned cosmetics vs locked, with the unlock label.
 *   - RECORD: neutral retrospective stats (lifetime signals, rank, collection
 *     progress). No personal-best-multiplier, no progress bars, no targets — a
 *     log, not a chaser.
 *
 * HONEST CLAIM: the claim CTA is disabled with a "minting coming soon" note
 * until the Domain-D mint slice (S7) ships — the panel never fakes a mint.
 *
 * Domain C: presentation only. It receives the lifetime signals (bigint) and
 * calls the pure pulseRank / pulseRewards / pulseCosmetics modules. No money
 * math, no payout, no I/O. EV-neutral end to end. Zero warm material; cyan is
 * the native accent (no warm+cyan possible on this cool ground).
 */
import { type CSSProperties, type ReactElement, useEffect, useRef, useState } from 'react'
import type { PulseHistoryRow } from './pulseProvider'
import {
  pulseShowcaseConfig,
  type RewardShowcaseConfig,
  type ShowcaseCosmetic,
  type ShowcaseEquipState,
} from './rewardShowcase.config'

type ShowcaseTab = 'journey' | 'collection' | 'record'

export interface PulseUnlockShowcaseProps {
  /** The player's lifetime ownership points (signals) — display only. */
  readonly lifetimeSignals: bigint
  /** The player's lifetime rounds played — drives rank. */
  readonly lifetimeRounds: bigint
  /** Currently equipped trace skin ID, or null. */
  readonly equippedTraceSkinId: string | null
  /** Currently equipped ambient track ID, or null. */
  readonly equippedAmbientTrackId: string | null
  /** Whether the HUD bezel frame is equipped. */
  readonly equippedHudBezel: boolean
  /** Equip a cosmetic by ID. */
  readonly onEquip: (id: string) => void
  /** Unequip a cosmetic by ID. */
  readonly onUnequip: (id: string) => void
  /** Close the overlay. */
  readonly onClose: () => void
  /** Reduced-motion preference (suppresses the entrance animation). */
  readonly reducedMotion?: boolean
  /**
   * Round history for the Tape — the last 20 settled rounds, shown when the
   * Tape is unlocked (rank >= 2). Passed from PulseExperience's state.history.
   * Optional: if not provided, falls back to an empty array.
   */
  readonly history?: ReadonlyArray<PulseHistoryRow>
  /**
   * Reward / progression config. Defaults to Pulse's own config; pass another
   * game's `RewardShowcaseConfig` to reuse this entire showcase for that game.
   */
  readonly config?: RewardShowcaseConfig
}

// ─── Cool-steel console palette (cyan native accent, zero warm) ──────────────
const INK = '#07080C' // DS ink
const PANEL = '#0D0F15' // DS coal
const PANEL_RAISED = '#161A23' // DS slate
const BORDER = 'rgba(41, 230, 255, 0.30)' // DS cyan hairline
const HAIRLINE = 'rgba(255, 255, 255, 0.08)'
const ACCENT = '#29E6FF' // DS cyan (replaces deleted #00D0DE)
const TEXT = '#F2F3EF' // DS bone
const TEXT_MUTED = '#98A1B3' // DS fog
const TEXT_DIM = 'rgba(255, 255, 255, 0.60)' // A11Y — was 0.38 (failed 4.5:1)
const MONO = 'var(--font-family-mono, "Geist Mono", ui-monospace, monospace)'

export function PulseUnlockShowcase({
  lifetimeSignals,
  lifetimeRounds,
  equippedTraceSkinId,
  equippedAmbientTrackId,
  equippedHudBezel,
  onEquip,
  onUnequip,
  onClose,
  reducedMotion = false,
  history = [],
  config = pulseShowcaseConfig,
}: PulseUnlockShowcaseProps): ReactElement {
  const [tab, setTab] = useState<ShowcaseTab>('journey')
  // Rank is derived from the progression metric (Pulse: rounds played).
  const rank = config.computeRank(lifetimeRounds)
  // Opaque equip-state bag handed to config.isEquipped (game-defined keys).
  const equip: ShowcaseEquipState = {
    traceSkinId: equippedTraceSkinId,
    ambientTrackId: equippedAmbientTrackId,
    hudBezel: equippedHudBezel,
  }
  // The history "Tape" unlocks at a config-defined rank.
  const tapeUnlocked = rank.rankIndex >= config.tapeUnlockRank
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  // Focus management (a11y, WCAG 2.1.1/2.1.2/2.4.3): auto-focus the close
  // button on open, trap Tab inside the sheet, Escape closes, and focus returns
  // to the opener (the rank chip) on close. Pure DOM — no library, no setState.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeBtnRef.current?.focus()
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const sheet = sheetRef.current
      if (!sheet) return
      const focusable = sheet.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [onClose])

  return (
    <div
      style={styles.veil}
      data-testid="pulse-unlock-showcase"
      role="dialog"
      aria-modal="true"
      aria-label="Operator rank and rewards"
      // Backdrop tap-to-close: only when the veil itself is clicked, not a
      // child (avoids a stopPropagation handler on the sheet). Keyboard close
      // is Escape (handled here + in the focus-trap effect).
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div
        ref={sheetRef}
        style={{
          ...styles.sheet,
          animation: reducedMotion
            ? undefined
            : 'pulse-card-enter 220ms cubic-bezier(0.2,0.8,0.2,1)',
        }}
      >
        {/* Header — identity + lifetime total + close */}
        <div style={styles.header}>
          <div style={styles.headerIdentity}>
            <span style={styles.eyebrow}>OPERATOR RANK</span>
            <span style={styles.rankTitle}>{rank.rankTitle}</span>
            <span style={styles.rankSub}>
              {lifetimeRounds.toString()} {config.labels.progressionMetricLabel.toLowerCase()} · rank{' '}
              {rank.rankIndex} of {config.labels.rankCount}
            </span>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            style={styles.closeBtn}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div style={styles.tabBar} role="tablist">
          {(['journey', 'collection', 'record'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              style={tab === t ? styles.tabActive : styles.tab}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div style={styles.body} role="tabpanel">
          {tab === 'journey' && (
            <JourneyTab config={config} currentRank={rank.rankIndex} progressBps={rank.progressBps} />
          )}
          {tab === 'collection' && (
            <CollectionTab
              config={config}
              currentRank={rank.rankIndex}
              equip={equip}
              onEquip={onEquip}
              onUnequip={onUnequip}
            />
          )}
          {tab === 'record' && (
            <RecordTab
              config={config}
              lifetimeSignals={lifetimeSignals}
              lifetimeRounds={lifetimeRounds}
              currentRank={rank.rankIndex}
              tapeUnlocked={tapeUnlocked}
              history={history}
            />
          )}
        </div>

        {/* Footer — honest claim + soulbound footnote */}
        <div style={styles.footer}>
          <button type="button" disabled style={styles.claimBtn}>
            CLAIM REWARDS
          </button>
          <span style={styles.footnote}>
            Minting coming soon. Each token is yours alone, non-transferable. Your rank never
            changes the curve.
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── JOURNEY: the rank ladder ────────────────────────────────────────────────

function JourneyTab({
  config,
  currentRank,
  progressBps,
}: {
  config: RewardShowcaseConfig
  currentRank: number
  progressBps: bigint
}): ReactElement {
  const ladder = config.rewardLadder()
  return (
    <div style={styles.ladder}>
      {ladder.map(({ tier, reward }) => {
        const earned = tier.index <= currentRank
        const isNext = tier.index === currentRank + 1
        const state = earned ? 'EARNED' : isNext ? 'NEXT' : 'LOCKED'
        // Honest gated state: a loyalty rung whose platform effect is not yet
        // wired (gatedPendingAttestation) reads "EARNED · SOON" once reached —
        // the rank is earned, the platform activation is pending. Never fakes
        // an active effect (e.g. a "DAILY BONUS ACTIVE" pip) that does not exist.
        const stateLabel = earned && reward?.gatedPendingAttestation ? 'EARNED · SOON' : state
        return (
          <div
            key={tier.index}
            style={{ ...styles.rung, opacity: earned || isNext ? 1 : 0.55 }}
            data-rung-state={state}
          >
            <div style={styles.rungLeft}>
              <span style={styles.rungIndex}>{tier.index}</span>
              <div style={styles.rungText}>
                <span style={styles.rungTitle}>{tier.titleLab}</span>
                <span style={styles.rungReward}>{reward ? reward.nftNameLab : tier.unlock}</span>
              </div>
            </div>
            <div style={styles.rungRight}>
              {reward && <span style={styles.kindTag}>{reward.benefitKind.toUpperCase()}</span>}
              <span
                style={{
                  ...styles.rungState,
                  color: earned ? ACCENT : isNext ? TEXT : TEXT_DIM,
                }}
              >
                {stateLabel}
              </span>
            </div>
            {/* Progress-to-next shown ONLY on the NEXT rung (pull, not push). */}
            {isNext && (
              <div style={styles.progressTrack}>
                <div
                  style={{
                    ...styles.progressFill,
                    width: `${Math.min(100, Number(progressBps) / 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── COLLECTION: owned vs locked cosmetics, with EQUIP/UNEQUIP UX ────────────

function CollectionTab({
  config,
  currentRank,
  equip,
  onEquip,
  onUnequip,
}: {
  config: RewardShowcaseConfig
  currentRank: number
  equip: ShowcaseEquipState
  onEquip: (id: string) => void
  onUnequip: (id: string) => void
}): ReactElement {
  const ownedSet = config.ownedCosmeticIds(currentRank)

  return (
    <div style={styles.grid}>
      {config.allCosmetics.map((item: ShowcaseCosmetic) => {
        const owned = ownedSet.has(item.id)
        const equippable = config.isEquippable(item)
        const equipped = owned && equippable && config.isEquipped(item, equip)
        return (
          <div
            key={item.id}
            style={{ ...styles.cell, opacity: owned ? 1 : 0.45 }}
            data-owned={owned}
            data-equipped={equipped}
          >
            <div style={styles.cellTop}>
              {item.swatch ? (
                <span style={{ ...styles.swatch, background: item.swatch }} aria-hidden="true" />
              ) : (
                <span style={styles.cellGlyph} aria-hidden="true">
                  {equipped ? '◆' : owned ? '◈' : '◇'}
                </span>
              )}
              <span style={styles.cellName}>{item.name}</span>
            </div>
            {owned && equippable && (
              <button
                type="button"
                style={equipped ? styles.unequipBtn : styles.equipBtn}
                onClick={() => (equipped ? onUnequip(item.id) : onEquip(item.id))}
                aria-pressed={equipped}
              >
                {equipped ? 'UNEQUIP' : 'EQUIP'}
              </button>
            )}
            {owned && !equippable && (
              <span style={{ ...styles.cellMeta, color: ACCENT }}>{config.passiveLabel}</span>
            )}
            {!owned && <span style={styles.cellMeta}>{config.unlockLabel(item)}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ─── RECORD: neutral retrospective + The Tape ────────────────────────────────

function RecordTab({
  config,
  lifetimeSignals,
  lifetimeRounds,
  currentRank,
  tapeUnlocked,
  history,
}: {
  config: RewardShowcaseConfig
  lifetimeSignals: bigint
  lifetimeRounds: bigint
  currentRank: number
  tapeUnlocked: boolean
  history: ReadonlyArray<PulseHistoryRow>
}): ReactElement {
  const ownedCount = config.ownedCosmeticIds(currentRank).size
  return (
    <div style={styles.record}>
      <RecordRow label={config.labels.progressionMetricLabel} value={lifetimeRounds.toString()} />
      <RecordRow label="OPERATOR RANK" value={`${currentRank} of ${config.labels.rankCount}`} />
      <RecordRow
        label={config.labels.pointsRowLabel}
        value={`${config.formatPoints(lifetimeSignals)} ${config.labels.pointsTerm}`}
      />
      <RecordRow label="COLLECTION" value={`${ownedCount} of ${config.allCosmetics.length} owned`} />
      {/* The Tape — unlocked at rank 2. Shows the last 20 settled rounds. */}
      {tapeUnlocked ? (
        <div style={styles.tapeSection}>
          <span style={styles.tapeSectionHeader}>THE TAPE · LAST {history.length} ROUNDS</span>
          {history.length === 0 ? (
            <span style={styles.recordNote}>No rounds played yet this session.</span>
          ) : (
            <div style={styles.tapeList}>
              {history.map((row, i) => (
                <TapeRow key={i} row={row} index={i} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <span style={styles.recordNote}>
          The Tape unlocks at rank 2 (25 rounds played). Settled rounds will be logged here.
        </span>
      )}
    </div>
  )
}

function TapeRow({ row, index }: { row: PulseHistoryRow; index: number }): ReactElement {
  const { crashBps, won, cashedOutAtBps } = row
  const crashMul = (Number(crashBps) / 10000).toFixed(2)
  const cashoutMul = cashedOutAtBps ? (Number(cashedOutAtBps) / 10000).toFixed(2) : null
  return (
    <div
      style={{
        ...styles.tapeRow,
        borderLeft: `2px solid ${won ? ACCENT : 'rgba(255,65,53,0.55)'}`,
      }}
    >
      <span style={{ ...styles.tapeRowLabel, color: TEXT_DIM }}>
        {index === 0 ? 'LAST' : `R-${index}`}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 11,
          color: won ? ACCENT : 'rgba(255,65,53,0.9)',
          fontWeight: 700,
        }}
      >
        {won ? `OUT ${cashoutMul}x` : `CRASH ${crashMul}x`}
      </span>
      {/* RG-C3: the would-have-crashed point is NEVER shown on a winning row —
          revealing "bust at X" reframes a win as a near-miss ("you left money
          on the table"). The factual record is the OUT/CRASH value above. */}
    </div>
  )
}

function RecordRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={styles.recordRow}>
      <span style={styles.recordLabel}>{label}</span>
      <span style={styles.recordValue}>{value}</span>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  veil: {
    // position:fixed (escapes the canvasShell's transform stacking context so
    // it resolves against the true viewport — combined with the createPortal
    // to document.body at the call site). 88dvh sheet so the engagement layer
    // is fully visible + scrollable on a 412px phone, not clipped to a 156px
    // canvas. overscrollBehavior:contain stops scroll chaining to the page.
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    background: 'rgba(3, 7, 13, 0.88)',
    backdropFilter: 'blur(4px)',
    overscrollBehavior: 'contain',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    width: 'min(94vw, 640px)',
    maxHeight: '88dvh',
    display: 'flex',
    flexDirection: 'column',
    background: PANEL,
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    boxShadow: `0 24px 80px ${INK}, inset 0 1px 0 rgba(255,255,255,0.06)`,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '18px 20px',
    borderBottom: `1px solid ${HAIRLINE}`,
  },
  headerIdentity: { display: 'flex', flexDirection: 'column', gap: 4 },
  eyebrow: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: '0.24em',
    color: TEXT_DIM,
  },
  rankTitle: {
    fontFamily: MONO,
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: TEXT,
  },
  rankSub: {
    fontFamily: MONO,
    fontSize: 11,
    color: TEXT_MUTED,
    fontVariantNumeric: 'tabular-nums',
  },
  closeBtn: {
    fontFamily: MONO,
    fontSize: 14,
    color: TEXT_MUTED,
    background: 'transparent',
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 8,
    // 44x44 hit area (Apple HIG / WCAG 2.5.8) — the only exit from a full-canvas
    // overlay on mobile. touch-action:manipulation kills the 300ms tap delay.
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation',
    cursor: 'pointer',
  },
  tabBar: {
    display: 'flex',
    gap: 2,
    padding: '10px 16px 0',
    borderBottom: `1px solid ${HAIRLINE}`,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    touchAction: 'manipulation',
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: '0.18em',
    color: TEXT_DIM,
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '8px 4px 10px',
    cursor: 'pointer',
  },
  tabActive: {
    flex: 1,
    minHeight: 44,
    touchAction: 'manipulation',
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: '0.18em',
    color: ACCENT,
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid ${ACCENT}`,
    padding: '8px 4px 10px',
    cursor: 'pointer',
  },
  body: { overflowY: 'auto', padding: 16, flex: 1 },
  // JOURNEY
  ladder: { display: 'flex', flexDirection: 'column', gap: 6 },
  rung: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    padding: '10px 12px',
    background: PANEL_RAISED,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 10,
  },
  rungLeft: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  rungIndex: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 700,
    color: TEXT_DIM,
    width: 18,
    textAlign: 'right',
  },
  rungText: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  rungTitle: { fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TEXT },
  rungReward: { fontFamily: MONO, fontSize: 11, color: TEXT_MUTED },
  rungRight: { display: 'flex', alignItems: 'center', gap: 10 },
  kindTag: {
    fontFamily: MONO,
    fontSize: 8,
    letterSpacing: '0.16em',
    color: TEXT_DIM,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 4,
    padding: '2px 5px',
  },
  rungState: { fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', fontWeight: 700 },
  progressTrack: {
    flexBasis: '100%',
    height: 3,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', background: ACCENT, borderRadius: 2 },
  // COLLECTION
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '12px',
    background: PANEL_RAISED,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 10,
  },
  cellTop: { display: 'flex', alignItems: 'center', gap: 8 },
  swatch: { width: 16, height: 16, borderRadius: 4, border: `1px solid ${HAIRLINE}` },
  cellGlyph: { fontFamily: MONO, fontSize: 14, color: ACCENT, width: 16, textAlign: 'center' },
  cellName: { fontFamily: MONO, fontSize: 12, fontWeight: 700, color: TEXT },
  cellMeta: { fontFamily: MONO, fontSize: 10, color: TEXT_DIM, textTransform: 'capitalize' },
  // RECORD
  record: { display: 'flex', flexDirection: 'column', gap: 2 },
  recordRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 8px',
    borderBottom: `1px solid ${HAIRLINE}`,
  },
  recordLabel: { fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', color: TEXT_DIM },
  recordValue: {
    fontFamily: MONO,
    fontSize: 15,
    fontWeight: 700,
    color: TEXT,
    fontVariantNumeric: 'tabular-nums',
  },
  recordNote: {
    fontFamily: MONO,
    fontSize: 10,
    color: TEXT_DIM,
    padding: '12px 8px',
    lineHeight: 1.5,
  },
  // Equip / unequip buttons — full-width, inside the cosmetic cell
  equipBtn: {
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.16em',
    color: ACCENT,
    background: 'rgba(41,230,255,0.10)',
    border: `1px solid rgba(41,230,255,0.35)`,
    borderRadius: 6,
    padding: '12px 8px',
    minHeight: 44,
    cursor: 'pointer',
    touchAction: 'manipulation',
    width: '100%',
    marginTop: 6,
  },
  unequipBtn: {
    fontFamily: MONO,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.16em',
    color: TEXT_MUTED,
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid rgba(255,255,255,0.12)`,
    borderRadius: 6,
    padding: '12px 8px',
    minHeight: 44,
    cursor: 'pointer',
    touchAction: 'manipulation',
    width: '100%',
    marginTop: 6,
  },
  // The Tape — round history list
  tapeSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    padding: '12px 8px 0',
  },
  tapeSectionHeader: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.22em',
    color: ACCENT,
    paddingBottom: 6,
    borderBottom: `1px solid rgba(41,230,255,0.20)`,
  },
  tapeList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  tapeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 10px',
    background: PANEL_RAISED,
    borderRadius: 6,
    paddingLeft: 10,
  },
  tapeRowLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.12em',
    width: 32,
    flexShrink: 0,
  },
  // Footer
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '14px 20px 18px',
    borderTop: `1px solid ${HAIRLINE}`,
  },
  claimBtn: {
    fontFamily: MONO,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.18em',
    color: TEXT_DIM,
    background: PANEL_RAISED,
    border: `1px solid ${HAIRLINE}`,
    borderRadius: 10,
    padding: '12px',
    cursor: 'not-allowed',
  },
  footnote: { fontFamily: MONO, fontSize: 9, color: TEXT_DIM, lineHeight: 1.5 },
}

/**
 * AUTOMAT — Experience (React UI/skin). Zero props; the harness is the mount.
 *
 * Layout family: Swoobz Originals gutter-card system (dark room, machine as
 * the hero, ~320px control column). Look derived from Tim's reference set
 * (`input/vending/`): porcelain gacha cabinet + cyan neon; packs slate-teal
 * with a gold hex emblem; GOLD packs gold-wrapped (outcome class).
 *
 * Accent economy (rule of three): cyan = player/interactive, gold = value,
 * neutral slate for everything else. No red needed (a dud pays 0; it is not
 * "danger", just an empty wrap).
 *
 * RG-C5: the settled panel is byte-identical in structure regardless of the
 * total (only the numbers differ); win/loss CTA treatment is symmetric; no
 * auto-repeat (every vend is an explicit press). No em-dashes in copy.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { VendingMachineCanvas } from './VendingMachineCanvas'
import { playGoldPack, playVendPack } from './vendingAudio'
import { derivePackRoll, TIER_DISPLAY_LABEL, useVendingController, VEND_STEP_MS } from './vendingProvider'
import type { PackResult, VendingOutcome } from './vendingProvider'
import {
  formatMultiplier,
  formatUsdc,
  GOLD_ONE_IN_BY_TIER,
  MAX_PACKS,
  MIN_PACKS,
  PACK_MAX_MULTIPLIER_BPS_BY_TIER,
  TIER_ORDER,
} from './vendingMath'
import type { VendingTierId } from './vendingMath'

// ── Skin tokens ─────────────────────────────────────────────────────────────
const T = {
  room: '#07090d',
  // Machine-plaque material (the cabinet's dark marquee islands): every panel
  // and key shares it so the UI reads as part of the machine, not a web page.
  plaque: '#14171d',
  ink: 'rgba(13, 15, 21, 0.95)',
  keyFace: '#232830',
  card: 'rgba(16, 20, 27, 0.86)',
  cardEdge: 'rgba(122, 134, 152, 0.22)',
  text: '#e8ecf1',
  dim: '#9aa3b2',
  // WCAG-safe dim: small always-on labels over the dark rail backplates. T.dim
  // measures 4.38-4.63:1 there (straddles AA 4.5) and T.faint fails outright —
  // use dimLift for any <=13px label that must stay readable (a11y QA 2026-07-22).
  dimLift: '#b7c1d0',
  faint: '#5c6675',
  cyan: '#00F0FF',
  cyanDim: 'rgba(0, 240, 255, 0.14)',
  gold: '#f0b542',
  goldDim: 'rgba(240, 181, 66, 0.14)',
  mono: '"Geist Mono", ui-monospace, monospace',
  sans: '"Geist", system-ui, sans-serif',
} as const

/** Price ladder: the dropdown presets; − / + walk this list. */
const PRICE_LADDER: readonly bigint[] = [
  100_000n,
  250_000n,
  500_000n,
  1_000_000n,
  2_000_000n,
  5_000_000n,
  10_000_000n,
]

const selectStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 44,
  fontFamily: '"Geist Mono", ui-monospace, monospace',
  fontWeight: 700,
  fontSize: 15,
  textAlign: 'center',
  background: 'linear-gradient(180deg, var(--tier-key-top, #282d37) 0%, var(--tier-key-bottom, #1d2129) 100%)',
  color: '#e8ecf1',
  border: '1.5px solid rgba(13, 15, 21, 0.95)',
  borderRadius: 9,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -2px 3px rgba(0,0,0,0.35)',
  padding: '0 10px',
  cursor: 'pointer',
  touchAction: 'manipulation',
  // The native option popup follows the page's color-scheme; without this it
  // renders a white list whose options inherit light text = white on white.
  colorScheme: 'dark',
}

/** Options render in the browser's native popup, outside our DOM skin — give
 *  them the machine-plaque material explicitly so the list reads as the game. */
const selectOptionStyle: React.CSSProperties = {
  background: T.plaque,
  color: T.text,
  fontFamily: T.mono,
  fontWeight: 600,
}

/** Per-machine rooms (Tim: elke difficulty zijn eigen achtergrond + gloed-
 *  markering — groen voor easy, ember-rood voor hard). The room crossfades
 *  WITH the turntable; the glow is the instant difficulty read. Provenance in
 *  used-assets/room-templates/MANIFEST.md. */
/** The three money machines on the turntable. */
const MACHINE_ORDER: readonly VendingTierId[] = TIER_ORDER
const MACHINE_STEP_DEG = 360 / MACHINE_ORDER.length

const TIER_ROOMS: Readonly<
  Record<
    VendingTierId,
    { src: string; scrim: number; glow: string; led: string; spillTop: string; spillBottom: string }
  >
> = {
  easy: {
    src: '/room-templates/t7-room-easy.png',
    scrim: 0.52,
    glow: 'rgba(61, 220, 151, 0.16)',
    led: '#3ddc97',
    spillTop: 'rgba(61, 220, 151, 0.05)',
    spillBottom: 'rgba(61, 220, 151, 0.08)',
  },
  medium: {
    src: '/room-templates/t8-room-medium.png',
    scrim: 0.4,
    glow: 'rgba(180, 200, 235, 0.14)',
    led: '#9fb6e8',
    spillTop: 'rgba(159, 182, 232, 0.05)',
    spillBottom: 'rgba(159, 182, 232, 0.07)',
  },
  hard: {
    src: '/room-templates/t9-room-hard.png',
    scrim: 0.34,
    glow: 'rgba(229, 72, 77, 0.16)',
    led: '#e5484d',
    spillTop: 'rgba(229, 72, 77, 0.05)',
    spillBottom: 'rgba(229, 72, 77, 0.09)',
  },
}

/** Per-machine UI theme: the WHOLE panel system re-skins with the armed
 *  machine (Tim: per vending machine het UI, alles komt samen). Delivered as
 *  CSS variables on the root so every plate/key/frame/label follows the
 *  turntable without per-component wiring. */
const TIER_UI: Readonly<
  Record<
    VendingTierId,
    { plaqueTop: string; plaqueBottom: string; keyTop: string; keyBottom: string; frame: string; label: string }
  >
> = {
  easy: {
    plaqueTop: '#1b1f24',
    plaqueBottom: '#11151b',
    keyTop: '#293039',
    keyBottom: '#1d222a',
    frame: 'rgba(240, 181, 66, 0.13)',
    label: 'rgba(240, 181, 66, 0.8)',
  },
  medium: {
    plaqueTop: '#181d2c',
    plaqueBottom: '#0f1320',
    keyTop: '#252c3f',
    keyBottom: '#191f30',
    frame: 'rgba(223, 228, 234, 0.16)',
    label: 'rgba(223, 228, 234, 0.72)',
  },
  hard: {
    plaqueTop: '#17181d',
    plaqueBottom: '#0c0d11',
    keyTop: '#23252d',
    keyBottom: '#16181e',
    frame: 'rgba(240, 181, 66, 0.2)',
    label: 'rgba(240, 181, 66, 0.88)',
  },
}

/** Turntable geometry: machines stand on a circle of this radius (px) and the
 *  plateau rotates 120° per step — the two background machines stay visible. */
const TURNTABLE_RADIUS = 305

/** Slot-pick TOUCH FLOOR. The pick overlay's hit-cells are percent-positioned
 *  against the machine canvas (5 columns across the glass), so a cell's width
 *  is a fixed fraction of the canvas CSS width. 337px is the measured width at
 *  which the narrowest cell still clears the 44px touch minimum — below it the
 *  feature is NOT OFFERED rather than offered too small (SPEC-PORTRAIT-0831
 *  "never below 337px canvas width", learning 18). */
const SLOT_PICK_MIN_CANVAS_PX = 337

const EMPTY_PACKS: readonly PackResult[] = []
/** DOM chip pop is delayed to the canvas bay-landing beat
 *  (coil + chamber fall + hidden beat + bay drop). */
const CHIP_SYNC_MS = 880

/** Pure presentation map packIndex → physical vend slot for the OPTIONAL
 *  slot-pick feature. The first `min(selected, packCount)` packs vend from the
 *  chosen slots in selection order; the rest auto-fill the lowest UNUSED slots
 *  (never reusing a slot vended this round) — exactly today's 0,1,2… order when
 *  nothing is picked. Rolls/reveal-order/receipt never see this (money law). */
function computeSlotOrder(selected: readonly number[], packCount: number): number[] {
  const order: number[] = []
  const used = new Set<number>()
  const k = Math.min(selected.length, packCount)
  for (let i = 0; i < k; i++) {
    order.push(selected[i]!)
    used.add(selected[i]!)
  }
  let auto = 0
  for (let i = k; i < packCount; i++) {
    while (used.has(auto)) auto++
    order.push(auto)
    used.add(auto)
    auto++
  }
  return order
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = (e: MediaQueryListEvent): void => setReduced(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

// ── Small building blocks ───────────────────────────────────────────────────

function Card({
  children,
  style,
  className,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}): React.ReactElement {
  return (
    <div
      className={`vend-card${className ? ` ${className}` : ''}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        // Layered plate: readability scrim over the tier's GENERATED panel
        // art (mural-language ornaments at the edges, calm dark center) over
        // a depth-gradient fallback.
        background: [
          'linear-gradient(180deg, rgba(17,21,27,0.72) 0%, rgba(10,13,17,0.82) 100%)',
          'var(--tier-panel, none) center / cover no-repeat',
          'linear-gradient(180deg, var(--tier-plaque-top, #191d25) 0%, var(--tier-plaque-bottom, #10141a) 100%)',
        ].join(', '),
        border: `2px solid ${T.ink}`,
        borderRadius: 12,
        padding: '16px 16px 14px',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.4), 0 8px 18px rgba(0,0,0,0.4)',
        ...style,
      }}
    >
      {/* Armed-machine accent seam (follows the turntable, green/silver/red). */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 14,
          right: 14,
          height: 2,
          borderRadius: 1,
          background: 'var(--tier-led, rgba(0,240,255,0.5))',
          opacity: 0.45,
          transition: 'background 700ms ease',
        }}
      />
      {/* Inner hairline frame (the cards' double-line frame language) — gold
          on TIDE/OBSIDIAN, silver on STORM. */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 4,
          borderRadius: 8,
          border: '1px solid var(--tier-frame, rgba(240,181,66,0.12))',
          pointerEvents: 'none',
        }}
      />
      {/* Plaque rivets (the machine's bolted-signage read). */}
      {[{ left: 8 }, { right: 8 }].map((pos, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            position: 'absolute',
            top: 8,
            width: 4,
            height: 4,
            borderRadius: 2,
            background: '#0a0c10',
            boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.14)',
            ...pos,
          }}
        />
      ))}
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontFamily: T.mono,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.14em',
        color: 'var(--tier-label, rgba(240, 181, 66, 0.78))',
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {children}
    </div>
  )
}

const btnBase: React.CSSProperties = {
  fontFamily: T.mono,
  fontWeight: 600,
  border: `1.5px solid ${T.ink}`,
  borderRadius: 9,
  background: 'linear-gradient(180deg, var(--tier-key-top, #282d37) 0%, var(--tier-key-bottom, #1d2129) 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -2px 3px rgba(0,0,0,0.4)',
  color: '#cfd5df',
  cursor: 'pointer',
  minHeight: 44,
  minWidth: 44,
  touchAction: 'manipulation',
}

function SmallBtn({
  children,
  onClick,
  active = false,
  disabled = false,
  ariaLabel,
  grow = false,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
  ariaLabel?: string
  grow?: boolean
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      style={{
        ...btnBase,
        fontSize: 13,
        padding: '0 12px',
        flex: grow ? 1 : undefined,
        borderColor: active ? T.cyan : T.cardEdge,
        background: active ? T.cyanDim : 'rgba(255,255,255,0.04)',
        color: active ? T.cyan : T.text,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

/** One pack chip on the rail / receipt: multiplier or EMPTY, gold-classed.
 *  `hidden` (cutscene armed): a face-down chip — no value, no class tell —
 *  so the rip reveal stays unspoiled. */
function PackChip({
  pack,
  delayMs = 0,
  hidden = false,
}: {
  pack: PackResult
  delayMs?: number
  hidden?: boolean
}): React.ReactElement {
  const gold = !hidden && pack.cls === 'gold'
  const dud = pack.multiplierBps === 0n
  return (
    <div
      className="vend-chip"
      style={{
        animationDelay: `${delayMs}ms`,
        fontFamily: T.mono,
        fontWeight: 700,
        fontSize: 13,
        padding: '9px 0',
        width: 62,
        textAlign: 'center',
        borderRadius: 9,
        border: `1px solid ${gold ? T.gold : hidden || dud ? T.cardEdge : 'rgba(122,134,152,0.45)'}`,
        background: gold ? T.goldDim : 'rgba(255,255,255,0.04)',
        color: gold ? T.gold : hidden || dud ? T.faint : T.text,
        boxShadow: gold ? `0 0 14px ${T.goldDim}` : 'none',
      }}
    >
      {hidden ? '?' : dud ? 'EMPTY' : formatMultiplier(pack.multiplierBps)}
    </div>
  )
}

// ── Pack-rip cutscene (packref refs: floating foil pack → lip tear → card
//    pull → rarity burst). Pure transform/opacity CSS; module-const timings
//    identical for every value (rarity is an outcome CLASS, like gold). ──────

type CardRange = 'empty' | 'common' | 'rare' | 'gold'

function cardRange(p: PackResult): CardRange {
  if (p.cls === 'gold') return 'gold'
  if (p.multiplierBps === 0n) return 'empty'
  return p.multiplierBps < 10_000n ? 'common' : 'rare'
}

/** Per-range presentation class (labels, ray color/strength). Module consts. */
const RANGE_STYLE: Readonly<
  Record<CardRange, { label: string; color: string; ray: string; rayAlpha: number }>
> = {
  empty: { label: 'EMPTY', color: '#8b95a5', ray: '150,160,175', rayAlpha: 0 },
  common: { label: 'COMMON', color: '#bfe6f2', ray: '120,200,230', rayAlpha: 0.22 },
  rare: { label: 'RARE', color: '#7fd7ff', ray: '80,200,255', rayAlpha: 0.4 },
  gold: { label: 'GOLD', color: '#f0b542', ray: '240,181,66', rayAlpha: 0.65 },
}

// Rip choreography timings (module consts, RG-C5 — identical every rip).
const RIP_ENTER_MS = 700
const RIP_TEAR_MS = 1050
const RIP_SPREAD_MS = 620
const RIP_SPREAD_STAGGER_MS = 45
const RIP_FLIP_MS = 460
const RIP_FLIP_STAGGER_MS = 85

/** ONE ceremonial rip for the whole buy: the booster floats up, the lip tears
 *  off, and ALL cards fan out of the pack into a grid, then flip face-up in a
 *  cascading wave — gold cards fire their ray-burst on THEIR flip beat. */
// Per-machine standard-pack sprite for the rip ceremony (Tim 2026-07-22:
// the cutscene must tear the SAME pack the machine vends). Mirrors the
// canvas' PACK_STD_SRC map; gold stays shared (outcome-class marker, RG).
const RIP_PACK_SRC: Record<VendingTierId, string> = {
  easy: '/skin/pack-standard-cut.png',
  medium: '/skin/pack-storm-cut.png',
  hard: '/skin/pack-obsidian-cut.png',
}

function PackRipCutscene({
  outcome,
  tier,
  onFinish,
}: {
  outcome: VendingOutcome
  tier: VendingTierId
  onFinish: () => void
}): React.ReactElement {
  const [stage, setStage] = useState<'enter' | 'torn' | 'spread' | 'flip' | 'done'>('enter')
  const timers = useRef<number[]>([])
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Measured overlay box (jesse #2: the grid must fit the REAL column width,
  // not a fixed 520 — mobile columns are ~380px).
  const [box, setBox] = useState({ w: 520, h: 760 })
  useEffect(() => {
    const el = rootRef.current
    if (el && el.clientWidth > 0) setBox({ w: el.clientWidth, h: el.clientHeight })
  }, [])
  const n = outcome.packs.length
  const hasGold = outcome.packs.some((p) => p.cls === 'gold')
  const packImg = RIP_PACK_SRC[tier]

  // Grid geometry (computed, deterministic): up to 5 columns, cards sized to
  // fit the measured stage; the whole spread stays inside the machine column.
  const cols = Math.min(n, 5)
  const rows = Math.ceil(n / cols)
  const gap = 10
  const stageW = Math.min(box.w, 560)
  const cardW = Math.min(rows <= 1 ? 150 : 118, Math.floor((stageW - 24 - gap * (cols - 1)) / cols))
  const cardH = Math.round(cardW * 1.4)
  const gridW = cols * cardW + (cols - 1) * gap
  const gridH = rows * cardH + (rows - 1) * gap
  const gridTop = Math.max(54, Math.round((box.h - gridH) / 2) - 30)

  const clearTimers = (): void => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  useEffect(() => {
    clearTimers()
    const spreadDone = RIP_ENTER_MS + RIP_TEAR_MS + RIP_SPREAD_MS + n * RIP_SPREAD_STAGGER_MS
    const flipsDone = spreadDone + n * RIP_FLIP_STAGGER_MS + RIP_FLIP_MS
    timers.current.push(
      window.setTimeout(() => {
        setStage('torn')
        playVendPack()
      }, RIP_ENTER_MS),
      window.setTimeout(() => setStage('spread'), RIP_ENTER_MS + RIP_TEAR_MS),
      window.setTimeout(() => {
        setStage('flip')
        if (hasGold) playGoldPack()
      }, spreadDone),
      window.setTimeout(() => setStage('done'), flipsDone),
    )
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Click during the animation: fast-forward to the full revealed spread.
  // Once revealed there is NO auto-advance — the player looks as long as they
  // want; the next click continues to the receipt.
  const fastForward = (): void => {
    clearTimers()
    if (stage === 'done') {
      onFinish()
      return
    }
    setStage('done')
  }

  const torn = stage !== 'enter'
  const spread = stage === 'spread' || stage === 'flip' || stage === 'done'
  const flipping = stage === 'flip' || stage === 'done'
  const done = stage === 'done'

  return (
    <div
      ref={rootRef}
      onClick={fastForward}
      role="button"
      tabIndex={0}
      aria-label="Reveal all cards"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault()
          fastForward()
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 6,
        borderRadius: 18,
        overflow: 'hidden',
        cursor: 'pointer',
        // Light veil only — the machine and room stay clearly visible behind
        // the rip (Tim: geen zwart panel in de cutscene).
        background: `radial-gradient(62% 56% at 50% 44%, rgba(${hasGold && flipping ? RANGE_STYLE.gold.ray : '90,140,170'},${flipping ? 0.12 : 0.05}) 0%, rgba(3,5,8,0.6) 55%, rgba(3,5,8,0.32) 100%)`,
        backdropFilter: 'blur(2.5px)',
        WebkitBackdropFilter: 'blur(2.5px)',
        transition: 'background 600ms ease',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: T.mono,
          fontSize: 12,
          letterSpacing: '0.18em',
          color: T.dim,
        }}
      >
        {n === 1 ? 'YOUR PACK' : `YOUR ${n} PACKS`} · {outcome.tierLabel}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          clearTimers()
          onFinish()
        }}
        style={{
          ...btnBase,
          position: 'absolute',
          bottom: 14,
          right: 14,
          fontSize: 12,
          padding: '0 16px',
          color: T.cyan,
          borderColor: T.cyan,
          background: 'rgba(4,6,9,0.7)',
          zIndex: 3,
        }}
      >
        SKIP · SHOW RESULT
      </button>

      {/* The pack: floats up with a foil shimmer, lip tears, body drops away
          as the cards burst out. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: '38%',
          width: 210,
          height: 300,
          marginLeft: -105,
          marginTop: -150,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        {/* Lip strip: grip → tear-snap → long visible flight (fade only at
            the very end) — a real peel, not a vanish. */}
        <img
          src={packImg}
          alt=""
          className={
            stage === 'enter' ? 'rip-pack-in' : torn && !spread ? 'rip-lip-tear' : ''
          }
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 210,
            clipPath: 'inset(0 0 87% 0)',
            transformOrigin: '14% 90%',
            opacity: spread ? 0 : 1,
            zIndex: 3,
          }}
        />
        {/* Body: shakes with the tear, then drops away as the cards burst. */}
        <img
          src={packImg}
          alt=""
          className={
            stage === 'enter' ? 'rip-pack-in' : torn && !spread ? 'rip-body-shake' : ''
          }
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 210,
            clipPath: 'inset(11% 0 0 0)',
            transform: spread ? 'translateY(190px) rotate(-7deg) scale(0.92)' : 'translateY(0) rotate(0) scale(1)',
            opacity: spread ? 0 : 1,
            transition: `transform 520ms cubic-bezier(0.5, 0, 0.75, 0.4), opacity 460ms ease`,
            zIndex: 2,
          }}
        />
        {/* Foil shimmer while floating. */}
        {!torn && (
          <div
            className="rip-shimmer"
            style={{
              position: 'absolute',
              left: 8,
              top: 10,
              width: 194,
              height: 272,
              borderRadius: 10,
              background:
                'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.18) 46%, rgba(255,255,255,0.05) 54%, transparent 70%)',
              backgroundSize: '250% 250%',
              zIndex: 4,
            }}
          />
        )}
        {/* Tear seam glow: rips open left → right with the strip. */}
        {torn && !spread && (
          <div
            className="rip-seam"
            style={{
              position: 'absolute',
              left: 5,
              top: 38,
              width: 200,
              height: 3,
              transformOrigin: 'left center',
              background: `linear-gradient(90deg, transparent, rgba(255,235,190,0.95), transparent)`,
              filter: 'blur(1px)',
              zIndex: 4,
            }}
          />
        )}
      </div>

      {/* The card spread: every card flies from the pack mouth to its grid
          slot (staggered), lands face-down, then the wave flip runs. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: gridTop,
          width: gridW,
          marginLeft: -gridW / 2,
          height: gridH,
          zIndex: 1,
        }}
      >
        {outcome.packs.map((p, i) => {
          const range = cardRange(p)
          const rs = RANGE_STYLE[range]
          const col = i % cols
          const row = Math.floor(i / cols)
          const x = col * (cardW + gap)
          const y = row * (cardH + gap)
          // Fly-from-pack offset (pack mouth sits ~38% height, centered).
          const fromX = gridW / 2 - x - cardW / 2
          const fromY = 760 * 0.38 - gridTop - y - cardH / 2
          const seed = (i * 37) % 17
          const tilt = ((seed % 9) - 4) * 1.6
          const flipped = done || stage === 'flip'
          const spreadDelay = done ? 0 : i * RIP_SPREAD_STAGGER_MS
          const flipDelay = done ? 0 : i * RIP_FLIP_STAGGER_MS
          return (
            <div
              key={p.packIndex}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: cardW,
                height: cardH,
                perspective: 700,
                transform: spread
                  ? `translate(0px, 0px) rotate(${tilt * 0.4}deg) scale(1)`
                  : `translate(${fromX}px, ${fromY}px) rotate(${tilt * 4}deg) scale(0.24)`,
                opacity: spread ? 1 : 0,
                transition: `transform ${RIP_SPREAD_MS}ms cubic-bezier(0.22, 1.15, 0.3, 1) ${spreadDelay}ms, opacity 260ms ease ${spreadDelay}ms`,
              }}
            >
              {/* Gold ray burst behind the card, fires on its flip beat. */}
              {range === 'gold' && (
                <div
                  aria-hidden
                  className="rip-rays"
                  style={{
                    position: 'absolute',
                    width: cardW * 3.4,
                    height: cardW * 3.4,
                    left: '50%',
                    top: '50%',
                    marginLeft: (-cardW * 3.4) / 2,
                    marginTop: (-cardW * 3.4) / 2,
                    background: `repeating-conic-gradient(rgba(${rs.ray},${flipped ? rs.rayAlpha : 0}) 0deg 5deg, rgba(0,0,0,0) 5deg 16deg)`,
                    maskImage: 'radial-gradient(circle, rgba(0,0,0,0.9) 10%, rgba(0,0,0,0) 60%)',
                    WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,0.9) 10%, rgba(0,0,0,0) 60%)',
                    transition: `background 400ms ease ${flipDelay}ms`,
                  }}
                />
              )}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  transformStyle: 'preserve-3d',
                  transform: flipped ? 'rotateY(0deg)' : 'rotateY(180deg)',
                  transition: `transform ${RIP_FLIP_MS}ms cubic-bezier(0.3, 0.9, 0.32, 1.15) ${flipDelay}ms`,
                }}
              >
                <img
                  src={`/skin/cards/${outcome.tier}-${range}.png`}
                  alt=""
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: 10,
                    backfaceVisibility: 'hidden',
                    border: `2px solid ${range === 'gold' ? T.gold : 'rgba(13,15,21,0.9)'}`,
                    boxShadow:
                      range === 'gold' && flipped
                        ? `0 0 22px rgba(${rs.ray},0.55)`
                        : '0 8px 18px rgba(0,0,0,0.45)',
                    transition: `box-shadow 400ms ease ${flipDelay}ms`,
                  }}
                />
                {/* Empty cards: muted tint + hollow hex so "no win" reads as a
                    DESIGNED blank, not a failed image load. */}
                {range === 'empty' && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 10,
                      backfaceVisibility: 'hidden',
                      background: 'rgba(12, 15, 20, 0.32)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg
                      viewBox="0 0 100 100"
                      style={{ width: '46%', height: '46%', opacity: 0.5 }}
                    >
                      <polygon
                        points="50,8 86,29 86,71 50,92 14,71 14,29"
                        fill="none"
                        stroke="#aab3bf"
                        strokeWidth="5"
                      />
                    </svg>
                  </div>
                )}
                <img
                  src="/skin/cards/back.png"
                  alt=""
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: 10,
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    border: '2px solid rgba(13,15,21,0.9)',
                  }}
                />
              </div>
              {/* Multiplier chip on the card, lands right after its flip. */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: Math.round(cardH * 0.06),
                  textAlign: 'center',
                  fontFamily: T.mono,
                  fontWeight: 800,
                  fontSize: Math.max(15, Math.round(cardW * 0.22)),
                  color: rs.color,
                  textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                  opacity: flipped ? 1 : 0,
                  transform: flipped ? 'scale(1)' : 'scale(1.6)',
                  transition: `opacity 240ms ease ${flipDelay + RIP_FLIP_MS * 0.6}ms, transform 240ms cubic-bezier(0.2, 1.4, 0.3, 1) ${flipDelay + RIP_FLIP_MS * 0.6}ms`,
                }}
              >
                {p.multiplierBps === 0n ? 'EMPTY' : formatMultiplier(p.multiplierBps)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Total ribbon once everything is face-up. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 72,
          textAlign: 'center',
          fontFamily: T.mono,
          fontWeight: 800,
          fontSize: 30,
          // Gold ONLY on a net win (RG-C2).
          color: outcome.totalPayoutLamports >= outcome.totalWagerLamports ? T.gold : T.text,
          textShadow: '0 2px 10px rgba(0,0,0,0.85)',
          opacity: done ? 1 : 0,
          transform: done ? 'translateY(0)' : 'translateY(14px)',
          transition: 'opacity 380ms ease, transform 380ms cubic-bezier(0.2, 1.1, 0.3, 1)',
        }}
      >
        {formatUsdc(outcome.totalPayoutLamports)}
        <span style={{ fontSize: 13, color: T.dim, marginLeft: 10 }}>
          {formatMultiplier(outcome.aggregateBps)} · NET{' '}
          {outcome.totalPayoutLamports >= outcome.totalWagerLamports
            ? `+${formatUsdc(outcome.totalPayoutLamports - outcome.totalWagerLamports)}`
            : `-${formatUsdc(outcome.totalWagerLamports - outcome.totalPayoutLamports)}`}
        </span>
        <div
          style={{
            fontFamily: T.mono,
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: '0.24em',
            color: T.cyan,
            marginTop: 8,
          }}
        >
          TAP TO CONTINUE
        </div>
      </div>
    </div>
  )
}

// ── Settled receipt (Glass Box) ─────────────────────────────────────────────

function SettledPanel({
  outcome,
  onCollect,
}: {
  outcome: VendingOutcome
  onCollect: () => void
}): React.ReactElement {
  // House Glass Box pattern: auto-verify on mount — re-hash the revealed seed
  // against the commit and re-derive every pack's roll through the SAME
  // public derivation; the receipt then carries a live ✓, not just a claim.
  const [verified, setVerified] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const bytes = outcome.serverSeedHex.match(/.{2}/g)
        if (!bytes) throw new Error('bad seed hex')
        const seed = new Uint8Array(bytes.map((b) => parseInt(b, 16)))
        const hashBuf = new Uint8Array(await crypto.subtle.digest('SHA-256', seed))
        const hashHex = Array.from(hashBuf)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        if (hashHex !== outcome.serverSeedHashHex) {
          if (alive) setVerified(false)
          return
        }
        for (const p of outcome.packs) {
          const roll = await derivePackRoll(seed, p.packIndex, outcome.tier)
          if (roll !== p.roll) {
            if (alive) setVerified(false)
            return
          }
        }
        if (alive) setVerified(true)
      } catch {
        if (alive) setVerified(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [outcome])
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Soft vignette instead of a flat black slab: the machine and room
        // stay visible, dimmed, behind the receipt.
        background:
          'radial-gradient(72% 62% at 50% 46%, rgba(4,6,9,0.72) 0%, rgba(4,6,9,0.42) 62%, rgba(4,6,9,0.08) 100%)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        borderRadius: 18,
        zIndex: 5,
      }}
    >
      <Card
        style={{
          width: 'min(430px, 92%)',
          maxHeight: '92%',
          overflowY: 'auto',
          position: 'relative',
          // Bolted-plaque treatment (HUD-as-signage, matches the machine's
          // info panel): inset bevel + corner rivets — identical for every
          // outcome (RG-C5: structure, not celebration).
          border: '1px solid rgba(13,15,21,0.9)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.09), inset 0 -1px 0 rgba(0,0,0,0.45), 0 18px 40px rgba(0,0,0,0.5)',
        }}
      >
        {[
          { top: 7, left: 8 },
          { top: 7, right: 8 },
          { bottom: 7, left: 8 },
          { bottom: 7, right: 8 },
        ].map((pos, i) => (
          <span
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              width: 4,
              height: 4,
              borderRadius: 2,
              background: 'rgba(122,134,152,0.5)',
              boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.6)',
              ...pos,
            }}
          />
        ))}
        <div
          style={{
            fontFamily: T.mono,
            fontSize: 12,
            letterSpacing: '0.18em',
            color: T.dim,
            textAlign: 'center',
          }}
        >
          TRAY SERVED
        </div>
        <div
          style={{
            fontFamily: T.mono,
            fontWeight: 800,
            fontSize: 40,
            textAlign: 'center',
            // Gold ONLY on a net win (RG-C2: a partial-loss return must not
            // wear win styling).
            color: outcome.totalPayoutLamports >= outcome.totalWagerLamports ? T.gold : T.text,
            margin: '6px 0 2px',
          }}
        >
          {formatUsdc(outcome.totalPayoutLamports)}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 13, color: T.dim, textAlign: 'center' }}>
          {outcome.tierLabel} · {formatMultiplier(outcome.aggregateBps)} on{' '}
          {formatUsdc(outcome.totalWagerLamports)} staked ·{' '}
          {outcome.goldCount > 0 ? `${outcome.goldCount} GOLD` : 'no gold'}
        </div>
        {/* Symmetric net delta — identical styling win or loss, only the
            sign and number differ. */}
        <div
          style={{
            fontFamily: T.mono,
            fontSize: 13,
            fontWeight: 700,
            color: T.text,
            textAlign: 'center',
            marginTop: 4,
          }}
        >
          NET{' '}
          {outcome.totalPayoutLamports >= outcome.totalWagerLamports
            ? `+${formatUsdc(outcome.totalPayoutLamports - outcome.totalWagerLamports)}`
            : `-${formatUsdc(outcome.totalWagerLamports - outcome.totalPayoutLamports)}`}
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'center',
            margin: '14px 0',
          }}
        >
          {outcome.packs.map((p) => (
            <PackChip key={p.packIndex} pack={p} />
          ))}
        </div>
        <button
          type="button"
          onClick={onCollect}
          style={{
            ...btnBase,
            width: '100%',
            fontSize: 15,
            padding: '13px 0',
            borderColor: T.cyan,
            background: T.cyanDim,
            color: T.cyan,
            letterSpacing: '0.1em',
          }}
        >
          COLLECT
        </button>
        <details style={{ marginTop: 12 }}>
          <summary
            style={{
              fontFamily: T.mono,
              fontSize: 11,
              letterSpacing: '0.12em',
              color: verified === true ? T.cyan : verified === false ? '#e5484d' : T.faint,
              cursor: 'pointer',
            }}
          >
            {verified === true
              ? '✓ ROUND VERIFIED · VIEW RECEIPT'
              : verified === false
                ? '! VERIFICATION MISMATCH · VIEW RECEIPT'
                : 'VERIFYING ROUND… · VIEW RECEIPT'}
          </summary>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.dim, lineHeight: 1.7, marginTop: 8, wordBreak: 'break-all' }}>
            <div>round: {outcome.roundIdHex}</div>
            <div>seed hash (shown before the vend): {outcome.serverSeedHashHex}</div>
            <div>seed (revealed now): {outcome.serverSeedHex}</div>
            <div style={{ marginTop: 6 }}>
              each pack i draws roll = SHA-256(seed, "VENDPACK:{outcome.tier}", i, attempt) mod
              100000 and reads the {outcome.tier.toUpperCase()} machine's fixed public prize table:
            </div>
            {outcome.packs.map((p) => (
              <div key={p.packIndex}>
                pack {p.packIndex + 1}: roll {p.roll.toString()} → {p.prizeId} ({formatMultiplier(p.multiplierBps)}) →{' '}
                {formatUsdc(p.payoutLamports)}
              </div>
            ))}
          </div>
        </details>
      </Card>
    </div>
  )
}

// ── The Experience ──────────────────────────────────────────────────────────

export function VendingExperience(): React.ReactElement {
  const c = useVendingController()
  const reduced = useReducedMotion()
  const [showHelp, setShowHelp] = useState(false)
  // Pack-rip cutscene: player-toggleable; reduced-motion always skips it.
  const [cutsceneOn, setCutsceneOn] = useState(true)
  const [ripDone, setRipDone] = useState(false)
  const { state } = c
  // The ARMED machine on the turntable.
  const [machine, setMachine] = useState<VendingTierId>(state.selectedTier)
  const phaseKind = state.phase.kind
  const tier = machine
  const stageRef = useRef<HTMLDivElement | null>(null)
  // ── OPTIONAL slot selection (pure presentation) ──────────────────────────
  // Which glass slots the player punched, in selection order (FIFO). Max =
  // current packCount; the (n+1)th pick drops the OLDEST. Selecting never
  // touches the rolls — only which physical slot each pack visibly vends from.
  const [selectedSlots, setSelectedSlots] = useState<number[]>([])
  // The slot→pack map FROZEN at VEND time so a settle-time clear can't move the
  // in-flight drops (the canvas bakes each drop's slot on dispense anyway).
  const [committedSlotOrder, setCommittedSlotOrder] = useState<readonly number[] | null>(null)
  const packCount = state.packCount
  const toggleSlot = (slot: number): void => {
    if (phaseKind !== 'ready') return // inert mid-vend / during overlays
    setSelectedSlots((prev) => {
      if (prev.includes(slot)) return prev.filter((s) => s !== slot)
      const next = [...prev, slot]
      while (next.length > packCount) next.shift() // FIFO: drop the oldest pick
      return next
    })
  }
  // packCount lowered below the pick count → trim the NEWEST picks to fit.
  useEffect(() => {
    setSelectedSlots((prev) => (prev.length > packCount ? prev.slice(0, packCount) : prev))
  }, [packCount])
  // COMPACT LANDSCAPE (the 4c fold: stage track ~210px): the percent-sized
  // hit-cells shrink to ~27x37px there — physically no room for 5x 44px
  // columns inside the compacted machine. Slot-picking is an OPTIONAL
  // enhancement, so on compact landscape it is NOT OFFERED (overlay + hint
  // hidden, selection cleared); portrait + desktop keep the full feature.
  // (mobile-touch QA CRITICAL, 2026-07-22)
  const [compactLandscape, setCompactLandscape] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 940px) and (orientation: landscape)')
    const apply = (): void => setCompactLandscape(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  // SINGLE-SCREEN PORTRAIT (SPEC-PORTRAIT-0831): phones held upright get the
  // four-band layout — top strip / stage / floating controls / money strip —
  // inside one 100dvh screen with NO page scroll. Same query as the CSS block
  // below, so DOM and layout can never disagree. Read EAGERLY (lazy initial
  // state, not a post-mount effect) so the very first paint is already the
  // portrait tree — a first-paint measurement must never catch the desktop
  // arrangement. Slot-picking is offered here whenever the stage still renders
  // the canvas >=337px wide (so every hit-cell clears 44px) — which is a
  // MEASURED condition, not a property of the orientation: see the
  // ResizeObserver below.
  const [isPortrait, setIsPortrait] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 940px) and (orientation: portrait)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 940px) and (orientation: portrait)')
    const apply = (): void => setIsPortrait(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  // ── Live geometry (ResizeObserver, not a mount-time snapshot) ─────────────
  // Two measured numbers drive two rules that a media query CANNOT express,
  // because both depend on the RENDERED height budget (dvh minus browser
  // chrome), not on the declared viewport width:
  //   stageCanvasW — the real CSS width of the machine canvas. On a SHORT
  //     portrait phone (360x740, 412x738: the address bar eats ~80-180px) the
  //     flex cap shrinks the cabinet to ~274px, and the percent-positioned
  //     hit-cells shrink with it to ~35.7px — under the 44px touch floor. So
  //     the compact-landscape rule mirrors here: below the floor slot-pick is
  //     NOT OFFERED at all (overlay off, hint+CLEAR hidden, picks cleared).
  //   moneyStripH — the real height of the fixed bottom money strip, which is
  //     what the root must reserve as padding. A hard-coded reserve
  //     under-counted it on small phones and the strip painted over the
  //     stepper row (blind mobile QA, 2026-08-31).
  const turntableRef = useRef<HTMLDivElement | null>(null)
  const moneyStripRef = useRef<HTMLDivElement | null>(null)
  const [stageCanvasW, setStageCanvasW] = useState(0)
  const [moneyStripH, setMoneyStripH] = useState(0)
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        // border-box via the live rect: contentRect would drop the strip's
        // own padding (including the safe-area inset) from the reserve.
        const h = e.target.getBoundingClientRect()
        if (e.target === turntableRef.current) setStageCanvasW(Math.round(h.width))
        else setMoneyStripH(Math.round(h.height))
      }
    })
    if (turntableRef.current) ro.observe(turntableRef.current)
    if (moneyStripRef.current) ro.observe(moneyStripRef.current)
    return () => ro.disconnect()
  }, [isPortrait])
  const slotPickOffered = !compactLandscape && stageCanvasW >= SLOT_PICK_MIN_CANVAS_PX
  useEffect(() => {
    if (!slotPickOffered) setSelectedSlots([])
  }, [slotPickOffered])
  // Selection clears the moment the vend STARTS (Tim 2026-07-22: no lingering
  // highlights while/after the machine runs — the coil already shows where the
  // packs come from; a new round always begins clean, so hand-picking never
  // mixes with a previous round's marks). settled-clear kept as a safety net;
  // the frozen slotOrder map resets back at ready.
  useEffect(() => {
    if (phaseKind === 'vending' || phaseKind === 'settled') setSelectedSlots([])
    if (phaseKind === 'ready') setCommittedSlotOrder(null)
  }, [phaseKind])
  useEffect(() => {
    if (phaseKind === 'vending') setRipDone(false)
    // One overlay at a time: the vend/settled ceremony owns the screen, so the
    // help modal must never stack over the settled/COLLECT overlay (flow-QA).
    if (phaseKind === 'vending' || phaseKind === 'settled') setShowHelp(false)
    // (The old portrait scrollIntoView hack is GONE: portrait is now a single
    // non-scrolling screen — SPEC-PORTRAIT-0831 — so the stage is always in
    // view and a scroll call would only fight the layout.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKind])

  // ── Turntable: all THREE machines stand ON the plateau; switching rotates
  // the whole plateau so the next machine orbits to the front while the
  // others stay visible, dimmed, in the background. `cum` is the cumulative
  // rotation step (never wrapped) so consecutive steps keep spinning the same
  // way; the active machine is cum mod 3. ──
  const N_MACHINES = MACHINE_ORDER.length
  const [cum, setCum] = useState(0)
  const activeIdx = ((cum % N_MACHINES) + N_MACHINES) % N_MACHINES
  const armMachine = (target: VendingTierId): void => {
    setMachine(target)
    c.setTier(target)
    setSelectedSlots([]) // picks are per-machine; a rotate clears them
  }
  const switchTier = (target: VendingTierId): void => {
    if (target === machine || phaseKind === 'vending') return
    const targetIdx = MACHINE_ORDER.indexOf(target)
    // Shortest rotation around the ring.
    let delta = targetIdx - activeIdx
    if (delta > N_MACHINES / 2) delta -= N_MACHINES
    if (delta < -N_MACHINES / 2) delta += N_MACHINES
    setCum(cum + delta)
    armMachine(target)
  }
  const stepTier = (dir: 1 | -1): void => {
    if (phaseKind === 'vending') return
    const next = MACHINE_ORDER[(((cum + dir) % N_MACHINES) + N_MACHINES) % N_MACHINES]!
    setCum(cum + dir)
    armMachine(next)
  }
  // Arrow keys rotate the turntable (Tim: pijltje links/rechts); Escape
  // closes the info overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setShowHelp(false)
      } else if (e.key === 'ArrowLeft') stepTier(-1)
      else if (e.key === 'ArrowRight') stepTier(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cum, phaseKind])

  const railPacks = useMemo<readonly PackResult[]>(() => {
    if (state.phase.kind === 'settled') return state.phase.outcome.packs
    return state.dispensed
  }, [state])

  const committedCount =
    state.phase.kind === 'settled' ? state.phase.outcome.packCount : state.packCount

  // ── Shared control atoms ──────────────────────────────────────────────────
  // Every interactive control is DECLARED ONCE here and only ARRANGED
  // differently by the two layouts (desktop/landscape card column vs the
  // portrait single-screen bands). Same handlers, same aria labels, same
  // aria-pressed state, same keyboard behaviour in both — the trees cannot
  // drift apart, and nothing is "reachable on desktop only".
  const helpButton = (
    <button
      type="button"
      onClick={() => setShowHelp((v) => !v)}
      disabled={phaseKind === 'settled'}
      aria-label="How it works"
      aria-expanded={showHelp}
      style={{
        ...btnBase,
        borderRadius: 22,
        fontSize: 16,
        color: T.dim,
        opacity: phaseKind === 'settled' ? 0.35 : 1,
      }}
    >
      ?
    </button>
  )
  const machineChips = MACHINE_ORDER.map((t) => (
    <SmallBtn
      key={t}
      onClick={() => switchTier(t)}
      active={machine === t}
      disabled={phaseKind === 'vending'}
      grow
    >
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: 4,
          background: TIER_ROOMS[t].led,
          boxShadow: `0 0 6px ${TIER_ROOMS[t].led}`,
          marginRight: 6,
          verticalAlign: 'middle',
        }}
      />
      {t.toUpperCase()}
    </SmallBtn>
  ))
  const cutsceneToggle = (
    <SmallBtn
      onClick={() => setCutsceneOn((v) => !v)}
      active={cutsceneOn}
      ariaLabel="Toggle pack-rip cutscene"
      grow
    >
      CUTSCENE · {cutsceneOn ? 'ON' : 'OFF'}
    </SmallBtn>
  )
  const vendCta = (
    <button
      type="button"
      className="vend-cta"
      onClick={() => {
        if (phaseKind === 'vending') c.skipReveal()
        else {
          // Freeze the presentation slot map for this round BEFORE the
          // commit (rolls unaffected — this only routes the drops).
          setCommittedSlotOrder(computeSlotOrder(selectedSlots, state.packCount))
          void c.vendPacks()
        }
      }}
      disabled={phaseKind !== 'vending' && !c.canVend}
      style={(() => {
        const live = phaseKind === 'vending' || c.canVend
        const accent = T.cyan
        const wash = 'linear-gradient(180deg, rgba(0,240,255,0.18), rgba(0,240,255,0.07))'
        const halo = '0 0 18px rgba(0,240,255,0.22), inset 0 1px 0 rgba(255,255,255,0.14)'
        return {
          ...btnBase,
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: '0.1em',
          padding: '16px 0',
          borderColor: live ? accent : T.ink,
          background: live ? wash : T.keyFace,
          boxShadow: live ? halo : btnBase.boxShadow,
          color: live ? accent : T.faint,
        } as React.CSSProperties
      })()}
    >
      {phaseKind === 'vending'
        ? 'SKIP · SHOW ALL PACKS'
        : `VEND ${state.packCount} PACK${state.packCount > 1 ? 'S' : ''} · ${formatUsdc(c.totalCostLamports)}`}
    </button>
  )
  // Balance disclosure: shown ONLY when an exceeds-balance total is the reason
  // the VEND CTA is disabled. Calm, factual, RG-neutral — no urgency, no color
  // escalation, no "add funds" nudge. In portrait it renders inside a
  // FIXED-HEIGHT slot so appearing text can never reflow the screen.
  const overBalance =
    phaseKind === 'ready' &&
    c.totalCostLamports > 0n &&
    c.totalCostLamports > state.balanceLamports
  const disclosureCopy = 'TOTAL EXCEEDS BALANCE · LOWER PACKS OR PRICE'
  const priceStepper = (
    <div className="vend-stepper-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <SmallBtn
        onClick={() => {
          const cur = state.wagerPerPackLamports
          const lower = [...PRICE_LADDER].reverse().find((p) => p < cur)
          if (lower) c.setWager(lower)
        }}
        disabled={phaseKind === 'vending'}
        ariaLabel="Lower pack price"
      >
        −
      </SmallBtn>
      <select
        aria-label="Pack price"
        value={state.wagerPerPackLamports.toString()}
        onChange={(e) => c.setWager(BigInt(e.target.value))}
        disabled={phaseKind === 'vending'}
        style={selectStyle}
      >
        {!PRICE_LADDER.includes(state.wagerPerPackLamports) && (
          <option value={state.wagerPerPackLamports.toString()} style={selectOptionStyle}>
            {formatUsdc(state.wagerPerPackLamports)}
          </option>
        )}
        {PRICE_LADDER.map((p) => (
          <option key={p.toString()} value={p.toString()} style={selectOptionStyle}>
            {formatUsdc(p)}
          </option>
        ))}
      </select>
      <SmallBtn
        onClick={() => {
          const cur = state.wagerPerPackLamports
          const higher = PRICE_LADDER.find((p) => p > cur)
          if (higher) c.setWager(higher)
        }}
        disabled={phaseKind === 'vending'}
        ariaLabel="Raise pack price"
      >
        +
      </SmallBtn>
    </div>
  )
  const packsStepper = (
    <div className="vend-stepper-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <SmallBtn
        onClick={() => c.setPackCount(state.packCount - 1)}
        disabled={phaseKind === 'vending' || state.packCount <= MIN_PACKS}
        ariaLabel="Fewer packs"
      >
        −
      </SmallBtn>
      <select
        aria-label="Packs this vend"
        value={state.packCount}
        onChange={(e) => c.setPackCount(Number(e.target.value))}
        disabled={phaseKind === 'vending'}
        style={selectStyle}
      >
        {Array.from({ length: MAX_PACKS }, (_, i) => i + 1).map((n) => (
          // Portrait renders the count alone: the control is ~86px wide there
          // and both the unit and the ceiling already sit in its label
          // ("PACKS · MAX 20"), so the long form would be clipped mid-word.
          // Same values, same order, same handler.
          <option key={n} value={n} style={selectOptionStyle}>
            {isPortrait
              ? `${n}`
              : n === MAX_PACKS
                ? `${n} PACKS · MAX`
                : `${n} PACK${n > 1 ? 'S' : ''}`}
          </option>
        ))}
      </select>
      <SmallBtn
        onClick={() => c.setPackCount(state.packCount + 1)}
        disabled={phaseKind === 'vending' || state.packCount >= MAX_PACKS}
        ariaLabel="More packs"
      >
        +
      </SmallBtn>
    </div>
  )

  return (
    <div
      className="vend-root"
      style={{
        ['--tier-led' as string]: TIER_ROOMS[tier].led,
        ['--tier-panel' as string]: `url("/skin/panel-${tier}.png")`,
        ['--tier-plaque-top' as string]: TIER_UI[tier].plaqueTop,
        ['--tier-plaque-bottom' as string]: TIER_UI[tier].plaqueBottom,
        ['--tier-key-top' as string]: TIER_UI[tier].keyTop,
        ['--tier-key-bottom' as string]: TIER_UI[tier].keyBottom,
        ['--tier-frame' as string]: TIER_UI[tier].frame,
        ['--tier-label' as string]: TIER_UI[tier].label,
        // MEASURED height of the fixed money strip (portrait band 4). The root
        // reserves exactly this much as padding-bottom and the stage budget
        // subtracts exactly this much, so the strip can never paint over the
        // stepper row — whatever the strip's real line count and safe-area
        // inset turn out to be. Falls back to the CSS default until measured.
        ...(moneyStripH > 0 ? { ['--vend-strip' as string]: `${moneyStripH}px` } : null),
        minHeight: '100dvh',
        position: 'relative',
        overflow: 'hidden',
        // Room stack (top→bottom): outer-edge ink vignette (implied doodle
        // wall off-screen), neon spill halo at header height, floor-contact
        // pool under the machine (grounds it), base ink.
        background: [
          'radial-gradient(120% 95% at 50% 45%, rgba(0,0,0,0) 58%, rgba(4,5,8,0.55) 100%)',
          `radial-gradient(460px 260px at 50% 8%, ${TIER_ROOMS[tier].spillTop} 0%, rgba(0,0,0,0) 70%)`,
          `radial-gradient(760px 240px at 50% 86%, ${TIER_ROOMS[tier].spillBottom} 0%, rgba(0,0,0,0) 62%)`,
          `radial-gradient(1100px 760px at 50% 46%, #0d1119 0%, ${T.room} 58%, #050609 100%)`,
        ].join(', '),
        color: T.text,
        fontFamily: T.sans,
        display: 'flex',
        justifyContent: 'center',
        padding: '28px 16px 40px',
      }}
    >
      {/* Per-machine rooms (full-bleed, behind everything): all three mounted,
          crossfading with the turntable rotation. */}
      {MACHINE_ORDER.map((t) => (
        <div
          key={t}
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${TIER_ROOMS[t].src})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center bottom',
            opacity: t === tier ? 1 : 0,
            transition: reduced ? 'none' : 'opacity 700ms ease',
          }}
        />
      ))}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `rgba(4,6,9,${TIER_ROOMS[tier].scrim})`,
          transition: reduced ? 'none' : 'background 700ms ease',
        }}
      />
      {/* Difficulty glow — the instant marker: green EASY, silver-blue MEDIUM,
          ember-red HARD. Static ambient wash (never pulsing). */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(56% 48% at 38% 58%, ${TIER_ROOMS[tier].glow} 0%, rgba(0,0,0,0) 70%)`,
          transition: reduced ? 'none' : 'background 700ms ease',
        }}
      />
      <style>{`
        @keyframes vendChipPop {
          0% { opacity: 0; transform: translateY(10px) scale(0.85); }
          70% { opacity: 1; transform: translateY(-2px) scale(1.04); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .vend-chip { opacity: 0; animation: vendChipPop 320ms cubic-bezier(0.22, 1.2, 0.36, 1) forwards; }
        @media (prefers-reduced-motion: reduce) {
          .vend-chip { animation: none; opacity: 1; }
        }
        .vend-shell { display: grid; grid-template-columns: minmax(0, 560px) 320px; gap: 24px; align-items: start; position: relative; }
        /* ── PORTRAIT phones: ONE SCREEN, no page scroll (SPEC-PORTRAIT-0831).
           Four bands top→bottom: slim top strip (identity · BALANCE · display
           toggle · help) / the STAGE as the hero / a floating control zone with
           no card chrome / a slim money strip pinned to the bottom edge.
           The old stack scrolled 1.54-1.67 screens (docH 1407 vs 915/844).

           Method: COMPACT THE REAL LAYOUT, never transform:scale it (learning
           13) — every control keeps its true >=44px runtime box. The stage
           absorbs whatever height is left over and the machine derives its
           WIDTH from that height through its 520/760 aspect ratio, so the
           machine can never push a control off the screen. The same expression
           caps .vend-stage so the turntable arrows keep hugging the cabinet.
           --vend-chrome is the measured height of the three non-stage bands
           plus the rail and paddings — half of it a constant, half the money
           strip's live measured height (verified at 412x915, 390x844 and the
           STRESSED short viewports 360x740 / 412x738, where browser chrome
           eats the dvh); the flex cap is the real guard, this only keeps the
           arrows tight.

           Width-only media would also catch landscape phones and hand them the
           stack — where the first paint is machine-glass only (mobile-QA
           CRITICAL) — hence the orientation clause. */
        @media (max-width: 940px) and (orientation: portrait) {
          .vend-root {
            /* The non-stage bands: 300px of top strip + rail + control zone +
               paddings + gaps, PLUS the money strip's own MEASURED height
               (--vend-strip, set from a ResizeObserver on the strip; the 40px
               fallback covers the frame before the first measurement). The
               strip used to be counted as a hard-coded 36px reserve, which
               under-counted it on a 360px-wide phone — its compliance line
               wrapped to two lines there and the band painted over the stepper
               row (blind mobile QA, 2026-08-31). Counting the real number in
               BOTH places (reserve and budget) means the stage — the only
               elastic band — shrinks instead. */
            --vend-chrome: calc(300px + var(--vend-strip, 40px));
            /* border-box or the paddings ADD to 100dvh and the page scrolls by
               exactly padding-top + padding-bottom. */
            box-sizing: border-box;
            height: 100dvh !important;
            min-height: 100dvh !important;
            overflow: hidden !important;
            /* +6px: a visible breath between the last control and the strip's
               first line, so they never read as one block. */
            padding: 6px 6px calc(var(--vend-strip, 40px) + 6px) !important;
          }
          .vend-shell {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            max-width: none !important;
            height: 100% !important;
            min-height: 0;
            gap: 6px;
            /* The desktop grid sets align-items:start; in this column flex that
               would shrink every band to its own content width. */
            align-items: stretch !important;
          }
          /* Band 1 — top strip. */
          .vend-topstrip { flex: 0 0 auto; }
          /* Band 2 — the stage (hero). */
          .vend-stage {
            flex: 0 1 auto;
            min-height: 0;
            min-width: 0;
            width: 100%;
            /* The cabinet is as big as the leftover height allows, and never
               wider than the column. Capping the STAGE (not just the machine)
               keeps the absolutely-placed turntable arrows hugging the
               cabinet edges instead of drifting to the screen edges. */
            max-width: min(100%, calc((100dvh - var(--vend-chrome)) * 0.6842));
            align-self: center;
            display: flex;
            flex-direction: column;
          }
          .vend-stage .vend-turntable {
            flex: 0 0 auto;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
          }
          .vend-rail {
            flex: 0 0 auto;
            min-height: 40px !important;
            margin-top: 5px !important;
            padding: 4px 8px !important;
            gap: 6px !important;
          }
          /* Band 3 — floating control zone: no cards, no plank. margin-top
             auto anchors it just above the money strip, so any slack left by
             a conservative --vend-chrome opens as breathing room under the
             cabinet instead of pushing a control off the screen. */
          .vend-controls-portrait { flex: 0 0 auto; gap: 5px !important; margin-top: auto; min-width: 0; }
          .vend-portrait-row { display: flex; gap: 6px; align-items: stretch; min-width: 0; }
          /* min-width:0 all the way down: a native select's min-content width
             is its LONGEST option ("20 PACKS · MAX"), which otherwise pushes
             the whole column past the viewport width. */
          .vend-portrait-row .vend-stepper-row { min-width: 0; }
          .vend-portrait-row .vend-stepper-row > select {
            min-width: 0 !important;
            width: 0 !important; /* intrinsic contribution 0; flex-grow fills it */
            font-size: 13px !important;
            /* Asymmetric padding keeps the native chevron off the value at
               these widths (it clipped "1.00" to "1.0(" at 4px). */
            padding: 0 20px 0 6px !important;
          }
          /* Both clusters share the leftover evenly: with the portrait option
             labels compacted, "10.00" is the widest value either shows. */
          .vend-portrait-row > .vend-stepper-cluster { flex: 1 1 0; }
          .vend-cta { padding-top: 15px !important; padding-bottom: 15px !important; }
        }
        /* Portrait-only band components. These classes are rendered ONLY inside
           the portrait tree, so they need no media guard and no !important. */
        .vend-topstrip {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 0 2px;
          position: relative;
          z-index: 3;
        }
        .vend-topstrip-mark {
          font-weight: 800;
          font-size: 15px;
          letter-spacing: 0.14em;
          color: #e8ecf1;
          flex: 0 1 auto;
          min-width: 0;
        }
        .vend-topstrip-bal {
          margin-left: auto;
          display: flex;
          align-items: baseline;
          gap: 6px;
          font-family: "Geist Mono", ui-monospace, monospace;
          font-size: 12px;
          white-space: nowrap;
        }
        .vend-topstrip-cut { display: flex; flex: 0 0 auto; }
        .vend-topstrip-cut > button { font-size: 11px !important; padding: 0 9px !important; }
        .vend-topstrip-ballabel { letter-spacing: 0.1em; color: #b7c1d0; font-size: 10px; }
        .vend-topstrip-balval { color: #e8ecf1; font-weight: 700; font-size: 13px; }
        /* SMALL PHONES (<=380px): the four-item strip measured 381.8px of
           content at 360px wide, which pushed the help "?" right off the
           viewport — its centre returned null from elementFromPoint, i.e. an
           untappable control (blind mobile QA, 2026-08-31). Nothing is dropped
           and nothing shrinks below the touch floor: the two TYPE items give
           back their tracking and the CUTSCENE chip compresses its label, so
           every target keeps its >=44px box and lands inside the viewport.
           390px and 412px are above this breakpoint and render unchanged.
           Placed AFTER the base rules: a media query adds no specificity, so
           an !important base declaration later in the sheet would win. */
        @media (max-width: 380px) and (orientation: portrait) {
          .vend-topstrip { gap: 4px; }
          .vend-topstrip-mark { font-size: 12.5px; letter-spacing: 0.06em; }
          .vend-topstrip-bal { gap: 4px; }
          .vend-topstrip-ballabel { font-size: 9px; letter-spacing: 0.04em; }
          .vend-topstrip-balval { font-size: 12px; }
          .vend-topstrip-cut > button {
            font-size: 10px !important;
            padding: 0 6px !important;
            letter-spacing: 0 !important;
          }
          /* PRICE/PACKS value truncation at 360w. The select box is 71px here
             (348 row − four 44px steppers − 30px of gaps, halved) and Chrome
             clips a native select's value against a UA inner box NARROWER than
             our computed content box — so measureText(value) < content does
             NOT prove it renders: "10.00" measures 39px inside a 50px content
             box and still lost its last glyph. Both declarations are needed,
             verified by screenshot against the ladder's WIDEST value (10.00),
             not the default: padding alone gave "10.0(", 12px type alone gave
             "10.0(", the pair gives "10.00". The BOX is untouched at 71px, so
             no target moves and no row reflows. Above this breakpoint the box
             is 86-97px and the base 13px / 0 20px 0 6px already fits. */
          .vend-portrait-row .vend-stepper-row > select {
            padding: 0 10px 0 2px !important;
            font-size: 12px !important;
          }
        }
        .vend-disclosure-slot {
          min-height: 14px;
          font-family: "Geist Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.06em;
          color: #9aa3b2;
          text-align: center;
          line-height: 14px;
        }
        .vend-stepper-cluster { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .vend-stepper-cluster > .vend-stepper-label {
          font-family: "Geist Mono", ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: var(--tier-label, rgba(240, 181, 66, 0.78));
          padding-left: 2px;
        }
        .vend-stepper-cluster > .vend-stepper-row { gap: 6px !important; }
        /* Band 4 — money strip: text only, no wells, no borders, sitting ON the
           scene (transparent top edge). Non-interactive, so pointer-events are
           off (learning 19: nothing decorative may ever eat a press). */
        .vend-moneystrip {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 4;
          pointer-events: none;
          padding: 3px 10px calc(3px + env(safe-area-inset-bottom, 0px));
          text-align: center;
          background: linear-gradient(180deg, rgba(4, 6, 9, 0) 0%, rgba(4, 6, 9, 0.72) 48%, rgba(4, 6, 9, 0.92) 100%);
        }
        .vend-money-line {
          font-family: "Geist Mono", ui-monospace, monospace;
          font-size: 12px;
          letter-spacing: 0.06em;
          color: #b7c1d0;
          line-height: 16px;
        }
        .vend-money-line b { color: #e8ecf1; font-weight: 700; }
        .vend-money-line b.vend-money-max { color: #f0b542; }
        /* ONE line, always. The compliance line is 50 monospace characters; at
           11px it needs ~352px and wrapped to two lines on a 360px phone,
           which is what made the strip overflow its reserve. It now scales
           DOWN with the viewport instead of wrapping (11px is still the size
           at 390px and up, so the reference viewports are unchanged), and
           nowrap makes the regression structurally impossible. The ramp gives
           back 1px of type per 20px of missing width — 9.5px at 360, which is
           the size the desktop plaque already uses for this same line — so the
           fit has ~30px of slack instead of landing exactly on the box edge.
           Floored at 9px: even a 320px phone keeps it readable (measured 9px,
           294px of text in a 300px box) rather than shrinking without limit. */
        .vend-money-legal {
          font-family: "Geist Mono", ui-monospace, monospace;
          font-size: clamp(9px, calc(11px - (390px - 100vw) / 20), 11px);
          letter-spacing: 0.04em;
          color: #828c9c;
          line-height: 15px;
          white-space: nowrap;
        }
        /* LANDSCAPE phones (short viewport): keep the TWO-column grid so the
           stage (with the settled/COLLECT overlay) sits left and the control
           panel — BALANCE, machine picker, VEND — sits right, all reachable at
           first paint. The machine is capped so it fits the low height. */
        @media (max-width: 940px) and (orientation: landscape) {
          /* Fixed stage track (a flexible 1fr collapses to min-content in an
             auto-width grid). NO transform-scale: a down-scale shrank every
             touch target below the 44px floor (CUTSCENE / picker chips / COLLECT
             all landed ~36-38px) AND, because a scaled box keeps its unscaled
             layout height, still overflowed the short fold. Instead we COMPACT
             the real layout — trimmed root padding, tighter column gap, slimmer
             card padding — so BALANCE + picker + VEND + CUTSCENE all clear the
             393px fold while every control keeps its true >=44px height. */
          .vend-root { padding: 6px 12px 10px !important; }
          .vend-shell {
            grid-template-columns: minmax(0, 210px) minmax(0, 300px);
            gap: 14px;
            align-items: start;
          }
          .vend-stage .vend-turntable { max-width: 200px; }
          .vend-controls { gap: 6px !important; }
          .vend-card { padding: 8px 13px 7px !important; }
          /* Identity plaque carries the most vertical fat (wordmark + subtitle +
             BALANCE row + compliance line); pull its internal rhythm tight so it
             does not push VEND/CUTSCENE past the fold. */
          .vend-card-id { padding-top: 7px !important; padding-bottom: 6px !important; }
          .vend-card-id > div { margin-top: 5px !important; padding-top: 4px !important; }
          /* In the short fold, drop the two duplicative secondary lines: the
             decorative tagline and the odds caption (difficulty is still read
             from the picker chips + LED + room glow; the odds live in help).
             Keeps BALANCE + picker + VEND + CUTSCENE inside 393px. Portrait
             shows both in full. */
          .vend-id-sub { display: none !important; }
          .vend-machine-caption { display: none !important; }
          /* VEND stays a big primary target but trimmed vertical padding keeps
             the four-item stack inside the fold (16->12px => ~46px tall). */
          .vend-cta { padding-top: 12px !important; padding-bottom: 12px !important; }
        }
        .vend-stage { perspective: 1300px; }
        .rip-pack-in { animation: ripPackIn 550ms cubic-bezier(0.2, 1.2, 0.3, 1) both; }
        @keyframes ripPackIn {
          0% { transform: translateY(190px) scale(0.72); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .rip-rays { animation: ripRays 2600ms linear 2 both; }
        @keyframes ripRays { to { transform: rotate(360deg); } }
        .rip-shimmer { animation: ripShimmer 1400ms ease-in-out infinite; }
        @keyframes ripShimmer {
          0% { background-position: 120% 0; }
          100% { background-position: -60% 0; }
        }
        .rip-lip-tear { animation: ripLip ${RIP_TEAR_MS}ms cubic-bezier(0.3, 0.2, 0.4, 1) both; }
        @keyframes ripLip {
          0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          20%  { transform: translate(-5px, -7px) rotate(-8deg); opacity: 1; }
          34%  { transform: translate(3px, -13px) rotate(5deg); opacity: 1; }
          46%  { transform: translate(26px, -42px) rotate(16deg); opacity: 1; }
          74%  { transform: translate(104px, -138px) rotate(38deg); opacity: 1; }
          100% { transform: translate(178px, -224px) rotate(56deg); opacity: 0; }
        }
        .rip-body-shake { animation: ripBodyShake ${RIP_TEAR_MS}ms ease-in-out both; }
        @keyframes ripBodyShake {
          0% { transform: rotate(0deg); }
          18% { transform: translate(2px, 1px) rotate(1.6deg); }
          32% { transform: translate(-3px, 2px) rotate(-2deg); }
          44% { transform: translate(2px, 0) rotate(1.2deg); }
          58% { transform: translate(-1px, 1px) rotate(-0.6deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        .rip-seam { animation: ripSeam ${RIP_TEAR_MS}ms ease-out both; }
        @keyframes ripSeam {
          0% { transform: scaleX(0); opacity: 0; }
          14% { opacity: 1; }
          48% { transform: scaleX(1); opacity: 1; }
          100% { transform: scaleX(1); opacity: 0.2; }
        }
        .vend-turntable { position: relative; transform-style: preserve-3d; }
        .vend-carousel-item {
          position: absolute; inset: 0;
          transition: transform 700ms cubic-bezier(0.35, 0.9, 0.3, 1), filter 500ms ease, opacity 500ms ease;
          will-change: transform;
        }
        .vend-carousel-item.is-back { filter: brightness(0.45) saturate(0.8); opacity: 0.85; pointer-events: none; }
        @media (prefers-reduced-motion: reduce) {
          .vend-carousel-item { transition: none; }
        }
        /* Explicit keyboard focus ring — a light neutral outline that clears
           ≥3:1 on all three (dark) tier backgrounds, so a future CSS reset can
           never silently strip the fragile browser-default ring (a11y-QA). */
        button:focus-visible, select:focus-visible, [role="button"]:focus-visible, a:focus-visible {
          outline: 2px solid #e8ecf1;
          outline-offset: 2px;
        }
        /* Secondary turntable arrows sit in the neutral register (no cyan);
           keyboard/hover only lifts them subtly, never cyan-active (brand-QA). */
        .vend-arrow:hover:not(:disabled), .vend-arrow:focus-visible {
          color: #cfd5df;
          border-color: rgba(122, 134, 152, 0.5);
        }
      `}</style>

      <div className="vend-shell">
        {/* ── BAND 1 (portrait only): the top strip. Replaces the identity
            plaque card — wordmark, live BALANCE, the display toggle and the
            help affordance in one 44px row, so the stage can own the screen. */}
        {isPortrait && (
          <div className="vend-topstrip">
            <span className="vend-topstrip-mark">AUTOMAT</span>
            <span className="vend-topstrip-bal">
              <span className="vend-topstrip-ballabel">BALANCE</span>
              {/* Value only: the strip has no room for a unit at 390px, and
                  the currency is already stated on the PACK PRICE · USDC
                  control and throughout the receipt. */}
              <span className="vend-topstrip-balval">{formatUsdc(state.balanceLamports)}</span>
            </span>
            {/* The chip is shared with the desktop column where it stretches;
                this fit-content wrapper keeps it chip-sized in the strip. */}
            <span className="vend-topstrip-cut">{cutsceneToggle}</span>
            {helpButton}
          </div>
        )}
        {/* ── Machine column: the TURNTABLE — all three machines mounted on a
            rotating plateau; the back two stay visible, dimmed. ── */}
        <div style={{ position: 'relative', zIndex: 1 }} className="vend-stage" ref={stageRef}>
          {/* Plateau disc (the machines stand on it; far edge reads higher).
              pointer-events none: decorative aria-hidden art must NEVER
              intercept clicks — it painted over the CLEAR chip on desktop
              and made it a dead button (flow-QA CRITICAL, 2026-07-22). */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              pointerEvents: 'none',
              left: '-14%',
              right: '-14%',
              bottom: 26,
              height: 48,
              borderRadius: '50%',
              background:
                'radial-gradient(ellipse at 50% 45%, rgba(64,70,82,0.85) 0%, rgba(26,29,35,0.92) 52%, rgba(10,12,16,0) 76%)',
              boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.08)',
            }}
          />
          <div
            className="vend-turntable"
            ref={turntableRef}
            style={{ width: '100%', maxWidth: 520, margin: '0 auto', aspectRatio: '520 / 760' }}
          >
            {MACHINE_ORDER.map((t, i) => {
              const theta = (i - cum) * MACHINE_STEP_DEG
              const isActive = t === machine
              const activeDispensed = state.dispensed
              return (
                <div
                  key={t}
                  className={`vend-carousel-item${isActive ? '' : ' is-back'}`}
                  style={{
                    transform: `translateZ(${-TURNTABLE_RADIUS}px) rotateY(${theta}deg) translateZ(${TURNTABLE_RADIUS}px) rotateY(${-theta}deg)`,
                  }}
                >
                  <VendingMachineCanvas
                    phaseKind={isActive ? phaseKind : 'ready'}
                    dispensed={isActive ? activeDispensed : EMPTY_PACKS}
                    packCount={isActive ? committedCount : 0}
                    reducedMotion={reduced}
                    tier={t}
                    backdrop={!isActive}
                    // Live in ready (so the canvas' bright queued-pack set
                    // tracks hand-picks while choosing), frozen at vend.
                    slotOrder={
                      isActive
                        ? committedSlotOrder ??
                          (phaseKind === 'ready' ? computeSlotOrder(selectedSlots, packCount) : undefined)
                        : undefined
                    }
                    selectedSlots={isActive && slotPickOffered ? selectedSlots : undefined}
                    onToggleSlot={isActive && slotPickOffered ? toggleSlot : undefined}
                    slotSelectEnabled={isActive && slotPickOffered && phaseKind === 'ready'}
                    // Swoobz accent (Tim): selection glow is the brand cyan on
                    // every machine, not the per-tier LED color.
                    ledColor={T.cyan}
                  />
                </div>
              )
            })}
          </div>
          {/* Turntable arrows (also: keyboard ← →). */}
          <button
            type="button"
            onClick={() => stepTier(-1)}
            disabled={phaseKind === 'vending'}
            aria-label="Previous machine"
            className="vend-arrow"
            style={{
              ...btnBase,
              position: 'absolute',
              left: -8,
              top: '44%',
              zIndex: 2,
              borderRadius: 24,
              fontSize: 18,
              color: T.dim,
              background: 'rgba(4,6,9,0.72)',
              opacity: phaseKind === 'vending' ? 0.35 : 1,
            }}
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => stepTier(1)}
            disabled={phaseKind === 'vending'}
            aria-label="Next machine"
            className="vend-arrow"
            style={{
              ...btnBase,
              position: 'absolute',
              right: -8,
              top: '44%',
              zIndex: 2,
              borderRadius: 24,
              fontSize: 18,
              color: T.dim,
              background: 'rgba(4,6,9,0.72)',
              opacity: phaseKind === 'vending' ? 0.35 : 1,
            }}
          >
            ▶
          </button>
          {/* Pack rail: one chip per vended pack, synced to the tray landing. */}
          <div
            className="vend-rail"
            aria-live="polite"
            style={{
              minHeight: 56,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 10,
              // Subtle backplate: the rail chips must read on the busy room
              // floor (autisk contrast nit).
              background: 'rgba(6, 8, 12, 0.55)',
              border: '1px solid rgba(13, 15, 21, 0.6)',
              borderRadius: 12,
              padding: '6px 10px',
            }}
          >
            {phaseKind !== 'settled' &&
              railPacks.map((p, i) => (
                <PackChip
                  key={p.packIndex}
                  pack={p}
                  delayMs={reduced ? 0 : i === railPacks.length - 1 ? CHIP_SYNC_MS : 0}
                  hidden={cutsceneOn && !reduced}
                />
              ))}
            {/* Slot-pick hint (ready only): calm, optional, no urgency. Lives in
                the otherwise-empty rail so it never disturbs the tuned mobile
                folds. */}
            {phaseKind === 'ready' && slotPickOffered && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  fontFamily: T.mono,
                  fontSize: 12,
                  letterSpacing: '0.06em',
                  color: T.dimLift,
                }}
              >
                <span>PICK YOUR SLOTS · OPTIONAL</span>
                <span style={{ color: selectedSlots.length > 0 ? T.cyan : T.dimLift, fontWeight: 700 }}>
                  {selectedSlots.length} SELECTED
                </span>
                {selectedSlots.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSlots([])}
                    aria-label="Clear slot selection"
                    style={{
                      fontFamily: T.mono,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      color: T.dimLift,
                      background: 'transparent',
                      border: `1px solid ${T.cardEdge}`,
                      borderRadius: 7,
                      padding: '4px 9px',
                      minHeight: 28,
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    CLEAR
                  </button>
                )}
              </div>
            )}
            {phaseKind === 'vending' && (
              <div style={{ fontFamily: T.mono, fontSize: 12, color: T.faint, textAlign: 'center' }}>
                VENDING {state.dispensed.length}/{committedCount}
                {cutsceneOn && !reduced ? '' : ` · TRAY ${formatUsdc(state.trayLamports)}`}
                {state.committedSeedHashHex && (
                  <div style={{ fontSize: 9.5, marginTop: 3, letterSpacing: '0.04em' }}>
                    SEED COMMITTED ·{' '}
                    {state.committedSeedHashHex.slice(0, 16)}… ·
                    REVEALED ON THE RECEIPT
                  </div>
                )}
              </div>
            )}
          </div>
          {state.phase.kind === 'settled' &&
            cutsceneOn &&
            !reduced &&
            !ripDone &&
            state.phase.outcome.packs.length > 0 && (
              <PackRipCutscene outcome={state.phase.outcome} tier={machine} onFinish={() => setRipDone(true)} />
            )}
          {state.phase.kind === 'settled' && (!cutsceneOn || reduced || ripDone) && (
            <SettledPanel outcome={state.phase.outcome} onCollect={c.acknowledgeSettlement} />
          )}
        </div>

        {isPortrait ? (
          /* ── BAND 3 (portrait): the control zone. No stacked cards, no plank
              — the hero CTA, the machine chips and the two steppers float
              directly on the room. The disclosure line lives in a FIXED-HEIGHT
              slot so it can never reflow the screen when it appears. LAST
              VENDS is not rendered here (history stays on desktop/landscape;
              the receipt and its verify path are untouched). ── */
          <div
            className="vend-controls vend-controls-portrait"
            style={{ display: 'flex', flexDirection: 'column', gap: 5, position: 'relative', zIndex: 3 }}
          >
            <div className="vend-disclosure-slot">{overBalance ? disclosureCopy : ''}</div>
            {vendCta}
            <div className="vend-portrait-row">{machineChips}</div>
            <div className="vend-portrait-row">
              <div className="vend-stepper-cluster">
                <span className="vend-stepper-label">PACK PRICE · USDC</span>
                {priceStepper}
              </div>
              <div className="vend-stepper-cluster">
                <span className="vend-stepper-label">PACKS · MAX {MAX_PACKS}</span>
                {packsStepper}
              </div>
            </div>
          </div>
        ) : (
        /* ── Control column (own stacking layer: the 3D turntable's side
            machines must never paint over the controls). ── */
        <div className="vend-controls" style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', zIndex: 3 }}>
          <Card className="vend-card-id">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.22em', color: T.faint }}>
                  SWOOBZ ORIGINALS
                </div>
                <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '0.06em', marginTop: 2 }}>
                  AUTOMAT
                </div>
                <div className="vend-id-sub" style={{ fontSize: 12, color: T.dim, marginTop: 2 }}>
                  The multiplier vending machine
                </div>
              </div>
              {helpButton}
            </div>
            {/* Balance + compliance folded into the identity plaque so the
                column never runs past the viewport. */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: T.mono,
                fontSize: 13,
                color: T.dim,
                marginTop: 12,
                paddingTop: 9,
                borderTop: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <span>BALANCE</span>
              <span style={{ color: T.text, fontWeight: 700 }}>
                {formatUsdc(state.balanceLamports)} USDC
              </span>
            </div>
            <div
              style={{
                fontFamily: T.mono,
                fontSize: 9.5,
                color: '#828c9c',
                textAlign: 'center',
                marginTop: 7,
                letterSpacing: '0.04em',
              }}
            >
              RTP 96.50% · PROVABLY FAIR · PLAY SAFE · SET LIMITS
            </div>
          </Card>


          <Card>
            <Label>MACHINE · PICK YOURS</Label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{machineChips}</div>
            <div
              className="vend-machine-caption"
              style={{
                fontFamily: T.mono,
                fontSize: 11,
                color: T.dim,
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              {`${TIER_DISPLAY_LABEL[machine]} · 1 IN ${GOLD_ONE_IN_BY_TIER[machine]} VENDS GOLD · UP TO ${formatMultiplier(PACK_MAX_MULTIPLIER_BPS_BY_TIER[machine]).replace('.00x', 'x')}`}
            </div>
          </Card>

          {/* The one button, right under the machine choice (Tim): VEND when
              ready; while vending it becomes the reveal-pace SKIP. */}
          {vendCta}

          {overBalance && (
            <div
              style={{
                fontFamily: T.mono,
                fontSize: 11,
                letterSpacing: '0.06em',
                color: T.dim,
                textAlign: 'center',
                marginTop: -4,
              }}
            >
              {disclosureCopy}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>{cutsceneToggle}</div>

          <Card>
            <Label>PACK PRICE · USDC</Label>
            {priceStepper}
          </Card>

          <Card>
            <Label>PACKS THIS VEND · MAX {MAX_PACKS} AT ONCE</Label>
            {packsStepper}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: T.mono,
                fontSize: 13,
                color: T.dim,
                marginTop: 12,
              }}
            >
              <span>TOTAL</span>
              <span style={{ color: T.text, fontWeight: 700 }}>{formatUsdc(c.totalCostLamports)}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: T.mono,
                fontSize: 13,
                color: T.dim,
                marginTop: 4,
              }}
            >
              <span>MAX WIN</span>
              <span style={{ color: T.gold, fontWeight: 700 }}>{formatUsdc(c.maxWinLamports)}</span>
            </div>
          </Card>

          {state.history.length > 0 && (
            <Card>
              <Label>LAST VENDS</Label>{/* money-machine history */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {state.history.slice(0, 8).map((h, i) => (
                  <div
                    key={i}
                    style={{
                      fontFamily: T.mono,
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '5px 9px',
                      borderRadius: 8,
                      border: `1px solid ${h.goldCount > 0 ? T.gold : T.cardEdge}`,
                      color: h.goldCount > 0 ? T.gold : h.won ? T.text : T.faint,
                    }}
                  >
                    {formatMultiplier(h.aggregateBps)}
                    {h.goldCount > 0 ? ` · ${h.goldCount}G` : ''}
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>
        )}
        {/* ── BAND 4 (portrait): the money strip. A slim band pinned to the
            bottom edge, transparent at its top so it sits ON the room instead
            of becoming a plank: the round's two live numbers plus the
            compliance line. Text only — no wells, no borders — and
            pointer-events:none so it can never eat a press (learning 19).
            BALANCE lives in the top strip; safe-area inset respected. ── */}
        {isPortrait && (
          <div className="vend-moneystrip" ref={moneyStripRef}>
            <div className="vend-money-line">
              TOTAL <b>{formatUsdc(c.totalCostLamports)}</b> · MAX WIN{' '}
              <b className="vend-money-max">{formatUsdc(c.maxWinLamports)}</b>
            </div>
            <div className="vend-money-legal">
              RTP 96.50% · PROVABLY FAIR · PLAY SAFE · SET LIMITS
            </div>
          </div>
        )}
      </div>
      {/* HOW IT WORKS: a viewport overlay (readable anywhere, any scroll,
          any device) instead of an inline column card. */}
      {showHelp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="How it works"
          onClick={() => setShowHelp(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(3, 5, 8, 0.7)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px, 100%)' }}>
            <Card style={{ maxHeight: '86dvh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Label>HOW IT WORKS</Label>
                <button
                  type="button"
                  onClick={() => setShowHelp(false)}
                  aria-label="Close"
                  style={{ ...btnBase, borderRadius: 22, fontSize: 15, color: T.dim, marginTop: -6 }}
                >
                  ×
                </button>
              </div>
              <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.65 }}>
                <div style={{ color: T.text, fontWeight: 600, marginBottom: 4 }}>The machines</div>
                <div style={{ marginBottom: 12 }}>
                  Three machines stand on the turntable. Switch with the arrows, the arrow keys or
                  the buttons:
                  {TIER_ORDER.map((t) => (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: TIER_ROOMS[t].led,
                          boxShadow: `0 0 6px ${TIER_ROOMS[t].led}`,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontFamily: T.mono, fontSize: 12 }}>
                        {TIER_DISPLAY_LABEL[t]} · 1 IN {GOLD_ONE_IN_BY_TIER[t]} VENDS GOLD · UP TO{' '}
                        {formatMultiplier(PACK_MAX_MULTIPLIER_BPS_BY_TIER[t]).replace('.00x', 'x')}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ color: T.text, fontWeight: 600, marginBottom: 4 }}>Buying packs</div>
                <div style={{ marginBottom: 12 }}>
                  Pick a pack price and how many packs to vend (1 to {MAX_PACKS}, all in one buy).
                  Every pack holds one multiplier of its own price. TOTAL is what you pay; MAX WIN
                  is the ceiling if every pack hit the top.
                </div>
                <div style={{ color: T.text, fontWeight: 600, marginBottom: 4 }}>The reveal</div>
                <div style={{ marginBottom: 12 }}>
                  With CUTSCENE on, your packs rip open as cards: tap to fast-forward, tap again to
                  continue, or press SKIP for the result. While the machine is still vending, the
                  big button becomes SKIP and shows all packs at once. Gold cards are the rare big
                  multipliers.
                </div>
                <div style={{ color: T.text, fontWeight: 600, marginBottom: 4 }}>Fairness</div>
                <div style={{ marginBottom: 12 }}>
                  Every machine pays 96.50 of every 100 staked over the long run. Outcomes are
                  locked the moment you press VEND: the seed hash is shown during the vend, and the
                  receipt reveals the seed and re-checks every pack on your own screen (the
                  "ROUND VERIFIED" line).
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 11, color: '#828c9c', textAlign: 'center' }}>
                  PLAY SAFE · SET LIMITS BEFORE YOU PLAY
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
      {/* Screen-reader phase announcements. */}
      <span
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        {phaseKind === 'vending'
          ? `Vending pack ${state.dispensed.length} of ${committedCount}`
          : phaseKind === 'settled' && state.phase.kind === 'settled'
            ? `Tray served. Total ${formatUsdc(state.phase.outcome.totalPayoutLamports)} USDC.`
            : ''}
      </span>
      {/* The provider paces packs at VEND_STEP_MS; keep the import live for
          integrators reading this file (the canvas choreography fits inside). */}
      <span style={{ display: 'none' }} data-vend-step-ms={VEND_STEP_MS} />
    </div>
  )
}

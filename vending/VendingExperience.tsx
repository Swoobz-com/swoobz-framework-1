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

const EMPTY_PACKS: readonly PackResult[] = []
/** DOM chip pop is delayed to the canvas bay-landing beat
 *  (coil + chamber fall + hidden beat + bay drop). */
const CHIP_SYNC_MS = 880

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
function PackRipCutscene({
  outcome,
  onFinish,
}: {
  outcome: VendingOutcome
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
  const packImg = '/skin/pack-standard-cut.png'

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
  useEffect(() => {
    if (phaseKind === 'vending') setRipDone(false)
    // One overlay at a time: the vend/settled ceremony owns the screen, so the
    // help modal must never stack over the settled/COLLECT overlay (flow-QA).
    if (phaseKind === 'vending' || phaseKind === 'settled') setShowHelp(false)
    // Mobile (single-column PORTRAIT stack): the action plays in the machine
    // stage ABOVE the controls — bring it into view so the player sees the
    // vend, the rip and the receipt without hunting (jesse blocker #1). In
    // landscape the two-column grid keeps the stage in view, so no scroll.
    if (
      (phaseKind === 'vending' || phaseKind === 'settled') &&
      window.matchMedia('(max-width: 940px) and (orientation: portrait)').matches
    ) {
      stageRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    }
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
        /* PORTRAIT phones: single-column stack (stage above the control column).
           Width-only would also catch landscape phones and hand them the stack —
           where the first paint is machine-glass only (mobile-QA CRITICAL). */
        @media (max-width: 940px) and (orientation: portrait) {
          .vend-shell { grid-template-columns: minmax(0, 1fr); max-width: 560px; }
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
        {/* ── Machine column: the TURNTABLE — all three machines mounted on a
            rotating plateau; the back two stay visible, dimmed. ── */}
        <div style={{ position: 'relative', zIndex: 1 }} className="vend-stage" ref={stageRef}>
          {/* Plateau disc (the machines stand on it; far edge reads higher). */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
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
              <PackRipCutscene outcome={state.phase.outcome} onFinish={() => setRipDone(true)} />
            )}
          {state.phase.kind === 'settled' && (!cutsceneOn || reduced || ripDone) && (
            <SettledPanel outcome={state.phase.outcome} onCollect={c.acknowledgeSettlement} />
          )}
        </div>

        {/* ── Control column (own stacking layer: the 3D turntable's side
            machines must never paint over the controls). ── */}
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {MACHINE_ORDER.map((t) => (
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
              ))}
            </div>
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
          <button
            type="button"
            className="vend-cta"
            onClick={() => {
              if (phaseKind === 'vending') c.skipReveal()
              else void c.vendPacks()
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

          {/* Balance disclosure: shown ONLY when an exceeds-balance total is the
              reason the VEND CTA is disabled. Calm, factual, RG-neutral — no
              urgency, no color escalation, no "add funds" nudge. */}
          {phaseKind === 'ready' &&
            c.totalCostLamports > 0n &&
            c.totalCostLamports > state.balanceLamports && (
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
                TOTAL EXCEEDS BALANCE · LOWER PACKS OR PRICE
              </div>
            )}

          <div style={{ display: 'flex', gap: 8 }}>
            <SmallBtn
              onClick={() => setCutsceneOn((v) => !v)}
              active={cutsceneOn}
              ariaLabel="Toggle pack-rip cutscene"
              grow
            >
              CUTSCENE · {cutsceneOn ? 'ON' : 'OFF'}
            </SmallBtn>
          </div>

          <Card>
            <Label>PACK PRICE · USDC</Label>
            {(
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            )}
          </Card>

          <Card>
            <Label>PACKS THIS VEND · MAX {MAX_PACKS} AT ONCE</Label>
            {(
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                    <option key={n} value={n} style={selectOptionStyle}>
                      {n === MAX_PACKS ? `${n} PACKS · MAX` : `${n} PACK${n > 1 ? 'S' : ''}`}
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
            )}
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

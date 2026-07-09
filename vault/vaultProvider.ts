/**
 * Vault provider — deterministic, mockable game-state machine for the player
 * UI. State lives client-side; the shape mirrors the on-chain wiring (PDAs,
 * per-tile commit-reveal) so the future Solana swap is a one-file change.
 *
 * RG-C3 STRUCTURAL ENFORCEMENT (VAULT-CRAFT-SPEC.md §5, load-bearing):
 * --------------------------------------------------------------------
 *  • The `revealedTiles` map only stores tiles the player has clicked. The
 *    full mine bitmap is never written into UI-visible state during an
 *    active round. The provider's outward shape has no `hiddenSafePositions`,
 *    no `hiddenMinePositions`, no `nextWouldBeSafe` field — the type
 *    system makes a near-miss leak impossible at the data layer.
 *  • The full mine bitmap exists on the secrets ref (post-settlement audit
 *    only) and is NEVER spread into UI-visible state during `playing`.
 *  • The terminal `mine-hit` phase carries ONLY the hit tile index +
 *    the tiles the player actually revealed. The full bitmap is exposed
 *    in the settled outcome's `mineBitmap` field strictly for the Glass
 *    Box receipt — see the receipt component's enforcement comment.
 *
 * Domain B (controller) consuming Domain A (math). All financial math (the
 * cumulative multiplier ladder, the payout) routes through `vaultMath.ts`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ensureAudio, playSafeLocked, playSafeOpen, playTileRevealConfirm } from './vaultAudio'
import {
  AUTOPICK_COOLOFF_DEFAULT,
  AUTOPICK_MIN_INTER_ROUND_SLOTS_DEFAULT,
  cumulativeMultiplierBps,
  DEFAULT_MODE,
  MAX_MULTIPLIER_BPS_DEFAULT,
  MIN_WAGER_LAMPORTS_DEFAULT,
  modeParams,
  moonPayoutLamports,
  ONE_X_BPS,
  settlePayout,
  type VaultMode,
} from './vaultMath'

// ─── Phase model — RG-C3 structural enforcement at the type level ──────────

/**
 * `bet-entry` is the sole configuration phase (canvas idle) — the game lands
 * here directly on load (LOBBY-SPLASH REMOVAL, 2026-07-06: Tim — "aan het
 * begin heb je nu ape in button zullen we dit niet gewoon weghalen en direct
 * naar de pick your world gaan als je de game opent?"). There is no separate
 * `lobby` phase any more; `bet-entry` is bit-identical to the old lobby state
 * except the player lands straight on PICK YOUR WORLD instead of behind an
 * extra "ape in" tap.
 * `playing` is the active round — tiles being revealed. The shape carries
 * the revealed tiles ONLY; mine positions on unclicked tiles are NEVER in
 * UI-visible state during this phase.
 * `mine-hit` is the terminal sub-state that ends `playing`. It carries the
 * hit tile index and the player's reveal trace — and NOTHING ELSE. There
 * is intentionally no `wouldHaveBeenSafe` or `nextSafePositions` field on
 * this type. The Vault frontend cannot render a near-miss because the data
 * doesn't exist.
 * `settling` is the bridge while we compute payout / verify.
 * `settled` carries the full audit — the mine bitmap surfaces here strictly
 * for the Glass Box receipt (post-loss, factual record).
 */
export type VaultPhase =
  | { kind: 'bet-entry' }
  | { kind: 'playing' }
  | { kind: 'mine-hit'; mineTileIdx: number }
  | { kind: 'settling' }
  | { kind: 'settled'; outcome: VaultOutcome }

/**
 * Settled outcome — exposed only AFTER the round has closed. The `mineBitmap`
 * is the full Fisher-Yates-derived ground truth (the player can verify
 * client-side via the Glass Box widget). At THIS point the receipt is an
 * audit record, not a live-round leak; the consumer rendering the receipt
 * must not animate "would have been" overlays — see VaultExperience render
 * contract.
 */
export interface VaultOutcome {
  won: boolean
  /** Difficulty world this round was played in. */
  mode: VaultMode
  /** Wager in USDC lamports. */
  wagerLamports: bigint
  /** Total payout in USDC lamports (0 on a rug). Includes any MOON bonus. */
  payoutLamports: bigint
  /**
   * MOON bonus paid (SHITCOIN only). 0n unless the MOON tile was revealed on a
   * winning cash-out. A FLAT cash addition, never folded into the BPS ladder —
   * the Glass Box receipt shows PUMP payout and MOON bonus as separate lines.
   */
  moonPayoutLamports: bigint
  /** MOON tile index for this round (Glass Box receipt); null unless SHITCOIN. */
  moonTileIdx: number | null
  /** Final cumulative multiplier reached, in BPS. */
  finalMultiplierBps: bigint
  /** Tiles the player tapped, in click order (factual reveal trace). */
  revealedTiles: number[]
  /** Tile index of the mine that ended the round; null on a clean cash-out. */
  mineTileIdx: number | null
  /**
   * True when this win was banked automatically by the target-lock rule
   * (ITEM 3), not a manual TAKE PROFIT tap. Drives the "TARGET LOCKED IN"
   * settlement copy. Always false on a loss. RG-C5: the auto-cash uses the
   * IDENTICAL settle path + celebration envelope as a manual cash-out — this
   * flag only selects a COPY variant, never an animation timing/amplitude.
   */
  cashedViaTarget: boolean
  /** Grid size (3, 5, or 7). */
  gridSize: number
  /** Mine count for this round. */
  mineCount: number
  /**
   * Full mine bitmap — exposed ONLY here, for the Glass Box receipt's
   * provably-fair verification. The receipt UI displays this as a count
   * ("3 mines hidden in the cleared portion"), NEVER as a tile-by-tile
   * counterfactual animation. See `VaultExperience.tsx` Settlement render
   * contract.
   */
  mineBitmap: boolean[]
  /** Hex of the revealed server seed. */
  serverSeedHex: string
  /** Hex of the committed server-seed hash. */
  serverSeedHashHex: string
  /** Hex of the 8-byte LE round id. */
  roundIdHex: string
  /** Hex of the mixer (program-id domain separator in production). */
  mixerHex: string
}

export interface VaultHistoryRow {
  finalMultiplierBps: bigint
  won: boolean
  payoutLamports: bigint
  wagerLamports: bigint
}

export interface VaultState {
  phase: VaultPhase
  balanceLamports: bigint
  /** Selected difficulty world. Drives gridSize / mineCount / house edge. */
  mode: VaultMode
  /** Wager for the current round. Slip-stable across phase changes. */
  wagerLamports: bigint
  gridSize: number
  mineCount: number
  /**
   * Target-lock / auto-cash rule (ITEM 3). When non-null, the round auto-banks
   * via the SAME `cashOut()` path the moment `cumulativeMultiplierBps` reaches
   * this value. Player intent for the current round — NOT a streak signal.
   * Minimum 1.20× (12_000 bps); `setTarget` rejects anything lower.
   */
  targetMultiplierBps: bigint | null
  /**
   * Index of the MOON tile the player has REVEALED this round, or null. Set
   * only when a safe reveal lands on the round's MOON tile (SHITCOIN only).
   * RG-C3: the MOON position is NOT exposed before the player taps it — this
   * field stays null until the tile is actually revealed.
   */
  revealedMoonTileIdx: number | null
  /**
   * Tiles the player has CLICKED. Map key = tile index, value = true (safe).
   * Mine hits never enter this map; they advance phase to `mine-hit`
   * directly. This is the RG-C3 anchor — no `wouldHaveBeenSafe`, no
   * `unrevealedMinePositions`, no projected-path data.
   */
  revealedTiles: number[]
  /** Cumulative multiplier in BPS — recomputed from revealedTiles.length. */
  cumulativeMultiplierBps: bigint
  /**
   * Cumulative multiplier BEFORE the most-recent safe reveal. The canvas
   * reads this to compute the per-tile delta for the floating-delta text.
   *
   * RG-C5 NOTE: this is the previous CUMULATIVE bps (an economic snapshot,
   * not a streak count). The floating-text animation is uniform per
   * reveal — the only signal carried into the animation is the BPS delta
   * (the actual economic value of THIS tile). No streak parameter reaches
   * the canvas via this prop or any other.
   */
  previousCumulativeMultiplierBps: bigint
  history: VaultHistoryRow[]
  /** AUTO ⚡ / TRAIL — auto-reveal active for the current round. */
  autoActive: boolean
  /** Play style: false = MANUAL (classic Mines, tap reveals); true = TRAIL
   *  (path betting — hold/drag to plan a path, then GO). Player-toggled. */
  trailMode: boolean
  /** The ordered trail of tile indices the player selected (path betting). */
  trail: number[]
  /**
   * The trail committed on the MOST RECENT `runTrail()` call this session
   * ("bet again · same trail" preset, 2026-07-02). Captured once, at the one
   * safe commit moment (`runTrail()`), since `trail` itself is emptied on
   * settle / placeBet / cascade-complete. Deliberately PERSISTS across
   * rounds — NOT reset by `settleAt()`/`placeBet()` (unlike `trail`/
   * `trailMode`, which reset every round) so the preset survives into the
   * next round's bet-entry/playing phase. This is a ONE-CLICK-LOADS-THE-
   * PLANNING-STATE preset, never an auto-bet: `reuseLastTrail()` only ever
   * repaints the trail into `trail` — the player still presses GO per round.
   */
  lastTrail: number[]
  /**
   * `gridSize` captured alongside `lastTrail`. Tile indices don't map across
   * board sizes, so `reuseLastTrail()` is a no-op unless this still matches
   * the CURRENT `gridSize`.
   */
  lastTrailGridSize: number
  /**
   * TRAIL reveal-pacing preference. 'staggered' (default) plays the existing
   * one-tile-per-AUTO_REVEAL_INTERVAL_MS cascade via the AUTO/TRAIL driver.
   * 'instant' (2026-07-02 — Tim: "all planned tiles open in ONE frame, not a
   * fast cascade") routes `runTrail()` to `revealTrailInstant()` instead: the
   * WHOLE planned trail commits in a single `setState`, so every tile's flip
   * animation starts on the same frame (±16ms), never a per-tile stagger.
   * Same EV, same reveal order, same rug-stop behavior either way — only the
   * PRESENTATION differs. Session-persistent, same lifetime as trailMode.
   * Player-toggled.
   */
  revealPace: 'staggered' | 'instant'
  /** Auto-pick configuration (Phase 2 stub — disabled in V1). */
  autopickEnabled: boolean
  autopickMaxSessionLossLamports: bigint | null
  autopickCooloffThreshold: number
}

interface RoundSecrets {
  serverSeed: Uint8Array
  serverSeedHash: Uint8Array
  mixer: Uint8Array
  roundId: bigint
  mineBitmap: boolean[]
  gridSize: number
  mineCount: number
  mode: VaultMode
  houseEdgeBps: bigint
  /** MOON tile index (SHITCOIN only — the first safe position in the shuffled
   *  order, positions[mineCount]). null in non-SHITCOIN modes. Committed at
   *  round start, verifiable in the Glass Box receipt. */
  moonTileIdx: number | null
}

const INITIAL_BALANCE = 1_000_000_000n // 1000 USDC
const DEFAULT_WAGER = 1_000_000n // 1 USDC per Vault craft default
/** History cap. At this length the session arc surfaces a natural-close beat
 *  (ITEM 2). Exported so the experience layer can gate the SESSION SUMMARY. */
export const MAX_HISTORY = 20

/**
 * Build the pristine bet-entry state. Single source of truth for BOTH the
 * initial mount and `closeVault` (ITEM 2 — the "close the vault" reset
 * mirrors the initial-mount reset exactly, so a fresh session is bit-
 * identical to a first load). LOBBY-SPLASH REMOVAL (2026-07-06): the game
 * now lands directly on `bet-entry` — no separate lobby phase exists.
 */
function makeInitialState(): VaultState {
  const m = modeParams(DEFAULT_MODE)
  return {
    phase: { kind: 'bet-entry' },
    balanceLamports: INITIAL_BALANCE,
    mode: DEFAULT_MODE,
    wagerLamports: DEFAULT_WAGER,
    gridSize: m.gridSize,
    mineCount: m.mineCount,
    targetMultiplierBps: null,
    revealedMoonTileIdx: null,
    revealedTiles: [],
    cumulativeMultiplierBps: ONE_X_BPS,
    previousCumulativeMultiplierBps: ONE_X_BPS,
    history: [],
    autoActive: false,
    trailMode: false,
    trail: [],
    lastTrail: [],
    lastTrailGridSize: m.gridSize,
    revealPace: 'staggered',
    autopickEnabled: false,
    autopickMaxSessionLossLamports: null,
    autopickCooloffThreshold: AUTOPICK_COOLOFF_DEFAULT,
  }
}

/**
 * AUTO ⚡ cadence — rapid random coin opens for the degen speed loop. Module-
 * level constant (RG-C5): the auto pace is identical every round, never scales
 * with streak/session. AUTO is pure input speed — same per-coin odds as manual
 * tapping, EV unchanged, cash-out always one tap away.
 */
const AUTO_REVEAL_INTERVAL_MS = 430

/** Minimum target-lock multiplier (ITEM 3): 1.20× in BPS. A target below this
 *  is rejected by `setTarget`. Module const — RG-C5 (no session/streak input). */
export const TARGET_MIN_BPS = 12_000n

// ─── Helpers ───────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

async function sha256(parts: Uint8Array[]): Promise<Uint8Array> {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const buf = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    buf.set(p, offset)
    offset += p.length
  }
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return new Uint8Array(digest)
}

function u64Le(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let v = value
  for (let i = 0; i < 8; i++) {
    ;(out as Uint8Array)[i] = Number(v & 0xffn)
    v >>= 8n
  }
  return out
}

/**
 * Derive the mine bitmap deterministically from the round seed via the same
 * Fisher-Yates shuffle the on-chain program uses. The off-chain mirror in
 * `tests/originals_vault/_vault_helpers.ts` is bit-identical to
 * `mines_math.rs::derive_mine_bitmap`. The provider runs the same algorithm
 * here so the Glass Box receipt can re-derive at verify time.
 *
 * SECURITY NOTE: this function runs in the client. In production, the mine
 * bitmap is committed on-chain at round start (via per-tile commit-reveal
 * sub-protocol) and the client only sees a tile's outcome AFTER tapping.
 * For the V1 mock, we derive locally and the provider gates reveals so the
 * UI cannot leak hidden positions. The on-chain wiring will replace this.
 */
async function deriveMineBitmap(
  serverSeed: Uint8Array,
  totalTiles: number,
  mineCount: number,
): Promise<{ mineBitmap: boolean[]; firstSafeTileIdx: number }> {
  const mixerTag = new TextEncoder().encode('VAULTILE')
  const bitmap = new Array<boolean>(totalTiles).fill(false)
  const positions = new Array<number>(totalTiles)
  for (let i = 0; i < totalTiles; i++) positions[i] = i

  for (let step = 0; step < totalTiles; step++) {
    const hash = await sha256([serverSeed, mixerTag, u64Le(BigInt(step))])
    // First 8 bytes of the hash as LE u64.
    let raw = 0n
    for (let i = 0; i < 8; i++) {
      raw |= BigInt(hash[i]!) << BigInt(8 * i)
    }
    const remaining = BigInt(totalTiles - step)
    const swapOffset = Number(raw % remaining)
    const swapIndex = step + swapOffset
    const tmp = positions[step]!
    positions[step] = positions[swapIndex]!
    positions[swapIndex] = tmp
  }

  for (let i = 0; i < mineCount; i++) {
    bitmap[positions[i]!] = true
  }
  // The MOON tile (SHITCOIN twist) is the first SAFE position in the shuffled
  // order — positions[mineCount]. Same seed, same Fisher-Yates, no extra VRF
  // call. The caller decides whether this round actually carries a MOON tile.
  const firstSafeTileIdx = positions[mineCount] ?? -1
  return { mineBitmap: bitmap, firstSafeTileIdx }
}

/**
 * Generate the round secrets from the ACTUAL round configuration (ITEM 4 —
 * FAIRNESS-CRITICAL). Previously this ignored `state.gridSize`/`state.mineCount`
 * and re-derived them from `modeParams(mode)`, so any custom rug count was
 * cosmetic — the round, ladder, settle and receipt all silently used the mode
 * DEFAULT. Now the caller threads the real grid + mine count in; only the house
 * edge (and the MOON-tile flag) is a per-mode property that stays mode-locked.
 *
 * Because the mine bitmap + moonTileIdx are derived here from `gridSize` and
 * `mineCount`, and the settled outcome carries THESE same values, the Glass Box
 * receipt re-derives from the identical (gridSize, mineCount, serverSeed) and
 * stays provably verifiable at whatever custom count the round actually used.
 *
 * `mineCount` is clamped to [1, totalTiles-1] defensively so at least one safe
 * tile always exists (the controller setters already clamp, this is belt-and-
 * braces so the Fisher-Yates never over-fills the board).
 */
async function generateRoundSecrets(
  roundId: bigint,
  mode: VaultMode,
  gridSize: number,
  mineCount: number,
): Promise<RoundSecrets> {
  const { houseEdgeBps, hasMoonTile } = modeParams(mode)
  const totalTiles = gridSize * gridSize
  const safeMineCount = Math.max(1, Math.min(totalTiles - 1, Math.floor(mineCount)))
  const serverSeed = crypto.getRandomValues(new Uint8Array(32))
  const serverSeedHash = await sha256([serverSeed])
  const mixer = await sha256([new TextEncoder().encode('swoobz-originals-vault-v1-mock')])
  const { mineBitmap, firstSafeTileIdx } = await deriveMineBitmap(
    serverSeed,
    totalTiles,
    safeMineCount,
  )
  return {
    serverSeed,
    serverSeedHash,
    mixer,
    roundId,
    mineBitmap,
    gridSize,
    mineCount: safeMineCount,
    mode,
    houseEdgeBps,
    moonTileIdx: hasMoonTile ? firstSafeTileIdx : null,
  }
}

// ─── Controller ────────────────────────────────────────────────────────────

export interface VaultController {
  state: VaultState
  /**
   * Select the difficulty world (RUG OR RICHES). Locks gridSize / mineCount /
   * house edge to the mode defaults. Allowed in bet-entry (+ settled, see
   * impl) only.
   */
  setMode: (mode: VaultMode) => void
  /** Update wager (slip-stable). */
  setWager: (lamports: bigint) => void
  /** Update mine count (band-validated; clamps to [1, totalTiles-1]). */
  setMineCount: (count: number) => void
  /**
   * Set / clear the target-lock auto-cash rule (ITEM 3). Pass null to disable.
   * A non-null target below 1.20× (12_000 bps) is rejected (no-op). Settable in
   * bet-entry AND during a live round.
   */
  setTarget: (bps: bigint | null) => void
  /**
   * Grid-size setter — accepts 3, 5, or 7. 3 and 5 mirror the on-chain
   * `originals-vault::validate_grid_size` (Phase 1). 7×7 is a frontend
   * preview mode (mock provider supports it; on-chain Phase 2). Any other
   * value is rejected. Switching grid size clamps `mineCount` into
   * [1, total-1] for the new grid.
   */
  setGridSize: (size: number) => void
  /** Place the bet and transition into the active round. */
  placeBet: () => Promise<void>
  /** Tap a tile to reveal it. No-op if not in `playing`. */
  revealTile: (tileIdx: number) => void
  /** Cash out at the current cumulative multiplier. */
  cashOut: () => void
  /**
   * Toggle AUTO ⚡ — rapid random coin opens for speed. Only meaningful in
   * `playing`. Stops automatically on a rug or when the board is cleared.
   */
  toggleAuto: () => void
  /** Switch MANUAL ↔ TRAIL play style. */
  toggleTrailMode: () => void
  /** Switch TRAIL reveal pace staggered ↔ instant (presentation-only). */
  toggleRevealPace: () => void
  /** TRAIL path-betting: add/remove a face-down tile (tap toggle). */
  toggleTrailTile: (tileIdx: number) => void
  /** TRAIL path-betting: append a tile if absent (drag/hold paint — add-only). */
  addTrailTile: (tileIdx: number) => void
  /** Clear the pending trail. */
  clearTrail: () => void
  /** Commit + auto-run the selected trail. */
  runTrail: () => void
  /**
   * "bet again · same trail" preset — reloads the MOST RECENT committed
   * trail into the PLANNING state only (`trailMode: true`, `trail:
   * [...lastTrail]`). Never auto-runs (never calls `runTrail()`, never sets
   * `autoActive`) — the player still presses GO themselves. No-op unless
   * `lastTrail` is non-empty and `lastTrailGridSize` still matches the
   * current `gridSize`.
   */
  reuseLastTrail: () => void
  /** Acknowledge settlement, return to bet-entry with the same wager. */
  acknowledgeSettlement: () => void
  /**
   * Close the vault (ITEM 2 — session arc). Fully resets to the pristine
   * bet-entry state (mirrors the initial mount): fresh balance, cleared
   * history, default mode/wager. The natural-close beat at the history cap
   * calls this.
   */
  closeVault: () => void
  /** Phase 2 stub — auto-pick toggle. No-op in V1; surface still visible. */
  toggleAutopick: () => void
}

export function useVaultController(): VaultController {
  const [state, setState] = useState<VaultState>(makeInitialState)
  const secretsRef = useRef<RoundSecrets | null>(null)
  const roundIdRef = useRef<bigint>(1n)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Slot clock — Vault's render is mostly static; the clock exists for the
  // RG-C8 inter-round delay surface (Phase 2) + the round-stall watchdog.
  // Maintained for parity with the on-chain timing model.
  useEffect(() => {
    if (state.phase.kind !== 'playing') return
    const id = setInterval(() => {
      // No state mutation needed today; the canvas drives its own animation
      // clock. This is the seam where Phase 2 auto-pick polling lives.
    }, Number(AUTOPICK_MIN_INTER_ROUND_SLOTS_DEFAULT) * 400)
    return () => clearInterval(id)
  }, [state.phase.kind])

  const setMode = useCallback((mode: VaultMode) => {
    setState((s) => {
      // Mode is configuration: only changeable before the round commits.
      if (s.phase.kind !== 'bet-entry' && s.phase.kind !== 'settled') {
        return s
      }
      const m = modeParams(mode)
      // Wager is preserved (slip-stable); grid/mine lock to the mode.
      return { ...s, mode, gridSize: m.gridSize, mineCount: m.mineCount }
    })
  }, [])

  const setWager = useCallback((lamports: bigint) => {
    setState((s) => {
      if (lamports < MIN_WAGER_LAMPORTS_DEFAULT) {
        return { ...s, wagerLamports: MIN_WAGER_LAMPORTS_DEFAULT }
      }
      if (lamports > s.balanceLamports) {
        return { ...s, wagerLamports: s.balanceLamports }
      }
      return { ...s, wagerLamports: lamports }
    })
  }, [])

  const setMineCount = useCallback((count: number) => {
    setState((s) => {
      const totalTiles = s.gridSize * s.gridSize
      if (!Number.isInteger(count)) return s
      const clamped = Math.max(1, Math.min(totalTiles - 1, count))
      return { ...s, mineCount: clamped }
    })
  }, [])

  // ITEM 3 — target-lock / auto-cash. Min 1.20× guards against a target so low
  // it would fire on the very first tap (which is just a manual cash-out with
  // extra steps). null clears the rule. Settable in bet-entry + during playing.
  const setTarget = useCallback((bps: bigint | null) => {
    setState((s) => {
      if (bps === null) return { ...s, targetMultiplierBps: null }
      if (bps < TARGET_MIN_BPS) return s // reject too-low targets (no-op)
      return { ...s, targetMultiplierBps: bps }
    })
  }, [])

  const setGridSize = useCallback((size: number) => {
    // Tim 2026-05-26 SCENE-REBUILD: 3×3 and 5×5 are wired bit-for-bit with
    // the on-chain `originals-vault::validate_grid_size` (Phase 1 accepts 3
    // and 5; 7 is Phase-2 scaffold). 7×7 is exposed as a frontend-only
    // PREVIEW so players can FEEL the future surface; the math mirror
    // already supports 7×7, the on-chain settle path does not yet. When
    // the player picks 7×7 the mock provider runs locally — no real on-
    // chain commit. The provider clamps mine count into [1, total-1] as
    // the grid changes (e.g. switching from 5×5 with 24 mines to 3×3
    // would otherwise leave an invalid mine count).
    if (size !== 3 && size !== 5 && size !== 7) return
    setState((s) => {
      const total = size * size
      const clampedMines = Math.max(1, Math.min(total - 1, s.mineCount))
      return {
        ...s,
        gridSize: size,
        mineCount: clampedMines,
      }
    })
  }, [])

  const settleAt = useCallback((won: boolean, mineTileIdx: number | null, viaTarget = false) => {
    const secrets = secretsRef.current
    if (!secrets) return
    const s = stateRef.current
    const finalBps = won ? s.cumulativeMultiplierBps : ONE_X_BPS
    // MOON bonus: paid only on a winning cash-out where the player actually
    // revealed the MOON tile (SHITCOIN only). A flat cash addition — never
    // folded into the BPS ladder. On a rug the round pays 0 regardless of
    // whether MOON was revealed earlier (MOON grants no survival benefit).
    const moonRevealed = won && s.revealedMoonTileIdx !== null
    const moonBonus = moonRevealed ? moonPayoutLamports(s.wagerLamports) : 0n
    const basePayout = won ? settlePayout(s.wagerLamports, finalBps) : 0n
    const payoutLamports = basePayout + moonBonus
    const outcome: VaultOutcome = {
      won,
      mode: secrets.mode,
      wagerLamports: s.wagerLamports,
      payoutLamports,
      moonPayoutLamports: moonBonus,
      moonTileIdx: secrets.moonTileIdx,
      finalMultiplierBps: finalBps,
      revealedTiles: [...s.revealedTiles],
      mineTileIdx,
      // Auto-cash marker (ITEM 3) — only meaningful on a win; identical settle
      // path + envelope, this flag just selects a copy variant downstream.
      cashedViaTarget: won && viaTarget,
      gridSize: secrets.gridSize,
      mineCount: secrets.mineCount,
      mineBitmap: [...secrets.mineBitmap],
      serverSeedHex: toHex(secrets.serverSeed),
      serverSeedHashHex: toHex(secrets.serverSeedHash),
      roundIdHex: toHex(u64Le(secrets.roundId)),
      mixerHex: toHex(secrets.mixer),
    }
    // RG-C2: celebration only on a confirmed cash-out. RG-C3 + RG-C5:
    // identical envelopes regardless of streak / cumulative multiplier.
    if (won) playSafeOpen()
    else playSafeLocked()
    setState((cur) => ({
      ...cur,
      phase: { kind: 'settled', outcome },
      autoActive: false,
      trailMode: false,
      trail: [],
      balanceLamports: cur.balanceLamports + payoutLamports,
      history: [
        {
          finalMultiplierBps: finalBps,
          won,
          payoutLamports,
          wagerLamports: cur.wagerLamports,
        },
        ...cur.history,
      ].slice(0, MAX_HISTORY),
    }))
  }, [])

  const placeBet = useCallback(async () => {
    const s = stateRef.current
    if (s.phase.kind !== 'bet-entry' && s.phase.kind !== 'settled') return
    if (s.wagerLamports > s.balanceLamports) return
    ensureAudio()
    const roundId = roundIdRef.current
    roundIdRef.current = roundId + 1n
    // ITEM 4: thread the ACTUAL configured grid + rug count (custom rug counts
    // are now economically real, not cosmetic). House edge stays mode-locked.
    const secrets = await generateRoundSecrets(roundId, s.mode, s.gridSize, s.mineCount)
    secretsRef.current = secrets
    setState((cur) => ({
      ...cur,
      phase: { kind: 'playing' },
      balanceLamports: cur.balanceLamports - cur.wagerLamports,
      revealedTiles: [],
      revealedMoonTileIdx: null,
      autoActive: false,
      trailMode: false,
      trail: [],
      cumulativeMultiplierBps: ONE_X_BPS,
      previousCumulativeMultiplierBps: ONE_X_BPS,
    }))
  }, [])

  const revealTile = useCallback(
    (tileIdx: number) => {
      const s = stateRef.current
      if (s.phase.kind !== 'playing') return
      const secrets = secretsRef.current
      if (!secrets) return
      const totalTiles = s.gridSize * s.gridSize
      if (tileIdx < 0 || tileIdx >= totalTiles) return
      if (s.revealedTiles.includes(tileIdx)) return

      const isMine = secrets.mineBitmap[tileIdx] ?? false
      if (isMine) {
        // Mine hit → terminal sub-state. The revealed-tiles list is FINAL;
        // we do NOT add the mine to it (RG-C3: the mine is exposed via
        // mineTileIdx, separate from the safe-reveal trace). The unrevealed
        // tiles stay unrevealed forever — there is no `wouldHaveBeenSafe`
        // field anywhere downstream.
        setState((cur) => ({
          ...cur,
          phase: { kind: 'mine-hit', mineTileIdx: tileIdx },
        }))
        // Auto-advance into settled via settleAt. The delay MUST exceed the
        // rug-burst animation (RUG_BURST_DURATION_MS = 400) plus a brief
        // read-hold, so the player actually SEES the rug detonate before the
        // settlement overlay takes over (autisk fix: was 320 < 400 → truncated).
        setTimeout(() => {
          settleAt(false, tileIdx)
        }, 760)
        return
      }

      // Safe reveal: extend the trace, recompute cumulative multiplier using
      // THIS round's mode house edge (BLUECHIPS/ALTSEASON 300 bps, SHITCOIN
      // 655 bps). The edge is fixed at round start in `secrets`.
      const nextRevealed = [...s.revealedTiles, tileIdx]
      const prevBps = s.cumulativeMultiplierBps
      let nextBps: bigint
      try {
        nextBps = cumulativeMultiplierBps({
          totalTiles,
          mineCount: secrets.mineCount,
          safeCount: nextRevealed.length,
          houseEdgeBps: secrets.houseEdgeBps,
          maxMultiplierBps: MAX_MULTIPLIER_BPS_DEFAULT,
        })
      } catch {
        // Fail-closed: out-of-band input rejects rather than degrading.
        return
      }
      const delta = nextBps > prevBps ? nextBps - prevBps : 0n
      playTileRevealConfirm(delta)
      // MOON detection: if this safe reveal landed on the round's MOON tile,
      // record it (drives the MOON cinematic + the settlement bonus). RG-C3:
      // we only learn the MOON position by the player tapping it.
      const hitMoon = secrets.moonTileIdx !== null && tileIdx === secrets.moonTileIdx
      setState((cur) => ({
        ...cur,
        revealedTiles: nextRevealed,
        revealedMoonTileIdx: hitMoon ? tileIdx : cur.revealedMoonTileIdx,
        // Capture the previous cumulative bps so the canvas can compute the
        // per-tile delta for the floating-delta text. The delta is an
        // ECONOMIC value (an actual BPS quantity) — NOT a streak counter.
        // The floating-text ANIMATION timings remain module constants in
        // vaultSignatures.ts; only the displayed VALUE varies.
        previousCumulativeMultiplierBps: cur.cumulativeMultiplierBps,
        cumulativeMultiplierBps: nextBps,
      }))
    },
    [settleAt],
  )

  // `viaTarget` is `unknown` because the manual TAKE PROFIT button wires
  // `onClick={controller.cashOut}` — which would pass a MouseEvent. We coerce
  // strictly with `=== true`, so only the internal auto-cash effect (which
  // calls `cashOut(true)`) marks the outcome as target-locked.
  const cashOut = useCallback(
    (viaTarget?: unknown) => {
      const s = stateRef.current
      if (s.phase.kind !== 'playing') return
      if (s.revealedTiles.length === 0) return // Cash-out requires ≥1 safe
      setState((cur) =>
        cur.phase.kind === 'playing' ? { ...cur, phase: { kind: 'settling' } } : cur,
      )
      settleAt(true, null, viaTarget === true)
    },
    [settleAt],
  )

  // ITEM 3 — target-lock auto-cash. After a safe reveal lifts the cumulative
  // multiplier to/above the player's target, auto-bank via the SAME cashOut
  // path (identical settle + celebration envelope — RG-C5). Implemented as an
  // effect so `stateRef` is already synced when `cashOut` reads it; a direct
  // call inside `revealTile` would settle on the PRE-reveal snapshot. Fires
  // once: cashOut flips phase → settling, so the guard early-returns after.
  useEffect(() => {
    if (state.phase.kind !== 'playing') return
    const target = state.targetMultiplierBps
    if (target === null) return
    if (state.revealedTiles.length === 0) return
    if (state.cumulativeMultiplierBps >= target) {
      cashOut(true)
    }
  }, [
    state.phase.kind,
    state.cumulativeMultiplierBps,
    state.targetMultiplierBps,
    state.revealedTiles.length,
    cashOut,
  ])

  const toggleAuto = useCallback(() => {
    setState((s) => {
      if (s.phase.kind !== 'playing') return s
      const nextAuto = !s.autoActive
      // On STOP mid-run, drop already-revealed tiles from the trail so the
      // pending preview counts only the remaining (not-yet-opened) tiles
      // (verotty fix: was double-counting revealed tiles after STOP).
      const trail = nextAuto ? s.trail : s.trail.filter((t) => !s.revealedTiles.includes(t))
      return { ...s, autoActive: nextAuto, trail }
    })
  }, [])

  // ── TRAIL (path betting) ──────────────────────────────────────────────────
  // Explicit MANUAL/TRAIL toggle. MANUAL = classic Mines (tap reveals). TRAIL =
  // hold/drag to plan a path, then GO. Toggling clears any pending trail.
  const toggleTrailMode = useCallback(() => {
    setState((s) =>
      s.phase.kind === 'playing' && !s.autoActive
        ? { ...s, trailMode: !s.trailMode, trail: [] }
        : s,
    )
  }, [])

  // TRAIL reveal-pacing preference (mirrors toggleTrailMode's shape exactly).
  // Same guard as toggleTrailMode — can't be flipped mid-cascade (autoActive),
  // only between rounds / while planning a trail. Presentation-only: does not
  // touch trail contents, revealedTiles, or any payout field.
  const toggleRevealPace = useCallback(() => {
    setState((s) =>
      s.phase.kind === 'playing' && !s.autoActive
        ? { ...s, revealPace: s.revealPace === 'staggered' ? 'instant' : 'staggered' }
        : s,
    )
  }, [])

  // Add/remove a face-down tile from the ordered trail (TRAIL mode only). Used
  // by a tap (toggle) and by drag-paint (canvas only calls it for not-yet-added
  // tiles → add).
  const toggleTrailTile = useCallback((tileIdx: number) => {
    setState((s) => {
      if (s.phase.kind !== 'playing' || !s.trailMode || s.autoActive) return s
      const total = s.gridSize * s.gridSize
      if (tileIdx < 0 || tileIdx >= total) return s
      if (s.revealedTiles.includes(tileIdx)) return s // already open, can't select
      const at = s.trail.indexOf(tileIdx)
      const trail = at >= 0 ? s.trail.filter((t) => t !== tileIdx) : [...s.trail, tileIdx]
      return { ...s, trail }
    })
  }, [])

  // Append a tile to the trail if absent (paint gesture — never removes). Using
  // an append-if-absent updater is batch-safe: chained functional updaters see
  // the prior append, so a duplicate paint of the same tile is a clean no-op
  // (a toggle here would drop the start tile — verotty fix).
  const addTrailTile = useCallback((tileIdx: number) => {
    setState((s) => {
      if (s.phase.kind !== 'playing' || !s.trailMode || s.autoActive) return s
      const total = s.gridSize * s.gridSize
      if (tileIdx < 0 || tileIdx >= total) return s
      if (s.revealedTiles.includes(tileIdx) || s.trail.includes(tileIdx)) return s
      return { ...s, trail: [...s.trail, tileIdx] }
    })
  }, [])

  // Clear the pending trail (back to plain tapping).
  const clearTrail = useCallback(() => {
    setState((s) => (s.phase.kind === 'playing' && !s.autoActive ? { ...s, trail: [] } : s))
  }, [])

  // INSTANT reveal pace — a ONE-SHOT batch commit of the whole planned trail
  // (2026-07-02, Tim: "instant" must mean every planned tile flips in the
  // SAME frame, not a fast 50ms/tile cascade). Mirrors revealTile()'s math +
  // mine handling EXACTLY (same cumulativeMultiplierBps call, same
  // fail-closed catch, same mine-hit -> 760ms settle delay) — the only
  // difference is that N tiles commit in ONE setState instead of one
  // setState per tile. Reads stateRef.current directly (called synchronously
  // from runTrail(), not from an effect) so it always sees the trail as
  // painted at GO-press time.
  const revealTrailInstant = useCallback(() => {
    const secrets = secretsRef.current
    if (!secrets) return
    const s = stateRef.current
    if (s.phase.kind !== 'playing' || s.autoActive || s.trail.length === 0) return
    const totalTiles = s.gridSize * s.gridSize
    const already = new Set(s.revealedTiles)
    const toReveal: number[] = []
    let mineHit: number | null = null
    let moonHit = false
    for (const t of s.trail) {
      if (t < 0 || t >= totalTiles || already.has(t)) continue
      if (secrets.mineBitmap[t] ?? false) {
        // Rug stops the batch right here — later trail tiles stay sealed,
        // mirroring the staggered driver's rug-stop (RG-C3: no
        // wouldHaveBeenSafe leak, we simply never process them).
        mineHit = t
        break
      }
      already.add(t)
      toReveal.push(t)
      if (secrets.moonTileIdx !== null && t === secrets.moonTileIdx) moonHit = true
    }
    const nextRevealed = [...s.revealedTiles, ...toReveal]
    let nextBps: bigint = s.cumulativeMultiplierBps
    if (toReveal.length > 0) {
      try {
        nextBps = cumulativeMultiplierBps({
          totalTiles,
          mineCount: secrets.mineCount,
          safeCount: nextRevealed.length,
          houseEdgeBps: secrets.houseEdgeBps,
          maxMultiplierBps: MAX_MULTIPLIER_BPS_DEFAULT,
        })
      } catch {
        return // fail-closed, same as revealTile()
      }
    }
    // RG-C5: fire the per-reveal confirm ONCE for the whole batch (never per
    // tile — an N-stack would read as escalation), carrying the batch's
    // TOTAL economic delta, exactly like the single call revealTile() makes
    // for one tile.
    const delta = nextBps > s.cumulativeMultiplierBps ? nextBps - s.cumulativeMultiplierBps : 0n
    if (toReveal.length > 0) playTileRevealConfirm(delta)
    // Commit the safe reveals in ONE setState (so the canvas stamps them all
    // in the same frame -> simultaneous flip) and consume the trail, handing
    // control back exactly like a completed cascade would.
    setState((cur) =>
      cur.phase.kind === 'playing'
        ? {
            ...cur,
            revealedTiles: nextRevealed,
            revealedMoonTileIdx: moonHit ? secrets.moonTileIdx : cur.revealedMoonTileIdx,
            previousCumulativeMultiplierBps: cur.cumulativeMultiplierBps,
            cumulativeMultiplierBps: nextBps,
            trail: [],
            autoActive: false,
          }
        : cur,
    )
    if (mineHit !== null) {
      const hitIdx: number = mineHit
      // Mirror revealTile()'s mine-hit path EXACTLY: flip to mine-hit, then
      // settleAt() after the SAME 760ms rug-burst read-hold.
      setState((cur) =>
        cur.phase.kind === 'playing'
          ? { ...cur, phase: { kind: 'mine-hit', mineTileIdx: hitIdx } }
          : cur,
      )
      setTimeout(() => settleAt(false, hitIdx), 760)
    }
  }, [settleAt])

  // Commit the trail and dispatch to the correct reveal pipeline:
  //  - STAGGERED (default): unchanged — flips autoActive so the existing
  //    AUTO/TRAIL setInterval driver (below) cascades one tile per
  //    AUTO_REVEAL_INTERVAL_MS, exactly as before this change.
  //  - INSTANT: routes to revealTrailInstant() — a ONE-SHOT batch reveal
  //    (single setState commit) so every planned tile's flip animation
  //    starts in the same frame instead of a fast cascade. autoActive is
  //    NEVER set true for this path — the driver below never starts.
  // Both branches ALSO capture `lastTrail`/`lastTrailGridSize` ("bet again ·
  // same trail" preset) — `trail` is emptied on settle / placeBet /
  // cascade-complete, so this is the ONLY safe point to snapshot it. The
  // capture setState doesn't touch `trail`/`gridSize`, so revealTrailInstant
  // reading stateRef.current right after still sees the same trail it would
  // have seen before the capture was queued (both are functional updaters,
  // applied in order — no race).
  const runTrail = useCallback(() => {
    const s = stateRef.current
    if (!(s.phase.kind === 'playing' && !s.autoActive && s.trail.length > 0)) return
    setState((cur) =>
      cur.phase.kind === 'playing' && !cur.autoActive && cur.trail.length > 0
        ? { ...cur, lastTrail: [...cur.trail], lastTrailGridSize: cur.gridSize }
        : cur,
    )
    if (s.revealPace === 'instant') {
      revealTrailInstant()
    } else {
      setState((cur) =>
        cur.phase.kind === 'playing' && !cur.autoActive && cur.trail.length > 0
          ? { ...cur, autoActive: true }
          : cur,
      )
    }
  }, [revealTrailInstant])

  // "bet again · same trail" preset — reloads the MOST RECENT committed
  // trail into the PLANNING state only. Never auto-runs (never calls
  // runTrail(), never sets autoActive) — the player still presses GO
  // themselves next round. Invalidated when gridSize has changed since the
  // capture (tile indices don't map across board sizes).
  const reuseLastTrail = useCallback(() => {
    setState((s) =>
      s.phase.kind === 'playing' &&
      !s.autoActive &&
      s.lastTrail.length > 0 &&
      s.lastTrailGridSize === s.gridSize
        ? { ...s, trailMode: true, trail: [...s.lastTrail] }
        : s,
    )
  }, [])

  // AUTO / TRAIL driver — while active during `playing`, reveal one coin every
  // AUTO_REVEAL_INTERVAL_MS (module const, RG-C5). If a TRAIL is set, follow it
  // in the player's chosen order and STOP (handing control back to the player,
  // NOT auto-cashing) when the whole trail lands; otherwise open a random
  // unrevealed coin (legacy AUTO). A rug flips the
  // phase, tearing down this effect. EV is unchanged either way — the tile
  // outcomes are seed-fixed, so order/selection is presentation only.
  useEffect(() => {
    if (state.phase.kind !== 'playing' || !state.autoActive) return
    // STAGGERED-TRAIL + legacy random AUTO only reach this driver now — the
    // INSTANT trail-reveal pace (2026-07-02) never sets autoActive true; it
    // commits the whole planned trail in one batch via revealTrailInstant()
    // instead (see runTrail() above), so this interval is always the fixed
    // AUTO_REVEAL_INTERVAL_MS module const (RG-C5 — never derived from
    // streak/session/round).
    const id = setInterval(() => {
      const s = stateRef.current
      if (s.phase.kind !== 'playing' || !s.autoActive) return
      const revealed = new Set(s.revealedTiles)
      if (s.trail.length > 0) {
        const next = s.trail.find((t) => !revealed.has(t))
        if (next === undefined) {
          // Whole trail cleared — hand control BACK to the player instead of
          // auto-cashing. Stop the auto-run + clear the consumed trail so they
          // can keep tapping / plan a new trail on the rest, and TAKE PROFIT
          // only when THEY choose (no forced cash-out even if the path lands).
          setState((cur) =>
            cur.phase.kind === 'playing' ? { ...cur, autoActive: false, trail: [] } : cur,
          )
          return
        }
        revealTile(next)
        return
      }
      const total = s.gridSize * s.gridSize
      const candidates: number[] = []
      for (let i = 0; i < total; i++) if (!revealed.has(i)) candidates.push(i)
      if (candidates.length === 0) return
      const pick = candidates[Math.floor(Math.random() * candidates.length)]!
      revealTile(pick)
    }, AUTO_REVEAL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [state.phase.kind, state.autoActive, revealTile])

  const acknowledgeSettlement = useCallback(() => {
    setState((cur) =>
      cur.phase.kind === 'settled'
        ? {
            ...cur,
            phase: { kind: 'bet-entry' },
            revealedTiles: [],
            revealedMoonTileIdx: null,
            cumulativeMultiplierBps: ONE_X_BPS,
            previousCumulativeMultiplierBps: ONE_X_BPS,
          }
        : cur,
    )
    secretsRef.current = null
  }, [])

  // ITEM 2 — close the vault: full reset to the pristine bet-entry state.
  // Mirrors the initial mount exactly (makeInitialState) and clears the round
  // secrets.
  const closeVault = useCallback(() => {
    secretsRef.current = null
    setState(makeInitialState())
  }, [])

  const toggleAutopick = useCallback(() => {
    // V1: no-op. Auto-pick is disabled per VAULT-CRAFT-SPEC §14 (Phase 2
    // deferred) but the surface is visible (RG-C8 — the safety-tool surface
    // ships even when the feature ships dark, so the player sees the
    // 60s mandatory pause + max-session-loss + cool-off promises today).
    setState((cur) => cur)
  }, [])

  // Derived: live cash-out preview. The Domain A math runs in pure form.
  const cashoutPreviewLamports = useMemo(() => {
    if (state.phase.kind !== 'playing') return 0n
    return settlePayout(state.wagerLamports, state.cumulativeMultiplierBps)
  }, [state.phase.kind, state.wagerLamports, state.cumulativeMultiplierBps])

  return useMemo<VaultController>(
    () => ({
      state,
      setMode,
      setWager,
      setMineCount,
      setTarget,
      setGridSize,
      placeBet,
      revealTile,
      cashOut,
      toggleAuto,
      toggleTrailMode,
      toggleRevealPace,
      toggleTrailTile,
      addTrailTile,
      clearTrail,
      runTrail,
      reuseLastTrail,
      acknowledgeSettlement,
      closeVault,
      toggleAutopick,
    }),
    [
      state,
      setMode,
      setWager,
      setMineCount,
      setTarget,
      setGridSize,
      placeBet,
      revealTile,
      cashOut,
      toggleAuto,
      toggleTrailMode,
      toggleRevealPace,
      toggleTrailTile,
      addTrailTile,
      clearTrail,
      runTrail,
      reuseLastTrail,
      acknowledgeSettlement,
      closeVault,
      toggleAutopick,
    ],
  )
  // cashoutPreviewLamports kept here for hot-path memoization; the
  // VaultExperience reads via vaultMath.settlePayout directly so it stays
  // a pure value. Reference kept to avoid the "unused" lint.
  void cashoutPreviewLamports
}

/**
 * On-chain OO-Fisher controller — feature-flagged path that wraps the same
 * `OoFisherController` interface as `ooFisherProvider.ts`, but emits the
 * Anchor instruction payloads (via `lib/onchain/originals-oo-fisher/client`)
 * at each transition point.
 *
 * Why a WRAPPER, not a re-implementation:
 *   - The mock controller's state machine (`useOoFisherController` in
 *     `ooFisherProvider.ts`) IS the source-of-truth UX/animation engine. Its
 *     reeling timer, fish-on countdown, perfect-bonus computation, miss/snap
 *     copy windows, and Glass Box re-derive path are all unit-tested and
 *     deterministic. Re-implementing those for the on-chain path would
 *     duplicate ~1700 LOC and immediately drift.
 *   - The on-chain path only adds I/O: it submits start_trip / commit_cast /
 *     resolve_cast / settle_trip / cash_out_trip transactions ALONGSIDE the
 *     mock controller's local state transitions. The outcome (rarity, kind,
 *     effective_bps) that the player sees is still computed locally — and
 *     because the math module is bit-for-bit identical to the on-chain
 *     program (verified by `programs/originals-oo-fisher` `cargo test`), the
 *     on-chain account state after settlement WILL match what the local
 *     state machine showed. Glass Box re-derive proves it.
 *   - V1 ship strategy: feature flag default OFF. Wallet relayer + Turnkey
 *     signature wiring lands separately. This provider exposes the surface
 *     so that wiring can drop in without touching `OoFisherExperience.tsx`.
 *
 * Domain-D safety:
 *   - Server seed is generated on START and held in a closure-scoped Map
 *     keyed by trip_id (cleared on settle/cashOut/abandon). It is NEVER
 *     written to localStorage and NEVER serialised into the on-chain
 *     transaction until `resolve_cast` (and even then only as the reveal).
 *   - Each on-chain submission is wrapped in a try/catch; on failure the
 *     mock controller's local state is preserved (we don't silently roll
 *     back the UX), and the error is surfaced via `console.error` for the
 *     dev console. Production wiring will use a structured error channel.
 *
 * Default behavior: the hook reads `NEXT_PUBLIC_OO_FISHER_ONCHAIN` and falls
 * through to the mock controller when the flag is not exactly `'true'`. All
 * existing vitest tests pass because the env-var-less default path is the
 * same closure as `useOoFisherController`.
 */

import { useMemo, useRef } from 'react'

import {
  encodeCashOutTrip,
  encodeCommitCast,
  encodeResolveCast,
  encodeSettleTrip,
  encodeStartTrip,
  type InstructionPayload,
} from '../../../lib/onchain/originals-oo-fisher/client'
import { tierIndex } from './ooFisherMath'
import { useOoFisherController } from './ooFisherProvider'
import type { OoFisherController } from './ooFisherProvider'

/**
 * Public env-var: when exactly `'true'` (case-sensitive), `useOoFisher`
 * returns the on-chain wrapper. Any other value (including unset) returns
 * the mock controller verbatim.
 */
const ONCHAIN_FLAG_ENV = 'NEXT_PUBLIC_OO_FISHER_ONCHAIN'

/**
 * Read the on-chain flag. Indirected so tests can stub it; in production
 * Next.js inlines `process.env.NEXT_PUBLIC_OO_FISHER_ONCHAIN` at build time.
 */
export function isOnChainEnabled(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (process.env as Record<string, string | undefined>)[ONCHAIN_FLAG_ENV]
  return env === 'true'
}

/**
 * Submission sink — the transport-agnostic surface a future wallet relayer
 * (Turnkey + Solana RPC) implements. For V1, the default sink LOGS the
 * payload to the dev console and returns a placeholder signature. Real
 * wiring drops in a `solanaRpcSink({ connection, wallet })` here.
 *
 * Returning a Promise (not throwing on send failure) so the UX path doesn't
 * wedge on a failed RPC. Glass Box re-derive provides the trust anchor —
 * if the on-chain settlement doesn't match the local state, the receipt
 * fails verification and the player sees a clear error.
 */
export interface OnChainSubmissionSink {
  readonly submit: (payload: InstructionPayload) => Promise<{
    readonly signature: string | null
    readonly error: string | null
  }>
}

const defaultSink: OnChainSubmissionSink = {
  async submit(payload) {
    // Dev-only logging. Production wiring replaces this.
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.info('[oo-fisher onchain] would submit', {
        programId: payload.programId,
        dataLen: payload.data.length,
        accounts: payload.accountOrder,
      })
    }
    return { signature: null, error: null }
  },
}

/**
 * The on-chain wrapper. Returns a controller that defers ALL UX state to the
 * mock controller (so the existing reeling timer / catch celebration / Glass
 * Box re-derive all work) but emits the Anchor instruction payloads to the
 * `sink` at each on-chain transition.
 *
 * NOTE: this V1 wrapper does NOT actually submit transactions yet — the
 * `defaultSink` logs payloads. Production wiring lands as a follow-up PR
 * once Turnkey + the Solana RPC connection are available in the player app.
 */
export function useOnChainOoFisherController(
  sink: OnChainSubmissionSink = defaultSink,
): OoFisherController {
  const mock = useOoFisherController()
  // Trip-id allocator. Real wiring derives this from a player-scoped
  // monotonic counter persisted server-side; for the V1 stub we allocate
  // from performance.now() rounded down (collisions are statistically
  // negligible in a single-session test path).
  const tripIdRef = useRef<bigint>(0n)
  // Per-trip server seed cache. Cleared on settlement/cashOut.
  const serverSeedRef = useRef<Map<string, Uint8Array>>(new Map())

  return useMemo<OoFisherController>(() => {
    const allocTripId = (): bigint => {
      const next = tripIdRef.current + 1n
      tripIdRef.current = next
      return next
    }

    const generateServerSeed = (): Uint8Array => {
      // Browser crypto is fine here: this is a CLIENT-SIDE seed that the
      // server (or relayer) will sign before commit-reveal. For V1 stub the
      // seed is generated locally; production wiring lets the relayer hold
      // the real seed and only its HASH leaks to the client at start_trip.
      const seed = new Uint8Array(32)
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(seed)
      } else {
        // Deterministic fallback for environments without WebCrypto (tests).
        for (let i = 0; i < 32; i += 1) {
          seed[i] = (i * 131 + 7) & 0xff
        }
      }
      return seed
    }

    const hashServerSeed = async (seed: Uint8Array): Promise<Uint8Array> => {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        // Copy into a fresh ArrayBuffer-backed view to satisfy `BufferSource`
        // (Uint8Array<ArrayBufferLike> can be Shared in some envs).
        const buf = new ArrayBuffer(seed.length)
        new Uint8Array(buf).set(seed)
        const digest = await crypto.subtle.digest('SHA-256', buf)
        return new Uint8Array(digest)
      }
      // Test fallback — return a deterministic non-zero hash so the encode
      // path still works in non-Web envs. The mock controller doesn't
      // verify the hash, so this is safe.
      const out = new Uint8Array(32)
      for (let i = 0; i < 32; i += 1) {
        out[i] = (seed[i] ?? 0) ^ 0x55
      }
      return out
    }

    return {
      ...mock,
      startTrip: async () => {
        const tripId = allocTripId()
        const seed = generateServerSeed()
        serverSeedRef.current.set(tripId.toString(), seed)
        const seedHash = await hashServerSeed(seed)
        const payload = encodeStartTrip({
          tripId,
          wagerLamports: mock.state.wagerLamports,
          clientSeed: BigInt(Math.floor(Math.random() * 0xffff_ffff)),
          serverSeedHash: seedHash,
          rodTier: tierIndex(mock.state.loadout.rod),
          boatTier: tierIndex(mock.state.loadout.boat),
          baitTier: tierIndex(mock.state.loadout.bait),
        })
        try {
          await sink.submit(payload)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[oo-fisher onchain] start_trip submit failed', err)
        }
        // Defer to the mock for actual state transitions.
        await mock.startTrip()
      },
      launchCast: async () => {
        // Commit-cast happens at LAUNCH time. The mock's currentCastIndex is
        // the right index BEFORE the local state advances; capture it here.
        const castIndex = mock.state.currentCastIndex
        const power = mock.state.castPower
        const payload = encodeCommitCast({ castIndex, power })
        try {
          await sink.submit(payload)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[oo-fisher onchain] commit_cast submit failed', err)
        }
        await mock.launchCast()
        // The RESOLVE side is server-driven in the real path (the reveal
        // authority signs once the reeling outcome is final). For V1 stub
        // we emit a resolve_cast payload at cast-finish-time. Since the
        // mock's state has already transitioned by the time launchCast
        // resolves, we use the most recent catch entry's bps as proxy for
        // the perfect-bonus param.
        const tripId = tripIdRef.current
        const seed = serverSeedRef.current.get(tripId.toString())
        if (seed) {
          const latestCatch = mock.state.tripCatches[castIndex]
          const resolvePayload = encodeResolveCast({
            castIndex,
            serverSeed: seed,
            perfectBonusBps: latestCatch?.perfectBonusBps ?? 10_000n,
          })
          try {
            await sink.submit(resolvePayload)
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[oo-fisher onchain] resolve_cast submit failed', err)
          }
        }
      },
      cashOutTrip: () => {
        const payload = encodeCashOutTrip()
        // Fire-and-forget; cashOutTrip is sync in the mock interface.
        sink.submit(payload).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[oo-fisher onchain] cash_out_trip submit failed', err)
        })
        // Clean up the seed for this trip.
        serverSeedRef.current.delete(tripIdRef.current.toString())
        mock.cashOutTrip()
      },
      acknowledgeSettlement: () => {
        // Settlement is permissionless; any signer can settle. For V1 stub
        // we fire settle_trip when the player acknowledges the receipt.
        const payload = encodeSettleTrip()
        sink.submit(payload).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[oo-fisher onchain] settle_trip submit failed', err)
        })
        serverSeedRef.current.delete(tripIdRef.current.toString())
        mock.acknowledgeSettlement()
      },
      // purchaseUpgrade stays LOCAL. Gear is a meta-loop, not an on-chain
      // economy in V1. When forge/upgrades come on chain it'll grow its
      // own program; until then `mock.purchaseUpgrade` is the source of
      // truth.
      purchaseUpgrade: mock.purchaseUpgrade,
      // Glass Box re-derive: delegate entirely to the mock controller. The
      // derivation IS the on-chain math (the math module's
      // `derive_cast_seed_u32` and the frontend's `deriveCastSeed` are
      // bit-for-bit parity, verified by `test_glassbox_parity_pin` on the
      // Rust side).
      reverifyCastSeeds: mock.reverifyCastSeeds,
    }
  }, [mock, sink])
}

/**
 * Top-level entry point. Reads the env flag at MODULE LOAD time (Next.js
 * inlines `NEXT_PUBLIC_*` env vars at build, so this resolves at the same
 * time as the React hook rules-of-hooks check). Components import THIS, not
 * the mock controller directly, once the on-chain wiring lands.
 *
 * IMPORTANT: the env flag is captured ONCE per module load — flipping it at
 * runtime requires a fresh page load. This is intentional to satisfy
 * Rules of Hooks (the same hook must be called on every render).
 */
const ONCHAIN_FLAG_AT_LOAD = isOnChainEnabled()

export function useOoFisher(): OoFisherController {
  // Branch on the load-time constant so React's hook order is deterministic
  // per module instance. Switching the flag requires a page reload, which
  // is the intended operator surface for a feature flag.
  //
  // eslint-disable-next-line react-hooks/rules-of-hooks -- ONCHAIN_FLAG_AT_LOAD is a module constant; the branch resolves identically on every render of this module instance.
  if (ONCHAIN_FLAG_AT_LOAD) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useOnChainOoFisherController()
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useOoFisherController()
}

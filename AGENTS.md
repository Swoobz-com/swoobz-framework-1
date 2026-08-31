# AGENTS.md — Swoobz Originals game framework

Guidance for agents working on the **Swoobz Originals** games in this repo. Read this
before touching any game: it tells you how to *read* the framework, how a game is
*built*, and how to *implement a game in a new ecosystem* (embed / port).

**Scope.** The reference games are **`assay`** (Abyss Line), **`pulse`**,
**`vault`** (Rug or Riches), and **`oo_fisher`** (Rich Fisherman). `oo_rei` is
**out of scope** for this document — do not treat it as a reference pattern.

> This export ships the **client** of each game. On-chain Rust programs and the real
> audio/wallet backends are represented here by **shims** (see §4, §6). "Works in the
> harness" ≠ "wired to a real backend" — keep that distinction in every report.

---

## 1. How to read the framework (start here)

Read in this order — you'll understand any game in four files:

1. **`originals/<game>/<game>Math.ts`** — the pure money engine (RTP, ladders, BigInt
   arithmetic). No React, no DOM. This is ground truth for payouts.
2. **`originals/<game>/<game>Provider.ts`** — the state machine + settlement, exposed as
   a `use<Game>Controller()` React hook. Defines the `Phase`, `Outcome`, `State`,
   `Controller` contracts.
3. **`originals/<game>/<game>Audio.ts`** — zero-parameter `play*()` SFX functions with
   module-const timings (RG-C5, see §3).
4. **`originals/<game>/<Game>Experience.tsx`** (+ `*Canvas.tsx`) — the React UI/skin and
   the per-frame canvas. The largest, most harness-coupled layer.

Then look at **`<game>-run/`** (the sibling Vite harness at repo root) to see how it's
mounted and served (§5).

**Golden rule for correctness work:** every math module ends with a self-check
(`mirrorRoundtripCheck()` or equivalent) that runs *at module load* and **throws on
constant drift**. If you change a payout constant, that gate — and the `*.test.ts` +
Monte-Carlo harness — must stay green. The settlement "Glass Box" receipt re-derives
payouts client-side using these same functions, so drift breaks provable fairness, not
just a test.

---

## 2. Repo layout

```
originals/
  _shared/            shared framework — small; mostly SHIMS in this export (§4)
    audio/            no-op audio API surface (real impl = Howler + Kenney)
    BetConsole/       the one real shared UI primitive (the bet surface)
    onboarding/       no-op tutorial-overlay shim + per-game tutorial data
  assay/              Abyss Line  (self-contained: imports nothing from _shared)
  pulse/              Pulse       (crash-curve; deepest engagement layer)
  vault/              Rug or Riches (Mines; uses _shared/BetConsole)
  oo_fisher/          Rich Fisherman (grind loop; 3D; has the on-chain DI seam)
  oo_rei/             OUT OF SCOPE — ignore for this doc

assay-run/  pulse-run/  vault-run/  oo-fisher-run/
                        standalone Vite + React 18 harnesses (one per game)
```

A game lives in `originals/<game>/`; its runnable app lives in `<game>-run/`. The run
folder imports the Experience directly from `originals/<game>/` (except `pulse-run`, see
§5) — there is no build step in between.

> Run folders also accumulate ad-hoc `_*.mjs` Puppeteer QA probes and `vite-*.log`
> files (esp. `assay-run/`, `vault-run/`). Those are **not** part of the harness — ignore
> them when learning the structure.

---

## 3. How a game is built — the anatomy & the disciplines

### 3.1 The four-file quartet + naming

Naming is consistent across all four games (camelCase logic, PascalCase TSX):

| Role | File | Exports (the contract) |
|---|---|---|
| Money engine | `<game>Math.ts` | pure BigInt payout/RTP fns + a load-time drift self-check |
| State machine | `<game>Provider.ts` | `<Game>Phase`, `<Game>Outcome`, `<Game>State`, `<Game>HistoryRow`, `<Game>Controller`, `use<Game>Controller()` |
| Sound | `<game>Audio.ts` | zero-param `play*(): void` + module-const `HZ/VOL/MS` |
| UI / skin | `<Game>Experience.tsx` (+ `<Game>*Canvas.tsx`) | `export function <Game>Experience(): ReactElement` — **zero props** |
| Tests | `<game>Math.test.ts`, `<game>Provider.test.tsx` | vitest |

Concrete anchors:
- assay: `assayMath.ts`, `assayProvider.ts` (`useAssayController` ~:316), `assayAudio.ts`,
  `AssayExperience.tsx` (`export function AssayExperience()` ~:583), `AssayGridCanvas.tsx`,
  plus a standalone Monte-Carlo `assaySim.mjs`.
- pulse: `pulseMath.ts`, `pulseProvider.ts` (`usePulseController` ~:411), `pulseAudio.ts`,
  `PulseExperience.tsx` (~:233), `PulseCurveCanvas.tsx`; deepest engagement layer
  (`pulseRank.ts`, `pulseRewards.ts`, `pulseCosmetics.ts`, `pulseOwnershipPoints.ts`).
- vault: `vaultMath.ts`, `vaultProvider.ts` (`useVaultController` ~:491), `vaultAudio.ts`,
  `VaultExperience.tsx` (~:491, largest at ~8k lines), `VaultGridCanvas.tsx`,
  `vaultCopy.ts`, `vaultLedger.ts`, `vaultSignatures.ts`.
- oo_fisher: `ooFisherMath.ts`, `ooFisherProvider.ts` (`useOoFisherController` ~:572),
  **`onChainOoFisherProvider.ts`** (the DI seam — the Experience imports `useOoFisher()`
  from here), `ooFisherAudio.ts`, `OoFisherExperience.tsx` (~:292), a 3D stack
  (`OoFisher3DScene/Fish/Scenery`, `ooFisher3DHexGrid.ts` via `three` + `@react-three/fiber`).

### 3.2 Domain A — money math discipline (do not violate)

Every `<game>Math.ts` states the same rules (see the header block, e.g. `vaultMath.ts:11`,
`assayMath.ts:13`):

- **No IEEE-754 floats in any payout path.** All monetary values are `bigint`.
- **Basis-point rational arithmetic.** `ONE_X_BPS = 10_000n`; multipliers in bps.
  USDC is 6-decimal lamports (`1 USDC = 1_000_000n`).
- **Floor-toward-zero, house-favored truncation, documented per call.** e.g.
  `settlePayout = (wager * bps) / ONE_X_BPS` (`vaultMath.ts` ~:203).
- **Fail-closed** on out-of-range inputs (throw or safe default, never a silent guess).
- **~96.5% RTP target.** assay is flat-by-construction `TARGET_RTP_BPS = 9650` across all
  tiers; vault ~3% edge (`HOUSE_EDGE_BPS_DEFAULT = 300n`, per-mode); pulse 450 bps;
  oo_fisher tuned to ~96% via Monte-Carlo.
- **Watch where flooring happens.** assay floors **once** at the end of the ladder (a
  per-step floor there breaks RTP — see `assayMath.ts` header ~:32); vault floors
  **per safe tile** (Mines-canon). They are not interchangeable — respect each game's model.

### 3.3 Provably fair (Glass Box)

Outcomes carry the verification payload: `serverSeedHex`, `serverSeedHashHex`,
`roundIdHex`, and the board bitmap (assay `AssayOutcome` ~:76; vault `VaultOutcome` ~:76).
Boards are derived by **SHA-256 + Fisher-Yates** keyed on a 32-byte per-round
`serverSeed`, **domain-separated** by tier/mode (assay tag `ASSAYVEIN:<tierId>`,
`deriveBombBitmap` ~:230). Pulse derives its crash point via `deriveCrashBps(outcomeWord)`
(inverse-CDF, ~:186). The settlement receipt **re-derives** the result client-side using
these same functions — so the math module is the single source of truth for both play and
verification.

### 3.4 The self-check gate + verification harness

- **Load-time drift gate:** each math file ends with a `mirrorRoundtripCheck()` that runs
  on import and throws on any golden-vector / RTP-band mismatch (assay ~:336 checks the
  RTP band `[9600, 9700]` per tier; vault ~:288 checks canonical Rust reference values;
  oo_fisher ~:1243 checks caps/costs). Where a game mirrors an on-chain Rust program
  (vault mirrors `mines_math.rs`; pulse mirrors the chain crash fn), these vectors keep
  the client bit-identical to the chain.
- **Monte-Carlo:** assay ships `assaySim.mjs` (`node assaySim.mjs [trials]`); oo_fisher has
  an in-module `simulateFisherRtp()` feeding a `publishedFisherRtp()` disclosure.
- **Tests:** vitest `*.test.ts(x)` per game (pulse has the most — theme, projection, rank,
  rewards, cosmetics, ownership-points, layout). Only `assay-run` wires vitest in its own
  `vite.config.ts`; run the others' tests from wherever vitest is configured.

### 3.5 RG-C5 (responsible-gambling) structural rules — enforced in code

- **Zero-parameter audio fns.** Every `play*(): void` takes no args, so celebration
  amplitude *cannot* scale with streak/session value. (The only parameterized audio fn in
  the reference set is `ooFisherAudio.playPowerCharge(chargeFraction)` — input-driven
  charge, not a reward.)
- **Module-const timings/amplitudes.** All `HZ/VOL/MS/duration` are top-level
  `export const … as const`; provider animation intervals too (e.g. assay
  `CASCADE_INTERVAL_MS = 90`). Never make a celebration's timing/size depend on the win
  amount.
- **Identical fanfare regardless of value.** The success feedback is the same whether the
  win is 2× or 400×; only the displayed number differs.
- **Brand tokens.** Skins carry a small palette token set (the `BetConsoleTheme` object,
  4-6 tokens); Geist + Geist Mono are the fonts. Respect each game's rule-of-three /
  accent economy (e.g. Abyss: cyan = player, gold = value, red = danger).

When you edit audio, timing, or celebration code, keep these structural properties — the
`swoobz-rg-c5-qa` gate re-derives them from the live source.

---

## 4. The shared framework (`originals/_shared/`)

Small, and in this export **mostly shims**. Know exactly what's real vs stubbed:

- **`_shared/audio/index.ts` — NO-OP SHIM.** API surface only. Real impl preloads Kenney
  CC0 samples via Howler; here `isSampleLoaded()/isSfxLoaded()` return **`false`**, which
  forces each game's built-in WebAudio *synth* fallback. Contract to satisfy in a real
  host: `interface SfxRegistration { id: string; sources: string[]; volume?: number }`
  (~:10), plus `useSwoobzAudio(manifest)`, `useSwoobzMusic(track, opts)`, `playSfx(id)`,
  `unlockAudioOnFirstGesture()`. **Consequence:** placing audio files (see the per-game
  `used-assets/` folders) makes them *serve* (HTTP 200) but **not audible** until a real
  audio pipeline replaces this shim — always report that caveat.
- **`_shared/BetConsole/BetConsole.tsx` — REAL.** The one shared UI primitive: the canonical
  betting surface. `interface BetConsoleTheme` (~:28) is the per-game **skin token
  contract** (fonts, surfaces, trim, text tiers, accent, money, danger, radius);
  `interface BetConsoleProps` (~:70) is the wiring (wagerDisplay, stepDown/Up, presets,
  activeWager, onPreset, toWin?, commit). Carries the WCAG touch-target + AA-contrast
  discipline. **Only `vault` consumes it** today.
- **`_shared/onboarding/` — SHIM.** `OnboardingOverlay` returns `null`, `useOnboardingState`
  is always-hidden; per-game tutorial *data* lives in
  `onboarding/games/{pulse,vault,oo-fisher}-onboarding.ts`.

**There is no shared `Provider`/`Experience` base interface.** The cross-game quartet
(§3.1) is a **convention**, not an inherited type. The only shared *typed* contract is
`BetConsoleTheme`/`BetConsoleProps`. RTP/RG disciplines are **replicated per game**, not
centralized — when you fix one, check whether the sibling games need the same fix.

**Inconsistency to remember:** `assay` imports **nothing** from `_shared` (fully
self-contained — own bet entry, own audio). vault/pulse/oo_fisher use `_shared/audio` +
`_shared/onboarding`; only vault uses `_shared/BetConsole`.

---

## 5. The run harness pattern (`<game>-run/`)

Each is a private **Vite + React 18** app. Scripts: `dev: vite`, `build: vite build`,
`preview: vite preview` (assay adds `typecheck` + `test: vitest run`). `index.html` loads
Geist + Geist Mono and mounts `<div id="root">` + `/src/main.tsx`.

**Mount convention** — `src/main.tsx` does:
```ts
import { AssayExperience } from '../../originals/assay/AssayExperience'
createRoot(el).render(<StrictMode><AssayExperience /></StrictMode>)
```
The Experience takes **no props** — the harness *is* the mount; there is no
`mount(el, config)` API yet.

| Runner | Port | Notes |
|---|---|---|
| `assay-run` | **5182** | `server.fs.allow: ['..']`; wires vitest (`../originals/assay/**/*.test.ts`, `environment: 'node'`) |
| `pulse-run` | **5180** | `base: './'`; alias `next/navigation`→shim; **two entries**: `index.html` (a separate "candle crash" rebuild) + `full-pulse.html` (the framework game) |
| `vault-run` | **5281** | alias `next/navigation`→shim; `fs.allow: ['..']` |
| `oo-fisher-run` | **5182** | defines `process.env`; `dedupe: ['react','react-dom','three','@react-three/fiber']`; aliases `next/dynamic`, `next/navigation`, and the on-chain client → shims |

**Host shims** a game needs live in `<run>/src/shims/`:
- `next-navigation.ts` — stubs `useRouter/usePathname/useSearchParams` (pulse, vault, oo_fisher).
- `next-dynamic.ts` — `next/dynamic` → `React.lazy` + `Suspense` (oo_fisher, for the 3D scene).
- `oo-fisher-onchain-client.ts` — stubs the Anchor instruction encoders (oo_fisher).

**Harness gotchas / inconsistencies:**
1. **`assay-run` and `oo-fisher-run` both use port 5182** — they can't run at once. Change
   one port if you need both.
2. **`pulse-run` is the odd one out:** it does **not** import from `originals/pulse`. It
   bundles a **byte-identical copy** of the game under `pulse-run/src/framework/pulse/`
   (+ `.../_shared/`). Its default page is a separate candle rebuild; the framework game
   is the secondary `full-pulse.html` entry. If you edit `originals/pulse`, that copy does
   **not** update automatically — reconcile deliberately.
3. Only `assay-run` wires vitest.

To run a game: `cd <game>-run && npm run dev`, then open the port above. In this
environment the dev server may report "killed" while still serving — verify with an HTTP
check rather than assuming it's down, and avoid stacking zombie Vite servers (kill stale
node processes and keep one instance per port).

---

## 6. Implementing a game in a new ecosystem (embed / port)

### 6.1 What's portable vs host-coupled

**Portable core (no DOM, no harness) — reuse as-is:**
- `<game>Math.ts` — pure BigInt; the only Web dep in the payout path is `crypto.subtle`
  in the *provider's* seed derivation, not in the math. Usable client- or server-side.
- `<game>Provider.ts` — React hooks but framework-agnostic logic; the state machine +
  settlement live here.
- The exported types (`*Phase`, `*Outcome`, `*State`, `*Controller`, `*HistoryRow`).

**Host-coupled — the integrator must supply these:**
- **Mounting.** No `mount(el, config)` seam: a host embeds by rendering the zero-prop
  `<XExperience/>` into its own container (replacing `main.tsx`).
- **Wager / balance / RNG.** Today these are **internal mock state** in each provider
  (`makeInitialState`, e.g. `INITIAL_BALANCE = 1_000_000_000n`), **not injected**. A real
  host must supply real balances, wagers, and settlement.
- **Audio.** `_shared/audio` is a no-op shim. Provide the real
  `useSwoobzAudio/useSwoobzMusic/isSampleLoaded/…` (Howler + a Kenney manifest matching
  `SfxRegistration`) — or keep the synth fallback and accept no sampled audio.
- **Asset serving.** assay imports art via bundler URL
  (`import abyssBgUrl from './assets/…svg'`); vault/pulse/oo_fisher read audio/music from
  `used-assets/**` served from `public/`. Provide an asset base path / bundler that
  resolves these.
- **Next.js stubs.** pulse & oo_fisher import `next/navigation`; oo_fisher also
  `next/dynamic`. A non-Next host must alias these (copy the run shims).
- **3D deps.** oo_fisher needs `three` + `@react-three/fiber`.

### 6.2 The dependency-injection seam to follow — `oo_fisher`

`onChainOoFisherProvider.ts` is the one first-class DI boundary in the reference set, and
it's the model for wiring any game to a real backend:

- `interface OnChainSubmissionSink { submit(payload: InstructionPayload): Promise<{ signature, error }> }`
  (~:84) — a transport-agnostic wallet/RPC surface; `defaultSink` just logs.
- `useOnChainOoFisherController(sink = defaultSink)` (~:116) **wraps** the mock controller
  (spreads `...mock`) and emits Anchor payloads at each transition
  (`start_trip / commit_cast / resolve_cast / settle_trip / cash_out_trip`) while the
  local state machine stays the UX source of truth.
- Feature-flagged by `NEXT_PUBLIC_OO_FISHER_ONCHAIN` (`isOnChainEnabled()`), branched once
  at module load inside `useOoFisher()` (~:281) — which is what the Experience actually imports.

**Pattern:** keep the pure provider as the local UX truth; wrap it with a controller that
takes an injected `Sink`; emit backend calls at transitions; feature-flag on/off. assay,
vault, and pulse do **not** have this seam yet — to make them real-money you'd introduce
the same injection point (a `Sink` + a wrapping controller) rather than editing the mock
provider's internals.

### 6.3 Integrator checklist (embed a game in a new host)

1. Render the zero-prop `<XExperience/>` into your container.
2. Provide a real `_shared/audio` implementation (or keep the synth-fallback shim).
3. Alias `next/navigation` (all but assay) and `next/dynamic` (oo_fisher).
4. Serve `used-assets/**` and resolve bundler URL asset imports.
5. Inject wager/balance/RNG + settlement — for on-chain, an `OnChainSubmissionSink`
   (oo_fisher has the seam; assay/vault/pulse need one added).
6. Add `three` + `@react-three/fiber` for oo_fisher.
7. Keep the math self-check + tests + Monte-Carlo green; the Glass Box receipt re-derives
   payouts from the same math, so any drift breaks verification.

### 6.4 Wiring real audio (replacing the no-op shim)

In this export the games are audible only via each game's built-in WebAudio **synth
fallback**, because `_shared/audio/index.ts` is a no-op shim whose `isSampleLoaded()` /
`isSfxLoaded()` return `false`. The sampled `.ogg` files exist and *serve* (each game's
`used-assets/` folder + `public/assets/**`), but they are **not fetched or played** until
you replace the shim with a real implementation. Do this to make sampled audio play:

**The contract to implement** (`_shared/audio/index.ts`, keep the exact signatures):
- `interface SfxRegistration { id: string; sources: string[]; volume?: number }` and
  `interface MusicRegistration { id: string; sources: string[] }` — the game's audio file
  already exports an `AUDIO_MANIFEST` of these, with `sources` pointing at the
  `used-assets/**` paths.
- `useSwoobzAudio(manifest)` — preload each registration (Howler is the intended player:
  one `Howl` per `id` from its `sources`, at `volume`).
- `useSwoobzMusic(track, opts)` — load + loop the music track at its volume.
- `isSampleLoaded(id) / isSfxLoaded(id)` — return **`true` once the Howl for `id` is
  loaded** (this is the switch that turns the synth fallback off and the sample on).
- `playSfx(id)` — `howl.play()` for that id.
- `unlockAudioOnFirstGesture()` — on the first pointer/keydown, resume the AudioContext /
  `Howler.ctx` (browser autoplay policy) so the first sound isn't swallowed.

**Steps for an integrator:**
1. Implement the module above with Howler (add `howler` to the host's deps).
2. Serve `used-assets/**` (or `public/assets/**`) so the manifest `sources` resolve; the
   file list + provenance is in each game's `used-assets/MANIFEST.md`.
3. Call `unlockAudioOnFirstGesture()` from the host once, on first user input.
4. Leave the game code untouched — the games already call `useSwoobzAudio(AUDIO_MANIFEST)`
   and `play*()`; flipping `isSampleLoaded` to `true` is what routes them from synth to sample.

**Must-keep constraints:**
- **RG-C5 stays intact.** The real impl must not scale amplitude/timing by streak or win
  value — `play*()` stays zero-parameter and volumes stay module-const. Do not add a
  "bigger win = louder/longer" path.
- **Licensing.** Kenney SFX are CC0 (no obligation). The **CC-BY music tracks require
  visible attribution on a credits surface before public release** — currently "Lazy Day"
  (oo_fisher) and 5 tracks in oo_rei; see each `used-assets/MANIFEST.md`.
- **Verify** by playing the game and confirming the `used-assets` files return HTTP 200
  and *fire* on their triggers (network tab), i.e. sampled audio, not the synth fallback.

---

## 7. Per-game quick reference

| Game | Slug / folder | Mechanic | Money model | Special deps | DI seam |
|---|---|---|---|---|---|
| Abyss Line | `assay` | pre-picked trail, forced reveal, mines-bust | flat 96.5% RTP, single-floor ladder, 3 depth tiers | none — self-contained, own audio, no `_shared` | none yet |
| Pulse | `pulse` | crash curve (cash out before the crash) | 450 bps edge, inverse-CDF crash, EV-neutral engagement layer | `next/navigation` | none yet |
| Rug or Riches | `vault` | Mines (pick safe tiles, avoid rugs) | per-step floor, 3 modes, mirrors Rust `mines_math.rs` | `_shared/BetConsole`, `next/navigation` | none yet |
| Rich Fisherman | `oo_fisher` | grind loop (rod/boat/bait, casts→depth→rarity) | ~96% via Monte-Carlo, hard multiplier cap | `three` + R3F, `next/navigation`, `next/dynamic` | **yes** (`onChainOoFisherProvider.ts`) |

---

## 8. Working rules for agents

- **Change money constants → keep the self-check, `*.test.ts`, and Monte-Carlo green**,
  and remember the Glass Box receipt re-derives from the same functions.
- **Presentation vs money:** most UI/juice bugs are display-only. Before "fixing" a payout,
  prove whether the *math* is wrong (it usually isn't) — a display bug must not touch
  `<game>Math.ts` / settlement.
- **RG-C5 is structural:** zero-param audio, module-const timings, value-independent
  celebration. Don't regress these when editing audio/animation.
- **Disciplines are per-game, not shared:** a fix in one game often applies to its
  siblings — check them.
- **`pulse-run` bundles its own copy** of the game — edits to `originals/pulse` don't
  propagate there automatically.
- **Ports:** assay-run 5182, pulse-run 5180, vault-run 5281, oo-fisher-run 5182 (clashes
  with assay-run). Verify a dev server with an HTTP check; don't stack zombie Vite servers.
- **Assets are additive:** each game keeps a `used-assets/` folder + `MANIFEST.md`
  cataloguing the files it actually references (with provenance). Placing audio there makes
  it serve, not play, until a real audio pipeline replaces the `_shared/audio` shim.
- **`oo_rei` is out of scope** for this framework doc — don't cite it as a pattern.

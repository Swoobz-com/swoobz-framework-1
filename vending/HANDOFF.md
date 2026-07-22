# HANDOFF — AUTOMAT (originals/vending) · for the next Fable 5 session

**Status at handoff (2026-07-22): 3-machine build, LIVE-VERIFIED. RONIN REMOVED.**
Tim's decision 2026-07-22: "remove the ronin vending machine we dont need that
for now" — machine #4 was fully unwired same day (codotty, orchestrator-verified:
typecheck green, 37/37 vitest, vendingMath+vendingAudio hash-identical, grep
sweep 0 ronin hits in active code, live 3-machine probe with viewed frames in
`vending-run/shots-3machine-restore/`). Turntable is back to 3×120°.
**Reversal is a copy-back**: pre-removal versions of all touched files live in
`_parked-ronin-20260722/` (as `.bak` — rename to `.ts/.tsx` and restore; the
tsconfig includes originals/vending recursively, so parked code must stay
`.bak`). Ronin assets (mural/panel/room/roster webp's), `_qa-ronin.mjs`,
`_gen-ronin-art.cjs` and `shots-ronin/` were left on disk, unreferenced.
Section 8 below describes the REMOVED machine (kept as the reversal map);
Tim's standalone Armory demo `streetfighter/pack-machine/` is untouched and
remains the style reference of record.

Read this FIRST before touching this game, then `README.md` (math/RG story),
`AUTOMAT-DOODLE-SKIN-SPEC.md` (art direction of record) and the three asset
MANIFESTs under `used-assets/`. Repo-wide context: `../../HANDOFF.md` + `../../AGENTS.md`.
If the task touches the RONIN machine's style, the reference of record is Tim's
standalone Armory demo `streetfighter/pack-machine/` (own HANDOFF.md) — he
explicitly asked to KEEP that look and effect set.
User is **Tim** (writes Dutch/English mixed; reply in Dutch). He art-directs by
dropping references in `input/vending/` — when he names something ("check packref",
"collector ref"), FIND AND VIEW IT there before acting; videos get frames extracted
with ffmpeg (`fps=2,scale=520:-1`).

Working dir: `C:\Users\Erstr\OneDrive\Bureaublad\swoobz-games-export\swoobz-games-export`
Run: `cd vending-run && npm run dev` → **port 5283 (strictPort, the operator/Tim port)**.
Gates: `npm run typecheck` · `npm test` (37/37) · `node ..\originals\vending\vendingSim.mjs 2000000`.

---

## 1. What this game IS (one paragraph)

A Swoobz Original: THREE vending machines on a rotating 3D turntable —
EASY·TIDE / MEDIUM·STORM / HARD·OBSIDIAN (a fourth, RONIN ZERO, existed
2026-07-20→22 and is parked; section 8). The player buys 1..20 multiplier packs in one purchase;
packs physically vend (coil-helix spin → fall inside the glass → hidden beat → land
stacked in a lit bay); with CUTSCENE on, ONE ceremonial pack-rip follows (lip peel →
all cards fan to a grid → wave flip → rarity bursts → tap to continue) revealing
per-pack multiplier cards; then a self-verifying Glass Box receipt. Every machine is
EXACTLY 96.50% RTP; tiers change volatility only (dud 40/52/65%, gold 1-in-20/25/40,
top 100x/250x/1000x).

## 2. Architecture map (where to change what)

- `vendingMath.ts` — 3 tier tables. THE invariant: Σ weight·bps === 9650·100000
  EXACTLY per tier (load-time `mirrorRoundtripCheck` throws). To design a new table:
  fix the standard slice, then solve the gold slice with TWO filler rows (two-unknowns
  algebra: wA+wB = remaining weight, vA·wA+vB·wB = remaining value — pick vA,vB so the
  division lands on integers). Never touch buy prices to tune RTP.
- `vendingProvider.ts` — state machine. Seed-committed fairness: `derivePackRoll`
  (SHA-256 + rejection sampling, domain tag `VENDPACK:<tier>`); ALL outcomes derived at
  `vendPacks()` commit; `skipReveal()` is reveal-pace only; `armTierReducer` no-ops
  mid-vend; `state.committedSeedHashHex` = player-visible commit. Timings module-const
  (`VEND_STEP_MS` 820).
- `VendingMachineCanvas.tsx` — ONE rAF, props mirrored into refs. Geometry consts at
  top (BODY/HEAD/GLASS/SHELF_YS 4×5 slots/TRAY). `TIER_SKINS` = per-machine shell +
  mural src. `bakeDoodleLayer(dpr, thin, mural)` bakes the whole static skin ONCE per
  tier (Map cache, invalidated on mural load); procedural doodle table is FALLBACK ONLY.
  Drop choreography consts COIL/GLASS_FALL/HIDDEN/TRAY_FALL/SQUASH/REBOUND;
  `PILE_POSES[20]` = deterministic bay heap. `backdrop` prop throttles background
  turntable machines to ~3fps AND freezes marquee/neon/sheen (`still = reduced || bg`).
  Marquee = Tim's SWOOBZ SVG (`LOGO_AR/LOGO_H/LOGO_GAP/MARQUEE_PX_S`).
- `VendingExperience.tsx` — everything DOM. Key systems:
  - Turntable: billboarded 3D carousel, `translateZ(-R) rotateY(θ) translateZ(R)
    rotateY(-θ)`, θ=(i−cum)·120°, `cum` cumulative (never wrapped) so spins continue
    the same direction. R = `TURNTABLE_RADIUS` 305.
  - Per-tier theming: CSS vars on the root (`--tier-led/-panel/-plaque-*/-key-*/
    -frame/-label`) from `TIER_ROOMS` + `TIER_UI` — rooms crossfade, glow overlay,
    LED dots, panel art underlays (`/skin/panel-<tier>.png` under a 0.72/0.82 scrim).
  - `PackRipCutscene`: stages enter→torn→spread→flip→done; timings RIP_*; measures its
    own overlay box via `rootRef` (THE ref must stay attached — a missing ref silently
    reverts the grid to 520px and re-breaks mobile); NO auto-advance after reveal
    (tap = continue); rays are FINITE (2600ms ×2).
  - `SettledPanel`: soft vignette veil; AUTO-VERIFIES on mount (re-hash seed vs commit
    + re-derive every roll) → "✓ ROUND VERIFIED".
  - Column order (Tim-decided): header plaque (title + BALANCE + compliance line) →
    MACHINE·DIFFICULTY → VEND/SKIP CTA + CUTSCENE toggle → PACK PRICE (−/dropdown/+) →
    PACKS (−/dropdown/+, TOTAL, MAX WIN) → LAST VENDS. One UI mode (no advanced).
  - Help "?" = viewport-fixed modal overlay (scrim/×/Escape).
  - Mobile: `stageRef.scrollIntoView` on vending/settled ≤940px (jesse blocker fix).
- `vendingAudio.ts` — 4 zero-param synth cues (RG-C5 banner in file). Gold cue =
  class, never value.

## 3. Asset system (all Higgsfield, provenance is LAW)

`used-assets/skin/MANIFEST.md`, `used-assets/skin/cards/MANIFEST.md`,
`used-assets/room-templates/MANIFEST.md` hold every job id. Files served from
`vending-run/public/{skin,room-templates}/`, canonical copies in `used-assets/`.
Workflow that worked: `generate_image` model `nano_banana_pro` (runs as nano_banana_2,
2 cr/img, ALWAYS `get_cost`-preflight + Tim's per-batch OK), style-lock every prompt to
the game hexes + "no text/letters/characters/faces/photorealism"; for cutout sprites:
generate product-shot on plain bg → `remove_background` → alpha-trim with pngjs
(corner-alpha check first — the Read tool renders transparency as grey, don't be
fooled). Pack sprites are drawn as FULL silhouettes (no clip); mural cover-clipped to
BODY in the bake; card faces get DOM number overlays (art stays text-free).

## 4b. Current verified state (2026-07-20/21 — the RONIN session)

What was DONE this session (chronological, all live-verified):
1. Built Tim's standalone RONIN ZERO ARMORY pack machine
   (`streetfighter/pack-machine/`, zero-build static) — that build defined the
   look Tim approved: 6-tier rarity ladder with tier-colored opening scenes,
   MYTHICAL = red takeover (breathing wash + seismo rings + gong), per-tier
   PREVIEW buttons, change/balance display, WHAT YOU CAN WIN prize pool, the
   56-fighter "NOT FINAL MKOMBAT" roster (humans low / monsters high).
2. Tim then redirected: "add it to our existing vending machine game as the
   4th machine, keep the style/effects" → full AUTOMAT integration (section 8):
   `roninPacks.ts` + `roninProvider.ts` (new), `debitBalance` on
   vendingProvider (only touch to an existing money file besides types),
   MachineId plumbing through Canvas + Experience, 4×90° turntable,
   RoninRipCutscene / RoninSettledPanel / barracks / prize pool / previews,
   generated skin assets (mural/room/panel, zero credits).
3. Gates run: typecheck green · 37/37 vitest (money suites untouched) · live
   probe `_qa-ronin.mjs` (frames in `vending-run/shots-ronin/`, VIEWED): buy
   3×$50 → balance 1000→850 exact, rip + red takeover render, receipt
   ✓ PULLS VERIFIED (seed re-derivation on-screen), preview spends/enlists
   nothing, EASY still vends afterward, 0 console errors, 0 failed requests.
   vendingSim NOT re-run (vendingMath byte-identical — nothing to re-prove).

## 4. Prior verified state (2026-07-16/17 night)

Six-agent QA sweep DONE, all blockers fixed + re-verified same night:
taste APPROVED-WITH-CHANGES (all changes landed) · fairness PASS-ATTESTED (12/12 packs
independently re-derived, balances to the cent) · RG-C5 6/6 axes PASS + its CRITICAL
RG-C2 finding FIXED (gold only on net win + symmetric NET line) · jesse/autisk/mobile
mobile blockers FIXED (auto-scroll + responsive cutscene grid; verified minX 44/maxX 372
on 412px with 20 packs). Gates: typecheck green, 37/37 vitest, sim all tiers in band,
0 page errors across all runs. Full chronological log: auto-memory
`automat-vending-status.md` (this session's diary — read it for the why of everything).

## 5. Learnings (will bite you if ignored)

1. **PowerShell copies corrupt '·'**: `Get-Content -Raw` on BOM-less UTF-8 decodes as
   ANSI → '·' becomes 'Â·' → probe button-matchers silently miss. NEVER create probe
   variants via `-replace`; Write fresh files. (Bit us twice.)
2. **"killed" background dev server ≠ down** — verify with HTTP 200 before restarting;
   it also can ACTUALLY die later. 5283 = Tim's port; QA agents used 5293-5297, each
   owns+kills its own PID only. LATE-SESSION PATTERN (2026-07-17): harness-tracked
   background `npm run dev` tasks got reaped seconds after start (vite "ready" then
   killed, twice). Fix: start DETACHED —
   `Start-Process cmd.exe -ArgumentList '/c cd /d <vending-run> && npx vite --port 5283 --strictPort > vite-5283.log 2>&1' -WindowStyle Hidden`
   — then verify HTTP 200. The orphan logs to `vending-run\vite-5283.log`; find it later
   via `netstat -ano | findstr :5283` + check the PID's command line before killing
   (hygiene law: kill only your own game's server).
3. **React measuring refs**: declaring `useRef` + effect is not enough — ATTACH the ref.
   The cutscene grid bug shipped once because `rootRef` wasn't on the div.
4. **RG-C2 aggregate coloring**: `payout > 0` is NOT a win — compare against wager.
   Rarity/celebration = outcome CLASS, never value (a 5x gold must render identical to
   a 100x gold).
5. **Animation counting discipline** (taste-guardian enforces): one shared neon clock,
   no unsynced oscillators (the gold-glow sin(now/110) was killed for this), no
   infinite decorative loops (rays are 2 rotations), full-rotation spins so release
   never snaps (coil = exactly 2 turns).
6. **Marquee/carousel interruptions**: CSS transitions on composable transform lists
   interpolate cleanly; cumulative angle state (never modulo-wrapped) keeps multi-step
   spins direction-stable.
7. **Panels with art need scrims** (vault WCAG lesson) — art at edges, calm centers,
   0.72+ scrim, and verify text contrast after.
8. **Tim's cadence**: he steers with short Dutch messages + reference drops; pitch
   before big art builds; he approves credit batches implicitly by asking for the
   feature — still show cost and keep batches small (session total ≈ 60 cr, balance
   was ~2260 left).
9. **(2026-07-20) Headless-Chrome canvas beats ffmpeg for skin art**: ffmpeg's
   `gradients` filter channel-swaps hex colors (red comes out blue/purple) —
   render an HTML canvas in puppeteer and element-screenshot it instead (regen
   scripts noted in §8). GOTCHA that cost a round: `let top` at global scope in
   a classic page script collides with `window.top` and silently kills the
   whole script → the asset saves as a blank white PNG with NO error anywhere.
   VIEW every generated asset before wiring it.
10. **(2026-07-20) Don't widen `VendingTierId`** for a non-money machine — the
    math invariants (golden tables, mirror checks, sim) all key off it. The
    `MachineId = VendingTierId | 'ronin'` union in `roninPacks.ts` gives the
    UI/canvas a 4th machine while TypeScript itself walls the money paths off.
11. **(2026-07-20) Probe clicks need exact-match first**: a contains-matcher
    ("MYTHICAL") hits the "$50 · best MYTHICAL odds" price row before the
    MYTHICAL preview button. `_qa-ronin.mjs` clickByText does exact-trim match
    then contains fallback — keep that pattern in new probes.
12. **(2026-07-20) The dev server binds ::1 (IPv6) only** on this box — probe
    `http://localhost:<port>`, never `127.0.0.1` (connection refused).

## 6. What to do next (ranked, updated 2026-07-22 EVENING — post-100%-push)

DONE same day (all live-verified, evidence in vending-run/shots-*):
- Full QA sweep ran: a11y PASS (measured contrast, focus ring added,
  cutscene keyboard access), brand-cohesion PASS (arrows de-cyaned, spec
  jobmap synced), game-flow CONDITIONAL→fixed (balance-disclosure line,
  help/settled overlay guard), mobile portrait PASS + LANDSCAPE built and
  verified across two rounds (orientation-aware breakpoint, NO transform-
  scale — it broke 44px targets; compact real layout instead; all four
  primary controls in the 852×393 fold, steppers reachable via page scroll,
  all targets ≥44px runtime-measured).
- Git exists now: root repo (this export dir) ignores the five NESTED repos
  (originals/maze-runner/pulse-run/streetfighter/swoobz-vending each have
  own history — never gitlink them into root again); AUTOMAT lives in the
  originals repo (first commit 65e1f24).

REMAINING:
1. **Lobby wiring** — no lobby app exists in this export; needs Tim/product.
2. **Portrait VEND below the fold** — intentional design, Tim's call if ever.
3. **Gap-grade proofs if wanted**: video-frame flash-safety sweep (a11y did
   code-level), 100ms tap-timing instrumentation (flow gate skipped it).
4. **Empty-card art** (carried over from the old list).
4. **If Tim wants RONIN back**: restore from `_parked-ronin-20260722/` (rename
   `.bak` → `.ts/.tsx`, copy the three touched files back over the actual ones),
   re-run gates, THEN run the QA-fleet pass it never got (taste/autisk/rg-c5/
   jesse/mobile briefs from 2026-07-22 were written and dispatched but stopped
   mid-run when Tim cut the machine — findings-in-progress live in the session
   transcripts only). Parked backlog for that machine: bespoke red pack sprites,
   RONIN ZERO's own art, taiko/gong audio palette, barracks progress line.

## 7. QA tooling you inherit

`vending-run/_qa-*.mjs` = puppeteer-core probes (Chrome at
`C:/Program Files/Google/Chrome/Application/chrome.exe`); shots-* folders are evidence.
Useful ready-made: `_qa-mobile-fix.mjs` (mobile blockers), `_qa-rip3.mjs` (cutscene
frames), `_qa-tiers.mjs` (three machines; note it still clicks removed ARCADE/STREET
chips — harmless no-ops), `_qa-help.mjs` (info overlay). Agents' own `_autisk-*.mjs` +
`_qa-rgc5-*.mjs` also remain. NEW (2026-07-20): `_qa-ronin.mjs` = the RONIN
machine's full-round probe (arm → 3×$50 buy → rip → receipt → enlist → mythical
preview → prizes → barracks → back to EASY; asserts balance math + verify line;
frames to `shots-ronin/`) and `_gen-ronin-art.cjs` = regenerates the three
generated ronin skin PNGs (mural/room/panel) via headless-Chrome canvas.
None are part of the build; keep them out of any commit.

## 8. Machine #4: RONIN ZERO fighter packs (added 2026-07-20, **REMOVED 2026-07-22** — this section is now the reversal map; code in `_parked-ronin-20260722/`)

The Season 00 cosmetic pack machine, ported from Tim's standalone
`streetfighter/pack-machine/` Armory demo (he explicitly asked to KEEP that
style + effect set). COSMETIC by design: packs cost the SHARED demo balance
($5/$10/$25/$50 per pack) and pay FIGHTER CARDS, never money — higher price =
better rarity odds (the odds ARE the disclosure, rendered verbatim).

- `roninPacks.ts` — MachineId type ('easy'|'medium'|'hard'|'ronin'), 6-tier
  rarity ladder (common→MYTHICAL red), 4 price points with integer weights over
  100 000 (load-time mirror check: sums exact, odds strictly improve with
  price, roster ids unique), 57-fighter roster (Tim's NOT FINAL MKOMBAT set,
  humans low / monsters high / RONIN ZERO mythical crest card until his art
  lands). Art: `vending-run/public/skin/roster/*.webp` (512px).
- `roninProvider.ts` — mirrors vendingProvider: seed-committed SHA-256
  derivation (tags `RONINPACK:<priceId>` + `RONINCHAR:<priceId>`, rejection-
  sampled), VEND_STEP_MS cadence, RG-C3 no-look-ahead, receipt re-derives and
  shows ✓ PULLS VERIFIED. Debits through `c.debitBalance` (new small method on
  vendingProvider — balance only, no payout path). Barracks collection in
  localStorage `rz_barracks` (shared key with the standalone demo). PREVIEW
  path: per-rarity demo openings (Tim's ask), nothing debited/enlisted, flagged
  on screen.
- Canvas: `tier` prop is now MachineId; TIER_SKINS.ronin (ink shell +
  `/skin/mural-ronin.png`), NEON goes blood-red on ronin, plaque reads FIGHTER
  PACKS. Experience: MACHINE_ORDER 4×90° turntable (cum mod 4), TIER_ROOMS/
  TIER_UI ronin entries (room `/room-templates/t10-room-ronin.png`, panel
  `/skin/panel-ronin.png` — all three GENERATED via headless-Chrome canvas,
  zero credits; regen script `vending-run/_gen-ronin-art.cjs`, gotcha: `let top`
  at global page scope silently kills the script — window.top), RoninRipCutscene
  (same rip skeleton, rarity-colored frames/rays + seismo-ring red takeover on
  mythical), RoninSettledPanel (ENLIST ALL), BARRACKS + WHAT YOU CAN WIN
  overlays, per-rarity PREVIEW buttons.
- Money machines UNTOUCHED: vendingMath byte-identical, 37/37 vitest green,
  typecheck green, live probe `_qa-ronin.mjs` (shots-ronin/): buy 3×$50 →
  balance 1000→850, ✓ PULLS VERIFIED, preview spends nothing, EASY still vends,
  0 console errors. NOT yet run: the QA agent fleet on the new machine (taste/
  autisk/rg-c5/mobile), landscape check, and Tim may want bespoke red PACK
  sprites in the ronin glass (currently the shared wave/gold products).

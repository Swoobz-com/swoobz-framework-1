# HANDOFF — AUTOMAT (originals/vending) · for the next Fable 5 session

**⚡ START HERE: the standing assignment is the ➡️ BETTING-DASHBOARD UI
REFERENCE block below (Tim names a folder + pictures at session start; you
analyse → spec → implement → make a SKILL of the method). Everything else in
this file is context and law around that work.**

**State at handoff (2026-09-01, HEAD 75e0fe6 pushed, all gates green):** one
day shipped three rounds — single-screen portrait (95d2198), player-feedback
F1-F10 (dc3f508: money-first, suspense-mask, rip-choreografie, 5 nieuwe
audio-cues met her-gepinde hash, LED-codepaneel + desktop keypad, favicon),
en de autisk overlap-sweep tot OVERLAP-VRIJ (c7aabab). Elke ronde:
codotty-maker → blinde QA → orchestrator-commit; geldbestanden byte-identiek
door alles heen (vendingMath c5fe160b / vendingProvider 79a41988 /
vendingAudio 84e26afb, RG-C5-attested). Slop-gate is nu wet (AGENTVENDING +
brand-QA Probe 11). Session-learnings staan per blok hieronder; de
duurzaamste drie: (1) verifieer op GESTRESTE viewports (360×740, dvh-krap) —
referentie-viewports logen twee keer; (2) paint-order ≠ hit-order — een
pointer-events:none-fix laat een element nog steeds fout SCHILDEREN; (3) een
probe die de binnenste span meet onder-rapporteert blok-occlusie — en wie een
defecte probe kopieert, erft de blinde vlek.

## 🟦 SESSION 2026-08-31 (later) — PLAYER-FEEDBACK ROUND F1-F10 (HEAD dc3f508, pushed)

Source of record: `automat/New Games feedback.docx` at the export root (Tim's
notes + a tester review + a Discord quote; the `automat/` folder is otherwise
an EMPTY deploy shell — canonical source stays HERE). Spec: `SPEC-FEEDBACK-
0831.md`. Built in three codotty rounds (A: F1-F3+F6-F10 · B: F4-F5 ·
C: QA-finding fixes), QA fleet: mobile-touch **ATTESTED FOR SHIP** · rg-c5
**PASS 6/6** · brand+slop **ATTESTED** (0 slop flags, 100% Geist census).

What shipped: money-first display everywhere (F1) · balance/aria/history
suspense mask until reveal (F2, provider untouched) · GOLD VEND / PAID OUT /
NO RETURN eyebrow + NET hero (F3, RG-C2 symmetric) · rip anticipation/
hit-stop/gold-freeze/dud-deflate (F4) · FIVE new zero-param class-keyed audio
cues + gold cue moved to the gold card's LANDING (F5 — **vendingAudio
re-pinned 8609c589→84e26afb, RG-C5 attested**; the pin + cue count live in
AGENTVENDING.md) · plaque LED code panel + desktop A-D/1-5 keypad (F6, FIFO
identical, keyboard support) · ≥12px labels + re-measured contrast (F7) ·
LAST VENDS inside the desktop fold (F8) · tier backdrops normalized
cover/center-bottom (F9) · AUTOMAT favicon (F10, in vending-run/index.html —
committed in the ROOT repo, see open item 4).

### Overlap-sweep addendum (same day, HEAD c7aabab, pushed — OVERLAP-VRIJ)

Tim asked "qa test of niks geks overlapt" → full autisk matrix (5 viewports ×
7 states) found 1 blocker + 7 clear defects; 3 codotty rounds + 2 blind autisk
re-verifies closed ALL of them (see the commit message of c7aabab for the
list). Highlights a fresh session must know:
- **Cutscene card faces now size from the card box with a worst-case character
  budget from the bet** (class-uniform per spread — RG-C5). The old
  `Math.max(15, …)` floor was how landscape escaped containment.
- **Payout ribbon is clamped below the grid** via measured budgets
  (ResizeObserver on ribbon+header; levers: row gap → card box → top clamp).
  The rip box was measured ONCE at mount before (12-16px stale) — now observed.
- **Settled panel** = internal scroller + COLLECT pinned as a SIBLING (probes
  that parent-walk from COLLECT to the scroller are stale: ov3/ov4).
- **Provider "reset on rotate" is a PHANTOM**: only Chrome devtools' isMobile
  emulation TOGGLE reloads the document; real rotate/resize keeps state
  (window-marker proof in shots-fb-d). Don't "fix" it again.
- **Probe lesson (banked in slot-rnd AGENT_MEMORY): a probe that measures the
  innermost span under-reports block occlusion** — `_autisk-r3-block.mjs` is
  the block-level ribbon measure of record; copying a defective probe inherits
  its blind spot (codotty's fbe-settle3 clone repeated R2's mistake).
- Landscape 852×393 receipt line reads "✓ VERIFIED · RECEIPT" (182px column);
  portrait/desktop keep the full string (journey gates assert the literal).
- `.impeccable/config.json` now carries shared Geist/Geist Mono waivers for
  the overused-font detector (brand standard).
Backlog uit deze sweep: 6px card type op 852×393 (cutscene-kolom structureel
smal — layout-item, laag) · torn-lip asset heeft een rechte snijrand (art) ·
zij-machine tekstflarden op 412 (smaak, artotty).

## ➡️ NEXT SESSION — BETTING-DASHBOARD UI REFERENCE (Tim, 2026-09-01)

**THE STANDING ASSIGNMENT.** Tim's correction after the 5 concept-boards:
those went too broad ("i was just talking about the ui not the vending
machine ui — as in betting dashboard font etc"). The target is the BETTING
DASHBOARD layer specifically: the bet/controls surface, its typography,
number styling, panel treatment — NOT the machine/scene art direction.

Tim will open the next session by naming **a folder + reference picture(s)**.
The job, in order:
1. **FIND AND VIEW the reference first** (his art-direction cadence: he drops
   references and names them — never act before you've looked; videos get
   frames via ffmpeg `fps=2,scale=520:-1`).
2. **ANALYSE it into a spec**: extract the dashboard grammar (type faces/
   weights/sizes/tracking, number treatment, panel materials, spacing rhythm,
   button/stepper shapes, how money values read) — concrete tokens, not
   adjectives. Related skills to load: `dashboard-ui-as-world` (UI belongs to
   the world, not a bolted bar) + `mobile-portrait-ui` (the portrait gates
   below are LAW) + the slop-gate (brand fonts are currently Geist/Geist Mono
   per Tim's standard — if the reference implies a different face, that is a
   TIM DECISION to surface, not to make silently).
3. **IMPLEMENT on AUTOMAT** (codotty, presentation-only, the usual hash-proof
   + portrait-gate + QA-fleet loop in this file).
4. **MAKE A SKILL of the method** — Tim: "analyse and implement and make a
   skill". Durable home per SAVE-GLOBAL law:
   `C:\Users\Erstr\stormforge\.claude\skills\<name>\SKILL.md` (+ it junctions
   into `~/.claude/skills/` automatically; commit in stormforge). The skill =
   the reusable recipe: reference → dashboard-grammar extraction → token
   spec → implementation checklist → QA gates, so EVERY game can get the
   same dashboard treatment.

Context for that session: the 5 Higgsfield boards in
`vending-run/shots-ui-concepts/` (diegetic/minimal/alley/terminal/collector)
remain useful as SCENE-direction material but answered the wrong question —
do not re-pitch them as the dashboard answer. Balance was 486.63 cr after
those boards (10 cr spent).

Open items / Tim calls:
1. Desktop keypad sits below the 1280×800 fold (LED readout is in-fold;
   holding the keypad in-fold costs 25% cabinet). Discoverability call.
2. Baked-art deltas across tiers (floor line 83.2/78.4/80.7% of image
   height; TIDE has lit cream side-walls) — art REGEN item, no credits spent.
3. Backlog: 10px on-glass A1..D5 slot tags (pre-existing) · aria-live chip
   concat "0.250.25x" (route to a11y) · `_qa-bv2-journey.mjs` asserts the
   old "Clear slot selection" aria-label (now "Clear slot codes") — stale
   gate, fix the probe · landscape docH 618>393 stays the accepted baseline.
4. ROOT repo (export dir) branch `swoobah/mobile-p0-and-mote-discipline` is
   201 commits ahead with a 3.45 GiB pack — `git push` HTTP 500s. The
   favicon + gitignore commits sit safely on it locally; untangling the big
   push belongs to a Swoobah session.

New learnings: paint-order ≠ hit-order (a pointer-events:none decor div was
"fixed" for clicks 2026-07-22 and STILL painted over the new code panel —
z-index the surface, not just the pointer) · contrast probes must
element-screenshot, not viewport-clip (two agents independently produced
false readings from document-vs-viewport rect mismatch) · hit-extender via
::before face keeps the button box 48px while the painted key stays 30px.

---

## 🟩 SESSION 2026-08-31 — SINGLE-SCREEN PORTRAIT (HEAD 95d2198, pushed)

Tim's ask: "op mobile moet je ver scrollen — Yurei heeft een all-fitting UI,
bouw dat ook voor AUTOMAT." This SUPERSEDES the old §6 item 2 ("VEND below
the fold is intentional"). Spec of record: `SPEC-PORTRAIT-0831.md` (in this
folder). Built by codotty (2 fix rounds), TWO blind mobile-QA rounds, final
verdict **ATTESTED FOR SHIP**, orchestrator-verified + committed `95d2198`.

What shipped (VendingExperience.tsx only, +592/−203; money files
triple-attested byte-identical c5fe160b/8609c589/79a41988):
- Portrait = 4 bands in 100dvh, NO scroll (was docH 1407 = 1.5-1.7 screens):
  top strip (AUTOMAT · BALANCE · CUTSCENE chip · ?) → full-bleed stage →
  floating control zone (hero VEND, machine chips, one stepper row) → slim
  money strip (TOTAL · MAX WIN · compliance line).
- Shared "control atoms" (helpButton/machineChips/vendCta/steppers/…)
  declared once, arranged per layout — portrait and desktop trees cannot
  drift in handlers/aria/keyboard.
- Slot-pick now gated on MEASURED canvas width: ResizeObserver on the
  turntable box, `SLOT_PICK_MIN_CANVAS_PX = 337` (:184), live-tracking,
  picks cleared on shrink. Observe the TURNTABLE box, not the canvas — a
  rotated back machine's rotateY projection reads ~204px where the box is
  275.7px.
- Money strip height is MEASURED into `--vend-strip`; chrome budget is
  `calc(300px + var(--vend-strip))` — never a hard-coded constant again.
- ≤380px media block: topstrip compaction + stepper selects pad 0 10px 0 2px
  + font 12px so the WIDEST ladder values (10.00 / 20) render unclipped.
- The scrollIntoView portrait hack (old jesse fix) is REMOVED (dead code in
  a non-scrolling layout).

New learnings (20-22):
20. **Verify at STRESSED viewports, not just reference ones** — build passed
    412×915/390×844 and failed 360×740/412×738 (dvh shrunk by browser
    chrome): slot cells 35.6px, help ? clipped off-viewport, strip overlap.
    Always test 360×740 AND a dvh-shrunk 412×738.
21. **A "fits" claim for a native <select> needs a SCREENSHOT of the WIDEST
    value** — measureText said 39px fits a 50px box; Chrome still clipped
    "10.00" (UA inner box < computed content box). Codotty first proved the
    fix on the default value only; the ladder max still clipped.
22. **Backticks inside a comment inside a JSX template-literal stylesheet
    terminate the literal** — four TS errors from a pure comment edit.

Evidence: `vending-run/shots-bv-0831/`, `shots-codotty-portrait/`,
`shots-portrait-before/`, `shots-portrait-after/`. Probes `_qa-bv*.mjs`
(blind QA, reusable regression suite), `_codotty-*` (maker). Landscape
docH 618>393 page-scroll remains the ACCEPTED pre-existing landscape
baseline (untouched).

---

**Status at prior handoff (2026-07-22 LATE evening, HEAD 598708a pushed): 3-machine
build + OPTIONAL SLOT-PICK feature + per-machine pack skins, five-agent
swoobz QA fleet run and all its findings closed, ON GITHUB, ~95%
ship-ready.** Read `AGENTVENDING.md` FIRST (the short law card for any agent
touching this game), then this file. Section 4c = the ronin-removal/100%-push
session; 4d = the slot-pick feature (A1..D5 punch codes, cyan ambient glow,
FIFO, bright-queue coupling); 4e = the QA-fleet round + its three fixes +
per-machine pack skins (storm/obsidian boosters, rip cutscene follows the
machine). The ONLY open ship item is lobby wiring, blocked on a lobby app
existing at all. Section 6 = the remaining list; section 5 = learnings 1-19
(18 and 19 are from the QA round — read before touching overlays or
decorative art).

**Git (updated 2026-07-22 late):** AUTOMAT's source lives in the `originals/`
repo, branch `feat/abyss-line-audio-agentsmd` (ask Tim before renaming/
merging), remote `github.com/Swoobz-com/swoobz-framework-1` — PUSHED through
`598708a`; plain `git push` works. The export ROOT repo now has remote
`github.com/Swoobz-com/swoobz-games-export` (main = live export; the old
2026-07-09 snapshot is preserved as branch `export-20260709`); it still
IGNORES the five nested repos (learning 14 — never `git add` game files at
root). STANDOFF (streetfighter) is pushed as branch `standoff` in that same
repo. Tim's law: ONE repo per surface, NEVER create a new repo — push to
these existing remotes. Identity repo-local (Tim / erwin@luckysledger.com).
Orchestrator verifies + commits + pushes; makers never commit.

**RONIN ZERO (machine #4) is REMOVED** (Tim, 2026-07-22: "we dont need that
for now"). Reversal is a copy-back: pre-removal files in
`_parked-ronin-20260722/` as `.bak` (MUST stay `.bak` — the vending-run
tsconfig includes originals/vending recursively). Ronin assets/probes/shots
left on disk unreferenced. Section 8 = the reversal map. Tim's standalone
Armory demo `streetfighter/pack-machine/` is untouched and remains the style
reference of record. The "demo dev buttons" Tim asked to remove were the
ronin PREVIEW/barracks/prize overlays — four QA agents independently attested
the shipped game has ZERO dev/demo UI in any state.

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

## 4c. Session log 2026-07-22 (the removal + 100%-push session — READ THIS ONE)

Orchestrator-led (Fable 5 steering codotty + the QA roster; every maker step
independently verified — never accept a maker's self-report, it missed real
defects twice today). Chronological:

1. **RONIN removal** (Tim's call, morning). Parked backups made FIRST (no git
   existed yet), then codotty unwired machine #4: turntable 3×120°, ~1150
   lines of ronin code out of Experience/Canvas, `debitBalance` removed from
   vendingProvider, roninPacks/roninProvider → `_parked-ronin-20260722/*.bak`.
   Verified: typecheck, 37/37, vendingMath+vendingAudio hash-identical
   (C5FE160B… / 8609C589…), grep 0 ronin hits, live 3-machine probe
   (`shots-3machine-restore/`, frames VIEWED). A 5-agent QA fleet that was
   mid-flight ON the ronin machine was stopped + its servers killed.
2. **Four-gate QA sweep** (all first-time-ever): a11y PASS (contrast measured
   from rendered pixels, all 3 tiers ≥4.5:1; focus ring was browser-default —
   fragile), brand-cohesion PASS (1 MEDIUM: turntable arrows exceeded the
   cyan budget), game-flow CONDITIONAL (VEND disabled silently when
   balance < total; help modal stacked over COLLECT), mobile portrait PASS /
   **landscape FAIL-CRITICAL** (width-only 940px breakpoint → landscape got
   the portrait stack, zero UI at first paint).
3. **Fix round 1** (codotty, 8 items, presentation-only): orientation-aware
   breakpoint + landscape two-column layout; "TOTAL EXCEEDS BALANCE · LOWER
   PACKS OR PRICE" disclosure line; help/settled overlay guard (one overlay
   at a time); cutscene keyboard access (tabIndex + Enter/Space); arrows
   de-cyaned to T.dim; explicit `:focus-visible` outline; skin-spec jobmap
   synced; tab title "AUTOMAT · Swoobz Originals".
4. **Blind re-verify round 2** (mobile-touch, fresh probes, distrust-maker):
   original CRITICAL+HIGH CLOSED, but caught what codotty's smoke missed —
   the `scale(0.82)` had shrunk CUTSCENE/picker/COLLECT to 36-38px runtime
   (learning 13) and the toggle clipped 16px on iPhone landscape.
5. **Fix round 2** (codotty): scale REMOVED, real layout compacted instead
   (210px stage track, trimmed paddings, two secondary lines hidden
   landscape-only). Measured after: all targets ≥44px, all four primary
   controls inside 852×393 AND 915×412 at first paint, portrait identical
   (grid 40.3/367.7 ≈ spec 44/372).
6. **Orchestrator spot-check** of codotty's worry that price/packs steppers
   were clipped in landscape: FALSE ALARM — page scrolls (docH 618), stepper
   hit-test reaches the real 44px button (own probe `_orch-landscape-steppers
   .mjs`). Verify before "fixing" a reported defect (learning 17).
7. **Git**: root repo init + nested-repo untangling (learning 14), AUTOMAT
   first-ever committed in the originals repo. All engine hashes re-proven
   identical through every round. CEO status page kept current (artifact
   `automat-ship-status`, ~95%).

## 4b. Prior state (2026-07-20/21 — the RONIN session)

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

## 4d. Slot-pick feature (2026-07-22, commit 5d7aaac — after the dropdown fix d6e8dc8)

Tim's ask: optionally punch your own slots like a real machine. Built by
codotty, orchestrator blind-verified + committed. 20 DOM hit-cells over the
canvas glass (codes A1..D5 always visible, aria-pressed, keyboard free),
tier-LED steady glow + finite 460ms bloom on select (reduced-motion gated),
FIFO cap at packCount, CLEAR chip, picks clear on settle/rotate, inert
outside ready. VEND freezes a presentation-only `slotOrder` (Experience
`computeSlotOrder`) that routes the canvas drops; empty selection ==
byte-exact today (packIndex order). MONEY LAW held: vendingMath/vendingAudio
hash-identical, vendingProvider untouched, rolls stay seed+packIndex.
Cell rects: 68x92 desktop / 45.3x61.2 portrait 412 (>=44px). Evidence:
`vending-run/shots-slotsel/` + probe `_qa-slotsel.mjs`. Same day, earlier:
price/packs dropdown white-on-white fixed (colorScheme dark + plaque-styled
options, commit d6e8dc8). NOTE overlay wraps the canvas in a relative div —
any future canvas-box change must keep that wrapper.

## 4e. QA-fleet round + pack skins (2026-07-22 evening, commits d222e9d + ce1539f, PUSHED to github Swoobz-com/swoobz-framework-1)

Five swoobz-* agents on the slot-pick feature: RG-C5 PASS 6/6 attested ·
brand PASS (cyan = reused job 3, spec updated) · a11y FAIL→fixed (hint line
1.7-4.6:1 → T.dimLift #b7c1d0, re-measured 11.03:1 all tiers) · mobile
CRITICAL→fixed (landscape stage ~210px shrinks percent-cells to 27x37px,
5x44px physically cannot fit → slot-pick NOT OFFERED on compact landscape,
portrait/desktop full) · flow CRITICAL→fixed (plateau-disc art painted over
CLEAR on desktop = dead button → pointer-events:none). All fixes re-verified
with real mouse/touch. AGENTVENDING.md added (agent law card). THEN
per-machine pack skins (Tim): storm + obsidian standard boosters generated
on-model (4cr, job ids in skin MANIFEST), GOLD pack stays shared (class
marker); PACK_STD_SRC per-tier map in the canvas; live-verified all four
sprites load + per-tier packs visible + obsidian drop on HARD. Rip cutscene
follows the machine too (RIP_PACK_SRC map + tier prop on PackRipCutscene;
Tim caught the old wave pack tearing on MEDIUM — verified storm pack rips).

Two NEW learnings (18, 19):
18. **Percent-overlay over a responsively-compacted canvas = invisible
    tap-target shrink** (learning-13 class, new mechanism): DOM cells sized
    as % of a canvas box shrink with it — landscape's 210px stage made 44px
    portrait cells 27px. Measure overlay targets at EVERY breakpoint the
    underlying box changes size.
19. **Decorative art divs must set pointer-events:none** — an aria-hidden
    plateau shadow painted over the CLEAR chip and silently ate every click
    on desktop only. DOM-dispatch probes (el.click()) CANNOT catch this
    class; only real-mouse elementFromPoint/click probes can.

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
13. **(2026-07-22) transform:scale breaks tap-targets invisibly** — a
    `scale(0.82)` on the layout shell keeps source CSS declaring ~44px while
    runtime rects measure 36-38px, AND the scaled box keeps its unscaled
    layout height so it still overflows the fold. Source-only review AND the
    maker's own smoke both missed it; only blind re-measurement caught it.
    Never scale a layout to fit a viewport — compact the real layout. Always
    QA computed rects on the live viewport. (Also in global memory:
    `transform-scale-tap-targets.md`.)
14. **(2026-07-22) The gitlink trap** — `git add -A` at the export root
    silently stored originals/maze-runner/pulse-run/streetfighter/
    swoobz-vending as mode-160000 gitlinks (each has its own `.git`): the
    "commit of everything" contained NONE of their files, including this
    game. Now handled: root `.gitignore` excludes those five; commit vending
    work inside the originals repo. Before any first commit in a new root:
    `git ls-files -s | findstr ^160000`. (Global memory:
    `gitlink-nested-repo-trap.md`.)
15. **(2026-07-22) Maker self-reports missed real defects TWICE today** —
    codotty's smoke declared the scale-fix clean (it wasn't, learning 13),
    and codotty's deviation note claimed steppers were clipped in landscape
    (they weren't — page scroll works, hit-test proven). The loop that works:
    maker fixes → BLIND re-verify with fresh probes by a different agent →
    orchestrator spot-checks surprising claims himself before commissioning
    another fix round.
16. **(2026-07-22) PowerShell here-string + embedded double quotes broke
    `git commit -m`** — the message was split into bogus pathspecs. Keep
    commit messages free of `"` characters (or use a temp file with `-F`).
17. **(2026-07-22) Verify a reported defect before fixing it** — the stepper
    "clip" (learning 15) would have triggered a needless third fix round with
    regression risk. One 5-minute orchestrator probe killed it.

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

DONE 2026-07-22 late evening (all orchestrator-verified + pushed, log in 4d/4e):
- Price/packs dropdown dark-scheme fix; optional slot-pick (A1..D5, cyan
  ambient glow, FIFO, clear-on-vend, bright-queue-follows-picks, rip-cutscene
  follows the machine); per-machine pack skins (storm/obsidian, 4cr);
  five-agent swoobz QA fleet round with all three findings fixed and
  re-verified (dimLift contrast 11.03:1, no slot-pick on compact landscape,
  plateau-disc pointer-events); AGENTVENDING.md; GitHub remotes wired + pushed.

REMAINING (in rank order — a fresh session starts at 1):
1. **Lobby wiring** — no lobby app exists in this export; needs Tim/product
   first. When it exists: the game is a single React component
   (`VendingExperience`, mounted by `vending-run/src/main.tsx`) — wiring is
   mount + route.
1b. **Slot-pick on compact landscape** — deliberately NOT OFFERED there
   (learning 18: cells shrink to 27px inside the 210px stage; 5x44px cannot
   fit). Revisit only if the landscape layout ever gets a wider stage.
   Also: gold pack stays SHARED across machines (RG class marker) — do not
   "theme" it per machine without a new Tim ruling.
2. **Portrait VEND below the fold** — intentional design (turntable gets the
   first screen, Tim-decided column order §2); only change on Tim's explicit
   ask.
3. **Gap-grade proofs if wanted**: video-frame flash-safety sweep (a11y
   verified at code/timing level only), 100ms tap-timing instrumentation
   (flow gate reported it as a gap, not a pass), landscape scroll-region
   polish for PACK PRICE/PACKS (reachable via page scroll today — fine, but
   a dedicated scroll region would be nicer).
4. **Empty-card art** (carried over from the old list).
5. **If Tim wants RONIN back**: restore from `_parked-ronin-20260722/` (rename
   `.bak` → `.ts/.tsx`, copy back over the actual files), re-run gates, THEN
   run the QA-fleet pass it never got (taste/autisk/rg-c5/jesse/mobile — the
   2026-07-22 briefs were dispatched but stopped mid-run when Tim cut the
   machine). Parked backlog for that machine: bespoke red pack sprites,
   RONIN ZERO's own art, taiko/gong audio palette, barracks progress line.
   NB: the removal predates the landscape work — a restored ronin panel has
   NO landscape layout and needs the learning-13 treatment.

HOW TO RUN THE NEXT SESSION (what worked today): orchestrate, don't do —
codotty for all edits (presentation-only briefs with hash-proof demands on
vendingMath/vendingAudio), specialist QA agents with own ports 5293-5297
(detached Start-Process pattern, learning 2), BLIND re-verify after every fix
round (learning 15), orchestrator commits in the originals repo after
independent gates. Reply to Tim in Dutch; keep the CEO artifact
(`automat-ship-status`) honest after every scope change.

## 7. QA tooling you inherit

`vending-run/_qa-*.mjs` = puppeteer-core probes (Chrome at
`C:/Program Files/Google/Chrome/Application/chrome.exe`); shots-* folders are evidence.
Useful ready-made: `_qa-mobile-fix.mjs` (mobile blockers), `_qa-rip3.mjs` (cutscene
frames), `_qa-tiers.mjs` (three machines; note it still clicks removed ARCADE/STREET
chips — harmless no-ops), `_qa-help.mjs` (info overlay). Agents' own `_autisk-*.mjs` +
`_qa-rgc5-*.mjs` also remain. From 2026-07-20: `_qa-ronin.mjs` (ronin
full-round probe, only useful after a ronin restore) and `_gen-ronin-art.cjs`
(regenerates the ronin skin PNGs via headless-Chrome canvas).
NEW (2026-07-22): `_qa-3machine-restore.mjs` (3-machine round on all tiers),
`_qa-mobiletouch-{portrait,landscape}.mjs` + `_reverify2_*.mjs` (hit-target +
first-paint measurement probes — the landscape regression suite),
`_a11y-*.mjs` (contrast/focus/flow/reduced-motion), `_flowqa-full.mjs`
(8-journey gate), `_qa-brand-cohesion-audit.mjs`, `_orch-landscape-steppers
.mjs` (stepper reachability hit-test). Evidence in the matching `shots-*`
folders. None are part of the build; all are gitignored (root `.gitignore`
patterns `_qa-*/_a11y*/_flowqa*/_orch-*/_reverify*/_codotty-*/_autisk-*/
_jesse-*/_gen-*`) — keep new probes inside those prefixes so they stay out
of commits automatically.

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

# AGENTVENDING.md — operating rules for ANY agent touching AUTOMAT (originals/vending)

Read this FIRST, then `HANDOFF.md` (state + full learnings), then `README.md`
(math/RG story) and `AUTOMAT-DOODLE-SKIN-SPEC.md` (art direction) as your task
requires. This file is the short law card; HANDOFF.md is the memory.

## What this is

AUTOMAT, a Swoobz Original: three vending machines (EASY·TIDE / MEDIUM·STORM /
HARD·OBSIDIAN) on a 3D turntable. Player buys 1..20 multiplier packs; packs
physically vend (coil → fall → bay), optional pack-rip cutscene, self-verifying
Glass Box receipt. Every machine is EXACTLY 96.50% RTP; tiers change volatility
only. Players may OPTIONALLY hand-pick vend slots (codes A1..D5, cyan glow,
FIFO cap at packCount, auto-fill for the rest) — slot choice is PURE
PRESENTATION and must stay that way.

## The laws (violating any = your work is rejected)

1. MONEY LAW: `vendingMath.ts` and `vendingAudio.ts` are hash-pinned —
   SHA-256 C5FE160B… / 8609C589… Quote before/after hashes in every report.
   `vendingProvider.ts` changes need loud justification + a 2M-round
   `node originals/vending/vendingSim.mjs 2000000` re-run. All outcomes derive
   at vendPacks() commit via derivePackRoll(seed, packIndex) — nothing
   presentational (slot picks, reveal pace, skips) may enter the derivation or
   reorder reveals.
2. RG-C5: zero-param audio cues; ALL animation timings module-const;
   celebrations/glows keyed to outcome CLASS or selection STATE, never value,
   streak or session. `payout > 0` is NOT a win — compare against wager.
3. NEVER touch buy prices to tune RTP. Never widen `VendingTierId`.
4. Presentation changes prove themselves: typecheck + `npm test` (37/37) +
   hash quotes + a LIVE headless drive with screenshots you have VIEWED.
5. Makers never commit. The orchestrator verifies independently (re-runs your
   gates, reads your diff, drives the game) and commits.

## Git (per Tim, 2026-07-22: ONE repo, never a new one)

- This game lives in the `originals/` repo (branch
  `feat/abyss-line-audio-agentsmd`; ask Tim before renaming/merging), remote
  `github.com/Swoobz-com/swoobz-framework-1`. Commit vending work HERE and push
  to that existing remote. NEVER `git init` a new repo, never re-point remotes.
- The export ROOT is a separate repo that gitignores the nested game repos —
  never `git add` game files at root (gitlink trap, HANDOFF learning 14).
- Repo identity: Tim / erwin@luckysledger.com. No `"` characters in commit
  messages (PowerShell splits them); end with the Claude co-author line.

## Run + probe discipline

- Dev server: `cd vending-run && npx vite --port <YOURS> --strictPort`.
  Port 5283 = Tim's; 5294 = orchestrator's; QA agents take 5295-5299. Start
  DETACHED (Start-Process pattern, HANDOFF learning 2), verify HTTP 200, and
  kill ONLY the PID whose command line points at vending-run when you finish.
- Probe `http://localhost:<port>` — never 127.0.0.1 (server binds ::1).
- puppeteer-core, Chrome at `C:/Program Files/Google/Chrome/Application/
  chrome.exe`. Name probes with gitignored prefixes (`_qa-*`, `_a11y-*`,
  `_flowqa-*`, `_autisk-*`, `_jesse-*`, `_orch-*`) inside `vending-run/`.
  Write probe files FRESH (PowerShell -replace corrupts '·', learning 1).
  Exact-match text clicks before contains-fallback (learning 11). Real mouse
  or CDP touch input when testing hit areas — DOM dispatch hides misalignment.
- Measure RUNTIME rects on the live viewport; never trust source CSS
  (transform:scale trap, learning 13). VIEW every screenshot and generated
  asset — corner-alpha renders as grey in the Read tool, blank-white PNGs fail
  silently.

## Where to change what (map)

- `vendingMath.ts` — tier tables (invariant: Σ weight·bps === 9650·100000 per
  tier, load-time check throws). Two-filler-row algebra for new tables.
- `vendingProvider.ts` — state machine (`ready`/`vending`/`settled`),
  seed-committed fairness, VEND_STEP_MS cadence.
- `VendingMachineCanvas.tsx` — ONE rAF, props mirrored into refs, geometry
  consts on top, slot-select DOM overlay (percent-positioned over the logical
  520x760 frame; only the front machine gets it). The bright queued-pack set
  follows the slotOrder map (hand-picks first, auto-fill after).
- `VendingExperience.tsx` — everything DOM: turntable, per-tier CSS vars,
  cutscene, settled panel, selection state (`selectedSlots`, FIFO,
  clear-on-vend + clear-on-rotate), `computeSlotOrder`.
- `vendingAudio.ts` — 4 zero-param cues. Do not add parameters.
- Assets: Higgsfield only, provenance in `used-assets/*/MANIFEST.md`; never
  bake text into generated art; card faces get DOM number overlays.

## QA roster expectations

Dispatched swoobz-* QA agents audit independently (never trust a maker
self-report — it missed real defects twice on 2026-07-22): rg-c5 structural,
game-flow journeys, mobile-touch (44px runtime targets), accessibility
(measured contrast, keyboard, reduced-motion), brand-cohesion (cyan accent
economy, Geist Mono, no em-dashes, quiet-expert copy). Evidence lands in
`vending-run/shots-*`; verdicts go back to the orchestrator, fixes route to a
maker, then BLIND re-verify with fresh probes.

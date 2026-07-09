# ABYSS LINE — build spec (codotty) — full re-skin from the SUPPLIED asset pack

Compiled by fabi 2026-07-06 from the supplied pack at
`C:/Users/Erstr/OneDrive/Bureaublad/swoobz-games-export/swoobz-games-export/input/asset abyss/`.
Assets are SUPPLIED (vector SVG) — Higgsfield NOT needed; this lands fully this round. This REPLACES the
dark-obsidian Aztec theme with **ABYSS LINE — Sunken Treasure** (wreck of the "Golden Sledge", 3,800m).

READ THESE INPUT FILES YOURSELF FIRST (source of truth; replicate the mockups 1:1):
- `input/asset abyss/spec/abyss-line-asset-map.md` (tokens, asset states, sizes, icons)
- `input/asset abyss/README.md` (screens, layout skeleton, theme tokens, mechanics)
- `input/asset abyss/mockups/abyss-line-example-entry.html` + `abyss-line-example-setup.html` (LAYOUT SOURCE OF TRUTH — exact spacing/copy/geometry; the `#coin`/`#rcoin`/`#ing`/`#cp` defs are the exact ducat + prop geometry)
- `input/asset abyss/vector/abyss-line-background.svg` (the scene) + `abyss-line-assets.svg` (pod states/mine/sub/haul-net)

## SCOPE / KEEP (frozen — Tim)
- MECHANIC unchanged: paint a claim line of 8–60 ducats → commit ONCE → reveal ducat-to-ducat → all-or-nothing
  (win the whole line or one cracked ducat busts to 0). NO mid-run cash-out button (the README's "cash out
  anytime" is theme-flavor; the engine is all-or-nothing — keep it). Settle copy: win = "SECURED THE HAUL ·
  {mult}x +{amount}", bust = "RUGGED BY THE DEEP · −{bet}". Secondary CTA "SAME LINE", primary "DIVE AGAIN →".
- MATH/RTP unchanged: GRID_DIM=14 (196), tier bombCounts 6/8/16, flat 96.50% RTP. The 3 depths map EXACTLY onto
  the current tiers (see below) so NO math change and NO grid change → verotty NOT triggered (do NOT touch
  assayMath.ts / bombCounts / GRID_DIM). Keep 196 (the 544-board fits 14×14 at ~35px pods). If the mockup truly
  forces a different grid, STOP and report — do not silently change math.
- RoR-style transparent-blocks UI STRUCTURE stays (the current game already has it) — re-skin its tokens/assets
  to Abyss, replicate the mockup panel layout 1:1.
- FOLDER SLUG stays `assay` (paths). DISPLAY NAME + wordmark become "ABYSS LINE".

## DEPTH ↔ FLOOR mapping (TIER_DISPLAY_LABEL rename only — TierId ids stay lean/standard/flooded)
- lean (6 bombs, T60 8.95x)   → **REEF SHELF**   (background: water +15% lighter, more kelp)
- standard (8, 19.16x, default) → **MIDNIGHT ZONE** (background: default)
- flooded (16, 446.12x)        → **HADAL TRENCH**  (background: water −20% darker, red lamp dots, anglerfish silhouette)
Selecting a depth recolors the background scene (recolor only, same geometry — the depth variant).

## 1. ASSETS — copy the supplied SVGs into the game
Copy `input/asset abyss/vector/abyss-line-background.svg` → `originals/assay/assets/abyss-background.svg`
and `abyss-line-assets.svg` → `originals/assay/assets/abyss-assets.svg`. USE them (don't reinvent): the
background.svg is the fixed scene (water radial gradient, godrays, L/R trench walls at 2 depth tones, kelp,
seafloor sand ridges, treasure chest + coin piles + gold glow, ingot stacks, coinpile, a naval mine on the
floor, and the SUB with a cyan porthole + amber lamp + a LIGHT CONE polygon pointing DOWN at the board area).
"Background never moves; only board contents + panel states change." Retire the old obsidian backdrop layers +
the cool-silver interim wordmark + the temple/torch/treasure-dressing layers (superseded by this scene).

## 2. COLOR TOKENS — replace the obsidian palette with the EXACT Abyss tokens (both files)
--bg-deep #03090f · --bg-water #081b28 · --bg-water-light #103042 · panel rgba(16,26,36,.93) ·
panel-border #2c4356 · text #e6f1f5 · text-muted #87a6b5 ·
--player (cyan) #35e0d2 · --player-deep #0d3c38 · --player-text #8ff2e8 ·
--gold #f0b542 · --gold-mid #d9a94f · --gold-dark #8a6a26 · --gold-light #f5d98a ·
--danger #ff5d5d · --wood #6e4526 / #57351c · outline stroke #03090f–#2a1c06 (width 2–6).
RULE OF THREE (strict, verify): **cyan = player** (claim line, route, toggles, primary CTA, selection,
sub-light) · **gold = value** (balance, multipliers, haul, chips, coin body, gauge needle) · **red = danger**
(mine, cracked, bust). Nothing else carries meaning. Cyan and gold return TOGETHER but MUST be spatially
separated — never literally on the same element/surface (that's the brand-cohesion check).

## 3. TILES = PODS (ducats) — canvas-2D, 6 states from the mockup `#coin`/`#rcoin` + assets.svg mine geometry
Draw procedurally to match the exact mockup geometry (scaled to the ~35px grid pod; keep the coin-detail budget
approach from before — SPRITE_REF supersample, absolute-px floors, drop sub-legible micro-detail, keep the
readable silhouette). States:
- **idle/dicht**: rim circle #8a6a26 (stroke #2a1c06), body #d9a94f, dashed pearl ring #b98f3a (dasharray ~2.2 2),
  center #c99b45 (stroke #a87f2e), a stamped 8-point star #8a6a26, a top-left shine arc #f5d98a.
- **hover**: shine +20%, scale 1.05.
- **selected (on route)**: cyan seal — fill #0d3c38, ring #35e0d2, dashed inner #1c5a52, + the ROUTE NUMBER in
  #8ff2e8 (bold), + a cyan radial glow. (This is the `#rcoin` + number.)
- **revealed-gold (claimed/safe)**: flip to a small chest/nugget on a gold ring (#f0b542 ring on #1a2a35, wood
  #6e4526 chest, gold ingot/coins), amber radial glow (assets.svg "POD · GECLAIMD").
- **revealed-mine (cracked/bust)**: flip to a naval MINE — spiked sphere #1a2a35 with 8 spikes (stroke #1a2a35),
  red core #ff5d5d, red radial glow (assets.svg "ZEEMIJN · BUST" + mine.svg).
- **dimmed (post-round)**: 40% opacity on unopened ducats after settle.
- **route_link**: a dashed cyan (#35e0d2, dasharray ~4 4) connector segment drawn between consecutive selected
  ducats (the mockup draws a dashed cyan path through the route).

## 4. UI / LAYOUT — replicate the mockups 1:1 in the Abyss tokens (this is the RoR structure re-skinned)
Layout skeleton (CSS grid): rows 56px topbar / 1fr main / 40px statusbar; columns 1fr playfield / 320px control
column. Board 544×544 centered (grid + 24px symmetric padding), HUD zone board-width above it. Sub light cone
always points at the board. Monospace throughout. Spacing 8/12/16/24, panel radius 10–12, buttons 44 primary /
36 secondary, labels 11px caps, values 16–20, hero 40–48.
- Panels: panel_bg rgba(16,26,36,.93) border #2c4356 radius 10, semi-transparent so the scene shows through.
- btn_primary_cyan fill #35e0d2 text #042220 radius 8 h44 — ONE per view. Disabled: fill #123a42 text #5d8d96,
  label CARRIES THE REASON ("RUN THE LINE · 3 MORE"). btn_secondary transparent border #2c4356 h36.
- toggle_segmented (DISC-BY-DISC / INSTANT): active side #0d3c38 / #8ff2e8. chip_bet pill, active bg #2a2410
  border+text #f0b542 (chips 1/5/10/25/50). card_depth compact row; selected bg rgba(13,60,56,.94) border #35e0d2.
- HAUL gauge (brass): outer arc #3a2e18→#8a6a26, tick marks #c99b45, progress arc #35e0d2, NEEDLE #f0b542 (a
  separate node that ROTATES −120°→+120°; overshoots on every claimed ducat). Label "UP TO {N}x IF THE LINE HOLDS".
- badge_best pill bg #2a2410 border/text #f0b542. topbar h56, statusbar h40 (same panel style).
Screens (replicate entry + setup mockups exactly, incl. copy):
- ENTRY: topbar `SWOOBZ · ABYSS LINE | RTP 96.50% | BALANCE {n}` (balance gold, only here). HUD `ABYSS LINE`
  left, `SONAR ACTIVE` (cyan) right. Board = full grid of idle ducats. Caption `TRACE 8–60 DUCATS · ONE CRACKED
  DUCAT BUSTS THE DIVE`. Column: `THE DIVE` (4 steps) → `DIVE DEPTH` (3 rows, max in gold) → CTA `ENTER THE DIVE →`
  (cyan). Statusbar `THE WRECK OF THE GOLDEN SLEDGE · DEPTH 3,800M | PLAY SAFE ↗`.
- PLOT YOUR LINE: HUD depth name + `{n} CRACKED DUCATS ON THE FLOOR` left; `UP TO {max}x` (gold) + `LINE HOLDS →
  {n}x` (cyan) right. Board = selected ducats w/ route numbers + dashed cyan connector. Caption `SELECT {n} MORE
  DUCATS · MIN 8 · POTENTIAL {n}`. Column: 3 depth cards → CLAIM LINE (`{n} / 8 MIN`, CLEAR, pace toggle) → HAUL
  gauge → YOUR BET → CTA (`RUN THE LINE · {n} MORE` disabled / `RUN THE LINE →` cyan enabled). Statusbar `THE LINE
  RUNS DUCAT-TO-DUCAT · CRACKED = BUST | PLAY SAFE ↗`.
- RUN + RESULT (same skeleton, board NEVER shifts): sub sprite travels the route; each ducat flips to
  revealed-gold; gauge ticks up; bet panel dims (`LOCKED`). Mine → revealed-mine, red shockwave + screen shake +
  red banner. Result banner REPLACES the HUD zone (same height): win = teal `SECURED THE HAUL · {mult}x +{amount}`,
  bust = red `RUGGED BY THE DEEP · −{bet}`. CTA `DIVE AGAIN →`, secondary `SAME LINE`; unopened ducats dim to 40%.

## 5. ICONS (24×24, 2px stroke, line style) — where relevant
ic_clear, ic_pace_step (footprints), ic_pace_instant (lightning), ic_minus, ic_plus, ic_balance (coin),
ic_depth_reef (coral), ic_depth_midnight (moon), ic_depth_hadal (skull), ic_gauge, ic_verified (check),
ic_receipt, ic_share, ic_play_safe (shield), ic_sound, ic_help, ic_close.

## 6. FX / JUICE (RG-C5: module-const timings, fanfare byte-identical regardless of win size)
- reveal_gold: coin FLIP + sparkle burst on each safe ducat as the line runs (+ needle overshoot on the gauge).
- bust_shockwave: expanding red ring + screen-shake cue + red banner on the cracked ducat.
- cashout_surface / win: the sub rises with the haul net on a secured haul.
- Keep the existing bounded juice discipline (authored motion, no particle-slop, all timings fixed module-consts,
  byte-identical per win magnitude). Warm audio → re-voice to an underwater register if cheap (sonar ping / coin
  chime / mine-thud / haul-surface); keep zero-param + module-const (RG-C5). If audio revoice is heavy, keep the
  existing RG-C5 audio and flag it.
- Polish backlog (do the high-value, cheap ones; flag the rest): kelp SWAY + rising BUBBLES + plankton drift
  (from the bg), caustic light pattern over the board (6–8% opacity slow drift), idle shine-sweep across 2–3
  random ducats every few seconds. Lower priority (optional/flag): per-depth ducat emblem (coral/crescent/skull)
  on the stamp, wax-seal stamp-down + ripple on selection, cursor parallax on walls/props at 3 depths.

## 7. NAME / WORDMARK / VOCABULARY
Display name "ABYSS LINE"; build an Abyss wordmark in-tokens (cyan/gold on deep water — retire the cool-silver
interim). Vocabulary: DUCATS, THE DIVE, DIVE DEPTH, claim line / route / line, SONAR ACTIVE, SECURED THE HAUL,
RUGGED BY THE DEEP, DIVE AGAIN, SAME LINE, THE WRECK OF THE GOLDEN SLEDGE · DEPTH 3,800M, PLAY SAFE. Rewrite the
old obsidian/Aztec docblocks + PROVENANCE.md to the Abyss theme (no stale-premise leftovers).

## DEFINITION OF DONE (codotty self-check before verifiers)
- typecheck clean; tests still 185/185 (math/grid UNTOUCHED — no verotty needed); the 2 SVGs copied into assets/
  and USED; obsidian/Aztec tokens + backdrop + wordmark fully replaced by Abyss.
- Fresh screenshots (desktop 1440 + mobile 412) matching the entry + setup mockups 1:1: deep-water scene with
  sub + light-cone on the board, gold ducats on the board, cyan route seals + numbers + dashed connector, brass
  HAUL gauge w/ gold needle, panel system in Abyss tokens, ABYSS LINE wordmark.
- Rule-of-three holds (cyan=player / gold=value / red=danger, never literally colliding). Depth select recolors
  the bg. FX (reveal/bust/cashout) fire, RG-C5 fixed. mechanic/grid/RTP/RoR-structure intact, folder slug `assay`.
- Mobile: the sub-scene reads native, tap-target ≥44px (use the pan/loupe if needed), no overflow.

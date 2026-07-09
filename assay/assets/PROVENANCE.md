# ABYSS LINE — skin asset provenance

## ABYSS LINE — SMALL FIX PASS 2 (2026-07-06, codotty) — clears taste-guardian REVISE + autisk nits

Surgical follow-up on top of the fix pass below. Mechanic/GRID_DIM=14/bombCounts 6·8·16/flat 96.50% RTP/sub
geometry/rule-of-three/RG-C5 ALL untouched (frozen). typecheck clean, 185/185 tests green.

- **SWEEP NOW COMPLETE (taste-guardian REJECT-1).** The B7 sweep below only re-voiced the top file-header
  paragraphs; this pass finishes the file BODIES + exported CONST NAMES. `AssayGridCanvas.tsx`:
  `TORCH_FLARE_*`→`SUB_FLARE_*`, `TORCH_FLICKER_*`→`SUB_LIGHT_FLICKER_*`, `COL.torchGlow`→`COL.revealGlow`
  (all call sites updated); every body comment naming torch/obsidian/temple/stone re-voiced to the Abyss
  sub-light/deep-water register. `assayAudio.ts`: `TORCH_WHOOSH_*`→`SONAR_PING_*`, `STONE_THUNK_*`→
  `BREAKER_THUNK_*` (call sites updated); "stone-key plunge / temple-STONE / carved key" section comments
  re-voiced to the dive-key / sonar-ping / breaker-thunk underwater fiction. `AssayExperience.tsx`: the stale
  `:979` "background scene stack (temple/dressing/sconce/vignette/wash, z1..z6)" comment — which named the
  DELETED `TempleSkyline`/`TreasureDressing`/`TorchSconce` components — REWRITTEN to the ACTUAL current z-stack
  (`abyss-background.svg` full-cover backdrop + `DepthTint` z3 + `AmbientFX` z2 + shell z7); the ambient-breathe
  block re-voiced warm-parchment→cool-bone (matches the live `rgba(230,241,245,…)` / `assayLampBreathe`); the
  `:2768` "faint gold-tan inset on obsidian" → "on deep water". Grep-proof: `torch|temple|sconce|stone.key|
  carved.key|warm.*frame|warm.*parchment|obsidian` = 0 hits across all three files (renamed everywhere; no
  LEGACY disclaimer needed since nothing warm-era survives). The only remaining LEGACY note is the `jade*`
  palette-token disclaimer (those tokens ARE still used, repurposed to gold/cyan).
- **AmbientFX KEPT + tuned SUBTLE (fabi ruling 2).** Tim's own spec (README polish #3/#5 + asset-map plankton)
  requests these and artotty credits them, so NOT deleted — dialed to verifiably gentle: caustic layer opacity
  0.06–0.085 → **0.055–0.075** (within the ≤6–8% ceiling; ×inner-gradient alpha ⇒ ~3.75% effective max);
  bubbles keyframe peak 0.5/0.42 → **0.34/0.28**, border 0.5→0.4, fill 0.10→0.08; plankton keyframe peak
  0.55 → **0.38** (low 0.2→0.15), dot fill 0.6→0.5; kelp sway unchanged (±2.2° = gentle). Counts unchanged
  (9 bubbles / 6 plankton / 2 kelp = sparse). RG-C5 fixed module-const timings + `prefers-reduced-motion`
  guard kept. Gameplay (board/ducats/route/gauge) stays the unmistakable focus.
- **Entry two-column restored (autisk nit).** On wide viewports the lobby now lays out playfield-left /
  control-column-right (THE DIVE + DIVE DEPTH + ENTER THE DIVE in the SAME `RailShell` casing as
  planning/settled), per `input/asset abyss/mockups/abyss-line-example-entry.html`. Measured at 1440×900:
  ENTER THE DIVE left=903 (right of the board's right=843), bottom=390 — above the 900 fold; DIVE DEPTH
  top=241. The narrow/mobile path keeps the below-board `Panel` block (can't two-column). `RailShell` child
  wrapper given `flex:1` so the CTA pins to the column bottom (mockup `margin-top:auto`); planning/settled
  rail visually unchanged (their rows are top-aligned, no auto margins).
- **Header wordmark "A" clear (autisk nit).** The top-left `BrassCornerBracket` L-stroke spans x=7..23px; the
  header's 16px left padding let it clip the leading "A" of "ABYSS LINE". Left padding 16→**26px** (desktop +
  mobile collapsed header) so the first glyph clears the bracket arm. Verified on both viewports.

---

## ABYSS LINE — CONSOLIDATED FIX PASS (2026-07-06, codotty) — clears artotty/taste/brand/autisk/mobile-touch

Surgical fixes on top of the re-skin below; mechanic/GRID_DIM=14/bombCounts 6·8·16/flat 96.50% RTP/sub
geometry ALL untouched (frozen, verotty-certified). typecheck clean, 185/185 tests green.
- **B1 wordmark** now SINGLE off-white `#e6f1f5` (`AbyssWordmark`), not the ABYSS-gold + LINE-cyan split
  (that was a rule-of-three collision on one element).
- **B2 win banner** "SECURED THE HAUL" recolored to player TEAL `#8ff2e8` (bust "RUGGED BY THE DEEP" stays red);
  the gold PAYOUT value keeps the value colour.
- **B3 settle secondary CTA** CLOSE → **SAME LINE**, wired to new `reDiveSameLine()` (settled → planning with
  `trail = lastTrail`, re-arms the exact route). Primary stays cyan "DIVE AGAIN →".
- **B4 warm-brown literal sweep** — the leftover obsidian bare literals (`rgba(44,32,22)` rail/dock,
  `rgba(23,19,16)` PLAY-SAFE pill, `rgba(11,10,8)`/`rgba(6,4,2)`/`rgba(8,5,2)` near-blacks) → cool Abyss
  (`rgba(16,26,36,…)` panels / `rgba(3,9,15,…)` INK). Grep-proven: 0 warm-brown literal survives in code.
- **B5 Geist** — `fontFamily: FONT_MONO` added to `CalibKnob`/`CalibToggle`; the runner `assay-run/index.html`
  now actually LOADS Geist + Geist Mono via Google Fonts (`<link>` + preconnect). Runner bg `#07060a`→`#03090f`.
- **B6 aria** — "Temple floor board … discs" → "Abyss floor board … ducats" (both canvas branches);
  "press the stone key" → "throw the breaker".
- **B7 docblocks/keyframes** — file headers + `assayAudio.ts` header re-voiced to the Abyss register (audio
  synthesis KEPT, flagged); dead `assaySconceFlame`/`assaySconcePool` keyframes DELETED; stale palette
  docblocks rewritten; legacy token-name note added for repurposed `jade*`/`torchGlow`/`BRASS_*`.
- **B8 disabled CTA** — "RUN THE LINE" now carries the reason suffix ("· {n} MORE" / "· MAX 60" / "· LOW BALANCE").
- **B9 entry column** — THE DIVE (4 steps) + DIVE DEPTH (3 rows, gold ceilings from the live tier table)
  restored in the lobby overlay, 1:1 with the entry mockup.
- **B10 breaker pilot** — rest pilot recolored to a NEUTRAL steel dot (was gold-tan); the dead unreachable
  post-throw `thrown` gold-variant (React-18 unmounts the lever in the same batch) removed, incl. `BREAKER_THROW_MS`.
- **S1** control-column bezel + coachmark accent gold → steel-blue `#2c4356` / player cyan (gold = value, not chrome).
- **S2** depth tint strengthened — REEF distinctly lighter/greener, HADAL distinctly darker + brighter/more red lamp dots.
- **S3** revealed-gold chest brightened (hotter amber glow + lifted disc bg); idle-ducat shine arc lifted + specular glint.
- **S4** bet chips → integers 1/5/10/25/50; claim count "05/8 min" → "8 / 8 MIN"; "PACE: DISC-BY-DISC" → "DUCAT-BY-DUCAT".
- **S5** ambient deep-water FX layer (`AmbientFX`): caustic drift + rising bubbles + drifting plankton + kelp sway,
  all fixed module-const timings, sub-3Hz, RG-C5 byte-identical, prefers-reduced-motion honored.
- **S6** iPhone 14 Pro fold — RUN THE LINE now clears 852px (measured bottom=851; was 885): RailRow compact
  padding 8→6 + tighter title gap + mobile HAUL gauge 100×54→96×48; `minHeight:44` + `touchAction:'manipulation'`
  on the interactive controls.
- **S7** mobile statusbar shortened per-viewport so it no longer ellipsis-clips.

---

## ABYSS LINE — SUNKEN TREASURE RE-SKIN (2026-07-06) — RE-SKIN BASE (supersedes everything below)

Full re-skin from the dark-obsidian Aztec theme to **ABYSS LINE — Sunken Treasure** (wreck of the "Golden
Sledge", 3,800m deep), from Tim's SUPPLIED vector asset pack (`input/asset abyss/`). Higgsfield NOT needed —
the art is supplied SVG. FROZEN: the MECHANIC (paint claim-line → commit once → all-or-nothing), `assayMath.ts` /
bombCounts / `GRID_DIM=14` (196) / the flat 96.50% RTP, the RoR-structure UI, and the folder slug `assay`. The
3 depths map EXACTLY onto the existing 6/8/16 tiers → NO math change (verotty not triggered). 185/185 tests green
(the only test change: the 3 `TIER_DISPLAY_LABEL` string assertions re-recorded to the new dive-depth names — a
label change, not a math change). typecheck clean.

- **SUPPLIED ASSETS COPIED + USED.** `input/asset abyss/vector/abyss-line-background.svg` →
  `assets/abyss-background.svg` (the fixed underwater scene: water radial gradient, godrays, L/R trench walls,
  kelp, seafloor, wreck treasure chest + coin piles + gold glow, ingots, a naval mine, and the SUB with a cyan
  porthole + amber lamp + a light cone) — used as the full-cover page background (`AssayExperience.tsx`), "the
  background never moves, only board contents + panel states change." `input/asset abyss/vector/abyss-line-assets.svg`
  → `assets/abyss-assets.svg` (pod-state / mine / sub / haul-net reference geometry) — the pod states are drawn
  procedurally on the canvas to match this + the mockup `#coin`/`#rcoin` geometry.
- **ABYSS TOKENS applied (both files).** bg-deep `#03090f` · bg-water `#081b28` · bg-water-light `#103042` ·
  panel `rgba(16,26,36,.93)` · panel-border `#2c4356` · text `#e6f1f5` · text-muted `#87a6b5` · player-cyan
  `#35e0d2` / `#0d3c38` / `#8ff2e8` · gold `#f0b542` / `#d9a94f` / `#8a6a26` / `#f5d98a` · danger `#ff5d5d` · wood
  `#6e4526`. RULE OF THREE (strict): cyan = player (route/selection/toggles/CTA/sub-light), gold = value
  (balance/multipliers/haul/chips/ducat/needle), red = danger (mine/cracked/bust); cyan+gold spatially separated.
- **6 POD STATES + route_link** (`paintDoubloonCore` + selection overlay, `AssayGridCanvas.tsx`): idle DUCAT
  (rim/body/dashed pearl ring/center/8-point star/shine) · hover · selected (cyan route SEAL `#0d3c38`+ring
  `#35e0d2` + route number `#8ff2e8` + cyan glow) · revealed-gold (open chest on a gold ring + amber glow) ·
  revealed-mine (spiked sphere + red core `#ff5d5d` + red glow) · dimmed (post-round). route_link = dashed cyan
  connector between consecutive selected ducats.
- **SUB LIGHT + HAUL GAUGE.** The board's cool sub-light key + cyan sub-light flicker read as the sub cone on the
  board. `TallyDial` = the brass HAUL gauge: brass bezel/track, a cyan progress arc, a GOLD needle that swings
  −120°→+120° and overshoots per claimed ducat, gold ticks.
- **DEPTH↔FLOOR mapping** (`TIER_DISPLAY_LABEL` rename only; TierId ids `lean`/`standard`/`flooded` + all math
  untouched): REEF SHELF (6, 8.95×) / MIDNIGHT ZONE (8, 19.16×, default) / HADAL TRENCH (16, 446.12×). Selecting
  a depth recolors the SAME bg scene via `DepthTint` (reef lighter+cyan / midnight default / hadal darker + red
  lamp dots). Name "ABYSS LINE" display + in-tokens wordmark (retired the legacy PNG). Vocabulary: DUCATS, THE
  DIVE, DIVE DEPTH, SONAR ACTIVE, SECURED THE HAUL, RUGGED BY THE DEEP, DIVE AGAIN, SAME LINE, THE WRECK OF THE
  GOLDEN SLEDGE · DEPTH 3,800M.
- **FLAGGED / optional (not this round):** the board panel stays opaque (the sub + cone read strongest in the
  scene margins, not literally through the board); per-depth ducat emblem, wax-seal ripple, cursor parallax, and
  an underwater audio re-voice are the optional polish backlog — the existing RG-C5 audio is kept and flagged.

---

## (SUPERSEDED) DARK OBSIDIAN SWOOBZ REPALETTE + 14×14 GRID (2026-07-05)

Tim: "ik wil iets in de swoobz kleuren ipv zand bruin." TWO changes this round, everything else FROZEN
(mechanic, RoR transparent-blocks UI, and ALL the shipped premium elevations — temple/torch/treasure depth,
coin relief, win cartouche+bloom+coin-fly, tonal range). Name KEPT "THE ASSAY LINE". Higgsfield still OFFLINE
— procedural. Zero cyan (hard gold+cyan ban).

- **(A) GRID 10×10 → 14×14 = 196 tiles + density-preserving mine re-tune.** `GRID_DIM = 14`. `TIERS` bombCounts
  re-tuned ~×1.96 to hold each tier's bomb-density: lean 3→6 (6/196≈0.031), standard 4→8 (8/196≈0.041),
  flooded 8→16 (16/196≈0.082) — the lean<standard<flooded volatility ladder shape is preserved (T(60): 8.95× <
  19.17× < 446.12×). RTP is FLAT-BY-CONSTRUCTION (single final floor), so this is a geometry/volatility change,
  NOT an RTP redesign — analytic 9650 / measured-floor 9649 bps on every tier at 196, BigInt-exact in-band
  [9600,9700]. Golden ladder vectors re-recorded (`assayMath.ts` + `assaySim.mjs` in sync); `assayMath.test.ts` +
  `assayProvider.test.ts` re-baselined (settle identity now Standard T(8)=13552). 185/185 tests green. No
  max-mult clamp added (would break the flat-RTP identity). TierId ids + display labels unchanged.
- **(B) DARK OBSIDIAN + GOLD REPALETTE (from warm sand-brown).** Base ramp shifted to a warm-shifted near-black
  obsidian (R>G>B, NOT #000, NOT cool ink): `INK #0B0A08`, `STONE_DEEP/boardBg #171310`, `STONE_WARM/boardBgHi
  #2C2016`, `boardEdge #050403`. GOLD family PRESERVED verbatim (#E8B04B / #F6DDA0 / #A67C3E / goldGlow) — the
  hero, contrast ~doubles on obsidian. Torch, temple-night (re-spaced `TEMPLE_NEAR_FILL #1C1108` clear of the new
  INK), cartouche (dark-obsidian gradient + `#14100B` solid, brass/gold border unchanged), grain, and the tonal
  VIGNETTE ALPHAS retuned DOWN (key-pool 0.14→0.20, floor 0.5→0.38, corner 0.82→0.58) so the near-black corners
  don't crush to dead-flat black. Applied in BOTH `AssayGridCanvas.tsx` and `AssayExperience.tsx`.
  - **RAW-LITERAL TRAP swept.** Warm-brown BARE hex/rgba (not `COL.*` tokens) that survive a token rename were
    grepped + fixed: bgGrad mid `#3A2411`→`#20180F`, board falloff far-corner `rgba(90,64,40)`→`rgba(46,36,24)`,
    the page z6 base wash `rgba(74,46,22)/(42,27,14)/(23,14,7)` (old STONE_WARM/STONE_DEEP/INK) → obsidian
    `rgba(44,32,22)/(23,19,16)/(11,10,8)`, dither grain, pilot-dot + copy-button tints. Grep-proven: 0 warm-brown
    hunt-list literal survives live (comments OK). Cyan grep: 0.
- **TILES (§B).** `SPRITE_REF_PX` 128→160 (supersample headroom for the smaller 14×14 tiles). `paintDoubloonCore`
  coin-detail budget re-tuned so the doubloon stays premium at the smaller size: absolute-px floors added to bevel
  width + sun-glyph radius, milled-rim reeds HALVED (~40→~23), hammered dimples DROPPED; glint / energized-ring /
  contact-shadow unchanged (degrade gracefully). Desktop board footprint UNCHANGED (CHROME_RESERVE_PX/MIN_BOARD_PX
  protected — the settled-CTA-below-fold regression stays closed); mobile `MOBILE_TILE_PX = 46` (≥40px tap).
- **WORDMARK (§E).** `wordmark-vault.png` filter chain kept (more correct on black — "engraved gold catching
  torchlight"); the 70px hero mark's outer ambient glow nudged from bone `rgba(237,227,203,0.22)` to warm gold
  `rgba(232,176,61,0.26)` so it doesn't read cool/silver on the near-black scene (the bevel counter-edge stays bone).
- Docblocks/comments rewritten from the stale warm-day premise to the dark obsidian night-temple in both files
  (the recurring pivot-fail trap — stale premise comments encode invariants that silently go false). The last
  warm-day stragglers (the `MOBILE_SCENIC_BAND_PX` header, the `TempleSkyline` "warm dusk sky-glow" docblock, and
  the `bgGrad` "warm stone-floor / deep-brown boardBg" board-bake comment) were cleaned up in the §D
  obsidian-dominant retune pass; a grep for `warm dusk / warm stone / deep-brown / warm scenic / sand`-prose is now
  clean except for legitimate history notes ("was warm-brown …") and the `SAND` muted-text token.

Everything below this section is LEGACY provenance for superseded warm-brown / cool-vault-era assets, kept for history.

---

## AZTEC SUNKEN-GOLD PIVOT (2026-07-04) — superseded by the dark obsidian repalette above

Tim rejected the cold vault/heist theme. THE ASSAY LINE is re-skinned to a warm **Aztec /
sunken-gold treasure-room**. **Higgsfield was OFFLINE this round, so NO new images were generated** —
the pivot ships as a warm recolor + procedural canvas art + interim CSS backdrops:

- **INTERIM WARM BACKDROP (placeholder) — PREMIUM-INTERIM, ELEVATED 2026-07-05 (codotty round 2).**
  `backdrop-vault.png` is still NO LONGER WIRED. The old single flat torch-glow radial was replaced with a
  layered PROCEDURAL scene STACK (still no image asset, still `PREMIUM-INTERIM`, flagged in
  `AssayExperience.tsx`): INK page base (z0) → two stepped-ziggurat SVG temple depth layers (z1/z2,
  `zigguratPath` + `TempleSkyline`, `preserveAspectRatio="none"`) → CSS `TreasureDressing` margin clusters
  (z3, clip-path gold-bar pyramid + the exported `struckDoubloonDataUrl()` coin sprite for provenance,
  rendered ONLY where a real desktop dead margin >= 140px exists — never on mobile) → two `TorchSconce`
  (z4, brass bracket/bowl + a flickering flame bezier + light pool on the shared TORCH_FLICKER rhythm) →
  a tonal vignette layer (z4.5, near-black corner crush + upper-left key-pool boost + lower-right floor
  darken, for real tonal range) → the retuned warm torch wash (z5, now a semi-transparent overlay, not the
  opaque whole scene). This kills the prior "one flat mid-brown everywhere" read while remaining fully
  procedural. **Still a placeholder pending the generated Aztec temple / sunken-hoard illustration**
  (torch-lit stone archway, gold-disc + jade-idol margin dressing, open dark center for the board — the
  "illustrated world frames the board" treatment) to be produced when Higgsfield returns; the generated
  art should replace the whole z1..z5 stack.
- **PROCEDURAL GOLD DOUBLOON TILES.** The board tiles are now drawn PROCEDURALLY (canvas-2D) by
  `paintDoubloonCore` in `AssayGridCanvas.tsx` as the PRIMARY art — hammered gold sun-disc doubloons in
  three states (dormant / struck / cracked), with an Aztec sun-disc glyph carved in jade. The PNG
  sprites `tile-safe-closed.png` / `tile-safe-open-coin.png` / `tile-safe-cracked.png` / `coin-gold-v1.png`
  are **NO LONGER WIRED anywhere** (kept on disk, unreferenced). B1 fix (2026-07-04): the `CoinFly` collect
  animation no longer uses the stock `coin-gold-v1.png` either — it now flies a data-URL snapshot of the
  bespoke struck doubloon (`struckDoubloonDataUrl()` in `AssayGridCanvas.tsx`), so the flying coin and the
  board reveal are provably ONE coin.
- **`plate-specimen.png` dropped** — the header/rail plaques are now warm CSS gradients (no image).
- **Wordmark:** `wordmark-vault.png` is KEPT AS-IS this round (name unchanged; a warm carved-stone/
  gold-leaf wordmark is a later Higgsfield job).

Everything below this section is LEGACY provenance for superseded cool/vault-era assets, kept for history.

---

Skin: **THE DEEP-CURRENT ASSAY** — a pressurized deep-sea electro-refinery. Register = Swoobz
cool/Pulse (ink #07080C / titanium #1a1f26·#3a4250·#6a7384·#8f9aa8 / volt #00F0FF / cyan #29E6FF).
Every asset is 100% cool by construction — ZERO warm/gold/brass in any generated pixel, so the only
brass in the game remains the existing 3-element CSS outer frame (never touching cyan). Generated on
Higgsfield (fal.ai tooling in the skill was mapped to Higgsfield: models_explore→recommend, generate_image,
remove_background for alpha). Provenance discipline per `swoobz-image-prompts-and-assets`.

| File | gen job_id | alpha job_id (remove_background) | Model | Seed | Date | Notes |
|---|---|---|---|---|---|---|
| backdrop.png (2048×1152) | eb297603-e97f-4683-a957-1573272e73aa | — | soul_location | 187393 | 2026-07-03 | KEEP. Abyssal titanium refinery hall, single ascending volt-cyan conduit, cold haze, empty central floor for the board. Full-bleed scene backdrop. |
| coin-proven.png (2048² RGBA) | 30c44cad-7271-4cfa-9128-51dc2412eaa4 | 0f9f6ead-c835-447c-97e6-9224120a7f82 | recraft_v4_1 (utility, 2k) | — | 2026-07-03 | KEEP. Milled titanium bullion, concentric lathe grooves, reeded rim, charged volt-cyan hallmark ring. PROVEN coin sprite. |
| coin-dormant.png (2048² RGBA) | d1672801-11fa-46e4-b3f5-9df7ae05368f | aba3049f-8973-4f40-a147-50dada5ecfc3 | recraft_v4_1 (utility, 2k) | — | 2026-07-03 | SUPERSEDED — see coin-dormant-v2.png below. Kept on disk, unreferenced. Cold tarnished raw ore-slug, matte crust — read as a STONE, not a coin (Tim: "the tiles still read as stones"). |
| coin-dormant-v2.png (2048² RGBA) | (staged by Tim for this revise pass, no Higgsfield job_id recorded here) | — | — | — | 2026-07-04 | KEEP — ACTIVE, wired in `AssayGridCanvas.tsx` (dormant sprite) and `AssayExperience.tsx` (`CoinFly` overlay). Unmistakable struck coin: reeded double rim, minted brushed-steel face, embossed triangle hallmark — same geometry/register as `coin-proven.png` so dormant->proven reads as "the same coin, now charged." Verified zero cyan/volt in the base art (matches CoinFly's cyan-never-touches-brass requirement). |
| wordmark.svg | 3bcc8058-bffb-402a-afbe-2012baec3000 | — (post-processed) | recraft_v4_1 (vector, 2k) | — | 2026-07-03 | KEEP. "THE ASSAY LINE" industrial stencil, titanium faces + cyan top-edge. POST-PROCESSED: full-canvas white bg rect set fill=none (transparent); 12 dark letter faces rgb(26,31,38)→rgb(212,218,226) so it reads on the dark shell. Title lockup. |
| plate-specimen.png (1664×2560) | b6d4e5db-2c79-40f7-acd6-42b98463b78c | — | recraft_v4_1 (utility, 2k) | — | 2026-07-03 | KEEP. Vertical machined titanium instrument panel — 4 hex bolts, recessed sub-panel bay, column of assay socket ports, cyan readout hairline. Side-gutter "specimen case" skin. |
| plate-console.png (2560×1664) | 33d37729-69c7-4d7c-9ba5-9dfce35dc215 | — | recraft_v4_1 (utility, 2k) | — | 2026-07-03 | KEEP. Wide machined titanium bar — hex bolts top/bottom, recessed cyan readout channel, chevron vents. Bet-console / header bar skin. |
| backdrop-hall-v2.png (2048×1152) | 99d364f5-fd92-47ab-a87f-63125b37cd70 | — | soul_location | 622064 | 2026-07-04 | KEEP — Round D RoR-grammar upgrade. Deep-Current assay HALL: glowing volt-teal current-turbine hero motif high-center (NOT a bank-vault door), titanium-bullion + struck-coin stacks dressing the LEFT+RIGHT margins to FRAME the board, large open dark center to seat the 10×10 board. Replicates RoR's illustrated-framing-background grammar in Assay's OWN theme (not a vault clone). One small BRASS fixture wheel bottom-right, far from any teal (brand-cohesion-qa to pixel-verify no cyan-brass contact). Rejected alt 0e630717 (literal vault door + gold coins touching teal conduit = off-theme + brand-law violation). |
| coin-struck-v3.png (512² RGBA) + coin-struck-v3-master.png (1205²) | 9a7739a0-48c2-4b34-8892-0ce878f94fe7 | 5578449f-de3b-4ceb-ac35-f4b107267ee0 | recraft_v4_1 (utility, 2k) | — | 2026-07-04 | KEEP — Round D coin-material redesign for the bigger 10×10 tiles (~70px, was reading as stones). Unmistakable MINTED coin: reeded milled edge, beveled bezel, bold deep-relief 4-blade current-turbine emblem, cool directional specular + one isolated volt-teal rim glint. PIXEL-VERIFIED brass-free: 0 warm/brass px in the cutout (holds the game's zero-brass-in-generated-pixels invariant → zero cyan-brass contact possible). Supersedes coin-dormant-v2/coin-proven for the new scale; art-director derives dormant(dimmed) vs proven(bright) states in-canvas. |

--- VAULT PIVOT (Round D, 2026-07-04) — Tim: "ik wil naar vault kluisjes theme zoals rug." Theme pivoted from Deep-Current undersea-refinery to a bullion-ASSAY DEPOSITORY VAULT in Rug-or-Riches' register (own original, differentiates from sibling originals/vault/). Name KEPT "THE ASSAY LINE" (bullion-vault reading). Surface-split palette: cool gunmetal steel + ink on architecture/tiles; warm gold/brass (#FFC83D/#FFE9A8/#CAA040) ONLY on treasure + fixtures; volt #00F0FF isolated on tech/UI — gold and cyan provably never touch (kept volt OUT of every generated vault asset; it lives only in the UI CSS). Tile reading: closed steel safe -> opens to a gold coin (collect) -> cracked/emptied safe (mine). The Deep-Current assets above (backdrop-hall-v2, coin-struck-v3) are SUPERSEDED for the shipped skin, kept on disk.

| File | gen job_id | alpha job_id | Model | Seed | Date | Notes |
|---|---|---|---|---|---|---|
| backdrop-vault.png (2048x1152) | 7ecbb079-de87-4beb-875a-7f07ce364f50 | — | soul_location | 806458 | 2026-07-04 | KEEP — ACTIVE. Vault-depository scene: steel vault-door hero motif (spoked wheel + assay hallmark), gold-bullion pyramids + coin piles dressing L+R margins, open dark center to seat the 10x10 board. PIXEL-VERIFIED 0 cyan px / 81318 gold px (gold in margins only, zero gold-cyan conflict). Rejected alt 5da5eb18 (garish bright-blue-tile variant). |
| tile-safe-closed.png (512 RGBA) | 50d71f09-20eb-47d0-b21b-6701aeb0c3e4 | 92030f71-71f9-4484-a8eb-16a06aa4ff54 | recraft_v4_1 (utility 2k) | — | 2026-07-04 | KEEP — dormant/unopened tile. Steel safe-door face (combination dial, handle, corner bolts). Post-processed: neutralized a blue cast toward gunmetal (cyanpx 48033->690) to match the neutral open/cracked variants + avoid an over-cyan board. Rejected alt 1acf3e3c (free-standing box with feet, tiles poorly at 100x). |
| tile-safe-open-coin.png (512 RGBA) | 4b8fa846-e578-4a7d-a375-e47fab286698 | ec716304-8631-4569-b817-48c5d0c0ec6d | recraft_v4_1 (utility 2k) | — | 2026-07-04 | KEEP — revealed/proven tile (hero collect). Safe door open, gold coin glowing in the steel cavity. PIXEL-VERIFIED 0 cyan / gold present (gold inside steel, no cyan surface near it). |
| tile-safe-cracked.png (512 RGBA) | dc5083ca-7c5b-4381-a46e-27c75cb53f13 | 1d1c0e6d-059e-4e3b-9ed0-9846d50a9b17 | recraft_v4_1 (utility 2k) | — | 2026-07-04 | KEEP — bad-vein/mine tile. Blown/emptied safe, subtle dull-red crack, dark empty cavity. PIXEL-VERIFIED 0 cyan / 0 gold. |
| wordmark-vault.png (2210x392) | 931680e0-bbf5-4ed9-b0a6-71272d3b2881 (also .svg raw) | — (post-processed) | recraft_v4_1 (vector 2k) | — | 2026-07-04 | KEEP — vault-register "THE ASSAY LINE", steel faces + gold top-bevel. Post-processed: lifted dark letter faces (opaque mean lum ->118) for legibility on the dark header (repeat of the prior dark-face trap). 0 cyan. Rejected first try 6a521584 (cropped final E + mirror reflection). |

Round-D coin deviation note (Deep-Current era): I (fabi) trialled a BRASS-ringed coin first (job ab7cf47b, "coinA") — pixel-check found the teal rim-glint grazing the brass ring (8px true-adjacency) AND it broke the established zero-brass invariant. REJECTED; regenerated fully brass-free (above). On-theme too: Assay's treasure is cool TITANIUM bullion, not gold. Master files kept on disk are the brass-free version.

Verify-before-ship checklist (per skill): register match ✔ (all cool, zero warm) · cyan-warm clean ✔ (coin brass-free pixel-verified; backdrop brass wheel isolated, flagged for pixel-verify) · gold+cyan clean ✔ (no gold) · alpha clean ✔ (coins RGBA colortype 6) · text/watermark clean ✔ · particle/glow clean ✔.

--- POST-STAGING DEFRINGE FIX (game-art-director, 2026-07-04, before wiring into AssayGridCanvas.tsx) ---
Found a visible magenta/pink halo on all 3 tile-safe-*.png before wiring: (1) an alpha-edge chroma-key
despill on the thin anti-aliased rim (fixed via a nearest-opaque-pixel color-extension pass, scipy
distance_transform_edt, alpha channel untouched — silhouette identical); (2) a stronger baked-in
magenta/violet rim-highlight covering the top+left bevel band on tile-safe-closed.png and, more
severely, spanning most of the body on tile-safe-cracked.png (a recraft "app-icon frame" style
artifact, ~1300-3500 px per file, alpha mostly >=250 so NOT an alpha-matte issue — a real painted
color cast) — fixed via HSV hue-desaturation (pink/magenta/purple hue band, sat>=0.12, luma-preserving
grayscale) rather than a neighbor-color swap, since the cast covered too much area for a nearest-pixel
fill to look right. tile-safe-cracked.png's overall tone shifted from pink-tinted-gunmetal to a clean
cool navy-blue-gray as a result — reads BETTER (a genuine "cool gunmetal steel" material) and is the
shipped state. Re-verified post-fix: 0 magenta/pink px on all 3 tiles (was 1321-3471 combined magenta
detections per file before the fix); 30 residual muted teal-ish specular px on tile-safe-closed.png
(desaturated brushed-steel highlight sheen, not a saturated cyan/volt accent — left as-is, consistent
with realistic material rendering, not a brand-law surface). Backups (.bak) were made before editing
and deleted after independent re-verification + a live render pass confirmed the fix.

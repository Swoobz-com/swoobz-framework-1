# THE ASSAY LINE — GRID→196 + DARK OBSIDIAN SWOOBZ REPALETTE (codotty build spec)

Compiled by fabi 2026-07-05 from theme-composer + color-palette-curator + composition-designer (all PASSED).
TWO changes only: (A) grid 10×10→14×14=196 + mine re-tune, (B) repalette warm-brown→dark obsidian Swoobz+gold.
Everything else FROZEN: mechanic, claim-line, cap, multi-line, 3-floor, RoR UI, and ALL shipped premium
elevations (temple/torch/treasure depth, coin relief, win cartouche+bloom+coin-fly, tonal range). Higgsfield
OFFLINE — procedural. Keep name "THE ASSAY LINE". Only originals/assay/ + assay-run/. Zero cyan (hard gold+cyan ban).

## A. GRID → 14×14 = 196 + mine re-tune (assayMath.ts + assayProvider.ts + tests)
- Set `GRID_DIM = 14` (→ `TOTAL_TILES = 196`). Update the docblock's "10×10=100" references to 14×14=196.
- KEY MATH FACT (from the file's own proof): RTP is FLAT-BY-CONSTRUCTION — `T(L)=targetRTP/S(L)`, single final
  floor — and holds for ANY (TOTAL, SAFE) pair. So the grid+mine change is a GEOMETRY/VOLATILITY change, NOT an
  RTP redesign. RTP stays analytic 9650 / measured 9649 on the new grid; verotty proves it BigInt-exact.
- RE-TUNE `TIERS` bombCounts for 196 tiles: preserve each tier's approximate bomb DENSITY (bombs/tiles) so the
  lean<standard<flooded volatility ladder keeps its shape at the bigger grid (current lean=3 on 100 → scale ~×1.96;
  read the exact current standard/flooded counts and scale each proportionally, then pick clean integers). HARD
  CONSTRAINT: safe tiles must stay > MAX_TRAIL(60) on EVERY tier (196 − bombCount > 60, trivially true) so a full
  60-nub trail stays valid and RTP stays flat-by-construction. Do NOT add any max-multiplier clamp (breaks the
  flat-RTP identity). MIN_TRAIL(8)/MAX_TRAIL(60)/TARGET_RTP_BPS(9650)/band(9600-9700) stay.
- Re-record the frozen GOLDEN ladder vectors + re-run assaySim.mjs; update assayMath.test.ts + assayProvider.test.ts
  for the new grid/counts. Tests must go green. TierId ids ('lean'/'standard'/'flooded') + TIER_DISPLAY_LABEL
  (Outer Chamber/Inner Sanctum/Flooded Crypt) UNCHANGED. gridDim in outcome now 14.
- verotty will re-verify RTP BigInt-exact stays flat in 9600-9700 on every tier at 196 tiles.

## B. TILE SIZING for 196 tiles (composition-designer — coins stay legible + premium; mobile tap ≥40px)
- Desktop: the existing `desktopBoardPx = clamp(innerHeight-370, 480, 960)` board footprint is UNCHANGED; at
  GRID_DIM=14 tiles become ~37.9px @1440 (coin 32.6px) / 50.7 @1920 / 68.6 @2560 (coin=0.86×tile). Do NOT grow the
  board panel — CHROME_RESERVE_PX/MIN_BOARD_PX are protected (regrowing reopens a settled-CTA-below-fold regression).
- Mobile: keep `MOBILE_TILE_PX = 46` (≥44 ideal, ≥40 floor met); the existing pan/loupe window absorbs the grid
  growth (board content 460→644). Confirm ≥40px effective tap-target holds.
- Coin-detail budget for `paintDoubloonCore` at the smaller size (so the doubloon stays premium, not a blob):
  bump `SPRITE_REF_PX` 128→160 (supersample headroom); add ABSOLUTE-px floors to bevel width + sun-glyph radius
  (match the pattern the file already uses for claim-thread/contact-ring); HALVE the milled-rim reed count (~40→~22-24);
  DROP the hammered dimples entirely; keep glint / energized-ring / contact-shadow unchanged (degrade gracefully).
- coin-fly + HOARD dial are decoupled from tile size (no change). Claim-line/thread must still read across 196 tiles.

## C. DARK OBSIDIAN + GOLD PALETTE — token map (apply in BOTH files; reuse exact key names)
BASE obsidian ramp (warm-shifted near-black, R>G>B, NOT cool ink/coal/slate, NOT #000, NOT flat/dead):
| key | NEW | OLD |
|--|--|--|
| boardEdge (Grid) | #050403 | #160D06 |
| INK (Exp) | #0B0A08 | #170E07 |
| boardBg / STONE_DEEP (both) | #171310 | #2A1B0E |
| boardBgHi / STONE_WARM (both) | #2C2016 | #4A2E16 |
| CARD_BG (Exp literal) | linear-gradient(160deg,#2C2016,#171310 60%,#0B0A08) | (old warm gradient) |
GOLD family PRESERVED verbatim: gold #E8B04B, goldLight #F6DDA0, goldDark #A67C3E, goldGlow rgba(232,176,61,0.5)
(the hero — contrast ~doubles on obsidian; do NOT change).
TORCH: torchGlow #FF8A42 unchanged; SCONCE_POOL_ALPHA 0.34→0.30 (screen-blend hotter on near-black).
TEMPLE (night): TEMPLE_SKYGLOW_HI rgba(150,96,40,0.40) [was rgba(96,60,28,0.62)], TEMPLE_SKYGLOW_MID
rgba(110,72,32,0.20) [was rgba(66,41,20,0.32)], TEMPLE_NEAR_FILL #1C1108 [was #241608 — re-spaced vs new INK #0B0A08
to avoid same-hex invisible-temple bug], TEMPLE_FAR_FILL #38240F [was #3E2812], TEMPLE_RIM_STROKE alpha .42→.50
(rgba(214,168,100,0.50)). TEMPLE_*_OPACITY unchanged.
CARTOUCHE: CARTOUCHE_BG linear-gradient(160deg,#2C2016 0%,#1C150F 55%,#100C08 100%) [was warm-brown];
CARTOUCHE_BG_SOLID #14100B [was #3A2513]; brass/gold border+inset stops UNCHANGED.
TONAL VIGNETTE (AXIS 3) — RETUNE ALPHA ONLY (anti-dead-black lever; colors already correct):
KEY_POOL_BOOST_ALPHA 0.14→0.20, FLOOR_DARKEN_ALPHA 0.5→0.38, CORNER_VIGNETTE_ALPHA_MAX 0.82→0.58.
GRAIN: grain rgba(196,150,86,0.045) [was rgba(168,122,74,0.07)].
UNCHANGED (already correct on obsidian, AA-audited): BONE #EDE3CB, SAND #B8A688, BLOOD #EF5A3F, bloodDark1/2,
thread, HAIRLINE, BRASS_DARK/MID/LIGHT, ACCENT_NUM #00B00E (green not cyan, <32px numerals only),
jade #1FA67A / jadeLight / jadeDark, jadeMuted #2C7A5A (its contrast partner is GOLD not the base — leave as-is).

### C-CRITICAL: RAW-LITERAL TRAP (theme-composer flagged — do NOT rely on token rename alone)
Some warm-brown values are BARE hex/rgba literals, NOT COL.* tokens — they survive a token-only rename and leak
day-brown through gradients. GREP both files for raw hex/rgba (not just `COL.`) and fix at minimum:
- `AssayGridCanvas.tsx` L~1169 `bgGrad` mid-stop `'#3A2411'` → a new obsidian mid (e.g. ~#20180F between STONE_DEEP/STONE_WARM).
- `AssayGridCanvas.tsx` L~1227 `falloff` far-corner `'rgba(90,64,40,1)'` → a darker obsidian (~rgba(46,36,24,1)) so the
  board-wide light-falloff crushes to obsidian, not brown.
After the swap, grep both files for any remaining warm-brown literals (#2A1B0E/#4A2E16/#241608/#3E2812/#5C3B1D/#402917
etc.) and confirm none survive live (comments OK).

## D. DOCBLOCK / COMMENT REWRITE to NIGHT (stale warm-day premise = the recurring pivot-fail trap)
Rewrite these warm-day docblocks/comments to the dark obsidian night-temple (keep gold/brass MATERIAL comments):
- AssayExperience.tsx L1-22 (top docblock "torch-lit gold-hoard chamber... deep-brown stone bed"), L90-97 (palette
  block "AZTEC SUNKEN-GOLD... deep-brown stone bed"), L134-138 (PLATE_SPECIMEN "plain brown gradient"), L207-221
  (TEMPLE_SKYGLOW/NEAR/FAR "warm dusk sky-glow"), L251-255 (CARTOUCHE_BG "brighter warm carved-stone"),
  MobileScenicBackdrop docblock (~L3206-3214 "warm scenic chamber").
- AssayGridCanvas.tsx L1-13 (top docblock "warm torch-lit stone chamber — deep brown board bed"), COL block L89-113
  (boardBg/boardBgHi "warm stone-floor bed... umber lift").
Update assets/PROVENANCE.md to note the dark obsidian night-temple repalette + the 196 grid.

## E. WORDMARK (on dark, go warm/gold — Tim OK'd)
Keep the existing filter chain + bevel logic (`sepia/saturate/hue-rotate/brightness + drop-shadow`) — it becomes MORE
correct on black ("engraved gold catching torchlight"). One check: on near-black the 70px hero mark's bone-toned
ambient glow may read faintly cool/silver — if so, nudge that GLOW warm/gold (not the wordmark filter). Do NOT ship a
cool-silver-reading wordmark on the dark scene.

## PRESERVE (do NOT regress)
Mechanic (coin-collection/claim-line/cap/multi-line/3-floor), RoR transparent-blocks UI architecture, and ALL shipped
elevations: temple/torch/treasure background DEPTH (desktop margins + mobile scenic header band), coin relief
(struck material/rim/bevel/glint/energized-ring/contact-shadow — only reeds↓/dimples-dropped/glyph-floor per §B),
the win cartouche + board bloom + coin-fly, the tonal range, the machined HOARD dial at rest, CoinFly provenance.

## DEFINITION OF DONE (codotty self-check before verifiers)
- typecheck clean; tests green (updated for grid — state count); RTP flat in 9600-9700 on all 3 tiers at 196 (verotty confirms BigInt-exact).
- cyan grep `#00F0FF|#29E6FF` = 0; warm-brown-literal grep = 0 live (comments OK); base reads dark obsidian, gold pops.
- Fresh screenshots desktop 1440 + mobile 412: dark obsidian night scene + gold-hero coins on a 14×14 board + temple/torch/treasure reading on the dark + win cartouche(dark obsidian+gold)+bloom; corners NOT dead-flat-black (vignette retune); mobile tap ≥40px.
- Grid=14 everywhere; TierId/labels/mechanic/UI/elevations intact; name kept; docblocks rewritten to night.

# THE ASSAY LINE — AZTEC SUNKEN-GOLD BUILD SPEC (codotty implementation brief)

Compiled by fabi 2026-07-04 from 5 PASSED design specs: theme-composer (`AZTEC-GOLD-THEME-SPEC.md`),
color-palette-curator, material-surface-designer, lighting-designer, audio-design-director.
This is the single source of truth for the build. Where this file and any run log disagree, THIS file wins
(it carries fabi's cross-spec reconciliation decisions).

## 0. WHY / GOAL
Tim rejected the vault/heist/kluisjes theme ("geen heist, niks met kluizen, te grijs, niet satisfying").
Pivot THE ASSAY LINE to a warm **AZTEC / SUNKEN-GOLD treasure-room** (Gonzo's Quest / Aztec gold /
Uncharted). Warm brown + gold + jade, NO grey. The tiles ARE gold doubloons (NO safes). Priority word,
repeated by Tim: **SATISFYING**.

## 1. SCOPE — KEEP UNTOUCHED (hard guardrails)
Do NOT change any of these — only the SKIN/color/vocabulary/coins/backdrop/juice/audio change:
- The coin-collection mechanic: paint a claim-line of tiles during planning → commit/plunge ONCE →
  reveal bead-to-bead → all-or-nothing (win ceiling multiplier if whole line clears, bust to 0 on a bad
  tile), NO cash-out.
- claim-line, cap, multi-line, the 3-floor difficulty selector, flat ~96.5% RTP each tier.
- `assayMath.ts` and ALL math. The 10x10 board / grid dimensions. Do NOT touch — grid is unchanged, so no
  RTP re-verify is triggered this round.
- Internal ids: `TierId` (`'flooded'` etc.), `phase.kind`, engine ids, component names, provider logic.
- The RoR-style transparent stacking-block UI STRUCTURE (approved layout) — only its skin/color goes warm.
- Tests must stay green: 185/185. typecheck clean.
- Sibling `originals/vault/` (Rug or Riches) — do not touch, do not clone its vocabulary.

## 2. NAME DECISION (fabi ruling)
**KEEP "THE ASSAY LINE" this round.** theme-composer recommends keeping (assay = gold-purity testing,
historically apt; "hallmark" survives). A rename to "THE SUN STONE LINE" was PROPOSED but is NOT approved —
Tim must confirm any rename via fabi first. So: do NOT change the wordmark, name, or any identifier this
round. (The wordmark asset stays as-is; it's a later Higgsfield job anyway.)

## 3. PALETTE — token role map (near-mechanical swap)
Apply in BOTH `AssayGridCanvas.tsx` (`COL` object L328-348) AND `AssayExperience.tsx` (const block
L359-389). Keep the two files' gold family IDENTICAL. After the swap, grep both files for `#00F0FF` and
`#29E6FF` and confirm ZERO cyan survives.

### 3a. AssayGridCanvas.tsx `COL`
| COL key | NEW value | replaces |
|---|---|---|
| boardBg | `#2A1B0E` (Tim BASE) | `#0D0F15` coal |
| boardBgHi | `#4A2E16` (warm torch corner-spill) | `#161A23` slate |
| boardEdge | `#160D06` (carved shadow-line) | `#1a1f26` |
| grain | `rgba(168,122,74,0.07)` (warm sandstone, SAME 0.07 alpha) | `rgba(106,115,132,0.07)` |
| gold | `#E8B04B` (Tim GOLD — energized/interactive body) | `#FFC83D` |
| goldLight | `#F6DDA0` (glint/2-stop highlight) | `#FFE9A8` |
| goldDark | `#A67C3E` (dim dormant rim) | `#CAA040` |
| goldGlow | `rgba(232,176,61,0.5)` | `rgba(255,200,61,0.5)` |
| blood | `#EF5A3F` (warm ember-terracotta loss) | `#ff4135` |
| bloodDark1 | `#2a1a1c` KEEP | — |
| bloodDark2 | `#120a0b` KEEP | — |
| bone → cream | `#EDE3CB` (warm parchment text; 13:1 on boardBg) | `#F2F3EF` |
| fog → sand | `#B8A688` (warm stone-tan muted text; 7:1) | `#98A1B3` |
| thread | `rgba(237,227,203,0.55)` — see §7 jade note | `rgba(242,243,239,0.55)` |
| accentNum | `#00B00E` KEEP (see §7) | — |
| **jade** NEW | `#1FA67A` (Tim JADE — see §7 bounded role) | — |
| **jadeLight** NEW | `#4FD9A8` | — |
| **jadeDark** NEW | `#0F5B42` | — |
| **torchGlow** NEW | solid `#FF8A42` / vignette `rgba(255,138,66,0.35)` / flare-peak `rgba(255,138,66,0.6)` — ATMOSPHERE ONLY, never on chrome or coin body | — |
DROP ENTIRELY (delete the keys or re-point every use): `steelDark`, `steelMid`, `steelLight`. Kill every
cool grey value.

### 3b. AssayExperience.tsx consts (converge with COL)
INK `#170E07` | COAL `#2A1B0E` (= boardBg) | SLATE `#4A2E16` (= boardBgHi) |
STEEL_DARK→BRASS_DARK `#3D2611` | STEEL_MID→BRASS_MID `#8C6530` | STEEL_LIGHT→BRASS_LIGHT `#C79A5C` |
FOG `#B8A688` | BONE `#EDE3CB` | BLOOD `#EF5A3F` | GOLD `#E8B04B` | GOLD_LIGHT `#F6DDA0` |
GOLD_DARK `#A67C3E` | ACCENT_NUM `#00B00E` KEEP |
CARD_BG `linear-gradient(160deg,#4A2E16,#2A1B0E 60%,#170E07)` |
STEEL_BTN→BRASS_BTN `linear-gradient(#C79A5C,#8C6530)` | STEEL_BTN_DIM→BRASS_BTN_DIM `linear-gradient(#8C6530,#3D2611)` |
HAIRLINE `rgba(255,255,255,0.08)` KEEP (theme-neutral) | FRAME_HAIRLINE `rgba(202,160,64,0.4)` KEEP (already warm brass — the north star the rest matches).
You may keep the STEEL_* token NAMES as internal aliases if a rename is churny, but every VALUE must become
the warm hex above. Prefer renaming to BRASS_* if low-risk.

## 4. VOCABULARY (from AZTEC-GOLD-THEME-SPEC.md — read it for the full table)
Display-only renames (never touch internal ids). Key ones:
- `VAULT FLOOR` → `TEMPLE DEPTH` (the tier/floor selector header)
- box / boxes → disc / discs; deposit line → claim line
- `TALLY` → `HOARD`; `LINE SECURED` (both sites) → `LINE CLAIMED`
- Tier display labels (`TIER_DISPLAY_LABEL` only, NOT `TierId`): Lean/Standard/Heavy Floor →
  `Outer Chamber` / `Inner Sanctum` / `Flooded Crypt` (nice: internal id `'flooded'` now literally fits)
- `◆ GLASS BOX CERTIFICATE` heading → `◆ SUN-STONE RECKONING` (display heading only; "Glass Box" stays the
  internal/house concept elsewhere)
- `PLAY SAFE` link + all RG safety copy: KEEP (informational safety surface, do not theme away)
The mechanic must stay learnable from the strings alone (paint line → commit → all-or-nothing).

## 5. PROCEDURAL GOLD DOUBLOON TILES (canvas-2D — the tiles ARE coins, no safes)
Higgsfield is OFFLINE — draw the coins PROCEDURALLY as the PRIMARY tile art. REPLACE
`paintSafeClosedFallback`/`paintSafeOpenFallback`/`paintSafeCrackedFallback` (L486-544) + `bakeSafeSprite`
(L574-616), and DELETE the four PNG `Image()`/`.decode()` imports (`tile-safe-closed.png`,
`tile-safe-open-coin.png`, `tile-safe-cracked.png`, `coin-gold-v1.png`) and the decode/fallback duality —
there is no "real art" to wait for. Rename sprite-cache keys `closed/open/cracked` → `dormant/struck/cracked`.
Bake once into the sprite cache at `SPRITE_REF_PX=128`, NEVER per-frame per-tile.

ONE shared function, states as diffs (never three different coins):
```
paintDoubloonCore(ctx, sz, state: 'dormant'|'struck'|'cracked')
  cx=sz/2, cy=sz/2, r=sz*0.43
```
Layers, bottom→top:
- (a) Contact shadow (see weight §5.5), drawn under the disc.
- (b) Base disc radial gradient, center offset toward torch key UPPER-LEFT
  `createRadialGradient(cx-r*0.32, cy-r*0.34, r*0.05, cx, cy, r*1.05)`:
  stop0 = goldLight~50%→gold (soft dome sheen), stop0.55 = `#E8B04B`, stop1 = `#A67C3E`. arc fill r.
- (c) Milled rim: two concentric dashed circular strokes. `setLineDash([r*0.09, r*0.055])` (~40 wide reeds
  — heavy gauge). Shadow face stroke `#A67C3E` lineWidth r*0.05 at r*0.965; light face stroke `#F6DDA0`
  lineWidth r*0.025 at r*0.99 with `lineDashOffset=r*0.05` (half-dash so it lands on the reed light edge).
- (d) Raised bevel collar: arc-clipped ring at r*0.90, upper-left 180° arc `#F6DDA0`, lower-right 180° arc
  `#A67C3E`. lineWidth struck r*0.06, dormant r*0.035 (thickness = weight cue).
- (e) Center relief glyph = Aztec SUN-DISC (center boss r*0.22 + 8 alternating long/short triangular rays,
  readable at ~25px). Carve in jade, 3-pass recess: (1) dark `#0F5B42` copy offset (sz*0.012, sz*0.016) =
  carved shadow; (2) true-position `#1FA67A` body inlay at r*0.94; (3) `#4FD9A8` light-edge stroke CLIPPED
  to the upper-left half (arc 200°→20°). Tiny `#A67C3E` center punch-dot r*0.05 = "struck not painted".
- (f) Specular glint, AFTER glyph, `globalCompositeOperation='lighter'`: hotspot translate to
  (cx-r*0.32, cy-r*0.38), rotate -40°, scale(1,0.55), radialGradient goldLight `rgba(246,221,160,0.85)`→0
  over r*0.5. Plus a thin curved sweep streak (arc r*0.65, 200°→260°, goldLight 0.6 peak, lineWidth r*0.06,
  round cap). Direction UPPER-LEFT — MUST match board torch key (see §6).

State deltas (ONE material, value+glint only):
- DORMANT: base gradient plain gold→goldDark (no goldLight blend), bevel r*0.035, glyph edge alpha 0.4,
  glint hotspot alpha 0.25 radius r*0.35, NO sweep streak. (~1 dim static element.)
- STRUCK (hero): full stops, bevel r*0.06, glyph edge alpha 0.85, glint hotspot alpha 0.85 radius r*0.5,
  sweep streak present, PLUS one outer standing ring r*1.06 `rgba(232,176,61,0.35)` goldGlow
  `lighter` = the "revealed/energized" marker. (~3 bright elements, ~2x rim width vs dormant.)
- CRACKED/dud: `ctx.filter='saturate(0.35) brightness(0.75)'` over base+glyph (tarnished); single flat
  desat bevel; keep only goldDark rim dash; glyph jadeDark fill only no light edge; NO glint/sweep; a
  deterministic mulberry32(tileIdx)-seeded 2-3 segment ember `#EF5A3F` fracture (reuse the file's existing
  bad-vein crack technique) with a soft radial ember glow `rgba(239,90,63,0.35)`→transparent r*0.6 UNDER
  the crack, danger accent shows only through damage.

## 5.5 WEIGHT / SATISFACTION levers (tie to existing juice, don't invent timelines)
1. Two-part shadow: the §6 board "socket hollow" (soft wide ambient) PLUS a tight sharp contact-shadow
   hugging the disc lower-right rim (offset dx=r*0.08, dy=r*0.10, ellipse scaleY≈0.55, alpha 0.45→0).
2. Bevel collar thickness struck r*0.06 vs dormant r*0.035 = highest-leverage "thick coin" cue.
3. Rim chunkiness: ~40 wide reeds not 70+ thin ones.
4. Glint CONTRAST (tight hot core vs darker mid-body), not just brightness.
5. Wire REVEAL_POP to the material: during REVEAL_POP_MS(260)/REVEAL_POP_PEAK(1.11)/popScale window, apply
   one-shot `ctx.filter='brightness(1.15)'` composite of the STRUCK sprite around REVEAL_POP_PEAK_T(0.6),
   and feed the same popScale into the contact-shadow alpha/offset so it tightens as the coin "lands".
   Reuse the existing curve — no new timers.

## 6. LIGHTING (canvas/CSS; torch key = UPPER-LEFT — fabi-resolved)
RECONCILIATION (do this exactly): the coin material is built UPPER-LEFT. RELOCATE the existing board
`bgGrad` radial hotspot from its inherited upper-right coords (`dims.w*0.74, boardAreaH*0.06`) to
UPPER-LEFT (`~dims.w*0.28, boardAreaH*0.22`) so the room light and the coin glints agree. Everything below
is upper-left.
- Torch KEY: upper-left, torchGlow amber, expressed as the relocated bgGrad radial hotspot hottest
  top-left fading to boardBg at edges (re-verify banding on the warm gradient — the old anti-band mid-stop
  was tuned for cool coal/slate; add/adjust a warm mid-stop + keep the existing dither if banding appears).
- Ambient FILL: deep boardBg `#2A1B0E` brown everywhere the torch doesn't reach; vignette pools darker
  lower-right (`rgba(20,16,10,0.22)`), per the material board-surface recipe (radial at w*0.28,h*0.22).
- Gold SPECULAR/rim: the coin glint layer (§5f) is the metal-catching-light source; dormant low goldDark
  rim vs struck bright goldLight glint = the legible dormant/struck delta (~alpha 0.42 static vs 0.85+
  animated, ~2x rim width).
- TORCH-FLARE on reveal: bounded ONE-SHOT additive `lighter` torchGlow flare-peak wash synced to the
  existing `u = age/REVEAL_POP_MS` timeline (260ms), single pass (no loop). New module-const `TORCH_FLARE_*`.
  RG-C5 fixed — identical regardless of coin value/streak.
- AMBIENT BREATHING: slow torch flicker on the backdrop vignette at ~0.06Hz (explicitly slower than and
  distinct from BEAD_PULSE_HZ=2.2), tiny amplitude, well under 3Hz. New module-const `TORCH_FLICKER_*`,
  RG-C5 fixed (never derived from game state).

## 6.5 INTERIM WARM BACKDROP (flag clearly as INTERIM)
Higgsfield is OFFLINE so the illustrated temple/hoard scene cannot be generated this round. Build an INTERIM
CSS/canvas warm backdrop: a torch-glow radial/linear gradient (boardBg → boardBgHi → torchGlow washes) with
a warm vignette framing the board, replacing the old `backdrop-vault.png` reference in `AssayExperience.tsx`.
- Add a clear `INTERIM:` code comment AND a note in `assets/PROVENANCE.md` stating this backdrop is a
  placeholder pending a generated Aztec temple/sunken-hoard illustration (the RoR "illustrated world frames
  the board" treatment) to be produced when Higgsfield returns.
- Do NOT leave the old steel-vault-door backdrop PNG wired in.

## 7. JADE + accentNum reconciliation (fabi ruling)
- **accentNum: KEEP green `#00B00E`** for small (<32px) numeral/monetary readouts (palette-curator's WCAG/
  legibility argument wins: numerals must pop OUT against gold/brass/brown; green is the one hue that stays
  a distinct legible number there; folding into gold/jade would blend). It is the theme-agnostic OLED-bloom
  exception, numerals ONLY.
- **jade `#1FA67A` bounded role** (theme-composer + palette-curator agreed): (1) the carved sun-disc glyph
  inlay on the doubloons (§5e), and (2) the "queued / not-yet-revealed / armed" claim-line marker — i.e.
  reassign the claim-thread + pinned-ring "marked" role that is currently BONE/cream over to jade
  (jade = "this is the line you're arming"). That's a meaningful, bounded 2nd-accent job. Nothing else.
- Keep jade and accentNum-green on NON-OVERLAPPING surfaces (jade on board canvas glyph/thread; accentNum
  on HUD numerals). If they collide in one view, keep accentNum green for numerals and pull jade back.
- Update `thread` usage accordingly (the claim-thread color moves bone→jade); the token `thread` value in
  COL can stay cream for any remaining bone use, but the queued-line marker draws in jade.

## 8. AUDIO — warm Aztec revoice (assayAudio.ts, all 4 cues; RG-C5 preserved)
Extend private `click(centerHz,q,gain,ms, delayS=0)` with an optional 5th delay param (mirrors `tone`'s
existing delayS; existing 4 call sites default to 0, byte-unchanged; RG-C5 governs exported cue signatures,
not private helpers). Rename consts + swap values; sweep docblock vocab (strike steel/electric/bolt/vault/
tumbler → temple/torch/stone/gold/coin/hoard).

1. `playPlungeThunk` (temple-door commit): TUMBLER_CLICK→TORCH_WHOOSH (HZ 650, Q 0.6, VOL 0.16, MS 70) +
   BOLT_THROW→STONE_THUNK (HZ 130→48, WAVE 'triangle' NOT square, VOL 0.30, MS 220, FILTER lowpass 180/Q0.8,
   DELAY 0.03).
2. `playBead(deltaBps)` (warm gold coin-clink): PRESERVE clamp→norm→freq body VERBATIM. BEAD_CLICK→
   COIN_LAND_CLICK (HZ 1800, Q 6, VOL 0.05, MS 9); BEAD_GAIN 0.065, BEAD_MS 110, BEAD_HZ_BASE 750,
   BEAD_HZ_SPAN 320, BEAD_OVERTONE_RATIO 2.24, OVERTONE_GAIN_MULT 0.3, OVERTONE_MS_MULT 0.4.
   BEAD_ECONOMIC_CAP_BPS=4000n UNCHANGED.
3. `playBadVein` (dry stone/clay dud): BREACH_CRACK→STONE_CRACK (HZ 500, Q 0.9, VOL 0.26, MS 20) +
   VAULT_BREACH→HOLLOW_THUD (HZ 110→25, WAVE 'triangle', VOL 0.28, MS 150, FILTER lowpass 160/Q0.7,
   DELAY 0.01). Envelope/hard-stop decay unchanged (re-timbre only).
4. `playClaim` (gold cascade + coin-settle; HIGHEST RG-C5 — bit-identical per win size):
   SEAL_CLICK→COIN_SETTLE_CLICK (HZ 1600, Q 5, VOL 0.08, MS 12); CLAIM_NOTE_VOL 0.12, CLAIM_NOTE_MS 520,
   CLAIM_SHIMMER_RATIO 1.5, SHIMMER_GAIN_MULT 0.28, SHIMMER_MS 110; CLAIM_NOTES=[[294,0],[392,0.11]]
   (octave down). NEW fixed cascade: GOLD_CASCADE_CLICK_COUNT=4 (literal, NEVER derived from trail/payout),
   GOLD_CASCADE_HZ=[2200,1900,1600,1300], GOLD_CASCADE_Q=3, GOLD_CASCADE_VOL=0.05, GOLD_CASCADE_MS=40,
   GOLD_CASCADE_DELAYS=[0,0.05,0.095,0.135]. Loop indexed only by fixed i. Confirm total duration + gain
   envelope byte-identical for a 2-tile claim and a full-board claim.

## 9. DOCBLOCK / COMMENT SWEEP (critical — this failed 2 gates last pivot)
Both `.tsx` files + `assayAudio.ts` carry dense STALE lore: "DEEP-CURRENT ASSAY", "VAULT PIVOT", "volt/cyan",
"steel bolt-throw", "gold never touches cyan", "NOTHING gold survives on the board", the safe-state
narrative. ALL of it is now FALSE. Rewrite the docblocks to describe the Aztec sunken-gold treasure theme,
the procedural doubloon tiles, jade's bounded role, and the warm palette. Do not leave a stale design-law
comment declaring an old premise (that exact root cause re-failed the last pivot across two rounds).

## 10. DEFINITION OF DONE (codotty self-check before handing to verifiers)
- [ ] typecheck clean; 185/185 tests green.
- [ ] `grep -E "#00F0FF|#29E6FF"` both tsx files → ZERO cyan.
- [ ] `grep -iE "steel|coal|slate|fog|vault|safe|volt|cyan|deep.current"` → only intentional survivors
      (bloodDark warm-neutrals, internal TierId 'flooded', house "Glass Box" concept) — no stale skin lore.
- [ ] Board renders GOLD DOUBLOONS (dormant/struck/cracked), provably NOT safes; no PNG safe sprite wired.
- [ ] Warm brown board + torch vignette (upper-left key); interim backdrop flagged INTERIM in code+PROVENANCE.
- [ ] Warm audio (torch whoosh / coin clink / stone dud / gold cascade); zero electric/steel voicing.
- [ ] RG-C5 intact: new TORCH_FLARE_*/TORCH_FLICKER_* + all audio consts are literal module-consts; playClaim
      bit-identical per win size; no per-frame per-tile allocation; board not shrunk; mechanic/grid/math/ids
      untouched.
- [ ] Name kept "THE ASSAY LINE"; no wordmark/identifier change.

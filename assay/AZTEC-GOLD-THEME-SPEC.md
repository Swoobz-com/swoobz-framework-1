# THE ASSAY LINE — Aztec Sunken-Gold Theme Specification
theme-composer · 2026-07-04 · supersedes the VAULT PIVOT skin declared in `AssayExperience.tsx` L183-296 and `AssayGridCanvas.tsx` L160-198

Grounded against the ACTUAL current source (not the stale docblock narrative): `AssayExperience.tsx` (3212 lines) and `AssayGridCanvas.tsx` (full read), both read directly, plus `assayProvider.ts`/`assayMath.ts`/`assayProvider.test.ts` for internal-id boundaries, plus `assets/PROVENANCE.md` for the exact asset files in play. Cross-checked `originals/vault/` and 3 other Originals to confirm which house terms are cross-game infra vs this game's own copy (see item 4).

Mechanic UNCHANGED per brief: paint a claim-line of tiles during planning -> commit once -> reveal tile-by-tile -> all-or-nothing (ceiling multiplier if the whole line clears, bust to 0 on a bad tile, no cash-out) -> claim-line, cap, multi-line, 3-floor difficulty selector (flat ~96.5% RTP each), 10x10 board, transparent stacking-block UI structure. Only the skin/theme/color/vocabulary changes.

---

## 1. THEME SENTENCE

> A torch-lit gold-hoard chamber sunk beneath a jungle temple, where the player kneels at a low carved-stone ledge tracing a claim-line across a floor of a hundred hammered sun-discs before pressing a jade-set stone key that runs the whole line at once.

This is a Piedra del Sol treasure-floor, not a generic "ancient ruins" or "fantasy temple" — the tiles ARE the treasure (hammered gold sun-discs set into stone sockets), the fairness seal reuses a real assay hallmark motif, and the atmosphere is permanently torch-lit underground (no daylight ever implied) so nothing reads as an outdoor "jungle adventure" scene. A fresh player should say "this is a sunken Aztec gold-hoard chamber," not "this is a gold slot" or "this is a vault game."

## 2. THREE FEELINGS + cultural references

1. **"The held breath before pressing the stone key that will run torchlight down the entire marked line at once — no take-backs."** (the commit beat — mechanically homologous to the actual `plungeKey()` no-cash-out design)
2. **"The bright ring of a struck gold disc catching torchlight as it flips open in its stone socket, one by one, down the line you traced."** (the reveal cascade)
3. **"The dry stone-on-stone scrape of a hidden dart-trap disc cracking open dark instead of gold — the whole line gone cold in one beat."** (the bust beat)

Named references (specific scenes/works, not categories):
- **Gonzo's Quest (NetEnt)'s idol-and-torch establishing shot** — the stone board sits inside a hand-painted jungle-temple proscenium lit by Gonzalo's own torch, warm amber/stone/moss palette, zero neon. This is the composition-grammar anchor: an illustrated stone-temple frame around a mechanically-central board, exactly the "illustrated world frames the board" treatment the brief calls for.
- **Uncharted: Drake's Fortune's El Dorado reveal** — a single shaft of light falling on a stone-chamber floor covered in gold coins; the coins ARE the hero prop, not set-dressing. This is the reveal-beat anchor: the "LINE CLAIMED" win moment should read like this shot, not like a UI meter filling up.
- **The Aztec Calendar Stone (Piedra del Sol) motif** — a concentric-ring carved sun face as the disc/coin glyph. This is the coin-face anchor: every dormant AND proven disc should read as a carved sun-glyph coin, never a blank circle or a generic "gold coin" clipart.

## 3. ON-SCREEN / OFF-SCREEN map per phase

### LOBBY
ON-SCREEN: (1) full-bleed stone-archway backdrop with an open dark center reserved for the board — reuses the EXISTING structural pattern (`backdrop-vault.png`'s "open dark center to seat the 10x10 board," PROVENANCE.md L26) with entirely new Aztec content; (2) gold-disc and jade-idol treasure piles banked on stone plinths along BOTH page margins (replaces the vault-door's bullion-pyramid margins with the same dressing ROLE); (3) two torch sconces flanking a carved stone lintel at the top of frame, supplying the scene's key light; (4) the wordmark as a carved-stone/gold-leaf-fill lockup, hero-sized, center.
HUD-in-scene: the collapsed header nameplate reads as a carved stone plaque set into the archway lintel (was the steel `PLATE_CONSOLE` bolted-panel bar); the balance readout reads as a small hammered-gold scale-disc.
OFF-SCREEN: the torchlit corridor the player entered through, implied above/behind frame; deeper unexplored chambers implied through a receding dark archway at the rear of the scene; the jungle above ground, hinted only by a root/vine tendril breaking through a ceiling crack in one corner — never a sky, never daylight.

### PLANNING
ON-SCREEN: (1) the 10x10 board as a floor of 100 carved stone sockets each holding a dormant, dim hammered-gold disc; (2) the right-gutter rail recast as a standing carved-stone stela beside the board (was the steel rail casing); (3) the claim-thread linking marked discs as a thin JADE inlay vein (see accent map, item 5); (4) a torch-glow vignette pooling warm light across the near edge of the floor from an off-panel source.
HUD-in-scene: the TEMPLE DEPTH selector (was VAULT FLOOR) renders as three carved relief registers on the stela, each showing its own trap-count and multiplier ceiling — the SAME `TierRow`/`TierChip` components, new copy only (item 4).
OFF-SCREEN: the trap mechanism under the floor that will later crack a disc open dark — implied only by the crack geometry when it happens, never shown in advance (RG-C3: bad tiles are never drawn during planning); the far side of the stone floor beyond the visible 10x10 extent, implied by the socket pattern continuing to the frame edge.

### ASSAYING (the live reveal cascade)
ON-SCREEN: (1) the current-bead as a travelling torch-ember tracing disc-to-disc down the claim-line; (2) each revealed disc flipping open to the hero "hammered sun-disc catching torchlight" art; (3) the coin-fly-to-hoard readout as a disc physically lifting off its socket and arcing to a stone weighing-scale icon; (4) on a bust, a stone-dust micro-shake plus a crack-line motif radiating from the cracked disc (keep the existing crack GEOMETRY/timing constants, recolor only — see item 5).
HUD-in-scene: the HOARD dial (was ASSAY TALLY) reads as a carved stone weighing-scale gauge with a gold needle.
OFF-SCREEN: the rest of the temple's structural weight pressing down above the chamber ceiling, implied by ambient dust motes catching the torchlight but never a visible ceiling collapse; the sealed passage the player will exit through after settling, implied by a dark doorway at screen edge, never entered mid-round.

### SETTLED
ON-SCREEN: (1) on a win, a single beam of torch-light widening across the whole claimed line (the Uncharted-reveal-beat callback) while the line's discs hold a standing gold glow; (2) the fairness receipt as a warm gold-leaf-on-stone medallion/tablet (was the cold steel struck-hallmark seal) — see item 4 for the exact display-string rename; (3) on a bust, the chamber dims and a stone-dust plume drifts once across the board, the cracked disc still faintly smoking.
HUD-in-scene: ASSAY AGAIN / CLOSE remain carved-stone lever affordances, same components, new material only.
OFF-SCREEN: the NEXT chamber depth implied by the TEMPLE DEPTH stela remaining visible and re-selectable beside the settled board — the player is invited to go deeper, not shown a new scene yet.

---

## 4. OLD -> NEW VOCABULARY TABLE

Legend: **[DISPLAY]** = user-visible string, safe to change. **[INTERNAL — DO NOT CHANGE]** = engine id/type/component-name/file/slug; renaming would touch math/mechanic/grid/ids, out of scope per the brief.

### Internal ids confirmed untouched (grounding, not action items)
| id | where | note |
|---|---|---|
| `TierId = 'lean' \| 'standard' \| 'flooded'` | `assayMath.ts:96` | **[INTERNAL]** keep exactly |
| `TIER_ORDER = ['lean','standard','flooded']` | `assayMath.ts:117` | **[INTERNAL]** keep |
| `phase.kind` = `'lobby'\|'planning'\|'assaying'\|'bad-vein'\|'settling'\|'settled'` | `assayProvider.ts` | **[INTERNAL]** keep |
| `TIERS[].label` = `'Lean vein'/'Standard vein'/'Flooded vein'` | `assayMath.ts:111-113` | **[INTERNAL]** — comment on file says "reference-skin placeholder; theming owns final copy," never rendered (TIER_DISPLAY_LABEL is authoritative) — leave as-is |
| Component/function names (`BreakerLever`, `CurrentKey`, `CalibKnob`, `CalibToggle`, `TierRow`, `TierChip`, `QuickChip`, `TallyDial`, `Odometer`, `BalanceDial`, `SessionMeta`, `HallmarkSeal`, `BoardSweep`, `HeroPopCallout`, `RailShell`, `RailRow`, `Panel`, `IntroCoachmark`, `SafetyLink`, `SafetyPanel`, `bakeSafeSprite`, `paintSafeClosedFallback`, etc.) | both files | **[INTERNAL — CODE]** these are identifiers, not vocabulary; only their rendered *labels/children/aria-text* change below |
| `plungeKey()`, `assayMath.ts`, `assayProvider.ts`, `assayAudio.ts`, folder `originals/assay/`, slug `assay` | — | **[INTERNAL]** untouched per brief |
| "Glass Box" (the receipt concept) | cross-game: `vault`, `oo_rei`, `oo_fisher`, `pulse`, `assay` (verified via grep, all 5 games use this term in code/comments) | **[HOUSE CONVENTION — DO NOT RENAME THE CONCEPT]** this is a house-wide provably-fair-receipt pattern name, not Assay-specific theming. **However**: Assay is the ONLY one of the 5 that prints "◆ GLASS BOX CERTIFICATE" as literal ON-SCREEN copy (`AssayExperience.tsx:1595`) — vault/oo_fisher only use "Glass Box" in code comments/aria-labels, never as a visible heading. So the VISIBLE HEADING STRING is Assay's own copy choice and is safe to re-theme (see table below); the underlying feature name stays "Glass Box" in code/comments untouched. |

### Display strings — user-facing, safe to change (exact current string -> file:line -> new string)

| Current string | File:Line | New (Aztec) string |
|---|---|---|
| `VAULT FLOOR` (RailRow title, the 3-tier selector) | `AssayExperience.tsx:950` | `TEMPLE DEPTH` |
| `vault floor · bullion depository · RTP {pct}` (header subtitle) | `AssayExperience.tsx:1301` | `gold chamber · assay hoard · RTP {pct}` |
| `TIER_DISPLAY_LABEL.lean = 'Lean Floor'` | `assayProvider.ts:54` region (asserted in `assayProvider.test.ts:103`) | `Outer Chamber` |
| `TIER_DISPLAY_LABEL.standard = 'Standard Floor'` | same | `Inner Sanctum` |
| `TIER_DISPLAY_LABEL.flooded = 'Heavy Floor'` | same, test asserts `'Heavy Floor'` (`assayProvider.test.ts:106`) | `Flooded Crypt` — **note**: the internal id `'flooded'` FINALLY matches its own fiction here (a sunken/cenote-flooded innermost crypt is authentic Aztec/Maya treasure iconography — offerings were thrown into flooded cenotes). Free narrative win, no code touched. |
| `deposit line` (noun for the traced path) | `AssayExperience.tsx:904` | `claim line` (reverts to the pre-vault term — "deposit" is a banking word with no home in a temple; "claim" fits the Aztec-treasure verb and is the ONE noun used everywhere below, per the "same concept, three disguises" trap logged in `AGENT_MEMORY.md` — do not let box/disc or line/path/thread drift into separate near-synonyms) |
| `box` / `boxes` (the tile unit, everywhere) | `AssayExperience.tsx:904,916,921,1418-1421,1531,1536,3178,3181`; `AssayGridCanvas.tsx` aria-labels | `disc` / `discs` (the tiles ARE hammered gold sun-discs per the brief — "box" has zero Aztec meaning) |
| `RailRow title="LINE"` | `AssayExperience.tsx:980` | `CLAIM LINE` (unify with the noun above — was previously drifting as a 2nd near-synonym for the same concept) |
| `CLEAR` (button) | `AssayExperience.tsx:991` | keep — generic, no theme collision |
| `PACE: BOX-BY-BOX` / `PACE: INSTANT` | `AssayExperience.tsx:993` | `PACE: DISC-BY-DISC` / `PACE: INSTANT` |
| `SAME LINE` | `AssayExperience.tsx:999` | keep — reads as "same claim line," no change needed |
| `RailRow title="TALLY"` + `TallyDial` section | `AssayExperience.tsx:1012` | `HOARD` (a running tally of claimed gold — Aztec-flavored, replaces the bank/instrument-panel word "tally" with a treasure word) |
| `+{mult} → tally` (coin-fly readout) | `AssayExperience.tsx:1377` | `+{mult} → hoard` |
| `RailRow title="YOUR BET"` | `AssayExperience.tsx:1045` | keep — universal wagering term |
| `RailRow title="BALANCE"` | `AssayExperience.tsx:1072` | keep — universal |
| `Select N more box(es) to arm the deposit line` | `AssayExperience.tsx:903-904` | `Select N more disc(s) to mark the claim line` |
| `Deposit line armed · pays {mult} = {usdc} if cleared` | `AssayExperience.tsx:908-910` | `Claim line marked · pays {mult} = {usdc} if the line holds` |
| `CRACKED BOX · the line snapped. Run busted.` | `AssayExperience.tsx:914` | `CRACKED DISC · the line broke. Run busted.` |
| `Line running… {n}/{m} boxes cleared` | `AssayExperience.tsx:916-921` | `Line running… {n}/{m} discs claimed` |
| `Paint a deposit line of {MIN}–{MAX} boxes on the board, then RUN THE LINE. The line runs box-to-box, collecting coins. A single cracked box busts the run.` (lobby copy) | `AssayExperience.tsx:1417-1421` | `Trace a claim line of {MIN}–{MAX} discs across the floor, then RUN THE LINE. The line runs disc-to-disc, claiming gold. A single cracked disc busts the run.` |
| `ENTER THE ASSAY LINE` (lobby CTA) | `AssayExperience.tsx:1422` | keep as-is (see item 6 — name kept) |
| `LINE SECURED` (settled heading + hero-pop badge, TWO call sites) | `AssayExperience.tsx:1531`, `AssayExperience.tsx:2980` | `LINE CLAIMED` at BOTH sites (unify to one word, closing the loop: mark claim line -> RUN THE LINE -> LINE CLAIMED — the exact "three disguises, one concept" fix this game already needed once before, per `AGENT_MEMORY.md`) |
| `CRACKED BOX · BUSTED` (settled heading) | `AssayExperience.tsx:1531` | `CRACKED DISC · BUSTED` |
| `{n} boxes · {mult}` (win summary line) | `AssayExperience.tsx:1535` | `{n} discs · {mult}` |
| `busted at box {n} of {m}` | `AssayExperience.tsx:1536` | `busted at disc {n} of {m}` |
| `◆ GLASS BOX CERTIFICATE · {tierLabel} · {bombCount} cracked boxes in {D}×{D}` | `AssayExperience.tsx:1595` | `◆ SUN-STONE RECKONING · {tierLabel} · {bombCount} cracked discs in {D}×{D}` — see the House Convention note above: only THIS visible heading string changes, the underlying "Glass Box" code/comment concept name is untouched |
| `{t.bombCount} cracked boxes · RTP {pct}` (TierRow row 2) | `AssayExperience.tsx:2454` | `{t.bombCount} cracked discs · RTP {pct}` |
| `Run the line · commit the deposit line and turn the key` (BreakerLever aria-label) | `AssayExperience.tsx:2653` | `Run the line · commit the claim line and press the stone key` |
| `ASSAY AGAIN` | `AssayExperience.tsx:1086` | keep — "assay again" = test the next chamber's gold again, fits |
| `CLOSE` | `AssayExperience.tsx:1087` | keep — universal |
| `PAINT a line of boxes, then RUN THE LINE to commit once.` (coachmark) | `AssayExperience.tsx:3178` | `TRACE a claim line of discs, then RUN THE LINE to commit once.` |
| `ALL-OR-NOTHING · one cracked box loses the line. Pick a deeper vault floor for more risk and reward.` (coachmark) | `AssayExperience.tsx:3181` | `ALL-OR-NOTHING · one cracked disc loses the line. Pick a deeper temple depth for more risk and reward.` |
| `Vault floor board, {N} by {N} boxes. Arrow keys move the cursor, Space or Enter marks or unmarks a box for the deposit line.` (interactive board aria-label) | `AssayGridCanvas.tsx:1743,1813` | `Temple floor board, {N} by {N} discs. Arrow keys move the cursor, Space or Enter marks or unmarks a disc for the claim line.` |
| `Vault floor board, {N} by {N} boxes.` (non-interactive board aria-label) | `AssayGridCanvas.tsx:1744,1814` | `Temple floor board, {N} by {N} discs.` |
| `Session: {rounds} deposit {line(s)}, {n} {box(es)} claimed, net...` (SessionMeta aria-label) | `AssayExperience.tsx:1848` | `Session: {rounds} claim {line(s)}, {n} {disc(s)} claimed, net...` |
| `PLAY SAFE` (button + panel heading) | `AssayExperience.tsx:1901,1959` | **keep unchanged** — RG-C8 discipline: safety copy stays plain/neutral regardless of theme, deliberately never "gamified" into the fiction |
| `Set your own deposit and time limits... If it stops being fun, step away · the assay line will be here tomorrow. ...` | `AssayExperience.tsx:1969-1973` | keep verbatim (name kept, see item 6) — this line is NAME-DEPENDENT: if Tim ever approves a rename, this is the one safety-panel clause that must update in lockstep |
| `HallmarkSeal` visual motif ("hallmark" = a metal-purity certification mark) | both files, multiple | **keep the concept unchanged** — "hallmark" is authentically compatible with BOTH the assay fiction (testing gold purity) and the Aztec-treasure fiction (a struck sun-glyph seal of authenticity); this is a rare case where nothing needs renaming at all, only the seal's MATERIAL (steel -> gold-leaf-on-stone, item 5) |

## 5. ACCENT-ROLE HEX MAP

Tim's anchors: base `#2A1B0E` (warm brown) · gold `#E8B04B` · jade/emerald `#1FA67A`. I set ROLES/intent; color-palette-curator formalizes exact derived tints/shades.

**Confirmed starting point (grounded, not assumed): cyan/volt is ALREADY fully dropped from both files.** Grepped both files for `00f0ff|29e6ff|00d0de|cyan|volt` — every live hit is inside a historical docblock comment narrating a PAST pass, not a live color reference (`AssayExperience.tsx:359-390`'s `GOLD`/`GOLD_LIGHT`/`GOLD_DARK`/`BONE`/`ACCENT_NUM` block and `AssayGridCanvas.tsx:328-347`'s `COL` object are both already gold/bone/blood/accentNum only — no cyan hex anywhere in either const block). **The real remaining risk is NOT cyan — it's the "steel/coal/slate" COOL-GREY family still doing the frame/board/bezel job**, which reads industrial-cold, wrong for "warm sunken gold temple":

| Surface | Current token (file:line) | Current value | New role | Intent |
|---|---|---|---|---|
| Board recessed background | `COL.boardBg` `AssayGridCanvas.tsx:329` | `#0D0F15` (coal, cool near-black) | warm stone-floor bed | dark tint DERIVED FROM `#2A1B0E`, not a cool near-black |
| Board corner spill | `COL.boardBgHi` `AssayGridCanvas.tsx:330` | `#161A23` (slate) | warm umber lift | lighter shade of `#2A1B0E` |
| Board inset stroke | `COL.boardEdge` `AssayGridCanvas.tsx:331` | `#1a1f26` (steel-dark) | dark carved-stone edge | warm-stone dark, not blue-grey |
| Board grain texture | `COL.grain` `AssayGridCanvas.tsx:332` | `rgba(106,115,132,0.07)` (cool steel-toned) | warm stone-grain | same alpha, warm-brown-grey hue |
| **Frame/rail/tile-body "steel" triad — THE key fix** | `COL.steelDark/steelMid/steelLight` `AssayGridCanvas.tsx:333-335`; `STEEL_DARK/STEEL_MID/STEEL_LIGHT` `AssayExperience.tsx:363-365` | `#1a1f26`/`#3a4250`/`#6a7384` (cool blue-grey "gunmetal") | **carved-stone dark/mid/light triad** | replace the COOL blue-grey ramp with a WARM taupe-stone ramp (umber-grey, not slate-grey) — this is the single highest-leverage fix: it is the closed-disc body material, the rail casing, the certificate border, and the header divider all at once |
| Body/label text | `COL.fog` / `FOG` | `#98A1B3` (cool blue-grey) | warm parchment-fog | same luminance/role, warm-sand hue instead of cool-blue |
| Marked/idle white | `COL.bone` / `BONE` | `#F2F3EF` | warm ivory | slight warm shift, e.g. toward aged bone/parchment — minor |
| Dormant disc face (closed) | tile art `tile-safe-closed.png` + `paintSafeClosedFallback` fallback (`AssayGridCanvas.tsx:486-508`) | steel body, `COL.steelLight/Mid/Dark` gradient | dim/unlit hammered-gold-and-stone disc | a heavily desaturated, dark variant of `#E8B04B` — reads "not yet claimed," never a cool metal |
| Proven/open disc face (hero reveal) | `COL.gold/goldLight/goldDark` `AssayGridCanvas.tsx:338-340`; `GOLD/GOLD_LIGHT/GOLD_DARK` `AssayExperience.tsx:372-374` | `#FFC83D`/`#FFE9A8`/`#CAA040` | bright gold family | re-anchor the whole gold triad off Tim's exact `#E8B04B` (currently a brighter, more neon `#FFC83D` — color-palette-curator formalizes the derived light/dark stops from `#E8B04B`) |
| Win bloom / board-sweep / active-tier / breaker glow (every "energized/interactive" surface) | `COL.goldGlow` etc. | gold family | gold family, unchanged ROLE | already correctly gold-only per the prior pass — just re-anchor the hex |
| **Claim-thread + pinned targeting ring (marked, NOT-yet-revealed)** | `COL.thread` `AssayGridCanvas.tsx:345` = `rgba(242,243,239,0.55)` (bone); pinned ring `COL.bone` | **currently bone** | **reassign to JADE** `#1FA67A` family | Tim's jade anchor currently has NO home in this game. The "marked but not yet resolved" role is a perfect, historically-authentic fit (jade was MORE sacred/valuable than gold to the Aztecs — a jade-inlay marking on a not-yet-opened socket reads as ceremonial, not decorative). This is a clean 1:1 role swap: bone's old job -> jade now does it. |
| Small numeral text (<32px OLED-bloom exception) | `ACCENT_NUM` `AssayExperience.tsx:381` = `#00b00e`; `COL.accentNum` `AssayGridCanvas.tsx:346` = `#00b00e` | a THIRD, unrelated green | **retire — fold into ONE jade family** | two competing green hues on screen (this pure-green numeral color vs. the new jade thread) reads as an unintentional accident, not a deliberate 2-green system. Recommend color-palette-curator derive ONE jade-family shade that is BOTH numeral-safe (bloom-checked at small point sizes, jade `#1FA67A` is not a saturated cyan/volt hue so this is likely fine) AND used for the thread/ring — one green, two jobs, not two greens. |
| Bust/loss color (cracked disc, bust ring, flash) | `COL.blood` = `#ff4135`; `BLOOD` = `#FF4135` | blood-red, universal accent-API bust color | keep the ROLE (blood-red = bust, house-wide convention) | optional: deepen toward an oxide/terracotta-red for stone-temple authenticity, but not required — the accent-API's universal bust-red already works with any theme |
| Ambient torch-glow / "lamp breathe" wash | `AssayExperience.tsx` inline style ~L1230-1243, currently bone-tinted specifically to avoid a gold-on-gold-wordmark halo | bone wash | warm amber torch-glow EXCEPT where it sits directly over gold wordmark pixels (keep neutral-warm there to avoid the halo-doubling artifact the vault pass already solved once) | same geometric exception, warmer hue everywhere else |
| Certificate seal (`HallmarkSeal`) | steel struck-hallmark, "never brass/wax" per its own docblock | gold-leaf-on-stone struck medallion | now CAN be gold (was steel specifically to avoid touching the bust-only blood accent — that constraint still holds, just the base material moves from cold steel to warm gold-on-stone) |

**Confirmation: fully warm, zero cyan.** No cyan/volt hex exists in the live (non-comment) code today; this map only needs to retire the COOL STEEL-GREY family (`steelDark/Mid/Light`, `boardBg` coal/slate) that was never actually "neutral" — it was the last cool-hued holdover from the pre-vault Pulse-register recolor pass, masquerading as a neutral frame material. Retiring it is what actually delivers "warm, NO grey."

**Stale premise check (per the `AGENT_MEMORY.md` root-cause lesson from the prior VAULT pivot's two FAILs):** both files' `COL`/const-block docblocks (`AssayGridCanvas.tsx:307-327`, `AssayExperience.tsx:347-358`) currently declare the VAULT-era premise ("every surface... carries either GOLD... or BONE") as the CURRENT authoritative law. This premise goes FALSE the moment jade is assigned a role (bone's old job moves to jade) — whoever implements this MUST rewrite that comment block, not just the hex values, or the next independent gate will find a still-declared "gold-or-bone-only" law next to a jade thread and flag it as a fresh contradiction, exactly the failure mode that hit this game twice already.

## 6. NAME DECISION — KEEP "THE ASSAY LINE" (flagged, needs Tim's confirmation)

**Recommendation: KEEP.** Reasoning:
- "Assay" = testing metal purity. This is HISTORICALLY authentic for a gold-treasure fiction (Spanish colonial assay offices literally certified New World gold purity before shipment) and mechanically apt: the fairness receipt IS a purity/authenticity certification (a "hallmark"), which the theme keeps unchanged (item 4).
- "LINE" already carries the mechanic-teaching load once `claim line` is the one unified noun (item 4) — the name doesn't need to do that work itself.
- **Rename cost is real and large**: `AssayExperience.tsx`, `AssayGridCanvas.tsx`, `assayMath.ts`, `assayProvider.ts`, `assayAudio.ts`, the folder `originals/assay/`, the runner `assay-run/`, and the slug `assay` all carry the name at the file/component/import level. The brief explicitly says do not touch math/mechanic/grid/ids — a full rename would force touching identifiers even if the math itself stays byte-identical, which is a much bigger engineering lift than a copy-only vocabulary pass. This mirrors the exact cost-tradeoff already logged in `AGENT_MEMORY.md`'s theme-composer section from the prior vault pivot, where "THE ASSAY LINE" was kept for the same reason.
- The ONLY asset that must change regardless is the wordmark ART (`wordmark-vault.png`, steel-faced) — a new carved-stone/gold-leaf-fill wordmark for the SAME name is a cheap art-only swap, not a rename.

**Alternative, if Tim wants a harder pivot:** `THE SUN STONE LINE` — ties directly to the Piedra del Sol reference (item 2) and keeps the word "LINE," so every LINE-based string in the vocabulary table above survives a rename for free; only the wordmark art + the two literal "ASSAY LINE" strings (`ENTER THE ASSAY LINE`, the safety-panel closing clause) plus the file/folder/slug identifiers would need to change.

**RENAME PROPOSAL — needs Tim's confirmation via fabi before anyone changes the wordmark, the name, or any file/folder/slug identifier.** My recommendation is KEEP + re-narrate + new wordmark art only; this is flagged explicitly per the brief's instruction regardless of my own recommendation.

## Interim asset plan (Higgsfield offline this round)

**Layer 1 assets that ultimately WANT new generated art** (all currently vault-specific per `assets/PROVENANCE.md`):
- `backdrop-vault.png` -> new Aztec temple/gold-hoard chamber illustration (torch-lit stone archway, gold-disc + jade-idol margin dressing, open dark center for the board — same compositional slot, new content)
- `tile-safe-closed.png` -> dormant sun-disc set in a carved stone socket
- `tile-safe-open-coin.png` -> open socket revealing a glowing hammered gold sun-disc (hero reveal)
- `tile-safe-cracked.png` -> shattered stone socket, dark broken disc, obsidian/oxide-crack motif (not rust)
- `wordmark-vault.png` -> carved-stone glyph lettering with gold-leaf fill
- `coin-gold-v1.png` -> lower priority (not literally vault-named) but should eventually carry the sun-glyph motif to match item 2's reference

**Ship TODAY without new assets** — the codebase already has the exact vehicle needed:
- `AssayGridCanvas.tsx:486-544`'s `paintSafeClosedFallback`/`paintSafeOpenFallback`/`paintSafeCrackedFallback` are pure-canvas procedural painters, currently gunmetal-and-`COL.gold`-based, explicitly built as "used only for the brief window before the real generated art decodes... so the board is never blank." Recolor these three functions to the new warm-stone/gold tokens (item 5) and they become the INTERIM real renderer, not just a fallback — this ships a correct-looking, on-brand board with zero new image assets.
- The page backdrop can ship as a layered CSS gradient (the code already layers 4 radial-gradient washes over the image at `AssayExperience.tsx:1132` — dropping the `url(backdropVaultAssetUrl)` layer and keeping/rewarming the gradient stack gives a flat warm-stone placeholder immediately).
- The wordmark can ship as a plain styled-text lockup exactly like the existing "SWOOBZ" maker's-mark treatment already does at `AssayExperience.tsx:1162-1175` (gold-on-stone Geist Mono text, no image) until the real carved-glyph asset exists.

---

## Hand-off
-> composition-designer: ON-SCREEN/OFF-SCREEN map (item 3) for frame layout + HUD-in-scene authoring (stela rail, stone-plaque header, weighing-scale HOARD dial)
-> color-palette-curator: formalize exact hex from the accent-role map (item 5) — retire the cool-steel-grey triad, re-anchor gold off `#E8B04B`, derive the jade family (thread + numeral-safe variant) off `#1FA67A`
-> lighting-designer: torch-lit-underground atmosphere brief (item 1/2) — permanent artificial warm light, no daylight ever implied, off-panel torch as the board's key light
-> material-surface-designer: carved stone (frame/rail/board bed), hammered gold (discs), jade inlay (claim-thread) as the three named materials
-> audio-design-director: sound palette echoing the three feelings (item 2) — stone-key press weight, struck-disc chime on reveal, dry stone-crack snap on bust
-> codotty: the OLD->NEW vocabulary table (item 4) is copy-only and does not require the `TIER_ORDER`/`TierId`/`phase.kind` internal ids to change; note that changing `TIER_DISPLAY_LABEL` values will require updating the matching assertions in `assayProvider.test.ts:103-106`
-> fabi: NAME DECISION (item 6) needs Tim's explicit confirmation before any wordmark/name/identifier work starts

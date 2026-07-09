# THE ASSAY LINE — PREMIUM ELEVATION BUILD SPEC (codotty round 2)

Compiled by fabi 2026-07-05 from artotty's casino-AAA diagnosis (2.8/5) + game-art-director's consolidated
elevation recipe (both PASSED). This is the authoritative build spec. Higgsfield OFFLINE — everything
PROCEDURAL (canvas/CSS/SVG). Warm, ZERO cyan. Every new effect a fixed RG-C5 module-const (never derived
from payout/streak/session). Preserve mechanic/math/grid/RoR-UI + the artotty preserve-list. Keep name.

## GOAL (Tim: "nog niet premium/satisfying genoeg" on ALL 4 axes)
Lift the build from 2.8/5 to artotty's casino-AAA SHIP bar on: (1) background, (2) coins/tiles, (3) juice,
(4) color & premium atmosphere. artotty is the SHIP gate — build to its definition-of-SHIP below.

## PALETTE (reuse only these warm tokens; the fix is CONTRAST WITHIN the warm range, never a palette change)
INK #170E07 · STONE_DEEP #241203 · boardBg #2A1B0E · boardBgHi/STONE_WARM #4A2E16 ·
BRASS_DARK #3D2611 · BRASS_MID #8C6530 · BRASS_LIGHT #C79A5C ·
gold #E8B04B · goldLight #F6DDA0 · goldDark #A67C3E · goldGlow rgba(232,176,61,0.5) ·
jade #1FA67A · jadeLight #4FD9A8 · jadeDark #0F5B42 · NEW jadeMuted #2C7A5A ·
torchGlow #FF8A42 · cream/BONE #EDE3CB · sand/SAND #B8A688 · ember/BLOOD #EF5A3F ·
CARD_BG linear-gradient(160deg,#4A2E16,#2A1B0E 60%,#170E07) · FRAME_HAIRLINE rgba(202,160,64,0.4) ·
ACCENT_NUM #00B00E (KEEP — <32px monetary numerals ONLY).

---

## AXIS 1 — BACKGROUND (P1) — flag PREMIUM-INTERIM (pending generated temple illustration)
`AssayExperience.tsx` outer page div (~L775-814): make the existing single 4-stop radial an OVERLAY, not
the whole scene. Inside that div (`position:relative`) build a sibling layer stack, all
`position:absolute; inset:0; pointerEvents:none` unless noted. Z-order bottom→top:
- z0 page bg INK (unchanged)
- z1 `<TempleSkyline layer="far"/>`  z2 `<TempleSkyline layer="near"/>`
- z3 `<TreasureDressing side="left"/>` + `side="right"` (conditional)
- z4 `<TorchSconce side="left"/>` + `side="right"`
- z4.5 tonal vignette layer (Axis 3 #1)
- z5 the EXISTING 4-stop radial wash (retuned)
- z6 the existing shell/card (give it zIndex:1 so it stacks above z5)

### TempleSkyline — 2 stepped-ziggurat SVG layers, `preserveAspectRatio="none"` (scales 412→2560px)
Write ONE reusable generator, call 4×:
```
function zigguratPath(cx, baseY, halfW, tiers, tierH, inset) {
  let left = []
  for (let n = 0; n <= tiers; n++) {
    const x = cx - halfW + n * inset, yTop = baseY - n * tierH
    if (n === 0) left.push(`M${x},${baseY}`)
    left.push(`L${x},${yTop}`)
    if (n < tiers) left.push(`L${x + inset},${yTop}`)
  }
  const right = left.slice(0,-1).reverse().map(seg => {
    const [x,y] = seg.slice(1).split(',').map(Number)
    return `L${2*cx - x},${y}`
  })
  return [...left, ...right, `L${2*cx-(cx-halfW)},${baseY}`, 'Z'].join(' ')
}
```
Both layers viewBox `0 0 1440 260`, top:0, height via CSS on the `<svg>`. Instantiate (fill/opacity/height):
| layer | tower | cx | baseY | halfW | tiers | tierH | inset | fill | opacity | height |
|--|--|--|--|--|--|--|--|--|--|--|
| far | A | 220 | 200 | 170 | 4 | 32 | 30 | STONE_DEEP #241203 | TEMPLE_FAR_OPACITY 0.5 | 176px |
| far | B | 1180 | 210 | 130 | 3 | 28 | 26 | STONE_DEEP | 0.5 | 176px |
| near | C | 340 | 250 | 200 | 5 | 30 | 32 | INK #170E07 | TEMPLE_NEAR_OPACITY 0.65 | 240px |
| near | D | 1100 | 260 | 170 | 4 | 32 | 30 | INK | 0.65 | 240px |
Near layer `translateY(+40px)` vs far (depth). No parallax/scroll motion (two static depth layers suffice).

### TreasureDressing — margin filler ONLY where a dead margin exists
`marginAvailablePx = (viewportWidth - shellMaxWidthPx)/2`; render only if `isWide && marginAvailablePx >=
TREASURE_DRESSING_MIN_MARGIN_PX (140)`. Pos left:24 / right:24, vertically centered on card, cluster width
`clamp(0, marginAvailablePx-48, 220)px`. Contents (pure CSS + reused sprite, no new art):
- 3 gold-bar divs: `clip-path: polygon(8% 100%,0% 30%,20% 0%,100% 0%,92% 100%)`, ~64×26px,
  `background: linear-gradient(160deg, goldLight, gold 45%, goldDark 100%)`, `border:1px solid rgba(23,14,7,0.5)`,
  stacked 2-bottom/1-top pyramid, rotated -6/4/-2deg.
- 4-5 doubloon glints: `<img src={struckDoubloonDataUrl()}>` (the ALREADY-EXPORTED struck-coin sprite from
  AssayGridCanvas — reuses the real coin material, provenance, zero new asset), 14-22px, scattered at the bars' base.
- Ground shadow: `radial-gradient(ellipse, rgba(23,14,7,0.5), transparent 70%)` under the pile.
- ONE static highlight on the top bar: `box-shadow: 0 0 8px rgba(246,221,160,0.5)` (static, not idle-twinkle).

### TorchSconce ×2 (flank the card's top corners)
Pos `left: max(24px, calc(50% - <cardW/2>px - 56px)); top:96px`, mirrored right. SVG ~40×64:
- bracket 6×28 rounded rect BRASS_DARK rot 20deg; bowl 18×10 trapezoid BRASS_MID/goldDark rim;
- flame teardrop bezier, gradient torchGlow→gold→goldLight, ~22×14px;
- light pool `radial-gradient(circle, rgba(255,138,66,0.22), transparent 70%)`, 180×180 centered on bowl.
Flicker reuses the board's TORCH_FLICKER_HZ (0.06) for cohesion, new consts:
`SCONCE_FLICKER_HZ = TORCH_FLICKER_HZ` · `SCONCE_FLICKER_OPACITY_AMP = 0.14` · `SCONCE_FLICKER_SCALE_AMP = 0.08`
· `SCONCE_FLICKER_PERIOD_MS = Math.round(1000/0.06) = 16667`. CSS keyframes on the flame `<path>` only,
`16667ms ease-in-out infinite alternate`: `scaleY(0.92) skewX(-3deg)`→`scaleY(1.08) skewX(3deg)`, opacity 0.86→1.
(Same period as the canvas board breathe — DOM flame + canvas vignette breathe in ONE rhythm.)

---

## AXIS 3 — COLOR / ATMOSPHERE (P2) — cheapest, lifts all; do WITH P1
1. **Tonal vignette layer (z4.5)** — new div above WarmWash, asymmetric to the board's upper-left key (28%,22%):
   - key-pool boost `radial-gradient(50% 40% at 22% 18%, rgba(255,178,110,0.14), transparent 70%)` — KEY_POOL_BOOST_ALPHA 0.14
   - floor darken `radial-gradient(70% 60% at 82% 88%, rgba(6,3,1,0.5), transparent 65%)` — FLOOR_DARKEN_ALPHA 0.5
   - corner vignette `radial-gradient(140% 120% at 38% 30%, transparent 45%, rgba(6,3,1,0.55) 78%, rgba(6,3,1,0.82) 100%)` — CORNER_VIGNETTE_ALPHA_MAX 0.82
   This kills the "one mid-brown everywhere" flatness: margins crush to near-black #060301, key pool stays lifted.
2. **Brighten gold peaks** — any HUD surface currently flat `gold` (buttons/dial rim/bezels) gets the dome-sheen
   `paintDoubloonCore` already uses: `linear-gradient(160deg, goldLight, gold 45%, goldDark 100%)` + `inset 0 1px 0 rgba(246,221,160,0.5)`.
3. **Recolor hero text (KEEP <32px numerals green):**
   - L1189 settled `LINE CLAIMED`/`CRACKED DISC · BUSTED` label (18px) → `color: outcome.won ? goldLight : BLOOD`
     (was BONE/BLOOD) + win case `textShadow: 0 0 10px rgba(232,176,61,0.4)`.
   - L1206 PAYOUT value stays ACCENT_NUM green (20px monetary numeral — do NOT touch).
   - Header SWOOBZ wordmark span (L821-833, was SAND) → `color: goldLight`, `textShadow: 0 0 8px rgba(232,176,61,0.35)`.
   - `wordmarkAssetUrl` PNG (can't regenerate) → CSS filter interim: `filter: sepia(0.6) saturate(1.4) hue-rotate(-8deg) brightness(1.05)` toward gold/parchment until real wordmark lands.
4. **HOARD dial premium at REST** (`TallyDial` L1655-1757, currently bare SVG):
   - machined bezel wrapper: `background: radial-gradient(circle at 50% 40%, BRASS_LIGHT 0%, BRASS_MID 55%, BRASS_DARK 100%)`,
     `border-radius:999px`, `box-shadow: inset 0 2px 3px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(246,221,160,0.15), 0 0 10px rgba(232,176,61,0.22)`
     (the last = static ALWAYS-ON ambient rim glow, fixed, NOT tied to isLive/win → RG-C5 by construction).
   - static outer ring in SVG: `<circle cx=50 cy=50 r=48 fill=none stroke=FRAME_HAIRLINE strokeWidth=1.5/>`.
   - unlit ticks (BRASS_LIGHT @0.72) get `filter: drop-shadow(0 0 1.5px rgba(199,154,92,0.4))`.

---

## AXIS 2 — COINS (P3) — `AssayGridCanvas.tsx paintDoubloonCore` (~L379-538)
1. **Shrink + desaturate glyph so gold is the hero:** `glyphR = r*0.6 → r*0.42`; body fill token (L484) `COL.jade
   → jadeMuted #2C7A5A` for dormant/struck (cracked keeps jadeDark unchanged); `glyphEdgeAlpha` struck 0.85→0.55,
   dormant 0.4→0.28 (L387). Glyph now reads as carved/embossed relief, not a competing glowing figure.
2. **Board-wide light falloff** — bake ONE multiply-blend radial into the STATIC board cache, immediately AFTER
   the `for(idx...) drawTile(...)` blit loop (~L1169-1174) inside the `if(staticDirtyRef.current)` block (zero per-frame cost):
   ```
   bctx.save(); bctx.globalCompositeOperation='multiply'
   const falloff = bctx.createRadialGradient(dims.w*0.28, boardAreaH*0.22, 0, dims.w*0.28, boardAreaH*0.22, dims.w*0.95)
   falloff.addColorStop(0,'rgba(255,244,214,1)')  // ~1.0x at torch key
   falloff.addColorStop(1,'rgba(90,64,40,1)')     // ~0.55x at far corner
   bctx.fillStyle=falloff; bctx.fillRect(0,0,dims.w,boardAreaH); bctx.restore()
   ```
   Same center as the backdrop hotspot + per-frame TORCH_FLICKER overlay (ONE consistent light source).
3. **Hammered dimples** — 5-6 FIXED-position (literal array, NOT Math.random) dark flecks r*0.04, goldDark @alpha 0.12,
   between base-disc (b) and milled rim (c).
4. **PRESERVE unchanged:** dome sheen (b), milled dashed rim (c), raised bevel collar (d), specular glint + struck
   sweep + energized ring (f), contact shadow (a).

---

## AXIS 4 — JUICE (P4) — all timings/geometry module-const, byte-identical regardless of payout
### HeroPopCallout (`AssayExperience.tsx` L2573-2650) — pill → gold carved-stone CARTOUCHE
- shape: elongated stadium `border-radius: 40px / 32px`.
- background: `CARD_BG` (same material as the main card, not STONE_WARM/STONE_DEEP).
- double-bevel brass rim: `border: 2px solid BRASS_LIGHT` + `box-shadow: inset 0 0 0 5px STONE_DEEP, inset 0 0 0 6px goldDark, 0 0 36px rgba(232,176,61,0.45), 0 12px 30px rgba(0,0,0,0.5)`.
- scale-up: padding 16px 34px→22px 46px; text 20→24px; sun-disc glyph 22→28px.
- text: BONE → goldLight, `textShadow: 0 0 14px rgba(232,176,61,0.7)`.
- rings: `HERO_RING_SIZE_PX = 150` (was hard-coded 120); HERO_RING_MS 900, HERO_RING_2_DELAY_MS 150,
  HERO_POP_HOLD_MS 1700 stay UNCHANGED.
- one-shot shine sweep (reuse assayTallyShine technique, new keyframe assayCartoucheShine):
  `linear-gradient(100deg, transparent 30%, rgba(237,227,203,0.5) 48%, rgba(232,176,61,0.35) 52%, transparent 70%)`,
  `CARTOUCHE_SHINE_MS = 620`, fires once on mount with the pop-in.
### Board-wide bloom on settle — strengthen existing `BoardSweep` (L2658-2673), don't replace
- bump alpha: `rgba(237,227,203,0.16)→0.24` and `rgba(232,176,61,0.22)→0.35`; new const `BOARD_BLOOM_PEAK_ALPHA = 0.35`.
  `BOARD_SWEEP_MS = 900` unchanged.
- ADD a simultaneous radial flash under the diagonal sweep: `radial-gradient(circle, rgba(246,221,160,0.22), transparent 60%)`,
  full-board inset:0, `BOARD_BLOOM_RADIAL_MS = 700`, ease-out, one-shot, fires in the same heroPopVisible block.
- both: fixed geometry/duration/peak-alpha module-consts, zero payout/streak dependence.

## NEW RG-C5 module-consts introduced (all FIXED, none derived from balance/streak/payout):
TEMPLE_FAR_OPACITY, TEMPLE_NEAR_OPACITY, TEMPLE_FAR_HEIGHT_PX 176, TEMPLE_NEAR_HEIGHT_PX 240,
TREASURE_DRESSING_MIN_MARGIN_PX 140, SCONCE_FLICKER_HZ/OPACITY_AMP/SCALE_AMP/PERIOD_MS,
KEY_POOL_BOOST_ALPHA 0.14, FLOOR_DARKEN_ALPHA 0.5, CORNER_VIGNETTE_ALPHA_MAX 0.82, HERO_RING_SIZE_PX 150,
CARTOUCHE_SHINE_MS 620, BOARD_BLOOM_PEAK_ALPHA 0.35, BOARD_BLOOM_RADIAL_MS 700.

## PRESERVE-LIST (artotty + game-art-director — do NOT regress)
Struck doubloon material (dome sheen, milled rim, raised bevel, specular glint + curved sweep + standing energized
ring, contact shadow) — P3 only touches the glyph (e) + adds a post-composite falloff overlay + fixed dimples.
CoinFly reuses struckDoubloonDataUrl (provenance) — TreasureDressing coins reuse the SAME sprite. Reveal-juice
foundation (torch-flare wash, "+Nx→hoard" floats, CoinFly-to-dial, dial needle-sweep) — untouched; only the dial's
REST chrome + the SETTLE hero/bloom change. Warm brand-legal zero-cyan palette. RoR right rail + mobile loupe.

## DEFINITION OF DONE (codotty self-check before verifiers)
- typecheck clean; tests green (state count); cyan grep `#00F0FF|#29E6FF` = 0.
- Background: ≥2 temple depth layers + margin treasure-dressing filling desktop dead margins + ≥2 flickering
  sconces; no flat-brown margin band wider than the frame (fresh desktop 1440 + mobile 412 screenshots).
- Coins: gold is hero on every disc (jade subordinate); dormant hoard shows board-wide light falloff.
- Juice: win settle = gold cartouche + board bloom, RG-C5 byte-identical.
- Color: real tonal range (near-black shadows + bright gold peaks); no cool-green/silver on hero surfaces
  (numerals stay green); HOARD dial premium at rest.
- grid/math/ids/mechanic/RTP untouched; name kept; background flagged PREMIUM-INTERIM in code + PROVENANCE.

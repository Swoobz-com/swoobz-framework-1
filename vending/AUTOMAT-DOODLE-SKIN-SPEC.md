# AUTOMAT — doodle-cabinet re-skin build spec (LOCKED DIRECTION, 2026-07-16)

Full art-roster round on Tim's ask: recreate the Collector Crypt doodle-covered vending
machine (`input/vending/vending1.jpg`) in Swoobz style, carrying the abstract-art thread
of the other Originals (vault's flat thick-ink + sparkles, abyss's hand-authored SVG).
Specialists: theme-composer, composition-designer, color-palette-curator,
material-surface-designer, lighting-designer → synthesis by game-art-director →
taste-guardian verdict **APPROVED-WITH-CHANGES** (changes folded in below, marked ★).
Full reasoning in `~/.claude/agents/logs/run-20260716*-*.md`. Presentation-only:
math/provider/timings/geometry LOCKED; zero image assets; zero credits; deterministic.

> GEOMETRY NOTE (2026-07-16, after spec-lock): Tim added 2 shelf rows — the machine is
> now H=760, BODY h:700, GLASS y:118 h:400, four shelves SHELF_YS [208,308,408,508]
> (top 2 = the 10 live slots, bottom 2 = always-stocked inventory), info panel y:548,
> TRAY y:628. All y-values below (rail bands, collar strips, skirt) were derived on the
> OLD 2-shelf geometry — re-derive them proportionally against the new consts at
> implementation time; the zone LOGIC (rails + collar + skirt, STAGE core clean, fall
> corridor exclusion) is unchanged.

## Theme (one sentence a cold player should be able to say)
"A dim room at night; a warm-white porcelain vending machine covered in one unbroken
hand-doodled ink line; a cyan neon sign hums while the coil turns and drops my
foil-wrapped multiplier pack into the tray."

Register: Shantell Martin continuous-line murals (one hand, outline-only, meditative)
+ one Haring radiant-tick motif + Beezie-ref spacing. NOT Collector Crypt's sticker-bomb.
BANS: legible text/letters in doodles, faces/creatures, crypto-bro glyphs, lifted
Collector Crypt branding, colored doodle ink, filled icon silhouettes.

## Tokens
| Const | Old | New |
|---|---|---|
| `T.cyan` / `COL.neon` (+ rgba(53,224,255,…) derivatives) | `#35e0ff` | `#00F0FF` (registry volt — pulse/vault/oo_fisher already ship on it; AUTOMAT was the outlier) |
| `COL.bodyTop` | `#eef1f5` | `#F2EEE4` (warm porcelain) |
| `COL.bodyBottom` | `#d8dde4` | `#C9C2B0` (warm greige) |
| `COL.bodyEdge` | `#b9c1cc` | `#C2B8A6` (warm taupe companion) |
| `COL.doodleInk` (new) | — | `#0D0F15` (coal; single ink for doodles + structure outlines) |
Gold family `#f0b542` UNCHANGED (shared token with assay/Abyss). No third hue: the
reference's orange jobs are absorbed by gold; the proposed `#00B00E` green CTA text was
REJECTED (brand-preview-only value, nowhere in shipped Originals).
★ Cyan job map, all instances BY NAME (taste #5) — the LIVED jobmap as shipped
(updated 2026-07-22): (1) canvas neon wordmark/marquee tube+underline, (2) glass
interior top-light, (3) selected chip border+tint — the SmallBtn active state:
machine picker, price/quantity presets AND the CUTSCENE·ON toggle, (4) VEND CTA
border+dim fill (+ VENDING… label). Anything else cyan → demote to neutral.
Rule: cyan never surface-contacts gold or porcelain.
NOTE: the earlier-specced "pack-count stepper numeral" job was NEVER built (the
−/+/dropdown steppers live in the neutral key register), and the turntable ◀▶
arrows were demoted from cyan to the neutral button register on 2026-07-22
(brand-QA cyan-budget finding) — both removed from the map above.

## Doodle layer
- 8-mark library (≤15px bbox, coal, 2.5px stroke, round caps/joins): coil-loop
  (archimedean spiral 2.5 turns r2→7), hex-pip (flat-top hex R5 + tick), spark-burst
  (5 radiating strokes 4/7px alternating + stub), orbit-ring (concentric R4/R6 + 3 ticks
  at 120°), sparkle-diamond (12px long axis + 7px cross, tapered), drop-arc (60% of R6
  arc + hooked tail), stack-tally (3 ticks + diagonal strike), loop-knot (figure-eight,
  rarest, header only).
  ★ sparkle-diamond is the ONE controlled fill exception: gold-filled with coal outline
  (the literal Vault-altseason rhyme); all other marks outline-only (taste #4).
- Wobble (material spec): mulberry32-seeded per instance (`slot*97+rail*13`), per-anchor
  jitter ±0.8px, per-segment quadratic bulge ±1.5px perpendicular, corner overshoot
  2.5-3.5px on ~35-40% of joints. Built ONCE at mount, baked to ONE offscreen canvas,
  composited with ONE drawImage/frame (after body fill, before HEAD).
- ★ Placement (grown per taste #1 — "rails-only read as pinstripes, not covered"):
  - RAIL_L/RAIL_R widened 24→36px (`x:42-78` / `x:442-478` — re-clamp against the
    re-derived fall corridor: falling packs converge to x:212-306 below y:418, so 36px
    rails never conflict), 9 marks/rail in 4 bands (header flank 18-118 ×0.9, glass
    flank 118-418 ×0.7 sparse, mechanism flank 418-528 ×0.9, tray flank 528-618 ×1.0),
    alpha 0.82.
  - Header collar strips (y:18-40 and y:98-118, full BODY width minus HEAD x-span):
    4 marks, alpha 0.60, scale 0.75 (was 2 — grown, taste #1a).
  - ★ Cabinet skirt (y:592-618, below tray, x clear of tray label plate): 4 marks,
    alpha 0.82, scale 1.0 — the densest Crypt zone was bare (taste #1b).
  - Total 26 marks. STAGE core (glass, panel, tray mouth, fall corridor, neon plaque)
    stays doodle-free — clean product window vs doodled shell, like the reference.
- ★ Mobile (taste #2): at ≤480px render width drop the glass-flank band (4 marks) AND
  verify by screenshot that 36px rails (~26px physical) still read as marks, not smear;
  if not, scale marks ×1.15 on mobile instead of thinning further.

## Structure ink (outline law)
Double-stroke: 3.5px coal under-stroke on BODY/GLASS/TRAY paths beneath the existing
accent strokes (unchanged); 2px coal under-strokes on packs + header base; coil rings
get 4px coal rim under the 2.5px bright stroke; shelf seam 1px coal 0.5. Separation from
doodles = weight + precision (structure unwobbled), same ink.

## Glass · neon · mechanism
- Glass: 1px white top-edge highlight (alpha 0.35), corner wedge triangle
  rgba(255,255,255,0.06-0.16), 60px interior bottom shadow gradient (0→0.25 black).
  Existing top-light + sheen stay (the only 2 animated behaviors).
- Neon tube: 4px volt core on HEAD perimeter + 14px halo (alpha 0.18·neonPulse) +
  2 end-cap dots + 2 coal bracket rects — ALL on the existing 0.05Hz neonPulse clock.
- Tray lip/flap: 2-tone flat fills (#c9d0d9/#8f97a3, #d7dce3/#a7b0bc) + coal rims +
  1px white top highlights.

## Lighting
- Gold drop glow: DELETE the unsynced `0.6+0.4·sin(now/110)` → static `glow=0.85`
  riding the pack's own alpha. Class-cue only (identical 5×/100×), RG-C5.
- Tray-lip gold tick: binary swap trayLip→#f0b542 for the fixed 200ms impact window on
  gold landings only.
- Room (DOM, static — never phase-synced to canvas): keep base radial; add floor-contact
  pool `radial-gradient(ellipse at 50% 88%, rgba(0,240,255,0.10), transparent 40%)`;
  outer-22% ink vignette alpha 0.4; two blur(24px) side silhouettes opacity 0.12
  (implied neighbor machines). Mobile: drop silhouettes (no side space).

## HUD-as-signage
- Info panel: inset bevel (1px white 0.25 top-left, 1px black 0.25 bottom-right) +
  4 coal rivet dots; engraved-text offset copy.
- Tray label: backing sub-plate with the same bevel + 2 rivets.
- ★ Settled result card (taste #3, was deferred): same bolted-plaque treatment as the
  info panel (bevel + rivets + coal ink frame) instead of the plain floating card —
  it is the dominant element at the win moment.

## Gates before ship
typecheck + 24 vitest green; real-render screenshot pass desktop + Pixel 7 (incl. the
mobile rail-legibility check ★#2); re-submit result to taste-guardian (density + mobile
+ settled-card were its re-review triggers); then autisk pixel QA.

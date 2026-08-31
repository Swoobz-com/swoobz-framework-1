# SPEC-FEEDBACK-0831 — AUTOMAT feedback round (source: automat/New Games feedback.docx)

Feedback sources (all read 2026-08-31): Tim's summary notes, a detailed tester
review (docx image1), a Discord player quote (image3: "im not a particular fan
of winnings showing in 2.5x 10x i would prefer to see the money won instaid —
makes it feels more real somehow"). Positives to PRESERVE: smooth on mobile,
presentation/visual design, per-roll box visibility, difficulty tiers, per-tier
room change.

## The fixes (ranked, F1 = highest player impact)

**F1 — Money-first win display** (2 independent votes)
Everywhere a result shows a multiplier as the PRIMARY number, money won
becomes primary and the multiplier becomes secondary/small:
- Cutscene card faces (DOM number overlays): big value = payout USDC
  (e.g. `+12.00`), small line under it = `12.00x`.
- SettledPanel PackChips + aggregate line: money primary, multiplier
  secondary. `EMPTY`/dud cards keep reading EMPTY (class marker, unchanged).
- The receipt detail lines keep both (they are the audit trail — unchanged).
RG-C2 holds: styling keyed to outcome class (dud/standard/gold, net win),
never value.

**F2 — Balance suspense leak** (tester, kills the reveal)
"You can already tell whether you won before the packs open because the
balance updates too early." Fix at the DISPLAY layer only: the rendered
BALANCE (top strip + desktop plaque) shows committed-balance-minus-stake from
VEND until the outcome is actually revealed (cutscene finished OR skipped OR
cutscene-off settle shown), then ticks to the real balance. vendingProvider
is NOT touched; derive the displayed value from existing state. No path may
leak the payout early (check: aria-live announcements, LAST VENDS list,
receipt summary — none may render the new total before reveal).

**F3 — Win/Lose indication** (Tim + tester)
Make the settled verdict readable in one glance, within RG-C2:
- NET line becomes the hero under the payout figure: net-win renders in gold
  with `+`, net-loss renders neutral with `−`, identical size/weight both ways.
- Add a small class-keyed outcome eyebrow above the payout: `GOLD VEND` /
  `PAID OUT` / `NO RETURN` (observational register, no BIG WIN vocabulary).
Identical layout win or lose; only class-keyed color differs on the NET value.

**F4 — Pack openings more exciting** (Tim + tester)
Presentation-only choreography upgrade inside PackRipCutscene, all timings
module-const, class-keyed never value-keyed:
- Anticipation beat: brief hold + tightening glow before the lip peel.
- Stagger the wave flip harder (current flip reads flat) + per-card
  micro hit-stop on reveal.
- Gold card: existing rays + a one-shot freeze-frame beat (module-const
  duration, identical for every gold regardless of value).
- Dud card: a deliberate deflate beat (same duration every time).
Respect prefers-reduced-motion (skip straight to grid). No particle confetti
(brand ban). Rays stay finite.

**F5 — Sound design** (Tim + tester: "flat and simple")
Extend `vendingAudio.ts` (HASH PIN CHANGES — INTENTIONAL, authorized by this
feedback; re-pin in AGENTVENDING.md after RG-C5 re-attestation):
- Keep the existing 4 cues' semantics. Add zero-param, class-keyed cues:
  rip-open cue, dud thud, standard-win chime, net-loss neutral close,
  build-up tick for the anticipation beat (fixed pitch/level, NO escalation
  with streak/value/session; gold cue stays class-only as today).
- Every new fn: zero parameters, module-const timings/levels, identical
  amplitude for every firing. RG-C5 banner in file stays.

**F6 — Slot-pick integration ("that glass design is not really working")**
Tim wants it to read like a REAL machine: "you need to type how much you want
of what Row". v1, presentation-only, slotOrder semantics untouched:
- The translucent "PICK YOUR SLOTS · OPTIONAL" glass bar is REPLACED by a
  machine-hardware code panel in the same rail slot: plaque material
  (T.plaque/keyFace, same border/inset language as the price keys), an LED
  code readout showing picks as codes (`A1 · B3 · C2`, `ENTER CODE` when
  empty), and a CLEAR key styled as a machine key.
- Desktop additionally gets a real KEYPAD on the panel (letter keys A-D +
  number keys 1-5, plaque-key styling, ≥44px): typing/pressing A then 1
  toggles slot A1 — identical FIFO semantics as tapping the glass.
- Portrait keeps direct glass-cell tapping (tapping the slot ON the machine
  IS the integrated interaction) + the new LED readout rail; the keypad is
  desktop-only if it cannot hold ≥44px keys inside the portrait chrome
  budget. THE PORTRAIT NO-SCROLL LAYOUT MUST NOT REGRESS (SPEC-PORTRAIT-0831
  gates re-run).
- Keyboard a11y: physical keyboard A-D/1-5 already-or-now toggles codes.

**F7 — Font readability** (Tim + tester: "Pick your slot …" unreadable)
- No always-on label below 12px rendered. The rail hint/readout ≥12px
  dimLift minimum; re-measure contrast ≥4.5:1 on the real backplate.
- Money strip legal line: keep ≥9.5px floor at 360w but raise where room
  allows; verify on-device screenshots.

**F8 — LAST VENDS visible without scrolling** (tester, desktop)
Desktop controls column becomes viewport-aware: LAST VENDS gets an internal
max-height (fits the fold) with its own overflow scroll, newest first —
the page itself must not need scrolling to see the list start. Portrait
continues to hide the card (portrait spec).

**F9 — Background consistency across tiers** (tester: easy/medium show side
borders, hard is full-bleed; floor jumps between tiers)
Normalize the three room backdrops at the CSS layer: identical sizing mode
(cover), identical anchor (center bottom so the floor line stays put), the
same scrim geometry. If a source PNG's baked framing still shows edges after
cover-normalization, note it as an art-regeneration item (do NOT regenerate
art in this round; zero credits).

**F10 — AUTOMAT favicon** (tester)
`vending-run/index.html`: replace the default icon with an inline-SVG
AUTOMAT glyph (data URI, no credits): dark plaque tile, gold pack silhouette,
cyan accent line — reads at 16px. Tab title stays "AUTOMAT · Swoobz Originals".

## Hard constraints
- vendingMath.ts + vendingProvider.ts BYTE-IDENTICAL (hashes in every
  report). vendingAudio.ts changes are authorized ONLY per F5 scope; report
  old+new hash and get RG-C5 re-attestation before commit.
- SPEC-PORTRAIT-0831 acceptance gates re-run and hold (no-scroll at 412×915,
  390×844, 412×738, 360×740; 44px targets; slot-pick floor rule).
- RG-C2/RG-C5 structure everywhere (class-keyed, zero-param, module-const).
- Brand register: no casino brag vocabulary, no em-dashes, Geist/Geist Mono
  only, slop gate (brand-cohesion Probe 11) on all new copy.
- Preserve everything the feedback praised (see header).

## Acceptance
typecheck · 37/37 · money hashes · portrait gates re-run · live journeys
(cutscene on/off, skip, gold + dud + loss rounds via forced/looped seeds) at
360×740 + 412×915 + desktop · F2 proven with frame captures (balance pixel
never shows post-payout value before reveal) · QA fleet: mobile-touch,
rg-c5 (audio/animation), brand-cohesion + slop gate.

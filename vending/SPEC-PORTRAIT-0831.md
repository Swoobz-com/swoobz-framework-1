# SPEC-PORTRAIT-0831 — AUTOMAT single-screen portrait (Tim's ask 2026-08-31)

Tim: "op mobile moet je ver scrollen — Yurei heeft een all-fitting UI, bouw dat ook
voor AUTOMAT." This supersedes HANDOFF §6 item 2 ("portrait VEND below the fold is
intentional") — Tim has now explicitly asked for the change.

Baseline evidence: `vending-run/shots-portrait-before/` — docH 1407 vs 915/844
viewport = 1.54–1.67 screens of scroll. VEND, machine picker, price and packs all
below the fold.

## Reference grammar

The Hacksaw portrait grammar (skill `mobile-portrait-ui`, shipped in YUREII
`noname/gameyureii` §PORTRAIT-0828 v2). AUTOMAT adaptation: we do NOT port the
fixed 1080×1920 fit() box — AUTOMAT is a fluid React app whose canvas already
scales (`width:100%`, aspect 520/760) and whose slot-pick overlay is
percent-positioned against that canvas. We implement the GRAMMAR (single screen,
full-bleed board, no panel plank, floating controls, slim money strip) inside the
existing mechanism: the injected `<style>` block in `VendingExperience.tsx`
(:1298-1414) + the `@media (max-width: 940px) and (orientation: portrait)` query,
using class hooks + `!important` exactly like the landscape block (:1319-1352).

## Target layout (portrait ≤940px, top → bottom, must fit 100dvh — NO page scroll)

1. **Top strip (~44-52px)** — replaces the big identity plaque card:
   one slim row: `AUTOMAT` wordmark-style title (small caps) · BALANCE value
   right-aligned · the `?` help button as a small circle at the far right
   (≥44px target). SWOOBZ ORIGINALS eyebrow + tagline (`.vend-id-sub`) hidden
   in portrait (landscape already hides the sub — same technique).
2. **Stage — the hero.** `.vend-turntable` spans the full column width
   (viewport minus minimal padding; keep ≥8px side inset so the absolute
   turntable arrows at left/right:-8 don't clip — verify visually). At 412w
   the canvas is 412×602; at 390w, 390×570. Slot-pick tap floor holds
   (canvas ≥337px CSS width ⇒ cells ≥44px) — slot-pick stays OFFERED in
   portrait. Pack rail + status/seed line stay directly under the glass but
   compacted (rail minHeight 56 → ~44, tighter gaps).
3. **Control zone — NO stacked cards.** Everything floats in a compact block
   between stage and money strip:
   - **Hero VEND CTA**: full-width prominent pill (existing `.vend-cta`),
     ≥52px tall, the dominant element. Disclosure line ("TOTAL EXCEEDS
     BALANCE…") renders in a fixed-height slot above it so appearing text
     never reflows the layout.
   - **Machine row**: EASY / MEDIUM / HARD chips in one slim row (existing
     chips, compacted; `.vend-machine-caption` hidden like landscape does).
     The MACHINE·PICK YOURS card chrome (borders/padding/label) stripped —
     chips float.
   - **Stepper row**: ONE row with two compact clusters:
     `PRICE  − 1.00 +`  ·  `PACKS  − 3 +` — the existing selects + −/+
     buttons compacted side by side (each target ≥44px runtime). Card
     chrome stripped; tiny labels above/inline.
   - **CUTSCENE toggle**: small chip on the stepper row's right edge or
     under it — no full-width bar.
   - **LAST VENDS card: hidden in portrait** (history stays reachable on
     desktop/landscape; receipt/verify path is untouched).
4. **Money strip (~34-40px)** — very bottom, slim dark gradient band
   (transparent top edge so it sits ON the scene): text-only
   `TOTAL 3.00 · MAX WIN 300.00` + the compliance line
   `RTP 96.50% · PROVABLY FAIR · PLAY SAFE · SET LIMITS` beneath or inline
   at ≥11px legible size. No boxed wells, no borders. BALANCE lives in the
   top strip. Respect `env(safe-area-inset-bottom)` (viewport-fit=cover is
   already set, no safe-area padding exists yet).

## Height budget check (must hold at BOTH reference viewports)

- Pixel 7 412×915: top ~48 + stage 602+rail ~... + controls + strip ≤ 915.
  If the stage at full width overflows the budget, cap the turntable
  max-width so total height fits (stage shrinks first, never the controls;
  but never below 337px canvas width — below that slot-pick must be
  not-offered like compact landscape, learning 18).
- iPhone 14 Pro 390×844: same check.
- The layout must fit WITHOUT transform:scale on the layout shell —
  learning 13: never scale a layout to fit; compact the real layout.
  (Full-bleed scale on the CANVAS is fine; scaling the CONTROLS is not.)

## Hard constraints (LAW)

- **MONEY LAW**: `vendingMath.ts`, `vendingAudio.ts`, `vendingProvider.ts`
  byte-identical — deliver before/after SHA-256 hashes. Presentation-only.
- **Canvas wrapper contract**: `VendingMachineCanvas.tsx:1450` relative
  wrapper stays; canvas remains the sole aspect-defining child. Read-only.
- **PackRipCutscene `rootRef` stays attached** (:528) and its stage box must
  keep non-zero size; verify the cutscene grid fits the new (taller) portrait
  stage — cards size off width, height is not re-clamped, so check overflow
  live at 390×844 with 20 packs.
- **SettledPanel / help modal** must fit and stay one-overlay-at-a-time.
- **Remove the scrollIntoView hack** (:1161-1177) — dead code once nothing
  scrolls. Do not leave it firing into a non-scrolling page.
- **Restate transforms** in any portrait hover/active override that
  repositions via transform (Yurei gotcha #1).
- **Decorative divs keep `pointer-events:none`** (learning 19); no new
  overlay may eat clicks — verify with real-mouse elementFromPoint probes.
- **Desktop and compact-landscape layouts byte-unchanged in behaviour**:
  regression screenshots at 1280×800 and 852×393 must match today's look;
  the landscape media block is not touched.
- All tap targets ≥44px RUNTIME-measured (not source CSS) at 412×915,
  390×844 (learning 13/18).
- Reduced-motion paths keep working; keyboard access (tabIndex/Enter/Space)
  preserved on everything re-homed.

## Acceptance gates (run before handing back)

1. `npm run typecheck` green · `npm test` 37/37.
2. SHA-256 of vendingMath.ts / vendingAudio.ts / vendingProvider.ts
   identical before/after.
3. Live probe at 412×915 AND 390×844: `docH === innerH` (no scroll), all
   primary controls (VEND, machine chips, all four stepper buttons, help)
   visible at first paint AND ≥44px runtime rects; slot-pick cells ≥44px;
   full vend→rip→settle journey completes; 0 console errors.
4. Desktop 1280×800 + landscape 852×393 screenshots unchanged vs today.

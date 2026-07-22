# AUTOMAT — the multiplier vending machine

A Swoobz Original built 2026-07-16 from Tim's reference set (`input/vending/`:
the beezie claw cabinet + the Collector Crypt gacha machine). A porcelain
vending machine with a cyan neon header vends **multiplier packs**: the player
buys **1..10 packs in one purchase** at a per-pack price; each pack resolves
independently against one fixed public prize table. **1 in 20 packs vends a
GOLD pack** (5x to 100x); standard packs pay EMPTY up to 3x.

## The quartet (framework convention, see repo AGENTS.md)

| Role | File |
|---|---|
| Money engine | `vendingMath.ts` — table + exact-EV identity + load-time drift gate |
| State machine | `vendingProvider.ts` — `useVendingController()`, vend driver, Glass Box |
| Sound | `vendingAudio.ts` — 4 zero-param synth cues (RG-C5) |
| UI / skin | `VendingExperience.tsx` + `VendingMachineCanvas.tsx` |
| Tests | `vendingMath.test.ts`, `vendingProvider.test.ts` (24 tests) |
| Monte-Carlo | `node vendingSim.mjs [packs]` |

## Math (Domain A)

- RTP is **exact-by-construction**: the combined weight table over
  `WEIGHT_TOTAL = 100 000` satisfies `Σ weight·multiplierBps === 9650 · 100 000`
  EXACTLY, so per-pack EV is 96.50% pre-floor for any pack count.
  `mirrorRoundtripCheck()` throws at module load on any drift.
- Per-pack floor: `floor(wagerPerPack × bps / 10000)` (packs are independent
  purchases; mirrors vault's per-tile floor, NOT assay's single final floor).
- Gold slice weight 5 000 (1-in-20). Distribution: 40% EMPTY, 60% any return,
  27% ≥1x. Max win = packCount × 100x.
- Provably fair: committed SHA-256 seed; pack i draws
  `u64(SHA-256(seed ‖ "VENDPACK" ‖ i ‖ attempt))` with **rejection sampling**
  (exact-uniform, no modulo bias) `mod 100 000` → cumulative table walk. The
  settled receipt shows seed hash, seed, and every roll for re-derivation.

## RG structure

- All audio cues zero-param, module-const timings; GOLD differs by outcome
  CLASS only (identical for 5x and 100x). Settle cue value-independent.
- No auto-vend: every purchase is an explicit press. Pace toggle offers
  pack-by-pack or all-at-once reveal (assay precedent).
- prefers-reduced-motion collapses drop physics to fades.

## Run

```
cd vending-run && npm run dev    # port 5283 (strictPort)
npm test / npm run typecheck     # gates
node ../originals/vending/vendingSim.mjs 4000000
```

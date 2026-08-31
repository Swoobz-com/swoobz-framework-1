# ABYSS LINE (assay) — used-assets manifest

Game folder: `originals/assay/` (slug `assay`, display name "ABYSS LINE").
This folder is a **copy/collection** of every asset the ABYSS LINE game code actually references. Originals left in place (copy, not move — moving would break the `./assets/...` import path). Additive: adding this folder does not change the running game.

Method: grepped `originals/assay/*.ts,*.tsx` for all asset-reference patterns (ES imports of image/font/audio files, `./assets/...` paths, `url()`, `<img>`, `new Image`, `drawImage`, `backgroundImage`). The game is a canvas-2D game that draws its coins/board/wordmark procedurally and synthesizes all audio at runtime; the only file-based asset it loads is one SVG backdrop.

## Copied assets (1 — the only code-referenced asset file)
| File | Referenced at | Purpose |
|---|---|---|
| `abyss-background.svg` | `AssayExperience.tsx:71` (`import abyssBgUrl from './assets/abyss-background.svg'`), used `AssayExperience.tsx:1064` (CSS `backgroundImage: url(${abyssBgUrl})`) | The full-cover deep-water scene backdrop (sub + light cone, trench walls, kelp, chest) behind the board |

## Procedural (no asset file — nothing to copy)
For completeness, these game elements look like they'd be image assets but are generated at runtime, so there is no file to collect:
- **Coins / board tiles** — drawn procedurally on canvas. `struckDoubloonDataUrl()` (`AssayGridCanvas.tsx:570`) builds the struck-doubloon sprite via canvas `toDataURL()`; the board's dormant/struck/cracked sprites are drawn with `ctx.drawImage` from runtime-built sprite caches (`AssayGridCanvas.tsx:972,996,1019,…`), not PNG files.
- **ABYSS LINE wordmark** — drawn in-tokens by the `AbyssWordmark` component (`AssayExperience.tsx:1908`), "no image asset" (per its own docstring).
- **Audio** — fully synthesized via Web Audio (oscillators) in `assayAudio.ts` (`playPlungeThunk`/`playClaim`/`playBadVein`/`playBead`); no audio files are loaded.

## Not used (orphans — NOT copied)
Present in `originals/assay/assets/` but NOT referenced by any ABYSS LINE game code (interim / superseded art from earlier theme iterations — the code comments confirm several were explicitly dropped, e.g. "plate-specimen.png image is dropped", "wordmark drawn in-tokens (no image asset)"):
- `abyss-assets.svg` (interim symbol/glow sheet — only self-referential `url(#glow)` defs + PROVENANCE.md, no code import)
- `backdrop.png`, `backdrop-hall-v2.png`, `backdrop-vault.png` (old raster backdrops — superseded by the procedural scene + the one SVG)
- `coin-dormant.png`, `coin-dormant-v2.png`, `coin-gold-v1.png`, `coin-gold-v1-master.png`, `coin-proven.png`, `coin-struck-v3.png`, `coin-struck-v3-master.png` (interim coin art — coins are drawn procedurally)
- `plate-console.png`, `plate-specimen.png` (interim panel plates — code comment: "plate-specimen.png image is dropped")
- `tile-safe-closed.png`, `tile-safe-cracked.png`, `tile-safe-open-coin.png` (interim tile art — tiles drawn procedurally)
- `wordmark.svg`, `wordmark-vault.png`, `wordmark-vault-src.webp` (wordmark is drawn in-tokens, no image)
- `PROVENANCE.md` (documentation, not a loaded asset)

## Grep evidence
`grep -rn "import .*\.(svg|png|...)|/assets/" originals/assay/*.ts,*.tsx` → a single file-asset import: `abyss-background.svg` (`AssayExperience.tsx:71`). All other `assets/` mentions are source comments documenting dropped/procedural art.

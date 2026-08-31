# RUG OR RICHES (vault) — used-assets manifest

Game folder: `originals/vault/` (slug `vault`, display name "RUG OR RICHES").
This folder is a **copy/collection** of every asset the vault game code actually references. Originals are left in place (copying only — moving would break the runtime `/assets/...` paths). Additive: adding this folder does not change the running game.

Method: grepped `originals/vault/*.ts,*.tsx` for all asset-reference patterns (imports, `/assets/...` string paths, `url()`, `<img>`, `new Image()`, `drawImage`, `backgroundImage`). The game loads its assets at runtime via absolute `/assets/...` paths served from the run harness public dir `vault-run/public/assets/`. Copies below were taken from that served source of truth and byte-verified (`cmp`).

## Copied assets (9 — all referenced + physically present)

### Backdrops (one per market "world"/tier) — `VaultGridCanvas.tsx` WORLDS config, drawn as CSS `backgroundImage` in `VaultExperience.tsx`
| File | Referenced at | Purpose |
|---|---|---|
| `backdrop-bluechips.png` | `VaultGridCanvas.tsx:79`; rendered `VaultExperience.tsx:1042,3809` (`currentBackdrop/mobileBackdrop.backdrop`) | Backdrop for the Blue Chips world |
| `backdrop-altseason.png` | `VaultGridCanvas.tsx:97`; rendered `VaultExperience.tsx:1042,3809` | Backdrop for the Altseason world |
| `backdrop-shitcoin.png` | `VaultGridCanvas.tsx:114`; rendered `VaultExperience.tsx:1042,3809` | Backdrop for the Shitcoin world |

### Board tile / coin sprites — `VaultGridCanvas.tsx` consts, drawn via `ctx.drawImage` (loaded through `new Image()` at `VaultGridCanvas.tsx:145-146`, drawn `:1554,:1939`)
| File | Referenced at | Purpose |
|---|---|---|
| `coin-idle.png` | `VaultGridCanvas.tsx:131` (`COIN_IDLE`) | Idle (unrevealed) coin tile sprite |
| `coin-pump.png` | `VaultGridCanvas.tsx:135` (`COIN_PUMP`) | Pumped / winning revealed coin sprite |
| `tile-lockbox.png` | `VaultGridCanvas.tsx:134` (`TILE_LOCKBOX`) | Lockbox tile sprite |
| `tile-rug.png` | `VaultGridCanvas.tsx:136` (`TILE_RUG`); also `VaultExperience.tsx:390` (`RUG_HERO_IMG`) + `:2951` (loss hero `<img>` `:2988`) | Rug (bust) tile sprite + the loss/settled hero image |
| `tile-moon.png` | `VaultGridCanvas.tsx:137` (`TILE_MOON`) | Moon (target/up) tile sprite |
| `loot-4.png` | `VaultExperience.tsx:2951` (win branch of `heroImg`, `<img>` `:2988`) | Win / settled hero art |

## Present (sourced) — 3 Kenney CC0 SFX, added 2026-07-07
The vault audio layer references 3 `.ogg` files; all 3 have been sourced from Kenney CC0 packs (Higgsfield/bespoke generation is offline, so no synthesized/faked audio was used — these are stock CC0 files verified to contain the exact referenced filename). Placed at BOTH the served public path (`vault-run/public/assets/raw/kenney/audio/vault/`) and this used-assets collection folder (`originals/vault/used-assets/raw/kenney/audio/vault/`); both copies are byte-identical (`cmp`) to the file extracted from the Kenney zip.
| Referenced path | Referenced at | Purpose | Kenney pack | Original filename | Author | License |
|---|---|---|---|---|---|---|
| `/assets/raw/kenney/audio/vault/impactMetal_heavy_000.ogg` | `vaultAudio.ts:41` | Mine-hit informational tone | Impact Sounds (kenney.nl) | `Audio/impactMetal_heavy_000.ogg` | Kenney (kenney.nl) | CC0 1.0 |
| `/assets/raw/kenney/audio/vault/impactBell_heavy_002.ogg` | `vaultAudio.ts:46` | Cash-out win chime | Impact Sounds (kenney.nl) | `Audio/impactBell_heavy_002.ogg` | Kenney (kenney.nl) | CC0 1.0 |
| `/assets/raw/kenney/audio/vault/tick_002.ogg` | `vaultAudio.ts:51` | Spin-ready tick | Interface Sounds (kenney.nl) | `Audio/tick_002.ogg` | Kenney (kenney.nl) | CC0 1.0 |

Provenance detail: `impactMetal_heavy_000.ogg` (6,110 bytes) and `impactBell_heavy_002.ogg` (9,252 bytes) came from `kenney_impact-sounds.zip` (Impact Sounds pack, `Audio/` subfolder, License.txt confirms "Creative Commons Zero, CC0" — "free to use in personal, educational and commercial projects"). `tick_002.ogg` (4,514 bytes) came from `kenney_interface-sounds.zip` (Interface Sounds pack, same CC0 license terms), matched by exact filename against the pack's `Audio/tick_001.ogg` / `tick_002.ogg` / `tick_004.ogg` set (no substitution — `tick_002` is present verbatim). Both source pack zips were downloaded to a scratch temp dir, the 3 files extracted by exact filename, then deleted; no pack zips were left in the repo.

## Not used (orphans — NOT copied)
Present in the generation source folder `generated/rug-or-riches/` but NOT referenced by any vault game code (interim / superseded iterations):
- `ape-idle.png`, `ape-pump.png`, `ape-rugged.png` (an alternate "ape" coin/character set — not wired)
- `coin-idle-2.png` (superseded variant; code uses `coin-idle.png`)
- `backdrop-altseason.orig.png` (pre-edit original of the altseason backdrop)
- `PROVENANCE.md` (documentation, not a loaded asset)

Note: the served public dir `vault-run/public/assets/generated/rug-or-riches/` contains exactly the 9 referenced files (no orphans there); the orphans live only in the top-level `generated/rug-or-riches/` generation source, which also lacks `tile-lockbox.png` and `loot-4.png` (those exist only in the served public dir).

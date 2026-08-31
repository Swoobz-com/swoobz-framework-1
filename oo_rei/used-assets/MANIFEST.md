# OO-REI (oo_rei) — used-assets manifest (AUDIO round)

Game folder: `originals/oo_rei/` (slug `oo_rei`). Runner: `oo-rei-run/` (Vite, serves `public/` at web-root `/`).
Theme: Japanese-folklore spirit slot on the island Tamashii-Jima (rice paddies at dusk, shrines, ofuda seals, torii, elemental spirits). Same pattern as the other Originals used-assets collections. Additive: adding this folder does not change the running game.

## Scope of this round: AUDIO only
oo_rei uses BOTH audio files AND a large set of generated image assets. THIS round sourced only the AUDIO (per the audio-treatment task). The many image references (`/assets/generated/oo-rei/...` — backdrops, symbols, spirits, cinematic, cosmetics, HUD, win-calligraphy) are self-authored generated assets referenced across `OoReiSlotCanvas.tsx`, `ooReiMythRegions.ts`, `OoReiExperience.tsx`, `ooReiCosmetics.ts`, etc.; they are OUT OF SCOPE this round and were neither audited nor copied. A future round can inventory/collect them the same way.

## Result: 14 audio files sourced 2026-07-09 (7 Kenney CC0 SFX + 7 music/ambient tracks)

oo_rei DOES use audio FILES. `ooReiAudio.ts` + `ooReiCosmetics.ts` reference 14 audio files — all PHYSICALLY ABSENT before this round (`oo-rei-run/public/` did not exist; created fresh; live `curl` after placement returned HTTP 200). All 14 now sourced as free assets, all DISTINCT (14 unique md5 — no track reused under multiple names), placed at BOTH the served path (`oo-rei-run/public/assets/...`) and this collection (`originals/oo_rei/used-assets/assets/...`), byte-identical copies, OggS + `ffprobe` audio-only-single-stream verified. Higgsfield AI generation was NOT used (audio suite is TTS-only / music model walled to game-pipeline) — SOURCED, not generated.

### Present (sourced) — 7 Kenney CC0 SFX, added 2026-07-09
These are INTERIM "nearest-character" stubs the code itself flags (`ooReiAudio.ts:26` "paths below use nearest-character Kenney samples"; `:136` "ASSET_STUB — needs taiko+paper-rustle"). The referenced paths point at other games' Kenney subdirs; the genuine Kenney CC0 originals are now placed there so the 404s resolve. A FUTURE round should replace them with bespoke taiko / temple-bell / paper-rustle sounds true to the register.
| Referenced path | Referenced at | Purpose | Kenney pack | License |
|---|---|---|---|---|
| `/assets/raw/kenney/audio/oo-climb/woosh2.ogg` | `ooReiAudio.ts:136` | Spin launch | Foley Sounds | CC0 1.0 |
| `/assets/raw/kenney/audio/ladder/impactPlank_medium_000.ogg` | `ooReiAudio.ts:141` | Wooden tablet knock | Impact Sounds | CC0 1.0 |
| `/assets/raw/kenney/audio/pulse/impactBell_heavy_000.ogg` | `ooReiAudio.ts:146` | Amber bell | Impact Sounds | CC0 1.0 |
| `/assets/raw/kenney/audio/oo-bloom/lowFrequency_explosion_000.ogg` | `ooReiAudio.ts:151` | Taiko low body | Sci-Fi Sounds | CC0 1.0 |
| `/assets/raw/kenney/audio/oo-bloom/impactBell_heavy_002.ogg` | `ooReiAudio.ts:156` | Temple bells cascade | Impact Sounds | CC0 1.0 |
| `/assets/raw/kenney/audio/convoy/bong_001.ogg` | `ooReiAudio.ts:161` | Ledger-close bong | Interface Sounds | CC0 1.0 |
| `/assets/raw/kenney/audio/oo-dailies/select_001.ogg` | `ooReiAudio.ts:166` | Paper rustle (chip select) | Interface Sounds | CC0 1.0 |

All extracted from the canonical `Kenney Game Assets All-in-1 3.zip`; each pack's `License.txt` confirmed CC0 1.0. impactBell_heavy_000/002 exist elsewhere in-repo — container `cmp` differed but decode-to-PCM md5 matched, confirming identical underlying Kenney audio.

### Present (sourced) — 7 music / ambient tracks, added 2026-07-09
Sourced from OpenGameArt, matched per-region to the code's own mood copy. Honest note: these run 107–420s (full authentic tracks) rather than the code comment's "90-second seamless loop" ideal — placed full-length rather than risk a destructive loop-point cut; flagged for register/loop review.
| Referenced path | Referenced at | Purpose | Title / Author | Source | License |
|---|---|---|---|---|---|
| `/assets/music/oo_rei/spirit-paddy-dusk.ogg` | `ooReiAudio.ts:123` | Main ambient theme | "Tyhosi Garden 3" / Tozan | opengameart.org/content/tyhosi-garden-3 | CC0 |
| `/assets/audio/oo-rei/region-theme-storm-coast.ogg` | `ooReiCosmetics.ts:218` | Region theme (storm) | "Storm In Cherry Blossoms" / Kaine Carrillo | opengameart.org/content/storm-in-cherry-blossoms | **CC-BY 4.0** |
| `/assets/audio/oo-rei/region-theme-tide-shrine.ogg` | `ooReiCosmetics.ts:230` | Region theme (tide/shrine) | "Hot Springs Town" / Kistol | opengameart.org/content/hot-springs-town | CC0 |
| `/assets/audio/oo-rei/region-theme-ember-pass.ogg` | `ooReiCosmetics.ts:242` | Region theme (ember/forge) | "Forging Flames \| Cinematic, Dark" / Patrick Maney | opengameart.org/content/forging-flames-cinematic-dark | **CC-BY 3.0** |
| `/assets/audio/oo-rei/region-theme-mist-valley.ogg` | `ooReiCosmetics.ts:254` | Region theme (mist) | "Shinrin-Yoku" / Varon Kein (Patrick de Arteaga) | opengameart.org/content/shinrin-yoku | **CC-BY 4.0** |
| `/assets/audio/oo-rei/region-theme-shadow-reach.ogg` | `ooReiCosmetics.ts:266` | Region theme (shadow) | "Dark Zen" / Tsorthan Grove | opengameart.org/content/dark-zen | **CC-BY 4.0** |
| `/assets/audio/oo-rei/region-theme-warden-apex.ogg` | `ooReiCosmetics.ts:278` | Region theme (climax) | "Views From Atop the Jade Kings Throne" / Hitctrl | opengameart.org/content/views-from-atop-the-jade-kings-throne | **CC-BY 3.0** |

Note two different base dirs in code: the main theme uses `/assets/music/oo_rei/` (`ooReiAudio.ts:123`); the 6 region cosmetic tracks use `AUDIO_BASE = /assets/audio/oo-rei` (`ooReiCosmetics.ts:37`). Both satisfied.

## ATTRIBUTION OBLIGATION (action needed before public ship)
Five region tracks are CC-BY and legally REQUIRE visible credit on a credits/attribution surface:
- "Storm In Cherry Blossoms" by Kaine Carrillo (CC-BY 4.0), opengameart.org
- "Forging Flames" by Patrick Maney (CC-BY 3.0), opengameart.org
- "Shinrin-Yoku" by Varon Kein (CC-BY 4.0), opengameart.org
- "Dark Zen" by Tsorthan Grove (CC-BY 4.0), opengameart.org
- "Views From Atop the Jade Kings Throne" by Hitctrl (CC-BY 3.0), opengameart.org
The 7 Kenney SFX + spirit-paddy-dusk + tide-shrine are CC0 (attribution appreciated, not required).

## Wiring caveat (files present ≠ audible yet)
oo_rei audio dispatches through `_shared/audio` (`useSwoobzAudio`, `useSwoobzMusic(MUSIC_OO_REI_THEME)` at `OoReiExperience.tsx:454`; ambient handled by `useSwoobzMusic`, `startAmbientRain/stopAmbientRain` are no-ops). If that shared layer is the no-op shim in this export slice, the files serve + decode but are INERT in live play (WebAudio synth fallback). Making them audible = wire a real (Howler) audio player — a separate code change, out of this additive round's scope.

## Referenced-but-out-of-scope (images, this round)
oo_rei references a large set of on-disk generated image assets under `/assets/generated/oo-rei/` (symbols `OoReiSlotCanvas.tsx:168-175`, myth regions/backdrops `ooReiMythRegions.ts`, cinematic/spirits `OoReiCinematicOverlay.tsx`, cosmetics skins/codex `ooReiCosmetics.ts`, HUD textures, win-calligraphy `OoReiExperience.tsx:383-387`, ally portraits `ooReiRegionArchetypes.ts`). NOT audited or collected this AUDIO round — a future image round can inventory their presence/provenance.

## Grep evidence
`grep -niE '\.ogg|/assets/(music|audio|raw)|playSfx|sources:|MusicRegistration' originals/oo_rei/` → the 14 audio references above (`ooReiAudio.ts` SFX + theme, `ooReiCosmetics.ts` region tracks) + the `useSwoobzAudio/useSwoobzMusic` wiring in `OoReiExperience.tsx`. Image `/assets/generated/oo-rei/...` references are noted separately above (out of audio scope).

# OO-FISHER (oo_fisher) — used-assets manifest

Game folder: `originals/oo_fisher/` (slug `oo_fisher`). Runner: `oo-fisher-run/` (Vite, serves `public/` at web-root `/`).
Same pattern as the other Originals used-assets collections. Additive: adding this folder does not change the running game.

## Result: 8 audio files sourced 2026-07-09 (7 Kenney CC0 SFX + 1 CC-BY music track)

oo_fisher DOES use audio FILES (not pure Web-Audio like Abyss). `originals/oo_fisher/ooFisherAudio.ts` references 8 audio files — all were PHYSICALLY ABSENT from the runner's `public/` before this round (`oo-fisher-run/public/` did not exist; created fresh). All 8 now sourced as free assets and placed. Higgsfield AI audio generation was NOT used — its audio suite is text-to-speech only (the one music model is walled "game pipeline only / must not be used for standalone audio"), so music/SFX are SOURCED, not generated.

Placed at BOTH the served public path (`oo-fisher-run/public/assets/...`) and this used-assets collection (`originals/oo_fisher/used-assets/assets/...`); both copies byte-identical (`cmp`), all OggS-magic + `ffprobe` single-stream verified.

### Present (sourced) — 1 music track (CC-BY 3.0), added 2026-07-09
| Referenced path | Referenced at | Purpose | Title / Author | Source | License | Size / Duration |
|---|---|---|---|---|---|---|
| `/assets/music/oo_fisher/lazy-day.ogg` | `ooFisherAudio.ts:39,51` | Ambient theme loop | "Lazy Day v0_9" / FoxSynergy | opengameart.org/content/lazy-day | **CC-BY 3.0 — attribution required** | 2,470,106 B / 240.000s |

Detail: original `Lazy Day v0_9.mp3` transcoded to OGG Vorbis per the code comment's own spec (`ffmpeg -t 240 -af afade=t=in:st=0:d=0.05 -ar 44100 -c:a libvorbis -qscale:a 3`) — trimmed to exactly 240.000s, 50ms fade-in, q3/44.1kHz. The code (`ooFisherAudio.ts:39`) already cited this exact OpenGameArt source.

### Present (sourced) — 7 Kenney CC0 SFX, added 2026-07-09
All extracted from the canonical `Kenney Game Assets All-in-1 3.zip` (same source cited in this project's `KENNEY-AUDIO-INDEX.md`); each pack's `License.txt` independently confirmed CC0 1.0.
| Referenced path | Referenced at | Purpose | Kenney pack | Original filename | License |
|---|---|---|---|---|---|
| `/assets/raw/kenney/audio/oo-fisher/drip1.ogg` | `ooFisherAudio.ts:76` | Cast launch | Foley Sounds | `Audio/Water/drip1.ogg` | CC0 1.0 |
| `/assets/raw/kenney/audio/oo-fisher/sinkWater1.ogg` | `ooFisherAudio.ts:81` | Fish bite | Foley Sounds | `Audio/Water/sinkWater1.ogg` | CC0 1.0 |
| `/assets/raw/kenney/audio/oo-fisher/tick_002.ogg` | `ooFisherAudio.ts:86` | Reel tap | Interface Sounds | `Audio/tick_002.ogg` | CC0 1.0 |
| `/assets/raw/kenney/audio/oo-fisher/impactBell_heavy_000.ogg` | `ooFisherAudio.ts:91` | Catch fanfare | Impact Sounds | `Audio/impactBell_heavy_000.ogg` | CC0 1.0 |
| `/assets/raw/kenney/audio/oo-fisher/impactMetal_light_000.ogg` | `ooFisherAudio.ts:96` | Line snap | Impact Sounds | `Audio/impactMetal_light_000.ogg` | CC0 1.0 |
| `/assets/raw/kenney/audio/oo-fisher/jingles-saxophone_05.ogg` | `ooFisherAudio.ts:101` | Trip-end fanfare | Music Jingles | `Audio (Saxophone)/jingles-saxophone_05.ogg` | CC0 1.0 |
| `/assets/raw/kenney/audio/oo-fisher/impactBell_heavy_002.ogg` | `ooFisherAudio.ts:106` | Upgrade purchase | Impact Sounds | `Audio/impactBell_heavy_002.ogg` | CC0 1.0 |

Note: tick_002 / impactBell_heavy_000 / impactBell_heavy_002 share filenames with copies already in pulse-run/vault-run, but `cmp` showed those are a different Kenney export edition (different bytes) — all 7 were re-sourced fresh from the single canonical pack for consistent provenance.

## ATTRIBUTION OBLIGATION (action needed before public ship)
`lazy-day.ogg` is **CC-BY 3.0**, which legally REQUIRES visible credit. The game/site must display: **"Lazy Day" by FoxSynergy (CC-BY 3.0), opengameart.org** on a credits/attribution surface. The 7 Kenney SFX are CC0 (attribution appreciated, not required). This is the only CC-BY item for oo_fisher.

## Wiring caveat (files present ≠ audible yet)
Like the other Originals, oo_fisher's audio dispatches through the shared `_shared/audio` layer (`useSwoobzAudio` / `useSwoobzMusic`, `OoFisherExperience.tsx:314`). If that layer is the no-op shim in this export slice, the files serve + decode but are INERT in live play (WebAudio synth fallback in `ooFisherAudio.ts`). Making them audible = wire a real (Howler) audio player — a separate code change, out of this additive round's scope.

## Path-convention note
This used-assets mirror keeps the full `assets/` prefix on both the music and kenney subtrees (`used-assets/assets/music/...`, `used-assets/assets/raw/kenney/...`), mirroring the served path 1:1. (The earlier pulse/vault mirrors dropped `assets/` for their kenney subtree; harmless cosmetic difference — the collection folder is documentation, not a served root.)

## Grep evidence
`grep -niE '\.ogg|/assets/|playSfx|sources:|MusicRegistration' originals/oo_fisher/` → the 8 audio references above (all in `ooFisherAudio.ts`) + the `useSwoobzAudio/useSwoobzMusic` wiring in `OoFisherExperience.tsx`. No other asset-file (image/font/video/SVG) reference found in the game code this round (audio-scope round).

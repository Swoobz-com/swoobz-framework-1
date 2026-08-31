# PULSE (pulse) — used-assets manifest

Game folder: `originals/pulse/` (slug `pulse`).
This folder follows the same pattern as the other Originals used-assets collections. Additive: adding it does not change the running game.

## Result: no image/font/video/SVG asset files copied; 3 SFX + 3 music tracks sourced (SFX 2026-07-07, music 2026-07-09)

**PULSE's visuals are fully procedural** — the game draws everything with canvas 2D + CSS (`PulseCurveCanvas.tsx`, `PulseSceneBackdrop.tsx`, `PulseExperience.tsx`, etc.); the SWOOBZ wordmark is drawn in-code (a `branding/logo/...` path appears only in a source comment noting provenance, `PulseCurveCanvas.tsx:91`, not as a loaded file). A grep of `originals/pulse/*.ts,*.tsx` for every asset-reference pattern (imports of image/font files, `<img>`, `new Image`, `drawImage` of an image, `backgroundImage: url(...)`, `/assets/...` paths) returns **no image, font, video or SVG file reference** — only audio paths.

The code references 6 audio files: 3 Kenney CC0 SFX and 3 ambient music tracks — ALL now sourced (see below). The cosmetics code itself flags these as forward references that "may 404" (`pulseCosmetics.ts:57`); with the files placed, they no longer 404. NOTE: Higgsfield audio generation was reconnected on 2026-07-09, but its audio suite is text-to-speech only (seed_audio / text2speech_v2) plus a music model (sonilo_music) walled to "game pipeline only / must not be used for standalone audio" — so the 3 music tracks could NOT be AI-generated and were instead SOURCED as CC0 from OpenGameArt (the code already cited a CC0 OpenGameArt source for pondering-the-cosmos, confirming these were sourceable, not bespoke-to-generate).

## Present (sourced) — 3 Kenney CC0 SFX, added 2026-07-07
Sourced from Kenney CC0 packs (Higgsfield/bespoke generation is offline; these are stock CC0 files, not synthesized/faked, verified to contain the exact referenced filename). Placed at BOTH the served public path (`pulse-run/public/assets/raw/kenney/audio/pulse/`, freshly created — `pulse-run` had no `public/` dir before this change) and this used-assets collection folder (`originals/pulse/used-assets/raw/kenney/audio/pulse/`); both copies are byte-identical (`cmp`) to the file extracted from the Kenney zip.
| Referenced path | Referenced at | Purpose | Kenney pack | Original filename | Author | License |
|---|---|---|---|---|---|---|
| `/assets/raw/kenney/audio/pulse/impactBell_heavy_000.ogg` | `pulseAudio.ts:35` | Cash-out win chime | Impact Sounds (kenney.nl) | `Audio/impactBell_heavy_000.ogg` | Kenney (kenney.nl) | CC0 1.0 |
| `/assets/raw/kenney/audio/pulse/impactMetal_heavy_000.ogg` | `pulseAudio.ts:40, 49` | Crash thud + bet-commit (damped attack, softer volume) | Impact Sounds (kenney.nl) | `Audio/impactMetal_heavy_000.ogg` | Kenney (kenney.nl) | CC0 1.0 |
| `/assets/raw/kenney/audio/pulse/impactBell_heavy_002.ogg` | `pulseAudio.ts:57` | Perfect-hit chime (brighter bell) | Impact Sounds (kenney.nl) | `Audio/impactBell_heavy_002.ogg` | Kenney (kenney.nl) | CC0 1.0 |

Provenance detail: all 3 files came from `kenney_impact-sounds.zip` (Impact Sounds pack, `Audio/` subfolder; sizes 13,915 / 6,110 / 9,252 bytes respectively; License.txt confirms "Creative Commons Zero, CC0" — "free to use in personal, educational and commercial projects"). Source pack zip was downloaded to a scratch temp dir, the 3 files extracted by exact filename, then deleted; no pack zip was left in the repo.

## Present (sourced) — 3 CC0 ambient music tracks, added 2026-07-09
Sourced as CC0 from OpenGameArt (NOT AI-generated — see note above on why Higgsfield could not generate these). Real, non-corrupt Ogg Vorbis, verified OggS magic bytes (`4f676753`) + `ffprobe` single-stream audio-only Vorbis + `cmp` byte-identical across both placement locations and against the downloaded source. Placed at BOTH the served public path (`pulse-run/public/assets/music/pulse/`) and this used-assets collection folder (`originals/pulse/used-assets/assets/music/pulse/`).
| Referenced path | Referenced at | Purpose | Title / Author | Source | License | Size / Duration |
|---|---|---|---|---|---|---|
| `/assets/music/pulse/pondering-the-cosmos.ogg` | `pulseAudio.ts:364`; `pulseCosmetics.ts:124` (ambient track `track-default`) | Ambient music loop (default theme) | "Pondering the Cosmos" / Ruskerdax | opengameart.org/content/pondering-the-cosmos | CC0 1.0 | 4,180,466 B / 307.8s |
| `/assets/music/pulse/frequency-5.ogg` | `pulseCosmetics.ts:135` (ambient track `track-frequency-5`) | Ambient music loop (cosmetic unlock) | "Background Space Track" (proj. "My Very Own Dead Ship") / yd | opengameart.org/content/background-space-track | CC0 | 4,571,806 B / 226.3s |
| `/assets/music/pulse/void-field.ogg` | `pulseCosmetics.ts:146` (ambient track `track-void`) | Ambient music loop (cosmetic unlock) | "Steller Dreams" / Synth-thetic | opengameart.org/content/steller-dreams | CC0 1.0 | 2,838,145 B / 153.6s |

Provenance detail:
- `pondering-the-cosmos.ogg` — "Pondering the Cosmos" by Ruskerdax, CC0 1.0. Original `Ruskerdax - Pondering the Cosmos_0.mp3` transcoded to OGG Vorbis (`ffmpeg -c:a libvorbis -qscale:a 5`), no other edits.
- `frequency-5.ogg` — "Background Space Track" by yd, CC0. Native OGG render `MyVeryOwnDeadShip.ogg` from `projects.zip`, unmodified. Atmospheric drone bed (tags space/drone/loop/noise) matching the "deeper sub-bass floor, cool and patient" brief.
- `void-field.ogg` — "Steller Dreams" by Synth-thetic, CC0 1.0. Original `steller_dreams.flac` transcoded to OGG Vorbis (`ffmpeg -c:a libvorbis -qscale:a 5 -vn`; `-vn` strips a spurious Theora stream ffmpeg auto-encoded from the FLAC's embedded cover art). Warm drifting synth / wide-reverb / sparse-pulse texture (tags ambient/cosmic/space) matching the "chamber through dark glass" brief.

Register/RG-C5 note: all three are non-escalating ambient loops (no percussion build, no win-triggered dynamics); Pulse switches them only in lobby/bet-entry, never on a round outcome (`pulseCosmetics.ts:112-114`), and amplitude is a module-const in the audio layer. Attribution is not required (CC0) but is captured here as a courtesy.

Wiring caveat (unchanged by this round): the files are present and serve, but the shared music player `originals/_shared/audio/swoobzMusic.ts` is currently a no-op stub — the game falls back to its WebAudio synth pad/arp (`pulseTheme.ts`) and does not actually fetch/play these .ogg samples until a real (e.g. Howler-backed) music player replaces that shim. That is a separate code change, out of this additive round's scope.

## Not used (orphans)
`originals/pulse/` has no `assets/` subfolder and no local asset files, so there are no orphans to note within the game folder. (The images under `pulse-run/src/candle/assets/` — `chairman-*.png`, `pulse-bg-terminal.png` — belong to the separate `pulse-run` runner harness, not the `originals/pulse/` game code, and are therefore out of scope for this manifest.)

## Grep evidence
`grep -rn "/assets/" originals/pulse/` → only the 6 audio lines above (+ the `AUDIO_BASE` const `pulseCosmetics.ts:26`). No image/font/video/SVG asset reference anywhere in the game code.

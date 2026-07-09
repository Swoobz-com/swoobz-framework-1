/**
 * SHIM for the Pulse standalone runner.
 *
 * The real `_shared/audio` preloads Kenney CC0 samples via Howler. These no-op
 * stubs deliberately report every sample as NOT loaded, which forces the
 * game's own WebAudio synthesis fallbacks (pulseAudio.ts / pulseTheme.ts) to
 * run — so the game is still fully audible without the asset pipeline.
 */

export interface SfxRegistration {
  id: string
  sources: string[]
  volume?: number
}

/** Real impl preloads the manifest. Shim: no-op. */
export function useSwoobzAudio(_manifest: ReadonlyArray<SfxRegistration>): void {}

/** Real impl streams ambient music. Shim: no-op (synth theme fallback covers it). */
export function useSwoobzMusic(_track: unknown, _opts?: unknown): void {}

/** Force the WebAudio synth ambient-theme fallback in PulseExperience. */
export function isSampleLoaded(_id: string): boolean {
  return false
}

/** Force the WebAudio synth SFX fallback in pulseAudio.ts. */
export function isSfxLoaded(_id: string): boolean {
  return false
}

/** Real impl plays a loaded sample. Shim: no-op. */
export function playSfx(_id: string): void {}

/** Real impl resumes the AudioContext on first user gesture. Shim: no-op. */
export function unlockAudioOnFirstGesture(): void {}

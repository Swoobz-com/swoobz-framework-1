/**
 * Ambient module declarations for the 6 generated DEEP-CURRENT ASSAY skin
 * assets (`originals/assay/assets/*`), ES-imported directly (there is no
 * `public/` dir in this standalone export — Vite bundles these as hashed
 * URLs like any other imported module). Picked up by `assay-run/tsconfig.json`
 * (`include: ["src", "../originals/assay"]`), so both the game source and the
 * standalone runner typecheck these imports without `any`.
 */
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}

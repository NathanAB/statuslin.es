/// <reference types="vite/client" />

// Custom query suffix handled by the binaryArrayBuffer Vite plugin (vite.config.ts).
// Importing a binary file with `?arraybuffer` inlines it as a Buffer at build time.
declare module '*?arraybuffer' {
  const data: Buffer
  // biome-ignore lint/style/noDefaultExport: Vite asset query imports require default export syntax
  export default data
}

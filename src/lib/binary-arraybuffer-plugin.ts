import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'

// Vite plugin: import binary files as Buffer via the `?arraybuffer` query suffix.
// Used by src/og/font.ts to inline the Nerd Font at build time so the font is bundled
// into .output/server rather than read from the filesystem at runtime (which would fail
// in the Nitro node-server preset because the TTF isn't in .output/).
// Uses the canonical virtual-module pattern (\0 prefix) so Vite's asset pipeline doesn't
// intercept the .ttf before our load hook fires.
// The virtual id carries the absolute path, so load reads it from the id alone: Vitest's module
// cache can hand load an id that this process never resolved.
const VIRTUAL_PREFIX = '\0arraybuffer:'

export function binaryArrayBuffer() {
  return {
    name: 'binary-arraybuffer',
    enforce: 'pre',
    resolveId(id: string, importer?: string) {
      if (!id.endsWith('?arraybuffer')) return null
      const rawPath = id.replace(/\?arraybuffer$/, '')
      const filePath = importer
        ? resolve(dirname(importer), rawPath)
        : resolve(process.cwd(), rawPath)
      return `${VIRTUAL_PREFIX}${filePath}`
    },
    load(id: string) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null
      const data = readFileSync(id.slice(VIRTUAL_PREFIX.length))
      // Embed as base64; decode at runtime into a Buffer (satori accepts Buffer | ArrayBuffer).
      const b64 = data.toString('base64')
      return `export default Buffer.from("${b64}", "base64")`
    },
  } satisfies Plugin
}

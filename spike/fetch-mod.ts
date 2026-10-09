import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ModSource } from './mods'

const CACHE_DIR = join(tmpdir(), 'statuslines-mod-spike', 'tarballs')
const MAX_TARBALL_BYTES = 20 * 1024 * 1024

/**
 * The repository at the pinned commit as a GitHub tarball, cached outside the repo. The bytes are
 * data: they are only ever unpacked and run inside the E2B sandbox.
 */
export async function modTarball(mod: ModSource): Promise<Uint8Array> {
  mkdirSync(CACHE_DIR, { recursive: true })
  const file = join(CACHE_DIR, `${mod.owner}-${mod.repo}-${mod.sha}.tar.gz`)
  if (existsSync(file)) return readFileSync(file)
  const url = `https://codeload.github.com/${mod.owner}/${mod.repo}/tar.gz/${mod.sha}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`tarball ${url}: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength > MAX_TARBALL_BYTES) throw new Error(`tarball ${url} too large`)
  writeFileSync(file, bytes)
  return bytes
}

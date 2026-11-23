import { z } from 'zod'
import { THEME_KEY, THEME_KEY_MAX } from '@/themes/theme'
import type { ThemeFileBytes } from '@/themes/theme-file'

/**
 * The plugin.json keys a mod may have: metadata, its settings (`userConfig`) and the types file
 * validate reads. Any other key can load something validate says nothing about (monitors, MCP
 * servers, settings, dependencies…), so the facts a mod page states would leave it out.
 */
const MANIFEST_KEYS = new Set([
  ...['$schema', 'name', 'version', 'description', 'author', 'license', 'keywords'],
  ...['homepage', 'repository', 'displayName', 'icon', 'documentationUrl', 'supportUrl'],
  ...['privacyPolicyUrl', 'termsOfServiceUrl', 'types', 'userConfig'],
])
/**
 * Where Claude Code 2.1.296 loads a plugin's other parts from without plugin.json naming them (a
 * root skill.md is a skill), and the lockfiles that make it install packages. Lowercase, compared
 * ignoring case, as macOS and Windows open `Monitors/` for `monitors/`.
 */
const LOADED_PATHS = [
  ...['.mcp.json', '.lsp.json', 'settings.json', 'skill.md', 'commands', 'agents', 'skills'],
  ...['output-styles', 'monitors', 'workflows', 'bin', 'hljs'],
  ...['package-lock.json', 'npm-shrinkwrap.json', 'bun.lock', 'bun.lockb', 'yarn.lock'],
  'pnpm-lock.yaml',
]
const THEMES = 'themes'
/** The paths a plugin we list needs, which must be spelled exactly as Claude Code looks them up. */
const OWN_PATHS = [
  '.claude-plugin',
  '.claude-plugin/plugin.json',
  'hooks',
  'hooks/hooks.json',
  THEMES,
]
/** A hooks module path validate prints and the page reads back: no spaces, no punctuation. */
export const MODULE_PATH = /^\.\/[A-Za-z0-9._/-]+$/
/** File names macOS would neither normalise nor fold into another, and that print safely. */
const PRINTABLE = /^[\x20-\x7e]+$/
const HOOKS_FILE = 'hooks/hooks.json'
const HOOKS_MAX_BYTES = 64 * 1024
const SEPARATOR = `--- ${HOOKS_FILE} ---`
/** A terminal theme file is `themes/<key>.json`, read whole, so its count and size are capped. */
const THEME_FILE = /^themes\/(.+)\.json$/
const THEME_FILES_MAX = 200
const THEME_FILE_MAX_BYTES = 16 * 1024
const THEMES_SEPARATOR = `--- ${THEMES}/ ---`
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

const READ_THEME_FILE = `if [ -f "$f" ] && [ ! -L "$f" ]; then n=$((n+1)); printf '%s\\0' "$f"; head -c ${THEME_FILE_MAX_BYTES} "$f" | base64 | tr -d '\\n'; printf '\\0'; fi`

/**
 * Run in the plugin folder: up to 200 regular files `themes/*.json`, each as its path and its first
 * 16 KB in base64, NUL-ended in turn. No name holds NUL and base64 holds none, so no file's bytes can
 * pose as a path, another file or a separator.
 */
export const THEME_FILES_COMMAND = `{ if [ -d ${THEMES} ] && [ ! -L ${THEMES} ]; then n=0; for f in ${THEMES}/*.json; do [ $n -lt ${THEME_FILES_MAX} ] || break; ${READ_THEME_FILE}; done; fi; true; }`

/**
 * One bounded command: each file under the plugin as a NUL-ended `<type> <size> <path>` record (no
 * name holds NUL, so none can pose as a separator), then the theme files, then hooks/hooks.json if
 * it is a file.
 */
export function componentsCommand(pluginDir: string): string {
  const hooksFile = `{ if [ -f ${HOOKS_FILE} ] && [ ! -L ${HOOKS_FILE} ]; then head -c ${HOOKS_MAX_BYTES} ${HOOKS_FILE}; fi; true; }`
  return `cd ${pluginDir} && find . -mindepth 1 -printf '%y %s %P\\0' && printf '\\0${THEMES_SEPARATOR}\\0' && ${THEME_FILES_COMMAND} && printf '\\0${SEPARATOR}\\0' && ${hooksFile}`
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

interface Entry {
  type: string
  size: number
  path: string
}

function readEntries(records: string): Entry[] | null {
  const entries: Entry[] = []
  for (const record of records.split('\0').filter(Boolean)) {
    const match = /^([a-z]) (\d+) (.+)$/s.exec(record)
    if (!match) return null
    entries.push({ type: match[1] ?? '', size: Number(match[2]), path: match[3] ?? '' })
  }
  return entries
}

/** Each theme file's path and base64 bytes, NUL-ended in turn; null when the section is not that. */
function readThemeRecords(section: string): Map<string, string> | null {
  const records = new Map<string, string>()
  if (section === '') return records
  if (!section.endsWith('\0')) return null
  const fields = section.slice(0, -1).split('\0')
  if (fields.length % 2 !== 0) return null
  for (let i = 0; i < fields.length; i += 2) {
    const [path, base64] = [fields[i] ?? '', fields[i + 1] ?? '']
    if (records.has(path) || !BASE64.test(base64)) return null
    records.set(path, base64)
  }
  return records
}

interface Listing {
  entries: Entry[]
  themeRecords: Map<string, string>
  hooksText: string
}

function readListing(listing: string): Listing | null {
  const themesAt = listing.indexOf(`\0${THEMES_SEPARATOR}\0`)
  if (themesAt < 0) return null
  const themesStart = themesAt + THEMES_SEPARATOR.length + 2
  const hooksAt = listing.indexOf(`\0${SEPARATOR}\0`, themesStart)
  if (hooksAt < 0) return null
  const entries = readEntries(listing.slice(0, themesAt))
  const themeRecords = readThemeRecords(listing.slice(themesStart, hooksAt))
  if (entries === null || themeRecords === null) return null
  return { entries, themeRecords, hooksText: listing.slice(hooksAt + SEPARATOR.length + 2) }
}

const themeKey = ({ type, path }: Entry): string | null => {
  const key = type === 'f' ? THEME_FILE.exec(path)?.[1] : undefined
  return key !== undefined && key.length <= THEME_KEY_MAX && THEME_KEY.test(key) ? key : null
}

/** What `themes/` holds besides at most 200 `<key>.json` files of at most 16 KB each. */
function themesExtras(entries: Entry[]): string[] {
  const inThemes = entries.filter(({ path }) => /^themes\/[^/]+$/.test(path))
  const themeFiles = inThemes.filter((entry) => themeKey(entry) !== null)
  return [
    ...inThemes
      .filter(({ type }) => type === 'f' || type === 'd')
      .filter((entry) => themeKey(entry) === null)
      .map(({ type, path }) => (type === 'd' ? `${path}/` : path)),
    ...themeFiles
      .filter(({ size }) => size > THEME_FILE_MAX_BYTES)
      .map(({ path }) => `a ${path} over 16 KB`),
    ...(themeFiles.length > THEME_FILES_MAX
      ? [`${themeFiles.length} theme files, past the ${THEME_FILES_MAX} statuslin.es lists`]
      : []),
  ]
}

function treeExtras(entries: Entry[]): string[] {
  if (entries.some(({ path }) => !PRINTABLE.test(path))) {
    return ['file names with characters other than printable ASCII']
  }
  const byCase = new Map<string, string[]>()
  for (const { path } of entries) {
    byCase.set(path.toLowerCase(), [...(byCase.get(path.toLowerCase()) ?? []), path])
  }
  const loaded = (path: string) => !path.includes('/') && LOADED_PATHS.includes(path.toLowerCase())
  const misspelt = (path: string) =>
    OWN_PATHS.includes(path.toLowerCase()) && !OWN_PATHS.includes(path)
  const hooksFile = entries.find(({ path }) => path === HOOKS_FILE)
  return [
    ...entries
      .filter(({ path }) => loaded(path) || misspelt(path))
      .map(({ type, path }) => (type === 'd' ? `${path}/` : path)),
    ...themesExtras(entries),
    ...entries.filter(({ type }) => type === 'l').map(({ path }) => `a symbolic link (${path})`),
    ...entries
      .filter(({ type }) => !['f', 'd', 'l'].includes(type))
      .map(({ path }) => `a special file (${path})`),
    ...[...byCase.values()]
      .filter((same) => same.length > 1)
      .map((same) => `file names that differ only in case (${same.join(', ')})`),
    ...((hooksFile?.size ?? 0) > HOOKS_MAX_BYTES ? [`a ${HOOKS_FILE} over 64 KB`] : []),
  ]
}

function manifestExtras(manifest: unknown): string[] {
  if (manifest === null || typeof manifest !== 'object') return []
  return Object.keys(manifest)
    .filter((key) => !MANIFEST_KEYS.has(key))
    .map((key) =>
      PRINTABLE.test(key) && key.length <= 64
        ? `"${key}" in plugin.json`
        : 'a plugin.json key with other characters',
    )
}

const hooksFileSchema = z.looseObject({
  modules: z.array(z.string()).optional(),
  hooks: z.record(z.string(), z.unknown()).optional(),
})

function hooksFileExtras(hooksText: string): { extras: string[]; modules: string[] } {
  if (hooksText.trim() === '') return { extras: [], modules: [] }
  const hooksFile = hooksFileSchema.safeParse(parseJson(hooksText))
  if (!hooksFile.success)
    return { extras: [`a ${HOOKS_FILE} statuslin.es cannot read`], modules: [] }
  const { hooks = {}, modules = [] } = hooksFile.data
  return {
    extras: [
      ...(Object.keys(hooks).length > 0 ? [`shell hooks in ${HOOKS_FILE}`] : []),
      ...(modules.some((path) => !MODULE_PATH.test(path))
        ? ['a hooks module path with characters other than letters, digits, ".", "_", "-" and "/"']
        : []),
    ],
    modules,
  }
}

/**
 * What the plugin holds besides hooks modules validate read and terminal theme files, in the
 * submitter's words, from the listing `componentsCommand` printed, plugin.json already parsed and
 * the modules validate noted. Empty for a plugin we list. Null when the listing is not one, which is
 * a failure of ours, not the plugin's.
 */
export function otherComponents(
  listing: string,
  manifest: unknown,
  described: Set<string>,
): string[] | null {
  const read = readListing(listing)
  if (read === null) return null
  const hooksFile = hooksFileExtras(read.hooksText)
  return [
    ...treeExtras(read.entries),
    ...manifestExtras(manifest),
    ...hooksFile.extras,
    ...hooksFile.modules
      .filter((path) => !described.has(path))
      .map((path) => `a hooks module validate did not read (${path})`),
  ]
}

/**
 * The theme files of a listing `otherComponents` found nothing else in: exactly the ones it lists,
 * as the sandbox read them. Null when the files read are not the files listed, a failure of ours.
 */
export function themeFiles(listing: string): ThemeFileBytes[] | null {
  const read = readListing(listing)
  if (read === null) return null
  const files = read.entries.flatMap((entry) => {
    const key = themeKey(entry)
    const base64 = read.themeRecords.get(entry.path)
    return key === null || base64 === undefined
      ? []
      : [{ key, bytes: new Uint8Array(Buffer.from(base64, 'base64')) }]
  })
  const listed = read.entries.filter((entry) => themeKey(entry) !== null).length
  return files.length === listed && files.length === read.themeRecords.size ? files : null
}

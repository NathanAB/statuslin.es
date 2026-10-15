import { z } from 'zod'

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
  ...['output-styles', 'themes', 'monitors', 'workflows', 'bin', 'hljs'],
  ...['package-lock.json', 'npm-shrinkwrap.json', 'bun.lock', 'bun.lockb', 'yarn.lock'],
  'pnpm-lock.yaml',
]
/** The paths a mod needs, which must be spelled exactly as Claude Code looks them up. */
const OWN_PATHS = ['.claude-plugin', '.claude-plugin/plugin.json', 'hooks', 'hooks/hooks.json']
/** A hooks module path validate prints and the page reads back: no spaces, no punctuation. */
export const MODULE_PATH = /^\.\/[A-Za-z0-9._/-]+$/
/** File names macOS would neither normalise nor fold into another, and that print safely. */
const PRINTABLE = /^[\x20-\x7e]+$/
const HOOKS_FILE = 'hooks/hooks.json'
const HOOKS_MAX_BYTES = 64 * 1024
const SEPARATOR = `--- ${HOOKS_FILE} ---`

/**
 * One bounded command: each file under the plugin as a NUL-ended `<type> <size> <path>` record
 * (no name holds NUL, so none can pose as the separator), then hooks/hooks.json if it is a file.
 */
export function componentsCommand(pluginDir: string): string {
  const hooksFile = `{ if [ -f ${HOOKS_FILE} ] && [ ! -L ${HOOKS_FILE} ]; then head -c ${HOOKS_MAX_BYTES} ${HOOKS_FILE}; fi; true; }`
  return `cd ${pluginDir} && find . -mindepth 1 -printf '%y %s %P\\0' && printf '\\0${SEPARATOR}\\0' && ${hooksFile}`
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
 * What the plugin holds besides hooks modules validate read, in the submitter's words, from the
 * listing `componentsCommand` printed, plugin.json already parsed and the modules validate noted.
 * Empty for a mod. Null when the listing is not one, which is a failure of ours, not the plugin's.
 */
export function otherComponents(
  listing: string,
  manifest: unknown,
  described: Set<string>,
): string[] | null {
  const at = listing.indexOf(`\0${SEPARATOR}\0`)
  const entries = at < 0 ? null : readEntries(listing.slice(0, at))
  if (entries === null) return null
  const hooksFile = hooksFileExtras(listing.slice(at + SEPARATOR.length + 2))
  return [
    ...treeExtras(entries),
    ...manifestExtras(manifest),
    ...hooksFile.extras,
    ...hooksFile.modules
      .filter((path) => !described.has(path))
      .map((path) => `a hooks module validate did not read (${path})`),
  ]
}

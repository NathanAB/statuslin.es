import { z } from 'zod'

/**
 * Where Claude Code finds a plugin's components other than hooks modules, by default. Validate
 * reports nothing about them, so the facts a mod page states would leave them out.
 */
const COMPONENT_PATHS = ['.mcp.json', '.lsp.json', 'commands', 'agents', 'skills', 'output-styles']
/** plugin.json fields that declare those components, or a hooks config other than hooks/hooks.json. */
const COMPONENT_FIELDS = [
  'hooks',
  'mcpServers',
  'lspServers',
  'commands',
  'agents',
  'skills',
  'outputStyles',
]
/** A hooks module path validate prints and the page reads back: no spaces, no punctuation. */
export const MODULE_PATH = /^\.\/[A-Za-z0-9._/-]+$/
const HOOKS_FILE = 'hooks/hooks.json'
const HOOKS_MAX_BYTES = 64 * 1024
const SEPARATOR = `--- ${HOOKS_FILE} ---`

/** One bounded command: the component paths that exist, then the start of hooks/hooks.json. */
export function componentsCommand(pluginDir: string): string {
  const exists = COMPONENT_PATHS.map(
    (path) => `if [ -e ${pluginDir}/${path} ]; then echo ${path}; fi;`,
  )
  return `${exists.join(' ')} echo '${SEPARATOR}'; head -c ${HOOKS_MAX_BYTES} ${pluginDir}/${HOOKS_FILE} 2>/dev/null; true`
}

const hooksFileSchema = z.looseObject({
  modules: z.array(z.string()).optional(),
  hooks: z.record(z.string(), z.unknown()).optional(),
})

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const isPresent = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  !(Array.isArray(value) && value.length === 0) &&
  !(typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)

/**
 * What the plugin holds besides hooks modules, in the submitter's words: the listing
 * `componentsCommand` printed and plugin.json, already parsed. Empty when it holds only hooks
 * modules. Null when the listing is not one, which is a failure of ours, not the plugin's.
 */
export function extraComponents(listing: string, manifest: unknown): string[] | null {
  const at = listing.indexOf(`${SEPARATOR}\n`)
  if (at < 0) return null
  const paths = listing
    .slice(0, at)
    .split('\n')
    .filter((line) => COMPONENT_PATHS.includes(line))
  const fields =
    manifest !== null && typeof manifest === 'object'
      ? COMPONENT_FIELDS.filter((field) => isPresent((manifest as Record<string, unknown>)[field]))
      : []
  const hooksText = listing.slice(at + SEPARATOR.length + 1)
  const hooksFile =
    hooksText.trim() === '' ? undefined : hooksFileSchema.safeParse(parseJson(hooksText))
  const shellHooks = hooksFile?.success && isPresent(hooksFile.data.hooks)
  const unsafeModules =
    hooksFile?.success && (hooksFile.data.modules ?? []).some((m) => !MODULE_PATH.test(m))
  return [
    ...paths.map((path) => (path.startsWith('.') ? path : `${path}/`)),
    ...fields.map((field) => `"${field}" in plugin.json`),
    ...(shellHooks ? [`shell hooks in ${HOOKS_FILE}`] : []),
    ...(unsafeModules
      ? ['a hooks module path with characters other than letters, digits, ".", "_", "-" and "/"']
      : []),
    ...(hooksFile && !hooksFile.success ? [`a ${HOOKS_FILE} statuslin.es cannot read`] : []),
  ]
}

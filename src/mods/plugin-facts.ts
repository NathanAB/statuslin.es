import { z } from 'zod'
import type { ModFootprint } from '@/db/schema'
import { SANDBOX_CLAUDE_CODE_BIN } from '@/render/e2b-template'
import type { ModSandbox } from '@/render/mods/mod-sandbox'
import { PLUGIN_NAME, PLUGIN_NAME_RULE } from './curation'
import { componentsCommand, MODULE_PATH, otherComponents, parseJson } from './plugin-components'
import { CONTROL_OR_FORMAT } from './terminal-line'

export interface PluginManifest {
  name: string
  version: string | null
  description: string
}

/** All read inside the sandbox; nothing from the tarball is parsed on the host. */
export interface PluginFacts {
  manifest: PluginManifest
  footprint: ModFootprint
  /** The Claude Code that ran `plugin validate`. */
  claudeCodeVersion: string
}

/**
 * What is wrong with the plugin itself, said to whoever submitted it. Anything else that fails while
 * reading a plugin (the sandbox, the network) is a failure of ours.
 */
export class PluginRefusal extends Error {
  override name = 'PluginRefusal'
}

/** What `claude plugin validate` may print; a plugin's own files decide how long its report is. */
const VALIDATE_MAX_BYTES = 1024 * 1024
const VALIDATE_STDERR_MAX_BYTES = 4096

/** A plugin.json past this is truncated, fails to parse, and the entry is refused. */
const MANIFEST_MAX_BYTES = 64 * 1024

const codePoint = (char: string) =>
  `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

/**
 * Stored and served to every Claude Code client, so a value past its limit, or one carrying a
 * character that can rewrite a terminal or reorder text, refuses the entry.
 */
const atMost = (max: number) =>
  z
    .string()
    .max(max, `must be at most ${max} characters`)
    .superRefine((value, ctx) => {
      const char = CONTROL_OR_FORMAT.exec(value)?.[0]
      if (char === undefined) return
      ctx.addIssue({
        code: 'custom',
        message: `must not contain control or format characters (${codePoint(char)})`,
      })
    })

const manifestSchema = z.object({
  // It becomes the mod's slug and marketplace entry name.
  name: atMost(100).min(1, 'must not be empty').regex(PLUGIN_NAME, PLUGIN_NAME_RULE),
  version: atMost(64).optional(),
  description: atMost(1000).optional(),
})

const FOOTPRINT_MAX_ENTRIES = 200
const FOOTPRINT_ENTRY_MAX_CHARS = 200

function footprintList(kind: 'event' | 'call', entries: Set<string>): string[] {
  if (entries.size > FOOTPRINT_MAX_ENTRIES) {
    throw new PluginRefusal(
      `claude plugin validate reports ${entries.size} ${kind}s; at most ${FOOTPRINT_MAX_ENTRIES} are stored`,
    )
  }
  if ([...entries].some((entry) => entry.length > FOOTPRINT_ENTRY_MAX_CHARS)) {
    throw new PluginRefusal(
      `claude plugin validate reports ${kind}s longer than ${FOOTPRINT_ENTRY_MAX_CHARS} characters`,
    )
  }
  // Shown verbatim to the reviewer, where a zero-width or bidi character could disguise a call.
  const hidden = [...entries].find((entry) => CONTROL_OR_FORMAT.test(entry))
  if (hidden !== undefined) {
    const char = CONTROL_OR_FORMAT.exec(hidden)?.[0] ?? ''
    throw new PluginRefusal(
      `claude plugin validate reports a ${kind} with control or format characters (${codePoint(char)})`,
    )
  }
  return [...entries].sort()
}

/** Validate reports each error as `{ path, message, code }`; only the message is for the submitter. */
const reportErrorSchema = z.union([
  z.string(),
  z.object({ message: z.string() }).transform((error) => error.message),
])

const reportSectionSchema = z.object({
  errors: z.array(reportErrorSchema).optional(),
  notes: z.array(z.string()).optional(),
})

const validateReportSchema = z.object({
  success: z.boolean(),
  manifest: reportSectionSchema.optional(),
  contents: z.array(reportSectionSchema).optional(),
})

/** Splits a note's list on commas outside `{...}` matchers and `(...)` asides. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of list) {
    if (ch === '{' || ch === '(') depth++
    if (ch === '}' || ch === ')') depth--
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
    } else current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/**
 * The events a plugin hooks and the `$` calls it makes, from the `hooks:` and `calls:` notes of
 * `claude plugin validate --json`. Matchers stay (`ui.render{component=AbovePrompt}`); the
 * `(via fn)` asides on calls go.
 */
export function parseFootprint(validateJson: unknown): ModFootprint {
  const { contents = [] } = validateReportSchema.parse(validateJson)
  const events = new Set<string>()
  const calls = new Set<string>()
  for (const note of contents.flatMap((section) => section.notes ?? [])) {
    const labelled = moduleNote(note)
    if (labelled?.label === 'hooks')
      for (const event of splitTopLevel(labelled.list)) events.add(event)
    if (labelled?.label === 'calls' && labelled.list !== NO_CALLS) {
      for (const call of splitTopLevel(labelled.list)) calls.add(call.replace(/\s*\(.*\)$/, ''))
    }
  }
  return { events: footprintList('event', events), calls: footprintList('call', calls) }
}

/** What validate notes for a hooks module that calls nothing on `$`. */
const NO_CALLS = 'nothing on $'
const LABEL = / (hooks|calls): /

/**
 * A `<module path> hooks: …` or `<module path> calls: …` note, or null for any other note. The
 * module path comes from the plugin, so a path with spaces could carry a label of its own (a file
 * named `m calls: $.ui.toast.ts` hides its real calls); such a note is refused.
 */
function moduleNote(note: string): { path: string; label: 'hooks' | 'calls'; list: string } | null {
  if (!LABEL.test(note)) return null
  const match = /^(\S+) (hooks|calls): (.*)$/.exec(note)
  if (!match || !MODULE_PATH.test(match[1] ?? '') || LABEL.test(` ${match[3]}`)) {
    throw new PluginRefusal(
      'claude plugin validate reports a hooks module whose path holds characters other than letters, digits, ".", "_", "-" and "/"',
    )
  }
  return { path: match[1] ?? '', label: match[2] as 'hooks' | 'calls', list: match[3] ?? '' }
}

/** The hooks modules validate read: it notes both what each hooks and what each calls. */
function describedModules(validateJson: unknown): Set<string> {
  const { contents = [] } = validateReportSchema.parse(validateJson)
  const notes = contents.flatMap((section) => section.notes ?? []).map(moduleNote)
  const noted = (label: string) =>
    notes.flatMap((note) => (note?.label === label ? [note.path] : []))
  const calls = new Set(noted('calls'))
  return new Set(noted('hooks').filter((path) => calls.has(path)))
}

export function parseManifest(text: string): PluginManifest {
  const json = parseJson(text)
  if (json === undefined) throw new PluginRefusal('.claude-plugin/plugin.json is not valid JSON')
  const parsed = manifestSchema.safeParse(json)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`)
    throw new PluginRefusal(`.claude-plugin/plugin.json: ${problems.join('; ')}`)
  }
  const { name, version, description } = parsed.data
  return { name, version: version ?? null, description: description ?? '' }
}

function validateErrors(validateJson: unknown): string[] {
  const parsed = validateReportSchema.safeParse(validateJson)
  if (!parsed.success) return ['its output is not a validate report']
  const report = parsed.data
  if (report.success) return []
  const sections = [...(report.manifest ? [report.manifest] : []), ...(report.contents ?? [])]
  const errors = sections.flatMap((section) => section.errors ?? [])
  return errors.length > 0 ? errors : ['it reported success: false']
}

export async function inspectPlugin(sandbox: ModSandbox): Promise<PluginFacts> {
  const version = await sandbox.run(`${SANDBOX_CLAUDE_CODE_BIN} --version`)
  const claudeCodeVersion = /^\d+\.\d+\.\d+/.exec(version.stdout.trim())?.[0]
  if (version.exitCode !== 0 || !claudeCodeVersion) {
    throw new Error(`claude --version failed: ${(version.stderr || version.stdout).trim()}`)
  }

  // Each stream to a file first, so neither can grow without bound in this process.
  const out = `${sandbox.pluginDir}/../validate`
  const validate = await sandbox.run(
    `${SANDBOX_CLAUDE_CODE_BIN} plugin validate --json ${sandbox.pluginDir} >${out}.json 2>${out}.err; code=$?; head -c ${VALIDATE_MAX_BYTES} ${out}.json; head -c ${VALIDATE_STDERR_MAX_BYTES} ${out}.err >&2; exit $code`,
  )
  const validateJson = parseJson(validate.stdout)
  const errors = validateErrors(validateJson)
  if (validate.exitCode !== 0 || errors.length > 0) {
    const detail = errors.length > 0 ? errors : [validate.stderr.trim()]
    throw new PluginRefusal(`claude plugin validate failed: ${detail.join('; ')}`)
  }

  const manifest = await sandbox.run(
    `head -c ${MANIFEST_MAX_BYTES} ${sandbox.pluginDir}/.claude-plugin/plugin.json`,
  )
  if (manifest.exitCode !== 0) throw new PluginRefusal('could not read .claude-plugin/plugin.json')
  const facts = {
    manifest: parseManifest(manifest.stdout),
    footprint: parseFootprint(validateJson),
    claudeCodeVersion,
  }
  await refuseOtherComponents(sandbox, parseJson(manifest.stdout), describedModules(validateJson))
  return facts
}

/**
 * A mod page states what a mod does from what validate reports of its hooks modules: nothing else a
 * plugin holds, and nothing of a module it skips. So anything else is refused, not left unlisted.
 */
async function refuseOtherComponents(
  sandbox: ModSandbox,
  manifest: unknown,
  described: Set<string>,
) {
  const listing = await sandbox.run(componentsCommand(sandbox.pluginDir))
  const extras =
    listing.exitCode === 0 ? otherComponents(listing.stdout, manifest, described) : null
  if (extras === null) throw new Error("could not list the plugin's components")
  if (extras.length > 0) {
    throw new PluginRefusal(
      `statuslin.es lists a mod by what its hooks modules do, so it takes hooks modules only. This plugin also has ${extras.join(', ')}.`,
    )
  }
}

import { z } from 'zod'
import type { ModFootprint } from '@/db/schema'
import { SANDBOX_CLAUDE_CODE_BIN } from '@/render/e2b-template'
import type { ModSandbox } from '@/render/mods/mod-sandbox'

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

/** A plugin.json past this is truncated, fails to parse, and the entry is refused. */
const MANIFEST_MAX_BYTES = 64 * 1024

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

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
  name: atMost(100).min(1, 'must not be empty'),
  version: atMost(64).optional(),
  description: atMost(1000).optional(),
})

const FOOTPRINT_MAX_ENTRIES = 200
const FOOTPRINT_ENTRY_MAX_CHARS = 200

function footprintList(kind: 'event' | 'call', entries: Set<string>): string[] {
  if (entries.size > FOOTPRINT_MAX_ENTRIES) {
    throw new Error(
      `claude plugin validate reports ${entries.size} ${kind}s; at most ${FOOTPRINT_MAX_ENTRIES} are stored`,
    )
  }
  if ([...entries].some((entry) => entry.length > FOOTPRINT_ENTRY_MAX_CHARS)) {
    throw new Error(
      `claude plugin validate reports ${kind}s longer than ${FOOTPRINT_ENTRY_MAX_CHARS} characters`,
    )
  }
  return [...entries].sort()
}

const reportSectionSchema = z.object({
  errors: z.array(z.string()).optional(),
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
    const hooks = / hooks: (.*)$/.exec(note)?.[1]
    const called = / calls: (.*)$/.exec(note)?.[1]
    for (const event of hooks ? splitTopLevel(hooks) : []) events.add(event)
    for (const call of called ? splitTopLevel(called) : [])
      calls.add(call.replace(/\s*\(.*\)$/, ''))
  }
  return { events: footprintList('event', events), calls: footprintList('call', calls) }
}

export function parseManifest(text: string): PluginManifest {
  const json = parseJson(text)
  if (json === undefined) throw new Error('.claude-plugin/plugin.json is not valid JSON')
  const parsed = manifestSchema.safeParse(json)
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`)
    throw new Error(`.claude-plugin/plugin.json: ${problems.join('; ')}`)
  }
  const { name, version, description } = parsed.data
  return { name, version: version ?? null, description: description ?? '' }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
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

  const validate = await sandbox.run(
    `${SANDBOX_CLAUDE_CODE_BIN} plugin validate --json ${sandbox.pluginDir}`,
  )
  const validateJson = parseJson(validate.stdout)
  const errors = validateErrors(validateJson)
  if (validate.exitCode !== 0 || errors.length > 0) {
    const detail = errors.length > 0 ? errors : [validate.stderr.trim()]
    throw new Error(`claude plugin validate failed: ${detail.join('; ')}`)
  }

  const manifest = await sandbox.run(
    `head -c ${MANIFEST_MAX_BYTES} ${sandbox.pluginDir}/.claude-plugin/plugin.json`,
  )
  if (manifest.exitCode !== 0) throw new Error('could not read .claude-plugin/plugin.json')
  return {
    manifest: parseManifest(manifest.stdout),
    footprint: parseFootprint(validateJson),
    claudeCodeVersion,
  }
}

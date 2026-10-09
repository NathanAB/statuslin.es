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

const manifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional(),
  description: z.string().optional(),
})

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
  return { events: [...events].sort(), calls: [...calls].sort() }
}

export function parseManifest(text: string): PluginManifest {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('.claude-plugin/plugin.json is not valid JSON')
  }
  const parsed = manifestSchema.safeParse(json)
  if (!parsed.success) throw new Error('.claude-plugin/plugin.json has no "name"')
  const { name, version, description } = parsed.data
  return { name, version: version ?? null, description: description ?? '' }
}

function validateErrors(stdout: string): string[] {
  let report: z.infer<typeof validateReportSchema>
  try {
    report = validateReportSchema.parse(JSON.parse(stdout))
  } catch {
    return ['its output is not a validate report']
  }
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
  const errors = validateErrors(validate.stdout)
  if (validate.exitCode !== 0 || errors.length > 0) {
    const detail = errors.length > 0 ? errors : [validate.stderr.trim()]
    throw new Error(`claude plugin validate failed: ${detail.join('; ')}`)
  }

  const manifest = await sandbox.run(`cat ${sandbox.pluginDir}/.claude-plugin/plugin.json`)
  if (manifest.exitCode !== 0) throw new Error('could not read .claude-plugin/plugin.json')
  return {
    manifest: parseManifest(manifest.stdout),
    footprint: parseFootprint(JSON.parse(validate.stdout)),
    claudeCodeVersion,
  }
}

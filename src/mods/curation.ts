import { z } from 'zod'

/** Relative to the repo root, where the import script and the tests both run. */
export const CURATION_FILE = 'src/mods/curation.json'

const REPO_URL = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/
const COMMIT_SHA = /^[0-9a-f]{40}$/
/** Claude Code's rule for a plugin id. */
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/

const segments = (path: string) => (path === '' ? [] : path.split('/'))

/** Typed into the prompt after the scripted turn; `submit: false` leaves it unsent. */
const inputStepSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1),
  submit: z.boolean().optional(),
})

const entrySchema = z.strictObject({
  repoUrl: z
    .string()
    .regex(REPO_URL, 'must be an https://github.com/<owner>/<repo> URL')
    .refine((url) => !/(\.git|\/\.{1,2})$/i.test(url), 'must not end in .git, "." or ".."'),
  /** The folder holding `.claude-plugin/plugin.json`; '' for the repository root. */
  path: z
    .string()
    .refine(
      (path) => segments(path).every((s) => PATH_SEGMENT.test(s) && s !== '.' && s !== '..'),
      'must be "" or "/"-separated names of letters, digits, ".", "_" and "-", without "." or ".."',
    )
    .refine(
      (path) => !segments(path).some((s) => s.startsWith('-')),
      'must not have a segment starting with "-"',
    ),
  commitSha: z.string().regex(COMMIT_SHA, 'must be a full 40-character lowercase hex commit SHA'),
  pluginName: z
    .string()
    .regex(PLUGIN_NAME, 'must start with a letter or digit, then letters, digits, ".", "_" or "-"'),
  title: z.string().trim().min(1, 'must not be empty'),
  inputSteps: z.array(inputStepSchema).default([]),
})

export type InputStep = z.infer<typeof inputStepSchema>
export type CurationEntry = z.infer<typeof entrySchema>

export type CurationResult =
  | { ok: true; entries: CurationEntry[] }
  | { ok: false; errors: string[] }

function entryLabel(raw: unknown, index: number): string {
  const name = (raw as { pluginName?: unknown } | null)?.pluginName
  return `entry ${index + 1}${typeof name === 'string' ? ` (${name})` : ''}`
}

function duplicateNames(entries: CurationEntry[]): string[] {
  const firstSeen = new Map<string, number>()
  return entries.flatMap((entry, index) => {
    const first = firstSeen.get(entry.pluginName)
    if (first === undefined) {
      firstSeen.set(entry.pluginName, index)
      return []
    }
    return [
      `${entryLabel(entry, index)}: plugin name "${entry.pluginName}" is already used by entry ${first + 1}`,
    ]
  })
}

/** Every problem in the file at once, so one edit can fix them all before anything is written. */
export function parseCuration(raw: unknown): CurationResult {
  if (!Array.isArray(raw)) return { ok: false, errors: ['the curation file must be a JSON array'] }
  const entries: CurationEntry[] = []
  const errors: string[] = []
  raw.forEach((item, index) => {
    const parsed = entrySchema.safeParse(item)
    if (parsed.success) entries.push(parsed.data)
    else {
      for (const issue of parsed.error.issues) {
        errors.push(`${entryLabel(item, index)} ${issue.path.join('.')}: ${issue.message}`)
      }
    }
  })
  if (errors.length === 0) errors.push(...duplicateNames(entries))
  return errors.length === 0 ? { ok: true, entries } : { ok: false, errors }
}

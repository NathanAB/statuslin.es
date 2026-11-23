import { z } from 'zod'
import { TERMINAL_CARD_SURFACE } from '@/lib/card-surface'
import { MAX_TERMINAL_COLS, MAX_TERMINAL_ROWS, TERMINAL } from '@/render/mods/terminal'
import { THEME_KEY, THEME_KEY_MAX, THEME_WINDOWS } from '@/themes/theme'
import { themeNameSchema, themeNameShape } from '@/themes/theme-file'

/** Relative to the repo root, where the import script and the tests both run. */
export const CURATION_FILE = 'src/mods/curation.json'

const REPO_URL = /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/
export const COMMIT_SHA = /^[0-9a-f]{40}$/
/** Claude Code's rule for a plugin id. A mod's slug follows it too: it lands in shell commands. */
export const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
export const PLUGIN_NAME_RULE =
  'must start with a letter or digit, then letters, digits, ".", "_" or "-"'
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/

const segments = (path: string) => (path === '' ? [] : path.split('/'))

/** Typed into the prompt after the scripted turn; `submit: false` leaves it unsent. */
const textStepSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1),
  submit: z.boolean().optional(),
})

/** A left click on a 1-based cell of the recording terminal, for a mod that starts on a click. */
const clickStepSchema = z.strictObject({
  type: z.literal('click'),
  row: z.int().min(1).max(TERMINAL.rows),
  col: z.int().min(1).max(TERMINAL.cols),
})

const inputStepSchema = z.discriminatedUnion('type', [textStepSchema, clickStepSchema])

/** Also parses the steps the import stored, since mod_versions.input_steps is untyped jsonb. */
export const inputStepsSchema = z.array(inputStepSchema)

/**
 * A wider, taller or fullscreen terminal, for a mod that draws only there. Also parses the stored setup,
 * since mod_versions.terminal is untyped jsonb.
 */
export const terminalSetupSchema = z.strictObject({
  cols: z.int().min(TERMINAL.cols).max(MAX_TERMINAL_COLS),
  rows: z.int().min(TERMINAL.rows).max(MAX_TERMINAL_ROWS).optional(),
  fullscreen: z.boolean(),
})

/**
 * A Desktop theme the operator declares for a mod that sets one (src/themes/theme.ts `DesktopTheme`).
 * Its switch steps are sent in Claude Desktop the way text input steps are, and the recorder
 * refuses them past the same limits.
 */
const desktopThemeSchema = z.strictObject({
  key: z
    .string()
    .max(THEME_KEY_MAX, `must be at most ${THEME_KEY_MAX} characters`)
    .regex(THEME_KEY, 'must start with a letter or digit, then letters, digits, ".", "_" or "-"'),
  name: themeNameSchema,
  window: z.enum(THEME_WINDOWS),
  switchSteps: z.array(z.string().min(1, 'must not be empty')).default([]),
})

type DesktopThemeEntry = z.infer<typeof desktopThemeSchema>

/** Two of an entry's Desktop themes with one key, or names a visitor would read as one. */
function sameDesktopThemes(themes: DesktopThemeEntry[], ctx: z.RefinementCtx): void {
  const keys = new Set<string>()
  const names = new Map<string, string>()
  for (const theme of themes) {
    if (keys.has(theme.key)) {
      ctx.addIssue({ code: 'custom', message: `has two themes with the key "${theme.key}"` })
    }
    keys.add(theme.key)
    const shape = themeNameShape(theme.name)
    const named = names.get(shape)
    if (named !== undefined) {
      ctx.addIssue({ code: 'custom', message: `has two themes named "${named}", ignoring case` })
    }
    names.set(shape, theme.name)
  }
}

/** The folder holding `.claude-plugin/plugin.json`; '' for the repository root. */
export const pluginPathSchema = z
  .string()
  .refine(
    (path) => segments(path).every((s) => PATH_SEGMENT.test(s) && s !== '.' && s !== '..'),
    'must be "" or "/"-separated names of letters, digits, ".", "_" and "-", without "." or ".."',
  )
  .refine(
    (path) => !segments(path).some((s) => s.startsWith('-')),
    'must not have a segment starting with "-"',
  )

/** The fields that pin a plugin folder, shared with the unreviewed mods file (src/mods/unreviewed.ts). */
export const pinnedPluginFields = {
  repoUrl: z
    .string()
    .regex(REPO_URL, 'must be an https://github.com/<owner>/<repo> URL')
    .refine((url) => !/(\.git|\/\.{1,2})$/i.test(url), 'must not end in .git, "." or ".."'),
  path: pluginPathSchema,
  commitSha: z.string().regex(COMMIT_SHA, 'must be a full 40-character lowercase hex commit SHA'),
  pluginName: z.string().regex(PLUGIN_NAME, PLUGIN_NAME_RULE),
}

const entrySchema = z.strictObject({
  ...pinnedPluginFields,
  title: z.string().trim().min(1, 'must not be empty'),
  inputSteps: inputStepsSchema.default([]),
  /** Left out, the card shows the Claude Desktop shot first. */
  cardSurface: z.literal(TERMINAL_CARD_SURFACE).optional(),
  /** Left out, the terminal preview is recorded in the default terminal. */
  terminal: terminalSetupSchema.optional(),
  /** Left out, the mod lists no Desktop theme on /themes. */
  desktopThemes: z.array(desktopThemeSchema).superRefine(sameDesktopThemes).optional(),
})

export type InputStep = z.infer<typeof inputStepSchema>
export type TextStep = z.infer<typeof textStepSchema>
export type CurationEntry = z.infer<typeof entrySchema>

export type EntriesResult<T> = { ok: true; entries: T[] } | { ok: false; errors: string[] }

export type CurationResult = EntriesResult<CurationEntry>

export function entryLabel(raw: unknown, index: number): string {
  const name = (raw as { pluginName?: unknown } | null)?.pluginName
  return `entry ${index + 1}${typeof name === 'string' ? ` (${name})` : ''}`
}

/**
 * Every problem in a file of entries at once, so one edit can fix them all before anything is
 * written. `duplicates` runs only once each entry parses.
 */
export function parseEntries<T>(
  raw: unknown,
  {
    file,
    schema,
    duplicates,
  }: {
    file: string
    schema: z.ZodType<T>
    duplicates: (entries: T[]) => string[]
  },
): EntriesResult<T> {
  if (!Array.isArray(raw)) return { ok: false, errors: [`${file} must be a JSON array`] }
  const entries: T[] = []
  const errors: string[] = []
  raw.forEach((item, index) => {
    const parsed = schema.safeParse(item)
    if (parsed.success) entries.push(parsed.data)
    else {
      for (const issue of parsed.error.issues) {
        errors.push(`${entryLabel(item, index)} ${issue.path.join('.')}: ${issue.message}`)
      }
    }
  })
  if (errors.length === 0) errors.push(...duplicates(entries))
  return errors.length === 0 ? { ok: true, entries } : { ok: false, errors }
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

export function parseCuration(raw: unknown): CurationResult {
  return parseEntries(raw, {
    file: 'the curation file',
    schema: entrySchema,
    duplicates: duplicateNames,
  })
}

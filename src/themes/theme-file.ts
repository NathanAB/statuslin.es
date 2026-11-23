import { z } from 'zod'
import { atMost, codePoint } from '@/mods/plain-text'
import { parseJson } from '@/mods/plugin-components'
import { CONTROL_OR_FORMAT } from '@/mods/terminal-line'
import {
  TERMINAL_THEME_BASES,
  type TerminalThemeFile,
  THEME_NAME_MAX,
  terminalThemeWindow,
} from './theme'

/** A file from a plugin's `themes/` folder, as the inspection sandbox read it. */
export interface ThemeFileBytes {
  key: string
  bytes: Uint8Array
}

export type ThemeFilesResult =
  | { ok: true; themes: TerminalThemeFile[] }
  | { ok: false; problems: string[] }

const LINE_SPACE = new Set(['\t', '\n', '\r'])

/** A field name or token an error can print: what a theme file's own fields and tokens look like. */
const PRINTABLE_KEY = /^[\x20-\x7e]{1,64}$/
const TOKEN_RULE = 'must be 1 to 64 printable ASCII characters'
const FIELDS = ['$schema', 'name', 'base', 'overrides']

/** Hangul fillers count as letters in Unicode but draw nothing, so a name of them looks blank. */
const FILLER = /[\u115F\u1160\u3164\uFFA0]/gu

/**
 * A name as a visitor reads it in `/theme`, to tell two apart: NFKC folds fullwidth and other
 * compatibility forms into their plain letters, and spacing and case don't count.
 */
function nameShape(name: string): string {
  return name.normalize('NFKC').replace(FILLER, '').replace(/\s+/gu, ' ').trim().toLowerCase()
}

const hasLetterOrDigit = (name: string) => /[\p{L}\p{N}]/u.test(nameShape(name))

/** Latin, Greek and Cyrillic share letter shapes, so a name mixing them can pose as another. */
const LOOKALIKE_SCRIPTS = [/\p{Script=Latin}/u, /\p{Script=Greek}/u, /\p{Script=Cyrillic}/u]
const oneLookalikeScript = (name: string) =>
  LOOKALIKE_SCRIPTS.filter((script) => script.test(name)).length <= 1

/**
 * A terminal theme file as code.claude.com/docs/en/terminal-config describes it. Claude Code ignores
 * unknown tokens and colors it can't read, so neither is interpreted here; both are only bounded.
 */
const themeFileSchema = z.object({
  $schema: z.string({ error: 'must be text' }).optional(),
  name: atMost(THEME_NAME_MAX)
    .refine(hasLetterOrDigit, 'must have a letter or digit')
    .refine(
      oneLookalikeScript,
      'mixes Latin, Greek or Cyrillic letters, which can pose as another name',
    )
    .optional(),
  base: z
    .enum(TERMINAL_THEME_BASES, { error: `must be one of ${TERMINAL_THEME_BASES.join(', ')}` })
    .optional(),
  overrides: z
    .record(z.string().regex(PRINTABLE_KEY, TOKEN_RULE), atMost(64), {
      error: 'must be an object of token names to colors',
    })
    .optional(),
})

const shown = (key: PropertyKey) =>
  typeof key === 'string' && PRINTABLE_KEY.test(key) ? key : '(a name with other characters)'

function issueText(issue: z.core.$ZodIssue): string {
  const path = issue.path.map(shown).join('.')
  if (issue.code === 'invalid_key') return `${path} has a token name that ${TOKEN_RULE}`
  if (issue.code === 'invalid_type' && path.includes('.')) return `${path} must be text`
  return `${path} ${issue.message}`
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

function decode(bytes: Uint8Array): string | undefined {
  try {
    return utf8.decode(bytes)
  } catch {
    return undefined
  }
}

function parseFile({ key, bytes }: ThemeFileBytes): TerminalThemeFile | string[] {
  const where = `themes/${key}.json`
  const source = decode(bytes)
  if (source === undefined) return [`${where} is not UTF-8 text`]
  // The operator reads the file as stored, so a character that hides or reorders text could disguise it.
  const hidden = [...source].find((char) => !LINE_SPACE.has(char) && CONTROL_OR_FORMAT.test(char))
  if (hidden !== undefined) {
    return [`${where} holds a control or format character (${codePoint(hidden)})`]
  }
  const json = parseJson(source)
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return [`${where} is not a JSON object`]
  }
  const unknown = Object.keys(json)
    .filter((field) => !FIELDS.includes(field))
    .map((field) => {
      const named = PRINTABLE_KEY.test(field) ? `"${field}"` : 'a field with other characters'
      return `${where}: ${named} is not a theme file field (it may have ${FIELDS.join(', ')})`
    })
  const parsed = themeFileSchema.safeParse(json)
  if (!parsed.success || unknown.length > 0) {
    const invalid = parsed.success
      ? []
      : parsed.error.issues.map((i) => `${where}: ${issueText(i)}`)
    return [...unknown, ...invalid]
  }
  const { name = key, base = 'dark' } = parsed.data
  return { key, name, window: terminalThemeWindow(base), source }
}

/** Two themes one `/theme` list would show alike, as a visitor picks a theme there by its name. */
function sameNames(themes: TerminalThemeFile[]): string[] {
  const first = new Map<string, TerminalThemeFile>()
  return themes.flatMap((theme) => {
    const shape = nameShape(theme.name)
    const seen = first.get(shape)
    if (seen === undefined) {
      first.set(shape, theme)
      return []
    }
    return [
      `themes/${seen.key}.json and themes/${theme.key}.json are both named "${seen.name}" (ignoring case, spacing and letter width), and /theme picks a theme by its name`,
    ]
  })
}

/**
 * A plugin's terminal theme files, parsed on the host from the bytes the sandbox read. A name and
 * the colors are the author's text: bounded, refused when they carry a control or format character,
 * and shown only as plain text. Every problem in every file comes back at once.
 */
export function parseTerminalThemeFiles(files: readonly ThemeFileBytes[]): ThemeFilesResult {
  const sorted = [...files].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const read = sorted.map(parseFile)
  const themes = read.filter((theme): theme is TerminalThemeFile => !Array.isArray(theme))
  const problems = [...read.filter((theme) => Array.isArray(theme)).flat(), ...sameNames(themes)]
  return problems.length > 0 ? { ok: false, problems } : { ok: true, themes }
}

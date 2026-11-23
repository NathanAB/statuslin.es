import { z } from 'zod'
import { CONTROL_OR_FORMAT } from './terminal-line'

/** A character named by its code point, so an error never prints the character itself. */
export const codePoint = (char: string) =>
  `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`

/**
 * Author text that is stored and served to every Claude Code client, so a value past its limit, or
 * one carrying a character that can rewrite a terminal or reorder text, refuses the plugin.
 */
export const atMost = (max: number) =>
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

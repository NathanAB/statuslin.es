import type { AnsiSegment } from '@/render/types'

const GREY = 'rgb(153, 153, 153)'
const seg = (text: string, fg: string | null = GREY): AnsiSegment => ({
  text,
  fg,
  bg: null,
  bold: false,
  italic: false,
  underline: false,
})

/** The line Claude Code prints, wrapped at 80 columns, when a mod's session.start hook throws. */
const hookError = (plugin: string): AnsiSegment[] => [
  seg('●'),
  seg(' ', null),
  seg(`${plugin}: session.start hook skipped: threw TypeError: undefined is not an object `),
  seg('\n  ', null),
  seg("(evaluating '$.theme.set')"),
]

/** gotham-night's recorded terminal preview: a Desktop theme mod, whose only output there is the
 * error from calling $.theme.set, which the terminal lacks. */
export const HOOK_ERROR_ONLY_PREVIEW: AnsiSegment[] = hookError('gotham-night')

/** multiverse's recorded terminal preview: the same error, then a row the mod draws itself. */
export const HOOK_ERROR_WITH_OUTPUT_PREVIEW: AnsiSegment[] = [
  ...hookError('multiverse'),
  seg('\n  ', null),
  seg(' '.repeat(15), 'rgb(255, 193, 7)'),
  seg(' '.repeat(36)),
  seg(' '.repeat(37), null),
  seg('Low Poly'),
]

/** The line Claude Code prints when a hooks module registers `$.theme.set`, which the terminal
 * lacks, so it refuses to load the module there. The wrap keeps the space before it, or not. */
const moduleLoadError = (plugin: string, beforeWrap: string): AnsiSegment[] => [
  seg('●'),
  seg(' ', null),
  seg(
    `${plugin}: hooks module did not load: the $ build failed (registered theme.set, but no loaded${beforeWrap}`,
  ),
  seg('\n  ', null),
  seg('plugin provides $.theme)'),
]

/** abyss's recorded terminal preview, a Desktop theme mod: its line wraps after a space. */
export const MODULE_LOAD_ERROR_ONLY_PREVIEW: AnsiSegment[] = moduleLoadError('abyss', ' ')

/** arcade's recorded terminal preview: the same line, wrapped with no space before the break. */
export const MODULE_LOAD_ERROR_TIGHT_WRAP_PREVIEW: AnsiSegment[] = moduleLoadError('arcade', '')

/** A hooks module that fails to load for a reason of its own, which says nothing about Desktop. */
export const MODULE_BROKEN_PREVIEW: AnsiSegment[] = [
  seg('●'),
  seg(' ', null),
  seg('broken: hooks module did not load: SyntaxError: Unexpected token'),
]

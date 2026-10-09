import { structuredPatch } from 'diff'
import type { DiffLine } from '@/ui/line-diff'

const MARKER_KIND = { '+': 'added', '-': 'removed', ' ': 'context' } as const

/** The changed lines of `after` against `before`, three lines of context around each change.
 *  Empty when the scripts are identical. */
export function scriptDiff(before: string, after: string): DiffLine[] {
  const { hunks } = structuredPatch('live', 'update', before, after, '', '', { context: 3 })
  return hunks.flatMap((hunk) => [
    {
      kind: 'meta' as const,
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    },
    ...hunk.lines.map((line): DiffLine => {
      const kind = MARKER_KIND[line[0] as keyof typeof MARKER_KIND]
      // jsdiff's only other line is "\ No newline at end of file".
      return kind ? { kind, text: line.slice(1) } : { kind: 'meta', text: line }
    }),
  ])
}

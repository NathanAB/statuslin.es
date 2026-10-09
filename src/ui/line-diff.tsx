import { cn } from '@/lib/cn'

export type DiffLine =
  | { kind: 'added' | 'removed' | 'context'; text: string }
  /** A hunk header or a "\ No newline at end of file" marker. */
  | { kind: 'meta'; text: string }

const LINE = 'block whitespace-pre border-l-2 px-3 no-underline'

function Line({ line }: { line: DiffLine }) {
  switch (line.kind) {
    case 'added':
      return (
        <ins
          className={cn(LINE, 'border-primary bg-primary/25 text-foreground')}
        >{`+${line.text}`}</ins>
      )
    case 'removed':
      return (
        <del
          className={cn(LINE, 'border-destructive bg-destructive/10 text-muted-foreground')}
        >{`-${line.text}`}</del>
      )
    case 'context':
      return (
        <span className={cn(LINE, 'border-transparent text-foreground')}>{` ${line.text}`}</span>
      )
    case 'meta':
      return (
        <span className={cn(LINE, 'border-transparent text-muted-foreground')}>{line.text}</span>
      )
  }
}

/** A unified line diff in a code well: added lines tinted coral, removed lines red, each with
 *  its +/- marker so color is never the only signal. Lines run full width and scroll sideways. */
export function LineDiff({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-sunken py-3 font-mono text-foreground text-sm">
      <span className="block w-max min-w-full">
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a diff is rendered once, never reordered.
          <Line key={i} line={line} />
        ))}
      </span>
    </pre>
  )
}

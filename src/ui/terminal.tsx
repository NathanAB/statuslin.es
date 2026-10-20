import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { AnsiSegment } from '@/render/types'
import { StatuslinePreview } from '@/ui/statusline-preview'

/** One line of a sample Claude Code conversation. */
export type TranscriptLine =
  /** Your message: `❯ text` on the turn's fill. */
  | { kind: 'prompt'; text: string }
  /** A tool call: `● Name(target)`. */
  | { kind: 'tool'; name: string; target: string }
  /** A tool's result under it, dimmed: `⎿  text`. */
  | { kind: 'result'; text: string }
  /** Claude's reply: `● first line`, the rest indented under it. */
  | { kind: 'say'; lines: string[] }
  /** A dimmed line of its own (the welcome, how long a turn took). */
  | { kind: 'note'; text: string }

// After a change, new content settles in from just below. Motion only when the visitor allows it.
const SETTLE =
  'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1.5 motion-safe:duration-700 motion-safe:ease-settle'

// Claude Code's own marks (❯ your turn, ● a step, ⎿ its result) are decoration to a screen reader.
const mark = (glyph: string) => <span aria-hidden="true">{glyph}</span>

function TranscriptRow({ line }: { line: TranscriptLine }) {
  switch (line.kind) {
    case 'prompt':
      return (
        <span className="bg-terminal-turn text-foreground">
          {mark('❯')} {line.text}
        </span>
      )
    case 'tool':
      return (
        <>
          {mark('●')} {line.name}({line.target})
        </>
      )
    case 'result':
      return (
        <span className="text-terminal-muted">
          {'  '}
          {mark('⎿')}
          {`  ${line.text}`}
        </span>
      )
    case 'say':
      return (
        <>
          {mark('●')} {line.lines.join('\n  ')}
        </>
      )
    case 'note':
      return <span className="text-terminal-muted">{line.text}</span>
  }
}

/** A sample conversation's lines, one under another, as Claude Code prints them. */
function Transcript({ lines }: { lines: TranscriptLine[] }) {
  return lines.map((line, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed transcript, ordered, with no ids.
    <span key={i}>
      {i > 0 ? '\n' : null}
      <TranscriptRow line={line} />
    </span>
  ))
}

/**
 * The home hero's Claude Code session, in a frame: an optional toolbar on the frame (the session
 * switcher), then the screen, a fixed height so nothing below it moves, with the conversation, the
 * input box and the status line under it, as Claude Code lays them out. The screen is one picture
 * to a screen reader, named by `label`, so it never reads out box-drawing characters.
 * Nothing moves on the first render. Once `conversationChanged`, each new conversation (named by
 * `conversationKey`) settles in with its caption; once `statusChanged`, each new status line
 * (named by `statusKey`) glows for a moment.
 */
export function Terminal({
  label,
  toolbar,
  transcript,
  status,
  conversationKey,
  conversationChanged,
  statusKey,
  statusChanged,
}: {
  label: string
  toolbar?: { title: string; titleId: string; control: ReactNode; caption: string }
  transcript: TranscriptLine[]
  /** The status line's render, or null when it has none for this session. */
  status: AnsiSegment[] | null
  conversationKey: string
  conversationChanged: boolean
  statusKey: string
  statusChanged: boolean
}) {
  const settle = conversationChanged ? SETTLE : undefined
  return (
    <div className="rounded-frame bg-card p-1.75">
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 pt-1.5 pr-2 pb-3.25 pl-3.5">
          <span id={toolbar.titleId} className="font-medium text-foreground text-small">
            {toolbar.title}
          </span>
          {toolbar.control}
          {/* As wide as the longest caption, so every session's toolbar wraps at the same width
              and the frame keeps its height when the session changes. */}
          <p
            key={conversationKey}
            className={cn(
              'ml-auto min-w-[18.5em] text-right text-muted-foreground text-small tabular-nums',
              settle,
            )}
          >
            {toolbar.caption}
          </p>
        </div>
      ) : null}
      <div
        role="img"
        aria-label={label}
        data-ui=""
        className="flex h-[clamp(23.75rem,31vw,27.875rem)] flex-col justify-end overflow-hidden rounded-screen bg-sunken px-6 pt-5.5 pb-5 font-mono text-[0.875rem] text-terminal-foreground leading-[1.45] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_5%,transparent)] max-md:h-72 max-md:px-4 max-md:pt-4 max-md:pb-3.5 max-md:text-[0.8125rem]"
      >
        <pre
          key={conversationKey}
          className={cn('min-h-0 shrink overflow-hidden whitespace-pre font-mono', settle)}
        >
          <Transcript lines={transcript} />
        </pre>
        <div className="mt-3 shrink-0 border-terminal-rule border-y py-1.5 text-foreground">
          <span className="text-terminal-muted">❯</span>{' '}
          <span
            aria-hidden="true"
            className="inline-block h-[1.1em] w-[0.6em] bg-foreground align-[-0.2em] motion-safe:animate-blink"
          />
        </div>
        <div
          key={statusChanged ? statusKey : undefined}
          data-slot="terminal-status"
          className={cn(
            'mt-2 min-h-[1.45em] shrink-0 rounded-sm',
            statusChanged && 'motion-safe:animate-flash',
          )}
        >
          {status ? (
            <StatuslinePreview segments={status} look="terminal" />
          ) : (
            <span className="text-terminal-muted">No render for this session yet.</span>
          )}
        </div>
      </div>
    </div>
  )
}

import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import type { AnsiSegment } from '@/render/types'
import { BottomAnchored } from '@/ui/bottom-anchored'
import { GLOW, SCREEN, type ScreenMotion, SETTLE } from '@/ui/stage-screen'
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

/** A render's widest line, in characters. */
function widestLine(segments: AnsiSegment[]): number {
  const lines = segments
    .map((segment) => segment.text)
    .join('')
    .split('\n')
  return Math.max(1, ...lines.map((line) => [...line].length))
}

// A monospace character is about 0.6em wide. Text shrinks until the widest line fits the screen's
// width (`--cols` characters across 100cqw), but never below 9px; past that the line scrolls.
const FIT_TO_WIDTH =
  'text-[length:max(0.5625rem,min(1em,calc(100cqw/(var(--cols,1)*0.6))))] leading-[1.45]'

/**
 * What the terminal draws for the pick, or why it draws nothing. A render wider than the screen
 * shrinks to fit, so its right edge never goes missing. `--cols` comes from the render, so it's an
 * inline style, and the server's HTML is already the fitted size.
 */
function Drawn({ segments, missing }: { segments: AnsiSegment[] | null; missing: string }) {
  if (!segments) return <span className="text-terminal-muted">{missing}</span>
  const fit = { '--cols': widestLine(segments) } as CSSProperties
  return (
    <div className="@container">
      <div data-fit="" className={FIT_TO_WIDTH} style={fit}>
        <StatuslinePreview segments={segments} look="terminal" />
      </div>
    </div>
  )
}

/**
 * The home hero's Claude Code terminal: the conversation and the input box, as Claude Code lays
 * them out. The pick is drawn `at` a band above the input box or in the status line row under it,
 * and only that one is drawn; `missing` is said in place of a render there isn't. One picture to a
 * screen reader, named by `label`, so it never reads out box-drawing characters.
 */
export function TerminalScreen({
  label,
  transcript,
  at,
  segments,
  missing,
  motion,
}: {
  label: string
  transcript: TranscriptLine[]
  at: 'above-prompt' | 'under-prompt'
  segments: AnsiSegment[] | null
  missing: string
  motion: ScreenMotion
}) {
  const settle = motion.conversationChanged ? SETTLE : undefined
  const glow = motion.drawnChanged && GLOW
  const drawnKey = motion.drawnChanged ? motion.drawnKey : undefined
  return (
    <div
      role="img"
      aria-label={label}
      data-ui=""
      className={cn(
        SCREEN,
        'bg-sunken font-mono text-[0.875rem] text-terminal-foreground leading-[1.45] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_5%,transparent)] max-md:text-[0.8125rem]',
      )}
    >
      <BottomAnchored key={motion.conversationKey} look="terminal" settle={settle}>
        <pre className="whitespace-pre font-mono">
          <Transcript lines={transcript} />
        </pre>
      </BottomAnchored>
      {at === 'above-prompt' ? (
        <div
          key={drawnKey}
          data-slot="terminal-band"
          className={cn('mt-3 shrink-0 rounded-sm', glow)}
        >
          <Drawn segments={segments} missing={missing} />
        </div>
      ) : null}
      <div className="mt-3 shrink-0 border-terminal-rule border-y py-1.5 text-foreground">
        <span className="text-terminal-muted">❯</span>{' '}
        <span
          aria-hidden="true"
          className="inline-block h-[1.1em] w-[0.6em] bg-foreground align-[-0.2em] motion-safe:animate-blink"
        />
      </div>
      {at === 'under-prompt' ? (
        <div
          key={drawnKey}
          data-slot="terminal-status"
          className={cn('mt-2 min-h-[1.45em] shrink-0 rounded-sm', glow)}
        >
          <Drawn segments={segments} missing={missing} />
        </div>
      ) : null}
    </div>
  )
}

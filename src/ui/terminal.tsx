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

/** A render's rows, and its widest one in characters. */
function renderSize(segments: AnsiSegment[]): { rows: number; cols: number } {
  const lines = segments
    .map((segment) => segment.text)
    .join('')
    .split('\n')
  return { rows: lines.length, cols: Math.max(1, ...lines.map((line) => [...line].length)) }
}

// A monospace character is about 0.6em wide. Text shrinks until the widest line fits the screen's
// width (`--cols` characters across 100cqw), but never below 9px; past that the line scrolls.
const FIT_TO_WIDTH =
  'text-[length:max(0.5625rem,min(1em,calc(100cqw/(var(--cols,1)*0.6))))] leading-[1.45]'

// A pane runs the screen's height, so its text shrinks until its rows (`--rows`, 1.3em each, close
// enough that row backgrounds touch) fit 100cqh. On a phone there is no room beside it: it takes
// the screen's width instead, and what doesn't fit is cut off at the bottom.
const FIT_TO_PANE =
  'text-[length:max(0.5625rem,min(1em,calc(100cqh/(var(--rows,1)*1.3))))] leading-[1.3] max-md:text-[length:max(0.5625rem,min(1em,calc(100cqw/(var(--cols,1)*0.6))))]'

/**
 * The render in the pick's own size. `--rows` and `--cols` come from the render, so they're an
 * inline style, and the server's HTML is already the fitted size.
 */
function Fitted({ segments, fit }: { segments: AnsiSegment[]; fit: string }) {
  const { rows, cols } = renderSize(segments)
  return (
    <div data-fit="" className={fit} style={{ '--rows': rows, '--cols': cols } as CSSProperties}>
      <StatuslinePreview segments={segments} look="terminal" />
    </div>
  )
}

/**
 * What the terminal draws for the pick, or why it draws nothing. A render wider than the screen
 * shrinks to fit, so its right edge never goes missing.
 */
function Drawn({ segments, missing }: { segments: AnsiSegment[] | null; missing: string }) {
  if (!segments) return <span className="text-terminal-muted">{missing}</span>
  return (
    <div className="@container">
      <Fitted segments={segments} fit={FIT_TO_WIDTH} />
    </div>
  )
}

/** The input box: Claude Code's prompt between two rules, with its cursor. */
function PromptBox() {
  return (
    <div className="border-terminal-rule text-foreground mt-3 shrink-0 border-y py-1.5">
      <span className="text-terminal-muted">❯</span>{' '}
      <span
        aria-hidden="true"
        className="bg-foreground motion-safe:animate-blink inline-block h-[1.1em] w-[0.6em] align-[-0.2em]"
      />
    </div>
  )
}

/**
 * The home hero's Claude Code terminal: the conversation and the input box, as Claude Code lays
 * them out. The pick is drawn `at` a band above the input box, in the status line row under it, or
 * in a pane down the right of the screen with the conversation wrapped beside it (on a phone the
 * pane takes the conversation's place). Only that one is drawn; `missing` is said in place of a
 * render there isn't. One picture to a
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
  at: 'above-prompt' | 'under-prompt' | 'side-pane'
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
        'bg-sunken text-terminal-foreground font-mono text-[0.875rem] leading-[1.45] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_5%,transparent)] max-md:text-[0.8125rem]',
      )}
    >
      {at === 'side-pane' ? (
        <div className="[container-type:size] flex min-h-0 flex-1 gap-4 max-md:flex-col-reverse max-md:gap-0">
          <div className="flex min-w-0 flex-1 flex-col justify-end max-md:flex-none">
            <div className="flex min-h-0 flex-col justify-end max-md:hidden">
              <BottomAnchored key={motion.conversationKey} look="terminal" settle={settle}>
                <pre className="font-mono break-words whitespace-pre-wrap">
                  <Transcript lines={transcript} />
                </pre>
              </BottomAnchored>
            </div>
            <PromptBox />
          </div>
          <div
            key={drawnKey}
            data-slot="terminal-pane"
            className={cn(
              'border-terminal-rule max-w-[60%] shrink-0 overflow-hidden border-l max-md:min-h-0 max-md:max-w-none max-md:flex-1 max-md:shrink max-md:border-l-0',
              glow,
            )}
          >
            {segments ? (
              <Fitted segments={segments} fit={FIT_TO_PANE} />
            ) : (
              <span className="text-terminal-muted">{missing}</span>
            )}
          </div>
        </div>
      ) : (
        <>
          <BottomAnchored key={motion.conversationKey} look="terminal" settle={settle}>
            <pre className="font-mono whitespace-pre">
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
          <PromptBox />
        </>
      )}
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

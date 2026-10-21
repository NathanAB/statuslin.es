import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { AnsiSegment } from '@/render/types'
import { DesktopScreen } from '@/ui/desktop-screen'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { type ScreenMotion, SETTLE } from '@/ui/stage-screen'
import { TerminalScreen, type TranscriptLine } from '@/ui/terminal'
import { VisuallyHidden } from '@/ui/visually-hidden'

/** One choice on the frame's toolbar: its name (or a hidden one), then its control. */
export interface StageToolbarGroup {
  title: string
  titleId: string
  /** The control says what it is (CLI, Desktop), so its name is for screen readers only. */
  hideTitle?: boolean
  control: ReactNode
}

/**
 * What the screen shows. `cli` is Claude Code in a terminal, drawing the pick `at` a band above the
 * input box or the status line row under it. `desktop` is Claude Desktop's Code tab, with the pick's
 * recorded shot, with its prompt box drawn under it when `promptBox` (a shot that doesn't already
 * show one). `missing` is said in place of a render or shot there isn't.
 */
export type StageView =
  | {
      kind: 'cli'
      at: 'above-prompt' | 'under-prompt'
      segments: AnsiSegment[] | null
      missing: string
    }
  | { kind: 'desktop'; shot: DesktopShotImage | null; promptBox: boolean; missing: string }

/**
 * The home hero's session, in a frame: an optional toolbar on the frame (the app and session
 * switchers, then a caption), then the screen for `view`, a fixed height so nothing below it moves.
 * The screen is one picture to a screen reader, named by `label`. Nothing moves on the first
 * render; `motion` says when a new conversation settles in (with the caption) and a new pick glows.
 */
export function SessionStage({
  label,
  toolbar,
  transcript,
  view,
  motion,
}: {
  label: string
  toolbar?: { groups: StageToolbarGroup[]; caption: string }
  transcript: TranscriptLine[]
  view: StageView
  motion: ScreenMotion
}) {
  return (
    <div className="rounded-frame bg-card p-1.75">
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 pt-1.5 pr-2 pb-3.25 pl-3.5">
          {toolbar.groups.map((group) => (
            <div key={group.titleId} className="flex min-w-0 items-center gap-3.5">
              {group.hideTitle ? (
                <VisuallyHidden>
                  <span id={group.titleId}>{group.title}</span>
                </VisuallyHidden>
              ) : (
                <span id={group.titleId} className="font-medium text-foreground text-small">
                  {group.title}
                </span>
              )}
              {group.control}
            </div>
          ))}
          {/* As wide as the longest caption, so every session's toolbar wraps at the same width
              and the frame keeps its height when the session changes. */}
          <p
            key={motion.conversationKey}
            className={cn(
              'ml-auto min-w-[18.5em] text-right text-muted-foreground text-small tabular-nums',
              motion.conversationChanged && SETTLE,
            )}
          >
            {toolbar.caption}
          </p>
        </div>
      ) : null}
      {view.kind === 'cli' ? (
        <TerminalScreen
          label={label}
          transcript={transcript}
          at={view.at}
          segments={view.segments}
          missing={view.missing}
          motion={motion}
        />
      ) : (
        <DesktopScreen
          label={label}
          transcript={transcript}
          shot={view.shot}
          promptBox={view.promptBox}
          missing={view.missing}
          motion={motion}
        />
      )}
    </div>
  )
}

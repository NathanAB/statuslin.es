import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { AnsiSegment } from '@/render/types'
import { DesktopScreen } from '@/ui/desktop-screen'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { type ScreenMotion, SETTLE } from '@/ui/stage-screen'
import { TerminalScreen, type TranscriptLine } from '@/ui/terminal'

/** One row of the frame's toolbar: its name, then its choices. */
export interface StageToolbarGroup {
  title: string
  titleId: string
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
 * The home hero's session, in a frame: an optional toolbar on the frame (labelled rows of choices,
 * such as the app, with an optional note beside them), then the screen for `view`, a fixed height
 * so nothing below it moves.
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
  /** `note`: the caption explains a choice that's fixed, so it carries an info mark. */
  /** `caption`: a note beside the choices, or null. */
  toolbar?: { groups: StageToolbarGroup[]; caption: string | null }
  transcript: TranscriptLine[]
  view: StageView
  motion: ScreenMotion
}) {
  return (
    <div className="rounded-frame bg-card p-1.75">
      {toolbar ? (
        // Each row named in one column, its choices in the next; a note sits beside the last
        // row's choices, so it comes and goes without moving the screen.
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 pt-1.5 pr-2 pb-3.25 pl-3.5 max-md:grid-cols-1 max-md:gap-y-1.5">
          {toolbar.groups.map((group, index) => (
            <Fragment key={group.titleId}>
              <span
                id={group.titleId}
                className="whitespace-nowrap font-medium text-foreground text-small"
              >
                {group.title}
              </span>
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
                {group.control}
                {index === toolbar.groups.length - 1 && toolbar.caption ? (
                  <p
                    key={motion.conversationKey}
                    className={cn(
                      'text-muted-foreground text-small',
                      motion.conversationChanged && SETTLE,
                    )}
                  >
                    {toolbar.caption}
                  </p>
                ) : null}
              </div>
            </Fragment>
          ))}
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

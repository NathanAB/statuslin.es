import { cn } from '@/lib/cn'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import { GLOW, SCREEN, type ScreenMotion, SETTLE } from '@/ui/stage-screen'
import type { TranscriptLine } from '@/ui/terminal'

/** The conversation as Claude Desktop's Code tab shows it: your messages in bubbles, Claude's steps
 *  and replies under them. Results and timings stay folded away, as Desktop folds them. */
function DesktopTranscript({ lines }: { lines: TranscriptLine[] }) {
  return lines.map((line, i) => {
    const key = `${i}`
    switch (line.kind) {
      case 'prompt':
        return (
          <p key={key} className="max-w-[80%] self-end rounded-2xl bg-muted px-3.5 py-2">
            {line.text}
          </p>
        )
      case 'tool':
        return (
          <p key={key} className="text-muted-foreground text-xs">
            {line.name} {line.target}
          </p>
        )
      case 'say':
        return <p key={key}>{line.lines.join(' ')}</p>
      default:
        return null
    }
  })
}

/**
 * The home hero's Claude Desktop Code tab: the conversation, then the pick's recorded shot, and
 * under it the prompt box when `promptBox` (a shot of a band alone, which Desktop draws just above
 * it). `missing` is said in place of a shot there isn't. One picture to a screen reader, named by
 * `label`. A tall shot keeps to 18rem, scaled down whole, so some conversation still shows.
 */
export function DesktopScreen({
  label,
  transcript,
  shot,
  promptBox,
  missing,
  motion,
}: {
  label: string
  transcript: TranscriptLine[]
  shot: DesktopShotImage | null
  promptBox: boolean
  missing: string
  motion: ScreenMotion
}) {
  return (
    <div
      role="img"
      aria-label={label}
      data-ui=""
      className={cn(SCREEN, 'bg-background text-foreground text-small')}
    >
      <div
        key={motion.conversationKey}
        className={cn(
          // Newest last, as in a chat: what doesn't fit is the oldest, clipped at the top.
          'flex min-h-0 shrink flex-col justify-end gap-3 overflow-hidden',
          motion.conversationChanged && SETTLE,
        )}
      >
        <DesktopTranscript lines={transcript} />
      </div>
      <div
        key={motion.drawnChanged ? motion.drawnKey : undefined}
        data-slot="desktop-shot"
        className={cn('mt-4 shrink-0 rounded-md', motion.drawnChanged && GLOW)}
      >
        {shot ? (
          <img
            src={shot.src}
            alt=""
            width={shot.width}
            height={shot.height}
            className="h-auto max-h-72 w-auto max-w-full"
          />
        ) : (
          <span className="text-muted-foreground">{missing}</span>
        )}
      </div>
      {promptBox ? (
        <div className="mt-2 shrink-0 rounded-xl border border-border bg-card px-4 py-3 text-muted-foreground">
          Type / for commands
        </div>
      ) : null}
    </div>
  )
}

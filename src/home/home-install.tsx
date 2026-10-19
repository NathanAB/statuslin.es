import type { InstallExcerpt } from '@/adopt/install'
import { HERO_SESSIONS } from '@/home/hero-sessions'
import { EXAMPLE_SESSION_JSON } from '@/home/session-json'
import type { HomeShowcase } from '@/home/showcase'
import type { AnsiSegment } from '@/render/types'
import { HomeSection } from '@/ui/home-section'
import { InstallWalkthrough } from '@/ui/install-walkthrough'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Terminal, Transcript, type TranscriptLine } from '@/ui/terminal'

const SETTINGS = '~/.claude/settings.json'

/** What Claude Code prints as it follows an install prompt: save the script, then wire it up. */
function installReply(excerpt: InstallExcerpt): TranscriptLine[] {
  return [
    { kind: 'tool', name: 'Write', target: excerpt.file },
    { kind: 'result', text: `Wrote ${excerpt.lines} lines to ${excerpt.file}` },
    ...(excerpt.executable
      ? [{ kind: 'tool', name: 'Bash', target: `chmod +x ${excerpt.file}` } as const]
      : []),
    { kind: 'tool', name: 'Update', target: SETTINGS },
    { kind: 'result', text: `Updated ${SETTINGS} with 4 additions` },
    {
      kind: 'added',
      lines: [
        '     "statusLine": {',
        '       "type": "command",',
        `       "command": ${JSON.stringify(excerpt.command)}`,
        '     }',
      ],
    },
  ]
}

const rendered = (render: AnsiSegment[] | null) =>
  render ? <StatuslinePreview segments={render} look="terminal" /> : null

/**
 * "How installing works", told with the hero's first status line: its real install prompt (the
 * script cut short), what Claude Code does with it, the session data it then runs on, and the
 * line under the prompt. Nothing at all while no status line is published.
 */
export function HomeInstall({ walkthrough }: { walkthrough: HomeShowcase['walkthrough'] }) {
  if (!walkthrough) return null
  const everyday = HERO_SESSIONS[0]
  return (
    <HomeSection>
      <InstallWalkthrough
        heading="How installing works"
        statement="Every status line here was read by a person and rendered in a sandbox before it went up. Installing one is a single paste."
        steps={[
          {
            say: 'First, paste its install prompt into Claude Code.',
            call: { kind: 'prompt', text: walkthrough.excerpt.prompt },
            response: <Transcript lines={installReply(walkthrough.excerpt)} />,
          },
          {
            say: 'Then Claude Code runs it with your session as JSON.',
            call: { kind: 'code', text: EXAMPLE_SESSION_JSON },
            response: rendered(walkthrough.render),
          },
          {
            say: 'After that, it sits under every prompt.',
            call: { kind: 'input', text: 'Bump the version and open a PR' },
          },
        ]}
        result={
          <Terminal
            label={`Claude Code with ${walkthrough.title} under the prompt`}
            height="fit"
            transcript={everyday?.transcript ?? []}
            status={walkthrough.render}
            conversationKey="installed"
            conversationChanged={false}
            statusKey="installed"
            statusChanged={false}
          />
        }
      />
    </HomeSection>
  )
}

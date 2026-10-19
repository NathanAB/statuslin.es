import type { HeroSessionKey } from '@/gallery/hero-lines'
import type { TranscriptLine } from '@/ui/terminal'

/** One session the home hero switches between: its label, a caption and its conversation. */
export interface HeroSession {
  key: HeroSessionKey
  label: string
  /** Names the data the status line renders, so it matches the scenario (src/render/scenarios.ts). */
  caption: string
  /** The sample conversation above the prompt. */
  transcript: TranscriptLine[]
}

/** The hero sessions, in the switcher's order. Static copy, written to fit each scenario. */
export const HERO_SESSIONS: readonly HeroSession[] = [
  {
    key: 'clean-main',
    label: 'Everyday',
    caption: 'Opus 4.8 · clean main · 22% of context',
    transcript: [
      { kind: 'prompt', text: 'Fix the flaky date test in utils' },
      { kind: 'tool', name: 'Read', target: 'src/utils/date.test.ts' },
      { kind: 'result', text: 'Read 84 lines' },
      { kind: 'tool', name: 'Update', target: 'src/utils/date.ts' },
      { kind: 'result', text: 'Updated with 2 additions and 1 removal' },
      {
        kind: 'say',
        lines: [
          'The test assumed the local timezone. It now pins UTC',
          'and passes 50 runs in a row.',
        ],
      },
      { kind: 'prompt', text: 'Run the tests again' },
      { kind: 'tool', name: 'Bash', target: 'bun run test' },
      { kind: 'result', text: 'Test Files  42 passed (42)' },
      { kind: 'say', lines: ['The repo is clean and the tests pass.'] },
      { kind: 'note', text: '✻ Cooked for 41s' },
    ],
  },
  {
    key: 'fresh-session',
    label: 'Just started',
    caption: 'Opus 4.8 · nothing reported yet',
    transcript: [
      { kind: 'note', text: '✻ Welcome to Claude Code' },
      { kind: 'note', text: '  /help for help · cwd: ~/app' },
    ],
  },
  {
    key: 'dirty-feature',
    label: 'Uncommitted changes',
    caption: 'Sonnet 4.6 · feat/auth · 48% of context',
    transcript: [
      { kind: 'prompt', text: 'Add rate limiting to the login route' },
      { kind: 'tool', name: 'Read', target: 'src/auth/login.ts' },
      { kind: 'result', text: 'Read 132 lines' },
      { kind: 'tool', name: 'Update', target: 'src/auth/login.ts' },
      { kind: 'result', text: 'Updated with 18 additions and 2 removals' },
      {
        kind: 'say',
        lines: [
          'Logins are now limited to five tries a minute per IP.',
          "The change is on feat/auth and isn't committed yet.",
        ],
      },
    ],
  },
  {
    key: 'big-context',
    label: '1M context',
    caption: 'Fable 5 · 1M window · 64% used',
    transcript: [
      { kind: 'prompt', text: 'Map how a request moves through all nine services' },
      { kind: 'tool', name: 'Search', target: 'pattern: "createServer"' },
      { kind: 'result', text: 'Found 9 files' },
      { kind: 'say', lines: ['Read 412 files across the monorepo'] },
      {
        kind: 'say',
        lines: [
          'A request enters at the gateway, gets its session',
          'from auth, then fans out to billing and search.',
        ],
      },
      { kind: 'note', text: '✻ Worked for 6m 12s' },
    ],
  },
]

import type { TranscriptLine } from '@/ui/terminal'

/**
 * The sample conversation above the hero's prompt: the Everyday session (scenario `clean-main`),
 * the one every hero render and Desktop shot is recorded in. Static copy, written to fit it.
 */
export const HERO_TRANSCRIPT: TranscriptLine[] = [
  { kind: 'prompt', text: 'Fix the flaky date test in utils' },
  { kind: 'tool', name: 'Read', target: 'src/utils/date.test.ts' },
  { kind: 'result', text: 'Read 84 lines' },
  { kind: 'tool', name: 'Update', target: 'src/utils/date.ts' },
  { kind: 'result', text: 'Updated with 2 additions and 1 removal' },
  {
    kind: 'say',
    lines: ['The test assumed the local timezone. It now pins UTC', 'and passes 50 runs in a row.'],
  },
  { kind: 'prompt', text: 'Run the tests again' },
  { kind: 'tool', name: 'Bash', target: 'bun run test' },
  { kind: 'result', text: 'Test Files  42 passed (42)' },
  { kind: 'say', lines: ['The repo is clean and the tests pass.'] },
  { kind: 'note', text: '✻ Cooked for 41s' },
]

import type { FaqEntry } from '@/lib/json-ld'
import { BUDDY_ISSUE_NUMBER } from './buddy-pets'

export const BUDDY_FAQ: FaqEntry[] = [
  {
    question: "What happened to Claude Code's /buddy?",
    answer: `Users report \`/buddy\`, an April 1st feature from Claude Code 2.1.89, gone since 2.1.97, and the changelog doesn't mention a removal. GitHub issue #${BUDDY_ISSUE_NUMBER}, "Bring Back Buddy", asks for it back.`,
  },
  {
    question: 'Can a mod bring my old buddy back?',
    answer:
      "No. Each pet mod is a new pet from the community, so your old buddy, its species and its stats don't carry over.",
  },
  {
    question: 'Do pet mods use my tokens?',
    answer:
      'Open the pet\'s page and check its "Uses your plan" tile. It comes from what `claude plugin validate` reports about the code, not from the author\'s description.',
  },
]

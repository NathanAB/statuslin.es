import type { FaqEntry } from '@/lib/json-ld'
import { BUDDY_ISSUE_NUMBER } from './buddy-pets'

export const BUDDY_FAQ: FaqEntry[] = [
  {
    question: "What happened to Claude Code's /buddy?",
    answer: `Claude Code 2.1.97 removed \`/buddy\` and its companion in April 2026, with no changelog entry. GitHub issue #${BUDDY_ISSUE_NUMBER}, "Bring Back Buddy", gathers the requests to restore it.`,
  },
  {
    question: 'Can a mod bring my old buddy back?',
    answer:
      'No. Each pet mod is a new pet written by someone in the community. None of them restores the buddy you had, its species or its stats.',
  },
  {
    question: 'Do pet mods use my tokens?',
    answer:
      "Check the pet's \"Uses your tokens\" tile. It comes from what `claude plugin validate` reports about the mod's code, not from the author's description.",
  },
]

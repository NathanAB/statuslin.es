import type { FaqEntry } from '@/lib/json-ld'

export const STATUS_LINES_VS_MODS_FAQ: FaqEntry[] = [
  {
    question: 'Are mods replacing status lines?',
    answer:
      'No. Claude Code supports both. The `statusLine` setting has no deprecation notice, and `/statusline` still writes a status line script.',
  },
  {
    question: 'Do Claude Code status lines work in Claude Desktop?',
    answer:
      "No. Claude Desktop's Code tab never runs the `statusLine` command. The statusline-anywhere mod runs it and draws the output above the prompt.",
  },
  {
    question: 'Can a mod show the same numbers as my status line?',
    answer:
      'Mostly. A mod reads `$.session.usage()`, which gives it the context window, cost and rate-limit figures a status line gets. A few status line fields, such as lines added and removed, have no mod equivalent yet.',
  },
]

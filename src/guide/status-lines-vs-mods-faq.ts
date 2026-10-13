import type { FaqEntry } from '@/lib/json-ld'

export const STATUS_LINES_VS_MODS_FAQ: FaqEntry[] = [
  {
    question: 'Are mods replacing status lines?',
    answer:
      'Claude Code still supports both. The `statusLine` setting has no deprecation notice, and the `/statusline` command still writes a status line script.',
  },
  {
    question: 'Do Claude Code status lines work in Claude Desktop?',
    answer:
      "No. Claude Desktop's Code tab never runs the `statusLine` command. The statusline-anywhere mod runs that command for you and draws its output above the prompt in Desktop.",
  },
  {
    question: 'Can a mod show the same numbers as my status line?',
    answer:
      'Yes. A mod reads session usage through `$.session.usage()`, which returns the same figures Claude Code sends a status line.',
  },
]

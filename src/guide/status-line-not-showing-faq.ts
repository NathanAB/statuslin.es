import type { FaqEntry } from '@/lib/json-ld'

// Every answer comes from https://code.claude.com/docs/en/statusline#troubleshooting.
export const NOT_SHOWING_FAQ: FaqEntry[] = [
  {
    question: 'Why is my Claude Code status line blank?',
    answer:
      "Claude Code shows the line only after your script prints to stdout and exits with code 0. Make the script executable with `chmod +x`, run it by hand to check it prints something, and run `claude --debug` to see the script's stderr.",
  },
  {
    question: 'Does the status line need workspace trust?',
    answer:
      'Yes. `statusLine` runs a shell command, so like hooks it stays off until you accept the workspace trust dialog for the folder, or for a parent folder whose trust extends to it. Restart Claude Code and accept the dialog.',
  },
  {
    question: 'Does my status line show in Claude Desktop?',
    answer:
      "No. Claude Desktop's Code tab doesn't run your `statusLine` command. The statuslin.es Claude Desktop guide covers how to show it there.",
  },
]

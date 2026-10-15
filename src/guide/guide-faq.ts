import type { FaqEntry } from '@/lib/json-ld'

export const GUIDE_FAQ: FaqEntry[] = [
  {
    question: "Why isn't the git branch in the JSON?",
    answer:
      'Claude Code sends the repository name in `workspace.repo` and any open PR in `pr`, but not the branch or changed files. Scripts that show them run `git` in `workspace.current_dir`.',
  },
  {
    question: 'Why is used_percentage null?',
    answer:
      '`context_window.used_percentage` can be null early in a session. Guard it with `// 0` in jq, or the line prints "null" until the first response.',
  },
]

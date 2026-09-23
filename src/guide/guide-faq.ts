import type { FaqEntry } from '@/lib/json-ld'

export const GUIDE_FAQ: FaqEntry[] = [
  {
    question: "Why isn't git in the JSON?",
    answer:
      'Claude Code does not send git state. Scripts that show a branch run git themselves against workspace.current_dir, including in a directory with no repo so you can see how they degrade.',
  },
  {
    question: 'Why is used_percentage null?',
    answer:
      'context_window.used_percentage is null at the start of a fresh session. Guard it (// 0 in jq) or the bar prints "null" until the first response. The gallery\'s new-session preview is that case.',
  },
  {
    question: 'How does this site know what a script prints?',
    answer:
      'It runs the submitted script in a sandbox against the same JSON scenarios on this page. The cards show that output, not a mock.',
  },
]

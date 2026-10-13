import type { FaqEntry } from '@/lib/json-ld'

export const MODS_FAQ: FaqEntry[] = [
  {
    question: 'What is a Claude Code mod?',
    answer:
      'A mod is a Claude Code plugin whose code runs inside Claude Code and draws part of its interface. It can add a band above the prompt, a line under it, a pane, a toast or a slash command. Mods draw in the terminal and in Claude Desktop.',
  },
  {
    question: 'How do I install a mod?',
    answer:
      'Open the mod and copy its install prompt. Paste it into Claude Code or Claude Desktop, and Claude runs two `claude plugin` commands that add the statuslin.es marketplace and install the mod. Then start a new session to load it.',
  },
  {
    question: 'Are these mods safe to install?',
    answer:
      "A person reads every mod before it's listed, and the install is pinned to the commit shown on its page, so a later push to the author's repo can't change what you get. Each page also says whether the mod uses your plan, changes files or reaches the network, as reported by `claude plugin validate`. An installed mod runs with your permissions, so read its source before you install it.",
  },
  {
    question: 'How is a mod different from a status line?',
    answer:
      "A status line is a script that Claude Code runs and prints at the bottom of the terminal. A mod runs inside Claude Code, so it can draw in more places and add commands. Claude Desktop doesn't show status lines, but it does show mods.",
  },
]

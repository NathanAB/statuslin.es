/**
 * The curated list behind /resources. Hand-maintained; descriptions are our own
 * words (never copied from the target's README — both an SEO duplicate-content
 * rule and what makes the page an editorial feature worth a link back).
 * Section order is display order. All entries verified live 2026-07-05.
 */

export interface Resource {
  name: string
  url: string
  description: string
}

export function resourceAnchor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface ResourceSection {
  key: string
  title: string
  resources: Resource[]
}

export const RESOURCE_SECTIONS: ResourceSection[] = [
  {
    key: 'tools',
    title: 'Status line tools',
    resources: [
      {
        name: 'ccstatusline',
        url: 'https://github.com/sirmalloc/ccstatusline',
        description:
          'A terminal UI writes your settings, with powerline themes and widgets for context and usage limits.',
      },
      {
        name: 'claude-powerline',
        url: 'https://github.com/Owloops/claude-powerline',
        description:
          'Vim-style powerline segments with themes and usage tracking. Powerline Studio, listed below, builds its config visually.',
      },
      {
        name: 'claude-hud',
        url: 'https://github.com/jarrodwatts/claude-hud',
        description:
          'A Claude Code plugin that points your status line at itself. Shows context and usage limits, with optional lines for running tools, agents, and todos.',
      },
      {
        name: 'CCometixLine',
        url: 'https://github.com/Haleclipse/CCometixLine',
        description:
          'Written in Rust, configured through a terminal UI. Git integration and usage tracking come built in.',
      },
      {
        name: 'CC-statusline',
        url: 'https://github.com/AwesomeJun/CC-statusline',
        description:
          'One command to install on macOS, Linux, or Windows. Shows context, usage limits, cost, and reasoning effort.',
      },
      {
        name: 'claude-statusline (TheoBrigitte)',
        url: 'https://github.com/TheoBrigitte/claude-statusline',
        description: 'Built for speed. Its own benchmarks put a full render under 20 microseconds.',
      },
      {
        name: 'claude-statusline (felipeelias)',
        url: 'https://felipeelias.github.io/2026/03/17/claude-statusline.html',
        description:
          'Themes, cost tracking, and context usage, configured in a TOML file instead of a terminal UI.',
      },
      {
        name: 'claude-code-statusline (sotayamashita)',
        url: 'https://github.com/sotayamashita/claude-code-statusline',
        description: 'Written in Rust and configured like Starship.',
      },
      {
        name: 'claude-code-statusline (levz0r)',
        url: 'https://github.com/levz0r/claude-code-statusline',
        description:
          'Shows token usage and spend live, next to the directory, git status and model.',
      },
    ],
  },
  {
    key: 'generators',
    title: 'Generators & builders',
    resources: [
      {
        name: 'The built-in /statusline command',
        url: 'https://code.claude.com/docs/en/statusline#use-the-statusline-command',
        description:
          'Describe the status line you want, and Claude Code writes the script and updates your settings.',
      },
      {
        name: 'Powerline Studio',
        url: 'https://powerline.owloops.com/',
        description:
          'A visual editor for claude-powerline. Click segments in a live preview, then copy the config.',
      },
      {
        name: "Don't Sleep On AI status line themes",
        url: 'https://www.dontsleeponai.com/statusline',
        description:
          'Ten ready-made /statusline prompts to paste straight into Claude Code, plus a builder for assembling your own.',
      },
    ],
  },
  {
    key: 'usage-tracking',
    title: 'Usage tracking',
    resources: [
      {
        name: 'ccusage',
        url: 'https://ccusage.com/guide/statusline',
        description:
          "Tracks Claude Code spend. Its status line mode shows session cost, the day's total, burn rate and when your block resets.",
      },
    ],
  },
  {
    key: 'guides',
    title: 'Guides & references',
    resources: [
      {
        name: 'Official docs: Customize your status line',
        url: 'https://code.claude.com/docs/en/statusline',
        description:
          "Anthropic's reference for the statusLine setting and every field your script receives, with example scripts.",
      },
      {
        name: 'Complete field reference (AKCodez gist)',
        url: 'https://gist.github.com/AKCodez/ffb420ba6a7662b5c3dda2edce7783de',
        description: 'One gist documenting every payload field, with scripts you can lift as-is.',
      },
      {
        name: 'Dan Does Code: Building a custom status line',
        url: 'https://www.dandoescode.com/blog/claude-code-custom-statusline',
        description:
          'A build log of a custom status line that tracks git worktrees and usage limits.',
      },
      {
        name: 'AI Hero: Creating the perfect status line',
        url: 'https://www.aihero.dev/creating-the-perfect-claude-code-status-line',
        description: "An opinionated take on what belongs in a status line and what doesn't.",
      },
      {
        name: 'Jerad Bitner: Leveling up with a killer status line',
        url: 'https://jeradbitner.com/blog/claude-code-statusline',
        description: 'A write-up of replacing the default status line with a custom one.',
      },
      {
        name: 'ClaudeLog: ccstatusline overview',
        url: 'https://claudelog.com/claude-code-mcps/ccstatusline/',
        description: 'Community docs for Claude Code, with an overview of ccstatusline.',
      },
    ],
  },
  {
    key: 'community-lists',
    title: 'Community lists',
    resources: [
      {
        name: 'awesome-claude-code',
        url: 'https://github.com/hesreallyhim/awesome-claude-code',
        description:
          'The big community list for Claude Code. Its status lines section may list tools newer than this page.',
      },
    ],
  },
]

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
          "The one you'll see recommended most. You configure it from a terminal UI that writes your settings for you, pick a powerline theme, and add widgets for context and usage limits.",
      },
      {
        name: 'claude-powerline',
        url: 'https://github.com/Owloops/claude-powerline',
        description:
          'Vim-style powerline segments, with themes and usage tracking. If you would rather click than edit config, its Powerline Studio (under generators below) builds the setup visually.',
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
        description:
          'Built for speed above all else: its own benchmarks put a full render under 20 microseconds.',
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
        description:
          'Another Rust option. Borrows its configuration style from starship, so it will feel familiar if you use that.',
      },
      {
        name: 'claude-code-statusline (levz0r)',
        url: 'https://github.com/levz0r/claude-code-statusline',
        description:
          'Leans into cost visibility: token usage and spend update in real time next to directory, git status, and model.',
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
          "Start here if you haven't customized anything yet. Tell Claude Code what you want in plain English and it writes the script and updates your settings itself.",
      },
      {
        name: 'Powerline Studio',
        url: 'https://powerline.owloops.com/',
        description:
          'The visual configurator for claude-powerline. Click segments in a live preview, switch themes, copy the config out.',
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
          "The standard tool for tracking Claude Code spend. Its status line mode reads the same stdin JSON as any other script and shows session cost, the day's total, burn rate, and when your block resets.",
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
          "Anthropic's own reference. Covers the statusLine setting, every field your script receives, and working example scripts.",
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
        description: 'A hands-on write-up of replacing the default with something better.',
      },
      {
        name: 'ClaudeLog: ccstatusline overview',
        url: 'https://claudelog.com/claude-code-mcps/ccstatusline/',
        description:
          "Community documentation for Claude Code. Its ccstatusline page is a decent orientation if you're choosing a tool.",
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
          'The big community list for everything Claude Code, including a status lines section. Useful for spotting tools newer than this page.',
      },
    ],
  },
]

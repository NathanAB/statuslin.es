/**
 * Third-party status line tools the comparison pages describe. Every fact is a paraphrase of the
 * tool's own README (or its GitHub release/repo metadata) as read on `verifiedAt`, and each tool
 * records the URLs it came from. A fact that can't be cited doesn't go in. `name` and `repoUrl`
 * match src/resources/data.ts, which a test enforces.
 */

export type FactKey =
  | 'kind'
  | 'install'
  | 'config'
  | 'themes'
  | 'fonts'
  | 'layout'
  | 'usageLimits'
  | 'maintained'

/** Display order and labels for a tool's fact list. */
export const FACT_ROWS: Array<{ key: FactKey; label: string }> = [
  { key: 'kind', label: 'What it is' },
  { key: 'install', label: 'Install' },
  { key: 'config', label: 'Configuration' },
  { key: 'themes', label: 'Themes' },
  { key: 'fonts', label: 'Fonts' },
  { key: 'layout', label: 'Layout' },
  { key: 'usageLimits', label: 'Usage limits' },
  { key: 'maintained', label: 'Maintained' },
]

export interface ThirdPartyTool {
  slug: string
  name: string
  repoUrl: string
  sources: string[]
  /** ISO date the facts were last checked against `sources`. */
  verifiedAt: string
  /** One clause completing "<name> is …". */
  summary: string
  facts: Record<FactKey, string>
  /** Gallery feature facets for the jobs the tool does; picks the relevant gallery previews. */
  jobs: string[]
  /** "Pick <name> if …" in the when-to-pick section. */
  pickIf: string
}

export const TOOLS: ThirdPartyTool[] = [
  {
    slug: 'ccstatusline',
    name: 'ccstatusline',
    repoUrl: 'https://github.com/sirmalloc/ccstatusline',
    sources: [
      'https://github.com/sirmalloc/ccstatusline/blob/main/README.md',
      'https://github.com/sirmalloc/ccstatusline/releases/tag/v2.2.30',
    ],
    verifiedAt: '2026-09-24',
    summary:
      'a customizable status line formatter for Claude Code that you set up in a terminal UI',
    facts: {
      kind: 'An npm package written in TypeScript. It runs on Node.js or Bun.',
      install:
        'Run npx -y ccstatusline@latest (or bunx) to open the setup TUI. It can write the statusLine setting for you.',
      config:
        'An interactive terminal UI with a live preview. Settings are saved to ~/.config/ccstatusline/settings.json.',
      themes:
        'Built-in Powerline themes. Colors in 16-color, 256-color, or truecolor, with gradients.',
      fonts:
        'Powerline mode needs Powerline glyphs. The TUI can install a Powerline font with your consent.',
      layout: 'Any number of independent lines, with flex separators that fit the terminal width.',
      usageLimits:
        'Session Usage, Weekly Usage, and reset timer widgets. They call the Anthropic usage API directly.',
      maintained: 'Yes. v2.2.30 was released on 2026-09-17. MIT license.',
    },
    jobs: ['git', 'token-usage', 'cost', 'quota', 'multi-line', 'powerline', 'themed'],
    pickIf:
      'you want to build a layout in a terminal UI and choose from a long list of widgets without editing a file.',
  },
  {
    slug: 'claude-powerline',
    name: 'claude-powerline',
    repoUrl: 'https://github.com/Owloops/claude-powerline',
    sources: [
      'https://github.com/Owloops/claude-powerline/blob/main/README.md',
      'https://github.com/Owloops/claude-powerline/releases/tag/v1.32.0',
    ],
    verifiedAt: '2026-09-24',
    summary: 'a vim-style powerline status line for Claude Code with usage tracking and themes',
    facts: {
      kind: 'An npm package (@owloops/claude-powerline) written in TypeScript. It needs Node.js 18+ and Git 2.0+.',
      install:
        'Point statusLine at npx -y @owloops/claude-powerline@latest, or run the /powerline setup wizard from its Claude Code plugin.',
      config:
        'A JSON file such as ~/.claude/claude-powerline.json, plus CLI flags and environment variables. Powerline Studio edits the JSON visually.',
      themes:
        'Six built-in themes (dark, light, nord, tokyo-night, rose-pine, gruvbox) or a custom one. Styles: minimal, powerline, capsule, tui.',
      fonts: 'A Nerd Font is recommended. --charset=text switches to ASCII-only symbols.',
      layout: 'Segments wrap to new lines at the terminal width, or you set the lines by hand.',
      usageLimits:
        'Block (5-hour) and Weekly segments from Claude Code’s native rate limit data, for Pro and Max, with optional pace markers.',
      maintained: 'Yes. v1.32.0 was released on 2026-09-23. MIT license.',
    },
    jobs: ['git', 'token-usage', 'cost', 'quota', 'burn-rate', 'multi-line', 'powerline', 'themed'],
    pickIf:
      'you want config in a JSON file (per project if you like), cost budgets, and pace markers on your usage limits.',
  },
]

export const TOOL_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]))

/** A head-to-head page. `intro` is pair-specific copy, drawn from both tools' facts above. */
export interface Comparison {
  tools: [string, string]
  intro: string[]
}

export const COMPARISONS: Comparison[] = [
  {
    tools: ['ccstatusline', 'claude-powerline'],
    intro: [
      'ccstatusline and claude-powerline are both npm packages that draw a Claude Code status line with git, token, cost, and usage limit segments. Both are MIT licensed, and both shipped a release in September 2026.',
      'The biggest difference is setup. ccstatusline is configured in a terminal UI. claude-powerline reads a JSON file, which you can write by hand, with its /powerline wizard, or in Powerline Studio.',
    ],
  },
]

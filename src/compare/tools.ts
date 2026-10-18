export type FactKey = 'setup' | 'runsOn' | 'themes' | 'font' | 'usageLimits' | 'latestRelease'

export const FACT_ROWS: Array<{ key: FactKey; label: string }> = [
  { key: 'setup', label: 'Setup' },
  { key: 'runsOn', label: 'Runs on' },
  { key: 'themes', label: 'Themes' },
  { key: 'font', label: 'Font' },
  { key: 'usageLimits', label: 'Usage limits' },
  { key: 'latestRelease', label: 'Latest release' },
]

export interface SourceFile {
  name: string
  url: string
}

export interface ThirdPartyTool {
  slug: string
  name: string
  repoUrl: string
  sourceUrl: string
  verifiedAt: string
  facts: Record<FactKey, string>
  /** Facts its README doesn't state, each with the files that do. */
  otherSources?: Array<{ fact: FactKey; files: SourceFile[] }>
  jobs: string[]
  /** Completes "Want …?" and "Pick <tool> if you want …". */
  wants: string
}

export const TOOLS: ThirdPartyTool[] = [
  {
    slug: 'ccstatusline',
    name: 'ccstatusline',
    repoUrl: 'https://github.com/sirmalloc/ccstatusline',
    sourceUrl: 'https://github.com/sirmalloc/ccstatusline/blob/main/README.md',
    verifiedAt: '2026-09-24',
    facts: {
      setup: 'Interactive terminal UI',
      runsOn: 'Node.js or Bun',
      themes: 'Powerline themes',
      font: 'Powerline font',
      usageLimits: 'Yes',
      latestRelease: 'v2.2.30, Sep 17',
    },
    jobs: ['git', 'token-usage', 'cost', 'quota', 'multi-line', 'powerline', 'themed'],
    wants: 'a setup screen',
  },
  {
    slug: 'claude-powerline',
    name: 'claude-powerline',
    repoUrl: 'https://github.com/Owloops/claude-powerline',
    sourceUrl: 'https://github.com/Owloops/claude-powerline/blob/main/README.md',
    verifiedAt: '2026-09-24',
    facts: {
      setup: 'JSON file or /powerline wizard',
      runsOn: 'Node.js 18+ and Git',
      themes: '6 built-in, plus custom',
      font: 'Nerd Font, or ASCII mode',
      usageLimits: 'Yes',
      latestRelease: 'v1.32.0, Sep 23',
    },
    jobs: ['git', 'token-usage', 'cost', 'quota', 'burn-rate', 'multi-line', 'powerline', 'themed'],
    wants: 'a config file you can commit',
  },
  {
    slug: 'claude-hud',
    name: 'claude-hud',
    repoUrl: 'https://github.com/jarrodwatts/claude-hud',
    sourceUrl: 'https://github.com/jarrodwatts/claude-hud/blob/main/README.md',
    verifiedAt: '2026-10-17',
    facts: {
      setup: 'Plugin, then /claude-hud:setup',
      runsOn: 'Node.js 18+ or Bun',
      themes: 'None, custom colors in JSON',
      font: 'No special font',
      usageLimits: 'Yes',
      latestRelease: 'v0.11.3, Oct 17',
    },
    jobs: ['git', 'token-usage', 'cost', 'quota', 'burn-rate', 'multi-line'],
    wants: 'to see running tools, agents, and todos',
  },
  {
    slug: 'ccometixline',
    name: 'CCometixLine',
    repoUrl: 'https://github.com/Haleclipse/CCometixLine',
    sourceUrl: 'https://github.com/Haleclipse/CCometixLine/blob/master/README.md',
    verifiedAt: '2026-10-17',
    facts: {
      setup: 'Edit settings.json, then terminal UI',
      runsOn: 'Rust binary and Git',
      themes: 'Built-in presets, plus custom',
      font: 'Nerd Font',
      usageLimits: 'Yes',
      latestRelease: 'v1.1.2, Mar 14',
    },
    otherSources: [
      {
        fact: 'usageLimits',
        files: [
          {
            name: 'CHANGELOG',
            url: 'https://github.com/Haleclipse/CCometixLine/blob/master/CHANGELOG.md',
          },
          {
            name: 'src/core/segments/usage.rs',
            url: 'https://github.com/Haleclipse/CCometixLine/blob/master/src/core/segments/usage.rs',
          },
        ],
      },
    ],
    jobs: ['git', 'token-usage', 'cost', 'quota', 'powerline', 'themed'],
    wants: 'a single compiled binary',
  },
]

export const TOOL_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]))

export interface Comparison {
  tools: [string, string]
  intro: string
}

export const COMPARISONS: Comparison[] = [
  {
    tools: ['ccstatusline', 'claude-powerline'],
    intro:
      'Two npm tools for the Claude Code status line. The biggest difference is setup: ccstatusline uses an interactive terminal UI, claude-powerline uses a JSON file.',
  },
  {
    tools: ['claude-hud', 'ccstatusline'],
    intro:
      'Two Claude Code status line tools that run on Node.js or Bun. The biggest difference is setup: claude-hud installs as a Claude Code plugin, ccstatusline uses an interactive terminal UI.',
  },
]

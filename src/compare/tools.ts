export type FactKey = 'setup' | 'runsOn' | 'themes' | 'font' | 'usageLimits' | 'latestRelease'

export const FACT_ROWS: Array<{ key: FactKey; label: string }> = [
  { key: 'setup', label: 'Setup' },
  { key: 'runsOn', label: 'Runs on' },
  { key: 'themes', label: 'Themes' },
  { key: 'font', label: 'Font' },
  { key: 'usageLimits', label: 'Usage limits' },
  { key: 'latestRelease', label: 'Latest release' },
]

export interface ThirdPartyTool {
  slug: string
  name: string
  repoUrl: string
  sourceUrl: string
  verifiedAt: string
  facts: Record<FactKey, string>
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
]

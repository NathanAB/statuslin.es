import type { Interpreter } from '@/render/types'

/**
 * The facet registry: the single source of truth for the /status-lines/<facet> pages and the
 * tag vocabulary. A facet page can only exist for an entry here; a tag can only be stored on a
 * config if it is a tag-facet slug (TAG_VOCABULARY). Titles use modified keywords on purpose;
 * the bare head term belongs to the home page.
 */
export interface Facet {
  slug: string
  kind: 'tag' | 'interpreter'
  /** kind 'interpreter' only: the configs.interpreter value this facet selects. */
  interpreter?: Interpreter
  /** <title> base; rendered as `${titleBase} | statuslin.es`. */
  titleBase: string
  /** The h1, sentence case. */
  heading: string
  /** Short label for tag chips on config pages and the home browse row. */
  chipLabel: string
  metaDescription: string
  /** Completes the live count line: "N of the gallery's M status lines <countPhrase>." */
  countPhrase: string
  /** Intro paragraphs. Site voice: plain, no em dashes, opinions allowed. */
  intro: string[]
}

/** A facet renders (and enters the sitemap) only with at least this many published matches. */
export const MIN_FACET_CONFIGS = 3

export const FACETS: Facet[] = [
  {
    slug: 'git',
    kind: 'tag',
    titleBase: 'Claude Code Status Lines That Show Git Status',
    heading: 'Claude Code status lines that show git status',
    chipLabel: 'git',
    metaDescription:
      'Status lines that put your git branch, dirty state, or diff stats in the Claude Code terminal. Rendered previews you can copy in one paste.',
    countPhrase: 'show git branch or repo state',
    intro: [
      'Claude Code tells you the model and the directory, but not what git is doing. These status lines add the branch, and some layer on dirty-file counts or ahead and behind markers, so you can see where a session is about to commit before it happens.',
      'Every preview below is rendered from the real script against the same example sessions, including one in a directory with no git repo, so you can check how each one degrades.',
    ],
  },
  {
    slug: 'token-usage',
    kind: 'tag',
    titleBase: 'Claude Code Status Lines That Show Token Usage',
    heading: 'Claude Code status lines that show token usage',
    chipLabel: 'tokens',
    metaDescription:
      'Status lines that track context window usage in the Claude Code terminal, as token counts or burn bars. Copy one in a single paste.',
    countPhrase: 'track context window usage',
    intro: [
      'Running out of context mid-task is the worst way to find out how big your session got. These status lines read the context window numbers Claude Code pipes to every status line script and turn them into a count or a burn bar.',
      'The previews are rendered from real sessions at different fill levels, so you can see what each one looks like when the window is nearly empty and nearly full.',
    ],
  },
  {
    slug: 'cost',
    kind: 'tag',
    titleBase: 'Claude Code Status Lines That Track Cost',
    heading: 'Claude Code status lines that track cost',
    chipLabel: 'cost',
    metaDescription:
      'Status lines that show what a Claude Code session costs as you work, from plain dollar figures to burn-rate meters. Rendered previews, one-paste install.',
    countPhrase: 'show session cost',
    intro: [
      'Claude Code reports the running cost of a session in the JSON it sends your status line. These configs surface it in the terminal, some as a plain number, some as thresholds that change color when a session gets expensive.',
      'If you care about cost because of rate limits rather than dollars, the usage-limit status lines overlap with these; several configs show both.',
    ],
  },
  {
    slug: 'quota',
    kind: 'tag',
    titleBase: 'Claude Code Status Lines That Track Usage Limits',
    heading: 'Claude Code status lines that track usage limits',
    chipLabel: 'limits',
    metaDescription:
      'Status lines that watch your Claude Code rate limits: 5-hour and weekly quota percentages, reset times, and overage warnings.',
    countPhrase: 'watch rate limits or quota',
    intro: [
      'Claude plans meter usage in five-hour and weekly windows, and Claude Code hands both to your status line as rate limit data. These status lines show how much of each window is gone and when it resets.',
      'They differ mostly in urgency: some show a quiet percentage, others switch color or warn outright as you approach the cap.',
    ],
  },
  {
    slug: 'minimal',
    kind: 'tag',
    titleBase: 'Minimal Claude Code Status Lines',
    heading: 'Minimal Claude Code status lines',
    chipLabel: 'minimal',
    metaDescription:
      'Single-line, low-noise Claude Code status lines that show just the essentials. Rendered previews you can copy in one paste.',
    countPhrase: 'keep to a single quiet line',
    intro: [
      'A status line does not have to be a dashboard. These configs stay on one line and show a handful of essentials, usually the model, the directory, and one number that matters to you.',
      'They are also the easiest scripts to read end to end, which makes them good starting points if you plan to customize.',
    ],
  },
  {
    slug: 'multi-line',
    kind: 'tag',
    titleBase: 'Multi-Line Claude Code Status Lines',
    heading: 'Multi-line Claude Code status lines',
    chipLabel: 'multi-line',
    metaDescription:
      'Claude Code status lines that use two or more lines to fit a fuller dashboard: model, git, tokens, cost, and more at a glance.',
    countPhrase: 'spread across two or more lines',
    intro: [
      'Claude Code renders every line your script prints, so a status line can be a small dashboard. These configs use two or three lines to fit git state, token usage, cost, and quota without crowding each other out.',
      'The trade is terminal height. The previews show the full block each one prints, so you can judge the footprint before you copy it.',
    ],
  },
  {
    slug: 'powerline',
    kind: 'tag',
    titleBase: 'Powerline-Style Claude Code Status Lines',
    heading: 'Powerline-style Claude Code status lines',
    chipLabel: 'powerline',
    metaDescription:
      'Powerline-style Claude Code status lines with segment separators and Nerd Font glyphs. See rendered previews before you commit to a font.',
    countPhrase: 'use powerline-style segments',
    intro: [
      'Powerline segments with angled separators are the classic terminal-status look. These status lines bring it to Claude Code, and most rely on a Nerd Font for the glyphs.',
      "Check the requirements on each config's page before copying: without the right font installed the separators render as boxes.",
    ],
  },
  {
    slug: 'themed',
    kind: 'tag',
    titleBase: 'Themed Claude Code Status Lines',
    heading: 'Themed Claude Code status lines',
    chipLabel: 'themed',
    metaDescription:
      'Claude Code status lines built on Catppuccin, Dracula, and other terminal color themes, rendered so you can compare palettes.',
    countPhrase: 'follow a named color theme',
    intro: [
      'If your terminal already runs Catppuccin or Dracula, a status line in the same palette stops looking bolted on. These configs commit to a named theme throughout.',
      "The previews use each script's real ANSI output, so the palette you see is the palette you get.",
    ],
  },
  {
    slug: 'bash',
    kind: 'interpreter',
    interpreter: 'bash',
    titleBase: 'Claude Code Status Lines Written in Bash',
    heading: 'Claude Code status lines written in bash',
    chipLabel: 'bash',
    metaDescription:
      'Bash Claude Code status lines that run with standard Unix tools, no runtime to install. Rendered previews, one-paste install.',
    countPhrase: 'are written in bash',
    intro: [
      'Bash status lines run anywhere Claude Code does, with jq usually the only dependency. That makes them the default choice when you do not want to install a runtime just for your terminal.',
      'They range from three-line scripts to full dashboards, and the source on each page is short enough to audit before you paste it.',
    ],
  },
  {
    slug: 'python',
    kind: 'interpreter',
    interpreter: 'python',
    titleBase: 'Claude Code Status Lines Written in Python',
    heading: 'Claude Code status lines written in Python',
    chipLabel: 'python',
    metaDescription:
      'Python Claude Code status lines, for richer formatting and logic than a shell one-liner. Rendered previews you can copy.',
    countPhrase: 'are written in Python',
    intro: [
      'Python status lines trade a runtime dependency for readable string formatting and real data structures. If your status line is turning into a program, this is the sensible language for it.',
      "Each config's page lists exactly what it needs; most run on a stock python3 with no packages.",
    ],
  },
  {
    slug: 'node',
    kind: 'interpreter',
    interpreter: 'node',
    titleBase: 'Claude Code Status Lines Written in Node.js',
    heading: 'Claude Code status lines written in Node.js',
    chipLabel: 'node',
    metaDescription:
      'Node.js Claude Code status lines. JSON parsing without jq, and the npm ecosystem when a config needs it. Rendered previews you can copy.',
    countPhrase: 'are written in Node.js',
    intro: [
      'Node status lines parse the JSON payload natively, no jq required, and can lean on npm when a config wants more than the standard library.',
      'If you installed Claude Code through npm you already have the runtime, so trying one of these costs nothing.',
    ],
  },
]

export const FACET_BY_SLUG = new Map(FACETS.map((f) => [f.slug, f]))

/** Valid values for configs.tags: exactly the tag-facet slugs. */
export const TAG_VOCABULARY = FACETS.filter((f) => f.kind === 'tag').map((f) => f.slug)

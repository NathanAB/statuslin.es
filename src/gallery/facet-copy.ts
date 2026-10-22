import type { FaqEntry } from '@/lib/json-ld'

/**
 * The intro paragraphs shown under each facet page's h1, keyed by facet slug. Split out of
 * the facet registry (facets.ts) so the registry stays a compact structural list and the
 * long-form SEO prose lives in one place. Only page:true facets need an entry.
 */
export const FACET_INTRO = {
  git: [
    'Pick a branch-only line if that is all you need, one with dirty-file counts if you commit from the session, or one with ahead and behind markers if you track remotes.',
  ],
  'token-usage': [
    'Pick a number if you only glance at it. Pick a bar if you work near the limit and want to read the fill at a distance.',
  ],
  cost: [
    'Claude Code sends each status line script the running cost of the session. Some show it as a plain number, others change color as the session gets expensive.',
  ],
  quota: [
    'Claude Pro and Max plans limit usage in a five-hour window and a weekly one. Pick one that shows the five-hour window if you hit limits during a workday, or one that shows both if you watch the week.',
  ],
  'burn-rate': [
    'These show how fast a session spends: tokens or dollars per hour, or an arrow that says whether you are ahead of or behind pace for the window. Several also show your usage-limit percentage.',
  ],
  weather: [
    'These put the local weather beside your session. They call a weather API, so check the network hosts each one declares before you copy it.',
  ],
  markets: [
    'These status lines show crypto prices, stock quotes or exchange rates beside your session. They call a market data API, so check the network hosts each one declares before you copy it.',
  ],
  minimal: ['These show only the essentials, usually the model, the directory and one number.'],
  'multi-line': [
    'Claude Code shows every line a status line script prints, so a status line can stack git, tokens, cost and limits on two or three rows. Each preview shows the full height.',
  ],
  powerline: [
    "Powerline separators need a Nerd Font. Without one they render as boxes, so check each status line's requirements before you copy it.",
  ],
  themed: [
    "Status lines in one named palette, such as Catppuccin or Dracula, to match your terminal theme. Each preview shows the script's real colors.",
  ],
  bash: [
    'Bash status lines run anywhere Claude Code does, usually with jq as the only dependency. Each page shows the full source to read before you paste it.',
  ],
  python: [
    'Python suits a status line that has grown into a program. Most run on a stock python3 with no packages, and each page lists what it needs.',
  ],
  node: [
    'Node status lines parse the JSON without jq. If you installed Claude Code with npm, you already have Node.',
  ],
} satisfies Record<string, string[]>

export const FACET_ANSWER = {
  'token-usage':
    'Claude Code pipes a JSON payload to your status line script on stdin each time the line refreshes. Token usage is under `context_window`. Read `context_window.used_percentage` for a percentage, or `total_input_tokens` and `context_window_size` for raw counts. `used_percentage` is null in a fresh session, so default it to 0 in jq with `// 0`.',
  quota:
    "Claude Code passes your plan's usage limits to the status line script as `rate_limits` in its stdin JSON. `rate_limits.five_hour` and `rate_limits.seven_day` each carry `used_percentage` and `resets_at`, a Unix timestamp for when the window resets. Either window can be missing, so guard both before printing.",
  git: "Claude Code does not send git state in the status line's stdin JSON. Scripts that show a branch run git themselves in `workspace.current_dir`, for example `git branch --show-current`. Dirty-file counts come from `git status --porcelain`. Handle the no-repo case, or the line prints an error outside a repository.",
} satisfies Record<string, string>

export const FACET_FAQ = {
  'token-usage': [
    {
      question: 'How do I show a context bar instead of a number?',
      answer:
        'Take `context_window.used_percentage`, scale it to the bar width, and print that many filled blocks followed by empty ones. The bar-style ones above work this way.',
    },
    {
      question: 'Does the context window size change with the model?',
      answer:
        'It can. `context_window.context_window_size` carries the window for the current session, such as 200000 or 1000000. Divide by it instead of hardcoding 200k.',
    },
  ],
  quota: [
    {
      question: 'Why is rate_limits missing from my status line input?',
      answer:
        'Claude Code can omit `rate_limits`, or send only the `five_hour` window. Check that each window exists before reading `used_percentage`, or the script prints empty values.',
    },
    {
      question: 'How do I show when my limit resets?',
      answer:
        'Subtract the current Unix time from `rate_limits.five_hour.resets_at` to get the seconds remaining, then format them as hours and minutes. The same works for `seven_day`.',
    },
  ],
  git: [
    {
      question: 'What does the status line show outside a git repository?',
      answer:
        'Whatever the script prints when git fails. A careful script runs `git rev-parse --is-inside-work-tree` first and skips the git segment when it fails. Each preview includes a directory with no repo, so you can see how each one handles it.',
    },
    {
      question: 'Can the status line show the pull request?',
      answer:
        'Claude Code can send an optional `pr` object with `number`, `url`, and `review_state`. It is not always present, so check for it before printing.',
    },
  ],
} satisfies Record<string, FaqEntry[]>

/** Shown on a facet page that lists mods: where each kind shows up. */
export const FACET_KIND_NOTE =
  "Status lines print under the prompt. Each mod's page shows where it draws."

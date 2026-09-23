import type { FaqEntry } from '@/lib/json-ld'

/**
 * The intro paragraphs shown under each facet page's h1, keyed by facet slug. Split out of
 * the facet registry (facets.ts) so the registry stays a compact structural list and the
 * long-form SEO prose lives in one place. Only page:true facets need an entry.
 */
export const FACET_INTRO = {
  git: [
    'Claude Code tells you the model and the directory, but not what git is doing. These status lines add the branch, and some layer on dirty-file counts or ahead and behind markers, so you can see where a session is about to commit before it happens.',
    'Every preview below is rendered from the real script against the same example sessions, including one in a directory with no git repo, so you can check how each one degrades.',
    'Pick a one-liner if you only need the branch. Pick dirty-file counts if you commit from the session. Pick ahead and behind markers if you track remotes.',
  ],
  'token-usage': [
    'Running out of context mid-task is the worst way to find out how big your session got. These status lines read the context window numbers Claude Code pipes to every status line script and turn them into a count or a burn bar.',
    'The previews are rendered from real sessions at different fill levels, so you can see what each one looks like when the window is nearly empty and nearly full.',
    'Pick a number if you glance. Pick a burn bar if you work near the cap and want to see fill at a distance.',
  ],
  cost: [
    'Claude Code reports the running cost of a session in the JSON it sends your status line. These configs surface it in the terminal, some as a plain number, some as thresholds that change color when a session gets expensive.',
    'If you care about cost because of rate limits rather than dollars, the usage-limit status lines overlap with these; several configs show both.',
  ],
  quota: [
    'Claude plans meter usage in five-hour and weekly windows, and Claude Code hands both to your status line as rate limit data. These status lines show how much of each window is gone and when it resets.',
    'They differ mostly in urgency: some show a quiet percentage, others switch color or warn outright as you approach the cap.',
    'Pick the five-hour window if you hit limits during a workday. Pick a config that shows both windows if you care about the week.',
  ],
  'burn-rate': [
    'Knowing you are at 60 percent of your weekly limit is less useful than knowing whether you are on track to blow through it. These status lines show the rate, not just the total: tokens or dollars per hour, or an arrow that says whether you are ahead of or behind pace for the window.',
    'They pair naturally with the usage-limit configs, and several show both a static percentage and a pace signal side by side, so you can see where you stand and where you are heading at once.',
  ],
  weather: [
    'Most status lines stay inside the session: model, tokens, cost. A few reach past it and pull the local weather into the same line, so a glance at your terminal doubles as a glance out the window.',
    'These lean on a weather API, so check each config’s requirements and the network hosts it declares before you paste it — the preview shows exactly what it prints.',
  ],
  markets: [
    'A status line is just a line of text your shell refreshes, so it can show anything you can fetch — including live market data. These configs put a crypto price, a stock, or an exchange rate next to your model and usage.',
    'They call a market data API, so review each config’s requirements and declared network hosts before pasting; the rendered preview shows the real output.',
  ],
  minimal: [
    'A status line does not have to be a dashboard. These configs stay on one line and show a handful of essentials, usually the model, the directory, and one number that matters to you.',
    'They are also the easiest scripts to read end to end, which makes them good starting points if you plan to customize.',
  ],
  'multi-line': [
    'Claude Code renders every line your script prints, so a status line can be a small dashboard. These configs use two or three lines to fit git state, token usage, cost, and quota without crowding each other out.',
    'The trade is terminal height. The previews show the full block each one prints, so you can judge the footprint before you copy it.',
  ],
  powerline: [
    'Powerline segments with angled separators are the classic terminal-status look. These status lines bring it to Claude Code, and most rely on a Nerd Font for the glyphs.',
    'Check the requirements on each config’s page before copying: without the right font installed the separators render as boxes.',
  ],
  themed: [
    'If your terminal already runs Catppuccin or Dracula, a status line in the same palette stops looking bolted on. These configs commit to a named theme throughout.',
    'The previews use each script’s real ANSI output, so the palette you see is the palette you get.',
  ],
  bash: [
    'Bash status lines run anywhere Claude Code does, with jq usually the only dependency. That makes them the default choice when you do not want to install a runtime just for your terminal.',
    'They range from three-line scripts to full dashboards, and the source on each page is short enough to audit before you paste it.',
  ],
  python: [
    'Python status lines trade a runtime dependency for readable string formatting and real data structures. If your status line is turning into a program, this is the sensible language for it.',
    'Each config’s page lists exactly what it needs; most run on a stock python3 with no packages.',
  ],
  node: [
    'Node status lines parse the JSON payload natively, no jq required, and can lean on npm when a config wants more than the standard library.',
    'If you installed Claude Code through npm you already have the runtime, so trying one of these costs nothing.',
  ],
} satisfies Record<string, string[]>

export const FACET_ANSWER = {
  'token-usage':
    'Claude Code pipes a JSON payload to your status line script on stdin each time the line refreshes. Token usage is under `context_window`. Read `context_window.used_percentage` for a percentage, or `total_input_tokens` and `context_window_size` for raw counts. `used_percentage` is null in a fresh session, so default it to 0 in jq with `// 0`.',
  quota:
    "Claude Code passes your plan's usage limits to the status line script as `rate_limits` in its stdin JSON. `rate_limits.five_hour` and `rate_limits.seven_day` each carry `used_percentage` and `resets_at`, a Unix timestamp for when the window resets. Either window can be missing, so guard both before printing. The configs below differ in how loudly they warn.",
  git: "Claude Code does not send git state in the status line's stdin JSON. Scripts that show a branch run git themselves in `workspace.current_dir`, for example `git branch --show-current`. Dirty-file counts come from `git status --porcelain`. Handle the no-repo case, or the line prints an error outside a repository. Each preview below includes a directory with no repo.",
} satisfies Record<string, string>

export const FACET_FAQ = {
  'token-usage': [
    {
      question: 'Why does my token count show null?',
      answer:
        '`context_window.used_percentage` and `remaining_percentage` are null until the first response of a session. `current_usage` is null then too. Default them in your script, for example with `// 0` in jq.',
    },
    {
      question: 'How do I show a context bar instead of a number?',
      answer:
        'Take `context_window.used_percentage`, scale it to the bar width, and print that many filled blocks followed by empty ones. The burn-bar configs above work this way.',
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
    {
      question: 'What is the difference between five_hour and seven_day?',
      answer:
        '`five_hour` covers the current five-hour usage window. `seven_day` covers the weekly limit. Each carries its own `used_percentage` and `resets_at`.',
    },
  ],
  git: [
    {
      question: 'What does the status line show outside a git repository?',
      answer:
        'Whatever the script prints when git fails. A careful script runs `git rev-parse --is-inside-work-tree` first and skips the git segment when it fails. Each preview includes a directory with no repo, so you can see how a config handles it.',
    },
    {
      question: 'Can the status line show the pull request?',
      answer:
        'Claude Code can send an optional `pr` object with `number`, `url`, and `review_state`. It is not always present, so check for it before printing.',
    },
  ],
} satisfies Record<string, FaqEntry[]>

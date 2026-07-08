/**
 * The intro paragraphs shown under each facet page's h1, keyed by facet slug. Split out of
 * the facet registry (facets.ts) so the registry stays a compact structural list and the
 * long-form SEO prose lives in one place. Only page:true facets need an entry.
 */
export const FACET_INTRO = {
  git: [
    'Claude Code tells you the model and the directory, but not what git is doing. These status lines add the branch, and some layer on dirty-file counts or ahead and behind markers, so you can see where a session is about to commit before it happens.',
    'Every preview below is rendered from the real script against the same example sessions, including one in a directory with no git repo, so you can check how each one degrades.',
  ],
  'token-usage': [
    'Running out of context mid-task is the worst way to find out how big your session got. These status lines read the context window numbers Claude Code pipes to every status line script and turn them into a count or a burn bar.',
    'The previews are rendered from real sessions at different fill levels, so you can see what each one looks like when the window is nearly empty and nearly full.',
  ],
  cost: [
    'Claude Code reports the running cost of a session in the JSON it sends your status line. These configs surface it in the terminal, some as a plain number, some as thresholds that change color when a session gets expensive.',
    'If you care about cost because of rate limits rather than dollars, the usage-limit status lines overlap with these; several configs show both.',
  ],
  quota: [
    'Claude plans meter usage in five-hour and weekly windows, and Claude Code hands both to your status line as rate limit data. These status lines show how much of each window is gone and when it resets.',
    'They differ mostly in urgency: some show a quiet percentage, others switch color or warn outright as you approach the cap.',
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

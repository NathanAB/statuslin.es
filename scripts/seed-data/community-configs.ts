import { readFileSync } from 'node:fs'
import type { CommunityConfig } from '../seed-community'

// One entry per person we seed. Populated during the outreach phase. Keep titles/descriptions
// in two-word "status line" prose. `githubLogin` drives auto-login attribution + the GitHub
// link in the byline; `githubId` is that login's numeric id, pinned here at review time and
// verified against the live GitHub API before each run (a mismatch means the login was renamed
// or recycled — that entry is skipped rather than mis-attributed). Every `source` MUST be
// human-reviewed before a run: it is published only after the web server renders it and an admin
// approves it in the review queue, but the data file is the first review checkpoint.
//
// Keep it to a few entries per GitHub author: the submit pipeline caps 3 submissions per author
// per hour, so a 4th entry for the same person in one run fails with a rate-limit error (re-run
// after an hour to land it). For the usual "one entry per person" list this never bites.
//
// `source` is vendored verbatim (byte-for-byte MIT/copyright headers preserved) from each pinned
// ref into `./sources/`; see the seed-wave manifest for provenance. Two entries carry a
// `[statuslin.es] trimmed:` comment at the top of their source file (rows 11/12 in the manifest)
// noting what was cut and why.
const src = (name: string): string =>
  readFileSync(new URL(`./sources/${name}`, import.meta.url), 'utf8')

export const COMMUNITY_CONFIGS: CommunityConfig[] = [
  {
    githubLogin: 'daniel3303',
    githubId: '36623265',
    title: 'Everything Bar',
    description:
      "Model, directory and branch with diff counts, context tokens, reasoning effort, and five-hour and seven-day limits from Claude Code's own rate-limit data, with the usage API as fallback. Checks for new versions of itself once a day.",
    interpreter: 'bash',
    source: src('01-everything-bar.sh'),
    networkHosts: ['api.anthropic.com', 'api.github.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/daniel3303/ClaudeCodeStatusLine/blob/5da96959df726707fe8ff41c5645b4f7b8c7eac9/statusline.sh',
  },
  {
    githubLogin: 'nilbuild',
    githubId: '4921183',
    title: 'Usage Dot Bars',
    description:
      'Model, context, directory and branch up top; five-hour and weekly quota as dot bars with reset times underneath. Flags --dangerously-skip-permissions with a lightning bolt. By Kamran Ahmed of roadmap.sh.',
    interpreter: 'bash',
    source: src('02-usage-dot-bars.sh'),
    networkHosts: ['api.anthropic.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/nilbuild/claude-statusline/blob/ea02c0e6dcd532fea6056f7eec2b7545b3666248/bin/statusline.sh',
  },
  {
    githubLogin: 'loadbalance-sudachi-kun',
    githubId: '41281835',
    title: 'Three-Line Cockpit',
    description:
      'Model, context, lines changed and branch on the first line; a context bar with token counts on the second; session cost on the third. No network calls, just stdin and local git.',
    interpreter: 'bash',
    source: src('03-three-line-cockpit.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/loadbalance-sudachi-kun/claude-code-statusline/blob/23d2b2d7ab2d2f845550f0d5d2c2b4281ee950ad/statusline-command.sh',
  },
  {
    githubLogin: 'lbenothman',
    githubId: '3247643',
    title: 'Quota at a Glance',
    description:
      'Everything on one line: model, color-coded five-hour and seven-day usage from the usage API, and the current directory. Written in Python.',
    interpreter: 'python',
    source: src('04-quota-at-a-glance.py'),
    networkHosts: ['api.anthropic.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/lbenothman/claude-code-statusline/blob/b5df77334fa61a4485a9dc81063994a430f55578/statusline.py',
  },
  {
    githubLogin: 'aleksander-dytko',
    githubId: '102789122',
    title: 'Overage Watcher',
    description:
      'Watches plan limits and extra-usage spending in dollars, next to model, branch with diff stats, context and cost. Env vars switch it between one and two lines.',
    interpreter: 'bash',
    source: src('05-overage-watcher.sh'),
    networkHosts: ['api.anthropic.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/aleksander-dytko/claude-code-statusline/blob/13f38409755c6eede26864e803211773049cafb1/statusline.sh',
  },
  {
    githubLogin: 'kcchien',
    githubId: '6722315',
    title: 'Gradient Dashboard',
    description:
      'A gradient progress bar for context with quota percentages beside it, plus cost, duration and lines changed. Bash and jq, fully offline.',
    interpreter: 'bash',
    source: src('06-gradient-dashboard.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/kcchien/claude-code-statusline/blob/877d24480ca9a37b8eefc0448a6a73a111989b6d/statusline.sh',
  },
  {
    githubLogin: 'TahaSabir0',
    githubId: '187144240',
    title: 'Todo Ticker',
    description:
      'Shows the task Claude is working on right now, read from the session todo list, beside context and five-hour usage bars.',
    interpreter: 'node',
    source: src('07-todo-ticker.js'),
    networkHosts: ['api.anthropic.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/TahaSabir0/Best-ClaudeCode-statusline/blob/60304674fb210dced7ed2034904e94efbb0f8f18/statusline.js',
  },
  {
    githubLogin: 'Astro-Han',
    githubId: '255364436',
    title: 'Pace Arrows',
    description:
      'Are you burning quota faster than the clock? Five-hour and seven-day usage with over- and under-pace arrows, plus a context bar and git diff stats. Reads rate limits from stdin only.',
    interpreter: 'bash',
    source: src('08-pace-bars.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/Astro-Han/claude-pace/blob/f13a3ec2c5bc6c01c76bd230742b94025dac3bc7/claude-pace.sh',
  },
  {
    githubLogin: 'ilia-pluzhnikov',
    githubId: '46619650',
    title: 'Git Detective',
    description:
      'Bucketed git status counts, ahead-behind arrows, prompt-cache stats with an expiry countdown, and a heads-up when CLAUDE.md, AGENTS.md and GEMINI.md fall out of sync. Dependency-free Node.',
    interpreter: 'node',
    source: src('09-git-detective.js'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/ilia-pluzhnikov/claude-code-statusline/blob/256eb2314c53c986fb3e7e47b8bf4db306d234bd/statusline.js',
  },
  {
    githubLogin: 'ohugonnot',
    githubId: '13014954',
    title: 'Quota Fallback',
    description:
      'Branch, model with effort level, a context bar and the five-hour quota with reset countdown. Only calls the usage API when stdin lacks rate limits.',
    interpreter: 'bash',
    source: src('10-quota-fallback.sh'),
    networkHosts: ['api.anthropic.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/ohugonnot/claude-code-statusline/blob/d45b420cca872092f6beca6550feacf32e73d6df/statusline.sh',
  },
  {
    githubLogin: 'aiedwardyi',
    githubId: '41576951',
    title: 'Width-Aware Monitor',
    description:
      'Keeps itself inside a width budget (80 columns by default) by dropping the lowest-priority segments first. Model, project, context gauge with token counts, quota bars and duration; pace arrows and a cost readout are opt-in.',
    interpreter: 'python',
    source: src('11-width-aware-monitor.py'),
    networkHosts: ['api.anthropic.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/aiedwardyi/claude-usage-monitor/blob/4627e5e1c57ca6713011fe0250391173450b4c8d/statusline.py',
  },
  {
    githubLogin: 'JungHoonGhae',
    githubId: '42439321',
    title: 'Activity Feed',
    description:
      'A header with model, context and burn rate per hour, then live tool and agent activity parsed from the session transcript.',
    interpreter: 'bash',
    source: src('12-activity-feed.sh'),
    networkHosts: ['api.anthropic.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/JungHoonGhae/claude-statusline/blob/6465e466c4832509c5bbc2a253581fa322618e1c/statusline.sh',
  },
  {
    githubLogin: 'tzengyuxio',
    githubId: '938388',
    title: 'Nerd Font Duo',
    description:
      'Two Nerd Font lines: model, a 16-segment context bar, cost and quotas on top; directory, git counts, Python venv and vim mode below.',
    interpreter: 'bash',
    source: src('13-nerd-font-duo.sh'),
    networkHosts: ['api.anthropic.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/tzengyuxio/claude-statusline/blob/7dc647a9332dcbcb9f250bf1cf4882dea6e548cc/statusline-command.sh',
  },
  {
    githubLogin: 'bitcoin21ideas',
    githubId: '109059318',
    title: 'Traffic-Light Context',
    description:
      'A context bar that shifts green to orange to red at 40 and 60 percent, a five-hour reset countdown, the weekly reset day, and the git branch. Stdin only.',
    interpreter: 'bash',
    source: src('14-traffic-light-context.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/bitcoin21ideas/claude-statusline/blob/d0ba9b8a075d079d0627d307deb7f174223159b4/statusline.sh',
  },
  {
    githubLogin: 'Mohamed3on',
    githubId: '12295159',
    title: 'Cost Thresholds',
    description:
      'Directory, Node version when a package.json is around, added and removed lines with a net-direction arrow, a token bar, and a session cost that changes color as it grows.',
    interpreter: 'bash',
    source: src('15-cost-thresholds.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl: 'https://gist.github.com/Mohamed3on/70780575570a07985916e5f50e290382',
  },
  // Wave 2 (2026-10-17). Same rules; 18-burn-rate-trio.sh carries a `[statuslin.es] trimmed:` comment.
  {
    githubLogin: 'awesomezun',
    githubId: '55944204',
    title: 'Mocha Two-Liner',
    description:
      'Two lines in Catppuccin colors: model with effort, output style, path, branch and a git clean or dirty mark, then gradient bars for context and the five-hour and seven-day limits with reset times.',
    interpreter: 'bash',
    source: src('16-mocha-two-liner.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/awesomezun/claude-statusline/blob/b5311af03fb645845985c100e74c0def7f3e3d81/scripts/awesome-statusline-small.sh',
  },
  {
    githubLogin: 'awesomezun',
    githubId: '55944204',
    title: 'Catppuccin Wide Bars',
    description:
      'Five lines in Catppuccin colors: model, git state with ahead and behind counts, path and branch with session cost and duration, then wide 40-block gradient bars for context and the five-hour and seven-day limits.',
    interpreter: 'bash',
    source: src('17-catppuccin-wide-bars.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/awesomezun/claude-statusline/blob/b5311af03fb645845985c100e74c0def7f3e3d81/scripts/awesome-statusline-xlarge.sh',
  },
  {
    githubLogin: 'chongdashu',
    githubId: '1178121',
    title: 'Burn Rate Trio',
    description:
      'Three lines: directory, branch, model, Claude Code version and output style, then context remaining as a bar, then session cost with dollars per hour and total tokens with tokens per minute. From the cc-statusline generator.',
    interpreter: 'bash',
    source: src('18-burn-rate-trio.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/chongdashu/cc-statusline/blob/6fe55d96e8688d7951fbab35e5d4a4545e37dd4a/.claude/statusline.sh',
  },
  {
    githubLogin: 'Field-Logic-Ltd',
    githubId: '202088401',
    title: 'Context Growth Watch',
    description:
      'Model, project, a context bar with token count, what each turn costs in cache reads, how much the context has grown, and five-hour and seven-day usage. Adds a line suggesting /compact or /clear once context gets large. Python, no network calls.',
    interpreter: 'python',
    source: src('19-context-growth-watch.py'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/Field-Logic-Ltd/ClaudeStatsBar/blob/02300a12fe9d9e2401c14c7dc2f25184995f42bb/statsbar.py',
  },
  {
    githubLogin: 'alp82',
    githubId: '966342',
    title: 'Instrument Panel Rows',
    description:
      "Two rows: project, branch and changed-file and line counts on top, then model, effort, a context bar and five-hour and seven-day bars that stack your usage against the time elapsed. Reads the Fable weekly limit from Claude Code's cache, falling back to api.anthropic.com with your Claude login.",
    interpreter: 'bash',
    source: src('20-instrument-panel-rows.sh'),
    networkHosts: ['api.anthropic.com'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/alp82/claude-statusline/blob/3d4c4470e2d1080e979c1c6dff0f3a3fddeeae90/statusline.sh',
  },
  {
    githubLogin: 'FahimFBA',
    githubId: '64195132',
    title: 'Used and Remaining Bars',
    description:
      'One line with project, branch, model, a context bar and effort level, plus five-hour and seven-day limit bars that show both used and remaining percent with reset countdowns. No network calls.',
    interpreter: 'bash',
    source: src('21-used-and-remaining-bars.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/FahimFBA/claudecode-statusline/blob/0dc025f46541c8df04ad97f76d2a2cb62e80b61a/hooks/caveman-statusline.sh',
  },
  {
    githubLogin: 'XyzElias',
    githubId: '132617320',
    title: 'Framed Pill Row',
    description:
      'A rounded frame around gradient pills for model, effort, path, branch, context bar, five-hour usage, diff, cost and session time, with labels underneath. Pure Node with no network calls; creates its own config file in ~/.claude on first run.',
    interpreter: 'node',
    source: src('22-framed-pill-row.js'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/XyzElias/prismatic-claude-statusline/blob/58007fe3d5851b747d2038e71cfe0a77353e8496/statusline.js',
  },
  {
    githubLogin: 'aromanarguello',
    githubId: '28843542',
    title: 'Dot Gauge Trio',
    description:
      'Three lines: model, token counts and lines changed; dot gauges for context, five-hour and weekly usage; then the clock time each limit resets. No network calls.',
    interpreter: 'bash',
    source: src('23-dot-gauge-trio.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/aromanarguello/claude-statusline/blob/3b97a36f063be120969cbf8ab1bc17366071560c/statusline.sh',
  },
  {
    githubLogin: 'philipshurpik',
    githubId: '6635302',
    title: 'Cache Clock Line',
    description:
      'One line in Node: model, project, branch, the time of the last token change (to judge prompt-cache expiry), a context bar measured against the usable window, and five-hour and seven-day usage with reset countdowns. No network calls.',
    interpreter: 'node',
    source: src('24-cache-clock-line.js'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/philipshurpik/claude-code-status-line/blob/6b212408da5862516fc9ddd176039f28f31ad3bf/status-line.js',
  },
  {
    githubLogin: 'kangraemin',
    githubId: '22047559',
    title: 'Hourly Burn Lines',
    description:
      'Three emoji-labeled lines: folder, git branch and model; context use with a bar and session cost with a dollars-per-hour rate; then five-hour and seven-day quota bars when your plan reports them. No network calls.',
    interpreter: 'bash',
    source: src('25-hourly-burn-lines.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/kangraemin/claude-status-bar/blob/33e288a46646a2e65af4aca757b9526325632d84/statusline.sh',
  },
  {
    githubLogin: 'jacob-bd',
    githubId: '47641890',
    title: 'Timestamped Quota Line',
    description:
      'One line that starts with the time, then model, output style, folder and git state, a context bar with tokens left, and five-hour and seven-day quota bars, or the session cost on API billing. More segments in an optional config file. No network calls.',
    interpreter: 'bash',
    source: src('26-timestamped-quota-line.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/jacob-bd/claude-code-statusline/blob/6608aa41f9d2bf081974aab1d27b8f4573090ffb/statusline-command.sh',
  },
  {
    githubLogin: 'k8adev',
    githubId: '3808430',
    title: 'Clay Braille Bars',
    description:
      "Three lines in Anthropic's clay and olive palette: project, git branch and lines changed; model with a braille context bar and session time; then five-hour and seven-day usage with reset countdowns. No network calls.",
    interpreter: 'bash',
    source: src('27-clay-braille-bars.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/k8adev/claude-code-statusline/blob/b10c64b58971e9f79453e51cfad3f374d02dfd17/statusline.sh',
  },
  {
    githubLogin: 'hoangsonww',
    githubId: '124531104',
    title: 'Plain Python Bar',
    description:
      'One cross-platform Python line: model, user, folder, git branch, a color-coded context bar, input, output and cache token counts, and session cost. Standard library only, no network calls.',
    interpreter: 'python',
    source: src('28-plain-python-bar.py'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/hoangsonww/Claude-Code-Agent-Monitor/blob/a06db038a93b4d7316492dc55758f597e104894c/statusline/statusline.py',
  },
  {
    githubLogin: 'minorun365',
    githubId: '74597894',
    title: 'Heat Dot Line',
    description:
      'One short Python line: the model, then context, five-hour and seven-day usage, each as a percentage with a dot that shifts from green to red as it fills. No dependencies, no network calls.',
    interpreter: 'python',
    source: src('29-heat-dot-line.py'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/minorun365/my-claude-code-settings/blob/a78c2faa071da28d2b996b4cfe62ccac08854518/claude/statusline.py',
  },
  {
    githubLogin: 'travisjneuman',
    githubId: '33078474',
    title: 'Middle-Dot Ledger',
    description:
      'One colorless Node line: model, effort, folder and git branch, context size in tokens, the prompt-cache hit rate when Claude Code reports it, five-hour and seven-day usage, and session cost. Node built-ins only, no network calls.',
    interpreter: 'node',
    source: src('30-middle-dot-ledger.js'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/travisjneuman/.claude/blob/9b6c3d21dae256a66857237c47c5232810c51b95/hooks/statusline.js',
  },
  {
    githubLogin: 'GourangaDasSamrat',
    githubId: '146644902',
    title: 'Dracula Two-Liner',
    description:
      'Two lines in the Dracula palette: model, folder, git branch with staged and modified counts, and effort on top; a context bar, cost, session time and five-hour usage below. Needs a Nerd Font, no network calls.',
    interpreter: 'bash',
    source: src('31-dracula-two-liner.sh'),
    networkHosts: [],
    license: 'MIT',
    sourceUrl:
      'https://github.com/GourangaDasSamrat/dotfiles/blob/a88a74367048a7b3cfa4ffd265ea1659631b2940/claude/.claude/statusline.sh',
  },
]

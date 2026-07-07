import { readFileSync } from 'node:fs'
import type { CommunityConfig } from '../seed-community'

// One entry per person we seed. Populated during the outreach phase. Keep titles/descriptions
// in two-word "status line" prose. `githubLogin` drives auto-login attribution + the GitHub
// link in the byline; `githubId` is that login's numeric id, pinned here at review time and
// verified against the live GitHub API before each run (a mismatch means the login was renamed
// or recycled — that entry is skipped rather than mis-attributed). Every `source` MUST be
// human-reviewed before a run: it is published only after the worker renders it and an admin
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
  {
    githubLogin: 'aaronvstory',
    githubId: '183355548',
    title: 'Weather & Bitcoin Bar',
    description:
      'A three-line bar that mixes coding metrics with ambient real-world data: model, context and git on top; date, time, live weather from wttr.in and the Bitcoin price from Coinbase in the middle; a context bar with real token counts, session cost and Claude Code version below.',
    interpreter: 'node',
    source: src('16-weather-bitcoin-bar.js'),
    networkHosts: ['wttr.in', 'api.coinbase.com', 'claude.ai'],
    license: 'MIT',
    sourceUrl:
      'https://github.com/aaronvstory/claude-code-enhanced-statusline/blob/3d9f8d889bb5a3c875f7eb4ae04405fbb50c227b/enhanced-statusline.js',
  },
]

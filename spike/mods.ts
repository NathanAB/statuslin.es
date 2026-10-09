/** One input step applied after the scripted turn: type text (then Enter unless `submit` is false), press keys, or wait. */
export type InputStep =
  | { type: 'text'; text: string; submit?: boolean }
  | { type: 'keys'; keys: KeyName[] }
  | { type: 'wait'; ms: number }

export const KEYS = {
  enter: '\r',
  escape: '\u001b',
  tab: '\t',
  up: '\u001b[A',
  down: '\u001b[B',
  right: '\u001b[C',
  left: '\u001b[D',
  ctrlX: '\u0018',
} as const
export type KeyName = keyof typeof KEYS

export type ModSource = {
  /** Plugin name, as its plugin.json spells it. */
  name: string
  owner: string
  repo: string
  /** Folder inside the repository that holds `.claude-plugin/plugin.json`; '' for the root. */
  path: string
  sha: string
  /** The issue's eight candidates are attempted three times; the rest once. */
  isCandidate: boolean
  steps: InputStep[]
}

/** A slash command typed at the prompt and submitted. */
const cmd = (text: string): InputStep => ({ type: 'text', text })

const PLAYGROUND = {
  owner: 'anthropics',
  repo: 'claude-code-playground',
  sha: '569c5283d9a0a7ee7938df85bb32e4f48cbb8c86',
}
const HAMZAFER = {
  owner: 'hamzafer',
  repo: 'claude-code-mods',
  sha: 'e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9',
}

const playground = (name: string, isCandidate: boolean, steps: InputStep[] = []): ModSource => ({
  ...PLAYGROUND,
  name,
  path: `claude-code/mods/${name}`,
  isCandidate,
  steps,
})
const hamzafer = (name: string, isCandidate: boolean, steps: InputStep[] = []): ModSource => ({
  ...HAMZAFER,
  name,
  path: `mods/${name}`,
  isCandidate,
  steps,
})

export const MODS: ModSource[] = [
  playground('token-weather', true),
  hamzafer('context-bar', true),
  hamzafer('usage-meter', true),
  {
    name: 'image-view',
    owner: 'jarrodwatts',
    repo: 'claude-image-view',
    path: '',
    sha: 'b3c412bb6d167cafade79148e95f9114ee1aad7c',
    isCandidate: true,
    steps: [{ type: 'text', text: 'look at [Image #1]', submit: false }],
  },
  playground('replay-theater', true, [cmd('/replay')]),
  hamzafer('next-steps', true),
  {
    name: 'filetree',
    owner: 'data-goblin',
    repo: 'claude-code-filetree',
    path: '',
    sha: 'da1da65724c54541f4a0ec5ddd26641b1a0d672a',
    isCandidate: true,
    steps: [cmd('/filetree')],
  },
  {
    name: 'skins',
    owner: 'hellosverre',
    repo: 'claude-skins',
    path: '',
    sha: '0abe0f34ea9e351c529151f6729e018d7e4a2648',
    isCandidate: true,
    steps: [],
  },
  playground('blast-radius', false),
  ...(
    [
      ['agent-radar', [cmd('/radar')]],
      ['blast-radius', []],
      ['browser-lanes', [cmd('/browser')]],
      ['cache-clock', [cmd('/cache-clock')]],
      ['glance', [cmd('/glance')]],
      ['md-preview', [cmd('/md README.md')]],
      ['merge-gate', [cmd('/gate')]],
      ['mission-control', [cmd('/mission')]],
      ['now-playing', []],
      ['openai-balance', [cmd('/openai-balance')]],
      ['prayer-times', []],
      ['reels', [cmd('/reels')]],
      ['replay-theater', [cmd('/replay')]],
      ['review-watch', []],
      ['rulebook-guard', []],
      ['session-saver', [cmd('/park')]],
      ['snake', [cmd('/snake')]],
      ['switchboard', [cmd('/route')]],
      ['token-weather', []],
      ['where-am-i', []],
    ] as const
  ).map(([name, steps]) => hamzafer(name, false, [...steps])),
]

/** `owner/repo/path` keys tell the two repositories' same-named mods apart. */
export const modKey = (m: ModSource) => `${m.owner}/${m.repo}${m.path ? `/${m.path}` : ''}`

export function findMods(query: string): ModSource[] {
  return MODS.filter((m) => m.name === query || modKey(m) === query)
}

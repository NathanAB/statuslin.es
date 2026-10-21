import type { CustomizeFocus } from '@/ui/customize-screen'

/**
 * One way to customize Claude Code: what it changes, Anthropic's docs, and where to find some. `key`
 * is the part of the drawn session it lights, `detail` its few words in the picker, and `screen` what
 * the drawn session shows while it's picked, for a screen reader.
 */
export interface CustomizationSurface {
  key: CustomizeFocus
  name: string
  detail: string
  text: string
  screen: string
  docsUrl: string
  browse: Array<{ to: '/mods' | '/status-lines/best' | '/guide'; label: string }>
}

/** Every way to customize Claude Code, each checked against code.claude.com on 2026-10-21. */
export const CUSTOMIZATION_SURFACES: CustomizationSurface[] = [
  {
    key: 'mods',
    name: 'Mods',
    detail: 'Panes and bands',
    text: "Panes, a band above the prompt, Claude Code's own rows and spinner, and slash commands. They work in the terminal, Claude Desktop and VS Code.",
    screen: "A Claude Code session with a mod's pane and its band above the prompt lit.",
    docsUrl: 'https://code.claude.com/docs/en/plugins/mods/overview',
    browse: [{ to: '/mods', label: 'Browse mods' }],
  },
  {
    key: 'status-line',
    name: 'Status line',
    detail: 'Under the prompt',
    text: 'The row under the prompt in the terminal, printed by a script. Run /statusline to have Claude write one.',
    screen: 'A Claude Code session with the status line under the prompt lit.',
    docsUrl: 'https://code.claude.com/docs/en/statusline',
    browse: [
      { to: '/status-lines/best', label: 'Best status lines' },
      { to: '/guide', label: 'Write your own' },
    ],
  },
  {
    key: 'themes',
    name: 'Themes',
    detail: 'Colors',
    text: "Claude Code's colors, from a theme you make or install and pick with /theme.",
    screen: 'The same Claude Code session in a light theme.',
    docsUrl: 'https://code.claude.com/docs/en/terminal-config#create-a-custom-theme',
    browse: [],
  },
  {
    key: 'spinner-verbs',
    name: 'Spinner verbs',
    detail: 'The spinner',
    text: 'The words beside the spinner while Claude works, set with spinnerVerbs.',
    screen: 'A Claude Code session whose spinner shows a word of your own.',
    docsUrl: 'https://code.claude.com/docs/en/settings-reference#spinnerverbs',
    browse: [],
  },
  {
    key: 'output-styles',
    name: 'Output styles',
    detail: 'Replies',
    text: 'How Claude writes its replies, picked with /output-style.',
    screen: "A Claude Code session with Claude's reply lit.",
    docsUrl: 'https://code.claude.com/docs/en/output-styles',
    browse: [],
  },
  {
    key: 'hooks',
    name: 'Hooks',
    detail: 'Tool calls',
    text: 'Commands that run at set moments, such as before a tool call or when a session ends.',
    screen: "A Claude Code session with a hook's note under a tool call lit.",
    docsUrl: 'https://code.claude.com/docs/en/hooks',
    browse: [],
  },
  {
    key: 'skills',
    name: 'Skills',
    detail: 'On demand',
    text: 'Instructions Claude loads when a task calls for them, or that you run as /name.',
    screen: 'A Claude Code session with a skill at work lit.',
    docsUrl: 'https://code.claude.com/docs/en/skills',
    browse: [],
  },
  {
    key: 'subagents',
    name: 'Subagents',
    detail: 'Side tasks',
    text: 'Helpers with their own context, each for one kind of task.',
    screen: "A Claude Code session with a subagent's task lit.",
    docsUrl: 'https://code.claude.com/docs/en/sub-agents',
    browse: [],
  },
]

/** Each way to customize Claude Code by the part of the drawn session it lights. */
export const SURFACE_BY_KEY = Object.fromEntries(
  CUSTOMIZATION_SURFACES.map((surface) => [surface.key, surface]),
) as Record<CustomizeFocus, CustomizationSurface>

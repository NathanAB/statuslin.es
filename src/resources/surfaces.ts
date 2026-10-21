/** One way to customize Claude Code: what it changes, Anthropic's docs, and where to find some. */
export interface CustomizationSurface {
  name: string
  text: string
  docsUrl: string
  browse: Array<{ to: '/mods' | '/status-lines/best' | '/guide'; label: string }>
}

/** Every way to customize Claude Code, each checked against code.claude.com on 2026-10-21. */
export const CUSTOMIZATION_SURFACES: CustomizationSurface[] = [
  {
    name: 'Mods',
    text: "Panes, a band above the prompt, Claude Code's own rows and spinner, and slash commands. They work in the terminal, Claude Desktop and VS Code.",
    docsUrl: 'https://code.claude.com/docs/en/plugins/mods/overview',
    browse: [{ to: '/mods', label: 'Browse mods' }],
  },
  {
    name: 'Status line',
    text: 'The row under the prompt in the terminal, printed by a script. Run /statusline to have Claude write one.',
    docsUrl: 'https://code.claude.com/docs/en/statusline',
    browse: [
      { to: '/status-lines/best', label: 'Best status lines' },
      { to: '/guide', label: 'Write your own' },
    ],
  },
  {
    name: 'Themes',
    text: "Claude Code's colors, from a theme you make or install and pick with /theme.",
    docsUrl: 'https://code.claude.com/docs/en/terminal-config#create-a-custom-theme',
    browse: [],
  },
  {
    name: 'Spinner verbs',
    text: 'The words beside the spinner while Claude works, set with spinnerVerbs.',
    docsUrl: 'https://code.claude.com/docs/en/settings-reference#spinnerverbs',
    browse: [],
  },
  {
    name: 'Output styles',
    text: 'How Claude writes its replies, picked with /output-style.',
    docsUrl: 'https://code.claude.com/docs/en/output-styles',
    browse: [],
  },
  {
    name: 'Hooks',
    text: 'Commands that run at set moments, such as before a tool call or when a session ends.',
    docsUrl: 'https://code.claude.com/docs/en/hooks',
    browse: [],
  },
  {
    name: 'Skills',
    text: 'Instructions Claude loads when a task calls for them, or that you run as /name.',
    docsUrl: 'https://code.claude.com/docs/en/skills',
    browse: [],
  },
  {
    name: 'Subagents',
    text: 'Helpers with their own context, each for one kind of task.',
    docsUrl: 'https://code.claude.com/docs/en/sub-agents',
    browse: [],
  },
]

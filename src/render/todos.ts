import type { Scenario } from './types'

// Builds the session todo file Claude Code would have written, so todo-reading status lines
// (e.g. "current task" tickers) render their headline segment in previews instead of nothing.
// Real shape/location (verified against community scripts' discovery filters):
//   ~/.claude/todos/<session_id>-agent-<session_id>.json
//   [{ content, status: 'pending'|'in_progress'|'completed', activeForm }]

export interface TodoEntry {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

const DEFAULT_TODOS: TodoEntry[] = [
  {
    content: 'Reproduce the reported bug',
    status: 'completed',
    activeForm: 'Reproducing the reported bug',
  },
  {
    content: 'Fix the null check in the parser',
    status: 'in_progress',
    activeForm: 'Fixing the null check in the parser',
  },
  {
    content: 'Run the full test suite',
    status: 'pending',
    activeForm: 'Running the full test suite',
  },
]

/** Per-scenario stories; anything not listed gets DEFAULT_TODOS. Exactly one in_progress each. */
const TODOS_BY_SCENARIO: Record<string, TodoEntry[]> = {
  'dirty-feature': [
    {
      content: 'Add the OAuth provider config',
      status: 'completed',
      activeForm: 'Adding the OAuth provider config',
    },
    {
      content: 'Wire up the OAuth callback route',
      status: 'in_progress',
      activeForm: 'Wiring up the OAuth callback route',
    },
    {
      content: 'Add tests for token refresh',
      status: 'pending',
      activeForm: 'Adding tests for token refresh',
    },
  ],
  'near-full': [
    {
      content: 'Map the session store call sites',
      status: 'completed',
      activeForm: 'Mapping the session store call sites',
    },
    {
      content: 'Extract the store interface',
      status: 'completed',
      activeForm: 'Extracting the store interface',
    },
    {
      content: 'Port the Redis adapter',
      status: 'completed',
      activeForm: 'Porting the Redis adapter',
    },
    {
      content: 'Refactor the session store',
      status: 'in_progress',
      activeForm: 'Refactoring the session store',
    },
    {
      content: 'Delete the legacy adapter',
      status: 'pending',
      activeForm: 'Deleting the legacy adapter',
    },
  ],
  worktree: [
    {
      content: 'Create the feature worktree',
      status: 'completed',
      activeForm: 'Creating the feature worktree',
    },
    {
      content: 'Build the feature flag toggle',
      status: 'in_progress',
      activeForm: 'Building the feature flag toggle',
    },
    { content: 'Open the draft PR', status: 'pending', activeForm: 'Opening the draft PR' },
  ],
}

export function buildTodosFile(scenario: Scenario): { path: string; content: string } | null {
  // fresh-session ONLY: a just-started session has no todo file yet. Deliberately not keyed off
  // zero context tokens — post-compact also has zero tokens but models a mid-session state
  // whose todo list persists.
  if (scenario.key === 'fresh-session') return null

  const sessionId = scenario.stdin.session_id
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new Error('scenario stdin.session_id is required to build the todos fixture')
  }
  const todos = TODOS_BY_SCENARIO[scenario.key] ?? DEFAULT_TODOS
  return {
    path: `/home/user/.claude/todos/${sessionId}-agent-${sessionId}.json`,
    content: JSON.stringify(todos),
  }
}

import { orderByScenario, SCENARIO_BY_KEY } from '@/render/scenarios'
import type { RenderedPreview } from '@/render/types'

export interface ContentPromptInput {
  title: string
  description: string
  interpreter: string
  source: string
  networkHosts: string[]
  readsClaudeToken: boolean
  previews: RenderedPreview[]
}

/**
 * The prompt sent to `claude -p` to generate a config page's three content sections. Everything
 * the model may claim must be observable in what we hand it here: the script source, the
 * submission metadata, and the sandbox-rendered output per scenario (with the stdin JSON that
 * produced it, so "behavior notes" can tie output changes to session-state changes).
 */
export function buildContentPrompt(input: ContentPromptInput): string {
  const scenarios =
    input.previews.length === 0
      ? 'No rendered previews are available — describe only what the script source shows.'
      : orderByScenario(input.previews)
          .map((p) => {
            const scenario = SCENARIO_BY_KEY.get(p.scenarioKey)
            const stdin = scenario
              ? `Claude Code sent this JSON on stdin:\n${JSON.stringify(scenario.stdin, null, 2)}\n`
              : ''
            return [
              `### Scenario: ${scenario?.label ?? p.scenarioKey}`,
              stdin,
              `The script printed (exit code ${p.exitCode}):`,
              '```',
              p.rawStdout,
              '```',
            ].join('\n')
          })
          .join('\n\n')

  const network =
    input.networkHosts.length > 0
      ? `Declared network hosts: ${input.networkHosts.join(', ')}`
      : 'Declared network hosts: none — the script runs with network access off.'

  return `You are writing factual copy for a gallery page about one Claude Code status line script.

## The script (${input.interpreter})
\`\`\`
${input.source}
\`\`\`

## Submission metadata
- Title: ${input.title}
- Author description: ${input.description || 'none'}
- ${network}
- Reads the Claude OAuth token: ${input.readsClaudeToken ? 'yes' : 'no'}

## Rendered previews
The script was executed in a sandbox against the following Claude Code session states.

${scenarios}

## Your task
Return ONLY a JSON object — no prose before or after it, no markdown fences — with exactly these keys:

{
  "whatItShows": string[],
  "requirements": string[],
  "behaviorNotes": string[]
}

- whatItShows: the pieces of information this status line displays (e.g. "Current git branch", "Context window usage as a percentage").
- requirements: what a user needs to run it — the ${input.interpreter} runtime, external commands the script calls (jq, git, ...), special fonts (Nerd Font glyphs), network access.
- behaviorNotes: how the output CHANGES across the scenarios above — what appears, disappears, or changes between session states.

Hard rules:
- State ONLY what you can observe in the script source or the rendered previews above. If you cannot point to the exact source line or output that proves a claim, leave the claim out. Never guess.
- Each item is one short plain-English sentence or phrase, no markdown.
- Write "status line" as two words in any prose.
- If a section has nothing observable, return an empty array for it.`
}

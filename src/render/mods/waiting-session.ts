import { dirname } from 'node:path'
import type { InputStep } from '@/mods/curation'
import type { Scenario } from '../types'
import { feedStdin } from './scenario-feed'

const WAITING_STEP = '/preview-waiting'

/** pid 1 always runs in the sandbox, so a mod that checks the pid with `ps` finds it alive. */
const WAITING_PID = 1
const WAITING_SESSION_ID = '7c4f2a91-3e8b-4d06-b5a2-9f1e6c3d8b47'
const WAITING_PROJECT = 'api'
const STARTED_AGO_MS = 25 * 60_000
const WAITING_AGO_MS = 2 * 60_000

/**
 * Whether a session's steps type `/preview-waiting`. Only such a session starts with another
 * session waiting beside it: a mod that never types it previews as it always has.
 */
export function playsWaitingSession(steps: readonly InputStep[]): boolean {
  return steps.some((step) => step.type === 'text' && step.text.trim() === WAITING_STEP)
}

/**
 * Another Claude Code session waiting for an approval, in another project: the status file Claude
 * Code keeps for each running session at `<config dir>/sessions/<pid>.json` (fields as 2.1.310
 * writes them). Uploaded before launch, so the mod sees it from its first read.
 */
export function waitingSessionFile(
  scenario: Scenario,
  configDir: string,
  nowMs: number,
): { path: string; data: string } {
  const { version, workspace } = feedStdin(scenario)
  const waitingSince = nowMs - WAITING_AGO_MS
  return {
    path: `${configDir}/sessions/${WAITING_PID}.json`,
    data: JSON.stringify({
      pid: WAITING_PID,
      sessionId: WAITING_SESSION_ID,
      cwd: `${dirname(workspace.current_dir)}/${WAITING_PROJECT}`,
      entrypoint: 'claude-vscode',
      kind: 'interactive',
      name: 'Add rate limiting to the API',
      startedAt: nowMs - STARTED_AGO_MS,
      updatedAt: waitingSince,
      status: 'waiting',
      statusUpdatedAt: waitingSince,
      waitingFor: 'permission prompt',
      version,
    }),
  }
}

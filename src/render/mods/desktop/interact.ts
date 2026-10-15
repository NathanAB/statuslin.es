import { setTimeout as sleep } from 'node:timers/promises'
import type { CommandOutput } from '../mod-sandbox'
import { SANDBOX_WORK_DIR } from '../mod-sandbox'
import { feedScenario } from '../scenario-feed'
import { startWatch, type WatchOptions, watchButton } from './button-watch'
import type { RecordingDesktop } from './desktop-sandbox'
import { parseProbes, probeCommand, type QuietOptions, quietScreenCommand } from './imagemagick'
import { clickCommand, keyCommand } from './input'
import type { DialogButton } from './screen'
import { transcriptLinesCommand } from './session'

/** The bounded waits and presses a Desktop session is driven with. */

const PROBE_SHOT = `${SANDBOX_WORK_DIR}/probe.png`
const QUIET_SHOT = `${SANDBOX_WORK_DIR}/quiet.png`

/** A dialog button probe's grey mean above this is a white button on Desktop's dark theme. */
const BRIGHT = 0.6
const POLL_MS = 250
const CONDITION_POLL_MS = 200
/** On top of a command's own wait, for the request that starts it. */
export const COMMAND_SLACK_MS = 10_000
/** Enter can pick an entry from the slash-command menu instead of sending, so it may take two. */
const SEND_ATTEMPTS = 3
const SEND_WAIT_MS = 2_000
export const SEND_MAX_MS = SEND_ATTEMPTS * (SEND_WAIT_MS + COMMAND_SLACK_MS)

const ERROR_DETAIL_CHARS = 300

export type ButtonWait = WatchOptions & { maxMs: number }

export function expectOk(output: CommandOutput, what: string): CommandOutput {
  if (output.exitCode === 0) return output
  const detail = (output.stderr || output.stdout).trim().slice(0, ERROR_DETAIL_CHARS)
  throw new Error(`${what} failed (exit ${output.exitCode}): ${detail}`)
}

const pollLoop = (condition: string, maxMs: number) =>
  `for i in $(seq 1 ${Math.ceil(maxMs / CONDITION_POLL_MS)}); do (${condition}) >/dev/null 2>&1 && exit 0; sleep ${CONDITION_POLL_MS / 1000}; done; exit 1`

/** Polls `condition` inside the sandbox, so a wait is one round trip. */
export async function waitFor(
  sandbox: RecordingDesktop,
  what: string,
  condition: string,
  maxMs: number,
): Promise<void> {
  const { exitCode } = await sandbox.run(pollLoop(condition, maxMs), maxMs + COMMAND_SLACK_MS)
  if (exitCode !== 0) throw new Error(`timed out waiting for ${what}`)
}

async function isShown(sandbox: RecordingDesktop, button: DialogButton): Promise<boolean> {
  const { exitCode, stdout } = await sandbox.run(probeCommand(PROBE_SHOT, [button.probe]))
  if (exitCode !== 0) return false
  const [probe] = parseProbes(stdout, 1)
  return (probe?.mean ?? 0) > BRIGHT
}

/** Clicks `button` once it is steadily shown; true once it is gone after a click. */
export async function pressButton(
  sandbox: RecordingDesktop,
  button: DialogButton,
  { maxMs, ...options }: ButtonWait,
): Promise<boolean> {
  let watch = startWatch()
  let shown = false
  const startedAt = performance.now()
  while (performance.now() - startedAt < maxMs) {
    shown = await isShown(sandbox, button)
    const step = watchButton(watch, shown, performance.now(), options)
    watch = step.watch
    if (step.action === 'done') return true
    if (step.action === 'click') expectOk(await sandbox.run(clickCommand(button.click)), 'a click')
    await sleep(POLL_MS)
  }
  return watch.clicks > 0 && !shown
}

async function transcriptLines(sandbox: RecordingDesktop): Promise<number> {
  const { stdout } = expectOk(
    await sandbox.run(transcriptLinesCommand(feedScenario())),
    'counting the transcript',
  )
  const lines = stdout.trim()
  if (!/^\d+$/.test(lines)) throw new Error('unreadable transcript line count')
  return Number(lines)
}

/** Presses Enter until the transcript grows, which is when Desktop has sent the prompt. */
export async function sendPrompt(sandbox: RecordingDesktop): Promise<void> {
  const before = await transcriptLines(sandbox)
  const grown = `test "$(${transcriptLinesCommand(feedScenario())})" -gt ${before}`
  for (let attempt = 0; attempt < SEND_ATTEMPTS; attempt++) {
    expectOk(await sandbox.run(keyCommand('Return')), 'pressing Enter')
    const { exitCode } = await sandbox.run(
      pollLoop(grown, SEND_WAIT_MS),
      SEND_WAIT_MS + COMMAND_SLACK_MS,
    )
    if (exitCode === 0) return
  }
  throw new Error('Desktop did not send the prompt')
}

/** Waits until the screen stops changing, or takes it as it stands after `maxMs`. */
export async function settle(sandbox: RecordingDesktop, options: QuietOptions): Promise<void> {
  expectOk(
    await sandbox.run(quietScreenCommand(QUIET_SHOT, options), options.maxMs + COMMAND_SLACK_MS),
    'waiting for the screen to settle',
  )
}

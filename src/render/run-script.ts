import { CommandExitError, type CommandResult, type Sandbox, TimeoutError } from 'e2b'
import { CappedOutput } from './output-cap'
import { MAX_RENDER_STDOUT_BYTES } from './pipeline'

/** Exit code we report when the script is killed by the timeout. */
const TIMEOUT_EXIT_CODE = 124
/** Exit code we report when our own infra (RPC, sandbox) failed — NOT a script timeout. */
export const INFRA_ERROR_EXIT_CODE = 125
/** Exit code we report when the script printed past the output cap and we stopped it: a killed
 * process's status (128 + SIGKILL). */
export const OUTPUT_LIMIT_EXIT_CODE = 137

type RunOptions = { cwd: string; envs: Record<string, string>; timeoutMs: number; user: string }

/** Run the untrusted script's command and say how it ended: its own exit code, the timeout, our
 * infra failing, or printing past the output cap. */
export async function runScript(
  sandbox: Sandbox,
  cmd: string,
  options: RunOptions,
): Promise<CommandResult & { timedOut: boolean }> {
  // The SDK keeps every byte the script prints in memory until it ends, so stop reading once a
  // stream passes the cap. The pipeline keeps only MAX_RENDER_STDOUT_BYTES anyway, and the
  // runner's `finally` kill stops the script itself.
  const stopReading = new AbortController()
  const output = new CappedOutput(MAX_RENDER_STDOUT_BYTES, () => stopReading.abort())
  try {
    const result = await sandbox.commands.run(cmd, {
      ...options,
      signal: stopReading.signal,
      onStdout: output.onStdout,
      onStderr: output.onStderr,
    })
    return { ...result, timedOut: false }
  } catch (error: unknown) {
    // Checked first: the SDK reports our abort as a TimeoutError.
    if (output.exceeded) {
      const { stdout, stderr } = output
      return { exitCode: OUTPUT_LIMIT_EXIT_CODE, stdout, stderr, timedOut: false }
    }
    // A non-zero exit from the script is a legitimate result, not a failure of ours.
    if (error instanceof CommandExitError) {
      const { exitCode, stdout, stderr } = error
      return { exitCode, stdout, stderr, timedOut: false }
    }
    // The hard timeout fired: the script ran too long.
    if (error instanceof TimeoutError) {
      return { exitCode: TIMEOUT_EXIT_CODE, stdout: '', stderr: error.message, timedOut: true }
    }
    // Anything else (RPC failure, sandbox infra, etc.) is OUR failure, not a timeout.
    // Distinct sentinel exit code; leave timedOut false so we don't mislabel infra as slow scripts.
    return { exitCode: INFRA_ERROR_EXIT_CODE, stdout: '', stderr: String(error), timedOut: false }
  }
}

import { defaultBuildLogger, Template } from 'e2b'
import { CLAUDE_CODE_VERSION, renderTemplate } from '../scripts/build-e2b-template'

export const SPIKE_TEMPLATE_ALIAS = 'statuslines-mod-spike'
/** Bump the revision when the spike-only additions below change, so the next run rebuilds. */
const SPIKE_TEMPLATE_TAG = `cc-${CLAUDE_CODE_VERSION.replaceAll('.', '-')}-r1`
export const SPIKE_TEMPLATE = `${SPIKE_TEMPLATE_ALIAS}:${SPIKE_TEMPLATE_TAG}`
export const XTERM_HEADLESS_VERSION = '6.0.0'
export const REPLAY_DIR = '/opt/statuslines/replay'

/** The production render template plus Claude Code, with the headless terminal the spike replays through. */
function spikeTemplate() {
  return renderTemplate().runCmd(
    [
      `mkdir -p ${REPLAY_DIR}`,
      `cd ${REPLAY_DIR}`,
      'npm init -y >/dev/null',
      `npm install --no-fund --no-audit @xterm/headless@${XTERM_HEADLESS_VERSION}`,
      'chmod -R a+rX /opt/statuslines/replay',
    ].join(' && '),
    { user: 'root' },
  )
}

async function hasTag(apiKey: string): Promise<boolean> {
  try {
    const tags = await Template.getTags(SPIKE_TEMPLATE_ALIAS, { apiKey })
    return tags.some((t) => t.tag === SPIKE_TEMPLATE_TAG)
  } catch {
    return false
  }
}

export type TemplateBuildRecord = { template: string; buildId: string; buildMs: number }

/** Builds the spike template unless this tag already exists; returns the build record when it built. */
export async function ensureSpikeTemplate(
  apiKey: string,
  log: (line: string) => void,
  force = false,
): Promise<TemplateBuildRecord | null> {
  if (!force && (await hasTag(apiKey))) return null
  log(`building ${SPIKE_TEMPLATE}`)
  const started = performance.now()
  const build = await Template.build(spikeTemplate(), SPIKE_TEMPLATE, {
    apiKey,
    cpuCount: 2,
    memoryMB: 1024,
    onBuildLogs: defaultBuildLogger(),
  })
  return {
    template: SPIKE_TEMPLATE,
    buildId: build.buildId,
    buildMs: Math.round(performance.now() - started),
  }
}

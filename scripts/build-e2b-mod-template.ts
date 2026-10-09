import {
  E2B_MOD_TEMPLATE_BUILD_NAME,
  SANDBOX_ANTHROPIC_USAGE_SERVER_SRC,
  SANDBOX_CANNED_MODEL_DIR,
  SANDBOX_CANNED_MODEL_SERVER_DEST,
  SANDBOX_CLAUDE_CODE_BIN,
  SANDBOX_CLAUDE_CODE_PREFIX,
  SANDBOX_REPLAY_DIR,
} from '@/render/e2b-template'
import { buildSnapshot, renderTemplate } from './build-e2b-template'

/**
 * Builds the E2B template that renders mods: the status line template plus Claude Code, a headless
 * terminal for replaying recordings, and the canned model server runnable as `user`.
 *
 * Claude Code is installed from npm at an exact version at build time and never modified after
 * (the hosted-sandbox conditions in the mods epic, #37). On the base image's Node 20, npm warns
 * EBADENGINE (Claude Code declares node >=22); the spike (#38) measured the binary running anyway.
 *
 * Run:  bun run build:e2b-mod-template
 */

const CLAUDE_CODE_VERSION = '2.1.296'
const XTERM_HEADLESS_VERSION = '6.0.0'

export const modRenderTemplate = () =>
  renderTemplate()
    // A root-owned prefix under /opt, because E2B resets /usr/local to world-writable in every
    // sandbox, which would let mod code running as `user` rewrite the binary.
    .runCmd(
      [
        `npm install -g --prefix ${SANDBOX_CLAUDE_CODE_PREFIX} --no-fund --no-audit @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`,
        `chmod -R go-w ${SANDBOX_CLAUDE_CODE_PREFIX}`,
        `test -z "$(find ${SANDBOX_CLAUDE_CODE_PREFIX} -perm /022 -not -type l)"`,
        `test "$(${SANDBOX_CLAUDE_CODE_BIN} --version | cut -d' ' -f1)" = "${CLAUDE_CODE_VERSION}"`,
      ].join(' && '),
      { user: 'root' },
    )
    .runCmd(
      [
        `mkdir -p ${SANDBOX_REPLAY_DIR}`,
        `cd ${SANDBOX_REPLAY_DIR}`,
        'npm init -y >/dev/null',
        `npm install --no-fund --no-audit @xterm/headless@${XTERM_HEADLESS_VERSION}`,
        `chmod -R a+rX,go-w ${SANDBOX_REPLAY_DIR}`,
      ].join(' && '),
      { user: 'root' },
    )
    .makeDir(SANDBOX_CANNED_MODEL_DIR, { user: 'root', mode: 0o755 })
    .copy(SANDBOX_ANTHROPIC_USAGE_SERVER_SRC, SANDBOX_CANNED_MODEL_SERVER_DEST, {
      user: 'root',
      mode: 0o555,
    })

if (import.meta.main) {
  await buildSnapshot(modRenderTemplate(), E2B_MOD_TEMPLATE_BUILD_NAME, 'E2B_MOD_TEMPLATE_ID')
  process.exit(0)
}

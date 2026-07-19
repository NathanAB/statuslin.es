/**
 * E2B build alias used only to produce a reviewed immutable snapshot.
 *
 * The mutable alias is never used by the renderer. The build script snapshots a completed build,
 * then the reviewed snapshot identity below is committed with the application deployment.
 */
export const E2B_TEMPLATE_BUILD_NAME = 'statuslines-render-build'

/** Immutable E2B snapshot selected by every render. Updated only after a reviewed template build. */
export const E2B_TEMPLATE_ID = 'vyu32r2hpq6q92smes7j:default'

/**
 * Repo-relative path to the fixture copied into the render sandbox as the user's
 * `~/.claude/settings.json`. A real Claude Code install always has this file; the sandbox does
 * not, so statuslines that read config out of it (e.g. `jq --argjson cfg "$(cat ~/.claude/
 * settings.json)"`) would otherwise get nothing — and `jq --argjson` on an empty string exits
 * non-zero with no output, rendering the whole statusline empty. Seeding a comprehensive, valid
 * settings file makes those scripts find what they expect. Both the build script (which copies it
 * in) and its validity test reference this one constant.
 */
export const SANDBOX_CLAUDE_SETTINGS_SRC = 'src/render/sandbox-claude-settings.json'

/** Where the settings fixture lands in the sandbox image — the path statuslines read config from. */
export const SANDBOX_CLAUDE_SETTINGS_DEST = '/home/user/.claude/settings.json'

/** Repo asset and immutable root-owned paths for the sandbox-local Anthropic usage HTTPS server. */
export const SANDBOX_ANTHROPIC_USAGE_SERVER_SRC = 'src/render/sandbox-anthropic-usage-server.py'
export const SANDBOX_ANTHROPIC_USAGE_DIR = '/opt/statuslines/anthropic-usage'
export const SANDBOX_ANTHROPIC_USAGE_SERVER_DEST = `${SANDBOX_ANTHROPIC_USAGE_DIR}/server.py`
export const SANDBOX_ANTHROPIC_USAGE_CERT_PATH = `${SANDBOX_ANTHROPIC_USAGE_DIR}/server.crt`
export const SANDBOX_ANTHROPIC_USAGE_KEY_PATH = `${SANDBOX_ANTHROPIC_USAGE_DIR}/server.key`

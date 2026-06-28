/**
 * Name of the custom E2B sandbox template used to render untrusted statusline scripts.
 *
 * Single source of truth: the build script (`scripts/build-e2b-template.ts`) builds under this
 * name, and `E2BSandboxRunner` creates sandboxes from it. The template bakes in the tools real
 * statuslines need (jq, bc, gawk, column) plus strace, since the render sandbox has no network
 * and can't install anything at runtime.
 */
export const E2B_TEMPLATE_NAME = 'statuslines-render'

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

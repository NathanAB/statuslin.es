import { DESKTOP_GUIDE_PATH, NOT_SHOWING_GUIDE_PATH } from '@/lib/page-title'
import { SITE_NAME } from '@/lib/site'

/**
 * The troubleshooting page's checklist as a prompt for Claude Code, which runs it on the visitor's
 * machine: Claude Desktop first (its Code tab never runs statusLine), then the settings that apply,
 * the script, its output, the switches that narrow or turn off the status line, then folder trust.
 * It reports before it changes anything.
 */
export const STATUS_LINE_FIX_PROMPT = `My Claude Code status line isn't showing in the terminal. Find out why, following ${SITE_NAME}${NOT_SHOWING_GUIDE_PATH}. Tell me what you find before you change anything.

1. If this session runs in Claude Desktop's Code tab, say so and stop: the Code tab doesn't run statusLine. Point me to ${SITE_NAME}${DESKTOP_GUIDE_PATH}.
2. Read any managed settings my organization installed, ~/.claude/settings.json, then this project's .claude/settings.json and .claude/settings.local.json. Find the statusLine that applies. If there is none, say so and stop.
3. If its command runs a script, check the file exists and is executable. On Windows, check the path uses forward slashes.
4. Run the command yourself with this sample input. Show me what it prints to stdout and stderr, its exit code, and how long it took:
   echo '{"model":{"display_name":"Opus"},"workspace":{"current_dir":"'"$PWD"'"},"context_window":{"used_percentage":12}}' | <the command>
   It must print to stdout and exit 0. Name any tool it needs that isn't installed, such as jq.
5. Check whether disableAllHooks is true, whether my organization sets allowManagedHooksOnly, and whether this session started with --safe-mode. Each one stops a statusLine I set myself; disableAllHooks in managed settings turns the status line off entirely.
6. If everything passes, this folder may not be trusted yet. Tell me to restart Claude Code and accept the trust dialog.

Then tell me the cause in one sentence and the smallest fix. Make no changes until I say yes.`

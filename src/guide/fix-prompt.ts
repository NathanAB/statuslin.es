import { NOT_SHOWING_GUIDE_PATH } from '@/lib/page-title'
import { SITE_NAME } from '@/lib/site'

/**
 * The troubleshooting page's checklist as a prompt for Claude Code, which runs it on the visitor's
 * machine: the settings that apply, the script, its output, the hooks switches, then folder trust.
 * It reports before it changes anything.
 */
export const STATUS_LINE_FIX_PROMPT = `My Claude Code status line isn't showing in the terminal. Find out why, following ${SITE_NAME}${NOT_SHOWING_GUIDE_PATH}. Tell me what you find before you change anything.

1. Read ~/.claude/settings.json, then this project's .claude/settings.json and .claude/settings.local.json. Find the statusLine that applies. If there is none, say so and stop.
2. If its command runs a script, check the file exists and is executable. On Windows, check the path uses forward slashes.
3. Run the command yourself with this sample input. Show me what it prints to stdout and stderr, its exit code, and how long it took:
   echo '{"model":{"display_name":"Opus"},"workspace":{"current_dir":"'"$PWD"'"},"context_window":{"used_percentage":12}}' | <the command>
   It must print to stdout and exit 0. Name any tool it needs that isn't installed, such as jq.
4. Check whether disableAllHooks is true, or my organization sets allowManagedHooksOnly. Either one stops a statusLine I set myself.
5. If everything passes, this folder may not be trusted yet. Tell me to restart Claude Code and accept the trust dialog.

Then tell me the cause in one sentence and the smallest fix. Make no changes until I say yes.`

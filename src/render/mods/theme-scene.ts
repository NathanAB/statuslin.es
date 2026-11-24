// biome-ignore-all lint/style/useNamingConvention: tool inputs mirror Claude Code's tool schemas.
import type { TextStep } from '@/mods/curation'
import type { Scenario } from '../types'
import { SAMPLE_PROJECT_FILES } from './sample-project'
import {
  type CannedReply,
  cannedReply,
  feedStdin,
  RUN_SUM_TESTS,
  SUM_BUG,
  SUM_BUG_WORKSPACE_FILES,
  SUM_FIX,
  SUM_SOURCE,
} from './scenario-feed'
import { TERMINAL, type TerminalSetup } from './terminal'

// The one session every terminal theme records in, the same for every theme so their cards compare
// side by side. Its turn draws a theme's text, diff and permission colors: a reply, an edit that
// adds and removes a line, and a prompt asking to run a command. Claude Code plays it against the
// canned model (ADR 0002) and stops at that prompt, so nothing runs.

/** 34 rows fit the typed prompt, both replies, the read, the diff and the whole permission prompt. */
export const THEME_SCENE_TERMINAL: TerminalSetup = {
  cols: TERMINAL.cols,
  rows: 34,
  fullscreen: false,
}

export const THEME_SCENE_PROMPT: TextStep = { type: 'text', text: 'fix the failing sum test' }

/**
 * The permission prompt the scene stops on. The bullet of the command it asks about blinks, so the
 * screen never goes quiet: the recording ends the settle time after this shows, rather than at the
 * step's time limit.
 */
export const THEME_SCENE_ENDS_ON = 'Do you want to proceed?'

export const THEME_SCENE_WORKSPACE_FILES = [...SAMPLE_PROJECT_FILES, ...SUM_BUG_WORKSPACE_FILES]

/** Claude Code's Edit refuses a file the session has not read, so the turn reads it first. */
export function themeSceneReply(scenario: Scenario): CannedReply {
  const source = `${feedStdin(scenario).workspace.current_dir}/${SUM_SOURCE}`
  return {
    ...cannedReply(scenario),
    steps: [
      {
        text: "`sum` subtracts instead of adding. I'll fix it.",
        tool: { name: 'Read', input: { file_path: source } },
      },
      {
        text: '',
        tool: {
          name: 'Edit',
          input: { file_path: source, old_string: SUM_BUG, new_string: SUM_FIX },
        },
      },
      { text: "Now I'll run the tests.", tool: { name: 'Bash', input: { ...RUN_SUM_TESTS } } },
    ],
  }
}

/**
 * acceptEdits applies the edit without asking, so its diff draws, and still asks before Bash. Auto
 * mode, Claude Code's default, would send the Bash call to a classifier that queries the canned
 * model instead of asking, so it is turned off. Every hook is off too: a theme is only colors, and a
 * plugin's own hooks could otherwise draw on its theme's preview or rewrite the command it asks to
 * run, in a recording the operator never reviewed.
 */
export function themeSceneSettings(theme: string | null) {
  return {
    permissions: { defaultMode: 'acceptEdits', disableAutoMode: 'disable' },
    disableAllHooks: true,
    ...(theme === null ? {} : { theme }),
  }
}

/**
 * Settings that name a mode other than auto make Claude Code offer at launch to make auto mode the
 * default, and that dialog eats the typed prompt. Mod sessions leave the key unset, so their
 * recordings stay as they were.
 */
export const THEME_SCENE_CLAUDE_JSON = { hasSeenAutoDefaultNudge: true }

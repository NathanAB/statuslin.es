import type { InputStep } from '@/mods/curation'
import type { Scenario } from '../types'
import type { SandboxFile } from './mod-sandbox'
import type { RecordRequest } from './recorder'
import { playsBusySession } from './scenario-feed'
import { SCRIPTED_PROMPT, sessionFiles, terminalSettings, themeSessionFiles } from './session'
import { TERMINAL } from './terminal'
import { THEME_SCENE_PROMPT, THEME_SCENE_TERMINAL } from './theme-scene'
import { playsWaitingSession } from './waiting-session'

/** The terminal a request records and replays in. */
export function sceneTerminal(request: RecordRequest): { cols: number; rows: number } {
  const { cols, rows } = request.scene === 'mod' ? request.terminal : THEME_SCENE_TERMINAL
  return { cols, rows: rows ?? TERMINAL.rows }
}

/** What a request's session uploads before setup, and what is typed into it. */
export function sceneSession(
  request: RecordRequest,
  scenario: Scenario,
  claudeCodeVersion: string,
): { files: SandboxFile[]; typed: readonly InputStep[] } {
  const seed = { target: request.mod?.pluginName ?? null, nowMs: Date.now(), claudeCodeVersion }
  switch (request.scene) {
    case 'mod': {
      const { inputSteps, terminal } = request
      const modSeed = {
        ...seed,
        busy: playsBusySession(inputSteps),
        waiting: playsWaitingSession(inputSteps),
      }
      return {
        files: sessionFiles(scenario, modSeed, terminalSettings(terminal)),
        typed: [SCRIPTED_PROMPT, ...inputSteps],
      }
    }
    case 'theme':
      return {
        files: themeSessionFiles(scenario, seed, request.theme),
        typed: [THEME_SCENE_PROMPT],
      }
    default: {
      const _exhaustive: never = request
      throw new Error(`unknown scene ${JSON.stringify(_exhaustive)}`)
    }
  }
}

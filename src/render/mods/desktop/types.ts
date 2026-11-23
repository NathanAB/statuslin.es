import type { InputStep } from '@/mods/curation'
import type { ThemeWindow } from '@/themes/theme'
import type { Interpreter } from '../../types'
import type { ModUnderRender } from '../recorder'

/** A status line script, as a config version stores it. */
export interface StatusLineScript {
  source: string
  interpreter: Interpreter
  /** The hosts the admin approved for it; none keeps the session offline. */
  networkHosts?: readonly string[]
  readsClaudeToken?: boolean
}

export interface DesktopRecordRequest {
  mod: ModUnderRender
  inputSteps: readonly InputStep[]
  /** The status line the session's settings run, in place of the committed sample. */
  statusLine?: StatusLineScript
  /** A mod that sets a theme: its preview is the whole window, not what it draws in the chat. */
  wholeWindow?: boolean
}

/** One Desktop theme of a mod, recorded in its own window after the steps that switch to it. */
export interface DesktopThemeRequest {
  mod: ModUnderRender
  window: ThemeWindow
  /** Sent in turn after the scripted reply; none when the mod sets the theme on its own. */
  switchSteps: readonly string[]
}

interface DesktopVersions {
  desktopVersion: string
  /** The Claude Code engine Desktop bundles, which is what Desktop users run. */
  engineVersion: string
}

/** A PNG of untrusted pixels, re-encoded so it holds nothing else. */
export interface DesktopImage {
  png: Uint8Array
  /** CSS pixels: the PNG is recorded at a higher device scale. */
  width: number
  height: number
}

/** A framed screenshot of the mod in Claude Desktop, for its page, and a smaller one for its card. */
export interface DesktopShot extends DesktopVersions, DesktopImage {
  kind: 'shot'
  /**
   * The band the mod draws above the prompt box, else what it draws in the pane it opens, else the
   * top of the shot.
   */
  card: DesktopImage
}

/** The session looked the same as it does with no mod. */
export interface DesktopNothing extends DesktopVersions {
  kind: 'nothing'
}

export type DesktopRecording = DesktopShot | DesktopNothing

/** A theme's whole Desktop window, for its plugin's page, and the same window smaller for its card. */
export interface DesktopThemeShot extends DesktopVersions, DesktopImage {
  card: DesktopImage
  /** A hash of the window outside the session's turns: two themes with one are the same look. */
  look: string
}

/** Records mods and their themes in Claude Desktop. Throws when a recording fails. */
export interface DesktopRecorder {
  record(request: DesktopRecordRequest): Promise<DesktopRecording>
  /** Throws a DesktopThemeRefused, saying why, when the shot can't stand for the theme. */
  recordTheme(request: DesktopThemeRequest): Promise<DesktopThemeShot>
}

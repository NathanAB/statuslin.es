import type { InputStep } from '@/mods/curation'
import type { DrawLocation } from '@/mods/footprint'
import type { ModUnderRender } from '../recorder'

export interface DesktopRecordRequest {
  mod: ModUnderRender
  inputSteps: readonly InputStep[]
  /** Where the mod's footprint says it draws; decides how the shot is framed. */
  draws: readonly DrawLocation[]
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
  /** The band the mod draws above the prompt box, or the top of the shot when it draws none. */
  card: DesktopImage
}

/** The session looked the same as it does with no mod. */
export interface DesktopNothing extends DesktopVersions {
  kind: 'nothing'
}

export type DesktopRecording = DesktopShot | DesktopNothing

/** Records one mod in Claude Desktop. Throws when the recording fails. */
export interface DesktopRecorder {
  record(request: DesktopRecordRequest): Promise<DesktopRecording>
}

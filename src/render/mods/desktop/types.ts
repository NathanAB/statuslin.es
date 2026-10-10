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

/** A framed screenshot of the mod in Claude Desktop. The pixels are untrusted. */
export interface DesktopShot extends DesktopVersions {
  kind: 'shot'
  png: Uint8Array
  /** CSS pixels: the PNG is recorded at a higher device scale. */
  width: number
  height: number
  /** Which end of the shot a fixed-height card keeps. */
  cardAnchor: 'top' | 'bottom'
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

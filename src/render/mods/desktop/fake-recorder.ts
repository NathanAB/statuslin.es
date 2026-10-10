import type { DesktopRecorder, DesktopRecording, DesktopRecordRequest, DesktopShot } from './types'

const FAKE_VERSIONS = { desktopVersion: '0.0.0-fake', engineVersion: '0.0.0-fake' }

type FakeShot = Pick<DesktopShot, 'png' | 'width' | 'height' | 'cardAnchor'>

/** Deterministic in-memory Desktop recorder for tests and key-less runs. */
export class FakeDesktopRecorder implements DesktopRecorder {
  readonly requests: DesktopRecordRequest[] = []

  /** Shots by plugin name. A mod without one draws nothing. */
  constructor(private readonly shots: Record<string, FakeShot> = {}) {}

  async record(request: DesktopRecordRequest): Promise<DesktopRecording> {
    this.requests.push(request)
    const shot = this.shots[request.mod.pluginName]
    return shot
      ? { kind: 'shot', ...shot, ...FAKE_VERSIONS }
      : { kind: 'nothing', ...FAKE_VERSIONS }
  }
}

import type { DesktopVersions } from './desktop-sandbox'
import type { DesktopRecorder, DesktopRecording, DesktopRecordRequest, DesktopShot } from './types'

const FAKE_VERSIONS = { desktopVersion: '0.0.0-fake', engineVersion: '0.0.0-fake' }

type FakeShot = Pick<DesktopShot, 'png' | 'width' | 'height' | 'card'>

/** Deterministic in-memory Desktop recorder for tests and key-less runs. */
export class FakeDesktopRecorder implements DesktopRecorder {
  readonly requests: DesktopRecordRequest[] = []

  /**
   * Shots by plugin name, or by status line source for a request that carries a status line.
   * A recording without one draws nothing. Every recording, and the baseline, runs `versions`.
   */
  constructor(
    private readonly shots: Record<string, FakeShot> = {},
    private readonly versions: DesktopVersions = FAKE_VERSIONS,
  ) {}

  async baseline(): Promise<DesktopVersions> {
    return this.versions
  }

  async record(request: DesktopRecordRequest): Promise<DesktopRecording> {
    this.requests.push(request)
    const shot = this.shots[request.statusLine?.source ?? request.mod.pluginName]
    return shot
      ? { kind: 'shot', ...shot, ...this.versions }
      : { kind: 'nothing', ...this.versions }
  }
}

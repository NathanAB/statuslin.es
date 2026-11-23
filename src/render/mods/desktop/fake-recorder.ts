import type { DesktopVersions } from './desktop-sandbox'
import type {
  DesktopRecorder,
  DesktopRecording,
  DesktopRecordRequest,
  DesktopShot,
  DesktopThemeRequest,
  DesktopThemeShot,
} from './types'

const FAKE_VERSIONS = { desktopVersion: '0.0.0-fake', engineVersion: '0.0.0-fake' }

type FakeShot = Pick<DesktopShot, 'png' | 'width' | 'height' | 'card'>

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** What every theme recording returns: a whole window and its card, told apart by their last byte. */
export const FAKE_THEME_SHOT: FakeShot = {
  png: new Uint8Array([...PNG_SIGNATURE, 1]),
  width: 1100,
  height: 900,
  card: { png: new Uint8Array([...PNG_SIGNATURE, 2]), width: 550, height: 450 },
}

/** Deterministic in-memory Desktop recorder for tests and key-less runs. */
export class FakeDesktopRecorder implements DesktopRecorder {
  readonly requests: DesktopRecordRequest[] = []
  readonly themeRequests: DesktopThemeRequest[] = []

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

  async recordTheme(request: DesktopThemeRequest): Promise<DesktopThemeShot> {
    this.themeRequests.push(request)
    return { ...FAKE_THEME_SHOT, ...this.versions }
  }
}

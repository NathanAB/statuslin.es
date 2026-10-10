import type { ModRecorder, Recording, RecordRequest } from './recorder'

const FAKE_CLAUDE_CODE_VERSION = '0.0.0-fake'

type FakeScreens = {
  baseline: readonly string[]
  /** By plugin name. A mod without a screen records as the baseline, so it crops to nothing. */
  mods?: Record<string, readonly string[]>
}

/** Deterministic in-memory recorder for tests and key-less runs. */
export class FakeModRecorder implements ModRecorder {
  readonly requests: RecordRequest[] = []

  constructor(private readonly screens: FakeScreens) {}

  async record(request: RecordRequest): Promise<Recording> {
    this.requests.push(request)
    const modScreen = request.mod && this.screens.mods?.[request.mod.pluginName]
    return {
      rows: [...(modScreen ?? this.screens.baseline)],
      claudeCodeVersion: FAKE_CLAUDE_CODE_VERSION,
    }
  }
}

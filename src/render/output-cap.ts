/**
 * Collects a running command's stdout and stderr as they stream in, and calls `onExceeded` once
 * either one passes `maxBytes`. After that it keeps nothing more, so each holds at most
 * `maxBytes` plus the chunk that crossed it.
 */
export class CappedOutput {
  stdout = ''
  stderr = ''
  exceeded = false
  private readonly bytes = { stdout: 0, stderr: 0 }

  constructor(
    private readonly maxBytes: number,
    private readonly onExceeded: () => void,
  ) {}

  readonly onStdout = (chunk: string): void => this.append('stdout', chunk)
  readonly onStderr = (chunk: string): void => this.append('stderr', chunk)

  private append(stream: 'stdout' | 'stderr', chunk: string): void {
    if (this.exceeded) return
    this[stream] += chunk
    this.bytes[stream] += Buffer.byteLength(chunk)
    if (this.bytes[stream] <= this.maxBytes) return
    this.exceeded = true
    this.onExceeded()
  }
}

/** Read at most `maxBytes` from a stream, then cancel it. */
export async function readCapped(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      bytes += value.byteLength
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks).toString('utf8', 0, Math.min(bytes, maxBytes))
}

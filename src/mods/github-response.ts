import { HttpError } from '@/lib/http'

/** GitHub's rate limit as a 503 a person can act on; any other failure as a plain error. */
export function failure(res: Response, url: string): Error {
  const limited =
    res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')
  return limited
    ? new HttpError(503, 'GitHub’s rate limit is reached; try again later.')
    : new Error(`GitHub ${res.status} for ${url}`)
}

/** The first `maxBytes` of the body (or all of it), cancelling the rest unread. */
export async function readUpTo(
  res: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = res.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false
  for (let chunk = await reader?.read(); chunk && !chunk.done; chunk = await reader?.read()) {
    if (size + chunk.value.byteLength > maxBytes) {
      chunks.push(chunk.value.subarray(0, maxBytes - size))
      size = maxBytes
      truncated = true
      await reader?.cancel()
      break
    }
    size += chunk.value.byteLength
    chunks.push(chunk.value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { bytes, truncated }
}

export async function readAtMost(
  res: Response,
  maxBytes: number,
  url: string,
): Promise<Uint8Array> {
  const tooLarge = () => new Error(`${url} is larger than ${maxBytes} bytes`)
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw tooLarge()
  const { bytes, truncated } = await readUpTo(res, maxBytes)
  if (truncated) throw tooLarge()
  return bytes
}

/** Whether a stream of pty bytes has shown `text` yet, even when two chunks split it. */
export function textWatch(text: string): (bytes: Uint8Array) => boolean {
  const decoder = new TextDecoder()
  let tail = ''
  let seen = false
  return (bytes) => {
    if (seen) return true
    tail = tail.slice(tail.length - (text.length - 1)) + decoder.decode(bytes, { stream: true })
    seen = tail.includes(text)
    return seen
  }
}

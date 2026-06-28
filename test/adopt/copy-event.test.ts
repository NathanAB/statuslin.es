import { describe, expect, it } from 'vitest'
import { type CopyKind, copyEvent } from '@/adopt/copy-event'

describe('copyEvent', () => {
  it('maps a prompt copy to the statusline_prompt_copied event', () => {
    const evt = copyEvent({ kind: 'prompt', configId: 'cfg-1', distinctId: 'did-1' })
    expect(evt?.event).toBe('statusline_prompt_copied')
  })

  it('maps a script copy to the statusline_script_copied event', () => {
    const evt = copyEvent({ kind: 'script', configId: 'cfg-1', distinctId: 'did-1' })
    expect(evt?.event).toBe('statusline_script_copied')
  })

  it('attributes the event to the supplied distinct id and config', () => {
    const evt = copyEvent({ kind: 'prompt', configId: 'cfg-9', distinctId: 'did-9' })
    expect(evt?.distinctId).toBe('did-9')
    expect(evt?.properties.configId).toBe('cfg-9')
  })

  it('attaches the session id as $session_id so the server event ties to the browser session', () => {
    const evt = copyEvent({
      kind: 'prompt',
      configId: 'cfg-1',
      distinctId: 'did-1',
      sessionId: 'sid-1',
    })
    expect(evt?.properties.$session_id).toBe('sid-1')
  })

  it('omits $session_id when no session id is available', () => {
    const evt = copyEvent({ kind: 'prompt', configId: 'cfg-1', distinctId: 'did-1' })
    expect(evt?.properties).not.toHaveProperty('$session_id')
  })

  it('returns null when there is no distinct id to attribute the copy to', () => {
    expect(copyEvent({ kind: 'prompt', configId: 'cfg-1', distinctId: null })).toBeNull()
    expect(copyEvent({ kind: 'prompt', configId: 'cfg-1', distinctId: undefined })).toBeNull()
    expect(copyEvent({ kind: 'prompt', configId: 'cfg-1', distinctId: '' })).toBeNull()
  })

  it('returns null for an unknown kind instead of resolving through the prototype chain', () => {
    // The server fn input is a passthrough, so kind is attacker-controlled at runtime. A
    // non-union value (e.g. '__proto__' or anything else) must NOT produce a malformed event.
    expect(
      copyEvent({ kind: '__proto__' as CopyKind, configId: 'cfg-1', distinctId: 'did-1' }),
    ).toBeNull()
    expect(
      copyEvent({ kind: 'toString' as CopyKind, configId: 'cfg-1', distinctId: 'did-1' }),
    ).toBeNull()
    expect(
      copyEvent({ kind: 'nope' as CopyKind, configId: 'cfg-1', distinctId: 'did-1' }),
    ).toBeNull()
  })
})

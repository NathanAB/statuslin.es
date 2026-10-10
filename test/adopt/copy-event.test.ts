import { describe, expect, it } from 'vitest'
import { type CopyKind, copyEvent } from '@/adopt/copy-event'

// The fields every copy carries that a given test doesn't care about: an unpublished/unknown
// config and no signed-in user.
const anonymous = { config: null, signedInUserId: null }

describe('copyEvent', () => {
  it('maps a prompt copy to the statusline_prompt_copied event', () => {
    const evt = copyEvent({ ...anonymous, kind: 'prompt', configId: 'cfg-1', distinctId: 'did-1' })
    expect(evt?.event).toBe('statusline_prompt_copied')
  })

  it('maps a script copy to the statusline_script_copied event', () => {
    const evt = copyEvent({ ...anonymous, kind: 'script', configId: 'cfg-1', distinctId: 'did-1' })
    expect(evt?.event).toBe('statusline_script_copied')
  })

  it('attributes the event to the supplied distinct id and config', () => {
    const evt = copyEvent({ ...anonymous, kind: 'prompt', configId: 'cfg-9', distinctId: 'did-9' })
    expect(evt?.distinctId).toBe('did-9')
    expect(evt?.properties.configId).toBe('cfg-9')
  })

  it('carries the copied config slug and live version id so it joins the review events', () => {
    const evt = copyEvent({
      ...anonymous,
      kind: 'prompt',
      configId: 'cfg-1',
      config: { slug: 'cool-line', versionId: 'ver-1' },
      distinctId: 'did-1',
    })
    expect(evt?.properties).toMatchObject({
      configId: 'cfg-1',
      slug: 'cool-line',
      versionId: 'ver-1',
    })
  })

  it('omits slug and version id when the config is not published', () => {
    const evt = copyEvent({ ...anonymous, kind: 'prompt', configId: 'cfg-1', distinctId: 'did-1' })
    expect(evt?.properties).not.toHaveProperty('slug')
    expect(evt?.properties).not.toHaveProperty('versionId')
  })

  it('skips person processing when the distinct id is not a signed-in user', () => {
    const evt = copyEvent({ ...anonymous, kind: 'prompt', configId: 'cfg-1', distinctId: 'anon-1' })
    expect(evt?.properties.$process_person_profile).toBe(false)
  })

  it('skips person processing when the distinct id is not the signed-in user (an ip hash)', () => {
    const evt = copyEvent({
      ...anonymous,
      kind: 'prompt',
      configId: 'cfg-1',
      distinctId: 'ip-hash',
      signedInUserId: 'u1',
    })
    expect(evt?.properties.$process_person_profile).toBe(false)
  })

  it('keeps person processing when the distinct id is the signed-in user', () => {
    const evt = copyEvent({
      ...anonymous,
      kind: 'prompt',
      configId: 'cfg-1',
      distinctId: 'u1',
      signedInUserId: 'u1',
    })
    expect(evt?.properties).not.toHaveProperty('$process_person_profile')
  })

  it('attaches the session id as $session_id so the server event ties to the browser session', () => {
    const evt = copyEvent({
      ...anonymous,
      kind: 'prompt',
      configId: 'cfg-1',
      distinctId: 'did-1',
      sessionId: 'sid-1',
    })
    expect(evt?.properties.$session_id).toBe('sid-1')
  })

  it('omits $session_id when no session id is available', () => {
    const evt = copyEvent({ ...anonymous, kind: 'prompt', configId: 'cfg-1', distinctId: 'did-1' })
    expect(evt?.properties).not.toHaveProperty('$session_id')
  })

  it('returns null when there is no distinct id to attribute the copy to', () => {
    expect(
      copyEvent({ ...anonymous, kind: 'prompt', configId: 'cfg-1', distinctId: null }),
    ).toBeNull()
    expect(
      copyEvent({ ...anonymous, kind: 'prompt', configId: 'cfg-1', distinctId: undefined }),
    ).toBeNull()
    expect(
      copyEvent({ ...anonymous, kind: 'prompt', configId: 'cfg-1', distinctId: '' }),
    ).toBeNull()
  })

  it('returns null for an unknown kind instead of resolving through the prototype chain', () => {
    // The server fn input is a passthrough, so kind is attacker-controlled at runtime. A
    // non-union value (e.g. '__proto__' or anything else) must NOT produce a malformed event.
    for (const kind of ['__proto__', 'toString', 'nope']) {
      expect(
        copyEvent({ ...anonymous, kind: kind as CopyKind, configId: 'cfg-1', distinctId: 'did-1' }),
      ).toBeNull()
    }
  })
})

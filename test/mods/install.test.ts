import { describe, expect, it } from 'vitest'
import { installCommands, modCopyEvent } from '@/mods/install'

describe('installCommands', () => {
  it('builds the in-session and shell commands against the given site origin', () => {
    expect(installCommands('https://staging.example.test', 'filetree')).toEqual([
      {
        kind: 'session',
        label: 'In a Claude Code session',
        minVersion: '2.1.275',
        command:
          '/plugin install filetree --marketplace https://staging.example.test/marketplace.json',
      },
      {
        kind: 'shell',
        label: 'From a shell',
        minVersion: '2.1.292',
        command:
          'claude plugin install filetree --marketplace https://staging.example.test/marketplace.json',
      },
    ])
  })
})

describe('modCopyEvent', () => {
  it('names the mod and the command copied, tied to the signed-in browser session', () => {
    expect(
      modCopyEvent({
        kind: 'shell',
        modId: 'mod-1',
        distinctId: 'u1',
        signedInUserId: 'u1',
        sessionId: 'sid',
      }),
    ).toEqual({
      distinctId: 'u1',
      event: 'mod_install_command_copied',
      properties: { modId: 'mod-1', command: 'shell', $session_id: 'sid' },
    })
  })

  it('skips person processing when the distinct id is not the signed-in user', () => {
    for (const signedInUserId of [null, 'u1']) {
      const evt = modCopyEvent({
        kind: 'shell',
        modId: 'mod-1',
        distinctId: 'anon',
        signedInUserId,
      })
      expect(evt?.properties.$process_person_profile).toBe(false)
    }
  })

  it('returns null with no one to attribute the copy to', () => {
    expect(
      modCopyEvent({ kind: 'session', modId: 'mod-1', distinctId: null, signedInUserId: null }),
    ).toBeNull()
  })

  it('refuses a command kind it does not know', () => {
    expect(
      modCopyEvent({
        kind: '__proto__' as 'shell',
        modId: 'mod-1',
        distinctId: 'did',
        signedInUserId: null,
      }),
    ).toBeNull()
  })
})

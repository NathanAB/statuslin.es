import { describe, expect, it } from 'vitest'
import { modCopyEvent, modInstallPrompt } from '@/mods/install'

describe('modInstallPrompt', () => {
  it('asks Claude to add the marketplace and install with the Claude Code it runs on, then to start a new session', () => {
    expect(modInstallPrompt('https://staging.example.test', 'filetree')).toBe(
      [
        'Install the filetree mod from staging.example.test. Run this in your shell, then tell me to start a new session to load it:',
        `"\${CLAUDE_CODE_EXECPATH:-claude}" plugin marketplace add https://staging.example.test/marketplace.json && "\${CLAUDE_CODE_EXECPATH:-claude}" plugin install filetree@statuslines`,
      ].join('\n'),
    )
  })
})

describe('modCopyEvent', () => {
  it('names the mod and the command copied, tied to the signed-in browser session', () => {
    expect(
      modCopyEvent({
        kind: 'prompt',
        modId: 'mod-1',
        distinctId: 'u1',
        signedInUserId: 'u1',
        sessionId: 'sid',
      }),
    ).toEqual({
      distinctId: 'u1',
      event: 'mod_install_command_copied',
      properties: { modId: 'mod-1', command: 'prompt', $session_id: 'sid' },
    })
  })

  it('skips person processing when the distinct id is not the signed-in user', () => {
    for (const signedInUserId of [null, 'u1']) {
      const evt = modCopyEvent({
        kind: 'prompt',
        modId: 'mod-1',
        distinctId: 'anon',
        signedInUserId,
      })
      expect(evt?.properties.$process_person_profile).toBe(false)
    }
  })

  it.each([
    'session',
    'shell',
    'desktop',
    'terminal',
  ])('refuses the retired "%s" command kind', (kind) => {
    expect(
      modCopyEvent({
        kind: kind as 'prompt',
        modId: 'mod-1',
        distinctId: 'did',
        signedInUserId: null,
      }),
    ).toBeNull()
  })

  it('returns null with no one to attribute the copy to', () => {
    expect(
      modCopyEvent({ kind: 'prompt', modId: 'mod-1', distinctId: null, signedInUserId: null }),
    ).toBeNull()
  })

  it('refuses a command kind it does not know', () => {
    expect(
      modCopyEvent({
        kind: '__proto__' as 'prompt',
        modId: 'mod-1',
        distinctId: 'did',
        signedInUserId: null,
      }),
    ).toBeNull()
  })
})

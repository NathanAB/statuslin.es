import { describe, expect, it } from 'vitest'
import { modInstallFacts, modReachSentence } from '@/mods/mod-install-facts'

const SHA = 'a5c8eadbeef0000000000000000000000000000a'

const mod = (events: string[], calls: string[], reviewedAt: string | null = '2026-10-12') => ({
  footprint: { events, calls },
  commitSha: SHA,
  reviewedAt,
  generatedContent: null,
})

// What a mod can do, in plain words beside its install button, from the validator's footprint:
// the page copy is optional, so this must never depend on it.
describe('modInstallFacts', () => {
  it('says this commit was reviewed, then what the hooks can do, risks in the caution tint', () => {
    const facts = modInstallFacts(mod(['tool.call', 'prompt.submit'], ['$.fs.read']))

    expect(facts.map((f) => [f.text, f.caution ?? false])).toEqual([
      ['Reviewed at commit `a5c8ead`, Oct 12, 2026', false],
      ['Sees each prompt you send and can change or drop it', true],
      ['Sees each tool call before it runs and can block or change it', true],
      ['Reads files', false],
    ])
  })

  // An empty footprint means nothing was recorded, not that the mod does nothing.
  it('says nothing is recorded yet when the footprint is empty, never that it does nothing', () => {
    const facts = modInstallFacts(mod([], [], null))

    expect(facts.map((f) => [f.text, f.caution ?? false])).toEqual([
      ['Reviewed at commit `a5c8ead`', false],
      ["What it can reach isn't recorded yet", true],
    ])
  })
})

// The home hero says one sentence about the picked mod, after its name.
describe('modReachSentence', () => {
  it('names what is worth weighing, as a caution', () => {
    expect(modReachSentence({ events: ['$.http.fetch', '$.fs.write'], calls: [] })).toMatchObject({
      text: 'writes files and connects to the internet.',
      caution: true,
    })
  })

  it('says when nothing about it was recorded, and says nothing when it names no power', () => {
    expect(modReachSentence({ events: [], calls: [] })).toMatchObject({
      text: 'has no record yet of what it can reach.',
      caution: true,
    })
    expect(modReachSentence({ events: ['ui.render{component=AbovePrompt}'], calls: [] })).toBeNull()
  })
})

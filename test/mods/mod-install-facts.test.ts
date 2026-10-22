import { describe, expect, it } from 'vitest'
import { modInstallFacts, modReachSentence } from '@/mods/mod-install-facts'
import type { InstallFact } from '@/ui/install-facts'

const SHA = 'a5c8eadbeef0000000000000000000000000000a'

const mod = (
  events: string[],
  calls: string[],
  reviewedAt: string | null = '2026-10-12',
  goodToKnow: string[] | null = null,
) => ({
  footprint: { events, calls },
  commitSha: SHA,
  reviewedAt,
  generatedContent: goodToKnow ? { goodToKnow } : null,
})

const lines = (facts: InstallFact[] = []) => facts.map((f) => [f.text, f.caution ?? false])

// What a mod can do, in plain words beside its install button, from the validator's footprint:
// the page copy is optional, so this must never depend on it.
describe('modInstallFacts', () => {
  // Sixteen lines at once was too much: the risks stay in sight, and what can wait folds under a
  // count the visitor opens.
  it('shows the review line and the risks, and folds the plain powers and the notes', () => {
    const { facts, more, notes } = modInstallFacts(
      mod(['tool.call', 'prompt.submit', 'command.run{command=go}'], ['$.fs.read'], '2026-10-12', [
        'Needs `jq` on your PATH',
        'Works offline',
      ]),
    )

    expect(lines(facts)).toEqual([
      ['Reviewed at commit `a5c8ead`, Oct 12, 2026', false],
      ['Sees each prompt you send and can change or drop it', true],
      ['Sees each tool call before it runs and can block or change it', true],
    ])
    expect(more?.summary).toBe('2 more things it can do')
    expect(lines(more?.facts)).toEqual([
      ['Reads files', false],
      ['Adds the /go command', false],
    ])
    expect(notes?.summary).toBe('Good to know (2)')
    expect(lines(notes?.facts)).toEqual([
      ['Needs `jq` on your PATH', false],
      ['Works offline', false],
    ])
  })

  it('counts one folded power as one thing, and folds nothing when there is nothing to fold', () => {
    expect(modInstallFacts(mod(['tool.call'], ['$.fs.read'])).more?.summary).toBe(
      '1 more thing it can do',
    )
    expect(modInstallFacts(mod(['tool.call'], []))).toMatchObject({ more: null, notes: null })
  })

  // With no power in sight above it, the fold isn't "more" of anything.
  it('folds every power of a mod with no risks, under the review line alone', () => {
    const { facts, more } = modInstallFacts(mod(['command.run{command=go}'], ['$.fs.read']))

    expect(lines(facts)).toEqual([['Reviewed at commit `a5c8ead`, Oct 12, 2026', false]])
    expect(more?.summary).toBe('2 things it can do')
  })

  // A power the page can't name yet must still show, never hide behind the commit line or a fold.
  it("names the entries it can't describe yet, as a caution, always in sight", () => {
    const { facts, more } = modInstallFacts(
      mod(['tool.call'], ['$.warp.drive', '$.warp.jump', '$.fs.read', '$.warp.fold'], null),
    )

    expect(lines(facts)).toEqual([
      ['Reviewed at commit `a5c8ead`', false],
      ['Sees each tool call before it runs and can block or change it', true],
      [
        "Also uses `$.warp.drive`, `$.warp.jump`, and `$.warp.fold`, which this page doesn't describe yet",
        true,
      ],
    ])
    expect(lines(more?.facts)).toEqual([['Reads files', false]])
    expect(modInstallFacts(mod([], ['$.warp.drive'], null)).facts[1]).toMatchObject({
      text: "Uses `$.warp.drive`, which this page doesn't describe yet",
      caution: true,
    })
  })

  // An empty footprint means nothing was recorded, not that the mod does nothing.
  it('says nothing is recorded yet when the footprint is empty, never that it does nothing', () => {
    const { facts, more } = modInstallFacts(mod([], [], null))

    expect(lines(facts)).toEqual([
      ['Reviewed at commit `a5c8ead`', false],
      ["What it can reach isn't recorded yet", true],
    ])
    expect(more).toBeNull()
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

  // Two long powers joined with "and" ran on: "sees each change to /config and can block or
  // rewrite it and sees each tool call…". The weightiest one is said, and its page lists the rest.
  it('says only the weightiest of several long powers, and points to the page for the rest', () => {
    expect(modReachSentence({ events: ['config.set', 'tool.call'], calls: [] })).toMatchObject({
      text: 'sees each change to /config and can block or rewrite it. Its page lists 1 more.',
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

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

// The home hero says one short line about the picked mod's risks, under its byline.
describe('modReachSentence', () => {
  const line = (events: string[]) => {
    const fact = modReachSentence({ events, calls: [] })
    return fact && [fact.text, fact.caution ?? false]
  }

  it('names a risk by its short name, as a caution', () => {
    expect(line(['$.fs.write'])).toEqual(['Can write files', true])
  })

  // Watching /config and changing it are two risks, but both change your settings.
  it('counts two risks with the same short name once', () => {
    expect(line(['config.set', '$.config.set'])).toEqual(['Can change your settings', true])
  })

  it('names the first two risks, weightiest first, and counts the rest', () => {
    expect(line(['tool.check', 'config.set', '$.fs.write'])).toEqual([
      'Can write files and change your settings, +1 more',
      true,
    ])
    expect(line(['tool.check', 'config.set', '$.fs.write', '$.http.fetch'])).toEqual([
      'Can write files and connect to the internet, +2 more',
      true,
    ])
  })

  // An entry the page can't describe is never named here, but it is never hidden either.
  it('counts what the page cannot describe as one more, without naming it', () => {
    expect(line(['$.fs.write', 'prismantis.markdown', 'prismantis.other'])).toEqual([
      'Can write files, +1 more',
      true,
    ])
    expect(line(['$.fs.write', 'config.set', 'tool.check', 'prismantis.markdown'])).toEqual([
      'Can write files and change your settings, +2 more',
      true,
    ])
    expect(line(['$.fs.read', 'prismantis.markdown'])).toEqual([
      "Can do things its page doesn't describe yet",
      true,
    ])
  })

  it('says nothing for a mod with no risks and nothing undescribed', () => {
    expect(line(['$.fs.read', '$.audio.play', 'ui.render{component=AbovePrompt}'])).toBeNull()
  })

  it('says when nothing about it was recorded', () => {
    expect(line([])).toEqual(["What it can reach isn't recorded yet", true])
  })
})

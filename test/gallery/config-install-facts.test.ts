import { describe, expect, it } from 'vitest'
import { configInstallFacts, reachSentence } from '@/gallery/config-install-facts'

const base = {
  updatedAt: '2026-10-12',
  readsClaudeToken: false,
  networkHosts: [],
  generatedContent: null,
}

// What a status line page says beside its install button, all from stored facts.
describe('configInstallFacts', () => {
  it('says this version was reviewed before listing, and that it never connects to the internet', () => {
    expect(configInstallFacts(base).map((f) => [f.text, f.caution ?? false])).toEqual([
      ['Reviewed before listing · this version, Oct 12, 2026', false],
      ["Doesn't ask to reach the internet", false],
    ])
  })

  it('flags reading the Claude sign-in token and the hosts it connects to as risks', () => {
    const facts = configInstallFacts({
      ...base,
      readsClaudeToken: true,
      networkHosts: ['api.github.com', 'wttr.in'],
    })
    expect(facts.filter((f) => f.caution).map((f) => f.text)).toEqual([
      'Reads your Claude sign-in token',
      'Connects to `api.github.com`, `wttr.in`',
    ])
  })

  it("lists the page copy's good-to-know notes, where the requirements go", () => {
    const facts = configInstallFacts({
      ...base,
      generatedContent: { goodToKnow: ['Needs `jq` on your PATH', 'Uses Nerd Font glyphs'] },
    })
    expect(facts.slice(-2).map((f) => f.text)).toEqual([
      'Needs `jq` on your PATH',
      'Uses Nerd Font glyphs',
    ])
  })
})

// The home hero says what the picked line reaches as one short line, under its byline.
describe('reachSentence', () => {
  const reach = (readsClaudeToken: boolean, networkHosts: string[]) => {
    const { text, caution } = reachSentence({ readsClaudeToken, networkHosts })
    return [text, caution ?? false]
  }

  it('says a line that reaches nothing never connects to the internet', () => {
    expect(reach(false, [])).toEqual(["Doesn't ask to reach the internet", false])
  })

  it('names the token it reads and the hosts it connects to, as risks', () => {
    expect(reach(true, [])).toEqual(['Reads your Claude sign-in token', true])
    expect(reach(false, ['wttr.in', 'api.github.com'])).toEqual([
      'Connects to `wttr.in` and `api.github.com`',
      true,
    ])
    expect(reach(true, ['wttr.in'])).toEqual([
      'Reads your Claude sign-in token and connects to `wttr.in`',
      true,
    ])
  })
})

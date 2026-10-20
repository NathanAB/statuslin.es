import { describe, expect, it } from 'vitest'
import { configInstallFacts } from '@/gallery/config-install-facts'

const base = {
  updatedAt: '2026-10-12',
  readsClaudeToken: false,
  networkHosts: [],
  generatedContent: null,
}

// What a status line page says beside its install button, all from stored facts.
describe('configInstallFacts', () => {
  it('says a person read this version, and that it reaches no network', () => {
    expect(configInstallFacts(base).map((f) => [f.text, f.caution ?? false])).toEqual([
      ['Read by a person · this version, Oct 12, 2026', false],
      ['No network access', false],
    ])
  })

  it('flags reading the Claude login and the hosts it calls as risks', () => {
    const facts = configInstallFacts({
      ...base,
      readsClaudeToken: true,
      networkHosts: ['api.github.com', 'wttr.in'],
    })
    expect(facts.filter((f) => f.caution).map((f) => f.text)).toEqual([
      'Reads your Claude login',
      'Calls `api.github.com`, `wttr.in`',
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

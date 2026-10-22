import { describe, expect, it } from 'vitest'
import type { ModPageCopy } from '@/content/types'
import { modFactTiles } from '@/mods/mod-fact-tiles'
import type { ModDetail } from '@/mods/queries'

type Mod = Pick<
  ModDetail,
  | 'footprint'
  | 'preview'
  | 'desktop'
  | 'generatedContent'
  | 'commitSha'
  | 'reviewedAt'
  | 'recordedWith'
>

const SHA = '0123456789abcdef0123456789abcdef01234567'

const ABOVE = 'ui.render{component=AbovePrompt}'
const IMAGE = { src: '/mod-previews/v1/desktop.png', width: 790, height: 520 }
const SHOT: Mod['desktop'] = { kind: 'shot', shot: IMAGE, card: IMAGE }

const MOD: Mod = {
  footprint: { events: [ABOVE], calls: ['$.session.usage'] },
  preview: [{ text: 'meter' }],
  desktop: { kind: 'nothing' },
  generatedContent: null,
  commitSha: SHA,
  reviewedAt: '2026-09-30',
  recordedWith: '2.1.0',
}

function withDetails(details: ModPageCopy['details']): ModPageCopy {
  return { summary: 'A meter.', howItWorks: [], goodToKnow: [], details }
}

/** Every detail a copy writer could claim, true or not. */
const CLAIMS = withDetails({
  showsUp: 'A meter above the prompt',
  commands: ['/meter'],
  usesYourPlan: 'Asks the model to summarize',
  changesFiles: '`CLAUDE.md`, when you press Save',
  network: 'Weather from open-meteo.com',
})

const value = (mod: Partial<Mod>, label: string) =>
  modFactTiles({ ...MOD, ...mod }).find((tile) => tile.label === label)?.value

describe('modFactTiles', () => {
  it('states every fact from the footprint and the recorded previews for a quiet mod', () => {
    expect(
      modFactTiles(MOD).map(({ label, value, caution }) => [label, value, caution ?? false]),
    ).toEqual([
      ['What you see', 'Above the prompt', false],
      ['Works in', 'Terminal', false],
      ['Slash commands', 'None', false],
      ['Uses your tokens', 'No', false],
      ['Changes files', 'Nothing', false],
      ['Network access', 'None', false],
      ['Reviewed commit', '`0123456` on Sep 30, 2026', false],
      ['Preview recorded with', 'Claude Code 2.1.0', false],
    ])
  })

  // An empty footprint means the validator recorded nothing, not that the mod does nothing: a row
  // of "Nothing" and "None" next to a preview that plainly draws read as a clean bill of health.
  it('says not recorded yet, not nothing, for every footprint fact when none was recorded', () => {
    const tiles = modFactTiles({ ...MOD, footprint: { events: [], calls: [] } })
    const byLabel = (label: string) => tiles.find((tile) => tile.label === label)?.value
    for (const label of [
      'What you see',
      'Slash commands',
      'Uses your tokens',
      'Changes files',
      'Network access',
    ]) {
      expect(byLabel(label), label).toBe('Not recorded yet')
    }
    expect(byLabel('Reviewed commit')).toBe('`0123456` on Sep 30, 2026')
  })

  it('keeps the footprint’s no whatever the copy claims', () => {
    const tiles = modFactTiles({ ...MOD, generatedContent: CLAIMS })
    expect(tiles.map((tile) => tile.value).slice(2, 6)).toEqual(['None', 'No', 'Nothing', 'None'])
  })

  it('uses the copy’s words where the footprint says yes', () => {
    const footprint = {
      events: [ABOVE],
      calls: ['$.model.complete', '$.fs.write', '$.http.fetch'],
    }
    const tiles = modFactTiles({ ...MOD, footprint, generatedContent: CLAIMS })
    expect(tiles.map(({ label, value }) => [label, value])).toEqual([
      ['What you see', 'A meter above the prompt'],
      ['Works in', 'Terminal'],
      ['Slash commands', 'None'],
      ['Uses your tokens', 'Asks the model to summarize'],
      ['Changes files', '`CLAUDE.md`, when you press Save'],
      ['Network access', 'Weather from open-meteo.com'],
      ['Reviewed commit', '`0123456` on Sep 30, 2026'],
      ['Preview recorded with', 'Claude Code 2.1.0'],
    ])
  })

  it('cautions that a mod calling the model uses your tokens, with a default without copy', () => {
    const tile = modFactTiles({ ...MOD, footprint: { events: [], calls: ['$.model.complete'] } })[3]
    expect(tile).toMatchObject({ label: 'Uses your tokens', value: 'Yes', caution: true })
  })

  it('names every place it draws, and says when it draws nothing on screen', () => {
    const footprint = { events: [ABOVE, 'ui.render{component=Pane}'], calls: ['$.ui.toast'] }
    expect(value({ footprint }, 'What you see')).toBe('Above the prompt, a pane, and a toast')
    expect(
      value(
        { footprint: { events: [], calls: ['$.session.usage'] }, generatedContent: CLAIMS },
        'What you see',
      ),
    ).toBe('Nothing on screen')
  })

  it('lists only the surfaces where a preview recorded drawing', () => {
    expect(value({ desktop: SHOT }, 'Works in')).toBe('Terminal and Claude Desktop')
    expect(value({ preview: [], desktop: SHOT }, 'Works in')).toBe('Claude Desktop')
    expect(value({ preview: [], desktop: null }, 'Works in')).toBeUndefined()
  })

  it('names the commands the footprint records, over any the copy lists', () => {
    const footprint = { events: ['command.run{command=burn|b}'], calls: [] }
    expect(value({ footprint, generatedContent: CLAIMS }, 'Slash commands')).toBe('`/burn`, `/b`')
  })

  it('takes command names from the copy only when the footprint records none of their names', () => {
    const footprint = { events: ['command.run'], calls: ['$.command.register'] }
    expect(value({ footprint, generatedContent: CLAIMS }, 'Slash commands')).toBe('`/meter`')
    expect(value({ footprint }, 'Slash commands')).toBe('Yes')
  })

  it('says a mod that runs programs may change files or use the network through them', () => {
    const footprint = { events: [ABOVE], calls: ['$.process.run'] }
    expect(value({ footprint }, 'Changes files')).toBe('Only through programs it runs')
    expect(value({ footprint }, 'Network access')).toBe('Only through programs it runs')
    expect(value({ footprint, generatedContent: CLAIMS }, 'Network access')).toBe(
      'Weather from open-meteo.com',
    )
  })

  it('says a mod that calls Claude Code’s tools changes files and may use the network', () => {
    const footprint = { events: [ABOVE], calls: ['$.tool.call'] }
    expect(value({ footprint }, 'Changes files')).toBe('Yes')
    expect(value({ footprint }, 'Network access')).toBe('Only through programs it runs')
  })

  it('names the reviewed commit without a date when no review date is stored', () => {
    expect(value({ reviewedAt: null }, 'Reviewed commit')).toBe('`0123456`')
  })

  it('leaves out the Claude Code version when no terminal preview recorded one', () => {
    expect(value({ recordedWith: null }, 'Preview recorded with')).toBeUndefined()
  })
})

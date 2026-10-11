import { describe, expect, it } from 'vitest'
import type { ModPageCopy } from '@/content/types'
import { modFactTiles } from '@/mods/mod-fact-tiles'
import type { ModDetail } from '@/mods/queries'

type Mod = Pick<ModDetail, 'footprint' | 'preview' | 'desktop' | 'generatedContent'>

const ABOVE = 'ui.render{component=AbovePrompt}'
const IMAGE = { src: '/mod-previews/v1/desktop.png', width: 790, height: 520 }
const SHOT: Mod['desktop'] = { kind: 'shot', shot: IMAGE, card: IMAGE }

const MOD: Mod = {
  footprint: { events: [ABOVE], calls: ['$.session.usage'] },
  preview: [{ text: 'meter' }],
  desktop: { kind: 'nothing' },
  generatedContent: null,
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
      ['Shows up', 'Above the prompt', false],
      ['Works in', 'Terminal', false],
      ['Commands', 'None', false],
      ['Uses your plan', 'No', false],
      ['Changes files', 'Nothing', false],
      ['Network', 'None', false],
    ])
  })

  it('keeps the footprint’s no whatever the copy claims', () => {
    const tiles = modFactTiles({ ...MOD, generatedContent: CLAIMS })
    expect(tiles.map((tile) => tile.value).slice(2)).toEqual(['None', 'No', 'Nothing', 'None'])
  })

  it('uses the copy’s words where the footprint says yes', () => {
    const footprint = {
      events: [ABOVE],
      calls: ['$.model.complete', '$.fs.write', '$.http.fetch'],
    }
    const tiles = modFactTiles({ ...MOD, footprint, generatedContent: CLAIMS })
    expect(tiles.map(({ label, value }) => [label, value])).toEqual([
      ['Shows up', 'A meter above the prompt'],
      ['Works in', 'Terminal'],
      ['Commands', 'None'],
      ['Uses your plan', 'Asks the model to summarize'],
      ['Changes files', '`CLAUDE.md`, when you press Save'],
      ['Network', 'Weather from open-meteo.com'],
    ])
  })

  it('cautions that a mod calling the model uses your plan, with a default without copy', () => {
    const tile = modFactTiles({ ...MOD, footprint: { events: [], calls: ['$.model.complete'] } })[3]
    expect(tile).toMatchObject({ label: 'Uses your plan', value: 'Yes', caution: true })
  })

  it('names every place it draws, and says when it draws nothing on screen', () => {
    const footprint = { events: [ABOVE, 'ui.render{component=Pane}'], calls: ['$.ui.toast'] }
    expect(value({ footprint }, 'Shows up')).toBe('Above the prompt, a pane, and a toast')
    expect(
      value({ footprint: { events: [], calls: [] }, generatedContent: CLAIMS }, 'Shows up'),
    ).toBe('Nothing on screen')
  })

  it('lists only the surfaces where a preview recorded drawing', () => {
    expect(value({ desktop: SHOT }, 'Works in')).toBe('Terminal and Claude Desktop')
    expect(value({ preview: [], desktop: SHOT }, 'Works in')).toBe('Claude Desktop')
    expect(value({ preview: [], desktop: null }, 'Works in')).toBeUndefined()
  })

  it('names the commands the footprint records, over any the copy lists', () => {
    const footprint = { events: ['command.run{command=burn|b}'], calls: [] }
    expect(value({ footprint, generatedContent: CLAIMS }, 'Commands')).toBe('`/burn`, `/b`')
  })

  it('takes command names from the copy only when the footprint records none of their names', () => {
    const footprint = { events: ['command.run'], calls: ['$.command.register'] }
    expect(value({ footprint, generatedContent: CLAIMS }, 'Commands')).toBe('`/meter`')
    expect(value({ footprint }, 'Commands')).toBe('Yes')
  })

  it('says a mod that runs programs may change files or use the network through them', () => {
    const footprint = { events: [ABOVE], calls: ['$.process.run'] }
    expect(value({ footprint }, 'Changes files')).toBe('Only through programs it runs')
    expect(value({ footprint }, 'Network')).toBe('Only through programs it runs')
    expect(value({ footprint, generatedContent: CLAIMS }, 'Network')).toBe(
      'Weather from open-meteo.com',
    )
  })
})

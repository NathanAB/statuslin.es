import { describe, expect, it } from 'vitest'
import type { ModPageCopy } from '@/content/types'
import {
  buildGalleryCatalogue,
  type GalleryCatalogueMod,
  galleryFetchedEvent,
} from '@/mods/gallery-catalogue'
import { modFactTiles } from '@/mods/mod-fact-tiles'

const ORIGIN = 'https://statuslin.es'
const NOW = new Date('2026-11-12T20:00:00.000Z')

const MOD: GalleryCatalogueMod = {
  slug: 'cache-tax',
  title: 'Cache Tax',
  description: 'Shows what the prompt cache saves you.',
  authorGithub: 'octocat',
  copyCount: 142,
  tags: ['usage'],
  license: 'MIT',
  footprint: { events: ['ui.render{component=AbovePrompt}'], calls: ['$.session.usage'] },
  preview: [{ text: 'cache' }],
  desktop: { kind: 'nothing' },
  generatedContent: null,
}

const copy = (summary: string): ModPageCopy => ({
  summary,
  howItWorks: [],
  goodToKnow: [],
  details: {},
})

const entry = (mod: Partial<GalleryCatalogueMod>) => {
  const [first] = buildGalleryCatalogue(ORIGIN, [{ ...MOD, ...mod }], NOW).mods
  if (!first) throw new Error('expected one entry')
  return first
}

describe('buildGalleryCatalogue', () => {
  it('describes each mod with its page facts, links and the marketplace it installs from', () => {
    expect(buildGalleryCatalogue(ORIGIN, [MOD], NOW)).toEqual({
      version: 1,
      generatedAt: '2026-11-12T20:00:00.000Z',
      marketplace: 'statuslines',
      marketplaceUrl: 'https://statuslin.es/marketplace.json',
      mods: [
        {
          slug: 'cache-tax',
          title: 'Cache Tax',
          author: 'octocat',
          summary: 'Shows what the prompt cache saves you.',
          installs: 142,
          tags: ['usage'],
          facts: [
            { label: 'What you see', value: 'Above the prompt' },
            { label: 'Works in', value: 'Terminal' },
            { label: 'Slash commands', value: 'None' },
            { label: 'Uses your tokens', value: 'No' },
            { label: 'Changes files', value: 'Nothing' },
            { label: 'Network access', value: 'None' },
          ],
          license: 'MIT',
          url: 'https://statuslin.es/mods/cache-tax',
          badgeUrl: 'https://statuslin.es/badge/mods/cache-tax.svg',
          cardUrl: 'https://statuslin.es/og/mods/cache-tax.png',
        },
      ],
    })
  })

  it('keeps the mods in the order given', () => {
    const mods = buildGalleryCatalogue(
      ORIGIN,
      [
        { ...MOD, slug: 'b' },
        { ...MOD, slug: 'a' },
      ],
      NOW,
    ).mods
    expect(mods.map((mod) => mod.slug)).toEqual(['b', 'a'])
  })

  it('answers an empty list when nothing is published', () => {
    expect(buildGalleryCatalogue(ORIGIN, [], NOW).mods).toEqual([])
  })

  it('hides installs below three, as every page does', () => {
    expect(entry({ copyCount: 2 }).installs).toBeNull()
    expect(entry({ copyCount: 3 }).installs).toBe(3)
  })

  it('says null for a mod without a license', () => {
    expect(entry({ license: null }).license).toBeNull()
  })

  it('states the reach tiles the page shows, without the reviewed commit or recording version', () => {
    const mod = {
      footprint: {
        events: ['ui.render{component=Pane}', 'command.run{command=burn}'],
        calls: ['$.model.complete', '$.http.fetch'],
      },
      preview: [],
      desktop: { kind: 'shot' as const, shot: IMAGE, card: IMAGE },
      generatedContent: { ...copy('Burns.'), details: { network: 'Prices from example.com' } },
    }
    const facts = [
      { label: 'What you see', value: 'A pane' },
      { label: 'Works in', value: 'Claude Desktop' },
      { label: 'Slash commands', value: '`/burn`' },
      { label: 'Uses your tokens', value: 'Yes' },
      { label: 'Changes files', value: 'Nothing' },
      { label: 'Network access', value: 'Prices from example.com' },
    ]
    expect(entry(mod).facts).toEqual(facts)
    const page = modFactTiles({
      ...mod,
      commitSha: 'a'.repeat(40),
      reviewedAt: null,
      recordedWith: '2.1.0',
    }).map(({ label, value }) => ({ label, value }))
    expect(page.slice(0, facts.length)).toEqual(facts)
  })

  it('leads with the page copy summary, else the description', () => {
    expect(entry({ generatedContent: copy('Our summary.') }).summary).toBe('Our summary.')
    expect(entry({ generatedContent: null }).summary).toBe('Shows what the prompt cache saves you.')
  })

  it('caps the summary at 300 characters, cut at a word boundary', () => {
    const description = `${'word '.repeat(70)}end`
    const summary = entry({ description }).summary
    expect(summary).toBe(`${'word '.repeat(58)}word…`)
    expect(summary.length).toBeLessThanOrEqual(300)
  })

  it('strips control characters from every author string, so a terminal printing it is safe', () => {
    const mod = entry({
      title: 'Cache\u001b[2J Tax',
      authorGithub: 'octo\u001bcat',
      tags: ['us\u0000age'],
      license: 'M\u001bIT',
      generatedContent: {
        ...copy('Sum\u001b]52;c;aGk=\u0007mary.'),
        details: { showsUp: 'A meter\u001b[31m above the prompt' },
      },
    })
    expect(mod.title).toBe('Cache[2J Tax')
    expect(mod.summary).toBe('Sum]52;c;aGk=mary.')
    expect(mod.author).toBe('octocat')
    expect(mod.tags).toEqual(['usage'])
    expect(mod.license).toBe('MIT')
    expect(mod.facts[0]).toEqual({ label: 'What you see', value: 'A meter[31m above the prompt' })
    expect(entry({ description: 'Line one\nline\u0007 two\u009b' }).summary).toBe(
      'Line one line two',
    )
  })
})

const IMAGE = { src: '/mod-previews/v1/desktop.png', width: 790, height: 520 }

describe('galleryFetchedEvent', () => {
  it('counts the mods and classes the client, as the marketplace event does', () => {
    expect(galleryFetchedEvent(4, 'Mozilla/5.0 (Macintosh)')).toEqual({
      distinctId: 'gallery',
      event: 'gallery_fetched',
      properties: { modCount: 4, client: 'browser', $process_person_profile: false },
    })
    expect(galleryFetchedEvent(0, null).properties).toMatchObject({ client: 'other' })
  })
})

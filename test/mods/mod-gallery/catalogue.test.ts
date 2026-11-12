import { describe, expect, it } from 'vitest'
import { GALLERY_JSON_PATH, MARKETPLACE_PATH } from '@/lib/site'
import { buildGalleryCatalogue, type GalleryCatalogueMod } from '@/mods/gallery-catalogue'
import { MARKETPLACE_NAME } from '@/mods/marketplace'
import {
  CATALOGUE_URL,
  CATALOGUE_VERSION,
  MARKETPLACE,
  parseCatalogue,
  readCache,
  readCatalogueResponse,
  SITE,
} from '../../../plugins/mod-gallery/hooks/catalogue'

const NOW = new Date('2026-11-12T20:00:00.000Z')

const SITE_MOD: GalleryCatalogueMod = {
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

const entry = (fields: Record<string, unknown> = {}) => ({
  slug: 'sub-meter',
  title: 'Sub Meter',
  author: 'midudev',
  summary: 'A meter of your subscription windows.',
  installs: 48,
  tags: ['quota'],
  facts: [{ label: 'Network access', value: 'None' }],
  license: 'MIT',
  url: 'https://statuslin.es/mods/sub-meter',
  badgeUrl: 'https://statuslin.es/badge/mods/sub-meter.svg',
  cardUrl: 'https://statuslin.es/og/mods/sub-meter.png',
  ...fields,
})

const document = (fields: Record<string, unknown> = {}) => ({
  version: 1,
  generatedAt: '2026-11-12T20:00:00.000Z',
  marketplace: 'statuslines',
  marketplaceUrl: 'https://statuslin.es/marketplace.json',
  mods: [entry()],
  ...fields,
})

const slugsOf = (doc: unknown) => {
  const read = parseCatalogue(doc)
  if (read.kind !== 'read') throw new Error(`refused: ${read.reason}`)
  return { slugs: read.catalogue.mods.map((mod) => mod.slug), dropped: read.catalogue.dropped }
}

describe('the constants the mod keeps in step with the site', () => {
  it('fetches the gallery the site serves and installs from the marketplace it names', () => {
    expect(SITE).toBe('https://statuslin.es')
    expect(CATALOGUE_URL).toBe(`${SITE}${GALLERY_JSON_PATH}`)
    expect(MARKETPLACE).toEqual({ name: MARKETPLACE_NAME, url: `${SITE}${MARKETPLACE_PATH}` })
    expect(CATALOGUE_VERSION).toBe(buildGalleryCatalogue(SITE, [], NOW).version)
  })
})

describe('parseCatalogue', () => {
  it("reads the document the site's own builder makes", () => {
    const read = parseCatalogue(
      JSON.parse(JSON.stringify(buildGalleryCatalogue(SITE, [SITE_MOD], NOW))),
    )
    expect(read).toEqual({
      kind: 'read',
      catalogue: {
        generatedAt: Date.parse('2026-11-12T20:00:00.000Z'),
        dropped: 0,
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
          },
        ],
      },
    })
  })

  it('refuses a version it was not written for', () => {
    expect(parseCatalogue(document({ version: 2 }))).toEqual({
      kind: 'refused',
      reason: 'The catalogue is in a format this Mod Gallery cannot read. Update Mod Gallery.',
    })
  })

  it('refuses a catalogue of another marketplace, whose mods its install prompt would not find', () => {
    expect(parseCatalogue(document({ marketplace: 'elsewhere' })).kind).toBe('refused')
  })

  it('refuses a document with no date or no list', () => {
    expect(parseCatalogue(document({ generatedAt: 'yesterday' })).kind).toBe('refused')
    expect(parseCatalogue(document({ mods: {} })).kind).toBe('refused')
    expect(parseCatalogue([]).kind).toBe('refused')
  })

  it('drops an entry whose slug is not a plugin name and keeps the rest', () => {
    const doc = document({
      mods: [
        entry({ slug: 'x; rm -rf ~' }),
        entry({ slug: '-flag' }),
        entry({ slug: 'a'.repeat(65) }),
        entry({ slug: 'ok.name_2' }),
      ],
    })
    expect(slugsOf(doc)).toEqual({ slugs: ['ok.name_2'], dropped: 3 })
  })

  it('drops an entry with an oversized or missing field', () => {
    const doc = document({
      mods: [
        entry({ slug: 'long-summary', summary: 'word '.repeat(81) }),
        entry({ slug: 'no-title', title: '' }),
        entry({ slug: 'many-tags', tags: Array.from({ length: 21 }, () => 'tag') }),
        entry({ slug: 'bad-fact', facts: [{ label: 'Network access' }] }),
        entry({ slug: 'fits', summary: 'word '.repeat(80) }),
      ],
    })
    expect(slugsOf(doc)).toEqual({ slugs: ['fits'], dropped: 4 })
  })

  it('keeps a hidden install count and drops one that is not a count', () => {
    const doc = document({
      mods: [
        entry({ slug: 'hidden', installs: null }),
        entry({ slug: 'negative', installs: -1 }),
        entry({ slug: 'fraction', installs: 1.5 }),
        entry({ slug: 'text', installs: '12' }),
      ],
    })
    expect(slugsOf(doc)).toEqual({ slugs: ['hidden'], dropped: 3 })
  })

  it('keeps the first of two entries with one slug', () => {
    const doc = document({ mods: [entry({ title: 'First' }), entry({ title: 'Second' })] })
    const read = parseCatalogue(doc)
    expect(read.kind === 'read' && read.catalogue.mods.map((mod) => mod.title)).toEqual(['First'])
  })

  it('reads no more than 500 mods and counts the rest as dropped', () => {
    const mods = Array.from({ length: 502 }, (_, i) => entry({ slug: `mod-${i}` }))
    const { slugs, dropped } = slugsOf(document({ mods }))
    expect(slugs).toHaveLength(500)
    expect(slugs.at(-1)).toBe('mod-499')
    expect(dropped).toBe(2)
  })

  it('strips control and format characters from what a terminal will draw', () => {
    const doc = document({
      mods: [
        entry({
          title: 'Evil\u001b]52;c;cm0=\u0007 Title‮',
          summary: 'line one\nline two​',
          facts: [{ label: 'Works\tin', value: '\u001b[2JTerminal' }],
        }),
      ],
    })
    const read = parseCatalogue(doc)
    const [mod] = read.kind === 'read' ? read.catalogue.mods : []
    expect(mod?.title).toBe('Evil]52;c;cm0= Title')
    expect(mod?.summary).toBe('line one line two')
    expect(mod?.facts).toEqual([{ label: 'Works in', value: '[2JTerminal' }])
  })
})

describe('readCatalogueResponse', () => {
  it('reads a 200 with the JSON document', () => {
    expect(readCatalogueResponse({ status: 200, text: JSON.stringify(document()) }).kind).toBe(
      'read',
    )
  })

  it('says what went wrong for an error status, a body that is not JSON, or one too large', () => {
    expect(readCatalogueResponse({ status: 503, text: '' })).toEqual({
      kind: 'refused',
      reason: 'statuslin.es answered 503.',
    })
    expect(readCatalogueResponse({ status: 200, text: '<html>' })).toEqual({
      kind: 'refused',
      reason: 'The catalogue is not JSON.',
    })
    expect(readCatalogueResponse({ status: 200, text: ' '.repeat(2_000_001) })).toEqual({
      kind: 'refused',
      reason: 'The catalogue is too large to read.',
    })
  })
})

describe('readCache', () => {
  it('reads back a stored body through the same checks', () => {
    const stored = {
      fetchedAt: 1000,
      text: JSON.stringify(document({ mods: [entry(), entry({ slug: '!' })] })),
    }
    const cached = readCache(stored)
    expect(cached?.fetchedAt).toBe(1000)
    expect(cached?.catalogue.mods.map((mod) => mod.slug)).toEqual(['sub-meter'])
  })

  it('reads nothing from a store an earlier version wrote in another shape', () => {
    expect(readCache(undefined)).toBeUndefined()
    expect(readCache({ text: JSON.stringify(document()) })).toBeUndefined()
    expect(readCache({ fetchedAt: 1, document: document() })).toBeUndefined()
    expect(
      readCache({ fetchedAt: 1, text: JSON.stringify(document({ version: 2 })) }),
    ).toBeUndefined()
  })
})

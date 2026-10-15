import { describe, expect, it } from 'vitest'
import {
  buildMarketplace,
  type MarketplaceModRow,
  marketplaceFetchedEvent,
} from '@/mods/marketplace'

const ORIGIN = 'https://statuslin.es'
const SHA = 'a'.repeat(40)

function row(overrides: Partial<MarketplaceModRow> = {}): MarketplaceModRow {
  return {
    slug: 'meter',
    description: 'A context meter',
    authorGithub: 'octocat',
    tags: ['minimal', 'git'],
    repoUrl: 'https://github.com/octocat/meter',
    path: '',
    commitSha: SHA,
    license: 'MIT',
    ...overrides,
  }
}

describe('buildMarketplace', () => {
  it('names and describes the marketplace, names an owner, and force-removes delisted plugins', () => {
    const marketplace = buildMarketplace(ORIGIN, [])

    expect(marketplace).toEqual({
      name: 'statuslines',
      description: 'Claude Code mods from the statuslin.es gallery, each pinned to a commit.',
      owner: { name: 'statuslin.es', email: 'hello@statuslin.es' },
      forceRemoveDeletedPlugins: true,
      plugins: [],
    })
  })

  it('points a plugin at the repo root with a url source pinned to its commit', () => {
    const [plugin] = buildMarketplace(ORIGIN, [row()]).plugins

    expect(plugin).toEqual({
      name: 'meter',
      source: { source: 'url', url: 'https://github.com/octocat/meter.git', sha: SHA },
      description: 'A context meter',
      author: { name: 'octocat' },
      homepage: 'https://statuslin.es/mods/meter',
      license: 'MIT',
      keywords: ['minimal', 'git'],
    })
  })

  it('points a plugin in a folder at a git-subdir source with its path', () => {
    const [plugin] = buildMarketplace(ORIGIN, [
      row({ repoUrl: 'https://github.com/octocat/mods', path: 'plugins/meter' }),
    ]).plugins

    expect(plugin?.source).toEqual({
      source: 'git-subdir',
      url: 'https://github.com/octocat/mods.git',
      path: 'plugins/meter',
      sha: SHA,
    })
  })

  it('builds the homepage from the site origin and the mod slug', () => {
    const [plugin] = buildMarketplace('https://staging.statuslin.es', [
      row({ slug: 'context-meter' }),
    ]).plugins

    expect(plugin?.homepage).toBe('https://staging.statuslin.es/mods/context-meter')
  })

  it('names each entry by the mod slug, the name that stays unique when plugin names clash', () => {
    const [plugin] = buildMarketplace(ORIGIN, [row({ slug: 'meter-ada' })]).plugins

    expect(plugin?.name).toBe('meter-ada')
  })

  it('omits license when the version has none', () => {
    const [plugin] = buildMarketplace(ORIGIN, [row({ license: null })]).plugins

    expect(plugin).not.toHaveProperty('license')
  })

  it('keeps the rows in the order given', () => {
    const names = buildMarketplace(ORIGIN, [row({ slug: 'b' }), row({ slug: 'a' })]).plugins.map(
      (p) => p.name,
    )

    expect(names).toEqual(['b', 'a'])
  })
})

describe('marketplaceFetchedEvent', () => {
  it('records the fetch with the number of listed plugins, without a person profile', () => {
    expect(marketplaceFetchedEvent(3, 'Claude-Code-Plugin-Manager')).toEqual({
      event: 'marketplace_fetched',
      distinctId: 'marketplace',
      properties: { pluginCount: 3, client: 'claude-code', $process_person_profile: false },
    })
  })

  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'browser'],
    ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'bot'],
    ['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'bot'],
    ['curl/8.7.1', 'other'],
    [null, 'other'],
  ])('names the client of %s as %s, never the raw user agent', (userAgent, client) => {
    expect(marketplaceFetchedEvent(1, userAgent).properties).toEqual({
      pluginCount: 1,
      client,
      $process_person_profile: false,
    })
  })
})

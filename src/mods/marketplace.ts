import type { ServerEvent } from '@/lib/posthog-server'
import { CONTACT_EMAIL, modPath } from '@/lib/site'

export interface MarketplaceModRow {
  slug: string
  pluginName: string
  description: string
  authorGithub: string
  tags: string[]
  /** Canonical `https://github.com/<owner>/<repo>` (DB CHECK `mod_versions_repo_url_check`), so appending `.git` needs no normalizing. */
  repoUrl: string
  /** Folder holding the plugin inside the repo; empty when the plugin is at the repo root. */
  path: string
  commitSha: string
  license: string | null
}

export type MarketplaceSource =
  | { source: 'url'; url: string; sha: string }
  | { source: 'git-subdir'; url: string; path: string; sha: string }

export interface MarketplacePlugin {
  name: string
  source: MarketplaceSource
  description: string
  author: { name: string }
  homepage: string
  license?: string
  keywords: string[]
}

/** The `marketplace.json` document, per https://code.claude.com/docs/en/plugins/marketplace-reference. */
export interface Marketplace {
  name: 'statuslines'
  owner: { name: string; email: string }
  forceRemoveDeletedPlugins: true
  plugins: MarketplacePlugin[]
}

function pluginSource(row: MarketplaceModRow): MarketplaceSource {
  const url = `${row.repoUrl}.git`
  if (row.path === '') return { source: 'url', url, sha: row.commitSha }
  return { source: 'git-subdir', url, path: row.path, sha: row.commitSha }
}

function marketplacePlugin(origin: string, row: MarketplaceModRow): MarketplacePlugin {
  return {
    name: row.pluginName,
    source: pluginSource(row),
    description: row.description,
    author: { name: row.authorGithub },
    homepage: `${origin}${modPath(row.slug)}`,
    ...(row.license === null ? {} : { license: row.license }),
    keywords: row.tags,
  }
}

export function buildMarketplace(origin: string, rows: MarketplaceModRow[]): Marketplace {
  return {
    name: 'statuslines',
    owner: { name: 'statuslin.es', email: CONTACT_EMAIL },
    forceRemoveDeletedPlugins: true,
    plugins: rows.map((row) => marketplacePlugin(origin, row)),
  }
}

/** Anonymous on purpose: Claude Code fetches the file without any visitor identity. */
export function marketplaceFetchedEvent(pluginCount: number): ServerEvent {
  return {
    distinctId: 'marketplace',
    event: 'marketplace_fetched',
    properties: { pluginCount },
  }
}

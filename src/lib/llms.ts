import type { PageCopy } from '@/content/types'
import { LLMS_FULL_PATH, modPath } from '@/lib/site'
import { type LlmsFacet, siteBlocks } from './llms-site'
import { escapeMarkdownLinks, flat, oneLine, untrusted } from './llms-text'

/**
 * The `/llms.txt` body (see llmstxt.org) — a plain-markdown map of the site for AI answer
 * engines (ChatGPT, Claude, Perplexity) so they can understand and cite the gallery without
 * scraping the whole DOM. Google doesn't use this file; the non-Google engines that are our
 * citation audience do. `base` comes from the one origin source so every link is correct per
 * environment. Facets are the *live* ones only (never link a facet page that would 404).
 */
export interface LlmsConfig {
  slug: string
  title: string
  description: string
  copyCount: number
}

export interface LlmsMod {
  slug: string
  title: string
  description: string
  copyCount: number
}

/** A published status line or mod as `/llms-full.txt` lists it. */
export interface LlmsCatalogEntry extends LlmsConfig {
  /** The labels its page's tag chips show. */
  tagLabels: string[]
  /** Null when its current version has no page copy in the current format. */
  generatedContent: PageCopy | null
}

/**
 * `themed` are the plugins that carry themes: theme plugins, and mods that set a Desktop theme. They
 * are listed under Themes, and a mod among them is not listed again under Mods.
 */
export function buildLlmsTxt(
  base: string,
  facets: LlmsFacet[],
  configs: LlmsConfig[] = [],
  mods: LlmsMod[] = [],
  themed: LlmsMod[] = [],
): string {
  const blocks = siteBlocks(base, facets)
  if (configs.length > 0) {
    blocks.push(['## Top status lines', '', ...configs.map((c) => configLink(base, c))].join('\n'))
  }
  for (const [heading, plugins] of [
    ['Mods', withoutThemed(mods, themed)],
    ['Themes', themed],
  ] as const) {
    if (plugins.length > 0) {
      blocks.push(
        [
          `## ${heading}`,
          '',
          ...plugins.map((p) => summaryLink(`${base}${modPath(p.slug)}`, p)),
        ].join('\n'),
      )
    }
  }
  blocks.push(
    [
      '## Optional',
      '',
      `- [Full catalog](${base}${LLMS_FULL_PATH}): every published mod, with the copy from its page`,
    ].join('\n'),
  )
  return `${blocks.join('\n\n')}\n`
}

/**
 * The `/llms-full.txt` body: what llms.txt says about the site, then every published status line
 * and mod with its page copy. Untrusted text never starts a line, so it can't open a heading.
 */
export function buildLlmsFullTxt(
  base: string,
  facets: LlmsFacet[],
  configs: LlmsCatalogEntry[],
  mods: LlmsCatalogEntry[],
  themed: LlmsCatalogEntry[] = [],
): string {
  const blocks = siteBlocks(base, facets)
  if (configs.length > 0) {
    blocks.push(catalogSection('Status lines', configs, (slug) => `${base}/c/${slug}`))
  }
  const plainMods = withoutThemed(mods, themed)
  if (plainMods.length > 0) {
    blocks.push(catalogSection('Mods', plainMods, (slug) => `${base}${modPath(slug)}`))
  }
  if (themed.length > 0) {
    blocks.push(catalogSection('Themes', themed, (slug) => `${base}${modPath(slug)}`))
  }
  return `${blocks.join('\n\n')}\n`
}

function withoutThemed<T extends { slug: string }>(mods: T[], themed: { slug: string }[]): T[] {
  const themedSlugs = new Set(themed.map((plugin) => plugin.slug))
  return mods.filter((mod) => !themedSlugs.has(mod.slug))
}

function configLink(base: string, config: LlmsConfig): string {
  return summaryLink(`${base}/c/${config.slug}`, config)
}

function summaryLink(
  url: string,
  item: { title: string; description: string; copyCount: number },
): string {
  const summary = escapeMarkdownLinks(oneLine(item.description))
  // A count of 0 tells a reader nothing, so a new entry carries none.
  const installs = item.copyCount > 0 ? installedTimes(item.copyCount) : ''
  const text = [summary, installs].filter(Boolean).join(' ')
  return `- [${untrusted(item.title)}](${url})${text ? `: ${text}` : ''}`
}

function installedTimes(count: number): string {
  return `Installed ${count} ${count === 1 ? 'time' : 'times'}.`
}

function catalogSection(
  heading: string,
  entries: LlmsCatalogEntry[],
  url: (slug: string) => string,
): string {
  return [`## ${heading}`, ...entries.map((entry) => catalogEntry(url(entry.slug), entry))].join(
    '\n\n',
  )
}

function catalogEntry(url: string, entry: LlmsCatalogEntry): string {
  const lines = [
    flat(entry.description) ? `- Description: ${untrusted(entry.description)}` : '',
    // As in llms.txt, a count of 0 tells a reader nothing.
    entry.copyCount > 0 ? `- ${installedTimes(entry.copyCount)}` : '',
    entry.tagLabels.length > 0 ? `- Tags: ${entry.tagLabels.map(untrusted).join(', ')}` : '',
    ...(entry.generatedContent ? pageCopyLines(entry.generatedContent) : []),
  ].filter(Boolean)
  const heading = `### [${untrusted(entry.title)}](${url})`
  return lines.length > 0 ? [heading, '', ...lines].join('\n') : heading
}

/** The page's "What it does" copy: its summary, then "How it works" and "Good to know". */
function pageCopyLines(copy: PageCopy): string[] {
  return [
    `- Summary: ${untrusted(copy.summary)}`,
    ...labelledList(
      'How it works',
      copy.howItWorks.map((step, i) => `${i + 1}. ${untrusted(step)}`),
    ),
    ...labelledList(
      'Good to know',
      copy.goodToKnow.map((note) => `- ${untrusted(note)}`),
    ),
  ]
}

function labelledList(label: string, items: string[]): string[] {
  return items.length > 0 ? [`- ${label}:`, ...items.map((item) => `  ${item}`)] : []
}

export function llmsResponse(
  base: string,
  facets: LlmsFacet[],
  configs: LlmsConfig[] = [],
  mods: LlmsMod[] = [],
  themed: LlmsMod[] = [],
): Response {
  return plainTextResponse(buildLlmsTxt(base, facets, configs, mods, themed))
}

export function llmsFullResponse(
  base: string,
  facets: LlmsFacet[],
  configs: LlmsCatalogEntry[],
  mods: LlmsCatalogEntry[],
  themed: LlmsCatalogEntry[] = [],
): Response {
  return plainTextResponse(buildLlmsFullTxt(base, facets, configs, mods, themed))
}

function plainTextResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'max-age=86400',
    },
  })
}

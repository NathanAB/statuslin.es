import { COMPARISONS, type ThirdPartyTool, TOOL_BY_SLUG, TOOLS } from '@/compare/tools'
import { FACET_BY_SLUG } from '@/gallery/facets'
import { type GalleryCard, MIN_INDEXABLE_FACET_CONFIGS } from '@/gallery/queries'
import { listPhrase, type RankedCard, rankedCard } from '@/gallery/why-line'

/** A gallery config counts as doing a tool's job when it shares at least this many of its jobs. */
const MIN_SHARED_JOBS = 3
/** Previews shown per page. */
const CARD_LIMIT = 6
const BRAND = ' | statuslin.es'

export type CompareLink =
  | { to: '/alternatives/$tool'; params: { tool: string }; label: string }
  | { to: '/compare/$pair'; params: { pair: string }; label: string }

export interface ComparePage {
  path: string
  title: string
  heading: string
  description: string
  intro: string[]
  tools: ThirdPartyTool[]
  picks: Array<{ name: string; text: string }>
  cards: RankedCard[]
  links: CompareLink[]
}

type PageSpec =
  | { path: string; kind: 'alternatives'; tool: ThirdPartyTool }
  | {
      path: string
      kind: 'versus'
      pair: string
      tools: [ThirdPartyTool, ThirdPartyTool]
      intro: string[]
    }

function tool(slug: string): ThirdPartyTool {
  const found = TOOL_BY_SLUG.get(slug)
  if (!found) throw new Error(`unknown tool ${slug}`)
  return found
}

const SPECS: PageSpec[] = [
  ...TOOLS.map((t) => ({
    path: `/alternatives/${t.slug}`,
    kind: 'alternatives' as const,
    tool: t,
  })),
  ...COMPARISONS.map((c) => {
    const pair = `${c.tools[0]}-vs-${c.tools[1]}`
    return {
      path: `/compare/${pair}`,
      kind: 'versus' as const,
      pair,
      tools: [tool(c.tools[0]), tool(c.tools[1])] as [ThirdPartyTool, ThirdPartyTool],
      intro: c.intro,
    }
  }),
]

export const COMPARE_PATHS = SPECS.map((s) => s.path)

const GALLERY_PICK = {
  name: 'A gallery status line',
  text: 'Pick a gallery status line if you want one script you can read in full, and to see its real output before you copy it.',
}

function relevantCards(jobs: string[], cards: GalleryCard[]): RankedCard[] {
  return cards
    .filter((c) => jobs.filter((job) => c.tags.includes(job)).length >= MIN_SHARED_JOBS)
    .slice(0, CARD_LIMIT)
    .map(rankedCard)
}

function galleryIntro(subject: string, jobs: string[]): string {
  const features = listPhrase(
    jobs.map((job) => FACET_BY_SLUG.get(job)?.chipLabel ?? job),
    'or',
  )
  return `Every status line below is a single script from the gallery, rendered from its real code. Each one covers at least ${MIN_SHARED_JOBS} of the same features as ${subject}: ${features}.`
}

function alternativesLink(t: ThirdPartyTool): CompareLink {
  return { to: '/alternatives/$tool', params: { tool: t.slug }, label: `${t.name} alternatives` }
}

function versusLinks(t: ThirdPartyTool): CompareLink[] {
  return SPECS.flatMap((s) =>
    s.kind === 'versus' && s.tools.includes(t)
      ? [
          {
            to: '/compare/$pair' as const,
            params: { pair: s.pair },
            label: `${s.tools[0].name} vs ${s.tools[1].name}`,
          },
        ]
      : [],
  )
}

function alternativesPage(t: ThirdPartyTool, cards: RankedCard[]): ComparePage {
  const others = TOOLS.filter((o) => o !== t)
  return {
    path: `/alternatives/${t.slug}`,
    title: `${t.name} Alternatives for Claude Code${BRAND}`,
    heading: `${t.name} alternatives`,
    description: `Alternatives to ${t.name} for your Claude Code status line: ${listPhrase(others.map((o) => o.name))}, plus scripts with real rendered previews you can compare before you copy.`,
    intro: [
      `${t.name} is ${t.summary}. If it isn't the right fit, there are two kinds of alternative: another configurable tool, or a single script you copy.`,
      galleryIntro(t.name, t.jobs),
    ],
    tools: [t, ...others],
    picks: [
      { name: t.name, text: `Stay with ${t.name} if ${t.pickIf}` },
      ...others.map((o) => ({ name: o.name, text: `Pick ${o.name} if ${o.pickIf}` })),
      GALLERY_PICK,
    ],
    cards,
    links: [...versusLinks(t), ...others.map(alternativesLink)],
  }
}

function versusPage(spec: Extract<PageSpec, { kind: 'versus' }>, cards: RankedCard[]): ComparePage {
  const [a, b] = spec.tools
  return {
    path: spec.path,
    title: `${a.name} vs ${b.name} Compared${BRAND}`,
    heading: `${a.name} vs ${b.name}`,
    description: `${a.name} vs ${b.name}: install, config, themes, fonts, and usage limits compared, plus rendered Claude Code status lines that do the same job.`,
    intro: [...spec.intro, galleryIntro('both tools', sharedJobs(spec))],
    tools: [a, b],
    picks: [
      ...spec.tools.map((t) => ({ name: t.name, text: `Pick ${t.name} if ${t.pickIf}` })),
      GALLERY_PICK,
    ],
    cards,
    links: spec.tools.map(alternativesLink),
  }
}

function sharedJobs(spec: Extract<PageSpec, { kind: 'versus' }>): string[] {
  const [a, b] = spec.tools
  return a.jobs.filter((job) => b.jobs.includes(job))
}

/**
 * The comparison page at `path`, built from the tool registry and the published gallery (already
 * ranked by copies). Null when the path is unknown or the gallery can't show enough real previews
 * of status lines doing the same job; the route then 404s and the sitemap leaves it out.
 */
export function buildComparePage(path: string, gallery: GalleryCard[]): ComparePage | null {
  const spec = SPECS.find((s) => s.path === path)
  if (!spec) return null
  const jobs = spec.kind === 'alternatives' ? spec.tool.jobs : sharedJobs(spec)
  const cards = relevantCards(jobs, gallery)
  if (cards.length < MIN_INDEXABLE_FACET_CONFIGS) return null
  return spec.kind === 'alternatives' ? alternativesPage(spec.tool, cards) : versusPage(spec, cards)
}

/** Paths of the comparison pages the current gallery can support. */
export function liveComparePaths(gallery: GalleryCard[]): string[] {
  return COMPARE_PATHS.filter((path) => buildComparePage(path, gallery) !== null)
}

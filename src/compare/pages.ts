import { COMPARISONS, FACT_ROWS, type ThirdPartyTool, TOOL_BY_SLUG, TOOLS } from '@/compare/tools'
import { type GalleryCard, MIN_INDEXABLE_FACET_CONFIGS } from '@/gallery/queries'
import { listPhrase, type RankedCard, rankedCard } from '@/gallery/why-line'

const MIN_SHARED_JOBS = 3
const PREVIEWS_PER_PAGE = 6
const BRAND = ' | statuslin.es'
const GALLERY_WANTS = 'to read one script and see its real output first'

export type CompareLink =
  | { to: '/alternatives/$tool'; params: { tool: string }; label: string }
  | { to: '/compare/$pair'; params: { pair: string }; label: string }

export interface FactSheet {
  columns: Array<Pick<ThirdPartyTool, 'name' | 'repoUrl' | 'sourceUrl'>>
  rows: Array<{ label: string; cells: string[] }>
  checkedOn: string
}

export interface ComparePage {
  path: string
  title: string
  heading: string
  description: string
  intro: string
  facts: FactSheet
  picks: string[]
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
      intro: string
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

function relevantCards(jobs: string[], cards: GalleryCard[]): RankedCard[] {
  return cards
    .filter((c) => jobs.filter((job) => c.tags.includes(job)).length >= MIN_SHARED_JOBS)
    .slice(0, PREVIEWS_PER_PAGE)
    .map(rankedCard)
}

function factSheet(tools: ThirdPartyTool[]): FactSheet {
  return {
    columns: tools.map(({ name, repoUrl, sourceUrl }) => ({ name, repoUrl, sourceUrl })),
    rows: FACT_ROWS.map((row) => ({ label: row.label, cells: tools.map((t) => t.facts[row.key]) })),
    checkedOn: tools.map((t) => t.verifiedAt).sort()[0] ?? '',
  }
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
    intro: `Single scripts from the gallery that cover at least ${MIN_SHARED_JOBS} of the same features as ${t.name}, each shown with its real output.`,
    facts: factSheet([t]),
    picks: [
      `Pick ${t.name} if you want ${t.wants}.`,
      `Pick a gallery status line if you want ${GALLERY_WANTS}.`,
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
    intro: spec.intro,
    facts: factSheet(spec.tools),
    picks: [
      ...spec.tools.map((t) => `Want ${t.wants}? ${t.name}.`),
      `Want ${GALLERY_WANTS}? Pick a status line below.`,
    ],
    cards,
    links: spec.tools.map(alternativesLink),
  }
}

function sharedJobs(spec: Extract<PageSpec, { kind: 'versus' }>): string[] {
  const [a, b] = spec.tools
  return a.jobs.filter((job) => b.jobs.includes(job))
}

export function buildComparePage(path: string, gallery: GalleryCard[]): ComparePage | null {
  const spec = SPECS.find((s) => s.path === path)
  if (!spec) return null
  const jobs = spec.kind === 'alternatives' ? spec.tool.jobs : sharedJobs(spec)
  const cards = relevantCards(jobs, gallery)
  if (cards.length < MIN_INDEXABLE_FACET_CONFIGS) return null
  return spec.kind === 'alternatives' ? alternativesPage(spec.tool, cards) : versusPage(spec, cards)
}

export function liveComparePaths(gallery: GalleryCard[]): string[] {
  return COMPARE_PATHS.filter((path) => buildComparePage(path, gallery) !== null)
}

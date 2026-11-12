// Mod Gallery: browse the reviewed mods on statuslin.es in a pane, and put a mod's install prompt in
// the prompt box for the person to read and send. It fetches one URL, runs nothing, and writes
// nothing but its own store.

import type { Elements, EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'
import type { Browse, Load } from '../types'
import {
  CATALOGUE_URL,
  type GalleryMod,
  isFresh,
  readCache,
  readCatalogueResponse,
} from './catalogue'
import { installPrompt, modPageUrl } from './install'
import { MAX_QUERY_CHARS, matchMods, readSearchInput, searchResult } from './search'
import { ageText, installsText, pageOf, pageSizeFor } from './view'

const PANE = 'mod-gallery'
const TITLE = 'Mod Gallery'
const STORE_KEY = 'catalogue'
/** Bodies at least this wide set each fact's label in a column beside its value. */
const WIDE_COLUMNS = 60
const FACT_LABEL_COLUMNS = 18

const LOADING: Load = { kind: 'loading' }
const START: Browse = { query: '', page: 0, slug: null, notice: null }

// Change a tag when its value's fields change: it declines what an earlier version stored.
const load = atom({ plugin: 'mod-gallery', key: 'load' } as const, LOADING, { shape: 'load-1' })
const browse = atom({ plugin: 'mod-gallery', key: 'browse' } as const, START, {
  shape: 'browse-1',
})

type Ready = Extract<Load, { kind: 'ready' }>
type Loaded = Exclude<Load, { kind: 'loading' }>
/** The elements the pane draws with; a surface without `Input` gets the list without the filter. */
type Ui = Pick<Elements['terminal'], 'Box' | 'Button' | 'Link' | 'Text'> &
  Partial<Pick<Elements['terminal'], 'Input'>>

/** What the mod keeps in `$.store`: the body as fetched, checked again when read back. */
interface StoredCatalogue {
  fetchedAt: number
  text: string
}

/** What a failed fetch shows: the stored copy with the reason, or the reason alone. */
function stale(cached: ReturnType<typeof readCache>, reason: string): Loaded {
  return cached === undefined
    ? { kind: 'failed', reason }
    : { kind: 'ready', ...cached, refreshError: reason }
}

/** The stored catalogue while it is fresh, else a new fetch, else the stored one with the reason. */
async function loadCatalogue($: EngineInterface, isForced: boolean): Promise<Loaded> {
  const now = await $.clock.now()
  const cached = readCache(await $.store.get(STORE_KEY))
  if (cached !== undefined && !isForced && isFresh(cached.fetchedAt, now)) {
    return { kind: 'ready', ...cached, refreshError: null }
  }
  let response: { status: number; text: string }
  try {
    response = await $.http.fetch(CATALOGUE_URL, { headers: { accept: 'application/json' } })
  } catch {
    return stale(cached, 'statuslin.es could not be reached.')
  }
  const read = readCatalogueResponse(response)
  if (read.kind === 'refused') return stale(cached, read.reason)
  const stored: StoredCatalogue = { fetchedAt: now, text: response.text }
  await $.store.set(STORE_KEY, stored)
  return { kind: 'ready', catalogue: read.catalogue, fetchedAt: now, refreshError: null }
}

async function refresh($: EngineInterface, isForced: boolean): Promise<Loaded> {
  await update($, load, (shown) => (shown.kind === 'ready' ? shown : LOADING))
  const loaded = await loadCatalogue($, isForced)
  await update($, load, () => loaded)
  return loaded
}

const byline = (mod: GalleryMod) =>
  [`by ${mod.author}`, installsText(mod.installs)].filter(Boolean).join(' · ')

function ageLine(loaded: Ready, now: number): string {
  const { mods, dropped, generatedAt } = loaded.catalogue
  return [
    `${mods.length} reviewed mods`,
    `updated ${ageText(now - generatedAt)}`,
    ...(dropped > 0 ? [`${dropped} unreadable`] : []),
  ].join(' · ')
}

function listView(
  $: EngineInterface,
  props: {
    ui: Ui
    loaded: Ready
    at: Browse
    pageSize: number
    now: number
  },
) {
  const { ui, loaded, at, pageSize, now } = props
  const { Box, Button, Input, Text } = ui
  const matched = matchMods(loaded.catalogue.mods, at.query)
  const page = pageOf(matched, at.page, pageSize)
  const setQuery = (text: string) =>
    void update($, browse, (b) => ({ ...b, query: text.slice(0, MAX_QUERY_CHARS), page: 0 }))
  const turnTo = (index: number) => () => void update($, browse, (b) => ({ ...b, page: index }))
  const open = (mod: GalleryMod) => () =>
    void update($, browse, (b) => ({ ...b, slug: mod.slug, notice: null }))

  return (
    <Box flexDirection="column">
      {Input && (
        <Input
          key="filter"
          label="Filter"
          placeholder="words to match"
          value={at.query}
          onInput={setQuery}
          onSubmit={setQuery}
        />
      )}
      <Text dimColor wrap="truncate-end">
        {at.query.trim() === ''
          ? ageLine(loaded, now)
          : `${matched.length} of ${loaded.catalogue.mods.length} match`}
      </Text>
      {loaded.refreshError !== null && (
        <Text dimColor wrap="truncate-end">
          Showing the copy from {ageText(now - loaded.fetchedAt)}: {loaded.refreshError}
        </Text>
      )}
      {matched.length === 0 && <Text>No reviewed mod matches.</Text>}
      {page.items.map((mod, index) => (
        <Box flexDirection="column" marginTop={1}>
          <Button
            key={mod.slug}
            plain
            hotkey={String(index + 1)}
            label={mod.title}
            onPress={open(mod)}
          />
          <Text dimColor wrap="truncate-end">
            {byline(mod)}
          </Text>
          <Text wrap="truncate-end">{mod.summary}</Text>
        </Box>
      ))}
      <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={1}>
        {page.index > 0 && (
          <Button key="previous" plain hotkey="p" label="Prev" onPress={turnTo(page.index - 1)} />
        )}
        {page.index < page.count - 1 && (
          <Button key="next" plain hotkey="n" label="Next" onPress={turnTo(page.index + 1)} />
        )}
        <Text dimColor>
          {page.index + 1}/{page.count}
        </Text>
        <Button
          key="refresh"
          plain
          hotkey="r"
          label="Refresh"
          onPress={() => void refresh($, true)}
        />
      </Box>
    </Box>
  )
}

function detailView(
  $: EngineInterface,
  props: {
    ui: Ui
    mod: GalleryMod
    notice: string | null
    isWide: boolean
  },
) {
  const { ui, mod, notice, isWide } = props
  const { Box, Button, Link, Text } = ui
  const page = modPageUrl(mod.slug)
  const facts = [...mod.facts, { label: 'License', value: mod.license ?? 'None given' }]
  const install = async () => {
    const filled = await $.prompt.fill({ text: installPrompt(mod.slug) })
    await update($, browse, (b) => ({
      ...b,
      notice: filled.isFilled
        ? 'The install prompt is in your prompt box, in place of anything you had typed. Read it there and send it when you are ready. Nothing runs until you do.'
        : 'The prompt box could not take the install prompt. Close any open dialog and press Install again.',
    }))
  }
  const back = () => void update($, browse, (b) => ({ ...b, slug: null, notice: null }))

  return (
    <Box flexDirection="column">
      <Text bold>{mod.title}</Text>
      <Text dimColor>{byline(mod)}</Text>
      <Box marginTop={1}>
        <Text>{mod.summary}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {facts.map((fact) => (
          <Box flexDirection={isWide ? 'row' : 'column'}>
            <Box width={isWide ? FACT_LABEL_COLUMNS : '100%'} flexShrink={0}>
              <Text dimColor>{fact.label}</Text>
            </Box>
            <Text>{fact.value}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Link href={page} />
      </Box>
      <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={1}>
        <Button key="install" plain hotkey="i" label="Install" onPress={() => void install()} />
        <Button key="back" plain hotkey="b" label="Back" onPress={back} />
      </Box>
      {notice !== null && (
        <Box marginTop={1}>
          <Text>{notice}</Text>
        </Box>
      )}
    </Box>
  )
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'gallery',
      description: 'Browse the reviewed mods on statuslin.es and install one',
      argumentHint: '[search]',
    })
    await $.tool.register({
      name: 'search_mods',
      description:
        'Search the reviewed Claude Code mods listed on statuslin.es: what each does, its install count, and what it can reach (network, files, your tokens, slash commands). Use it when the person asks whether a mod exists for something. It answers data only and installs nothing; to install one, the person runs /gallery <slug> and presses Install.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Words a mod must match, such as "usage limits"; empty for the top of the gallery.',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            description: 'The most mods to answer, 5 by default.',
          },
        },
        required: ['query'],
      },
    })
    return next(e)
  })

  on('command.run', { command: 'gallery' }, async ($, e) => {
    const query = e.args.trim().slice(0, MAX_QUERY_CHARS)
    await update($, browse, () => ({ ...START, query }))
    const opened = await $.ui.open({
      id: PANE,
      title: TITLE,
      focus: true,
      closeOnEscape: true,
      rows: 30,
      columns: 64,
    })
    const loaded = await refresh($, false)
    const named = loaded.kind === 'ready' && loaded.catalogue.mods.find((mod) => mod.slug === query)
    if (named) await update($, browse, (b) => ({ ...b, slug: named.slug }))
    return {
      text: opened.isPlaced
        ? 'Mod Gallery is open.'
        : `Mod Gallery could not open: ${opened.reason}`,
    }
  })

  on('tool.call', { tool: 'mcp__mod-gallery__search_mods' }, async ($, e) => {
    const input = readSearchInput({ query: e.query, limit: e.limit })
    if ('error' in input) return { result: input.error }
    const loaded = await loadCatalogue($, false)
    if (loaded.kind !== 'ready') {
      return { result: `The statuslin.es catalogue could not be loaded: ${loaded.reason}` }
    }
    return { result: searchResult(loaded.catalogue, input) }
  }).catch(() => ({ result: 'Mod Gallery failed while searching the catalogue.' }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const [loaded, at, now] = await Promise.all([read($, load), read($, browse), $.clock.now()])

    if (loaded.kind === 'loading') {
      return <Text dimColor>Loading the reviewed mods from statuslin.es…</Text>
    }
    if (loaded.kind === 'failed') {
      return (
        <Box flexDirection="column">
          <Text>The catalogue could not be loaded.</Text>
          <Text dimColor>{loaded.reason}</Text>
          <Button
            key="retry"
            plain
            hotkey="r"
            label="Retry"
            onPress={() => void refresh($, true)}
          />
        </Box>
      )
    }
    const mod = loaded.catalogue.mods.find((one) => one.slug === at.slug)
    return mod === undefined
      ? listView($, {
          ui,
          loaded,
          at,
          pageSize: pageSizeFor(e.props.scroll.bodyRows),
          now,
        })
      : detailView($, {
          ui,
          mod,
          notice: at.notice,
          isWide: e.props.bodyColumns >= WIDE_COLUMNS,
        })
  })
}

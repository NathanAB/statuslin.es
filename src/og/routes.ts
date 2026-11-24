import type { PgDatabase } from 'drizzle-orm/pg-core'
import { db as defaultDb } from '@/db'
import { getConfigBySlug } from '@/gallery/queries'
import { getModDesktopShotPng } from '@/mods/desktop-shot'
import { getModDetail, type ModDetail } from '@/mods/queries'
import { terminalResult } from '@/mods/terminal-result'
import { configCard, homeCard, type ModCardBody, modCard, themesCard } from '@/og/card'
import { toElementPng } from '@/og/render'
import type { ThemeScreen } from '@/og/theme-screen'
import { getPublishedModThemes, getThemeCards, type PublishedTheme } from '@/themes/queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver; query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

// The home card never changes within a process — render once, then reuse the bytes.
let homePngCache: Uint8Array | null = null

async function homePngBytes(): Promise<Uint8Array> {
  if (!homePngCache) homePngCache = await toElementPng(homeCard())
  return homePngCache
}

// Every card can change: a config or mod moves to a new version, and the home card draws the hero's
// copy. An hour lets scrapers pick that up without a new URL.
const CARD_CACHE = 'public, max-age=3600'

function pngResponse(bytes: Uint8Array): Response {
  // Blob accepts the typed array directly (BlobPart), so we don't rely on bytes.buffer being the
  // exact PNG — a subarray view would otherwise leak its whole backing buffer into the response.
  return new Response(new Blob([bytes as BufferSource]), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': CARD_CACHE },
  })
}

export async function homeCardResponse(): Promise<Response> {
  return pngResponse(await homePngBytes())
}

/** Per-config card. Unknown/unpublished slug → the home card BYTES: this URL is keyed to a slug
 * that may publish later, and the cached fallback expires so scrapers refetch the real card once it
 * exists. Always 200 — a shared link never 404s a scraper. */
export async function configCardResponse(db: Db, slug: string): Promise<Response> {
  const detail = await getConfigBySlug(db, slug)
  if (!detail) return pngResponse(await homePngBytes())
  const author = detail.author?.username
    ? `@${detail.author.username}`
    : (detail.author?.name ?? null)
  const png = await toElementPng(
    configCard({ title: detail.title, author, previews: detail.previews }),
  )
  return pngResponse(png)
}

/** Route-level wrapper: uses the real production db so route files don't import @/db directly
 * (the routes-no-direct-db boundary rule). Tests use configCardResponse(db, slug) with
 * an injected PGlite db instead. */
export async function configCardResponseForRoute(slug: string): Promise<Response> {
  return configCardResponse(defaultDb, slug)
}

type TerminalTheme = Extract<PublishedTheme, { kind: 'terminal' }>

const terminalThemes = (themes: PublishedTheme[]): TerminalTheme[] =>
  themes.filter((theme): theme is TerminalTheme => theme.kind === 'terminal')

/** What a mod's card draws: its terminal preview, else its Desktop shot, which satori only reads
 * inline, else neither. A theme plugin's own recording shows nothing of its themes, so its card
 * draws the first of them in name order instead. */
async function modCardBody(db: Db, mod: ModDetail): Promise<ModCardBody> {
  if (mod.themeOnly) {
    const themes = terminalThemes(await getPublishedModThemes(db, mod.slug))
    const [first] = themes
    if (first) {
      return {
        kind: 'themes',
        count: themes.length,
        first: { segments: first.preview, window: first.window },
      }
    }
  }
  const terminal = terminalResult(mod.preview)
  if (terminal.kind === 'drew') return { kind: 'terminal', segments: terminal.segments }
  const shot = await getModDesktopShotPng(db, mod.slug)
  if (!shot) return { kind: 'none' }
  const src = `data:image/png;base64,${Buffer.from(shot.png).toString('base64')}`
  return { kind: 'desktop', shot: { src, width: shot.width, height: shot.height } }
}

/** Per-mod card. Unlike the config card, a draft, removed or unknown slug is a 404: there is no
 * mod page behind it to share. A published mod gets 1h, since a mod can move to a new version. */
export async function modCardResponse(db: Db, slug: string): Promise<Response> {
  const mod = await getModDetail(db, slug)
  if (!mod) return new Response('Not found', { status: 404 })
  const png = await toElementPng(
    modCard({ title: mod.title, authorGithub: mod.authorGithub, body: await modCardBody(db, mod) }),
  )
  return pngResponse(png)
}

export async function modCardResponseForRoute(slug: string): Promise<Response> {
  return modCardResponse(defaultDb, slug)
}

/** The top terminal theme, beside the top one made for the other window so the card shows a light
 * and a dark look, else beside the next one. A card draws a terminal screen, not a Desktop shot. */
function themesCardScreens(published: PublishedTheme[]): ThemeScreen[] {
  const themes = terminalThemes(published)
  const [first] = themes
  if (!first) return []
  const second = themes.find((theme) => theme.window !== first.window) ?? themes[1]
  return [first, second]
    .filter((theme): theme is TerminalTheme => theme !== undefined)
    .map((theme) => ({ segments: theme.preview, window: theme.window }))
}

/** /themes' card, from the live themes in /themes' order. With none published yet, the home card
 * BYTES, as for an unknown status line: the hour's cache lets the real card replace it. */
export async function themesCardResponse(db: Db): Promise<Response> {
  const themes = await getThemeCards(db)
  const screens = themesCardScreens(themes)
  if (screens.length === 0) return pngResponse(await homePngBytes())
  return pngResponse(await toElementPng(themesCard({ count: themes.length, screens })))
}

export async function themesCardResponseForRoute(): Promise<Response> {
  return themesCardResponse(defaultDb)
}

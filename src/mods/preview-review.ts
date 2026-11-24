import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { modDesktopPreviews, modPreviews, mods, modThemes, modVersions } from '@/db/schema'
import type { AnsiSegment } from '@/render/types'
import { getReviewThemes, type ReviewTheme } from '@/review/theme-review'
import { fenceUntrusted, type VersionPin } from './content-prompt'
import { desktopPreviewJoin, terminalPreviewJoin } from './queries'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** What a human compares before a mod's previews go live: the README beside both previews. */
export interface PreviewReview {
  pin: VersionPin
  readme: string | null
  /** Empty when the mod draws nothing in the terminal. */
  terminal: AnsiSegment[]
  /** Null when the mod draws nothing in Claude Desktop. */
  desktopPng: Uint8Array | null
  /**
   * The themes the version carries, each reviewed on /admin with its preview and file. /admin shows
   * only a plugin's newest version, so an older one's themes are read at its commit instead.
   */
  themes: {
    terminal: number
    desktop: number
    versionNumber: number
    newestVersionNumber: number
    /** The live version's number when one is live and differs from this one, else null. */
    liveVersionNumber: number | null
    /** The themes new or changed since the live version, in name order. */
    changed: ReviewTheme[]
  }
}

/** Saves a PNG where the operator can open it, and returns its path. */
export type PngWriter = (fileName: string, png: Uint8Array) => string

export const writeTmpPng: PngWriter = (fileName, png) => {
  const path = join(tmpdir(), fileName)
  writeFileSync(path, png)
  return path
}

const README_MAX_LINES = 60
const README_MAX_CHARS = 4000

function readmeLines(pin: VersionPin, readme: string | null): string[] {
  if (readme === null) return ['This mod has no README.']
  const excerpt = readme
    .slice(0, README_MAX_CHARS)
    .split('\n')
    .slice(0, README_MAX_LINES)
    .join('\n')
  const fenced = fenceUntrusted(pin, excerpt)
  return [
    ...fenced.warning.split('\n'),
    ...fenced.block.split('\n'),
    ...(excerpt.length < readme.length ? ['(README cut)'] : []),
  ]
}

function terminalLines(segments: AnsiSegment[]): string[] {
  if (segments.length === 0) return ['terminal preview: draws nothing in the terminal']
  const rows = segments
    .map((segment) => segment.text)
    .join('')
    .split('\n')
  return ['terminal preview:', ...rows.map((row) => `  ${row}`)]
}

function desktopLine({ pin, desktopPng }: PreviewReview, writePng: PngWriter): string {
  if (!desktopPng) return 'Claude Desktop: draws nothing in Claude Desktop'
  const name = `${pin.slug.replace(/[^a-z0-9-]/gi, '_')}-${pin.commitSha.slice(0, 12)}-desktop.png`
  return `Claude Desktop shot: ${writePng(name, desktopPng)}`
}

const counted = (count: number, kind: string) =>
  count === 0 ? [] : [`${count} ${kind} ${count === 1 ? 'theme' : 'themes'}`]

const themeWhere = (theme: ReviewTheme) =>
  theme.kind === 'terminal' ? `themes/${theme.key}.json` : `Desktop theme ${theme.key}`

/** One WARN line per theme new or changed since the live version, so none hides in a long pack. */
function changedThemeLines({ changed, liveVersionNumber }: PreviewReview['themes']): string[] {
  return changed.map(
    (theme) =>
      `WARN theme-${theme.change}: "${theme.name}" (${themeWhere(theme)}) ${theme.change === 'new' ? 'is new' : 'changed'} since the live version v${liveVersionNumber}. Read it on /admin before --apply.`,
  )
}

function themesLines({ pin, themes }: PreviewReview): string[] {
  const { versionNumber: v, newestVersionNumber: newest } = themes
  const kinds = [...counted(themes.terminal, 'terminal'), ...counted(themes.desktop, 'Desktop')]
  if (kinds.length === 0) return []
  return [
    `themes: ${kinds.join(' and ')} in v${v} at ${pin.commitSha}. Read each theme's preview beside its exact file or switch steps on /admin, under "Curated theme plugins", before --apply.`,
    ...(v < newest
      ? [
          `WARN themes-not-newest: v${v} is not this plugin's newest version (v${newest}), and /admin shows only the newest version's themes. Read v${v}'s theme files at ${pin.commitSha} before --apply.`,
        ]
      : []),
    ...changedThemeLines(themes),
  ]
}

/** The lines carry author text unescaped; print each through `terminalLine`. */
export function previewReviewLines(review: PreviewReview, writePng: PngWriter): string[] {
  return [
    `review ${review.pin.slug} at ${review.pin.commitSha}: does each preview show what the README says the mod draws?`,
    ...readmeLines(review.pin, review.readme),
    ...terminalLines(review.terminal),
    desktopLine(review, writePng),
    ...themesLines(review),
  ]
}

/** A rendered version's stored clean-main previews, as the gallery would show them. */
export async function storedPreviews(
  db: Db,
  versionId: string,
): Promise<Pick<PreviewReview, 'terminal' | 'desktopPng' | 'themes'>> {
  const [row] = await db
    .select({
      segments: modPreviews.segments,
      png: modDesktopPreviews.png,
      terminalThemes: sql<number>`(select count(*) from ${modThemes} where ${modThemes.modVersionId} = ${modVersions.id} and ${modThemes.kind} = 'terminal')::int`,
      desktopThemes: sql<number>`(select count(*) from ${modThemes} where ${modThemes.modVersionId} = ${modVersions.id} and ${modThemes.kind} = 'desktop')::int`,
      versionNumber: modVersions.versionNumber,
      newestVersionNumber: sql<number>`(select max(newest.version_number) from ${modVersions} newest where newest.mod_id = ${modVersions.modId})::int`,
      modStatus: mods.status,
      currentVersionId: mods.currentVersionId,
    })
    .from(modVersions)
    .innerJoin(mods, eq(mods.id, modVersions.modId))
    .leftJoin(modPreviews, terminalPreviewJoin)
    .leftJoin(modDesktopPreviews, desktopPreviewJoin)
    .where(eq(modVersions.id, versionId))
  const live = row?.modStatus === 'published' ? (row.currentVersionId ?? null) : null
  const liveId = live === versionId ? null : live
  const themes = (await getReviewThemes(db, [{ id: versionId, liveId }])).get(versionId) ?? []
  const [liveVersion] =
    liveId === null
      ? []
      : await db
          .select({ versionNumber: modVersions.versionNumber })
          .from(modVersions)
          .where(eq(modVersions.id, liveId))
  return {
    terminal: row?.segments ?? [],
    desktopPng: row?.png ?? null,
    themes: {
      terminal: row?.terminalThemes ?? 0,
      desktop: row?.desktopThemes ?? 0,
      versionNumber: row?.versionNumber ?? 0,
      newestVersionNumber: row?.newestVersionNumber ?? 0,
      liveVersionNumber: liveVersion?.versionNumber ?? null,
      changed: themes.filter((theme) => theme.change !== null),
    },
  }
}

import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { modDesktopPreviews, modPreviews, modVersions } from '@/db/schema'
import type { AnsiSegment } from '@/render/types'
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

/** The lines carry author text unescaped; print each through `terminalLine`. */
export function previewReviewLines(review: PreviewReview, writePng: PngWriter): string[] {
  return [
    `review ${review.pin.slug} at ${review.pin.commitSha}: does each preview show what the README says the mod draws?`,
    ...readmeLines(review.pin, review.readme),
    ...terminalLines(review.terminal),
    desktopLine(review, writePng),
  ]
}

/** A rendered version's stored clean-main previews, as the gallery would show them. */
export async function storedPreviews(
  db: Db,
  versionId: string,
): Promise<Pick<PreviewReview, 'terminal' | 'desktopPng'>> {
  const [row] = await db
    .select({ segments: modPreviews.segments, png: modDesktopPreviews.png })
    .from(modVersions)
    .leftJoin(modPreviews, terminalPreviewJoin)
    .leftJoin(modDesktopPreviews, desktopPreviewJoin)
    .where(eq(modVersions.id, versionId))
  return { terminal: row?.segments ?? [], desktopPng: row?.png ?? null }
}

import { eq } from 'drizzle-orm'
import { configDesktopPreviews, configVersions } from '@/db/schema'
import { configDesktopPreviewPath } from '@/lib/site'
import type { DesktopShotImage } from '@/ui/desktop-shot'

/** How a status line looks in Claude Desktop through statusline-anywhere, or that it drew nothing. */
export type ConfigDesktopPreview = { kind: 'shot'; shot: DesktopShotImage } | { kind: 'nothing' }

/** Joins a version's Desktop result. */
export const configDesktopPreviewJoin = eq(configDesktopPreviews.configVersionId, configVersions.id)

/** What `configDesktopPreview` reads. Never the PNG, which only the image route sends. */
export const configDesktopPreviewColumns = {
  versionId: configDesktopPreviews.configVersionId,
  kind: configDesktopPreviews.kind,
  width: configDesktopPreviews.width,
  height: configDesktopPreviews.height,
  renderedAt: configDesktopPreviews.createdAt,
}

type Nullable<T> = { [K in keyof T]: T[K] | null }
type ConfigDesktopPreviewRow = Nullable<
  Pick<typeof configDesktopPreviews.$inferSelect, 'kind' | 'width' | 'height'> & {
    versionId: string
    renderedAt: Date
  }
>

/** The left-joined `configDesktopPreviewColumns`, or null when the version has no result yet. */
export function configDesktopPreview(
  row: ConfigDesktopPreviewRow | null,
): ConfigDesktopPreview | null {
  if (row?.kind === 'nothing') return { kind: 'nothing' }
  const { versionId, width, height, renderedAt } = row ?? {}
  // The table's check constraint gives every shot a size.
  if (row?.kind !== 'shot' || !versionId || !renderedAt || !width || !height) return null
  return {
    kind: 'shot',
    shot: { src: configDesktopPreviewPath(versionId, renderedAt), width, height },
  }
}

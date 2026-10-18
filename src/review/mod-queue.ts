import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import {
  type ModFootprint,
  type ModStatus,
  modDesktopPreviews,
  modPreviews,
  mods,
  modVersions,
  submissions,
  user,
} from '@/db/schema'
import { publishGuards } from '@/mods/publish'
import { desktopPreviewJoin, terminalPreviewJoin, versionIsRendered } from '@/mods/queries'
import type { AnsiSegment } from '@/render/types'
import { adminModDesktopPreviewPath } from './mod-desktop-preview'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** A mod version's source, as a reviewer reads it. */
export interface ModReviewVersion {
  id: string
  versionNumber: number
  repoUrl: string
  path: string
  commitSha: string
  pluginVersion: string | null
  license: string | null
  footprint: ModFootprint
}

/** A submitted mod version on /admin. */
export interface ModReviewRow {
  mod: {
    id: string
    slug: string
    pluginName: string
    title: string
    description: string
    status: ModStatus
    authorGithub: string
  }
  version: ModReviewVersion & {
    /** The submission's review status. */
    status: string
    createdAt: Date
    rejectionReason: string | null
    rejectionEmailStatus: string | null
    approvalEmailStatus: string | null
  }
  submitter: { name: string; username: string | null; image: string | null } | null
  /** Rendered on both surfaces, so it can be approved. */
  rendered: boolean
  /** The terminal preview: null before it renders, empty when the mod drew nothing there. */
  preview: AnsiSegment[] | null
  /** Null before it renders. */
  desktop: { kind: 'shot'; src: string; width: number; height: number } | { kind: 'nothing' } | null
  /** On a pending update: the version live now. */
  live?: ModReviewVersion
  /** What publish-mod.ts warns about an update: a moved source, a grown footprint, an unchanged version. */
  warnings: string[]
}

const UNDELIVERED = ['pending', 'sending', 'failed', 'unavailable', 'ambiguous']

const versionColumns = {
  id: modVersions.id,
  versionNumber: modVersions.versionNumber,
  repoUrl: modVersions.repoUrl,
  path: modVersions.path,
  commitSha: modVersions.commitSha,
  pluginVersion: modVersions.pluginVersion,
  license: modVersions.license,
  footprint: modVersions.footprint,
}

type DesktopColumns = {
  kind: 'shot' | 'nothing' | null
  width: number | null
  height: number | null
}

/** The admin-only image for a shot; the public route serves published current versions alone. */
function desktopFor(versionId: string, desktop: DesktopColumns | null): ModReviewRow['desktop'] {
  if (desktop?.kind === 'nothing') return { kind: 'nothing' }
  if (desktop?.kind !== 'shot' || !desktop.width || !desktop.height) return null
  const src = adminModDesktopPreviewPath(versionId)
  return { kind: 'shot', src, width: desktop.width, height: desktop.height }
}

/** The warnings publish shows; approving checks the refusals itself, against GitHub. */
function updateWarnings(
  row: { mod: ModReviewRow['mod']; version: ModReviewVersion; rendered: boolean },
  live: ModReviewVersion,
): string[] {
  const guards = publishGuards({
    slug: row.mod.slug,
    modStatus: row.mod.status,
    description: row.mod.description,
    target: { ...row.version, rendered: row.rendered },
    current: { ...live, rendered: true },
    onDefaultBranch: true,
    filesChanged: null,
    comparedToLive: null,
  })
  return guards.filter((guard) => guard.level === 'warn').map((guard) => guard.message)
}

/**
 * Mod submissions an admin acts on: pending ones, then decided ones whose email hasn't gone out.
 * Curated mods have no submission, so they never appear here.
 */
export async function getModReviewRows(database: Db): Promise<ModReviewRow[]> {
  const rows = await database
    .select({
      mod: {
        id: mods.id,
        slug: mods.slug,
        pluginName: mods.pluginName,
        title: mods.title,
        description: mods.description,
        status: mods.status,
        authorGithub: mods.authorGithub,
        currentVersionId: mods.currentVersionId,
      },
      version: {
        ...versionColumns,
        status: submissions.status,
        createdAt: submissions.createdAt,
        rejectionReason: submissions.rejectionReason,
        rejectionEmailStatus: submissions.rejectionEmailStatus,
        approvalEmailStatus: submissions.approvalEmailStatus,
      },
      submitter: { name: user.name, username: user.username, image: user.image },
      rendered: sql<boolean>`${versionIsRendered}`,
      preview: modPreviews.segments,
      desktop: {
        kind: modDesktopPreviews.kind,
        width: modDesktopPreviews.width,
        height: modDesktopPreviews.height,
      },
    })
    .from(submissions)
    .innerJoin(modVersions, eq(modVersions.id, submissions.modVersionId))
    .innerJoin(mods, eq(mods.id, modVersions.modId))
    .leftJoin(user, eq(user.id, submissions.submittedBy))
    .leftJoin(modPreviews, terminalPreviewJoin)
    .leftJoin(modDesktopPreviews, desktopPreviewJoin)
    .where(
      or(
        eq(submissions.status, 'pending'),
        and(
          eq(submissions.status, 'rejected'),
          inArray(submissions.rejectionEmailStatus, UNDELIVERED),
        ),
        and(
          eq(submissions.status, 'approved'),
          inArray(submissions.approvalEmailStatus, UNDELIVERED),
        ),
      ),
    )
    .orderBy(desc(submissions.createdAt))
    .limit(50)
  const liveIds = rows.flatMap(({ mod, version }) =>
    mod.status === 'published' && mod.currentVersionId && mod.currentVersionId !== version.id
      ? [mod.currentVersionId]
      : [],
  )
  const liveRows =
    liveIds.length > 0
      ? await database
          .select({ ...versionColumns, modId: modVersions.modId })
          .from(modVersions)
          .where(inArray(modVersions.id, liveIds))
      : []
  const liveById = new Map(
    liveRows.map(({ modId, ...version }) => [version.id, { modId, version }]),
  )
  return rows.map(({ mod: { currentVersionId, ...mod }, desktop, ...row }) => {
    const pointed = currentVersionId ? liveById.get(currentVersionId) : undefined
    // A pointer at another mod's version is no live version of this one.
    const live =
      row.version.status === 'pending' && pointed?.modId === mod.id ? pointed.version : undefined
    return {
      ...row,
      mod,
      desktop: desktopFor(row.version.id, desktop),
      ...(live ? { live } : {}),
      warnings: live ? updateWarnings({ ...row, mod }, live) : [],
    }
  })
}

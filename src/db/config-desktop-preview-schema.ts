import { sql } from 'drizzle-orm'
import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { DesktopRecording } from '../render/mods/desktop/types'
import { bytea } from './mod-schema'
import { configVersions } from './schema'

/**
 * A status line version's Claude Desktop preview, drawn by statusline-anywhere: the band it draws
 * above the prompt, or the fact that it drew nothing there.
 */
export const configDesktopPreviews = pgTable(
  'config_desktop_previews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    configVersionId: uuid('config_version_id')
      .notNull()
      .unique()
      .references(() => configVersions.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<DesktopRecording['kind']>().notNull(),
    /** Untrusted pixels, served only as image/png. */
    png: bytea('png'),
    /** CSS pixels; the PNG is recorded at a higher device scale. */
    width: integer('width'),
    height: integer('height'),
    desktopVersion: text('desktop_version').notNull(),
    engineVersion: text('engine_version').notNull(),
    /** The statusline-anywhere commit that drew it. */
    modCommitSha: text('mod_commit_sha').notNull(),
    /** Reset on every re-record: the image URL names it, so a new recording is a new URL. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'config_desktop_previews_kind_check',
      // IS TRUE, so a null size fails the check instead of passing it as unknown.
      sql`((${t.kind} = 'shot' AND ${t.png} IS NOT NULL AND ${t.width} > 0 AND ${t.height} > 0) OR (${t.kind} = 'nothing' AND ${t.png} IS NULL AND ${t.width} IS NULL AND ${t.height} IS NULL)) IS TRUE`,
    ),
  ],
)

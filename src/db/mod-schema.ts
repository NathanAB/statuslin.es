import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { DesktopRecording, DesktopShot } from '../render/mods/desktop/types'
import type { AnsiSegment } from '../render/types'

export type ModStatus = 'draft' | 'published' | 'removed'

/** What a mod touches, as `claude plugin validate --json` reports it. */
export type ModFootprint = { events: string[]; calls: string[] }

export type ModInputSteps = unknown[]

export const mods = pgTable('mods', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  pluginName: text('plugin_name').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  authorGithub: text('author_github').notNull(),
  status: text('status').$type<ModStatus>().notNull().default('draft'),
  currentVersionId: uuid('current_version_id'),
  tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  allTags: jsonb('all_tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  copyCount: integer('copy_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const modVersions = pgTable(
  'mod_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modId: uuid('mod_id')
      .notNull()
      .references(() => mods.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    repoUrl: text('repo_url').notNull(),
    path: text('path').notNull().default(''),
    commitSha: text('commit_sha').notNull(),
    pluginVersion: text('plugin_version'),
    license: text('license'),
    footprint: jsonb('footprint').$type<ModFootprint>().notNull(),
    validatedWith: text('validated_with').notNull(),
    inputSteps: jsonb('input_steps').$type<ModInputSteps>().notNull().default(sql`'[]'::jsonb`),
    /** Site-relative path to a static Claude Desktop screenshot, for mods that draw only there. */
    desktopScreenshot: text('desktop_screenshot'),
    generatedContent: jsonb('generated_content'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mod_versions_mod_version_uq').on(t.modId, t.versionNumber),
    uniqueIndex('mod_versions_repo_path_commit_uq').on(t.repoUrl, t.path, t.commitSha),
    check('mod_versions_commit_sha_check', sql`${t.commitSha} ~ '^[0-9a-f]{40}$'`),
    check(
      'mod_versions_repo_url_check',
      sql`${t.repoUrl} ~ '^https://github\\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+$' AND ${t.repoUrl} !~* '(\\.git|/\\.{1,2})$'`,
    ),
    check(
      'mod_versions_path_check',
      sql`${t.path} ~ '^([A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*)?$' AND ${t.path} !~ '(^|/)\\.{1,2}(/|$)'`,
    ),
  ],
)

export const modPreviews = pgTable(
  'mod_previews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modVersionId: uuid('mod_version_id')
      .notNull()
      .references(() => modVersions.id, { onDelete: 'cascade' }),
    scenarioKey: text('scenario_key').notNull(),
    /** Empty when the mod drew nothing in the terminal. */
    segments: jsonb('segments').$type<AnsiSegment[]>().notNull(),
    claudeCodeVersion: text('claude_code_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('mod_previews_version_scenario_uq').on(t.modVersionId, t.scenarioKey)],
)

const bytea = customType<{ data: Uint8Array }>({ dataType: () => 'bytea' })

/** A mod's Claude Desktop preview: a PNG shot, or the fact that it drew nothing there. */
export const modDesktopPreviews = pgTable(
  'mod_desktop_previews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modVersionId: uuid('mod_version_id')
      .notNull()
      .references(() => modVersions.id, { onDelete: 'cascade' }),
    scenarioKey: text('scenario_key').notNull(),
    kind: text('kind').$type<DesktopRecording['kind']>().notNull(),
    /** Untrusted pixels, served only as image/png. */
    png: bytea('png'),
    /** CSS pixels; the PNG is recorded at a higher device scale. */
    width: integer('width'),
    height: integer('height'),
    cardAnchor: text('card_anchor').$type<DesktopShot['cardAnchor']>(),
    desktopVersion: text('desktop_version').notNull(),
    engineVersion: text('engine_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mod_desktop_previews_version_scenario_uq').on(t.modVersionId, t.scenarioKey),
    check(
      'mod_desktop_previews_kind_check',
      // IS TRUE, so a null width or anchor fails the check instead of passing it as unknown.
      sql`((${t.kind} = 'shot' AND ${t.png} IS NOT NULL AND ${t.width} > 0 AND ${t.height} > 0 AND ${t.cardAnchor} IN ('top', 'bottom')) OR (${t.kind} = 'nothing' AND ${t.png} IS NULL AND ${t.width} IS NULL AND ${t.height} IS NULL AND ${t.cardAnchor} IS NULL)) IS TRUE`,
    ),
  ],
)

export const modCopyEvents = pgTable(
  'mod_copy_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modId: uuid('mod_id')
      .notNull()
      .references(() => mods.id, { onDelete: 'cascade' }),
    ipHash: text('ip_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('mod_copy_events_mod_ip_uq').on(t.modId, t.ipHash)],
)

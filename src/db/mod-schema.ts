import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { type CardSurface, TERMINAL_CARD_SURFACE } from '../lib/card-surface'
import type { DesktopRecording } from '../render/mods/desktop/types'
import type { AnsiSegment } from '../render/types'

const MOD_STATUSES = ['draft', 'published', 'removed'] as const
export type ModStatus = (typeof MOD_STATUSES)[number]

/** What a mod touches, as `claude plugin validate --json` reports it. */
export type ModFootprint = { events: string[]; calls: string[] }

export type ModInputSteps = unknown[]

/** Claude Code's plugin id rule (src/mods/curation.ts): a slug lands in marketplace entries and shell commands. */
const PLUGIN_ID = '^[A-Za-z0-9][A-Za-z0-9._-]*$'

export const mods = pgTable(
  'mods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Fixed once the mod leaves draft (ADR 0005): a trigger in drizzle/0041_mods_slug_immutable.sql. */
    slug: text('slug').notNull().unique(),
    /** plugin.json's name. Two mods can share it; the slug names the marketplace entry (ADR 0005). */
    pluginName: text('plugin_name').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    authorGithub: text('author_github').notNull(),
    status: text('status').$type<ModStatus>().notNull().default('draft'),
    /** One of this mod's own versions: a deferred foreign key in drizzle/0042_mods_current_version_fk.sql. */
    currentVersionId: uuid('current_version_id'),
    tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    allTags: jsonb('all_tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    copyCount: integer('copy_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('mods_slug_check', sql`${t.slug} ~ ${sql.raw(`'${PLUGIN_ID}'`)}`),
    check('mods_plugin_name_check', sql`${t.pluginName} ~ ${sql.raw(`'${PLUGIN_ID}'`)}`),
    check(
      'mods_status_check',
      sql`${t.status} IN (${sql.raw(MOD_STATUSES.map((status) => `'${status}'`).join(', '))})`,
    ),
  ],
)

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
    cardSurface: text('card_surface').$type<CardSurface>(),
    generatedContent: jsonb('generated_content'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The key mods.current_version_id references with mods.id, so a mod's live version is its own.
    unique('mod_versions_id_mod_uq').on(t.id, t.modId),
    uniqueIndex('mod_versions_mod_version_uq').on(t.modId, t.versionNumber),
    // Per mod: until one is approved, two users' submissions may pin the same commit of a folder.
    uniqueIndex('mod_versions_mod_source_uq').on(t.modId, t.repoUrl, t.path, t.commitSha),
    check('mod_versions_commit_sha_check', sql`${t.commitSha} ~ '^[0-9a-f]{40}$'`),
    check(
      'mod_versions_repo_url_check',
      sql`${t.repoUrl} ~ '^https://github\\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+$' AND ${t.repoUrl} !~* '(\\.git|/\\.{1,2})$'`,
    ),
    check(
      'mod_versions_card_surface_check',
      sql`${t.cardSurface} = ${sql.raw(`'${TERMINAL_CARD_SURFACE}'`)}`,
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

export const bytea = customType<{ data: Uint8Array }>({ dataType: () => 'bytea' })

/**
 * A mod's Claude Desktop preview: a PNG shot for its page and a smaller one for its card, or the
 * fact that it drew nothing there.
 */
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
    /** The card's image: the band the mod draws above the prompt box, or the top of the shot. */
    cardPng: bytea('card_png'),
    cardWidth: integer('card_width'),
    cardHeight: integer('card_height'),
    desktopVersion: text('desktop_version').notNull(),
    engineVersion: text('engine_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mod_desktop_previews_version_scenario_uq').on(t.modVersionId, t.scenarioKey),
    check(
      'mod_desktop_previews_kind_check',
      // IS TRUE, so a null size fails the check instead of passing it as unknown.
      sql`((${t.kind} = 'shot' AND ${t.png} IS NOT NULL AND ${t.width} > 0 AND ${t.height} > 0 AND ${t.cardPng} IS NOT NULL AND ${t.cardWidth} > 0 AND ${t.cardHeight} > 0) OR (${t.kind} = 'nothing' AND ${t.png} IS NULL AND ${t.width} IS NULL AND ${t.height} IS NULL AND ${t.cardPng} IS NULL AND ${t.cardWidth} IS NULL AND ${t.cardHeight} IS NULL)) IS TRUE`,
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

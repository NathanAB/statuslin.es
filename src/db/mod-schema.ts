import { type AnyColumn, type SQL, sql } from 'drizzle-orm'
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
import type { TerminalSetup } from '../render/mods/terminal'
import type { AnsiSegment } from '../render/types'
import {
  THEME_KEY,
  THEME_KEY_MAX,
  THEME_KINDS,
  THEME_NAME_MAX,
  THEME_WINDOWS,
  type ThemeKind,
  type ThemeWindow,
} from '../themes/theme'

const MOD_STATUSES = ['draft', 'published', 'removed'] as const
export type ModStatus = (typeof MOD_STATUSES)[number]

/** What a mod touches, as `claude plugin validate --json` reports it. */
export type ModFootprint = { events: string[]; calls: string[] }

export type ModInputSteps = unknown[]

/** Claude Code's plugin id rule (src/mods/curation.ts): a slug lands in marketplace entries and shell commands. */
const PLUGIN_ID = '^[A-Za-z0-9][A-Za-z0-9._-]*$'

/** The column holds a Claude Code plugin id. */
export const pluginIdCheck = (column: AnyColumn): SQL =>
  sql`${column} ~ ${sql.raw(`'${PLUGIN_ID}'`)}`

/** The rules src/mods/curation.ts checks a pinned plugin folder's fields by, kept by the database too. */
export const commitShaCheck = (column: AnyColumn): SQL => sql`${column} ~ '^[0-9a-f]{40}$'`

export const repoUrlCheck = (column: AnyColumn): SQL =>
  sql`${column} ~ '^https://github\\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+$' AND ${column} !~* '(\\.git|/\\.{1,2})$'`

export const pluginPathCheck = (column: AnyColumn): SQL =>
  sql`${column} ~ '^([A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*)?$' AND ${column} !~ '(^|/)\\.{1,2}(/|$)'`

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
    check('mods_slug_check', pluginIdCheck(t.slug)),
    check('mods_plugin_name_check', pluginIdCheck(t.pluginName)),
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
    /**
     * The hooks modules the plugin declares, each the code a visitor installs with it; empty for a
     * plugin of theme files alone. null for a version read before intake recorded them.
     */
    hooksModules: jsonb('hooks_modules').$type<string[]>(),
    validatedWith: text('validated_with').notNull(),
    inputSteps: jsonb('input_steps').$type<ModInputSteps>().notNull().default(sql`'[]'::jsonb`),
    cardSurface: text('card_surface').$type<CardSurface>(),
    /** null records the terminal preview in the default terminal. */
    terminal: jsonb('terminal').$type<TerminalSetup>(),
    generatedContent: jsonb('generated_content'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The key mods.current_version_id references with mods.id, so a mod's live version is its own.
    unique('mod_versions_id_mod_uq').on(t.id, t.modId),
    uniqueIndex('mod_versions_mod_version_uq').on(t.modId, t.versionNumber),
    // Per mod: until one is approved, two users' submissions may pin the same commit of a folder.
    uniqueIndex('mod_versions_mod_source_uq').on(t.modId, t.repoUrl, t.path, t.commitSha),
    check('mod_versions_commit_sha_check', commitShaCheck(t.commitSha)),
    check('mod_versions_repo_url_check', repoUrlCheck(t.repoUrl)),
    check(
      'mod_versions_card_surface_check',
      sql`${t.cardSurface} = ${sql.raw(`'${TERMINAL_CARD_SURFACE}'`)}`,
    ),
    check('mod_versions_path_check', pluginPathCheck(t.path)),
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

const inList = (column: AnyColumn, values: readonly string[]): SQL =>
  sql`${column} IN (${sql.raw(values.map((value) => `'${value}'`).join(', '))})`

/**
 * The themes a mod version carries, one row per card on /themes (ADR 0012). A terminal theme is
 * written with the version from what the inspection sandbox read at its pinned commit, and never
 * changed after. A Desktop theme is what the operator declared for the version (curation.json):
 * its mod's code draws it, so it has no file of its own, only the steps that switch to it.
 */
export const modThemes = pgTable(
  'mod_themes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modVersionId: uuid('mod_version_id')
      .notNull()
      .references(() => modVersions.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ThemeKind>().notNull(),
    /** A terminal theme's file slug, which the `theme` setting names; a Desktop theme's own key. */
    key: text('key').notNull(),
    /** The author's name for it, which `/theme` shows. Untrusted text. */
    name: text('name').notNull(),
    window: text('window').$type<ThemeWindow>().notNull(),
    /** A terminal theme's file exactly as pinned; null for a Desktop theme, which is code. */
    source: text('source'),
    /**
     * A Desktop theme's switch steps, each sent in a new Claude Desktop session: recorded, and shown
     * on its card. Empty when the mod sets the theme on its own; null for a terminal theme.
     */
    switchSteps: jsonb('switch_steps').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mod_themes_version_key_uq').on(t.modVersionId, t.kind, t.key),
    // A visitor picks a theme in `/theme` by its name, so one plugin never shows two alike.
    uniqueIndex('mod_themes_version_name_uq').on(t.modVersionId, t.kind, sql`lower(${t.name})`),
    check('mod_themes_kind_check', inList(t.kind, THEME_KINDS)),
    check(
      'mod_themes_kind_shape_check',
      // IS TRUE, so null switch steps fail the check instead of passing it as unknown.
      sql`((${t.kind} = 'terminal' AND ${t.source} IS NOT NULL AND ${t.switchSteps} IS NULL) OR (${t.kind} = 'desktop' AND ${t.source} IS NULL AND jsonb_typeof(${t.switchSteps}) = 'array')) IS TRUE`,
    ),
    check('mod_themes_window_check', inList(t.window, THEME_WINDOWS)),
    check(
      'mod_themes_key_check',
      sql`${t.key} ~ ${sql.raw(`'${THEME_KEY.source}'`)} AND length(${t.key}) <= ${sql.raw(String(THEME_KEY_MAX))}`,
    ),
    check(
      'mod_themes_name_check',
      sql`length(${t.name}) BETWEEN 1 AND ${sql.raw(String(THEME_NAME_MAX))}`,
    ),
  ],
)

/** A terminal theme's preview: the whole recorded screen with the theme selected. */
export const modThemePreviews = pgTable('mod_theme_previews', {
  id: uuid('id').primaryKey().defaultRandom(),
  themeId: uuid('theme_id')
    .notNull()
    .unique()
    .references(() => modThemes.id, { onDelete: 'cascade' }),
  segments: jsonb('segments').$type<AnsiSegment[]>().notNull(),
  claudeCodeVersion: text('claude_code_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const bytea = customType<{ data: Uint8Array }>({ dataType: () => 'bytea' })

/**
 * A Desktop theme's preview: the whole Claude Desktop window with the theme switched on, for its
 * plugin's page, and the same window smaller for its card. Untrusted pixels, served only as
 * image/png.
 */
export const modThemeDesktopPreviews = pgTable(
  'mod_theme_desktop_previews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    themeId: uuid('theme_id')
      .notNull()
      .unique()
      .references(() => modThemes.id, { onDelete: 'cascade' }),
    png: bytea('png').notNull(),
    /** CSS pixels; the PNG is recorded at a higher device scale. */
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    cardPng: bytea('card_png').notNull(),
    cardWidth: integer('card_width').notNull(),
    cardHeight: integer('card_height').notNull(),
    desktopVersion: text('desktop_version').notNull(),
    engineVersion: text('engine_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'mod_theme_desktop_previews_size_check',
      sql`${t.width} > 0 AND ${t.height} > 0 AND ${t.cardWidth} > 0 AND ${t.cardHeight} > 0`,
    ),
  ],
)

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

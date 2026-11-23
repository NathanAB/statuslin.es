import { type AnyColumn, type SQL, sql } from 'drizzle-orm'
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
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
import { bytea, modVersions } from './mod-schema'

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

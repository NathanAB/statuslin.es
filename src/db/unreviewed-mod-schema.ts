import { sql } from 'drizzle-orm'
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
import {
  commitShaCheck,
  type ModFootprint,
  pluginIdCheck,
  pluginPathCheck,
  repoUrlCheck,
} from './mod-schema'

/**
 * A mod statuslin.es has a page for and hasn't read (ADR 0011). Not a listing: no version, no slug,
 * no marketplace name. src/mods/unreviewed.json is the only source of which exist, and
 * `bun run import:unreviewed-mods` makes this table match it. Every text column but the pins came
 * from the author's repository and is untrusted.
 */
export const unreviewedMods = pgTable(
  'unreviewed_mods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** The repository owner as GitHub spells it; the page's address and canonical use this case. */
    owner: text('owner').notNull(),
    pluginName: text('plugin_name').notNull(),
    /** plugin.json's description. */
    description: text('description').notNull().default(''),
    repoUrl: text('repo_url').notNull(),
    path: text('path').notNull().default(''),
    commitSha: text('commit_sha').notNull(),
    committedAt: timestamp('committed_at', { withTimezone: true }).notNull(),
    pluginVersion: text('plugin_version'),
    license: text('license'),
    stars: integer('stars').notNull(),
    footprint: jsonb('footprint').$type<ModFootprint>().notNull(),
    validatedWith: text('validated_with').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // GitHub owners are case-insensitive, so two spellings would be one page.
    uniqueIndex('unreviewed_mods_owner_plugin_name_uq').on(sql`lower(${t.owner})`, t.pluginName),
    check('unreviewed_mods_owner_check', sql`${t.owner} ~ '^[A-Za-z0-9-]+$'`),
    check('unreviewed_mods_plugin_name_check', pluginIdCheck(t.pluginName)),
    check('unreviewed_mods_repo_url_check', repoUrlCheck(t.repoUrl)),
    check('unreviewed_mods_path_check', pluginPathCheck(t.path)),
    check('unreviewed_mods_commit_sha_check', commitShaCheck(t.commitSha)),
  ],
)

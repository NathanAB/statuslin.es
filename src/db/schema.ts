// App tables (configs/votes/etc.) arrive in later slices.
export * from './auth-schema'

import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { GeneratedContent } from '../content/types'
import type { AnsiSegment } from '../render/types'
import { user } from './auth-schema'

export const previews = pgTable(
  'previews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scriptSha: text('script_sha').notNull(),
    scenarioKey: text('scenario_key').notNull(),
    segments: jsonb('segments').notNull(),
    rawStdout: text('raw_stdout').notNull(),
    exitCode: integer('exit_code').notNull(),
    timedOut: integer('timed_out').notNull(),
    trace: jsonb('trace').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('previews_sha_scenario_uq').on(t.scriptSha, t.scenarioKey)],
)

export const configs = pgTable(
  'configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Curated facet tags from the fixed vocabulary in src/gallery/facets.ts (e.g. 'git',
     * 'token-usage'). Suggested by generate-content / the backfill script, human-confirmed. */
    tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** The full filterable/badge tag list: curated `tags` ∪ tags derived from the current
     * version (interpreter, network-access, reads-token). Materialized so the gallery filter
     * is one GIN-indexed `@>`. Recomputed on publish and after the tag classifier writes. */
    allTags: jsonb('all_tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status').notNull().default('draft'),
    currentVersionId: uuid('current_version_id'),
    upvoteCount: integer('upvote_count').notNull().default(0),
    copyCount: integer('copy_count').notNull().default(0),
    /** When the config first went live. Set once, at first approval; an approved update moves
     * only `currentVersionId`, so the gallery's `new` sort keeps the config's place. */
    firstPublishedAt: timestamp('first_published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Indexes the author_id FK (Postgres doesn't auto-index FK columns) so the
    // delete-user cascade and the submit rate-limit query (WHERE author_id ...
    // created_at) use an index instead of a seq scan.
    index('configs_author_created_idx').on(t.authorId, t.createdAt),
    // No gallery sort leads with (status, created_at) any more. New orders by first_published_at,
    // Top by copy_count, and Trending by time-decayed copy events. The gallery is small enough
    // that none of them needs its own index yet. Keep this index, and the historical upvote index
    // alongside the retained vote data.
    index('configs_status_created_idx').on(t.status, t.createdAt),
    index('configs_status_upvotes_idx').on(t.status, t.upvoteCount),
    // Supports the gallery tag filter's `all_tags @> '[...]'` containment check.
    index('configs_all_tags_gin').using('gin', t.allTags),
  ],
)

export const configVersions = pgTable(
  'config_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    configId: uuid('config_id')
      .notNull()
      .references(() => configs.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    source: text('source').notNull(),
    interpreter: text('interpreter').notNull(),
    contentSha256: text('content_sha256').notNull(),
    // Syntax-highlighted HTML of `source`, computed once at submit time (Shiki) and stored so the
    // detail read path skips re-highlighting on every render. Nullable: older rows and a best-effort
    // highlight failure fall back to live highlighting (resolveSourceHtml in src/lib/highlight.ts).
    sourceHtml: text('source_html'),
    networkHosts: jsonb('network_hosts').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    readsClaudeToken: boolean('reads_claude_token').notNull().default(false),
    /** SPDX license of third-party (seeded) source, e.g. 'MIT'. Null = submitter's own work (CC0 per terms). */
    license: text('license'),
    /** Permanent link to the upstream source at the pinned revision (seeded configs only). */
    sourceUrl: text('source_url'),
    // Auto-generated page copy (what it shows / requirements / behavior notes), written by
    // scripts/generate-content.ts via claude -p. Nullable: versions without it simply render
    // no content sections. Describes THIS version's script — regenerate when the script changes.
    generatedContent: jsonb('generated_content').$type<GeneratedContent>(),
    status: text('status').notNull().default('pending'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    rejectionEmailStatus: text('rejection_email_status'),
    rejectionEmailId: text('rejection_email_id'),
    rejectionEmailError: text('rejection_email_error'),
    rejectionEmailSentAt: timestamp('rejection_email_sent_at', { withTimezone: true }),
    approvalEmailStatus: text('approval_email_status'),
    approvalEmailId: text('approval_email_id'),
    approvalEmailError: text('approval_email_error'),
    approvalEmailSentAt: timestamp('approval_email_sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('config_versions_config_version_uq').on(t.configId, t.versionNumber)],
)

export const renderJobs = pgTable('render_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  configVersionId: uuid('config_version_id')
    .notNull()
    .references(() => configVersions.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export const votes = pgTable(
  'votes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    configId: uuid('config_id')
      .notNull()
      .references(() => configs.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('votes_user_config_uq').on(t.userId, t.configId)],
)

// One row per (config, hashed-client-IP) that copied a config. Its presence is what makes
// copyCount idempotent per person: recordCopy only bumps the counter when it inserts a new
// row here. ip_hash is an HMAC of the client IP (never the raw IP). The unique index also
// serves the config_id FK cascade lookup (leftmost column).
export const copyEvents = pgTable(
  'copy_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    configId: uuid('config_id')
      .notNull()
      .references(() => configs.id, { onDelete: 'cascade' }),
    ipHash: text('ip_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('copy_events_config_ip_uq').on(t.configId, t.ipHash)],
)

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
    generatedContent: jsonb('generated_content'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('mod_versions_mod_version_uq').on(t.modId, t.versionNumber),
    uniqueIndex('mod_versions_repo_path_commit_uq').on(t.repoUrl, t.path, t.commitSha),
    check('mod_versions_commit_sha_check', sql`${t.commitSha} ~ '^[0-9a-f]{40}$'`),
    check('mod_versions_repo_url_check', sql`${t.repoUrl} LIKE 'https://%'`),
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
    segments: jsonb('segments').$type<AnsiSegment[]>().notNull(),
    claudeCodeVersion: text('claude_code_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('mod_previews_version_scenario_uq').on(t.modVersionId, t.scenarioKey)],
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

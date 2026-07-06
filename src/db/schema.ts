// App tables (configs/votes/etc.) arrive in later slices.
export * from './auth-schema'

import { sql } from 'drizzle-orm'
import {
  boolean,
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
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    interpreter: text('interpreter').notNull(),
    status: text('status').notNull().default('draft'),
    currentVersionId: uuid('current_version_id'),
    upvoteCount: integer('upvote_count').notNull().default(0),
    copyCount: integer('copy_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Indexes the author_id FK (Postgres doesn't auto-index FK columns) so the
    // delete-user cascade and the submit rate-limit query (WHERE author_id ...
    // created_at) use an index instead of a seq scan.
    index('configs_author_created_idx').on(t.authorId, t.createdAt),
    // The gallery's hot query is `WHERE status='published' ORDER BY <sort> LIMIT 10`. These two
    // composites let Postgres satisfy the filter + sort + limit straight from the index instead of
    // scanning and sorting every published row: `new` uses (status, created_at), `top` uses
    // (status, upvote_count). The `trending` sort ranks by a now()-based decay expression that no
    // btree can cover, so it intentionally has no index.
    index('configs_status_created_idx').on(t.status, t.createdAt),
    index('configs_status_upvotes_idx').on(t.status, t.upvoteCount),
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

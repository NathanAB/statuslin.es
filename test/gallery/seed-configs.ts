import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { TestDb } from '../mods/seed-mods'

const AUTHOR_ID = 'seed-configs-author'

interface ConfigSeed {
  allTags?: string[]
  status?: string
  source?: string
  interpreter?: string
  networkHosts?: string[]
  readsClaudeToken?: boolean
}

/**
 * A config with one approved current version, published unless told otherwise, its author created
 * on first use.
 */
export async function addPublishedConfig(
  db: TestDb,
  slug: string,
  opts: ConfigSeed = {},
): Promise<string> {
  await db
    .insert(schema.user)
    .values({
      id: AUTHOR_ID,
      name: 'Author',
      email: 'seed-configs@test.com',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
  const [config] = await db
    .insert(schema.configs)
    .values({
      slug,
      authorId: AUTHOR_ID,
      status: opts.status ?? 'published',
      allTags: opts.allTags ?? [],
      firstPublishedAt: new Date(),
    })
    .returning({ id: schema.configs.id })
  if (!config) throw new Error(`config ${slug} was not inserted`)
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config.id,
      versionNumber: 1,
      title: slug,
      description: '',
      source: opts.source ?? 'echo hi',
      interpreter: opts.interpreter ?? 'bash',
      networkHosts: opts.networkHosts ?? [],
      readsClaudeToken: opts.readsClaudeToken ?? false,
      contentSha256: slug.padEnd(64, '0'),
      status: 'approved',
    })
    .returning({ id: schema.configVersions.id })
  if (!version) throw new Error(`config ${slug} has no version`)
  await db
    .update(schema.configs)
    .set({ currentVersionId: version.id })
    .where(eq(schema.configs.id, config.id))
  return config.id
}

export async function currentVersionOf(db: TestDb, configId: string): Promise<string> {
  const [config] = await db
    .select({ versionId: schema.configs.currentVersionId })
    .from(schema.configs)
    .where(eq(schema.configs.id, configId))
  if (!config?.versionId) throw new Error(`config ${configId} has no current version`)
  return config.versionId
}

/** The shot `addConfigDesktopPreview` stores: the PNG signature and a byte, at a band's size. */
export const CONFIG_DESKTOP_SHOT = {
  png: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 42]),
  width: 790,
  height: 40,
}

/** Sets the version's Desktop result: a shot, or that it drew nothing. */
export async function addConfigDesktopPreview(
  db: TestDb,
  versionId: string,
  result: 'shot' | 'nothing' = 'shot',
) {
  const row =
    result === 'shot'
      ? { kind: 'shot' as const, ...CONFIG_DESKTOP_SHOT }
      : { kind: 'nothing' as const, png: null, width: null, height: null }
  await db.insert(schema.configDesktopPreviews).values({
    configVersionId: versionId,
    desktopVersion: '1.0.0',
    engineVersion: '2.1.0',
    modCommitSha: 'a'.repeat(40),
    ...row,
  })
}

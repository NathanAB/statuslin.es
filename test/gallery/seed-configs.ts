import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { TestDb } from '../mods/seed-mods'

const AUTHOR_ID = 'seed-configs-author'

/** A published config with one approved current version, its author created on first use. */
export async function addPublishedConfig(
  db: TestDb,
  slug: string,
  opts: { allTags?: string[] } = {},
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
      status: 'published',
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
      source: 'echo hi',
      interpreter: 'bash',
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

import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applyContentGenerationResponses,
  listPublishedSlugsMissingContent,
  parseContentGenerationResponses,
  prepareContentGenerationRequest,
} from '@/content/generation-workflow'
import type { GeneratedContent } from '@/content/types'
import * as schema from '@/db/schema'
import { storePreviews } from '@/render/store'
import {
  fetchModReadme,
  parseGenerateContentArgs,
  runGenerateContentCommand,
} from '../../scripts/generate-content'

let client: PGlite
let db: ReturnType<typeof drizzle<typeof schema>>

const CONTENT: GeneratedContent = {
  whatItShows: ['Current git branch'],
  requirements: ['bash'],
  behaviorNotes: ['Branch segment disappears outside a git repo'],
}

async function seedConfig(
  slug: string,
  opts: { status?: string; generatedContent?: GeneratedContent | null } = {},
): Promise<string> {
  const [config] = await db
    .insert(schema.configs)
    .values({
      slug,
      authorId: 'u1',
      status: opts.status ?? 'published',
    })
    .returning()
  if (!config) throw new Error('config seed failed')
  const [version] = await db
    .insert(schema.configVersions)
    .values({
      configId: config.id,
      versionNumber: 1,
      title: `Config ${slug}`,
      source: 'echo "$BRANCH"',
      interpreter: 'bash',
      contentSha256: `sha-${slug}`,
      status: 'approved',
      generatedContent: opts.generatedContent ?? null,
    })
    .returning()
  if (!version) throw new Error('version seed failed')
  await db
    .update(schema.configs)
    .set({ currentVersionId: version.id })
    .where(eq(schema.configs.id, config.id))
  return version.id
}

beforeAll(async () => {
  client = new PGlite()
  db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  await db.insert(schema.user).values({
    id: 'u1',
    name: 'Author One',
    email: 'author1@test.com',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})

afterAll(async () => {
  await client.close()
})

describe('prepareContentGenerationRequest', () => {
  it('builds version-pinned content and tag prompts from the current version and previews', async () => {
    const versionId = await seedConfig('happy-path')
    await storePreviews(db, 'sha-happy-path', [
      {
        scenarioKey: 'clean-main',
        segments: [
          {
            text: 'main | Opus',
            fg: 'rgb(255,0,0)',
            bg: null,
            bold: false,
            italic: false,
            underline: false,
          },
        ],
        rawStdout: '\u001b[31mmain | Opus\u001b[0m',
        exitCode: 0,
        timedOut: false,
        trace: { networkAttempts: [], sensitiveReads: [], spawnedProcesses: [] },
      },
    ])
    const request = await prepareContentGenerationRequest(db, 'happy-path')

    expect(request).toMatchObject({
      schemaVersion: 1,
      slug: 'happy-path',
      versionId,
      contentSha256: 'sha-happy-path',
    })
    expect(request.contentPrompt).toContain('echo "$BRANCH"')
    expect(request.contentPrompt).toContain('main | Opus')
    expect(request.tagsPrompt).toContain('echo "$BRANCH"')
    expect(request.tagsPrompt).toContain('main | Opus')
    expect(request.tagsPrompt).not.toContain('\u001b')
    const [row] = await db
      .select({ generatedContent: schema.configVersions.generatedContent })
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, versionId))
    expect(row?.generatedContent).toBeNull()
  })

  it('throws on an unknown slug', async () => {
    await expect(prepareContentGenerationRequest(db, 'no-such-slug')).rejects.toThrow(
      /no config found/i,
    )
  })
})

describe('content generation responses', () => {
  it('parses one response object or an array', async () => {
    const versionId = await seedConfig('parse-response')
    const response = {
      schemaVersion: 1,
      slug: 'parse-response',
      versionId,
      contentSha256: 'sha-parse-response',
      generatedContent: CONTENT,
      tags: ['git'],
    }

    expect(parseContentGenerationResponses(JSON.stringify(response))).toEqual([response])
    expect(parseContentGenerationResponses(JSON.stringify([response]))).toEqual([response])
  })

  it('validates content, filters tags, and writes content plus derived tags together', async () => {
    const versionId = await seedConfig('apply-response')
    const [response] = parseContentGenerationResponses(
      JSON.stringify({
        schemaVersion: 1,
        slug: 'apply-response',
        versionId,
        contentSha256: 'sha-apply-response',
        generatedContent: CONTENT,
        tags: ['git', 'minimal', 'made-up', 'git'],
      }),
    )
    if (!response) throw new Error('response parse failed')

    await applyContentGenerationResponses(db, [response])

    const [stored] = await db
      .select({
        generatedContent: schema.configVersions.generatedContent,
        tags: schema.configs.tags,
        allTags: schema.configs.allTags,
      })
      .from(schema.configs)
      .innerJoin(
        schema.configVersions,
        eq(schema.configVersions.id, schema.configs.currentVersionId),
      )
      .where(eq(schema.configs.slug, 'apply-response'))
    expect(stored?.generatedContent).toEqual(CONTENT)
    expect(stored?.tags).toEqual(['git', 'minimal'])
    expect(stored?.allTags).toEqual(expect.arrayContaining(['git', 'minimal', 'bash']))
  })

  it('rejects a stale batch without writing any response in it', async () => {
    const validVersionId = await seedConfig('atomic-valid')
    const staleVersionId = await seedConfig('atomic-stale')
    const responses = parseContentGenerationResponses(
      JSON.stringify([
        {
          schemaVersion: 1,
          slug: 'atomic-valid',
          versionId: validVersionId,
          contentSha256: 'sha-atomic-valid',
          generatedContent: CONTENT,
          tags: ['git'],
        },
        {
          schemaVersion: 1,
          slug: 'atomic-stale',
          versionId: staleVersionId,
          contentSha256: 'wrong-sha',
          generatedContent: CONTENT,
          tags: ['minimal'],
        },
      ]),
    )

    await expect(applyContentGenerationResponses(db, responses)).rejects.toThrow(/changed/i)

    const byId = new Map(
      (
        await db
          .select({
            id: schema.configVersions.id,
            generatedContent: schema.configVersions.generatedContent,
          })
          .from(schema.configVersions)
      ).map((row) => [row.id, row.generatedContent]),
    )
    expect(byId.get(validVersionId)).toBeNull()
    expect(byId.get(staleVersionId)).toBeNull()
  })

  it('rejects malformed generated content before opening a write transaction', async () => {
    const versionId = await seedConfig('invalid-content')
    expect(() =>
      parseContentGenerationResponses(
        JSON.stringify({
          schemaVersion: 1,
          slug: 'invalid-content',
          versionId,
          contentSha256: 'sha-invalid-content',
          generatedContent: { whatItShows: [], requirements: [] },
          tags: [],
        }),
      ),
    ).toThrow(/validation/i)
  })

  it('rejects empty batches and duplicate slugs', async () => {
    expect(() => parseContentGenerationResponses('[]')).toThrow(/validation/i)
    const versionId = await seedConfig('duplicate-response')
    const response = {
      schemaVersion: 1,
      slug: 'duplicate-response',
      versionId,
      contentSha256: 'sha-duplicate-response',
      generatedContent: CONTENT,
      tags: [],
    }
    expect(() => parseContentGenerationResponses(JSON.stringify([response, response]))).toThrow(
      /duplicate/i,
    )
  })

  it('rejects a current-version change without writing another valid response', async () => {
    const validVersionId = await seedConfig('version-batch-valid')
    const staleVersionId = await seedConfig('version-batch-stale')
    const [staleConfig] = await db
      .select({ id: schema.configs.id })
      .from(schema.configs)
      .where(eq(schema.configs.slug, 'version-batch-stale'))
    if (!staleConfig) throw new Error('stale config seed failed')
    const [replacement] = await db
      .insert(schema.configVersions)
      .values({
        configId: staleConfig.id,
        versionNumber: 2,
        title: 'Config version-batch-stale',
        source: 'echo replacement',
        interpreter: 'bash',
        contentSha256: 'sha-version-batch-stale-v2',
        status: 'approved',
      })
      .returning()
    if (!replacement) throw new Error('replacement version seed failed')
    await db
      .update(schema.configs)
      .set({ currentVersionId: replacement.id })
      .where(eq(schema.configs.id, staleConfig.id))

    const responses = parseContentGenerationResponses(
      JSON.stringify([
        {
          schemaVersion: 1,
          slug: 'version-batch-valid',
          versionId: validVersionId,
          contentSha256: 'sha-version-batch-valid',
          generatedContent: CONTENT,
          tags: ['git'],
        },
        {
          schemaVersion: 1,
          slug: 'version-batch-stale',
          versionId: staleVersionId,
          contentSha256: 'sha-version-batch-stale',
          generatedContent: CONTENT,
          tags: ['minimal'],
        },
      ]),
    )

    await expect(applyContentGenerationResponses(db, responses)).rejects.toThrow(/changed/i)
    const [valid] = await db
      .select({ generatedContent: schema.configVersions.generatedContent })
      .from(schema.configVersions)
      .where(eq(schema.configVersions.id, validVersionId))
    expect(valid?.generatedContent).toBeNull()
  })
})

describe('listPublishedSlugsMissingContent', () => {
  it('lists published configs without content and skips ones that have it or are unpublished', async () => {
    await seedConfig('missing-a')
    await seedConfig('already-done', { generatedContent: CONTENT })
    await seedConfig('still-draft', { status: 'draft' })

    const slugs = await listPublishedSlugsMissingContent(db)

    expect(slugs).toContain('missing-a')
    expect(slugs).not.toContain('already-done')
    expect(slugs).not.toContain('still-draft')
  })
})

describe('parseGenerateContentArgs', () => {
  it('selects one-slug and all prepare modes', () => {
    expect(parseGenerateContentArgs(['my-slug', '--prepare'])).toEqual({
      mode: 'prepare',
      slug: 'my-slug',
      all: false,
    })
    expect(parseGenerateContentArgs(['--all', '--prepare'])).toEqual({
      mode: 'prepare',
      slug: null,
      all: true,
    })
  })

  it('selects apply mode without a slug', () => {
    expect(parseGenerateContentArgs(['--apply'])).toEqual({ mode: 'apply' })
  })

  it('rejects mixed, incomplete, and unknown arguments', () => {
    expect(() => parseGenerateContentArgs(['my-slug', '--apply'])).toThrow(/usage/i)
    expect(() => parseGenerateContentArgs(['my-slug'])).toThrow(/usage/i)
    expect(() => parseGenerateContentArgs(['--prepare', '--apply'])).toThrow(/usage/i)
    expect(() => parseGenerateContentArgs(['--prepare', '--unknown'])).toThrow(/usage/i)
  })
})

describe('runGenerateContentCommand', () => {
  it('writes only one parseable JSON value to stdout in prepare mode', async () => {
    await seedConfig('stream-prepare')
    const stdout: string[] = []
    const stderr: string[] = []

    await runGenerateContentCommand({ mode: 'prepare', slug: 'stream-prepare', all: false }, db, {
      readStdin: async () => '',
      writeStdout: (value) => stdout.push(value),
      writeStderr: (value) => stderr.push(value),
    })

    expect(stdout).toHaveLength(1)
    expect(() => JSON.parse(stdout[0] ?? '')).not.toThrow()
    expect(stderr).toEqual([])
  })

  it('keeps stdout empty and writes one diagnostic to stderr in apply mode', async () => {
    const versionId = await seedConfig('stream-apply')
    const stdout: string[] = []
    const stderr: string[] = []
    const response = JSON.stringify({
      schemaVersion: 1,
      slug: 'stream-apply',
      versionId,
      contentSha256: 'sha-stream-apply',
      generatedContent: CONTENT,
      tags: ['git'],
    })

    await runGenerateContentCommand({ mode: 'apply' }, db, {
      readStdin: async () => response,
      writeStdout: (value) => stdout.push(value),
      writeStderr: (value) => stderr.push(value),
    })

    expect(stdout).toEqual([])
    expect(stderr).toEqual(['[generate-content] applied 1 response(s)'])
  })
})

describe('generate-content for mods', () => {
  const COMMIT = 'c'.repeat(40)

  async function seedMod(slug: string): Promise<string> {
    const [mod] = await db
      .insert(schema.mods)
      .values({ slug, pluginName: slug, title: slug, authorGithub: 'octocat' })
      .returning()
    const [version] = await db
      .insert(schema.modVersions)
      .values({
        modId: mod?.id as string,
        versionNumber: 1,
        repoUrl: `https://github.com/octocat/${slug}`,
        commitSha: COMMIT,
        footprint: { events: [], calls: [] },
        validatedWith: '2.1.0',
      })
      .returning()
    await db
      .update(schema.mods)
      .set({ currentVersionId: version?.id as string })
      .where(eq(schema.mods.id, mod?.id as string))
    return version?.id as string
  }

  function capture(stdin = '') {
    const stdout: string[] = []
    const stderr: string[] = []
    return {
      stdout,
      stderr,
      io: {
        readStdin: async () => stdin,
        writeStdout: (value: string) => stdout.push(value),
        writeStderr: (value: string) => stderr.push(value),
        readModReadme: async () => 'A meter mod.',
      },
    }
  }

  it('selects the mod catalog with --mod in every mode', () => {
    expect(parseGenerateContentArgs(['token-weather', '--prepare', '--mod'])).toEqual({
      mode: 'prepare',
      slug: 'token-weather',
      all: false,
      mods: true,
    })
    expect(parseGenerateContentArgs(['--mod', '--all', '--prepare'])).toEqual({
      mode: 'prepare',
      slug: null,
      all: true,
      mods: true,
    })
    expect(parseGenerateContentArgs(['--apply', '--mod'])).toEqual({ mode: 'apply', mods: true })
    expect(() => parseGenerateContentArgs(['--mod'])).toThrow(/usage/i)
    expect(() => parseGenerateContentArgs(['a', '--prepare', '--mod', '--mod'])).toThrow(/usage/i)
  })

  it('prepares one mod request, or only mods with --all', async () => {
    const versionId = await seedMod('cli-meter')
    const one = capture()
    await runGenerateContentCommand(
      { mode: 'prepare', slug: 'cli-meter', all: false, mods: true },
      db,
      one.io,
    )
    expect(JSON.parse(one.stdout[0] ?? '')).toMatchObject({
      kind: 'mod',
      slug: 'cli-meter',
      versionId,
      commitSha: COMMIT,
    })

    const all = capture()
    await runGenerateContentCommand(
      { mode: 'prepare', slug: null, all: true, mods: true },
      db,
      all.io,
    )
    const requests = JSON.parse(all.stdout[0] ?? '') as Array<{ kind: string; slug: string }>
    expect(requests.map((r) => [r.kind, r.slug])).toContainEqual(['mod', 'cli-meter'])
    expect(requests.every((r) => r.kind === 'mod')).toBe(true)
  })

  it('applies mod responses with --mod', async () => {
    const versionId = await seedMod('cli-apply')
    const run = capture(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'mod',
        slug: 'cli-apply',
        versionId,
        commitSha: COMMIT,
        generatedContent: CONTENT,
        tags: ['minimal'],
      }),
    )

    await runGenerateContentCommand({ mode: 'apply', mods: true }, db, run.io)

    expect(run.stdout).toEqual([])
    expect(run.stderr).toEqual(['[generate-content] applied 1 mod response(s)'])
    const [row] = await db
      .select({ generatedContent: schema.modVersions.generatedContent })
      .from(schema.modVersions)
      .where(eq(schema.modVersions.id, versionId))
    expect(row?.generatedContent).toEqual(CONTENT)
  })
})

describe('fetchModReadme', () => {
  const COMMIT = 'd'.repeat(40)

  function fakeFetch(status: number, body = '') {
    const calls: Array<{ url: string; accept: string | null }> = []
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, accept: new Headers(init?.headers).get('accept') })
      return new Response(body, { status })
    }) as unknown as typeof fetch
    return { calls, fetchFn }
  }

  it('reads the raw README of the plugin folder at the pinned commit', async () => {
    const { calls, fetchFn } = fakeFetch(200, '# Meter')

    expect(
      await fetchModReadme(fetchFn)('https://github.com/octocat/mods', 'plugins/meter', COMMIT),
    ).toBe('# Meter')
    expect(await fetchModReadme(fetchFn)('https://github.com/octocat/meter', '', COMMIT)).toBe(
      '# Meter',
    )
    expect(calls).toEqual([
      {
        url: `https://api.github.com/repos/octocat/mods/readme/plugins/meter?ref=${COMMIT}`,
        accept: 'application/vnd.github.raw+json',
      },
      {
        url: `https://api.github.com/repos/octocat/meter/readme?ref=${COMMIT}`,
        accept: 'application/vnd.github.raw+json',
      },
    ])
  })

  it('returns null when there is no README and throws on other failures', async () => {
    const repo = 'https://github.com/octocat/meter'
    expect(await fetchModReadme(fakeFetch(404).fetchFn)(repo, '', COMMIT)).toBeNull()
    await expect(fetchModReadme(fakeFetch(500).fetchFn)(repo, '', COMMIT)).rejects.toThrow(/500/)
  })

  it('cuts a very long README down to a fixed size', async () => {
    const long = 'x'.repeat(100_000)
    const text = await fetchModReadme(fakeFetch(200, long).fetchFn)(
      'https://github.com/octocat/meter',
      '',
      COMMIT,
    )
    expect(text?.length).toBeLessThan(long.length)
    expect(text).toMatch(/README cut off/)
  })
})

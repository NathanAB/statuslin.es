import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runWithDeployEnv } from '../../scripts/with-deploy-env'

const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

describe('runWithDeployEnv', () => {
  it('runs a script with the env file values only, never .env.local, .env.development or the shell', async () => {
    const root = await mkdtemp(join(tmpdir(), 'with-deploy-env-'))
    roots.push(root)
    await cp('.env.schema', join(root, '.env.schema'))
    await cp('.env.development', join(root, '.env.development'))
    await writeFile(join(root, '.env.local'), 'RENDER_RUNNER=fake\nGITHUB_TOKEN=local-token\n')
    await writeFile(
      join(root, '.env.staging'),
      [
        'DATABASE_URL=postgresql://app:pw@staging.neon.tech/statuslines?sslmode=require',
        'BETTER_AUTH_URL=https://staging.statuslin.es',
        'BETTER_AUTH_SECRET=staging-secret-0123456789abcdef0123456789',
        'GITHUB_CLIENT_ID=staging-client-id',
        'GITHUB_CLIENT_SECRET=staging-client-secret',
        'GITHUB_TOKEN=staging-token',
        'E2B_API_KEY=staging-e2b-key',
        'RESEND_API_KEY=staging-resend-key',
        '',
      ].join('\n'),
    )
    await writeFile(
      join(root, 'snapshot.ts'),
      `import { writeFileSync } from 'node:fs'
const { DATABASE_URL, GITHUB_TOKEN, RENDER_RUNNER, E2B_API_KEY } = process.env
writeFileSync(process.argv[2] ?? '', JSON.stringify({ DATABASE_URL, GITHUB_TOKEN, RENDER_RUNNER, E2B_API_KEY }))
process.exit(7)
`,
    )
    vi.stubEnv('E2B_API_KEY', 'shell-e2b-key')

    const status = runWithDeployEnv('staging', ['snapshot.ts', 'out.json'], root)

    expect(status).toBe(7)
    expect(JSON.parse(await readFile(join(root, 'out.json'), 'utf8'))).toEqual({
      DATABASE_URL: 'postgresql://app:pw@staging.neon.tech/statuslines?sslmode=require',
      GITHUB_TOKEN: 'staging-token',
      E2B_API_KEY: 'staging-e2b-key',
    })
  })
})

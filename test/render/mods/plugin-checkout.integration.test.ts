import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPluginFetcher } from '@/render/mods/plugin-checkout'

// Real-sandbox integration: hits live E2B and github.com, so it's OPT-IN and only runs under
// `bun run test:e2b` (RUN_E2B=1).
const run = process.env.RUN_E2B === '1' ? describe : describe.skip

run('createPluginFetcher (integration, needs E2B_API_KEY)', () => {
  it('fetches a plugin folder from a repository whose whole tarball is over the byte cap', async () => {
    const tarball = await createPluginFetcher()({
      repoUrl: 'https://github.com/Atoll92/agent-standup',
      path: 'plugin-band',
      commitSha: '191c777e00b86c0f1c86a22d22702386fab91d35',
    })

    const dir = await mkdtemp(join(tmpdir(), 'plugin-checkout-e2b-'))
    try {
      await writeFile(join(dir, 'plugin.tar.gz'), tarball)
      const listed = spawnSync('tar', ['-tzf', join(dir, 'plugin.tar.gz')], { encoding: 'utf8' })
      expect(listed.stdout.split('\n')).toContain('repo/plugin-band/.claude-plugin/plugin.json')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})

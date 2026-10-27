import { describe, expect, it } from 'vitest'
import { withModSandbox } from '@/render/mods/mod-sandbox'
import { createPluginFetcher } from '@/render/mods/plugin-checkout'

// Real-sandbox integration: hits live E2B and github.com, so it's OPT-IN and only runs under
// `bun run test:e2b` (RUN_E2B=1).
const run = process.env.RUN_E2B === '1' ? describe : describe.skip

run('createPluginFetcher (integration, needs E2B_API_KEY)', () => {
  it('fetches a plugin folder from a repository over the file cap, in a form the mod sandbox unpacks', async () => {
    const source = { repoUrl: 'https://github.com/anthropics/claude-code', path: 'mods/diff' }
    const tarball = await createPluginFetcher()({
      ...source,
      commitSha: '08c6a4f5121ae140d3c1b5c96e3e5ae53587b54b',
    })

    const manifest = await withModSandbox({ tarball, path: source.path }, (sandbox) =>
      sandbox.run(`cat ${sandbox.pluginDir}/.claude-plugin/plugin.json`),
    )

    expect(manifest.exitCode).toBe(0)
    expect(JSON.parse(manifest.stdout)).toMatchObject({ name: 'diff' })
  }, 180_000)
})

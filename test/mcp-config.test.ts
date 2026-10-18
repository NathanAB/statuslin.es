import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type McpConfig = {
  mcpServers: Record<string, { command: string; args: string[] }>
}

describe('.mcp.json', () => {
  const config = JSON.parse(readFileSync('.mcp.json', 'utf8')) as McpConfig

  it('pins every server package to an exact version', () => {
    const packages = Object.values(config.mcpServers).map((s) =>
      s.args.find((arg) => !arg.startsWith('-')),
    )
    for (const pkg of packages) {
      expect(pkg, `${pkg} must be pinned to an exact version`).toMatch(/.@\d+\.\d+\.\d+$/)
    }
  })
})

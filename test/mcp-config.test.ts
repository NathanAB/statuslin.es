import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type McpConfig = {
  mcpServers: Record<string, { command: string; args: string[] }>
}

describe('.mcp.json', () => {
  const config = JSON.parse(readFileSync('.mcp.json', 'utf8')) as McpConfig
  const allArgs = Object.values(config.mcpServers).flatMap((s) => s.args)

  it('never uses a floating @latest tag', () => {
    for (const arg of allArgs) {
      expect(arg, `${arg} must be pinned, not @latest`).not.toMatch(/@latest$/)
    }
  })

  it('pins shadcn and context7 to the reviewed versions', () => {
    expect(allArgs).toContain('shadcn@4.12.0')
    expect(allArgs).toContain('@upstash/context7-mcp@3.2.2')
  })
})

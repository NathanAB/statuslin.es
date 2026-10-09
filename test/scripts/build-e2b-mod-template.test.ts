import { Template, type TemplateClass } from 'e2b'
import { describe, expect, it } from 'vitest'
import { modRenderTemplate } from '../../scripts/build-e2b-mod-template'
import { renderTemplate } from '../../scripts/build-e2b-template'

type Step = { type: string; args: string[] }

async function steps(template: TemplateClass): Promise<Step[]> {
  return (JSON.parse(await Template.toJSON(template, false)) as { steps: Step[] }).steps
}

async function installedVersion(template: TemplateClass, pkg: string): Promise<string | undefined> {
  const commands = (await steps(template)).filter((s) => s.type === 'RUN').map((s) => s.args[0])
  const spec = new RegExp(`${pkg.replace('/', '\\/')}@(\\S+)`)
  for (const command of commands) {
    const match = command?.match(spec)
    if (match) return match[1]
  }
  return undefined
}

describe('mod render template definition', () => {
  it('installs Claude Code 2.1.296 exactly, never a range', async () => {
    const version = await installedVersion(modRenderTemplate(), '@anthropic-ai/claude-code')
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(version).toBe('2.1.296')
  })

  it('installs @xterm/headless 6.0.0 exactly for in-sandbox replay', async () => {
    expect(await installedVersion(modRenderTemplate(), '@xterm/headless')).toBe('6.0.0')
  })

  it('extends the status line template step for step', async () => {
    const base = await steps(renderTemplate())
    expect((await steps(modRenderTemplate())).slice(0, base.length)).toEqual(base)
  })

  it('leaves Claude Code out of the status line template', async () => {
    expect(await installedVersion(renderTemplate(), '@anthropic-ai/claude-code')).toBeUndefined()
  })
})

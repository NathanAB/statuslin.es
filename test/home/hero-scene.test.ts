import { describe, expect, it } from 'vitest'
import { heroScene } from '@/home/hero-scene'
import type { HeroItem } from '@/home/showcase'

const paneMod = (rows: number): HeroItem => ({
  kind: 'mod',
  mod: {
    modId: 'mod-filetree',
    slug: 'filetree',
    title: 'Filetree',
    authorGithub: 'filetree-dev',
    copyCount: 22,
    render: [{ text: Array.from({ length: rows }, () => 'row').join('\n') }],
    desktop: null,
    footprint: { events: ['ui.render{component=Pane, requestId=filetree}'], calls: [] },
    sortKey: 22,
  },
})

describe('heroScene', () => {
  it("shows a mod's pane beside the conversation in the terminal, and says so", () => {
    const scene = heroScene(paneMod(26), 'cli')
    expect(scene.view).toMatchObject({ kind: 'cli', at: 'side-pane' })
    expect(scene.label).toBe('Claude Code with Filetree in a pane beside the conversation')
    expect(scene.shown).toBe('Showing Filetree in a pane beside the conversation.')
  })

  it('shows a short render from the same mod above the prompt', () => {
    const scene = heroScene(paneMod(3), 'cli')
    expect(scene.view).toMatchObject({ kind: 'cli', at: 'above-prompt' })
    expect(scene.label).toBe('Claude Code with Filetree above the prompt')
  })
})

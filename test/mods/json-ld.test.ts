import { describe, expect, it } from 'vitest'
import { modJsonLd } from '@/mods/json-ld'
import type { ModDetail } from '@/mods/queries'

const ORIGIN = 'https://statuslin.es'
const SHA = '0123456789abcdef0123456789abcdef01234567'

const MOD = {
  slug: 'filetree',
  title: 'File Tree',
  description: 'A file tree pane.',
  authorGithub: 'octocat',
  repoUrl: 'https://github.com/octocat/mods',
  path: 'plugins/filetree',
  commitSha: SHA,
  license: 'MIT' as string | null,
  tags: ['token-usage', 'quota'],
  updatedAt: '2026-09-30',
  generatedContent: null as ModDetail['generatedContent'],
}

type Node = Record<string, unknown>
const nodeOfType = (nodes: object[], type: string) =>
  (nodes as Node[]).find((node) => node['@type'] === type)

describe('modJsonLd', () => {
  it('describes the mod as source code for Claude Code, kept at its pinned commit', () => {
    expect(nodeOfType(modJsonLd(ORIGIN, MOD), 'SoftwareSourceCode')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: 'File Tree',
      description: 'A file tree pane.',
      url: 'https://statuslin.es/mods/filetree',
      codeRepository: `https://github.com/octocat/mods/tree/${SHA}/plugins/filetree`,
      runtimePlatform: 'Claude Code',
      author: { '@type': 'Person', name: 'octocat' },
      license: 'MIT',
      dateModified: '2026-09-30',
      keywords: 'tokens, limits',
    })
  })

  it('points a root-level plugin at the repo tree at its commit', () => {
    expect(nodeOfType(modJsonLd(ORIGIN, { ...MOD, path: '' }), 'SoftwareSourceCode')).toMatchObject(
      { codeRepository: `https://github.com/octocat/mods/tree/${SHA}` },
    )
  })

  it('claims no licence for a mod without one, and no keywords without tags', () => {
    const code = nodeOfType(
      modJsonLd(ORIGIN, { ...MOD, license: null, tags: [] }),
      'SoftwareSourceCode',
    )

    expect(code).not.toHaveProperty('license')
    expect(code).not.toHaveProperty('keywords')
  })

  it('breadcrumbs from home through the mods page to the mod', () => {
    expect(nodeOfType(modJsonLd(ORIGIN, MOD), 'BreadcrumbList')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Status lines', item: 'https://statuslin.es' },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Mods',
          item: 'https://statuslin.es/mods',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'File Tree',
          item: 'https://statuslin.es/mods/filetree',
        },
      ],
    })
  })

  it('asks and answers the page copy as a FAQPage, as a status line page does', () => {
    const faq = nodeOfType(
      modJsonLd(ORIGIN, {
        ...MOD,
        generatedContent: {
          summary: 'A file tree of the current folder in a pane.',
          howItWorks: ['Run `/filetree` to open it', 'Folders open on click'],
          goodToKnow: [],
          details: {},
        },
      }),
      'FAQPage',
    )

    const questions = faq?.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>
    expect(questions.map((q) => [q.name, q.acceptedAnswer.text])).toEqual([
      ['What does File Tree do?', 'A file tree of the current folder in a pane.'],
      ['How does File Tree work?', 'Run /filetree to open it. Folders open on click.'],
    ])
  })

  it('has no FAQPage without page copy', () => {
    expect(nodeOfType(modJsonLd(ORIGIN, MOD), 'FAQPage')).toBeUndefined()
  })
})

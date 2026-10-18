import { describe, expect, it } from 'vitest'
import { type PublishFacts, type PublishVersion, publishGuards } from '@/mods/publish'

const LIVE = 'a'.repeat(40)
const NEXT = 'b'.repeat(40)

function version(commitSha: string): PublishVersion {
  return {
    id: commitSha,
    repoUrl: 'https://github.com/octocat/meter',
    path: '',
    commitSha,
    pluginVersion: null,
    footprint: { events: [], calls: [] },
    rendered: true,
  }
}

function update(comparedToLive: PublishFacts['comparedToLive']): PublishFacts {
  return {
    slug: 'meter',
    modStatus: 'published',
    description: '',
    target: version(NEXT),
    current: version(LIVE),
    onDefaultBranch: true,
    filesChanged: null,
    comparedToLive,
  }
}

describe('the live-commit guard', () => {
  it.each([
    ['behind', `commit ${NEXT} is behind the live commit ${LIVE}`],
    ['diverged', `commit ${NEXT} doesn't build on the live commit ${LIVE}`],
  ] as const)(
    'refuses a commit GitHub compares as %s, naming the live one',
    (comparison, message) => {
      expect(publishGuards(update(comparison))).toEqual([
        { level: 'refuse', name: 'not-ahead-of-live', message: expect.stringContaining(message) },
      ])
    },
  )

  it('allows a commit ahead of the live one', () => {
    expect(publishGuards(update('ahead'))).toEqual([])
  })
})

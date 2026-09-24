import { describe, expect, it } from 'vitest'
import { TOOLS } from '@/compare/tools'
import { FACET_BY_SLUG } from '@/gallery/facets'
import { RESOURCE_SECTIONS } from '@/resources/data'

const resources = RESOURCE_SECTIONS.flatMap((s) => s.resources)

describe('third-party tool registry', () => {
  it('spells and links each tool the way /resources does', () => {
    for (const tool of TOOLS) {
      expect(resources.find((r) => r.name === tool.name)?.url).toBe(tool.repoUrl)
    }
  })

  it('describes each tool’s jobs with real gallery facets', () => {
    for (const tool of TOOLS) {
      expect(tool.jobs.filter((job) => FACET_BY_SLUG.get(job)?.group !== 'feature')).toEqual([])
    }
  })
})

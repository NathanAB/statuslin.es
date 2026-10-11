import type * as React from 'react'
import type { GeneratedContent } from '@/content/types'
import { GeneratedContentSections } from '@/gallery/generated-content'
import { Stack } from '@/ui/layout'
import { SectionCard } from '@/ui/section-card'

/**
 * The section order every status line and mod page shares, so the two can't drift: header,
 * install, preview, the detail section, generated copy, then related. `notice` is a strip above it
 * all for one viewer, such as the status line owner's update prompt.
 */
export function DetailPageLayout({
  notice,
  header,
  install,
  preview,
  detail,
  generatedContent,
  related,
}: {
  notice?: React.ReactNode
  header: React.ReactNode
  install: React.ReactNode
  preview: React.ReactNode
  /** What the page is made of: a status line's Source, a mod's "What it does". */
  detail: { title: string; content: React.ReactNode }
  generatedContent: GeneratedContent | null
  related?: React.ReactNode
}) {
  return (
    <Stack gap={6}>
      {notice}
      {header}
      {install}
      <SectionCard title="Preview" headingLevel={2}>
        {preview}
      </SectionCard>
      <SectionCard title={detail.title} headingLevel={2}>
        {detail.content}
      </SectionCard>
      {generatedContent && <GeneratedContentSections content={generatedContent} />}
      {related}
    </Stack>
  )
}

import type * as React from 'react'
import { WhatItDoes, type WhatItDoesContent } from '@/gallery/what-it-does'
import { Stack } from '@/ui/layout'
import { SectionCard } from '@/ui/section-card'

/**
 * The section order every status line and mod page shares, so the two can't drift: header,
 * install, preview, the "What it does" card, a status line's source, then related. `notice` is a
 * strip above it all for one viewer, such as the status line owner's update prompt.
 */
export function DetailPageLayout({
  notice,
  header,
  install,
  preview,
  whatItDoes,
  source,
  related,
}: {
  notice?: React.ReactNode
  header: React.ReactNode
  install: React.ReactNode
  preview: React.ReactNode
  whatItDoes: WhatItDoesContent
  /** A status line's script. A mod page has no Source card. */
  source?: React.ReactNode
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
      <WhatItDoes {...whatItDoes} />
      {source && (
        <SectionCard title="Source" headingLevel={2}>
          {source}
        </SectionCard>
      )}
      {related}
    </Stack>
  )
}

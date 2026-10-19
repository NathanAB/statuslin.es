import type * as React from 'react'
import { WhatItDoes, type WhatItDoesContent } from '@/gallery/what-it-does'
import { Stack } from '@/ui/layout'
import { PageSection } from '@/ui/page-section'

/**
 * The section order every status line and mod page shares, so the two can't drift: header,
 * install, preview, "What it does", a status line's source, then related. Each section is its
 * heading on the page, not a card. `notice` is a
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
  /** A status line's script. A mod page has no Source section. */
  source?: React.ReactNode
  related?: React.ReactNode
}) {
  return (
    <Stack gap={6}>
      {notice}
      {header}
      {install}
      <PageSection title="Preview">{preview}</PageSection>
      <WhatItDoes {...whatItDoes} />
      {source && <PageSection title="Source">{source}</PageSection>}
      {related}
    </Stack>
  )
}

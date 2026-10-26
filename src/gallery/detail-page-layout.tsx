import type * as React from 'react'
import { WhatItDoes, type WhatItDoesContent } from '@/gallery/what-it-does'
import { AsideLayout } from '@/ui/aside-layout'
import { Stack } from '@/ui/layout'
import { PageSection } from '@/ui/page-section'
import { RuledSections } from '@/ui/ruled-sections'

/**
 * The section order every status line and mod page shares, so the two can't drift: the header and
 * install button with what to know before installing beside them, then preview, "What it does", a
 * mod's FAQ, a status line's source, then related. Each section is its heading on the page, not a
 * card, set apart from the one before it by a rule.
 * `notice` is a strip above it all for one viewer, such as the status line owner's update prompt.
 */
export function DetailPageLayout({
  notice,
  header,
  install,
  beforeInstall,
  preview,
  whatItDoes,
  faq,
  source,
  related,
}: {
  notice?: React.ReactNode
  header: React.ReactNode
  install: React.ReactNode
  /** What to know before installing (InstallFacts): beside the header and button on wide screens. */
  beforeInstall: React.ReactNode
  preview: React.ReactNode
  whatItDoes: WhatItDoesContent
  /** A mod's reviewed questions (FaqSection). A status line page has none. */
  faq?: React.ReactNode
  /** A status line's script. A mod page has no Source section. */
  source?: React.ReactNode
  related?: React.ReactNode
}) {
  return (
    <Stack gap={6}>
      {notice}
      <RuledSections>
        <AsideLayout aside={beforeInstall}>
          {header}
          {install}
        </AsideLayout>
        <PageSection title="Preview">{preview}</PageSection>
        <WhatItDoes {...whatItDoes} />
        {faq}
        {source && <PageSection title="Source">{source}</PageSection>}
        {related}
      </RuledSections>
    </Stack>
  )
}

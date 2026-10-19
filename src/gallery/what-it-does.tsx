import type { ReactNode } from 'react'
import type { PageCopy } from '@/content/types'
import { BulletList } from '@/ui/bullet-list'
import { type FactTile, FactTiles } from '@/ui/fact-tiles'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { NumberedList } from '@/ui/numbered-list'
import { PageSection } from '@/ui/page-section'
import { Heading, Text } from '@/ui/text'

export interface WhatItDoesContent {
  /** The generated page copy, or null before it is generated. */
  copy: PageCopy | null
  /** The facts, each from the footprint or the stored script facts, never from the copy. */
  tiles: FactTile[]
}

function Titled({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Heading level={3}>{title}</Heading>
      {children}
    </Stack>
  )
}

/**
 * The "What it does" section on every status line and mod page: the summary, the fact tiles,
 * then the numbered steps and the notes. Without generated copy it still states the facts.
 */
export function WhatItDoes({ copy, tiles }: WhatItDoesContent) {
  return (
    <PageSection title="What it does">
      <Stack gap={6}>
        {copy && (
          <Text>
            <InlineCodeText text={copy.summary} />
          </Text>
        )}
        <FactTiles tiles={tiles} />
        {copy && copy.howItWorks.length > 0 && (
          <Titled title="How it works">
            <NumberedList items={copy.howItWorks} />
          </Titled>
        )}
        {copy && copy.goodToKnow.length > 0 && (
          <Titled title="Good to know">
            <BulletList items={copy.goodToKnow} />
          </Titled>
        )}
      </Stack>
    </PageSection>
  )
}

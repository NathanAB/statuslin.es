import type * as React from 'react'
import { githubAvatarUrl } from '@/lib/github-avatars'
import { AuthorChip } from '@/ui/author-chip'
import { Row } from '@/ui/layout'
import { Text, TextLink } from '@/ui/text'
import { modSourceUrl } from './install'
import type { ModDetail } from './queries'

const SHORT_SHA_LENGTH = 7

/** A later byline fact, led by its separator dot so a wrapped line never ends on a stray dot. */
function LaterFact({ children }: { children: React.ReactNode }) {
  return (
    <Row gap={3}>
      <Text muted size="sm">
        ·
      </Text>
      {children}
    </Row>
  )
}

/** Author, pinned source and licence, dot-separated. Each fact wraps as a unit with its dot. */
export function ModCredit({ mod }: { mod: ModDetail }) {
  return (
    <Row gap={3} wrap>
      <Row gap={1.5}>
        <Text muted size="sm">
          by
        </Text>
        <AuthorChip
          author={{
            name: mod.authorGithub,
            username: mod.authorGithub,
            image: githubAvatarUrl(mod.authorGithub),
          }}
        />
      </Row>
      <LaterFact>
        <Text muted size="sm">
          source at{' '}
          <TextLink href={modSourceUrl(mod)}>{mod.commitSha.slice(0, SHORT_SHA_LENGTH)}</TextLink>
        </Text>
      </LaterFact>
      <LaterFact>
        <Text muted size="sm">
          {mod.license ? `${mod.license} licence` : 'No licence'}
        </Text>
      </LaterFact>
    </Row>
  )
}

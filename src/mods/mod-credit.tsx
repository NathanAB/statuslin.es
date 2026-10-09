import { AuthorChip } from '@/ui/author-chip'
import { Row } from '@/ui/layout'
import { Text, TextLink } from '@/ui/text'
import { modSourceUrl } from './install'
import type { ModDetail } from './queries'

const SHORT_SHA_LENGTH = 7

/** Author, pinned source and licence. Each fact wraps as a unit, so no separator strands a line. */
export function ModCredit({ mod }: { mod: ModDetail }) {
  return (
    <Row gap={3} wrap>
      <Row gap={1.5}>
        <Text muted size="sm">
          by
        </Text>
        <AuthorChip author={{ name: mod.authorGithub, username: mod.authorGithub, image: null }} />
      </Row>
      <Text muted size="sm">
        source at{' '}
        <TextLink href={modSourceUrl(mod)}>{mod.commitSha.slice(0, SHORT_SHA_LENGTH)}</TextLink>
      </Text>
      <Text muted size="sm">
        {mod.license ? `${mod.license} licence` : 'No licence'}
      </Text>
    </Row>
  )
}

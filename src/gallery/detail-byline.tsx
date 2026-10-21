import type * as React from 'react'
import { Fragment } from 'react'
import type { ConfigAuthor } from '@/gallery/queries'
import { AuthorChip } from '@/ui/author-chip'
import { Row } from '@/ui/layout'
import { Text, TextLink } from '@/ui/text'

/** The facts a status line or mod page credits under its title. A null fact is left out. */
export interface Byline {
  author: ConfigAuthor | null
  /** A link to the source, after optional lead words: "original source", "source at 0123456". */
  source: { lead?: string; label: string; href: string; onClick?: () => void } | null
  /** The licence fact as the page words it: "MIT licence", "No licence". */
  license: string | null
}

export function hasBylineFacts({ author, source, license }: Byline): boolean {
  return Boolean(author || source || license)
}

/** A later fact, led by its separator dot so a wrapped line never ends on a stray dot. */
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

/** "by" and the author's avatar and GitHub link. */
function ByAuthor({ author }: { author: ConfigAuthor }) {
  return (
    <Row gap={1.5}>
      <Text muted size="sm">
        by
      </Text>
      <AuthorChip author={author} />
    </Row>
  )
}

/** "by @author": the hero's line under its install button; nothing without an author. The list
 *  beside it already shows the installs. */
export function AuthorByline({ author }: { author: ConfigAuthor | null }) {
  if (!author) return null
  return (
    <Row gap={3} wrap>
      <ByAuthor author={author} />
    </Row>
  )
}

/** "by @author · source · licence", dot-separated. Each fact wraps as a unit with its dot. */
export function DetailByline({ author, source, license }: Byline) {
  const facts: Array<{ key: string; fact: React.ReactNode }> = []
  if (author) facts.push({ key: 'author', fact: <ByAuthor author={author} /> })
  if (source) {
    facts.push({
      key: 'source',
      fact: (
        <Text muted size="sm">
          {source.lead && `${source.lead} `}
          <TextLink href={source.href} {...(source.onClick ? { onClick: source.onClick } : {})}>
            {source.label}
          </TextLink>
        </Text>
      ),
    })
  }
  if (license) {
    facts.push({
      key: 'license',
      fact: (
        <Text muted size="sm">
          {license}
        </Text>
      ),
    })
  }
  if (facts.length === 0) return null
  return (
    <Row gap={3} wrap>
      {facts.map(({ key, fact }, index) =>
        index === 0 ? (
          <Fragment key={key}>{fact}</Fragment>
        ) : (
          <LaterFact key={key}>{fact}</LaterFact>
        ),
      )}
    </Row>
  )
}

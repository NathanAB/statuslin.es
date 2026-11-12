import { DetailHeader } from '@/gallery/detail-header'
import { MODS_CRUMB } from '@/lib/breadcrumb-json-ld'
import { utcDateLabel } from '@/lib/date-label'
import { HOW_IT_WORKS_PATH } from '@/lib/page-title'
import { truncateAtWordBoundary } from '@/lib/search-text'
import { CONTACT_EMAIL } from '@/lib/site'
import { Badge } from '@/ui/badge'
import { Callout } from '@/ui/callout'
import { FactTiles } from '@/ui/fact-tiles'
import { Stack } from '@/ui/layout'
import { MetaList } from '@/ui/meta-list'
import { PageSection } from '@/ui/page-section'
import { Text, TextLink } from '@/ui/text'
import { modSourceUrl } from './install'
import { modAuthor } from './mod-author'
import { modReachTiles, SHORT_SHA_LENGTH } from './mod-fact-tiles'
import type { UnreviewedMod } from './unreviewed-queries'
import { UnreviewedReviewRequest } from './unreviewed-review-request'

/** plugin.json allows 1,000 characters; the page shows a sentence or two of the author's words. */
export const UNREVIEWED_DESCRIPTION_MAX_CHARS = 300

const day = (iso: string) => utcDateLabel(iso.slice(0, 10))

/**
 * An unreviewed mod's page (ADR 0011): facts only, and nothing to install. Every text field but the
 * pins is the author's and renders only as React text.
 */
export function UnreviewedModPage({ mod }: { mod: UnreviewedMod }) {
  const repository = new URL(mod.repoUrl).pathname.slice(1)
  return (
    <Stack gap={6}>
      <DetailHeader
        trail={[MODS_CRUMB]}
        title={mod.pluginName}
        chips={<Badge variant="outline">Not reviewed</Badge>}
        byline={{
          author: modAuthor(mod.owner),
          source: null,
          license: mod.license ? `${mod.license} license` : 'No license',
        }}
        description={truncateAtWordBoundary(mod.description, UNREVIEWED_DESCRIPTION_MAX_CHARS)}
      />
      <Callout
        title="Not reviewed"
        description={
          <>
            Nobody at statuslin.es has read this code, so it can't be installed from here. Mods with
            an install on statuslin.es are reviewed first. See{' '}
            <TextLink to={HOW_IT_WORKS_PATH}>how statuslin.es checks mods</TextLink>.
          </>
        }
      >
        <UnreviewedReviewRequest owner={mod.owner} pluginName={mod.pluginName} />
      </Callout>
      <PageSection title="What it can reach">
        <FactTiles tiles={modReachTiles(mod.footprint)} />
        <Text muted size="sm">
          Checked at commit {mod.commitSha.slice(0, SHORT_SHA_LENGTH)} on {day(mod.checkedAt)} with
          Claude Code {mod.validatedWith}.
        </Text>
      </PageSection>
      <PageSection title="Repository">
        <MetaList
          items={[
            {
              label: 'Source',
              value: <TextLink href={modSourceUrl(mod)}>{repository}</TextLink>,
            },
            { label: 'GitHub stars', value: mod.stars.toLocaleString('en-US') },
            { label: 'Commit date', value: day(mod.committedAt) },
          ]}
        />
      </PageSection>
      <Text muted size="sm">
        Is this yours?{' '}
        <TextLink to="/submit" search={{ kind: 'mod' }}>
          Ask for a review
        </TextLink>{' '}
        or <TextLink href={`mailto:${CONTACT_EMAIL}`}>have it removed</TextLink>.
      </Text>
    </Stack>
  )
}

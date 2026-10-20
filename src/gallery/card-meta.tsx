import { iconFor } from '@/gallery/config-badges'
import { FACET_BY_SLUG, facetLabel, tagHref } from '@/gallery/facets'
import { RowFacts, RowNote } from '@/ui/gallery-row'
import { installsLabel } from '@/ui/install-count'
import { Stack } from '@/ui/layout'
import { Text, TextLink } from '@/ui/text'
import { Tooltip } from '@/ui/tooltip'

/** What a status line can reach. They name a risk, not a way to browse, so they don't link. */
function CapabilityNote({ slug, networkHosts }: { slug: string; networkHosts: string[] }) {
  const note = <RowNote icon={iconFor(slug)}>{facetLabel(slug)}</RowNote>
  if (slug !== 'network-access' || networkHosts.length === 0) return note
  return (
    <Tooltip
      content={
        <Stack gap={1}>
          <Text size="xs">Connects to:</Text>
          {networkHosts.map((host) => (
            <Text key={host} size="xs" muted>
              {host}
            </Text>
          ))}
        </Stack>
      }
    >
      <span role="img" aria-label={`Uses the internet: ${networkHosts.join(', ')}`}>
        {note}
      </span>
    </Tooltip>
  )
}

/**
 * The facts on a gallery card's top line, in a quiet dotted row: `kind` (a mod card says Mod),
 * what the script can reach (network, your Claude token), each tag as a link to its page, then
 * the copy count. Capabilities lead since they're trust signals for running someone else's code.
 */
export function CardMeta({
  kind,
  tags,
  networkHosts,
  copyCount,
}: {
  kind?: string
  tags: string[]
  networkHosts: string[]
  copyCount: number
}) {
  const capabilities = tags.filter((slug) => FACET_BY_SLUG.get(slug)?.group === 'capability')
  const browsable = tags.filter((slug) => FACET_BY_SLUG.get(slug)?.group !== 'capability')
  return (
    <RowFacts>
      {[
        ...(kind ? [kind] : []),
        ...capabilities.map((slug) => (
          <CapabilityNote key={slug} slug={slug} networkHosts={networkHosts} />
        )),
        ...browsable.map((slug) =>
          FACET_BY_SLUG.get(slug)?.page ? (
            <TextLink key={slug} {...tagHref(slug)} tone="muted">
              {facetLabel(slug)}
            </TextLink>
          ) : (
            facetLabel(slug)
          ),
        ),
        installsLabel(copyCount),
      ]}
    </RowFacts>
  )
}

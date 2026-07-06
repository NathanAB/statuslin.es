import { Text, TextLink } from '@/ui/text'

/**
 * The license note shown under the Source card for seeded third-party configs: the SPDX
 * license and, when known, a link back to the pinned upstream source. Renders nothing for
 * submitter-authored configs (license is null — those are CC0 per the terms page).
 */
export function LicenseLine({
  license,
  sourceUrl,
}: {
  license: string | null
  sourceUrl: string | null
}) {
  if (!license) return null
  return (
    <Text muted size="sm">
      {license} licensed
      {sourceUrl && (
        <>
          {' '}
          · <TextLink href={sourceUrl}>original source</TextLink>
        </>
      )}
    </Text>
  )
}

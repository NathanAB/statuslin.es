import { CONTACT_EMAIL, CONTENT_LICENSE, REPO_URL } from '@/lib/site'
import { Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'

/**
 * Terms page body: what the gallery is, the license on submitted status lines, the terms for
 * listed mods, and how to report or take down either. Kept as a component (not inline in the
 * route) so the key points are unit-testable. Linked from the site footer.
 */
export function TermsContent() {
  return (
    <Stack gap={6}>
      <Heading level={1}>Terms</Heading>

      <Stack gap={2}>
        <Heading level={2}>What this is</Heading>
        <Text muted>
          statuslin.es is a community gallery of Claude Code mods, including status lines. Submitted
          status lines and mods are rendered in a sandbox and reviewed before they appear. You run
          anything you copy or install at your own risk.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>License on submitted status lines</Heading>
        <Text muted>
          Submitted status lines are released under{' '}
          <TextLink href={CONTENT_LICENSE.url}>{CONTENT_LICENSE.name}</TextLink> (public domain).
          Anyone may copy, change, and use them freely, with no attribution required. By submitting
          one, you confirm you have the right to share the script and agree to release it this way.
          Status lines seeded from open-source projects keep their original license instead, shown
          on their page with a link to the source.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>Listed mods</Heading>
        <Text muted>
          Anyone signed in can submit a mod by linking to it on GitHub. Each mod is credited to its
          repository's owner. By submitting a mod, you confirm the repository is public, you have
          the right to share the mod, and it isn't malicious. Each mod keeps its own license, or has
          none. The {CONTENT_LICENSE.shortLabel} release above does not cover mods. Authors can have
          a mod removed on request by emailing{' '}
          <TextLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextLink>.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>Reporting and takedown</Heading>
        <Text muted>
          The maintainer may remove any status line or mod at any time and at their discretion, for
          example if it is malicious, infringes someone's rights, or doesn't belong here. Anyone can
          report one or request a takedown by emailing{' '}
          <TextLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextLink>. Security issues go
          through the{' '}
          <TextLink href={`${REPO_URL}/blob/main/SECURITY.md`}>security policy</TextLink>.
        </Text>
      </Stack>
    </Stack>
  )
}

import { CONTACT_EMAIL, CONTENT_LICENSE, REPO_URL } from '@/lib/site'
import { Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'

/**
 * Terms page body: what the gallery is, the license on submitted configs, and how to
 * report or take down a config. Kept as a component (not inline in the route) so the
 * key points are unit-testable. Linked from the site footer.
 */
export function TermsContent() {
  return (
    <Stack gap={6}>
      <Heading level={1}>Terms</Heading>

      <Stack gap={2}>
        <Heading level={2}>What this is</Heading>
        <Text muted measure>
          statuslin.es is a community gallery of Claude Code status lines. Anyone can browse the
          configs, copy one, and run it on their own machine. Submitted scripts run in a sandbox and
          get a human review before they appear, but you run any copied script at your own risk.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>License on submitted configs</Heading>
        <Text muted measure>
          Configs submitted to the gallery are released under{' '}
          <TextLink href={CONTENT_LICENSE.url}>{CONTENT_LICENSE.name}</TextLink> (public domain) —
          copy, change, and use them freely, no attribution required. By submitting, you confirm you
          have the right to share the script and agree to release it this way. A few gallery entries
          are seeded from open-source projects; those keep their original license (shown on the
          config page with a link to the source) instead of CC0.
        </Text>
      </Stack>

      <Stack gap={2}>
        <Heading level={2}>Reporting & takedown</Heading>
        <Text muted measure>
          The maintainer may remove any config at its discretion — for example, a malicious script,
          one that infringes someone's rights, or anything that doesn't belong here. To report a
          config or request a takedown, email{' '}
          <TextLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</TextLink>. Security issues go
          through the{' '}
          <TextLink href={`${REPO_URL}/blob/main/SECURITY.md`}>security policy</TextLink>.
        </Text>
      </Stack>
    </Stack>
  )
}

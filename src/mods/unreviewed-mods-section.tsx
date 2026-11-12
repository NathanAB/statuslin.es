import { truncateAtWordBoundary } from '@/lib/search-text'
import { UNREVIEWED_MOD_ROUTE } from '@/lib/site'
import { Stack } from '@/ui/layout'
import { PageSection } from '@/ui/page-section'
import { Text, TextLink } from '@/ui/text'
import type { UnreviewedModLink } from './unreviewed-queries'

/** A line of the author's words under each name; the page itself shows more. */
const DESCRIPTION_MAX_CHARS = 160

/**
 * The /mods section for unreviewed mods (ADR 0011): below the ranked list, a plain list in no
 * order of merit, each linking its page. Nothing renders when there are none.
 */
export function UnreviewedModsSection({
  mods,
}: {
  mods: Array<Pick<UnreviewedModLink, 'owner' | 'pluginName' | 'description'>>
}) {
  if (mods.length === 0) return null
  return (
    <PageSection title="Mods not reviewed">
      <Text muted>
        Nobody at statuslin.es has read these mods' code, and they can't be installed from here.
      </Text>
      <Stack gap={3}>
        {mods.map((mod) => (
          <Stack key={`${mod.owner}/${mod.pluginName}`} gap={1}>
            <Text size="sm">
              <TextLink
                to={UNREVIEWED_MOD_ROUTE}
                params={{ owner: mod.owner, pluginName: mod.pluginName }}
              >
                {mod.pluginName}
              </TextLink>{' '}
              by {mod.owner}
            </Text>
            {mod.description && (
              <Text muted size="sm">
                {truncateAtWordBoundary(mod.description, DESCRIPTION_MAX_CHARS)}
              </Text>
            )}
          </Stack>
        ))}
      </Stack>
    </PageSection>
  )
}

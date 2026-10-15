import { usePostHog } from '@posthog/react'
import { modPath } from '@/lib/site'
import { STATUSLINE_ANYWHERE_MOD_SLUG, STATUSLINE_ANYWHERE_URL } from '@/lib/statusline-anywhere'
import { TextLink } from '@/ui/text'

/**
 * Inline link to statusline-anywhere; `surface` says which page the click came from. A status line
 * page links its mod page. The guides link its repo, since they link the mod page next to it.
 */
export function StatuslineAnywhereLink({
  surface,
}: {
  surface: 'config_page' | 'desktop_guide' | 'status_lines_vs_mods_guide'
}) {
  const posthog = usePostHog()
  return (
    <TextLink
      href={
        surface === 'config_page' ? modPath(STATUSLINE_ANYWHERE_MOD_SLUG) : STATUSLINE_ANYWHERE_URL
      }
      onClick={() => posthog?.capture('statusline_anywhere_link_clicked', { surface })}
    >
      statusline-anywhere
    </TextLink>
  )
}

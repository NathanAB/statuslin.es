import { usePostHog } from '@posthog/react'
import { STATUSLINE_ANYWHERE_URL } from '@/lib/statusline-anywhere'
import { TextLink } from '@/ui/text'

/** Inline link to the statusline-anywhere repo; `surface` says which page the click came from. */
export function StatuslineAnywhereLink({
  surface,
}: {
  surface: 'config_page' | 'desktop_guide' | 'home'
}) {
  const posthog = usePostHog()
  return (
    <TextLink
      href={STATUSLINE_ANYWHERE_URL}
      onClick={() => posthog?.capture('statusline_anywhere_link_clicked', { surface })}
    >
      statusline-anywhere
    </TextLink>
  )
}

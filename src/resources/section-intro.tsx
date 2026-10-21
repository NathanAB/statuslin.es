import { MarketplaceLine } from '@/mods/marketplace-line'
import { Text, TextLink } from '@/ui/text'

/**
 * The line under a /resources section's heading, where one earns a place: the statuslin.es
 * marketplace beside the others, the gallery pages people search for beside the status line tools,
 * and the in-session view beside the usage trackers.
 */
export function SectionIntro({ sectionKey, origin }: { sectionKey: string; origin: string }) {
  if (sectionKey === 'marketplaces') return <MarketplaceLine origin={origin} />
  if (sectionKey === 'tools') {
    return (
      <Text muted>
        Compare{' '}
        <TextLink to="/compare/$pair" params={{ pair: 'ccstatusline-vs-claude-powerline' }}>
          ccstatusline vs claude-powerline
        </TextLink>
        , or try{' '}
        <TextLink to="/status-lines/$facet" params={{ facet: 'token-usage' }}>
          status lines that show token usage
        </TextLink>
        .{' '}
        <TextLink to="/c/$slug" params={{ slug: 'quota-fallback-2a730aa6' }}>
          Quota Fallback
        </TextLink>{' '}
        is the reviewed copy of ohugonnot/claude-code-statusline.
      </Text>
    )
  }
  if (sectionKey === 'usage-tracking') {
    return (
      <Text muted>
        Or watch your limits inside Claude Code with{' '}
        <TextLink to="/status-lines/$facet" params={{ facet: 'quota' }}>
          status lines and mods that track usage limits
        </TextLink>
        .
      </Text>
    )
  }
  return null
}

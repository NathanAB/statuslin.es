import { usePostHog } from '@posthog/react'
import { Star } from 'lucide-react'
import { REPO_URL } from '@/lib/site'
import { Button } from '@/ui/button'

// 'bar' is a quiet "Star" in the header bar, so its accessible name spells out what is starred;
// 'menu' is a big "Star on GitHub" in the phone menu, which names itself.
const LOOK = {
  bar: { variant: 'quiet', size: 'bar', label: 'Star', name: 'Star statuslin.es on GitHub' },
  menu: { variant: 'plain', size: 'menu', label: 'Star on GitHub', name: undefined },
} as const

/**
 * Header ask to star the repo. Always visible and never interrupts, so it catches traffic spikes.
 * No star count until it's high enough to work as social proof.
 */
export function StarOnGitHubLink({ look }: { look: keyof typeof LOOK }) {
  const posthog = usePostHog()
  const { label, name, ...button } = LOOK[look]

  return (
    <Button asChild {...button}>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={name}
        onClick={() => posthog?.capture('github_star_link_clicked')}
      >
        <Star />
        <span>{label}</span>
      </a>
    </Button>
  )
}

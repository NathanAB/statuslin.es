import { usePostHog } from '@posthog/react'
import { Star } from 'lucide-react'
import { REPO_URL } from '@/lib/site'
import { Button } from '@/ui/button'

/**
 * Header ask to star the repo. Always visible and never interrupts, so it catches traffic spikes.
 * No star count until it's high enough to work as social proof. Phones show just the icon.
 */
export function StarOnGitHubLink() {
  const posthog = usePostHog()

  return (
    <Button asChild variant="ghost" size="nav">
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Star statuslin.es on GitHub"
        onClick={() => posthog?.capture('github_star_link_clicked')}
      >
        <Star />
        <span className="hidden sm:inline">Star</span>
      </a>
    </Button>
  )
}

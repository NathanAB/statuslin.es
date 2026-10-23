import { usePostHog } from '@posthog/react'
import { REPO_URL } from '@/lib/site'
import { Button } from '@/ui/button'

// 'bar' is a quiet "GitHub" in the header bar, so its accessible name says whose repo it is;
// 'menu' is a big "GitHub" in the phone menu.
const LOOK = {
  bar: { variant: 'quiet', size: 'bar', name: 'statuslin.es on GitHub' },
  menu: { variant: 'plain', size: 'menu', name: undefined },
} as const

/**
 * The header's link to the site's GitHub repo, just "GitHub". Its click keeps the analytics name
 * it had when it asked for a star.
 */
export function GitHubLink({ look }: { look: keyof typeof LOOK }) {
  const posthog = usePostHog()
  const { name, ...button } = LOOK[look]

  return (
    <Button asChild {...button}>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={name}
        onClick={() => posthog?.capture('github_star_link_clicked')}
      >
        GitHub
      </a>
    </Button>
  )
}

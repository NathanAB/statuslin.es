import { usePostHog } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { startGitHubSignIn } from '@/lib/sign-in'
import { Button } from '@/ui/button'

/**
 * The home-page "Submit a status line" CTA.
 *
 * Signed in: links to the submit form. Signed out: starts GitHub sign-in straight away
 * (the same one-click flow as the header sign-in button) and returns the user to /submit
 * afterward — no intermediate "Sign in to submit" page.
 */
export function SubmitCta({ signedIn }: { signedIn: boolean }) {
  const posthog = usePostHog()

  if (signedIn) {
    return (
      <Button asChild size="lg">
        <Link to="/submit">
          <Plus />
          Submit a status line
        </Link>
      </Button>
    )
  }

  return (
    <Button type="button" size="lg" onClick={() => startGitHubSignIn('/submit', 'submit', posthog)}>
      <Plus />
      Submit a status line
    </Button>
  )
}

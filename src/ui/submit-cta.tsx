import { usePostHog } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { startGitHubSignIn } from '@/lib/sign-in'
import { Button } from '@/ui/button'
import { GitHubMark } from '@/ui/sign-in-button'

/**
 * The Submit pill on the resources page.
 *
 * Signed in: links to the submit form. Signed out: starts GitHub sign-in straight away
 * (the same one-click flow as the header sign-in button) and returns the user to /submit
 * afterward — no intermediate "Sign in to submit" page.
 */
export function SubmitCta({ signedIn }: { signedIn: boolean }) {
  const posthog = usePostHog()

  if (signedIn) {
    return (
      <Button asChild size="pill" trailingIcon={<ArrowRight />}>
        <Link to="/submit">Submit</Link>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      size="pill"
      trailingIcon={<GitHubMark />}
      onClick={() => startGitHubSignIn('/submit', 'submit', posthog)}
    >
      Submit
    </Button>
  )
}

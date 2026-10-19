import { usePostHog } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Plus } from 'lucide-react'
import { useId, useState } from 'react'
import { startGitHubSignIn } from '@/lib/sign-in'
import { Button } from '@/ui/button'
import { ChoiceGroup } from '@/ui/choice-group'
import { GitHubMark } from '@/ui/sign-in-button'

/**
 * The "+ Submit" CTA on the home and resources pages.
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
          Submit
        </Link>
      </Button>
    )
  }

  return (
    <Button type="button" size="lg" onClick={() => startGitHubSignIn('/submit', 'submit', posthog)}>
      <Plus />
      Submit
    </Button>
  )
}

type SubmitKind = 'status-line' | 'mod'

const KINDS: readonly { value: SubmitKind; label: string }[] = [
  { value: 'status-line', label: 'Status line' },
  { value: 'mod', label: 'Mod' },
]

/**
 * The home page's closing submit panel: pick a status line or a mod, then continue to that form.
 * The same flow as SubmitCta: signed in, a link to /submit (or /submit?kind=mod); signed out,
 * GitHub sign-in straight away, returning to that form.
 */
export function SubmitChooser({ signedIn }: { signedIn: boolean }) {
  const posthog = usePostHog()
  const [kind, setKind] = useState<SubmitKind>('status-line')
  const labelId = useId()
  const path = kind === 'mod' ? '/submit?kind=mod' : '/submit'

  return (
    <div className="flex flex-col items-start gap-4.5 rounded-3xl bg-card p-7 text-foreground">
      <h3 className="font-medium text-body tracking-[-0.015em]">
        {kind === 'mod' ? 'Submit a mod' : 'Submit a status line'}
      </h3>
      <span id={labelId} className="sr-only">
        What are you submitting?
      </span>
      <ChoiceGroup
        look="tray"
        labelledBy={labelId}
        options={KINDS}
        value={kind}
        onValueChange={setKind}
      />
      {signedIn ? (
        <Button asChild size="pill" trailingIcon={<ArrowRight />}>
          <Link to="/submit" {...(kind === 'mod' ? { search: { kind: 'mod' as const } } : {})}>
            Continue
          </Link>
        </Button>
      ) : (
        <Button
          type="button"
          size="pill"
          trailingIcon={<GitHubMark />}
          onClick={() => startGitHubSignIn(path, 'submit', posthog)}
        >
          Continue with GitHub
        </Button>
      )}
    </div>
  )
}

import NumberFlow from '@number-flow/react'
import { usePostHog } from '@posthog/react'
import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { startGitHubSignIn } from '@/lib/sign-in'
import { Button } from '@/ui/button'
import { toggleVoteFn } from '@/votes/functions'

export function UpvoteButton({
  configId,
  slug,
  initialCount,
  initialVoted,
  signedIn,
}: {
  configId: string
  slug: string
  initialCount: number
  initialVoted: boolean
  signedIn: boolean
}) {
  const posthog = usePostHog()
  const router = useRouter()
  const [voted, setVoted] = useState(initialVoted)
  const [count, setCount] = useState(initialCount)
  const [pending, setPending] = useState(false)

  async function handleToggle() {
    if (pending) return
    const prevVoted = voted
    const prevCount = count
    const willVote = !voted
    setVoted(willVote)
    setCount(voted ? count - 1 : count + 1)
    setPending(true)
    try {
      const result = await toggleVoteFn({ data: { configId } })
      setVoted(result.voted)
      setCount(result.count)
      posthog.capture(willVote ? 'statusline_upvoted' : 'statusline_unvoted', {
        configId,
        slug,
        newCount: result.count,
      })
      await router.invalidate()
    } catch {
      setVoted(prevVoted)
      setCount(prevCount)
    } finally {
      setPending(false)
    }
  }

  if (signedIn) {
    return (
      <Button
        type="button"
        variant={voted ? 'secondary' : 'outline'}
        size="lg"
        onClick={() => void handleToggle()}
        disabled={pending}
        aria-pressed={voted}
        aria-label={voted ? 'Remove upvote' : 'Upvote'}
      >
        ⇧ <NumberFlow value={count} />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      title="Sign in to vote"
      onClick={() => startGitHubSignIn(`/c/${slug}`)}
      aria-label={`Upvote (sign in to vote) — ${count} upvotes`}
    >
      ⇧ <NumberFlow value={count} />
    </Button>
  )
}

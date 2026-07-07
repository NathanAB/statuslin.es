import { usePostHog } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import { FileText, LogOut, ShieldCheck } from 'lucide-react'
import type { PostHog } from 'posthog-js'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { SignInButton } from '@/ui/sign-in-button'
import { Wordmark } from '@/ui/wordmark'

export interface AppHeaderUser {
  name: string
  username?: string | null | undefined
  image?: string | null | undefined
  role?: string | null | undefined
}

// Loader data everywhere depends on the session, so after sign-out we do a full
// reload to home rather than a soft invalidate (the router isn't reachable from src/ui).
async function handleSignOut(posthog: PostHog) {
  // Clear the PostHog identity first so the next person on this browser starts as a fresh
  // anonymous user instead of inheriting the signed-out user's distinct id.
  posthog.reset()
  try {
    await authClient.signOut()
  } finally {
    // Even if the sign-out call fails, reload home — the fresh page reflects the real session.
    window.location.assign('/')
  }
}

/**
 * Shared top header: wordmark home-link + nav.
 * Signed in: avatar + @username dropdown (Log out, plus Review for admins).
 * Signed out: GitHub sign-in. Submitting lives on the home page CTA, not here.
 */
export function AppHeader({ user = null }: { user?: AppHeaderUser | null }) {
  return (
    <header className="py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6">
        <Link to="/" className="hover:opacity-80">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="lg">
            <Link to="/resources">Resources</Link>
          </Button>
          {user ? <UserMenu user={user} /> : <SignInButton />}
        </nav>
      </div>
    </header>
  )
}

function UserMenu({ user }: { user: AppHeaderUser }) {
  const posthog = usePostHog()
  // Same byline rule as AuthorChip: prefer @username, fall back to the display name.
  const label = user.username ? `@${user.username}` : user.name

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="trigger">
          {user.image ? (
            <img src={user.image} alt="" className="size-5 shrink-0 rounded-full" />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sunken font-medium text-muted-foreground text-xs"
            >
              {user.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="truncate">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      {/* Don't refocus the trigger on close — it paints a focus ring after mouse use. */}
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem asChild>
          <Link to="/me">
            <FileText />
            My submissions
          </Link>
        </DropdownMenuItem>
        {user.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link to="/admin/review">
              <ShieldCheck />
              Review
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => handleSignOut(posthog)}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

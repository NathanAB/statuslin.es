import { usePostHog } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import { FileText, LogOut, ShieldCheck } from 'lucide-react'
import type { PostHog } from 'posthog-js'
import { authClient } from '@/lib/auth-client'
import type { AppHeaderUser } from '@/ui/app-header'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

// Loader data everywhere depends on the session, so after sign-out we do a full
// reload to home rather than a soft invalidate (the router isn't reachable from src/ui).
export async function signOutAndGoHome(posthog: PostHog) {
  // Clear the PostHog identity first so the next person on this browser starts as a fresh
  // anonymous user instead of inheriting the signed-out user's distinct id.
  posthog.reset()
  try {
    await authClient.signOut()
  } catch {
    // Sign-out fetch can fail during page teardown; still send them home.
  } finally {
    // Even if the sign-out call fails, reload home — the fresh page reflects the real session.
    window.location.assign('/')
  }
}

/** Same byline rule as AuthorChip: prefer @username, fall back to the display name. */
export function userLabel(user: AppHeaderUser): string {
  return user.username ? `@${user.username}` : user.name
}

/** The header bar's account menu: avatar + @username, opening My submissions, Review, Log out. */
export function UserMenu({ user }: { user: AppHeaderUser }) {
  const posthog = usePostHog()
  const label = userLabel(user)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="plain" size="bar" aria-label={label}>
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
          <span className="max-w-48 truncate">{label}</span>
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
        <DropdownMenuItem onSelect={() => signOutAndGoHome(posthog)}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

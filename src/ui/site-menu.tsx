import { usePostHog } from '@posthog/react'
import { Link } from '@tanstack/react-router'
import { Dialog } from 'radix-ui'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/cn'
import type { AppHeaderUser, HeaderLink } from '@/ui/app-header'
import { Button } from '@/ui/button'
import { SignInButton } from '@/ui/sign-in-button'
import { StarOnGitHubLink } from '@/ui/star-on-github-link'
import { signOutAndGoHome, userLabel } from '@/ui/user-menu'
import { Wordmark } from '@/ui/wordmark'

// The round button phones get in place of the header's links, and the same spot's close button.
const ROUND_BUTTON =
  'relative size-11 shrink-0 cursor-pointer rounded-full bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden'
const LINE = 'absolute inset-x-3.5 h-[1.5px] bg-foreground'

// Each row rises into place a beat after the one above. Motion only when the visitor allows it.
const RISE =
  'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-8 motion-safe:duration-700 motion-safe:ease-settle motion-safe:fill-mode-both'
const DELAYS = [
  'delay-[80ms]',
  'delay-[140ms]',
  'delay-[200ms]',
  'delay-[260ms]',
  'delay-[320ms]',
  'delay-[380ms]',
  'delay-[440ms]',
  'delay-[500ms]',
]
// The width (Tailwind's md) where the header bar takes over from this menu.
const DESKTOP = '(min-width: 48rem)'

/**
 * The header on phones: a menu button that opens the header's links full-screen, in big type, with
 * GitHub sign-in or the signed-in user's account links. A modal dialog, so focus stays inside it
 * and Escape closes it. Hidden from md up, where the header bar shows the links itself.
 */
export function SiteMenu({
  user,
  links,
}: {
  user: AppHeaderUser | null
  links: readonly HeaderLink[]
}) {
  const [open, setOpen] = useState(false)
  const posthog = usePostHog()

  // The menu is hidden from md up. Left open across that width (a phone turned landscape, a
  // widened window), its modal would keep the page inert behind nothing, so it closes itself.
  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia?.(DESKTOP)
    if (!desktop) return
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false)
    }
    closeOnDesktop()
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [open])

  const rows = [
    ...links.map(({ to, label }) => (
      <Dialog.Close key={to} asChild>
        <Button asChild variant="plain" size="menu">
          <Link to={to}>{label}</Link>
        </Button>
      </Dialog.Close>
    )),
    <StarOnGitHubLink key="star" look="menu" />,
    ...(user
      ? [
          <p key="user" className="wrap-anywhere pt-6 text-body text-muted-foreground">
            Signed in as {userLabel(user)}
          </p>,
          <Dialog.Close key="me" asChild>
            <Button asChild variant="plain" size="menu">
              <Link to="/me">My submissions</Link>
            </Button>
          </Dialog.Close>,
          ...(user.role === 'admin'
            ? [
                <Dialog.Close key="review" asChild>
                  <Button asChild variant="plain" size="menu">
                    <Link to="/admin/review">Review</Link>
                  </Button>
                </Dialog.Close>,
              ]
            : []),
          <Button
            key="logout"
            type="button"
            variant="plain"
            size="menu"
            onClick={() => signOutAndGoHome(posthog)}
          >
            Log out
          </Button>,
        ]
      : [<SignInButton key="signin" look="menu" />]),
  ]

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={ROUND_BUTTON} aria-label="Menu">
        <span aria-hidden="true" className={cn(LINE, 'top-[18px]')} />
        <span aria-hidden="true" className={cn(LINE, 'top-[25px]')} />
      </Dialog.Trigger>
      <Dialog.Portal>
        {/* The Overlay is what locks the page behind from scrolling. */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background md:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className="motion-safe:data-[state=open]:fade-in-0 fixed inset-0 z-50 overflow-y-auto px-6 pb-10 motion-safe:data-[state=open]:animate-in md:hidden"
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <div className="flex items-center justify-between py-5.5">
            <Dialog.Close asChild>
              <Link to="/" className="rounded-sm">
                <Wordmark />
              </Link>
            </Dialog.Close>
            <Dialog.Close className={ROUND_BUTTON} aria-label="Close menu">
              <span aria-hidden="true" className={cn(LINE, 'top-[21.5px] rotate-45')} />
              <span aria-hidden="true" className={cn(LINE, 'top-[21.5px] -rotate-45')} />
            </Dialog.Close>
          </div>
          <nav aria-label="Site">
            <ul className="mt-10 flex flex-col items-start gap-2">
              {rows.map((row, i) => (
                <li key={row.key} className={cn(RISE, DELAYS[Math.min(i, DELAYS.length - 1)])}>
                  {row}
                </li>
              ))}
            </ul>
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

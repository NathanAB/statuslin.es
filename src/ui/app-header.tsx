import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { GUIDE_CRUMB } from '@/lib/breadcrumb-json-ld'
import { cn } from '@/lib/cn'
import { MODS_PATH } from '@/lib/site'
import { Button } from '@/ui/button'
import { PAGE_COLUMN } from '@/ui/page-column'
import { SignInButton } from '@/ui/sign-in-button'
import { SiteMenu } from '@/ui/site-menu'
import { StarOnGitHubLink } from '@/ui/star-on-github-link'
import { UserMenu } from '@/ui/user-menu'
import { Wordmark } from '@/ui/wordmark'

export interface AppHeaderUser {
  name: string
  username?: string | null | undefined
  image?: string | null | undefined
  role?: string | null | undefined
}

export interface HeaderLink {
  to: string
  label: string
}

// The pages the header links, in order. The phone menu lists the same ones, then Submit.
const HEADER_LINKS: readonly HeaderLink[] = [
  { to: MODS_PATH, label: 'Mods' },
  { to: GUIDE_CRUMB.to, label: GUIDE_CRUMB.name },
  { to: '/resources', label: 'Resources' },
]
// /submit itself asks a signed-out visitor to sign in first.
const SUBMIT_LINK: HeaderLink = { to: '/submit', label: 'Submit' }
const MENU_LINKS = [...HEADER_LINKS, SUBMIT_LINK]

/**
 * Shared top header, a plain bar on the page column: the wordmark home-link, quiet links (Mods,
 * Guide, Resources, Star on GitHub), Submit as the bar's one filled button, then GitHub sign-in or
 * the signed-in user's menu. Phones keep the wordmark and Submit, and get a menu button for the
 * rest, which opens the links full-screen.
 */
export function AppHeader({ user = null }: { user?: AppHeaderUser | null }) {
  return (
    <header className="py-5.5">
      <div className={cn('flex items-center gap-3 md:gap-8', PAGE_COLUMN)}>
        <Link to="/" className="rounded-sm hover:opacity-80">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-7 md:flex">
          {HEADER_LINKS.map(({ to, label }) => (
            <Button key={to} asChild variant="quiet" size="bar">
              <Link to={to}>{label}</Link>
            </Button>
          ))}
          <StarOnGitHubLink look="bar" />
        </nav>
        <Button asChild size="bar-pill">
          <Link to={SUBMIT_LINK.to} className="max-md:ml-auto">
            <Plus aria-hidden />
            {SUBMIT_LINK.label}
          </Link>
        </Button>
        <div className="hidden md:flex">
          {user ? <UserMenu user={user} /> : <SignInButton look="bar" />}
        </div>
        <SiteMenu user={user} links={MENU_LINKS} />
      </div>
    </header>
  )
}

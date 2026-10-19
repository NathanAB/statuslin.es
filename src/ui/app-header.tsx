import { Link } from '@tanstack/react-router'
import { GUIDE_CRUMB } from '@/lib/breadcrumb-json-ld'
import { cn } from '@/lib/cn'
import { MODS_PATH } from '@/lib/site'
import { Button } from '@/ui/button'
import { PAGE_MEASURE, type PageMeasure } from '@/ui/page-measure'
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

// The pages the header links, in order. The phone menu lists the same ones.
const HEADER_LINKS: readonly HeaderLink[] = [
  { to: MODS_PATH, label: 'Mods' },
  { to: GUIDE_CRUMB.to, label: GUIDE_CRUMB.name },
  { to: '/resources', label: 'Resources' },
]

/**
 * Shared top header, a plain bar: the wordmark home-link, quiet links (Mods, Guide, Resources,
 * Star on GitHub), then GitHub sign-in or the signed-in user's menu. Phones get a menu button
 * instead, which opens the same links full-screen. Submitting lives on the home page, not here.
 * `measure` lines it up with the page's content column.
 */
export function AppHeader({
  user = null,
  measure = 'standard',
}: {
  user?: AppHeaderUser | null
  measure?: PageMeasure
}) {
  return (
    <header className="py-5.5">
      <div className={cn('flex items-center gap-8', PAGE_MEASURE[measure])}>
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
        <div className="hidden md:flex">
          {user ? <UserMenu user={user} /> : <SignInButton look="bar" />}
        </div>
        <SiteMenu user={user} links={HEADER_LINKS} />
      </div>
    </header>
  )
}

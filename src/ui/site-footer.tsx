import type { LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import {
  BUDDY_GUIDE_PATH,
  DESKTOP_GUIDE_PATH,
  HOME_HEADING,
  MOD_SAFETY_GUIDE_PATH,
  NOT_SHOWING_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
} from '@/lib/page-title'
import { CONTACT_EMAIL, MODS_PATH, REPO_URL, SITE_NAME } from '@/lib/site'
import { PAGE_COLUMN } from '@/ui/page-column'
import { TextLink } from '@/ui/text'

// A page of the site (`to`) or an address off it (`href`).
type FooterLink = { label: string } & ({ to: NonNullable<LinkProps['to']> } | { href: string })

// The footer's links in three columns, so the layout is the same on every page and at every width.
const GROUPS: readonly { title: string; links: readonly FooterLink[] }[] = [
  {
    title: 'Browse',
    links: [
      { to: MODS_PATH, label: 'Mods' },
      { to: '/status-lines/best', label: 'Best status lines' },
      { to: '/resources', label: 'Resources' },
      { to: '/submit', label: 'Submit' },
    ],
  },
  {
    title: 'Guides',
    links: [
      { to: '/guide', label: 'Setup guide' },
      { to: NOT_SHOWING_GUIDE_PATH, label: 'Status line not showing?' },
      { to: DESKTOP_GUIDE_PATH, label: 'Claude Desktop' },
      { to: STATUS_LINES_VS_MODS_GUIDE_PATH, label: 'Status lines vs mods' },
      { to: MOD_SAFETY_GUIDE_PATH, label: 'Are mods safe?' },
      { to: BUDDY_GUIDE_PATH, label: 'Buddy pets' },
    ],
  },
  {
    title: 'About',
    links: [
      { href: REPO_URL, label: 'GitHub' },
      // The abuse-report path.
      { href: `mailto:${CONTACT_EMAIL}`, label: 'Contact' },
      { to: '/terms', label: 'Terms' },
    ],
  },
]

/**
 * Shared bottom footer on every page, on the page column: what the site is, a page's own note
 * (`note`, the home page's inventory) and the copyright on the left, then the links in three
 * named columns (Browse, Guides, About). Phones put the left part on top and the columns two up.
 */
export function SiteFooter({ note }: { note?: ReactNode }) {
  return (
    <footer className={cn('pt-20 pb-10 text-small', PAGE_COLUMN)}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-12">
        <div className="col-span-2 flex flex-col gap-1.5 text-muted-foreground md:col-span-4 lg:col-span-6">
          <p className="text-foreground">{HOME_HEADING}</p>
          {note ? <p>{note}</p> : null}
          {/* The year is the visitor's clock; it can only differ from the server's on New Year's. */}
          <p suppressHydrationWarning>{`© ${new Date().getFullYear()} ${SITE_NAME}`}</p>
        </div>
        <nav
          aria-label="Footer"
          className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:col-span-8 lg:col-span-6"
        >
          {GROUPS.map(({ title, links }) => (
            <div key={title}>
              <h2 id={`footer-${title.toLowerCase()}`} className="text-muted-foreground">
                {title}
              </h2>
              <ul
                aria-labelledby={`footer-${title.toLowerCase()}`}
                className="mt-3 flex flex-col gap-2"
              >
                {links.map((link) => (
                  <li key={link.label}>
                    {'to' in link ? (
                      <TextLink to={link.to} tone="plain">
                        {link.label}
                      </TextLink>
                    ) : (
                      <TextLink href={link.href} tone="plain">
                        {link.label}
                      </TextLink>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  )
}

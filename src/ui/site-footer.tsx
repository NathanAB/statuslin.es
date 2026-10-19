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
import { PAGE_MEASURE, type PageMeasure } from '@/ui/page-measure'
import { TextLink } from '@/ui/text'

const PAGE_LINKS = [
  { to: MODS_PATH, label: 'Mods' },
  { to: '/status-lines/best', label: 'Best status lines' },
  { to: '/guide', label: 'Guide' },
  { to: NOT_SHOWING_GUIDE_PATH, label: 'Status line not showing?' },
  { to: DESKTOP_GUIDE_PATH, label: 'Claude Desktop' },
  { to: STATUS_LINES_VS_MODS_GUIDE_PATH, label: 'Status lines vs mods' },
  { to: MOD_SAFETY_GUIDE_PATH, label: 'Are mods safe?' },
  { to: BUDDY_GUIDE_PATH, label: 'Buddy pets' },
  { to: '/resources', label: 'Resources' },
] as const

/**
 * Shared bottom footer on every page, a quiet block: what the site is and the copyright on the
 * left, and beside them every page link, the GitHub source, a mailto contact (the abuse-report
 * path) and Terms, wrapping onto a second line as the width needs. Phones stack the three parts.
 * `measure` lines it up with the page's content column.
 */
export function SiteFooter({ measure = 'standard' }: { measure?: PageMeasure }) {
  return (
    <footer className={cn('pt-16 pb-8 text-small', PAGE_MEASURE[measure])}>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-x-12 lg:gap-y-1.5">
        <p className="text-muted-foreground">{HOME_HEADING}</p>
        <nav aria-label="Footer" className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
            {PAGE_LINKS.map(({ to, label }) => (
              <li key={to}>
                <TextLink to={to} tone="plain">
                  {label}
                </TextLink>
              </li>
            ))}
            <li>
              <TextLink href={REPO_URL} tone="plain">
                GitHub
              </TextLink>
            </li>
            <li>
              <TextLink href={`mailto:${CONTACT_EMAIL}`} tone="plain">
                Contact
              </TextLink>
            </li>
            <li>
              <TextLink to="/terms" tone="plain">
                Terms
              </TextLink>
            </li>
          </ul>
        </nav>
        {/* The year is the visitor's clock; it can only differ from the server's on New Year's. */}
        <p suppressHydrationWarning className="text-muted-foreground lg:col-start-1 lg:row-start-2">
          {`© ${new Date().getFullYear()} ${SITE_NAME}`}
        </p>
      </div>
    </footer>
  )
}

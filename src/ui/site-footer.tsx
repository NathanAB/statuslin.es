import {
  BUDDY_GUIDE_PATH,
  DESKTOP_GUIDE_PATH,
  MOD_SAFETY_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
} from '@/lib/page-title'
import { CONTACT_EMAIL, MODS_PATH, REPO_URL } from '@/lib/site'
import { TextLink } from '@/ui/text'

const PAGE_LINKS = [
  { to: MODS_PATH, label: 'Mods' },
  { to: '/status-lines/best', label: 'Best status lines' },
  { to: '/guide', label: 'Guide' },
  { to: DESKTOP_GUIDE_PATH, label: 'Claude Desktop' },
  { to: STATUS_LINES_VS_MODS_GUIDE_PATH, label: 'Status lines vs mods' },
  { to: MOD_SAFETY_GUIDE_PATH, label: 'Are mods safe?' },
  { to: BUDDY_GUIDE_PATH, label: 'Buddy pets' },
  { to: '/resources', label: 'Resources' },
] as const

// Each item draws a thin rule in its left gutter, like the bars between a status line's segments.
// The list is pulled one gutter left inside a clipping box, so the rule before whichever item
// starts a line is cut off: rules only ever sit between two links, however the row wraps. The
// box's p-1 keeps link focus rings inside the clip.
const ITEM =
  'relative pl-6 before:absolute before:top-1/2 before:left-3 before:h-3.5 before:w-px before:-translate-y-1/2 before:bg-border'

/**
 * Shared bottom footer on every page, aligned with the header: the site's pages, then the GitHub
 * source, a mailto contact (the abuse-report path) and Terms.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-5xl px-5 py-5">
      <div className="overflow-hidden p-1">
        <ul className="-ml-6 flex flex-wrap gap-y-1">
          {PAGE_LINKS.map(({ to, label }) => (
            <li key={to} className={ITEM}>
              <TextLink to={to} size="sm">
                {label}
              </TextLink>
            </li>
          ))}
          <li className={ITEM}>
            <TextLink href={REPO_URL} size="sm">
              GitHub
            </TextLink>
          </li>
          <li className={ITEM}>
            <TextLink href={`mailto:${CONTACT_EMAIL}`} size="sm">
              Contact
            </TextLink>
          </li>
          <li className={ITEM}>
            <TextLink to="/terms" size="sm">
              Terms
            </TextLink>
          </li>
        </ul>
      </div>
    </footer>
  )
}

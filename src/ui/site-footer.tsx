import {
  DESKTOP_GUIDE_PATH,
  MOD_SAFETY_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
} from '@/lib/page-title'
import { CONTACT_EMAIL, MODS_PATH, REPO_URL } from '@/lib/site'
import { Row } from '@/ui/layout'
import { TextLink } from '@/ui/text'

/**
 * Shared bottom footer on every page: the centered text links — the GitHub source,
 * a mailto report (the abuse-report path), the mods gallery, the best status lines,
 * the Guide and its subpages, Resources and Terms. No dot separators: the row wraps on a phone,
 * and a dot would end up alone at the end of a line.
 */
export function SiteFooter() {
  return (
    <footer className="px-6 py-4">
      <Row gap={3} justify="center" wrap>
        <TextLink
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Source on GitHub"
          size="sm"
        >
          GitHub
        </TextLink>
        <TextLink href={`mailto:${CONTACT_EMAIL}`} aria-label="Report or contact" size="sm">
          Email
        </TextLink>
        <TextLink to={MODS_PATH} size="sm">
          Mods
        </TextLink>
        <TextLink to="/status-lines/best" size="sm">
          Best status lines
        </TextLink>
        <TextLink to="/guide" size="sm">
          Guide
        </TextLink>
        <TextLink to={DESKTOP_GUIDE_PATH} size="sm">
          Claude Desktop
        </TextLink>
        <TextLink to={STATUS_LINES_VS_MODS_GUIDE_PATH} size="sm">
          Status lines vs mods
        </TextLink>
        <TextLink to={MOD_SAFETY_GUIDE_PATH} size="sm">
          Are mods safe?
        </TextLink>
        <TextLink to="/resources" size="sm">
          Resources
        </TextLink>
        <TextLink to="/terms" size="sm">
          Terms
        </TextLink>
      </Row>
    </footer>
  )
}

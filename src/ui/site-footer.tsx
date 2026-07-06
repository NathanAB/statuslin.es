import { CONTACT_EMAIL, REPO_URL } from '@/lib/site'
import { Row } from '@/ui/layout'
import { TextLink } from '@/ui/text'

/**
 * Shared bottom footer on every page: three centered text links — the GitHub source,
 * a mailto report (the abuse-report path), and the Terms page, separated by dots.
 */
export function SiteFooter() {
  return (
    <footer className="py-4">
      <Row gap={2} justify="center">
        <TextLink
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Source on GitHub"
          size="sm"
        >
          GitHub
        </TextLink>
        ·
        <TextLink href={`mailto:${CONTACT_EMAIL}`} aria-label="Report or contact" size="sm">
          Email
        </TextLink>
        ·
        <TextLink to="/terms" size="sm">
          Terms
        </TextLink>
      </Row>
    </footer>
  )
}

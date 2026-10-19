import { HOME_HEADING } from '@/lib/page-title'
import { Heading } from '@/ui/text'
import { VisuallyHidden } from '@/ui/visually-hidden'

/**
 * The h1 of a gallery page past the first, which is only its results: the home page's title, with
 * the page number for search engines and screen readers (the pager shows it on screen).
 */
export function HomeResultsHeading({ page }: { page: number }) {
  return (
    <Heading level={1}>
      {HOME_HEADING}
      <VisuallyHidden>, page {page}</VisuallyHidden>
    </Heading>
  )
}

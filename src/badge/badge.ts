import { makeBadge } from 'badge-maker'
import { SITE_NAME } from '@/lib/site'
import { OG_PALETTE } from '@/og/palette'
import { installsLabel } from '@/ui/install-count'

/**
 * A listing's README badge: "statuslin.es | reviewed · 223 installs", or just "reviewed" while the
 * count is too small to show. It draws only our words and the number, never the listing's title or
 * anything else an author wrote, so nothing in it can break the README it sits in.
 */
export function badgeSvg(copyCount: number): string {
  const installs = installsLabel(copyCount)
  return makeBadge({
    label: SITE_NAME,
    message: installs === null ? 'reviewed' : `reviewed · ${installs}`,
    color: OG_PALETTE.primaryFill,
  })
}

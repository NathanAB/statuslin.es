import { Link } from '@tanstack/react-router'
import { Badge } from '@/ui/badge'
import { Row } from '@/ui/layout'
import type { Palette } from './palettes'

/**
 * The palette pages these themes have, in /themes' order. On a palette's own page, `current` marks
 * it as the page.
 */
export function PaletteLinks({ palettes, current }: { palettes: Palette[]; current?: string }) {
  return (
    <nav aria-label="Themes by palette">
      <Row gap={2} wrap>
        {palettes.map((palette) => (
          <Link
            key={palette.slug}
            to="/themes/$palette"
            params={{ palette: palette.slug }}
            aria-current={palette.slug === current ? 'page' : undefined}
          >
            <Badge variant={palette.slug === current ? 'default' : 'secondary'}>
              {palette.name}
            </Badge>
          </Link>
        ))}
      </Row>
    </nav>
  )
}

import { Download } from 'lucide-react'
import { Row } from '@/ui/layout'
import { Text } from '@/ui/text'

/** Below this many installs every surface leaves the count out: a tiny number reads as a flop. */
const MIN_SHOWN_INSTALLS = 3

/**
 * "223 installs": how every surface words the count, or null when it is too small to show. It
 * counts the visitors who copied the install prompt or the script (`copyCount` in the data), each
 * once.
 */
export function installsLabel(count: number): string | null {
  return count < MIN_SHOWN_INSTALLS ? null : `${count} installs`
}

/** Compact, read-only popularity metric shared by gallery and detail surfaces. */
export function InstallCount({ count }: { count: number }) {
  const label = installsLabel(count)
  if (label === null) return null
  return (
    <Row gap={1}>
      <Download className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <Text muted size="sm">
        {label}
      </Text>
    </Row>
  )
}

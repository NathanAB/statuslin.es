import { Download } from 'lucide-react'
import { Row } from '@/ui/layout'
import { Text } from '@/ui/text'

/**
 * "1 install", "223 installs": how every surface words the count. It counts the visitors who
 * copied the install prompt or the script (`copyCount` in the data), each once.
 */
export function installsLabel(count: number): string {
  return `${count} ${count === 1 ? 'install' : 'installs'}`
}

/** Compact, read-only popularity metric shared by gallery and detail surfaces. */
export function InstallCount({ count }: { count: number }) {
  return (
    <Row gap={1}>
      <Download className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <Text muted size="sm">
        {installsLabel(count)}
      </Text>
    </Row>
  )
}

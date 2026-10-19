import { Copy } from 'lucide-react'
import { Row } from '@/ui/layout'
import { Text } from '@/ui/text'

/** "1 copy", "223 copies": how every surface words a copy count. */
export function copiesLabel(count: number): string {
  return `${count} ${count === 1 ? 'copy' : 'copies'}`
}

/** Compact, read-only popularity metric shared by gallery and detail surfaces. */
export function CopyCount({ count }: { count: number }) {
  return (
    <Row gap={1}>
      <Copy className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <Text muted size="sm">
        {copiesLabel(count)}
      </Text>
    </Row>
  )
}

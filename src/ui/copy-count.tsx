import { Copy } from 'lucide-react'
import { Row } from '@/ui/layout'
import { Text } from '@/ui/text'

/** Compact, read-only popularity metric shared by gallery and detail surfaces. */
export function CopyCount({ count }: { count: number }) {
  return (
    <Row gap={1}>
      <Copy className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <Text muted size="sm">
        {count} {count === 1 ? 'copy' : 'copies'}
      </Text>
    </Row>
  )
}

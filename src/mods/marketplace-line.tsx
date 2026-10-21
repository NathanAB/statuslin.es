import { marketplaceAddCommand } from '@/mods/install'
import { CopyButton } from '@/ui/copy-button'
import { Row, Stack } from '@/ui/layout'
import { Text } from '@/ui/text'

/**
 * One plain line on mod pages and /mods: the command that adds the whole marketplace, so `/plugin`
 * lists the reviewed mods without another visit. No popup; a visitor who wants one mod still copies
 * its install prompt.
 */
export function MarketplaceLine({ origin }: { origin: string }) {
  const command = marketplaceAddCommand(origin)
  return (
    <Stack gap={1}>
      <Text muted size="sm">
        To browse the reviewed mods from Claude Code's{' '}
        <Text inline mono>
          /plugin
        </Text>{' '}
        menu, add the marketplace in the terminal:
      </Text>
      <Row gap={1}>
        <Text mono size="sm" breakLong>
          {command}
        </Text>
        <CopyButton iconOnly variant="ghost" text={command} label="Copy marketplace command" />
      </Row>
    </Stack>
  )
}

import { marketplaceAddCommand } from '@/mods/install'
import { CodeBlock } from '@/ui/code-block'
import { Stack } from '@/ui/layout'
import { Text } from '@/ui/text'

/**
 * On mod pages and /resources: the command that adds the whole marketplace, so `/plugin` lists the
 * reviewed mods without another visit, in a code box like the guide's commands. No popup; a
 * visitor who wants one mod still copies its install prompt.
 */
export function MarketplaceLine({ origin }: { origin: string }) {
  const command = marketplaceAddCommand(origin)
  return (
    <Stack gap={2}>
      <Text muted size="sm">
        To browse the reviewed mods from Claude Code's{' '}
        <Text inline mono>
          /plugin
        </Text>{' '}
        menu, add the marketplace in the terminal:
      </Text>
      <CodeBlock wrap text={command} copyLabel="Copy marketplace command">
        {command}
      </CodeBlock>
    </Stack>
  )
}

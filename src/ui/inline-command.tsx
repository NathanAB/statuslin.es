import { Text } from '@/ui/text'

/**
 * A short shell command inside a sentence (`brew install jq`), in monospace and kept on one line,
 * so a narrow screen never splits it across two.
 */
export function InlineCommand({ children }: { children: string }) {
  return (
    <span className="whitespace-nowrap">
      <Text inline mono>
        {children}
      </Text>
    </span>
  )
}

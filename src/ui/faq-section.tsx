import type { FaqEntry } from '@/lib/json-ld'
import { InlineCodeText } from '@/ui/inline-code-text'
import { Stack } from '@/ui/layout'
import { Heading, Text } from '@/ui/text'

export function FaqSection({ entries }: { entries: FaqEntry[] }) {
  return (
    <Stack gap={3}>
      <Heading level={2}>Common questions</Heading>
      {entries.map((entry) => (
        <Stack key={entry.question} gap={1.5}>
          <Heading level={3}>{entry.question}</Heading>
          <Text muted>
            <InlineCodeText text={entry.answer} />
          </Text>
        </Stack>
      ))}
    </Stack>
  )
}

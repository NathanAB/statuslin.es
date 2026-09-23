import type { FaqEntry } from '@/lib/json-ld'
import { Stack } from '@/ui/layout'
import { Heading, Text } from '@/ui/text'

/** A "Common questions" block. Takes the same entries the page emits as FAQPage JSON-LD, so the
 * visible answers and the structured data can't drift apart. */
export function FaqSection({ entries }: { entries: FaqEntry[] }) {
  return (
    <Stack gap={3}>
      <Heading level={2}>Common questions</Heading>
      {entries.map((entry) => (
        <Stack key={entry.question} gap={1.5}>
          <Heading level={3}>{entry.question}</Heading>
          <Text muted>{entry.answer}</Text>
        </Stack>
      ))}
    </Stack>
  )
}

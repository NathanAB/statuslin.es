import { inlineCodeParts } from '@/lib/inline-code'
import { Text } from '@/ui/text'

export function InlineCodeText({ text }: { text: string }) {
  return inlineCodeParts(text).map((part) =>
    part.code ? (
      <Text key={part.offset} inline mono>
        {part.text}
      </Text>
    ) : (
      part.text
    ),
  )
}

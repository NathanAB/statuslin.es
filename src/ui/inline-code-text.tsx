import { inlineCodeParts } from '@/lib/inline-code'
import { Text } from '@/ui/text'

/** Text with backtick-marked code in monospace. `tinted`: the code keeps the color around it (a
 *  risk in the caution tint) instead of full-strength text. */
export function InlineCodeText({ text, tinted = false }: { text: string; tinted?: boolean }) {
  return inlineCodeParts(text).map((part) =>
    part.code ? (
      <Text key={part.offset} inline mono inheritColor={tinted}>
        {part.text}
      </Text>
    ) : (
      part.text
    ),
  )
}

import { InlineCodeText } from '@/ui/inline-code-text'

/**
 * Numbered steps on the shared small-text scale, the ordered sibling of BulletList. Items are
 * plain strings; backticks mark code.
 */
export function NumberedList({ items }: { items: string[] }) {
  return (
    <ol className="text-foreground marker:text-muted-foreground flex list-decimal flex-col gap-1.5 pl-5 text-sm">
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: steps are static (never reordered), so index+content avoids collisions when items repeat verbatim.
        <li key={`${i}-${item}`}>
          <InlineCodeText text={item} />
        </li>
      ))}
    </ol>
  )
}

import { InlineCodeText } from '@/ui/inline-code-text'

/**
 * A plain disc bullet list on the shared small-text scale. The list owns its spacing and
 * indent, so callers never style it — items are plain strings; backticks mark code.
 */
export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground text-sm">
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list is static (never reordered), so index+content avoids collisions when items repeat verbatim.
        <li key={`${i}-${item}`}>
          <InlineCodeText text={item} />
        </li>
      ))}
    </ul>
  )
}

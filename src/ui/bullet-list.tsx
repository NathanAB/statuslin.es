/**
 * A plain disc bullet list on the shared small-text scale. The list owns its spacing and
 * indent, so callers never style it — items are plain strings.
 */
export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-foreground text-sm">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

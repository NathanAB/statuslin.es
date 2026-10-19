import { ToggleGroup } from 'radix-ui'

/**
 * One bordered control split into segments, exactly one of them selected (a radio group). The
 * selected segment is filled with the primary color. Clicking the selected one keeps it.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
}: {
  /** Names the group for screen readers. */
  label: string
  options: readonly { label: string; value: T }[]
  value: T
  onValueChange: (value: T) => void
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      className="inline-flex h-9 items-stretch overflow-hidden rounded-md border border-border"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className="cursor-pointer border-border not-first:border-l px-3 font-medium text-muted-foreground text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=on]:cursor-default data-[state=on]:bg-primary-fill data-[state=on]:text-primary-foreground"
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

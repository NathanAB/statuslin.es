import { cva } from 'class-variance-authority'
import { ToggleGroup } from 'radix-ui'
import { FOCUS_RING } from '@/ui/focus-ring'

const root = cva('', {
  variants: {
    look: {
      boxed: 'inline-flex h-9 items-stretch overflow-hidden rounded-md border border-border',
      // Rounded segments in a tray: the gallery's sort.
      tray: 'inline-flex rounded-full bg-card p-1.5',
    },
  },
})

const item = cva('cursor-pointer data-[state=on]:cursor-default', {
  variants: {
    look: {
      boxed: `border-border not-first:border-l px-3 font-medium text-muted-foreground text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=on]:bg-primary-fill data-[state=on]:text-primary-foreground`,
      tray: `${FOCUS_RING} rounded-full px-5 py-2.5 text-body text-muted-foreground leading-none transition-colors duration-500 ease-settle hover:text-foreground data-[state=on]:bg-muted data-[state=on]:text-foreground`,
    },
  },
})

/**
 * A row of segments, exactly one of them selected (a radio group). Clicking the selected one keeps
 * it. Arrow keys move between segments; Space or Enter picks one. Looks: `boxed` (default) is one
 * bordered control with a coral selection; `tray` is a rounded tray (the gallery's sort).
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  look = 'boxed',
}: {
  /** Names the group for screen readers. */
  label: string
  options: readonly { label: string; value: T }[]
  value: T
  onValueChange: (value: T) => void
  look?: 'boxed' | 'tray'
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T)
      }}
      className={root({ look })}
    >
      {options.map((option) => (
        <ToggleGroup.Item key={option.value} value={option.value} className={item({ look })}>
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

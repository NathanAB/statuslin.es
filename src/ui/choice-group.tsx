import { cva } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useId } from 'react'
import { cn } from '@/lib/cn'
import { FOCUS_RING } from '@/ui/focus-ring'

const root = cva('', {
  variants: {
    look: {
      // A tall list on a tile; on phones one row of chips that scrolls sideways, so the picker
      // doesn't push the install button down.
      list: 'flex flex-col rounded-tile bg-card p-1.5 max-md:flex-row max-md:gap-1.5 max-md:overflow-x-auto max-md:rounded-none max-md:bg-transparent max-md:p-0',
      // A row of small rounded segments in a dark tray.
      // On phones one row that scrolls sideways, instead of wrapping into an uneven second row.
      tray: 'flex flex-wrap gap-0.5 rounded-full bg-sunken p-1 max-md:max-w-full max-md:flex-nowrap max-md:overflow-x-auto',
      // Big side-by-side cards, each kind described (the submit page's "What are you submitting?").
      cards: 'grid gap-2.5 sm:grid-cols-2',
    },
  },
})

// A pick shows at once: the 150ms fade only softens it, where the prototype's half second lagged.
const item = cva(
  `${FOCUS_RING} cursor-pointer text-left text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out hover:text-foreground data-[state=checked]:bg-muted data-[state=checked]:text-foreground`,
  {
    variants: {
      look: {
        list: 'flex items-baseline justify-between gap-3 rounded-[0.875rem] px-3.5 py-1.5 motion-safe:active:scale-[0.985] max-md:shrink-0 max-md:rounded-full max-md:bg-card max-md:px-3.5 max-md:py-2 max-md:data-[state=checked]:bg-muted max-md:focus-visible:ring-inset',
        tray: 'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.75 text-small',
        // The picked card takes a faint coral tint and a filled dot; the coral ring is focus only.
        cards:
          'group flex flex-col gap-1.5 rounded-panel bg-card px-5 pt-4.5 pb-5 text-foreground hover:bg-muted data-[state=checked]:bg-primary/12 data-[state=checked]:hover:bg-primary/16',
      },
    },
  },
)

// `rise`: the hero picker's rows follow its own entrance in, 45ms apart, as the prototype's do.
// They fade as they rise: small rows, not the page's largest paint, and without the fade each would
// hang below its tile while it waits its turn.
// Timed through tw-animate's own variables: Tailwind's `duration-*` and `delay-*` would also time
// each row's transitions, holding a pick back by its entrance delay.
const RISE =
  'motion-safe:animate-in motion-safe:fade-in-1 motion-safe:slide-in-from-bottom-7 motion-safe:animation-duration-900 motion-safe:ease-settle motion-safe:fill-mode-backwards'
const RISE_DELAYS = [
  '[--tw-animation-delay:420ms]',
  '[--tw-animation-delay:465ms]',
  '[--tw-animation-delay:510ms]',
  '[--tw-animation-delay:555ms]',
  '[--tw-animation-delay:600ms]',
  '[--tw-animation-delay:645ms]',
  '[--tw-animation-delay:690ms]',
  '[--tw-animation-delay:735ms]',
]

/** A tray choice: its icon, if any, then its label. */
function TrayLabel({ label, icon: Icon }: { label: string; icon?: LucideIcon | undefined }) {
  return (
    <>
      {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      {label}
    </>
  )
}

/**
 * Exactly one of a few choices, as a radio group: arrow keys move to the next choice and pick it,
 * the way a radio group works, since picking one only changes what a demo shows. `list` names each
 * choice with a detail beside it (the hero's status lines and their installs); `tray` is a row of
 * small segments, an option's `icon` before its label (the hero's app); `cards` sets each choice on
 * a big card, named by its label and described by its detail, with a radio dot (the submit page's
 * kinds). Named by the element `labelledBy` points at.
 */
export function ChoiceGroup<T extends string>({
  labelledBy,
  options,
  value,
  onValueChange,
  look,
  rise = false,
}: {
  labelledBy: string
  options: readonly { value: T; label: string; detail?: string; icon?: LucideIcon }[]
  value: T
  onValueChange: (value: T) => void
  look: 'list' | 'tray' | 'cards'
  rise?: boolean
}) {
  const id = useId()
  return (
    <RadioGroup.Root
      aria-labelledby={labelledBy}
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      loop
      className={root({ look })}
    >
      {options.map((option, i) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            item({ look }),
            rise && [RISE, RISE_DELAYS[Math.min(i, RISE_DELAYS.length - 1)]],
          )}
          {...(look === 'cards'
            ? {
                'aria-labelledby': `${id}-${option.value}`,
                'aria-describedby': `${id}-${option.value}-detail`,
              }
            : {})}
        >
          {look === 'cards' ? (
            <>
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="relative size-4.5 shrink-0 rounded-full border-2 border-dim group-data-[state=checked]:border-primary"
                >
                  <RadioGroup.Indicator className="absolute inset-0.5 rounded-full bg-primary-fill" />
                </span>
                <span id={`${id}-${option.value}`} className="font-medium text-body">
                  {option.label}
                </span>
              </span>
              <span
                id={`${id}-${option.value}-detail`}
                className="text-muted-foreground text-small"
              >
                {option.detail}
              </span>
            </>
          ) : look === 'list' ? (
            <>
              <span className="whitespace-nowrap font-medium text-body tracking-[-0.01em] max-md:text-small">
                {option.label}
              </span>
              {option.detail ? (
                <span className="text-muted-foreground text-small tabular-nums max-md:hidden">
                  {option.detail}
                </span>
              ) : null}
            </>
          ) : (
            <TrayLabel label={option.label} icon={option.icon} />
          )}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}

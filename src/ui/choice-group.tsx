import { cva } from 'class-variance-authority'
import { RadioGroup } from 'radix-ui'
import { cn } from '@/lib/cn'
import { FOCUS_RING } from '@/ui/focus-ring'

const root = cva('', {
  variants: {
    look: {
      // A tall list on a tile; two columns on phones.
      list: 'flex flex-col rounded-tile bg-card p-1.5 max-md:grid max-md:grid-cols-2',
      // A row of small rounded segments in a dark tray.
      tray: 'flex flex-wrap gap-0.5 rounded-full bg-sunken p-1',
    },
  },
})

// A pick shows at once: the 150ms fade only softens it, where the prototype's half second lagged.
const item = cva(
  `${FOCUS_RING} cursor-pointer text-left text-muted-foreground transition-[background-color,color,scale] duration-150 ease-out hover:text-foreground data-[state=checked]:bg-muted data-[state=checked]:text-foreground`,
  {
    variants: {
      look: {
        list: 'flex items-baseline justify-between gap-3 rounded-[0.875rem] px-3.5 py-1.5 motion-safe:active:scale-[0.985] max-md:flex-col max-md:justify-start max-md:gap-0.5 max-md:px-3 max-md:py-2.5',
        tray: 'shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.75 text-small',
      },
    },
  },
)

// `rise`: the hero picker's rows follow its own entrance in, 45ms apart, as the prototype's do.
// Timed through tw-animate's own variables: Tailwind's `duration-*` and `delay-*` would also time
// each row's transitions, holding a pick back by its entrance delay.
const RISE =
  'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-7 motion-safe:animation-duration-900 motion-safe:ease-settle motion-safe:fill-mode-backwards'
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

/**
 * Exactly one of a few choices, as a radio group: arrow keys move to the next choice and pick it,
 * the way a radio group works, since picking one only changes what a demo shows. `list` names each
 * choice with a detail beside it (the hero's status lines and their copies); `tray` is a row of
 * small segments (the hero's sessions). Named by the element `labelledBy` points at.
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
  options: readonly { value: T; label: string; detail?: string }[]
  value: T
  onValueChange: (value: T) => void
  look: 'list' | 'tray'
  rise?: boolean
}) {
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
        >
          {look === 'list' ? (
            <>
              <span className="font-medium text-body tracking-[-0.01em] max-md:text-base">
                {option.label}
              </span>
              {option.detail ? (
                <span className="text-muted-foreground text-small tabular-nums">
                  {option.detail}
                </span>
              ) : null}
            </>
          ) : (
            option.label
          )}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}

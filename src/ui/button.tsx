import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'

import { cn } from '@/lib/cn'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-clip-padding font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary-fill text-primary-foreground hover:bg-primary-fill/80',
        outline:
          'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // The active-tab treatment (the gallery sort tabs), paired with variant="outline".
      active: {
        true: 'border-primary/50 text-foreground',
        false: '',
      },
      size: {
        default:
          'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),10px)] px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        // px-1 below sm keeps the signed-out header (five nav buttons) inside a 320px-wide screen.
        nav: 'h-9 gap-1.5 px-1 sm:px-2.5',
        // The header user-menu trigger (avatar + @username).
        trigger: 'h-9 gap-2 px-3',
        icon: 'size-8',
        'icon-xs':
          "size-6 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),10px)] [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 in-data-[slot=button-group]:rounded-lg rounded-[min(var(--radius-md),12px)]',
        'icon-lg': 'size-9',
        // The redesign's pill: the label, then the trailing icon in its own circle. It scales
        // down a touch on press instead of nudging down.
        pill: "h-12 gap-3.5 rounded-full pr-1.75 pl-5.5 text-base tracking-[-0.01em] duration-500 ease-settle active:not-aria-[haspopup]:translate-y-0 motion-safe:active:scale-98 [&_svg:not([class*='size-'])]:size-4.5",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      active: false,
    },
  },
)

// The pill's icon circle: a dark tint on coral, the page colour on the quiet (secondary) pill.
// On hover the icon leans toward where the button goes.
const TRAILING_ICON_CLASS =
  'flex size-8.5 items-center justify-center rounded-full bg-background/16 transition-transform duration-600 ease-settle group-data-[variant=secondary]/button:bg-background motion-safe:group-hover/button:translate-x-0.5 motion-safe:group-hover/button:-translate-y-px motion-safe:group-hover/button:scale-106'

type ButtonSize = VariantProps<typeof buttonVariants>['size']

// Closed props: every attribute a caller may pass is named here. No `className`,
// no blanket `...rest` onto the DOM — see docs/frontend-guidelines.md (closed src/ui).
// `asChild` lets Button wrap a Link; Slot merges the child's own props/children.
interface ButtonBaseProps extends Omit<VariantProps<typeof buttonVariants>, 'size'> {
  id?: string
  type?: 'button' | 'submit' | 'reset'
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
  asChild?: boolean
  title?: string
  'aria-label'?: string
  'aria-pressed'?: boolean
  children?: React.ReactNode
}

// A pill always carries its trailing icon, and no other size takes one.
type ButtonProps = ButtonBaseProps &
  (
    | { size: 'pill'; trailingIcon: React.ReactElement }
    | { size?: Exclude<ButtonSize, 'pill'>; trailingIcon?: never }
  )

function Button({
  variant = 'default',
  size = 'default',
  active = false,
  asChild = false,
  trailingIcon,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, active }))}
      {...props}
    >
      {/* Slot counts every child, so the icon is only added when there is one. Slottable marks
          which child is the wrapped Link, so the circle lands inside it. */}
      {trailingIcon === undefined
        ? children
        : [
            <Slot.Slottable key="label">{children}</Slot.Slottable>,
            <span key="icon" aria-hidden="true" className={TRAILING_ICON_CLASS}>
              {trailingIcon}
            </span>,
          ]}
    </Comp>
  )
}

export { Button, buttonVariants }

import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import type * as React from 'react'

import { cn } from '@/lib/cn'

// Closed props (docs/frontend-guidelines.md): no `className`, no blanket spread.
// These are Radix wrappers — each names exactly the props the app passes and
// forwards them to the Radix primitive. The forwarded props are `Pick`ed from the
// primitive's own prop types, so their shape + optionality stay in sync with Radix
// (and satisfy exactOptionalPropertyTypes).

type RootProps = React.ComponentProps<typeof DropdownMenuPrimitive.Root>
type TriggerProps = React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>
type ContentProps = React.ComponentProps<typeof DropdownMenuPrimitive.Content>
type ItemProps = React.ComponentProps<typeof DropdownMenuPrimitive.Item>

function DropdownMenu({ children }: Pick<RootProps, 'children'>) {
  return (
    <DropdownMenuPrimitive.Root data-slot="dropdown-menu">{children}</DropdownMenuPrimitive.Root>
  )
}

function DropdownMenuTrigger(props: Pick<TriggerProps, 'asChild' | 'children'>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  align = 'start',
  ...props
}: Pick<ContentProps, 'align' | 'onCloseAutoFocus' | 'children'>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={4}
        align={align}
        className={cn(
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) w-auto min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:overflow-hidden',
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  variant = 'default',
  ...props
}: Pick<ItemProps, 'asChild' | 'onSelect' | 'children'> & {
  variant?: 'default' | 'destructive'
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-7 data-[variant=destructive]:text-destructive data-disabled:opacity-50 data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:*:[svg]:text-destructive",
      )}
      {...props}
    />
  )
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger }

import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type * as React from 'react'

import { cn } from '@/lib/cn'

// Mounted once near the app root (see shell.tsx). One shared provider lets Radix
// switch instantly between adjacent tooltips instead of re-waiting the delay each
// time the pointer moves from one trigger to the next.
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={150}>{children}</TooltipPrimitive.Provider>
}

// Closed wrapper around Radix Tooltip (docs/frontend-guidelines.md): no `className`
// prop, no blanket spread. `children` is the trigger (a single DOM element so
// `asChild` can forward the ref); `content` is what shows on hover/focus.
// Relies on a TooltipProvider ancestor.
export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          data-slot="tooltip-content"
          sideOffset={6}
          className={cn(
            'data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-w-xs origin-(--radix-tooltip-content-transform-origin) rounded-lg bg-popover px-3 py-2 text-popover-foreground text-xs shadow-md ring-1 ring-foreground/10 duration-100 data-[state=closed]:animate-out data-[state=delayed-open]:animate-in',
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-popover" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

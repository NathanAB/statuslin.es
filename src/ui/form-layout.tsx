import { type ReactNode, useId } from 'react'
import { Panel } from '@/ui/panel'
import { Heading } from '@/ui/text'

/**
 * A form page on the page column's 12-column grid: the form over the first eight columns, at a
 * form's width, and a side panel (`asideTitle`, `aside`) on the last four that stays in view while
 * the form scrolls. Below 1024px the panel follows the form.
 */
export function FormLayout({
  asideTitle,
  aside,
  children,
}: {
  asideTitle: string
  aside: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-10 lg:grid-cols-12">
      <div className="min-w-0 lg:col-span-8">{children}</div>
      <aside aria-labelledby={id} className="lg:col-span-4">
        <div className="lg:sticky lg:top-8">
          <Panel>
            <Heading level={2} size="compact" id={id}>
              {asideTitle}
            </Heading>
            {aside}
          </Panel>
        </div>
      </aside>
    </div>
  )
}

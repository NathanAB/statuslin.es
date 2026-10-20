import type { ReactNode } from 'react'

/**
 * Two parts on the page column's 12-column grid: the main part over the first eight columns and
 * `aside` on the last four, top-aligned; below 1024px the aside follows the main part. The status
 * line and mod pages put their header and install button in the main part, their install facts in
 * the aside.
 */
export function AsideLayout({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-6 gap-y-6 lg:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">{children}</div>
      <div className="min-w-0 lg:col-span-4">{aside}</div>
    </div>
  )
}

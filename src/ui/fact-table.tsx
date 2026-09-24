import type * as React from 'react'

import { VisuallyHidden } from '@/ui/visually-hidden'

export interface FactTableRow {
  label: string
  cells: string[]
}

/**
 * Attribute rows against one or more subject columns, for short comparable facts. The
 * wrapper scrolls sideways on its own, so a narrow screen never widens the page.
 */
export function FactTable({ columns, rows }: { columns: React.ReactNode[]; rows: FactTableRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted">
          <tr>
            <th scope="col" className="px-3 py-2">
              <VisuallyHidden>Attribute</VisuallyHidden>
            </th>
            {columns.map((column, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: columns are a fixed, never-reordered list of nodes.
              <th key={i} scope="col" className="px-3 py-2 font-semibold text-foreground">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-border border-t">
              <th
                scope="row"
                className="whitespace-nowrap px-3 py-2 font-normal text-muted-foreground"
              >
                {row.label}
              </th>
              {row.cells.map((cell, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells align with the fixed column order.
                <td key={i} className="px-3 py-2 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

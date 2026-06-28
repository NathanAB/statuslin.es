import type * as React from 'react'

export interface SelectOption {
  value: string
  label: string
}

/**
 * Closed select wrapper. Carries the design-system classes verbatim from the
 * original raw <select> in submit.tsx. Props are fully explicit — no className,
 * no HTMLAttributes spread.
 */
export function SelectField({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: string
  onChange: React.ChangeEventHandler<HTMLSelectElement>
  options: SelectOption[]
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="h-8 rounded-lg border border-input bg-field px-2.5 py-1 text-foreground text-sm outline-none transition-colors focus-visible:border-ring"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

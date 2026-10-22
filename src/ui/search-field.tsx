import { Search, X } from 'lucide-react'
import { useId, useRef } from 'react'
import { FOCUS_RING } from '@/ui/focus-ring'

// The sort tray beside it is p-1.5 around segments of py-2.5 and one line of text-body: 2rem + 1em.
// Chrome's own clear cross is blue, off the palette; the field draws its own.
const FIELD = `${FOCUS_RING} h-[calc(2rem+1em)] w-full rounded-full bg-card pr-12 pl-12 text-body text-foreground leading-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none`
const CLEAR = `${FOCUS_RING} absolute top-1/2 right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground`

/**
 * A live search box: a pill on the card surface, as tall as the gallery sort's tray, full width on
 * phones and 18rem from `sm`, with a clear button once it holds text. Its label is for screen readers. It is a GET form to `action`
 * carrying `params` as hidden fields, so Enter searches without JavaScript; with JavaScript the
 * caller applies `onValueChange` itself, so submitting does nothing.
 */
export function SearchField({
  label,
  placeholder,
  action,
  name,
  params,
  value,
  onValueChange,
}: {
  label: string
  placeholder: string
  action: string
  name: string
  /** Sent along with the search, so a search without JavaScript keeps the rest of the view. */
  params: Record<string, string | undefined>
  value: string
  onValueChange: (value: string) => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  return (
    // biome-ignore lint/a11y/useSemanticElements: the form is the landmark; browsers before 2023 and the test a11y tree don't expose <search> as one.
    <form
      role="search"
      method="get"
      action={action}
      onSubmit={(event) => event.preventDefault()}
      className="relative w-full sm:w-72"
    >
      {Object.entries(params).map(([key, param]) =>
        param === undefined ? null : <input key={key} type="hidden" name={key} value={param} />,
      )}
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref={input}
        id={id}
        type="search"
        name={name}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className={FIELD}
      />
      {value === '' ? null : (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onValueChange('')
            input.current?.focus()
          }}
          className={CLEAR}
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </form>
  )
}

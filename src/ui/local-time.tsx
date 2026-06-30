import { useMounted } from '@/lib/use-mounted'

// Server render and the browser's *first* render must produce identical text, or React throws a
// hydration mismatch error 418 (this bit the admin card: bare `toLocaleString()` formats in the server's
// UTC zone but the browser's local zone — different text on every row). So we render a fixed,
// timezone-pinned UTC string on the server and on the first client render, then swap to the viewer's
// local time in an effect (which runs only in the browser, after hydration has already matched).
const UTC_FORMAT: Intl.DateTimeFormatOptions = {
  timeZone: 'UTC',
  dateStyle: 'medium',
  timeStyle: 'short',
}

/** A timestamp that's safe to server-render: a pinned `… UTC` string until mounted, the viewer's
 *  local time after. Use anywhere an absolute time would otherwise be formatted during SSR. */
export function LocalTime({ value }: { value: Date | string }) {
  const mounted = useMounted()
  const date = value instanceof Date ? value : new Date(value)
  const text = mounted ? date.toLocaleString() : `${date.toLocaleString('en-US', UTC_FORMAT)} UTC`
  return <time dateTime={date.toISOString()}>{text}</time>
}

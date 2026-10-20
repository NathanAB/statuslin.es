/** A stored YYYY-MM-DD date as the site shows it: "Oct 12, 2026" (UTC, so it never shifts a day). */
export function utcDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

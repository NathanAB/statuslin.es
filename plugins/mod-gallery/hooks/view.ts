/** Rows each listed mod takes: a gap, its title, its byline and one line of summary. */
const ROWS_PER_MOD = 4
/** Rows the list keeps for itself: the filter, the count line and the paging row, with a gap. */
const CHROME_ROWS = 6
/** Digits 1 to 9 open the mods on a page, so a page holds nine at most. */
const MAX_PAGE_SIZE = 9

interface Page<T> {
  items: T[]
  /** The page shown, from 0, held inside the pages there are. */
  index: number
  count: number
}

export function pageOf<T>(items: readonly T[], index: number, size: number): Page<T> {
  const count = Math.max(1, Math.ceil(items.length / size))
  const held = Math.min(count - 1, Math.max(0, index))
  return { items: items.slice(held * size, (held + 1) * size), index: held, count }
}

/** How many mods a page holds in a body this many rows tall. */
export function pageSizeFor(bodyRows: number): number {
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor((bodyRows - CHROME_ROWS) / ROWS_PER_MOD)))
}

const UNITS = [
  { ms: 86_400_000, one: 'day', many: 'days' },
  { ms: 3_600_000, one: 'h', many: 'h' },
  { ms: 60_000, one: 'min', many: 'min' },
] as const

/** How long ago, in the largest whole unit. */
export function ageText(ms: number): string {
  for (const unit of UNITS) {
    const count = Math.floor(ms / unit.ms)
    if (count >= 1) return `${count} ${count === 1 ? unit.one : unit.many} ago`
  }
  return 'just now'
}

/** The install count in the site's words; nothing while the site hides it. */
export function installsText(installs: number | null): string {
  return installs === null ? '' : `${installs} installs`
}

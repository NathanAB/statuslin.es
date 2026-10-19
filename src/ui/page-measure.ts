/**
 * The column the shared header, footer and page content line up on: the standard 1024px column,
 * or the home page's measure, up to 1280px inside gutters that grow with the window.
 */
export const PAGE_MEASURE = {
  standard: 'mx-auto w-full max-w-5xl px-6',
  wide: 'mx-auto w-full max-w-page px-gutter',
} as const

export type PageMeasure = keyof typeof PAGE_MEASURE

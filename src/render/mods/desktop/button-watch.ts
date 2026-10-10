/**
 * When to click a dialog button seen through repeated screen probes. Desktop paints its welcome
 * screen, reloads, then paints it again, and a click during that first paint is lost. So a button
 * is clicked only once it has stayed on screen for `stableMs`, clicked again if it comes back, and
 * counted as handled once it has stayed gone for `goneMs` after a click.
 */
export interface ButtonWatch {
  seenSince: number | null
  goneSince: number | null
  clicks: number
}

export interface WatchOptions {
  stableMs: number
  goneMs: number
}

export type WatchAction = 'click' | 'wait' | 'done'

export const startWatch = (): ButtonWatch => ({ seenSince: null, goneSince: null, clicks: 0 })

export function watchButton(
  watch: ButtonWatch,
  visible: boolean,
  nowMs: number,
  { stableMs, goneMs }: WatchOptions,
): { watch: ButtonWatch; action: WatchAction } {
  if (visible) {
    const seenSince = watch.seenSince ?? nowMs
    if (nowMs - seenSince >= stableMs) {
      return {
        watch: { seenSince: null, goneSince: null, clicks: watch.clicks + 1 },
        action: 'click',
      }
    }
    return { watch: { ...watch, seenSince, goneSince: null }, action: 'wait' }
  }
  const goneSince = watch.goneSince ?? nowMs
  const done = watch.clicks > 0 && nowMs - goneSince >= goneMs
  return { watch: { ...watch, seenSince: null, goneSince }, action: done ? 'done' : 'wait' }
}

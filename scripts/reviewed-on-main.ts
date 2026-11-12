import { spawnSync } from 'node:child_process'

/** The file as origin/main last fetched it; null when git can't show it. */
export function fileOnMain(file: string): string | null {
  const shown = spawnSync('git', ['show', `origin/main:${file}`], { encoding: 'utf8' })
  return shown.status === 0 ? shown.stdout : null
}

/**
 * Writes only from a file a human merged: a working copy can hold commits nobody has reviewed until
 * their pull request is merged into main.
 */
export function assertReviewedOnMain(file: string, onDisk: string, onMain: string | null): void {
  if (onDisk !== onMain) {
    throw new Error(
      `${file} is not the reviewed one on origin/main: merge its pull request, then git pull and rerun`,
    )
  }
}

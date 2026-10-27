import { HttpError } from '@/lib/http'

const HOUR_MS = 60 * 60 * 1000

export interface SubmitGuard {
  /** Runs `check` for `userId`, or refuses: 429 for the user's limits, 503 when this process is busy. */
  run<T>(userId: string, check: () => Promise<T>): Promise<T>
}

interface Limits {
  /** Attempts per user per hour, failed ones included. */
  perUserPerHour: number
  /** Checks running in this process at once, across users. */
  inFlight: number
  now?: () => number
}

/**
 * Bounds the work a mod submission costs before anything is stored: GitHub calls, a sandbox that
 * fetches up to 20 MB, and a sandbox that reads it. The submission rate limit counts stored
 * submissions, so a submission that fails validation would otherwise cost nothing to repeat. One
 * check per user at a time, an hourly cap on attempts, and a cap per process. Kept in memory, so
 * each machine counts its own: a backstop for abuse, not an exact quota.
 */
export function createSubmitGuard({
  perUserPerHour,
  inFlight,
  now = Date.now,
}: Limits): SubmitGuard {
  const running = new Set<string>()
  const attempts = new Map<string, number[]>()

  return {
    async run(userId, check) {
      if (running.has(userId)) {
        throw new HttpError(429, 'One of your submissions is still being checked; wait for it.')
      }
      const since = now() - HOUR_MS
      const recent = (attempts.get(userId) ?? []).filter((at) => at > since)
      if (recent.length >= perUserPerHour) {
        throw new HttpError(
          429,
          "You've tried to submit too many mods in the last hour. Try again later.",
        )
      }
      if (running.size >= inFlight) {
        throw new HttpError(503, 'Too many mods are being checked right now; try again shortly.')
      }
      attempts.set(userId, [...recent, now()])
      running.add(userId)
      try {
        return await check()
      } finally {
        running.delete(userId)
      }
    },
  }
}

/** This process's guard for the submit endpoint. */
export const modSubmitGuard = createSubmitGuard({ perUserPerHour: 10, inFlight: 4 })

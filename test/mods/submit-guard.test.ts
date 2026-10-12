import { describe, expect, it } from 'vitest'
import { createSubmitGuard } from '@/mods/submit-guard'

const never = () => new Promise<never>(() => {})

describe('createSubmitGuard', () => {
  it('lets a user have one check in flight at a time', async () => {
    const guard = createSubmitGuard({ perUserPerHour: 10, inFlight: 5 })
    void guard.run('ada', never)

    await expect(guard.run('ada', async () => 'second')).rejects.toMatchObject({ status: 429 })
    await expect(guard.run('bob', async () => 'other user')).resolves.toBe('other user')
  })

  it('frees the user once the check settles, whether it passed or failed', async () => {
    const guard = createSubmitGuard({ perUserPerHour: 10, inFlight: 5 })
    await expect(
      guard.run('ada', async () => {
        throw new Error('validate failed')
      }),
    ).rejects.toThrow('validate failed')

    await expect(guard.run('ada', async () => 'again')).resolves.toBe('again')
  })

  it('counts every attempt, failed ones too, against the hourly cap', async () => {
    let now = 0
    const guard = createSubmitGuard({ perUserPerHour: 2, inFlight: 5, now: () => now })
    await guard.run('ada', async () => 'one')
    await guard
      .run('ada', async () => {
        throw new Error('two')
      })
      .catch(() => {})

    await expect(guard.run('ada', async () => 'three')).rejects.toMatchObject({ status: 429 })
    now += 60 * 60 * 1000 + 1
    await expect(guard.run('ada', async () => 'next hour')).resolves.toBe('next hour')
  })

  it('caps the checks running in this process at once', async () => {
    const guard = createSubmitGuard({ perUserPerHour: 10, inFlight: 1 })
    void guard.run('ada', never)

    await expect(guard.run('bob', async () => 'busy')).rejects.toMatchObject({ status: 503 })
  })
})

import { describe, expect, it } from 'vitest'
import { warmThenCapture } from '@/render/warm-up'

describe('warmThenCapture', () => {
  it('runs the script once and returns that result when there are no warmup passes', async () => {
    let calls = 0
    const run = async () => {
      calls++
      return `run-${calls}`
    }
    const out = await warmThenCapture(run, 0)
    expect(calls).toBe(1)
    expect(out).toBe('run-1')
  })

  it('runs one warmup pass then returns the SECOND (capture) run — the one that reads the warmed cache', async () => {
    let calls = 0
    const run = async () => {
      calls++
      return `run-${calls}`
    }
    const out = await warmThenCapture(run, 1)
    expect(calls).toBe(2)
    expect(out).toBe('run-2')
  })

  it('swallows a throwing warmup pass and still returns the capture run', async () => {
    let calls = 0
    const run = async () => {
      calls++
      if (calls === 1) throw new Error('warmup boom')
      return `run-${calls}`
    }
    const out = await warmThenCapture(run, 1)
    expect(calls).toBe(2)
    expect(out).toBe('run-2')
  })
})

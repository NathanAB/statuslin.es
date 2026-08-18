import { describe, expect, it } from 'vitest'
import {
  memoryWaveVerdict,
  parseProbeSamples,
  profileMaximumRuntimeMs,
  profilePlanArguments,
  profileRuntimeArgument,
  profileServerRuntimeFlags,
} from '../../scripts/profiling/memory-loop'

describe('profileRuntimeArgument', () => {
  it('selects Node from the public runtime argument', () => {
    expect(profileRuntimeArgument(['--runtime=node'])).toBe('node')
  })

  it('enables Bun small-heap mode from the public flag', () => {
    expect(profileServerRuntimeFlags(['--smol'])).toEqual(['--smol'])
  })
})

describe('profilePlanArguments', () => {
  it('defaults to one warm-up and three measured waves with a long settle', () => {
    expect(profilePlanArguments([])).toEqual({
      requests: 400,
      waves: 3,
      settleMs: 30_000,
    })
  })

  it('allows slow runtime modes to finish before the safety backstop', () => {
    expect(profileMaximumRuntimeMs({ waves: 3, settleMs: 30_000 })).toBe(1_800_000)
  })
})

describe('memoryWaveVerdict', () => {
  it('measures the final settled plateau from the post-warmup baseline', () => {
    expect(
      memoryWaveVerdict({
        baselineRssMb: 250,
        peakRssMb: 330,
        settledRssMb: [290, 310, 320],
        maxGrowthMb: 120,
        maxPlateauGrowthMb: 20,
        retentionGrowthMb: 30,
      }),
    ).toEqual({
      peakGrowthMb: 80,
      finalPlateauGrowthMb: 70,
      ongoingRetention: false,
      passed: false,
    })
  })

  it('detects ongoing retention across consecutive settled waves', () => {
    expect(
      memoryWaveVerdict({
        baselineRssMb: 250,
        peakRssMb: 390,
        settledRssMb: [290, 325, 360],
        maxGrowthMb: 120,
        maxPlateauGrowthMb: 20,
        retentionGrowthMb: 30,
      }),
    ).toEqual({
      peakGrowthMb: 140,
      finalPlateauGrowthMb: 110,
      ongoingRetention: true,
      passed: false,
    })
  })

  it('fails when consecutive waves retain memory before the final plateau', () => {
    expect(
      memoryWaveVerdict({
        baselineRssMb: 250,
        peakRssMb: 350,
        settledRssMb: [280, 310, 310],
        maxGrowthMb: 120,
        maxPlateauGrowthMb: 20,
        retentionGrowthMb: 30,
      }),
    ).toEqual({
      peakGrowthMb: 100,
      finalPlateauGrowthMb: 60,
      ongoingRetention: true,
      passed: false,
    })
  })
})

describe('parseProbeSamples', () => {
  it('reads each process memory category reported by the probe', () => {
    expect(
      parseProbeSamples(
        'iso,elapsed_ms,loop_lag_ms,rss_mb,heap_used_mb,heap_total_mb,external_mb,array_buffers_mb\n2026-08-18T12:00:00.000Z,200,0.4,244,98,110,42,17\n',
      ),
    ).toEqual([
      {
        elapsedMs: 200,
        loopLagMs: 0.4,
        rssMb: 244,
        heapUsedMb: 98,
        heapTotalMb: 110,
        externalMb: 42,
        arrayBuffersMb: 17,
      },
    ])
  })
})

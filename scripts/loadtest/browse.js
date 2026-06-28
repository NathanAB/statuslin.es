import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js'
import { check, group } from 'k6'
import exec from 'k6/execution'
import http from 'k6/http'

// k6 read-path load test for statuslin.es. Models a real visitor: open the gallery, page through a
// sorted view, open one config's detail page. Ramps the ARRIVAL RATE of visits until the SLO
// thresholds break or we hit the ceiling. Read paths only (safe to hammer); never touches submit.
//
// Run (staging only — there is no prod default, and TARGET is required):
//   TARGET=https://statuslines-staging.fly.dev SHA=$(git rev-parse --short HEAD) \
//   SEED_COUNT=500 k6 run scripts/loadtest/browse.js
//
// Each iteration = one visit = 3 GETs, so the effective REQUESTS/sec ≈ 3 × the stage target below
// (the stage targets are VISITS/sec). The true number is the `http_reqs` rate in the summary.

const TARGET = __ENV.TARGET
const SEED_COUNT = Math.floor(Number(__ENV.SEED_COUNT)) || 500
const SHA = __ENV.SHA || 'local'
const RESULTS_DIR = 'scripts/loadtest/results'
// SMOKE=1 swaps the full ramp for a ~7s validation run — exercises every request path + the
// summary output without a 6-minute load. Use it to confirm the script works against any target.
const SMOKE = __ENV.SMOKE === '1'

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-arrival-rate',
      timeUnit: '1s',
      startRate: 5,
      // Generous VU pool so the LOAD GENERATOR is never the bottleneck — we want the server to be
      // what saturates, not k6 running out of VUs. Dropped iterations in the summary mean raise this.
      preAllocatedVUs: 100,
      maxVUs: 800,
      // Visits/sec. Doc default ramp; edit freely. Holds at the peak, then ramps down.
      stages: SMOKE
        ? [
            { target: 5, duration: '5s' },
            { target: 0, duration: '2s' },
          ]
        : [
            { target: 10, duration: '30s' },
            { target: 25, duration: '45s' },
            { target: 50, duration: '45s' },
            { target: 100, duration: '45s' },
            { target: 150, duration: '45s' },
            { target: 200, duration: '45s' },
            { target: 250, duration: '45s' },
            { target: 300, duration: '45s' },
            { target: 300, duration: '30s' },
            { target: 0, duration: '20s' },
          ],
    },
  },
  // SLO / pass-fail line (doc default). Crossing either marks the run FAILED with a nonzero exit,
  // so this doubles as a CI gate. Tune to the agreed SLO.
  thresholds: {
    http_req_failed: ['rate<0.01'], // <1% of requests error
    http_req_duration: ['p(95)<500'], // 95th-percentile latency under 500ms
  },
}

function slug(n) {
  return `loadtest-${String(n).padStart(4, '0')}`
}

// Fail fast before the ramp if the target is missing or already unhealthy, so we never spend a
// multi-minute run against the wrong host.
export function setup() {
  if (!TARGET) {
    exec.test.abort(
      'TARGET env var is required (staging only), e.g. TARGET=https://statuslines-staging.fly.dev',
    )
  }
  const res = http.get(`${TARGET}/`)
  if (res.status !== 200) {
    exec.test.abort(`Warm-up GET ${TARGET}/ returned ${res.status} — aborting before the ramp.`)
  }
  return { target: TARGET }
}

export default function (data) {
  const base = data.target
  group('gallery', () => {
    const res = http.get(`${base}/`)
    check(res, { 'gallery 200': (r) => r.status === 200 })
  })
  group('gallery sorted page 2', () => {
    const res = http.get(`${base}/?sort=top&page=2`)
    check(res, { 'sorted 200': (r) => r.status === 200 })
  })
  group('config detail', () => {
    const n = Math.floor(Math.random() * SEED_COUNT) + 1
    const res = http.get(`${base}/c/${slug(n)}`)
    check(res, { 'detail 200': (r) => r.status === 200 })
  })
}

// Write a JSON time series + a text summary next to the capture.ts metrics, keyed by the same SHA
// so a run's client-side and server-side data sit side by side and stay comparable over time.
export function handleSummary(data) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const stem = `${RESULTS_DIR}/${SHA}-${ts}`
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [`${stem}.summary.json`]: JSON.stringify(data, null, 2),
    [`${stem}.summary.txt`]: textSummary(data, { indent: ' ', enableColors: false }),
  }
}

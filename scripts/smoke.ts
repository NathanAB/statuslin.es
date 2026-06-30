/**
 * Browser smoke gate. Drives a REAL browser (agent-browser) against the running app and fails
 * (exit 1) if a page doesn't hydrate, logs a console error, or the signed-in/admin chrome is
 * wrong. This exists because tsc/lint/vitest all pass while the client bundle is dead — every
 * source gate is blind to hydration and the real HTTP/auth boundary. See
 * docs/frontend-guidelines.md and the 2026-06-13 hydration-crash incident.
 *
 * Requires: `agent-browser` installed, and the dev DB migrated with an admin user (the same
 * setup `bun run dev:login` needs). Reuses a dev server already on BETTER_AUTH_URL, else boots one.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

// SMOKE_BASE_URL points the smoke at an already-running, possibly remote app (e.g. deployed
// staging — which runs the exact production image we promote). When it's set we DON'T boot or
// kill a local dev server, and we run signed-out checks only: the signed-in half mints a session
// via `dev:login` against the LOCAL dev DB, which a remote target doesn't share. Falls back to
// BETTER_AUTH_URL (the local dev origin) for the normal local run.
const BASE = process.env.SMOKE_BASE_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3100'
const REMOTE = !!process.env.SMOKE_BASE_URL
const SIGNED_OUT_ONLY = REMOTE || process.env.SMOKE_SIGNED_OUT_ONLY === '1'
const COOKIE = 'better-auth.session_token'

const failures: string[] = []
function check(ok: boolean, label: string, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`)
  } else {
    failures.push(detail ? `${label} — ${detail}` : label)
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** Run an agent-browser subcommand, return trimmed stdout (stderr folded in). */
async function ab(...args: string[]): Promise<string> {
  // Own session so the smoke never shares cookies/state with manual agent-browser usage.
  const proc = Bun.spawn(['agent-browser', '--session-name', 'statuslines-smoke', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  return `${out}${err}`.trim()
}

async function reachable(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2500) })).ok
  } catch {
    return false
  }
}

// Vite dev may bind only IPv6 (::1) while Bun's fetch resolves `localhost` to IPv4 first — that
// mismatch made serverUp falsely report "down" and boot a duplicate server. Probe both stacks.
async function serverUp(): Promise<boolean> {
  const port = new URL(BASE).port || '3100'
  for (const host of ['127.0.0.1', '[::1]', 'localhost']) {
    if (await reachable(`http://${host}:${port}/`)) return true
  }
  return false
}

// Console lines that are noise, not failures.
const BENIGN = [/React DevTools/i, /\[vite\] (connecting|connected)/i, /Download the React/i]
function consoleErrors(raw: string): string[] {
  return raw
    .split('\n')
    .filter((l) => /\[(error|console\.error)\]|SyntaxError|hydrat|did not match/i.test(l))
    .filter((l) => !BENIGN.some((b) => b.test(l)))
}

async function mintCookie(): Promise<string> {
  const proc = Bun.spawn(['bun', 'run', 'dev:login'], { stdout: 'pipe', stderr: 'pipe' })
  // Drain both streams concurrently — leaving stderr unread can fill the pipe buffer and hang.
  const [out] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  await proc.exited
  const value = out.match(new RegExp(`${COOKIE}=(\\S+)`))?.[1]
  if (!value)
    throw new Error(
      'dev:login did not print a session cookie — is the dev DB migrated with an admin user?',
    )
  return value
}

async function pageConsoleClean(label: string, path: string) {
  await ab('console', '--clear')
  await ab('open', `${BASE}${path}`)
  await ab('wait', '--load', 'networkidle')
  const errs = consoleErrors(await ab('console'))
  check(errs.length === 0, `${label} hydrates with no console errors`, errs.slice(0, 2).join(' | '))
}

/**
 * Kill the booted dev server AND its whole process group. `bun --bun vite dev` spawns a `node vite`
 * child; killing only the direct process orphans that child, leaks port :PORT, and (because the
 * subprocess handle stays open) keeps THIS script alive — which hangs the pre-push hook and every
 * `git push` behind it. `detached: true` makes the server its own group leader so `kill(-pid)` takes
 * down the entire tree. No-op when we didn't boot a server (an externally-run dev server is left be).
 */
function killServer(proc: ChildProcess | null): void {
  if (!proc?.pid) return
  try {
    process.kill(-proc.pid, 'SIGKILL') // negative pid = the whole process group
  } catch {
    // already gone — nothing to do
  }
}

/** A remote target (e.g. staging, which scales to zero) can cold-start, so retry the reachability
 *  probe before giving up — a slow first byte isn't a failure. */
async function ensureRemoteUp(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (await reachable(`${BASE}/`)) return
    await sleep(1500)
  }
  throw new Error(`smoke target not reachable: ${BASE}`)
}

/** Boot a dev server if one isn't already on BASE. Returns the spawned process to kill, or null. */
async function ensureServer(): Promise<ChildProcess | null> {
  if (await serverUp()) return null
  console.log(`booting dev server at ${BASE} …`)
  const proc = spawn('bun', ['--bun', 'vite', 'dev'], { stdio: 'ignore', detached: true })
  for (let i = 0; i < 40 && !(await serverUp()); i++) await sleep(1000)
  if (!(await serverUp())) {
    killServer(proc) // don't leak the half-started server (the duplicate-server zombie bug)
    throw new Error('dev server did not come up')
  }
  return proc
}

/**
 * Reach a confirmed signed-out state before asserting. The smoke session persists cookies across
 * runs, so a prior run's admin cookie can linger; `cookies clear` can also race the next nav.
 * Clear + confirm /admin renders the signed-out sign-in prompt (there's no /login page anymore —
 * the gated pages show a "Sign in with GitHub" prompt in place), retrying. Throws if it never
 * signs out.
 */
async function ensureSignedOut(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await ab('cookies', 'clear')
    await ab('open', `${BASE}/admin`)
    await ab('wait', '--load', 'networkidle')
    if (/Sign in with GitHub/i.test(await ab('snapshot', '-i'))) return
    await sleep(700)
  }
  throw new Error('could not reach a signed-out state (cookie clear never took)')
}

async function checkSignedOut() {
  console.log('signed-out:')
  await ensureSignedOut()

  await pageConsoleClean('home', '/')
  check(/Trending/i.test(await ab('snapshot', '-i')), 'home gallery renders')

  const detail = (
    await ab('eval', 'document.querySelector(\'a[href^="/c/"]\')?.getAttribute("href") || ""')
  ).match(/\/c\/[^\s"']+/)?.[0]
  if (detail) {
    // "Copy script" is the source-card action — a client component, so retry until it hydrates.
    const d = await openUntilReady(detail, /Copy script/i)
    check(
      d.errs.length === 0,
      'detail page hydrates with no console errors',
      d.errs.slice(0, 2).join(' | '),
    )
    check(/Copy script/i.test(d.snap), 'detail page renders', detail)
  } else {
    console.log('  · (no published configs to open a detail page — skipped)')
  }

  await pageConsoleClean('admin (signed-out)', '/admin')
  check(
    /Sign in with GitHub/i.test(await ab('snapshot', '-i')),
    'signed-out /admin shows the sign-in prompt',
  )
}

/**
 * Open an authed page, retrying until `ready` shows up — setting a cookie can race the next
 * navigation, so a single load occasionally renders the signed-out view. Retries make that
 * non-flaky; a persistent miss (auth genuinely broken) still fails after the last try.
 * Returns the snapshot plus the page's console errors (console is cleared each attempt).
 */
async function openUntilReady(
  path: string,
  ready: RegExp,
): Promise<{ snap: string; errs: string[] }> {
  let snap = ''
  for (let i = 0; i < 6; i++) {
    await ab('console', '--clear')
    await ab('open', `${BASE}${path}`)
    await ab('wait', '--load', 'networkidle')
    snap = await ab('snapshot', '-i')
    if (ready.test(snap)) break
    await sleep(800)
  }
  return { snap, errs: consoleErrors(await ab('console')) }
}

/**
 * Make the session live before asserting anything: set the cookie and confirm the signed-in user
 * menu actually renders on /admin, re-setting + reloading if it hasn't. This separates "is auth
 * active" (here) from "did the page render" (openUntilReady), which kills the cookie-set race that made
 * the signed-in checks flaky. Throws if auth never takes (a real failure, not a flake).
 */
async function ensureAuthed(value: string): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await ab('cookies', 'set', COOKIE, value, '--url', BASE, '--httpOnly')
    await ab('open', `${BASE}/admin`)
    await ab('wait', '--load', 'networkidle')
    if (/button "@/.test(await ab('snapshot', '-i'))) return
    await sleep(800)
  }
  throw new Error('could not establish an authenticated session (cookie never took)')
}

async function checkSignedInAdmin() {
  console.log('signed-in admin:')
  const value = await mintCookie()
  await ensureAuthed(value)

  const admin = await openUntilReady('/admin', /Admin dashboard/i)
  check(
    admin.errs.length === 0,
    'admin dashboard hydrates with no console errors',
    admin.errs.slice(0, 2).join(' | '),
  )
  check(/Admin dashboard/i.test(admin.snap), 'admin dashboard heading renders')
  check(/button "@/.test(admin.snap), 'header shows the signed-in user menu (not a login button)')
  check(!/Sign in with GitHub/i.test(admin.snap), 'no sign-in button while signed in as admin')

  // The Submit button exists only on the rendered form; the signed-out view shows a "Sign in to
  // submit" link instead. (Don't assert on label text — it's absent from interactive snapshots.)
  const submit = await openUntilReady('/submit', /button "Submit"/)
  check(
    submit.errs.length === 0,
    'submit hydrates with no console errors',
    submit.errs.slice(0, 2).join(' | '),
  )
  check(/button "Submit"/.test(submit.snap), 'submit form renders (Submit button present)')
  check(/textbox "Description"/.test(submit.snap), 'submit form has the Description field')
  // Measure the actual rendered height — don't eyeball "tall". field-sizing ignores `rows`, so
  // this guards that the source field really starts tall (regression caught here, not by a glance).
  // Retry: a single eval can race layout/hydration and read 0 before #source has sized.
  let srcHeight = 0
  for (let i = 0; i < 6 && srcHeight === 0; i++) {
    srcHeight = Number(
      (
        await ab(
          'eval',
          "Math.round(document.getElementById('source')?.getBoundingClientRect().height||0)",
        )
      ).replace(/[^0-9]/g, ''),
    )
    if (srcHeight === 0) await sleep(500)
  }
  check(srcHeight >= 280, 'source-code field starts tall', `${srcHeight}px`)

  // /me: the signed-in user's own submissions page.
  const me = await openUntilReady('/me', /My submissions/)
  check(
    me.errs.length === 0,
    '/me hydrates with no console errors',
    me.errs.slice(0, 2).join(' | '),
  )
  check(/My submissions/.test(me.snap), '/me shows the My submissions page')
}

async function main() {
  // Remote target (SMOKE_BASE_URL): don't manage a local server, just confirm it's up. Local:
  // boot a dev server if one isn't already running.
  const booted = REMOTE ? null : await ensureServer()
  if (REMOTE) await ensureRemoteUp()
  try {
    await checkSignedOut()
    // Signed-in checks mint a session against the LOCAL dev DB — skip them for a remote target.
    if (!SIGNED_OUT_ONLY) await checkSignedInAdmin()
  } finally {
    killServer(booted)
  }

  if (failures.length > 0) {
    console.error(`\nSMOKE FAILED (${failures.length}):`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('\nSMOKE PASSED')
}

try {
  await main()
} catch (err) {
  // Harness/env failure (no agent-browser, server won't boot, no admin user). Still non-zero so
  // the gate doesn't silently "pass" — fix the environment, don't skip the browser check.
  console.error(`\nSMOKE ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
// Force exit: agent-browser leaves a detached headless-Chrome daemon and other spawned children can
// hold open handles that otherwise keep this process alive forever — which hangs the pre-push hook.
// main() already logged the result and killed the dev server; this just guarantees we actually exit.
process.exit(failures.length > 0 ? 1 : 0)

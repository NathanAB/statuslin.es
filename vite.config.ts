import posthog from '@posthog/rollup-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'
import { binaryArrayBuffer } from './src/lib/binary-arraybuffer-plugin'
import { DEV_IMAGE_ROUTE_PREFIXES } from './src/lib/dev-image-routes'
import { GITHUB_AVATARS_ORIGIN } from './src/lib/github-avatars'
import { POSTHOG_ASSETS_HOST, POSTHOG_INGEST_HOST } from './src/lib/posthog-hosts'

// Dev only. Nitro's dev server hands a request to the app only when it matches a Nitro route, and
// every TanStack route sits behind Nitro's `/**` catch-all. So it guesses: a browser's <img> request
// (Sec-Fetch-Dest: image, or a .png path without Accept: text/html) is taken for a static file and
// 404s before the app sees it. DEV_IMAGE_ROUTE_PREFIXES names the app's image routes
// (src/routes/*[.]png.ts, a test keeps it complete); dressing their requests as page loads makes
// Nitro pass them on. The production server has no such guess: its static middleware falls through
// on a miss.

function devImageRoutes(): Plugin {
  return {
    name: 'dev-image-routes',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (DEV_IMAGE_ROUTE_PREFIXES.some((prefix) => req.url?.startsWith(prefix))) {
          delete req.headers['sec-fetch-dest']
          req.headers.accept = 'text/html'
        }
        next()
      })
    },
  }
}

// Source maps for PostHog error tracking, so a browser exception's stack shows src/ files. Only a build
// given POSTHOG_API_KEY makes them: the image build, which deploy:staging hands the key (.env.schema).
// The plugin stamps each client chunk with a chunk id hashed from its code (an unchanged chunk keeps
// its filename and bytes, as asset retention needs), uploads the maps, then deletes them, so
// `/assets/*.map` is never served; the Dockerfile fails the build if one is left. Client only: the
// server bundle isn't minified, so posthog-node frames already show real names.
const POSTHOG_PROJECT_ID = '475282'
const sourceMapUploadKey = process.env.POSTHOG_API_KEY

function uploadClientSourceMaps(personalApiKey: string): Plugin {
  return {
    // Typed as a Rollup plugin; it detects Rolldown (Vite 8) at runtime, but Rollup's plugin context
    // type isn't Rolldown's, hence the cast.
    ...(posthog({ personalApiKey, projectId: POSTHOG_PROJECT_ID }) as unknown as Plugin),
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
  }
}

// Single source of truth for the dev origin: BETTER_AUTH_URL (.env). The dev server
// binds the port from that URL so the GitHub OAuth callback always matches.
const DEFAULT_DEV_PORT = 3100
const devUrl = process.env.BETTER_AUTH_URL ?? `http://localhost:${DEFAULT_DEV_PORT}`
const devPort = Number(new URL(devUrl).port) || DEFAULT_DEV_PORT

// Under Vitest, skip the app's SSR/server plugins: our tests are logic/handler/DB
// tests that don't render routes, and those plugins keep a Vite server alive (10s
// teardown hang) and pull React's CJS entry through the SSR runner. Path aliases
// still resolve via resolve.tsconfigPaths (a native Vite option, not a plugin).
const isTest = !!process.env.VITEST

// Content-Security-Policy, shipped REPORT-ONLY (it observes + reports violations, never blocks).
// It can't be enforced yet: the SSR HTML carries TanStack's inline hydration scripts (`$_TSR`,
// `document.currentScript.remove()`) and React inline `style` attributes (the ANSI preview colors
// in src/ui/statusline-preview.tsx). A blocking policy would need a per-request nonce on every
// inline <script>/<style>; that nonce wiring is a deferred follow-up. The source list mirrors
// what the app actually loads: self, GitHub avatars (`user.image`), self-hosted fonts, and
// data: images.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  `img-src 'self' data: ${GITHUB_AVATARS_ORIGIN}`,
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'", // React inline style attrs (preview colors) + Tailwind
  "script-src 'self' 'unsafe-inline'", // TanStack inline hydration scripts (needs nonces to tighten)
  "connect-src 'self'", // server functions are same-origin
  "form-action 'self'",
].join('; ')

// Response security headers applied to EVERY response (see routeRules `'/**'` below). Defined once
// here — the single source of truth. All but CSP are enforced (they don't affect rendering); CSP is
// report-only per the note above. Set via Nitro route rules rather than a TanStack `createStart`
// instance ON PURPOSE: adding a start instance would replace the framework's default CSRF
// middleware (createStartHandler applies `[defaultCsrfMiddleware]` only when no start instance
// exists), silently disabling the app's same-origin server-fn CSRF protection. Nitro route rules
// set headers in the response layer without touching that pipeline, so CSRF stays intact.
const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy-Report-Only': CSP_REPORT_ONLY,
}

// PostHog ingest is reverse-proxied under /ingest so browser events come from our own origin (keeps
// CSP connect-src 'self' valid and dodges ad blockers). Hosts come from src/lib/posthog-hosts (one
// source shared with the client SDK config). Because /ingest is same-origin, the browser attaches
// our session cookie to every request — `filterHeaders: ['cookie']` strips it so the signed Better
// Auth credential never leaves our boundary for PostHog. ('authorization' stripped too, defensively.)
const PROXY_FILTER_HEADERS = ['cookie', 'authorization']

export default defineConfig(({ mode }) => ({
  server: {
    port: devPort,
    proxy: {
      '/ingest/static': {
        target: POSTHOG_ASSETS_HOST,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
      },
      '/ingest/array': {
        target: POSTHOG_ASSETS_HOST,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
      },
      '/ingest': {
        target: POSTHOG_INGEST_HOST,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ingest/, ''),
      },
    },
  },
  resolve: { tsconfigPaths: true },
  // @resvg/resvg-js ships a native .node binary (e.g. resvgjs.darwin-arm64.node). Vite's dep
  // optimizer cannot bundle native modules — it reads them as non-UTF-8 bytes and errors. Exclude
  // it here so the optimizer skips it; it only runs in server handlers (never client-bundled).
  optimizeDeps: { exclude: ['@resvg/resvg-js'] },
  plugins: [
    // Always-on: handles ?arraybuffer suffix for binary imports (e.g. the OG Nerd Font).
    // Must run in test mode too, since test/og/render.test.tsx → src/og/font.ts uses it.
    binaryArrayBuffer(),
    ...(isTest
      ? []
      : [
          // Before nitro(), so its middleware sees the image requests first.
          devImageRoutes(),
          tailwindcss(),
          tanstackStart({
            srcDirectory: 'src',
            // Guardrail: server-only DB code must NEVER reach the client bundle. The postgres
            // driver references Node's `Buffer` at import time, so a leaked import throws
            // `Buffer is not defined` in the browser and crashes hydration site-wide (every
            // button goes dead). `behavior: 'error'` fails the build with an import trace the
            // moment a client-reachable module pulls in the db layer, instead of shipping it.
            importProtection: {
              behavior: 'error',
              client: {
                specifiers: ['postgres', 'drizzle-orm/postgres-js'],
                files: ['**/src/db/index.ts', '**/src/db/migrate.ts'],
              },
            },
          }),
          viteReact(),
          ...(sourceMapUploadKey ? [uploadClientSourceMaps(sourceMapUploadKey)] : []),
          nitro({
            preset: 'node-server',
            // Nitro startup plugins, run once at server init.
            // - db-tls-plugin: fails the web process fast on a plaintext production DATABASE_URL,
            //   before it serves any request (the SSR bundle imports `@/db` lazily, so the guard in
            //   src/db/index.ts alone would throw per request instead of at boot).
            // - posthog-error-plugin: registers a Nitro `error` hook forwarding SSR crashes /
            //   uncaught exceptions / unhandled rejections to PostHog (src/lib/posthog-server).
            // - render-drain-plugin: renders the status line jobs already queued (ADR 0006).
            plugins: [
              './src/server/db-tls-plugin.ts',
              './src/server/posthog-error-plugin.ts',
              './src/server/render-drain-plugin.ts',
            ],
            // Nitro's generated static-asset manifest contains only this build's files. Its static
            // middleware runs first and falls through on a miss; this route then serves retained
            // generations before the catch-all TanStack renderer. Keep it method-agnostic so the
            // handler itself returns 405 for methods other than GET/HEAD.
            handlers: [
              {
                route: '/assets/**',
                handler: './src/server/retained-asset.ts',
              },
            ],
            routeRules: {
              // Prod equivalent of the dev `server.proxy` above. Vite's server.proxy is DEV-ONLY, so
              // without these the browser's events (which POST to api_host '/ingest') would hit the
              // SSR app in production and never reach PostHog. Wildcard preserves the path after the
              // match; more specific /ingest/static + /ingest/array rules win for the asset hosts.
              // filterHeaders strips our session cookie so it isn't forwarded to PostHog.
              '/ingest/static/**': {
                proxy: {
                  to: `${POSTHOG_ASSETS_HOST}/static/**`,
                  filterHeaders: PROXY_FILTER_HEADERS,
                },
              },
              '/ingest/array/**': {
                proxy: {
                  to: `${POSTHOG_ASSETS_HOST}/array/**`,
                  filterHeaders: PROXY_FILTER_HEADERS,
                },
              },
              '/ingest/**': {
                proxy: { to: `${POSTHOG_INGEST_HOST}/**`, filterHeaders: PROXY_FILTER_HEADERS },
              },
              // `'/**'` matches every route, so SECURITY_HEADERS land on all responses (SSR + assets).
              '/**': { headers: SECURITY_HEADERS },
            },
          }),
        ]),
  ],
  test: {
    // Load all .env vars (no VITE_ prefix filter) so tests work under Node coverage
    // runner and under bun --bun alike. loadEnv reads .env, .env.{mode}, etc.
    env: loadEnv(mode, process.cwd(), ''),
    environment: 'node',
    globals: true,
    // Git worktrees under .claude/worktrees and .worktrees are full repo copies — without this, a
    // test run from the main checkout collects their test files too (and fails on their stale state).
    exclude: [...configDefaults.exclude, '.claude/worktrees/**', '.worktrees/**'],
    setupFiles: ['./test/setup.ts'],
    // Migrates one PGlite per run and saves it, so DB tests boot from that (migratedPGlite()).
    globalSetup: ['./test/helpers/migrated-snapshot.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/gallery/**',
        'src/submit/**',
        'src/review/**',
        'src/render/**',
        'src/adopt/**',
      ],
      // Integration-only files: exercised by the opt-in E2B suite or by a live HTTP/auth
      // request context, not the offline unit suite. Excluded so the threshold reflects
      // real unit-tested logic rather than penalizing code that can't run offline.
      exclude: [
        'src/render/e2b-runner.ts', // needs a live E2B sandbox (RUN_E2B=1)
        'src/review/admin.ts', // needs a live Better Auth session / request headers
        'src/submit/submit-fn.ts', // thin createServerFn wrapper (TanStack server context)
        'src/gallery/functions.ts', // thin createServerFn wrappers (TanStack server context)
        'src/votes/functions.ts', // thin createServerFn wrapper (TanStack server context)
        'src/adopt/functions.ts', // thin createServerFn wrapper (TanStack server context)
      ],
      // Gate on lines + statements (the metrics that catch under-testing). Function-count
      // coverage is skipped: thin createServerFn wrappers (approveVersionFn, getReviewQueue, …)
      // each count as a function but can only run in a live server context. Enforce functions
      // too once those wrappers are split into their own *-fn.ts files (as submit-fn.ts already is).
      thresholds: { lines: 80, statements: 80 },
    },
  },
}))

import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '@/db'
import { requireEnv, requireStrongSecret } from '@/lib/env'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  // baseURL + trustedOrigins set explicitly from BETTER_AUTH_URL (the single source of truth).
  baseURL: requireEnv('BETTER_AUTH_URL'),
  trustedOrigins: [requireEnv('BETTER_AUTH_URL')],
  // This secret signs every session cookie — a weak one lets anyone forge any session
  // (including an admin's). Better Auth only *warns* on a short secret, so we read it through
  // requireStrongSecret to REFUSE to boot below 32 chars instead of silently degrading.
  secret: requireStrongSecret('BETTER_AUTH_SECRET'),
  socialProviders: {
    github: {
      clientId: requireEnv('GITHUB_CLIENT_ID'),
      clientSecret: requireEnv('GITHUB_CLIENT_SECRET'),
      // Populate `username` from the GitHub login; refresh it on every sign-in so
      // renamed GitHub accounts self-heal.
      //
      // overrideUserInfoOnSignIn overwrites the user row on every sign-in with
      // exactly the fields this map returns (plus name/email/image/emailVerified
      // — see node_modules/.../oauth2/link-account.mjs handleOAuthUserInfo).
      // `role` MUST stay out of this map: it's a server-managed field
      // (additionalFields role.input:false) and adding it here would reset every
      // admin back to the default 'user' on their next login. Tradeoff accepted:
      // username/image self-heal on re-login; role does not, and is managed in
      // the DB out of band. Guarded by test/auth.test.ts.
      mapProfileToUser: (profile) => ({ username: profile.login }),
      overrideUserInfoOnSignIn: true,
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
      username: { type: 'string', input: false },
    },
  },
  plugins: [tanstackStartCookies()], // MUST be last
})

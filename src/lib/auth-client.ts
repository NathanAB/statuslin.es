import { createAuthClient } from 'better-auth/react'

// Same-origin app: baseURL is inferred from the current origin, so it works in
// dev (any port) and prod with no hardcoded URL.
export const authClient = createAuthClient()

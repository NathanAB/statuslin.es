import { createFileRoute } from '@tanstack/react-router'
import { HttpError } from '@/lib/http'
import { type DashboardData, DashboardView } from '@/review/dashboard-views'
import { getAdminDashboard } from '@/review/queue'

export const Route = createFileRoute('/admin/')({
  loader: async (): Promise<DashboardData> => {
    try {
      return await getAdminDashboard()
    } catch (err) {
      // Not signed in → render a sign-in prompt that returns here. Signed in but not an admin → a
      // real 403 page. getAdminDashboard already set the 403 status server-side (withHttpStatus); we
      // just catch here so SSR renders the forbidden view cleanly instead of a 500. Do NOT import
      // server-only helpers (setResponseStatus) into this route — it ships to the client and the
      // import crashes hydration.
      //
      // Match on the status property, not `instanceof HttpError`: on a client-side navigation the
      // server-fn error is serialized over HTTP and the rebuilt error isn't an HttpError instance,
      // but it still carries the status. Structural check works on both the SSR and client paths.
      const status = err instanceof HttpError ? err.status : (err as { status?: number })?.status
      if (status === 401) {
        return { signedOut: true }
      }
      if (status === 403) {
        return { forbidden: true }
      }
      throw err
    }
  },
  head: () => ({
    meta: [
      { title: 'Admin dashboard — statuslin.es' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminDashboard,
})

function AdminDashboard() {
  return <DashboardView data={Route.useLoaderData()} />
}

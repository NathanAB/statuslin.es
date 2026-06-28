import { createFileRoute } from '@tanstack/react-router'
import { HttpError } from '@/lib/http'
import { MySubmissionsView } from '@/review/dashboard-views'
import { getMySubmissions } from '@/review/queue'
import { SignInPrompt } from '@/ui/sign-in-prompt'

export const Route = createFileRoute('/me')({
  loader: async () => {
    try {
      return await getMySubmissions()
    } catch (err) {
      // Signed out → render a sign-in prompt that returns here afterward. Match on status, not
      // instanceof (server-fn errors are serialized over client navigations and lose the class).
      const status = err instanceof HttpError ? err.status : (err as { status?: number })?.status
      if (status === 401) return { signedOut: true } as const
      throw err
    }
  },
  head: () => ({ meta: [{ title: 'My submissions — statuslin.es' }] }),
  component: MyPage,
})

function MyPage() {
  const data = Route.useLoaderData()
  if ('signedOut' in data) {
    return <SignInPrompt title="Sign in to see your submissions" />
  }
  return <MySubmissionsView rows={data.rows} user={data.user} />
}

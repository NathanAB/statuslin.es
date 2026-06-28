import { createFileRoute, redirect } from '@tanstack/react-router'

// The review queue became the admin dashboard at /admin. Keep this path working as a redirect.
export const Route = createFileRoute('/admin/review')({
  beforeLoad: () => {
    throw redirect({ to: '/admin' })
  },
})

import type { ErrorComponentProps } from '@tanstack/react-router'

export function RouteError(_props: ErrorComponentProps) {
  return (
    <main className="bg-background flex min-h-screen items-center justify-center px-6 py-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-foreground text-2xl font-semibold">This page couldn’t load</h1>
        <button
          type="button"
          className="bg-primary-fill text-primary-foreground hover:bg-primary-fill/80 inline-flex h-8 cursor-pointer items-center justify-center rounded-lg px-2.5 text-sm font-medium"
          onClick={() => location.reload()}
        >
          Reload
        </button>
      </div>
    </main>
  )
}

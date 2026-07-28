import type { ErrorComponentProps } from '@tanstack/react-router'

export function RouteError(_props: ErrorComponentProps) {
  return (
    <>
      <meta name="robots" content="noindex, follow" />
      <main className="flex min-h-screen items-center justify-center bg-background px-6 py-8">
        <div className="flex max-w-lg flex-col items-center gap-4 text-center">
          <h1 className="font-semibold text-2xl text-foreground">This page couldn’t load</h1>
          <p className="text-muted-foreground">
            A required file failed to load. Reload the page to try again.
          </p>
          <button
            type="button"
            className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg bg-primary px-2.5 font-medium text-primary-foreground text-sm hover:bg-primary/80"
            onClick={() => location.reload()}
          >
            Reload page
          </button>
        </div>
      </main>
    </>
  )
}

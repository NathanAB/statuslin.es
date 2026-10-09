const UNIQUE_VIOLATION = '23505'

// Drizzle wraps driver errors, so the Postgres code sits on the cause.
export function isUniqueViolation(error: unknown): boolean {
  const { code, cause } = error as { code?: string; cause?: { code?: string } }
  return code === UNIQUE_VIOLATION || cause?.code === UNIQUE_VIOLATION
}

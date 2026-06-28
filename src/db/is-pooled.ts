/** Pooled Postgres (Supabase pooler / pgbouncer) doesn't support prepared statements,
 * so postgres-js must run with prepare:false against these URLs. */
export function isPooledUrl(url: string): boolean {
  return /pooler\.|pgbouncer|supabase\.co/.test(url)
}

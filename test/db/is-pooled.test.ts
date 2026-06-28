import { describe, expect, it } from 'vitest'
import { isPooledUrl } from '@/db/is-pooled'

describe('isPooledUrl', () => {
  it('returns true for a Supabase pooler URL (pooler. subdomain)', () => {
    expect(
      isPooledUrl(
        'postgresql://postgres:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      ),
    ).toBe(true)
  })

  it('returns true for a URL containing pgbouncer', () => {
    expect(isPooledUrl('postgresql://user:pass@pgbouncer.internal:5432/db')).toBe(true)
  })

  it('returns true for a URL containing supabase.co (direct connection)', () => {
    expect(
      isPooledUrl('postgresql://postgres:password@db.abcdefghijklmnop.supabase.co:5432/postgres'),
    ).toBe(true)
  })

  it('returns false for a plain localhost connection', () => {
    expect(isPooledUrl('postgresql://user:pass@localhost:5432/db')).toBe(false)
  })

  it('returns false for a plain internal postgres URL', () => {
    expect(isPooledUrl('postgres://user:pass@db.internal:5432/app')).toBe(false)
  })
})

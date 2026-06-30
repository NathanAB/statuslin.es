import { useEffect, useState } from 'react'

/** `false` on the server and the first client render, `true` after mount. Gate any render-time clock
 *  or timezone read behind this so SSR and hydration produce identical markup, then fill in the
 *  browser-specific value once the effect runs (client-only, after hydration has already matched). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

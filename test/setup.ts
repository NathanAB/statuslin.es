import { expect } from 'vitest'
import * as axeMatchers from 'vitest-axe/matchers'

// Register the toHaveNoViolations matcher for all tests.
// Types are declared in test/vitest.d.ts (vitest-axe 0.1.0 augments the old
// Vi namespace which was removed in Vitest 4; the .d.ts shims that gap).
expect.extend(axeMatchers)

// jsdom doesn't ship ResizeObserver; Radix UI primitives (e.g. Checkbox, Select)
// use @radix-ui/react-use-size which calls it. Provide a no-op stub so jsdom
// component tests don't throw "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

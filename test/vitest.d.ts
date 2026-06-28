// vitest-axe 0.1.0 augments the old `Vi` namespace (removed in Vitest 4).
// This file augments Vitest's Assertion interface to add toHaveNoViolations.
// `export {}` makes this a module file so TypeScript treats the
// `declare module 'vitest'` block below as an augmentation (not an ambient
// declaration that replaces the entire module).
export {}

declare module 'vitest' {
  // biome-ignore lint/suspicious/noExplicitAny: must mirror Vitest's own Assertion<T = any> signature
  interface Assertion<T = any> {
    toHaveNoViolations(): void
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void
  }
}

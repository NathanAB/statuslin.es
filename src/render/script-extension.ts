import type { Interpreter } from './types'

const STATIC_SCRIPT_EXT: Record<Exclude<Interpreter, 'node'>, string> = { bash: 'sh', python: 'py' }

/** True when the source is an ES module: a static `import`/`export` statement at the start of a
 *  line. A dynamic `import(...)` is valid in CommonJS, so `import` immediately followed by `(`
 *  does NOT count. Anchored to line starts so the word "import" inside a string/comment is ignored. */
function isEsmSource(source: string): boolean {
  return /^\s*import\s+[^\s(]/m.test(source) || /^\s*export\b/m.test(source)
}

/**
 * Picks the sandbox script file extension. The sandbox runs node 20, which has NO automatic
 * module-syntax detection, so the extension alone decides how node parses the file: `.cjs` runs
 * CommonJS (`require`), `.mjs` runs ESM (`import`). Most status lines are CommonJS, so node
 * defaults to `.cjs` and only switches to `.mjs` when the source actually uses ESM syntax — picking
 * the wrong one crashes the script (`require is not defined in ES module scope`). bash → `.sh`,
 * python → `.py`.
 */
export function scriptExtension(interpreter: Interpreter, source: string): string {
  if (interpreter === 'node') return isEsmSource(source) ? 'mjs' : 'cjs'
  return STATIC_SCRIPT_EXT[interpreter]
}

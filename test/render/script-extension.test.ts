import { describe, expect, it } from 'vitest'
import { scriptExtension } from '@/render/script-extension'

// The E2B sandbox runs node 20, which has NO automatic module-syntax detection, so the file
// extension decides the module kind: .cjs runs CommonJS (require), .mjs runs ESM (import).
// Picking the wrong one makes the script crash (require-in-.mjs → "require is not defined").
describe('scriptExtension', () => {
  it('uses .sh for bash and .py for python', () => {
    expect(scriptExtension('bash', '#!/bin/bash\necho hi')).toBe('sh')
    expect(scriptExtension('python', 'print(1)')).toBe('py')
  })

  it('uses .cjs for a CommonJS node script (require)', () => {
    const src = "const os = require('os')\nprocess.stdout.write(os.platform())"
    expect(scriptExtension('node', src)).toBe('cjs')
  })

  it('defaults a plain node script (no require/import) to .cjs', () => {
    expect(scriptExtension('node', 'process.stdout.write("hi")')).toBe('cjs')
  })

  it('uses .mjs for an ESM node script (static import)', () => {
    const src = "import os from 'node:os'\nprocess.stdout.write(os.platform())"
    expect(scriptExtension('node', src)).toBe('mjs')
  })

  it('uses .mjs for an ESM node script (export)', () => {
    expect(scriptExtension('node', 'export const x = 1\nconsole.log(x)')).toBe('mjs')
  })

  it('treats a dynamic import() as CommonJS (.cjs), since import() is valid in CJS', () => {
    const src = "const p = import('node:os')\np.then(os => process.stdout.write(os.platform()))"
    expect(scriptExtension('node', src)).toBe('cjs')
  })

  it('is not fooled by the word import inside a string or comment', () => {
    const src = "// remember to import nothing\nconst s = 'please import this'\nrequire('os')"
    expect(scriptExtension('node', src)).toBe('cjs')
  })
})

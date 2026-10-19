import { describe, expect, it } from 'vitest'
import { buildClaudePrompt, installExcerpt } from '@/adopt/install'

const lines = (n: number) => Array.from({ length: n }, (_, i) => `echo line ${i + 1}`).join('\n')

// The home page's "How installing works" shows a status line's real install prompt, with only
// the head of its script, so the walkthrough stays short.
describe('installExcerpt', () => {
  it("shows the prompt's own words around the first lines of the script, and counts the rest", () => {
    const source = `#!/usr/bin/env bash\n${lines(9)}`
    const full = buildClaudePrompt({ source, interpreter: 'bash', title: 'Meter' })

    const excerpt = installExcerpt({ source, interpreter: 'bash', title: 'Meter' })

    expect(excerpt.prompt).toBe(
      full.replace(source, '#!/usr/bin/env bash\necho line 1\necho line 2\n… 7 more lines'),
    )
    expect(excerpt).toMatchObject({
      file: '~/.claude/statusline.sh',
      command: '~/.claude/statusline.sh',
      lines: 10,
    })
  })

  it('shows a short script whole', () => {
    const source = 'echo one\necho two\n'
    const excerpt = installExcerpt({ source, interpreter: 'bash', title: 'Two' })

    expect(excerpt.prompt).toBe(buildClaudePrompt({ source, interpreter: 'bash', title: 'Two' }))
    expect(excerpt.lines).toBe(2)
  })

  // The file name comes from the whole script: an ES module saves as .mjs even when its first
  // import is past the lines the excerpt shows.
  it('names the file the full script installs to', () => {
    const source = `// a\n// b\n// c\n// d\nimport fs from 'node:fs'\nconsole.log(fs)`
    const excerpt = installExcerpt({ source, interpreter: 'node', title: 'Esm' })

    expect(excerpt.file).toBe('~/.claude/statusline.mjs')
    expect(excerpt.command).toBe('node ~/.claude/statusline.mjs')
    expect(excerpt.prompt).toContain('~/.claude/statusline.mjs')
  })

  // String.replace reads $', $$ and $& in a replacement string as patterns; bash uses all three.
  it("keeps a script's dollar signs as they are", () => {
    const head = "#!/usr/bin/env bash\nIFS=$'\\n' pid=$$ all=$&"
    const long = `${head}\n${lines(5)}`
    const short = "echo $$ $' $&"

    expect(installExcerpt({ source: long, interpreter: 'bash', title: 'D' }).prompt).toContain(
      `${head}\necho line 1\n… 4 more lines\n`,
    )
    expect(installExcerpt({ source: short, interpreter: 'bash', title: 'D' }).prompt).toBe(
      buildClaudePrompt({ source: short, interpreter: 'bash', title: 'D' }),
    )
  })
})

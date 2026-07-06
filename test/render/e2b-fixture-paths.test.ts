import { describe, expect, it } from 'vitest'
import { assertSafeFixturePaths } from '@/render/e2b-runner'

describe('assertSafeFixturePaths', () => {
  it('accepts absolute paths under /home/user with a safe charset', () => {
    expect(() =>
      assertSafeFixturePaths([
        { path: '/home/user/.claude/todos/abc-agent-abc.json', content: '[]' },
        { path: '/home/user/.claude/projects/app/transcript.jsonl', content: '' },
      ]),
    ).not.toThrow()
  })

  it.each([
    '/etc/passwd',
    '/home/user/../root/x',
    'relative/path.json',
    '/home/user/a b.json',
    '/home/user/$(rm -rf).json',
  ])('rejects %s', (path) => {
    expect(() => assertSafeFixturePaths([{ path, content: '' }])).toThrow(/unsafe fixture path/)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { Route as ResourcesRoute } from '@/routes/resources'
import { Route as SubmitRoute } from '@/routes/submit'
import { Route as TermsRoute } from '@/routes/terms'

const ORIGINAL = process.env.BETTER_AUTH_URL
afterEach(() => {
  process.env.BETTER_AUTH_URL = ORIGINAL
})

describe('static page social metadata', () => {
  it('names the most-searched tools in the /resources title and description', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await ResourcesRoute.options.head?.({} as never)

    expect(head?.meta).toEqual(
      expect.arrayContaining([
        { title: 'ccstatusline, claude-powerline & More Claude Code Tools' },
        {
          name: 'description',
          content:
            'ccstatusline, claude-powerline, CCometixLine, and other Claude Code status line tools, generators, guides, and resources, each with a short note of our own.',
        },
      ]),
    )
  })

  it('gives /submit its own share metadata', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await SubmitRoute.options.head?.({} as never)

    expect(head?.meta).toEqual(
      expect.arrayContaining([
        { property: 'og:url', content: 'https://statuslin.es/submit' },
        { property: 'og:title', content: 'Submit a status line' },
        {
          property: 'og:description',
          content:
            'Submit your Claude Code status line to the community gallery. We render it in a sandbox across example sessions, review it, and publish it for others to copy.',
        },
      ]),
    )
  })

  it('gives /terms its own share metadata', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await TermsRoute.options.head?.({} as never)

    expect(head?.meta).toEqual(
      expect.arrayContaining([
        { property: 'og:url', content: 'https://statuslin.es/terms' },
        { property: 'og:title', content: 'Terms' },
        {
          property: 'og:description',
          content:
            'The terms for using statuslin.es and submitting status lines: licensing, acceptable use, and how takedowns work.',
        },
      ]),
    )
  })
})

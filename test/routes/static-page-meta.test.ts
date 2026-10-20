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
        { property: 'og:title', content: 'Submit a mod' },
        {
          property: 'og:description',
          content:
            'Share a Claude Code mod or status line. We review every submission before it goes live.',
        },
      ]),
    )
  })

  it('names /submit?kind=mod for mods', async () => {
    process.env.BETTER_AUTH_URL = 'https://statuslin.es'
    const head = await SubmitRoute.options.head?.({ loaderData: { kind: 'mod' } } as never)

    expect(head?.meta).toEqual(
      expect.arrayContaining([{ property: 'og:title', content: 'Submit a mod' }]),
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
          content: 'Licensing and takedown terms for the mods on statuslin.es.',
        },
      ]),
    )
  })
})

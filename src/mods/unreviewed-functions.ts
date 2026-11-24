import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { getUnreviewedThemeCards } from '@/themes/queries'
import { findUnreviewedMod, listUnreviewedMods } from './unreviewed-queries'

/** The page or the listing it became (findUnreviewedMod), and a page's themes (ADR 0014). */
export const getUnreviewedModFn = createServerFn({ method: 'GET' })
  .validator((d: { owner: string; pluginName: string }) => ({
    owner: String(d.owner),
    pluginName: String(d.pluginName),
  }))
  .handler(({ data }) =>
    withHttpStatus(async () => {
      const found = await findUnreviewedMod(db, data)
      if (found?.kind !== 'page') return found
      return { ...found, themes: await getUnreviewedThemeCards(db, data) }
    }),
  )

/** The /mods section's list: names, owners and descriptions only. */
export const listUnreviewedModsFn = createServerFn({ method: 'GET' }).handler(() =>
  withHttpStatus(async () =>
    (await listUnreviewedMods(db)).map(({ owner, pluginName, description }) => ({
      owner,
      pluginName,
      description,
    })),
  ),
)

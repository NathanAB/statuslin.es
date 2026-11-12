import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db'
import { withHttpStatus } from '@/lib/http.server'
import { findUnreviewedMod, listUnreviewedMods } from './unreviewed-queries'

export const getUnreviewedModFn = createServerFn({ method: 'GET' })
  .validator((d: { owner: string; pluginName: string }) => ({
    owner: String(d.owner),
    pluginName: String(d.pluginName),
  }))
  .handler(({ data }) => withHttpStatus(() => findUnreviewedMod(db, data)))

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

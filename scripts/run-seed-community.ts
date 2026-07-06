import '@/lib/refuse-in-production'
import { db } from '@/db'
import { publishRenderedSeeds, releaseHeldSeeds, seedCommunity } from './seed-community'
import { COMMUNITY_CONFIGS } from './seed-data/community-configs'

const mode = process.argv[2] ?? 'seed'
if (mode === 'seed') {
  const outcomes = await seedCommunity(db, COMMUNITY_CONFIGS)
  for (const o of outcomes)
    console.log(
      `[${o.status}] ${o.login} — ${o.title}${o.slug ? ` → /${o.slug}` : ''}${o.reason ? ` (${o.reason})` : ''}`,
    )
} else if (mode === 'release-held') {
  console.log(`released ${await releaseHeldSeeds(db)} held render jobs`)
} else if (mode === 'publish-rendered') {
  const { published, skipped } = await publishRenderedSeeds(db)
  console.log(`published ${published}, skipped ${skipped} (render not done)`)
} else {
  console.error('usage: bun run seed:community [seed|release-held|publish-rendered]')
  process.exit(1)
}
process.exit(0)

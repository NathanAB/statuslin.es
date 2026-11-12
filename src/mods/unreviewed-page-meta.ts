import { keywordPageTitle, metaDescription } from '@/lib/search-text'
import { SITE_NAME } from '@/lib/site'

const UNREVIEWED_MOD_TITLE_KEYWORD = ': Claude Code mod (not reviewed)'

/** An unreviewed mod's page (ADR 0011): searched by its name, and labelled unreviewed in the result. */
export function unreviewedModPageTitle(pluginName: string, owner: string): string {
  return keywordPageTitle(`${pluginName} by ${owner}`, UNREVIEWED_MOD_TITLE_KEYWORD)
}

/** Says it isn't reviewed before the author's own words, which are untrusted and may be empty. */
export function unreviewedModMetaDescription(mod: {
  pluginName: string
  owner: string
  description: string
}): string {
  const lead = `${mod.pluginName} is a Claude Code mod by ${mod.owner}, not reviewed by ${SITE_NAME}.`
  return metaDescription(`${lead} ${mod.description}`, lead)
}

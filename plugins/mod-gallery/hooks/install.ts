import { MARKETPLACE, SITE, type Slug } from './catalogue'

/** The Claude Code a session runs on, falling back to the one on PATH: Desktop puts none there. */
const SESSION_CLAUDE = `"\${CLAUDE_CODE_EXECPATH:-claude}"`

/**
 * The prompt that installs a mod, word for word the one its page on statuslin.es copies. It runs
 * nothing: the person reads it in the prompt box and sends it. The slug is the only part that came
 * from the network.
 */
export function installPrompt(slug: Slug): string {
  return [
    `Install the ${slug} mod from ${new URL(SITE).host}. Run this in your shell, then tell me to start a new session to load it:`,
    `${SESSION_CLAUDE} plugin marketplace add ${MARKETPLACE.url} && ${SESSION_CLAUDE} plugin install ${slug}@${MARKETPLACE.name}`,
  ].join('\n')
}

/** The mod's page, built here from the slug rather than read from the network. */
export function modPageUrl(slug: Slug): string {
  return `${SITE}/mods/${slug}`
}

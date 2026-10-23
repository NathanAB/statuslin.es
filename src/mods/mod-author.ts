import type { ConfigAuthor } from '@/gallery/queries'
import { githubAvatarUrl } from '@/lib/github-avatars'

/** A mod's author as a byline shows them: their GitHub login, linked, with its avatar. */
export function modAuthor(authorGithub: string): ConfigAuthor {
  return { name: authorGithub, username: authorGithub, image: githubAvatarUrl(authorGithub) }
}

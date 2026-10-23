// GitHub serves any user's avatar from this origin by login. Single source for the mod author chips
// and the CSP img-src in vite.config.ts.
export const GITHUB_AVATARS_ORIGIN = 'https://avatars.githubusercontent.com'

/** The pixel size GitHub is asked for: AuthorChip's 20px circle at 2x. */
const CHIP_AVATAR_SIZE = '40'

/** A GitHub user's avatar, sized for AuthorChip's 20px circle at 2x. */
export function githubAvatarUrl(login: string): string {
  return `${GITHUB_AVATARS_ORIGIN}/${encodeURIComponent(login)}?s=${CHIP_AVATAR_SIZE}`
}

/**
 * A stored avatar URL sized for a 20px circle. A GitHub sign-in stores the full 460px image; GitHub
 * resizes it with `s`. A URL from anywhere else, or one already sized, is returned as it is.
 */
export function chipAvatarUrl(image: string): string {
  if (!URL.canParse(image)) return image
  const url = new URL(image)
  if (url.origin !== GITHUB_AVATARS_ORIGIN || url.searchParams.has('s')) return image
  url.searchParams.set('s', CHIP_AVATAR_SIZE)
  return url.toString()
}

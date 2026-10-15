// GitHub serves any user's avatar from this origin by login. Single source for the mod author chips
// and the CSP img-src in vite.config.ts.
export const GITHUB_AVATARS_ORIGIN = 'https://avatars.githubusercontent.com'

/** A GitHub user's avatar, sized for AuthorChip's 20px circle at 2x. */
export function githubAvatarUrl(login: string): string {
  return `${GITHUB_AVATARS_ORIGIN}/${encodeURIComponent(login)}?s=40`
}

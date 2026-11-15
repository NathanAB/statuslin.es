import type { ConfigAuthor } from '@/gallery/queries'
import { chipAvatarUrl } from '@/lib/github-avatars'

/** Author avatar + byline. Renders nothing for a null author (pre-FK data only).
 *  With a GitHub username it links to the profile and shows `@username`; without
 *  one it falls back to the display name with no link.
 *  alt="" is intentional: the name sits adjacent, so alt text would duplicate it.
 *  loading="lazy" also stops React SSR hoisting a preload link per avatar into <head>. */
export function AuthorChip({ author }: { author: ConfigAuthor | null }) {
  if (!author) return null

  const avatar = author.image ? (
    <img
      src={chipAvatarUrl(author.image)}
      alt=""
      loading="lazy"
      width={20}
      height={20}
      className="ring-primary/0 group-hover:ring-primary/60 size-5 shrink-0 self-center rounded-full group-hover:ring-2"
    />
  ) : (
    <span
      aria-hidden="true"
      className="bg-sunken text-muted-foreground ring-primary/0 group-hover:ring-primary/60 flex size-5 shrink-0 items-center justify-center self-center rounded-full text-xs font-medium group-hover:ring-2"
    >
      {author.name.charAt(0).toUpperCase()}
    </span>
  )

  if (author.username) {
    return (
      <a
        href={`https://github.com/${author.username}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 shrink-0 items-baseline gap-1.5"
      >
        {avatar}
        <span className="text-muted-foreground group-hover:text-foreground truncate text-sm group-hover:underline">
          @{author.username}
        </span>
      </a>
    )
  }

  return (
    <span className="flex min-w-0 shrink-0 items-baseline gap-1.5">
      {avatar}
      <span className="text-muted-foreground truncate text-sm">{author.name}</span>
    </span>
  )
}

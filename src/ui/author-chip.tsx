import type { ConfigAuthor } from '@/gallery/queries'

/** Author avatar + byline. Renders nothing for a null author (pre-FK data only).
 *  With a GitHub username it links to the profile and shows `@username`; without
 *  one it falls back to the display name with no link.
 *  alt="" is intentional: the name sits adjacent, so alt text would duplicate it. */
export function AuthorChip({ author }: { author: ConfigAuthor | null }) {
  if (!author) return null

  const avatar = author.image ? (
    <img
      src={author.image}
      alt=""
      className="size-5 shrink-0 rounded-full ring-primary/0 group-hover:ring-2 group-hover:ring-primary/60"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-sunken font-medium text-muted-foreground text-xs ring-primary/0 group-hover:ring-2 group-hover:ring-primary/60"
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
        className="group flex min-w-0 shrink-0 items-center gap-1.5"
      >
        {avatar}
        <span className="truncate text-muted-foreground text-sm group-hover:text-foreground group-hover:underline">
          @{author.username}
        </span>
      </a>
    )
  }

  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1.5">
      {avatar}
      <span className="truncate text-muted-foreground text-sm">{author.name}</span>
    </span>
  )
}

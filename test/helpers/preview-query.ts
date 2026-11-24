/** The query a page puts on a preview image URL: `r`, then `image` when it names one. */
export function previewQuery(render: string | null, image: string | null = null): URLSearchParams {
  const query = new URLSearchParams()
  if (render !== null) query.set('r', render)
  if (image !== null) query.set('image', image)
  return query
}

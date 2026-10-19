/** Runs `work` on every item, at most `limit` at a time. */
export async function forEachConcurrently<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
) {
  const queue = [...items]
  const worker = async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await work(item)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

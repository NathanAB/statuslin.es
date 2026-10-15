function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "4 status lines and 1 mod", naming only the kinds present ("2 mods"). */
export function kindCount(statusLines: number, mods: number): string {
  const statusLineCount = counted(statusLines, 'status line', 'status lines')
  const modCount = counted(mods, 'mod', 'mods')
  if (mods === 0) return statusLineCount
  if (statusLines === 0) return modCount
  return `${statusLineCount} and ${modCount}`
}

import { useEffect, useState } from 'react'

/**
 * How far below the top of the window, in px, a section's top must pass to count as the one being
 * read. Near the top, where a picked section lands: lower down, a short section (one step of the
 * guide) handed the mark to the next one as soon as it was picked.
 */
const READING_LINE = 96

/**
 * The section being read: the last one, in page order, whose top has passed the reading line
 * (`line`, px from the top of the window). None while the reader is still above the first. At the
 * bottom of the page it's the last one, which can be too short to ever reach the line.
 */
export function activeSectionId(
  sections: readonly { id: string; top: number }[],
  { line, atBottom }: { line: number; atBottom: boolean },
): string | null {
  if (atBottom && sections.length > 0) return sections[sections.length - 1]?.id ?? null
  let active: string | null = null
  for (const section of sections) if (section.top <= line) active = section.id
  return active
}

/** The id, of `ids` (in page order), of the section being read, kept current as the page scrolls. */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join(' ')

  useEffect(() => {
    const sectionIds = key.split(' ')
    let frame = 0
    const measure = () => {
      frame = 0
      const sections = sectionIds.flatMap((id) => {
        const el = document.getElementById(id)
        return el ? [{ id, top: el.getBoundingClientRect().top }] : []
      })
      const page = document.documentElement
      const atBottom =
        page.scrollHeight > window.innerHeight &&
        window.innerHeight + window.scrollY >= page.scrollHeight - 2
      setActive(activeSectionId(sections, { line: READING_LINE, atBottom }))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [key])

  return active
}

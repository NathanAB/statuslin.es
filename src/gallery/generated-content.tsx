import type { GeneratedContent } from '@/content/types'
import { BulletList } from '@/ui/bullet-list'
import { SectionCard } from '@/ui/section-card'

const SECTIONS: Array<{ key: keyof GeneratedContent; title: string }> = [
  { key: 'whatItShows', title: 'What it shows' },
  { key: 'requirements', title: 'Requirements' },
  { key: 'behaviorNotes', title: 'Behavior notes' },
]

/**
 * The auto-generated page copy (scripts/generate-content.ts) as one SectionCard per non-empty
 * section. Renders nothing when every section is empty — the page looks exactly like a config
 * that has no generated content yet.
 */
export function GeneratedContentSections({ content }: { content: GeneratedContent }) {
  const sections = SECTIONS.filter((s) => content[s.key].length > 0)
  if (sections.length === 0) return null
  return (
    <>
      {sections.map((s) => (
        <SectionCard key={s.key} title={s.title} headingLevel={2}>
          <BulletList items={content[s.key]} />
        </SectionCard>
      ))}
    </>
  )
}

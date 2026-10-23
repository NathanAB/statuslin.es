import { Heading } from '@/ui/text'

/**
 * A redesigned page's opening, without a demo beside it: the title at page size and one sentence
 * right under it, both across the full width of the column (/resources).
 */
export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="grid grid-cols-12 gap-x-6 gap-y-[clamp(0.875rem,1.6vw,1.375rem)]">
      <div className="col-span-12">
        <Heading level={1} size="page">
          {title}
        </Heading>
      </div>
      <p className="col-span-12 text-pretty text-foreground text-lead">{lead}</p>
    </div>
  )
}

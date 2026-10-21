import { Heading } from '@/ui/text'

/**
 * A redesigned page's opening, without a demo beside it: the title at display size and one sentence
 * right under it, over the first eight of twelve columns, as the home hero sets its own (/resources).
 */
export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="grid grid-cols-12">
      <div className="col-span-12 flex flex-col gap-[clamp(0.875rem,1.6vw,1.375rem)] min-[56.25rem]:col-span-8">
        <Heading level={1} size="display">
          {title}
        </Heading>
        <p className="text-pretty text-foreground text-lead">{lead}</p>
      </div>
    </div>
  )
}

import { Heading } from '@/ui/text'

/**
 * A redesigned page's opening, without a demo beside it: the title at display size across the full
 * width, and one sentence right under it over eight of twelve columns, as the home hero sets its own
 * (/resources).
 */
export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="grid grid-cols-12 gap-x-6 gap-y-[clamp(0.875rem,1.6vw,1.375rem)]">
      <div className="col-span-12">
        <Heading level={1} size="display">
          {title}
        </Heading>
      </div>
      <p className="col-span-12 text-pretty text-foreground text-lead min-[56.25rem]:col-span-8">
        {lead}
      </p>
    </div>
  )
}

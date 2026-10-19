import { Reveal } from '@/ui/reveal'

/**
 * A heading and one statement, then a short strip of steps side by side, each a title and one
 * sentence on its own tile, the tiles one height. Stacks on phones. Rises into place as it scrolls in.
 */
export function StepStrip({
  heading,
  statement,
  steps,
}: {
  heading: string
  statement: string
  steps: readonly { title: string; text: string }[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <Reveal>
        <h2 className="font-semibold text-foreground text-heading">{heading}</h2>
      </Reveal>
      <Reveal>
        <p className="text-pretty text-foreground text-lead">{statement}</p>
      </Reveal>
      <Reveal>
        <ol className="mt-10 grid gap-2.5 md:grid-cols-3">
          {steps.map((step) => (
            <li
              key={step.title}
              className="flex flex-col gap-2 rounded-panel bg-card px-6 pt-5 pb-6"
            >
              <h3 className="font-medium text-body text-foreground tracking-[-0.01em]">
                {step.title}
              </h3>
              <p className="text-body text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </div>
  )
}

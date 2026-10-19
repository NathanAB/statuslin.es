import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Reveal } from '@/ui/reveal'

/** One step of the walkthrough: what to do, what you paste or what Claude Code sends, and its reply. */
export interface WalkthroughStep {
  say: string
  call: { kind: 'prompt' | 'code' | 'input'; text: string }
  /** Claude Code's reply under the call, set like its terminal. */
  response?: ReactNode
}

const CALL_TEXT = {
  // The install prompt wraps like prose; it's long and has no columns to keep.
  prompt: 'whitespace-pre-wrap break-words text-[0.84375rem] leading-[1.55]',
  // JSON keeps its indentation and scrolls sideways when it must.
  code: 'overflow-x-auto whitespace-pre text-[0.84375rem] leading-[1.55]',
  // A line typed at the prompt.
  input: 'whitespace-pre-wrap text-[0.875rem] text-foreground leading-[1.45]',
} as const

/**
 * "How installing works": a heading and one statement, then each step as a call and its response,
 * and a closing picture of the result. Every block below the fold rises into place as it scrolls in.
 */
export function InstallWalkthrough({
  heading,
  statement,
  steps,
  result,
}: {
  heading: string
  statement: string
  steps: WalkthroughStep[]
  /** The last picture: the status line under the prompt (a Terminal). */
  result: ReactNode
}) {
  return (
    <div className="grid grid-cols-12 gap-x-6">
      <div className="col-span-12 flex min-w-0 flex-col gap-4 min-[56.25rem]:col-span-6 min-[56.25rem]:col-start-4">
        <Reveal>
          <h2 className="font-semibold text-foreground text-heading">{heading}</h2>
        </Reveal>
        <Reveal>
          <p className="mt-2 max-w-[30ch] text-foreground text-lead">{statement}</p>
        </Reveal>
        {steps.map((step) => (
          <div key={step.say} className="mt-18 flex min-w-0 flex-col gap-4">
            <Reveal>
              <p className="font-medium text-body text-foreground tracking-[-0.015em]">
                {step.say}
              </p>
            </Reveal>
            <Reveal>
              {/* Only the typed line pictures the product; the prompt and JSON are text to read. */}
              <div
                data-ui={step.call.kind === 'input' ? '' : undefined}
                className="min-w-0 rounded-panel bg-card px-5.5 py-5"
              >
                <pre
                  className={cn('font-mono text-terminal-foreground', CALL_TEXT[step.call.kind])}
                >
                  {step.call.kind === 'input' ? (
                    <>
                      <span aria-hidden="true" className="text-terminal-muted">
                        ❯
                      </span>{' '}
                      {step.call.text}
                    </>
                  ) : (
                    step.call.text
                  )}
                </pre>
              </div>
            </Reveal>
            {step.response ? (
              <Reveal>
                <div
                  data-ui=""
                  className="ml-14 min-w-0 overflow-x-auto rounded-panel bg-sunken px-5.5 py-4.5 font-mono text-[0.8125rem] text-terminal-foreground leading-[1.5] max-md:ml-0"
                >
                  <pre className="whitespace-pre font-mono">{step.response}</pre>
                </div>
              </Reveal>
            ) : null}
          </div>
        ))}
      </div>
      <div className="col-span-12 mt-6 min-w-0 min-[56.25rem]:col-span-9 min-[56.25rem]:col-start-4">
        <Reveal>{result}</Reveal>
      </div>
    </div>
  )
}

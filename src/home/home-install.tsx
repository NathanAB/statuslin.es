import { HomeSection } from '@/ui/home-section'
import { StepStrip } from '@/ui/step-strip'

const STEPS = [
  {
    title: 'Copy its install prompt',
    text: 'One button, here or on its page. The prompt carries the script and the two steps to set it up.',
  },
  {
    title: 'Paste it into Claude Code',
    text: 'Claude Code saves the script in ~/.claude and points your settings.json at it.',
  },
  {
    title: 'It runs under every prompt',
    text: 'Claude Code sends it your session (model, branch, context, cost) and shows what it prints.',
  },
] as const

/** "How installing works": why a status line here is safe to run, then installing in three steps. */
export function HomeInstall() {
  return (
    <HomeSection>
      <StepStrip
        heading="How installing works"
        statement="Every status line here was read by a person and rendered in a sandbox before it went up. Installing one is a single paste."
        steps={STEPS}
      />
    </HomeSection>
  )
}

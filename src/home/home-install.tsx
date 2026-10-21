import { HomeSection } from '@/ui/home-section'
import { StepStrip } from '@/ui/step-strip'

const STEPS = [
  {
    title: 'Copy its install prompt',
    text: 'One button, here or on its page. The prompt says exactly what to install and how.',
  },
  {
    title: 'Paste it into Claude Code',
    text: 'For a status line, Claude Code saves the script in ~/.claude and points your settings.json at it. For a mod, it adds the statuslin.es marketplace and installs the mod at the commit that was reviewed.',
  },
  {
    title: 'It shows in your sessions',
    text: 'A status line prints under every prompt. A mod draws where it was made to: above the prompt, in a pane, or in Claude Desktop.',
  },
] as const

/** "How installing works": why a mod here is safe to run, then installing in three steps, saying
 *  what happens for a status line and for any other mod. */
export function HomeInstall() {
  return (
    <HomeSection>
      <StepStrip
        heading="How installing works"
        statement="Every mod here, status lines included, was reviewed and rendered in a sandbox before it was listed. Installing one is a single paste."
        steps={STEPS}
      />
    </HomeSection>
  )
}

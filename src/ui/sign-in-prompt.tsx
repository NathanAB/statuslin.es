import { CenteredShell } from '@/ui/shell'
import { SignInButton } from '@/ui/sign-in-button'
import { Heading } from '@/ui/text'

/**
 * Full-page "sign in to continue" prompt for signed-out visitors who land on a page that
 * needs an account (submit, my submissions, admin). The button starts GitHub sign-in
 * straight away and returns them to this same page once they come back.
 */
export function SignInPrompt({ title }: { title: string }) {
  return (
    <CenteredShell user={null}>
      <Heading level={1}>{title}</Heading>
      <SignInButton />
    </CenteredShell>
  )
}

import { ClosingBand } from '@/ui/closing-band'
import { SubmitChooser } from '@/ui/submit-cta'

/** The home page's last section: an invitation to submit, with the real submit flow. */
export function HomeClosing({ signedIn }: { signedIn: boolean }) {
  return (
    <ClosingBand
      heading="Yours goes here."
      lead={
        signedIn
          ? "Paste a status line's script or a mod's GitHub link. It renders in a sandbox and is reviewed before it goes live."
          : "Sign in with GitHub, then paste a status line's script or a mod's GitHub link. It renders in a sandbox and is reviewed before it goes live."
      }
      panel={<SubmitChooser signedIn={signedIn} />}
    />
  )
}

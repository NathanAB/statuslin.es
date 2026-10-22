import type { SubmitDraft } from '@/submit/submit'

interface SubmitPageCopy {
  heading: string
  intro: string
  button: string
}

const COPY: Record<SubmitDraft['kind'] | 'new', SubmitPageCopy> = {
  new: {
    heading: 'Submit a status line',
    intro: "Paste your script. We'll render it in a sandbox and review it before it goes live.",
    button: 'Submit',
  },
  resubmission: {
    heading: 'Fix and resubmit',
    intro: "Fix your script. We'll render and review it again.",
    button: 'Resubmit',
  },
  update: {
    heading: 'Submit an update',
    intro: 'Your live version stays up while we review the update.',
    button: 'Submit update',
  },
}

export function submitPageCopy(
  draft: Pick<SubmitDraft, 'kind'> | null | undefined,
): SubmitPageCopy {
  return COPY[draft?.kind ?? 'new']
}

// What happens to a submission, beside the submit form: each kind's pipeline, in order. Only the
// last step differs for an update, which replaces the live version instead of adding one.
const STATUS_LINE_STEPS = [
  "We run it in a sandbox against sample Claude Code sessions. A script that needs the network waits until we've checked the hosts it calls.",
  'We review the script and its previews.',
  "Once it's approved it goes up in the gallery. We email you either way.",
]
const MOD_STEPS = [
  'We pin your link to one commit, so what we review is what people install.',
  'We check it in a sandbox and render its previews, then review it.',
  "Once it's approved it goes up in the gallery and the marketplace. We email you either way.",
]
const UPDATE_LIVE = "Once it's approved it replaces the live version. We email you either way."

export function submitNextSteps(kind: 'status_line' | 'mod', update: boolean): string[] {
  const steps = kind === 'mod' ? MOD_STEPS : STATUS_LINE_STEPS
  return update ? [...steps.slice(0, -1), UPDATE_LIVE] : steps
}

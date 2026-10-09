import type { SubmitDraft } from '@/submit/submit'

interface SubmitPageCopy {
  heading: string
  intro: string
  button: string
}

const COPY: Record<SubmitDraft['kind'] | 'new', SubmitPageCopy> = {
  new: {
    heading: 'Submit a status line',
    intro:
      "Paste your script below. We'll run it in a sandbox across a range of example sessions, review it, and add it to the gallery.",
    button: 'Submit',
  },
  resubmission: {
    heading: 'Fix and resubmit',
    intro: 'Update your script below. We’ll render and review the corrected version.',
    button: 'Resubmit',
  },
  update: {
    heading: 'Submit an update',
    intro:
      'Change what you need below. Your live version stays in the gallery until we’ve reviewed the update.',
    button: 'Submit update',
  },
}

export function submitPageCopy(
  draft: Pick<SubmitDraft, 'kind'> | null | undefined,
): SubmitPageCopy {
  return COPY[draft?.kind ?? 'new']
}

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
    intro: "Your live version stays up until we've reviewed the update.",
    button: 'Submit update',
  },
}

export function submitPageCopy(
  draft: Pick<SubmitDraft, 'kind'> | null | undefined,
): SubmitPageCopy {
  return COPY[draft?.kind ?? 'new']
}

import { usePostHog } from '@posthog/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { HttpError } from '@/lib/http'
import type { ModDraft } from '@/mods/own-mod'
import { submitModFn } from '@/mods/submit-fn'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Stack } from '@/ui/layout'
import { Notice } from '@/ui/notice'
import { Text } from '@/ui/text'

interface ModSubmitCopy {
  heading: string
  intro: string
  button: string
}

const COPY: Record<ModDraft['kind'] | 'new', ModSubmitCopy> = {
  new: {
    heading: 'Submit a mod',
    intro:
      'Paste a GitHub link to a Claude Code plugin. We pin it to a commit, check it in a sandbox, render it, and review it before it goes live.',
    button: 'Submit',
  },
  resubmission: {
    heading: 'Fix and resubmit',
    intro: 'Link to a newer commit of the same folder. We’ll check, render and review it again.',
    button: 'Resubmit',
  },
  update: {
    heading: 'Submit an update',
    intro:
      'Link to a newer commit of the same folder. Your live version stays in the gallery until we’ve reviewed the update.',
    button: 'Submit update',
  },
}

export function modSubmitPageCopy(draft: ModDraft | null): ModSubmitCopy {
  return COPY[draft?.kind ?? 'new']
}

/**
 * Submits a mod by its GitHub link, or a new version of the submitter's own mod. Checking the
 * plugin in a sandbox takes a while, so the button says so while the server works.
 */
export function ModSubmitForm({ draft }: { draft: ModDraft | null }) {
  const posthog = usePostHog()
  const [link, setLink] = useState(draft?.link ?? '')
  const [title, setTitle] = useState(draft?.title ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const keepsTitle = draft?.kind === 'update'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setPinned(null)
    try {
      const result = await submitModFn({
        data: {
          link,
          ...(keepsTitle || title.trim() === '' ? {} : { title }),
          ...(draft ? { slug: draft.slug } : {}),
        },
      })
      setPinned(`Pinned ${result.slug} to ${result.ref} at ${result.commitSha.slice(0, 7)}.`)
      toast.success("Submitted — we'll render it and review it.")
      setLink('')
      setTitle(draft?.title ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      // Only the status: the message can carry the plugin's own validation output.
      posthog.capture('mod_submission_failed', {
        status: err instanceof HttpError ? err.status : 0,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap={4}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {pinned ? <Notice tone="info">{pinned}</Notice> : null}
        <Stack gap={1.5}>
          <Label htmlFor="mod-link">GitHub link</Label>
          <Input
            id="mod-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://github.com/owner/repo/tree/main/plugins/my-mod"
            required
          />
          <Text muted size="sm">
            The plugin’s folder, its .claude-plugin/plugin.json, or a commit. A branch is pinned to
            its newest commit, which must be on the default branch.
          </Text>
        </Stack>
        {keepsTitle ? null : (
          <Stack gap={1.5}>
            <Label htmlFor="mod-title">Title</Label>
            <Input id="mod-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Text muted size="sm">
              Leave it empty to use the plugin’s name.
            </Text>
          </Stack>
        )}
        <Stack gap={2}>
          <Text muted size="sm">
            The mod is credited to the repository’s owner.
          </Text>
          <div>
            <Button type="submit" disabled={submitting} size="lg">
              {submitting ? 'Checking the plugin…' : modSubmitPageCopy(draft).button}
            </Button>
          </div>
        </Stack>
      </Stack>
    </form>
  )
}

import { usePostHog } from '@posthog/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { HttpError } from '@/lib/http'
import { CONTENT_LICENSE } from '@/lib/site'
import { NetworkSection } from '@/submit/network-section'
import { submitConfigFn } from '@/submit/submit-fn'
import type { AppHeaderUser } from '@/ui/app-header'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Stack } from '@/ui/layout'
import { Notice } from '@/ui/notice'
import { SelectField } from '@/ui/select'
import { Text, TextLink } from '@/ui/text'
import { Textarea } from '@/ui/textarea'

const INTERPRETER_OPTIONS = [
  { value: 'bash', label: 'bash' },
  { value: 'node', label: 'node' },
  { value: 'python', label: 'python' },
]

export function SubmitForm({ user: _user }: { user: AppHeaderUser }) {
  const posthog = usePostHog()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [interpreter, setInterpreter] = useState<'bash' | 'node' | 'python'>('bash')
  const [source, setSource] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [networkEnabled, setNetworkEnabled] = useState(false)
  const [hosts, setHosts] = useState<string[]>([])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const networkHosts = networkEnabled ? hosts.map((h) => h.trim()).filter(Boolean) : []
      await submitConfigFn({
        data: { title, description, interpreter, source, networkHosts },
      })
      // The statusline_submitted event fires server-side in submitConfigFn now (ad blockers can't
      // strip a server event), so the browser only handles the success UX here.
      toast.success("Queued for review — we'll take a look shortly.")
      setTitle('')
      setDescription('')
      setInterpreter('bash')
      setSource('')
      setNetworkEnabled(false)
      setHosts([])
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Don't ship the raw error to PostHog: a server error message can embed bytes of the
      // (untrusted, not-yet-reviewed) submitted source. Send only a stable status code; the user
      // still sees the full message locally.
      const status = err instanceof HttpError ? err.status : 0
      posthog.capture('statusline_submission_failed', { interpreter, status })
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap={4}>
        {error && <Notice tone="error">{error}</Notice>}
        <Stack gap={1.5}>
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Stack>
        <Stack gap={1.5}>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          <Text muted size="sm">
            A sentence on what it shows.
          </Text>
        </Stack>
        <Stack gap={1.5}>
          <Label htmlFor="interpreter">Interpreter</Label>
          <SelectField
            id="interpreter"
            value={interpreter}
            onChange={(e) => setInterpreter(e.target.value as 'bash' | 'node' | 'python')}
            options={INTERPRETER_OPTIONS}
          />
        </Stack>
        <Stack gap={1.5}>
          <Label htmlFor="source">Source code</Label>
          <Textarea
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            required
            mono
            tall
          />
          <Text muted size="sm">
            Your script reads the session JSON from stdin and prints one line. See the{' '}
            <TextLink href="https://code.claude.com/docs/en/statusline">status line docs</TextLink>.
          </Text>
        </Stack>
        <NetworkSection
          enabled={networkEnabled}
          hosts={hosts}
          onEnabledChange={setNetworkEnabled}
          onAddHost={(host) => setHosts((prev) => (prev.includes(host) ? prev : [...prev, host]))}
          onRemoveHost={(i) => setHosts((prev) => prev.filter((_, j) => j !== i))}
        />
        <Stack gap={2}>
          <Text muted size="sm">
            Everything's open source, runs sandboxed, and gets a human review before it goes live.
          </Text>
          <Text muted size="sm">
            By submitting, you confirm you have the right to share this script and release it under{' '}
            <TextLink href={CONTENT_LICENSE.url}>{CONTENT_LICENSE.name}</TextLink>.
          </Text>
          <div>
            <Button type="submit" disabled={submitting} size={'lg'}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </Stack>
      </Stack>
    </form>
  )
}

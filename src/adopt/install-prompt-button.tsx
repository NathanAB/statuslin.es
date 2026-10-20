import { Check, Copy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { STATUS_LINE_PASTE_HINT } from '@/adopt/adopt-actions'
import { getInstallSourceFn } from '@/adopt/functions'
import { buildClaudePrompt } from '@/adopt/install'
import type { InstallSource } from '@/adopt/install-source'
import { Button } from '@/ui/button'
import { COPIED_MS } from '@/ui/copy-button'
import { SwapLabel } from '@/ui/swap-label'

/**
 * The home hero's "Copy install prompt": the same prompt as a status line's page; `onCopied` records
 * the copy. The page doesn't carry the scripts, so the shown status line's script is fetched as soon
 * as it is shown, once per status line; by the time the visitor clicks it is usually here, and the
 * clipboard write stays inside the click.
 */
export function InstallPromptButton({
  configId,
  title,
  onCopied,
}: {
  configId: string
  title: string
  onCopied: () => void
}) {
  const ready = useRef(new Map<string, InstallSource>())
  const pending = useRef(new Map<string, Promise<InstallSource | null>>())
  const [copied, setCopied] = useState(false)

  // A failed fetch is forgotten, so the next click tries again.
  const load = useCallback((id: string): Promise<InstallSource | null> => {
    const inFlight = pending.current.get(id)
    if (inFlight) return inFlight
    const request = getInstallSourceFn({ data: { configId: id } })
      .catch(() => null)
      .then((source) => {
        if (source) ready.current.set(id, source)
        else pending.current.delete(id)
        return source
      })
    pending.current.set(id, request)
    return request
  }, [])

  useEffect(() => {
    setCopied(false)
    void load(configId)
  }, [configId, load])

  function write(source: InstallSource) {
    navigator.clipboard
      .writeText(buildClaudePrompt(source))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), COPIED_MS)
        onCopied()
        toast('Prompt copied', { description: STATUS_LINE_PASTE_HINT })
      })
      .catch(() => {
        // Denied, or (after waiting for the script) refused for coming too long after the click.
        toast.error("Couldn't copy to the clipboard", { description: 'Try the button again.' })
      })
  }

  function copy() {
    const source = ready.current.get(configId)
    if (source) return write(source)
    void load(configId).then((loaded) => {
      if (loaded) write(loaded)
      else
        toast.error("Couldn't load this status line's script", {
          description: 'Open its page to copy it from there.',
        })
    })
  }

  return (
    <Button
      type="button"
      size="pill"
      trailingIcon={copied ? <Check /> : <Copy />}
      onClick={copy}
      aria-label={copied ? 'Copied' : `Copy install prompt for ${title}`}
    >
      <SwapLabel label="Copy install prompt" swapped={copied} swappedLabel="Copied" />
    </Button>
  )
}

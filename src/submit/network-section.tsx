import { Globe } from 'lucide-react'
import { useState } from 'react'
import { MAX_NETWORK_HOSTS } from '@/submit/network-hosts'
import { Button } from '@/ui/button'
import { Callout } from '@/ui/callout'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'
import { Row, Stack } from '@/ui/layout'
import { RemovableChip } from '@/ui/removable-chip'
import { Switch } from '@/ui/switch'
import { Text } from '@/ui/text'

interface NetworkSectionProps {
  enabled: boolean
  hosts: string[]
  onEnabledChange: (v: boolean) => void
  onAddHost: (host: string) => void
  onRemoveHost: (index: number) => void
}

export function NetworkSection({
  enabled,
  hosts,
  onEnabledChange,
  onAddHost,
  onRemoveHost,
}: NetworkSectionProps) {
  const [draft, setDraft] = useState('')
  const canAdd = hosts.length < MAX_NETWORK_HOSTS

  function addDraft() {
    const value = draft.trim()
    if (!value) return
    onAddHost(value)
    setDraft('')
  }

  return (
    <Callout
      title="Network access"
      icon={<Globe />}
      description="Status lines run with no internet by default. If yours fetches data, turn this on and declare the hosts it calls."
    >
      <Stack gap={3}>
        <Row gap={2} align="center">
          <Switch id="network" checked={enabled} onCheckedChange={onEnabledChange} />
          <Label htmlFor="network">My status line needs network access</Label>
        </Row>
        {enabled ? (
          <Stack gap={2}>
            <Text muted size="sm">
              Hosts your script calls (max {MAX_NETWORK_HOSTS}). An admin reviews them before a
              network preview runs. Example: api.github.com or *.example.com.
            </Text>
            {hosts.length > 0 ? (
              <Row gap={1.5} wrap>
                {hosts.map((host, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: host list has no stable id; index is intentional
                  <RemovableChip key={i} label={host} onRemove={() => onRemoveHost(i)} />
                ))}
              </Row>
            ) : null}
            {canAdd ? (
              <Row gap={2} align="center">
                <Input
                  id="network-host-draft"
                  value={draft}
                  placeholder="api.github.com"
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button type="button" variant="secondary" onClick={addDraft}>
                  Add host
                </Button>
              </Row>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Callout>
  )
}

import { Braces, Code, Globe, Hexagon, KeyRound, Terminal } from 'lucide-react'
import type * as React from 'react'
import { Badge } from '@/ui/badge'
import { Row, Stack } from '@/ui/layout'
import { Text } from '@/ui/text'
import { Tooltip } from '@/ui/tooltip'

// One icon per interpreter so the chip reads at a glance; `Code` is the fallback.
const INTERPRETER_ICON: Record<string, React.ComponentType> = {
  bash: Terminal,
  node: Hexagon,
  python: Braces,
}

/** The chip pair shown in the top-right of a gallery card and the detail page:
 *  the interpreter (always) and a `network` chip when the config declares hosts.
 *  Both chips share the one style; the network chip carries a tooltip listing the
 *  domains it may reach. Rendered once here so both surfaces stay identical. */
export function ConfigBadges({
  interpreter,
  networkHosts,
  readsClaudeToken,
}: {
  interpreter: string
  networkHosts: string[]
  readsClaudeToken: boolean
}): React.ReactElement {
  const InterpreterIcon = INTERPRETER_ICON[interpreter] ?? Code
  return (
    <Row gap={2}>
      <Badge variant="secondary">
        <InterpreterIcon />
        {interpreter}
      </Badge>
      {networkHosts.length > 0 ? (
        <Tooltip
          content={
            <Stack gap={1}>
              <Text size="xs">Communicates with these domains over network:</Text>
              {networkHosts.map((host) => (
                <Text key={host} size="xs" muted>
                  {host}
                </Text>
              ))}
            </Stack>
          }
        >
          <button
            type="button"
            aria-label={`Uses network: ${networkHosts.join(', ')}`}
            // `relative z-10` keeps this trigger above the gallery card's stretched-link
            // overlay so mouse hover reaches it (the overlay covers the whole card).
            className="relative z-10 inline-flex cursor-default rounded-4xl p-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Badge variant="secondary">
              <Globe />
              network
            </Badge>
          </button>
        </Tooltip>
      ) : null}
      {readsClaudeToken ? (
        <Tooltip content={<Text size="xs">Reads your Claude Code auth token.</Text>}>
          <button
            type="button"
            aria-label="Reads your Claude Code auth token"
            className="relative z-10 inline-flex cursor-default rounded-4xl p-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Badge variant="secondary">
              <KeyRound />
              auth token
            </Badge>
          </button>
        </Tooltip>
      ) : null}
    </Row>
  )
}

import { usePostHog } from '@posthog/react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { getSession } from '@/lib/auth-functions'
import { canonicalLink } from '@/lib/canonical'
import { siteUrl } from '@/lib/site'
import {
  DRAW_LOCATION_LABEL,
  describeFootprint,
  modSurfaces,
  SURFACE_LABEL,
} from '@/mods/footprint'
import { getModDetailFn, recordModCopyFn } from '@/mods/functions'
import {
  type InstallCommand,
  type InstallCommandKind,
  installCommands,
  modSourceUrl,
} from '@/mods/install'
import type { ModDetail } from '@/mods/queries'
import { AuthorChip } from '@/ui/author-chip'
import { BulletList } from '@/ui/bullet-list'
import { CodeBlock } from '@/ui/code-block'
import { CopyButton } from '@/ui/copy-button'
import { Row, Stack } from '@/ui/layout'
import { SectionCard } from '@/ui/section-card'
import { PageShell } from '@/ui/shell'
import { StatuslinePreview } from '@/ui/statusline-preview'
import { Heading, Text, TextLink } from '@/ui/text'

const SHORT_SHA_LENGTH = 7

export const Route = createFileRoute('/mods/$slug')({
  loader: async ({ params }) => {
    const mod = await getModDetailFn({ data: { slug: params.slug } })
    if (!mod) throw notFound()
    return { mod, user: await getSession(), origin: siteUrl() }
  },
  head: ({ loaderData }) => {
    const mod = loaderData?.mod
    return {
      meta: [
        {
          title: mod
            ? `${mod.title} — Claude Code mod | statuslin.es`
            : 'Mod not found — statuslin.es',
        },
        ...(mod?.description ? [{ name: 'description', content: mod.description }] : []),
      ],
      ...(mod ? { links: [canonicalLink(`/mods/${mod.slug}`)] } : {}),
    }
  },
  notFoundComponent: () => (
    <PageShell user={null}>
      <Text>Mod not found.</Text>
      <TextLink to="/">Back to gallery</TextLink>
    </PageShell>
  ),
  component: ModPage,
})

function ModPage() {
  const { mod, user, origin } = Route.useLoaderData()
  const recordCopy = useRecordModCopy(mod.id)

  return (
    <PageShell user={user}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Heading level={1}>{mod.title}</Heading>
          {mod.description && (
            <Text muted size="sm">
              {mod.description}
            </Text>
          )}
          <ModCredit mod={mod} />
        </Stack>

        <SectionCard title="Preview" headingLevel={2}>
          <ModPreview mod={mod} />
        </SectionCard>

        <SectionCard title="Install" headingLevel={2}>
          <Stack gap={4}>
            {installCommands(origin, mod.pluginName).map((command) => (
              <InstallCommandBlock key={command.kind} command={command} onCopied={recordCopy} />
            ))}
          </Stack>
        </SectionCard>

        <SectionCard title="What it does" headingLevel={2}>
          <FootprintSection mod={mod} />
        </SectionCard>

        {/* Generated page copy (unit 43b) renders here. */}
      </Stack>
    </PageShell>
  )
}

/**
 * Records a copy server-side, where the PostHog event fires (ad blockers can't strip it), passing
 * the browser's PostHog ids so it joins this visitor's funnel. Best effort: a failure never
 * interrupts the copy.
 */
function useRecordModCopy(modId: string): (kind: InstallCommandKind) => void {
  const posthog = usePostHog()
  return (kind) => {
    let tracking: { distinctId?: string; sessionId?: string } = {}
    try {
      tracking = { distinctId: posthog.get_distinct_id(), sessionId: posthog.get_session_id() }
    } catch {
      // PostHog is uninitialized outside production; record without funnel ids.
    }
    recordModCopyFn({ data: { modId, kind, ...tracking } }).catch(() => {})
  }
}

function ModCredit({ mod }: { mod: ModDetail }) {
  return (
    <Row gap={1.5} wrap>
      <Text muted size="sm">
        by
      </Text>
      <AuthorChip author={{ name: mod.authorGithub, username: mod.authorGithub, image: null }} />
      <Text muted size="sm">
        · source at{' '}
        <TextLink href={modSourceUrl(mod)}>{mod.commitSha.slice(0, SHORT_SHA_LENGTH)}</TextLink> ·
      </Text>
      <Text muted size="sm">
        {mod.license ? `${mod.license} licence` : 'No licence'}
      </Text>
    </Row>
  )
}

function ModPreview({ mod }: { mod: ModDetail }) {
  if (mod.preview) return <StatuslinePreview segments={mod.preview} />
  if (mod.desktopScreenshot) {
    return (
      <figure>
        <Stack gap={2}>
          <div>
            <img src={mod.desktopScreenshot} alt={`${mod.title} in Claude Desktop`} />
          </div>
          <figcaption>
            <Text muted size="sm">
              Claude Desktop, screenshot
            </Text>
          </figcaption>
        </Stack>
      </figure>
    )
  }
  return (
    <Text muted size="sm">
      No preview available.
    </Text>
  )
}

function InstallCommandBlock({
  command,
  onCopied,
}: {
  command: InstallCommand
  onCopied: (kind: InstallCommandKind) => void
}) {
  return (
    <Stack gap={2}>
      <Row gap={3} justify="between">
        <Text size="sm">
          {command.label}{' '}
          <Text inline muted size="sm">
            (Claude Code {command.minVersion} or later)
          </Text>
        </Text>
        <CopyButton
          text={command.command}
          ariaLabel={`Copy command: ${command.label}`}
          onCopied={() => onCopied(command.kind)}
        />
      </Row>
      <CodeBlock wrap>{command.command}</CodeBlock>
    </Stack>
  )
}

function FootprintSection({ mod }: { mod: ModDetail }) {
  const footprint = describeFootprint(mod.footprint)
  const surfaces = modSurfaces({
    hasTerminalPreview: mod.preview !== null,
    hasDesktopScreenshot: mod.desktopScreenshot !== null,
    mentionsDesktop: footprint.mentionsDesktop,
  })
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Heading level={3}>Where it draws</Heading>
        {footprint.draws.length > 0 ? (
          <BulletList items={footprint.draws.map((location) => DRAW_LOCATION_LABEL[location])} />
        ) : (
          <Text muted size="sm">
            Nothing on screen.
          </Text>
        )}
      </Stack>
      <Stack gap={2}>
        <Heading level={3}>Surfaces</Heading>
        <BulletList items={surfaces.map((surface) => SURFACE_LABEL[surface])} />
      </Stack>
      <Stack gap={2}>
        <Heading level={3}>What it touches</Heading>
        {footprint.phrases.length > 0 && <BulletList items={footprint.phrases} />}
        {footprint.unknown.length > 0 && (
          <Text muted size="sm">
            Also uses, as written:
          </Text>
        )}
        {footprint.unknown.map((entry) => (
          <Text key={entry} mono size="sm">
            {entry}
          </Text>
        ))}
        {footprint.phrases.length === 0 && footprint.unknown.length === 0 && (
          <Text muted size="sm">
            Nothing beyond its own drawing and state.
          </Text>
        )}
      </Stack>
    </Stack>
  )
}

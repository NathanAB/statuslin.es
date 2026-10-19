import { useId, useState } from 'react'
import { InstallPromptButton } from '@/adopt/install-prompt-button'
import { useRecordedCopy } from '@/adopt/use-recorded-copy'
import type { HeroLine, HeroSessionKey } from '@/gallery/hero-lines'
import { HERO_SESSIONS } from '@/home/hero-sessions'
import { ChoiceGroup } from '@/ui/choice-group'
import { copiesLabel } from '@/ui/copy-count'
import { HeroActions, HeroLayout } from '@/ui/hero-layout'
import { Terminal } from '@/ui/terminal'
import { Heading, Text, TextLink } from '@/ui/text'
import { LiveMessage, VisuallyHidden } from '@/ui/visually-hidden'

/** The hero's one sentence beside the title. */
export const HERO_LEAD =
  'A status line is the row under your Claude Code prompt. Pick one the community made and watch it run.'

const byline = (line: HeroLine, copies: number) => {
  const author = line.author?.username ? `@${line.author.username}` : line.author?.name
  return author ? `by ${author} · ${copiesLabel(copies)}` : copiesLabel(copies)
}

/**
 * The home page's first screen: a Claude Code session where the visitor tries on the community's
 * most popular status lines. Picking one, or another session, renders it under the prompt; the
 * session also changes the conversation above it. Nothing changes on its own. The first status
 * line in its Everyday session is the server-rendered state, so the page reads whole without
 * JavaScript. Copy installs the shown one through the same prompt as its own page.
 */
export function HomeHero({
  heading,
  headingHidden,
  lines,
}: {
  heading: string
  /** Ends the title for search engines and screen readers only (", page 2"). */
  headingHidden?: string | undefined
  lines: HeroLine[]
}) {
  const [slug, setSlug] = useState(lines[0]?.slug ?? '')
  const [sessionKey, setSessionKey] = useState<HeroSessionKey>('clean-main')
  // What the visitor has changed so far: nothing moves until they do.
  const [changed, setChanged] = useState({ line: false, session: false })
  const pickerId = useId()
  const sessionId = useId()
  const line = lines.find((l) => l.slug === slug) ?? lines[0]
  const session = HERO_SESSIONS.find((s) => s.key === sessionKey) ?? HERO_SESSIONS[0]
  // The shown line's copy count, bumped when the visitor copies it, as on its own page.
  const copies = useRecordedCopy(line?.configId ?? '', line?.copyCount ?? 0)

  // With nothing published yet there is nothing to try on; the title and sentence still stand.
  if (!line || !session)
    return (
      <HeroLayout
        heading={heading}
        headingHidden={headingHidden}
        lead={HERO_LEAD}
        stage={null}
        aside={null}
      />
    )

  const pick = (next: string) => {
    setSlug(next)
    setChanged((c) => ({ ...c, line: true }))
  }
  const switchSession = (next: HeroSessionKey) => {
    setSessionKey(next)
    setChanged((c) => ({ ...c, session: true }))
  }
  const anyChange = changed.line || changed.session

  return (
    <HeroLayout
      heading={heading}
      headingHidden={headingHidden}
      lead={HERO_LEAD}
      stage={
        <Terminal
          label={`Claude Code with ${line.title} under the prompt, in the ${session.label} session`}
          toolbar={{
            title: 'Session',
            titleId: sessionId,
            caption: session.caption,
            control: (
              <ChoiceGroup
                look="tray"
                labelledBy={sessionId}
                options={HERO_SESSIONS.map((s) => ({ value: s.key, label: s.label }))}
                value={session.key}
                onValueChange={switchSession}
              />
            ),
          }}
          transcript={session.transcript}
          status={line.renders[session.key] ?? null}
          conversationKey={session.key}
          conversationChanged={changed.session}
          statusKey={`${line.slug}:${session.key}`}
          statusChanged={anyChange}
        />
      }
      aside={
        <>
          <Heading level={2} size="compact" id={pickerId}>
            Pick a status line
          </Heading>
          <ChoiceGroup
            look="list"
            rise
            labelledBy={pickerId}
            options={lines.map((l) => ({
              value: l.slug,
              label: l.title,
              detail: copiesLabel(l.slug === line.slug ? copies.count : l.copyCount),
            }))}
            value={line.slug}
            onValueChange={pick}
          />
          <HeroActions>
            <InstallPromptButton
              configId={line.configId}
              title={line.title}
              onCopied={() => copies.record('prompt')}
            />
            {/* The same visible words for every status line, so a long title never moves the row. */}
            <TextLink to="/c/$slug" params={{ slug: line.slug }} tone="underlined">
              Open page<VisuallyHidden>: {line.title}</VisuallyHidden>
            </TextLink>
          </HeroActions>
          <Text muted size="sm">
            {byline(line, copies.count)}
          </Text>
          <LiveMessage>
            {anyChange ? `Showing ${line.title} in the ${session.label} session.` : ''}
          </LiveMessage>
        </>
      }
    />
  )
}

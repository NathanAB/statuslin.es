import { GUIDE_FAQ } from '@/guide/guide-faq'
import { GuidePayload } from '@/guide/guide-payload'
import { GUIDE_CONTENTS, GUIDE_SECTION as S } from '@/guide/guide-sections'
import { GuideSteps } from '@/guide/guide-steps'
import {
  GUIDE_DATES,
  NOT_SHOWING_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
} from '@/lib/page-title'
import { DocLayout } from '@/ui/doc-layout'
import { FaqSection } from '@/ui/faq-section'
import { Grid, Stack } from '@/ui/layout'
import { PageSection, SectionAnchor } from '@/ui/page-section'
import { Panel } from '@/ui/panel'
import { Heading, Text, TextLink } from '@/ui/text'

/**
 * The /guide page body: the fast paths, then the hand-wiring steps (`GuideSteps`) and the JSON a
 * script receives (`GuidePayload`), the FAQ, and where to go next. Example strings live in
 * src/guide/examples.ts; section ids and titles in src/guide/guide-sections.ts. Code blocks are
 * pre-highlighted server-side and passed in as `highlights`.
 */
export function GuideContent({
  highlights,
}: {
  highlights: { payloadHtml: string; scriptHtml: string; settingsHtml: string }
}) {
  return (
    <DocLayout
      contents={GUIDE_CONTENTS}
      intro={
        <Stack gap={3}>
          <Heading level={1}>How to set up a Claude Code status line</Heading>
          <Text muted>
            A status line is a bar at the bottom of Claude Code. Claude Code runs your script, pipes
            it a JSON snapshot of the session, and shows what the script prints.
          </Text>
          <Text muted>
            This guide is for writing your own from scratch. To use one someone already made,{' '}
            <TextLink to="/">install one from the gallery</TextLink>.
          </Text>
          <Text muted size="sm">
            Updated {GUIDE_DATES.modified}
          </Text>
        </Stack>
      }
    >
      <Stack gap={9}>
        <PageSection id={S.fastPaths.id} title={S.fastPaths.title}>
          <Grid>
            <Panel>
              <Heading level={3} id={S.runStatusline.id}>
                {S.runStatusline.title}
              </Heading>
              <Text muted size="sm">
                Inside Claude Code, describe what you want, like{' '}
                <Text inline mono>
                  /statusline show model, directory, and context usage
                </Text>
                . It writes the script to{' '}
                <Text inline mono>
                  ~/.claude/
                </Text>{' '}
                and updates your settings.
              </Text>
            </Panel>
            <Panel>
              <Heading level={3} id={S.copyFromGallery.id}>
                {S.copyFromGallery.title}
              </Heading>
              <Text muted size="sm">
                Each status line there shows its real output before you copy it.{' '}
                {/* Underlined full-strength text: coral this small on the panel misses 4.5:1. */}
                <TextLink to="/" tone="underlined">
                  Browse Claude Code status lines
                </TextLink>
                .
              </Text>
            </Panel>
          </Grid>
        </PageSection>

        <PageSection id={S.wireUp.id} title={S.wireUp.title}>
          <Stack gap={9}>
            <GuideSteps scriptHtml={highlights.scriptHtml} settingsHtml={highlights.settingsHtml} />
            <GuidePayload payloadHtml={highlights.payloadHtml} />
          </Stack>
        </PageSection>

        <SectionAnchor id={S.faq.id}>
          <FaqSection entries={GUIDE_FAQ} />
        </SectionAnchor>

        <PageSection id={S.goingFurther.id} title={S.goingFurther.title}>
          <Text muted>
            The <TextLink to="/resources">tools and resources list</TextLink> has status line tools,
            themes and usage trackers. If you build a status line you like,{' '}
            <TextLink to="/submit">submit it to the gallery</TextLink>.
          </Text>
          <Text muted>
            Status line blank in the terminal?{' '}
            <TextLink to={NOT_SHOWING_GUIDE_PATH}>Work through the fixes</TextLink>.
          </Text>
          <Text muted>
            Claude Desktop's Code tab doesn't run your status line.{' '}
            <TextLink to="/guide/claude-desktop">Here's how to show it there</TextLink>.
          </Text>
          <Text muted>
            For a pane or a slash command, you need a mod.{' '}
            <TextLink to={STATUS_LINES_VS_MODS_GUIDE_PATH}>Compare status lines and mods</TextLink>.
          </Text>
        </PageSection>
      </Stack>
    </DocLayout>
  )
}

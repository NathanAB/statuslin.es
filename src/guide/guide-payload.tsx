import { SAMPLE_STDIN_JSON } from '@/guide/examples'
import { GUIDE_SECTION as S } from '@/guide/guide-sections'
import { GuideStdinFields } from '@/guide/guide-stdin-fields'
import { HighlightedCode } from '@/ui/highlighted-code'
import { Stack } from '@/ui/layout'
import { SectionAnchor } from '@/ui/page-section'
import { SideBySide } from '@/ui/side-by-side'
import { Heading, Text, TextLink } from '@/ui/text'

/** The guide's "The JSON your script receives": the sample payload beside what each field holds. */
export function GuidePayload({ payloadHtml }: { payloadHtml: string }) {
  return (
    <SectionAnchor id={S.payload.id}>
      <Stack gap={3}>
        <Heading level={3}>{S.payload.title}</Heading>
        <Text muted>
          Your script gets one JSON object on stdin per update. This is one of the payloads the
          gallery renders previews against:
        </Text>
        <SideBySide
          first={
            <HighlightedCode html={payloadHtml} text={SAMPLE_STDIN_JSON} copyLabel="Copy JSON" />
          }
          second={
            <Stack gap={3}>
              <Text muted>
                Most scripts only need a few fields:{' '}
                <Text inline mono>
                  model.display_name
                </Text>
                ,{' '}
                <Text inline mono>
                  workspace.current_dir
                </Text>
                ,{' '}
                <Text inline mono>
                  context_window.used_percentage
                </Text>
                , and{' '}
                <Text inline mono>
                  cost.total_cost_usd
                </Text>
                . Browse status lines that show{' '}
                <TextLink to="/status-lines/$facet" params={{ facet: 'token-usage' }}>
                  token usage
                </TextLink>
                ,{' '}
                <TextLink to="/status-lines/$facet" params={{ facet: 'quota' }}>
                  usage limits
                </TextLink>{' '}
                or{' '}
                <TextLink to="/status-lines/$facet" params={{ facet: 'git' }}>
                  git status
                </TextLink>
                .
              </Text>
              <GuideStdinFields />
            </Stack>
          }
        />
      </Stack>
    </SectionAnchor>
  )
}

import { Stack } from '@/ui/layout'
import { Notice } from '@/ui/notice'
import { Heading, Text } from '@/ui/text'

export function GuideFaq() {
  return (
    <Stack gap={3}>
      <Heading level={2}>Common questions</Heading>
      <Heading level={3}>Why isn't git in the JSON?</Heading>
      <Notice tone="info">
        Claude Code does not send git state. Scripts that show a branch run{' '}
        <Text inline mono>
          git
        </Text>{' '}
        themselves against{' '}
        <Text inline mono>
          workspace.current_dir
        </Text>
        , including in a directory with no repo so you can see how they degrade.
      </Notice>
      <Heading level={3}>Why is used_percentage null?</Heading>
      <Notice tone="info">
        <Text inline mono>
          context_window.used_percentage
        </Text>{' '}
        is null at the start of a fresh session. Guard it (
        <Text inline mono>
          {'// 0'}
        </Text>{' '}
        in jq) or the bar prints "null" until the first response. The gallery's new-session preview
        is that case.
      </Notice>
      <Heading level={3}>How does this site know what a script prints?</Heading>
      <Text muted>
        It runs the submitted script in a sandbox against the same JSON scenarios on this page. The
        cards show that output, not a mock.
      </Text>
    </Stack>
  )
}

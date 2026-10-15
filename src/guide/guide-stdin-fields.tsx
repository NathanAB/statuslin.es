import { STDIN_FIELD_GUIDE } from '@/guide/examples'
import { Stack } from '@/ui/layout'
import { MetaList } from '@/ui/meta-list'
import { Text } from '@/ui/text'

export function GuideStdinFields() {
  return (
    <Stack gap={3}>
      <Text muted>What each field in that payload holds:</Text>
      <MetaList items={STDIN_FIELD_GUIDE} />
    </Stack>
  )
}

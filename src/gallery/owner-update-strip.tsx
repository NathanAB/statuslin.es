import { Link } from '@tanstack/react-router'
import { FilePen, UserRoundCheck } from 'lucide-react'
import { Button } from '@/ui/button'
import { Hint } from '@/ui/hint'
import { Text } from '@/ui/text'

/** On a config page, the author's way to submit an update. Other viewers see nothing. */
export function OwnerUpdateStrip({
  slug,
  viewerIsAuthor,
}: {
  slug: string
  viewerIsAuthor: boolean
}) {
  if (!viewerIsAuthor) return null
  return (
    <Hint
      icon={UserRoundCheck}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/submit" search={{ update: slug }}>
            <FilePen />
            Submit update
          </Link>
        </Button>
      }
    >
      <Text inline>This is your status line.</Text> Updates are reviewed before they go live.
    </Hint>
  )
}

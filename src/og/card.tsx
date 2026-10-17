import type { ReactElement } from 'react'
import { HOME_HEADING } from '@/lib/page-title'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'
import { fitFontSize, fitWithin, lineHeight } from '@/og/fit'
import { OG_PALETTE } from '@/og/palette'
import { orderByScenario } from '@/render/scenarios'
import type { AnsiSegment } from '@/render/types'
import type { DesktopShotImage } from '@/ui/desktop-shot'

const FONT = 'StatuslineNerd'

// What a shared card shows, since the gallery holds both kinds.
const STATUS_LINE_KIND = 'Claude Code status line'
const MOD_KIND = 'Claude Code mod'

// statuslin + coral dot + es, sized for the target.
function drawWordmark(fontSize: number): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: FONT,
        fontWeight: 700,
        fontSize,
        color: OG_PALETTE.foreground,
      }}
    >
      <span>statuslin</span>
      <span style={{ color: OG_PALETTE.primary }}>.</span>
      <span>es</span>
    </div>
  )
}

/** Split a segment list into visual lines on `\n` boundaries. A segment's text may contain newlines
 * anywhere (start, middle, end) — including `"\n\n"` for a deliberate blank line — because Anser
 * preserves them in the segment text. satori does NOT turn a `\n` inside a flex row into a line
 * break, so a multi-line status line would otherwise flatten onto one row and overflow the card.
 * Each `\n` ends the current line and starts the next; per-segment color/bold is preserved on both
 * sides of a split. Leading/trailing blank lines (the stray newlines terminals wrap output in) are
 * dropped so they don't open a gap at the top/bottom of the card; interior blank lines are kept as
 * intentional spacers. */
export function splitSegmentsIntoLines(segments: AnsiSegment[]): AnsiSegment[][] {
  const lines: AnsiSegment[][] = [[]]
  for (const s of segments) {
    const parts = s.text.split('\n')
    parts.forEach((part, i) => {
      if (i > 0) lines.push([])
      const current = lines[lines.length - 1]
      if (current && part !== '') current.push({ ...s, text: part })
    })
  }
  while (lines.length > 0 && lines[0]?.length === 0) lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]?.length === 0) lines.pop()
  return lines
}

/** A status line's first `maxLines` visual lines, and the largest font up to `maxFontSize` at which
 * they fit in `width`. */
function fitStatusLine(
  segments: AnsiSegment[],
  maxFontSize: number,
  maxLines: number,
  width: number,
): { lines: AnsiSegment[][]; fontSize: number } {
  const lines = splitSegmentsIntoLines(segments).slice(0, maxLines)
  const lineSpans = lines.map((line) => line.map((s) => s.text))
  return { lines, fontSize: fitFontSize(lineSpans, maxFontSize, width) }
}

// A status line: colored spans, stacked into one row per visual line (satori won't break on `\n`
// inside a flex row). fg is an ANSI 'rgb(...)' string or null (use foreground). Lines wider than
// `width` shrink the font until they fit.
function drawStatusLine(
  segments: AnsiSegment[],
  maxFontSize: number,
  maxLines = Number.POSITIVE_INFINITY,
  width = Number.POSITIVE_INFINITY,
): ReactElement {
  const { lines, fontSize } = fitStatusLine(segments, maxFontSize, maxLines, width)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: FONT, fontSize }}>
      {lines.map((line, li) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed ordered render, no identity beyond position.
          key={li}
          style={{ display: 'flex', whiteSpace: 'pre' }}
        >
          {line.length === 0 ? (
            // An interior blank line: a single space gives the row its natural line height so the
            // spacer is preserved without any element (satori collapses a truly empty row to 0px).
            <span> </span>
          ) : (
            line.map((s, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed ordered render, no identity beyond position.
                key={i}
                style={{ color: s.fg ?? OG_PALETTE.foreground, fontWeight: s.bold ? 700 : 400 }}
              >
                {s.text}
              </span>
            ))
          )}
        </div>
      ))}
    </div>
  )
}

function well(child: ReactElement, padding: string): ReactElement {
  return (
    <div style={{ display: 'flex', background: OG_PALETTE.sunken, borderRadius: 10, padding }}>
      {child}
    </div>
  )
}

// The mockup's SC['post-compact'] scenario as AnsiSegment[]. Deliberately short so it never
// overflows the ~1056px usable width. `seg` fills the AnsiSegment fields the cards don't vary.
const seg = (text: string, fg: string | null = null, bold = false): AnsiSegment => ({
  text,
  fg,
  bg: null,
  bold,
  italic: false,
  underline: false,
})
const POST_COMPACT: AnsiSegment[] = [
  seg('app', null, true),
  seg(' · '),
  seg('main', 'rgb(187,0,187)'),
  seg(' · '),
  seg('Haiku-4.5', 'rgb(0,0,187)'),
  seg(' · '),
  seg('ctx'),
  seg(' '),
  seg('0%', 'rgb(0,187,0)'),
  seg(' · '),
  seg('5h'),
  seg(' '),
  seg('52%', 'rgb(187,187,0)'),
  seg(' '),
  seg('↻4h1m'),
]

export function homeCard(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        boxSizing: 'border-box',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 36,
        background: OG_PALETTE.background,
        padding: 64,
      }}
    >
      {drawWordmark(82)}
      {well(drawStatusLine(POST_COMPACT, 30), '22px 34px')}
      <div
        style={{
          display: 'flex',
          color: OG_PALETTE.mutedForeground,
          fontFamily: FONT,
          fontSize: 30,
        }}
      >
        {HOME_HEADING}
      </div>
    </div>
  )
}

// The detail card header's font sizes, and the space below its wordmark and above its byline.
const HEADER = { wordmarkSize: 30, wordmarkGap: 14, titleSize: 54, bylineGap: 10, bylineSize: 24 }

function cardHeader(title: string, byline: string): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', marginBottom: HEADER.wordmarkGap }}>
        {drawWordmark(HEADER.wordmarkSize)}
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: FONT,
          fontWeight: 700,
          fontSize: HEADER.titleSize,
          color: OG_PALETTE.foreground,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: FONT,
          fontSize: HEADER.bylineSize,
          color: OG_PALETTE.mutedForeground,
          marginTop: HEADER.bylineGap,
        }}
      >
        {byline}
      </div>
    </div>
  )
}

// The detail card's padding, the gap between its header and body, and the room it leaves the body
// below a one-line title.
const DETAIL_PADDING_X = 72
const DETAIL_PADDING_Y = 60
const DETAIL_GAP = 30
const DETAIL_BODY_WIDTH = CARD_WIDTH - 2 * DETAIL_PADDING_X
const DETAIL_BODY_HEIGHT =
  CARD_HEIGHT -
  2 * DETAIL_PADDING_Y -
  DETAIL_GAP -
  (lineHeight(HEADER.wordmarkSize) +
    HEADER.wordmarkGap +
    lineHeight(HEADER.titleSize) +
    HEADER.bylineGap +
    lineHeight(HEADER.bylineSize))

// A status line preview's well, as status line and mod cards draw it.
const PREVIEW_FONT_SIZE = 19
const PREVIEW_PADDING_X = 20
const PREVIEW_PADDING_Y = 13
const PREVIEW_WIDTH = DETAIL_BODY_WIDTH - 2 * PREVIEW_PADDING_X

function previewWell(segments: AnsiSegment[], maxLines: number): ReactElement {
  return well(
    drawStatusLine(segments, PREVIEW_FONT_SIZE, maxLines, PREVIEW_WIDTH),
    `${PREVIEW_PADDING_Y}px ${PREVIEW_PADDING_X}px`,
  )
}

function detailCard(header: ReactElement, body: ReactElement): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        boxSizing: 'border-box',
        height: '100%',
        justifyContent: 'center',
        gap: DETAIL_GAP,
        background: OG_PALETTE.background,
        padding: `${DETAIL_PADDING_Y}px ${DETAIL_PADDING_X}px`,
      }}
    >
      {header}
      {body}
    </div>
  )
}

type ScenarioPreview = { scenarioKey: string; segments: AnsiSegment[] }

const CONFIG_PREVIEW_GAP = 16
// The rows of one status line that fill the body at full size, for one taller than the card.
const CONFIG_PREVIEW_MAX_LINES = Math.floor(
  (DETAIL_BODY_HEIGHT - 2 * PREVIEW_PADDING_Y) / lineHeight(PREVIEW_FONT_SIZE),
)

function previewWellHeight(segments: AnsiSegment[]): number {
  const { lines, fontSize } = fitStatusLine(
    segments,
    PREVIEW_FONT_SIZE,
    CONFIG_PREVIEW_MAX_LINES,
    PREVIEW_WIDTH,
  )
  return lines.length * lineHeight(fontSize) + 2 * PREVIEW_PADDING_Y
}

/** Up to three scenarios, in order, as many as fit the body whole. The first always shows. */
function previewsThatFit(previews: ScenarioPreview[]): ScenarioPreview[] {
  const fitting: ScenarioPreview[] = []
  let height = 0
  for (const preview of orderByScenario(previews).slice(0, 3)) {
    height += (fitting.length > 0 ? CONFIG_PREVIEW_GAP : 0) + previewWellHeight(preview.segments)
    if (fitting.length > 0 && height > DETAIL_BODY_HEIGHT) break
    fitting.push(preview)
  }
  return fitting
}

export function configCard(input: {
  title: string
  author: string | null
  previews: ScenarioPreview[]
}): ReactElement {
  const byline = input.author ? `${STATUS_LINE_KIND} · by ${input.author}` : STATUS_LINE_KIND
  return detailCard(
    cardHeader(input.title, byline),
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: CONFIG_PREVIEW_GAP,
        alignItems: 'flex-start',
      }}
    >
      {previewsThatFit(input.previews).map((p) => (
        <div key={p.scenarioKey} style={{ display: 'flex' }}>
          {previewWell(p.segments, CONFIG_PREVIEW_MAX_LINES)}
        </div>
      ))}
    </div>,
  )
}

// Enough rows of a pane mod's preview to fill the card below the header without overflowing it.
const MOD_PREVIEW_MAX_LINES = 9
// A Desktop shot fits in about the height of a preview of MOD_PREVIEW_MAX_LINES rows.
const MOD_DESKTOP_SHOT_BOX = { width: DETAIL_BODY_WIDTH, height: 250 }

/** What a mod's card draws below its header. */
export type ModCardBody =
  | { kind: 'terminal'; segments: AnsiSegment[] }
  | { kind: 'desktop'; shot: DesktopShotImage }
  | { kind: 'none' }

function drawModCardBody(title: string, body: ModCardBody): ReactElement {
  switch (body.kind) {
    case 'terminal':
      return previewWell(body.segments, MOD_PREVIEW_MAX_LINES)
    case 'desktop': {
      const { width, height } = fitWithin(body.shot, MOD_DESKTOP_SHOT_BOX)
      return (
        <img
          src={body.shot.src}
          alt={`${title} in Claude Desktop`}
          width={width}
          height={height}
          style={{ borderRadius: 10 }}
        />
      )
    }
    case 'none':
      return well(
        <div
          style={{
            display: 'flex',
            fontFamily: FONT,
            fontSize: 24,
            color: OG_PALETTE.foreground,
          }}
        >
          Draws in Claude Desktop
        </div>,
        '10px 18px',
      )
  }
}

export function modCard(input: {
  title: string
  authorGithub: string
  body: ModCardBody
}): ReactElement {
  return detailCard(
    cardHeader(input.title, `${MOD_KIND} · by @${input.authorGithub}`),
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {drawModCardBody(input.title, input.body)}
    </div>,
  )
}

import type { ReactElement } from 'react'
import { HERO_TRANSCRIPT } from '@/home/hero-transcript'
import { HERO_LEAD } from '@/home/home-hero'
import { HOME_HERO_HEADING } from '@/lib/page-title'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'
import { fitFontSize, fitWithin, lineHeight } from '@/og/fit'
import { SANS_FONT } from '@/og/font'
import { OG_PALETTE } from '@/og/palette'
import { OPUS } from '@/render/scenario-helpers'
import { orderByScenario } from '@/render/scenarios'
import type { AnsiSegment } from '@/render/types'
import type { DesktopShotImage } from '@/ui/desktop-shot'
import type { TranscriptLine } from '@/ui/terminal'

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

const seg = (text: string, fg: string | null = null): AnsiSegment => ({
  text,
  fg,
  bg: null,
  bold: false,
  italic: false,
  underline: false,
})

export const HOME_CARD_STATUS_LINE: AnsiSegment[] = [
  seg('◆ ', 'rgb(217,119,87)'),
  seg(OPUS.display_name),
  seg('  \uE0A0 main', 'rgb(198,120,221)'),
  seg('  ctx ', OG_PALETTE.terminalMuted),
  seg('━'.repeat(2), 'rgb(152,195,121)'),
  seg('━'.repeat(6), OG_PALETTE.terminalRule),
  seg(' 22%', 'rgb(152,195,121)'),
  seg('  5h ', OG_PALETTE.terminalMuted),
  seg('26%', 'rgb(229,192,123)'),
]

function transcriptRow(line: TranscriptLine): { text: string; color: string; fill?: string } {
  switch (line.kind) {
    case 'prompt':
      return { text: `❯ ${line.text}`, color: OG_PALETTE.foreground, fill: OG_PALETTE.terminalTurn }
    case 'tool':
      return { text: `● ${line.name}(${line.target})`, color: OG_PALETTE.terminalForeground }
    case 'result':
      return { text: `  ⎿  ${line.text}`, color: OG_PALETTE.terminalMuted }
    case 'say':
      return { text: `● ${line.lines.join('\n  ')}`, color: OG_PALETTE.terminalForeground }
    case 'note':
      return { text: line.text, color: OG_PALETTE.terminalMuted }
  }
}

const HOME_TERMINAL = { left: 620, top: 56, height: 534, padding: 8, overhang: 120 }
const HOME_TERMINAL_FONT_SIZE = 19
const STATUS_RING_INSET = 10
const STATUS_RING_GLOW_OPACITY = 0.35

/** `opacity` as the two hex digits that end an #rrggbbaa color. */
const alphaHex = (opacity: number) =>
  Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0')

function homeTerminal(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        position: 'absolute',
        boxSizing: 'border-box',
        left: HOME_TERMINAL.left,
        top: HOME_TERMINAL.top,
        width: CARD_WIDTH - HOME_TERMINAL.left + HOME_TERMINAL.overhang,
        height: HOME_TERMINAL.height,
        padding: HOME_TERMINAL.padding,
        borderRadius: 26,
        background: OG_PALETTE.card,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          flexGrow: 1,
          overflow: 'hidden',
          padding: '22px 26px',
          borderRadius: 19,
          background: OG_PALETTE.sunken,
          fontFamily: FONT,
          fontSize: HOME_TERMINAL_FONT_SIZE,
          lineHeight: 1.45,
          color: OG_PALETTE.terminalForeground,
        }}
      >
        {HERO_TRANSCRIPT.map(transcriptRow).map((row, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed transcript, ordered, with no ids.
            key={i}
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              whiteSpace: 'pre',
              color: row.color,
              background: row.fill,
            }}
          >
            {row.text}
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: 14,
            padding: '6px 0',
            borderTop: `1px solid ${OG_PALETTE.terminalRule}`,
            borderBottom: `1px solid ${OG_PALETTE.terminalRule}`,
          }}
        >
          <span style={{ color: OG_PALETTE.terminalMuted, whiteSpace: 'pre' }}>❯ </span>
          <div style={{ width: '0.6em', height: '1.1em', background: OG_PALETTE.foreground }} />
        </div>
        <div
          style={{
            display: 'flex',
            margin: `10px -${STATUS_RING_INSET}px 0`,
            padding: `4px ${STATUS_RING_INSET}px`,
            border: `1.5px solid ${OG_PALETTE.primary}`,
            borderRadius: 8,
            boxShadow: `0 0 24px ${OG_PALETTE.primary}${alphaHex(STATUS_RING_GLOW_OPACITY)}`,
          }}
        >
          {drawStatusLine(HOME_CARD_STATUS_LINE, HOME_TERMINAL_FONT_SIZE)}
        </div>
      </div>
    </div>
  )
}

export function homeCard(): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: '100%',
        height: '100%',
        background: OG_PALETTE.background,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 72,
          top: HOME_TERMINAL.top + HOME_TERMINAL.padding,
          width: 520,
          height: HOME_TERMINAL.height - 2 * HOME_TERMINAL.padding,
        }}
      >
        {drawWordmark(30)}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              maxWidth: 500,
              fontFamily: SANS_FONT,
              fontWeight: 600,
              fontSize: 76,
              lineHeight: 0.95,
              letterSpacing: '-0.04em',
              color: OG_PALETTE.foreground,
            }}
          >
            {HOME_HERO_HEADING}
          </div>
          <div
            style={{
              display: 'flex',
              maxWidth: 470,
              marginTop: 24,
              fontFamily: SANS_FONT,
              fontSize: 26,
              lineHeight: 1.3,
              letterSpacing: '-0.015em',
              color: OG_PALETTE.foreground,
            }}
          >
            {HERO_LEAD[0]}
          </div>
        </div>
      </div>
      {homeTerminal()}
    </div>
  )
}

// The detail card header's font sizes and line heights, and the space below its wordmark and above
// its byline. The title takes the line height and tracking of the site's page titles (--text-heading
// in app.css), the byline the home card lead's.
const HEADER = {
  wordmarkSize: 30,
  wordmarkGap: 18,
  titleSize: 60,
  titleLineHeight: 1,
  bylineGap: 12,
  bylineSize: 26,
  bylineLineHeight: 1.3,
}

function cardHeader(title: string, byline: string): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', marginBottom: HEADER.wordmarkGap }}>
        {drawWordmark(HEADER.wordmarkSize)}
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: SANS_FONT,
          fontWeight: 600,
          fontSize: HEADER.titleSize,
          lineHeight: HEADER.titleLineHeight,
          letterSpacing: '-0.04em',
          color: OG_PALETTE.foreground,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: SANS_FONT,
          fontSize: HEADER.bylineSize,
          lineHeight: HEADER.bylineLineHeight,
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
export const DETAIL_PADDING_Y = 60
const DETAIL_GAP = 30
const DETAIL_BODY_WIDTH = CARD_WIDTH - 2 * DETAIL_PADDING_X
const DETAIL_BODY_HEIGHT =
  CARD_HEIGHT -
  2 * DETAIL_PADDING_Y -
  DETAIL_GAP -
  (lineHeight(HEADER.wordmarkSize) +
    HEADER.wordmarkGap +
    lineHeight(HEADER.titleSize, HEADER.titleLineHeight) +
    HEADER.bylineGap +
    lineHeight(HEADER.bylineSize, HEADER.bylineLineHeight))

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

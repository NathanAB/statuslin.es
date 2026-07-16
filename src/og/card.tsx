import type { ReactElement } from 'react'
import { OG_PALETTE } from '@/og/palette'
import { orderByScenario } from '@/render/scenarios'
import type { AnsiSegment } from '@/render/types'

const FONT = 'StatuslineNerd'

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

// A status line: colored spans, stacked into one row per visual line (satori won't break on `\n`
// inside a flex row). fg is an ANSI 'rgb(...)' string or null (use foreground).
function drawStatusLine(segments: AnsiSegment[], fontSize: number): ReactElement {
  const lines = splitSegmentsIntoLines(segments)
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
        A community gallery of Claude Code status lines
      </div>
    </div>
  )
}

export function configCard(input: {
  title: string
  author: string | null
  previews: { scenarioKey: string; segments: AnsiSegment[] }[]
}): ReactElement {
  const rows = orderByScenario(input.previews).slice(0, 3)
  const byline = input.author
    ? `by ${input.author} · adapts to your session`
    : 'adapts to your session'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        gap: 30,
        background: OG_PALETTE.background,
        padding: '60px 72px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', marginBottom: 14 }}>{drawWordmark(30)}</div>
        <div
          style={{
            display: 'flex',
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: 54,
            color: OG_PALETTE.foreground,
          }}
        >
          {input.title}
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: FONT,
            fontSize: 24,
            color: OG_PALETTE.mutedForeground,
            marginTop: 10,
          }}
        >
          {byline}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
        {rows.map((p) => (
          <div key={p.scenarioKey} style={{ display: 'flex' }}>
            {well(drawStatusLine(p.segments, 19), '13px 20px')}
          </div>
        ))}
      </div>
    </div>
  )
}

import { describe, expect, it } from 'vitest'
import { terminalPlacement, writesInToolbar } from '@/mods/draw-placement'
import {
  DRAW_LOCATION_LABEL,
  describeFootprint,
  describeModFootprint,
  footprintRecorded,
} from '@/mods/footprint'

// filetree's real footprint, from the render spike (spike/results/summary.md).
const FILETREE = {
  events: [
    'classic.CwdChanged',
    'command.run{command=filetree}',
    'session.start',
    'tool.call{tool=Read}',
    'ui.focus{component=Pane, requestId=filetree}',
    'ui.render{component=Pane, requestId=filetree}',
  ],
  calls: [
    '$.clock.after',
    '$.fs.list',
    '$.fs.read',
    '$.process.run',
    '$.session.cwd',
    '$.state.get',
    '$.ui.open',
    '$.ui.resolve',
    '$.ui.toast',
  ],
}

describe('describeFootprint', () => {
  // The install panel tints the powers over the session, files, programs and network. The table
  // marks them, so rewording a phrase can't drop its tint.
  it('names which phrases are risks to weigh', () => {
    const { risks } = describeFootprint({
      events: ['tool.call'],
      calls: ['$.mcp.call', '$.fs.read', '$.command.run'],
    })
    expect(risks).toContain('calls MCP tools')
    expect(risks).toContain('runs slash commands')
    expect(risks).toContain('sees each tool call before it runs and can block or change it')
    expect(risks).not.toContain('reads files')
  })

  it('tells a recorded footprint from one that was never recorded', () => {
    expect(footprintRecorded({ events: [], calls: [] })).toBe(false)
    expect(footprintRecorded({ events: [], calls: ['$.fs.read'] })).toBe(true)
  })

  it('turns a real footprint into plain-words lines, most sensitive first', () => {
    expect(describeFootprint(FILETREE).phrases).toEqual([
      'runs programs',
      'reads files',
      'adds the /filetree command',
      'sees each Read tool call before it runs and can block or change it',
      'runs on a timer',
      'runs on Claude Code hooks, such as session start',
    ])
  })

  it('names each place the mod draws, once, in a fixed order', () => {
    const { draws } = describeFootprint({
      events: [
        'ui.render{component=PromptHint}',
        'ui.render{component=Pane, requestId=a}',
        'ui.render{component=AbovePrompt}',
        'ui.render{component=Spinner}',
        'ui.render{component=Pane, requestId=b}',
      ],
      calls: ['$.ui.status', '$.ui.toast', '$.ui.open'],
    })
    expect(draws.map((d) => DRAW_LOCATION_LABEL[d])).toEqual([
      'above the prompt',
      'under the prompt',
      'a pane',
      'a status entry',
      'a toast',
      'built-in rows',
    ])
  })

  it('shows an entry it does not know verbatim instead of dropping it', () => {
    const result = describeFootprint({
      events: ['session.start', 'weather.change{city=Oslo}'],
      calls: ['$.fs.read', '$.teleport.now'],
    })
    expect(result.phrases).toEqual(['reads files'])
    expect(result.unknown).toEqual(['weather.change{city=Oslo}', '$.teleport.now'])
  })

  it('says nothing about plumbing every mod uses', () => {
    const result = describeFootprint({
      events: ['session.start', 'turn.complete'],
      calls: ['$.state.get', '$.state.set', '$.ui.resolve', '$.ui.invalidate', '$.clock.now'],
    })
    expect(result).toEqual({ phrases: [], risks: [], unknown: [], draws: [] })
  })

  // flightdeck's hook only reads each message and after's rewrites one; neither adds any.
  it('says a session.append hook sees and can change messages, not that it adds them', () => {
    const { phrases } = describeFootprint({ events: ['session.append'], calls: [] })
    expect(phrases).toEqual(['sees each message added to the conversation and can change it'])
  })

  it('keeps a matcher it cannot read as plain words generic', () => {
    const { phrases } = describeFootprint({
      events: ['tool.call{tool=/"^mcp__skins__design$"/}', 'command.run'],
      calls: [],
    })
    expect(phrases).toEqual([
      'adds slash commands',
      'sees each tool call before it runs and can block or change it',
    ])
  })

  it("says a mod that calls $.tool.call runs Claude Code's tools, next to running programs", () => {
    const result = describeFootprint({
      events: [],
      calls: ['$.fs.read', '$.tool.call', '$.process.run'],
    })
    expect(result.unknown).toEqual([])
    expect(result.phrases).toEqual([
      'runs programs',
      "runs Claude Code's tools, such as Bash and Edit, which still pass the session's permission check",
      'reads files',
    ])
  })
})

describe('describeModFootprint', () => {
  const PLAIN = { events: ['ui.render{component=AbovePrompt}'], calls: [] }
  const PREVIEW = [{ text: 'row' }]

  it('is the terminal for a mod with a terminal preview', () => {
    expect(
      describeModFootprint({ footprint: PLAIN, preview: PREVIEW, desktop: null }).surfaces,
    ).toEqual(['terminal'])
  })

  it('leaves out the terminal for a mod that draws nothing there', () => {
    expect(describeModFootprint({ footprint: PLAIN, preview: [], desktop: null }).surfaces).toEqual(
      [],
    )
  })

  it('is Desktop alone for a mod whose only drawing is a Desktop shot', () => {
    expect(
      describeModFootprint({ footprint: PLAIN, preview: [], desktop: { kind: 'shot' } }).surfaces,
    ).toEqual(['desktop'])
  })

  it('leaves out Desktop without a Desktop shot, even when the footprint targets it', () => {
    const footprint = { events: ['ui.render{component=AbovePrompt, surface=desktop}'], calls: [] }
    expect(
      describeModFootprint({ footprint, preview: PREVIEW, desktop: { kind: 'nothing' } }).surfaces,
    ).toEqual(['terminal'])
  })

  it('carries the plain-words footprint alongside the surfaces', () => {
    const described = describeModFootprint({
      footprint: FILETREE,
      preview: PREVIEW,
      desktop: null,
    })
    expect(described).toMatchObject(describeFootprint(FILETREE))
  })
})

// Where the home hero's terminal draws a mod.
describe('terminalPlacement', () => {
  const at = (events: string[]) => terminalPlacement({ events, calls: [] })

  it('draws a prompt hint under the prompt, and everything else above it', () => {
    expect(at(['ui.render{component=PromptHint}'])).toBe('under-prompt')
    expect(at(['ui.render{component=AbovePrompt}'])).toBe('above-prompt')
    expect(at(['ui.render{component=AbovePrompt}', 'ui.render{component=PromptHint}'])).toBe(
      'above-prompt',
    )
    expect(at(['$.ui.open'])).toBe('above-prompt')
  })
})

// Desktop records a toolbar write by its pixels; a mod's footprint names it as the session-mode
// label or a status entry.
describe('writesInToolbar', () => {
  const writes = (events: string[]) => writesInToolbar({ events, calls: [] })

  it('counts the session-mode label and a status entry as toolbar writes, and nothing else', () => {
    expect(writes(['ui.render{component=SessionMode}'])).toBe(true)
    expect(writes(['$.ui.status'])).toBe(true)
    expect(writes(['ui.render{component=AbovePrompt}', '$.ui.open'])).toBe(false)
  })
})

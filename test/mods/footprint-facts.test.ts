import { describe, expect, it } from 'vitest'
import { footprintFacts } from '@/mods/footprint-facts'

const NONE = { events: [], calls: [] }

describe('footprintFacts', () => {
  it('finds nothing in a footprint of plumbing alone', () => {
    expect(
      footprintFacts({
        events: ['session.start', 'turn.complete', 'ui.render{component=AbovePrompt}'],
        calls: ['$.session.usage', '$.ui.resolve', '$.fs.read', '$.store.set'],
      }),
    ).toEqual({
      commands: null,
      callsModel: false,
      writesFiles: false,
      usesNetwork: false,
      runsPrograms: false,
    })
  })

  it('names each slash command the validator recorded, alternatives included', () => {
    expect(
      footprintFacts({
        events: [
          'command.run{command=reflect-queue}',
          'command.run{command=rec|recording}',
          'command.run{command=reflect-queue}',
        ],
        calls: ['$.command.register'],
      }).commands,
    ).toEqual({ names: ['reflect-queue', 'rec', 'recording'], unnamed: false })
  })

  it('says a command has no recorded name when its matcher is not a plain name', () => {
    expect(
      footprintFacts({
        events: ['command.run{command=/^re/}', 'command.run{command=x}'],
        calls: [],
      }).commands,
    ).toEqual({ names: ['x'], unnamed: true })
    expect(footprintFacts({ events: ['command.run'], calls: [] }).commands).toEqual({
      names: [],
      unnamed: true,
    })
  })

  it('counts a registered command without a handler event as one with no recorded name', () => {
    expect(footprintFacts({ events: [], calls: ['$.command.register'] }).commands).toEqual({
      names: [],
      unnamed: true,
    })
  })

  it('does not count running other slash commands as adding one', () => {
    expect(footprintFacts({ events: [], calls: ['$.command.run'] }).commands).toBeNull()
  })

  it('reads model calls, file writes, network and programs from their API calls', () => {
    expect(footprintFacts({ ...NONE, calls: ['$.model.complete'] }).callsModel).toBe(true)
    expect(footprintFacts({ ...NONE, calls: ['$.fs.write'] }).writesFiles).toBe(true)
    expect(footprintFacts({ ...NONE, calls: ['$.http.fetch'] }).usesNetwork).toBe(true)
    expect(footprintFacts({ ...NONE, calls: ['$.process.run'] }).runsPrograms).toBe(true)
    expect(footprintFacts({ ...NONE, calls: ['$.process.spawn'] }).runsPrograms).toBe(true)
  })

  // The footprint records the call, not which tool it names, and Bash, Edit and Write are all one call away.
  it('counts calling a Claude Code tool as both running programs and changing files', () => {
    expect(footprintFacts({ ...NONE, calls: ['$.tool.call'] })).toMatchObject({
      runsPrograms: true,
      writesFiles: true,
    })
  })

  it('treats a file call it does not know as a possible write, never as a read', () => {
    expect(footprintFacts({ ...NONE, calls: ['$.fs.remove'] }).writesFiles).toBe(true)
    expect(
      footprintFacts({ ...NONE, calls: ['$.fs.read', '$.fs.list', '$.fs.exists', '$.fs.stat'] })
        .writesFiles,
    ).toBe(false)
  })
})

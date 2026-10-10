import { describe, expect, it } from 'vitest'
import { frameShot, readLayout } from '@/render/mods/desktop/framing'
import {
  CONTENT,
  PANE,
  PANE_BORDER_GREY,
  PROMPT_BORDER_GREY,
  PROMPT_BOX,
} from '@/render/mods/desktop/screen'

const BAND = { x: 166, y: 515, width: 768, height: 40 }

describe('frameShot with no pane open', () => {
  it('finds nothing when the shot matches the baseline', () => {
    expect(frameShot({ changed: null, paneOpen: false, draws: ['above-prompt'] })).toEqual({
      kind: 'nothing',
    })
  })

  it('crops the chat column from the topmost change down through the toolbar', () => {
    expect(frameShot({ changed: BAND, paneOpen: false, draws: ['above-prompt'] })).toEqual({
      kind: 'crop',
      rect: { x: 158, y: 507, width: 784, height: CONTENT.bottom - 507 },
      cardAnchor: 'bottom',
    })
  })

  it('keeps the prompt box when the only change is below it', () => {
    const toolbar = { x: 600, y: 610, width: 120, height: 16 }

    const frame = frameShot({ changed: toolbar, paneOpen: false, draws: ['status-entry'] })

    expect(frame).toMatchObject({ kind: 'crop', rect: { y: PROMPT_BOX.y - 8 } })
  })

  it('widens the crop to a change outside the chat column, such as a toast', () => {
    const toast = { x: 704, y: 471, width: 392, height: 96 }

    const frame = frameShot({ changed: toast, paneOpen: false, draws: ['toast'] })

    expect(frame).toEqual({
      kind: 'crop',
      rect: { x: 158, y: 463, width: CONTENT.right - 158, height: CONTENT.bottom - 463 },
      cardAnchor: 'bottom',
    })
  })

  it('never crops past the window content', () => {
    const everything = { x: 0, y: 0, width: 1100, height: 640 }

    const frame = frameShot({ changed: everything, paneOpen: false, draws: ['built-in-rows'] })

    expect(frame).toMatchObject({
      rect: {
        x: CONTENT.left,
        y: CONTENT.top,
        width: CONTENT.right - CONTENT.left,
        height: CONTENT.bottom - CONTENT.top,
      },
    })
  })
})

describe('frameShot with a pane open', () => {
  it('crops just the pane when the mod draws only there', () => {
    expect(frameShot({ changed: BAND, paneOpen: true, draws: ['pane'] })).toEqual({
      kind: 'crop',
      rect: { x: PANE.x - 4, y: PANE.y - 4, width: PANE.width + 8, height: PANE.height + 8 },
      cardAnchor: 'top',
    })
  })

  it('crops the chat column and the pane together when the mod also draws elsewhere', () => {
    expect(frameShot({ changed: BAND, paneOpen: true, draws: ['pane', 'toast'] })).toEqual({
      kind: 'crop',
      rect: { x: 37, y: 40, width: 1092 - 37, height: CONTENT.bottom - 40 },
      cardAnchor: 'top',
    })
  })

  it('crops both when the footprint does not say where the mod draws', () => {
    const frame = frameShot({ changed: null, paneOpen: true, draws: [] })

    expect(frame).toMatchObject({ kind: 'crop', rect: { x: 37, width: 1055 } })
  })
})

const grey = (mean: number, deviation = 0) => ({ mean, deviation })
const BACKGROUND = 20 / 255

describe('readLayout', () => {
  it('sees the chat column alone when the prompt box border is where it is with no pane', () => {
    const layout = readLayout({
      prompt: grey(PROMPT_BORDER_GREY),
      promptBesidePane: grey(BACKGROUND),
      pane: grey(0.3, 0.2),
    })

    expect(layout).toBe('chat')
  })

  it('sees a pane when its border and the narrowed prompt box border are both there', () => {
    const layout = readLayout({
      prompt: grey(0.1, 0.05),
      promptBesidePane: grey(PROMPT_BORDER_GREY),
      pane: grey(PANE_BORDER_GREY),
    })

    expect(layout).toBe('pane')
  })

  it('refuses a shot that matches neither layout, as after a Desktop upgrade', () => {
    const shot = { prompt: grey(BACKGROUND), promptBesidePane: grey(BACKGROUND), pane: grey(0) }

    expect(() => readLayout(shot)).toThrow(/screen\.ts/)
  })

  it('does not take a textured column for a border', () => {
    const shot = {
      prompt: grey(PROMPT_BORDER_GREY, 0.1),
      promptBesidePane: grey(PROMPT_BORDER_GREY, 0.1),
      pane: grey(PANE_BORDER_GREY, 0.1),
    }

    expect(() => readLayout(shot)).toThrow(/screen\.ts/)
  })
})

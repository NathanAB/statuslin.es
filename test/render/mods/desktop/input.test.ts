import { describe, expect, it } from 'vitest'
import { clickCommand, keyCommand, moveCommand, typeFileCommand } from '@/render/mods/desktop/input'

describe('input commands', () => {
  it('click and move at device scale', () => {
    expect(clickCommand({ x: 550, y: 408 })).toBe('xdotool mousemove 1100 816 click 1')
    expect(moveCommand({ x: 1099, y: 320 })).toBe('xdotool mousemove 2198 640')
  })

  it('press named keys', () => {
    expect(keyCommand('ctrl+b')).toBe('xdotool key ctrl+b')
  })

  it('type a file, so step text never passes through the shell', () => {
    expect(typeFileCommand('/home/user/.statuslines/step.txt')).toBe(
      'xdotool type --delay 40 --file /home/user/.statuslines/step.txt',
    )
  })
})

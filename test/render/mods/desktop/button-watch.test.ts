import { describe, expect, it } from 'vitest'
import { type ButtonWatch, startWatch, watchButton } from '@/render/mods/desktop/button-watch'

const OPTIONS = { stableMs: 1500, goneMs: 3000 }

/** Feeds one visibility sample every 250 ms and returns the actions taken. */
function run(samples: boolean[]): string[] {
  let watch: ButtonWatch = startWatch()
  return samples.map((visible, i) => {
    const step = watchButton(watch, visible, i * 250, OPTIONS)
    watch = step.watch
    return step.action
  })
}

const on = (n: number) => Array<boolean>(n).fill(true)
const off = (n: number) => Array<boolean>(n).fill(false)

describe('watchButton', () => {
  it('clicks a button once it has stayed on screen for the stable time', () => {
    const actions = run(on(8))

    expect(actions.indexOf('click')).toBe(6)
    expect(actions.filter((a) => a === 'click')).toHaveLength(1)
  })

  it('does not click a button that flickers on during a page load', () => {
    expect(run([...on(4), ...off(2), ...on(4)])).not.toContain('click')
  })

  it('is done once the clicked button has stayed gone for the gone time', () => {
    const actions = run([...on(7), ...off(13)])

    expect(actions.at(-1)).toBe('done')
    expect(actions.slice(7, -1)).not.toContain('done')
  })

  it('clicks again when the button comes back, as after a reload that dropped the click', () => {
    const actions = run([...on(7), ...off(4), ...on(7)])

    expect(actions.filter((a) => a === 'click')).toHaveLength(2)
  })

  it('is never done before a click, however long the button is absent', () => {
    expect(run(off(40))).not.toContain('done')
  })
})

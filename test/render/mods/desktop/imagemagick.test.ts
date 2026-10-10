import { describe, expect, it } from 'vitest'
import {
  changedBoxCommand,
  cropCommand,
  parseChangedBox,
  parseProbes,
  probeCommand,
  quietScreenCommand,
} from '@/render/mods/desktop/imagemagick'

describe('probeCommand', () => {
  it('screenshots once, then reads each region of that shot at device scale', () => {
    const command = probeCommand('/tmp/probe.png', [
      { x: 10, y: 20, width: 30, height: 4 },
      { x: 0, y: 0, width: 1, height: 1 },
    ])

    expect(command).toBe(
      [
        'import -window root -strip /tmp/probe.png',
        "convert /tmp/probe.png -crop 60x8+20+40 +repage -colorspace Gray -format '%[fx:mean] %[fx:standard_deviation]\\n' info:",
        "convert /tmp/probe.png -crop 2x2+0+0 +repage -colorspace Gray -format '%[fx:mean] %[fx:standard_deviation]\\n' info:",
      ].join(' && '),
    )
  })

  it('reads an existing shot without taking a new one', () => {
    const command = probeCommand('/tmp/final.png', [{ x: 1, y: 2, width: 3, height: 4 }], {
      capture: false,
    })

    expect(command).not.toContain('import')
    expect(command).toContain('convert /tmp/final.png -crop 6x8+2+4')
  })
})

describe('parseProbes', () => {
  it('reads one mean and deviation per region', () => {
    expect(parseProbes('0.857432 0.12\n0.0784314 0\n', 2)).toEqual([
      { mean: 0.857432, deviation: 0.12 },
      { mean: 0.0784314, deviation: 0 },
    ])
  })

  it('reads ImageMagick exponent notation', () => {
    expect(parseProbes('1.5e-05 0\n', 1)).toEqual([{ mean: 0.000015, deviation: 0 }])
  })

  it.each([
    ['too few lines', '0.5 0\n', 2],
    ['a stray word', '0.5 0 rm\n', 1],
    ['a value past 1', '1.5 0\n', 1],
    ['nothing', '', 1],
  ])('refuses %s', (_name, stdout, count) => {
    expect(() => parseProbes(stdout, count)).toThrow(/probe/)
  })
})

describe('changedBoxCommand', () => {
  it('compares the shots with the prompt text blanked, padded so the trim box is never empty', () => {
    expect(
      changedBoxCommand('/tmp/baseline.png', '/tmp/final.png', {
        x: 168,
        y: 563,
        width: 764,
        height: 36,
      }),
    ).toBe(
      "convert /tmp/baseline.png /tmp/final.png -compose difference -composite -compose over -fill black -draw 'rectangle 336,1126 1863,1197' -colorspace Gray -threshold 0 -bordercolor black -border 1 -format '%[fx:maxima] %@' info:",
    )
  })
})

describe('parseChangedBox', () => {
  it('is null when nothing differs', () => {
    expect(parseChangedBox('0 0x0+2202+1282')).toBeNull()
  })

  it('takes off the padding and rounds outward to CSS pixels', () => {
    expect(parseChangedBox('1 1536x80+333+1031')).toEqual({
      x: 166,
      y: 515,
      width: 768,
      height: 40,
    })
    expect(parseChangedBox('1 3x3+2+2')).toEqual({ x: 0, y: 0, width: 2, height: 2 })
  })

  it.each([
    ['garbage', 'convert: unable to open image'],
    ['a negative offset', '1 10x10+-5+3'],
    ['a fractional maximum', '0.5 10x10+5+3'],
  ])('refuses %s', (_name, stdout) => {
    expect(() => parseChangedBox(stdout)).toThrow(/comparison/)
  })
})

describe('cropCommand', () => {
  it('crops at device scale and strips metadata so the bytes are stable', () => {
    expect(
      cropCommand('/tmp/final.png', { x: 158, y: 507, width: 784, height: 129 }, '/tmp/crop.png'),
    ).toBe('convert /tmp/final.png -crop 1568x258+316+1014 +repage -strip /tmp/crop.png')
  })
})

describe('quietScreenCommand', () => {
  it('stops once the screen has not changed for the quiet time, or at the limit', () => {
    const command = quietScreenCommand('/tmp/quiet.png', {
      quietMs: 2000,
      maxMs: 10_000,
      pollMs: 500,
    })

    expect(command).toContain('for i in $(seq 1 20)')
    expect(command).toContain('import -window root -strip /tmp/quiet.png')
    expect(command).toContain('test $same -ge 4 && exit 0')
  })
})

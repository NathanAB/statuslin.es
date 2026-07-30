// A minimal sfnt `cmap` reader used by the OG font-coverage test. satori draws a tofu box for any
// codepoint absent from the fonts it's given, so the test needs to answer "does this font actually
// map this codepoint to a glyph?" — which is exactly what the `cmap` table encodes. We decode the
// two Unicode subtable formats every font we ship uses: format 4 (BMP segment mapping) and format 12
// (full-Unicode segmented coverage), on the Unicode (platform 0) and Windows (platform 3) platforms,
// and union them. Non-Unicode Mac subtables (format 0/6) and variation-sequence subtables (format 14)
// are skipped — they never decide base-glyph coverage. This mirrors what satori/opentype.js reads to
// pick a glyph, so agreement here means "renders a real glyph, not tofu" (the visual proof confirms it).

function toDataView(data: ArrayBuffer | Uint8Array): DataView {
  return data instanceof Uint8Array
    ? new DataView(data.buffer, data.byteOffset, data.byteLength)
    : new DataView(data)
}

function tagAt(dv: DataView, off: number): string {
  return String.fromCharCode(
    dv.getUint8(off),
    dv.getUint8(off + 1),
    dv.getUint8(off + 2),
    dv.getUint8(off + 3),
  )
}

function tableOffset(dv: DataView, tag: string): number {
  const numTables = dv.getUint16(4)
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (tagAt(dv, rec) === tag) return dv.getUint32(rec + 8)
  }
  throw new Error(`font table ${tag} not found`)
}

function readFormat4(dv: DataView, off: number, out: Set<number>): void {
  const segCount = dv.getUint16(off + 6) / 2
  const endOff = off + 14
  const startOff = endOff + segCount * 2 + 2 // +2 skips the reservedPad after endCodes
  const deltaOff = startOff + segCount * 2
  const rangeOff = deltaOff + segCount * 2
  for (let s = 0; s < segCount; s++) {
    const end = dv.getUint16(endOff + s * 2)
    const start = dv.getUint16(startOff + s * 2)
    if (start === 0xffff) continue // the required terminating segment
    const delta = dv.getInt16(deltaOff + s * 2)
    const rangeOffset = dv.getUint16(rangeOff + s * 2)
    for (let c = start; c <= end; c++) {
      let glyph: number
      if (rangeOffset === 0) {
        glyph = (c + delta) & 0xffff
      } else {
        // glyphIdArray address is relative to the idRangeOffset entry itself.
        const gOff = rangeOff + s * 2 + rangeOffset + (c - start) * 2
        glyph = dv.getUint16(gOff)
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff
      }
      if (glyph !== 0) out.add(c)
    }
  }
}

function readFormat12(dv: DataView, off: number, out: Set<number>): void {
  const nGroups = dv.getUint32(off + 12)
  for (let i = 0; i < nGroups; i++) {
    const g = off + 16 + i * 12
    const startChar = dv.getUint32(g)
    const endChar = dv.getUint32(g + 4)
    // Every group maps to real glyph ids (startGlyphID onward), so the whole range is covered.
    for (let c = startChar; c <= endChar; c++) out.add(c)
  }
}

/** The set of Unicode codepoints the font maps to a glyph, decoded from its `cmap`. */
export function fontCmapCodepoints(data: ArrayBuffer | Uint8Array): Set<number> {
  const dv = toDataView(data)
  const numTables = dv.getUint16(4)
  let cmapOff = -1
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16
    if (tagAt(dv, rec) === 'cmap') {
      cmapOff = dv.getUint32(rec + 8)
      break
    }
  }
  const out = new Set<number>()
  if (cmapOff < 0) return out
  const numSub = dv.getUint16(cmapOff + 2)
  for (let i = 0; i < numSub; i++) {
    const rec = cmapOff + 4 + i * 8
    const platformID = dv.getUint16(rec)
    if (platformID !== 0 && platformID !== 3) continue // Unicode / Windows platforms only
    const subOff = cmapOff + dv.getUint32(rec + 4)
    const format = dv.getUint16(subOff)
    if (format === 4) readFormat4(dv, subOff, out)
    else if (format === 12) readFormat12(dv, subOff, out)
  }
  return out
}

/** True if at least one of the fonts covers `cp`. */
export function anyFontCovers(fontSets: Set<number>[], cp: number): boolean {
  return fontSets.some((s) => s.has(cp))
}

function glyphIdFromFormat4(dv: DataView, off: number, cp: number): number {
  if (cp > 0xffff) return 0
  const segCount = dv.getUint16(off + 6) / 2
  const endOff = off + 14
  const startOff = endOff + segCount * 2 + 2
  const deltaOff = startOff + segCount * 2
  const rangeOff = deltaOff + segCount * 2
  for (let s = 0; s < segCount; s++) {
    const end = dv.getUint16(endOff + s * 2)
    const start = dv.getUint16(startOff + s * 2)
    if (cp < start || cp > end) continue
    const delta = dv.getInt16(deltaOff + s * 2)
    const rangeOffset = dv.getUint16(rangeOff + s * 2)
    if (rangeOffset === 0) return (cp + delta) & 0xffff
    const glyphOff = rangeOff + s * 2 + rangeOffset + (cp - start) * 2
    const glyph = dv.getUint16(glyphOff)
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff
  }
  return 0
}

function glyphIdFromFormat12(dv: DataView, off: number, cp: number): number {
  const nGroups = dv.getUint32(off + 12)
  for (let i = 0; i < nGroups; i++) {
    const group = off + 16 + i * 12
    const start = dv.getUint32(group)
    const end = dv.getUint32(group + 4)
    if (cp >= start && cp <= end) return dv.getUint32(group + 8) + cp - start
  }
  return 0
}

function fontGlyphId(dv: DataView, cp: number): number {
  const cmapOff = tableOffset(dv, 'cmap')
  const numSubtables = dv.getUint16(cmapOff + 2)
  let bmpGlyph = 0
  for (let i = 0; i < numSubtables; i++) {
    const record = cmapOff + 4 + i * 8
    const platformId = dv.getUint16(record)
    if (platformId !== 0 && platformId !== 3) continue
    const subtable = cmapOff + dv.getUint32(record + 4)
    const format = dv.getUint16(subtable)
    if (format === 12) {
      const glyph = glyphIdFromFormat12(dv, subtable, cp)
      if (glyph !== 0) return glyph
    } else if (format === 4 && bmpGlyph === 0) {
      bmpGlyph = glyphIdFromFormat4(dv, subtable, cp)
    }
  }
  return bmpGlyph
}

/** The glyph's horizontal advance as a fraction of one em. */
export function fontGlyphAdvanceEm(data: ArrayBuffer | Uint8Array, cp: number): number {
  const dv = toDataView(data)
  const glyphId = fontGlyphId(dv, cp)
  if (glyphId === 0) throw new Error(`font does not cover U+${cp.toString(16).toUpperCase()}`)
  const unitsPerEm = dv.getUint16(tableOffset(dv, 'head') + 18)
  const numberOfHMetrics = dv.getUint16(tableOffset(dv, 'hhea') + 34)
  const metricIndex = Math.min(glyphId, numberOfHMetrics - 1)
  const advanceWidth = dv.getUint16(tableOffset(dv, 'hmtx') + metricIndex * 4)
  return advanceWidth / unitsPerEm
}

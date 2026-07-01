import { Resvg } from '@resvg/resvg-js'
import type { ReactElement } from 'react'
import satori from 'satori'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'
import { loadEmojiAsset, loadOgFonts } from '@/og/font'

/** satori(element) -> SVG, then resvg -> PNG. resvg needs no fonts: satori embeds text as vector
 * paths, so resvg only rasterizes finished shapes. */
export async function toElementPng(
  element: ReactElement,
  opts: { width?: number; height?: number } = {},
): Promise<Uint8Array> {
  const width = opts.width ?? CARD_WIDTH
  const height = opts.height ?? CARD_HEIGHT
  const svg = await satori(element, {
    width,
    height,
    fonts: loadOgFonts(),
    // satori's published types omit null from loadAdditionalAsset's return type, but the runtime
    // and README both document null as the documented "no asset / skip" value.
    loadAdditionalAsset: loadEmojiAsset as (code: string, segment: string) => Promise<string>,
  })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
  return new Uint8Array(png)
}

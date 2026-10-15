import { Resvg } from '@resvg/resvg-js'
import type { ReactElement } from 'react'
import satori from 'satori'
import { CARD_HEIGHT, CARD_WIDTH } from '@/og/dimensions'
import { createEmojiLoader, loadOgFonts } from '@/og/font'

/** The satori options every card renders with: its size, the embedded fonts, and emoji. Call it
 * once per render: each call gets its own emoji loader, so the per-render fetch cap holds. */
export function cardSatoriOptions(opts: { width?: number; height?: number } = {}) {
  return {
    width: opts.width ?? CARD_WIDTH,
    height: opts.height ?? CARD_HEIGHT,
    fonts: loadOgFonts(),
    // satori's published types omit null from loadAdditionalAsset's return type, but the runtime
    // and README both document null as the documented "no asset / skip" value.
    loadAdditionalAsset: createEmojiLoader() as (code: string, segment: string) => Promise<string>,
  }
}

/** satori(element) -> SVG, then resvg -> PNG. resvg needs no fonts: satori embeds text as vector
 * paths, so resvg only rasterizes finished shapes. */
export async function toElementPng(
  element: ReactElement,
  opts: { width?: number; height?: number } = {},
): Promise<Uint8Array> {
  const options = cardSatoriOptions(opts)
  const svg = await satori(element, options)
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: options.width } }).render().asPng()
  return new Uint8Array(png)
}

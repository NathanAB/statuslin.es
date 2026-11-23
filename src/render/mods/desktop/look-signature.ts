import { pngInput, rectangle } from './imagemagick'
import type { Rect } from './screen'

/**
 * Prints a SHA-256 of the shot's pixels with `masks` painted black: the same for two shots that look
 * the same outside the masks.
 */
export function maskedSignatureCommand(path: string, masks: readonly Rect[]): string {
  return [
    `convert ${pngInput(path)} -fill black`,
    ...masks.map(rectangle),
    `-format '%#' info:`,
  ].join(' ')
}

const SIGNATURE = /^[0-9a-f]{64}$/

export function parseSignature(stdout: string): string {
  const signature = stdout.trim()
  if (!SIGNATURE.test(signature)) throw new Error('unreadable shot signature')
  return signature
}

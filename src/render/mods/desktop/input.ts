import { type Point, SCALE } from './screen'

/** xdotool commands for the virtual display; the sandbox runs them with DISPLAY set. */

/** Between typed keys, so Desktop's prompt box keeps up with every character. */
const TYPE_DELAY_MS = 40

const at = ({ x, y }: Point) => `${x * SCALE} ${y * SCALE}`

export const clickCommand = (point: Point) => `xdotool mousemove ${at(point)} click 1`

export const moveCommand = (point: Point) => `xdotool mousemove ${at(point)}`

export const keyCommand = (keys: string) => `xdotool key ${keys}`

export const typeFileCommand = (path: string) =>
  `xdotool type --delay ${TYPE_DELAY_MS} --file ${path}`

/** How long typing `text` takes, for bounding the command that types it. */
export const typingMs = (text: string) => [...text].length * TYPE_DELAY_MS

import { SANDBOX_WORK_DIR } from '../mod-sandbox'
import type { AnalysisSandbox } from './desktop-sandbox'
import { frameShot, readLayout } from './framing'
import {
  changedBoxCommand,
  croppedPngCommand,
  parseChangedBox,
  parseProbes,
  parseRowProfile,
  parseRowSignatures,
  probeCommand,
  rowProfileCommand,
  rowSignatureCommand,
} from './imagemagick'
import { expectOk } from './interact'
import { checkedPixelPng } from './png'
import {
  bandAbovePrompt,
  keptRowCuts,
  promptTop,
  type RowCut,
  type RowProfile,
  type RowSignature,
  rowsNotInBaseline,
  userBubbleRows,
  wholeElements,
} from './rows'
import {
  BORDER_PROBES,
  CHAT_COLUMN,
  CONTENT,
  type Column,
  CROP_MARGIN,
  PANE_BODY,
  PANE_CHAT_COLUMN,
  PROMPT_TEXT,
  plateStrips,
  type Rect,
  SCALE,
  SCROLL_GUTTER,
  WINDOW,
} from './screen'
import type { DesktopImage, DesktopShot } from './types'

const SHOT = `${SANDBOX_WORK_DIR}/shot.png`
const BASELINE = `${SANDBOX_WORK_DIR}/baseline.png`

export interface ShotsToAnalyse {
  /** The mod session's full final shot, as printed by its sandbox. Untrusted. */
  shot: Uint8Array
  /** The no-mod session's full final shot, after the same input steps. */
  baseline: Uint8Array
  /**
   * The sessions typed input steps. Their turns show in both chats, but a slash command's differ
   * without the plugin, and no turn of theirs is the mod's drawing.
   */
  typedSteps: boolean
  /**
   * A step was a slash command, which Desktop colours in the user's message only when the plugin
   * that owns it is loaded: that message differs from the baseline's, though the mod drew nothing
   * in it. With no slash command a changed message is the mod's, such as one it redacts.
   */
  typedSlashCommand: boolean
}

export type Analysis =
  | { kind: 'nothing' }
  | ({ kind: 'shot' } & Pick<DesktopShot, 'png' | 'width' | 'height' | 'card'>)

async function layoutOf(analysis: AnalysisSandbox, path: string): Promise<'chat' | 'pane'> {
  const regions = [BORDER_PROBES.prompt, BORDER_PROBES.promptBesidePane, BORDER_PROBES.pane]
  const command = probeCommand(path, regions, { capture: false })
  const { stdout } = expectOk(await analysis.run(command), 'reading the layout')
  const [prompt, promptBesidePane, pane] = parseProbes(stdout, regions.length)
  if (!prompt || !promptBesidePane || !pane) throw new Error('missing layout probes')
  return readLayout({ prompt, promptBesidePane, pane })
}

async function rowProfile(
  analysis: AnalysisSandbox,
  columns: Column[],
  path = SHOT,
): Promise<RowProfile> {
  const { stdout } = expectOk(
    await analysis.run(rowProfileCommand(path, columns)),
    'reading the shot row by row',
  )
  return parseRowProfile(stdout, WINDOW.height)
}

async function changedBox(analysis: AnalysisSandbox, masks: Rect[] = []): Promise<Rect | null> {
  const compare = changedBoxCommand(BASELINE, SHOT, [PROMPT_TEXT, SCROLL_GUTTER, ...masks])
  return parseChangedBox(
    expectOk(await analysis.run(compare), 'comparing with the baseline').stdout,
  )
}

/** Where the chat ends: at the band's top, or at the prompt box when there is no band. */
function chatBottom(plate: RowProfile): number {
  const top = promptTop(plate)
  return bandAbovePrompt(plate, top)?.top ?? top
}

/**
 * The chat column above the chat's bottom: where the input steps' own turns show (each step's
 * message, and the reply or spinner it leaves). Widened by the crop margin, as a reply's
 * antialiased first glyph reaches past the column's edge.
 */
function stepTurns(plate: RowProfile): Rect {
  const bottom = chatBottom(plate)
  return {
    x: CHAT_COLUMN.x - CROP_MARGIN,
    y: CONTENT.top,
    width: CHAT_COLUMN.width + 2 * CROP_MARGIN,
    height: bottom - CONTENT.top,
  }
}

/**
 * The crop with `cuts` left out, re-encoded from its pixels alone and checked to hold nothing
 * else.
 */
async function cropped(
  analysis: AnalysisSandbox,
  rect: Rect,
  cuts: readonly RowCut[] = [],
): Promise<DesktopImage> {
  const height = rect.height - cuts.reduce((rows, cut) => rows + cut.rows, 0)
  const png = checkedPixelPng(await analysis.readPng(croppedPngCommand(SHOT, rect, cuts)), {
    width: rect.width * SCALE,
    height: height * SCALE,
  })
  return { png, width: rect.width, height }
}

/** Rows of a message the user sent, read across the chat column's plate strips. */
async function userBubbles(analysis: AnalysisSandbox, path: string): Promise<boolean[]> {
  const [left, right] = plateStrips(CHAT_COLUMN)
  if (!left || !right) throw new Error('the chat column has two plate strips')
  return userBubbleRows(
    await rowProfile(analysis, [left], path),
    await rowProfile(analysis, [right], path),
  )
}

/** Each row's signature across `rect`'s columns. */
async function rowSignatures(
  analysis: AnalysisSandbox,
  path: string,
  rect: Rect,
): Promise<RowSignature[]> {
  const { stdout } = expectOk(
    await analysis.run(rowSignatureCommand(path, { x: rect.x, width: rect.width })),
    'reading the row signatures',
  )
  return parseRowSignatures(stdout, WINDOW.height)
}

/** The shot's column and plate strips, read row by row. */
interface ShotRows {
  column: RowProfile
  plate: RowProfile
}

/**
 * The cuts that leave only what the mod drew in a chat crop, as the terminal crop keeps only rows
 * off the common subsequence: every row the baseline has too, though the mod's drawing pushed it
 * down, and, after a slash command, the user's own messages whole, as the baseline may complete a
 * command to another. A message is one only where the baseline has one at that height too, so
 * nothing the mod draws on the right is taken for one. Null when nothing is left.
 */
async function chatCuts(
  analysis: AnalysisSandbox,
  rect: Rect,
  { column, plate }: ShotRows,
  typedSlashCommand: boolean,
): Promise<RowCut[] | null> {
  const notInBaseline = rowsNotInBaseline(
    await rowSignatures(analysis, SHOT, rect),
    await rowSignatures(analysis, BASELINE, rect),
    chatBottom(plate),
  )
  const noMessages = notInBaseline.map(() => false)
  const shotMessages = typedSlashCommand ? await userBubbles(analysis, SHOT) : noMessages
  const baselineMessages = typedSlashCommand ? await userBubbles(analysis, BASELINE) : noMessages
  const messages = wholeElements(
    shotMessages.map((message, y) => message && Boolean(baselineMessages[y])),
    column,
  )
  const kept = notInBaseline.map((row, y) => row && !messages[y])
  return keptRowCuts(kept, rect.y, rect.y + rect.height)
}

/**
 * Frames a mod's final shot against the baseline in a fresh sandbox no mod code has run in, and
 * returns the page crop and the card crop, each re-encoded from its pixels alone.
 */
export async function analyseShot(
  analysis: AnalysisSandbox,
  { shot, baseline, typedSteps, typedSlashCommand }: ShotsToAnalyse,
): Promise<Analysis> {
  await analysis.writeFiles([
    { path: SHOT, data: shot },
    { path: BASELINE, data: baseline },
  ])
  if ((await layoutOf(analysis, BASELINE)) !== 'chat') throw new Error('the baseline shows a pane')
  const paneOpen = (await layoutOf(analysis, SHOT)) === 'pane'
  const changed = paneOpen ? null : await changedBox(analysis)
  if (!paneOpen && !changed) return { kind: 'nothing' }
  const column = paneOpen ? PANE_CHAT_COLUMN : CHAT_COLUMN
  const plate = await rowProfile(analysis, plateStrips(column))
  // The steps' turns are not the mod's drawing, so they cannot make a shot; a crop still shows them.
  if (!paneOpen && typedSteps && !(await changedBox(analysis, [stepTurns(plate)]))) {
    return { kind: 'nothing' }
  }
  const rows = await rowProfile(analysis, [column])
  const frame = frameShot({
    changed,
    paneOpen,
    rows,
    plate,
    ...(paneOpen && { pane: await rowProfile(analysis, [PANE_BODY]) }),
  })
  if (frame.kind === 'nothing') return { kind: 'nothing' }
  // A pane's crop is fixed, and the pane's rows never match the baseline, which has no pane.
  const cuts = paneOpen
    ? []
    : await chatCuts(analysis, frame.rect, { column: rows, plate }, typedSlashCommand)
  if (!cuts) return { kind: 'nothing' }
  const page = await cropped(analysis, frame.rect, cuts)
  return { kind: 'shot', ...page, card: await cropped(analysis, frame.card) }
}

import { footprintFacts } from '@/mods/footprint-facts'
import type { ModDetail } from '@/mods/queries'

/** "Bring Back Buddy", the issue that gathers the requests to restore /buddy. */
export const BUDDY_ISSUE_NUMBER = 45596
export const BUDDY_ISSUE_URL = `https://github.com/anthropics/claude-code/issues/${BUDDY_ISSUE_NUMBER}`

/**
 * The pet mods /guide/claude-code-buddy lists, in page order: the ones that live above the prompt
 * like buddy did first, then the pane pets, then Deck, whose pet is one part of a dashboard.
 * Familiar's terminal preview loses its sprite rows (drawn in background-colored spaces) to the
 * crop, so the two whose terminal previews show the whole pet lead.
 */
export const BUDDY_PET_MOD_SLUGS = [
  'pixipet',
  'pixel-cat',
  'familiar',
  'pets',
  'code-pet',
  'deck',
] as const

export interface SharedCommand {
  command: string
  /** The pets that add it, in page order. */
  titles: string[]
}

/** Each slash command more than one pet adds: installing two of those pets makes them clash. */
export function sharedCommands(pets: Pick<ModDetail, 'title' | 'footprint'>[]): SharedCommand[] {
  const byCommand = new Map<string, string[]>()
  for (const pet of pets) {
    for (const command of footprintFacts(pet.footprint).commands?.names ?? []) {
      byCommand.set(command, [...(byCommand.get(command) ?? []), pet.title])
    }
  }
  return [...byCommand]
    .filter(([, titles]) => titles.length > 1)
    .map(([command, titles]) => ({ command, titles }))
}

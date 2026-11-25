import {
  BUDDY_GUIDE_PATH,
  BUDDY_GUIDE_TITLE,
  DESKTOP_GUIDE_PATH,
  DESKTOP_GUIDE_TITLE_BASE,
  GUIDE_PATH,
  GUIDE_TITLE_BASE,
  HOW_IT_WORKS_PATH,
  HOW_IT_WORKS_TITLE,
  MOD_SAFETY_GUIDE_PATH,
  MOD_SAFETY_GUIDE_TITLE,
  NOT_SHOWING_GUIDE_PATH,
  NOT_SHOWING_GUIDE_TITLE,
  STATUS_LINES_VS_MODS_GUIDE_PATH,
  STATUS_LINES_VS_MODS_GUIDE_TITLE,
} from '@/lib/page-title'
import {
  GALLERY_JSON_PATH,
  MARKETPLACE_PATH,
  MODS_PATH,
  palettePath,
  THEMES_PATH,
} from '@/lib/site'

export type LlmsFacet = { slug: string; label: string }
/** A palette with its own themes page. */
export type LlmsPalette = { slug: string; name: string }

/** The title, summary and Browse links both files open with. */
export function siteBlocks(
  base: string,
  facets: LlmsFacet[],
  palettes: LlmsPalette[] = [],
): string[] {
  const blocks = [
    '# statuslin.es',
    '> A gallery of Claude Code mods, status lines included, and of Claude Code and Claude Desktop themes, each with a real preview. Install any of them with one copied prompt or command.',
    "Status lines are scripts whose output Claude Code shows under the prompt. The other mods are Claude Code plugins that draw in the terminal or in Claude Desktop's Code tab. Each entry shows its real output, rendered in a sandbox. A mod that draws only in Claude Desktop shows a screenshot instead. Themes come in two kinds. A terminal theme is a color file a plugin carries, picked with /theme in the terminal once the plugin is installed. A Desktop theme is a look a mod sets in Claude Desktop: it recolors the app and draws a background behind the chat, and draws nothing in the terminal. Each theme is shown as a real session recorded in it.",
    ['## Browse', '', ...corePageLinks(base)].join('\n'),
  ]
  if (facets.length > 0) {
    blocks.push(['## Browse by feature', '', ...facets.map((f) => facetLink(base, f))].join('\n'))
  }
  if (palettes.length > 0) {
    blocks.push(
      [
        '## Themes by palette',
        '',
        ...palettes.map(
          (p) =>
            `- [${p.name} themes](${base}${palettePath(p.slug)}): every published ${p.name} theme, each previewed in a real session`,
        ),
      ].join('\n'),
    )
  }
  return blocks
}

function corePageLinks(base: string): string[] {
  return [
    `- [Gallery](${base}/): every published mod, sorted by trending, newest, or most installed`,
    `- [Mods](${base}${MODS_PATH}): the plugin mods, ranked by installs`,
    `- [Themes](${base}${THEMES_PATH}): Claude Code and Claude Desktop themes, one card per theme, each previewed in a real session, with the plugin that carries it`,
    `- [Plugin marketplace](${base}${MARKETPLACE_PATH}): the published mods as a Claude Code plugin marketplace`,
    `- [Mod catalogue](${base}${GALLERY_JSON_PATH}): the reviewed mods as machine-readable JSON, with install counts and what each can reach`,
    `- [Submit](${base}/submit): send in a status line, or a mod by its GitHub link`,
    `- [${GUIDE_TITLE_BASE}](${base}${GUIDE_PATH}): the statusLine setting, the JSON a script receives, and a tested example`,
    `- [${NOT_SHOWING_GUIDE_TITLE}](${base}${NOT_SHOWING_GUIDE_PATH}): why a status line stays blank in the terminal, and the checks that fix it`,
    `- [${DESKTOP_GUIDE_TITLE_BASE}](${base}${DESKTOP_GUIDE_PATH}): why the Code tab skips status lines, and the plugin that shows them`,
    `- [${STATUS_LINES_VS_MODS_GUIDE_TITLE}](${base}${STATUS_LINES_VS_MODS_GUIDE_PATH}): where each one shows up, and when to pick which`,
    `- [${MOD_SAFETY_GUIDE_TITLE}](${base}${MOD_SAFETY_GUIDE_PATH}): what a mod can do, and how statuslin.es pins and reviews each one`,
    `- [${BUDDY_GUIDE_TITLE}](${base}${BUDDY_GUIDE_PATH}): what happened to /buddy, and pet mods that put a companion back, each with a real preview`,
    `- [Resources](${base}/resources): every way to customize Claude Code, with plugin marketplaces, status line tools, usage trackers and themes`,
    `- [${HOW_IT_WORKS_TITLE}](${base}${HOW_IT_WORKS_PATH}): how each mod and status line is pinned, run in a sandbox for its previews and reviewed, and what that can't promise`,
  ]
}

function facetLink(base: string, facet: LlmsFacet): string {
  return `- [${facet.label}](${base}/status-lines/${facet.slug})`
}

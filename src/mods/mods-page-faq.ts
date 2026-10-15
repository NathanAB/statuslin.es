import type { FaqEntry } from '@/lib/json-ld'
import { MOD_INSTALL_MIN_VERSION, modInstallCommands } from './install'

/** Stands in for a mod's name in the install command, which each mod page fills in. */
const MOD_NAME_PLACEHOLDER = '<mod>'

const MOD_SAFETY_QUESTION = 'Are Claude Code mods safe?'

/**
 * The /mods page's questions, shown on the page and marked up as FAQPage JSON-LD in the same
 * words. They answer the People Also Ask questions Google showed for mod searches on 2026-10-15.
 */
export function modsFaq(origin: string): FaqEntry[] {
  const [addMarketplace, installMod] = modInstallCommands(origin, MOD_NAME_PLACEHOLDER)
  return [
    {
      question: 'What is a Claude Code mod?',
      // The definition, what a mod can do and where it draws:
      // https://code.claude.com/docs/en/plugins/mods/overview. That page also lists the VS Code
      // extension, from extension 2.1.299 and only with feature flags, so this answer, like the
      // status lines vs mods guide, names only the terminal and Desktop.
      answer:
        "A plugin that changes how Claude Code looks and behaves. It can draw a pane or a band above the prompt, restyle the interface or add a slash command. Mods work in the terminal and in Claude Desktop's Code tab.",
    },
    {
      question: 'How do I install a mod from statuslin.es?',
      // The commands come from modInstallCommands (src/mods/install.ts), the same ones each mod
      // page shows. The new-session step and version floor: MOD_INSTALL_MIN_VERSION's sources.
      answer: `Copy the install prompt from the mod's page into Claude Code or Claude Desktop. It runs \`${addMarketplace}\` and \`${installMod}\`. Start a new session to load the mod. Mods need Claude Code ${MOD_INSTALL_MIN_VERSION} or later.`,
    },
    {
      question: 'How do I install a mod by hand?',
      // --plugin-dir for one session: https://code.claude.com/docs/en/plugins/mods/overview
      // ("Try a sample mod"). A plugin folder under ~/.claude/skills/ loads as <name>@skills-dir
      // with no install step: https://code.claude.com/docs/en/plugins/loading
      answer:
        "Clone the repository at the commit the mod's page links. Run `claude --plugin-dir <path>` on the folder that holds `.claude-plugin/plugin.json` to try it for one session, or save that folder under `~/.claude/skills/` to keep it.",
    },
    {
      question: 'How is a mod different from a status line?',
      answer:
        'A status line is a script whose output Claude Code prints under the prompt in the terminal. A mod runs inside Claude Code, so it can draw in more places and add commands. Claude Desktop shows mods but not status lines.',
    },
    {
      question: MOD_SAFETY_QUESTION,
      // Runs with your permissions, not sandboxed, and `claude plugin validate` lists what it
      // calls: https://code.claude.com/docs/en/plugins/mods/overview ("Decide whether to trust a
      // mod"). The review is SECURITY.md's, and the marketplace pins each entry's `sha` to the
      // reviewed commit (src/mods/marketplace.ts).
      answer:
        'A mod runs with your permissions and no sandbox, so it can read your files, run programs and use the network. A person reviews every mod listed here, and its install is pinned to the reviewed commit. Each mod page lists what it can touch, from `claude plugin validate`.',
    },
  ]
}

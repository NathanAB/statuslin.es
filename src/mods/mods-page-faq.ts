import type { FaqEntry } from '@/lib/json-ld'
import { MOD_INSTALL_MIN_VERSION, modInstallCommands } from './install'

/** Stands in for a mod's name in the install command, which each mod page fills in. */
const MOD_NAME_PLACEHOLDER = '<mod>'

const MOD_SAFETY_QUESTION = 'Are Claude Code mods safe?'

/**
 * The /mods page's questions, shown on the page and marked up as FAQPage JSON-LD in the same
 * words. They answer the People Also Ask questions Google showed for mod searches on 2026-10-15.
 * The safety answer comes last so the page's link to the safety guide sits right under it.
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
        "A mod is a plugin that changes how Claude Code looks and behaves. Its code runs inside Claude Code, so it can draw a pane or a band above the prompt, restyle parts of Claude Code's own interface, add a slash command or step into a tool call. Mods draw in the terminal and in the Code tab of Claude Desktop.",
    },
    {
      question: 'How do I install a mod from statuslin.es?',
      // The commands come from modInstallCommands (src/mods/install.ts), the same ones each mod
      // page shows. The new-session step and version floor: MOD_INSTALL_MIN_VERSION's sources.
      answer: `Open the mod's page and copy its install prompt into Claude Code or Claude Desktop. Claude then runs two commands in your shell: \`${addMarketplace}\` adds the statuslin.es marketplace, and \`${installMod}\` installs the mod. Start a new session to load it. Mods need Claude Code ${MOD_INSTALL_MIN_VERSION} or later.`,
    },
    {
      question: 'How do I install a mod by hand?',
      // --plugin-dir for one session: https://code.claude.com/docs/en/plugins/mods/overview
      // ("Try a sample mod"). A plugin folder under ~/.claude/skills/ loads as <name>@skills-dir
      // with no install step: https://code.claude.com/docs/en/plugins/loading
      answer:
        "Clone the mod's repository and check out the commit its page links. To try it for one session, start Claude Code with `claude --plugin-dir <path>`, pointing at the folder that holds `.claude-plugin/plugin.json`. To keep it, save that folder under `~/.claude/skills/`, and Claude Code loads it from the next session on.",
    },
    {
      question: 'How is a mod different from a status line?',
      answer:
        "A status line is a script that Claude Code runs and prints at the bottom of the terminal. A mod runs inside Claude Code, so it can draw in more places and add commands. Claude Desktop doesn't show status lines, but it does show mods.",
    },
    {
      question: MOD_SAFETY_QUESTION,
      // Runs with your permissions, not sandboxed, and `claude plugin validate` lists what it
      // calls: https://code.claude.com/docs/en/plugins/mods/overview ("Decide whether to trust a
      // mod"). The review is SECURITY.md's, and the marketplace pins each entry's `sha` to the
      // reviewed commit (src/mods/marketplace.ts).
      answer:
        "A mod runs inside Claude Code with your permissions and isn't sandboxed, so it can read and write your files, start programs and make network requests. A person reads every mod before it's listed here, and its install is pinned to the commit they read. Each mod page shows what it can touch, as reported by `claude plugin validate`. Read a mod's source before you install it.",
    },
  ]
}

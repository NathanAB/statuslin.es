import type { FaqEntry } from '@/lib/json-ld'

export const MOD_SAFETY_FAQ: FaqEntry[] = [
  {
    question: 'Are Claude Code mods sandboxed?',
    answer:
      "No. A mod runs inside Claude Code with your permissions, and its file and process calls don't ask first. A program it starts runs outside Claude Code's Bash sandbox.",
  },
  {
    question: 'Does a statuslin.es preview mean a mod is safe?',
    answer:
      'No. statuslin.es records each preview by running the mod in a sandbox. That run shows what the mod draws. It does not check what the mod would do on your machine.',
  },
  {
    question: 'Can my organization limit which mods run?',
    answer:
      "Yes. Claude Code's admin settings include `allowManagedModsOnly`, `strictKnownMarketplaces` and `disableAllHooks`. Anthropic's mods admin docs describe each one.",
  },
]

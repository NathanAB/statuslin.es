# Recheck the guides against Anthropic's docs

The guides and /resources state facts about Claude Code that change with its releases. Nothing
tests them against Anthropic's docs, so recheck them by hand: once a month, and whenever the
[changelog](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md) mentions
the status line, mods, plugins, hooks or Claude Desktop. Read each docs page as Markdown by adding
`.md` to its URL. When a claim changes, fix every place it appears, then bump that page's
`*_DATES.modified` in `src/lib/page-title.ts` to the day the change goes live.

Last full check: 2026-10-21.

| Claim | Where it appears | Check it against |
| --- | --- | --- |
| The `statusLine` setting and every stdin field (names, nesting, when one is null or missing) | `src/guide/examples.ts`, `src/guide/guide-steps.tsx`, `src/render/scenarios.ts` (the previews) | [statusline](https://code.claude.com/docs/en/statusline): diff its field list against ours |
| What blanks or narrows a status line: workspace trust, `disableAllHooks` (managed turns it off entirely, unmanaged narrows it), `allowManagedHooksOnly`, `--safe-mode` | `src/guide/status-line-not-showing-content.tsx`, `src/guide/fix-prompt.ts`, `src/guide/status-line-not-showing-faq.ts` | [settings-reference](https://code.claude.com/docs/en/settings-reference), "Status line and file suggestion gates"; statusline, "Troubleshooting" |
| Claude Desktop's Code tab doesn't run `statusLine`. No Anthropic page says so; it holds because the Code tab draws nothing for it | `src/guide/desktop-guide-content.tsx`, `DESKTOP_GUIDE_DESCRIPTION`, the vs-mods table, `NOT_SHOWING_FAQ`, `src/lib/statusline-anywhere.ts` | [desktop](https://code.claude.com/docs/en/desktop) and statusline for any mention; the changelog for "status line" with "Desktop". If Desktop ever draws it natively, the Desktop guide stops recommending statusline-anywhere |
| Where mods draw (terminal, Desktop's Code tab, the VS Code extension from 2.1.299) and the version mods need (`MOD_INSTALL_MIN_VERSION`; Desktop needs one version less) | `src/guide/status-lines-vs-mods-content.tsx`, `src/resources/surfaces.ts`, the /mods FAQ | [mods overview](https://code.claude.com/docs/en/plugins/mods/overview), "Where mods run" |
| `/buddy` came in 2.1.89; users report it gone since 2.1.97, with no changelog entry | `src/guide/buddy-guide-content.tsx`, `src/guide/buddy-faq.ts`, `BUDDY_GUIDE_DESCRIPTION` | `grep -n -i buddy` the changelog; `gh issue view 45596 --repo anthropics/claude-code` |
| What a mod can reach, what `claude plugin validate` reports, and what managed settings stop | `src/guide/mod-safety-content.tsx`, `src/guide/mod-safety-faq.ts`, `src/how-it-works/how-it-works-content.tsx` | mods overview, [mods admin](https://code.claude.com/docs/en/plugins/mods/admin) and [mods reference](https://code.claude.com/docs/en/plugins/mods/reference) |
| The eight ways to customize: each one's line and docs link | `src/resources/surfaces.ts` | each surface's docs page, linked from that file |
| Prompt cache lifetime: one hour for the main conversation on a subscription within plan usage, five minutes with an API key, a cloud provider or usage credits, and `promptCacheTtl` / `CLAUDE_CODE_PROMPT_CACHE_TTL` from 2.1.242 | Cache Tax's page copy (`mod_versions.generated_content`, its `faq` and `goodToKnow`) | [prompt-caching](https://code.claude.com/docs/en/prompt-caching), "Cache lifetime". If it changes, regenerate Cache Tax's copy with `generate:content cache-tax --prepare --mod` |

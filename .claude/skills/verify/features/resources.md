# Resources

`/resources` is a reference page of every way to customize Claude Code. It opens on the status line
tools (ccstatusline, claude-powerline, …) as cards that open the tool, each with an `Alternatives
to <tool>` link once enough published status lines do the same job, then those status lines
themselves. Panels follow for each thing you can customize, then mods and plugin marketplaces
(with a button that copies the add-the-marketplace command), more tools in four columns, and how
to get listed.

## Sub-features

- `resources-header` shows the title `ccstatusline, claude-powerline & More Claude Code Tools` and heading `Claude Code customization tools & resources`.
- `resources-tool-cards` shows `Status line tools` cards (`ccstatusline`, `claude-powerline`, `claude-hud`, `CCometixLine`) whose title links open the tool in a new tab.
- `resources-showcase` lists up to three published status lines under `Status lines that do the same job` when their tags match a tool's jobs.
- `resources-alternatives-link` links `Alternatives to <tool>` to `/alternatives/<tool>` when enough published status lines match it.
- `resources-customize-map` shows `What you can customize`: panels `Mods`, `Status line`, `Themes`, `Spinner verbs`, `Output styles`, `Hooks`, `Skills`, `Subagents`, each with a link named `Anthropic's docs for <name>`.
- `resources-marketplace-copy` copies `/plugin marketplace add <origin>/marketplace.json` from `Copy marketplace command`.
- `resources-more` shows `More tools and lists` (`Usage & cost tracking`, `Themes & sounds`, `Beyond the interface`, `Guides & lists`) and `Get listed` (`Submit it`, `hello@statuslin.es`, a `Submit` button).

## How to get to it (user POV)

- The header's `Resources` (or the phone menu's), or the footer's `Resources`.
- Open `http://localhost:3110/resources` directly.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. Signed out (`anon`) is enough.
- For the showcase and the Alternatives links, published status lines tagged by the page-copy step (`bun run generate:content`), which a fresh verify DB doesn't have; drive those on a populated instance (see the index) or report them skipped. `H sql "select slug, all_tags from configs where status='published'"` shows the tags.

- **Open it.** `H errors anon`, open `http://localhost:3110/`, `H ab anon click 'header a[href="/resources"]'`, `wait --url "**/resources"`. `get title` prints `ccstatusline, claude-powerline & More Claude Code Tools`. `snapshot -i` shows heading `Claude Code customization tools & resources`, heading `Status line tools` with links `ccstatusline vs claude-powerline`, `the best status lines`, `ones that show token usage`, `write your own`, a level-3 heading and link per tool, headings `What you can customize`, `Mods & plugin marketplaces`, `More tools and lists`, `Get listed`, and button `Copy marketplace command`.
- **Tool cards.** `H ab anon get attr 'main a[href="https://github.com/sirmalloc/ccstatusline"]' target` prints `_blank`. Don't click it; it opens a new tab.
- **Showcase and alternatives.** With tagged status lines, heading `Status lines that do the same job` lists up to three gallery rows, and each matched tool shows link `Alternatives to <tool>`; `H ab anon get attr 'main a[href^="/alternatives/"]' href` prints `/alternatives/ccstatusline` and that URL returns 200.
- **Customize map.** `H ab anon get attr 'main a[href="https://code.claude.com/docs/en/hooks"]' href` prints the hooks docs URL; the `Mods` panel links `Browse mods` and the `Status line` panel `Best status lines` and `Write your own`.
- **Copy the marketplace command.** `H copy-spy anon`, `H ab anon find role button click --name "Copy marketplace command" --exact`, then `H copied anon` prints `/plugin marketplace add http://localhost:3110/marketplace.json`. No toast; the button reads `Copied` for two seconds.
- **Proof.** In the `H evidence resources` directory: the snapshot, a full-page screenshot, the copied command, the alternatives status code, `H errors anon` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-23 on a populated instance.
- The page reads only published status lines; mods don't change it.
- `Get listed`'s `Submit` is a button that starts GitHub sign-in when signed out; don't click it. Signed in it's a link with the header pill's name.
- Names repeat: `write your own` and `Write your own`, `ccstatusline` and `ccstatusline vs claude-powerline`, `Resources` in header and footer. Pass `--exact`.

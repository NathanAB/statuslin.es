# Mod Gallery

Browse the reviewed mods on [statuslin.es](https://statuslin.es) without leaving Claude Code. A pane lists every mod the site has reviewed, with its install count and what it can reach, and puts the one you pick into your prompt box ready to install.

Needs Claude Code 2.1.287 or later, the same version the site's mods need.

## Use it

Run `/gallery` to open the pane, or `/gallery usage limits` to open it already filtered. `/gallery <slug>` opens that mod.

- Type in **Filter** to narrow the list. Every word must match the title, author, summary, tags or facts.
- Press a mod's number to open it, and `n` or `p` to turn the page. `r` fetches the catalogue again.
- A mod's page shows its summary, every fact the site lists, its license and a link to its page on statuslin.es.
- **Install** (`i`) puts the site's install prompt in your prompt box. It sends nothing and runs nothing. Read the prompt, then send it yourself, and Claude adds the statuslin.es marketplace and installs the mod.
- `b` goes back to the list.

Claude can search the gallery too. Ask "is there a mod that shows my usage limits?" and Claude calls the `search_mods` tool, which answers with the matching mods as data. The tool can't install anything.

## What it can reach

| | |
| --- | --- |
| What you see | A pane |
| Works in | Terminal and Claude Desktop |
| Slash commands | `/gallery` |
| Uses your tokens | No |
| Changes files | Nothing |
| Network access | `https://statuslin.es/gallery.json`, and no other address |

It keeps the last catalogue it fetched in its own store for five minutes, and shows that copy, with its age, when statuslin.es can't be reached.

Everything in the catalogue is checked before it's shown. Fields of the wrong type, oversized fields and slugs that aren't plugin names drop that mod from the list, and control characters are stripped. A mod's slug is the only part of the catalogue that reaches the prompt box. The install command and the marketplace address are written into the mod itself.

## Install it

Open its page on statuslin.es and copy the install prompt, or run:

```sh
claude plugin marketplace add https://statuslin.es/marketplace.json && claude plugin install mod-gallery@statuslines
```

`/gallery demo` shows six sample mods without asking the site. It exists so a preview recorded with no network has something to draw.

## Develop it

- Load it from this folder: `claude --plugin-dir plugins/mod-gallery`.
- Run its pane and tool tests: `claude plugin test plugins/mod-gallery`.
- Check it: `claude plugin validate plugins/mod-gallery`. Once a session has loaded it, `tsc -p plugins/mod-gallery` type-checks it against the declarations Claude Code lays in `.claude-plugin/types/`.
- The catalogue, search and install-prompt logic is tested with the rest of the repo, in `test/mods/mod-gallery/`. Those tests fail when the site's install prompt or catalogue format changes and the mod doesn't.

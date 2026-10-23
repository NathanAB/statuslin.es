# Copy a status line to use

A visitor opens a published status line's page at `/c/<slug>`. Beside the install button a
`Before you install` panel says when the version was reviewed, whether it reaches the internet or
reads the Claude sign-in token, and links the not-showing fixes. Below come its preview, what it
does, and its source. `Copy install prompt` puts a prompt for Claude Code on the clipboard that
installs the script, and `Copy script` copies the raw source. Each copy button reads `Copied` for a
moment; the install prompt also toasts `Prompt copied`. A copy counts once per visitor toward the
install count shown on the page and used by Top and Trending.

## Sub-features

- `copy-detail` renders the page: breadcrumb, title with tag links, `by @author` byline with avatar, description, install button with `N installs`, a Claude Desktop note when there's no Desktop shot, then rule-separated Preview, What it does (fact tiles), Source, More status lines.
- `copy-facts` shows `Before you install`: `This version was reviewed before it was listed on <Mon D, YYYY>`, `Doesn't ask to reach the internet` or `Connects to <hosts>`, `Reads your Claude sign-in token` when flagged, and link `Not showing after you paste? Fix it`.
- `copy-prompt` copies the install prompt and toasts `Prompt copied`.
- `copy-script` copies the exact source.
- `copy-fold` folds a source over 20 lines to its first 12, with a `Show all N lines` button.
- `copy-count` shows `1 install` after the first copy and counts a visitor once.
- `copy-missing` returns 404 for an unknown or unpublished slug.

## How to get to it (user POV)

- Choose a row's title link in the home gallery or on a topic page, or `Open page` in the home hero ([home-hero](./home-hero.md)).
- Open `http://localhost:3110/c/<slug>` directly (slug from the gallery link or `H sql "select slug from configs where status = 'published'"`).

## Driving it with agent-browser

Preconditions:

- Baseline from the index.
- One published status line `Verify Probe` with source `echo "verify probe"` and no network hosts, made through [submit-status-line](./submit-status-line.md) and [review-queue](./review-queue.md).
- `H sql "select copy_count from configs where slug like 'verify-probe-%'"` prints `0`.
- For the yes cases of `copy-facts`, a second published one with a declared host and the admin's `Reads the Claude Code auth token` flag on (`Verify Net` in [review-queue](./review-queue.md)). For `copy-fold`, one with a source over 20 lines; the admin can submit it (`find label "Source code" fill` takes a multi-line string) and approve it.

- **Open the page.** `H errors anon`, `H ab anon open http://localhost:3110/`, wait, then `H ab anon find role link click --name "Verify Probe" --exact` (the gallery row's link; the hero adds `Open page : Verify Probe`). The URL is `http://localhost:3110/c/verify-probe-<8 hex>`. `snapshot -i` shows navigation `Breadcrumb`, heading `Verify Probe`, link `Bash`, link `@verify-author`, button `Copy install prompt for Verify Probe`, link `statusline-anywhere`, region `Before you install` with link `Not showing after you paste? Fix it`, regions `Preview`, `What it does`, `Source` (with button `Copy script`) and `More status lines`. `get text main` shows `0 installs`, `This version was reviewed before it was listed on <date>`, `Doesn't ask to reach the internet`, and the tiles `Written in` `Bash`, `Network access` `None`, `Works in` `Terminal`.
- **Watch the clipboard.** Run `H copy-spy anon`. It prints `"copy spy on"`.
- **Copy the install prompt.** `H ab anon find role button click --name "Copy install prompt for Verify Probe" --exact`, then `wait --text "Prompt copied"`. The button's name is `Copied`, the page shows `1 install`, and the `Notifications` region holds `Prompt copied` / `Paste it into Claude Code to set up this status line.` `H copied anon` prints the prompt: it starts `Set up this Claude Code status line ("Verify Probe") for me.`, tells Claude Code to back up an existing `~/.claude/statusline.sh` to `.bak`, save the script (in a ```` fence) to `~/.claude/statusline.sh` and `chmod +x` it, then set `statusLine` in `~/.claude/settings.json` and say what it replaced.
- **Copy the script.** Wait two seconds for the button to read `Copy script` again, then `H ab anon find role button click --name "Copy script" --exact` and `H copied anon`. It prints `echo "verify probe"`.
- **Count once.** `H sql "select c.copy_count, (select count(*) from copy_events e where e.config_id = c.id) from configs c where c.slug like 'verify-probe-%'"` prints `1|1` after both copies.
- **Yes facts.** On `Verify Net`'s page, `get text main` shows `Reads your Claude sign-in token` and `Connects to api.github.com` under `Before you install`, and the tiles `Network access` `api.github.com` and `Reads your Claude login` `Yes`.
- **Fold.** On the long script's page, `snapshot -i` shows button `Show all 25 lines` (expanded false) under `Source`; a screenshot shows twelve lines fading out. Click it: the button goes away and the whole source shows. `get text main` lists every line either way, so prove the fold with screenshots.
- **Missing slug.** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3110/c/nope` prints `404`, and the page shows `Status line not found.` and link `Back to gallery`.
- **Proof.** In the `H evidence copy-status-line` directory: snapshot and screenshot before and after the prompt copy, both `copied` outputs, the `sql` read-back, the yes-facts text, the fold screenshots, `H errors anon` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-23.
- Headless Chrome denies `clipboard read`; use `copy-spy` and `copied`. Re-run `copy-spy` after every navigation, since a page load drops it.
- `Copied` replaces the button's accessible name for two seconds. Find the next button only after it reverts, or the name lookup misses.
- Copies dedupe per client: a keyed hash of the `fly-client-ip` header. Locally there is no such header, so every role and session shares one dev bucket and only the first copy of a config ever counts. After a repeat copy the count can read `2 installs` for a moment before the server's total brings it back to `1 install`; wait for `1 install` before reading it.
- `More status lines` rows carry their own `N installs`; read the page's count next to the install button, not the first match.
- The Claude Desktop note (`In Claude Desktop? … statusline-anywhere.`) shows only while the status line has no Desktop shot, which is always on the fake runner.
- With the fake runner the Preview section is blank; it proves the page renders, not the script's output.

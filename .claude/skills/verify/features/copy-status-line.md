# Copy a status line to use

A visitor opens a published status line's page at `/c/<slug>`, sees its preview, what it does and
its source, and copies it: `Copy install prompt` puts a prompt for Claude Code on the clipboard that
installs the script, and `Copy script` copies the raw source. Each copy shows `Copied!`, toasts,
and counts once per visitor toward the copy count shown on the page and used by Top and Trending.

## Sub-features

- `copy-detail` renders the detail page: title, interpreter, author, Preview, What it does, Source.
- `copy-prompt` copies the install prompt and toasts `Prompt copied`.
- `copy-script` copies the exact source.
- `copy-count` shows `1 copy` after the first copy and counts a visitor once.
- `copy-missing` returns 404 for an unknown or unpublished slug.

## How to get to it (user POV)

- Choose a card's title link on the home page or a facet page.
- Open `http://localhost:3110/c/<slug>` directly (slug from the gallery link or `H sql "select slug from configs where status = 'published'"`).

## Driving it with agent-browser

Preconditions:

- Baseline from the index.
- One published status line `Verify Probe` with source `echo "verify probe"`, made through [submit-status-line](./submit-status-line.md) and [review-queue](./review-queue.md).
- `H sql "select copy_count from configs where slug like 'verify-probe-%'"` prints `0`.

- **Open the page.** Run `H ab anon open http://localhost:3110/`, wait, then `H ab anon find role link click --name "Verify Probe" --exact`. The URL is `http://localhost:3110/c/verify-probe-<8 hex>`. `snapshot -i` shows heading `Verify Probe`, button `Copy install prompt — Verify Probe`, headings `Preview`, `What it does`, `Source`, and button `Copy script`.
- **Watch the clipboard.** Run `H copy-spy anon`. It prints `"copy spy on"`.
- **Copy the install prompt.** Run `H ab anon find role button click --name "Copy install prompt"`. The button reads `Copied!`, the page shows `1 copy`, and the `Notifications` region holds `Prompt copied` / `Paste it into Claude Code to set up this status line.` `H copied anon` prints the exact copied text: a prompt that starts `Set up this Claude Code status line ("Verify Probe") for me.`, contains the source in a fenced block, saves it to `~/.claude/statusline.sh`, and sets `statusLine` in `~/.claude/settings.json`.
- **Copy the script.** Run `H ab anon find role button click --name "Copy script" --exact`, then `H copied anon`. It prints `echo "verify probe"`.
- **Count once.** Run `H sql "select c.copy_count, (select count(*) from copy_events e where e.config_id = c.id) from configs c where c.slug like 'verify-probe-%'"`. It prints `1|1` after both copies from the same visitor.
- **Missing slug.** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3110/c/nope` prints `404`.
- **Proof.** In the `H evidence copy-status-line` directory: snapshot and screenshot before and after the prompt copy, both `copied` outputs, the `sql` read-back, `H errors anon` output, and `NOTES.md`.

## Gotchas

- Headless Chrome denies `clipboard read`; use `copy-spy` and `copied`. Re-run `copy-spy` after every navigation, since a page load drops it.
- `Copied!` replaces the button's accessible name for a moment. Find the next button only after it reverts, or the `--name "Copy install prompt"` lookup misses.
- Copies dedupe per visitor (hashed IP). Every local session shares one IP, so a second role copying the same config doesn't raise the count.
- With the fake runner the Preview section is blank; it proves the page renders, not the script's output.

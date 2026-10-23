# Status line not showing guide

`/guide/status-line-not-showing` helps someone whose status line doesn't appear. It opens on a
panel, `Let Claude Code find the problem`, whose `Copy fix prompt` button copies a prompt that has
Claude Code work through the page's checks on the visitor's machine and report before changing
anything. The prompt also shows below the button. The fixes follow as sections, from a blank line
to turning the status line off, then common questions and links to working status lines. The page
needs no data.

## Sub-features

- `not-showing-fix-prompt` copies the fix prompt from `Copy fix prompt` and toasts `Prompt copied` / `Paste it into Claude Code.`
- `not-showing-prompt-text` shows the same prompt in an open fold, `Hide the prompt`.
- `not-showing-sections` shows headings `The status line is blank`, `You haven't trusted the folder`, `The script errors or hangs`, `It shows -- or empty values`, `The context percentage differs from /context`, `The output looks garbled`, `The line is cut off`, `Turn the status line off`, `Common questions`, `Start from a working status line`.

## How to get to it (user POV)

- A status line page's `Not showing after you paste? Fix it` in `Before you install` ([copy-status-line](./copy-status-line.md)).
- The footer's `Status line not showing?`, `/guide`'s `Work through the fixes`, and the Claude Desktop guide.
- Open `http://localhost:3110/guide/status-line-not-showing` directly.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. Signed out (`anon`) is enough. A published status line only for the entry from its page.

- **Open it.** `H errors anon`, open a published status line's `/c/<slug>`, `H ab anon find role link click --name "Not showing after you paste? Fix it" --exact`, `wait --url "**/guide/status-line-not-showing"`. `snapshot -i` shows heading `Claude Code status line not showing? How to fix it`, links `Anthropic's status line docs` and `The Claude Desktop guide`, region `Let Claude Code find the problem` with button `Copy fix prompt`, and the section headings above. `H ab anon get text 'main details summary'` prints `Hide the prompt`.
- **Copy the prompt.** `H copy-spy anon`, `H ab anon find role button click --name "Copy fix prompt" --exact`, `wait --text "Prompt copied"`. The `Notifications` region holds `Prompt copied` / `Paste it into Claude Code.` `H copied anon` prints the prompt: it starts `My Claude Code status line isn't showing. Find out why, following statuslin.es/guide/status-line-not-showing. Tell me what you find before you change anything.`, numbers its checks starting with Claude Desktop's Code tab, and ends `Then tell me the cause in one sentence and the smallest fix. Make no changes until I say yes.`
- **Proof.** In the `H evidence status-line-not-showing` directory: the snapshot, the toast snapshot and screenshot, the copied prompt, `H errors anon` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-23.
- The prompt always names `statuslin.es`, not the local origin; that's by design, so a local run copies the production URLs.
- The prompt's code box below the button has no copy button of its own.

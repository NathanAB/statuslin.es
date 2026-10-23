# Status line setup guide

`/guide` explains how to set up a Claude Code status line. It opens on the fast paths
(`/statusline`, the gallery), then four numbered steps to wire up a script by hand, each with its
own copy button: save a minimal script, make it runnable, point `settings.json` at it, and test it
against the sample JSON, with the line the script prints for it. The JSON Claude Code pipes to the
script follows, with `Copy JSON` and a list of what each top-level field holds. An `On this page`
list marks the section being read. The page needs no data.

## Sub-features

- `guide-steps` shows the steps list: `Save a minimal working script`, `Make it runnable`, `Point settings.json at it`, `Test it`, with `[Opus 5.5] app · 22% context` as the test's output.
- `guide-copy` copies each step's text: `Copy script`, `Copy chmod command`, `Copy settings`, `Copy test command`.
- `guide-payload` shows the sample stdin JSON, with every timestamp (`rate_limits.*.resets_at`, `prompt_cache.expires_at`, `prompt_cache.last_miss_at`) as an absolute unix epoch.
- `guide-copy-json` copies that exact JSON from `Copy JSON`.
- `guide-fields` lists every documented top-level field under `What each field holds, including the ones only some sessions send:`, the payload's fields first in its order, then `session_name`, `vim`, `agent`, `worktree`.
- `guide-contents` marks the section being read in the `On this page` navigation (`aria-current="location"`).

## How to get to it (user POV)

- The footer link `Write a status line` on any page (the header has no guide link).
- Links from other pages: `/resources`' `Write your own`, the status line guides, and the not-showing guide.
- Open `http://localhost:3110/guide` directly.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. Signed out (`anon`) is enough.

- **Open it.** `H errors anon`, `H ab anon open http://localhost:3110/`, wait, `H ab anon find role link click --name "Write a status line" --exact`, `wait --url "**/guide"`. `snapshot -i` shows heading `How to set up a Claude Code status line`, navigation `On this page` (links `The fast paths`, `Wire up a script by hand`, the four step names, `The JSON your script receives`, `Common questions`, `Going further`), headings `The fast paths`, `Run /statusline`, `Copy from the gallery`, `Wire up a script by hand`, a level-3 heading per step, and buttons `Copy script`, `Copy chmod command`, `Copy settings`, `Copy test command`, `Copy JSON`.
- **Payload.** `H ab anon get text main`: `Updated <date>`, `For that payload it prints:` then `[Opus 5.5] app · 22% context`, and the JSON block holds `"fast_mode"`, `"prompt_cache"` and `"rate_limits"`, with each `resets_at`, `expires_at` and `last_miss_at` a 10-digit epoch, not a small offset.
- **Fields.** In the same text, the line `What each field holds, including the ones only some sessions send:` is followed by one label and description per field, ending with `worktree`.
- **Copy buttons.** `H copy-spy anon`, then for each button `H ab anon find role button click --name "<name>" --exact` and `H copied anon`, two seconds apart (the name reads `Copied` meanwhile): `Copy script` starts `#!/bin/bash`; `Copy chmod command` prints `chmod +x ~/.claude/statusline.sh`; `Copy settings` prints the `"statusLine"` JSON; `Copy test command` prints `bash ~/.claude/statusline.sh < sample.json`; `Copy JSON` prints the payload, `{` then `"session_id"` on the next line.
- **Contents.** `H ab anon find role link click --name "Test it" --exact`, wait a second: the URL ends `#test-it` and `H ab anon get attr 'a[aria-current="location"]' href` prints `#test-it`.
- **Proof.** In the `H evidence status-line-guide` directory: the `get text main` output, a snapshot, full-page screenshots at 1280 px and at 375 px (`H ab anon set viewport 375 812`), the copied texts, `H errors anon` before and after, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-23.
- The payload comes from the preview scenarios, so a scenario change shows here without touching the page. The field list is written by hand next to it; a test keeps the two in step.
- `On this page` is a sticky left column from 1280 px wide and sits between the intro and the body below that. Its links scroll smoothly, so wait before reading `aria-current`.
- `Copy script` here and on a status line page share a name; scope by page.
- `scrollintoview "text=…"` doesn't move the page; use the `On this page` links, or take a full-page screenshot and crop it.

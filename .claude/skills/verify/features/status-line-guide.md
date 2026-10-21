# Status line setup guide

`/guide` explains how to set up a Claude Code status line. It shows the JSON Claude Code pipes to a
status line script, with a `Copy JSON` button, then a list of what each top-level field holds,
including fields only some sessions send. A minimal script follows, with the line it prints for that
JSON. The page needs no data: it reads the same as soon as the instance is up.

## Sub-features

- `guide-payload` shows the sample stdin JSON, with every timestamp (`rate_limits.*.resets_at`, `prompt_cache.expires_at`, `prompt_cache.last_miss_at`) as an absolute unix epoch.
- `guide-copy-json` copies that exact JSON from `Copy JSON`.
- `guide-fields` lists every documented top-level field under `What each field holds, including the ones only some sessions send:`, the payload's fields first in its order, then `session_name`, `vim`, `agent`, `worktree`.
- `guide-script` shows the minimal script and `[Opus 4.8] app · 22% context` as its output for the payload.

## How to get to it (user POV)

- The header link `Guide` on any page.
- Open `http://localhost:3110/guide` directly.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. Signed out (`anon`) is enough.

- **Payload.** `H errors anon`, `H ab anon open http://localhost:3110/guide`, wait, then `H ab anon get text main`: the JSON block holds `"fast_mode"`, `"version"`, `"prompt_id"`, `"prompt_cache"` and `"rate_limits"`, and each `resets_at`, `expires_at` and `last_miss_at` is a 10-digit epoch, not a small offset.
- **Copy JSON.** `H copy-spy anon`, `H ab anon find role button click --name "Copy JSON" --exact`, then `H copied anon` prints the same JSON, starting with `"session_id"`.
- **Fields.** In the same `get text main`, the line `What each field holds, including the ones only some sessions send:` is followed by one label and description per field, ending with `worktree`.
- **Script.** `get text main` shows `A minimal working script` and `[Opus 4.8] app · 22% context`.
- **Proof.** In the `H evidence status-line-guide` directory: the `get text main` output, a snapshot, full-page screenshots at 1280 px and at 375 px (`H ab anon set viewport 375 812`), the copied JSON, `H errors anon` before and after, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-21.
- The payload and field list come from the preview scenarios, so a scenario change shows here without touching the page.
- `scrollintoview "text=…"` doesn't move the page; take a full-page screenshot and crop it instead.

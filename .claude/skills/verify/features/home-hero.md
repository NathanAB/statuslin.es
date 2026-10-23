# Home hero

The top of `/` lets a visitor try a status line or mod before installing it. Under the heading
`Customize Claude Code with mods`, a framed Claude Code session shows a fixed sample conversation.
The visitor picks one of up to eight popular published items and sees it drawn into the session:
a status line under the prompt, a mod above it (or under it, if that's where it draws), or the
item's recorded shot when they switch to Claude Desktop. Beside the picker sit a
`Copy install prompt` button, an `Open page` link, a byline naming the kind and author, and one line
on what the item can reach.

## Sub-features

- `hero-copy` shows the h1 `Customize Claude Code with mods` and the lines `Track your usage limits, context window, git branch and more.` and `Pick a mod and see it in action.`
- `hero-picker` lists up to eight published items, status lines and mods together, in the radiogroup `Pick a mod`, the first checked, each with `N installs` on wide screens.
- `hero-app` switches the session between `Terminal` and `Claude Desktop` (radiogroup `Show it in`).
- `hero-stage` draws the pick: the session is an image named `Claude Code with <title> under the prompt`, `… above the prompt` or `<title> in Claude Desktop`, and a live line says `Showing <title> …`.
- `hero-byline` shows `A status line by` or `A mod by` with the author, and the reach line (`Doesn't ask to reach the internet`, `Reads your Claude sign-in token and connects to <hosts>`, `What it can reach isn't recorded yet`, …).
- `hero-copy-line` copies a status line's install prompt from the hero and counts it.
- `hero-copy-mod` copies a mod's install command from the hero and counts it.
- `hero-open-page` links the pick's page, `/c/<slug>` or `/mods/<slug>`.
- `hero-empty` shows only the heading and lines when nothing is published.
- `hero-phone` stacks the session, then the actions, then the picker as a sideways row of chips without counts.

## How to get to it (user POV)

- Open `http://localhost:3110/`; the hero is the top of every gallery page (`/?page=2` names its h1 `…, page 2`).
- The header wordmark `statuslin.es` on any page.

## Driving it with agent-browser

Preconditions:

- Baseline from the index.
- For the picker, at least one published status line, made through [submit-status-line](./submit-status-line.md) and [review-queue](./review-queue.md). For the mod steps, a published mod, which needs GitHub and E2B on a fresh DB; drive those on a populated instance (see the index) or report them skipped.

- **Land.** `H errors anon`, `H ab anon open http://localhost:3110/`, `wait --load networkidle`, then wait a second and a half for the load animation. `snapshot -i` shows heading `Customize Claude Code with mods`, radiogroup `Show it in` with `Terminal` checked and `Claude Desktop`, radiogroup `Pick a mod` with one radio per item (named `<title> <N> installs`, the first checked), button `Copy install prompt for <first title>`, link `Open page : <first title>` and the author's `@` link. `get text main` shows both lines under the heading, the sample conversation (`❯ Fix the flaky date test in utils` …), `A status line by` or `A mod by`, and the reach line.
- **Pick a status line.** `H ab anon find role radio click --name "<title>"` (no `--exact`; the name carries the count). `snapshot` shows image `Claude Code with <title> under the prompt`, link `Open page : <title>` to `/c/<slug>`, `A status line by` and `Showing <title> under the prompt.`
- **Pick a mod.** `H ab anon find role radio click --name "<mod title>"`. The image reads `Claude Code with <mod title> above the prompt` (or `under`), the byline `A mod by`, and `H ab anon get attr 'a[href^="/mods/"]' href` prints its `/mods/<slug>`.
- **Claude Desktop.** `H ab anon find role radio click --name "Claude Desktop" --exact`. The image is `<title> in Claude Desktop`, showing the recorded shot or `No Claude Desktop preview yet.`; for a status line, `Status lines show here through statusline-anywhere.` Switch back with `Terminal`.
- **Copy from the hero.** With a status line picked and the page at networkidle, `H copy-spy anon`, `H ab anon find role button click --name "Copy install prompt for <title>" --exact`, `wait --text "Prompt copied"`. The button reads `Copied`, the picked radio's count goes up by one, and `H copied anon` prints the prompt starting `Set up this Claude Code status line ("<title>") for me.` `H sql "select slug, copy_count from configs order by slug"` shows its count up by one. For a mod, `H copied anon` prints `Install the <slug> mod from localhost:3110. Run this in your shell, then tell me to start a new session to load it:` and the `plugin marketplace add … && … plugin install <slug>@statuslines` line, and `mods.copy_count` goes up.
- **Empty.** On a fresh DB, `snapshot -i` shows the heading and no `Show it in` or `Pick a mod` radiogroups and no actions; `get text main` still shows both lines.
- **Phone.** `H ab anon set viewport 375 812`, reload, wait. The header shows `Submit` and button `Menu`; the radios in `Pick a mod` are named by title alone; a screenshot shows the session, then `Copy install prompt` and `Open page`, then the byline, with the picker below. Set `1280 800` again after.
- **Proof.** In the `H evidence home-hero` directory: snapshots of the landing, each pick and the Desktop switch, screenshots at 1280 and 375 px, the `copied` output and the count `sql`, `H errors anon` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-23: status lines on a fresh DB, mods and the full eight on a populated one.
- The hero rises in with a CSS animation lasting about a second; parts sit nearly transparent until it ends. Wait before a screenshot.
- The session is an image, so its transcript and the drawn line are absent from `snapshot`. Read them with `get text main` or a screenshot.
- Radio names include `N installs` from 768 px wide and not below, so never pass `--exact` for an item radio.
- The list is the top eight by Trending, with at least three of each kind when both exist; statusline-anywhere is never listed. A copy changes Trending, so the order can change on the next full load.
- The link's accessible name reads `Open page : <title>` (the title is visually hidden); match it with `--name "Open page"`.
- The radiogroup is named `Pick a mod` even when it lists status lines.
- On a shared populated instance a hero copy writes a `copy_events` or `mod_copy_events` row and bumps the count. Delete the row by id and take one off the count after the proof.
- With the fake runner a status line draws an empty line, and a mod with no terminal preview draws nothing; the image names and live line still prove the pick.

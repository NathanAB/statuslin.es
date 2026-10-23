# Site navigation

Every page has the same header and footer. On a wide screen the header shows the wordmark,
`Resources`, `GitHub`, a `Submit` pill, and either `Sign in` or the signed-in user's `@handle` menu
(`My submissions`, `Review` for admins, `Sign out`). On a phone it keeps the wordmark, `Submit` and
a round `Menu` button that opens a full-screen menu with the same links and the account rows. The
footer has three columns of links: `Browse`, `Guides` and `About`.

## Sub-features

- `nav-header` shows link `statuslin.es`, navigation `Main` (`Resources`, `statuslin.es on GitHub`), link `Submit`, and button `Sign in with GitHub` signed out.
- `nav-user-menu` opens the `@<handle>` menu: menuitems `My submissions` (to `/me`) and `Sign out`, plus `Review` (to `/admin`) for admins.
- `nav-sign-out` signs the user out and reloads `/` signed out.
- `nav-phone-menu` opens dialog `Menu` below 768 px: link `statuslin.es`, button `Close menu`, navigation `Site` (`Resources`, `Submit`, `GitHub`, then `Sign in with GitHub`, or `Signed in as @<handle>`, `My submissions`, `Review` for admins, `Sign out`).
- `nav-phone-menu-close` closes the menu on Escape, `Close menu`, a link, or widening past 768 px.
- `nav-footer` shows `© <year> statuslin.es` and the `Browse`, `Guides` and `About` link columns.

## How to get to it (user POV)

- Any page, for example `http://localhost:3110/`.
- The phone menu at a width under 768 px (`H ab <role> set viewport 375 812`).

## Driving it with agent-browser

Preconditions:

- Baseline from the index. `H login author` and `H login admin` ran. No data needed.

- **Header, signed out.** `H errors anon`, `H ab anon set viewport 1280 800`, open `http://localhost:3110/`, wait. `snapshot -i` starts with link `statuslin.es`, navigation `Main` with links `Resources` and `statuslin.es on GitHub`, link `Submit`, button `Sign in with GitHub`; there's no `Menu` button. `H ab anon click 'header a[href="/submit"]'` lands on `/submit` with heading `Sign in to submit a status line or mod`.
- **User menu.** As `author`: `H ab author find role button click --name "@verify-author" --exact`. `H ab author get attr 'header button[aria-haspopup=menu]' aria-expanded` prints `true`, and `snapshot -i` lists menuitems `My submissions` and `Sign out`. `find role menuitem click --name "My submissions" --exact` lands on `/me`. As `admin`, the `@verify-admin` menu adds menuitem `Review`, which lands on `/admin`.
- **Sign out.** Do this last for the role. `H sql "select count(*) from session where user_id='verify-author'"`, open the `@verify-author` menu, `find role menuitem click --name "Sign out" --exact`, `wait --url "http://localhost:3110/"`. The header shows `Sign in with GitHub` again and the session count is one lower. Run `H login author` again before any later signed-in step.
- **Phone menu.** `H ab anon set viewport 375 812`, reload, wait. The header shows link `statuslin.es`, link `Submit` and button `Menu` (`H ab anon get attr 'button[aria-label=Menu]' aria-expanded` prints `false`). `find role button click --name Menu --exact`, wait a second: `snapshot -i` shows heading `Menu`, link `statuslin.es`, button `Close menu`, navigation `Site` with links `Resources`, `Submit`, `GitHub` and button `Sign in with GitHub`. As `author`, `get text '[role=dialog]'` adds `Signed in as @verify-author`, `My submissions` and `Sign out`.
- **Close it.** Each of these leaves no `Close menu` in `snapshot -i`: `press Escape`; `find role button click --name "Close menu" --exact`; `find role link click --name Resources --exact` (which also lands on `/resources`); and, with the menu open, `set viewport 1280 800` (navigation `Main` returns).
- **Footer.** `H ab anon get text footer` shows `© <year> statuslin.es`, `Browse` (`Best mods`, `Best status lines`, `Resources`, `Submit`), `Guides` (`Write a status line`, `Status line not showing?`, `Status line in Claude Desktop`, `Status lines vs mods`, `Are mods safe?`, `Buddy pets`) and `About` (`How it works`, `GitHub`, `Contact`, `Terms`). `H ab anon get text "footer a[href='/how-it-works']"` prints `How it works`, and likewise `/mods`, `/status-lines/best`, `/resources`, `/submit`, `/guide`, `/guide/status-line-not-showing`, `/guide/claude-desktop`, `/guide/status-lines-vs-mods`, `/guide/are-claude-code-mods-safe`, `/guide/claude-code-buddy`, `/terms`; `Contact` is `mailto:hello@statuslin.es`.
- **Proof.** In the `H evidence site-navigation` directory: the header and menu snapshots for each role, the phone menu screenshot, the close checks, the sign-out `sql` before and after, the footer text and hrefs, `H errors <role>` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-23.
- `--name` matches part of a name: `Menu` also matches `Close menu`, `statuslin.es` the GitHub link, `GitHub` the sign-in button. Pass `--exact`.
- `Resources`, `Submit`, `GitHub` and `How it works` each appear in the header or menu and in the footer; scope with `header …`, `footer …` selectors.
- Elements hidden at a width are out of the accessibility tree, and while the menu or dropdown is open the rest of the page is hidden from it too, so footer and header links aren't found until it closes.
- Visible text differs from accessible names: the header's `GitHub` link is named `statuslin.es on GitHub` and its `Sign in` button `Sign in with GitHub`.
- Never click `Sign in with GitHub`; it starts the real GitHub OAuth redirect.
- `Sign out` deletes that role's session row; it doesn't touch other roles. The 404 pages and the author's `/admin` page show the signed-out header even to a signed-in user.
- The menu's rows animate in for about a second; wait before a screenshot. `snapshot -i` doesn't list the dialog itself, so check for `Close menu`.
- Viewport settings stick to the role's browser session across runs; set `1280 800` again when done.

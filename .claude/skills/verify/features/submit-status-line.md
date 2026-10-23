# Submit a status line

A signed-in user picks `Status line` on `/submit`, pastes a script, submits it, sees a
"Submitted for review" toast, and then finds it on `/me` marked "in review" with its render
output. A signed-out visitor is asked to sign in instead of seeing the form.

## Sub-features

- `submit-form` shows heading `Submit a status line or mod`, the two-card choice `What are you submitting?`, and the status line form (Title, Description, Interpreter, Source code, network switch).
- `submit-queue` accepts a valid submission, toasts, and queues a render.
- `submit-me` lists the submission on `/me` as a `Status line` in review with version v1 and its slug.
- `submit-signed-out` shows a sign-in prompt in place of the form.
- `submit-network` declares network hosts with the "My script needs network access" switch.

## How to get to it (user POV)

- The header's `Submit` pill (a link to `/submit` on every page, signed in or out), the footer's `Submit`, or `Submit` in the phone menu.
- Open `http://localhost:3110/submit` directly.
- Follow up on `/me` from the header's `@verify-author` menu (`My submissions`), or open `http://localhost:3110/me`.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. `H login author` ran.
- No status line titled `Verify Probe` exists (`H sql "select count(*) from config_versions where title = 'Verify Probe'"` prints `0`).
- The author has a submission left this hour (3 per user, status lines and mods together).

- **Open the form.** `H ab author open http://localhost:3110/submit`, `H ab author wait --load networkidle`. `snapshot -i` shows heading `Submit a status line or mod`, heading and radiogroup `What are you submitting?` with radio `Status line` checked and radio `Mod`, textboxes `Title`, `Description`, `Source code`, combobox `Interpreter` (`bash`, `node`, `python`), heading `Network access` with switch `My script needs network access`, button `Submit`, and heading `What happens next`. Choosing `Mod` navigates to `/submit?kind=mod` (see [mods](./mods.md)).
- **Fill it.** `H ab author find label "Title" fill "Verify Probe"`, `H ab author find label "Description" fill "Model name, for the verify skill proof."` and `H ab author find label "Source code" fill 'echo "verify probe"'`. Screenshot the filled form.
- **Submit.** `H ab author find role button click --name Submit --exact`, then `H ab author wait --text "Submitted for review"` before the after snapshot. The URL stays `/submit` and the `Notifications` region holds `Submitted for review.`
- **Check the rows.** `H sql "select c.slug, c.status, s.status, j.status from configs c join config_versions v on v.config_id = c.id join submissions s on s.config_version_id = v.id join render_jobs j on j.config_version_id = v.id"`. Within a few seconds it prints `verify-probe-<8 hex>|draft|pending|done`.
- **See it on /me.** `H ab author find role button click --name "@verify-author" --exact`, `H ab author find role menuitem click --name "My submissions" --exact`, `wait --url "**/me"`, then `H ab author get text main`. It shows `My submissions`, `Verify Probe`, `Status line`, `in review`, `Waiting for a reviewer`, a `Version` row reading `v1` (label and value on separate lines), the slug, and `Render output for 8 scenarios`.
- **Declare network hosts.** From the home page, `H ab author click 'header a[href="/submit"]'` and `wait --url "**/submit"`. Fill `Title`, `Description` and `Source code`, then `H ab author find role switch click --name "My script needs network access"`, `H ab author find placeholder "api.github.com" fill "api.github.com"` (the host input has no label) and `H ab author find role button click --name "Add host" --exact`. A button `Remove api.github.com` appears. Submit and `wait --text "Submitted for review"`. `H sql "select j.status, v.network_hosts from render_jobs j join config_versions v on v.id = j.config_version_id where v.title = '<title>'"` prints `held|["api.github.com"]`, and `/admin` badges the card `needs network review`.
- **Signed out.** `H ab anon open http://localhost:3110/submit`. The page shows heading `Sign in to submit a status line or mod` and two buttons named `Sign in with GitHub` (the header's and the prompt's), and no form fields. `/submit?kind=mod` shows `Sign in to submit a mod`; `/me` shows `Sign in to see your submissions`. The header's `Submit` is a link here too and lands on that prompt.
- **Proof.** Save `snapshot` and a screenshot of the filled form, the toast, and `/me` into the `H evidence submit-status-line` directory, with the `sql` output, `H errors author` output, and `NOTES.md`.

## Gotchas

- Driven end to end on 2026-10-23.
- Submitting doesn't navigate, and the click returns before the server answers. The toast is the only on-page signal and it fades after a few seconds: `wait --text "Submitted for review"`, then snapshot at once.
- `Submit` names the header pill, the footer link, the phone menu's link and the form's button. Use `find role button … --exact` for the form and `'header a[href="/submit"]'` for the pill.
- Don't click a `Sign in with GitHub` button: it leaves for github.com's OAuth login, which no local run can finish. Assert on the heading instead, since that name matches two buttons on signed-out pages.
- Multi-line source typed with `$'…'` quoting is refused by the worktree-session command checker. A one-line script is enough to prove the flow.
- The fake runner renders every scenario as an empty line, so `/me`'s render output is blank. That proves the job ran, not what the script draws.
- Turning on network access holds the render job (`render_jobs.status` is `held`, not `done`) until an admin runs the network preview behind an egress allowlist; with the fake runner nothing is fetched either way. `config_versions.network_hosts` is JSON, so it reads back as `["api.github.com"]`.
- Each user gets 3 submissions (status lines and mods together) per rolling hour; the 4th is refused. Budget them across a run, submit as `admin` too if needed, or `down` and `up` for a fresh DB.

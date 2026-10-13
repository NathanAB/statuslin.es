# Submit a status line

A signed-in user pastes a status line script on `/submit`, submits it, sees a "Queued for review"
toast, and then finds it on `/me` marked "in review" with its render output. A signed-out visitor
is asked to sign in instead of seeing the form.

## Sub-features

- `submit-form` shows the status line form (Title, Description, Interpreter, Source code, network switch).
- `submit-queue` accepts a valid submission, toasts, and queues a render.
- `submit-me` lists the submission on `/me` as in review with version v1 and its slug.
- `submit-signed-out` shows a sign-in prompt in place of the form.
- `submit-network` declares network hosts with the "My status line needs network access" switch.

## How to get to it (user POV)

- Choose `Submit` (the + button) on the home page: a link when signed in, a button that starts GitHub sign-in when signed out.
- Open `http://localhost:3110/submit` directly.
- Follow up on `/me` from the `@verify-author` user menu, or open `http://localhost:3110/me`.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. `H login author` ran.
- No status line titled `Verify Probe` exists (`H sql "select count(*) from config_versions where title = 'Verify Probe'"` prints `0`).

- **Open the form.** Run `H ab author open http://localhost:3110/submit` and `H ab author wait --load networkidle`. `snapshot -i` shows heading `Submit a status line`, radiogroup `What are you submitting?` with radio `Status line` checked and radio `Mod`, textboxes `Title`, `Description`, `Source code`, combobox `Interpreter` (`bash`), switch `My status line needs network access`, and button `Submit`. Choosing `Mod` navigates to `/submit?kind=mod` (see [mods](./mods.md)).
- **Fill it.** Run `H ab author find label "Title" fill "Verify Probe"`, `H ab author find label "Description" fill "Model name, for the verify skill proof."` and `H ab author find label "Source code" fill 'echo "verify probe"'`. Screenshot the filled form.
- **Submit.** Run `H ab author find role button click --name Submit --exact`, then `H ab author wait --text "Queued for review"` before taking the after snapshot. The URL stays `/submit` and the snapshot's `Notifications` region holds `Queued for review — we'll take a look shortly.`
- **Check the rows.** Run `H sql "select c.slug, c.status, s.status, j.status from configs c join config_versions v on v.config_id = c.id join submissions s on s.config_version_id = v.id join render_jobs j on j.config_version_id = v.id"`. Within a few seconds it prints `verify-probe-<8 hex>|draft|pending|done`.
- **See it on /me.** Run `H ab author open http://localhost:3110/me`, wait, then `H ab author get text main`. It shows `My submissions`, `Verify Probe`, `in review`, `Waiting for a reviewer`, a `Version` row reading `v1` (label and value print on separate lines), the slug, and `Render output — 8 scenarios`.
- **Declare network hosts.** On the form, fill `Title`, `Description` and `Source code` as above, then run `H ab <role> find role switch click --name "My status line needs network access"`, `H ab <role> find placeholder "api.github.com" fill "api.github.com"` (the host input has no label) and `H ab <role> find role button click --name "Add host" --exact`. A button `Remove api.github.com` appears. Submit and `wait --text "Queued for review"`. `H sql "select j.status, v.network_hosts from render_jobs j join config_versions v on v.id = j.config_version_id where v.title = '<title>'"` prints `held|["api.github.com"]`, and `/admin` badges the card `needs network review`.
- **From the home page.** Run `H ab author open http://localhost:3110/`, wait, then `H ab author find role link click --name "Submit" --exact` and `H ab author wait --url "**/submit"`. The submit form loads.
- **Signed out.** Run `H ab anon open http://localhost:3110/submit`. The page shows heading `Sign in to submit a status line` and two buttons named `Sign in with GitHub` (the header's and the prompt's), and no form fields. `/me` signed out shows heading `Sign in to see your submissions`. On the home page the signed-out `Submit` is a button, not a link.
- **Proof.** Save `snapshot` and a screenshot of the filled form, the toast, and `/me` into the `H evidence submit-status-line` directory, with the `sql` output, `H errors author` output, and `NOTES.md`.

## Gotchas

- Submitting doesn't navigate, and the click returns before the server answers. The toast is the only on-page signal and it fades after a few seconds: `wait --text "Queued for review"`, then snapshot at once.
- Don't click a signed-out `Sign in with GitHub` or home-page `Submit` button: it leaves for github.com's OAuth login, which no local run can finish. Assert the button is there instead.
- Multi-line source typed with `$'…'` quoting is refused by the worktree-session command checker. A one-line script is enough to prove the flow.
- The fake runner renders every scenario as an empty line, so `/me`'s render output is blank. That proves the job ran, not what the script draws.
- Turning on network access holds the render job (`render_jobs.status` is `held`, not `done`) until an admin runs the network preview behind an egress allowlist; with the fake runner nothing is fetched either way. `config_versions.network_hosts` is JSON, so it reads back as `["api.github.com"]`.
- `find role button --name "Sign in with GitHub"` matches two buttons on signed-out pages; assert on the heading instead.
- Each user gets 3 submissions (status lines and mods together) per rolling hour; the 4th is refused. Budget them across a run, submit as `admin` too if needed, or `down` and `up` for a fresh DB.

# Review queue

An admin opens `/admin`, sees each pending submission as a card with its author, render output and
source, and approves it (it goes live in the gallery) or rejects it with a reason (the author sees
the reason on `/me`). Non-admins and signed-out visitors don't get the dashboard.

## Sub-features

- `review-list` shows pending submissions under `Admin dashboard`, one card per submission.
- `review-approve` publishes a submission and moves its card to the decided state.
- `review-reject` asks for a reason, then rejects and records the reason for the author.
- `review-contact` lists decided submissions whose author email wasn't delivered, under `Contact needed`.
- `review-gate` keeps the dashboard from signed-out visitors and non-admin users.

## How to get to it (user POV)

- Open `http://localhost:3110/admin` signed in as an admin.
- Open `http://localhost:3110/admin/review`, the old address; it redirects to `/admin`.

## Driving it with agent-browser

Preconditions:

- Baseline from the index. `H login admin` ran.
- One pending submission exists, made through [submit-status-line](./submit-status-line.md) (title `Verify Probe`).

- **Empty queue.** On a fresh instance, `H ab admin open http://localhost:3110/admin` shows `Admin dashboard` and `No submissions in flight.`
- **Open the queue.** Run `H ab admin open http://localhost:3110/admin` and wait. `get text main` starts with summary badges such as `2 ready` (and `1 needs network review` when a card declared hosts); a rendered card reads `Rendered — ready to review`. `snapshot -i` shows heading `Admin dashboard`, a level-3 heading `Verify Probe`, link `@verify-author`, switch `Reads the Claude Code auth token`, and buttons `Approve` and `Reject`. Approve and Reject appear only once the card's render is done.
- **Run a network preview.** A card from a submission with declared hosts ([submit-status-line](./submit-status-line.md)) is badged `needs network review` with `Declared network hosts` and shows button `Run network preview` instead of Approve. Click it, then `H ab admin wait --text "Network preview queued"`. Within a few seconds `H sql "select v.title, j.status from render_jobs j join config_versions v on v.id = j.config_version_id where v.title = '<title>'"` prints `<title>|done`, and a reload shows the card `ready`.
- **Flag the auth token.** Click the card's switch `Reads the Claude Code auth token` (see Gotchas for targeting one card), then `wait --text "Flagged as reading the auth token."`. `H sql "select title, reads_claude_token from config_versions where title = '<title>'"` prints `<title>|t`.
- **Approve.** Click the `Verify Probe` card's `Approve`, then `H ab admin wait --text "Contact needed"`. `get text main` now shows the card under `Contact needed` with `published`, `Published — live in the gallery` and `Email delivery is unconfirmed. Check Resend before taking action.` `H sql "select c.slug, c.status, s.status, s.approval_email_status from configs c join config_versions v on v.config_id = c.id join submissions s on s.config_version_id = v.id where v.title = 'Verify Probe'"` prints `verify-probe-…|published|approved|ambiguous`.
- **See it live.** Run `H ab anon open http://localhost:3110/` and wait. The list has link `Verify Probe` and link `@verify-author`.
- **Reject.** Submit a second status line as author (`Verify Reject`), reload `/admin`, and run `H ab admin find role button click --name Reject --exact`. Textbox `Reason for rejection` appears with buttons `Reject and email author` (disabled until the reason has text) and `Cancel`. Run `H ab admin find label "Reason for rejection" fill "Remove the network call."` then `H ab admin find role button click --name "Reject and email author" --exact`, then `H ab admin wait --text "Not accepted"`. `get text main` shows `Verify Reject`, `rejected`, `Not accepted`, `Reviewer reason`, `Remove the network call.` under `Contact needed`. `H sql "select v.title, s.status, s.rejection_reason, s.rejection_email_status from submissions s join config_versions v on v.id = s.config_version_id where v.title = 'Verify Reject'"` prints `Verify Reject|rejected|Remove the network call.|ambiguous`.
- **Author sees the reason.** Run `H ab author open http://localhost:3110/me`. The card shows `rejected`, `Not accepted`, `Reviewer reason`, the reason, and link `Fix and resubmit` to `/submit?resubmit=<slug>`.
- **Gate.** Run `H ab anon open http://localhost:3110/admin`: heading `Sign in to access the dashboard`, no queue. As `author`, `/admin` shows heading `Admin dashboard` and `You don't have access to this page.` with no cards.
- **Proof.** In the `H evidence review-queue` directory: snapshot and screenshot before and after each decision, the `sql` read-back, the anonymous gallery snapshot showing the published card, `H errors admin` output, and `NOTES.md`.

## Gotchas

- `Approve`, `Reject` and the auth-token switch have the same accessible name on every card, and `find role button` picks the first (cards list newest first). To act on one card, take one fresh `H ab admin snapshot -i`, read the `ref` of the control that follows that card's level-3 heading, and click it right away with `H ab admin click @eN`. Refs are only valid for the snapshot they came from, so never reuse one after the page changes.
- With `RESEND_API_KEY` empty the send fails ambiguously, so `submissions.approval_email_status` / `rejection_email_status` is `ambiguous` and every decided card lands under `Contact needed` with `Email delivery is unconfirmed. Check Resend before taking action.` and no `Retry email` button. That's expected locally, not a failure.
- Pending mods sit under their own heading `Mods`, below the status line cards; decided mods share `Contact needed`. A mod card has no Re-queue. See [mods](./mods.md).
- `Re-queue` shows only for a job that is `queued`, `failed` or stuck `running`. On a fresh fake-runner instance a plain submission reaches `done` in a second or two, so Re-queue is usually unreachable; report it as skipped unless a job is caught in one of those states. `Run network preview` renders with the fake runner here, so it proves the action, not the network render.

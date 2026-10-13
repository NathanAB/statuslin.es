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

- **Open the queue.** Run `H ab admin open http://localhost:3110/admin` and wait. `snapshot -i` shows heading `Admin dashboard`, a level-3 heading `Verify Probe`, link `@verify-author`, switch `Reads the Claude Code auth token`, and buttons `Approve` and `Reject`.
- **Approve.** Run `H ab admin find role button click --name Approve --exact`, then `H ab admin wait --text "Contact needed"`. `get text main` now shows the card under `Contact needed` with `published` and `Published — live in the gallery`. `H sql "select c.slug, c.status, s.status from configs c join config_versions v on v.config_id = c.id join submissions s on s.config_version_id = v.id where v.title = 'Verify Probe'"` prints `verify-probe-…|published|approved`.
- **See it live.** Run `H ab anon open http://localhost:3110/` and wait. The list has link `Verify Probe` and link `@verify-author`.
- **Reject.** Submit a second status line as author (`Verify Reject`), reload `/admin`, and run `H ab admin find role button click --name Reject --exact`. Textbox `Reason for rejection` appears with buttons `Reject and email author` (disabled until the reason has text) and `Cancel`. Run `H ab admin find label "Reason for rejection" fill "Remove the network call."` then `H ab admin find role button click --name "Reject and email author" --exact`, then `H ab admin wait --text "Not accepted"`. `get text main` shows `Verify Reject`, `rejected`, `Not accepted`, `Reviewer reason`, `Remove the network call.` under `Contact needed`. `H sql "select v.title, s.status, s.rejection_reason from submissions s join config_versions v on v.id = s.config_version_id where v.title = 'Verify Reject'"` prints `Verify Reject|rejected|Remove the network call.`
- **Author sees the reason.** Run `H ab author open http://localhost:3110/me`. The card shows `rejected`, the reviewer reason, and link `Fix and resubmit`.
- **Gate.** Run `H ab anon open http://localhost:3110/admin`: button `Sign in with GitHub`, no queue. As `author`, `/admin` shows heading `Admin dashboard` and `You don't have access to this page.` with no cards.
- **Proof.** In the `H evidence review-queue` directory: snapshot and screenshot before and after each decision, the `sql` read-back, the anonymous gallery snapshot showing the published card, `H errors admin` output, and `NOTES.md`.

## Gotchas

- `Approve` and `Reject` have the same accessible name on every card. With more than one pending card, `find role button` picks the first; check which card's heading sits above it, or keep one pending submission per decision.
- Approval and rejection emails are recorded as undelivered because `RESEND_API_KEY` is unset, so every decided card lands under `Contact needed` with "Email delivery is unconfirmed". That's expected locally, not a failure.
- A pending card for a mod looks different (Desktop and terminal previews, input steps). Mod review needs a rendered mod; see [mods](./mods.md).
- Re-queue and "Run network preview" on network-access submissions render with the fake runner here, so they prove the action, not the network render.

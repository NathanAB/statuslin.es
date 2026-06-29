import type { CommunityConfig } from '../seed-community'

// One entry per person we seed. Populated during the outreach phase. Keep titles/descriptions
// in two-word "status line" prose. `githubLogin` drives auto-login attribution + the GitHub
// link in the byline; `githubId` is that login's numeric id, pinned here at review time and
// verified against the live GitHub API before each run (a mismatch means the login was renamed
// or recycled — that entry is skipped rather than mis-attributed). Every `source` MUST be
// human-reviewed before a run: it is published only after the worker renders it and an admin
// approves it in the review queue, but the data file is the first review checkpoint.
//
// Keep it to a few entries per GitHub author: the submit pipeline caps 3 submissions per author
// per hour, so a 4th entry for the same person in one run fails with a rate-limit error (re-run
// after an hour to land it). For the usual "one entry per person" list this never bites.
export const COMMUNITY_CONFIGS: CommunityConfig[] = []

# Security Policy

statuslin.es runs **untrusted, user-submitted scripts**. Security reports are
welcome and taken seriously.

## Reporting a vulnerability

Please report privately. **Don't open a public issue, pull request, or
discussion for a security bug.** Two ways to reach us:

- email **hello@statuslin.es**, or
- use GitHub's **private vulnerability reporting**: the "Report a vulnerability"
  button under this repo's **Security** tab.

Include what you can:

- what the issue is and where (URL, endpoint, or file),
- steps to reproduce,
- the impact you think it has,
- a minimal, non-destructive proof of concept if you have one.

This is a solo-maintained project, so expect a **best-effort** acknowledgement,
usually within a few days. There's no bug-bounty program or paid reward.

Please give a reasonable chance to fix before disclosing publicly, generally up
to **90 days**. Reach out and we'll agree on the timing together.

The machine-readable contact also lives at
[`/.well-known/security.txt`](https://statuslin.es/.well-known/security.txt) (RFC 9116).

## Scope

**In scope** (the parts this project controls):

- the live site (statuslin.es) and its application code,
- the submission → render pipeline and the E2B sandbox that runs submitted scripts,
- authentication and session handling,
- anything that lets a submitted script escape the sandbox, read another user's
  data, or run with privileges it shouldn't have.

**Out of scope:**

- third-party infrastructure this project doesn't control (Fly.io, Neon, E2B,
  Cloudflare, PostHog, GitHub); report those to the vendor,
- denial-of-service, volumetric, or brute-force traffic,
- social engineering, phishing, or physical attacks,
- attacking, deanonymizing, or tampering with other users' submissions or accounts,
- automated-scanner output with no demonstrated impact.

## Safe harbor

Good-faith security research that follows this policy is welcome and won't be
pursued. To stay in good faith:

- only test against your own submissions and your own account,
- don't run destructive tests against production or degrade the service for others,
- don't access, modify, or keep data that isn't yours; stop and report if you
  reach someone else's data,
- give a reasonable time to fix before disclosing publicly.

## Trust model

Submitted scripts are treated as hostile until proven otherwise. Every script
runs inside an **E2B sandbox**. That's the runtime safety boundary. Trust in
what gets published doesn't come from trusting the author: it comes from the code
being **open source**, **human-reviewed before it goes live**, and pinned to a
**content hash** so the exact reviewed bytes are what gets served and copied.
Published versions are immutable. There's no path to swap in unreviewed code
after approval. See the README for more.

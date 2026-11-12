# Unreviewed mods get a page and no install, as a pilot

Accepted 2026-11-12 as a pilot. In the 28 days to 2026-11-10, mod pages brought 179 of the site's 354 Google clicks, almost all from searches for a mod's own name. The gallery has 44 mods. Other directories have 190 to 1,500, and reviewing a mod takes a code read, a recording from the operator's machine and page copy. So most mod names people search for have no page here.

An **unreviewed mod** (GLOSSARY.md) is a mod statuslin.es has a page for and hasn't read. The pilot gives 50 of them a page, to learn whether such a page earns search clicks before anything is built to find mods at scale.

## What changes

1. **The page installs nothing.** It shows no install prompt and no install command, ours or the author's, and the mod is not in `/marketplace.json`. It links to the repository and is labelled "Not reviewed".
2. **The operator sees every page before it is live.** Quality bar rule 8 covers what visitors see, not only what they install. The 50 mods are a committed file of repository, folder and commit. The operator merges it and looks at each page on staging before promoting. A page shows only what was fetched at the merged commit, so an author's later change appears only after a new merge.
3. **The page shows facts, not prose.** Name, author, the one-line description from plugin.json, what the mod can reach (from `claude plugin validate`, with the commit and date it was checked), license, stars, last commit. No README, no preview and no page copy. A mod must pass the automatic inspection a submitted mod passes, or it gets no page. A mod we rejected or removed never gets one.
4. **Unreviewed mods stay out of everything that says "listed".** They are not on the home page, in the ranked list on `/mods`, in any count, or in `llms.txt`. They have their own section lower on `/mods` and are in the sitemap. "Every mod listed here is reviewed" stays true.
5. **Their address holds no marketplace name.** A reviewed mod's slug is its marketplace entry name (ADR 0005), and a name is held only from approval. An unreviewed page is addressed by repository owner and plugin name, and redirects permanently to the listing once the mod is reviewed.
6. **Authors are not contacted.** Each page has a link to ask for a review or a removal, and a removal is done on request. Authors hear from us when their mod is reviewed and published, as today.
7. **"Request a review" is an analytics event.** No sign-in, no stored vote, no visible count. The operator reads the totals and curates the most requested mods the usual way.
8. **The pilot has stop rules.** Half the 50 are mods other directories already have pages for, and half are not. After 28 days, 50 or more Google clicks across the 50 pages means continue and decide how to find mods at scale. Under 15 means take the pages down. In between is the operator's call. If reviewed mod pages lose search position over the same weeks, the pages come down early.

## What others do

- [claudemods.dev](https://claudemods.dev) lists about 1,500 projects it has not reviewed, each with a recording, a permission scan and "Claim it" and "Report this work" links. It shows install commands for all of them, which we don't.
- [claude-mods.com](https://claude-mods.com) scans GitHub daily for a `hooks.json` that declares a hooks module, and a person checks each candidate before it is listed. We keep that order for anything installable and depart from it only for a page that installs nothing.

## Considered options

- **Review more mods, faster.** Keeps one tier and the plain promise. It doesn't reach hundreds of mods while each needs a recording from the operator's machine.
- **Show the author's own install command.** More useful to the visitor, and it makes statuslin.es the place someone installed unread code from.
- **Scan GitHub for every mod now.** New infrastructure, built before knowing whether a page without a preview ranks against directories whose pages have recordings.
- **Point each unreviewed page at reviewed mods that do the same job.** The clearest way to turn the visit into an install. Left out of the pilot: an author could fairly say we used their mod's name to send people elsewhere, and matching needs tags that come from reading the source.
- **Put the pages at `/mods/<name>`.** Picking a mod for the pilot would then reserve its marketplace name, which ADR 0005 avoids for submissions.

## Consequences

- The site now has pages for code nobody here read. The label, the missing install and the separate section are what keep the reviewed listings' promise intact, so a change to any of the three needs this decision revisited.
- What a page says a mod can reach goes stale as the author ships. The page states the commit and date, and nothing refreshes it during the pilot.
- Each mod costs two sandbox runs once, about 100 for the pilot.
- Whether to find mods at scale, how authors claim a page, and whether pages link to reviewed mods are all undecided until the pilot's 28 days are read.

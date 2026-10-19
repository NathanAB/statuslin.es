# Home page redesign: Direction A, gallery A2

The brief for rebuilding the statuslin.es home page in the chosen design. It says what to build, what
the owner already decided, what must not regress (SEO, URLs, analytics, tests), and the order to land
it in. Read it whole before writing code.

## What's in this folder

| Path | What it is |
| --- | --- |
| `prototype/a2.html` | The approved design as a working static page. Open it in a browser (it needs the `img/` folder beside it). It was generated from scraped live data on 2026-10-18. It is the visual and behavioural reference, not code to copy: its markup and CSS ignore this repo's design system on purpose. |
| `prototype/img/` | The mod Desktop screenshots the prototype shows. |
| `screenshots/a2-*.jpg` | The prototype at 1440px: hero, gallery, and three 2×2 composites of the whole page (each panel is one 1440×900 screen). `a2-mobile-hero.jpg` is 390px. |
| `screenshots/current-*.jpg` | Today's home page, for comparison. |

The proposal it came from, with the rejected Direction B, is published at
https://claude.ai/artifact/Hw3uYgpXoxxk2MrEnbEuwH.

## The design in one paragraph

The first screen is a working Claude Code session. Pick a status line from a list beside the terminal
and it renders under the prompt, where it really sits. A session switcher on the terminal (Everyday,
Just started, Uncommitted changes, 1M context) changes both the conversation above the prompt and the
data the status line renders. Below it, the gallery is one full-width card per status line or mod,
with the All / Status lines / Mods filter as the section heading. Then a carousel of mod Desktop
screenshots, a "How installing works" walkthrough, a coral closing section with the submit form, and
a one-line footer. Warm near-black palette and coral accent as today, Hanken Grotesk for text, the
Nerd Font for status lines and the wordmark.

## Decisions already made (don't relitigate)

The owner reviewed several rounds. These are settled; build them as stated.

- **Desktop first.** 95% of visitors are on desktop (690 desktop, 37 mobile, 0 tablet in PostHog).
  Phones must work (no horizontal page scroll, nothing overlapping, readable text) but get no design
  of their own.
- **Content width** caps at 1280px plus the side gutters, centred.
- **Palette unchanged, plus one deeper coral for fills.** Text on coral stays light; the owner
  rejected dark text on coral. Light text on `#c96442` is 3.7:1 and fails WCAG AA, so every solid
  coral fill under text (buttons, the selected filter, the coral closing section) uses a slightly
  deeper shade, `#b85533` (`--primary-fill`: 4.55:1, APCA Lc 74). Coral as text, links and the
  wordmark dot stays `#c96442`. This is a site-wide fix, part of step 1. It replaces the
  prototype's dark `--on-accent`.
- **Type:** Hanken Grotesk 400/500/600 for interface text (the screenshots show Switzer, which its
  licence rules out; see Open questions); the existing StatuslineNerd stays for status lines, code
  and the wordmark. Five sizes: small 13–14px, body 17–19px, lead 20–26px, heading
  32–64px, display 36–76px (the `clamp()` values are in `prototype/a2.html` under `:root`).
- **Hero copy:** H1 stays `HOME_HEADING` ("Claude Code status lines and mods"). One sentence beside
  it: "A status line is the row under your Claude Code prompt. Pick one the community made and watch
  it run." No site totals in the hero (the owner found them irrelevant there).
- **Hero terminal:**
  - Eight status lines in the picker, each with its copy count.
  - The status line changes only when the visitor picks one or switches session. No auto-cycling:
    the owner found it jarring.
  - The session switcher sits on top of the terminal, with plain labels and a short caption per
    session (e.g. "Sonnet 4.6 · feat/auth · 48% of context").
  - The conversation above the prompt changes with the session (four sample transcripts, in the
    prototype's `HISTORY`), and the status line row flashes briefly when it changes.
  - Primary action: Copy install prompt, using the real adopt flow. A second link opens the status
    line's page.
- **Gallery (A2):**
  - One full-width card per item, one surface tone for all. Hover and keyboard focus raise the tone;
    nothing moves.
  - Name and @author on the left of the top line; copy count on the right.
  - The status line below at 15px, directly on the card. Mods show their Claude Desktop screenshot.
  - No avatars in the rows.
- **Section heading:** the All / Status lines / Mods filter, set at the lead size, is the gallery's
  visible heading. Keep a visually hidden `h2` ("Status lines and mods"). Sort (Trending / Top / New)
  is a small segmented control on the right.
- **No keyboard shortcuts** (j/k and similar) and no shortcut hints: the owner found them gimmicky.
- **Mods section:** a horizontal row of Desktop screenshots. The centred one is lit and the others
  dimmed. Name, one sentence and author sit above, with prev/next buttons and "All N mods".
- **Motion:** the easing curve `cubic-bezier(.32,.72,0,1)`. Entrances only for elements below the
  fold at load, so content is never hidden at rest. Everything respects `prefers-reduced-motion`.
- **Rejected, don't bring back:**
  - Direction B's monospace look.
  - The A1 two-column grid.
  - Rotating tile tones, including light "featured-looking" tiles.
  - The heading "What people copy".
  - Floating glass navigation and eyebrow labels.

## Where to deliberately differ from the prototype

The prototype was a design artifact. These are required in the real build, mostly for SEO and trust:

1. **Keep each card's description.** Today's cards carry most of the home page's unique text. Show it
   as one muted line under the status line, clamped to two lines visually, with the full text in the
   DOM.
2. **Keep tags as links.** Today a tag badge links to its facet page, or to `/?tags=slug`
   (`src/gallery/facets.ts:217-226`). In A2 they render as plain text ("Git · Tokens · Cost"); keep
   that look, but make each tag a link with the same targets.
3. **Keep the capability badges** for network access and reading the Claude token
   (`src/gallery/config-badges.tsx`). They're trust signals for running someone else's script. Show
   them in the card's top line, quieter than today but always visible.
4. **Author is a link** to their GitHub profile, as today (`AuthorChip`).
5. **Filters and sort stay URL-driven** (`?kind=`, `?sort=`, `?tags=`, `?page=`) through the router,
   exactly like `GalleryControls` today. The prototype hides cards in the browser; the real one must
   not.
6. **Every mod panel in the carousel links to its mod page.** In the prototype only the text does.
7. **The closing submit section** uses `SubmitCta`'s real behaviour: signed in, link to `/submit`;
   signed out, `startGitHubSignIn('/submit', 'submit')`. Its Status line / Mod choice maps to
   `/submit` and `/submit?kind=mod`. Drop the prototype's Title field unless `/submit` gains a
   prefill; don't fake it.
8. **Sort, Copy and Submit work for real.** The prototype's "not wired up" toasts and sample prompts
   go away.

## Must not regress

Measured on the current code. Keep each, or change it on purpose and update its test in the same PR.

### SEO
- **Head of `src/routes/index.tsx`:** title `homePageTitle(page)`, description
  `homeMetaDescription(page, pageCount)`, and `noindex, follow` when sort, tags or kind are in the
  URL (`isFilteredHomeSearch`). Canonical is `canonicalLink(homeCanonicalPath(…))`, `homeSocialMeta`
  sets og:url/title/description, and `homeJsonLd` outputs WebSite, Organization and a CollectionPage
  ItemList of the visible items in visible order.
- **Headings:** exactly one `h1` with `HOME_HEADING` (plus ", page N" past page 1), and the hidden
  `h2` for the gallery.
- **Server-rendered content:** every card's title is an `<a href="/c/slug">` or `/mods/slug` in the
  server HTML. Pagination is real links. No content may exist only after JavaScript runs. The hero's
  first status line render is in the server HTML.
- **Unchanged:** the sitemap (`src/lib/sitemap.ts`, home plus `/?page=2..N`), robots.txt,
  llms.txt, the OG image route `og.home.png`, and breadcrumbs pointing at the origin.
- **Images:** alt text, width and height on every image, `loading="lazy"` below the fold.
- **CLS:** the hero terminal has a fixed height, and the font swap must not shift layout. Use
  `font-display: swap` with a fallback tuned via `size-adjust`, or preload the font file you use
  above the fold.

### URLs and behaviour
- **`validateSearch` and defaults** (`index.tsx:36-49`): sort, page, tags, kind. Invalid pages throw
  `notFound()` and render the existing not-found view.
- **Empty state:** "Nothing matches these filters yet." when a filter matches nothing.
- **Clearing tags:** today's X button; keep a way to clear them.
- **The featured mod** (`FEATURED_MOD_SLUG`) leaves the gallery list. In the new design it becomes
  the first panel of the mods section instead of a row above the gallery, and the ItemList keeps
  excluding it.
- **Header:** Mods, Guide, Resources, Star on GitHub, then sign-in or the user menu (My submissions,
  Review for admins, Log out).
- **Footer:** keep every link the current footer has: guides, Best status lines, Resources, GitHub,
  Contact, Terms. The prototype's one-line footer only shows five, so lay out all of them on that
  quiet line.

### Analytics (keep names and properties)
- `gallery_page_changed`, `gallery_sort_changed`, `gallery_kind_changed`, `gallery_filter_changed`.
- `statusline_card_clicked` and `mod_card_clicked` via `cardClickProperties`, with
  `surface: 'home'` and a 1-based position. The featured mod uses `surface: 'home_featured_mod'`.
- `auth_started` from the submit CTA and header, and `github_star_link_clicked`.
- New hero interactions may add events, but name them like the existing ones.

### Guardrails you'll hit
- **`scripts/check-frontend.ts`** (in `bun run check`):
  - Inline styles only in `statusline-preview` and `sonner`.
  - No raw colours outside `src/styles/app.css`; tokens are defined once, and no token value is
    restated anywhere.
  - No `className=` outside `src/ui`; `UNSAFE_className` only with a `// REASON:` comment.
  - No arbitrary Tailwind values outside `src/ui`.
  - Font-family classes only from the allowlist.
  - Files are capped at 250 lines.
- **`.dependency-cruiser.cjs`:** routes can't import db; `src/ui` can't import feature folders;
  gallery can't import mods.
- **CSP** (`vite.config.ts`): `font-src 'self'`, so self-host fonts; Google Fonts won't load.
- **Tests that assert today's structure** and will need deliberate updates:
  - `test/routes/home-content.test.tsx` (masthead grid, inventory note, featured row)
  - `test/gallery/config-card.test.tsx`
  - `test/mods/mod-card.test.tsx`
  - `test/ui/home-hero.test.tsx`
  - `test/gallery/gallery-controls*.test.tsx`
  - `test/ui/app-header.test.tsx`, `test/ui/site-footer.test.tsx`
  - `test/routes/home-meta.test.ts`, which should pass unchanged.
- **Production smoke** (`scripts/smoke.ts`, run by `deploy:prod`): the home title and canonical, the
  h1 text, no console errors, the text "Trending" visible on the page, and the first `a[href^="/c/"]`
  opening a page that shows "Copy script".

## How the prototype maps onto this repo

Most of the prototype's colours already exist as tokens in `src/styles/app.css`:

| Prototype | Existing token |
| --- | --- |
| `--bg` `#141413` | `--background` |
| `--surface` `#1c1b18` | `--card` |
| `--raise` `#262420` | `--muted` |
| `--step` `#34322d` | `--border` |
| `--well` `#0c0b0a` | `--sunken` |
| `--ink` | `--foreground` |
| `--muted` | `--muted-foreground` |
| `--accent` | `--primary` as text or a line; `--primary-fill` as a fill under text |
| `--on-accent` | `--primary-foreground`, which stays light (see Palette above) |

New tokens to add (once, in `app.css`):
- `--dim` `#8a877f`, for inactive filter labels.
- The terminal colours: `--t-ink` `#e8e6dc`, `--t-dim` `#8f8d86`, `--t-rule` `#3a3833`,
  `--t-you` `#2e2c28`.
- The easing curve.
- The radii the prototype uses: 26/19px for the terminal frame, 18–20px for cards, and pill.

Components (all closed, variants only, in `src/ui`):
- `Button`: a pill variant with the trailing icon in its own circle, plus the press scale.
- A terminal frame (frame plus history, input and status rows).
- The session switcher and filter controls, as variants of `SegmentedControl`.
- The gallery card for A2, replacing how `GalleryConfigCard` and `ModCard` look on the home and facet
  pages.
- The mods row.
- `AppHeader` and `SiteFooter` restyled.

Feature code stays in `src/gallery`, `src/mods` and the route.

### Data the hero needs
- **What it shows:** the top eight status lines by the home ranking, each with renders for four
  sessions.
- **Session keys** (`src/render/scenarios.ts`) and their labels:
  - `clean-main`: Everyday
  - `fresh-session`: Just started
  - `dirty-feature`: Uncommitted changes
  - `big-context`: 1M context
- **The query:** renders live in `previews`, keyed by script hash and session key. Today's home query
  deliberately loads one per card (`src/gallery/queries.ts:98-125`). Add a separate query for the
  hero only, about 4.5KB per status line, so roughly 36KB, and leave the gallery's one-per-card query
  alone.
- **Captions:** the session captions and the four sample transcripts are static copy. Put them in
  one module next to the hero.

## Plan: land it in this order

All steps land in one PR, as the owner asked, with a commit or a few per step so each can be
reviewed on its own. It stays a draft until step 5 is done, so a half-built page never ships. The
owner waived CLAUDE.md's five-production-file cap for this PR. Every step:
- writes tests first for new behaviour (TDD, per CLAUDE.md)
- passes `bun run check`
- gets a pass from the `frontend-reviewer` agent
- shows before and after screenshots taken with the `verify` skill at 1440px and 390px
- updates the tests that assert old structure in the same step

1. **Foundations.** Self-hosted Hanken Grotesk (see the resolved licence question), the type
   scale, the new tokens, the deeper coral fill under light text, and the pill `Button` variant.
   Every page shifts a little; nothing moves. Screenshot several pages.
2. **Header and footer.** Plain bar: wordmark, links, sign-in or user menu, and a menu button on
   phones. The footer keeps every current link on one quiet line.
3. **Gallery cards (A2)** on home and facet pages, with the filter as heading, URL-driven sort and
   kind, tag links, capability badges, descriptions, and the empty state. Analytics unchanged.
4. **Hero try-on.** The terminal frame, picker and session switcher, the scenario query, the
   transcripts, copy through the real adopt flow, and the "Open X" link. Server-render the first
   state.
5. **Remaining sections.** The mods row (featured mod first, each panel linked), "How installing
   works", the coral closing section with the real submit behaviour, and removal of the old masthead,
   `HomeIndexNote` (see Open questions) and `FeaturedModRow`.
6. **Detail pages (later, separate decision).** The status line page could use the same terminal and
   session switcher. Main changed `src/routes/c.$slug.tsx` recently (PRs #169 and #172 added a Claude
   Desktop screenshot block, `src/gallery/desktop-preview-block.tsx`), so merge main first and
   coordinate before touching it.

## Done means

- The home page matches `screenshots/a2-*.jpg` at 1440px (same layout, type, colours and spacing),
  and has no horizontal scroll at 390px.
- The SEO checklist above holds: title, description, canonical, robots and JSON-LD match today for the
  same URLs (`test/routes/home-meta.test.ts` passes unchanged), and the server HTML contains every
  card link and the hero's first render.
- `bun run check` is green, the production smoke passes against a local build, and the taste
  inspector (`node ~/.claude/skills/design-taste-frontend/scripts/inspect.mjs <url> --allow
  palette-claude,emoji`) reports no failures on the home page.
- Keyboard: every control is reachable and visibly focused. The picker and session switcher are radio
  groups with arrow keys. Screen readers hear "Showing X in the Y session" on change, not
  box-drawing characters.

## Open questions for the owner (ask before the step that needs them)

- **Switzer licence (step 1), resolved.** The ITF Free Font License v2.0 allows self-hosting but
  bans distributing the files through a repository or a public server, and bans subsetting. So
  Switzer can't be committed here. The owner chose Hanken Grotesk (OFL 1.1) instead: it is the
  closest width measured at the prototype's sizes (headline 99%, body 101% of Switzer). The
  prototype now embeds Hanken Grotesk too; the screenshots still show Switzer.
- **`HomeIndexNote` (step 5).** The prototype has no "N status lines and M mods, copied X times" line.
  Drop it, or keep it in the footer line?
- **Featured mod (step 5).** Is "first panel of the mods row, below the gallery" acceptable, given it
  moves from above the gallery today?

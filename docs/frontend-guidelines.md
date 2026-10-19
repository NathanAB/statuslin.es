# Front-end Guidelines

How UI is built in statuslin.es. Every front-end change is reviewed against this document (by the `frontend-reviewer` subagent and humans).

**The one rule everything else serves:** the toolchain enforces the design system, not your memory. If you write a violation, a gate stops you before the edit lands.

## The three rules

### 1. Tokens — define once, reference everywhere

Every color is defined as a CSS custom property in `src/styles/app.css` (`@theme`). The default Tailwind palette is wiped (`--color-*: initial`), so only our named tokens exist. Use the semantic name, never a raw value.

| Use | Class |
| --- | --- |
| Page background | `bg-background` |
| Card / panel | `bg-card` |
| Subtle / hover / muted surface | `bg-muted`, `bg-secondary` |
| Code / preview box (near-black) | `bg-sunken` |
| Coral accent as text, lines and rings (links, brand) | `text-primary` / `border-primary` |
| Coral as a solid fill under text (buttons, selected states) | `bg-primary-fill`, never `bg-primary` (light text on it fails WCAG AA) |
| Text on a coral fill | `text-primary-foreground` |
| Primary text | `text-foreground` |
| Secondary text | `text-muted-foreground` |
| Inactive filter labels (dimmer than secondary) | `text-dim` |
| The home page terminal's text, dimmed text, rules, your turn | `text-terminal-foreground`, `text-terminal-muted`, `border-terminal-rule`, `bg-terminal-turn` |
| Borders | `border-border` |
| Destructive | `bg-destructive` / `text-destructive` |
| Caution (a cost or a risk) | `bg-warning/10` / `text-warning` |
| Monospace (status line output, code) | `font-mono` |

The coral accent is `primary` — **not** `accent` (`accent` is a subtle hover surface). Spacing, radii (`rounded-md` / `rounded-lg`), and text sizes (`text-sm` / `text-lg`) use Tailwind's default scale.

The home page redesign (`docs/redesign/home-a/README.md`) adds its own scale for the components it builds in `src/ui`: five text sizes that grow with the viewport (`text-small`, `text-body`, `text-lead`, `text-heading`, `text-display`), the motion curve `ease-settle` (and the terminal's `animate-flash` and `animate-blink`), and the radii `rounded-frame` and `rounded-screen` (the terminal), `rounded-tile` (the picker) and `rounded-panel` (gallery rows, the install steps), and the home page's measure: `px-gutter` side gutters, `max-w-page` (1280px of content inside them) and `mt-section` between its sections. Use them only in those redesigned components. Everywhere else keeps Tailwind's default scale, and text still renders through `Text` / `Heading`.

The gate enforces three sub-rules on `src/styles/app.css`: (a) define-once — no hex literal may be declared twice; (b) theme-alias — every `--color-*` must be `initial` or `var(…)`, never a literal; (c) token-echo — no file in `src/` or `test/` may restate a literal that equals a token value.

### 2. `src/ui` components are closed — no `className` prop, no `...rest` spreads

Components in `src/ui/` expose only the props the app actually needs. There is no `className` prop and no blanket `...HTMLAttributes` spread onto the DOM. Appearance differences are expressed as named variants (cva). Tailwind classes are an implementation detail inside `src/ui/`; nothing outside sees them.

When you add a new shadcn component (see "Vendoring procedure" below), close it as part of the vendoring step — before the first commit.

### 3. Zero `className=` outside `src/ui/`

Routes and feature components compose ui components and layout primitives. They write zero `className=` props. Appearance decisions are made once, in one place, with a name.

**The one escape hatch:** `UNSAFE_className` on `Box` only. A `// REASON:` comment is required on the immediately preceding line. Every use is a design-system gap to document and fix later, not a convenience.

```tsx
// REASON: vendor widget requires a positioned ancestor; no layout primitive covers this
<Box UNSAFE_className="relative">
  <VendorWidget />
</Box>
```

## Layout and text primitive catalog

All primitives live in `src/ui/`. Import them by name; never reach for a raw `<div>` with classes outside `src/ui/`.

### Layout (`src/ui/layout.tsx`)

| Export | What it does |
| --- | --- |
| `<Stack gap={n}>` | `flex-col` with a gap from the scale (`1 \| 1.5 \| 2 \| 3 \| 4 \| 6 \| 7 \| 9`) |
| `<Row gap={n} align justify wrap>` | `flex-row` with the same gap scale; `align` / `justify` map to flex-align / flex-justify values |
| `<Box UNSAFE_className="…">` | Escape hatch only — requires a `// REASON:` comment on the preceding line |

Vertical rhythm between page sections is `Stack gap` on the parent — no margin props; sibling spacing is the parent's job.

### Shells (`src/ui/shell.tsx`)

| Export | What it does |
| --- | --- |
| `<PageShell user={user}>` | Full page frame: `min-h-screen` background + `AppHeader` + `max-w-5xl` main. `narrow` makes main `max-w-lg`; `wide` (the home page) lets main span the window and widens the header and footer to the home measure; `footerNote` adds a quiet line of the page's own to the footer (the home page's inventory) |
| `<CenteredShell user={user}>` | Centered screen for login / signed-out-submit views |

### Typography (`src/ui/text.tsx`)

| Export | What it does |
| --- | --- |
| `<Heading level={1\|2\|3}>` | The only headings. `level` picks both the tag (`h1`/`h2`/`h3`) and a fixed size on one scale; level 3 is the card / section title. Sans-only, no font knob. `size="compact"` is a quiet title; `size="display"` is the home hero's title |
| `<Text>` | The only body text. `size` is a closed scale (`base\|sm\|xs`), `muted` dims the color, `mono` is for code/data values (slugs, hashes), `inline` renders a `span`. Text always fills its container: there is no line-length cap. |
| `<TextLink to="…">` | Router-`Link` styled as `text-primary` with hover underline — use instead of bare `<Link>`. `tone="plain"` uses full-strength text instead (the footer); `tone="muted"` is dimmed text that lights up on hover (a gallery row's tags); `tone="underlined"` is full-strength text underlined at rest (the hero's "Open …" link) |

### Cards and interactive surfaces

| Export | File | Notes |
| --- | --- | --- |
| `<Card interactive>` | `src/ui/card.tsx` | Adds hover lift / glow + entrance animation + `motion-reduce` handling |
| `<CardHeader>`, `<CardContent>`, `<CardFooter>`, `<CardTitle>`, `<CardDescription>`, `<CardAction>` | `src/ui/card.tsx` | Subcomponents for card anatomy |
| `<StretchedLink to="…">` | `src/ui/stretched-link.tsx` | Full-card clickable overlay with focus ring; place inside `<Card interactive>` |
| `<GalleryRow to params onOpen title byline facts description>` | `src/ui/gallery-row.tsx` | The redesign's gallery card: one full-width row, title link (it opens the whole row) and byline left, `facts` right, the preview as children, the description clamped to two lines; `onOpen` runs when the row opens (its click analytics). Hover and focus raise the tone; inside another card it starts a tone up. `<RowFacts>` sets the facts in a dotted line, `<RowNote icon>` is a fact with an icon, `<GalleryList>` stacks rows |
| `<Terminal label toolbar transcript status conversationKey conversationChanged statusKey statusChanged>` | `src/ui/terminal.tsx` | The home hero's Claude Code session: a frame with an optional toolbar (the session switcher and its caption), then a fixed-height screen with the conversation (`TranscriptLine[]`), the input box and the status line. The screen is one image to a screen reader, named by `label`. Nothing moves on the first render; after a change, a new conversation settles in and a new status line glows (`animate-flash`). |
| `<ChoiceGroup labelledBy options value onValueChange look>` | `src/ui/choice-group.tsx` | A radio group whose arrow keys pick as they move, for a demo's choices. `look`: `list` (label and detail on a tile: the hero's picker) or `tray` (small segments: the hero's sessions) |
| `<HeroLayout heading lead stage aside>`, `<HeroActions>` | `src/ui/hero-layout.tsx` | The home hero's 12-column grid (title and sentence, then the demo and its controls); stacks below 900px |
| `<LiveMessage>` | `src/ui/visually-hidden.tsx` | A screen-reader-only `role="status"` message, read out when it changes |
| `<ShotCarousel heading lead listLabel items more>` | `src/ui/shot-carousel.tsx` | The home page's dark band of mod screenshots in a sideways row: the centred one lit and named above it, previous and next buttons, arrow keys; every shot links to its page |
| `<StepStrip heading statement steps>` | `src/ui/step-strip.tsx` | A heading and one statement, then a short strip of steps side by side ("How installing works") |
| `<ClosingBand heading lead panel>` | `src/ui/closing-band.tsx` | The home page's full-width coral closing section, light text on `bg-primary-fill` |
| `<SubmitChooser signedIn>` | `src/ui/submit-cta.tsx` | Status line or Mod, then continue: a link to `/submit` (or `?kind=mod`) when signed in, GitHub sign-in back to that form when not |
| `<Reveal>` | `src/ui/reveal.tsx` | A block that rises into place when it first scrolls into view. Only blocks that start below the fold wait, never without JavaScript or under reduced motion, and a block the page jumped past shows at once |
| `<HomeSection first? id?>` | `src/ui/home-section.tsx` | One section of the home page on its measure, `mt-section` from the one above (`first`: just under the header) |

### Buttons (`src/ui/button.tsx`)

`Button` and `buttonVariants` are exported. Key variants:

- **variant:** `default` (coral fill) · `outline` · `secondary` · `ghost` · `destructive` · `link` · `quiet` (dim text that lights up on hover, no surface: the header's links) · `plain` (full-strength text, no surface)
- **size:** `default` · `xs` · `sm` · `lg` · `nav` (the standalone sign-in button) · `bar` (text-sized, no padding: a header-bar link) · `menu` (the phone menu's big links) · `icon` · `icon-xs` · `icon-sm` · `icon-lg` · `pill` (the redesign's rounded button; requires `trailingIcon`, an icon element set in its own circle, and pairs with `variant="default"` or `"secondary"`) · `round` (the pill's 44px icon-only partner, such as Previous page; give it an `aria-label`). `aria-disabled` dims a button that can't act right now but keeps it focusable (the mods row's ends); its `onClick` must then do nothing
- **active:** `true` / `false` — active-tab treatment; pair with `variant="outline"`

### Other primitives

| Export | File | What it does |
| --- | --- | --- |
| `<CopyButton>` / `<Copyable>` | `src/ui/copy-button.tsx` | Clipboard control; `Copyable` overlays it on a code well |
| `<InstallPrompt>` | `src/ui/install-prompt.tsx` | The status line and mod pages' install control: "Copy install prompt" button, copy count, toast |
| `<CodeBlock>` | `src/ui/code-block.tsx` | Styled `<pre>` block for source display; pass `text` to copy |
| `<LineDiff lines={…}>` | `src/ui/line-diff.tsx` | Unified line diff in a code well; `DiffLine[]` with +/- markers |
| `<SectionCard title action={…}>` | `src/ui/section-card.tsx` | Section with header + optional action slot |
| `<ScenarioRow>` | `src/ui/scenario-row.tsx` | Labeled row for scenario-level content |
| `<Notice tone="info\|error" live?>` | `src/ui/notice.tsx` | Inline status / error notice; `live` makes it an alert, for an error that appears after the user acts (a failed submit) |
| `<SelectField options label …>` | `src/ui/select.tsx` | Closed select with `SelectOption[]` |
| `<Details summary="…">` | `src/ui/details.tsx` | Styled `<details>` / `<summary>` disclosure |
| `<FactTiles tiles={…}>` | `src/ui/fact-tiles.tsx` | Responsive grid of icon + label + short value tiles; `caution` uses the warning tint |
| `<BulletList items={…}>` / `<NumberedList items={…}>` | `src/ui/bullet-list.tsx`, `src/ui/numbered-list.tsx` | Plain-string lists on the small-text scale; backticks mark code |
| `<Badge>` | `src/ui/badge.tsx` | Status/label badge (`badgeVariants` also exported) |
| `<AuthorChip author={…}>` | `src/ui/author-chip.tsx` | Avatar + username chip; `avatar={false}` shows the byline alone (gallery rows) |
| `<AppHeader user={…}>` | `src/ui/app-header.tsx` | Site header (Mods, Guide, Resources, Submit, Star, then sign-in or the user menu); used by shells. Phones get `SiteMenu` (`src/ui/site-menu.tsx`), a full-screen menu; the bar's account dropdown is `UserMenu` (`src/ui/user-menu.tsx`) |
| `<SignInButton look>` | `src/ui/sign-in-button.tsx` | GitHub OAuth sign-in trigger. `look`: `button` (default, outlined), `bar` (header bar) or `menu` (phone menu) |
| `<StatuslinePreview segments={…}>` | `src/ui/statusline-preview.tsx` | ANSI-rendered statusline preview. `look="well"` (default) sits it in a code well; `look="strip"` sets it at 15px on a full-width dark strip (gallery rows); `look="terminal"` takes the home terminal's text |
| `<SegmentedControl label options value onValueChange look>` | `src/ui/segmented-control.tsx` | One-of-many segments (a radio group; arrow keys move, Space picks). `look`: `boxed` (default, coral selection), `heading` (big words, the selected one full strength: the gallery's filter heading) or `tray` (small segments in a rounded tray: the gallery sort) |

## Vendoring procedure for new shadcn components

1. Add via `bunx shadcn@latest add <name>` (or the shadcn MCP server for agents — exact, current API).
2. Pin any new dependency it pulls — no `^` ranges.
3. **Close the props immediately:** remove `className` from the component's prop interface; narrow `...rest` to the explicit props the app uses (`type`, `disabled`, `value`, `onChange`, aria-attributes, etc.) — no `HTMLAttributes` blanket.
4. TypeScript now enforces closure at every call site. Add any missing variants rather than reopening `className`.
5. Commit the closed component. Never ship an open `className` prop into `src/ui/`.

### Product fragments (`data-ui`)

A `src/ui` element that depicts the product itself (a status line render, the hero terminal, a Claude Desktop shot) carries `data-ui=""`. It names it as an interface fragment, the way the redesign prototype does: the taste inspector counts it as a picture and leaves its own sizes, rules and shadow out of the page's typography and surface checks. Never put it on page text or around a heading.

## Structure rules

- `src/ui/` — primitives only. Imports only `src/ui` / `src/lib`. Type-only imports from elsewhere are allowed (erased at build).
- `src/<feature>/` — feature code colocated (`src/gallery`, `src/submit`, `src/review`, `src/adopt`, `src/votes`). No cross-feature value imports — go through `src/lib` or `src/ui`.
- `src/mods/` may import `src/gallery`, the shared listing and ranking code that ranks mods and status lines on one scale. `src/gallery` never imports `src/mods` or any other feature folder; a route maps mod data into the gallery's shapes instead.
- `src/home/` — the home page's sections, composed from the features (gallery, mods, adopt) the way a route would. No feature folder imports it.
- `src/routes/` — thin: a loader calling a server function + a component composing `src/ui` primitives. No data shaping, no `@/db` import.
- Files ≤ 250 lines, one responsibility. Named exports (default exports only in `src/routes/`). Components `PascalCase`, files `kebab-case.tsx`.

## The enforcement layers

All rules run in `bun run check` and at the hooks listed below.

| # | Rule | What it catches | Where enforced |
| --- | --- | --- | --- |
| 1 | Closed props (TypeScript) | `className=` or unknown prop passed into a closed `src/ui` component | `tsc` — compile error |
| 2 | No `className=` outside `src/ui` | Any `className=` prop in `src/routes/` or `src/<feature>/` (except `UNSAFE_className`) | `check-frontend.ts` — gate error |
| 3 | `UNSAFE_className` requires `// REASON:` | `UNSAFE_className=` in a `.tsx` file without a `// REASON:` comment on the immediately preceding line | `check-frontend.ts` — gate error |
| 4 | Tokens: define-once | Duplicate hex literal in `src/styles/app.css` token declarations | `check-frontend.ts` — gate error |
| 5 | Tokens: theme-alias var()-only | `--color-*` declaration with a literal value instead of `var(…)` or `initial` | `check-frontend.ts` — gate error |
| 6 | Tokens: token-echo | Hex literal in any `src/` or `test/` file that equals a token value | `check-frontend.ts` — gate error |
| 7 | No inline styles | `style={` prop in `.tsx` files (except `src/ui/statusline-preview.tsx` and `src/ui/sonner.tsx`) | `check-frontend.ts` — gate error |
| 8 | No raw colors | Bare hex / `rgb()` / `hsl()` with literal digits in any `src/` file | `check-frontend.ts` — gate error |
| 9 | No dead-palette classes | Tailwind default-palette classes (`bg-red-500` etc.) — they render nothing (palette is wiped) | `check-frontend.ts` — gate error |
| 10 | No arbitrary Tailwind values | `w-[200px]`-style values in app code (allowed in `src/ui/` vendored files) | `check-frontend.ts` — gate error |
| 11 | File size | Any file over 250 lines | `check-frontend.ts` — gate error |
| 12 | Centralized font family | A `font-<family>` class (`font-mono`, a typo like `font-heading`, …) outside `src/ui/text.tsx` + the code/header allowlist — text must render through `Text`/`Heading`, which own the font | `check-frontend.ts` — gate error |
| 13 | Import boundaries | routes ↛ db; `src/ui` ↛ features; `src/gallery` ↛ `src/mods`; no cross-feature value imports | `check-boundaries` (dependency-cruiser) |
| 14 | Biome lint + format | Style, complexity, naming, import order, `noConsole` | `bun run lint` |
| 15 | Solid coral fills use `bg-primary-fill` | `bg-primary` / `bg-ring` (or `/50` and up) as a fill, where light text fails WCAG AA | `test/styles/coral-fill.test.ts` (in `bun run check`; not at edit time) |
| 16 | Focus rings at full strength | A see-through focus ring (`ring-ring/50`, `outline-ring/50`), which falls under WCAG's 3:1 for a focus indicator | `test/styles/coral-fill.test.ts` (in `bun run check`; not at edit time) |
| 17 | No line-length caps | A text width in text units (`max-w-[30ch]`, `max-w-[22em]`) or `max-w-prose`: text fills its container | `test/styles/no-text-measure.test.ts` (in `bun run check`; not at edit time) |

**Hook schedule:**

- **PostToolUse (Edit / Write / MultiEdit on `src/*.{ts,tsx}`):** `frontend-gate.sh` runs Biome on the changed file + the full `check-frontend.ts` walk. Violations block the edit result and feed the error back to the agent.
- **Stop:** `agent-gate.sh` runs the full gate before the agent ends its turn.
- **pre-commit:** lint + typecheck (simple-git-hooks).

## Correct and wrong examples

**Correct** — primitives + tokens, thin route:

```tsx
import { PageShell } from '@/ui/shell'
import { Stack } from '@/ui/layout'
import { Heading, Text, TextLink } from '@/ui/text'
import { Card, CardContent } from '@/ui/card'
import { Button } from '@/ui/button'

function ConfigCard({ slug, title, description }: { slug: string; title: string; description: string }) {
  return (
    <Card interactive>
      <CardContent>
        <Stack gap={2}>
          <Heading level={3}>{title}</Heading>
          <Text muted size="sm">{description}</Text>
        </Stack>
        <Button asChild>
          <TextLink to="/c/$slug" params={{ slug }}>Use this</TextLink>
        </Button>
      </CardContent>
    </Card>
  )
}
```

**Wrong** — every line here is blocked by a gate:

```tsx
// inline style (gate), raw hex (gate), arbitrary value (gate), className outside ui (gate)
function ConfigCard({ title }: { title: string }) {
  return (
    <div style={{ background: '#1c1b18', padding: 16 }}>
      <h2 className="text-[19px]" style={{ color: '#faf9f5' }}>{title}</h2>
      <button className="bg-primary">Use this</button>
    </div>
  )
}
```

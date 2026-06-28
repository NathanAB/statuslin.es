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
| Coral accent (buttons, links, brand) | `bg-primary` / `text-primary` |
| Text on a coral fill | `text-primary-foreground` |
| Primary text | `text-foreground` |
| Secondary text | `text-muted-foreground` |
| Borders | `border-border` |
| Destructive | `bg-destructive` / `text-destructive` |
| Monospace (statusline output, code) | `font-mono` |

The coral accent is `primary` — **not** `accent` (`accent` is a subtle hover surface). Spacing, radii (`rounded-md` / `rounded-lg`), and text sizes (`text-sm` / `text-lg`) use Tailwind's default scale.

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
| `<Stack gap={n}>` | `flex-col` with a gap from the 6-step scale (`1 \| 1.5 \| 2 \| 3 \| 4 \| 6`) |
| `<Row gap={n} align justify wrap>` | `flex-row` with the same gap scale; `align` / `justify` map to flex-align / flex-justify values |
| `<Box UNSAFE_className="…">` | Escape hatch only — requires a `// REASON:` comment on the preceding line |

Vertical rhythm between page sections is `Stack gap` on the parent — no margin props; sibling spacing is the parent's job.

### Shells (`src/ui/shell.tsx`)

| Export | What it does |
| --- | --- |
| `<PageShell user={user}>` | Full page frame: `min-h-screen` background + `AppHeader` + `max-w-5xl` main |
| `<CenteredShell user={user}>` | Centered screen for login / signed-out-submit views |

### Typography (`src/ui/text.tsx`)

| Export | What it does |
| --- | --- |
| `<Heading level={1\|2\|3}>` | The only headings. `level` picks both the tag (`h1`/`h2`/`h3`) and a fixed size on one scale; level 3 is the card / section title. Sans-only, no font knob. |
| `<Text>` | The only body text. `size` is a closed scale (`base\|sm\|xs`), `muted` dims the color, `mono` is for code/data values (slugs, hashes), `inline` renders a `span`, `measure` caps line length. |
| `<TextLink to="…">` | Router-`Link` styled as `text-primary` with hover underline — use instead of bare `<Link>` |

### Cards and interactive surfaces

| Export | File | Notes |
| --- | --- | --- |
| `<Card interactive>` | `src/ui/card.tsx` | Adds hover lift / glow + entrance animation + `motion-reduce` handling |
| `<CardHeader>`, `<CardContent>`, `<CardFooter>`, `<CardTitle>`, `<CardDescription>`, `<CardAction>` | `src/ui/card.tsx` | Subcomponents for card anatomy |
| `<StretchedLink to="…">` | `src/ui/stretched-link.tsx` | Full-card clickable overlay with focus ring; place inside `<Card interactive>` |

### Buttons (`src/ui/button.tsx`)

`Button` and `buttonVariants` are exported. Key variants:

- **variant:** `default` (coral fill) · `outline` · `secondary` · `ghost` · `destructive` · `link`
- **size:** `default` · `xs` · `sm` · `lg` · `trigger` (header user-menu trigger) · `icon` · `icon-xs` · `icon-sm` · `icon-lg`
- **active:** `true` / `false` — active-tab treatment; pair with `variant="outline"`

### Other primitives

| Export | File | What it does |
| --- | --- | --- |
| `<CodeBlock>` | `src/ui/code-block.tsx` | Styled `<pre>` block for source display |
| `<SectionCard title action={…}>` | `src/ui/section-card.tsx` | Section with header + optional action slot |
| `<ScenarioRow>` | `src/ui/scenario-row.tsx` | Labeled row for scenario-level content |
| `<Notice tone="info\|error">` | `src/ui/notice.tsx` | Inline status / error notice |
| `<SelectField options label …>` | `src/ui/select.tsx` | Closed select with `SelectOption[]` |
| `<Details summary="…">` | `src/ui/details.tsx` | Styled `<details>` / `<summary>` disclosure |
| `<Badge>` | `src/ui/badge.tsx` | Status/label badge (`badgeVariants` also exported) |
| `<AuthorChip author={…}>` | `src/ui/author-chip.tsx` | Avatar + username chip |
| `<AppHeader user={…}>` | `src/ui/app-header.tsx` | Site header; used by shells |
| `<SignInButton>` | `src/ui/sign-in-button.tsx` | GitHub OAuth sign-in trigger |
| `<StatuslinePreview segments={…}>` | `src/ui/statusline-preview.tsx` | ANSI-rendered statusline preview |

## Vendoring procedure for new shadcn components

1. Add via `bunx shadcn@latest add <name>` (or the shadcn MCP server for agents — exact, current API).
2. Pin any new dependency it pulls — no `^` ranges.
3. **Close the props immediately:** remove `className` from the component's prop interface; narrow `...rest` to the explicit props the app uses (`type`, `disabled`, `value`, `onChange`, aria-attributes, etc.) — no `HTMLAttributes` blanket.
4. TypeScript now enforces closure at every call site. Add any missing variants rather than reopening `className`.
5. Commit the closed component. Never ship an open `className` prop into `src/ui/`.

## Structure rules

- `src/ui/` — primitives only. Imports only `src/ui` / `src/lib`. Type-only imports from elsewhere are allowed (erased at build).
- `src/<feature>/` — feature code colocated (`src/gallery`, `src/submit`, `src/review`, `src/adopt`, `src/votes`). No cross-feature value imports — go through `src/lib` or `src/ui`.
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
| 13 | Import boundaries | routes ↛ db; `src/ui` ↛ features; no cross-feature value imports | `check-boundaries` (dependency-cruiser) |
| 14 | Biome lint + format | Style, complexity, naming, import order, `noConsole` | `bun run lint` |

**Hook schedule:**

- **PostToolUse (Edit / Write / MultiEdit on `src/*.{ts,tsx}`):** `frontend-gate.sh` runs Biome on the changed file + the full `check-frontend.ts` walk. Violations block the edit result and feed the error back to the agent.
- **Stop:** `agent-gate.sh` runs the full gate before the agent ends its turn.
- **pre-commit:** lint + typecheck (simple-git-hooks).
- **pre-push:** full strict gate `bun run check:ci` (simple-git-hooks).

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

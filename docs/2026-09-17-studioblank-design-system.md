# StudioBlank Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the entire operator UI onto the StudioBlank design system from `docs/references/DESIGN.md` — light monochrome, square corners, no shadows, Inter/IBM Plex Mono — without touching a single user-visible string, form behavior, or server code.

**Architecture:** A token cascade rewrite in four waves. Wave A replaces the design tokens and base styles and bridges every legacy CSS variable to its new value, so the whole app turns light without any markup changes. Wave B adds the new primitives (Button, Chip, form fields, checkbox/radio, tooltip convention) as new files and pure-CSS rules. Wave C rewrites each route's CSS section and swaps classnames in markup, one screen at a time. Wave D deletes the bridge and runs the final audit.

**Tech Stack:** TanStack Start (React 19, JSX runtime), plain CSS files loaded via `?url` links in `__root.tsx`, `@tanstack/react-form`, Zod, Vitest.

**Source of truth:** `docs/references/DESIGN.md` — every value in this plan is copied from it. When this plan and DESIGN.md disagree, DESIGN.md wins.

**Read before starting:**
- `CLAUDE.md` (repo working rules)
- `docs/references/DESIGN.md` (the spec)
- `docs/reports/2026-09-13-ux-terminology-review.md` — **COPY FREEZE**. All UI strings are final. Tasks may only change `className`, add `data-tip`, and wrap elements in new components. Never edit a string, a form's logic, a validator, or anything in `src/server/**`.
- `docs/reports/2026-09-12-code-review.md` — its "waves 1–5" are done; its wave 6 is separate work, not this plan. (This plan uses letters — Wave A/B/C/D — to avoid colliding with that naming.)

## Design analysis & locked decisions

The spec (`DESIGN.md`) describes an ultra-minimal, whitespace-primary system: monochrome, zero radius, zero shadow, one sans family plus a mono family, and a small set of components (buttons, cards, inputs, chips, lists, checkboxes, radios, tooltips).

Our app is data-dense (timesheets, bars, tables, mini-strips), not marketing. That creates five decisions, locked for all waves:

1. **Radius guard.** DESIGN mandates 0 radius everywhere. We add a global `border-radius: 0 !important` guard in the base styles (Task A1) instead of chasing every rule. Sections rewritten in Wave C stop declaring radius entirely; the guard catches stragglers.
2. **Fonts.** Drop Space Grotesk (display font unused by StudioBlank). Load Inter 300–700 + IBM Plex Mono 400–600. The 300 weight exists specifically for body copy per DESIGN Typography.
3. **Job palette stays, re-tuned.** `--j1`..`--j5` are functional data encoding — job identity on mini-strips and bars (decisions #6, #13, #11) — not decoration. DESIGN's "≤1 accent color / monochrome identity" Don't applies to *chrome* (buttons, links, active tabs, focus), which goes fully monochrome. Chroma rule for Wave C: **color encodes data (job identity, overlap, status); color never decorates.** The five job colors are re-tuned dark-on-light with a shared `--j-ink` text color at ≥4.5:1.
4. **Premium accent.** Warning yellow does double duty as the "premium/overlap/billable-extra" accent: `--premium-fill #ca8a04` for fills/hatching, `--premium-text #a16207` for text on light surfaces (#ca8a04 as text is only 2.9:1; #a16207 passes).
5. **Bridge, then delete.** Wave A keeps legacy variable names (`--ink`, `--panel`, `--text`, …) as aliases to the new tokens so ~1900 lines of existing CSS resolve instantly. Wave C rewrites sections to the new tokens. Wave D deletes the aliases and proves zero references remain. This keeps every commit shippable.

Status mapping (weeks): approved → `solid` (Published), draft/none → `outline` (Draft), submitted → `inverse` (Featured), rejected → `error`. DESIGN's four status chips don't cover our "rejected" and "billable" cases, so Chip adds `error` and `success` kinds.

Tooltips: DESIGN specifies a styled tooltip. We adopt a `[data-tip]` attribute + CSS convention (Task B5) instead of a component, so it works on any element. Native `title` is replaced by `data-tip` where styling matters (trioChip, C7) but **stays on disabled controls** (weekStatus submit) because CSS `:hover` never fires on disabled buttons.

Page rhythm for a data app: page padding 48px, major section gaps 48px, grouped-item gaps 16px, login offset 128px. Data pages use h2-scale 28px page titles, 14px table/body text, mono uppercase 10–11px column headers, mono tabular numerals.

Primitives strategy: **no React wrappers for inputs/checkboxes/radios** (pure CSS — zero form-logic churn). `Button` and `Chip` are tiny components whose logic is pure class-mapping helpers, unit-tested. Cards and lists are CSS classes, not components.

## Repo rules (apply to every task)

- `nvm use` before any command. Gate = `npm run check` (contract-manifest, lint, tsc, unit + integration). It must exit 0 before every commit. No contract test touches CSS, so `npm run check` is this plan's whole gate; Wave D also runs the contract suite and a build as belt-and-braces.
- Dev server: `npm run dev -- --port 3123 --strictPort`. Seeded logins: `admin@example.com` (password in `.dev.vars` `ADMIN_PASSWORD`), `billing@example.com` / `ops@example.com` (`demo-password-123`). Use these for eyeballing.
- **Never change:** any user-visible string (copy freeze), form logic/validators, `src/server/**`, `src/lib/**`, `tests/**`, `tests/contract/**`, `.wayfinder/**`, `docs/**` (this plan file is the one exception — it is new), `drizzle/**`, `src/routeTree.gen.ts` (this plan adds/removes no routes, so it must not churn — if it changes, something is wrong), config files (`vite.config.ts`, `vitest.config.ts`, `wrangler.jsonc`, `tsconfig.json`, `eslint.config.js`).
- **Never add dependencies.** No CSS-in-JS, no component libraries, no animation libraries.
- Markdown for every route change, never strings: a Wave C "markup swap" means `className` changes, `data-tip` attributes, and `Button`/`Chip` wrappers that preserve children exactly.
- Commit messages are lowercase `feat:`/`fix:`/`chore:` one-liners; each task names its exact message. Commit only the files the task touched.
- Checkboxes on the dev gallery route `/dev/components` (dev-only) are the fastest eyeball for primitives; real routes for everything else.

## Global constraints (values verbatim from DESIGN.md)

| Token | Value | Token | Value |
|---|---|---|---|
| `--color-primary` | `#0A0A0A` | `--color-secondary` | `#FAFAFA` |
| `--color-tertiary` | `#D4D4D8` | `--color-success` | `#16A34A` |
| `--color-warning` / `--premium-fill` | `#CA8A04` | `--color-warning-text` / `--premium-text` | `#A16207` |
| `--color-error` | `#DC2626` | `--color-info` | `#71717A` |
| `--surface-base` | `#FAFAFA` | `--surface-inverse` | `#0A0A0A` |
| `--surface-card` | `#FFFFFF` | `--border-card` | `#E5E5E5` |
| `--fill-hover` / `--divider` | `#F4F4F5` | `--border-input-hover` | `#A1A1AA` |

- Spacing (base 16): `--space-1` 4px, `--space-2` 8px, `--space-3` 16px, `--space-4` 32px, `--space-5` 48px, `--space-6` 64px, `--space-7` 96px, `--space-8` 128px. (DESIGN lists up to 128; we name 4–128.)
- Radius: **0 everywhere** (`--radius-none: 0`). Shadows: **none**. Decorative gradients/patterns: **none** (functional hatching for overlap/premium is data encoding, not decoration — allowed).
- Typography: Inter for headline+body, IBM Plex Mono for data. Hero 64/700/1.05 · h1 40/700/1.1 · h2 28/600/1.2 · h3 20/600/1.3 · body 16/300/1.65 · body-sm 14/400/1.6 · caption 12/400/1.5 · mono 13/400/1.5.
- Buttons: primary `#0A0A0A` bg / `#FAFAFA` text / no border; secondary transparent / `#0A0A0A` / 1px `#0A0A0A`; ghost transparent / `#0A0A0A` / none; destructive `#DC2626` / `#FAFAFA` / none. Hover = background inversion. Sizes: sm 32px tall / 16px pad / 12px font / 64px min-width; md 40/24/14/96; lg 48/32/16/128. Disabled: 0.3 opacity, `not-allowed`, no hover.
- Cards: `#FFFFFF` bg, 1px `#E5E5E5` border, 0 radius, no shadow, hover border → `#0A0A0A`.
- Inputs: 40px tall, 14px Inter 400, 1px border; default `#D4D4D8`, hover `#A1A1AA`, focus 2px `#0A0A0A` border, error `#DC2626`, disabled `#E5E5E5` border on `#F4F4F5` bg; no shadow.
- Chips: 0 radius, 12px Inter 400, uppercase, 0.05em tracking, 28px tall. Status kinds: Published = solid black; Draft = transparent/`#71717A`/1px `#D4D4D8`; Archived = `#F4F4F5` bg/`#A1A1AA`; Featured = transparent/`#0A0A0A`/1px `#0A0A0A`. Filter: default transparent/`#71717A`/1px `#D4D4D8`; selected `#0A0A0A`/`#FAFAFA`/1px `#0A0A0A`; hover `#F4F4F5`/`#0A0A0A`/1px `#A1A1AA`.
- Lists: 48px rows, 16px h-padding, 1px `#F4F4F5` divider, hover `#F4F4F5`, active `#0A0A0A` bg + white text, 14px Inter 400.
- Checkboxes 18px: unchecked `#FFFFFF`/1px `#D4D4D8`; checked `#0A0A0A`/1px `#0A0A0A`, check `#FAFAFA`; disabled `#F4F4F5`/`#E5E5E5`/`#A1A1AA`; focus 2px `#0A0A0A` offset 2. Radios 18px, 8px dot.
- Tooltips: `#0A0A0A` bg, `#FAFAFA` text, 12px Inter 400, 8px×12px padding, 0 radius, 200px max-width, 6px triangle arrow, 200ms show / 0ms hide, no shadow.
- Transitions ≤ 200ms. Weight contrast 300 vs 700 for hierarchy. ≥ 64px between major sections where layout allows.

## File structure

| File | Responsibility | Waves |
|---|---|---|
| `src/styles/tokens.css` | All CSS custom properties: StudioBlank core + job palette + legacy bridge (deleted in D1) | A, D |
| `src/styles/global.css` | Base styles, shared primitives, and every route-specific section (rewritten in place) | A, B, C, D |
| `src/styles/ui.css` | NEW. Only new primitive classes: `.btn*`, `.chip*`, `[data-tip]`, `.list`/`.row` | B |
| `src/styles/print.css` | Invoice screen styles + `@media print` overrides | A, C12 |
| `src/components/ui/button.tsx` | NEW. `Button` + `buttonClass` helper | B1, C |
| `src/components/ui/chip.tsx` | NEW. `StatusChip`, `FilterChip` + `statusChipClass`/`filterChipClass` helpers | B2, C |
| `src/routes/__root.tsx` | Font link + stylesheet links (order fixes cascade: tokens → global → ui) | A1, B1 |
| `tests/unit/button.test.ts`, `tests/unit/chip.test.ts` | NEW. Pure class-mapping unit tests | B1, B2 |
| `src/routes/**`, `src/components/*.tsx` | Markup swaps only (className / data-tip / wrappers) | C |
| `src/routes/dev.components.tsx` | Primitive gallery (dev-only) | B6 |

Cascade rule: `__root.tsx` links `global.css` (which `@import`s tokens.css) first, then `ui.css`. `ui.css` holds only *new* class names that global.css never defines, so order can't cause conflicts.

---

## Wave A — Foundation & bridge (2 tasks)

The app goes light in this wave. Mid-flight states are expected: dark-theme leftovers become wrong-looking (blue `--j1` accents, dark hexes) until A2 sweeps them. Do not "fix" A1 by hand-tuning; A2's table is the fix.

### Task A1: Tokens, base styles, and fonts

**Files:**
- Modify: `src/styles/tokens.css` (rewrite, 25 lines → ~60)
- Modify: `src/styles/global.css` (base block only: from `html {` through the `.mono, code, kbd, samp` rule; keep `@import './tokens.css';` and the `* { box-sizing… }` reset untouched)
- Modify: `src/routes/__root.tsx` (font `<link>` href only)

**Interfaces:**
- Produces: every token named in Global Constraints, plus bridge aliases (`--ink`, `--panel`, `--panel2`, `--line`, `--text`, `--muted`, `--faint`, `--err`, `--pos`, `--disp`, `--body`, `--mono`), `--j1..--j5`, `--j-ink`, `--premium-fill`, `--premium-text`, `--space-1..8`, `--radius-none`. All later waves consume these; spell them exactly.

- [ ] **Step 1: Rewrite `src/styles/tokens.css`**

```css
/* StudioBlank core (docs/references/DESIGN.md — Colors) */
:root {
  --color-primary: #0a0a0a;
  --color-secondary: #fafafa;
  --color-tertiary: #d4d4d8;
  --surface-base: #fafafa;
  --surface-inverse: #0a0a0a;
  --surface-card: #ffffff;
  --color-success: #16a34a;
  --color-warning: #ca8a04;
  --color-warning-text: #a16207;
  --color-error: #dc2626;
  --color-info: #71717a;

  /* Named by the DESIGN component tables */
  --border-card: #e5e5e5;
  --border-input-hover: #a1a1aa;
  --fill-hover: #f4f4f5;
  --divider: #f4f4f5;
  --premium-fill: #ca8a04;
  --premium-text: #a16207;

  /* Spacing — base 16 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 32px;
  --space-5: 48px;
  --space-6: 64px;
  --space-7: 96px;
  --space-8: 128px;

  --radius-none: 0;

  /* Metric-close fallbacks: none of these families ship a metric-compatible
     fallback, so we fall back to the generic class and accept the reflow. */
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;

  /* Functional job palette — data encoding, not decoration (#6, #13, #11).
     Dark-on-light re-tune; --j-ink text sits ≥4.5:1 on every --jN.
     One chroma exception: DESIGN's monochrome rule governs chrome, not data. */
  --j1: #1d4ed8;
  --j2: #c2410c;
  --j3: #15803d;
  --j4: #a16207;
  --j5: #6d28d9;
  --j-ink: #fafafa;
}

/* Legacy bridge — deleted in Wave D. Every pre-reskin rule resolves through
   these aliases; Wave C rewrites sections to the new tokens above. */
:root {
  --ink: var(--surface-base);
  --panel: var(--surface-card);
  --panel2: var(--fill-hover);
  --line: var(--color-tertiary);
  --text: var(--color-primary);
  --muted: var(--color-info);
  --faint: var(--border-input-hover);
  --err: var(--color-error);
  --pos: var(--color-success);
  --disp: var(--font-body);
  --body: var(--font-body);
  --mono: var(--font-mono);
}
```

- [ ] **Step 2: Replace the base block in `src/styles/global.css`**

Delete from the `html {` rule through the `.mono, code, kbd, samp {` rule (keep the `@import` and box-sizing reset above it), and write:

```css
html {
  color-scheme: light;
}

body {
  background: var(--surface-base);
  color: var(--color-primary);
  font: 300 16px/1.65 var(--font-body);
}

/* radius-none is a system invariant (DESIGN "Border Radius" + "Don'ts"):
   no component ever rounds, so enforce it globally rather than per-rule. */
*,
*::before,
*::after {
  border-radius: 0 !important;
}

a {
  color: var(--color-primary);
}

:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* DESIGN "Don'ts": transitions ≤ 200ms. 120ms reads instant, not animated. */
button,
a,
input,
select,
textarea,
summary {
  transition:
    background-color 120ms linear,
    border-color 120ms linear,
    color 120ms linear;
}

h1,
h2,
h3 {
  font-family: var(--font-body);
}

h1 {
  font: 700 40px/1.1 var(--font-body);
}

h2 {
  font: 600 28px/1.2 var(--font-body);
}

h3 {
  font: 600 20px/1.3 var(--font-body);
}

.mono,
code,
kbd,
samp {
  font-family: var(--font-mono);
}

/* Type utilities — DESIGN Typography, exact values */
.t-hero { font: 700 64px/1.05 var(--font-body); }
.t-h1 { font: 700 40px/1.1 var(--font-body); }
.t-h2 { font: 600 28px/1.2 var(--font-body); }
.t-h3 { font: 600 20px/1.3 var(--font-body); }
.t-body { font: 300 16px/1.65 var(--font-body); }
.t-body-sm { font: 400 14px/1.6 var(--font-body); }
.t-caption { font: 400 12px/1.5 var(--font-body); }
.t-mono { font: 400 13px/1.5 var(--font-mono); }
```

- [ ] **Step 3: Swap the font link in `src/routes/__root.tsx`**

Replace the Google Fonts href (Space Grotesk + Inter + IBM Plex Mono) with:

```
https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap
```

Change nothing else in the file.

- [ ] **Step 4: Run the gate**

Run: `nvm use && npm run check`
Expected: exit 0 (CSS/TSX changes only; no test touches styles).

- [ ] **Step 5: Eyeball**

Run: `npm run dev -- --port 3123 --strictPort`, open `http://localhost:3123/login`.
Expected: light `#FAFAFA` page, Inter text, black headings, square corners everywhere. Legacy dark-theme rules now render as light surfaces via the bridge. Blue `--j1` button and dark leftover hexes are **expected** here — A2 fixes them next. Do not hand-tune.

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css src/styles/global.css src/routes/__root.tsx
git commit -m "feat: studioblank tokens, base styles, and font load"
```

### Task A2: Sweep legacy hardcoded colors onto the bridge

**Files:**
- Modify: `src/styles/global.css` (the rules listed below, values only)
- Modify: `src/styles/print.css` (three rules, values only)

**Interfaces:**
- Consumes: tokens from A1.
- Produces: a styles tree with zero pre-reskin hex literals in the swept rules. Later waves rewrite these same sections structurally; this task only makes every route presentable.

Every dark-theme hex below is replaced **in place** (selector stays, declarations change). Old → new:

| Rule | New declarations |
|---|---|
| `.form-error` | `background: transparent; border: 1px solid var(--color-error); color: var(--color-error);` |
| all `#262a31` dividers (`.intervallist tbody td`, `.recontable` rules, `.dailytable` rules, `.intervalaudit td`, `.audit-trail li` dotted border) | `var(--divider)` (dotted stays dotted) |
| `.dm.premium` | `background: transparent; border: 1px solid var(--premium-fill);` and its `b` → `color: var(--premium-text)` |
| `.ovltag`, `.ministrip-overlap-tag` | `color: var(--premium-text); background: var(--surface-base); border: 1px solid var(--premium-fill);` |
| `.tag-ok` | `border-color: var(--color-success); background: transparent; color: var(--color-success);` |
| `.tag-warn` | `border-color: var(--premium-fill); background: transparent; color: var(--premium-text);` |
| `.recon .bar.premium` and `.effortbars .row .bar.premium` | `background: repeating-linear-gradient(45deg, var(--premium-fill) 0 4px, transparent 4px 8px); border-left: 1px solid var(--premium-fill);` |
| `#0e1013` in `.job-c1`…`.job-c5`, `.ministrip-block`, `.recon .bar .lbl` | `var(--j-ink)` |
| `#0e1013` in `.approverview-approve`, `.approverview-reject` | `var(--color-secondary)` |
| `.wtag.human` | `background: var(--color-primary); color: var(--color-secondary);` (drop `--j1`) |
| `.wtag.agent` | `background: transparent; border: 1px solid var(--color-tertiary); color: var(--color-info);` (drop `--j5`) |
| `.intervalaudit tr.flag-hover` | `background: var(--fill-hover); outline: 1px solid var(--premium-fill);` |
| `.btn-primary` | `background: var(--color-primary); color: var(--color-secondary);` — `:hover`: `background: var(--color-secondary); color: var(--color-primary); border: 1px solid var(--color-primary);` (drop `--j1`, `#0e1013`, `filter: brightness…`) |
| active-tab underlines: `.admin-subnav a.active`, `.subtab[aria-selected='true']`, `.reports .tab[aria-selected='true']` | underline/border color → `var(--color-primary)` |
| `.weekstatus-badge.submitted` | `color: var(--color-info); border-color: var(--color-tertiary);` |
| `.weekstatus-submit` | `background: transparent; border: 1px solid var(--color-primary); color: var(--color-primary);` — `:hover`: `background: var(--fill-hover);` |
| `.util-row .fill` | `background: var(--color-primary);` |
| `.util-row .fill.high` | `background: var(--premium-fill);` |
| `.audit-trail .audit-kind` | `color: var(--color-info);` |
| `.approvalsqueue li.selected button` | `border-color: var(--color-primary); background: var(--surface-card);` |
| `.period button[aria-selected='true']` | `border-color: var(--color-primary);` |
| `.panel` | `background: var(--surface-card); border: 1px solid var(--border-card);` |

Keep as-is: `.ovl` and `.ministrip-overlap` black `rgba(...)` hatching (already reads correctly on light).

`print.css`: in `.invoice-actions a`, `.invoice-actions button`, and `.invoice-picker-list a:hover`, replace `var(--j1)` with `var(--color-primary)`.

- [ ] **Step 1: Apply the table above to `global.css` and `print.css`** (values only; no selectors added/removed)

- [ ] **Step 2: Verify no swept hex remains**

Run: `rg -n '#262a31|#241f16|#4a3f2e|#2a1c19|#4a2f28|#33452f|#16211a|#6b4e1f|#0e1013|#233247|#2b2340|var\(--j1\)' src/styles/`
Expected: no matches. (Other hexes may exist in ui sections not yet swept — Wave C handles them; only this list must be gone.)

- [ ] **Step 3: Run the gate**

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 4: Eyeball every route**

`/login`, `/today`, `/reports` (all tabs), `/approvals`, `/invoice`, `/admin/clients`, `/admin/projects`, `/admin/jobs`, `/admin/workers`, `/dev/components`.
Expected: light monochrome surfaces everywhere; the only chroma left is the functional job palette on mini-strips/bars and the success/error/premium status accents. Buttons are black/white. No dark panels, no colored tabs.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css src/styles/print.css
git commit -m "fix: bridge legacy theme colors to studioblank tokens"
```

---

## Wave B — Primitives (6 tasks)

New files and pure-CSS rules. Nothing existing is rewritten here except the shared form-field section (B3) and checkbox/radio additions (B4), so the wave is low-risk and each primitive is independently testable.

### Task B1: Button component

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/styles/ui.css`
- Modify: `src/routes/__root.tsx` (add ui.css link after the global.css link)
- Test: `tests/unit/button.test.ts`

**Interfaces:**
- Produces: `type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'`; `type ButtonSize = 'sm' | 'md' | 'lg'`; `buttonClass(variant = 'secondary', size = 'md', extra = ''): string`; `Button({ variant, size, className, type = 'button', ...rest })` forwarding all `ComponentProps<'button'>`. Wave C consumes `Button` and `buttonClass` with exactly these names.

- [ ] **Step 1: Write the failing test `tests/unit/button.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buttonClass } from '~/components/ui/button'

describe('buttonClass', () => {
  it('maps variant and size', () => {
    expect(buttonClass('primary', 'lg')).toBe('btn btn--primary btn--lg')
  })

  it('defaults to secondary md with no extra', () => {
    expect(buttonClass()).toBe('btn btn--secondary btn--md')
  })

  it('appends extra classes last', () => {
    expect(buttonClass('ghost', 'sm', 'nav-extra')).toBe(
      'btn btn--ghost btn--sm nav-extra',
    )
  })

  it('falls back on unknown variant or size', () => {
    expect(buttonClass('sparkly' as never, 'xl' as never)).toBe(
      'btn btn--secondary btn--md',
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/button.test.ts`
Expected: FAIL — cannot resolve `~/components/ui/button`.

- [ ] **Step 3: Create `src/components/ui/button.tsx`**

```tsx
import type { ComponentProps } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive']
const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

export function buttonClass(variant = 'secondary', size = 'md', extra = '') {
  const v = VARIANTS.includes(variant) ? variant : 'secondary'
  const s = SIZES.includes(size) ? size : 'md'
  return ['btn', `btn--${v}`, `btn--${s}`, extra].filter(Boolean).join(' ')
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/button.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create `src/styles/ui.css` with the button block**

```css
/* Buttons — DESIGN "Buttons". Hover = background inversion, never a new hue. */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  font-family: var(--font-body);
  font-weight: 500;
  cursor: pointer;
}

.btn--sm { height: 32px; min-width: 64px; padding: 0 16px; font-size: 12px; }
.btn--md { height: 40px; min-width: 96px; padding: 0 24px; font-size: 14px; }
.btn--lg { height: 48px; min-width: 128px; padding: 0 32px; font-size: 16px; }

.btn--primary { background: var(--color-primary); color: var(--color-secondary); }
.btn--primary:hover:not(:disabled) {
  background: var(--color-secondary);
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.btn--secondary {
  background: transparent;
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.btn--secondary:hover:not(:disabled) {
  background: var(--color-primary);
  color: var(--color-secondary);
}

.btn--ghost { background: transparent; color: var(--color-primary); }
.btn--ghost:hover:not(:disabled) { background: var(--fill-hover); }

.btn--destructive { background: var(--color-error); color: var(--color-secondary); }
.btn--destructive:hover:not(:disabled) {
  background: var(--color-secondary);
  color: var(--color-error);
  border-color: var(--color-error);
}

/* DESIGN: disabled = 0.3 opacity, not-allowed, no hover state. */
.btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

- [ ] **Step 6: Link ui.css in `src/routes/__root.tsx`**

After the global.css import/link, add `import uiCss from '~/styles/ui.css?url'` and a matching `<link rel="stylesheet" href={uiCss} />` **after** the global.css link (cascade order).

- [ ] **Step 7: Gate, eyeball, commit**

Run: `npm run check` → exit 0. (Button is not rendered anywhere yet — classes exist only; eyeball happens in B6.)
```bash
git add src/components/ui/button.tsx src/styles/ui.css src/routes/__root.tsx tests/unit/button.test.ts
git commit -m "feat: button primitive"
```

### Task B2: Chip components

**Files:**
- Create: `src/components/ui/chip.tsx`
- Modify: `src/styles/ui.css` (append chip block)
- Test: `tests/unit/chip.test.ts`

**Interfaces:**
- Produces: `type ChipKind = 'solid' | 'outline' | 'inverse' | 'muted' | 'error' | 'success'`; `statusChipClass(kind = 'outline', extra = ''): string`; `filterChipClass(selected = false, extra = ''): string`; `StatusChip({ kind, ...span props })`; `FilterChip({ selected, ...button props })` (renders `<button type="button" aria-pressed={selected}>`). C7 and C10 consume these names.

- [ ] **Step 1: Write the failing test `tests/unit/chip.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { filterChipClass, statusChipClass } from '~/components/ui/chip'

describe('statusChipClass', () => {
  it('maps kind', () => {
    expect(statusChipClass('solid')).toBe('chip chip--solid')
  })

  it('defaults to outline and appends extra', () => {
    expect(statusChipClass(undefined, 'extra-x')).toBe('chip chip--outline extra-x')
  })

  it('falls back on unknown kind', () => {
    expect(statusChipClass('glowy' as never)).toBe('chip chip--outline')
  })
})

describe('filterChipClass', () => {
  it('is unselected by default', () => {
    expect(filterChipClass()).toBe('chip chip--filter')
  })

  it('adds selected and extra', () => {
    expect(filterChipClass(true, 'tab-x')).toBe('chip chip--filter chip--selected tab-x')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/chip.test.ts`
Expected: FAIL — cannot resolve `~/components/ui/chip`.

- [ ] **Step 3: Create `src/components/ui/chip.tsx`**

```tsx
import type { ComponentProps } from 'react'

/* solid = DESIGN "Published", outline = "Draft", inverse = "Featured",
   muted = "Archived". error/success are app extensions (rejected weeks,
   billable tag) — same construction, status colors. */
export type ChipKind = 'solid' | 'outline' | 'inverse' | 'muted' | 'error' | 'success'

const KINDS: ChipKind[] = ['solid', 'outline', 'inverse', 'muted', 'error', 'success']

export function statusChipClass(kind: ChipKind = 'outline', extra = '') {
  const k = KINDS.includes(kind) ? kind : 'outline'
  return ['chip', `chip--${k}`, extra].filter(Boolean).join(' ')
}

export function filterChipClass(selected = false, extra = '') {
  return ['chip', 'chip--filter', selected ? 'chip--selected' : '', extra]
    .filter(Boolean)
    .join(' ')
}

export function StatusChip({
  kind = 'outline',
  className,
  ...rest
}: ComponentProps<'span'> & { kind?: ChipKind }) {
  return <span className={statusChipClass(kind, className)} {...rest} />
}

export function FilterChip({
  selected = false,
  className,
  type = 'button',
  ...rest
}: ComponentProps<'button'> & { selected?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={filterChipClass(selected, className)}
      {...rest}
    />
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/chip.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Append the chip block to `src/styles/ui.css`**

```css
/* Chips — DESIGN "Chips". Uppercase micro-labels, 28px tall, square. */
.chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  font: 400 12px/1 var(--font-body);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid transparent;
}

.chip--solid { background: var(--color-primary); color: var(--color-secondary); }
.chip--outline {
  background: transparent;
  color: var(--color-info);
  border-color: var(--color-tertiary);
}
.chip--inverse {
  background: transparent;
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.chip--muted { background: var(--fill-hover); color: var(--border-input-hover); }
.chip--error {
  background: transparent;
  color: var(--color-error);
  border-color: var(--color-error);
}
.chip--success {
  background: transparent;
  color: var(--color-success);
  border-color: var(--color-success);
}

.chip--filter:hover {
  background: var(--fill-hover);
  color: var(--color-primary);
  border-color: var(--border-input-hover);
}
.chip--selected,
.chip--selected:hover {
  background: var(--color-primary);
  color: var(--color-secondary);
  border-color: var(--color-primary);
}
```

- [ ] **Step 6: Gate and commit**

Run: `npm run check` → exit 0.
```bash
git add src/components/ui/chip.tsx src/styles/ui.css tests/unit/chip.test.ts
git commit -m "feat: chip primitives"
```

### Task B3: Form field styles

**Files:**
- Modify: `src/styles/global.css` (shared form primitives section only: `.field` and the `.field input/select/textarea` rules → replaced; `.field-error`, `.form-error`, `.checkline`, `.btn-primary` stay as bridged in A2)

No markup changes — `.field` labels already exist in entryForm; login gets its `.field` wrappers in C2.

- [ ] **Step 1: Replace the form primitives block**

Delete the `.field` rule and all `.field input`, `.field select`, `.field textarea` (and combined) rules. Write, in their place:

```css
/* Inputs — DESIGN "Input Fields". Element-level so bare inputs (login,
   date nav) get the same treatment without wrappers. */
input,
select,
textarea {
  background: var(--surface-card);
  border: 1px solid var(--color-tertiary);
  color: var(--color-primary);
  font: 400 14px/1.4 var(--font-body);
  height: 40px;
  padding: 0 12px;
  cursor: auto;
}

textarea {
  height: auto;
  min-height: 64px;
  padding: 8px 12px;
  resize: vertical;
}

input:hover,
select:hover,
textarea:hover {
  border-color: var(--border-input-hover);
}

/* DESIGN input focus is a 2px border, not the base outline. */
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  border: 2px solid var(--color-primary);
  outline: none;
}

input:disabled,
select:disabled,
textarea:disabled {
  background: var(--fill-hover);
  border-color: var(--border-card);
  color: var(--border-input-hover);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font: 400 12px/1.5 var(--font-body);
  color: var(--color-info);
}

.field:has(.field-error) input,
.field:has(.field-error) select,
.field:has(.field-error) textarea {
  border-color: var(--color-error);
}

.checkline {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font: 400 12px/1.5 var(--font-body);
  color: var(--color-info);
}
```

(The old `.field input` rules must be gone — element rules replace them. `.field-error` keeps its A2 look, bridged through `--err`.)

- [ ] **Step 2: Gate**

Run: `npm run check` → exit 0.

- [ ] **Step 3: Eyeball**

`/today` entry form and `/login`: 40px square inputs, gray 1px borders, black 2px focus border, error inputs red-bordered via `:has`.

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: studioblank form field styles"
```

### Task B4: Checkbox & radio styles

**Files:**
- Modify: `src/styles/global.css` (new rules appended immediately after the form primitives section from B3 — after the input block so `input[type='checkbox']` attribute selectors win any tie)

- [ ] **Step 1: Append the control block**

```css
/* Checkboxes & radios — DESIGN "Checkboxes"/"Radio Buttons". 18px, square,
   appearance:none so the ✓ and the dot are ours. */
input[type='checkbox'],
input[type='radio'] {
  appearance: none;
  width: 18px;
  height: 18px;
  padding: 0;
  background: var(--surface-card);
  border: 1px solid var(--color-tertiary);
  cursor: pointer;
  flex: none;
  display: grid;
  place-content: center;
}

input[type='checkbox']:hover,
input[type='radio']:hover {
  border-color: var(--border-input-hover);
}

input[type='checkbox']:checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

input[type='checkbox']:checked::after {
  content: '✓';
  color: var(--color-secondary);
  font: 700 12px/1 var(--font-body);
}

/* Square dot: DESIGN's radius-zero rule applies to the dot too. */
input[type='radio']:checked::after {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--color-primary);
}

input[type='checkbox']:disabled,
input[type='radio']:disabled {
  background: var(--fill-hover);
  border-color: var(--border-card);
  cursor: not-allowed;
}

input[type='checkbox']:disabled:checked,
input[type='radio']:disabled:checked {
  background: var(--fill-hover);
}

input[type='checkbox']:disabled:checked::after,
input[type='radio']:disabled:checked::after {
  color: var(--border-input-hover);
  background: var(--border-input-hover);
}
```

- [ ] **Step 2: Gate**

Run: `npm run check` → exit 0.

- [ ] **Step 3: Eyeball**

`/today` entry form's "crosses midnight" checkbox; `/admin/workers` "Show archived" + role checkboxes; `/dev/components`. Checked = solid black square with white ✓; radios show square dots; disabled controls wash out.

- [ ] **Step 4: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: square checkbox and radio styles"
```

### Task B5: Tooltip convention (`[data-tip]`)

**Files:**
- Modify: `src/styles/ui.css` (append)

No markup changes yet — C7 swaps `title` → `data-tip` where styling matters. Native `title` attributes on **disabled** controls (weekStatus submit) stay native forever: CSS `:hover` cannot fire on disabled elements.

- [ ] **Step 1: Append the tooltip block to `src/styles/ui.css`**

```css
/* Tooltips — DESIGN "Tooltips". Attribute convention: any element with
   data-tip gets a bubble above it on hover AND keyboard focus.
   200ms show delay, 0ms hide, via state-dependent transition-delay. */
[data-tip] {
  position: relative;
}

[data-tip]::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: var(--surface-inverse);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0ms linear, visibility 0ms linear;
  pointer-events: none;
}

[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface-inverse);
  color: var(--color-secondary);
  font: 400 12px/1.5 var(--font-body);
  padding: 8px 12px;
  max-width: 200px;
  white-space: normal;
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0ms linear, visibility 0ms linear;
  pointer-events: none;
  z-index: 10;
}

[data-tip]:hover::before,
[data-tip]:hover::after,
[data-tip]:focus-within::before,
[data-tip]:focus-within::after {
  opacity: 1;
  visibility: visible;
  transition: opacity 150ms linear 200ms, visibility 0ms linear 200ms;
}
```

- [ ] **Step 2: Gate and commit**

Run: `npm run check` → exit 0.
```bash
git add src/styles/ui.css
git commit -m "feat: tooltip convention (data-tip)"
```

### Task B6: Primitive gallery on `/dev/components`

**Files:**
- Modify: `src/routes/dev.components.tsx` (append one section; do not touch existing sections)
- Modify: `src/styles/ui.css` (append `.list`/`.row`)

**Interfaces:**
- Consumes: `Button`, `FilterChip`, `StatusChip` from B1/B2; `[data-tip]` from B5.

- [ ] **Step 1: Append the list block to `src/styles/ui.css`**

```css
/* Lists — DESIGN "Lists". 48px rows, hairline dividers, hover fill. */
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 48px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--divider);
  font: 400 14px/1.6 var(--font-body);
}

.row:hover { background: var(--fill-hover); }

.row.active {
  background: var(--color-primary);
  color: var(--color-secondary);
}
```

- [ ] **Step 2: Append a "Primitives" section to `dev.components.tsx`**

At the end of the page, add a `<section>` (matching the existing sections' heading style) containing:
- Buttons: all 4 variants × 3 sizes, plus a disabled primary.
- `FilterChip` unselected and selected (labels: any short dev-only strings — this route is dev-only and pre-dates the copy freeze pattern of user strings; keep them obviously dev like `Filter A`).
- `StatusChip` for all 6 kinds (dev-only labels `Solid`, `Outline`, `Inverse`, `Muted`, `Error`, `Success`).
- An input (default), a disabled input, and a `.field` label wrapping an input + `.field-error` span (dev-only placeholder strings).
- A checkbox tri-state (unchecked/checked/disabled-checked) and a radio pair.
- `<span data-tip="Hover or focus me">hover target</span>`.
- A `.list` with three `.row`s and one `.row.active`.

- [ ] **Step 3: Gate, eyeball, commit**

Run: `npm run check` → exit 0.
Eyeball: `npm run dev -- --port 3123 --strictPort`, open `/dev/components`. Expected: every primitive matches its DESIGN table; tooltip shows on hover *and* on keyboard focus (Tab to it); rows hover/active correctly.

```bash
git add src/routes/dev.components.tsx src/styles/ui.css
git commit -m "feat: primitive gallery on /dev/components"
```

---

## Wave C — Screen by screen (12 tasks)

Each task: rewrite the named `global.css` section(s) to the CSS below, then make the listed markup swaps (className / imports / wrappers only — **strings, form logic, and props semantics never change**; `aria-*` attributes are preserved), then gate, eyeball the route logged in as the named role, and commit.

Shared conventions for every rewritten section (not repeated per task):
- Page containers: `padding: var(--space-5) var(--space-4);` with `display: grid; gap: var(--space-5);` between major sections (≥64px where layout allows; 48px where a lane list makes 64px cavernous).
- Data tables: `font: 400 14px/1.6 var(--font-body);` body; `thead th` = `font: 500 10px/1.2 var(--font-mono); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-info); text-align: left; border-bottom: 1px solid var(--color-tertiary); padding: 6px 10px;`; row dividers `1px solid var(--divider)`; numerals `font-family: var(--font-mono); font-variant-numeric: tabular-nums;`.
- Buttons in rows/forms → `Button` (usually `ghost`/`sm`); primary actions → `primary`/`md`; destructive → `destructive`.
- Chroma rule: color only where it encodes data (job fills, success/error/premium semantics). Everything else is black/white/gray.
- Rewritten rules stop declaring `border-radius` (A1's guard owns it).

### Task C1: App shell & nav

**Files:**
- Modify: `src/routes/_app/route.tsx`
- Modify: `src/styles/global.css` (shell section: `.app-shell`, `.app-nav` + its links/`.active`/`.nav-user`/`.nav-spacer`, `.panel`)

**Markup swaps (`_app/route.tsx`):** import `Button` from `~/components/ui/button`; the plain sign-out `<button>` → `<Button variant="ghost" size="sm">` with its child text unchanged (keep the handler).

- [ ] **Step 1: Rewrite the shell section**

```css
.app-shell { min-height: 100vh; }

.app-nav {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 48px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-tertiary);
  background: var(--surface-base);
}

.app-nav a {
  font: 500 12px/1 var(--font-body);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-info);
  text-decoration: none;
  padding: 4px 0;
  border-bottom: 2px solid transparent;
}

.app-nav a:hover { color: var(--color-primary); }

.app-nav a.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.nav-spacer { flex: 1; }

.nav-user {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-info);
}

.panel {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  padding: var(--space-3);
}
```

- [ ] **Step 2: Markup swap** (Button wrapper as above)
- [ ] **Step 3: Gate** — `npm run check` → exit 0
- [ ] **Step 4: Eyeball** every route's chrome: 48px bar, uppercase micro-nav, black active underline, square ghost Sign out.
- [ ] **Step 5: Commit** — `git add src/routes/_app/route.tsx src/styles/global.css && git commit -m "feat: app shell on studioblank"`

### Task C2: Login & set-password

**Files:**
- Modify: `src/routes/login.tsx`, `src/routes/set-password.tsx`
- Modify: `src/styles/global.css` (login section: `.login-page`, `.login-form`; `.field-error`/`.form-error` already bridged)

**Markup swaps (both files):** bare `<label>Text <input …></label>` → `<label className="field"><span>Text</span><input … /></label>` — label text strings unchanged, input props unchanged. Unclassed submit/Sign-in buttons → `<Button variant="primary">` (default md), children unchanged.

- [ ] **Step 1: Rewrite the login section**

```css
.login-page {
  max-width: 420px;
  margin: var(--space-8) auto 0;
  padding: 0 var(--space-3);
}

.login-page h1 {
  font: 600 28px/1.2 var(--font-body);
  margin: 0 0 var(--space-4);
}

.login-form {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
```

(Keep `.field-error`/`.form-error` rules; if the current `.login-page h1`/margin values differ, replace them wholesale with the above.)

- [ ] **Step 2: Markup swaps** as listed
- [ ] **Step 3: Gate** — `npm run check` → exit 0
- [ ] **Step 4: Eyeball** `/login` + a set-password flow: card centered 128px down, labels caption-gray above 40px inputs, black primary button.
- [ ] **Step 5: Commit** — `git add src/routes/login.tsx src/routes/set-password.tsx src/styles/global.css && git commit -m "feat: login and set-password on studioblank"`

### Task C3: Today view (day math, mini-strip, interval list)

**Files:**
- Modify: `src/routes/_app/today.tsx`, `src/components/{dateNav,intervalList}.tsx` (+ `dayMathChip.tsx`/`miniStrip.tsx` only if they carry classes listed below)
- Modify: `src/styles/global.css` (sections: `.datenav`, `.daymath`/`.dm`, `.ministrip*`, `.intervallist*`, `.today*`, `.how-counted*`, `.job-c*`)

**Markup swaps:** dateNav prev/next buttons → `<Button variant="ghost" size="sm">`; intervalList row-action buttons → `<Button variant="ghost" size="sm">`; how-counted close → `<Button variant="ghost" size="sm">`. All children/handlers/`aria-*` unchanged. Delete the bespoke `.datenav button`/`.datenav input` rules from CSS (element rules from B3 cover them).

- [ ] **Step 1: Rewrite the sections**

```css
.today {
  padding: var(--space-5) var(--space-4);
  display: grid;
  gap: var(--space-5);
  max-width: 1100px;
}

.today-lanes { display: grid; gap: var(--space-4); }
.today-lane { display: grid; gap: var(--space-3); }
.today-lane-head h2,
.today-section-title { font: 600 20px/1.3 var(--font-body); margin: 0; }

.datenav {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: 13px;
}
.datenav input { width: 130px; }

.daymath { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.dm {
  font-family: var(--font-mono);
  font-size: 12px;
  border: 1px solid var(--color-tertiary);
  padding: 6px 12px;
  background: var(--surface-card);
}
.dm .k { color: var(--color-info); margin-right: 6px; }
.dm b { font-weight: 600; color: var(--color-primary); }
.dm.premium { border-color: var(--premium-fill); }
.dm.premium b { color: var(--premium-text); }

.ministrip {
  position: relative;
  width: 100%;
  height: 28px;
  background: var(--fill-hover);
  border: 1px solid var(--color-tertiary);
  overflow: hidden;
}
.ministrip-block {
  position: absolute;
  top: 4px;
  bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  min-width: 1px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  color: var(--j-ink);
}
.ministrip-overlap {
  position: absolute;
  bottom: 2px;
  height: 6px;
  background: repeating-linear-gradient(45deg, transparent 0 3px, rgba(10, 10, 10, 0.45) 3px 5px);
}
.ministrip-overlap-tag {
  position: absolute;
  color: var(--premium-text);
  background: var(--surface-base);
  border: 1px solid var(--premium-fill);
  padding: 0 4px;
  line-height: 12px;
  font-size: 9px;
}
.ministrip-legend {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-info);
}

.intervallist {
  width: 100%;
  border-collapse: collapse;
  font: 400 14px/1.6 var(--font-body);
}
.intervallist thead th {
  font: 500 10px/1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-info);
  text-align: left;
  border-bottom: 1px solid var(--color-tertiary);
  padding: 6px 10px;
}
.intervallist tbody td {
  border-bottom: 1px solid var(--divider);
  padding: 9px 10px;
}
.intervallist tbody tr:last-child td { border-bottom: none; }
.intervallist .mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--color-primary);
}
.intervallist-actions { display: flex; gap: var(--space-2); }
.intervallist-empty {
  padding: var(--space-3);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-info);
  text-align: center;
  background: var(--fill-hover);
  border: 1px solid var(--color-tertiary);
}

.how-counted-card {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  padding: var(--space-4);
  font-size: 14px;
}

.job-c1, .job-c2, .job-c3, .job-c4, .job-c5 { color: var(--j-ink); }
```

(`.job-cN` backgrounds keep their `var(--jN)` from the existing job-colors section — only the text color rule changes. `.job-dot-cN` rules stay as-is.)

- [ ] **Step 2: Markup swaps** as listed
- [ ] **Step 3: Gate** — `npm run check` → exit 0
- [ ] **Step 4: Eyeball** `/today` as `ops@example.com`: date nav mono, day-math chips square with premium-bordered variant, mini-strip light with dark job fills + hatched overlap, table per shared conventions, empty state boxed mono.
- [ ] **Step 5: Commit** — `git add src/routes/_app/today.tsx src/components/dateNav.tsx src/components/intervalList.tsx src/styles/global.css && git commit -m "feat: today view on studioblank"` (add any other component files actually touched)

### Task C4: Entry form

**Files:**
- Modify: `src/components/entryForm.tsx`
- Modify: `src/styles/global.css` (`.entryform*` section)

**Markup swaps:** the submit button `<button type="submit" className="btn-primary">` → `<Button type="submit" variant="primary">` (conditional 'Save'/'Add' child unchanged); the Cancel button → `<Button variant="secondary">`. Keep `disabled` props exactly as-is.

- [ ] **Step 1: Rewrite the section**

```css
.entryform {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface-card);
  border: 1px solid var(--border-card);
}
.entryform-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.entryform textarea { font-size: 14px; }
.entryform-actions { display: flex; gap: var(--space-2); }
.entryform-duration {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-info);
}
```

- [ ] **Step 2: Markup swaps** as listed (`.btn-primary` disappears from this file)
- [ ] **Step 3: Gate** — `npm run check` → exit 0
- [ ] **Step 4: Eyeball** `/today` entry form: card, two-column row, duration preview in gray mono, black Save button inverting on hover.
- [ ] **Step 5: Commit** — `git add src/components/entryForm.tsx src/styles/global.css && git commit -m "feat: entry form on studioblank"`

### Task C5: Admin chrome & structure tree

**Files:**
- Modify: `src/components/structureTree.tsx`
- Modify: `src/styles/global.css` (`.admin*` layout/subnav/head + `.tree*` rules)

**Markup swaps:** every plain `<button>` inside the tree (add/edit forms' submit/cancel, row actions) → `<Button variant="ghost" size="sm">` with children/handlers unchanged. `.tag` badges keep their classes (A2 already restyled `.tag`/`.tag-ok`/`.tag-warn`).

- [ ] **Step 1: Rewrite the sections**

```css
.admin {
  padding: var(--space-5) var(--space-4);
  display: grid;
  gap: var(--space-4);
  max-width: 1100px;
}

.admin-subnav {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-tertiary);
}
.admin-subnav a {
  font: 500 12px/1 var(--font-body);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-info);
  text-decoration: none;
  padding: var(--space-2) var(--space-3);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.admin-subnav a:hover { color: var(--color-primary); }
.admin-subnav a.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.admin-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.admin-head h1 { font: 600 28px/1.2 var(--font-body); margin: 0; }
.admin-head .spacer { flex: 1; }

.tree { display: grid; gap: var(--space-3); }
.tree-empty {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-info);
  text-align: center;
  padding: var(--space-3);
  background: var(--fill-hover);
  border: 1px solid var(--color-tertiary);
}
.tree-client {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  padding: var(--space-3) var(--space-4);
  display: grid;
  gap: var(--space-3);
}
.tree-client.archived,
.tree-project.archived,
.tree-row.archived { opacity: 0.5; }
.tree-projects {
  display: grid;
  gap: var(--space-2);
  margin-left: var(--space-3);
}
.tree-project {
  background: var(--surface-base);
  border: 1px solid var(--border-card);
  padding: var(--space-3);
  display: grid;
  gap: var(--space-2);
}
.tree-jobs {
  display: grid;
  gap: var(--space-1);
  margin-left: var(--space-3);
}
.tree-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-1) var(--space-2);
  background: var(--fill-hover);
}
.tree-row .name { font-weight: 500; color: var(--color-primary); }
.tree-rate {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-info);
  margin-left: auto;
}
.tree-add,
.tree-edit {
  background: var(--surface-card);
  border: 1px dashed var(--color-tertiary);
}
```

(Keep `.tree-input` as a plain class hook — inputs are element-styled by B3; keep `.tree-rate { width: 160px; }` if present. Fold any `.tree-actions` into `display: flex; gap: var(--space-2);`.)

- [ ] **Step 2: Markup swaps** as listed
- [ ] **Step 3: Gate** — `npm run check` → exit 0
- [ ] **Step 4: Eyeball** `/admin/clients` + `/admin/jobs` as admin: white client cards on gray, nested project slabs, hairline job rows, dashed edit trays, archived branches faded.
- [ ] **Step 5: Commit** — `git add src/components/structureTree.tsx src/styles/global.css && git commit -m "feat: structure tree on studioblank"`

### Task C6: Worker roster & invites

**Files:**
- Modify: `src/components/workerRoster.tsx`, `src/components/inviteForm.tsx`
- Modify: `src/styles/global.css` (`.roster*`, `.rolecheck`, `.admin-form`, `.status-*`, `.wtag*`)

**Markup swaps:** roster row buttons → `<Button variant="ghost" size="sm">`; invite form submit → `<Button type="submit" variant="primary">`; delete bespoke `.roster-select` rule (element styles cover it). `.wtag` classes stay in markup (final CSS below); swapping to `StatusChip` (human=`solid`, agent=`outline`) is allowed but not required — keep classes if simpler.

- [ ] **Step 1: Rewrite the sections**

```css
.roster { display: grid; gap: var(--space-4); }
.roster-email {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-info);
}

.rolecheck {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font: 400 12px/1.5 var(--font-body);
  color: var(--color-info);
  margin-right: var(--space-2);
}
.rolecheck input[disabled] { opacity: 0.6; }

.admin-form { display: grid; gap: var(--space-3); }
.status-ok {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-success);
}
.status-msg {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-info);
}

.wtag {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 2px 6px;
  display: inline-block;
}
.wtag.human { background: var(--color-primary); color: var(--color-secondary); }
.wtag.agent {
  background: transparent;
  border: 1px solid var(--color-tertiary);
  color: var(--color-info);
}
```

- [ ] **Step 2: Markup swaps** as listed
- [ ] **Step 3: Gate** — `npm run check` → exit 0
- [ ] **Step 4: Eyeball** `/admin/workers`: invite card, role checkboxes, roster with solid Human / outlined AI tags, success/status lines in mono.
- [ ] **Step 5: Commit** — `git add src/components/workerRoster.tsx src/components/inviteForm.tsx src/styles/global.css && git commit -m "feat: worker roster and invites on studioblank"`

### Task C7: Reports chrome, KPIs, trio, period, subtabs, tooltips

**Files:**
- Modify: `src/routes/_app/reports.tsx`, `src/components/{kpiTile,trioChip,periodSelector,subTabs}.tsx`
- Modify: `src/styles/global.css` (`.reports*`, `.tabs`/`.tab`, `.kpi*`, `.trio*`, `.period*`, `.subtabs`/`.subtab`)

**Markup swaps:**
- `periodSelector.tsx`: period buttons → `className={filterChipClass(sel)}` where `sel` is the existing selected boolean — **keep the existing `aria-selected` attribute and press handler exactly**; the date input keeps its classes minus bespoke rules (delete `.period input` bespoke rule).
- `reports.tsx` export buttons → `<Button variant="secondary" size="sm">`; the export link → `className={buttonClass('secondary', 'sm')}` on the `<a>` (href/children unchanged).
- `trioChip.tsx`: on the three `.seg` divs, `title={…}` → `data-tip={…}` — the tooltip strings inside are **unchanged verbatim**.

- [ ] **Step 1: Rewrite the sections**

```css
.reports {
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-4);
}
.reports-head h1 { font: 600 28px/1.2 var(--font-body); margin: 0 0 var(--space-4); }

.tabs {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-tertiary);
  margin-bottom: var(--space-5);
}
.tab {
  font: 500 14px/1 var(--font-body);
  padding: var(--space-2) var(--space-4);
  color: var(--color-info);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: none;
  cursor: pointer;
}
.tab:hover { color: var(--color-primary); }
.tab[aria-selected='true'] {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.subtabs {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-tertiary);
}
.subtab {
  font: 500 12px/1 var(--font-body);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-info);
  text-decoration: none;
  padding: var(--space-2) var(--space-3);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: none;
  cursor: pointer;
}
.subtab:hover { color: var(--color-primary); }
.subtab[aria-selected='true'] {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}
.kpi {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  padding: var(--space-3) var(--space-4);
}
.kpi .k {
  font: 500 11px/1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-info);
}
.kpi .v {
  font: 700 24px/1.2 var(--font-body);
  color: var(--color-primary);
  margin-top: var(--space-1);
  font-variant-numeric: tabular-nums;
}
.kpi .hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--border-input-hover);
}

.trio {
  display: inline-flex;
  border: 1px solid var(--color-tertiary);
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--surface-card);
}
.trio.lg { font-size: 13px; }
.trio .seg {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: var(--space-1) var(--space-2);
  border-right: 1px solid var(--color-tertiary);
}
.trio .seg:last-child { border-right: none; }
.trio.lg .seg { padding: var(--space-2) var(--space-3); }
.trio .k {
  color: var(--color-info);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.trio.lg .k { font-size: 10px; }
.trio .v {
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.trio.lg .v { font-size: 16px; }
.trio .seg.b .v { color: var(--color-success); }
.trio .seg.p .v { color: var(--premium-text); }
.trio .dollar .v {
  color: var(--color-primary);
  font-family: var(--font-body);
  font-size: 15px;
}
.trio.lg .dollar .v { font-size: 18px; }

.period {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}
.period .lbl {
  font: 500 10px/1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-info);
  margin-right: var(--space-1);
}
.period .range {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-info);
  margin-left: var(--space-1);
}

.period-exports {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
```

- [ ] **Step 2: Markup swaps** as listed (imports: `Button`/`buttonClass`, `filterChipClass`)
- [ ] **Step 3: Gate** — `npm run check` → exit 0
- [ ] **Step 4: Eyeball** `/reports` as `billing@example.com`: tab underline black on active, KPI cards with big 700 numerals, trio bordered mono with success-green b and premium-brown p, period buttons render as chips (selected = solid), **tooltips on the trio segs show styled on hover and Tab-focus**.
- [ ] **Step 5: Commit** — `git add src/routes/_app/reports.tsx src/components/kpiTile.tsx src/components/trioChip.tsx src/components/periodSelector.tsx src/components/subTabs.tsx src/styles/global.css && git commit -m "feat: reports chrome, kpis, trio on studioblank"`

### Task C8: Reconciliation & daily tables

**Files:**
- Modify: `src/components/{reconTable,reconBars,dailyTable}.tsx`
- Modify: `src/styles/global.css` (`.recontable*`, `.recon*`, `.reconbars*`, `.dailytable*`)

**Markup swaps:** none required. If the legend swatches or bar fills are inline-styled per job, leave them (data encoding); if `.sw` swatches are class-based, update their CSS to honest=`var(--color-primary)`, premium=`var(--premium-fill)`.

- [ ] **Step 1: Rewrite the sections**

```css
.recontable {
  width: 100%;
  border-collapse: collapse;
  font: 400 14px/1.6 var(--font-body);
}
.recontable thead th {
  font: 500 10px/1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-info);
  text-align: left;
  border-bottom: 1px solid var(--color-tertiary);
  padding: var(--space-2) var(--space-3);
}
.recontable tbody td {
  border-bottom: 1px solid var(--divider);
  padding: var(--space-2) var(--space-3);
}
.recontable tfoot td {
  border-top: 1px solid var(--color-tertiary);
  padding: var(--space-2) var(--space-3);
  font: 600 14px/1.6 var(--font-body);
  color: var(--color-primary);
}
.recontable .nm { font: 400 14px/1.6 var(--font-body); color: var(--color-primary); }
.recontable .money {
  text-align: right;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.recon {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-2) 0;
  font-family: var(--font-mono);
  font-size: 11px;
}
.recon .nm {
  width: 180px;
  flex: none;
  font: 400 14px/1.6 var(--font-body);
  color: var(--color-primary);
}
.recon .barwrap {
  flex: 1;
  height: 18px;
  background: var(--fill-hover);
  border: 1px solid var(--color-tertiary);
  position: relative;
  overflow: hidden;
}
.recon .bar { position: absolute; top: 0; bottom: 0; }
.recon .bar.honest { background: var(--color-primary); }
.recon .bar .lbl {
  position: absolute;
  top: 1px;
  left: var(--space-1);
  font-size: 10px;
  font-weight: 600;
  color: var(--color-secondary);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.recon .bar.premium {
  background: repeating-linear-gradient(45deg, var(--premium-fill) 0 4px, transparent 4px 8px);
  border-left: 1px solid var(--premium-fill);
}
.recon .nums {
  width: 220px;
  flex: none;
  text-align: right;
  color: var(--color-info);
  font-variant-numeric: tabular-nums;
}
.recon .nums b { color: var(--color-primary); font-weight: 600; }
.recon .premium-tag { color: var(--premium-text); }

.reconbars .legend {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-2);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-info);
}
.reconbars .legend .sw {
  display: inline-block;
  width: 10px;
  height: 10px;
}
.reconbars .legend .sw.honest { background: var(--color-primary); }
.reconbars .legend .sw.premium { background: var(--premium-fill); }

.dailytable {
  width: 100%;
  border-collapse: collapse;
  font: 400 14px/1.6 var(--font-body);
}
.dailytable thead th {
  font: 500 10px/1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--color-info);
  text-align: left;
  border-bottom: 1px solid var(--color-tertiary);
  padding: var(--space-2);
}
.dailytable thead th.num { text-align: right; }
.dailytable tbody td {
  border-bottom: 1px solid var(--divider);
  padding: var(--space-2);
}
.dailytable tbody tr:hover { background: var(--fill-hover); }
.dailytable tr.total td {
  border-top: 1px solid var(--color-tertiary);
  font-weight: 600;
}
.dailytable .daylabel {
  font: 500 13px/1.4 var(--font-body);
  color: var(--color-primary);
  white-space: nowrap;
}
.dailytable .dayrel {
  display: block;
  margin-top: 2px;
  font: 400 9px/1.2 var(--font-mono);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--border-input-hover);
}
.dailytable .dailycell {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
}
.dailytable .dailycell .b { color: var(--color-success); }
.dailytable .dailycell .h { color: var(--color-primary); }
.dailytable .dailycell .p { color: var(--premium-text); }
.dailytable .dailycell.empty {
  color: var(--border-input-hover);
  text-align: center;
}
.dailytable tr.total .b,
.dailytable tr.total .h,
.dailytable tr.total .p { font-weight: 600; }
```

- [ ] **Step 2: Gate** — `npm run check` → exit 0
- [ ] **Step 3: Eyeball** `/reports` reconciliation + daily tabs: black honest bars with white inside labels, premium hatched, mono tabular money right-aligned, totals ruled off.
- [ ] **Step 4: Commit** — `git add src/components/reconTable.tsx src/components/reconBars.tsx src/components/dailyTable.tsx src/styles/global.css && git commit -m "feat: reconciliation and daily tables on studioblank"`

### Task C9: Operator report tab (lanes, effort bars, utilization)

**Files:**
- Modify: `src/components/{operatorLanes,effortBars}.tsx`
- Modify: `src/styles/global.css` (`.lane*`, `.effortbars*`, `.util-*`, `.legend-hint`)

**Markup swaps:** none required.

- [ ] **Step 1: Rewrite the sections**

```css
.lane {
  display: flex;
  align-items: stretch;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}
.lanehead {
  width: 180px;
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-1);
}
.lanehead .nm {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font: 600 14px/1.3 var(--font-body);
  color: var(--color-primary);
}
.lanebody {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  border: 1px solid var(--border-card);
  background: var(--surface-card);
  padding: var(--space-2) var(--space-3);
}
.lanebody .row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: 11px;
}
.lanebody .daylabel {
  width: 90px;
  flex: none;
  font: 400 12px/1.6 var(--font-body);
  color: var(--color-primary);
}
.lanebody .strip { flex: 1; min-width: 0; }
.lanebody .trio { flex: none; }
.lanebody-empty,
.effortbars-empty {
  color: var(--border-input-hover);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: var(--space-1) 2px;
}

.effortbars {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.effortbars .row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.effortbars .hr {
  width: 44px;
  flex: none;
  color: var(--color-info);
  font-variant-numeric: tabular-nums;
}
.effortbars .barwrap {
  flex: 1;
  height: 14px;
  background: var(--fill-hover);
  overflow: hidden;
  position: relative;
}
.effortbars .bar { position: absolute; top: 0; bottom: 0; }
.effortbars .bar.wall { background: var(--color-primary); }
.effortbars .bar.premium {
  background: repeating-linear-gradient(45deg, var(--premium-fill) 0 4px, transparent 4px 8px);
  border-left: 1px solid var(--premium-fill);
}
.effortbars .nums {
  width: 110px;
  flex: none;
  text-align: right;
  color: var(--color-info);
  font-variant-numeric: tabular-nums;
}
.effortbars .nums .p { color: var(--premium-text); }

.util-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.util-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-mono);
  font-size: 11px;
}
.util-row .nm {
  width: 160px;
  flex: none;
  font: 400 13px/1.6 var(--font-body);
  color: var(--color-primary);
}
.util-row .track {
  flex: 1;
  height: 8px;
  background: var(--fill-hover);
}
.util-row .fill {
  display: block;
  height: 100%;
  background: var(--color-primary);
}
.util-row .fill.high { background: var(--premium-fill); }
.util-row .val {
  width: 60px;
  text-align: right;
  color: var(--color-info);
  font-variant-numeric: tabular-nums;
}
.legend-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--border-input-hover);
  margin-left: auto;
}
```

- [ ] **Step 2: Gate** — `npm run check` → exit 0
- [ ] **Step 3: Eyeball** `/reports` operator tab: worker lanes as white cards, black wall bars, premium hatches, thin 8px utilization tracks (high = premium).
- [ ] **Step 4: Commit** — `git add src/components/operatorLanes.tsx src/components/effortBars.tsx src/styles/global.css && git commit -m "feat: operator report tab on studioblank"`

### Task C10: Approvals queue & week status

**Files:**
- Modify: `src/routes/_app/approvals.tsx`, `src/components/{approvalsQueue,weekStatus}.tsx`
- Modify: `src/styles/global.css` (`.approvals*`, `.approvalsqueue*`, `.weekstatus*`)

**Markup swaps:**
- `weekStatus.tsx`: import `StatusChip` + add above the component:
  ```ts
  const badgeKind = {
    none: 'outline',
    draft: 'outline',
    submitted: 'inverse',
    approved: 'solid',
    rejected: 'error',
  } as const
  ```
  The badge `<span className={`weekstatus-badge ${status}`}>…</span>` → `<StatusChip kind={badgeKind[status]}>{label}</StatusChip>` — **label strings unchanged** (STATUS_LABEL is copy-frozen). The submit button → `<Button variant="secondary" size="sm">` keeping `disabled` and `title={disabledReason}` exactly (rest props forward them). Delete the `.weekstatus-badge` and `.weekstatus-submit` CSS blocks.
- `approvalsQueue.tsx`: no required swaps (li button restyled below).

- [ ] **Step 1: Rewrite the sections**

```css
.approvals {
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-4);
}
.approvals-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.approvals-head h1 { font: 600 28px/1.2 var(--font-body); margin: 0; }
.approvals-count {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-info);
  background: var(--fill-hover);
  border: 1px solid var(--color-tertiary);
  padding: 3px var(--space-2);
}
.approvals-split {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--space-4);
  align-items: start;
}
.approvals-queue-pane,
.approvals-detail-pane {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  padding: var(--space-3);
}
.approvals-empty {
  color: var(--border-input-hover);
  font-family: var(--font-mono);
  font-size: 12px;
  text-align: center;
  padding: var(--space-7) 0;
}

.approvalsqueue { list-style: none; display: flex; flex-direction: column; gap: var(--space-1); }
.approvalsqueue li button {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-1) var(--space-2);
  width: 100%;
  text-align: left;
  background: var(--surface-base);
  border: 1px solid var(--color-tertiary);
  padding: var(--space-2) var(--space-3);
  color: var(--color-primary);
  cursor: pointer;
}
.approvalsqueue li button:hover { background: var(--fill-hover); }
.approvalsqueue li.selected button {
  border-color: var(--color-primary);
  background: var(--surface-card);
}
.approvalsqueue .nm { font: 400 13px/1.4 var(--font-body); color: var(--color-primary); }
.approvalsqueue .wk {
  grid-column: 1;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-info);
}
.approvalsqueue .cents {
  grid-column: 2;
  grid-row: 1 / span 2;
  text-align: right;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-success);
  font-variant-numeric: tabular-nums;
}
.approvalsqueue .flagcount,
.approvalsqueue .effort {
  grid-column: 1;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-info);
}

.weekstatus { display: flex; flex-direction: column; gap: var(--space-2); }
.weekstatus-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.weekstatus-week {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-info);
}
.weekstatus-rejected {
  color: var(--color-error);
  font-size: 12px;
}
```

- [ ] **Step 2: Markup swaps** as listed
- [ ] **Step 3: Gate** — `npm run check` → exit 0
- [ ] **Step 4: Eyeball** `/approvals` as admin: queue cards monochrome with selected = black border, week badges as chips (approved solid / waiting inverse / rejected red outline), secondary Submit week button, **title tooltip still appears on the disabled submit** (native title kept).
- [ ] **Step 5: Commit** — `git add src/routes/_app/approvals.tsx src/components/approvalsQueue.tsx src/components/weekStatus.tsx src/styles/global.css && git commit -m "feat: approvals queue and week status on studioblank"`

### Task C11: Approver view, red flags, audit trail

**Files:**
- Modify: `src/components/{approverView,redFlagList}.tsx`
- Modify: `src/styles/global.css` (`.approverview-*`, `.intervalaudit*`, `.flaglist*`, `.audit-trail*`)

**Markup swaps (`approverView.tsx`):** approve → `<Button variant="primary" size="sm">`, reject → `<Button variant="destructive" size="sm">`, unlock → `<Button variant="secondary" size="sm">` — **each keeps its existing child text, handler, and disabled logic**. Delete `.approverview-approve`/`-reject`/`-unlock` CSS. The reason input keeps element styling (`flex: 1` via remaining CSS).

- [ ] **Step 1: Rewrite the sections**

```css
.approverview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}
.approverview-head h2 { font: 600 20px/1.3 var(--font-body); margin: 0; }
.approverview-week {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-info);
  margin-left: var(--space-2);
}
.approverview-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.approverview-actions input { flex: 1; }

.intervalaudit {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.intervalaudit th {
  font: 500 10px/1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-info);
  text-align: left;
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-tertiary);
}
.intervalaudit td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--divider);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.intervalaudit tr.flag-hover {
  background: var(--fill-hover);
  outline: 1px solid var(--premium-fill);
}

.flaglist-kind-h {
  font: 500 10px/1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-info);
  margin: var(--space-2) 0 var(--space-1);
}
.flaglist-row {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-primary);
  padding: var(--space-1);
}
.flaglist-row:hover { background: var(--fill-hover); }
.flaglist-empty {
  color: var(--border-input-hover);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: var(--space-3) 0;
}

.audit-trail { list-style: none; }
.audit-trail li {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-primary);
  border-bottom: 1px dotted var(--color-tertiary);
}
.audit-trail .audit-at { color: var(--border-input-hover); }
.audit-trail .audit-kind {
  color: var(--color-info);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
}
.audit-trail .audit-reason { color: var(--color-info); }
```

- [ ] **Step 2: Markup swaps** as listed
- [ ] **Step 3: Gate** — `npm run check` → exit 0
- [ ] **Step 4: Eyeball** `/approvals` with a submitted week selected: primary/destructive/secondary action buttons, mono audit table with premium-outlined flagged rows, dotted audit trail.
- [ ] **Step 5: Commit** — `git add src/components/approverView.tsx src/components/redFlagList.tsx src/styles/global.css && git commit -m "feat: approver view on studioblank"`

### Task C12: Invoice & print

**Files:**
- Modify: `src/routes/_app/invoice.tsx`
- Modify: `src/styles/print.css` (screen layer only; the `@media print` block is verified, not changed)

**Markup swaps (`invoice.tsx`):** `.invoice-actions` link(s) → `className={buttonClass('secondary', 'sm')}` (href + children unchanged); print button → `<Button variant="secondary" size="sm">`; picker-list items may adopt `.list`/`.row` classes or keep their own — the CSS below assumes their own classes stay.

- [ ] **Step 1: Rewrite the screen layer of `print.css`**

```css
.invoice {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-4);
  color: var(--color-primary);
  font-family: var(--font-body);
}
.invoice-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-6);
}
.invoice-actions a {
  color: var(--color-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  border: 1px solid var(--color-primary);
  padding: var(--space-1) var(--space-3);
  text-decoration: none;
}
.invoice-picker h1 { font: 600 28px/1.2 var(--font-body); margin: 0 0 var(--space-2); }
.invoice-picker-period {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-info);
  margin-bottom: var(--space-4);
}
.invoice-picker-list { list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }
.invoice-picker-list a {
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
  height: 48px;
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  color: var(--color-primary);
  font: 400 14px/1.6 var(--font-body);
  text-decoration: none;
}
.invoice-picker-list a:hover { border-color: var(--color-primary); }
.invoice-page {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  padding: var(--space-6);
}
.invoice-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-6);
}
.invoice-head h1 { font: 700 28px/1.1 var(--font-body); margin: 0; }
.invoice-client {
  font: 300 16px/1.65 var(--font-body);
  color: var(--color-info);
  margin-top: var(--space-1);
}
.invoice-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: 11px;
  text-align: right;
}
.invoice-meta .invoice-k {
  color: var(--color-info);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 9px;
  margin-right: var(--space-1);
}
.invoice-meta .invoice-v { color: var(--color-primary); }
.invoice-lines {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  margin-bottom: var(--space-6);
}
.invoice-lines th {
  font: 500 10px/1.2 var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-info);
  text-align: left;
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-tertiary);
}
.invoice-lines td {
  padding: var(--space-2);
  border-bottom: 1px solid var(--divider);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.invoice-lines .num { text-align: right; }
.invoice-lines tfoot td {
  border-top: 1px solid var(--color-tertiary);
  border-bottom: none;
  padding-top: var(--space-3);
  font-weight: 600;
}
.invoice-subtotal-label {
  text-align: right;
  color: var(--color-info);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.08em;
}
.invoice-subtotal {
  color: var(--color-primary);
  font-size: 16px;
  font-weight: 600;
}
.invoice-trio {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  margin-top: var(--space-6);
}
.invoice-disclosure {
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.6;
  color: var(--color-info);
  max-width: 60ch;
}
```

- [ ] **Step 2: Verify the `@media print` block**

Read the block; confirm it still forces `#fff` body, `#000` text, `#ccc` line borders, hides `.no-print`/`.app-nav`, and drops the page border. It needs no edits. The disclosure copy is copy-frozen — untouched.

- [ ] **Step 3: Markup swaps** as listed (import `Button`, `buttonClass`)
- [ ] **Step 4: Gate** — `npm run check` → exit 0
- [ ] **Step 5: Eyeball** `/invoice` on screen (white page card, mono meta, ruled lines) **and DevTools Print Preview of `/invoice`** (black-on-white, no nav, no borders).
- [ ] **Step 6: Commit** — `git add src/routes/_app/invoice.tsx src/styles/print.css && git commit -m "feat: invoice on studioblank"`

---

## Wave D — Cleanup & audit (2 tasks)

### Task D1: Remove the legacy bridge

**Files:**
- Modify: `src/styles/tokens.css` (delete the bridge `:root` block)
- Modify: `src/styles/global.css`, `src/styles/print.css` (delete dead rules left behind by Wave C swaps)

**Interfaces:**
- Consumes: the bridge aliases from A1 and every Wave C rewrite.

- [ ] **Step 1: Delete the bridge block from `tokens.css`** (the whole second `:root` with `--ink`/`--panel`/… aliases, plus its comment)

- [ ] **Step 2: Prove zero legacy references**

Run: `rg -n 'var\(--(ink|panel|panel2|line|text|muted|faint|err|pos|disp|body|mono)\)' src/`
Expected: no matches. If any rule still uses a legacy var, map it to the new token per the A1 bridge table and re-run until clean. (Note: `--mono`/`--body`/`--disp` are font aliases; `--j1..--j5`/`--j-ink`/`--premium-*` are NOT legacy — they stay.)

- [ ] **Step 3: Delete dead rules**

For each class Wave C removed from markup, grep before deleting its CSS so nothing orphans: `btn-primary`, `weekstatus-badge`, `weekstatus-submit`, `approverview-approve`, `approverview-reject`, `approverview-unlock`, `.datenav button`, `.period button` (bespoke), `.roster-select`, `.field input` (bespoke), `wtag` (only if C6 swapped to StatusChip). Run e.g. `rg -n 'btn-primary' src/` — zero markup hits means the CSS block can go.

- [ ] **Step 4: Gate**

Run: `npm run check` → exit 0.

- [ ] **Step 5: Eyeball every route** (all ten from A2) — nothing may look different from the end of Wave C.

- [ ] **Step 6: Commit**

```bash
git add src/styles/tokens.css src/styles/global.css src/styles/print.css
git commit -m "chore: remove legacy theme bridge"
```

### Task D2: Final audit

**Files:** none (verification only; fix-and-commit only if a check fails)

- [ ] **Step 1: DESIGN Do's/Don'ts checklist over every route**

Walk `/login`, `/today`, `/reports` (all tabs), `/approvals`, `/invoice`, `/admin/*`, `/dev/components` and tick each:
1. No decorative gradients/patterns (only functional job/premium hatching).
2. ≥64px between major sections where layout allows.
3. Monochrome chrome — color only encodes data.
4. Minimal nav, no chrome clutter.
5. No rounded corners, no shadows, no depth.
6. Hierarchy via weight (300 body vs 600/700 headings), not color or size games.
7. No text overlay on images.
8. No transition longer than 200ms.
9. Inputs 40px, focus = 2px black border; buttons match the variant table.
10. Lists 48px rows with hairline dividers.

- [ ] **Step 2: Keyboard pass** — Tab through `/today`, `/admin/clients`, `/reports`, `/approvals`: visible focus everywhere, trio tooltips appear on focus, queue selection works from keyboard.

- [ ] **Step 3: Contrast spot-check** — job fills + `--j-ink` text ≥4.5:1; `--premium-text` on `#fafafa` ≥4.5:1; `--color-info` used only for ≥12px non-essential labels.

- [ ] **Step 4: Print preview** `/invoice` — black on white, no nav.

- [ ] **Step 5: Full gates**

Run: `npm run check && npm run test:contract -- phase4 && npm run build`
Expected: all exit 0 (contract suite is belt-and-braces — no services were touched; build proves the CSS/TSX compiles for prod).

- [ ] **Step 6: Commit only if fixes were needed** — `git commit -m "chore: studioblank final audit"`; if everything passed, make no commit.

---

## Done criteria

- Every DESIGN.md section traces to a task: Colors/Spacing/Radius/Elevation → A1 · Typography → A1 (+ fonts) · Buttons → B1 · Cards → A2 + C sections · Inputs → B3 · Chips → B2 + C10 · Lists → B6 + C12 · Checkboxes/Radios → B4 · Tooltips → B5 + C7 · Do's/Don'ts → D2.
- `npm run check` exit 0 after every task; Wave D additionally green on contract suite and build.
- Zero legacy variable references (`rg` proof in D1).
- The full diff contains no string/copy changes, no form-logic changes, no `src/server/**`/`src/lib/**` changes, no route additions/removals (routeTree untouched), no test edits, no new dependencies.






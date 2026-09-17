# Notion-Hybrid Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blend the implemented StudioBlank system (structure, data density, copy) with the Notion design language (warm neutrals, purple CTA, pastel badges, 8/12px radius, elevation levels 1–2, 400/600 typography) as a single hybrid.

**Architecture:** StudioBlank remains the skeleton — spacing scale, layout rhythm, mono tabular data, functional job palette, `[data-tip]` tooltips, `Button`/`StatusChip`/`FilterChip` primitives (APIs frozen). Notion supplies the skin: warm ink ramp, purple accent reserved for primary CTAs and focus, link-blue for links, pastel tint badges for status, Notion radius scale on controls/cards (tables and strips stay square), elevation shadows on cards, Inter 400 body / 600 headings / 500 buttons. Because every color already flows through CSS custom properties, most of the hybrid lands by re-tuning `tokens.css`; section tasks only assign radius/shadows and split accent-vs-ink usages.

**Tech Stack:** TanStack Start + React 19, plain CSS custom properties (no new dependencies), Vitest.

**Source of truth:** this plan. `docs/references/DESIGN.md` (StudioBlank) remains the structural reference; the Notion reference is the spec the user supplied (VoltAgent awesome-design-md `notion/DESIGN.md` — key values embedded below). The hybrid decisions below override both wherever they conflict.

## Hybrid decisions (locked with user 2026-09-17)

1. **Geometry — Notion scale.** 8px buttons/inputs, 12px cards/panels, 4px small controls (checkbox, chips-as-data, dm/ministrip/trio), pill (9999px) badges and filter tabs. The StudioBlank `border-radius: 0 !important` guard is DELETED. **Tables, interval lists, and data strips stay square** — data-density inheritance.
2. **Primary CTA — purple.** `--color-accent #5645d4` (pressed `#4534b3`) for primary buttons and input focus. Links use blue (`--color-link #005bab` for text, `--color-link-hi #0075de` for hover — the raw Notion blue is 4.0:1, too low for body text). All other chrome stays ink/charcoal.
3. **Status chips — pastel soft badges.** Tint background + deep text pairs: mint=approved/success, rose=rejected/error, lavender=submitted, sky=info, yellow=warning/premium, gray=neutral. Pill shape, 13px/600 (Notion caption-bold), sentence case (drop the uppercase transform — CSS only, strings never change). Status is data encoding; the chroma rule survives.
4. **Neutrals — warm Notion ramp.** charcoal `#37352f` ink, slate `#5d5b54` secondary, steel `#787671` tertiary, stone `#a4a097` hints/disabled, hairline `#e5e3df`, hairline-soft `#ede9e4` dividers, hairline-strong `#c8c4be` input borders, surface `#f6f5f4`, surface-soft `#fafaf9`, canvas `#ffffff` pages.
5. **Elevation — Notion levels 1–2.** Cards/panels rest at level 2 (`0 4px 12px rgba(15,15,15,.08)`); small tiles (KPI) at level 1; interactive cards (invoice picker rows, approvals queue items) gain level-1 shadow on hover; tooltips level 1. No level 3/4 (mockup/modal) — this app has no hero mockups.
6. **Typography — Notion treatment.** Inter 400 body 16/1.55 (300 weight dropped from the font load), headings 600 (h1 40/1.15 with −0.5px tracking; 28px and below no tracking), buttons 500, badges 600. IBM Plex Mono stays for tabular data and micro-caps table headers (data-density inheritance).

**Secondary locked decisions (mine, recorded for implementers):**

- Token names do not change where semantics survive (`--color-primary` becomes charcoal ink, etc). New tokens: accent pair, link pair, `--color-muted`/`--color-faint`, `--color-success-text`/`--color-error-text`, six `--tint-*` + paired `--tint-*-text`, `--border-soft`, `--fill-quiet`, radius scale, shadow scale. No bridge aliases needed — values change in place.
- `--color-success`/`--color-error` are FILL/dot colors (3.3:1 / 4.0:1 on white — never text). Everywhere they currently color text switches to the `-text` variants (≥4.5:1). Destructive button bg uses `--color-error-text` so white label text passes.
- Warning/premium unify: `--premium-fill #ca8a04` stays for hatches/fills; all amber TEXT (premium tags, tag-warn, dm.premium, trio `.p`, dailycell `.p`) becomes `--color-warning-text #793400`.
- `.fill.high` (utilization >100%) switches from premium amber to `--color-warning #dd5b00` — semantic honesty.
- Flagged interval rows (`.intervalaudit tr.flag-hover`) highlight with `--tint-yellow` bg + 1px `--premium-fill` outline.
- Nav: 64px tall, hairline bottom, links 500 14px slate (normal case — drop uppercase/tracking), active = ink + 2px ink underline. Admin subnav and subtabs match (500 14px normal case); report tabs already are.
- Buttons: primary purple w/ pressed hover (inversion hover is dead); secondary = hairline-strong outline, hover surface fill + ink border; ghost hover surface; destructive `--color-error-text` bg, hover `#8f1717`... use `--color-error-text` bg and hover filter-free deepen to `#991b1b`? **Locked: destructive hover bg `#991b1b`.** Disabled = hairline bg + stone text (replaces 0.3 opacity).
- Checkbox 4px radius, ✓ glyph 600; radio dot is a CIRCLE now (`border-radius: 9999px` on the ::after) — geometry follows Notion.
- Tooltip: ink `#1a1a1a` bubble, white text, 4px radius, level-1 shadow. Delays unchanged.
- Inputs: 44px tall, 8px radius, hairline-strong border, steel hover border, 2px purple focus border, disabled surface bg + stone text.
- Job palette `--j1..--j5` + `--j-ink` unchanged (functional, already ≥4.5:1). Ministrip overlap hatch warms to `rgba(55,53,47,0.45)`.
- Tables stay square, hairline-soft dividers, surface row hover, slate micro-caps headers, mono tabular cells — cascade handles most of this from tokens.
- Transitions: 150ms ease (was 120ms linear) — still ≤200ms.
- Page bg = canvas white; cards white on white are defined by hairline + level-2 shadow (Notion's exact model).

## Repo rules (unchanged from the Studioblank plan)

- `nvm` is NOT installed; node 24 comes from mise. Run `npm run check` as the gate after every task — exit 0 or the task is not done.
- Protected: `tests/contract/**`, `.wayfinder/**`, `docs/**` (this plan file is the only writable doc), `drizzle/migrations/**`, `src/routeTree.gen.ts` (must not churn — no route changes), config files.
- COPY FREEZE: never change user-visible strings, form logic, or server code. Only className/import/wrapper/CSS changes. All `Button`/`StatusChip`/`FilterChip` APIs are frozen (tests in `tests/unit/` assert the class strings).
- No new dependencies. No browser available to agents — visual eyeball steps are deferred and reported.
- Commits: lowercase conventional, exact messages given per task, stage only the named files.

## Global constraints (exact hybrid values)

| Role | Token | Value |
|---|---|---|
| Ink / primary text | `--color-primary` | `#37352f` |
| On-dark / on-accent text | `--color-secondary` | `#ffffff` |
| Input border / strong hairline | `--color-tertiary` | `#c8c4be` |
| Secondary text (slate) | `--color-info` | `#5d5b54` |
| Tertiary text (steel) | `--color-muted` | `#787671` |
| Hints / disabled (stone) | `--color-faint` | `#a4a097` |
| Accent (CTA + focus) | `--color-accent` | `#5645d4` |
| Accent pressed | `--color-accent-pressed` | `#4534b3` |
| Link text (AA) | `--color-link` | `#005bab` |
| Link hover | `--color-link-hi` | `#0075de` |
| Page bg (canvas) | `--surface-base` | `#ffffff` |
| Card bg | `--surface-card` | `#ffffff` |
| Inverse (pills, tooltip) | `--surface-inverse` | `#1a1a1a` |
| Hover fill (surface) | `--fill-hover` | `#f6f5f4` |
| Quiet fill (surface-soft) | `--fill-quiet` | `#fafaf9` |
| Card border (hairline) | `--border-card` | `#e5e3df` |
| Soft divider (hairline-soft) | `--divider`, `--border-soft` | `#ede9e4` |
| Input hover border (steel) | `--border-input-hover` | `#787671` |
| Success fill / text | `--color-success` / `--color-success-text` | `#1aae39` / `#15803d` |
| Warning fill / text | `--color-warning` / `--color-warning-text` | `#dd5b00` / `#793400` |
| Error fill / text | `--color-error` / `--color-error-text` | `#e03131` / `#b91c1c` |
| Tints | `--tint-mint` `#d9f3e1`, `--tint-rose` `#fde0ec`, `--tint-lavender` `#e6e0f5`, `--tint-sky` `#dcecfa`, `--tint-yellow` `#fef7d6`, `--tint-gray` `#f0eeec` |
| Tint text pairs | `--tint-mint-text` `#15803d`, `--tint-rose-text` `#b91c1c`, `--tint-lavender-text` `#391c57`, `--tint-sky-text` `#005bab`, `--tint-yellow-text` `#793400`, `--tint-gray-text` `#5d5b54` |
| Premium fill (hatch) / text | `--premium-fill` / `--premium-text` | `#ca8a04` / `#793400` |
| Radius | `--radius-xs` 4px, `--radius-md` 8px, `--radius-lg` 12px, `--radius-full` 9999px |
| Shadows | `--shadow-1` `0 1px 2px rgba(15,15,15,.04)`, `--shadow-2` `0 4px 12px rgba(15,15,15,.08)`, `--shadow-3` `0 16px 48px -8px rgba(15,15,15,.16)` (reserved; unused by default) |
| Spacing | `--space-1..8` = 4/8/16/32/48/64/96/128 (unchanged) |
| Type | body 400 16/1.55; h1 600 40/1.15 −0.5px; h2 600 28/1.2; h3 600 20/1.3; buttons 500; badges 600 13px; data mono unchanged |

## File structure

| File | Role in this plan |
|---|---|
| `src/styles/tokens.css` | H1 rewrites values + adds accent/link/tint/radius/shadow tokens |
| `src/styles/global.css` | H1 base, H3 form controls, H5–H12 per-section edits |
| `src/styles/ui.css` | H2 buttons/chips, H4 tooltip, H5 list rows |
| `src/routes/__root.tsx` | H1 font link only |
| `src/routes/_app/invoice.tsx`, `src/components/*` | Verify-only — no markup changes expected in any task |

No markup swaps anywhere: the Studioblank waves already moved every control to primitives, so the hybrid is CSS-only. If a task finds itself editing a `.tsx` file, stop and re-read the task — something is wrong.

---

## Wave A — foundation

### Task H1: Hybrid tokens, warm base, purple accent

**Files:**
- Modify: `src/styles/tokens.css` (full rewrite)
- Modify: `src/styles/global.css:9-72` (base block from `html {` through the `.mono, code, kbd, samp` rule; keep `@import` and the `* { box-sizing… }` reset)
- Modify: `src/routes/__root.tsx` (font link href only)

**Interfaces:** produces every token listed in Global constraints; all later tasks consume them.

- [ ] **Step 1: Rewrite `src/styles/tokens.css` to exactly this:**

```css
/* Hybrid core — StudioBlank structure, Notion skin (see plan header) */
:root {
  --color-primary: #37352f;
  --color-secondary: #ffffff;
  --color-tertiary: #c8c4be;
  --color-info: #5d5b54;
  --color-muted: #787671;
  --color-faint: #a4a097;
  --color-accent: #5645d4;
  --color-accent-pressed: #4534b3;
  --color-link: #005bab;
  --color-link-hi: #0075de;

  --surface-base: #ffffff;
  --surface-card: #ffffff;
  --surface-inverse: #1a1a1a;
  --fill-hover: #f6f5f4;
  --fill-quiet: #fafaf9;

  --border-card: #e5e3df;
  --border-soft: #ede9e4;
  --divider: #ede9e4;
  --border-input-hover: #787671;

  /* Fills are dots/bars only; the -text variants carry ≥4.5:1 text. */
  --color-success: #1aae39;
  --color-success-text: #15803d;
  --color-warning: #dd5b00;
  --color-warning-text: #793400;
  --color-error: #e03131;
  --color-error-text: #b91c1c;

  /* Pastel badge tints + deep text pairs (Notion card-tint family). */
  --tint-mint: #d9f3e1;
  --tint-rose: #fde0ec;
  --tint-lavender: #e6e0f5;
  --tint-sky: #dcecfa;
  --tint-yellow: #fef7d6;
  --tint-gray: #f0eeec;
  --tint-mint-text: #15803d;
  --tint-rose-text: #b91c1c;
  --tint-lavender-text: #391c57;
  --tint-sky-text: #005bab;
  --tint-yellow-text: #793400;
  --tint-gray-text: #5d5b54;

  --premium-fill: #ca8a04;
  --premium-text: #793400;

  /* Spacing — base 16 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 32px;
  --space-5: 48px;
  --space-6: 64px;
  --space-7: 96px;
  --space-8: 128px;

  /* Radius — Notion scale; tables and data strips stay square by convention. */
  --radius-xs: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Elevation — Notion levels 1–2 only (no mockup/modal shadows here). */
  --shadow-1: 0 1px 2px rgba(15, 15, 15, 0.04);
  --shadow-2: 0 4px 12px rgba(15, 15, 15, 0.08);
  --shadow-3: 0 16px 48px -8px rgba(15, 15, 15, 0.16);

  /* Metric-close fallbacks: none of these families ship a metric-compatible
     fallback, so we fall back to the generic class and accept the reflow. */
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;

  /* Functional job palette — data encoding, not decoration (#6, #13, #11).
     One chroma exception alongside the accent: chrome stays ink. */
  --j1: #1d4ed8;
  --j2: #c2410c;
  --j3: #15803d;
  --j4: #a16207;
  --j5: #6d28d9;
  --j-ink: #fafafa;
}
```

- [ ] **Step 2: Replace the global.css base block (lines 9–72, `html {` … `.mono, code, kbd, samp`) with exactly:**

```css
html {
  color-scheme: light;
}

body {
  background: var(--surface-base);
  color: var(--color-primary);
  font: 400 16px/1.55 var(--font-body);
}

a {
  color: var(--color-link);
}

a:hover {
  color: var(--color-link-hi);
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Transitions ≤ 200ms (both source systems agree); 150ms ease is Notion's. */
button,
a,
input,
select,
textarea,
summary {
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    box-shadow 150ms ease;
}

h1,
h2,
h3 {
  font-family: var(--font-body);
}

h1 {
  font: 600 40px/1.15 var(--font-body);
  letter-spacing: -0.5px;
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
```

The `*, *::before, *::after { border-radius: 0 !important; }` rule and its comment are DELETED (hybrid decision 1) — nothing replaces it; radius comes per-component from the `--radius-*` tokens.

- [ ] **Step 3: Font link.** In `__root.tsx` replace the Google Fonts href with:

```
https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap
```

(300 and 700 are dropped — nothing uses them after this task; the base block and ui.css own every weight.)

- [ ] **Step 4: Gate.** Run `npm run check` — expect exit 0 (202 tests). Font-weight 300/700 references must not remain: `rg -n '300 |700 ' src/styles/` returns only the checkbox `::after` (700 12px — fixed in H3) if anything.
- [ ] **Step 5: Commit** `feat: hybrid tokens and warm base` — stage exactly `src/styles/tokens.css`, `src/styles/global.css`, `src/routes/__root.tsx`.
- [ ] **Step 6 (deferred eyeball):** `/login` should be warm-white, links blue, focus ring purple; buttons still black until H2.

### Task H2: Hybrid buttons and chips

**Files:**
- Modify: `src/styles/ui.css` — replace the `.btn` block (lines 1–47) and the `.chip` block (lines 49–94)

**Interfaces:** `ButtonVariant`/`ButtonSize`/`ChipKind` APIs and all class strings are frozen (tests/unit/button.test.ts, tests/unit/chip.test.ts). This task changes CSS values only — do not touch any `.tsx` or test file.

- [ ] **Step 1: Replace the button block with exactly:**

```css
/* Buttons — Notion geometry + purple CTA; hover states are Notion's
   pressed/fill model, not StudioBlank inversion. */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-weight: 500;
  cursor: pointer;
}

.btn--sm { height: 32px; min-width: 64px; padding: 0 12px; font-size: 12px; }
.btn--md { height: 40px; min-width: 96px; padding: 0 18px; font-size: 14px; }
.btn--lg { height: 48px; min-width: 128px; padding: 0 24px; font-size: 16px; }

.btn--primary { background: var(--color-accent); color: var(--color-secondary); }
.btn--primary:hover:not(:disabled) { background: var(--color-accent-pressed); }

.btn--secondary {
  background: transparent;
  color: var(--color-primary);
  border-color: var(--color-tertiary);
}
.btn--secondary:hover:not(:disabled) {
  background: var(--fill-hover);
  border-color: var(--color-primary);
}

.btn--ghost { background: transparent; color: var(--color-primary); }
.btn--ghost:hover:not(:disabled) { background: var(--fill-hover); }

/* error-text as bg so the white label clears 4.5:1 (#e03131 is 4.0). */
.btn--destructive { background: var(--color-error-text); color: var(--color-secondary); }
.btn--destructive:hover:not(:disabled) { background: #991b1b; }

/* Notion: disabled = hairline bg + muted text, not opacity. */
.btn:disabled {
  background: var(--border-card);
  color: var(--color-faint);
  border-color: transparent;
  cursor: not-allowed;
}
```

- [ ] **Step 2: Replace the chip block (through `.chip--selected…`) with exactly:**

```css
/* Chips — Notion soft badges: pastel tint + deep text, pill, caption-bold.
   Status is data encoding, so the chroma rule still holds. */
.chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 3px 10px;
  font: 600 13px/1.4 var(--font-body);
  border: 1px solid transparent;
  border-radius: var(--radius-full);
}

.chip--solid { background: var(--tint-mint); color: var(--tint-mint-text); }
.chip--outline {
  background: transparent;
  color: var(--color-info);
  border-color: var(--color-tertiary);
}
.chip--inverse { background: var(--tint-lavender); color: var(--tint-lavender-text); }
.chip--muted { background: var(--tint-gray); color: var(--tint-gray-text); }
.chip--error { background: var(--tint-rose); color: var(--tint-rose-text); }
.chip--success { background: var(--tint-mint); color: var(--tint-mint-text); }

.chip--filter {
  background: transparent;
  color: var(--color-muted);
  border-color: var(--border-card);
}
.chip--filter:hover {
  background: var(--fill-hover);
  color: var(--color-primary);
  border-color: var(--color-tertiary);
}
.chip--selected,
.chip--selected:hover {
  background: var(--surface-inverse);
  color: var(--color-secondary);
  border-color: var(--surface-inverse);
}
```

- [ ] **Step 3: Gate.** `npm run check` — exit 0. The chip/button unit tests assert class STRINGS only, so they must pass unchanged.
- [ ] **Step 4: Commit** `feat: hybrid buttons and chips` — stage only `src/styles/ui.css`.
- [ ] **Step 5 (deferred eyeball):** `/dev/components` — purple primary, hairline secondary, pastel status chips, black pill selected filter.

## Wave B — forms, tooltip, shell

### Task H3: Hybrid form controls

**Files:**
- Modify: `src/styles/global.css` — shared form primitives section (input/select/textarea rules, `.field`, `.field:has(.field-error)`, `.checkline`), the checkbox/radio block that follows it, and `.field-error`/`.form-error` in the login section

- [ ] **Step 1: Replace the input rules (current lines 159–220 area: `input, select, textarea` through `.checkline`) with exactly:**

```css
/* Inputs — Notion text-input: 44px, hairline-strong border, purple focus. */
input,
select,
textarea {
  background: var(--surface-card);
  border: 1px solid var(--color-tertiary);
  border-radius: var(--radius-md);
  color: var(--color-primary);
  font: 400 14px/1.4 var(--font-body);
  height: 44px;
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

input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  border: 2px solid var(--color-accent);
  outline: none;
}

input:disabled,
select:disabled,
textarea:disabled {
  background: var(--fill-hover);
  border-color: var(--border-card);
  color: var(--color-faint);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font: 400 13px/1.4 var(--font-body);
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
  font: 400 13px/1.4 var(--font-body);
  color: var(--color-info);
}
```

- [ ] **Step 2: Replace the checkbox/radio block with exactly:**

```css
/* Checkboxes & radios — 18px custom controls; 4px radius, round radio dot
   (geometry follows the hybrid's Notion scale). */
input[type='checkbox'],
input[type='radio'] {
  appearance: none;
  width: 18px;
  height: 18px;
  padding: 0;
  background: var(--surface-card);
  border: 1px solid var(--color-tertiary);
  border-radius: var(--radius-xs);
  cursor: pointer;
  flex: none;
  display: grid;
  place-content: center;
}

input[type='radio'] {
  border-radius: var(--radius-full);
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
  font: 600 12px/1 var(--font-body);
}

input[type='radio']:checked::after {
  content: '';
  width: 8px;
  height: 8px;
  background: var(--color-primary);
  border-radius: var(--radius-full);
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
  border-color: var(--border-card);
}

input[type='checkbox']:disabled:checked::after,
input[type='radio']:disabled:checked::after {
  color: var(--color-faint);
  background: var(--color-faint);
}
```

- [ ] **Step 3: Error text contrast.** In `.field-error` and `.form-error`, change `color: var(--color-error)` → `color: var(--color-error-text)` (both rules).
- [ ] **Step 4: Gate.** `npm run check` — exit 0.
- [ ] **Step 5: Commit** `feat: hybrid form controls` — stage only `src/styles/global.css`.
- [ ] **Step 6 (deferred eyeball):** entry form + login: 44px inputs, round-cornered, purple focus border, round radio dots.

### Task H4: Hybrid tooltip and list rows

**Files:**
- Modify: `src/styles/ui.css` — `[data-tip]` block and `.row`/`.row.active` rules

- [ ] **Step 1: Tooltip edits (keep all positioning/delay mechanics):**
  - `[data-tip]::after`: add `border-radius: var(--radius-xs);` and `box-shadow: var(--shadow-1);`
  - `[data-tip]::before` and `::after`: `border-top-color`/`background` stay `var(--surface-inverse)` (now `#1a1a1a` via tokens — no edit needed, verify only).
- [ ] **Step 2: List rows** — `.row` gains `border-radius: var(--radius-xs);` on the hover/active states only (not the base rule, so the bottom divider stays full-width). Apply it as a separate rule after the existing ones:

```css
.row:hover,
.row.active {
  border-radius: var(--radius-xs);
}
```

- [ ] **Step 3: Gate.** `npm run check` — exit 0.
- [ ] **Step 4: Commit** `feat: hybrid tooltip` — stage only `src/styles/ui.css`.
- [ ] **Step 5 (deferred eyeball):** trio chips on `/reports` — ink bubble, 4px radius, soft shadow, 200ms show delay intact.

### Task H5: Hybrid shell and auth surfaces

**Files:**
- Modify: `src/styles/global.css` — shell section (`.app-nav` family, `.panel`) and login section (`.login-form`)

- [ ] **Step 1: Replace the shell section's nav and panel rules with exactly:**

```css
.app-shell {
  min-height: 100vh;
}

/* Notion top-nav: 64px white bar, hairline bottom, 500/14 slate links. */
.app-nav {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 64px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--border-card);
  background: var(--surface-base);
}

.app-nav a {
  font: 500 14px/1 var(--font-body);
  color: var(--color-muted);
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
  color: var(--color-muted);
}

.panel {
  background: var(--surface-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);
  padding: var(--space-3);
}
```

- [ ] **Step 2: Login card.** In `.login-form` add `border-radius: var(--radius-lg);` and `box-shadow: var(--shadow-2);` (keep all other declarations).
- [ ] **Step 3: Gate.** `npm run check` — exit 0.
- [ ] **Step 4: Commit** `feat: hybrid shell and auth` — stage only `src/styles/global.css`.
- [ ] **Step 5 (deferred eyeball):** nav 64px, normal-case slate links, active ink underline; login card soft-shadowed, 12px radius.

## Wave C — surfaces (edit lists; everything not listed cascades from tokens — verify, don't edit)

### Task H6: Hybrid today view

**Files:**
- Modify: `src/styles/global.css` — today section family (`.daymath`/`.dm`, `.datenav`, `.ministrip*`, `.intervallist*`, `.today*`, `.how-counted-card`)

- [ ] **Step 1: Exact edits:**
  - `.dm`: add `border-radius: var(--radius-xs);`
  - `.ministrip`: add `border-radius: var(--radius-xs);`
  - `.ministrip-overlap`: change the hatch color `rgba(10,10,10,0.45)` → `rgba(55,53,47,0.45)` (warm ink; gradient shape unchanged)
  - `.how-counted-card`: add `border-radius: var(--radius-lg);` and `box-shadow: var(--shadow-1);`
- [ ] **Step 2: Cascade verification (no edits expected):** `.intervallist` thead (slate headers, `--divider` now hairline-soft), `.job-cN` (unchanged job palette), `.today`/`.today-lanes`/`.today-lane`/lane-head `h2`/`.today-section-title`, `.datenav` (buttons are `Button ghost sm` from the Studioblank waves — purple-free, now rounded automatically), `.ministrip-legend`, `.ministrip-overlap-tag`.
- [ ] **Step 3: Gate.** `npm run check` — exit 0.
- [ ] **Step 4: Commit** `feat: hybrid today view` — stage only `src/styles/global.css`.

### Task H7: Hybrid entry form

**Files:**
- Modify: `src/styles/global.css` — `.entryform` rule

- [ ] **Step 1:** `.entryform`: add `border-radius: var(--radius-lg);` and `box-shadow: var(--shadow-2);` (keep every other declaration).
- [ ] **Step 2:** Verify cascade: `.entryform-row`, `textarea`, `.entryform-actions` (buttons rounded/purple via H2), `.entryform-duration`.
- [ ] **Step 3: Gate.** `npm run check` — exit 0.
- [ ] **Step 4: Commit** `feat: hybrid entry form` — stage only `src/styles/global.css`.

### Task H8: Hybrid admin surfaces (tree, roster, tags)

**Files:**
- Modify: `src/styles/global.css` — `.admin-subnav`, `.tree*` rules, `.tag`/`.tag-ok`/`.tag-warn`, `.wtag`, `.status-ok`

- [ ] **Step 1: Exact edits:**
  - `.admin-subnav`: `border-bottom` → `1px solid var(--border-card)`
  - `.admin-subnav a`: `font` → `500 14px/1 var(--font-body)`; DELETE `text-transform: uppercase` and `letter-spacing` declarations if present
  - `.tree-client`, `.tree-project`, `.tree-add`, `.tree-edit`: add `border-radius: var(--radius-md);` each
  - `.status-ok`: `color` → `var(--color-success-text)` (it is text; `--color-success` is fill-only)
- [ ] **Step 2: Replace the whole `.tag`/`.tag-ok`/`.tag-warn` rule group with exactly:**

```css
.tag,
.tag-ok,
.tag-warn {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font: 600 11px/1.4 var(--font-body);
}

.tag { background: var(--tint-gray); color: var(--tint-gray-text); }
.tag-ok { background: var(--tint-mint); color: var(--tint-mint-text); }
.tag-warn { background: var(--tint-yellow); color: var(--tint-yellow-text); }
```

- [ ] **Step 3: Replace the whole `.wtag` rule group with exactly:**

```css
.wtag {
  font: 600 10px/1.2 var(--font-mono);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  display: inline-block;
}

.wtag.human { background: var(--tint-mint); color: var(--tint-mint-text); }
.wtag.agent { background: var(--tint-lavender); color: var(--tint-lavender-text); }
```

- [ ] **Step 4: Verify cascade:** `.admin`/`.admin-head` (h1 28/600 warm), `.tree`/`-empty`/`-row`/`.tree-rate`, `.roster`/`-email`, `.rolecheck` (checkboxes rounded via H3), `.admin-form`, `.status-msg`. Tree buttons are `Button ghost sm` — rounded automatically.
- [ ] **Step 5: Gate.** `npm run check` — exit 0.
- [ ] **Step 6: Commit** `feat: hybrid admin surfaces` — stage only `src/styles/global.css`.

### Task H9: Hybrid reports chrome (tabs, KPI, trio, period)

**Files:**
- Modify: `src/styles/global.css` — `.tabs`, `.subtabs`/`.subtab`, `.kpi`, `.kpi .v`, `.trio`, `.trio .seg.b .v`, `.reports-panel .card`

- [ ] **Step 1: Exact edits:**
  - `.tabs`: `border-bottom` → `1px solid var(--border-card)`
  - `.subtabs`: `border-bottom` → `1px solid var(--border-card)`; `.subtab`: `font` → `500 14px/1 var(--font-body)`, DELETE `text-transform`/`letter-spacing` if present
  - `.kpi`: add `border-radius: var(--radius-lg);` and `box-shadow: var(--shadow-1);`
  - `.kpi .v`: weight 700 → 600 (`font: 600 24px var(--font-body)`, keep other declarations)
  - `.trio`: add `border-radius: var(--radius-xs);`
  - `.trio .seg.b .v`: `color` → `var(--color-success-text)`
  - `.reports-panel .card`: add `border-radius: var(--radius-lg);` and `box-shadow: var(--shadow-1);`
- [ ] **Step 2: Verify cascade:** `.reports`/`-head`/`.tab` (+selected ink underline), `.kpis` grid, `.kpi .k`/`.hint`, the rest of the `.trio` family (`.seg.p .v` now resolves to warm `#793400` via `--premium-text`), `.period` family (filter chips pill via H2; date input rounded/purple-focus via H3), `.period-exports` (secondary buttons via H2), `.reports-subhead`/`.dateonly`. If `.dollar .v` or any other rule still says `700`, change to `600`.
- [ ] **Step 3: Gate.** `npm run check` — exit 0.
- [ ] **Step 4: Commit** `feat: hybrid reports chrome` — stage only `src/styles/global.css`.

### Task H10: Hybrid data tables (recon, daily, operator)

**Files:**
- Modify: `src/styles/global.css` — `.dailycell .b`, `.lanebody`, `.util-row .fill.high`

- [ ] **Step 1: Exact edits:**
  - `.dailycell .b`: `color` → `var(--color-success-text)` (text on white; also check `.dailytable tr.total .b` — same change)
  - `.lanebody`: add `border-radius: var(--radius-md);`
  - `.util-row .fill.high`: `background` → `var(--color-warning)` (was `--premium-fill`; >100% utilization is a warning, not premium data)
- [ ] **Step 2: Verify cascade:** `.recontable` family (slate micro-caps headers, `--divider` hairline-soft rows, `.money` mono), `.recon` bars (`.bar.honest` now charcoal via `--color-primary`; premium hatch unchanged; `.lbl` white on charcoal), `.reconbars .legend`, `.dailytable` family (`.b`/`.h`/`.p` — `.h` charcoal, `.p` warm amber via `--premium-text`), `.lane`/`.lanehead`/`.lanebody .row`/`.strip`/`.trio`, `.effortbars` family, `.util-row .fill` (charcoal), `.legend-hint`. Legend swatch inline styles in `reconBars.tsx` already use `var(--color-primary)`/`var(--premium-fill)` — they cascade; do not touch the tsx.
- [ ] **Step 3: Gate.** `npm run check` — exit 0.
- [ ] **Step 4: Commit** `feat: hybrid data tables` — stage only `src/styles/global.css`.

### Task H11: Hybrid approvals (queue, flags, week status)

**Files:**
- Modify: `src/styles/global.css` — `.approvals-count`, `.approvals-queue-pane`, `.approvals-detail-pane`, `.approvalsqueue li button`, `.approvalsqueue .cents`, `.intervalaudit tr.flag-hover`, `.flaglist-row`, `.weekstatus-rejected`

- [ ] **Step 1: Exact edits:**
  - `.approvals-count` (queue header count): set `background: var(--tint-gray); color: var(--tint-gray-text); border: none;` and add `border-radius: var(--radius-full);` (keep font/mono size declarations)
  - `.approvals-queue-pane`, `.approvals-detail-pane`: add `border-radius: var(--radius-lg);` and `box-shadow: var(--shadow-2);` each
  - `.approvalsqueue li button`: add `border-radius: var(--radius-md);`; on its `:hover` rule add `box-shadow: var(--shadow-1);`
  - `.approvalsqueue .cents`: `color` → `var(--color-success-text)`
  - `.intervalaudit tr.flag-hover`: `background` → `var(--tint-yellow);` (keep `outline: 1px solid var(--premium-fill)`)
  - `.flaglist-row`: add `border-radius: var(--radius-xs);`
  - `.weekstatus-rejected`: `color` → `var(--color-error-text)`
- [ ] **Step 2: Verify cascade:** `.approvals`/`-head`/`-split`/`-empty`, queue `.nm`/`.wk`/`.flagcount`/`.effort`, `li.selected button` (ink border), `.intervalaudit` th/td, `.flaglist-kind-h`/`-empty`, `.audit-trail` family, `.approverview-head`/`-week` (approve/reject/unlock are `Button` primary/destructive/secondary — purple/red/hairline via H2), week badges (`StatusChip` pastel pills via H2), `.weekstatus` layout rules.
- [ ] **Step 3: Gate.** `npm run check` — exit 0.
- [ ] **Step 4: Commit** `feat: hybrid approvals` — stage only `src/styles/global.css`.

### Task H12: Hybrid invoice (screen only)

**Files:**
- Modify: `src/styles/print.css` — screen layer only. **The `@media print` block stays byte-identical.**

- [ ] **Step 1: Exact edits:**
  - `.invoice-page`: add `border-radius: var(--radius-lg);` and `box-shadow: var(--shadow-2);`
  - `.invoice-picker-list li a`: add `border-radius: var(--radius-md);`; on its `:hover` rule add `box-shadow: var(--shadow-1);` (keep the existing hover border change)
- [ ] **Step 2: Verify cascade:** `.invoice` (canvas bg, charcoal text), `.invoice-actions` (secondary button styles via `buttonClass`), `.invoice-head`/`-client`/`-meta` (slate labels), `.invoice-lines` (hairline-soft dividers, slate micro-caps headers), `tfoot`, `.invoice-subtotal` (charcoal), `.invoice-trio`, `.invoice-disclosure`, `.invoice-picker-period`.
- [ ] **Step 3: Print-block guard.** `git diff src/styles/print.css` must show zero changes inside `@media print`. 
- [ ] **Step 4: Gate.** `npm run check` — exit 0.
- [ ] **Step 5: Commit** `feat: hybrid invoice` — stage only `src/styles/print.css`.

## Wave D — audit

### Task H13: Hybrid sweep and final audit

**Files:**
- Modify: `src/styles/*` only where a sweep hit demands it.

- [ ] **Step 1: Cold-value sweep.** `rg -n '#0a0a0a|#d4d4d8|#e5e5e5|#a1a1aa|#f4f4f5|#71717a|#16a34a|#dc2626|#a16207|#e8735f' src/styles/` — the ONLY allowed remaining hits are the job palette lines in `tokens.css` (`--j4: #a16207` and `--j-ink: #fafafa` are functional data tokens and stay). Any other hit maps to its hybrid token from the Global constraints table.
- [ ] **Step 2: Geometry audit.** `rg -n 'border-radius' src/styles/` — every hit is `var(--radius-*)`; zero `!important`; the tables/strips convention holds (`intervallist`, `recontable`, `dailytable`, `intervalaudit` have no radius).
- [ ] **Step 3: Text-contrast audit.** `rg -n 'var\(--color-success\)|var\(--color-error\)' src/styles/` — every remaining use is a background/border/fill, never a bare text `color:` on a light surface (`.field:has(.field-error) … border-color` is fine). `rg -n '700' src/styles/` returns zero font weights (600 max outside the none).
- [ ] **Step 4: Elevation/motion audit.** Shadows only via `--shadow-1/2` (plus the reserved `--shadow-3` token, unused); transitions ≤ 200ms.
- [ ] **Step 5: Copy-freeze guard.** Across the whole hybrid branch, `git diff design/alternative~13..HEAD --stat` touches only `src/styles/**` and `src/routes/__root.tsx` (font href). No tsx logic, strings, routes, tests, or `routeTree.gen.ts`.
- [ ] **Step 6: Gates.** `npm run check` (exit 0, 202 tests) · `npm run test:contract -- phase4` (27 tests) · `npm run build` (exit 0, no routeTree churn).
- [ ] **Step 7: Commit** `chore: hybrid sweep and final audit` — stage only what changed (skip the commit entirely if Steps 1–6 required no edits).
- [ ] **Step 8 (deferred to human):** visual route pass (all pages), keyboard focus pass (purple rings, tooltips on focus), contrast spot-check, DevTools print preview of `/invoice`, `/dev/components` gallery pass.

## Done criteria

- Every hybrid decision (1–6) traceable: tokens/base/font → H1; buttons/chips → H2; inputs/checkbox/radio → H3; tooltip → H4; nav/shell/auth → H5; per-surface radius/shadows/text variants → H6–H12; cleanliness → H13.
- Gate green after every task; zero cold StudioBlank values outside the job palette; every radius/shadow via tokens; success/error never used as bare text; no 700 weights; no markup/string/logic changes anywhere; `@media print` byte-identical; `routeTree.gen.ts` untouched.
- Human sign-off on the deferred visual checklist closes the plan.





# Design System — Concurrent Timesheeting

This is the source of truth for the project's UI. It documents what is actually
implemented on `design/alternative` — a hybrid: **StudioBlank's structure**
(tokens, component inventory, data-first restraint) wearing **Notion's skin**
(warm neutrals, soft radii, pastel badges, purple CTA). Lineage and per-task
history live in the two dated plan docs; this file is the present tense.

Code lives in three stylesheets, loaded in this order (order is fixed by
`src/routes/__root.tsx` link order):

| File | Role |
|---|---|
| `src/styles/tokens.css` | every design token; nothing else |
| `src/styles/global.css` | base elements + all screen/page sections |
| `src/styles/ui.css` | primitives only (`.btn*`, `.chip*`, `[data-tip]`, `.list`/`.row`) |

New primitive classes go in `ui.css`; screen-specific rules go in `global.css`
near their section. No inline styles outside `src/routes/dev.components.tsx`
(the dev-only gallery). One icon dependency: `reicon-react` (see Icons).

## Principles

1. **Color encodes data, never chrome.** Job identity, overlap, and lifecycle
   status may use chroma. Buttons, links, active tabs, focus, and headings are
   ink/purple/link-blue only. The job palette is the one sanctioned exception.
2. **Warm minimal.** White surfaces, hairline borders, generous whitespace.
   Depth comes from two shadow levels, not heavy borders or dark fills.
3. **Notion geometry, data surfaces stay square.** 8px controls, 12px cards,
   pill badges — but tables and time strips have `border-radius: 0`; their
   grid is information.
4. **Weight, not hue, makes hierarchy.** Inter 400 body vs 600 headings and
   numerals. No 300 or 700 anywhere (weights are not even loaded).
5. **Numbers are mono.** Every metric, timestamp, and rate renders in IBM Plex
   Mono with `tabular-nums`, 400 body / 600 emphasis.
6. **Transitions ≤ 200ms.** Standard is 150ms ease on bg/border/color/shadow.
7. **Copy is design material but it is frozen.** UI strings are governed by
   `docs/reports/2026-09-13-ux-terminology-review.md`; visual changes must not
   reword labels, placeholders, or messages.

## Tokens (`src/styles/tokens.css`)

### Ink & neutrals (Notion warm ramp)

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#37352f` | charcoal ink: body text, headings, emphasis |
| `--color-secondary` | `#ffffff` | text on dark fills (inverse situations) |
| `--color-tertiary` | `#c8c4be` | input borders, quiet outlines |
| `--color-info` | `#5d5b54` | slate: labels, secondary text, table headers |
| `--color-muted` | `#787671` | steel: nav links, placeholders |
| `--color-faint` | `#a4a097` | stone: disabled text, timestamps, hints |

### Accent & links

| Token | Value | Use |
|---|---|---|
| `--color-accent` | `#5645d4` | primary buttons, focus ring |
| `--color-accent-pressed` | `#4534b3` | primary hover |
| `--color-link` | `#005bab` | inline links |
| `--color-link-hi` | `#0075de` | link hover |

### Surfaces, fills, borders

| Token | Value | Use |
|---|---|---|
| `--surface-base` / `--surface-card` | `#ffffff` | page / cards (page bg is white; grouped quiet zones use fills) |
| `--surface-inverse` | `#1a1a1a` | tooltip bubble, selected filter chip |
| `--fill-hover` | `#f6f5f4` | hover fill, disabled bg, strip tracks |
| `--fill-quiet` | `#fafaf9` | inset zones |
| `--border-card` | `#e5e3df` | card borders, disabled button bg |
| `--border-soft` / `--divider` | `#ede9e4` | hairlines, row dividers |
| `--border-input-hover` | `#787671` | input hover border |

### Status (fills vs text)

Fills (dots, bars, borders) use the bright value; **text always uses the
`-text` variant** (≥4.5:1 on white):

| Fill | Text | Meaning |
|---|---|---|
| `--color-success` `#1aae39` | `--color-success-text` `#15803d` | billable, approved, "Working" |
| `--color-warning` `#dd5b00` | `--color-warning-text` `#793400` | premium/over-utilization (text also `--premium-text` `#793400`) |
| `--color-error` `#e03131` | `--color-error-text` `#b91c1c` | errors, rejected, destructive bg |

### Pastel badge tints (pill bg + deep text pairs)

mint `#d9f3e1`/`#126636` · rose `#fde0ec`/`#b91c1c` · lavender `#e6e0f5`/`#391c57`
· sky `#dcecfa`/`#005bab` · yellow `#fef7d6`/`#793400` · gray `#f0eeec`/`#5d5b54`

### Job palette (functional data encoding — the chroma exception)

`--j1` `#1d4ed8` · `--j2` `#c2410c` · `--j3` `#15803d` · `--j4` `#a16207` ·
`--j5` `#6d28d9`, text on them `--j-ink` `#fafafa`. Used for mini-strip blocks
and any "which job is this" fill. `--j4` doubles as the premium hatch base
alongside `--premium-fill` `#ca8a04`.

### Geometry & type

- Spacing (base 16): `--space-1..8` = 4/8/16/32/48/64/96/128px.
- Radius: `--radius-xs` 4 (tooltip, checkbox, flag rows) · `--radius-md` 8
  (buttons, inputs, queue rows) · `--radius-lg` 12 (cards, panels, forms) ·
  `--radius-full` 9999 (chips, radio). Tables/strips: square, by convention.
- Shadows: `--shadow-1` `0 1px 2px rgba(15,15,15,.04)` (hover, KPI, tooltip) ·
  `--shadow-2` `0 4px 12px rgba(15,15,15,.08)` (resting cards/panels).
  `--shadow-3` exists for future modals; unused.
- Fonts: `--font-body` Inter (400/500/600 loaded) · `--font-mono` IBM Plex Mono
  (400/500/600). Loaded via Google Fonts in `__root.tsx`.

## Typography

| Role | Spec |
|---|---|
| h1 | 600 40px/1.15, −0.5px tracking |
| h2 | 600 28px/1.2 (data pages use this as their h1) |
| h3 | 600 20px/1.3 |
| Body | 400 16px/1.55 |
| Table body / controls | 400 14px (buttons 500; small buttons 12px) |
| Labels / captions | 400 13px slate (`.field`, `.checkline`) |
| Mono data | 400 12–13px, `tabular-nums`; emphasis 600 |
| Badges | 600 11–13px |

## Components

### Buttons (`ui.css` + `src/components/ui/button.tsx`)

`<Button variant size>` · `buttonClass(variant, size, extra)` for non-button
elements (e.g. styled links). Variants: **primary** (purple, darkens on hover),
**secondary** (hairline outline, hover fills), **ghost** (text, hover fills),
**destructive** (`--color-error-text` bg — the bright `#e03131` fails 4.5:1
with a white label — hover `#991b1b`). Sizes sm 32px/12px, md 40px/14px,
lg 48px/16px. Disabled = `--border-card` bg + stone text + `not-allowed`
(no opacity trick). Icon inside a button sits 6px from the label (`.btn svg`).

### Chips (`ui.css` + `src/components/ui/chip.tsx`)

Pastel pills, 600 13px. `<StatusChip kind>` (`statusChipClass`) kinds → tints:
solid/success = mint (approved), inverse = lavender (submitted), error = rose
(rejected), outline = neutral hairline (draft/none), muted = gray.
Week-status map: `none|draft → outline`, `submitted → inverse`,
`approved → solid`, `rejected → error`. `<FilterChip selected>`
(`filterChipClass`): transparent hairline; selected = inverse ink pill.
Legacy pills kept as classes: `.tag` gray, `.tag-ok` mint, `.tag-warn` yellow,
`.wtag.human` mint / `.wtag.agent` lavender (mono uppercase 10px).

### Forms (`global.css`)

Inputs/selects/textareas: 44px, radius-md, 1px `--color-tertiary` border,
hover `--border-input-hover`, focus **2px purple border** (`outline: none` —
the focus ring lives on the border here), error border via
`.field:has(.field-error)`, disabled = `--fill-hover` bg + stone text.
`.field` is a flex-column label: 13px slate text above the control.
Checkboxes 18px, radius-xs, checked = ink fill + white `✓` (600); radios 18px
round with an 8px round dot. Errors: `.field-error` (inline, error-text),
`.form-error` (banner, error-text border + text).

### Tooltip (`ui.css`)

Attribute convention: any element with `data-tip="…"` gets a bubble above it
on hover **and** `:focus-within` — inverse bg, white 12px text, radius-xs,
shadow-1, max-width 200px, 6px triangle; 200ms show delay / 0ms hide.
Use instead of `title` except on disabled controls (CSS hover never fires
there; `title` stays).

### Lists & cards

`.list`/`.row` (ui.css): 48px rows, hairline dividers, hover fill, `.active`
ink row; rows round their corners on hover/active. Cards/panels
(`.panel`, forms, KPI): white, 1px `--border-card`, radius-lg, shadow-2;
KPI tiles shadow-1. Screen chrome: 64px top nav (hairline bottom, 500/14
normal-case links, ink underline on active, mono 12px user).

## Icons (`reicon-react`)

- Default **Outline** weight, `currentColor` (follows ink/slate/purple
  automatically), `size` prop; named imports only (tree-shakeable barrel).
- Sizes: **15** nav links · **14** md buttons / level headers (client,
  project) · **13** sm buttons, row actions, job rows, badges-adjacent.
- Icons are decorative siblings of a text label (`.btn` gap handles spacing;
  `.tree-row .name` flexes for level icons). Never replace a word with an
  icon — exception: pure glyph buttons (`‹ › ×`) where `aria-label` carries
  the meaning.
- Current placement map:
  - Nav: Clock (Today), ChartBar (Reports), ShieldCheck (Approvals),
    Gear (Admin), Logout (Sign out)
  - Structure levels: **Building → client, Folder → project,
    Briefcase → job** (the hierarchy read)
  - Row actions: Pen (Edit), Trash2 (Delete), ArchiveIcon (Archive),
    Send (Resend / Send invite)
  - Commits/actions: Check (Save/Add/Approve), X (dismiss/Reject),
    Unlock (Unlock), Printer (Print), FileDownload (Export CSV),
    ChevronLeft/ChevronRight (date nav)
  - Approver actions map `{ primary: Check, destructive: X, secondary: Unlock }`
- Gallery of everything: `/dev/components` (dev builds only).

## Data display conventions

- Tables (`intervallist`, `recontable`, `dailytable`, `intervalaudit`):
  square, 14px body, mono-caps 10px slate headers, `--divider` row hairlines,
  hover fill on data rows, tfoot/total = 1px ink top border + 600.
- Trio semantics (`.trio .seg`): `b` billable → success-text; `h` honest
  wall-clock → primary; `p` premium/overlap → premium-text; `.dollar` money
  in Inter (money rules live in CLAUDE.md #5 — never show cents).
- Bars: honest = ink fill; premium = 45° hatch `repeating-linear-gradient(45deg,
  var(--premium-fill) 0 4px, transparent 4px 8px)` + 1px premium-fill left
  border; overlap hatch on strips is `rgba(55,53,47,.45)` on 3px/5px.
- Day-crossing markers `‹`/`›` stay as glyphs in mono cells (data, not buttons).
- Mini-strip: 28px track on `--fill-hover`, job-colored blocks with mono
  9px `--j-ink` labels.

## Do / Don't

**Do:** use tokens (a raw hex in a component is a bug; only sanctioned cold
values are the destructive hover `#991b1b` and palette literals in tokens.css);
keep 300/700 out (not loaded); put new primitives in `ui.css`; test helpers
purely (`tests/unit/button.test.ts` pattern); keep tooltips on
`data-tip`; eyeball new work on `/dev/components` first.

**Don't:** add a second accent hue; round tables or strips; use shadows beyond
level 1–2; animate > 200ms; put chroma on chrome; replace copy (see principle 7);
add dependencies for styling; set `title` on enabled elements (use `data-tip`).

## Accessibility floor

Global `:focus-visible` = 2px purple outline, 2px offset (inputs swap to a 2px
border via their own rule). Tooltips appear on keyboard focus. Disabled
controls keep semantics (`disabled`, `aria-disabled` where relevant) and stay
readable (stone on hairline, no opacity). Text contrast: body ink 12.3:1,
slate 6.8:1, steel 4.5:1 — steel is the floor for readable text; stone is
decorative only (hints/timestamps), never actionable copy.

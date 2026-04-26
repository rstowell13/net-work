# DESIGN_SYSTEM — net-work

> **Locked at Gate 3.** Single source of truth for visual identity.
> Mockups in `02-design/mockups/` and built code in `03-build/` must
> conform. Changes happen here first, then cascade.

## Identity in one paragraph

net-work is a personal CRM for the people who matter. The visual mood
is **grounded** and **lived-in** — closer to a well-made instrument or
an architect's workbook than a journal. Cooler stone neutrals, an aged-
brass accent, structural Geist type everywhere except the rare
italic-serif moments reserved for page headers and avatar initials.
Both **light** and **dark** themes are first-class.

**Soul:** quiet competence. A workbench, not a stationery set.

---

## Themes

The product is **dual-theme by design**. Light and dark are equal.
Detection follows OS preference (`prefers-color-scheme`); explicit
override in `/settings`.

- **Light theme** — cooler warm-stone surface, warm near-black ink,
  brass accent `#876522`. Daytime / focused work.
- **Dark theme** — deep warm-brown reservoir, light cream ink, lighter
  brass accent `#d9b06a`. Evening / reflection.

Same brand. Same components. Different lighting.

---

## Color

### Strategy

**Committed** — single brass accent carries identity. Everything else
is a narrow band of warm tinted neutrals. No cool grays. Never `#000`
or `#fff`.

### Light palette

| Role | Hex | Use |
|---|---|---|
| Stone (surface) | `#f7f4ec` | Page background. |
| Stone, raised | `#ffffff` | Modal/card surfaces. |
| Stone, sunken | `#ece9e0` | Inset surfaces, search bars. |
| Ink | `#1c1813` | Primary text. |
| Ink, muted | `#544a3c` | Secondary text. |
| Ink, faint | `#9d9382` | Captions, metadata. |
| Rule | `#e6dfd1` | Hairline borders. |
| Brass | `#876522` | Primary accent — buttons, "Fresh" state. |
| Brass, deep | `#5e4715` | Hover, pressed, deep emphasis. |
| Brass, soft | `#ece2c0` | Selected-row tint, focus ring. |
| Sage (quiet good) | `#6e8a6a` | "Connected" status only. |
| Madder (alarm) | `#b14228` | Errors, "Never" state, destructive. |

### Dark palette

| Role | Hex | Use |
|---|---|---|
| Reservoir (surface) | `#1f1a14` | Page background. |
| Surface | `#2c2519` | Raised surfaces. |
| Surface, lifted | `#3a2f23` | Hover/active rows. |
| Light ink | `#e8e2d4` | Primary text. |
| Light ink, muted | `#c3b99f` | Secondary text. |
| Light ink, faint | `#857a61` | Captions. |
| Rule | `#3a2f23` | Hairline borders. |
| Brass | `#d9b06a` | Primary accent. |
| Brass, deep | `#a7853e` | Hover, pressed. |
| Brass, glow | `rgba(217,176,106,0.30)` | `box-shadow` on hover only. |
| Moss (quiet good) | `#7ba788` | "Connected" status only. |
| Ember (alarm) | `#c5613a` | Errors, "Never", destructive. |

### Freshness scale (earthy traffic-light)

The Freshness ring uses three earthy semantic colors so the
state reads at a glance.

| Token | Hex | Use |
|---|---|---|
| Fresh-green | `#5a7a3a` | Moss-olive — Fresh + Warm bands |
| Fading-yellow | `#a8841f` | Aged mustard — Fading band |
| Cold-red | `#9c4828` | Clay-rust — Cold + Dormant bands |

Band-to-color mapping:

| Band | Range | Color |
|---|---|---|
| Fresh | 80–100 | `--fresh-green` |
| Warm | 60–79 | `--fresh-green` |
| Fading | 35–59 | `--fading-yellow` |
| Cold | 15–34 | `--cold-red` |
| Dormant | 0–14 | `--cold-red` |

These three tokens are used **only** on the Freshness ring/label
and on the matching status copy on contact pages. They are not
brand accents — Brass remains the brand accent. Same hex values
across light and dark themes (they sit comfortably on both
surfaces).

### Avatar palette (10 colors)

When a contact has no photo, their avatar uses one of ten earthy
colors, deterministically assigned by contact ID hash so the same
person always gets the same color. White text always.

| Token | Hex | Name |
|---|---|---|
| `--av-1` | `#8b4a1f` | Burnt umber |
| `--av-2` | `#5a7a3a` | Moss |
| `--av-3` | `#a8841f` | Mustard |
| `--av-4` | `#9c4828` | Clay |
| `--av-5` | `#3e5e5a` | Deep teal-earth |
| `--av-6` | `#722f3a` | Plum |
| `--av-7` | `#6e8a6a` | Sage |
| `--av-8` | `#5a4a3c` | Slate-brown |
| `--av-9` | `#876522` | Brass |
| `--av-10` | `#4a5e2c` | Deep olive |

Avatar color is a visual identifier only. It carries no
semantic meaning — connection status, category, freshness, etc.
are conveyed elsewhere.

### Color rules

1. **No cool grays.** Every neutral leans warm.
2. **Brass is a lamp.** Used on the one thing the user should look
   at most on each page. Never decorative; ≤10% of visible pixels.
3. **No gradient text.** Banned.
4. **No glassmorphism by default.** Modal backdrop only.

---

## Typography

### Font stack

- **Display serif:** **Source Serif 4** (variable, opsz 8–60). Italic
  only. **Used in only two places:**
  - Page-level `<h1>`/`<h2>` headers (italic, opsz 96)
  - Avatar initials when no photo
- **UI sans:** **Geist** (variable, weights 300–700). Used for
  **everything else** — body, contact names, labels, inputs, buttons,
  navigation, settings, lists, errors.
- **Mono:** **JetBrains Mono**. Used **only** for `kbd` keyboard-
  shortcut badges. Nowhere else.
- **Numerals:** Geist with `font-feature-settings: 'tnum' 1`
  (tabular figures via OpenType). Handles column alignment without
  needing a separate mono font.
- **Fallbacks:** Source Serif 4 → Georgia → serif. Geist →
  -apple-system → system-ui → sans-serif. JetBrains Mono → ui-monospace.

All three fonts are free (Google Fonts / SIL OFL).

### Scale

Modular **1.25** (Major Third), 16px base.

| Step | Size | Use |
|---|---|---|
| Display 1 | 56px | Page hero on `/` |
| Display 2 | 44px | Section heroes ("This week") |
| H1 | 32px | Page titles |
| H2 | 24px | Section headings |
| H3 | 19px | Sub-section headings |
| Body L | 17px | Diary entries, Relationship Summary |
| Body | 15px | Default UI body |
| Body S | 13.5px | Captions, secondary metadata |
| Small | 11.5px | Status chips, metadata labels |
| Caption | 11px | Smallest UI text |

### Rules

- **Italic Source Serif appears in two places only.** H1/H2 page
  headers, and avatar initials. Nowhere else — not in contact names,
  not in summaries, not in pull quotes.
- **Contact names = Geist Semibold (600), tracking -0.018em.** They
  read structural, not handwritten.
- **Body = Geist Regular.** Use weight (not italic) for emphasis.
- **Numerals in tabular contexts = Geist tabular figures.** Apply
  `font-variant-numeric: tabular-nums` to lists, tables, freshness
  values, counts.
- **kbd badges = JetBrains Mono.** Mono is reserved for this single
  affordance.
- **Line length** capped 65–75ch on prose.
- **Line height:** 1.6 body, 1.55 dense UI, 1.0 display.
- **No em dashes** in product copy.

---

## Layout

### Spacing

Multiples of 4: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96`. Vary
spacing for rhythm.

### Grids

- **App shell:** persistent left nav (240px or 64px icon-rail),
  main content (fluid), optional right rail (320px) on contact detail.
- **Page max-width:** `max-w-[1400px] mx-auto`.
- **Lists:** virtualized. 56px rows on `/contacts`, 80px on
  `/follow-ups`, 96px on plan rows on Home.

### Containers

- **Hairlines over fills.** 1px Rule lines, not card backgrounds.
- **Cards used sparingly.** Only when elevation truly communicates
  hierarchy. Never nested.
- **Borders:** 1px, color `Rule` token. Side-stripe borders banned.

### Radii

- Surfaces / cards: `10px`
- Buttons / inputs: `7px`
- Tags / badges / kbd: `4px`
- Avatars: circle. Freshness meter: `2px`

---

## Motion

**Intensity dial: 2.5 / 5.** Restrained.

| Token | Duration | Easing |
|---|---|---|
| `motion-fast` | 120ms | ease-out quint `cubic-bezier(0.16, 1, 0.3, 1)` |
| `motion-base` | 200ms | ease-out quart `cubic-bezier(0.22, 1, 0.36, 1)` |
| `motion-slow` | 320ms | ease-out expo `cubic-bezier(0.19, 1, 0.22, 1)` |
| `motion-page` | 420ms | ease-out expo |

Rules:
- Animate `transform` and `opacity` only.
- No bounce, elastic, spring overshoot. Only ease-out.
- No staggered list reveals.
- One feature animation: Freshness meter fills L→R over 400ms once
  on page mount.
- Theme toggle: 320ms cross-fade of bg + color, no slide.
- Hover: color shift only.

---

## Components

### Buttons

- **Primary** — solid Ink bg, Stone fg (light) / solid Brass bg, Ink
  fg (dark). Weight 500.
- **Ghost** — transparent bg, Ink/Light-ink fg, 1px Rule border.
- **Quiet** — text-only, Ink-muted fg, no border. Tertiary.
- **Destructive** — solid Madder/Ember bg, Surface fg.
- **Sizes:** sm (28px h, 13px) / md (36px h, 13.5px — default) / lg
  (44px h, 14.5px).

### Avatar

- 44px default; 32px in lists; 64px on contact detail header.
- Circle. Photo when available. Otherwise **italic Source Serif
  initials** in white, on a background drawn from the
  10-color **Avatar palette** above (deterministic by contact
  ID hash). This is one of the two italic-serif places allowed.

### Freshness ring (primary form)

A circular SVG ring containing the freshness number (0–100) in
the center and a small label below.

- **Default size:** 56×56px. Used on plan rows on Home, contact
  detail header, suggestion cards.
- **Stroke:** 5px, with rounded line caps. Track in `Rule`,
  progress in the band's freshness color.
- **Number:** Geist Semibold, 14px, tabular figures, Ink.
- **Label:** Geist Semibold, 10.5px, uppercase, letter-spacing
  0.06em, in the freshness color.
- **Compact size (32×32, 3px stroke)** allowed in dense list
  rows like `/contacts` and `/follow-ups`.

The horizontal-bar form is deprecated; the ring is the
canonical Freshness display.

### Tags / chips

- **Geist Regular**, 11.5px, lowercase kebab-case.
- Bg: Brass, soft (light) / `rgba(217,176,106,0.16)` (dark).
- Fg: Brass, deep (light) / Brass (dark).

### Diary entry

- Border-top 1px Rule.
- Timestamp + channel label in **Geist** 11px Ink-muted, with
  `font-variant-numeric: tabular-nums`.
- Summary in Body L (17px), Geist regular, 2–3 sentence cap.
- Click → opens word-for-word modal.

### Relationship Summary card

- 16px padding-top, no background.
- Body in **Geist Regular**, 17px, Ink (no italic, no serif).
- Single paragraph. No metrics, no dates.
- (The italic serif quality is delivered by the page H1 above; the
  summary itself stays structural.)

### Modal / overlay

- Surface at top, 80vh max, centered.
- Backdrop: Reservoir/Ink at 0.45 opacity + 8px blur.

### Reached / Connected check circles

The two-state plan-status pattern. Each plan row carries two
check circles, independently toggleable.

- **Off state:** 18px circle, 1.5px Rule border, transparent bg,
  Ink-muted label.
- **Reached out (checked):** 18px circle, solid Ink bg, Stone
  checkmark, Ink label.
- **Connected (checked):** 18px circle, solid Sage/Moss bg,
  Stone-raised checkmark, Ink label.
- Stack vertically with 6px gap on plan rows; horizontally on
  contact detail header.

Replaces the older `not-yet-reached / reached / connected` pill
status. Pills are deprecated for plan rows.

### kbd badge

- **JetBrains Mono** 11px. Padding `2px 6px`. Radius 4px.
- Surface, sunken bg, Ink-muted fg.

### Form inputs

- 1px Rule on default; 1.5px Brass on focus.
- Padding `10px 12px`. Label above, helper below.
- Error: 1.5px Madder/Ember + helper text in same color.

### Empty states

- Italic Source Serif headline (one of the two allowed places —
  treated as a page-level H2).
- One sentence in Geist explaining what to do.
- Primary button or Quiet link.
- No illustrations. No icons larger than 24px.

---

## Iconography

- **Library:** Phosphor Icons (`@phosphor-icons/react`).
- **Weight:** Regular (1.5px stroke) globally.
- **Color:** inherits from text color.
- **Size:** 16px dense / 20px default / 24px header.
- **Banned:** emoji.

---

## Voice and copy

- **Tone:** quiet, confident, warm.
- **Address:** "you."
- **No filler verbs:** no "elevate," "seamless," "unleash,"
  "next-gen."
- **Specific over abstract.**
- **No exclamation points.**

---

## Accessibility

- **Contrast:** all text WCAG AA.
- **Focus rings:** Brass 1.5px outline + 2px offset. Never removed.
- **Keyboard:** every interactive element reachable. `?` opens
  shortcut cheat sheet.
- **Reduced motion:** disables Freshness fill animation; zeroes
  `motion-base` durations.

---

## Anti-references

- **Not "dark-mode productivity SaaS."** No purple, no neon.
- **Not Linear/Notion.** No purple, rainbow gradients, decorative
  geometric icons.
- **Not stationery / journal.** No italic serif body. No cream-and-
  honey color stories.
- **Not Apple Notes/Things.** Generic warm-cream + system fonts is
  the genre default; we are deliberately not that.

---

## Theme persistence

`User.theme_preference` enum: `auto` (default) / `light` / `dark`.
`auto` follows `prefers-color-scheme`. Toggle in `/settings`.

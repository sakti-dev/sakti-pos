---
name: Sakti POS
description: Calm, capable, trustworthy point-of-sale — a solid money surface for Indonesian shops.
colors:
  forest-counter: "#094933"
  forest-counter-hover: "#0b5239"
  forest-counter-active: "#063a28"
  cash-mint: "#3cd070"
  cash-mist: "#eefbf3"
  toko-terracotta: "#cb5521"
  counter-cream: "#f4f6f5"
  surface: "#ffffff"
  surface-gray: "#f9fafb"
  ink: "#191d1b"
  ink-secondary: "#414643"
  ink-muted: "#737c77"
  hairline: "#e8ebe9"
  error: "#c62828"
  info: "#0284c7"
  success: "#22c55e"
  warning: "#e6a817"
  danger: "#c0392b"
typography:
  display:
    fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif'
    fontWeight: 800
    fontSize: "28–32px"
    letterSpacing: "-0.02em"
    lineHeight: "1.1"
  headline:
    fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif'
    fontWeight: 700
    fontSize: "22px"
    letterSpacing: "-0.01em"
    lineHeight: "1.2"
  title:
    fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif'
    fontWeight: 700
    fontSize: "16–18px"
    letterSpacing: "-0.01em"
    lineHeight: "1.25"
  body:
    fontFamily: '"Inter", system-ui, sans-serif'
    fontWeight: 400
    fontSize: "14–15px"
    letterSpacing: "normal"
    lineHeight: "1.5"
  label:
    fontFamily: '"Inter", system-ui, sans-serif'
    fontWeight: 500
    fontSize: "13px"
    letterSpacing: "0.01em"
    lineHeight: "1"
  caption:
    fontFamily: '"Inter", system-ui, sans-serif'
    fontWeight: 600
    fontSize: "11px"
    letterSpacing: "0.06em"
    lineHeight: "1"
  numeric:
    fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif'
    fontWeight: 700
    fontSize: "18–30px"
    letterSpacing: "-0.02em"
    lineHeight: "1"
    fontFeature: '"tnum"'
rounded:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "24px"
  pill: "9999px"
spacing:
  "2xs": "2px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
  "3xl": "48px"
components:
  button-primary:
    backgroundColor: "{colors.forest-counter}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.forest-counter-hover}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "40px"
  button-soft-primary:
    backgroundColor: "{colors.cash-mist}"
    textColor: "{colors.forest-counter}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "40px"
  button-outline-primary:
    backgroundColor: "transparent"
    textColor: "{colors.forest-counter}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    height: "40px"
  card-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  card-interactive:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  badge:
    backgroundColor: "{colors.cash-mist}"
    textColor: "{colors.forest-counter}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "48px"
---

# Design System: Sakti POS

## 1. Overview

**Creative North Star: "The Trusted Ledger"**

Sakti POS is a solid, dependable money surface. Confidence comes from restraint and
precision, not decoration — the cashier and owner should feel in control of every
rupiah on screen. The interface recedes; the transaction is the focus. This maps
directly to PRODUCT.md's **Calm · capable · trustworthy** personality and its first
principle, *calm authority*.

The system is a quiet, sure-handed tool with two registers of energy. At rest it is
calm: hairline borders, generous cream surface, deep forest-green as the dominant
brand voice, and bright cash-mint as a sparing confirmation accent. On interaction
and on signature surfaces it becomes **tactile and confident** — buttons push back
with a soft green-tinted lift, the floating action button springs, the mobile nav
bubble rises with a deliberate overshoot. Motion is never ambient noise; it signals
state (a successful payment, a sync going through, the next step in checkout).

Depth is carried by **confident lift** rather than flat tonal layering: elevated,
active, and signature elements get real green-tinted shadows, while the resting
baseline stays a single hairline border. Warmth is **place-aware, not wash-based**:
Indonesian local-commerce warmth arrives through the terracotta accent and tight
geometric display type, never through a beige or cream-painted background. (The
body surface is a cool near-white, `counter-cream`, not a warm wash.)

**Key Characteristics:**

- Deep forest-green primary (`#094933`) as the dominant brand voice; bright cash-mint
  (`#3cd070`) as a sparing confirmation/accent; terracotta (`#cb5521`) as a warm
  signal for specific KPI themes.
- Plus Jakarta Sans for display headings and figures (tight, `-0.01` to `-0.02em`);
  Inter for all body, UI, and labels.
- Hairline resting borders + green-tinted confident shadows on lift; a 3px green
  focus glow on inputs.
- Pill chips for status/counts; `10px` radius on buttons and inputs; `18px` on cards.
- Two-mode navigation: a hover-expand desktop rail + floating action button, and a
  mobile bottom "magic nav" with a rising `+` bubble.
- Sheet-over-banner composition on the dashboard: a deep-green banner zone with a
  cream content sheet sliding up over it (60px top radius).
- Full light/dark theme; dark is a true neutral charcoal (`#0a0a0a`–`#1a1a1a`) that
  keeps the green accents intact.

## 2. Colors: The Toko Palette

A restrained palette where one saturated green carries the surface, a brighter green
confirms, and terracotta marks specific themes. Neutral surfaces are cool, not warm.

### Primary

- **Forest Counter** (`#094933`): The brand anchor. Primary buttons, the dashboard
  banner zone, the sidebar active state, the floating action button. It is the
  dominant green and carries most of the surface commitment. Hover `#0b5239`,
  pressed `#063a28`.
- **Cash Mist** (`#eefbf3`): The pale-green wash for soft backgrounds — soft
  buttons, selected chips, avatar fills, the "Manager" tag. Use wherever a primary
  tint is needed without the weight of solid green.

### Secondary

- **Cash Mint** (`#3cd070`): The confirmation and online/success accent. The sync
  pill, the online status dot, dark-mode primary outlines, decorative banner glows.
  Used sparingly — its brightness is the point; over-use cheapens it.

### Tertiary

- **Toko Terracotta** (`#cb5521`): A warm theme accent for a specific KPI family
  (e.g. one card's themed glow). Carries the place-aware warmth; never a body wash.
- **Semantic** — info `#0284c7`, success `#22c55e`, warning `#e6a817`, danger `#c0392b`,
  error `#c62828`. Status badges and validation only.

### Neutral

- **Counter Cream** (`#f4f6f5`): The light body surface (a *cool* near-white, not a
  warm wash). The dashboard content sheet and page backgrounds.
- **Surface** (`#ffffff`) / **Surface Gray** (`#f9fafb`): Cards, inputs, the top bar,
  nested panels.
- **Ink** (`#191d1b`): Primary text. **Ink Secondary** (`#414643`): secondary copy.
  **Ink Muted** (`#737c77`): metadata, captions, placeholders.
- **Hairline** (`#e8ebe9`): Borders and dividers; `border-light` is the same at 50%
  for the softest card containment.

### Dark theme

Dark inverts to a **true neutral charcoal**, not a green-tinted black: surface
`#1a1a1a`, surface-gray `#111111`, cream/body `#0a0a0a`, text `#ededed`, borders at
`rgba(255,255,255,0.06)`. The green accents are preserved (Forest Counter stays
`#094933`; Cash Mint becomes the active/outline voice), so the brand reads
identically across themes.

### Named Rules

**The Cool-Surface Rule.** Body and card surfaces are cool near-whites
(`counter-cream`, `surface`). Never introduce warm beige / peach / parchment body
washes — warmth is carried only by the terracotta accent and display type, per
PRODUCT.md's place-aware principle.

**The Mint-Rarity Rule.** Cash Mint (`#3cd070`) is a confirmation accent, used on
≤10% of any screen. Its brightness is its value; bathing surfaces in it makes the
brand look cheap and the success signal meaningless.

**The Orphaned-Lavender Ban.** The legacy `--color-accent-4: #f6d0ff` token is
unused and is NOT part of the active palette. Do not introduce it.

## 3. Typography

**Display Font:** Plus Jakarta Sans (fallback Inter → system-ui)
**Body Font:** Inter (fallback system-ui)
**Numeric Font:** Plus Jakarta Sans / Inter with `font-feature-settings: "tnum"`

**Character:** A confident geometric-plus-humanist split. Plus Jakarta Sans is
tight, slightly geometric, and carries headings and figures with quiet authority;
Inter does all the patient body and UI work. The pairing reads as a precise,
competent money tool — never decorative. Display tracking is tight (`-0.01` to
`-0.02em`); labels track *out* (`0.01`–`0.08em`) for legibility.

### Hierarchy

- **Display** (Plus Jakarta Sans, 700–800, 24–32px, `-0.02em`): Auth/PIN screen
  headlines, large confirmation states. Used rarely — one per screen at most.
- **Headline** (Plus Jakarta Sans, 700, 22px, `-0.01em`): Page titles
  (`Transaksi`, `Pengaturan`).
- **Title** (Plus Jakarta Sans, 700, 16–18px, `-0.01em`): Section headings, KPI card
  titles.
- **Body** (Inter, 400, 14–15px, 1.5): All default copy, button labels, input text.
  Cap line length at 65–75ch for prose; UI copy is exempt.
- **Numeric** (Plus Jakarta Sans/Inter, 700, 18–30px, `-0.02em`, tabular-nums):
  Money figures, KPI counts, the clock. Always tabular for alignment.
- **Label** (Inter, 500, 13px, `0.01em`): Form labels, list metadata, inline labels.
- **Caption** (Inter, 600, 11px, `0.06em`): Status badges and pill chips — uppercase.

### Named Rules

**The Tight-Display Rule.** Display and figure tracking stays at `-0.01` to
`-0.02em`. Never go tighter than `-0.04em` (letters touch) or track display *out*.

**The Eyebrow-Is-A-Label Rule.** The uppercase tracked caption is reserved for
**single functional domain/status labels** (e.g. the earnings-figure caption
"Est. Pendapatan Hari Ini", status pills). Do **not** apply a tiny uppercase tracked
eyebrow above every section — that is the generic scaffolding reflex this brand
rejects. One deliberate label per concept.

## 4. Elevation

This system uses **confident lift**: hairline borders are the resting baseline, and
real green-tinted shadows are the primary depth signal on elevated, active, and
signature elements. It is not a flat tonal system and not an all-shadow system —
depth appears as a *response to state and importance*.

### Shadow Vocabulary

- **Hairline (resting baseline):** `1px solid var(--color-border)` / `border-light`.
  Cards and inputs at rest. No shadow.
- **Focus Glow:** `box-shadow: 0 0 0 3px rgba(9,73,51,0.08)` (+ `outline: 2px` ring).
  Text fields on focus — the canonical attention state.
- **Soft Lift:** `0 4px 12px rgba(9,73,51,0.25), 0 1px 3px rgba(9,73,51,0.10)`.
  Solid primary button on hover; the FAB on hover.
- **Card Lift:** `0 4px 16px rgba(0,0,0,0.05)`. Interactive cards on hover
  (with `-translate-y-px`).
- **Confident Lift (signature):** `0 6px 20px rgba(9,73,51,0.30)` — the mobile nav
  bubble. `shadow-sm` on elevated cards. The deepest shadows are reserved for the
  elements that float above the content plane.
- **Dark theme** swaps green-tints for neutral: e.g. FAB `0 4px 16px rgba(0,0,0,0.35)`,
  nav `0 6px 20px rgba(0,0,0,0.50)`.

### Named Rules

**The Lift-On-Importance Rule.** Shadow depth is proportional to how far an element
floats above the content plane and how important it is. A resting card: hairline
only. A hoverable card: soft lift. A floating action or nav bubble: confident lift.
Never pair a 1px border with a wide (`≥16px` blur) decorative shadow on the same
element as pure ornament — pick border *or* shadow.

## 5. Components

Buttons, cards, inputs, and chips feel **tactile and confident**: solid fills, clear
press-and-release affordance, hairline resting state, green-tinted lift on
interaction. Nothing theatrical; everything sure-handed.

### Buttons

Built on a `look × tone × size` CVA matrix (5 looks × 3 tones × 9 sizes) in
`src/components/ui/button.tsx`.

- **Shape:** `10px` radius (`rounded-sm`); default size `md` = 40px tall, 16px
  horizontal padding.
- **Solid / Primary:** `forest-counter` fill, white text. Hover: `-translate-y-px`
  + Soft Lift shadow + `forest-counter-hover`. Active: returns to 0 + `forest-counter-active`,
  shadow cleared. The signature tactile button.
- **Soft / Primary:** `cash-mist` fill, `forest-counter` text — selected states,
  secondary emphasis. (Dark: mint at 10% alpha, mint text.)
- **Outline / Primary:** 1.5px `forest-counter` border, transparent fill,
  semibold green text; hover fills `cash-mist`.
- **Ghost:** transparent, `ink-secondary` text; hover faint green tint. For
  low-emphasis and tertiary actions.
- **Destructive:** `#c62828` solid (solid), or `#b05050` text on red-tinted soft/ghost.
- **Focus:** `outline: 2px` ring in `--color-ring` (`forest-counter`) with offset.
- **Disabled:** `opacity-50`, `pointer-events-none`.

### Cards / Containers

CVA in `src/components/ui/card.tsx`; default radius `lg` (18px).

- **Default:** `surface` fill, `border-light` hairline, no shadow.
- **Elevated:** adds `shadow-sm`.
- **Interactive:** hover lifts (`-translate-y-px`), border warms to
  `rgba(26,51,0,0.15)`, Card Lift shadow; active returns to rest.
- **Ghost:** borderless, shadowless — for grouped content inside another container.
  Nested cards are forbidden.

### Inputs / Fields

Kobalte `TextField` in `src/components/ui/text-field.tsx`; 48px tall, 1.5px
`border-input`, `surface` fill, `10px` radius, Inter 15px.

- **Focus:** border → `forest-counter` + Focus Glow (3px green) + 2px outline ring.
- **Invalid:** `destructive` border + red-tinted 3px glow.
- **Disabled:** `opacity-50`. **Labels:** Inter 13px / 500, `0.01em` tracking.

### Chips / Badges

Pill (`9999px`), Inter 11px / 600, uppercase, `0.06em` tracking. Variants: default
(`cash-mist`/`forest-counter`), success/warning/danger/processing tints, outline.
For status, counts, and roles — never for primary navigation.

### Navigation

- **Desktop rail (Sidebar):** fixed, 80px collapsed → expands on hover to ~200px.
  `surface` fill, `border-r` hairline; motion-solidjs slide-in. Active item in
  `forest-counter`. Hidden under 900px.
- **Desktop FAB:** floating `Buat Transaksi` action, bottom-right, `forest-counter`,
  pulsing ambient shadow that clears on hover with a spring lift. Hidden under 900px.
- **Mobile magic nav:** fixed bottom bar (75px), three tabs + a central floating
  `+` bubble (62px) in `forest-counter` that rises with overshoot easing and a
  curved-notch cutout. Active tab icon lifts up and turns green; label fades in.
  Hidden above 900px.
- **Top bar:** fixed 54px header with the online/sync pill (Cash Mint), a tabular
  clock (WIB), and a notification button. Slides with the sidebar's expand state.

### Signature Component: Sheet-over-Banner

The dashboard stacks a deep-green **banner zone** (`bg-primary`, holding the venue
and earnings cards) under a **content sheet** in `counter-cream` that slides up over
it with a `60px` top radius and a motion-solidjs entrance. It is the brand's
signature composition — calm authority below, the working surface floating above.

## 6. Do's and Don'ts

Concrete guardrails. Every PRODUCT.md anti-reference is carried through here.

### Do:

- **Do** let `forest-counter` (`#094933`) carry the surface commitment; use
  `cash-mint` (`#3cd070`) only as a sparing confirmation/online accent (≤10%/screen).
- **Do** use the CVA button matrix (`look × tone × size`) — never hand-roll a
  one-off button style.
- **Do** keep resting surfaces on a hairline border and reserve green-tinted
  shadows for hover/active/signature elements (Lift-On-Importance).
- **Do** use tabular-nums (`"tnum"`) for every money figure, count, and the clock.
- **Do** keep display tracking at `-0.01` to `-0.02em` (tight, never touching).
- **Do** design for one-handed touch first: ≥44px targets, thumb-reachable primary
  actions, bottom-sheet actions on mobile.
- **Do** keep body text ≥4.5:1 contrast — legibility under retail glare is a trust
  requirement, not an aesthetic preference.
- **Do** honor `prefers-reduced-motion`: replace overshoot/spring with a crossfade
  or instant transition.

### Don't:

- **Don't** introduce warm beige / cream / peach / parchment body washes. Surfaces
  are cool near-whites; warmth is terracotta + display type only (Cool-Surface Rule).
- **Don't** reuse the orphaned `--color-accent-4: #f6d0ff` lavender — it is not part
  of the active palette (Orphaned-Lavender Ban).
- **Don't** apply a tiny uppercase tracked eyebrow above every section. The caption
  style is for single functional domain/status labels only (Eyebrow-Is-A-Label Rule).
- **Don't** make this look like a Square / Toast / Shopify POS reskin, a cluttered
  gray legacy POS, or a sterile placeless all-white app (PRODUCT.md anti-references).
- **Don't** pair a 1px border with a wide (`≥16px` blur) decorative shadow on one
  element as ornament — pick border *or* shadow (Lift-On-Importance).
- **Don't** convey status by color alone — money in/out and success/failure must
  read via icon + label + value, never hue alone (PRODUCT.md accessibility).
- **Don't** use bounce/elastic easing for ambient entrance reveals. Overshoot
  (`easeOutBack`) and spring easing are reserved for signature tactile moments
  (the FAB, the mobile nav bubble); everything else uses exponential ease-out
  (`cubic-bezier(0.22,1,0.36,1)`).

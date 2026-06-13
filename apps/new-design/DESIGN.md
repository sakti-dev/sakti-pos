---
name: Sakti POS
description: Calm, capable, trustworthy point-of-sale — a botanical-greenhouse money surface for Indonesian shops.
colors:
  # Seed primitives — the identity spine (see src/styles/theme.css)
  canopy: "#1c3a13"
  canopy-hover: "#244a18"
  canopy-active: "#142b0e"
  lime: "#d3fa99"
  parchment: "#fcfcf7"
  stone: "#eeeee9"
  sage: "#c4c7c4"
  gray: "#b3b3b3"
  # shadcn roles mapped from the primitives
  background: "{colors.parchment}"
  foreground: "{colors.canopy}"
  card: "{colors.parchment}"
  popover: "{colors.parchment}"
  muted: "{colors.stone}"
  secondary: "{colors.stone}"
  muted-foreground: "#4b5640"
  faint-foreground: "#6e7864"
  primary: "{colors.canopy}"
  primary-foreground: "#ffffff"
  accent: "{colors.lime}"
  accent-foreground: "{colors.canopy}"
  accent-soft: "{colors.lime}"
  border: "rgba(28,58,19,0.12)"
  input: "{colors.border}"
  ring: "{colors.canopy}"
  # Status tones (POS extension — seed has none)
  destructive: "#c62828"
  info: "#0284c7"
  success: "{colors.canopy}"
  warning: "#e6a817"
  danger: "#c0392b"
  # Dark mode — near-neutral charcoal (status tones stay static, same as light)
  dark-background: "#151515"
  dark-card: "#1a1a1a"
  dark-foreground: "#ededed"
  dark-border: "rgba(255,255,255,0.08)"
typography:
  display:
    fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif'
    fontWeight: 700
    fontSize: "32–48px"
    letterSpacing: "-0.8px to -1.44px"
    lineHeight: "1–1.2"
  heading:
    fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif'
    fontWeight: 700
    fontSize: "24px"
    letterSpacing: "-0.48px"
    lineHeight: "1.17"
  title:
    fontFamily: '"Plus Jakarta Sans", "Inter", system-ui, sans-serif'
    fontWeight: 600
    fontSize: "18–20px"
    letterSpacing: "-0.3px"
    lineHeight: "1.2"
  body:
    fontFamily: '"Inter", system-ui, sans-serif'
    fontWeight: 400
    fontSize: "14–16px"
    letterSpacing: "-0.4px"
    lineHeight: "1.4–1.5"
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
  # Tailwind v4 default scale — no custom --radius tokens
  button: "rounded-sm"
  input: "rounded-sm"
  card: "rounded-lg (default; sm/md/xl available via the Card CVA)"
  badge: "rounded-full (9999px)"
  nav-bubble: "rounded-full"
  note: "Custom radius scale was removed; use Tailwind defaults."
spacing:
  base: "8px"
  note: "Tailwind default spacing scale (seed base unit = 8px)."
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    height: "40px (md)"
  button-soft-primary:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.button}"
    height: "40px"
  button-outline-primary:
    border: "1.5px solid {colors.primary}"
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.button}"
    height: "40px"
  card-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    border: "1px solid {colors.border}/50"
    rounded: "{rounded.card}"
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.caption}"
    rounded: "{rounded.badge}"
    padding: "2px 10px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    border: "1.5px solid {colors.input}"
    typography: "{typography.body}"
    rounded: "{rounded.input}"
    height: "48px"
---

# Design System: Sakti POS

## 1. Overview

**Creative North Star: "The Apothecary Greenhouse"**

Sakti POS is a calm, sure-handed money surface that borrows the visual language of a
botanical apothecary — a warm parchment canvas, one deep botanical green that carries
the whole chromatic load, a single sunlit-lime accent reserved for small moments of
confirmation, and pill-shaped status markers. Confidence comes from restraint and
precision, not decoration: the cashier and owner should feel in control of every rupiah
on screen. This maps directly to PRODUCT.md's **Calm · capable · trustworthy**
personality and its first principle, *calm authority*.

The system has two registers of energy. At rest it is calm: hairline borders, a warm
parchment surface, deep **canopy** green as the dominant brand voice, and bright **lime**
as a sparing confirmation/online accent. On interaction and on signature surfaces it
becomes **tactile and confident** — buttons push back with a soft canopy-tinted lift, the
floating action button springs, the mobile nav bubble rises with a deliberate overshoot.
Motion is never ambient noise; it signals state (a successful payment, a sync going
through, the next step in checkout).

Depth is carried by **confident lift** rather than flat tonal layering: elevated, active,
and signature elements get real canopy-tinted shadows, while the resting baseline stays a
single hairline border.

**Relationship to the Seed reference.** This system is derived from the Seed style
reference (`seed-design.md`), an apothecary-meets-clinical aesthetic. It keeps Seed's
defining moves — the warm parchment canvas, the single-deep-green discipline, the
sunlit-lime accent, the tight type scale, pill badges. It deliberately departs from Seed
in three places, all forced by being a *money tool* rather than a supplement storefront:

- **Status tones exist.** Seed bans semantic color. A POS cannot — money in/out,
  success/failure, and warnings must read at a glance. So `info / success / warning /
  danger` are a controlled POS extension, used only on status badges and validation.
- **Shadows exist.** Seed is intentionally flat. A money surface needs confident depth on
  its actions, so elevated/active/signature elements carry canopy-tinted lift. Resting
  surfaces stay flat + hairline, preserving the apothecary calm.
- **Display type is Plus Jakarta Sans (700), not a weight-300 whisper.** Seed uses a light
  display to defer to product photography; a POS needs figures and headlines that read
  instantly under retail glare, so the display is tight and weighted, not whisper-light.

**Key Characteristics:**

- Deep canopy green (`#1c3a13`) as the dominant brand voice — primary buttons, the
  dashboard banner zone, the sidebar active state, the floating action button; sunlit lime
  (`#d3fa99`) as a sparing confirmation/online/accent.
- Plus Jakarta Sans for display headings and figures (tight, `-0.3` to `-1.44px`); Inter
  for all body, UI, and labels.
- Hairline resting borders (canopy @ 12% alpha) + canopy-tinted confident shadows on lift;
  a 2px canopy ring + canopy focus glow on inputs.
- Pill (`9999px`) chips for status/counts; `rounded-sm` on buttons and inputs;
  `rounded-lg` on cards. Radius uses **Tailwind's default scale** — there is no custom
  radius scale.
- Two-mode navigation: a hover-expand desktop rail + floating action button, and a mobile
  bottom "magic nav" with a rising `+` bubble.
- Sheet-over-banner composition on the dashboard: a deep-green banner zone with a content
  sheet sliding up over it.
- Full light/dark theme. Light is the warm parchment canvas; dark is a true-neutral
  **charcoal** (background `#151515`, cards `#1a1a1a`) that keeps the green/lime
  accents intact. Status tones are **static** — identical in both modes.

## 2. Tokens: where they live

All design tokens are defined in `src/styles/theme.css` as a Tailwind v4 `@theme` block,
imported by `src/index.css`. Two layers:

1. **Seed primitives** (`--color-canopy`, `--color-lime`, `--color-parchment`,
   `--color-stone`, `--color-sage`, `--color-gray`) — the identity spine. These are the
   only brand colors; everything else references them.
2. **shadcn roles** (`--color-background`, `--color-foreground`, `--color-card`,
   `--color-primary`, `--color-accent`, `--color-border`, `--color-ring`, …) — structural
   role names that map onto the primitives. Using shadcn-native names keeps components
   portable and keeps brand identity in the primitives + their values.

**All color values are `oklch()`.** Hex is used in this document as the identity label;
`theme.css` stores the perceptually-uniform `oklch()` form (e.g. canopy =
`oklch(0.3146 0.0734 139.03)`). Edit colors in `theme.css`, never as arbitrary hex in
components.

### Dark mode

Dark is a **true-neutral charcoal**, not a green-tinted black: background
`oklch(19.574% 0.00002 271.152)` (near-neutral ≈ `#151515`), cards/popovers `#1a1a1a`,
muted `#222`, foreground `#ededed`, borders at `rgba(255,255,255,0.08)`. The green/lime
accents are preserved — canopy stays the primary, lime becomes the outline/active voice in
dark — so the brand reads identically across themes. **Status tones are static**: info,
warning, danger keep their light-mode values in dark (deliberate — a stable, glanceable
status vocabulary matters more than theme-matched tinting). Dark mode is a *base-surface
override only* in `@layer theme` under `.dark`; everything else inherits.

## 3. Colors: the Greenhouse Palette

A restrained palette where one saturated green carries the surface, a brighter lime
confirms and highlights, and warm paper is the canvas.

### Primitives (the only brand colors)

| Token            | Hex       | oklch (code form)                       | Role                                                              |
| ---------------- | --------- | --------------------------------------- | ---------------------------------------------------------------- |
| `--color-canopy` | `#1c3a13` | `oklch(0.3146 0.0734 139.03)`           | The brand anchor. Primary, foreground, borders, icons, text.     |
| `--color-lime`   | `#d3fa99` | `oklch(0.9356 0.1298 126.62)`           | The confirmation/highlight accent — badges, dots, sync pill.     |
| `--color-parchment` | `#fcfcf7` | `oklch(0.9897 0.0066 106.52)`        | The warm canvas — page background, cards, inputs.                |
| `--color-stone`  | `#eeeee9` | `oklch(0.9477 0.0066 106.53)`           | Secondary surface — muted bands, secondary fills.                |
| `--color-sage`   | `#c4c7c4` | `oklch(0.8264 0.0053 145.53)`           | Cool muted panel — inactive/disabled zones.                       |
| `--color-gray`   | `#b3b3b3` | `oklch(0.7668 0 0)`                     | Disabled controls, lowest-prominence surface.                     |

### Roles (mapped from the primitives)

- **Background / Card / Popover** = `parchment`. The warm canvas and every raised surface.
- **Foreground / Primary** = `canopy`. Primary text and the primary action color are the
  same deep green — the single-color discipline.
- **Primary-hover** `#244a18` / **Primary-active** `#142b0e` — the two press steps on the
  solid button.
- **Accent / Accent-soft** = `lime`. Used sparingly: the sync pill, online dot, highlight
  washes, soft-primary buttons. **Accent-soft is static lime in both modes** (not theme-tinted).
- **Muted / Secondary** = `stone`. Secondary fills and muted zones.
- **Muted-foreground** `#4b5640` (a dark green-gray, `oklch(0.4369 0.0376 129.47)`):
  secondary copy. **Faint-foreground** `#6e7864` (`oklch(0.5583 0.0324 129.13)`):
  metadata, placeholders, the clock suffix.
- **Border / Input** = canopy @ 12% alpha (`oklch(0.3146 0.0734 139.03 / 0.12)`).
  **Ring** = `canopy`.

### Status tones (POS extension — used on badges and validation only)

info `#0284c7`, success = `canopy` (the brand green *is* the success color), warning
`#e6a817`, danger `#c0392b`, destructive `#c62828`. Each has a `*-foreground` (white).
Dark mode lightens destructive to `#f87171` for contrast; the others stay static. The
**processing** badge is the one intentional literal: yellow `rgba(255,233,92,0.25)` fill
with `#7a5f00` text — a "pending/in-flight" state that deliberately does not map to the
semantic ramp.

### Named Rules

**The Parchment-Canvas Rule.** The body surface is warm parchment (`#fcfcf7`), an
extremely-light, extremely-desaturated warm paper (L 0.99, chroma 0.0066) — the
apothecary canvas, a deliberate identity choice. It is **not** an open license for warm
washes: do not introduce saturated beige, peach, sand, or muddy cream fills. Warmth is the
single parchment canvas plus the lime/canopy accents; no second warm surface.

**The Lime-Rarity Rule.** Lime (`#d3fa99`) is a confirmation/highlight accent, used on
≤10% of any screen (the sync pill, the online dot, highlight washes, soft-primary fills).
Its brightness is its value; bathing surfaces in it cheapens the brand and flattens the
success signal.

**The Single-Green Rule.** Canopy is the *only* green. Do not introduce a second green
(brand-mint, forest-mid, sage-as-fill). `--color-sage` and `--color-gray` are muted
neutrals for disabled/inactive surfaces, not a second brand green.

## 4. Typography

**Display Font:** Plus Jakarta Sans (fallback Inter → system-ui) — loaded weights 500–800.
**Body Font:** Inter (fallback system-ui) — loaded weights 300–700.
**Numeric Font:** Plus Jakarta Sans / Inter with `font-feature-settings: "tnum"`.

**Character:** A confident geometric-plus-humanist split. Plus Jakarta Sans is tight and
slightly geometric; it carries headings and figures with quiet authority. Inter does all
the patient body and UI work. Display tracking tightens progressively with size (Seed's
ramp: `-0.3px` at 10px caption → `-1.44px` at 48px display); labels track *out*
(`0.01em`) for legibility.

### Type scale (tokens in `theme.css`)

| Token                | Size | Line height | Letter spacing | Role                          |
| -------------------- | ---- | ----------- | -------------- | ----------------------------- |
| `--text-caption-sm`  | 10px | 1.4         | -0.3px         | Tiny metadata                 |
| `--text-body-sm`     | 14px | 1.4         | -0.42px        | Dense UI, secondary copy      |
| `--text-body`        | 16px | 1.4         | -0.4px         | Body default                  |
| `--text-body-lg`     | 18px | 1.3         | -0.36px        | Lead body                     |
| `--text-subheading`  | 20px | 1.2         | -0.3px         | Section subtitles             |
| `--text-heading-sm`  | 24px | 1.17        | -0.48px        | Card / section headings       |
| `--text-heading`     | 32px | 1.2         | -0.8px         | Page headlines                |
| `--text-heading-lg`  | 40px | 1.1         | -1.2px         | Large headlines               |
| `--text-display`     | 48px | 1           | -1.44px        | Display (auth/confirmation)   |

### Practical roles

- **Display** (Plus Jakarta Sans, 700, 32–48px, tight): auth/PIN headlines, large
  confirmation states. One per screen at most.
- **Headline** (Plus Jakarta Sans, 700, 24px): page titles (`Transaksi`, `Pengaturan`).
- **Title** (Plus Jakarta Sans, 600, 18–20px): section headings, KPI card titles.
- **Body** (Inter, 400, 14–16px, 1.4–1.5): all default copy, button labels, input text.
  Cap prose at 65–75ch; UI copy is exempt.
- **Numeric** (Plus Jakarta Sans, 700, 18–30px, tabular-nums): money figures, KPI counts,
  the clock. Always tabular for alignment.
- **Label** (Inter, 500, 13px, `0.01em`): form labels, list metadata.
- **Caption** (Inter, 600, 11px, `0.06em`, uppercase): status badges and pill chips.

### Named Rules

**The Tight-Display Rule.** Display and figure tracking follows the Seed ramp and stays
negative. Never track display *out*, and never go so tight that letters touch.

**The Eyebrow-Is-A-Label Rule.** The uppercase tracked caption is reserved for **single
functional domain/status labels** (e.g. the earnings caption, status pills). Do **not**
apply a tiny uppercase tracked eyebrow above every section — that is the generic
scaffolding reflex this brand rejects. One deliberate label per concept.

## 5. Elevation

This system uses **confident lift**: hairline borders are the resting baseline, and real
canopy-tinted shadows are the primary depth signal on elevated, active, and signature
elements. It is not a flat tonal system and not an all-shadow system — depth appears as a
*response to state and importance*.

### Shadow vocabulary (canopy-tinted in light)

- **Hairline (resting baseline):** `1px solid var(--color-border)` (canopy @ 12%, or
  `/50` for the softest card containment). Cards and inputs at rest. No shadow.
- **Focus ring:** `outline-2 outline-ring` + `ring-2 ring-primary/10` on text fields — the
  canonical attention state.
- **Card lift:** `--shadow-card` = `0 1px 2px canopy/0.05, 0 8px 24px -10px canopy/0.12`.
- **Card-hover lift:** `--shadow-card-hover` = `0 2px 6px canopy/0.06,
  0 14px 36px -12px canopy/0.18`.
- **Solid-button lift:** `0 4px 12px canopy/0.25, 0 1px 3px canopy/0.10` on hover; clears
  to `none` on active. Dark swaps to a neutral `0 6px 20px rgba(0,0,0,0.45)`.
- **Signature lift:** the FAB's pulsing ambient shadow and the mobile nav bubble get the
  deepest shadows — reserved for elements that float above the content plane.

### Named Rules

**The Lift-On-Importance Rule.** Shadow depth is proportional to how far an element floats
above the content plane and how important it is. Resting card: hairline only. Hoverable
card: card-hover lift. Floating action or nav bubble: signature lift. Never pair a 1px
border with a wide (`≥16px` blur) decorative shadow on the same element as pure ornament —
pick border *or* shadow.

## 6. Components

Buttons, cards, inputs, and chips feel **tactile and confident**: solid fills, clear
press-and-release affordance, hairline resting state, canopy-tinted lift on interaction.
Nothing theatrical; everything sure-handed.

### Buttons

CVA matrix (`look × tone × size`) in `src/components/ui/button.tsx` — 5 looks × 3 tones ×
9 sizes.

- **Shape:** `rounded-sm`; default size `md` = 40px tall, `px-4 py-2`.
- **Solid / Primary:** `primary` (canopy) fill, white text. Hover: `-translate-y-px` +
  solid-button lift + `primary-hover`. Active: returns to 0 + `primary-active`, shadow
  cleared. The signature tactile button.
- **Soft / Primary:** `accent-soft` (lime) fill, `primary` (canopy) text — selected
  states, secondary emphasis.
- **Outline / Primary:** 1.5px `primary` border, transparent fill, semibold green text;
  hover fills `primary/5`. Dark mode uses the `accent` (lime) border/text.
- **Ghost:** transparent, `muted-foreground` text; hover faint foreground tint. For
  low-emphasis/tertiary actions.
- **Destructive:** `destructive` solid, or `destructive/10` text on red-tinted soft/ghost.
- **Focus:** `outline-2` ring in `--color-ring` (canopy) with offset.
- **Disabled:** `opacity-50`, `pointer-events-none`.

### Cards / Containers

CVA (`variant × radius`) in `src/components/ui/card.tsx`; default radius `lg`
(`rounded-lg`).

- **Default:** `card` (parchment) fill, `border-border/50` hairline, no shadow.
- **Elevated:** adds `shadow-sm`.
- **Interactive:** hover lifts (`-translate-y-px`), border warms to `primary/15`,
  `--shadow-card-hover`; active returns to rest.
- **Outline:** full `border-border`.
- **Ghost:** borderless, shadowless — for grouped content inside another container. Nested
  cards are forbidden.

### Inputs / Fields

Kobalte `TextField` in `src/components/ui/text-field.tsx`; 48px tall, 1.5px `border-input`,
`background` (parchment) fill, `rounded-sm`, Inter 15px.

- **Focus:** border → `primary` + 2px `ring` outline + `ring-2 ring-primary/10`.
- **Invalid:** `destructive` border + red-tinted `ring-destructive/10`.
- **Disabled:** `opacity-50`. **Labels:** Inter 13px / 500, `0.01em` tracking.

### Chips / Badges

Pill (`rounded-full`, 9999px), Inter 11px / 600, uppercase, `0.06em` tracking. Variants in
`src/components/ui/badge.tsx`: default (`primary`/white), secondary, destructive, outline,
success/warning/danger/accent (tinted fills: `success/10`, `warning/15`, etc.), and the
literal-yellow **processing** badge. For status, counts, and roles — never for primary
navigation.

### Navigation

- **Desktop rail (Sidebar):** fixed, 80px collapsed → expands on hover to ~200px. `card`
  fill, `border-r` hairline; motion-solidjs slide-in. Active item in `primary` (canopy).
  Hidden under 900px.
- **Desktop FAB:** floating `Buat Transaksi` action, bottom-right, `primary`, pulsing
  ambient shadow that clears on hover with a spring lift. Hidden under 900px.
- **Mobile magic nav:** fixed bottom bar, tabs + a central floating `+` bubble in
  `primary` that rises with overshoot easing and a curved-notch cutout. Active tab icon
  lifts and turns green; label fades in. Hidden above 900px.
- **Top bar:** fixed 54px header, `card` fill, with the online/sync pill (lime `accent`
  fill/border + a `primary`-rimmed lime dot), a tabular clock (`muted-foreground` + WIB in
  `faint-foreground`), and a notification button. Slides with the sidebar's expand state.

### Signature Component: Sheet-over-Banner

The dashboard stacks a deep-green **banner zone** (`bg-primary`, holding the venue and
earnings cards) under a **content sheet** in `background` (parchment) that slides up over
it with a motion-solidjs entrance. It is the brand's signature composition — calm
authority below, the working surface floating above.

## 7. Motion

Tokens: `--ease-standard: cubic-bezier(0.4,0,0.2,1)`, `--duration-standard: 0.2s`. Most
transitions are 150–250ms exponential ease-out — users are in flow; motion conveys state,
not choreography.

- **State feedback:** `shake` (error), `success-pop` (`cubic-bezier(0.175,0.885,0.32,1.275)`,
  the one signature overshoot — reserved for a confirmed payment), `avatar-pulse`,
  `pulse-dot` (the online indicator).
- **Reveal:** `fade-in`, `fadeUp` (stagger entrance), `content-show`/`content-hide` for
  sheets. Reveal animations enhance an already-visible default; content is never gated on a
  class-triggered transition (transitions pause on hidden tabs / headless renderers).
- **Ambient:** the FAB's `fab-pulse` shadow pulse; `ghost-float` decorative drift.
- **Reduced motion is not optional.** Every animation has a
  `@media (prefers-reduced-motion: reduce)` alternative (crossfade or instant). Bounce and
  elastic easing are reserved for the signature tactile moments (FAB, mobile nav bubble);
  everything else uses exponential ease-out.

## 8. Do's and Don'ts

Concrete guardrails. Every PRODUCT.md anti-reference is carried through here.

### Do:

- **Do** let `canopy` (`#1c3a13`) carry the surface commitment; use `lime` (`#d3fa99`)
  only as a sparing confirmation/online/highlight accent (≤10%/screen).
- **Do** keep one green. Canopy is primary, foreground, success, border — all of it.
- **Do** edit colors in `src/styles/theme.css` (the primitives + shadcn roles), in `oklch`.
  Never hardcode brand hex in components.
- **Do** use the CVA button/card/badge matrices — never hand-roll one-off styles.
- **Do** keep resting surfaces on a hairline border and reserve canopy-tinted shadows for
  hover/active/signature elements (Lift-On-Importance).
- **Do** use tabular-nums (`"tnum"`) for every money figure, count, and the clock.
- **Do** design for one-handed touch first: ≥44px targets, thumb-reachable primary
  actions, bottom-sheet actions on mobile.
- **Do** keep body text ≥4.5:1 contrast — legibility under retail glare is a trust
  requirement, not an aesthetic preference.
- **Do** honor `prefers-reduced-motion`: replace overshoot/spring with a crossfade or
  instant transition.

### Don't:

- **Don't** introduce a second green, or warm/muddy beige/peach/sand fills. The warm
  surface is the single parchment canvas; warmth elsewhere is lime + canopy + type
  (Parchment-Canvas Rule).
- **Don't** add semantic colors outside the controlled status-tone set
  (`info/success/warning/danger/destructive` + the literal processing yellow). Seed is
  deliberately one-green; the POS extension is closed, not open.
- **Don't** introduce a custom radius scale. Use Tailwind defaults (`rounded-sm` buttons
  and inputs, `rounded-lg` cards, `rounded-full` badges/pills).
- **Don't** apply a tiny uppercase tracked eyebrow above every section. The caption style
  is for single functional domain/status labels only (Eyebrow-Is-A-Label Rule).
- **Don't** make this look like a Square / Toast / Shopify POS reskin, a cluttered gray
  legacy POS, or a sterile placeless all-white app (PRODUCT.md anti-references).
- **Don't** pair a 1px border with a wide (`≥16px` blur) decorative shadow on one element
  as ornament — pick border *or* shadow (Lift-On-Importance).
- **Don't** convey status by color alone — money in/out and success/failure must read via
  icon + label + value, never hue alone (PRODUCT.md accessibility).
- **Don't** use bounce/elastic easing for ambient entrance reveals. Overshoot
  (`success-pop`) and spring easing are reserved for signature tactile moments (the FAB,
  the mobile nav bubble, a confirmed payment); everything else uses exponential ease-out.

---
target: src/pages/pengaturan/
total_score: 25
p0_count: 2
p1_count: 2
timestamp: 2026-06-13T22-11-27Z
slug: src-pages-pengaturan
---
# Critique — `src/pages/pengaturan/` (Settings)

Focus: color visibility and readability, dark mode in particular (reported: tema
selector text unreadable in dark mode).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Selected tema state renders at 1.00:1 in dark — the "selected" signal is invisible |
| 2 | Match System / Real World | 3 | Locale match excellent (WIB/WITA/WIT, QRIS/GoPay/OVO/Dana, Bahasa) |
| 3 | User Control and Freedom | 3 | Batal present on every form; theme switch is instant with no confirm |
| 4 | Consistency and Standards | 2 | Three "selected-on-lime" treatments exist; two are broken, one is correct |
| 5 | Error Prevention | 2 | Tax input 0–100 has no visible guard; forms not wired |
| 6 | Recognition Rather Than Recall | 3 | Nav icons + labels; 8 sections grouped logically |
| 7 | Flexibility and Efficiency | 2 | No settings search, no keyboard section nav, 8 sections to scan |
| 8 | Aesthetic and Minimalist Design | 3 | Calm, on-brand, tight type; justified repetition for settings |
| 9 | Error Recovery | 3 | No error states wired (neutral) |
| 10 | Help and Documentation | 2 | "Tentang" has links; no inline help on PPN / service-charge concepts |
| **Total** | | **25/40** | **Needs work — dragged down by contrast + consistency defects** |

## Anti-Patterns Verdict

**Start here.** Does this look AI-generated? No.

**LLM assessment:** This is a considered, on-brand execution of the apothecary-greenhouse
system, not slop. Identity is coherent (single canopy green, lime used sparingly, tight Plus
Jakarta Sans display, hairline resting borders). No shared absolute bans present: no
side-stripe borders, no gradient text, no decorative glassmorphism, no SaaS hero-metric
template, no identical-card-grid cliché (the repeated cards are functional settings
sections, which is the correct affordance for settings), no reflexive uppercase eyebrow
above every section (the `FormLabel` uppercase is a real form-label system, used once per
field — voice, not scaffolding). The defect is an implementation error, not a generic-AI tell.

**Deterministic scan:** `detect.mjs` on `src/pages/pengaturan` → `[]`, exit 0 (clean). The
detector is a markup/pattern scanner; it does not compute contrast against resolved theme
values, so it is structurally blind to the exact class of problem reported here. All
contrast findings below come from exact WCAG math against `src/styles/theme.css` tokens.

**Visual overlays:** No detector findings to overlay; browser visualization skipped (see Run
Notes). Contrast is proven deterministically instead.

## Overall Impression

A calm, well-typeset settings surface that is genuinely pleasant in light mode — and
silently broken in dark. The single biggest issue is narrow and mechanical: a wrong
`dark:` text override turns the lime selected-state into lime-on-lime (1.00:1) in two
places. Fix that one pattern and the page's accessibility story jumps two heuristic points.

## What's Working

1. **Locale match is excellent.** WIB/WITA/WIT timezones, QRIS with GoPay/OVO/Dana, IDR
   first, Bahasa throughout — this reads like it belongs to Indonesian shops, hitting the
   "place-aware" principle directly.
2. **Light-mode tema selector is textbook.** Canopy text on lime = 10.76:1; the
   sun/sistem/moon affordance with active-state soft fill is clear and tactile. The pattern
   is right; only its dark override is wrong.
3. **Settings nav does the selected-on-lime treatment correctly.** `look="soft"
   tone="primary"` → `bg-accent-soft text-primary` with NO dark override → canopy-on-lime =
   10.76:1 in both themes. This is the canonical fix the broken elements should match.

## Priority Issues

### [P0] Dark tema selector: selected button text is 1.00:1 (invisible)
- **Why it matters:** the user cannot read which theme is active in dark mode — the exact
  moment they are using the control. Lime text on a solid lime fill. Violates AA by 3.5:1
  and the product's own "legible under pressure" / glare principles.
- **Root cause:** `section-panels.tsx:292` — `bg-accent-soft text-primary dark:border-accent
  dark:text-accent`. The `dark:text-accent` override swaps text to lime, but `bg-accent-soft`
  is NOT overridden in dark (the dark layer re-asserts `--color-accent-soft` = lime at
  `theme.css:334`), so you get lime-on-lime. The icon inherits the same lime → also invisible.
- **Fix:** drop `dark:text-accent` (and `dark:border-accent`); keep `text-primary`/canopy on
  the lime fill — canopy-on-lime is 10.76:1 in both themes. Or, to match a dark-selected
  convention, use a dark-tinted surface (`bg-primary/15`) with lime text. Pick one and apply
  it everywhere lime marks a selection (see P2).
- **Suggested command:** `$impeccable colorize`

### [P0] Dark staff avatar initials: 1.00:1 (invisible) — same defect
- **Why it matters:** the "YB / RS / AF / DL" initials in Kasir & Tim render lime-on-lime in
  dark mode. Identity is lost on the team-management surface.
- **Root cause:** `section-panels.tsx:521` — identical pattern: `bg-accent-soft … text-primary
  dark:text-accent`.
- **Fix:** same as P0 above — remove the `dark:text-accent` override. Verify with a dark-mode
  screenshot of the Tim section.
- **Suggested command:** `$impeccable colorize`

### [P1] faint-foreground descriptions fail AA by ~0.3:1 in two contexts
- **Why it matters:** every `CardDesc`, every toggle-row description, the staff role, and the
  device status line use `text-faint-foreground` at 12–13px. Measured:
  - Light, faint on card (`parchment-darker`): **4.20:1** (need 4.5)
  - Dark, faint on muted row (`#222`): **4.20:1** (need 4.5)
  - Light, faint on parchment bg: exactly **4.50:1** (no margin)
  - Dark, faint on card: **4.60:1** (passes, no margin)
  Under bright-store glare (the documented use environment) "no margin" reads as a fail.
- **Root cause:** faint-foreground is `oklch(0.5583 …)` light / `oklch(0.61 …)` dark, and the
  design system defines it for "metadata, placeholders, the clock suffix" — not full
  sentences. Using it for descriptive body copy is a misuse against the system's own intent.
- **Fix:** (a) nudge the token — darker in light (~`0.52`), lighter in dark (~`0.64`); AND
  (b) move descriptive sentences off `faint-foreground` onto `muted-foreground` (7.04:1 light
  / 5.73:1 dark), reserving `faint` for true metadata.
- **Suggested command:** `$impeccable colorize`

### [P1] Inconsistent "selected-on-lime" treatments — two of three are broken
- **Why it matters:** product-register ban — "If the 'save' button looks different in two
  places, one is wrong." Three selected-on-lime patterns exist; only the nav is right.
  - Settings nav active (soft/primary): `bg-accent-soft text-primary`, no dark override — ✓ correct
  - Tema active button: adds `dark:text-accent` — ✗ broken (P0)
  - Staff avatar: adds `dark:text-accent` — ✗ broken (P0)
- **Fix:** standardize on ONE selected-on-lime recipe (canopy text, no dark text override)
  and apply it to all three. Extract a shared class/pill component so it can't drift again.
- **Suggested command:** `$impeccable polish`

### [P2] Hardcoded select-arrow color does not adapt to theme
- **Why it matters:** `FormSelect` (`section-panels.tsx:116`) bakes `stroke='%23737c77'`
  (#737c77) into the SVG. It passes the 3:1 non-text threshold in both modes (3.90:1 light /
  4.04:1 dark) so it is not a failure today, but it is a hardcoded brand-agnostic gray that
  ignores `--color-foreground`/tokens and will rot. The system rule is "never hardcode brand
  hex in components."
- **Fix:** make the chevron inherit `currentColor` (or a `stroke-faint-foreground`) and drop
  the inline hex, so it tracks the theme automatically.
- **Suggested command:** `$impeccable polish`

## Persona Red Flags

**Owner (after-hours reviewer, dark mode at night):** Opens Pengaturan after close, switches
to dark to spare their eyes. Taps "Gelap" — the selected chip turns into a featureless lime
blob; they cannot tell which theme is active, tap it again confused, and lose trust in "an
app that can't even show me what I selected." Direct hit from P0.

**Cashier (bright-store, one-handed, glare):** Skims the toggle descriptions ("Aktifkan
PPN", "Tambahkan biaya layanan otomatis") under shelf lighting. At 4.20:1 / no-margin 4.50:1
the faint copy washes out under glare; they misread a tax setting. Direct hit from P1.

**First-time owner (setting up):** PPN / Biaya Layanan / "PPN Termasuk Harga" with no inline
help. An owner who doesn't know inclusive-vs-exclusive tax must guess; the labels assume
accounting literacy. No tooltip or "?" affordance. Hit from heuristic 10.

## Minor Observations

- The "Sistem" tema option has no icon while Terang/Gelap have sun/moon; `MonitorIcon`
  exists in assets and would fit "Sistem".
- Section entrance uses `motion-solidjs` with `initial={{opacity:0}}`; no
  `prefers-reduced-motion` guard is visible in the component — confirm motion-solidjs defers
  to reduced-motion, or add an instant/crossfade fallback (DESIGN.md §7 requires it).
- Toggle unchecked track is `bg-border` (white @ 8% in dark) — quite faint; the white thumb
  still reads, but the track nearly disappears. Consider `bg-muted` for the off state.
- Forms are static (`value=` props, no signals) — fine for a design preview, flag for when
  wiring.

## Questions to Consider

- The active-state lime is the brand's confirmation voice. Is a *full* lime fill the right
  weight for a persistent "selected" state, or should selection be a lime *outline/tint*
  (reserving the solid lime for momentary confirmation per the Lime-Rarity Rule)?
- Settings has 8 flat sections and no search. At what team-size / config-depth does flat nav
  stop scaling — should "Pajak", "Pembayaran", "Struk" group under a financial cluster?
- Could the theme control show a live preview swatch instead of relying on text-on-fill,
  removing the contrast dependency entirely?

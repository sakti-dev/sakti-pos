---
target: src/pages/payment
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-06-14T07-59-11Z
slug: src-pages-payment
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Cash shows kembalian live; QRIS/Kartu panels give no in-flight state |
| 2 | Match System / Real World | 4 | Tunai/QRIS/Kartu/E-Wallet, Kembalian, id-ID rupiah all natural |
| 3 | User Control and Freedom | 3 | Qty steppers + back nav work; no "clear cash" reset affordance |
| 4 | Consistency and Standards | 2 | Arbitrary `[18px]/[10px]/[6px]` radii ignore the `rounded-lg` card rule; quickAmounts mimic the method tabs |
| 5 | Error Prevention | 3 | `canConfirm` gating + smart quick amounts; disabled confirm gives no reason |
| 6 | Recognition Rather Than Recall | 3 | Method icons all labelled; quickAmounts read as a second tab row, not amounts |
| 7 | Flexibility and Efficiency of Use | 4 | Numpad + quick amounts + direct typing — three real accelerators |
| 8 | Aesthetic and Minimalist Design | 2 | Over-rounded panels, lime Kembalian box competes with the brand, redundant `dark:` noise |
| 9 | Error Recovery | 2 | Underpaid cash just disables the button silently — no plain-language cause |
| 10 | Help and Documentation | 2 | Placeholder hints carry the load; no contextual help at decision points |
| **Total** | | **28/40** | **Good — solid foundation, weak areas to address** |

## Anti-Patterns Verdict

**LLM assessment.** This does not read as "AI made this" — it reads as a competent POS surface that has drifted from its own design system. The brand discipline (one green, lime rarity, parchment canvas) is intact in spirit. The tells are *drift*, not slop: (1) the quick-cash row is a near-clone of the payment-method grid directly above it — same `grid-cols-4`, same `rounded-[10px]`, same outline/soft/solid button variants — so the cashier's eye reads two tab rows, one of which is not a tab. (2) Cards rounded to `[18px]` when DESIGN.md mandates `rounded-lg` cards. (3) Real, measurable dark-mode contrast failures on money figures — the single thing this product cannot afford to get wrong.

**Deterministic scan.** `detect.mjs` on `src/pages/payment` → exit 0, `[]` findings. No banned patterns (no gradient text, no side-stripe borders, no sketch SVG, no eyebrow-scaffolding detected). The detector is clean; the problems below are design-quality and contrast issues a static AST scan does not catch.

**Visual overlays.** Browser overlay path skipped this run (findings are design-system drift + measured contrast, not detectable markup families). Fallback signal: manual source review against `theme.css` token values.

## Overall Impression

The flow is well-built — three good input accelerators, honest money math, a sensible confirmation gate. What it lacks is *separation*: the quick-amount row is indistinguishable from the method tabs, the cards are over-rounded against the system, and several money values fall below contrast in dark mode. The single biggest win: make the quick amounts read as *amounts* (compact, secondary, clearly subordinate to the input), and fix the dark-mode figures. Those two moves alone would lift this from "works" to "trustworthy."

## What's Working

- **Three real cash input paths (numpad / quick amounts / direct typing) sharing one state.** The cursor-mapping logic in `payment-method.tsx` is genuinely good — formatted↔raw position translation is the hard part of a custom numeric input and it's handled correctly. Power-user and first-timer both get a fast path.
- **Smart, contextual quick-amount seeding.** `getSmartCashSuggestions` rounds to realistic Rp1.000 ceilings and escalates denominations by total size — this is domain-aware UX, not a static `[10000, 20000, 50000, 100000]` list. The logic is a strength; only its *presentation* is the problem.
- **Honest, unambiguous money math.** Subtotal/tax/total flow through consistently, kembalian only shows when paid, the confirm gate is real. This is the trust core and it's solid.

## Priority Issues

### [P1] quickAmounts are visually a second tab row
**Why it matters.** The quick-cash grid sits directly under the method grid with identical structure (`grid grid-cols-4`, `rounded-[10px]`, `look="outline"/"soft"/"solid"` outline/soft/solid buttons). The cashier's eye parses two tab strips; the "active" quick amount (solid) and the exact-total amount (soft) use the *same* selected-state styling as the selected method. This is a recognition problem under customer-waiting pressure — exactly the moment this product is designed for.
**Fix.** Demote quickAmounts to clearly-subordinate affordances: smaller, flatter, inline chips or low-emphasis buttons with a leading label ("Jumlah cepat" / "Uang pas"). Reserve the soft/solid selected look for the method tabs. They should read as *shortcuts into the input*, not as a parallel selector.
**Suggested command.** `$impeccable layout` (then `$impeccable polish`).

### [P1] Money figures fail contrast in dark mode
**Why it matters.** This is a money tool whose accessibility principle is "legibility is a trust requirement." Three concrete failures, measured against the dark tokens:
- **OrderSummary total** (`text-primary`, 26px) — `--color-primary` = canopy `oklch(0.31 …)` dark green on `--color-card` dark `oklch(0.22 …)` charcoal ≈ **~1.6:1**, far below the 3:1 large-text floor. The headline total is near-invisible in dark.
- **Kembalian value** (`dark:text-accent`) — `--color-accent` = lime on `bg-accent-soft` = also lime. **Lime text on a lime fill ≈ 1:1.** The change amount is unreadable in dark mode.
- **TotalBanner labels** (`text-white/60`) — white at 60% over canopy ≈ **~2.5:1** on the subtotal/tax micro-copy.
**Fix.** OrderSummary total → `dark:text-accent` (lime reads on charcoal). Kembalian value → keep `text-primary` in *both* modes (canopy on lime is readable in light; in dark swap the value to `dark:text-primary` won't work — use a darkened canopy or `text-foreground`). TotalBanner labels → `text-primary-foreground/80` or a solid light tint, not `white/60`.
**Suggested command.** `$impeccable colorize` (then `$impeccable polish`).

### [P2] Arbitrary radius scale ignores the design system
**Why it matters.** DESIGN.md is explicit: *"Don't introduce a custom radius scale. Use Tailwind defaults (`rounded-sm` buttons and inputs, `rounded-lg` cards, `rounded-full` badges/pills)."* The payment page uses `rounded-[18px]` on both main cards, `rounded-[10px]` on inputs/buttons/quick-amounts/numpad, and `rounded-[6px]` on thumbnails and numpad keys. That is a third, unstated radius scale. Over-rounding cards to 18px is also the codex over-round tell (cards top out at 12–16px).
**Fix.** Collapse to the system: cards `rounded-lg`, inputs/buttons `rounded-sm` (or at most `rounded-md`), keep `rounded-full` only for the qty-count pill. Remove the arbitrary `[Npx]` values.
**Suggested command.** `$impeccable polish`.

### [P2] Lime Kembalian box competes with the brand accent
**Why it matters.** The Lime-Rarity Rule caps lime at ≤10%/screen for confirmation/online/highlights. The Kembalian box is a full-width `bg-accent-soft` lime panel with a large figure — it dominates the cash view and flattens the success signal lime is meant to carry. It also pairs a tinted border (`border-primary/10`) with the fill, which reads decorative.
**Fix.** Make kembalian a calm, high-contrast line (foreground figure on card, a small lime dot or `success` badge if you want the confirmation cue), not a drenched panel. Save the lime wash for the moment payment is *confirmed*.
**Suggested command.** `$impeccable quieter` (then `$impeccable polish`).

### [P3] Disabled confirm gives no reason; redundant `dark:` noise
**Why it matters.** When cash < total, the confirm button silently disables — a first-timer staring at a grey button under customer pressure has no idea why (Heuristic 9). Separately, the files carry many `dark:` overrides that resolve to the *same* value as the default (`dark:bg-card`, `dark:text-foreground`, `dark:border-border/50`) — dead weight that obscures the real dark fixes.
**Fix.** Add a one-line under-button state ("Kurang Rp 12.000 lagi" when underpaid). Strip the redundant `dark:` classes.
**Suggested command.** `$impeccable clarify` (then `$impeccable polish`).

## Persona Red Flags

**Casey (Distracted Mobile User / one-handed cashier).** The primary action (Konfirmasi Pembayaran) is correctly bottom-fixed on mobile — good. But the quick-amount row sits mid-screen as a tab-like grid; a thumb-tap on the wrong row selects a payment *method* instead of an amount. The method grid and amount grid are both 4-up touch targets stacked vertically — high mis-tap risk one-handed. Red flag: two visually-identical 4-col grids in the thumb zone.

**Sam (Accessibility-Dependent User).** The OrderSummary total and Kembalian value are unreadable in dark mode (measured above) — a screen-magnifier user on a dark-themed device cannot see the two most important numbers. The `aria-label`s on quick amounts (`Jumlah Rp …`) are good, but the *visual* role is ambiguous (tab vs button) so the semantic mismatch survives into AT. Red flag: money figures below 3:1 in dark; quick-amount buttons mis-imply a tablist role.

**Jordan (First-Timer).** "Masukkan jumlah" placeholder is clear, but an underpaid cash amount produces a disabled button with no message — Jordan will assume the app is broken. The `Rp` prefix inside the cash box is `text-muted-foreground` (secondary), which a first-timer may not parse as the currency marker. Red flag: silent failure state on the primary action.

## Minor Observations

- OrderSummary shows subtotal/tax/total on desktop but hides tax+total on mobile (`max-[900px]:hidden`), deferring the real total to the separate TotalBanner. Two sources of truth for "total" at different breakpoints — easy to drift.
- The QRIS decorative conic-gradient placeholder at `opacity-10` is near-invisible in dark; the placeholder reads as an empty box.
- `payment-extras.tsx` inputs use `bg-muted` at rest but the design system's TextField uses `background` (parchment) — the extras inputs are visually heavier than the system input.
- The confirm button pairs `border-2 border-transparent` with `shadow-card` — a border + wide-ish shadow on one element. Minor, but it's the ghost-card pairing the system warns against.
- Numpad keys are `min-h-[48px]` (good target), but the `000` key shrinks to `text-[16px]` while `0` grows to `text-[22px]` — inconsistent key sizing in the same row.

## Questions to Consider

- What if the quick amounts were a single horizontal scroll-strip of chips under the input, instead of a 4-up grid that mirrors the method tabs?
- Does the Kembalian need to be a panel at all, or would a confident single line ("Kembalian Rp 5.000") serve the trust moment better and free the lime accent?
- Should the OrderSummary total and the TotalBanner be a single source of truth across breakpoints, instead of swapping which one shows?

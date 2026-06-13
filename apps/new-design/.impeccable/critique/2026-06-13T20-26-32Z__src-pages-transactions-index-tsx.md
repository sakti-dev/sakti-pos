---
target: src/pages/transactions/index.tsx (dark-mode color)
total_score: 30
p0_count: 2
p1_count: 2
timestamp: 2026-06-13T20-26-32Z
slug: src-pages-transactions-index-tsx
---
## Critique: transactions/index.tsx — dark-mode color

Target: `src/pages/transactions/index.tsx` (Transactions list, dark-mode color lens)

### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | Status color is the page's whole job — and all 5 status tones are unreadable in dark |
| 2 | Match System / Real World | 4 | Clear Indonesian labels (Baru, Diproses, Selesai, Batal) |
| 3 | User Control / Freedom | 3 | Search + 6 filter tabs; no row-level action |
| 4 | Consistency & Standards | 2 | Same tokens read fine in light, break in dark — internal inconsistency |
| 5 | Error Prevention | 4 | Read-only list; good empty state |
| 6 | Recognition Rather Than Recall | 3 | Status = icon + label (good), but the color half is broken in dark |
| 7 | Flexibility & Efficiency | 3 | Search + filters; no keyboard affordance |
| 8 | Aesthetic & Minimalist Design | 3 | Clean dense rows; depth signal (shadow) lost in dark |
| 9 | Error Recovery | 4 | Friendly empty state on no-results |
| 10 | Help & Documentation | 3 | n/a for a list |
| **Total** | | **30/40** | **Solid structure, broken dark execution** |

### Anti-Patterns Verdict

**Not AI slop.** This is a competent, conventional transactions list — no eyebrows, no gradient
text, no identical card grid (these are list rows, justified), no ghost-card pairing. The
failure is a craft/accessibility regression in dark mode, not an aesthetic tell. The one
uniform note (`rounded-2xl` on every row + the search field) is appropriate for a list and
within the 16px ceiling.

### Overall Impression

The row design is sound — icon swatch + customer + total + items/time + status pill is
dense and scannable, and status is encoded as icon + label + color (structurally
color-blind-safe). The problem is narrow and severe: **in dark mode every status indicator
is unreadable.** A cashier or owner scanning for "what's done / still processing / cancelled"
gets near-invisible mud. For a money surface that violates the trustworthy-with-money
principle directly. And it isn't a per-page bug — it's the status-token architecture.

### What's Working

- **Row information design** — icon + customer + total + items/time + status pill. Dense,
  scannable, and the status carries icon + label (not color alone).
- **Light-mode status contrast** — 4 of 5 status pairs pass AA (11–12:1 for the green ones).
- **Motion restraint** — list-item stagger (`0.1 + i*0.03`) is a legitimate list reveal,
  not the uniform section-reflex; empty state and search are present and correct.

### Priority Issues

**[P0] Dark mode: all 5 status pairs fail WCAG AA** — measured (text on alpha-composited tint over the #1a1a1a card):

| Status | Text | Effective bg | Ratio | Needs |
|---|---|---|---|---|
| Baru (new) | canopy #1c3a13 | #4d5b39 | **1.73:1** | 4.5 |
| Diproses (processing) | #7a5f00 | #8b7f34 | **1.49:1** | 4.5 |
| Menunggu (waiting) | #e6a817 | #64491a | **3.96:1** | 4.5 |
| Selesai (done) | canopy #1c3a13 | #1a1f19 | **1.33:1** | 4.5 |
| Batal (cancelled) | #c0392b | #461f1c | **2.62:1** | 4.5 |

- Why it matters: status is the page's purpose. Invisible status = a cashier who can't tell
  finished from pending; an owner who can't trust the day's close-out. Trust requirement, not
  aesthetics.
- Fix: see P0 #2 — the fix is token-level, not here.
- Suggested command: `$impeccable colorize`

**[P0] Root cause is token architecture, not this file** — `--color-primary` and
`--color-success` are NOT overridden in the dark `@layer`, so they stay canopy `#1c3a13` (a
near-black green, L≈0.31) used as `text-primary`/`text-success`. Dark-green text on a
charcoal card vanishes. The `text-X` on `bg-X/10–15` construction is a light-mode idiom: a
10–15% tint over a dark card turns to mud, so even the bright hues drop (warning's own hue is
8.27:1 on solid dark, but 3.96:1 on its own 15% tint). The documented "status tones static in
dark" decision is measurably wrong for this construction.
- Why it matters: this same breakage lives wherever status tokens are used as text-on-tint in
  dark — dashboard KPI badges, the Badge component, other lists. Patching only transactions
  leaves the rest broken.
- Fix: in `theme.css` dark `@layer theme`, brighten status *text* tokens so they read on
  charcoal, and raise `--color-faint-foreground`. Measured-safe candidates: success →
  `oklch(0.78 0.14 140)` (≈#7fd07f, 9.1:1); danger → the existing dark destructive
  `oklch(0.71 0.166 22.22)` (#f87171, 6.5:1); warning → keep `#e6a817` but the chip needs a
  darker/more-opaque bg in dark; `--color-faint-foreground` dark → #93939f+ (currently #767676
  = 3.83:1; #93939f = 5.73:1). Add a dark `processing` pair.
- Suggested command: `$impeccable colorize`

**[P1] `waiting` pill fails in LIGHT mode too (1.89:1)** — amber `#e6a817` text on its own
15% amber tint. Text-on-same-hue-tint is low-contrast by construction in any theme. Either
darken the waiting text (a deeper amber/brown) or use an opaque chip.
- Suggested command: `$impeccable colorize`

**[P1] Metadata line fails in dark (3.83:1)** — `text-faint-foreground` (#767676) on #1a1a1a
for 12px "items · time" copy. Fixed by raising dark `--color-faint-foreground` (see P0 #2).
- Suggested command: `$impeccable colorize`

**[P2] `processing` is a light-only literal** — `#7a5f00` on `rgba(255,233,92,0.25)` is
hand-tuned for parchment and not tokenized. It has no dark variant and diverges from the
design system. Promote it to tokens (`--color-processing` / `-foreground`) with dark values.
- Suggested command: `$impeccable harden`

**[P2] "success = canopy" collides with dark mode** — the single-green discipline (success =
primary = canopy) is beautiful on parchment and fatal on charcoal. Decide: diverge success to
a brighter green in dark only (keep it = canopy in light), or keep purity and switch status to
opaque chips in dark.
- Suggested command: `$impeccable colorize`

### Persona Red Flags (project-specific, from PRODUCT.md audience)

**Owner after hours (reviewing the day in dim light, dark mode)**: opens Transaksi to close
out the day. "Selesai" rows read as near-black-on-near-black (1.33:1) — she can't distinguish
completed from pending without squinting at the icon shape. The single most important
status on a money screen is invisible. Trust in the numbers erodes immediately.

**Cashier mid-rush (bright store, one-handed, light or dark)**: scanning for the next
"Baru"/"Menunggu" ticket. In light mode `Menunggu` is 1.89:1 (failing); in dark, `Baru` and
`Selesai` are gone. Under customer-waiting pressure, a status she has to decipher is a status
that costs seconds per ticket.

### Minor Observations

- Active filter Tab uses literal `text-white` instead of `text-primary-foreground` — token
  inconsistency (reads fine; just off-system).
- `shadow-card` (canopy-tinted) on cards is nearly invisible in dark (green tint on
  charcoal) — elevation reads flat. Not harmful; the dark card already separates via bg.
- Inactive-tab `text-muted-foreground` (#93939f on #1a1a1a = 5.73:1) passes — good.

### Questions to Consider

- Should dark-mode status stay "brand-true" (single canopy green, opaque chips) or
  "readable" (brighter semantic hues that diverge from primary in dark)?
- Is `processing` (the yellow literal) actually a distinct status from `waiting`, or can they
  collapse to one amber state and lose a broken color?

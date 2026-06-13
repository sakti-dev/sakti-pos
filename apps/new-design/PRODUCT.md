# Product

## Register

product

## Users

Sakti POS serves Indonesian small-business owners and the cashiers/staff they
employ. The customer base is omnichannel/general: warung and small kiosks,
retail stores, and lighter F&B — so the design must stay neutral and fast across
all of them rather than optimizing for a single vertical.

**Context of use:** behind a counter, on an Android handset or tablet, often
held one-handed in the middle of a live transaction, under customer-waiting time
pressure, in a bright or glare-prone retail environment. The owner returns to
the dashboard and settings (pengaturan) after hours to review the day and trust
the numbers.

**Job to be done:** complete sales quickly and accurately — catalog → cart →
payment → receipt — with zero ambiguity in money or status; then manage
products/catalog and settings, and close out the day with confidence.

## Product Purpose

Sakti POS is an offline-first Android point-of-sale app for Indonesian small
businesses. This `new-design` workspace is a redesign of the POS UI focused on a
premium, trustworthy, mobile-first experience that still feels native on larger
screens.

Success looks like: cashiers check out faster with fewer errors, owners trust
every rupiah shown to them, and the product reads as more credible and
professional than the legacy POS it replaces — across the full flow: dashboard,
catalog, transaction-new, payment, receipt, transactions history, and
pengaturan.

The `references/` directory holds 15 HTML mockup screens plus design analysis
(`COHERE-DESIGN.md`, `DESIGN-HANDOFF.md`, `DESIGN-MANIFEST.json`) that form the
visual contract for this redesign.

## Brand Personality

**Calm · capable · trustworthy.** Voice is confident and quiet, never loud.

- **Calm** — the UI recedes so the transaction is the focus; the cashier feels in
  control, never rushed or overwhelmed. Restraint over decoration.
- **Capable** — precise and competent; the app handles money with obvious
  competence. Tight type, honest numbers, no theatrical effects.
- **Trustworthy** — money-confidence through restraint (deep green primary),
  with warmth carried selectively by terracotta accents and optimism by the
  bright accent green.

Indonesian local-commerce warmth is carried by accent color, typography, and
imagery — **not** by warm beige/cream background washes. Warmth is an accent
role, never the body.

## Anti-references

What this must NOT look like:

- **Cluttered legacy POS** — busy gray toolbars, dense unreadable tables, dated
  icon sets, 2010s enterprise feel. The old look we are replacing.
- **Generic SaaS POS clone** — a visual reskin of Square / Toast / Shopify POS.
  Readable as "someone else's POS" rather than its own product.
- **Sterile / placeless minimal** — cold all-white minimalism with no warmth or
  sense of place; could be any product, anywhere. Loses the Indonesian
  local-commerce identity.

## Design Principles

Strategic principles derived from the conversation. They guide decisions, not
pixels.

1. **Calm authority.** The cashier should feel in control, never rushed or
   overwhelmed. Prefer restraint over decoration; the interface recedes so the
   transaction is the focus. When in doubt, remove.
2. **Legible under pressure.** Design for the real retail environment — bright
   glare, one-handed reach, customer-waiting urgency — not a designer's dim,
   quiet office. Favor solid readable fills and high contrast over thin,
   low-contrast elegance. Legibility is a trust signal.
3. **Trustworthy with money.** Every amount, status, and confirmation must be
   unmistakable and readable without color alone. No ambiguity in money in/out,
   success/failure, or totals. Correctness and clarity beat cleverness.
4. **Mobile-first, desktop-native.** The primary surface is an Android
   handset/tablet held in hand; desktop is a first-class expansion, not a
   retrofit. Lead with touch ergonomics and bottom-reachable primary actions,
   then adapt up to wider screens — never the reverse.
5. **Place-aware, not placeless.** Carry Indonesian local-commerce warmth through
   accent, typography, and imagery, and reject the placeless all-white default.
   The product should feel like it belongs to the shops that use it.

## Accessibility & Inclusion

- **WCAG AA contrast baseline** — body text ≥ 4.5:1, large/bold text ≥ 3:1,
  placeholders included. A money app's legibility is a trust requirement.
- **Bright-store glare legibility** — the real environment is shelf-lit and
  reflective; favor higher contrast and solid, opaque fills over thin strokes or
  low-contrast elegance.
- **One-handed touch ergonomics** — ≥ 44px touch targets, thumb-reachable
  primary actions, bottom-sheet primary actions on mobile, top-of-screen
  reachability kept for glanceable status only.
- **Color-blind-safe status** — money in/out and success/failure states must read
  without color alone (icon + label + value, never color alone).
- **Reduced motion respected** — every animation has a
  `prefers-reduced-motion` alternative (crossfade or instant). Motion enhances,
  never gates, content visibility.
- **Dark mode** is a first-class supported theme, tuned for the same contrast and
  glare requirements.

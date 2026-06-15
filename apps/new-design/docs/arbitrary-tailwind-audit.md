# Arbitrary Tailwind CSS Values — `src/pages` Audit

**Scope:** all `.tsx` / `.ts` files under `src/pages`
**Total:** 587 arbitrary-value occurrences across **27 files**
(TypeScript array-type false positives like `Foo[]` excluded)

## Summary by category

| Prefix | Occurrences | Unique values | Status |
|---|---|---|---|
| `text-[...]` | 4 | 3 | ✅ **resolved** — migrated to semantic type scale; 3 stragglers remain |
| `max-[...]` (breakpoints) | 0 | 0 | ✅ **resolved** — migrated to mobile-first named min-width variants |
| `tracking-[...]` | 73 | 10 | 🔴 **systemic** — should be tokens |
| `h-[...]` | 52 | 16 | 🟡 mostly icons (18px) + layout |
| `w-[...]` | 43 | 21 | 🟡 mostly icons (18px) + layout |
| `transition-[...]` | 36 | 17 | 🟡 no shared transition tokens |
| `rounded-[...]` | 17 | 4 | 🟡 `14px` / `10px` repeat |
| `z-[...]` | 15 | 6 | 🟡 ad-hoc stacking |
| `data-[...]` | 12 | 1 | 🟢 variant qualifier |
| `max-w-[...]` | 9 | 8 | 🟢 mostly one-offs |
| spacing (`mt` / `py` / `px` / `pb` / `pt` / `mb` / `pl` / `p`) | ~25 | small | 🟡 `18px`, `3px` repeat |
| `scale-[...]` | 6 | 3 | 🟢 press feedback (0.94 / 0.97 / 0.98) |
| `border-[...]` | 7 | 2 | 🟡 `1.5px` repeats |
| `backdrop-blur-[...]` | 2 | 2 | 🟢 one-offs |
| `bg-[...]` | 2 | 2 | 🟢 complex shorthands |
| `opacity-[...]` | 2 | 1 | 🟢 decorative |
| other (`left`, `leading`, `-top`, `-right`, `-bottom`, `gap`, `bottom`, `col`, `-left`, `inset`, `blur`, `font`, `min-h`, `min-w`) | ~20 | — | 🟢 layout-specific |

## Biggest offenders worth tokenizing

### 1. Font sizes ✅ resolved
Migrated to semantic type scale (`text-body`, `text-body-sm`, etc.).
3 stragglers remain: `text-[13px]` (catalog forms), `text-[15px]` (product-form),
`text-[0.62em]` (kpi-cards).

### 2. Breakpoints ✅ resolved
All `max-[px]` breakpoints migrated to mobile-first named min-width variants.
Zero `max-[...]` occurrences remain.

### 3. Tracking — 10 values, mostly repeating 🟡
`±0.01em` / `±0.02em` recur across 9 files each.

### 4. Transitions — 17 unique comma-lists 🟡
No two are identical — clear copy-paste drift. Needs a `transition-*` token set.

### 5. Spacing — recurring values 🟡
`18px`, `3px`, `2px` recur as `px` / `py` / `mt` / `p-[14px_18px]` etc.

## Densest files
- `src/pages/pin/components/right-panel.tsx`
- `src/pages/receipt/index.tsx`
- `src/pages/pengaturan/components/section-panels.tsx`
- `src/pages/transaction-new/index.tsx`
- `src/pages/transaction-new/components/product-grid.tsx`

---

## Unique arbitrary values by category

### `text` (17 unique)
| Value | Files |
|---|---|
| `[12px]` ×15 | dashboard/components/kpi-cards, dashboard/components/venue-card, payment/components/order-summary, payment/components/payment-extras, payment/components/payment-method, payment/components/total-banner, pengaturan/components/section-panels, pengaturan/components/settings-nav, pin/components/left-panel, pin/components/right-panel, receipt/index, transaction-new/components/cart-item-row, transaction-new/components/cart-list, transaction-new/components/cart-panel, transactions/index |
| `[13px]` ×13 | dashboard/components/kpi-cards, dashboard/components/venue-card, payment/components/order-summary, payment/components/payment-method, pengaturan/components/section-panels, pengaturan/components/settings-nav, pengaturan/index, pin/components/right-panel, receipt/index, transaction-new/components/cart-item-row, transaction-new/components/cart-totals, transaction-new/components/search-bar, transactions/index |
| `[14px]` ×12 | dashboard/components/kpi-cards, payment/components/order-summary, payment/components/payment-extras, payment/components/payment-method, pengaturan/components/section-panels, pin/components/left-panel, pin/components/right-panel, receipt/index, transaction-new/components/cart-item-row, transaction-new/components/cart-list, transaction-new/components/product-grid, transaction-new/index |
| `[11px]` ×8 | dashboard/components/earnings-card, dashboard/components/kpi-cards, dashboard/components/quick-actions, dashboard/components/venue-card, pengaturan/components/section-panels, receipt/index, transaction-new/index, transactions/index |
| `[16px]` ×7 | payment/components/order-summary, payment/components/payment-method, payment/index, pengaturan/components/section-panels, receipt/index, transaction-new/components/category-tabs, transaction-new/components/product-grid |
| `[15px]` ×6 | dashboard/components/venue-card, pin/components/left-panel, pin/components/right-panel, receipt/index, transaction-new/components/cart-totals, transaction-new/index |
| `[18px]` ×5 | dashboard/components/kpi-cards, payment/components/payment-method, pin/components/right-panel, receipt/index, transaction-new/components/cart-totals |
| `[22px]` ×4 | pengaturan/index, pin/components/right-panel, receipt/index, transactions/index |
| `[20px]` ×3 | payment/components/payment-method, pengaturan/components/section-panels, pin/components/right-panel |
| `[28px]` ×3 | payment/components/payment-method, payment/components/total-banner, pin/components/right-panel |
| `[24px]` ×2 | pin/components/right-panel, receipt/index |
| `[32px]` ×2 | pin/components/left-panel, pin/components/right-panel |
| `[0.62em]` ×1 | dashboard/components/kpi-cards |
| `[10px]` ×1 | transactions/index |
| `[17px]` ×1 | transaction-new/index |
| `[26px]` ×1 | payment/components/order-summary |
| `[30px]` ×1 | dashboard/components/earnings-card |

### `max` (6 unique)
| Value | Files |
|---|---|
| `[900px]` ×9 | payment/components/order-summary, payment/components/total-banner, payment/index, pengaturan/components/settings-nav, pengaturan/index, pin/components/right-panel, transaction-new/components/product-grid, transaction-new/index, transactions/index |
| `[600px]` ×7 | dashboard/components/kpi-cards, payment/components/payment-extras, payment/components/payment-method, payment/index, pengaturan/components/section-panels, receipt/index, transaction-new/components/product-grid |
| `[1100px]` ×2 | dashboard/components/kpi-cards, transaction-new/index |
| `[800px]` ×2 | pengaturan/index, transactions/index |
| `[1200px]` ×1 | transaction-new/components/product-grid |
| `[480px]` ×1 | pin/components/right-panel |

### `tracking` (10 unique)
| Value | Files |
|---|---|
| `[-0.01em]` ×9 | pengaturan/components/section-panels, pengaturan/index, pin/components/right-panel, receipt/index, transaction-new/components/cart-panel, transaction-new/components/cart-totals, transaction-new/components/product-grid, transaction-new/index, transactions/index |
| `[0.01em]` ×9 | dashboard/components/kpi-cards, dashboard/components/venue-card, pengaturan/components/section-panels, pengaturan/components/settings-nav, pin/components/left-panel, pin/components/right-panel, receipt/index, transaction-new/components/cart-list, transactions/index |
| `[0.02em]` ×8 | dashboard/components/quick-actions, pengaturan/index, pin/components/right-panel, receipt/index, transaction-new/components/cart-list, transaction-new/components/cart-panel, transaction-new/components/search-bar, transaction-new/index |
| `[-0.02em]` ×6 | payment/components/order-summary, payment/components/payment-method, payment/components/total-banner, pin/components/left-panel, pin/components/right-panel, receipt/index |
| `[0.06em]` ×3 | payment/components/order-summary, payment/components/payment-method, receipt/index |
| `[-0.36px]` ×1 | dashboard/components/kpi-cards |
| `[-0.42px]` ×1 | dashboard/components/kpi-cards |
| `[0.04em]` ×1 | pengaturan/components/section-panels |
| `[0.08em]` ×1 | dashboard/components/earnings-card |
| `[0.14em]` ×1 | dashboard/components/earnings-card |

### `h` (16 unique)
| Value | Files |
|---|---|
| `[18px]` ×10 | dashboard/components/earnings-card, dashboard/components/kpi-cards, login/components/right-panel, pengaturan/components/section-panels, pengaturan/components/settings-nav, pin/components/left-panel, receipt/index, register/components/right-panel, transaction-new/components/cart-totals, transaction-new/index |
| `[72px]` ×3 | payment/components/payment-method, pin/components/left-panel, receipt/index |
| `[140px]` ×2 | dashboard/components/earnings-card, payment/components/payment-method |
| `[38px]` ×2 | pengaturan/components/section-panels, transaction-new/index |
| `[52px]` ×2 | pin/components/right-panel, receipt/index |
| `[100px]` ×1 | dashboard/components/earnings-card |
| `[14px]` ×1 | pin/components/right-panel |
| `[15px]` ×1 | pin/components/right-panel |
| `[200px]` ×1 | payment/components/payment-method |
| `[22px]` ×1 | pin/components/right-panel |
| `[350px]` ×1 | pin/components/left-panel |
| `[400px]` ×1 | pin/components/left-panel |
| `[42px]` ×1 | pengaturan/components/section-panels |
| `[60px]` ×1 | pin/components/right-panel |
| `[76px]` ×1 | pin/components/right-panel |
| `[88px]` ×1 | pin/components/right-panel |

### `w` (21 unique)
| Value | Files |
|---|---|
| `[18px]` ×10 | dashboard/components/earnings-card, dashboard/components/kpi-cards, login/components/right-panel, pengaturan/components/section-panels, pengaturan/components/settings-nav, pin/components/left-panel, receipt/index, register/components/right-panel, transaction-new/components/cart-totals, transaction-new/index |
| `[38px]` ×2 | pengaturan/components/section-panels, transaction-new/index |
| `[72px]` ×2 | pin/components/left-panel, receipt/index |
| `[100px]` ×1 | dashboard/components/earnings-card |
| `[140px]` ×1 | dashboard/components/earnings-card |
| `[14px]` ×1 | pin/components/right-panel |
| `[15px]` ×1 | pin/components/right-panel |
| `[200px]` ×1 | payment/components/payment-method |
| `[220px]` ×1 | pengaturan/components/settings-nav |
| `[22px]` ×1 | pin/components/right-panel |
| `[2px]` ×1 | receipt/index |
| `[320px]` ×1 | transaction-new/index |
| `[350px]` ×1 | pin/components/left-panel |
| `[360px]` ×1 | transaction-new/index |
| `[380px]` ×1 | payment/components/order-summary |
| `[400px]` ×1 | pin/components/left-panel |
| `[42px]` ×1 | pengaturan/components/section-panels |
| `[52px]` ×1 | pin/components/right-panel |
| `[55%]` ×1 | pin/components/left-panel |
| `[76px]` ×1 | pin/components/right-panel |
| `[88px]` ×1 | pin/components/right-panel |

### `transition` (17 unique)
| Value | Files |
|---|---|
| `[border-color,box-shadow]` ×3 | payment/components/payment-extras, pengaturan/components/section-panels, transaction-new/components/search-bar |
| `[background]` ×2 | pengaturan/components/section-panels, pin/components/left-panel |
| `[background,border-color]` ×2 | dashboard/components/earnings-card, transaction-new/index |
| `[height,opacity]` ×2 | login/components/right-panel, register/components/right-panel |
| `[opacity]` ×2 | pengaturan/components/section-panels, pengaturan/components/settings-nav |
| `[opacity,transform]` ×2 | pin/components/right-panel, transaction-new/components/product-grid |
| `[background,border-color,box-shadow,transform,color]` ×1 | dashboard/components/quick-actions |
| `[background,border-color,transform,box-shadow]` ×1 | pin/components/right-panel |
| `[background,color,border-color]` ×1 | pin/components/right-panel |
| `[background,color,transform,box-shadow]` ×1 | pin/components/right-panel |
| `[background,transform]` ×1 | pin/components/right-panel |
| `[border-color,background]` ×1 | payment/components/payment-method |
| `[border-color,background,color]` ×1 | pengaturan/components/section-panels |
| `[border-color,background,transform,box-shadow]` ×1 | pin/components/right-panel |
| `[box-shadow,transform]` ×1 | transaction-new/components/product-grid |
| `[transform]` ×1 | pengaturan/components/section-panels |
| `[transform,box-shadow]` ×1 | transaction-new/index |

### `rounded` (4 unique)
| Value | Files |
|---|---|
| `[14px]` ×5 | pengaturan/components/section-panels, transaction-new/components/cart-totals, transaction-new/components/product-grid, transaction-new/components/search-bar, transaction-new/index |
| `[10px]` ×3 | pengaturan/components/section-panels, pengaturan/components/settings-nav, transaction-new/index |
| `[18px]` ×1 | pengaturan/components/section-panels |
| `[1px]` ×1 | receipt/index |

### `z` (6 unique)
| Value | Files |
|---|---|
| `[1]` ×7 | dashboard/components/earnings-card, login/components/right-panel, payment/components/payment-method, pin/components/left-panel, pin/components/right-panel, register/components/right-panel, transaction-new/components/product-grid |
| `[100]` ×2 | payment/index, receipt/index |
| `[1000]` ×1 | pin/components/right-panel |
| `[2]` ×1 | transaction-new/components/product-grid |
| `[3]` ×1 | transaction-new/components/product-grid |
| `[90]` ×1 | transaction-new/index |

### `data` (1 unique)
| Value | Files |
|---|---|
| `[invalid]` ×2 | login/components/right-panel, register/components/right-panel |

### `max-w` (8 unique)
| Value | Files |
|---|---|
| `[280px]` ×2 | pin/components/left-panel, pin/components/right-panel |
| `[260px]` ×1 | pin/components/right-panel |
| `[360px]` ×1 | pengaturan/components/section-panels |
| `[400px]` ×1 | pin/components/right-panel |
| `[480px]` ×1 | receipt/index |
| `[500px]` ×1 | pin/components/right-panel |
| `[520px]` ×1 | receipt/index |
| `[80px]` ×1 | dashboard/components/quick-actions |

### `mt` (2 unique)
| Value | Files |
|---|---|
| `[3px]` ×2 | dashboard/components/kpi-cards, dashboard/components/venue-card |
| `[5px]` ×2 | login/components/right-panel, register/components/right-panel |

### `border` (2 unique)
| Value | Files |
|---|---|
| `[1.5px]` ×4 | payment/components/payment-extras, payment/components/payment-method, pin/components/right-panel, transaction-new/components/search-bar |
| `[3px]` ×1 | pin/components/right-panel |

### `mb` (1 unique)
| Value | Files |
|---|---|
| `[18px]` ×2 | login/components/right-panel, register/components/right-panel |

### `py` (3 unique)
| Value | Files |
|---|---|
| `[3px]` ×3 | dashboard/components/kpi-cards, payment/components/order-summary, pengaturan/components/section-panels |
| `[2px]` ×2 | dashboard/components/venue-card, transaction-new/components/cart-panel |
| `[18px]` ×1 | payment/components/payment-method |

### `scale` (3 unique)
| Value | Files |
|---|---|
| `[0.97]` ×2 | pin/components/right-panel, transaction-new/components/product-grid |
| `[0.98]` ×2 | transaction-new/components/cart-totals, transaction-new/index |
| `[0.94]` ×1 | pin/components/right-panel |

### `px` (1 unique)
| Value | Files |
|---|---|
| `[18px]` ×3 | dashboard/index, pengaturan/index, transactions/index |

### `min-w` (5 unique)
| Value | Files |
|---|---|
| `[20px]` ×1 | transaction-new/index |
| `[320px]` ×1 | transaction-new/index |
| `[360px]` ×1 | transaction-new/index |
| `[380px]` ×1 | payment/components/order-summary |
| `[72px]` ×1 | transaction-new/components/cart-item-row |

### `min-h` (3 unique)
| Value | Files |
|---|---|
| `[18px]` ×1 | pin/components/right-panel |
| `[80px]` ×1 | pengaturan/components/section-panels |
| `[96px]` ×1 | dashboard/components/quick-actions |

### `font` (1 unique)
| Value | Files |
|---|---|
| `[inherit]` ×1 | pengaturan/components/section-panels |

### `left` (2 unique)
| Value | Files |
|---|---|
| `[35%]` ×1 | dashboard/components/earnings-card |
| `[3px]` ×1 | pengaturan/components/section-panels |

### `leading` (2 unique)
| Value | Files |
|---|---|
| `[1.3]` ×1 | transaction-new/components/cart-item-row |
| `[1.35]` ×1 | transaction-new/components/product-grid |

### `-top` (2 unique)
| Value | Files |
|---|---|
| `[120px]` ×1 | pin/components/left-panel |
| `[50px]` ×1 | dashboard/components/earnings-card |

### `-right` (2 unique)
| Value | Files |
|---|---|
| `[30px]` ×1 | dashboard/components/earnings-card |
| `[80px]` ×1 | pin/components/left-panel |

### `-bottom` (2 unique)
| Value | Files |
|---|---|
| `[100px]` ×1 | pin/components/left-panel |
| `[40px]` ×1 | dashboard/components/earnings-card |

### `backdrop-blur` (2 unique)
| Value | Files |
|---|---|
| `[10px]` ×1 | pin/components/left-panel |
| `[8px]` ×1 | pin/components/left-panel |

### `gap` (2 unique)
| Value | Files |
|---|---|
| `[14px]` ×1 | pin/components/right-panel |
| `[18px]` ×1 | pin/components/right-panel |

### `bg` (2 unique)
| Value | Files |
|---|---|
| `[length:12px_8px]` ×1 | pengaturan/components/section-panels |
| `[position:right_14px_center]` ×1 | pengaturan/components/section-panels |

### `bottom` (1 unique)
| Value | Files |
|---|---|
| `[3px]` ×1 | pengaturan/components/section-panels |

### `opacity` (1 unique)
| Value | Files |
|---|---|
| `[0.03]` ×2 | dashboard/components/earnings-card, dashboard/components/venue-card |

### `pl` (1 unique)
| Value | Files |
|---|---|
| `[38px]` ×1 | transaction-new/components/search-bar |

### `col` (1 unique)
| Value | Files |
|---|---|
| `[1/-1]` ×1 | transaction-new/components/product-grid |

### `-left` (1 unique)
| Value | Files |
|---|---|
| `[60px]` ×1 | pin/components/left-panel |

### `pb` (1 unique)
| Value | Files |
|---|---|
| `[105px]` ×1 | dashboard/index |

### `rounded-t` (1 unique)
| Value | Files |
|---|---|
| `[60px]` ×1 | dashboard/index |

### `pt` (1 unique)
| Value | Files |
|---|---|
| `[18px]` ×1 | dashboard/components/quick-actions |

### `p` (1 unique)
| Value | Files |
|---|---|
| `[14px_18px]` ×1 | dashboard/components/venue-card |

### `inset` (1 unique)
| Value | Files |
|---|---|
| `[-6px]` ×1 | receipt/index |

### `blur` (1 unique)
| Value | Files |
|---|---|
| `[50px]` ×1 | receipt/index |

---

## How this was generated

Scan script: `/tmp/scan_arb.py` — re-run with:

```sh
uv run --no-project python /tmp/scan_arb.py
```

Regex matches `prefix-[value]` tokens in `.tsx` / `.ts` files; TypeScript
array-type false positives (`Foo[]`) are filtered out.

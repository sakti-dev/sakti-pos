# Drawer-Based Select Component

## Problem

Native `<select>` elements on Android feel inconsistent with the app's custom UI. The existing `select.tsx` (Kobalte-based) uses a portal dropdown which is desktop-oriented and doesn't adapt well to mobile viewports or virtual keyboards.

## Decision

Build a `DrawerSelect` component that opens a bottom drawer (using `@corvu/drawer`) when tapped, displaying a scrollable list of options in a native Android-style bottom sheet.

## API Design

Declarative sub-component API:

```tsx
<DrawerSelect.Root value={categoryId()} onChange={setCategoryId}>
  <DrawerSelect.Trigger>
    <DrawerSelect.Value placeholder="Pilih kategori" />
  </DrawerSelect.Trigger>
  <DrawerSelect.Content label="Kategori">
    <For each={categories()}>
      {(cat) => <DrawerSelect.Option value={cat.id}>{cat.name}</DrawerSelect.Option>}
    </For>
  </DrawerSelect.Content>
</DrawerSelect.Root>
```

### Sub-components

| Component | Purpose |
|-----------|---------|
| `DrawerSelect.Root` | Manages value state, open/close. Props: `value`, `onChange`, `disabled` |
| `DrawerSelect.Trigger` | Button styled like native select. Props: `class` |
| `DrawerSelect.Value` | Displays selected option label or `placeholder` text. Props: `placeholder` |
| `DrawerSelect.Content` | Bottom drawer with scrollable option list. Props: `label` (drawer title) |
| `DrawerSelect.Option` | Single option row. Props: `value`, `children` (label) |

### Behavior

- Trigger shows chevron icon (same as current select.tsx)
- Tapping trigger opens bottom drawer
- Selected option shows checkmark indicator
- Tapping option selects it, closes drawer, calls `onChange`
- Drawer content has max-height with overflow scroll
- No search field (deferred)

## Files Changed

- `src/components/ui/drawer-select.tsx` — new component
- `src/pages/menu/product-list.tsx` — replace `<select>` filter
- `src/pages/menu/product-form.tsx` — replace `<select>` category picker
- `src/components/ui/select.tsx` — delete (replaced by drawer-select)

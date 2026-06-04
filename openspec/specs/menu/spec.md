# Menu

## Purpose

The menu domain manages the products and categories that a merchant sells, including per-outlet pricing and availability overrides. Categories organize products into logical groups; products carry a name, price, optional image, and category assignment; outlet-products allow each outlet to override a product's price and availability independently. Menu changes sync across devices via the baresync outbox pattern so all POS terminals share the same catalog.

## Data Model

### Tables

- **categories**: `id`, `merchantId`, `name`, `sortOrder`, `isActive`, `deletedAt`, `createdAt`, `updatedAt`
- **products**: `id`, `merchantId`, `categoryId`, `name`, `priceMinorUnits`, `imageUrl`, `imageAssetId`, `isActive`, `sortOrder`, `deletedAt`, `createdAt`, `updatedAt`
- **outlet_products**: `id`, `outletId`, `productId`, `priceMinorUnits`, `isAvailable`, `sortOrder`, `deletedAt`, `createdAt`, `updatedAt`

### Relationships

```
Merchant (1) ──→ (N) Category (1) ──→ (N) Product
                                              │
Outlet (1) ──→ (N) OutletProduct ─────────────┘
```

## Requirements

### R1: Category Creation

The system SHALL allow creating categories scoped to the current merchant.

**WHEN** a user submits a category form with a non-empty `name`
**THEN** the system SHALL insert a new `categories` row with the current `merchantId`, `name`, `isSynced: false`, and timestamps
**AND** enqueue a sync change with operation `insert`
**AND** navigate to the products-categories list

**WHEN** a user submits a category form with an empty `name`
**THEN** the system SHALL reject the submission with validation error "Nama wajib diisi"

### R2: Category Listing

The system SHALL list all non-deleted categories for the current merchant.

**WHEN** `getCategories()` is called
**THEN** the system SHALL return all `categories` rows where `deletedAt IS NULL` and `merchantId` matches the current merchant
**AND** results SHALL be ordered by `name` then `id`

### R3: Category Update

The system SHALL allow updating category properties.

**WHEN** a user submits a category edit form with a valid `id` and non-empty `name`
**THEN** the system SHALL update the `categories` row with the new `name`, set `updatedAt` to now, set `isSynced: false`
**AND** enqueue a sync change with operation `update`

**WHEN** a user toggles `isActive` on a category
**THEN** the system SHALL update the `isActive` field and enqueue a sync change

### R4: Category Soft-Delete

The system SHALL support soft-deleting categories via `deletedAt`.

**WHEN** a user confirms deletion of a category
**THEN** the system SHALL set `deletedAt` to the current timestamp and `isSynced: false`
**AND** enqueue a sync change with operation `update`

**WHEN** a category has associated products (count > 0)
**THEN** the system SHALL display a warning message: `Kategori "{name}" memiliki {count} produk. Produk-produk tersebut tidak akan memiliki kategori. Lanjutkan hapus?`
**AND** still allow deletion if the user confirms

**WHEN** a category has no associated products
**THEN** the system SHALL display a simple confirmation: `Hapus kategori "{name}"?`

### R5: Category Active Toggle

The system SHALL allow toggling a category's `isActive` status.

**WHEN** a user taps the active/inactive toggle on a category
**THEN** the system SHALL flip `isActive` (true ↔ false) and enqueue a sync change

### R6: Product Creation

The system SHALL allow creating products scoped to the current merchant.

**WHEN** a user submits a product form with a non-empty `name`, a selected `categoryId`, and a valid non-negative integer `price`
**THEN** the system SHALL insert a new `products` row with `merchantId`, `name`, `categoryId`, `priceMinorUnits` (the integer price), `isSynced: false`, and timestamps
**AND** enqueue a sync change with operation `insert`
**AND** navigate to the products-categories list

**WHEN** a staged image exists during submission
**THEN** the system SHALL enqueue a background photo processing job targeting `productImage` for the saved product
**AND** display a toast: "Foto akan diproses di background"

**WHEN** any required field is missing (`name` empty, `categoryId` empty, `price` empty or negative)
**THEN** the system SHALL reject the submission with the appropriate validation error

### R7: Product Listing

The system SHALL list all non-deleted products for the current merchant.

**WHEN** `getProducts(filterCategoryId?)` is called
**THEN** the system SHALL return all `products` rows where `deletedAt IS NULL` and `merchantId` matches the current merchant
**AND** if `filterCategoryId` is provided, only return products matching that `categoryId`
**AND** results SHALL be ordered by `name` then `id`

**WHEN** no category filter is applied
**THEN** the product list SHALL group products by category, showing category name as section header

**WHEN** a category filter is applied
**THEN** the product list SHALL show a flat list of matching products

### R8: Product Update

The system SHALL allow updating product properties.

**WHEN** a user submits a product edit form with a valid `id` and valid field values
**THEN** the system SHALL update the `products` row with the new values, set `updatedAt` to now, set `isSynced: false`
**AND** enqueue a sync change with operation `update`

**WHEN** a user toggles `isActive` on a product
**THEN** the system SHALL update the `isActive` field and enqueue a sync change

### R9: Product Soft-Delete

The system SHALL support soft-deleting products via `deletedAt`.

**WHEN** a user confirms deletion of a product
**THEN** the system SHALL set `deletedAt` to the current timestamp and `isSynced: false`
**AND** enqueue a sync change with operation `update`
**AND** display confirmation: `Hapus produk "{name}"?`

### R10: Product Active Toggle

The system SHALL allow toggling a product's `isActive` status.

**WHEN** a user taps the active/inactive toggle on a product
**THEN** the system SHALL flip `isActive` (true ↔ false) and enqueue a sync change

### R11: Product Image Upload

The system SHALL support uploading and processing product images.

**WHEN** a user selects an image file during product create/edit
**THEN** the system SHALL stage the image for upload as a WebP thumbnail (400px)

**WHEN** a staged image exists and the product is saved
**THEN** the system SHALL enqueue a background processing job of kind `image:webp-thumbnail` targeting `productImage` for the product ID

**WHEN** the image is an existing asset
**THEN** the system SHALL resolve the cached image URL via `productImageAdapter.resolveCachedImageUrl`

### R12: Outlet-Product Relationships

The system SHALL allow per-outlet product pricing and availability overrides.

**WHEN** `getOutletProducts()` is called
**THEN** the system SHALL return all `outlet_products` rows matching the current `outletId`

**WHEN** an `outlet_products` row has `priceMinorUnits` set (non-null)
**THEN** the system SHALL use that value as the product's effective price for the outlet

**WHEN** an `outlet_products` row has `priceMinorUnits` null
**THEN** the system SHALL fall back to the product's `priceMinorUnits`

**WHEN** an `outlet_products` row has `isAvailable: false`
**THEN** the system SHALL treat the product as unavailable for that outlet

### R13: Product Count by Category

The system SHALL provide a count of active products in a category.

**WHEN** `getProductCountByCategory(categoryId)` is called
**THEN** the system SHALL return the number of `products` rows where `categoryId` matches, `deletedAt IS NULL`, and `merchantId` matches the current merchant
**AND** the query SHALL limit to 1 row for efficiency (existence check)

### R14: Menu Sync

The system SHALL sync categories, products, and outlet-products across devices via baresync.

**WHEN** the POS app syncs
**THEN** the system SHALL pull `categories`, `products`, and `outlet_products` tables from the server
**AND** the local schema SHALL mirror the API schema (with `localSyncColumns` for baresync)

**WHEN** a local create/update/delete occurs on any menu entity
**THEN** the system SHALL mark `isSynced: false` and enqueue a change in the sync outbox
**AND** the change SHALL be replicated to the server on next sync

**WHEN** a sync pull receives a remote update
**THEN** the system SHALL upsert the row using `onConflictDoUpdate` on the `id` column

**WHEN** a sync pull receives a soft-delete
**THEN** the system SHALL set `deletedAt` on the local row

### R15: Merchant Scoping

The system SHALL scope all menu entities to the current merchant.

**WHEN** any menu query executes
**THEN** the system SHALL filter by `merchantId` matching `currentMerchantId()`

**WHEN** no merchant is selected
**THEN** category and product queries SHALL return empty results

### R16: Sort Order Management

The system SHALL support `sortOrder` on categories, products, and outlet-products.

**WHEN** a category is created
**THEN** `sortOrder` SHALL default to `0`

**WHEN** a product is created
**THEN** `sortOrder` SHALL default to `0`

**WHEN** an outlet-product is created
**THEN** `sortOrder` SHALL default to `0` (nullable)

## Out of Scope

- Product variants and modifiers (deferred to future version)
- Inventory / recipe costing (deferred to future version)
- Bulk product operations (CSV import, mass price update)
- Product deletion hard-delete (soft-delete via `deletedAt` only)
- Category reordering UI (sortOrder exists but no drag-and-drop reordering implemented)
- Per-outlet product creation (outlet-products are created via sync, not directly in the POS UI)

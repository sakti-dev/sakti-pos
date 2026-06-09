## MODIFIED Requirements

### Requirement: Product Creation
The system SHALL allow creating products scoped to the current merchant.

**WHEN** a user submits a product form with a non-empty `name`, a selected `categoryId`, and a valid non-negative integer `price`
**THEN** the system SHALL:
1. Insert a new `assets` row with `status = 'pending'`, `jobId` set to the plugin compression job ID, `merchantId` from the current merchant, `contentType = 'image/webp'`, `kind = 'product_photo'`, and all other metadata columns as `null`.
2. Insert a new `products` row with `merchantId`, `name`, `categoryId`, `priceMinorUnits`, `imageAssetId` set to the new `assets.id`, `isSynced: false`, and timestamps.
3. Call `compress_asset(jobId, stagedSourcePath)` to start background compression.
4. Enqueue a sync change with operation `insert`.
5. Navigate to the products-categories list.

**WHEN** no image is staged during submission
**THEN** the system SHALL insert the product with `imageAssetId = null` and skip the assets row creation and compression call.

**WHEN** any required field is missing (`name` empty, `categoryId` empty, `price` empty or negative)
**THEN** the system SHALL reject the submission with the appropriate validation error.

### Requirement: Product Update
The system SHALL allow updating product properties.

**WHEN** a user submits a product edit form with a valid `id` and valid field values
**THEN** the system SHALL:
1. If a new image is staged:
   a. Create a new `assets` row with `status = 'pending'` and `jobId` set.
   b. Update the `products` row with `imageAssetId` pointing to the new assets row.
   c. Call `compress_asset(jobId, stagedSourcePath)`.
   d. Invoke `deleteAsset` for the old asset path (if an existing image was present).
2. Update the `products` row with new values, set `updatedAt` to now, set `isSynced: false`.
3. Enqueue a sync change with operation `update`.

**WHEN** no new image is staged during update
**THEN** the system SHALL preserve the existing `imageAssetId` and only update other fields.

### Requirement: Product Image Upload
The system SHALL support uploading and processing product images via deferred compression.

**WHEN** a user selects an image file during product create/edit
**THEN** the system SHALL call `pick_image` to stage the image and generate a preview, storing the returned `jobId` and `stagedSourcePath` for use at submit time.

**WHEN** the product form is submitted with a staged image
**THEN** the system SHALL create an `assets` row with `status = 'pending'`, set `products.imageAssetId` to the new `assets.id`, and call `compress_asset` to start background compression.

**WHEN** the user picks a new image before the previous compression finishes
**THEN** the system SHALL let the old compression job finish and ignore its result (the old assets row will be orphaned and cleaned up by GC).

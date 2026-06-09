## MODIFIED Requirements

### Requirement: Product Creation
The system SHALL allow creating products scoped to the current merchant.

#### Scenario: Valid product creation
- **WHEN** a user submits a product form with a non-empty `name`, a selected `categoryId`, and a valid non-negative integer `price`
- **THEN** the system SHALL insert a new `products` row with `merchantId`, `name`, `categoryId`, `priceMinorUnits` (the integer price), `isSynced: false`, and timestamps
- **AND THEN** enqueue a sync change with operation `insert`
- **AND THEN** navigate to the products-categories list

#### Scenario: Save disabled while plugin job is pending
- **WHEN** a selected image exists and its plugin job is still pending or processing
- **THEN** the system SHALL keep the product save action disabled or reject submission until `image_pipeline://job_completed` is received for that job
- **AND THEN** it SHALL NOT enqueue a separate app-owned background photo processing job

#### Scenario: Save enabled after plugin completion
- **WHEN** the plugin emits `image_pipeline://job_completed` for the active image job
- **THEN** the system SHALL allow the form to persist the product with the final image asset metadata
- **AND THEN** display a toast that the image is ready to be saved

#### Scenario: Validation error on missing fields
- **WHEN** any required field is missing (`name` empty, `categoryId` empty, `price` empty or negative)
- **THEN** the system SHALL reject the submission with the appropriate validation error

### Requirement: Product Image Upload
The system SHALL support uploading and processing product images through `tauri-plugin-image-pipeline`.

#### Scenario: User selects a new image
- **WHEN** a user selects an image file during product create/edit
- **THEN** the system SHALL call the plugin-owned picker command
- **AND THEN** stage the returned preview path immediately via `convertFileSrc()`
- **AND THEN** keep the image upload state pending until the plugin emits `image_pipeline://job_completed`

#### Scenario: Plugin job completes
- **WHEN** the plugin emits `image_pipeline://job_completed`
- **THEN** the system SHALL resolve the final cached image URL via `productImageAdapter.resolveCachedImageUrl`
- **AND THEN** it SHALL make that final asset available for product persistence

#### Scenario: Existing asset displayed
- **WHEN** the image is an existing asset
- **THEN** the system SHALL resolve the cached image URL via `productImageAdapter.resolveCachedImageUrl`

# Product Photo Asset ERD

## API Side

```mermaid
erDiagram
  MERCHANTS ||--o{ CATEGORIES : owns
  MERCHANTS ||--o{ PRODUCTS : owns
  MERCHANTS ||--o{ ASSETS : owns
  CATEGORIES ||--o{ PRODUCTS : groups
  PRODUCTS }o--o| ASSETS : image
  ASSETS }o--|| OBJECT_STORAGE : stored_as

  MERCHANTS {
    text id PK
    text name
  }

  CATEGORIES {
    text id PK
    text merchant_id FK
    text name
    integer sort_order
    boolean is_active
    text deleted_at
    text created_at
    text updated_at
  }

  PRODUCTS {
    text id PK
    text merchant_id FK
    text category_id FK
    text name
    integer price
    text image_asset_id FK
    boolean is_active
    integer sort_order
    text deleted_at
    text created_at
    text updated_at
  }

  ASSETS {
    text id PK
    text merchant_id FK
    text object_key
    text original_filename
    text content_type
    text kind
    integer byte_size
    text content_hash
    integer width
    integer height
    text status
    text created_by_user_id FK
    text deleted_at
    text created_at
    text updated_at
  }

  OBJECT_STORAGE {
    text object_key PK
    binary file_bytes
  }
```

API-side notes:

- The API DB stores reusable asset metadata in `assets`.
- The API DB does not store `local_asset_cache`.
- `products.image_asset_id` points to `assets.id`.
- `assets.object_key` points to the uploaded object in S3-compatible storage.
- Object storage contains the actual file bytes.
- Future tables can reuse the same `assets` table, for example `users.photo_asset_id` or `outlets.logo_asset_id`.

## Local POS Side

```mermaid
erDiagram
  MERCHANTS ||--o{ PRODUCTS : owns
  MERCHANTS ||--o{ ASSETS : owns
  CATEGORIES ||--o{ PRODUCTS : groups
  PRODUCTS }o--o| ASSETS : image
  ASSETS ||--o| LOCAL_ASSET_CACHE : cached_as
  ASSETS }o--|| OBJECT_STORAGE : stored_as

  MERCHANTS {
    text id PK
    text name
  }

  CATEGORIES {
    text id PK
    text merchant_id FK
    text name
  }

  PRODUCTS {
    text id PK
    text merchant_id FK
    text category_id FK
    text name
    integer price
    text image_asset_id FK
    text created_at
    text updated_at
  }

  ASSETS {
    text id PK
    text merchant_id FK
    text object_key
    text original_filename
    text content_type
    text kind
    integer byte_size
    text content_hash
    integer width
    integer height
    text status
    text created_by_user_id FK
    text deleted_at
    text created_at
    text updated_at
  }

  LOCAL_ASSET_CACHE {
    text asset_id PK
    text merchant_id
    text object_key
    text local_path
    text content_hash
    text status
    integer upload_attempts
    integer download_attempts
    text last_error
    text cached_at
    text created_at
    text updated_at
  }

  OBJECT_STORAGE {
    text object_key PK
    binary file_bytes
  }
```

## Where Each Entity Lives

| Entity | API DB | Local POS DB | Object Storage |
| --- | --- | --- | --- |
| `merchants` | Yes | Yes | No |
| `categories` | Yes | Yes | No |
| `products` | Yes | Yes | No |
| `assets` | Yes | Yes | No |
| `local_asset_cache` | No | Yes | No |
| `OBJECT_STORAGE` | No | No | Yes |

## Relationship Summary

- `products.image_asset_id` stores the selected photo asset for a product.
- `assets.object_key` stores the S3-compatible object key.
- `local_asset_cache.asset_id` points to the synced asset and tracks the local file path plus upload/download state.
- Object storage is the source of truth for the actual file bytes.
- The API DB syncs product and asset metadata only, not image bytes.
- Each POS device builds its own local image cache from synced `assets`.

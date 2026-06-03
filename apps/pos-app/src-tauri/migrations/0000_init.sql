CREATE TABLE IF NOT EXISTS `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`object_key` text NOT NULL,
	`original_filename` text,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`content_hash` text NOT NULL,
	`kind` text NOT NULL,
	`width` integer,
	`height` integer,
	`status` text DEFAULT 'pending_upload' NOT NULL,
	`created_by_user_id` text,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `assets_object_key_unique` ON `assets` (`object_key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `local_asset_cache` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`object_key` text NOT NULL,
	`local_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`status` text DEFAULT 'pending_upload' NOT NULL,
	`upload_attempts` integer DEFAULT 0 NOT NULL,
	`download_attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`cached_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `local_asset_cache_object_key_unique` ON `local_asset_cache` (`object_key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`outlet_id` text NOT NULL,
	`product_id` text,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor_units` integer NOT NULL,
	`original_price_minor_units` integer,
	`subtotal_minor_units` integer NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`register_id` text,
	`staff_id` text,
	`order_number` text NOT NULL,
	`total_minor_units` integer NOT NULL,
	`payment_method` text NOT NULL,
	`amount_paid_minor_units` integer,
	`change_amount_minor_units` integer,
	`status` text NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `orders_order_number_unique` ON `orders` (`order_number`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `outlet_products` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`product_id` text NOT NULL,
	`price_minor_units` integer,
	`is_available` integer DEFAULT true NOT NULL,
	`sort_order` integer,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `outlets` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Jakarta' NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`receipt_name` text,
	`receipt_address` text,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pending_asset_processing_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`source_path` text NOT NULL,
	`original_filename` text NOT NULL,
	`source_mime_type` text,
	`processing_kind` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`attachment_field` text NOT NULL,
	`preview_path` text,
	`preview_mime_type` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pending_product_photo_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`temp_path` text NOT NULL,
	`original_filename` text NOT NULL,
	`kind` text DEFAULT 'product_photo' NOT NULL,
	`preview_mime_type` text,
	`preview_base64` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `pending_product_photo_jobs_product_id_unique` ON `pending_product_photo_jobs` (`product_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `products` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`price_minor_units` integer NOT NULL,
	`image_url` text,
	`image_asset_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `registers` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`name` text NOT NULL,
	`short_id` text NOT NULL,
	`pairing_code` text,
	`pairing_expires_at` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_seen_at` text,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`cloud_user_id` text,
	`outlet_id` text,
	`name` text NOT NULL,
	`pin` text,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

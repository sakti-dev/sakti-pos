CREATE TABLE `pending_product_photo_jobs` (
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
CREATE UNIQUE INDEX `pending_product_photo_jobs_product_id_unique` ON `pending_product_photo_jobs` (`product_id`);--> statement-breakpoint
CREATE INDEX `pending_product_photo_jobs_status_idx` ON `pending_product_photo_jobs` (`status`);

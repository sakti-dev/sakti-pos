CREATE TABLE `assets` (
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
	`status` text NOT NULL,
	`created_by_user_id` text,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	UNIQUE(`object_key`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `image_asset_id` text REFERENCES assets(id);

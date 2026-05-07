CREATE TABLE `shops` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`table_name` text NOT NULL,
	`shop_id` text NOT NULL,
	`last_sync_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `categories` ADD `shop_id` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `cloud_id` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `is_synced` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `shop_id` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `cloud_id` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `is_synced` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `shop_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `cloud_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `is_synced` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `shop_id` text;--> statement-breakpoint
ALTER TABLE `products` ADD `cloud_id` text;--> statement-breakpoint
ALTER TABLE `products` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `products` ADD `is_synced` integer DEFAULT false NOT NULL;
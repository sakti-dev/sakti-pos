ALTER TABLE `merchants` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `order_items` ADD `updated_at` text NOT NULL;--> statement-breakpoint
ALTER TABLE `outlets` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `registers` ADD `deleted_at` text;
CREATE TABLE `ingredient_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ingredient_categories_is_synced_idx` ON `ingredient_categories` (`is_synced`);--> statement-breakpoint
CREATE INDEX `ingredient_categories_merchant_sort_idx` ON `ingredient_categories` (`merchant_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_categories_merchant_name_unique` ON `ingredient_categories` (`merchant_id`,`name`);
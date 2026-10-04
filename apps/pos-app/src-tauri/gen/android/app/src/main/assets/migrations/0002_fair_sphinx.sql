PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inventory_stocks` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`on_hand_qty` real DEFAULT 0 NOT NULL,
	`low_stock_threshold` real DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_inventory_stocks`("id", "outlet_id", "target_type", "target_id", "on_hand_qty", "low_stock_threshold", "deleted_at", "is_synced", "created_at", "updated_at") SELECT "id", "outlet_id", "target_type", "target_id", "on_hand_qty", "low_stock_threshold", "deleted_at", "is_synced", "created_at", "updated_at" FROM `inventory_stocks`;--> statement-breakpoint
DROP TABLE `inventory_stocks`;--> statement-breakpoint
ALTER TABLE `__new_inventory_stocks` RENAME TO `inventory_stocks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `inventory_stocks_is_synced_idx` ON `inventory_stocks` (`is_synced`);--> statement-breakpoint
CREATE INDEX `inventory_stocks_outlet_target_idx` ON `inventory_stocks` (`outlet_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_stocks_outlet_target_unique` ON `inventory_stocks` (`outlet_id`,`target_type`,`target_id`);
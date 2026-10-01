CREATE TABLE `stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL REFERENCES outlets(`id`) ON UPDATE no action ON DELETE no action,
	`staff_id` text NOT NULL REFERENCES staff(`id`) ON UPDATE no action ON DELETE no action,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`qty_delta` real NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_adjustments_is_synced_idx` ON `stock_adjustments` (`is_synced`);
--> statement-breakpoint
CREATE INDEX `stock_adjustments_outlet_target_idx` ON `stock_adjustments` (`outlet_id`,`target_id`);

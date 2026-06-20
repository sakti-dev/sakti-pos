CREATE TABLE `cash_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`register_id` text,
	`opened_by_staff_id` text NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`initial_float_minor_units` integer DEFAULT 0 NOT NULL,
	`expected_cash_minor_units` integer DEFAULT 0 NOT NULL,
	`actual_cash_minor_units` integer,
	`difference_minor_units` integer,
	`status` text NOT NULL,
	`note` text,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cash_shifts_is_synced_idx` ON `cash_shifts` (`is_synced`);--> statement-breakpoint
CREATE INDEX `cash_shifts_outlet_status_idx` ON `cash_shifts` (`outlet_id`,`status`);--> statement-breakpoint
CREATE TABLE `goods_receipt_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`goods_receipt_id` text NOT NULL,
	`outlet_id` text NOT NULL,
	`target_id` text NOT NULL,
	`received_qty` real NOT NULL,
	`unit_cost_minor_units` integer,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goods_receipt_lines_is_synced_idx` ON `goods_receipt_lines` (`is_synced`);--> statement-breakpoint
CREATE INDEX `goods_receipt_lines_receipt_idx` ON `goods_receipt_lines` (`goods_receipt_id`);--> statement-breakpoint
CREATE TABLE `goods_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`ref` text NOT NULL,
	`supplier_name` text,
	`note` text,
	`received_at` text NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `goods_receipts_is_synced_idx` ON `goods_receipts` (`is_synced`);--> statement-breakpoint
CREATE INDEX `goods_receipts_outlet_received_idx` ON `goods_receipts` (`outlet_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text,
	`unit` text DEFAULT 'Pcs' NOT NULL,
	`category` text,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ingredients_is_synced_idx` ON `ingredients` (`is_synced`);--> statement-breakpoint
CREATE INDEX `ingredients_merchant_active_idx` ON `ingredients` (`merchant_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `inventory_stocks` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`on_hand_qty` real DEFAULT 0 NOT NULL,
	`low_stock_threshold` real,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_stocks_is_synced_idx` ON `inventory_stocks` (`is_synced`);--> statement-breakpoint
CREATE INDEX `inventory_stocks_outlet_target_idx` ON `inventory_stocks` (`outlet_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_stocks_outlet_target_unique` ON `inventory_stocks` (`outlet_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `order_item_modifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`order_item_id` text NOT NULL,
	`outlet_id` text NOT NULL,
	`modifier_name` text NOT NULL,
	`modifier_group` text,
	`price_delta_minor_units` integer DEFAULT 0 NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `order_item_modifiers_is_synced_idx` ON `order_item_modifiers` (`is_synced`);--> statement-breakpoint
CREATE INDEX `order_item_modifiers_order_item_idx` ON `order_item_modifiers` (`order_item_id`);--> statement-breakpoint
CREATE TABLE `stocktake_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`stocktake_id` text NOT NULL,
	`outlet_id` text NOT NULL,
	`target_id` text NOT NULL,
	`system_qty_before` real NOT NULL,
	`counted_qty` real NOT NULL,
	`variance_qty` real NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stocktake_lines_is_synced_idx` ON `stocktake_lines` (`is_synced`);--> statement-breakpoint
CREATE INDEX `stocktake_lines_stocktake_idx` ON `stocktake_lines` (`stocktake_id`);--> statement-breakpoint
CREATE TABLE `stocktakes` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`staff_id` text NOT NULL,
	`ref` text NOT NULL,
	`target_type` text NOT NULL,
	`reason` text NOT NULL,
	`counted_at` text NOT NULL,
	`deleted_at` text,
	`is_synced` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stocktakes_is_synced_idx` ON `stocktakes` (`is_synced`);--> statement-breakpoint
CREATE INDEX `stocktakes_outlet_counted_idx` ON `stocktakes` (`outlet_id`,`counted_at`);

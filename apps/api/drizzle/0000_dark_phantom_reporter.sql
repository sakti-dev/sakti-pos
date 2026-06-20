CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`job_id` text,
	`object_key` text,
	`original_filename` text,
	`content_type` text NOT NULL,
	`byte_size` integer,
	`content_hash` text,
	`kind` text NOT NULL,
	`width` integer,
	`height` integer,
	`status` text NOT NULL,
	`created_by_user_id` text,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assets_scope_sync_idx` ON `assets` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `categories_scope_sync_idx` ON `categories` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `categories_merchant_sort_idx` ON `categories` (`merchant_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`business_type` text DEFAULT 'hybrid' NOT NULL,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `merchants_scope_sync_idx` ON `merchants` (`id`,`sync_updated_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`outlet_id` text NOT NULL,
	`product_id` text,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor_units` integer NOT NULL,
	`original_price_minor_units` integer,
	`subtotal_minor_units` integer NOT NULL,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_items_scope_sync_idx` ON `order_items` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
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
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE INDEX `orders_scope_sync_idx` ON `orders` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `orders_outlet_created_idx` ON `orders` (`outlet_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `outlet_products` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`product_id` text NOT NULL,
	`price_minor_units` integer,
	`is_available` integer DEFAULT true NOT NULL,
	`sort_order` integer,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `outlet_products_scope_sync_idx` ON `outlet_products` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `outlet_products_outlet_product_idx` ON `outlet_products` (`outlet_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `outlets` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Jakarta' NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`receipt_name` text,
	`receipt_address` text,
	`is_active` integer DEFAULT true NOT NULL,
	`use_tax` integer DEFAULT false NOT NULL,
	`tax_percentage` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `outlets_scope_sync_idx` ON `outlets` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`price_minor_units` integer NOT NULL,
	`image_asset_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `products_scope_sync_idx` ON `products` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `products_merchant_active_sort_idx` ON `products` (`merchant_id`,`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `registers` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`name` text NOT NULL,
	`short_id` text NOT NULL,
	`pairing_code` text,
	`pairing_expires_at` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_seen_at` text,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registers_short_id_unique` ON `registers` (`short_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `registers_pairing_code_unique` ON `registers` (`pairing_code`);--> statement-breakpoint
CREATE INDEX `registers_scope_sync_idx` ON `registers` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE TABLE `staff` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`cloud_user_id` text,
	`outlet_id` text,
	`name` text NOT NULL,
	`pin` text,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_scope_sync_idx` ON `staff` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `staff_merchant_active_idx` ON `staff` (`merchant_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `sync_batch_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` text NOT NULL,
	`response_body` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_batch_requests_client_idemp_idx` ON `sync_batch_requests` (`client_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `temp_oauth_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`password_hash` text,
	`google_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
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
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`register_id`) REFERENCES `registers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opened_by_staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cash_shifts_scope_sync_idx` ON `cash_shifts` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `cash_shifts_outlet_status_idx` ON `cash_shifts` (`outlet_id`,`status`);--> statement-breakpoint
CREATE TABLE `goods_receipt_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`goods_receipt_id` text NOT NULL,
	`outlet_id` text NOT NULL,
	`target_id` text NOT NULL,
	`received_qty` real NOT NULL,
	`unit_cost_minor_units` integer,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `goods_receipt_lines_scope_sync_idx` ON `goods_receipt_lines` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
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
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `goods_receipts_scope_sync_idx` ON `goods_receipts` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
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
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ingredients_scope_sync_idx` ON `ingredients` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `ingredients_merchant_active_idx` ON `ingredients` (`merchant_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `inventory_stocks` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`on_hand_qty` real DEFAULT 0 NOT NULL,
	`low_stock_threshold` real,
	`deleted_at` text,
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_stocks_scope_sync_idx` ON `inventory_stocks` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
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
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_item_modifiers_scope_sync_idx` ON `order_item_modifiers` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
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
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`stocktake_id`) REFERENCES `stocktakes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stocktake_lines_scope_sync_idx` ON `stocktake_lines` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
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
	`sync_updated_at` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`staff_id`) REFERENCES `staff`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stocktakes_scope_sync_idx` ON `stocktakes` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `stocktakes_outlet_counted_idx` ON `stocktakes` (`outlet_id`,`counted_at`);
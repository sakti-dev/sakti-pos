DROP INDEX "assets_scope_sync_idx";--> statement-breakpoint
DROP INDEX "categories_scope_sync_idx";--> statement-breakpoint
DROP INDEX "categories_merchant_sort_idx";--> statement-breakpoint
DROP INDEX "merchants_scope_sync_idx";--> statement-breakpoint
DROP INDEX "order_items_scope_sync_idx";--> statement-breakpoint
DROP INDEX "order_items_order_idx";--> statement-breakpoint
DROP INDEX "orders_scope_sync_idx";--> statement-breakpoint
DROP INDEX "orders_outlet_created_idx";--> statement-breakpoint
DROP INDEX "orders_outlet_number_unique";--> statement-breakpoint
DROP INDEX "outlet_products_scope_sync_idx";--> statement-breakpoint
DROP INDEX "outlet_products_outlet_product_idx";--> statement-breakpoint
DROP INDEX "outlets_scope_sync_idx";--> statement-breakpoint
DROP INDEX "payment_settings_scope_sync_idx";--> statement-breakpoint
DROP INDEX "payment_settings_merchant_idx";--> statement-breakpoint
DROP INDEX "products_scope_sync_idx";--> statement-breakpoint
DROP INDEX "products_merchant_active_sort_idx";--> statement-breakpoint
DROP INDEX "registers_short_id_unique";--> statement-breakpoint
DROP INDEX "registers_pairing_code_unique";--> statement-breakpoint
DROP INDEX "registers_scope_sync_idx";--> statement-breakpoint
DROP INDEX "staff_scope_sync_idx";--> statement-breakpoint
DROP INDEX "staff_merchant_active_idx";--> statement-breakpoint
DROP INDEX "sync_batch_requests_client_idemp_idx";--> statement-breakpoint
DROP INDEX "users_email_unique";--> statement-breakpoint
DROP INDEX "cash_shifts_scope_sync_idx";--> statement-breakpoint
DROP INDEX "cash_shifts_outlet_status_idx";--> statement-breakpoint
DROP INDEX "goods_receipt_lines_scope_sync_idx";--> statement-breakpoint
DROP INDEX "goods_receipt_lines_receipt_idx";--> statement-breakpoint
DROP INDEX "goods_receipts_scope_sync_idx";--> statement-breakpoint
DROP INDEX "goods_receipts_outlet_received_idx";--> statement-breakpoint
DROP INDEX "ingredient_categories_scope_sync_idx";--> statement-breakpoint
DROP INDEX "ingredient_categories_merchant_sort_idx";--> statement-breakpoint
DROP INDEX "ingredient_categories_merchant_name_unique";--> statement-breakpoint
DROP INDEX "ingredients_scope_sync_idx";--> statement-breakpoint
DROP INDEX "ingredients_merchant_active_idx";--> statement-breakpoint
DROP INDEX "inventory_stocks_scope_sync_idx";--> statement-breakpoint
DROP INDEX "inventory_stocks_outlet_target_idx";--> statement-breakpoint
DROP INDEX "inventory_stocks_outlet_target_unique";--> statement-breakpoint
DROP INDEX "modifier_groups_scope_sync_idx";--> statement-breakpoint
DROP INDEX "modifier_groups_merchant_sort_idx";--> statement-breakpoint
DROP INDEX "modifier_options_scope_sync_idx";--> statement-breakpoint
DROP INDEX "modifier_options_group_sort_idx";--> statement-breakpoint
DROP INDEX "order_item_modifiers_scope_sync_idx";--> statement-breakpoint
DROP INDEX "order_item_modifiers_order_item_idx";--> statement-breakpoint
DROP INDEX "product_ingredients_scope_sync_idx";--> statement-breakpoint
DROP INDEX "product_ingredients_product_idx";--> statement-breakpoint
DROP INDEX "product_ingredients_product_ingredient_unique";--> statement-breakpoint
DROP INDEX "product_modifier_groups_scope_sync_idx";--> statement-breakpoint
DROP INDEX "product_modifier_groups_product_idx";--> statement-breakpoint
DROP INDEX "product_modifier_groups_product_group_unique";--> statement-breakpoint
DROP INDEX "stock_adjustments_scope_sync_idx";--> statement-breakpoint
DROP INDEX "stock_adjustments_outlet_target_idx";--> statement-breakpoint
DROP INDEX "stocktake_lines_scope_sync_idx";--> statement-breakpoint
DROP INDEX "stocktake_lines_stocktake_idx";--> statement-breakpoint
DROP INDEX "stocktakes_scope_sync_idx";--> statement-breakpoint
DROP INDEX "stocktakes_outlet_counted_idx";--> statement-breakpoint
ALTER TABLE `inventory_stocks` ALTER COLUMN "low_stock_threshold" TO "low_stock_threshold" real NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE INDEX `assets_scope_sync_idx` ON `assets` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `categories_scope_sync_idx` ON `categories` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `categories_merchant_sort_idx` ON `categories` (`merchant_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `merchants_scope_sync_idx` ON `merchants` (`id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `order_items_scope_sync_idx` ON `order_items` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `orders_scope_sync_idx` ON `orders` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `orders_outlet_created_idx` ON `orders` (`outlet_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_outlet_number_unique` ON `orders` (`outlet_id`,`order_number`);--> statement-breakpoint
CREATE INDEX `outlet_products_scope_sync_idx` ON `outlet_products` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `outlet_products_outlet_product_idx` ON `outlet_products` (`outlet_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `outlets_scope_sync_idx` ON `outlets` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `payment_settings_scope_sync_idx` ON `payment_settings` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_settings_merchant_idx` ON `payment_settings` (`merchant_id`);--> statement-breakpoint
CREATE INDEX `products_scope_sync_idx` ON `products` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `products_merchant_active_sort_idx` ON `products` (`merchant_id`,`is_active`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `registers_short_id_unique` ON `registers` (`short_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `registers_pairing_code_unique` ON `registers` (`pairing_code`);--> statement-breakpoint
CREATE INDEX `registers_scope_sync_idx` ON `registers` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `staff_scope_sync_idx` ON `staff` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `staff_merchant_active_idx` ON `staff` (`merchant_id`,`is_active`);--> statement-breakpoint
CREATE UNIQUE INDEX `sync_batch_requests_client_idemp_idx` ON `sync_batch_requests` (`client_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `cash_shifts_scope_sync_idx` ON `cash_shifts` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `cash_shifts_outlet_status_idx` ON `cash_shifts` (`outlet_id`,`status`);--> statement-breakpoint
CREATE INDEX `goods_receipt_lines_scope_sync_idx` ON `goods_receipt_lines` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `goods_receipt_lines_receipt_idx` ON `goods_receipt_lines` (`goods_receipt_id`);--> statement-breakpoint
CREATE INDEX `goods_receipts_scope_sync_idx` ON `goods_receipts` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `goods_receipts_outlet_received_idx` ON `goods_receipts` (`outlet_id`,`received_at`);--> statement-breakpoint
CREATE INDEX `ingredient_categories_scope_sync_idx` ON `ingredient_categories` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `ingredient_categories_merchant_sort_idx` ON `ingredient_categories` (`merchant_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingredient_categories_merchant_name_unique` ON `ingredient_categories` (`merchant_id`,`name`);--> statement-breakpoint
CREATE INDEX `ingredients_scope_sync_idx` ON `ingredients` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `ingredients_merchant_active_idx` ON `ingredients` (`merchant_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `inventory_stocks_scope_sync_idx` ON `inventory_stocks` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `inventory_stocks_outlet_target_idx` ON `inventory_stocks` (`outlet_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_stocks_outlet_target_unique` ON `inventory_stocks` (`outlet_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `modifier_groups_scope_sync_idx` ON `modifier_groups` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `modifier_groups_merchant_sort_idx` ON `modifier_groups` (`merchant_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `modifier_options_scope_sync_idx` ON `modifier_options` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `modifier_options_group_sort_idx` ON `modifier_options` (`group_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `order_item_modifiers_scope_sync_idx` ON `order_item_modifiers` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `order_item_modifiers_order_item_idx` ON `order_item_modifiers` (`order_item_id`);--> statement-breakpoint
CREATE INDEX `product_ingredients_scope_sync_idx` ON `product_ingredients` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `product_ingredients_product_idx` ON `product_ingredients` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_ingredients_product_ingredient_unique` ON `product_ingredients` (`product_id`,`ingredient_id`);--> statement-breakpoint
CREATE INDEX `product_modifier_groups_scope_sync_idx` ON `product_modifier_groups` (`merchant_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `product_modifier_groups_product_idx` ON `product_modifier_groups` (`product_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_modifier_groups_product_group_unique` ON `product_modifier_groups` (`product_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `stock_adjustments_scope_sync_idx` ON `stock_adjustments` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `stock_adjustments_outlet_target_idx` ON `stock_adjustments` (`outlet_id`,`target_id`);--> statement-breakpoint
CREATE INDEX `stocktake_lines_scope_sync_idx` ON `stocktake_lines` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `stocktake_lines_stocktake_idx` ON `stocktake_lines` (`stocktake_id`);--> statement-breakpoint
CREATE INDEX `stocktakes_scope_sync_idx` ON `stocktakes` (`outlet_id`,`sync_updated_at`);--> statement-breakpoint
CREATE INDEX `stocktakes_outlet_counted_idx` ON `stocktakes` (`outlet_id`,`counted_at`);--> statement-breakpoint
ALTER TABLE `inventory_stocks` ALTER COLUMN "low_stock_threshold" TO "low_stock_threshold" real NOT NULL;
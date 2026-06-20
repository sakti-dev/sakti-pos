ALTER TABLE `merchants` ADD `business_type` text DEFAULT 'hybrid' NOT NULL;--> statement-breakpoint
ALTER TABLE `outlets` ADD `use_tax` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `outlets` ADD `tax_percentage` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `categories_merchant_sort_idx` ON `categories` (`merchant_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `orders_outlet_created_idx` ON `orders` (`outlet_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `outlet_products_outlet_product_idx` ON `outlet_products` (`outlet_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `products_merchant_active_sort_idx` ON `products` (`merchant_id`,`is_active`,`sort_order`);--> statement-breakpoint
CREATE INDEX `staff_merchant_active_idx` ON `staff` (`merchant_id`,`is_active`);
